let lifeMark=-1,ws,S,me,I={},ROOM,PW,dead=0,busy=0,pend,tab='rp',RQ=[],tmo,A=null,last={rp:0,ooc:0};
const $=i=>document.getElementById(i),send=o=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))};
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

function go(role){const room=$('room').value.trim();if(!room)return;ROOM=room;PW=$('pw').value;me=role;
 ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
 ws.onopen=()=>{send({type:'join',room,role,pw:PW});$('login').hidden=true};
 ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.type==='init'){I=m.d;return}
  if(m.type==='deny'){dead=1;alert(m.t);location.reload();return}
  if(m.type==='kick'){dead=1;alert('다른 곳에서 같은 캐릭터로 접속했어요.');return}
  if(m.type==='recap'){const r=$('recap');r.hidden=false;r.innerHTML='<b>자리를 비운 사이</b><br>'+m.ls.map(esc).join('<br>')+'<br><a href="#" onclick="this.parentNode.hidden=true;return false" style="color:var(--ac)">닫기</a>';return}
  if(m.type==='roll'){RQ.push(...m.rolls);if(!busy)nx();return}
  if(busy){pend=m;return}
  if(m.type==='state'){S=Object.assign(m.s,I);draw()}};
 ws.onclose=()=>{if(!dead)setTimeout(()=>go(role),2000)}}

/* 탭 */
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;draw()});
let openG='';function lf(t){lifeMark=S.log.length?S.log[S.log.length-1].i:0;send({type:t})}
const gate=x=>{const m=x[4];if(!m)return'';if(m.w&&m.w!==me)return null;if(m.c!=null&&S.ch<m.c)return(m.c+1)+'장부터 열려요';if(m.b&&S.bond<m.b)return'유대 '+m.b+' 이상이 되면 열려요';return''};
const tg=k=>{openG=openG===k?'':k;draw()};

/* 능력치 분배 */
function allocDraw(){const st=I.stats;$('ast').innerHTML=st.map(k=>`<div class="ar"><span>${k}</span><button onclick="al('${k}',-1)">−</button><b>${A.v[k]}</b><button onclick="al('${k}',1)">+</button></div>`).join('');$('pl').textContent=A.left;$('aok').disabled=A.left!==0}
function al(k,d){if(d>0&&(A.left<1||A.v[k]>=8))return;if(d<0&&A.v[k]<=2)return;A.v[k]+=d;A.left-=d;allocDraw()}
function allocOk(){send({type:'alloc',st:A.v});send({type:'trait',k:$('tr').value})}

/* 역극/잡담 */
function say(){const t=$('t').value.trim();if(!t)return;send({type:'chat',t,k:$('k').value});$('t').value=''}
function ooc(){const t=$('o').value.trim();if(!t)return;send({type:'chat',t,k:'ooc'});$('o').value=''}
function dia(){const t=$('dti').value.trim();if(t){send({type:'diary',t});$('dti').value=''}}
['t','o','dti'].forEach(i=>$(i).onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)({t:say,o:ooc,dti:dia})[i]()});
const exp=()=>{location.href='/export/'+encodeURIComponent(ROOM)+'?pw='+encodeURIComponent(PW)};

function line(l){const w=l.who?S.names[l.who]:'',mine=l.who===me,t=esc(l.t);
 if(l.k==='say')return`<div class="r ${mine?'me':''}"><small>${w}</small><div class="b">${t}</div></div>`;
 if(l.k==='mind')return`<div class="r ${mine?'me':''}"><small>${w} · 속마음</small><div class="b mind">${t}</div></div>`;
 if(l.k==='act')return`<div class="nar">${w} — ${t}</div>`;
 if(l.k==='roll'||l.k==='ev'){const[a,...b]=t.split('\n');return l.k==='ev'?`<div class="evc"><b>${a}</b>${b.join('\n')}</div>`:`<div class="roll"><b>${a}</b><br>${b.join('\n')}</div>`}
 if(l.k==='ooc')return`<div class="r ${mine?'me':''}"><small>${w}</small><div class="b" style="font-family:inherit;font-size:14px">${t}</div></div>`;
 if(l.k==='note')return`<div class="sys">${w}의 쪽지 · ${t}</div>`;
 return`<div class="${['sys','gm','npc'].includes(l.k)?l.k:'nar'}">${t}</div>`}
