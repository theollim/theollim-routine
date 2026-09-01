'use strict';

const TALLY = 'https://api.tally.so';
const LOOKBACK_DAYS = 10;
const CHECKIN_MAX_AGE_DAYS = 8;
const FORM_CACHE_MS = 5 * 60 * 1000;

const CHECKIN_TEST = {
  '초등': (name) => /체크인|전날/.test(name) && /초등/.test(name),
  '중등': (name) => /체크인|전날/.test(name) && /중등/.test(name),
  '고등': (name) => /체크인|전날/.test(name) && /고등/.test(name),
};

let formCache = { at: 0, forms: null };

function normalizeName(value) {
  return String(value == null ? '' : value)
    .normalize('NFC')
    .replace(/\s+/g, '')
    .toLocaleLowerCase('ko-KR');
}

function kstDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function flattenAnswer(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenAnswer);
  if (typeof value === 'object') return Object.values(value).flatMap(flattenAnswer);
  return [String(value)];
}

function nameQuestionIds(questions) {
  return new Set((questions || [])
    .filter((question) => /이름|성명/.test(String(
      question.title || question.label || question.question || ''
    )))
    .map((question) => String(question.id)));
}

function submissionHasName(submission, studentName, questionIds) {
  const expected = normalizeName(studentName);
  const responses = submission && Array.isArray(submission.responses)
    ? submission.responses
    : [];
  const preferred = questionIds && questionIds.size
    ? responses.filter((response) => questionIds.has(String(response.questionId)))
    : responses;

  return preferred.some((response) => {
    const values = [
      ...flattenAnswer(response.answer),
      ...flattenAnswer(response.value),
      ...flattenAnswer(response.formattedAnswer),
    ];
    return values.some((value) => normalizeName(value) === expected);
  });
}

function submissionsForStudent(payload, studentName) {
  const ids = nameQuestionIds(payload && payload.questions);
  return ((payload && payload.submissions) || [])
    .filter((submission) => submissionHasName(submission, studentName, ids))
    .filter((submission) => Number.isFinite(new Date(submission.submittedAt).getTime()))
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

function classifyStatus({ checkinPayload, arrivalPayload, studentName, now = new Date() }) {
  const nowMs = now.getTime();
  const today = kstDate(now);
  const arrivals = submissionsForStudent(arrivalPayload, studentName);
  const latestArrival = arrivals[0] || null;

  if (latestArrival && kstDate(latestArrival.submittedAt) === today) {
    return 'already_arrived';
  }

  const priorArrivalMs = latestArrival
    ? new Date(latestArrival.submittedAt).getTime()
    : 0;
  const maxAgeMs = nowMs - CHECKIN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const boundaryMs = Math.max(priorArrivalMs, maxAgeMs);
  const checkins = submissionsForStudent(checkinPayload, studentName)
    .filter((submission) => {
      const submittedMs = new Date(submission.submittedAt).getTime();
      return submittedMs > boundaryMs && submittedMs <= nowMs;
    });
  const latestCheckin = checkins[0] || null;

  if (!latestCheckin) return 'missing';
  return kstDate(latestCheckin.submittedAt) === today
    ? 'same_day'
    : 'previous_day';
}

async function tallyJson(path, key) {
  const response = await fetch(TALLY + path, {
    headers: { Authorization: 'Bearer ' + key },
  });
  if (!response.ok) throw new Error(`Tally API ${response.status}`);
  return response.json();
}

async function listForms(key) {
  if (formCache.forms && Date.now() - formCache.at < FORM_CACHE_MS) {
    return formCache.forms;
  }
  const forms = [];
  for (let page = 1; page <= 6; page += 1) {
    const payload = await tallyJson(`/forms?page=${page}&limit=50`, key);
    const batch = (payload && (payload.items || payload.data)) || [];
    forms.push(...batch);
    if (batch.length < 50) break;
  }
  formCache = { at: Date.now(), forms };
  return forms;
}

async function formSubmissions(formId, key, now) {
  const startDate = new Date(
    now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const query = new URLSearchParams({ limit: '500', startDate });
  return tallyJson(`/forms/${encodeURIComponent(formId)}/submissions?${query}`, key);
}

async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'method_not_allowed' }));
  }

  const key = process.env.TALLY_API_KEY;
  if (!key) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ status: 'unavailable' }));
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (error) { body = {}; }
  }
  const studentName = String(body.name || '').trim();
  const grade = String(body.grade || '').trim();
  if (!studentName || studentName.length > 20 || !CHECKIN_TEST[grade]) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'invalid_request' }));
  }

  try {
    const forms = await listForms(key);
    const checkinForm = forms.find((form) => CHECKIN_TEST[grade](
      String(form.name || '').normalize('NFC')
    ));
    const arrivalForm = forms.find((form) => /등원|출석/.test(
      String(form.name || '').normalize('NFC')
    ));
    if (!checkinForm || !arrivalForm) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ status: 'unavailable' }));
    }

    const now = new Date();
    const [checkinPayload, arrivalPayload] = await Promise.all([
      formSubmissions(checkinForm.id, key, now),
      formSubmissions(arrivalForm.id, key, now),
    ]);
    const status = classifyStatus({
      checkinPayload, arrivalPayload, studentName, now,
    });
    res.statusCode = 200;
    return res.end(JSON.stringify({ status }));
  } catch (error) {
    console.error('checkin-status:', error && error.message ? error.message : error);
    res.statusCode = 200;
    return res.end(JSON.stringify({ status: 'unavailable' }));
  }
}

handler._test = { classifyStatus, kstDate, normalizeName, submissionHasName };
module.exports = handler;
