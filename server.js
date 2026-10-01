// server.js — 같은 골목 (서나기 · 이준야 2인 역극 게임 서버)
// 폴더 구조: server.js / data.js / content.js / engine.js / legacy.js / ch1a.js ... / package.json / public/(index.html, app.js, style.css)
const express = require('express'), http = require('http'), crypto = require('crypto'), fs = require('fs');
const { WebSocketServer } = require('ws');
const D = require('./data'); require('./content')(D);
const E = require('./engine')(D);

const app = express(); app.use(express.static(__dirname + '/public'));
const srv = http.createServer(app);
const wss = new WebSocketServer({ server: srv, maxPayload: 16 * 1024 }); // 기본값(100MB) 방지

/* ── 저장 ── */
const FILE = (process.env.DATA_DIR || __dirname) + '/save.json';
const R = Object.create(null); // 세션 코드가 '__proto__' 등이어도 안전하도록 프로토타입 없는 객체 사용
let timer;
try { Object.assign(R, JSON.parse(fs.readFileSync(FILE))); } catch {}
const save = () => { clearTimeout(timer); timer = setTimeout(() => fs.writeFile(FILE + '.tmp', JSON.stringify(R), () => fs.rename(FILE + '.tmp', FILE, () => {})), 400); };
const flush = () => { try { fs.writeFileSync(FILE, JSON.stringify(R)); } catch {} process.exit(0); };
process.on('SIGTERM', flush); process.on('SIGINT', flush);
process.on('uncaughtException', e => console.error('uncaught', e)); // 이상한 메시지 하나로 서버 전체가 죽지 않도록

/* ── 기본 도구 ── */
const NM = { nagi: '서나기', junya: '이준야' };
const WX = ['맑음', '맑음', '흐림', '비', '바람'];
const rand = n => 1 + Math.floor(Math.random() * n), pk = a => a[rand(a.length) - 1];
const H = x => crypto.createHash('sha256').update('cg:' + String(x || '')).digest('hex');
const P = k => ({ st: { ...D.base[k] }, xp: {}, boost: 0, en: 6, money: 50, set: 0, used: {} });
const mk = () => ({ wx: '맑음', diary: { nagi: [], junya: [] }, album: [], ch: 0, day: 1, per: 0, sb: 0, bond: D.bondFloor[0], mem: 0,
  done: [], recent: [], ev: null, evAt: 0, votes: [], log: [], n: 0, pick: {}, sl: [], inv: { fish: 0, crop: 0, dish: 0 }, crop: 0, last: {},
  p: { nagi: P('nagi'), junya: P('junya') } });

// 옛 저장 파일을 새 구조로 맞춘다 (이벤트 id 방식으로 바뀌면서 필요)
function migrate(r) {
  r.diary = r.diary || { nagi: [], junya: [] }; r.album = r.album || []; r.done = r.done || []; r.recent = r.recent || [];
  r.inv = r.inv || { fish: 0, crop: 0, dish: 0 }; r.sl = r.sl || []; r.last = r.last || {}; r.votes = r.votes || []; r.wx = r.wx || '맑음';
  r.crop = r.crop || 0; r.evAt = r.evAt || 0; r.sb = r.sb || 0;
  r.log.forEach((l, i) => { if (l.i == null) l.i = i; });
  r.n = Math.max(r.n || 0, r.log.length ? r.log[r.log.length - 1].i + 1 : 0);
  if (r.ev != null && !E.byId[r.ev]) r.ev = null; // 옛 인덱스식 이벤트 값은 버린다
  delete r.seen; delete r.fx;
  for (const k in r.p) r.p[k].used = r.p[k].used || {};
  r.bond = Math.max(0, Math.min(D.bondCap[r.ch], r.bond));
}
for (const c in R) migrate(R[c]);

const socks = c => [...wss.clients].filter(w => w.room === c && w.readyState === 1);
const online = c => ['nagi', 'junya'].filter(k => socks(c).some(w => w.role === k));
const add = (r, k, t, who) => { r.log.push({ i: r.n++, k, who, t }); if (r.log.length > 2000) r.log.shift(); };
const bc = (c, m) => socks(c).forEach(w => w.send(JSON.stringify(m)));

