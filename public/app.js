let ws,S,me,I={},ROOM,PW,dead=0,busy=0,pend,tab='rp',RQ=[],tmo,A=null,last={rp:0,ooc:0};
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
 $('jobs').innerHTML=e?'':`<p class="hint">소지금 ${mp.money}원${waiting?' · 선택 완료, 상대를 기다리는 중':''}${S.per>=3?' · 해가 졌어요. 하루를 넘겨 주세요':''}</p>`+Object.entries(S.loc).filter(([k])=>(S.av||{})[k]).map(([k,v])=>`<div class="loc"><b>${v.n}</b>${v.a.map((x,i)=>{const st=S.av[k][i];if(!st)return'';const ok=st===1;return`<button ${ok?'':'disabled'} onclick="send({type:'go',l:'${k}',i:${i}})">${ok?'':'🔒 '}${x[0]}<small> ${ok?(x[1]==='rest'?'· 휴식':'· '+x[1]+' '+x[2]+' · 행동력 '+x[3]):'· '+st}</small></button>`}).join('')}</div>`).join('')+(waiting?'<button class="btn ghost choice" onclick="send({type:\'cancel\'})">선택 취소</button>':'')+`<button class="btn choice" style="margin-top:14px" onclick="send({type:'sleep'})">${sl.includes(me)?'하루 넘기기 취소':'하루 넘기기'} (${sl.length}/${Object.keys(S.on).length||1})${S.day>S.len?'<small>이 장의 기간이 끝났어요</small>':''}</button>`;
const iv=S.inv||{fish:0,crop:0,dish:0},cr=S.crop,rd=cr&&S.day-cr>=S.cd;
 $('life').innerHTML=e?'':`<h3>골목 살림</h3><p class="hint">물고기 ${iv.fish} · 채소 ${iv.crop} · 요리 ${iv.dish}</p><div class="grid2"><button class="btn ghost" onclick="send({type:'fish'})">낚시<small>행동력 1</small></button><button class="btn ghost" onclick="send({type:'farm'})">${!cr?'텃밭에 '+S.cn+' 심기':rd?S.cn+' 수확하기':S.cn+' 자라는 중 ('+(S.day-cr)+'/'+S.cd+'일)'}<small>행동력 1</small></button><button class="btn ghost" onclick="send({type:'cook'})">요리<small>물고기+채소</small></button><button class="btn ghost" onclick="send({type:'serve'})">요리 대접<small>유대 +2</small></button><button class="btn ghost" onclick="send({type:'sell'})">내다 팔기<small>물고기 12원 · 작물 8원</small></button><button class="btn ghost" onclick="send({type:'assist'})">상대 거들기<small>행동력 1 · 상대 판정 +2</small></button></div><h3>일과표 (하루가 넘어가면 반영)</h3><select onchange="send({type:'plan',s:this.value})"><option value="">정하지 않음</option>${S.stats.map(k=>`<option ${mp.plan===k?'selected':''}>${k}</option>`).join('')}</select>`;
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
function nx(){clearTimeout(tmo);const r=RQ.shift();
 if(!r){$('dice').hidden=true;busy=0;if(pend){S=Object.assign(pend.s,I);pend=null;draw()}return}
 busy=1;$('dice').hidden=false;$('dres').hidden=true;const c=$('cube');c.className='';$('dinfo').textContent=(I.names[r.who]||'')+' · '+r.title+' ('+r.stat+')';
 const iv=setInterval(()=>c.textContent=1+Math.floor(Math.random()*20),70);
 setTimeout(()=>{clearInterval(iv);c.className='stop';c.textContent=r.d},1200);
 setTimeout(()=>{const x=$('dres');x.hidden=false;x.className=VC[r.res]||'v2';$('dv').textContent=r.res;$('dn').textContent='d20 '+r.d+(r.mod?' + '+r.mod+' = '+(r.d+r.mod):'')+' · '+(r.lab||'난이도 '+r.dc);$('dt2').textContent=r.t;tmo=setTimeout(nx,3500)},1900)}
