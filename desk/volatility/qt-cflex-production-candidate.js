
(function(root){
'use strict';
const el=id=>document.getElementById(id), R=root.CVIModelRouter, Fit=root.CVIFit;
if(!R||!Fit) return;
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=(n,d=3)=>Number.isFinite(n)?n.toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const state={holdout:new WeakMap(),bound:false};
function group(){return R.group&&R.group();}
function baseIV(c,k){const v=Fit.evaluate(c.canonical,k).w;return v>0?100*Math.sqrt(v/c.T):null;}
function ensureUI(){
  const controls=document.querySelector('#qtUnifiedGlobalPanel .qt-global-controls');
  if(controls && !el('qtGlobalValidate')){
    const btn=document.createElement('button');
    btn.id='qtGlobalValidate'; btn.type='button'; btn.textContent='03 · VALIDA MARK + TEST STRIKE';
    btn.dataset.qcode='VOLS-GLOBALVALIDATE'; btn.dataset.qname='Verifica C-FLEX';
    btn.dataset.qtype='Azione'; btn.dataset.qview='volcube';
    controls.appendChild(btn);
  }
  const grid=document.querySelector('#qtUnifiedGlobalPanel .qt-global-grid');
  if(grid && !el('qtCFlexGate')){
    const panel=document.createElement('section');
    panel.id='qtCFlexGate'; panel.className='qt-cflex-gate';
    panel.innerHTML='<h3>C-FLEX · DOMINIO E CONTROLLI DI PREZZO</h3><div class="qt-cflex-badges" id="qtCFlexBadges"></div><div class="qt-cflex-grid" id="qtCFlexGrid"></div><div class="qt-cflex-notes" id="qtCFlexNotes"></div><div class="qt-cflex-actions" id="qtCFlexActions"></div>';
    grid.insertAdjacentElement('afterend', panel);
  }
  const choice=el('qtGlobalChoice'); if(choice){ choice.innerHTML='<option value="CFLEX">C-FLEX · Bernstein globale</option>'; choice.value='CFLEX'; choice.disabled=true; }
  const smooth=el('qtGlobalSmoothFit'); if(smooth) smooth.hidden=true;
  const release=el('qtGlobalRelease'); if(release) release.textContent='C-FLEX SURFACE · CONTROLLI DEL MARK';
}
function renderPlot(){
  const svg=el('qtGlobalCompare'), g=group(), rf=g?R.peekFlexible(g):null, slice=el('qtGlobalSlice');
  if(!svg||!g||!g.curves?.length){ if(svg) svg.innerHTML=''; return; }
  const idx=Math.max(0,Math.min(g.curves.length-1,Number(slice?.value)||0)), c=g.curves[idx];
  const lo=Math.max(-.09,c.lo), hi=Math.min(.09,c.hi), a=hi>lo?lo:-.02, b=hi>lo?hi:.02;
  const data=[]; let mn=1e9,mx=-1e9;
  for(let i=0;i<=160;i++){
    const k=a+(b-a)*i/160;
    const rec={k,cvi:baseIV(c,k),cflex:null};
    if(rf?.ok){ const p=rf.promotable && rf.model?.at ? rf.model.at(c.T,k,{allowWings:true}) : rf.researchAt?.(c.T,k); rec.cflex=p&&Number.isFinite(p.iv)?100*p.iv:null; }
    [rec.cvi,rec.cflex].forEach(v=>{ if(Number.isFinite(v)&&v>0&&v<300){ mn=Math.min(mn,v); mx=Math.max(mx,v);} });
    data.push(rec);
  }
  if(!Number.isFinite(mn)){ svg.innerHTML=''; return; }
  const pad=Math.max(.6,.11*(mx-mn)); mn=Math.max(0,mn-pad); mx+=pad;
  const W=970,H=320,L=62,RX=948,T=31,B=272;
  const X=k=>L+(k-a)/(b-a)*(RX-L), Y=v=>B-(v-mn)/(mx-mn)*(B-T);
  let html='<rect width="970" height="320" fill="#08192a"/>';
  for(let i=0;i<=5;i++){ const v=mn+(mx-mn)*i/5, y=Y(v); html+=`<path d="M${L} ${y.toFixed(2)}H${RX}" stroke="#1d3c59" stroke-width=".8" stroke-opacity=".65"/><text x="${L-10}" y="${(y+4).toFixed(2)}" fill="#75a6e1" font-size="11" text-anchor="end">${fmt(v,1)}</text>`; }
  for(let i=0;i<=8;i++){ const k=a+(b-a)*i/8, x=X(k); html+=`<path d="M${x.toFixed(2)} ${T}V${B}" stroke="#17324d" stroke-width=".7" stroke-opacity=".65"/><text x="${x.toFixed(2)}" y="${B+17}" fill="#7caae5" font-size="11" text-anchor="middle">${fmt(k*100,1)}%</text>`; }
  if(a<=0&&b>=0) html+=`<path d="M${X(0)} ${T}V${B}" stroke="#5387c1" stroke-width="1.2" stroke-dasharray="3 5"/>`;
  const series=[['cvi','#d9d8ca',2.4,''],['cflex','#93bbf1',2.6,rf?.promotable?'':'stroke-dasharray="6 4"']];
  for(const [name,col,w,extra] of series){
    let path='',on=false,n=0; for(const p of data){ const v=p[name]; if(!(Number.isFinite(v)&&v>=0&&v<=300)){ on=false; continue; } path+=(on?'L':'M')+X(p.k).toFixed(2)+' '+Y(v).toFixed(2); on=true; n++; }
    if(n>1) html+=`<path d="${path}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" ${extra} />`;
  }
  html += `<path d="M${L} 18h15" stroke="#93bbf1" stroke-width="3"/><text x="${L+21}" y="22" fill="#a6c7f5" font-size="11">C-FLEX · ${esc(rf?.promotable?'rilasciato':'ricerca')}</text>`;
  html += `<path d="M${L+180} 18h15" stroke="#d9d8ca" stroke-width="3"/><text x="${L+201}" y="22" fill="#a6c7f5" font-size="11">CVI · riferimento singole skew</text>`;
  html += '<text x="505" y="316" text-anchor="middle" fill="#7caae5" font-size="11">LOG-MONEYNESS · 100 LN(K/F) · %</text><g id="qtGlobalCross" pointer-events="none"></g>';
  svg.setAttribute('viewBox','0 0 970 320'); svg.innerHTML=html;
  svg.onpointermove=(e)=>{
    const box=svg.getBoundingClientRect(); if(!box.width) return;
    const xpos=(e.clientX-box.left)/box.width*W; const k=a+clamp((xpos-X(a))/(X(b)-X(a)),0,1)*(b-a);
    const closest=data.reduce((u,v)=>Math.abs(u.k-k)<Math.abs(v.k-k)?u:v); const x=X(closest.k), yc=Y(closest.cvi||mn), yf=Y(closest.cflex||closest.cvi||mn);
    const left=clamp(x+10,70,742); const gCross=svg.querySelector('#qtGlobalCross'); if(!gCross) return;
    gCross.innerHTML=`<path d="M${x} ${T}V${B}" stroke="#e7e0cc" stroke-width="1" stroke-dasharray="4 4"/><circle cx="${x}" cy="${yf}" r="4" fill="#93bbf1" stroke="#071525" stroke-width="1"/><circle cx="${x}" cy="${yc}" r="3.5" fill="#d9d8ca" stroke="#071525" stroke-width="1"/><rect x="${left}" y="38" width="198" height="62" fill="#0c2134" stroke="#305b85"/><text x="${left+8}" y="55" fill="#e7e1cc" font-size="11">K/F: ${fmt(Math.exp(closest.k),4)}</text><text x="${left+8}" y="71" fill="#b8e7f8" font-size="11">C-FLEX: ${fmt(closest.cflex,2)}% · CVI: ${fmt(closest.cvi,2)}%</text><text x="${left+8}" y="87" fill="#88b3eb" font-size="11">Scadenza: ${esc(c.expiry||'—')}</text>`;
  };
  svg.onpointerleave=()=>{ const x=svg.querySelector('#qtGlobalCross'); if(x) x.innerHTML=''; };
}
function strikeTest(hold){const h=hold?.holdout;return !!h&&h.n>0&&h.n===h.expected&&h.failures===0&&hold.constraints?.globalShape?.notMet===0;}
function gateLabel(rf,hold){
  if(!rf?.ok) return ['NON DISPONIBILE','bad'];
  const hp=strikeTest(hold);
  if(rf.promotable && hp) return ['MARK + TEST STRIKE','good'];
  if(rf.promotable) return ['MARK VALIDO · TEST STRIKE IN ATTESA','warn'];
  return ['RESEARCH ONLY','warn'];
}
function renderGate(){
  ensureUI();
  const g=group(), rf=g?R.peekFlexible(g):null, hold=g?state.holdout.get(g):null;
  const badges=el('qtCFlexBadges'), grid=el('qtCFlexGrid'), notes=el('qtCFlexNotes'), actions=el('qtCFlexActions');
  if(!badges||!grid||!notes||!actions) return;
  if(!g){ badges.innerHTML=''; grid.innerHTML=''; notes.innerHTML='Carica almeno due scadenze e calibra prima la base CVI, poi C-FLEX.'; actions.innerHTML=''; return; }
  const [label,cls]=gateLabel(rf,hold);
  const quoteRate=rf?.quoteCoverage?.rate!=null ? 100*rf.quoteCoverage.rate : null;
  const maxBreach=rf?.stats?.worst?.breach;
  const holdRmse=hold?.holdout?.rmse, holdFail=hold?.holdout?.failures;
  const withinAll=rf?.stats ? `${rf.stats.within}/${rf.stats.n}` : '—';
  const heldText=hold?.holdout ? `${hold.holdout.within}/${hold.holdout.n}` : '—';
  badges.innerHTML=`<span class="qt-cflex-badge ${cls}">${label}</span>`+
    `<span class="qt-cflex-badge ${rf?.promotable?'good':'warn'}">Market box: ${rf?.promotable?'pass':'non certificato'}</span>`+
    `<span class="qt-cflex-badge ${strikeTest(hold)?'good':'warn'}">Holdout: ${hold?.holdout?(strikeTest(hold)?'pass':'da rivedere'):'non eseguito'}</span>`+
    `<span class="qt-cflex-badge ${Number.isFinite(rf?.constraints?.globalShape?.maximum)&&rf.constraints.globalShape.maximum<=1e-10?'good':'bad'}">Forma globale: ${fmt(rf?.constraints?.globalShape?.maximum,9)}</span>`;
  const card=(k,v,s)=>`<div class="qt-cflex-card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`;
  grid.innerHTML=
    card('Quote nel dominio', rf?.quoteCoverage?`${rf.quoteCoverage.included}/${rf.quoteCoverage.total}`:'—', `Copertura comune bilaterale · ${fmt(quoteRate,1)}% del book totale`) +
    card('Prezzi entro spread', withinAll, `Violazione massima ${fmt(maxBreach,5)} punti indice`) +
    card('Strike esclusi', heldText, `RMSE ${fmt(holdRmse,5)} punti · fallimenti ${holdFail ?? '—'}`) +
    card('Coefficienti', rf?.constraints?.coefficientCount ?? '—', `Grado strike ${rf?.degree ?? '—'} · gate temporale ${g.curves?.length ?? '—'} scadenze`);
  notes.innerHTML = rf?.ok ?
    `Il mark richiede call convesse e decrescenti, coerenza fra scadenze e prezzi nei bid/ask. Il test aggiuntivo misura gli scarti sugli strike esclusi dalla calibrazione, a forward e sconti fissati.` :
    'C-FLEX non è ancora disponibile: la base CVI multiscadenza va calibrata prima del motore globale Bernstein.';
  actions.innerHTML = `<button type="button" id="qtCFlexValidateBtn">ESEGUI VERIFICA MARK E STRIKE</button><button type="button" id="qtCFlexRefreshBtn" class="secondary">AGGIORNA DIAGNOSTICA</button>`;
  el('qtCFlexValidateBtn').onclick=runValidation;
  el('qtCFlexRefreshBtn').onclick=refreshAll;
}
function renderMetricsAndStatus(){
  const g=group(), rf=g?R.peekFlexible(g):null, hold=g?state.holdout.get(g):null;
  const status=el('qtGlobalStatus'), metrics=el('qtGlobalMetrics'), release=el('qtGlobalRelease');
  const [label]=gateLabel(rf,hold);
  if(release) release.textContent='C-FLEX SURFACE · '+label;
  if(status){
    if(!g) status.textContent='Importa le chain e calibra la base CVI. Poi lancia C-FLEX e infine la validazione aggressiva per capire se la superficie è solo research o production candidate.';
    else if(!rf) status.textContent='Base CVI pronta. Lancia “CALIBRA C-FLEX” per costruire la superficie globale Bernstein e usarla nel grafico VOLS.';
    else status.textContent=`Superficie VOLS centrata su C-FLEX. Stato corrente: ${label}. Prezzi nel dominio ${rf.stats?.within||0}/${rf.stats?.n||0}; violazione massima ${fmt(rf.stats?.worst?.breach,5)} punti; holdout ${hold?.holdout?`${hold.holdout.within}/${hold.holdout.n}`:'non eseguito'}.`;
  }
  if(metrics){
    let html='';
    const dl=(title,items)=>`<h3>${esc(title)}</h3><dl>${items.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    html += dl('CVI · BASE', [['Tenor', g?.curves?.length ?? '—'], ['Uso', 'Skew singola / livelli IPPO invariati'], ['Ruolo', 'Ancora interna del fitting globale']]);
    html += dl('C-FLEX · GLOBALE', [['Stato', rf?.status ?? 'Da calibrare'], ['Quote dominio', rf?.quoteCoverage?`${rf.quoteCoverage.included}/${rf.quoteCoverage.total}`:'—'], ['Prezzi entro spread', rf?.stats?`${rf.stats.within}/${rf.stats.n}`:'—'], ['Violazione max', rf?.stats?fmt(rf.stats.worst.breach,5)+' pt':'—'], ['Difetto forma', rf?.constraints?fmt(rf.constraints.globalShape.maximum,9):'—']]);
    html += dl('VALIDAZIONE', [['Gate', label], ['Holdout', hold?.holdout?`${hold.holdout.within}/${hold.holdout.n}`:'Non eseguito'], ['RMSE holdout', hold?.holdout?fmt(hold.holdout.rmse,5)+' pt':'—'], ['Motore VOLS', 'C-FLEX']]);
    metrics.innerHTML=html;
  }
}
function refreshAll(){ renderMetricsAndStatus(); renderGate(); renderPlot(); }
function runValidation(){
  const g=group(), degree=Number(el('qtGlobalDegree')?.value)||14, fitBtn=el('qtGlobalValidate');
  if(!g) return;
  if(fitBtn) fitBtn.disabled=true;
  const status=el('qtGlobalStatus'); if(status) status.textContent='Verifica C-FLEX in corso: refit principale + holdout degli strike esclusi…';
  root.setTimeout(()=>{
    try{
      const main=R.analyzeFlexible(g,{degree,budget:340});
      const held=R.analyzeFlexible(g,{degree,budget:320,holdout:true});
      state.holdout.set(g,held);
      if(main?.promotable) R.select(g,'CFLEX');
      root.VolCube9?.setData?.(R.book());
    } catch(e){ if(status) status.textContent='Errore validazione C-FLEX: '+(e?.message||e); }
    finally{ if(fitBtn) fitBtn.disabled=false; root.setTimeout(refreshAll,30); }
  },25);
}
function bind(){
  if(state.bound) return; state.bound=true;
  document.addEventListener('click', ev=>{
    const id=ev.target && ev.target.id;
    if(id==='qtGlobalFlexFit' || id==='qtGlobalHoldout' || id==='qtGlobalSlice' || id==='qtGlobalDegree') root.setTimeout(refreshAll,80);
  });
  ['qtGlobalFlexFit','qtGlobalHoldout','qtGlobalSlice','qtGlobalDegree'].forEach(id=>{
    const node=el(id); if(node) node.addEventListener(id==='qtGlobalSlice'||id==='qtGlobalDegree'?'change':'click',()=>root.setTimeout(refreshAll,120));
  });
  const validate=()=>{ const b=el('qtGlobalValidate'); if(b) b.onclick=runValidation; };
  root.setInterval(()=>{ ensureUI(); validate(); refreshAll(); },1200);
}
function init(){ ensureUI(); bind(); refreshAll(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