function fillLog(id,f){const L=$(id),bot=L.scrollTop+L.clientHeight>=L.scrollHeight-60;L.innerHTML=S.log.filter(f).map(line).join('');if(bot||!L.dataset.i){L.scrollTop=1e9;L.dataset.i=1}}

function draw(){
 const mp=S.p[me];
 if(!mp.set){$('game').hidden=true;$('alloc').hidden=false;if(!A){A={v:Object.fromEntries(I.stats.map(k=>[k,2])),left:14};$('tr').innerHTML=Object.entries(I.traits).map(([k,v])=>`<option value="${k}">${k} (${v}+1)</option>`).join('');allocDraw()}return}
 $('alloc').hidden=true;$('game').hidden=false;
 $('chn').textContent=S.chs[S.ch].name.split(' - ')[0];$('dt').textContent=`${S.month} ${S.day}일 · ${S.pers[S.per]} · ${S.wx}`;
 $('stg').textContent=S.stage+' '+S.bond+'/'+S.cap;$('bond').style.width=S.bond+'%';$('en').textContent='행동력 '+'●'.repeat(Math.max(0,mp.en))+'○'.repeat(Math.max(0,6-mp.en));
 const RPK=l=>l.k!=='ooc'&&l.k!=='note',OK=l=>l.k==='ooc'||l.k==='note',lastI=f=>{const a=S.log.filter(f);return a.length?a[a.length-1].i:-1},cnt={rp:lastI(RPK),ooc:lastI(OK)};
 document.querySelectorAll('nav button').forEach(b=>{const t=b.dataset.t;b.classList.toggle('on',t===tab);$('p-'+t).hidden=t!==tab;if(t===tab&&cnt[t]!=null)last[t]=cnt[t];b.querySelector('i').classList.toggle('d',t!==tab&&cnt[t]!=null&&cnt[t]>last[t])});
 fillLog('rplog',RPK);fillLog('ooclog',OK);
 /* 행동 */
 const e=S.evd,mineEv=e&&(e.who==='b'||e.who===me[0]),sl=S.sl||[];
 $('evbox').innerHTML=e?`<div class="evc"><b>${e.title}</b>${mineEv?e.c.map((c,i)=>`<button class="btn ghost choice" ${c[3]?'disabled':''} onclick="send({type:'pick',i:${i}})">${c[3]?'🔒 ':''}${c[0]}<small>${c[1]} · 난이도 ${c[2]}</small></button>`).join(''):'<small>상대가 선택할 차례예요. 그 사이 장면을 이어가 주세요.</small><button class="btn ghost choice" onclick="send({type:\'dismiss\'})">상대가 자리에 없어요 (넘기기 · 접속 중이면 10분 뒤)</button>'}</div>`:'';
 const waiting=S.pick[me];
 const locs=Object.entries(S.loc).filter(([k,v])=>!v.ch||v.ch.includes(S.ch)),
  grp=[...locs.map(([k,v])=>[k,v.n]),['plan','일과표'+(mp.plan?' · '+mp.plan+' 단련':' (능력치 예약)')]];
 if(!grp.some(g=>g[0]===openG))openG='';
 let pn='';
 if(openG==='plan')pn=`<div class="opn pd"><p class="hint"><b>자는 동안 능력치를 키워 주는 예약</b>이에요. 하나를 골라 두면 하루가 넘어갈 때마다 그 능력치의 경험이 +3 쌓여요. 행동력은 들지 않아요. 경험이 6 차면 능력치가 1 오르고(최대 12), 바꾸기 전까지 매일 적용돼요.</p><p class="hint">${mp.plan?`지금: <b>${mp.plan}</b> 단련 중 (다시 누르면 해제)`:'아직 정하지 않았어요'}</p><div class="pick">${S.stats.map(k=>{const v=mp.st[k],x=(mp.xp&&mp.xp[k])||0;return `<button class="${mp.plan===k?'on':''}" onclick="send({type:'plan',s:'${mp.plan===k?'':k}'})">${k} ${v}<small> ${v>=12?'최대':'경험 '+x+'/6'}</small></button>`}).join('')}</div></div>`;
 else if(openG)pn=`<div class="opn ls">${S.loc[openG].a.map((x,i)=>[x,i,gate(x)]).filter(t=>t[2]!==null).map(([x,i,g])=>`<button ${g?'disabled':''} onclick="send({type:'go',l:'${openG}',i:${i}});openG=''">${g?'🔒 ':''}${x[0]}${x[4]&&x[4].w?` <span class="tg">${S.names[x[4].w]} 전용</span>`:''}${!g&&x[4]&&(x[4].c!=null||x[4].b)?' <span class="tg nw">성장</span>':''}<small>${g||(x[1]==='rest'?'휴식 · 행동력 +'+x[3]:x[1]+' · 난이도 '+x[2]+' · 행동력 '+x[3])}</small></button>`).join('')}</div>`;
 $('jobs').innerHTML=e?'':`<p class="hint">소지금 ${mp.money}원${waiting?' · 선택 완료, 상대를 기다리는 중':''}${S.per>=3?' · 해가 졌어요. 하루를 넘겨 주세요':''}</p><div class="chips">${grp.map(g=>`<button class="chip ${openG===g[0]?'on':''}" onclick="tg('${g[0]}')">${g[1]}</button>`).join('')}</div>${pn||'<p class="hint mid">장소를 눌러 할 일을 골라 보세요</p>'}${waiting?`<button class="btn ghost choice" onclick="send({type:'cancel'})">선택 취소</button>`:''}<button class="btn choice" style="margin-top:14px" onclick="send({type:'sleep'})">${sl.includes(me)?'하루 넘기기 취소':'하루 넘기기'} (${sl.length}/${Object.keys(S.on).length||1})${S.day>S.len?'<small>이 장의 기간이 끝났어요</small>':''}</button>`;

 drawLife(mp,e,waiting);
 /* 기록 */
 $('side').innerHTML=['nagi','junya'].map(r=>`<div class="card ${S.on[r]?'':'off'}"><b>${S.names[r]}</b> <small>${S.p[r].money}원${S.p[r].boost?' · 다음 판정 +'+S.p[r].boost:''}</small>${S.stats.map(k=>`<div class="st"><span>${k}</span><span class="bar"><i style="width:${S.p[r].st[k]/12*100}%"></i></span><em>${S.p[r].st[k]}</em></div>`).join('')}</div>`).join('')+`<small>유대 ${S.bond} · 기억 조각 ${S.mem}</small>`;
 $('dr').innerHTML=S.diary.map((d,i)=>`<div class="mem">${esc(d)} <a href="#" style="color:var(--ac)" onclick="send({type:'reveal',i:${i}});return false">역극에 공개</a></div>`).join('')||'<small>아직 비어 있어요.</small>';
 $('al').innerHTML=S.album.map(x=>`<div class="mem"><small>${x.ch+1}장 ${x.day}일</small><br>${esc(x.t)}</div>`).join('')||'<small>첫 추억을 기다리는 중.</small>';
 $('npc').innerHTML=S.npcs.map(n=>`<div class="mem"><b>${n.n}</b> <small>${n.t}</small></div>`).join('');
 $('vote').textContent=(S.votes.includes(me)?'동의 취소':'다음 장으로')+` (${S.votes.length}/2)`}

