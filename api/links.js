/* ═══════════════════════════════════════════════════════════════════
   학생용 링크모음 — 폼 주소를 탈리에서 실시간으로 찾아 돌려줍니다.
   폼 이름이 바뀌거나 새로 만들어져도 이 파일은 고칠 필요 없습니다.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const TALLY = 'https://api.tally.so';

const WANT = [
  { key: 'checkin_es', label: '체크인 · 초등', emoji: '🌼', test: (n) => /체크인|전날/.test(n) && /초등/.test(n) },
  { key: 'checkin_ms', label: '체크인 · 중등', emoji: '🌿', test: (n) => /체크인|전날/.test(n) && /중등/.test(n) },
  { key: 'checkin_hs', label: '체크인 · 고등', emoji: '🍀', test: (n) => /체크인|전날/.test(n) && /고등/.test(n) },
  { key: 'arrival', label: '등원 — 출석체크', emoji: '✏️', test: (n) => /등원|출석/.test(n) },
  { key: 'dismissal', label: '하원 — 수업정리', emoji: '📘', test: (n) => /하원/.test(n) },
];

async function listForms(key) {
  const items = [];
  for (let p = 1; p <= 6; p++) {
    const r = await fetch(`${TALLY}/forms?page=${p}&limit=50`, {
      headers: { Authorization: 'Bearer ' + key },
    });
    if (!r.ok) break;
    const j = await r.json().catch(() => null);
    const batch = (j && (j.items || j.data)) || [];
    items.push(...batch);
    if (batch.length < 50) break;
  }
  return items;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  const key = process.env.TALLY_API_KEY;
  if (!key) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ error: 'no_key', links: [] }));
  }
  try {
    const forms = await listForms(key);
    const links = WANT.map((w) => {
      const f = forms.find((x) => w.test(String(x.name || '').normalize('NFC')));
      return {
        key: w.key, label: w.label, emoji: w.emoji,
        url: f ? `https://tally.so/r/${f.id}` : null,
        formName: f ? f.name : null,
      };
    });
    res.statusCode = 200;
    res.end(JSON.stringify({ links, generatedAt: new Date().toISOString() }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ error: String((e && e.message) || e), links: [] }));
  }
};