// {N}{J} 이름 치환 + 조사 자동 보정 (이(가) 은(는) 을(를) 와(과) 으로(로))
const jong = ch => { const n = ch.charCodeAt(0) - 0xAC00; return n < 0 || n > 11171 ? -1 : n % 28; };
const fill = t => String(t).replaceAll('{N}', '나기').replaceAll('{J}', '준야')
  .replace(/([가-힣])(이\(가\)|은\(는\)|을\(를\)|와\(과\)|과\(와\)|으로\(로\))/g, (m, c, j) => {
    const f = jong(c);
    if (j === '이(가)') return c + (f > 0 ? '이' : '가');
    if (j === '은(는)') return c + (f > 0 ? '은' : '는');
    if (j === '을(를)') return c + (f > 0 ? '을' : '를');
    if (j === '으로(로)') return c + (f <= 0 || f === 8 ? '로' : '으로');
    return c + (f > 0 ? '과' : '와');
  });
const withName = (t, k) => fill(String(t).replaceAll('{P}', NM[k]));

const LOC = Object.fromEntries(Object.entries(D.loc).map(([k, v]) => [k, { n: v.n, ch: v.ch, a: v.a.map(a => [a[0], a[1], a[2], a[3]]) }]));
const wd = (r, l) => ['street', 'sea', 'river'].includes(l) && r.wx === '비' ? 1 : 0;
const stg = b => D.stages.filter(x => b >= x[0]).length - 1;
const lk = (r, k, o) => o[7] ? (o[7][0] === 'bond' ? r.bond < o[7][1] : r.p[k].st[o[7][0]] < o[7][1]) : false;
const roll = (mod, dc) => { const d = rand(20), tot = d + mod, ok = d === 20 || (d > 1 && tot >= dc); return { d, mod, tot, ok, res: d === 20 ? '대성공' : d === 1 ? '대실패' : ok ? '성공' : '실패' }; };

function setB(r, d) {
  const o = stg(r.bond), cap = D.bondCap[r.ch], before = r.bond;
  r.bond = Math.max(Math.max(0, D.bondFloor[r.ch] - 8), Math.min(cap, r.bond + d));
  if (d > 0 && before < cap && r.bond === cap) add(r, 'sys', '이 시기에 쌓을 수 있는 마음은 여기까지인 것 같다. 이야기가 이어지면 더 깊어질 것이다.');
  const n = stg(r.bond);
  if (n > o) add(r, 'sys', `[관계 - ${D.stages[n][1]}] ${D.stages[n][2]}`);
}
const SHOP_B = 4; // 선물·기념품·요리 대접으로 하루에 쌓을 수 있는 유대 (돈·요리로 유대 상한까지 며칠 만에 도달하는 것 방지)
function shopB(r, d) { const g = Math.min(d, Math.max(0, SHOP_B - (r.sb | 0))); r.sb = (r.sb | 0) + g; if (g > 0) setB(r, g); return g; }
function grow(r, k, s, n) {
  const p = r.p[k]; p.xp[s] = (p.xp[s] || 0) + n;
  if (p.xp[s] >= 6 && p.st[s] < 12) { p.xp[s] = 0; p.st[s]++; add(r, 'sys', fill(`${NM[k]}의 ${s}이(가) 올랐다. (${p.st[s]})`)); }
}
function startEv(r, e, tag) {
  r.ev = e.id; r.evAt = Date.now(); if (!r.done.includes(e.id)) r.done.push(e.id); r.recent = [...r.recent.slice(-14), e.id];
  add(r, 'ev', `${tag} ${fill(e.title)}\n${fill(e.scene)}`);
}

/* ── 상태 전송 ── */
function push(c) {
  const r = R[c]; if (!r) return;
  const on = {}; online(c).forEach(k => (on[k] = 1)); save();
  const e = r.ev == null ? null : E.byId[r.ev], crop = D.crops[D.month[r.ch]];
  socks(c).forEach(w => w.send(JSON.stringify({ type: 'state', s: {
    ch: r.ch, day: r.day, per: r.per, wx: r.wx, bond: r.bond, mem: r.mem, p: r.p, inv: r.inv, crop: r.crop, sl: r.sl, votes: r.votes, album: r.album,
    diary: r.diary[w.role] || [], stage: D.stages[stg(r.bond)][1], pick: Object.fromEntries(Object.keys(r.pick).map(k => [k, 1])),
    evd: e && { who: e.who, title: fill(e.title), c: e.opts.map(o => [fill(o[0]), o[1], o[2], lk(r, w.role, o)]) },
    on, log: r.log.slice(-150), len: D.len[r.ch], month: D.month[r.ch], cap: D.bondCap[r.ch], cn: crop[0], cd: crop[1],
  } })));
}

