/* Quantistes Flow-Conditioned Probability Lab 2.0
   Research-only scenario measure R_flow built by exponential tilting of an explicit
   Q-terminal/Brownian-bridge reference law. Not a calibrated physical P measure.
   All event probabilities are calculated on the same sampled path ensemble.
*/
(function(root){
'use strict';
const el=id=>document.getElementById(id),finite=Number.isFinite;
const fmt=(n,d=2)=>finite(n)?Number(n).toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const pct=(n,d=1)=>finite(n)?fmt(100*n,d)+'%':'—';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','&gt;':'&gt;','"':'&quot;'}[c]||'&#39;'));
const cfg={n:4000,steps:72,gamma:0.8,charm:0.6,bridge:1.0,orientGamma:1,orientCharm:1,seed:20261120};
const state={result:null,signature:'',error:'',ready:false,computing:false,runs:0,selected:null,hover:null,auto:{},lastRaw:'',pending:false};
function flow(){return root.FlowDesk?.scenarioSnapshot?.()||null;}
function current(){const f=flow(),r=f?.result;const q=r?.ws?.model;return f&&q&&typeof q.quantile==='function'&&typeof q.cdf==='function'&&f.spots?.length>1?{f,r,q}:null;}
function show(text,error=false){const box=el('fpStatus');if(box){box.textContent=text;box.style.color=error?'#ede5ce':'#b2e5f7';}}
function hashSeed(s){let x=(Math.floor(Number(s))||20261120)>>>0;return x||1;}
function rng(seed){let state=hashSeed(seed);return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
function randn(u){const a=Math.max(1e-12,u()),b=u();return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b);}
function quantile(a,p){const q=a.filter(finite).slice().sort((x,y)=>x-y);if(!q.length)return NaN;const t=(q.length-1)*clamp(p,0,1),i=Math.floor(t);return q[i]*(1-(t-i))+q[Math.min(q.length-1,i+1)]*(t-i);}
function lin(xs,ys,x){if(!finite(x)||x<xs[0]||x>xs.at(-1))return null;let l=0,h=xs.length-1;while(h-l>1){let m=(l+h)>>1; if(xs[m]<=x)l=m;else h=m;}const u=(x-xs[l])/(xs[h]-xs[l]||1);const a=ys[l],b=ys[h];return finite(a)&&finite(b)?a+(b-a)*u:null;}
function defaults(){const snap=flow(),ref=snap?.reference||snap?.result?.cfg?.settlement||0,levels=snap?.levels||[];
 const ups=levels.filter(x=>x.price>ref&&x.z>0).sort((a,b)=>a.price-b.price),downs=levels.filter(x=>x.price<ref&&x.z<0).sort((a,b)=>b.price-a.price);
 return {ref,target:ups.find(x=>x.z>=.5)?.price||ups[0]?.price||ref*1.006,stop:downs.find(x=>Math.abs(x.z)>=.5)?.price||downs[0]?.price||ref*.994};}
function params(){const n=Number(el('fpN')?.value||4000),steps=Number(el('fpSteps')?.value||72);
 return {n:clamp(n,1000,12000),steps:clamp(steps,24,144),gamma:Number(el('fpGamma')?.value)||0,charm:Number(el('fpCharm')?.value)||0,
 bridge:Number(el('fpBridge')?.value)||1,orientGamma:Number(el('fpGammaSide')?.value)||1,orientCharm:Number(el('fpCharmSide')?.value)||1,
 seed:Number(el('fpSeed')?.value)||20261120,target:+el('fpTarget').value,stop:+el('fpStop').value};}
function normalizeG(v){const a=v.map(x=>Math.abs(x)).filter(finite);return Math.max(1e-12,quantile(a,.9)||1);}
function crossing(x0,x1,H,stepVariance,rngValue){
 if(!finite(x0)||!finite(x1)||!(H>0))return false;
 const a=Math.log(x0/H),b=Math.log(x1/H);
 if(a*b<=0||a===0||b===0)return true;
 if(!(stepVariance>0))return false;
 return rngValue<Math.exp(-2*a*b/stepVariance);
}
function build(){const x=current();if(!x)throw Error('Serve il fitting CVI da all7 e il Sample flow inizializzato. Premi «CARICA DEMO COMPLETA».');
 const {f,r,q}=x,p=params(),ref=+r.cfg?.settlement>0?+r.cfg.settlement:f.reference;
 if(!(p.target>ref&&p.stop>0&&p.stop<ref))throw Error('Per target-before-stop inserisci un target superiore e uno stop inferiore al riferimento SPX.');
 if(!(ref>0&&r.T>0))throw Error('Riferimento o orizzonte opzioni non valido.');
 const interpSpots=f.spots, gamma=f.gamma,charm=f.charm;
 if(interpSpots.length!==gamma.length||charm.length!==gamma.length)throw Error('Griglia gamma/charm incoerente.');
 let gScale=normalizeG(gamma),cScale=normalizeG(charm);
 // Flow-native scenario landmarks. These are geometric features of the provider's
 // scenario response fields, NOT observed strikes or actual executed hedge orders.
 function flowLandmarks(){
   const out=[];
   const base=(f.levels||[]).map(l=>l.price), close=(p)=>base.some(b=>Math.abs(b-p)<.15)||out.some(b=>Math.abs(b.price-p)<.15);
   const push=(name,kind,price,magnitude)=>{if(!finite(price)||price<=0||price<interpSpots[0]||price>interpSpots.at(-1)||close(price))return;out.push({family:kind,name,price,z:null,tail:'DEMO_FLOW_LANDMARK',magnitude});};
   const maxima=(a,k)=>{const indices=[];for(let i=1;i<a.length-1;i++){const v=Math.abs(a[i]);if(v>=Math.abs(a[i-1])&&v>=Math.abs(a[i+1]))indices.push(i);}
     return indices.sort((x,y)=>Math.abs(a[y])-Math.abs(a[x])).slice(0,k);};
   const gammaMax=Math.max(1e-12,...gamma.map(Math.abs)),charmMax=Math.max(1e-12,...charm.map(Math.abs));
   const flip=[];for(let i=1;i<gamma.length;i++){if(gamma[i-1]*gamma[i]<0){const u=-gamma[i-1]/(gamma[i]-gamma[i-1]),price=interpSpots[i-1]+u*(interpSpots[i]-interpSpots[i-1]);flip.push(price);}}
   flip.sort((a,b)=>Math.abs(a-ref)-Math.abs(b-ref));flip.slice(0,3).forEach((price,i)=>push('Γ FLIP '+(i+1),'GAMMA FLIP',price,1));
   maxima(gamma,5).forEach((j,i)=>push('Γ WALL '+(i+1),'GAMMA WALL',interpSpots[j],Math.abs(gamma[j])/gammaMax));
   maxima(charm,4).forEach((j,i)=>push('χ WALL '+(i+1),'CHARM WALL',interpSpots[j],Math.abs(charm[j])/charmMax));
   // Sample MM positioning: source strike coordinates are remapped only for a
   // demonstrative join; individual strike positions are not synchronized to all7.
   const byK=new Map(),positions=f.positions||[];
   for(const r of positions){const strike=+r[2],mm=+r[4];if(!(strike>0&&finite(mm)))continue;byK.set(strike,(byK.get(strike)||0)+Math.abs(mm));}
   const anchorRatio=(f.reference||ref)/(f.sourceAnchor||6070);
   [...byK.entries()].filter(([strike])=>strike*anchorRatio>=interpSpots[0]&&strike*anchorRatio<=interpSpots.at(-1)).sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([strike,size],i)=>push('MM WALL '+(i+1),'MM INVENTORY',strike*anchorRatio,size));
   return out.slice(0,14);
 }
 const native=(f.levels||[]).filter(l=>l.price>0&&Math.abs(l.z)<=4).slice(0,34);
 const targets=[...native,...flowLandmarks()].sort((a,b)=>a.price-b.price);
 const sdSample=[];
 for(let i=1;i<200;i++){const v=q.quantile(i/200);if(v>0&&finite(v))sdSample.push(Math.log(v/ref));}
 if(sdSample.length<100)throw Error('Quantili Q insufficienti per una simulazione terminale.');
 const avg=sdSample.reduce((a,b)=>a+b,0)/sdSample.length;
 const sd=Math.sqrt(sdSample.reduce((a,b)=>a+(b-avg)**2,0)/sdSample.length);
 if(!(sd>1e-8))throw Error('La distribuzione Q non ha dispersione terminale positiva.');
 const gen=rng(p.seed),n=p.n,steps=p.steps,invdt=1/steps;
 const records=[],lcount=targets.length,qClose=Array(lcount).fill(0),qTouch=Array(lcount).fill(0),qFirstTouch=Array(lcount).fill(0);
 const logRef=Math.log(ref),stepVar=p.bridge*p.bridge*sd*sd*invdt;
 const gammaCoverage={hits:0,points:0};
 for(let t=0;t<n;t++){
  const terminal=q.quantile(clamp(gen(),1e-5,1-1e-5));
  if(!finite(terminal)||terminal<=0)continue;
  const Ws=new Float64Array(steps+1),path=new Float64Array(steps+1);path[0]=ref;
  for(let j=1;j<=steps;j++)Ws[j]=Ws[j-1]+randn(gen)*Math.sqrt(invdt);
  const wFinal=Ws[steps],logTerminal=Math.log(terminal);
  for(let j=1;j<=steps;j++){
    let u=j/steps;
    const logp=(1-u)*logRef+u*logTerminal+p.bridge*sd*(Ws[j]-u*wFinal);
    path[j]=Math.exp(logp);
  }
  path[steps]=terminal;
  let gStat=0,cStat=0;
  for(let j=1;j<steps;j++){
    const val=path[j],z=clamp(Math.log(val/ref)/sd,-5,5);
    const gv=lin(interpSpots,gamma,val),cv=lin(interpSpots,charm,val);gammaCoverage.points++;
    if(gv!==null&&cv!==null)gammaCoverage.hits++;
    const gn=gv===null?0:clamp(gv/gScale,-3,3),cn=cv===null?0:clamp(cv/cScale,-3,3);
    gStat-=p.orientGamma*gn*Math.min(12,z*z)/steps;
    cStat+=p.orientCharm*cn*z/steps;
  }
  const logW=clamp(p.gamma*gStat+p.charm*cStat,-11,11);
  const touched=new Uint8Array(lcount),firstAt=new Int16Array(lcount).fill(-1);
  for(let j=1;j<=steps;j++){
    const a=path[j-1],b=path[j];
    for(let z=0;z<lcount;z++)if(!touched[z]){
      const threshold=targets[z].price;
      if(crossing(a,b,threshold,stepVar,gen())){touched[z]=1;firstAt[z]=j;}
    }
  }
  const firstTarget=firstBarrier(path,p.target,stepVar,gen),firstStop=firstBarrier(path,p.stop,stepVar,gen);
  let targetFirst=firstTarget>=0&&(firstStop<0||firstTarget<firstStop),stopFirst=firstStop>=0&&(firstTarget<0||firstStop<firstTarget);
  // Rare ties correspond to both events in a time cell; conservatively leave unclassified.
  let tie=firstTarget>=0&&firstStop>=0&&firstTarget===firstStop;
  if(tie){targetFirst=false;stopFirst=false;}
  const outside=path.some(z=>z<interpSpots[0]||z>interpSpots.at(-1));
  const rec={terminal,logW,touched,firstAt,targetFirst,stopFirst,tie,outside,path};records.push(rec);
 }
 const m=records.length;if(m<500)throw Error('Campioni di path validi insufficienti.');
 const maxLog=Math.max(...records.map(a=>a.logW)),raw=records.map(a=>Math.exp(a.logW-maxLog)),sum=raw.reduce((a,b)=>a+b,0),weights=raw.map(w=>w/sum),ESS=1/weights.reduce((a,w)=>a+w*w,0);
 const qFirst={target:0,stop:0,tie:0,none:0},flowFirst={target:0,stop:0,tie:0,none:0};
 let mean=0,flowMean=0,qBeyond=0,flowBeyond=0,qInside=0,flowInside=0,ws=[];
 for(let i=0;i<m;i++){
  const rec=records[i],w=weights[i],qt=rec.targetFirst?'target':rec.stopFirst?'stop':rec.tie?'tie':'none';
  qFirst[qt]+=1/m;flowFirst[qt]+=w;
  mean+=rec.terminal/m;flowMean+=w*rec.terminal;
  if(rec.terminal>ref){qBeyond+=1/m;flowBeyond+=w;}
  if(!rec.outside){qInside+=1/m;flowInside+=w;}
 }
 const table=targets.map((level,j)=>{
  let qT=0,fT=0,fC=0,qt=0;
  for(let i=0;i<m;i++){
    const rec=records[i],w=weights[i],side=level.price>ref;
    const beyond=side?rec.terminal>level.price:rec.terminal<level.price;
    qT+=rec.touched[j]?1/m:0;
    fT+=rec.touched[j]?w:0;
    qt+=beyond?1/m:0;
    fC+=beyond?w:0;
  }
  // A path event and its terminal event must be evaluated on the SAME ensemble.
  // The separate CVI analytical probability is retained explicitly for pricing
  // and its MC discrepancy is exposed in the event audit.
  const qc=level.price>=ref?q.survival(level.price):q.cdf(level.price);
  return {...level,qClose:qt,qCloseAnalytic:qc,qCloseMCError:qt-qc,qTouch:qT,flowClose:fC,flowTouch:fT,qErr:Math.sqrt(Math.max(1e-8,qT*(1-qT))/m),flowErr:Math.sqrt(Math.max(1e-8,fT*(1-fT))/ESS)};
 });
 const qCDFError=Math.abs(qBeyond-(q.survival? q.survival(ref):1-q.cdf(ref)));
 const conf=ESS/m>=.3?'STANDARD':'LOW_ESS';
 const basePlots=Array.from({length:30},(_,j)=>records[Math.min(m-1,Math.floor((j+.5)*m/30))].path);
 const weightedPlots=[];let running=0,wi=0;
 for(let j=0;j<40;j++){const threshold=(j+.5)/40;while(wi<m-1&&running+weights[wi]<threshold){running+=weights[wi];wi++;}weightedPlots.push(records[wi].path);}
 return {ready:true,params:p,ref,expiry:r.cfg?.expiry||'',asof:r.cfg?.asof||'',T:r.T,sd,levels:table,
 sourceDates:f.sourceDates,flowTime:f.time,n:m,steps,records,weights,ESS,effRatio:ESS/m,qFirst,flowFirst,
 qTerminalMean:mean,flowTerminalMean:flowMean,qUp:qBeyond,flowUp:flowBeyond,
 Q:r.ws.model,plots:weightedPlots,basePlots,sourceCoverage:qInside,weightedCoverage:flowInside,
 qCDFError,gammaScale:gScale,charmScale:cScale,quality:conf,baseQAnalytic:q.survival(ref),bridgeEventMethod:'Discrete steps + within-cell Brownian-bridge crossing approximation; same-step target/stop ambiguous'};
}
function firstBarrier(path,threshold,varStep,gen){for(let j=1;j<path.length;j++){if(crossing(path[j-1],path[j],threshold,varStep,gen()))return j;}return -1;}
function canvasSetup(id,height=270){const c=el(id);if(!c)return null;const box=c.parentNode.getBoundingClientRect(),w=Math.max(260,box.width-12),dpr=Math.min(2,root.devicePixelRatio||1),h=height; c.width=w*dpr;c.height=h*dpr;
 const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#091a2c';ctx.fillRect(0,0,w,h);return {c,ctx,w,h};}
function axes(ctx,w,h,xmin,xmax,ymin,ymax,{xName='SPX',yName='Probabilità / densità'}={}){
 const L=60,R=w-16,T=17,B=h-37,X=x=>L+(x-xmin)/(xmax-xmin)*(R-L),Y=y=>B-(y-ymin)/(ymax-ymin)*(B-T);
 ctx.strokeStyle='#1a3753';ctx.fillStyle='#76a6e1';ctx.font='11px Consolas';ctx.lineWidth=.6;
 for(let i=0;i<=4;i++){const y=ymin+(ymax-ymin)*i/4;ctx.beginPath();ctx.moveTo(L,Y(y));ctx.lineTo(R,Y(y));ctx.stroke();ctx.textAlign='right';ctx.fillText(fmt(y,ymax>1?3:2),L-7,Y(y)+4);}
 for(let i=0;i<=5;i++){const x=xmin+(xmax-xmin)*i/5;ctx.beginPath();ctx.moveTo(X(x),T);ctx.lineTo(X(x),B);ctx.stroke();ctx.textAlign='center';ctx.fillText(fmt(x,xmax>100?0:2),X(x),B+17);}
 ctx.textAlign='right';ctx.fillStyle='#e3decc';ctx.fillText(xName,R,B+32);ctx.textAlign='left';ctx.fillText(yName,L,T-4);
 return {X,Y,L,R,T,B};}
function densityAndCDF(result){const r=result, q=r.Q, rec=r.records,ws=r.weights,n=rec.length,anchor=r.ref;
 const lo=q.quantile(.004),hi=q.quantile(.996),N=75,w=(hi-lo)/N,hQ=Array(N).fill(0),hF=Array(N).fill(0);
 for(let i=0;i<n;i++){const K=rec[i].terminal,idx=Math.floor((K-lo)/w);if(idx>=0&&idx<N){hQ[idx]+=1/n;hF[idx]+=ws[i];}}
 const x=Array.from({length:N},(_,j)=>lo+(j+.5)*w),qD=hQ.map(v=>v/w),fD=hF.map(v=>v/w);
 return {lo,hi,x,qD,fD,width:w};}
function paintDensity(r){if(el('fpDensity')?.offsetWidth)root.DeskStudio.flowPlot('fpDensity',r,densityAndCDF(r));}
function paintCDF(r){root.DeskStudio.flowPlot('fpCDF',r);}
function paintPaths(r){root.DeskStudio.flowPlot('fpPaths',r);}
function tableLevels(r){const table=el('fpLevels');if(!table)return;const basis=flow()?.basis||0;if(table.__v6Result===r&&table.__v6Basis===basis&&table.querySelector('tbody'))return;table.__v6Result=r;table.__v6Basis=basis;
 table.innerHTML=`<table class="flow-table"><thead><tr><th>FAMIGLIA / LIVELLO</th><th>SPX</th><th>Q CLOSE MC</th><th>Q TOUCH PATH</th><th>R_FLOW CLOSE</th><th>R_FLOW TOUCH</th><th>DIFF. TOUCH</th><th>ES* + BASIS</th></tr></thead><tbody>${r.levels.map((l,i)=>`<tr data-picklevel="${i}" tabindex="0"><td>${ESC(l.family)} · ${l.z==null?ESC(l.name||'flow'):fmt(l.z,1)+'σ'}</td><td>${fmt(l.price,2)}</td><td>${pct(l.qClose)}</td><td>${pct(l.qTouch)} ±${pct(1.96*l.qErr,1)}</td><td>${pct(l.flowClose)}</td><td>${pct(l.flowTouch)} ±${pct(1.96*l.flowErr,1)}</td><td>${fmt(100*(l.flowTouch-l.qTouch),1)} pp</td><td>${fmt(l.price+(flow()?.basis||0),2)}</td></tr>`).join('')}</tbody></table>`;
 table.querySelectorAll('[data-picklevel]').forEach(row=>{
 const pick=()=>{const i=+row.dataset.picklevel,l=r.levels[i];if(!l)return;const field=l.price>r.ref?'fpTarget':'fpStop';el(field).value=l.price.toFixed(2);show('Livello '+fmt(l.price,2)+' inserito come '+(field==='fpTarget'?'TARGET':'STOP')+'. Premi RICALCOLA per aggiornare paths e probabilità.');};
 row.onclick=pick;row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}};
 });
}
function metrics(r){
 const put=(id,v)=>{if(el(id))el(id).textContent=v;};
 put('fpQup',pct(r.baseQAnalytic));put('fpRup',pct(r.flowUp));
 put('fpTouch',pct(r.flowFirst.target));put('fpESS',`${fmt(r.ESS,0)} / ${fmt(r.n,0)}`);
 put('fpQTarget',pct(r.qFirst.target));put('fpRTarget',pct(r.flowFirst.target));
 put('fpQStop',pct(r.qFirst.stop));put('fpRStop',pct(r.flowFirst.stop));
 put('fpQNoTouch',pct(r.qFirst.none));put('fpRNoTouch',pct(r.flowFirst.none));
 put('fpAudit',`Q terminal: media MC ${fmt(r.qTerminalMean,2)} · media modello ${fmt(r.Q.F,2)} · errore MC di P(up) ${pct(r.qCDFError,2)} · ESS ${pct(r.effRatio)} · dominio gamma/charm: ${pct(r.weightedCoverage)} della massa ponderata. Primo tocco corretto al livello dei singoli intervalli mediante formula Brownian bridge; collisioni target/stop nello stesso passo non risolte. Ties di primo passaggio: Q ${pct(r.qFirst.tie)}, R_flow ${pct(r.flowFirst.tie)}. ${r.quality==='LOW_ESS'?'Attenzione: ESS basso, pesi instabili.':''}`);
 const status=r.effRatio<.25?'DEGRADED / ESS BASSO':'SCENARIO COERENTE · NON CALIBRATO';put('fpMeasureStatus',status);
 const note=el('fpScenarioNote');if(note)note.textContent=`R_flow è una ponderazione esponenziale dei paths Q-bridge: exp(βΓ·scoreΓ + βχ·scoreχ), normalizzata sull’ensemble. Usa le curve gamma/charm Sample rimappate con unità ignote e convenzioni di segno scelte dall’utente. È uno scenario di sensibilità, NON la misura fisica P, non preserva necessariamente i prezzi delle opzioni e non autorizza trading. Il Q terminale resta ottenuto dalla skew CVI. ${r.n} paths · ${r.steps} passi · seed ${r.params.seed}.`;
}
function render(){if(!state.result)return;metrics(state.result);tableLevels(state.result);paintDensity(state.result);paintCDF(state.result);paintPaths(state.result);}
function controls(){for(const id of ['fpGamma','fpCharm','fpBridge']){
 const node=el(id);if(node)node.addEventListener('input',()=>{const out=el(id+'Value');if(out)out.textContent=fmt(+node.value,2);});
 }
 if(el('fpRun'))el('fpRun').onclick=run;
 if(el('fpDownload'))el('fpDownload').onclick=exportJSON;
 if(el('fpZero'))el('fpZero').onclick=()=>{el('fpGamma').value='0';el('fpCharm').value='0';el('fpGammaValue').textContent='0,00';el('fpCharmValue').textContent='0,00';run();};
}
function exportJSON(){const r=state.result;if(!r)return;
 const payload={schema:'quantistes.flow.bridge.scenario.v2',status:'DIAGNOSTIC_ONLY',QTerminal:'CVI',physicalProbabilityP:null,
 sourceDates:r.sourceDates,flowTime:r.flowTime,asof:r.asof,expiry:r.expiry,reference:r.ref,params:r.params,
 bridges:{n:r.n,steps:r.steps,sdLog:r.sd,method:r.bridgeEventMethod,weighting:'exponential flow scenario density, not P'},
 diagnostics:{ESS:r.ESS,effRatio:r.effRatio,qCDFError:r.qCDFError,sourceDomain:r.weightedCoverage},
 targetBeforeStop:{Q:r.qFirst,R_flow:r.flowFirst},levelEvents:r.levels.map(x=>({family:x.family,z:x.z,price:x.price,qClose:x.qClose,qTouch:x.qTouch,flowClose:x.flowClose,flowTouch:x.flowTouch,mcErrorQ:x.qErr,mcErrorFlow:x.flowErr})),
 economicUsage:'Scenario di hedge. Il peso non è una probabilità fisica ES calibrata.'};
 const u=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='Quantistes_Flow_Path_Probabilities_SCENARIO.json';a.click();root.setTimeout(()=>URL.revokeObjectURL(u),2000);
}
function updateDefaults(){const a=defaults();if(a.ref>0&&!state.initialized){el('fpTarget').value=fmtNum(a.target);el('fpStop').value=fmtNum(a.stop);state.initialized=true;}}
function fmtNum(x){return finite(x)?x.toFixed(2):'';}
function run(){if(state.computing)return;
 const v=current();if(!v){show('Per avviare il calcolo occorrono il Sample gamma/charm e la skew CVI ottenuta da all7.',true);return;}
 updateDefaults();state.computing=true;state.error='';el('fpRun').disabled=true;show('Generazione delle traiettorie, pesatura gamma/charm e probabilità di primo tocco…');
 root.setTimeout(()=>{
  try{const result=build();state.result=result;state.signature=signature();state.runs++;render();show('Calcolo completato. Q terminale verificata e scenario R_flow sulla stessa legge di paths; P storica NON calibrata.');}
  catch(error){state.error=String(error?.message||error);show(state.error,true);}
  finally{state.computing=false;el('fpRun').disabled=false;}
 },30);
}
function refresh(){if(!current())return;updateDefaults();if(state.result)render();else if(!state.computing && !state.autoDone){state.autoDone=true;run();}}
function signature(){const f=flow();return f?`${f.time}|${f.reference}|${f.basis}|${f.result?.cfg?.asof}|${f.result?.cfg?.expiry}`:'';}
function init(){controls();const row=el('fpMethods');if(row)row.innerHTML=`<p><strong>Il modello della demo.</strong> Calibriamo il terminale <em>Q</em> dalla distribuzione CVI già verificata su all7 e campioniamo <em>S(T)</em> per inversione della CDF. Completiamo ogni terminale con un Brownian bridge logaritmico condizionato: questa è una <strong>ipotesi di dinamica</strong>, perché una distribuzione terminale non determina i percorsi intraday. Il parametro “ampiezza bridge” controlla quanto i paths possono deviare fra origine e fixing.</p><p><strong>Ponderazione flow.</strong> Per ogni path misuriamo occupazione e ampiezza delle escursioni rispetto ai due campi gamma/charm del sample. Trasformiamo i punteggi in pesi <code>R_flow ∝ Q_paths × exp(βΓ·scoreΓ + βχ·scoreχ)</code>. I valori sono standardizzati sul 90° percentile dei campi, con direzione regolabile. Non è una procedura per ottenere P dal mercato.</p><p><strong>Livelli e probabilità.</strong> Q(close beyond) deriva dalla CDF esatta del CVI. Q(touch), R_flow(touch), R_flow(close beyond), target-before-stop e stop-before-target sono tutti misurati sul <strong>medesimo ensemble</strong>. La correzione per crossing sub-step usa la probabilità di attraversamento di un Brownian bridge condizionato agli estremi; simultanei target/stop in una cella restano ambigui e sono registrati.</p><p><strong>Scoreboard ES.</strong> I livelli e gli scenari hanno data e fonte proprie. La preferenza direzionale usa le sedute ES precedenti all’origine selezionata.</p>`;
 const onTab=()=>{if(el('view-flows')?.classList.contains('active')&&el('flow-panel-paths')?.classList.contains('active'))refresh();
 };
 const original=flow();if(original){state.initialized=false;}
 root.setInterval(()=>{const s=signature();if(s&&s!==state.signature){state.signature=s;state.autoDone=false;state.initialized=false;state.result=null;}onTab();},1700);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
root.FlowProbability=Object.freeze({refresh,run,stats:()=>state.result?{paths:state.result.n,ESS:state.result.ESS,levels:state.result.levels.length,qUp:state.result.qUp,flowUp:state.result.flowUp,physicalP:false}:null,get:()=>state.result});
})(window);
