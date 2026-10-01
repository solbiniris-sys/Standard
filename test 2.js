// test.js — `npm test` 로 실행. 이벤트 데이터 검사 + 장별 진행 시뮬레이션.
// 새 이벤트 파일(ch1d.js 등)을 추가할 때마다 돌려서 실수를 먼저 잡는다.
const D = require('./data'); require('./content')(D);
const E = require('./engine')(D);

const TARGET_MINOR = 80, TARGET_MAJOR = 20;
const BANNED = /나진|나비|차단|(^|[\s"'“‘,])단(이|은|는|을|도|의|과|에게)(?![가-힣])/; // 다른 오너님 캐릭터 이름
const errs = [], warn = [];
const bad = (m) => errs.push(m);

D.events.forEach((list, ch) => {
  const tag = `${ch + 1}장`, seen = new Set();
  list.forEach(e => {
    const w = `${tag} '${e.title}'`;
    if (seen.has(e.title)) bad(`${w}: 제목 중복 (id 충돌)`); seen.add(e.title);
    if (!['b', 'n', 'j'].includes(e.who)) bad(`${w}: who 값 오류 ${e.who}`);
    if (!e.opts || e.opts.length < 2) bad(`${w}: 선택지가 2개 미만`);
    if (e.loc && !D.loc[e.loc]) bad(`${w}: 없는 장소 ${e.loc}`);
    if (e.loc && D.loc[e.loc].ch && !D.loc[e.loc].ch.includes(ch)) bad(`${w}: '${e.loc}' 장소는 ${tag}에 열리지 않음`);
    if (e.need) e.need.forEach(id => { if (!E.byId[id]) bad(`${w}: 선행 사건 없음 ${id}`); });
    const texts = [e.title, e.scene];
    e.opts.forEach(o => {
      if (!D.stats.includes(o[1])) bad(`${w}: 능력치 오류 '${o[1]}'`);
      if (!(o[2] >= 5 && o[2] <= 14)) bad(`${w}: 난이도 범위 밖 ${o[2]}`);
      if (typeof o[3] !== 'string' || typeof o[4] !== 'string' || !o[3] || !o[4]) bad(`${w}: 성공/실패 문장 누락`);
      if (!(o[5] >= 0 && o[5] <= 6) || !(o[6] >= -3 && o[6] <= 3)) bad(`${w}: 유대 값 이상 ${o[5]},${o[6]}`);
      texts.push(o[0], o[3], o[4]);
    });
    const all = texts.join(' ');
    (all.match(/\{[^}]*\}/g) || []).filter(x => x !== '{N}' && x !== '{J}').forEach(x => bad(`${w}: 알 수 없는 치환 ${x}`));
    if (BANNED.test(all)) bad(`${w}: 다른 오너님 캐릭터 이름 의심`);
    const filled = all.replaceAll('{N}', '나기').replaceAll('{J}', '준야');
    if (/\((가|는|를|와|로|이|은|을|과)\)/.test(filled.replace(/([가-힣])(이\(가\)|은\(는\)|을\(를\)|와\(과\)|과\(와\)|으로\(로\))/g, '$1'))) bad(`${w}: 조사 자동 보정이 안 되는 표기`);
    if (e.scene.length > 170) warn(`${w}: 지문이 길어요 (${e.scene.length}자 · 모바일 한 화면 권장 170자)`);
  });
});

// 개수 현황
console.log('장별 현황 (굵직 / 일반 → 일반 목표 대비)');
D.events.forEach((list, ch) => {
  const M = list.filter(e => e.maj).length, m = list.length - M;
  const who = list.filter(e => !e.maj).reduce((a, e) => ((a[e.who] = (a[e.who] || 0) + 1), a), {});
  console.log(`  ${ch + 1}장: 굵직 ${M}/${TARGET_MAJOR} · 일반 ${m}/${TARGET_MINOR} (남은 ${Math.max(0, TARGET_MINOR - m)}) · who ${JSON.stringify(who)}`);
  if (M !== TARGET_MAJOR) warn(`${ch + 1}장: 굵직한 사건이 ${M}개`);
});

// 진행 시뮬레이션: 두 사람이 같은 장소에서 하루 3번 행동한다고 가정하고 장을 끝까지 돌려 본다.
console.log('\n진행 시뮬레이션 (같은 장소 · 하루 3라운드 · 28일 + 여유 2일 · 20회 평균)');
D.events.forEach((list, ch) => {
  let noEv = 0, minorSeen = 0, majorSeen = 0, repeat = 0, stuck = 0; const RUNS = 20;
  for (let t = 0; t < RUNS; t++) {
    const r = { ch, day: 1, bond: D.bondFloor[ch], done: [], recent: [] };
    for (let c = 0; c < ch; c++) D.events[c].forEach(e => e.maj && r.done.push(e.id));
    const locs = Object.keys(D.loc).filter(k => !D.loc[k].ch || D.loc[k].ch.includes(ch));
    for (let day = 1; day <= D.len[ch] + 2; day++) {
      r.day = day;
      const f = E.forced(r); if (f) { r.done.push(f.id); majorSeen++; }
      for (let p = 0; p < 3; p++) {
        const e = E.choose(r, locs[Math.floor(Math.random() * locs.length)], true);
        if (!e) { noEv++; continue; }
        if (e.maj) majorSeen++; else { minorSeen++; if (r.done.includes(e.id)) repeat++; }
        if (!r.done.includes(e.id)) r.done.push(e.id);
        r.recent = [...r.recent.slice(-14), e.id];
        r.bond = Math.min(D.bondCap[ch], r.bond + 1);
      }
    }
    list.filter(e => e.maj && !r.done.includes(e.id)).forEach(e => { stuck++; });
  }
  console.log(`  ${ch + 1}장: 사건 없는 라운드 ${(noEv / RUNS).toFixed(1)} · 굵직 ${(majorSeen / RUNS).toFixed(1)} · 일반 ${(minorSeen / RUNS).toFixed(1)} (이미 본 일반 사건 재등장 ${(repeat / RUNS).toFixed(1)}) · 끝까지 못 본 굵직 ${(stuck / RUNS).toFixed(2)}`);
  if (stuck / RUNS > 0.5) warn(`${ch + 1}장: 굵직한 사건이 안 나오는 경우가 있어요 (유대/선행 조건 확인)`);
});

if (warn.length) console.log('\n[주의]\n' + warn.map(x => '  - ' + x).join('\n'));
if (errs.length) { console.log('\n[오류]\n' + errs.map(x => '  - ' + x).join('\n')); process.exit(1); }
console.log('\n오류 없음');