/* ── 하루 넘기기 ── */
function newDay(c) {
  const r = R[c], on = online(c), rolls = [];
  r.per = 0; r.day++; r.sl = []; r.pick = {}; r.sb = 0; // 어제 골라 둔 행동이 새 날에 남아 해결되던 문제 방지
  for (const k in r.p) { r.p[k].en = 6; r.p[k].used = {}; }
  for (const k of on) {
    const d = rand(20), res = d <= 3 ? '불운' : d >= 18 ? '행운' : '평범';
    const t = d <= 3 ? `${NM[k]}은(는) 아침부터 일이 꼬였다. 에너지가 줄었다.` : d >= 18 ? `${NM[k]}은(는) 이유 없이 기분 좋게 하루를 시작했다. 다음 판정에 +2.` : `${NM[k]}의 하루는 평범하게 시작되었다.`;
    if (d <= 3) r.p[k].en -= 1; if (d >= 18) r.p[k].boost = Math.max(r.p[k].boost, 2);
    rolls.push({ who: k, d, mod: 0, lab: '하루 운세', res, title: '오늘의 운', stat: '운', t: fill(t) });
    add(r, 'roll', fill(`오늘의 운 / ${NM[k]} (d20=${d} ${res})\n${t}`));
  }
  r.wx = pk(WX);
  add(r, 'sys', `${D.month[r.ch]} ${r.day}일이 밝았다. 오늘 날씨: ${r.wx}${r.wx === '비' ? ' (야외 행동 난이도 +1)' : ''}.`);
  if (r.day === D.len[r.ch] + 1) add(r, 'sys', '이 장의 기간이 끝났다. 두 사람이 동의하면 다음 장으로 넘어갈 수 있다. 원한다면 계속 머물러도 된다.');
  const f = r.ev == null && E.forced(r); if (f) startEv(r, f, '[정해진 날]');
  for (const k of on) { const s = r.p[k].plan; if (s) { grow(r, k, s, 3); add(r, 'sys', fill(`${NM[k]}이(가) 어제 정해 둔 일과로 ${s}을(를) 단련했다.`)); } }
  bc(c, { type: 'roll', rolls }); push(c);
}

