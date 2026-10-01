// content.js — 이벤트 로더.
//  1) 특성 정의  2) 기존 28개(legacy.js) 로드 후 patch 표로 위치/조건 보정
//  3) ch1a.js, ch1b.js, ch2a.js ... 같은 장별 파일이 있으면 자동으로 읽는다 (없으면 건너뜀)
//
// 장별 파일 작성법 (module.exports=(D,{M,m,o,patch})=>{ ... })
//   M(누구,제목,지문,[선택지...],메타)  굵직한 사건(한 번만 나옴)
//   m(누구,제목,지문,[선택지...],메타)  일반 사건(소진되면 재활용)
//   o(라벨,능력치,난이도,성공문,실패문,성공시유대,실패시유대,잠금?)   잠금 예: ['용기',6] — 성장해야 열리는 선택지
//   누구: 'b'=둘 중 아무나, 'n'=나기, 'j'=준야
//   메타: { loc:'street|sea|river|pool|shop|school', b:[최소유대,최대유대], d:[최소일차], day:고정일차,
//          need:['먼저 일어나야 하는 사건 제목'], once:1 }
//   텍스트 치환: {N}=나기 {J}=준야, 조사 "이(가) 은(는) 을(를) 와(과) 으로(로)" 는 자동 보정
const fs = require('fs'), path = require('path');

module.exports = D => {
  D.traits = { // 이름: [올라가는 능력치, 선택 가능한 캐릭터]
    '물고기 같은 몸': ['체력', 'nagi'], '감자 같은 근성': ['끈기', 'nagi'], '겁 없는 아이': ['용기', 'nagi'],
    '싹싹한 장사꾼': ['다정', 'junya'], '종이접기 손재주': ['재치', 'junya'], '눈치 빠른 아이': ['눈치', 'junya'],
  };
  D.events = [[], [], [], []];

  const o = (a, s, dc, t, f, b = 2, c = 0, lock) => (lock ? [a, s, dc, t, f, b, c, lock] : [a, s, dc, t, f, b, c]); // lock: ['능력치',최소값] | ['bond',최소유대] | ['ch',최소장(0~3)]
  const add = (ch, maj, who, title, scene, opts, meta = {}) => {
    if (D.events[ch].some(x => x.title === title)) { console.warn(`[content] 제목 중복, 건너뜀: ${ch + 1}장 '${title}'`); return null; }
    const e = { ch, maj: maj ? 1 : 0, who, title, scene, opts, ...meta };
    D.events[ch].push(e);
    return e;
  };
  const patch = (ch, title, meta) => {
    const e = D.events[ch].find(x => x.title === title);
    if (!e) throw new Error(`patch 대상 없음: ${ch}장 '${title}'`);
    if (meta.ch != null && meta.ch !== ch) { D.events[ch].splice(D.events[ch].indexOf(e), 1); D.events[meta.ch].push(e); }
    Object.assign(e, meta);
  };

  // ── 기존 28개 ──
  require('./legacy')(D, { add, o });
  const L = (ch, t, meta) => patch(ch, t, meta);
  // 1장(0): 초등 / 7월
  L(0, '첫 낚시터', { loc: 'sea', d: [1] });
  L(0, '종이학 천 마리', { loc: 'pool', d: [5] });
  L(0, '첫 메달', { maj: 1, loc: 'shop', d: [15], need: ['대회 전날 밤'] });
  L(0, '주방 심부름', { loc: 'shop' });
  L(0, '비밀 기지', { loc: 'street', d: [8] });
  L(0, '여름 합숙소', { loc: 'pool', d: [17] });
  L(0, '가게의 마지막 손님', { loc: 'shop', d: [23] });
  // 2장(1): 중학 / 9월
  L(1, '멈춘 기록', { loc: 'pool', d: [3] });
  L(1, '진로 조사서', { loc: 'school', d: [6] });
  L(1, '가게를 이을까', { loc: 'shop', d: [9], need: ['진로 조사서'] });
  L(1, '첫 말다툼', { maj: 1, d: [12], need: ['진로 조사서'] });
  L(1, '늦잠', { loc: 'school' });
  L(1, '수영대회 도 대표', { loc: 'pool', d: [16] });
  L(1, '교복 단추', { title: '졸업사진', loc: 'school', d: [22] }); // 제목과 내용이 안 맞던 것 정정
  // 3장(2): 고등 / 12월
  L(2, '선수 은퇴', { loc: 'pool', d: [10] });
  L(2, '수영장 마지막 방문', { loc: 'pool', d: [12], need: ['선수 은퇴'] });
  L(2, '늦은 사춘기', { loc: 'street', d: [14], need: ['선수 은퇴'] });
  L(2, '생일 전날', { loc: 'street', d: [17], need: ['늦은 사춘기'] });
  L(2, '진로찾기 대작전', { maj: 1, d: [20], need: ['늦은 사춘기'] });
  L(2, '고깃집 알바', { loc: 'shop', d: [24] });
  L(2, '낮잠 공강', { loc: 'school' });
  L(3, '겨울 낮잠', { ch: 2, loc: 'street' }); // 첫눈 이야기라 겨울인 3장(고등)으로 이동
  // 4장(3): 졸업 후 / 3월
  L(3, '졸업여행 4일', { day: 1 }); // 4장 첫날 고정 이벤트
  L(3, '같은 가게 앞', { loc: 'shop', d: [5] });
  L(3, '이름 붙이기', { d: [14], b: [85, 100], need: ['졸업여행 4일'] }); // 고백은 유대가 충분히 쌓였을 때만
  L(3, '수영장 코치 제안', { loc: 'pool', d: [16] });
  L(3, '첫 손님 상', { loc: 'shop', d: [20] });
  L(3, '첫 요리 수업', { loc: 'shop' });

  // ── 장별 신규 파일 (ch1a, ch1b, ch2a ...) ──
  for (let n = 1; n <= 4; n++) for (const s of 'abcdefx') { // x = 성장·해금 추가분 (항상 마지막)
    const f = path.join(__dirname, `ch${n}${s}.js`);
    if (!fs.existsSync(f)) continue;
    const ch = n - 1;
    require(f)(D, { M: (...a) => add(ch, 1, ...a), m: (...a) => add(ch, 0, ...a), o, patch: (t, meta) => patch(ch, t, meta) });
  }

  // ── 마무리: id 부여, 선행 조건 해석, 기본값 ──
  D.events.forEach((list, ch) => list.forEach(e => (e.id = `${e.ch}:${e.title}`)));
  const all = D.events.flat();
  const findId = (ch, t) => (all.find(x => x.ch === ch && x.title === t) || all.find(x => x.title === t) || {}).id;
  all.forEach(e => {
    if (e.need) e.need = e.need.map(t => findId(e.ch, t) || (() => { throw new Error(`need 를 찾을 수 없음: '${e.title}' → '${t}'`); })());
    if (!e.b) e.b = e.ch === 0 ? [0, D.bondCap[0]] : [Math.max(0, D.bondFloor[e.ch] - 8), 100]; // 유대 하한(floor-8)과 맞춤: 실패가 쌓여도 이벤트가 잠기지 않게
  });
  D.events.forEach((list, ch) => { // d 없는 굵직한 사건은 장 전체에 고르게 배치
    const majors = list.filter(e => e.maj && !e.d && !e.day);
    majors.forEach((e, i) => (e.d = [1 + Math.round(i * (D.len[ch] - 8) / Math.max(1, majors.length - 1))]));
  });
};