/* 주사위 */
const VC={'대성공':'v3','성공':'v2','실패':'v1','대실패':'v0'};
function skip(){clearTimeout(tmo);nx()}
function skipAll(){RQ.length=0;clearTimeout(tmo);nx()}
let rv=null,shownAt=0;
function nx(){clearTimeout(tmo);rv=null;const r=RQ.shift(),D=$('dice');
 if(!r){D.hidden=true;D.classList.remove('rolling');busy=0;if(pend){S=Object.assign(pend.s,I);pend=null;draw()}return}
 busy=1;D.hidden=false;D.classList.add('rolling');$('dres').hidden=true;$('dall').hidden=!RQ.length;const c=$('cube');c.className='';$('dinfo').textContent=(I.names[r.who]||'')+' · '+r.title+' ('+r.stat+')';
 const iv=setInterval(()=>c.textContent=1+Math.floor(Math.random()*20),70);let t1,t2;
 const show=()=>{rv=null;shownAt=Date.now();clearInterval(iv);clearTimeout(t1);clearTimeout(t2);D.classList.remove('rolling');c.className='stop';c.textContent=r.d;
  const x=$('dres');x.hidden=false;x.className=VC[r.res]||'v2';$('dv').textContent=r.res;$('dn').textContent='d20 '+r.d+(r.mod?' + '+r.mod+' = '+(r.d+r.mod):'')+' · '+(r.lab||'난이도 '+r.dc);$('dt2').textContent=r.t;tmo=setTimeout(nx,3500)};
 t1=setTimeout(()=>{clearInterval(iv);c.className='stop';c.textContent=r.d},1200);
 t2=setTimeout(show,1900);rv=show}