/* ── 한 라운드 해결 (온라인인 모두가 행동을 골랐을 때) ── */
function resolve(c) {
  const r = R[c], on = online(c);
  if (!r || r.ev != null || !on.length || on.some(k => !r.pick[k])) return;
  add(r, 'sys', `${D.month[r.ch]} ${r.day}일 ${D.pers[r.per]}`);
  const rolls = [];
  for (const k of on) {
    const [l, i] = r.pick[k], a = D.loc[l].a[i], p = r.p[k];
    if (a[1] === 'rest') { p.en = Math.min(8, p.en + a[3]); add(r, 'roll', `${D.loc[l].n} / ${NM[k]} - ${a[0]}\n` + withName(a[4], k)); continue; }
    const dc = a[2] + wd(r, l), x = roll(p.st[a[1]] + p.boost, dc), text = withName(x.ok ? a[4] : a[5], k);
    p.boost = 0; p.en = Math.max(0, p.en - a[3]); grow(r, k, a[1], x.ok ? 2 : 1);
    if (x.ok) { p.money += a[6] || 0; if (Math.random() < 0.3) r.mem++; }
    add(r, 'roll', `${D.loc[l].n} / ${NM[k]} - ${a[0]} (${a[1]} d20=${x.d}+${x.mod}=${x.tot} 난이도 ${dc} ${x.res})\n${text}`);
    rolls.push({ who: k, d: x.d, mod: x.mod, dc, res: x.res, title: `${D.loc[l].n} - ${a[0]}`, stat: a[1], t: text });
  }
  add(r, 'gm', fill(pk(D.amb[r.ch])));
  if (Math.random() < 0.25) { // 어른들과 마주침
    add(r, 'npc', fill(pk(D.parents)));
    const k = pk(on), x = roll(r.p[k].st['다정'], 9);
    const t = fill(x.ok ? `${NM[k]}이(가) 밝게 인사해 어른들에게 좋은 인상을 남겼다.` : `${NM[k]}이(가) 인사를 얼버무려 머쓱해졌다.`);
    if (x.ok) setB(r, 1);
    add(r, 'roll', `어른들과의 마주침 / ${NM[k]} - 인사 (다정 d20=${x.d}+${x.mod} 난이도 9 ${x.res})\n${t}`);
    rolls.push({ who: k, d: x.d, mod: x.mod, dc: 9, res: x.res, title: '어른들과의 마주침 - 인사', stat: '다정', t });
  }
  if (on.length === 2) {
    const together = r.pick.nagi[0] === r.pick.junya[0];
    if (together) {
      add(r, 'sys', '두 사람은 같은 장소에 있었다.');
      const q = {}; for (const k of on) q[k] = { d: rand(20), m: r.p[k].st['눈치'] };
      const A = q.nagi.d + q.nagi.m, B = q.junya.d + q.junya.m, w = A > B ? 'nagi' : B > A ? 'junya' : null;
      for (const k of on) {
        const o = k === 'nagi' ? 'junya' : 'nagi', tot = q[k].d + q[k].m, opp = q[o].d + q[o].m;
        const res = !w ? '동시에 알아챔' : w === k ? '먼저 알아챔' : '뒤늦게 알아챔';
        const t = !w ? '두 사람이 동시에 서로를 발견했다.' : w === k ? `${NM[k]}이(가) 먼저 상대를 발견하고 다가갔다.` : `${NM[k]}은(는) 이름을 부르는 소리에 뒤늦게 고개를 돌렸다.`;
        rolls.push({ who: k, d: q[k].d, mod: q[k].m, lab: '상대 합계 ' + opp, res, title: '조우 판정', stat: '눈치', t: fill(t) });
        add(r, 'roll', fill(`조우 판정 / ${NM[k]} (눈치 d20=${q[k].d}+${q[k].m}=${tot} 상대 ${opp} ${res})\n${t}`));
      }
    }
    const ev = E.choose(r, together ? r.pick.nagi[0] : null, together);
    if (ev) { if (!together) add(r, 'sys', '서로 다른 곳에 있던 두 사람의 하루가 어딘가에서 겹쳤다.'); startEv(r, ev, together ? '[조우]' : '[사건]'); }
  }
  r.pick = {}; r.per = Math.min(3, r.per + 1);
  const f = r.ev == null && E.forced(r); if (f) startEv(r, f, '[정해진 날]');
  bc(c, { type: 'roll', rolls }); push(c);
}

/* ── 메시지 처리 ── */
const other = me => (me === 'nagi' ? 'junya' : 'nagi');
const STUFF = ['fish', 'farm', 'cook', 'serve', 'sell', 'assist', 'gift', 'buy', 'use', 'plan', 'trait', 'sleep', 'go'];

