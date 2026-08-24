/* ═══════════════════════════════════════════════════════════════════
   학습 기록 — 루틴 앱이 보내는 완료 이벤트(오늘 5장·단원 몰아보기)를
   노션 「🧠 루틴앱 학습 기록」 DB에 적습니다.
   필요한 환경변수: NOTION_KEY (노션 통합 토큰)
   DB를 옮기면 STUDY_DB_ID 환경변수로 바꿀 수 있습니다.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const DB = process.env.STUDY_DB_ID || 'ac0c3f8d306641bfa8727d1f7ff5569c';
const GRADES = ['초등', '중1', '중2', '중3', '고등'];

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'post_only' }));
  }
  const key = process.env.NOTION_KEY;
  if (!key) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ error: 'no_key' }));
  }
  let b = req.body;
  try { if (typeof b === 'string') b = JSON.parse(b); } catch (e) { b = null; }
  if (!b || typeof b.name !== 'string' || !b.name.trim() || b.name.length > 20) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'bad_body' }));
  }
  const S = (v, n) => String(v == null ? '' : v).slice(0, n);
  const N = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(S(b.date, 10))
    ? S(b.date, 10)
    : new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); /* KST 보정 */
  const props = {
    '이름': { title: [{ text: { content: S(b.name, 20) } }] },
    '학년': { select: { name: GRADES.includes(b.g) ? b.g : '초등' } },
    '종류': { select: { name: b.kind === 'unit' ? '단원 몰아보기' : '오늘 5장' } },
    '단원': { rich_text: [{ text: { content: S(b.label, 100) } }] },
    '알아요': { number: N(b.know) },
    '헷갈려요': { number: N(b.unsure) },
    '스트릭': { number: N(b.streak) },
    '카드': { rich_text: [{ text: { content: S(b.cards, 1900) } }] },
    '날짜': { date: { start: date } },
    '기기': { rich_text: [{ text: { content: S(b.did, 40) } }] },
  };
  try {
    const r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: DB }, properties: props }),
    });
    if (!r.ok) {
      const t = await r.text();
      res.statusCode = 200;
      return res.end(JSON.stringify({ error: 'notion_' + r.status, detail: t.slice(0, 200) }));
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
};