/* 굴리는 중에 누르면 바로 결과, 결과가 나온 뒤 누르면 다음으로 */
$('dice').addEventListener('click',e=>{if(e.target.closest('button'))return;
 if(rv)rv();else if(!$('dres').hidden&&Date.now()-shownAt>400)skip()});

/* 골목 살림 (미니게임 탭) */
let fx='',prevInv=null;const CE={'옥수수':'🌽','고구마':'🍠','시금치':'🥬','딸기':'🍓'};
function play(t,ms){if(fx)return;fx=t;drawLife(S.p[me],S.evd,S.pick[me]);setTimeout(()=>{fx='';lf(t)},ms)}
function drawLife(mp,e,waiting){
 if(tab!=='life')lifeMark=-1;
 const iv=S.inv||{fish:0,crop:0,dish:0},pv=prevInv||iv;prevInv={...iv};
 const cr=S.crop,days=cr?S.day-cr:0,rd=cr&&days>=S.cd,en=mp.en,tot=iv.fish*12+iv.crop*8,ce=CE[S.cn]||'🌾',
  nw=lifeMark<0?[]:S.log.filter(l=>l.i>lifeMark&&(l.k==='sys'||l.k==='roll')).slice(-3),
  fr=nw.filter(l=>l.k==='roll'&&l.t.startsWith('낚시 /')).pop(),fm=fr&&fr.t.match(/d20=(\d+)\+(-?\d+)=(\d+) (\S+)\)/),
  bz=e?'사건이 진행 중이라 지금은 할 수 없어요':waiting?'상대의 선택을 기다리는 중이라 할 수 없어요':en<1?'행동력이 없어요. 쉬거나 하루를 넘겨 주세요':'',
  pp=k=>iv[k]!==pv[k]?'pop':'',
  b=(t,l,off)=>`<button class="btn" ${off?'disabled':''} onclick="lf('${t}')">${l}</button>`,
  c=(ic,t,d,x,why)=>`<div class="lc"><div class="ic">${ic}</div><div class="tx"><b>${t}</b><p>${d}</p>${x||''}${why?`<small class="why">${why}</small>`:''}</div></div>`,
  sv=(mp.used&&mp.used.serve)>=1,ck=iv.fish<1||iv.crop<1,fo=!!(bz||fx),
  ok=fm&&fm[4].includes('성공'),
  pond=`<div class="pond ${fx==='fish'?'cast':''} ${fo?'off':''}" ${fo?'':`onclick="play('fish',1300)"`}><span class="bob"></span>${fm&&!fx?`<div class="cat ${ok?'ok':''}">${ok?(+fm[1]===20?'🐟🐟 대어다!':'🐟 건졌다!'):'💦 입질이 없어요'}<small>🎲 ${fm[1]}+${fm[2]}=${fm[3]} / 난이도 12</small></div>`:`<div class="cat"><small>${fx==='fish'?'찌를 지켜보는 중…':bz?'':'물가를 눌러 낚싯대를 던져요'}</small></div>`}</div>`,
  fOk=!bz&&!fx&&(!cr||rd),stg=!cr?'🟫':rd?ce:days*2>=S.cd?'🌿':'🌱',
  field=`<div class="plots ${rd?'rdy':''}">${[0,1,2,3].map(()=>`<button class="pl" ${fOk?`onclick="play('farm',350)"`:'disabled'}>${stg}</button>`).join('')}</div>${cr&&!rd?`<div class="gro"><i style="width:${Math.min(100,days/S.cd*100)}%"></i></div>`:''}<small>${!cr?'흙을 눌러 '+S.cn+' 심기 (행동력 1)':rd?'눌러서 수확하기 (행동력 1)':days+'/'+S.cd+'일 · 하루를 넘기면 자라요'}</small>`,
  pot=`<div class="pot"><span class="sl ${iv.fish<1?'no':''}">🐟</span><i>+</i><span class="sl ${iv.crop<1?'no':''}">${ce}</span><i>→</i><button class="sl dish ${fx==='cook'?'cook':''}" ${e||ck||fx?'disabled':`onclick="play('cook',1000)"`}>🍲</button></div><small>${ck?'':'🍲를 눌러 요리하기'}</small>`;
 $('lifebox').innerHTML=`<p class="hint">재료를 모아 🎣🌱 → 요리를 만들고 🍳 → 나눠 먹거나 팔아요 🍲💰</p>
<div class="bag"><span>🐟 물고기 <b class="${pp('fish')}">${iv.fish}</b></span><span>${ce} 작물 <b class="${pp('crop')}">${iv.crop}</b></span><span>🍲 요리 <b class="${pp('dish')}">${iv.dish}</b></span><span>행동력 <b>${Math.max(0,en)}</b></span><span>${mp.money}원</span></div>
${nw.length?`<div class="fresh"><small>방금 있었던 일</small>${nw.map(line).join('')}</div>`:''}
<h3>1. 재료 모으기</h3>
${c('🎣','낚시','끈기로 판정해요 (난이도 12). 성공하면 물고기 +1, 주사위가 20이면 +2마리! 아주 운이 좋으면 기억 조각도 나와요.',pond,bz)}
${c(rd?'🌾':'🌱','텃밭',!cr?`이번 장의 작물은 ${S.cn}. 심어 두고 ${S.cd}일이 지나면 수확할 수 있어요.`:rd?`${S.cn}이(가) 다 자랐어요! 수확하면 작물 +2.`:`${S.cn}이(가) 자라는 중이에요. 하루를 넘기면 한 칸씩 자라요.`,field,!cr||rd?bz:'')}
<h3>2. 만들기</h3>
${c('🍳','요리',`물고기 1 + 작물 1 → 요리 ${mp.st['재치']>=6?'2개 (재치가 높아서 보너스!)':'1개 (재치 6 이상이면 2개)'}. 행동력은 들지 않아요.`,pot,e?bz:ck?`물고기 ${iv.fish}/1 · 작물 ${iv.crop}/1 — 재료가 모자라요`:'')}
<h3>3. 쓰기</h3>
${c('🍲','요리 대접','요리 1개를 상대에게 건네요. 상대 행동력 +2, 두 사람의 유대 +2. 하루에 한 번만 가능해요.',b('serve','대접하기',iv.dish<1||sv),iv.dish<1?'요리가 필요해요':sv?'오늘은 이미 대접했어요':'')}
${c('💰','내다 팔기','물고기는 12원, 작물은 8원에 가진 걸 전부 팔아요. 요리에 쓸 재료도 같이 팔리니 주의!'+(tot?` (지금 팔면 ${tot}원)`:''),b('sell','전부 팔기',tot<1),tot<1?'팔 물건이 없어요':'')}
<h3>함께하기</h3>
${c('🤝','상대 거들기','상대의 다음 판정에 +2를 줘요. 행동력 1이 들어요.',b('assist','거들어 주기',!!bz),bz)}`}
