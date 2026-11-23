
(function(root){
'use strict';
const el=id=>document.getElementById(id),R=root.CVIModelRouter,Fit=root.CVIFit;
const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const f=(n,dp=3)=>Number.isFinite(n)?n.toLocaleString('it-IT',{minimumFractionDigits:dp,maximumFractionDigits:dp}):'—';
const state={holdout:new WeakMap(),points:[],chart:null};
const smoothFit=el('qtGlobalSmoothFit'),flexFit=el('qtGlobalFlexFit'),holdFit=el('qtGlobalHoldout');
const choice=el('qtGlobalChoice'),degree=el('qtGlobalDegree'),slice=el('qtGlobalSlice');
function group(){return R.group();}
function reportStatus(msg){const e=el('qtGlobalStatus');if(e)e.textContent=msg;}
function baseIV(c,k){const v=Fit.evaluate(c.canonical,k).w;return v>0?100*Math.sqrt(v/c.T):null;}
function plot(g,rs,rf,ss){
 const svg=el('qtGlobalCompare');if(!svg)return;
 const idx=Number(slice.value)||0,c=g?.curves?.[idx];
 if(!c){svg.innerHTML='';state.chart=null;state.points=[];return;}
 const lo=Math.max(-.09,c.lo),hi=Math.min(.09,c.hi),a=hi>lo?lo:-.02,b=hi>lo?hi:.02;
 const data=[];let mn=Infinity,mx=-Infinity;
 for(let i=0;i<=135;i++){
  const k=a+(b-a)*i/135,record={k,CVI:baseIV(c,k)};
  if(rs?.promotable){const p=rs.model.at(c.T,k,{allowWings:true});record.SMOOTH=p&&Number.isFinite(p.iv)?100*p.iv:null;}
  if(rf?.ok){const p=rf.researchAt?.(c.T,k);record.CFLEX=p&&Number.isFinite(p.iv)?100*p.iv:null;}
  if(ss?.ok){const pval=R.ssvi(ss.parameters.theta[idx],k,ss.parameters.rho,ss.parameters.eta,ss.parameters.gamma);
   record.SSVI=pval>0?100*Math.sqrt(pval/c.T):null;}
  for(const val of Object.values(record))if(Number.isFinite(val)&&val>0&&val<300){mn=Math.min(mn,val);mx=Math.max(mx,val);}
  data.push(record);
 }
 if(!Number.isFinite(mn)){svg.innerHTML='';return;}
 let pad=Math.max(.4,.1*(mx-mn));mn=Math.max(0,mn-pad);mx+=pad;
 const W=970,H=320,L=62,Rx=948,T=31,B=272;
 const X=k=>L+(k-a)/(b-a)*(Rx-L),Y=v=>B-(v-mn)/(mx-mn)*(B-T);
 let html='<rect width="970" height="320" fill="#08192a"/>';
 for(let i=0;i<=5;i++){
  const v=mn+(mx-mn)*i/5,y=Y(v);html+=`<path d="M${L} ${y.toFixed(2)}H${Rx}" stroke="#1d3c59" stroke-width=".8" stroke-opacity=".65"/><text x="${L-10}" y="${(y+4).toFixed(2)}" fill="#75a6e1" font-size="11" text-anchor="end">${f(v,1)}</text>`;
 }
 for(let i=0;i<=8;i++){
  const k=a+(b-a)*i/8,x=X(k);html+=`<path d="M${x.toFixed(2)} ${T}V${B}" stroke="#17324d" stroke-width=".7" stroke-opacity=".65"/><text x="${x.toFixed(2)}" y="${B+17}" fill="#7caae5" font-size="11" text-anchor="middle">${f(k*100,1)}%</text>`;
 }
 if(a<=0&&b>=0)html+=`<path d="M${X(0)} ${T}V${B}" stroke="#5387c1" stroke-width="1.2" stroke-dasharray="3 5"/>`;
 const colors={CVI:'#d9d8ca',SMOOTH:'#7ec4e1',CFLEX:'#89b4ec',SSVI:'#a0c3f4'};
 const names=['CVI','SMOOTH','CFLEX','SSVI'];
 for(const name of names){
  let path='',active=false,lines=0;
  for(const p of data){const v=p[name];if(!(Number.isFinite(v)&&v>=0&&v<=300)){active=false;continue;}
   path+=(active?'L':'M')+X(p.k).toFixed(2)+' '+Y(v).toFixed(2);active=true;lines++;
  }
  if(lines<2)continue;
  const dashed=name==='CFLEX'&&!rf?.promotable;
  html+=`<path d="${path}" fill="none" stroke="${colors[name]}" stroke-width="${name==='CVI'?2.8:2.0}" stroke-linecap="round" ${dashed?'stroke-dasharray="6 5"':''} opacity="${name==='CVI'?'1':'.91'}"/>`;
 }
 const labels=['CVI · base','C² · globale','C-FLEX · '+(rf?.promotable?'rilasciato':'ricerca'),'SSVI · '+(ss?.promotable?'ammesso':'benchmark')];
 let legendX=L;for(let i=0;i<names.length;i++){
  html+=`<path d="M${legendX} 18h15" stroke="${colors[names[i]]}" stroke-width="3" ${i===2&&!rf?.promotable?'stroke-dasharray="4 3"':''}/><text x="${legendX+21}" y="22" fill="#a6c7f5" font-size="11">${escape(labels[i])}</text>`;
  legendX+=[105,113,171,152][i];
 }
 html+='<text x="505" y="316" text-anchor="middle" fill="#7caae5" font-size="11">LOG-MONEYNESS · 100 LN(K/F) · %</text>';
 html+='<g id="qtGlobalCross" pointer-events="none"></g>';
 svg.setAttribute('viewBox','0 0 970 320');svg.innerHTML=html;
 state.chart={a,b,X,Y,W,H,T,B};state.points=data;
}
function render(){
 const g=group(),ss=g?R.peek(g):null,rs=g?R.peekSmooth(g):null,rf=g?R.peekFlexible(g):null;
 const valid=!!g?.marketReady&&g.curves?.length>=2;
 smoothFit.disabled=!valid;flexFit.disabled=!valid;holdFit.disabled=!valid;
 choice.disabled=!valid;degree.disabled=!valid;slice.disabled=!valid;
 if(!valid){
  reportStatus('La calibrazione CVI per almeno due scadenze coeve è necessaria prima di avviare le alternative.');
  el('qtGlobalRelease').textContent='IN ATTESA DI DATI';el('qtGlobalMetrics').innerHTML='<p>Importa le chain della sessione e calibra la superficie CVI.</p>';
  choice.value='CVI';slice.innerHTML='';plot(null,null,null,null);return;
 }
 const prev=slice.value,idx=Math.min(g.curves.length-1,Math.max(0,Number(prev)||0));
 const options=g.curves.map((c,i)=>`<option value="${i}">${escape(c.expiry)} · ${f(c.T*365,2)} giorni</option>`).join('');
 if(slice.innerHTML!==options){slice.innerHTML=options;slice.value=String(idx);}
 choice.options[1].disabled=!rs?.promotable;choice.options[2].disabled=!rf?.promotable;choice.options[3].disabled=!ss?.promotable;
 const selected=R.preference(g);choice.value=selected;
 const smoothText=rs?.promotable?'C² CERTIFICATO':rs?'C² NON RILASCIATO':'C² DA FITTARE';
 const flexText=rf?.promotable?'C-FLEX CERTIFICATO':rf?'C-FLEX SOLO RICERCA':'C-FLEX DA FITTARE';
 el('qtGlobalRelease').textContent='MOTORE '+selected+' · '+smoothText;
 const statusParts=[`VOLS utilizza ${selected}. La singola skew CVI e i livelli IPPO / Wall Street non cambiano.`];
 if(rs)statusParts.push(`Regolarizzazione C²: ${rs.promotable?'RILASCIATA':'NON RILASCIATA'}; ${rs.stats?.within||0}/${rs.stats?.n||0} quote nel bid/ask; larghezza massima ${f(rs.maxHours,3)} ore.`);
 if(rf)statusParts.push(`C-FLEX: ${rf.promotable?'RILASCIATO':'SOLO RICERCA'}; ${rf.stats?.within||0}/${rf.stats?.n||0} quote nel dominio, errore massimo ${f(rf.stats?.worst?.breach,5)} punti.`);
 reportStatus(statusParts.join(' '));
 const metric=(title,items)=>`<h3>${escape(title)}</h3><dl>${items.map(([k,v])=>`<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl>`;
 let html=metric('CVI · BASE CERTIFICATA', [['Tenor',g.curves.length],['Calendar',g.pairs?.length||0],['Riferimento','Skew / livelli invariati']]);
 html+=metric('REGOLARIZZAZIONE C²', [['Stato',rs?rs.status:'Da calibrare'],['Quote nel bid/ask',rs?.stats?`${rs.stats.within}/${rs.stats.n}`:'—'],['Ampiezza al primo tenor',rs?f(rs.minHours,3)+' h':'—'],['Ampiezza ultimo tenor',rs?f(rs.maxHours,3)+' h':'—']]);
 html+=metric('C-FLEX · BERNSTEIN', [['Stato',rf?rf.status:'Da calibrare'],['Controlli',rf?.constraints?rf.constraints.coefficientCount+' coefficienti':'—'],['Quote nel dominio',rf?.quoteCoverage?`${rf.quoteCoverage.included}/${rf.quoteCoverage.total}`:'—'],['Prezzi entro spread',rf?.stats?`${rf.stats.within}/${rf.stats.n}`:'—'],['Massima violazione',rf?.stats?f(rf.stats.worst.breach,5)+' pt':'—'],['Difetto forma',rf?.constraints?f(rf.constraints.globalShape.maximum,9):'—']]);
 const held=state.holdout.get(g);
 if(held)html+=metric('HOLDOUT · STRIKE ESCLUSI', [['Campione',held.holdout?.n||'—'],['Dentro bid/ask',held.holdout?`${held.holdout.within}/${held.holdout.n}`:'—'],['RMSE',held.holdout?f(held.holdout.rmse,5)+' pt':'—']]);
 html+=metric('SSVI · BENCHMARK', [['Stato',ss?ss.status:'Da calibrare'],['Premi fuori spread',ss?.stats?ss.stats.failures:'—']]);
 el('qtGlobalMetrics').innerHTML=html;
 plot(g,rs,rf,ss);
}
function refresh(){render();}
function selectModel(model){
 const g=group();if(!g)return;
 if(!R.select(g,model)){
  reportStatus('Il modello '+model+' non è eleggibile: mancano la certificazione o la verifica completa dei prezzi. Resta il motore precedente.');
  render();return;
 }
 root.VolCube9?.setData?.(R.book());root.CVISSVIUI?.refresh?.();render();
}
choice.onchange=e=>selectModel(e.target.value);
slice.onchange=render;
smoothFit.onclick=()=>{
 const g=group();if(!g)return;smoothFit.disabled=true;reportStatus('Calibrazione temporale C² e verifica integrale dei bid/ask…');
 root.setTimeout(()=>{try{const r=R.analyzeSmooth(g);if(r?.promotable){R.select(g,'SMOOTH');root.VolCube9?.setData?.(R.book());root.CVISSVIUI?.refresh?.();}}catch(e){reportStatus('Errore regolarizzazione: '+e.message);}finally{smoothFit.disabled=false;render();}},20);
};
flexFit.onclick=()=>{
 const g=group();if(!g)return;flexFit.disabled=true;reportStatus('C-FLEX: proiezione globale sui vincoli di prezzo, strike e calendar. La procedura può richiedere più iterazioni…');
 root.setTimeout(()=>{try{R.analyzeFlexible(g,{degree:Number(degree.value),budget:320});}catch(e){reportStatus('Errore C-FLEX: '+e.message);}finally{flexFit.disabled=false;render();}},35);
};
holdFit.onclick=()=>{
 const g=group();if(!g)return;holdFit.disabled=true;reportStatus('C-FLEX HOLDOUT: esclusione dello stesso strike per CALL e PUT, calibrazione sui restanti, verifica su prezzi nascosti…');
 root.setTimeout(()=>{try{const r=R.analyzeFlexible(g,{degree:Number(degree.value),budget:270,holdout:true});state.holdout.set(g,r);}catch(e){reportStatus('Errore holdout: '+e.message);}finally{holdFit.disabled=false;render();}},35);
};
el('qtGlobalCompare').addEventListener('pointermove',e=>{
 const p=state.chart,pts=state.points;if(!p||!pts.length)return;
 const svg=e.currentTarget,box=svg.getBoundingClientRect();if(!box.width)return;
 const xpos=(e.clientX-box.left)/box.width*p.W,k=p.a+clamp((xpos-p.X(p.a))/(p.X(p.b)-p.X(p.a)),0,1)*(p.b-p.a);
 const closest=pts.reduce((a,b)=>Math.abs(a.k-k)<Math.abs(b.k-k)?a:b);
 const x=p.X(closest.k),val=closest.CVI,y=p.Y(val);
 const group=svg.querySelector('#qtGlobalCross');if(!group)return;
 group.innerHTML=`<path d="M${x} ${p.T}V${p.B}" stroke="#e7e0cc" stroke-width="1" stroke-dasharray="4 4"/><circle cx="${x}" cy="${y}" r="4" fill="#e0dccb" stroke="#071525" stroke-width="1"/><rect x="${clamp(x+10,70,750)}" y="38" width="186" height="48" fill="#0c2134" stroke="#305b85"/><text x="${clamp(x+10,70,750)+8}" y="55" fill="#e7e1cc" font-size="11">K/F: ${f(Math.exp(closest.k),4)}</text><text x="${clamp(x+10,70,750)+8}" y="70" fill="#b8e7f8" font-size="11">CVI: ${f(closest.CVI,2)}% · C²: ${f(closest.SMOOTH,2)}%</text>`;
});
el('qtGlobalCompare').addEventListener('pointerleave',()=>{const g=el('qtGlobalCross');if(g)g.innerHTML='';});
const priorSSVI=el('qtSSVIModelSelect');if(priorSSVI)priorSSVI.addEventListener('change',()=>root.setTimeout(refresh,0));
root.CVIUnifiedModelUI=Object.freeze({refresh});
refresh();
})(window);

