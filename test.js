// node test.js — 이벤트 데이터 검증 + 한 장(28일)을 가상으로 돌려 보는 시뮬레이션. express/ws 없이도 돌아간다.
const D = require('./data'); require('./content')(D);
const E = require('./engine')(D);
let bad = 0, wn = 0; const err = m => { bad++; console.log('✗', m); }, warn = m => { wn++; console.log('△', m); };

// 1) 데이터 검증
const all = D.events.flat(), ids = new Set();
all.forEach(e => {
  if (ids.has(e.id)) err('id 중복 ' + e.id); ids.add(e.id);
  if (!['b', 'n', 'j'].includes(e.who)) err(`${e.id}: who 값 이상`);
  if (!e.opts || e.opts.length < 2) err(`${e.id}: 선택지가 2개 미만`);
  (e.opts || []).forEach(o => {
    if (!D.stats.includes(o[1])) err(`${e.id}: 알 수 없는 능력치 ${o[1]}`);
    if (!(o[2] >= 5 && o[2] <= 14)) err(`${e.id}: 난이도 범위 이상 ${o[2]}`);
    [o[0], o[3], o[4]].forEach(t => { if (/\{[^NJP}]|[^NJP]\}/.test(t.replace(/\{[NJP]\}/g, ''))) err(`${e.id}: 치환자 이상 → ${t.slice(0, 20)}`); });
  });
  if (e.loc && !D.loc[e.loc]) err(`${e.id}: 없는 장소 ${e.loc}`);
  if (e.loc && D.loc[e.loc] && D.loc[e.loc].ch && !D.loc[e.loc].ch.includes(e.ch)) err(`${e.id}: ${e.ch + 1}장에는 없는 장소(${e.loc})라 장소 가중치가 의미 없음`);
  if (e.b && e.b[0] > D.bondCap[e.ch]) err(`${e.id}: 최소 유대 ${e.b[0]}가 이 장의 상한 ${D.bondCap[e.ch]}보다 큼 → 영영 안 나옴`);
  if (e.b && e.b[0] > D.bondFloor[e.ch] + 8) warn(`${e.id}: 최소 유대 ${e.b[0]} — 유대를 충분히 쌓지 못하면 나오지 않음 (시작선 ${D.bondFloor[e.ch]})`);
  [e.title, e.scene].forEach(t => { if (/\{P\}/.test(t)) err(`${e.id}: 사건 문장에는 {P} 를 쓸 수 없음`); });
  if (e.maj && !e.d && !e.day) err(`${e.id}: 굵직한 사건인데 d/day 없음`);
  // 시점 점검: 준야 장면(j)의 선택지에 {J}(=준야가 대상)가 나오면 행동 주체가 나기일 가능성이 큼 (반대도 마찬가지)
  (e.opts || []).forEach(o => { if ((e.who === 'j' && o[0].includes('{J}')) || (e.who === 'n' && o[0].includes('{N}'))) warn(`${e.id}: 선택지 '${o[0].slice(0, 16)}' 의 행동 주체가 장면 주인과 다를 수 있음`); });
  if (e.d && e.d[0] > D.len[e.ch]) err(`${e.id}: 일차가 장 길이를 넘음`);
  if (e.need) e.need.forEach(n => { const t = E.byId[n]; if (!t) err(`${e.id}: need ${n} 없음`); else if (t.ch > e.ch) err(`${e.id}: 뒷 장의 사건을 선행 조건으로 걺`); });
});
D.events.forEach((l, i) => {
  const maj = l.filter(e => e.maj).length;
  console.log(`${i + 1}장 ${D.chapters[i].name.split(' - ')[1]}: 총 ${l.length}/100 (굵직 ${maj}/20, 일반 ${l.length - maj}/80)`);
});
Object.keys(D.crops).forEach(m => { if (!D.month.includes(m)) err('작물표에만 있는 월 ' + m); });
D.month.forEach(m => { if (!D.crops[m]) err('작물표에 없는 월 ' + m + ' → 농사 시 서버 크래시'); });

// 2) 시뮬레이션: 매일 3라운드, 70%는 같은 장소
function sim(ch, together = 0.7) {
  const r = { ch, day: 1, bond: D.bondFloor[ch], done: [], recent: [] }, seen = [], locs = Object.keys(D.loc);
  for (; r.day <= D.len[ch]; r.day++) {
    const f = E.forced(r); if (f) { r.done.push(f.id); seen.push(f); }
    for (let k = 0; k < 3; k++) {
      const t = Math.random() < together, ev = E.choose(r, t ? locs[Math.floor(Math.random() * locs.length)] : null, t);
      if (ev) { r.done.push(ev.id); r.recent = [...r.recent.slice(-14), ev.id]; seen.push(ev); r.bond = Math.min(D.bondCap[ch], r.bond + 2); }
    }
  }
  return seen;
}
for (let ch = 0; ch < 4; ch++) {
  if (!D.events[ch].length) continue;
  const s = sim(ch), maj = s.filter(e => e.maj), dup = s.length - new Set(s.map(e => e.id)).size;
  console.log(`  시뮬 ${ch + 1}장(28일): 사건 ${s.length}개 / 굵직 ${maj.length}/${D.events[ch].filter(e => e.maj).length} / 일반 반복 ${dup}`);
  const wrong = maj.filter(e => s.indexOf(e) < s.findIndex(x => (e.need || []).includes(x.id)) && e.need); // 순서 위반 검사
  if (wrong.length) err('선행 조건 순서 위반 ' + wrong.map(e => e.title));
  if (s.filter(e => e.maj).some((e, i, a) => a.findIndex(x => x.id === e.id) !== i)) err('굵직한 사건이 반복됨');
}
console.log((bad ? `\n문제 ${bad}건` : '\n검증 통과') + (wn ? ` (확인 권장 ${wn}건)` : ''));
process.exitCode = bad ? 1 : 0;