function onMessage(ws, raw) {
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;

  if (m.type === 'join') {
    const c = String(m.room || '').trim().slice(0, 20);
    if (!c || !['nagi', 'junya'].includes(m.role)) return;
    if (String(m.pw || '').length < 4) return ws.send(JSON.stringify({ type: 'deny', t: '비밀번호는 4자 이상이어야 합니다.' }));
    if (R[c] && R[c].pw && R[c].pw !== H(m.pw)) return ws.send(JSON.stringify({ type: 'deny', t: '세션 코드 또는 비밀번호가 맞지 않습니다.' }));
    socks(c).forEach(w => { if (w !== ws && w.role === m.role) { w.send(JSON.stringify({ type: 'kick' })); w.role = null; w.close(); } });
    ws.room = c; ws.role = m.role;
    ws.send(JSON.stringify({ type: 'init', d: { chs: D.chapters, stats: D.stats, pers: D.pers, loc: LOC, names: NM, npcs: D.npcs,
      traits: Object.fromEntries(Object.entries(D.traits).filter(([, v]) => v[1] === m.role).map(([k, v]) => [k, v[0]])) } }));
    if (!R[c]) { R[c] = mk(); add(R[c], 'sys', D.chapters[0].intro); }
    R[c].pw = R[c].pw || H(m.pw); migrate(R[c]); push(c);
    const ix = R[c].last[m.role];
    if (ix != null) { // 자리를 비운 사이 상대가 한 말 요약 (로그 번호 기준이라 로그가 잘려도 정확)
      const ls = R[c].log.filter(l => l.i >= ix && l.who && l.who !== m.role && l.k !== 'ooc').slice(-8).map(l => l.t.split('\n')[0].slice(0, 70));
      if (ls.length) ws.send(JSON.stringify({ type: 'recap', ls }));
    }
    return resolve(c);
  }

  const c = ws.room, r = R[c], me = ws.role;
  if (!r || !me) return;
  const p = r.p[me], now = Date.now();
  ws.q = (ws.q || []).filter(t => now - t < 5000); if (ws.q.length > 15) return; ws.q.push(now); // 도배 방지
  if (STUFF.includes(m.type) && !p.set) return; // 능력치 확정 전에는 생활 행동 불가

  switch (m.type) {
    case 'chat': {
      const t = String(m.t || '').slice(0, 600).trim(); if (!t) return;
      add(r, ['say', 'act', 'ooc', 'mind'].includes(m.k) ? m.k : 'say', t, me); break;
    }
    case 'go': {
      if (r.ev != null) return;
      if (r.per >= 3) { add(r, 'sys', '해가 졌다. 하루를 넘겨 주세요.'); break; }
      const Lc = typeof m.l === 'string' && Object.hasOwn(D.loc, m.l) ? D.loc[m.l] : null;
      if (!Lc || (Lc.ch && !Lc.ch.includes(r.ch))) return;
      const a = Number.isInteger(m.i) ? Lc.a[m.i] : null; if (!a) return;
      if (a[1] !== 'rest' && p.en < a[3]) { add(r, 'sys', fill(`${NM[me]}은(는) 지쳐서 그 일을 할 수 없다.`)); break; }
      r.pick[me] = [m.l, m.i]; push(c); return resolve(c);
    }
    case 'cancel': delete r.pick[me]; break;
    case 'pick': {
      if (r.ev == null) return;
      const e = E.byId[r.ev]; if (!e || (e.who !== 'b' && e.who !== me[0])) return;
      const o = Number.isInteger(m.i) ? e.opts[m.i] : null; if (!o || lk(r, me, o)) return;
      const x = roll(p.st[o[1]] + p.boost, o[2]); p.boost = 0;
      setB(r, (x.ok ? o[5] : o[6]) + (x.d === 20 ? 1 : 0)); r.mem++;
      r.album.push({ ch: r.ch, day: r.day, t: `${fill(e.title)} / ${NM[me]} - ${fill(o[0])} (${x.res})` });
      grow(r, me, o[1], 2);
      const t = fill(x.ok ? o[3] : o[4]);
      add(r, 'roll', `${NM[me]} - ${fill(o[0])} (${o[1]} d20=${x.d}+${x.mod}=${x.tot} 난이도 ${o[2]} ${x.res})\n${t}`);
      r.ev = null;
      bc(c, { type: 'roll', rolls: [{ who: me, d: x.d, mod: x.mod, dc: o[2], res: x.res, title: `${fill(e.title)}: ${fill(o[0])}`, stat: o[1], t }] });
      push(c); return resolve(c);
    }
    case 'alloc': {
      if (p.set) return;
      const v = D.stats.map(k => (m.st || {})[k]);
      if (v.some(x => !Number.isInteger(x) || x < 2 || x > 8) || v.reduce((a, b) => a + b, 0) !== 26) return;
      D.stats.forEach((k, j) => (p.st[k] = v[j])); p.set = 1; add(r, 'sys', NM[me] + '의 능력치가 정해졌다.'); break;
    }
    case 'trait': {
      const t = typeof m.k === 'string' && Object.hasOwn(D.traits, m.k) ? D.traits[m.k] : null;
      if (!p.set || p.tr || !t || t[1] !== me) return;
      p.tr = m.k; p.st[t[0]] = Math.min(12, p.st[t[0]] + 1); add(r, 'sys', NM[me] + '의 특성: ' + m.k); break;
    }
    case 'sleep': {
      if (r.ev != null || !p.set) return;
      const i = r.sl.indexOf(me); i < 0 ? r.sl.push(me) : r.sl.splice(i, 1);
      if (online(c).every(k => r.sl.includes(k))) return newDay(c);
      break;
    }
    case 'fish': {
      if (r.ev != null || r.pick[me] || p.en < 1) return;
      p.en--; const x = roll(p.st['끈기'] + p.boost, 12); p.boost = 0; grow(r, me, '끈기', 1);
      if (x.ok) r.inv.fish += x.d === 20 ? 2 : 1;
      if (x.d >= 19) { r.mem++; add(r, 'sys', '희귀한 물고기가 걸렸다. 기억 조각 +1'); }
      add(r, 'roll', fill(`낚시 / ${NM[me]} (끈기 d20=${x.d}+${x.mod}=${x.tot} ${x.res})\n` + (x.ok ? (x.d === 20 ? '커다란 놈이 걸렸다. 두 마리분이다!' : '찌가 움직였다. 물고기를 건졌다.') : '오늘은 입질이 없다. 바다만 오래 바라보았다.'))); break;
    }
    case 'farm': {
      if (r.ev != null || r.pick[me] || p.en < 1) return;
      const [name, days] = D.crops[D.month[r.ch]];
      if (!r.crop) { p.en--; r.crop = r.day; add(r, 'sys', fill(`${NM[me]}이(가) 골목 텃밭에 ${name} 씨앗을 심었다.`)); }
      else if (r.day - r.crop >= days) { p.en--; r.inv.crop += 2; r.crop = 0; grow(r, me, '체력', 1); add(r, 'sys', fill(`${NM[me]}이(가) 텃밭 작물을 수확했다. (${name} +2)`)); }
      break;
    }
    case 'cook': {
      if (r.ev != null || r.inv.fish < 1 || r.inv.crop < 1) return;
      r.inv.fish--; r.inv.crop--; const n = p.st['재치'] >= 6 ? 2 : 1; r.inv.dish += n; grow(r, me, '재치', 1);
      add(r, 'sys', fill(`${NM[me]}이(가) 직접 잡은 재료로 요리를 완성했다. (요리 +${n})`)); break;
    }
    case 'serve': {
      if (r.inv.dish < 1 || (p.used.serve | 0) >= 1) { if (r.inv.dish >= 1) add(r, 'sys', '오늘은 이미 요리를 대접했다.'); break; }
      const o = other(me); r.inv.dish--; p.used.serve = 1; r.p[o].en = Math.min(8, r.p[o].en + 2); shopB(r, 2);
      add(r, 'sys', fill(`${NM[me]}이(가) ${NM[o]}에게 요리를 대접했다. (행동력 +2, 유대 +2)`)); break;
    }
    case 'sell': {
      const g = r.inv.fish * 12 + r.inv.crop * 8; if (g < 1) return;
      p.money += g; r.inv.fish = 0; r.inv.crop = 0; add(r, 'sys', fill(`${NM[me]}이(가) 물고기와 작물을 팔아 ${g}원을 벌었다.`)); break;
    }
    case 'assist': {
      if (p.en < 1) return;
      const o = r.p[other(me)]; p.en--; o.boost = Math.max(o.boost, 2);
      add(r, 'sys', fill(`${NM[me]}이(가) 상대의 다음 일을 거들기로 했다. (상대 판정 +2)`)); break;
    }
    case 'plan': p.plan = D.stats.includes(m.s) ? m.s : ''; break;
    case 'use': {
      if (r.mem < 5) return;
      r.mem -= 5; p.boost = 3; add(r, 'sys', fill(`${NM[me]}이(가) 기억 조각을 써서 다음 판정에 +3을 얻었다.`)); break;
    }
    case 'gift': { // 하루 1번 (돈으로 유대를 무한히 사는 것을 방지)
      if (p.money < 30) return;
      if ((p.used.gift | 0) >= 1) { add(r, 'sys', '선물은 하루에 한 번만 건넬 수 있다.'); break; }
      p.money -= 30; p.used.gift = 1; shopB(r, 3); add(r, 'sys', fill(`${NM[me]}이(가) ${NM[other(me)]}에게 작은 선물을 건넸다.`)); break;
    }
    case 'buy': {
      if (m.k === 'snack' && p.money >= 20 && (p.used.snack | 0) < 2) { p.money -= 20; p.used.snack = (p.used.snack | 0) + 1; p.en = Math.min(8, p.en + 2); add(r, 'sys', fill(`${NM[me]}이(가) 간식을 사 먹었다. (행동력 +2)`)); }
      else if (m.k === 'keep' && p.money >= 60 && (p.used.keep | 0) < 1) { p.money -= 60; p.used.keep = 1; shopB(r, 2); r.album.push({ ch: r.ch, day: r.day, t: fill(`${NM[me]}이(가) 기념품을 준비했다`) }); add(r, 'sys', fill(`${NM[me]}이(가) 상대를 떠올리며 기념품을 샀다.`)); }
      break;
    }
    case 'diary': { const t = String(m.t || '').slice(0, 400).trim(); if (t) { r.diary[me].push(t); if (r.diary[me].length > 200) r.diary[me].shift(); } break; }
    case 'reveal': { const t = r.diary[me][m.i | 0]; if (t) add(r, 'mind', t, me); break; }
    case 'dismiss': { // 상대 장면이 열려 있는데 상대가 없거나(오프라인), 10분 넘게 응답이 없으면 넘길 수 있다
      if (r.ev == null) return;
      const e = E.byId[r.ev]; if (!e || e.who === 'b' || e.who === me[0]) return;
      const away = !online(c).includes(e.who === 'n' ? 'nagi' : 'junya'), stale = now - r.evAt > 10 * 60 * 1000;
      if (away || stale) { r.ev = null; add(r, 'sys', '자리를 비운 사람의 장면은 조용히 지나갔다.'); } else add(r, 'sys', '상대가 아직 접속 중이에요. 10분이 지나면 넘길 수 있어요.');
      break;
    }
    case 'note': { const t = String(m.t || '').slice(0, 300).trim(); if (t) add(r, 'note', t, me); break; }
    case 'vote': {
      if (r.day <= D.len[r.ch] && r.votes.indexOf(me) < 0) { add(r, 'sys', `아직 이 장의 기간이 남았어요. (${r.day}/${D.len[r.ch]}일) 굵직한 사건을 놓치지 않도록 기간이 끝난 뒤에 넘어갈 수 있어요.`); break; }
      const i = r.votes.indexOf(me); i < 0 ? r.votes.push(me) : r.votes.splice(i, 1);
      if (r.votes.length === 2) {
        r.votes = [];
        if (r.ch < D.chapters.length - 1) {
          add(r, 'sys', `[${D.chapters[r.ch].name.split(' - ')[0]} 회고] 이 장에서 남긴 추억 ${r.album.filter(x => x.ch === r.ch).length}개 / 현재 유대 ${r.bond} (${D.stages[stg(r.bond)][1]})`);
          r.ch++; r.day = 1; r.per = 0; r.pick = {}; r.ev = null; r.crop = 0; r.sl = []; r.wx = pk(WX);
          r.bond = Math.max(r.bond, D.bondFloor[r.ch]);
          for (const k in r.p) { r.p[k].en = 6; r.p[k].used = {}; }
          add(r, 'sys', D.chapters[r.ch].name + '\n' + D.chapters[r.ch].intro);
          const f = E.forced(r); if (f) startEv(r, f, '[정해진 날]');
        } else add(r, 'sys', '이야기는 계속된다.');
      }
      break;
    }
    default: return;
  }
  push(c);
}

wss.on('connection', ws => {
  ws.dead = false; ws.on('pong', () => (ws.dead = false));
  ws.on('message', raw => { try { onMessage(ws, raw); } catch (e) { console.error('message error', e); } });
  ws.on('close', () => {
    const r = R[ws.room]; if (!r || !ws.role) return;
    r.last[ws.role] = r.n; push(ws.room);
    const room = ws.room; setTimeout(() => { try { resolve(room); } catch (e) { console.error(e); } }, 8000); // 상대가 나간 뒤에도 기다리던 라운드가 풀리도록
  });
});
setInterval(() => wss.clients.forEach(w => { if (w.dead) return w.terminate(); w.dead = true; w.ping(); }), 30000); // 프록시의 유휴 연결 끊김 방지

app.get('/export/:c', (q, s) => {
  const r = R[q.params.c];
  if (!r || r.pw !== H(q.query.pw)) return s.status(404).end();
  s.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename=session.txt' });
  s.send(r.log.map(l => (l.who ? NM[l.who] + ': ' : '') + l.t).join('\n\n'));
});

srv.listen(process.env.PORT || 3000, () => console.log('listening'));
