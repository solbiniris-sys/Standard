// engine.js — 이벤트 선택 로직. 서버/네트워크와 분리된 순수 함수라서 따로 테스트할 수 있다.
//
// 이벤트 객체: { id, ch, maj, who('b'|'n'|'j'), title, scene, opts,
//               loc?, b?:[최소유대,최대유대], need?:[선행 이벤트 id], d?:[최소일차,최대일차], day?:고정일, once? }
//  - maj(굵직한 사건)·once 는 한 번만 나온다 (r.done 에 영구 기록 — 장이 바뀌어도 유지)
//  - 일반 사건은 모두 소진되면 최근 것을 제외하고 다시 나올 수 있다
//  - d[0] 이후 3일이 지나도록 안 나온 굵직한 사건은 "밀린 사건"이 되어 다음 라운드에 반드시 나온다
const rand = n => 1 + Math.floor(Math.random() * n);
const pk = a => a[rand(a.length) - 1];

module.exports = D => {
  const byId = {};
  D.events.forEach(list => list.forEach(e => (byId[e.id] = e)));

  const open = (r, e) => {
    if ((e.maj || e.once) && r.done.includes(e.id)) return false;
    if (e.b && (r.bond < e.b[0] || r.bond > e.b[1])) return false;
    if (e.need && !e.need.every(id => r.done.includes(id))) return false;
    if (e.d && (r.day < e.d[0] || (e.d[1] && r.day > e.d[1]))) return false;
    return true;
  };

  // 고정일 이벤트: 해당 일차가 되면 (아직 안 봤다면) 무조건 시작
  const forced = r => D.events[r.ch].find(e => e.day && r.day >= e.day && !r.done.includes(e.id) && open(r, e)) || null;

  // together: 같은 장소를 골랐는지, loc: 그 장소 키(없으면 null)
  const choose = (r, loc, together) => {
    const pool = D.events[r.ch].filter(e => open(r, e) && !e.day);
    const fresh = pool.filter(e => !r.done.includes(e.id));
    const majors = fresh.filter(e => e.maj);
    const overdue = majors.filter(e => r.day >= Math.min((e.d ? e.d[0] : 1) + 3, D.len[r.ch])).sort((a, b) => a.d[0] - b.d[0]); // 늦은 일차의 사건도 장이 끝나기 전에는 반드시 나오도록 상한을 둔다
    if (overdue.length) return overdue[0];                    // 서사의 뼈대는 밀리지 않는다
    if (Math.random() > (together ? 0.85 : 0.2)) return null; // 같이 있으면 대부분 사건이 생기고, 따로면 가끔
    if (majors.length && Math.random() < 0.3) return pk(majors);
    let minors = fresh.filter(e => !e.maj);
    if (!minors.length) minors = pool.filter(e => !e.maj && !e.once && !(r.recent || []).includes(e.id)); // 소진 시 재활용
    if (!minors.length) return majors.length ? pk(majors) : null;
    // 장소 가중치: 지금 있는 장소와 맞는 사건 ×4, 장소 무관 ×2, 다른 장소 ×1
    const w = minors.map(e => (loc && e.loc === loc ? 4 : e.loc ? 1 : 2));
    let t = rand(w.reduce((a, b) => a + b, 0));
    for (let i = 0; i < minors.length; i++) { t -= w[i]; if (t <= 0) return minors[i]; }
    return minors[minors.length - 1];
  };

  return { byId, open, forced, choose };
};
