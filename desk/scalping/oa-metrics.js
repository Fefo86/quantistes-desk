
(function(w){
'use strict';
const finite=Number.isFinite,M=60000,L=60;
const fmt=new Intl.NumberFormat('it-IT',{maximumFractionDigits:2});
const stampNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const signed=v=>finite(v)?(v>0?'+':'')+fmt.format(v):'N/D';
const columns=['Price','Gamma/CPT','Charm','ESGFlow','ESCFlow','G-Tag','Velocity','Flip','C/G','Alert','Trade','Dealer Action'];
const rules={
 price:['Serie per strike','Strike SPX del contratto. Il basis ES richiede prezzi sincronizzati.'],
 gamma:['Inventario / coorte','Prima scelta: gamma verificata dello stock dealer al livello. In alternativa gamma dei nuovi contratti firmati, con segno e scala espliciti. Unità ES equivalenti per punto SPX.'],
 cpt:['Sensibilità normalizzata','Hedge teorico per un rialzo di 0,25 punti SPX: −0,25 × gamma in ES per punto, con basis localmente costante. In riferimento il rapporto stampato è invece Γ/5.'],
 charm:['Serie normalizzata','Derivata del delta dealer rispetto a un minuto di calendario trascorso, ES/min. La conversione di una derivata rispetto al tempo residuo inverte il segno.'],
 esgFlow:['Cumulo 60 min · modello','Inventario completo: somma di −Γ precedente × variazione SPX. Flussi: somma della gamma di finestre firmate contigue e disgiunte, espressa come hedge per +1 punto.'],
 escFlow:['Cumulo 60 min · modello','Inventario completo: somma di −charm precedente × minuti trascorsi. Flussi: somma dello charm di finestre firmate contigue e disgiunte, espressa come hedge per +1 minuto.'],
 gTag:['Regola Quantistes','Sul book locale con gamma identificata e almeno 5 strike non nulli, WALL per gamma positiva e ACCEL per negativa se |Γ| raggiunge il percentile 75 di |Γ|. Negli altri casi NEUTRAL.'],
 velocity:['Regola Quantistes','Ritmo dello charm normalizzato nei due intervalli consecutivi di 15 min. REVERSE per inversione, STALL a zero o sotto il 25% del ritmo precedente, ACCEL con crescita del modulo di almeno il 10%. Altrimenti nessun tag.'],
 flip:['Regola dedotta dalla cattura','Al cambio di segno del charm tra strike adiacenti, etichetta sullo strike inferiore. Freccia secondo il segno dello charm allo strike superiore.'],
 cg:['Regola Quantistes','Confronto dei contributi gamma e charm allo stesso shock ES sulla stessa coorte. Prevalgono charm o gamma se uno è almeno il doppio dell’altro. Sinergia per contributi concordi; forza relativa al resto della catena.'],
 alert:['Regola dedotta dalla cattura','INFLECT sulle righe con cambio di segno del charm fra strike adiacenti. La geometria per strike resta distinta dal punteggio Speed Flip.'],
 trade:['Condizione Quantistes','Il tag combina ruolo del livello, gamma locale e test del prezzo. Un setup diventa confermato soltanto dopo il retest verificato del caso A/B.'],
 dealerAction:['Copertura teorica','−Δ per i nuovi contratti dealer; ribilanciamento incrementale sull’inventario per gli shock selezionati. Una posizione long gamma vende sul rialzo e compra sul ribasso.']
};
const clean=v=>finite(v)?v:null;
function measure(f,r,k){
 const c=f.factors?.[k];
 if(!finite(r?.[k])||!finite(c)||c===0||(k!=='charm'&&c<0))return null;
 const scaled=r[k]*c;return finite(scaled)?scaled:null;
}
function usableFrame(f,cutoff){
 return f&&finite(f.ts)&&finite(f.availableAt)&&f.availableAt>=f.ts&&f.ts<=cutoff&&f.availableAt<=cutoff;
}
function vintage(pack,f,cutoff,historyMinutes){
 const slots=new Map();
 for(const p of pack.frames||[]){
  if(!usableFrame(p,cutoff)||p.ts>f.ts||p.ts<f.ts-historyMinutes*M)continue;
  const a=slots.get(p.ts);
  if(!a||p.availableAt>a.at)slots.set(p.ts,{frame:p,at:p.availableAt});
  else if(a.at===p.availableAt&&a.frame!==p)a.frame=null;
 }
 return [...slots.entries()].sort((a,b)=>a[0]-b[0]);
}
function keysOf(rows){
 if(!Array.isArray(rows)||!rows.length||rows.some(r=>!finite(r.strike)||r.strike<=0))return null;
 const m=new Map(rows.map(r=>[r.strike,r]));return m.size===rows.length?m:null;
}
function historyScope(a,b){
 const props=['source','expiry','kind','perspective','coverage','mode','timeframe','modelPeriod','comparableId','optionClass','windowMinutes','lastTradeAt','pmSettled','charmClock','gammaSign','convention'];
 return props.every(k=>a[k]===b[k])&&['gamma','charm'].every(k=>a.units?.[k]===b.units?.[k]);
}
function percentile(xs,q){
 if(xs.length<5)return null;
 xs.sort((a,b)=>a-b);return xs[Math.max(0,Math.ceil(q*xs.length)-1)];
}
function flowHistory(pack,end,cutoff,rawMap){
 const window=pack.windowMinutes||end.windowMinutes;
 const cadence=pack.intervalMinutes||end.intervalMinutes||1;
 const frames=vintage(pack,end,cutoff,L+2*cadence),expected=end.ts-L*M,session=stampNY.format(end.ts);
 const lookup=new Map();let stable=true,last=null;
 for(const [ts,slot] of frames){
  const f=slot.frame;
  if(stampNY.format(ts)!==session)continue;
  const m=f&&historyScope(f,end)?keysOf(f.rows):null;
  if(!m){if(ts>=expected)stable=false;continue;}
  const entry={f,m};lookup.set(f.ts,entry);
  if(f.ts<expected)continue;
  if(m.size!==rawMap.size||[...rawMap.keys()].some(k=>!m.has(k)))stable=false;
  if(last&&f.ts-last.f.ts>cadence*1.5*M&&end.kind==='inventory')stable=false;
  last=entry;
 }
 const mode=end.kind==='inventory'?'stock':'flow';
 const slices=[];
 if(mode==='stock'&&stable&&end.coverage==='full_book'&&lookup.has(expected)){
  const samples=[...lookup.values()];
  for(let i=1;i<samples.length;i++){
   const opening=samples[i-1],cur=samples[i];
   if(opening.f.ts<expected)continue;
   const mins=(cur.f.ts-opening.f.ts)/M;
   // A snapshot arriving after the left-hand boundary cannot explain the full move.
   // Retain the last published, comparable stock for at most one normal cadence plus jitter.
   let j=i-1;
   while(j>=0&&samples[j].f.availableAt>opening.f.ts)j--;
   const prev=samples[j];
   if(!(mins>0&&mins<=cadence*1.5)||!prev||opening.f.ts-prev.f.ts>cadence*1.5*M||prev.m.size!==rawMap.size||[...rawMap.keys()].some(k=>!prev.m.has(k))){slices.length=0;break;}
   const ds=finite(opening.f.spot)&&finite(cur.f.spot)?cur.f.spot-opening.f.spot:null;
   slices.push({item:prev,ds,dt:mins});
  }
 }else if(mode==='flow'&&end.kind==='signed_flow'&&stable&&Number.isInteger(window)&&window>0&&L%window===0){
  for(let t=expected+window*M;t<=end.ts;t+=window*M){
   const item=lookup.get(t);
   if(!item){slices.length=0;break;}
   slices.push({item,ds:1,dt:1});
  }
 }
 function sum(k,g){
  if(!slices.length||end.perspective!=='dealer'||(g==='gamma'&&end.gammaSign!=='dealer_long_positive'))return null;
  let value=0;
  for(const x of slices){const r=x.item.m.get(k),v=measure(x.item.f,r,g),shock=g==='gamma'?x.ds:x.dt;if(!finite(v)||!finite(shock))return null;value-=v*shock;}
  return finite(value)?value:null;
 }
 function velocity(k){
  const read=mins=>lookup.get(end.ts-mins*M),a=read(30),b=read(15),c=read(0);
  if(!a||!b||!c||frames.some(([ts,z])=>ts>=a.f.ts&&(!z.frame||!historyScope(z.frame,end))))return {label:null,now:null,prev:null};
  let prevStamp=a.f.ts;
  for(const rec of lookup.values()){
   if(rec.f.ts<a.f.ts)continue;
   if(rec.f.ts-prevStamp>1.5*cadence*M||!finite(measure(rec.f,rec.m.get(k),'charm')))return {label:null,now:null,prev:null};
   prevStamp=rec.f.ts;
  }
  const A=measure(a.f,a.m.get(k),'charm'),B=measure(b.f,b.m.get(k),'charm'),C=measure(c.f,c.m.get(k),'charm');
  const now=(C-B)/15,prev=(B-A)/15;
  const label=now*prev<0?'REVERSE':now===0||Math.abs(now)<=.25*Math.abs(prev)?'STALL':Math.abs(now)>=1.1*Math.abs(prev)?'ACCEL':null;
  return {label,now,prev};
 }
 return {sum,velocity,mode};
}
function interaction(g,c,local,level){
 if(!finite(g)||!finite(c)||!finite(local)||!local)return null;
 if(g===0&&c===0)return 'BALANCE';
 if(c===0)return 'G-ONLY';
 if(g===0)return 'C-ONLY';
 if(Math.sign(g)!==Math.sign(c)){
  if(Math.abs(g)>=2*Math.abs(c))return 'G-CONFLICT';
  if(Math.abs(c)>=2*Math.abs(g))return 'C-HEDGE';
  return 'BALANCE';
 }
 if(finite(level)&&Math.abs(local)>=level)return local<0?'NEG STRONG':'STRONG SYN';
 return local<0?'NEG SYN':'MOD SYN';
}
function relation(r,spot,band){
 if(!finite(spot))return null;
 return r.strike<spot-band?'support':r.strike>spot+band?'resistance':'atm';
}
function setup(r,side,tag,flip,out){
 if(out.stale||out.clockMissing||!side||r.status==='sospeso')return null;
 if(r.status==='confermato'&&r.caseId){
  if(r.direction==='LONG')return r.side==='Resistenza'?'BUY DIP SCALP':tag==='WALL'?'PREMIUM SCALP':'BUY DIP SCALP';
  if(r.direction==='SHORT')return r.side==='Supporto'?'STRONG DIR':tag==='WALL'?'STRONG FADE':'FADE SETUP';
 }
 if(side==='atm')return 'AT STRIKE · WATCH';
 const sideTag=side==='support'?'SUPPORT':'RESISTANCE';
 if(!r.caseId)return sideTag+' WATCH';
 if(flip)return 'INFLECTION POINT';
 if(tag==='WALL')return side==='support'?'BUY DIP SCALP':'FADE SETUP';
 if(tag==='ACCEL')return sideTag+' PRESSURE';
 return sideTag+' WATCH';
}
function action(f,r){
 if(f.perspective!=='dealer'||!['inventory','signed_flow'].includes(f.kind))return null;
 const qty=f.kind==='signed_flow'?r.tradeHedge:r.net;
 const stock=f.kind==='inventory'?' sullo shock':' sui nuovi contratti';
 if(!finite(qty))return null;
 return (qty>0?'Acquisto ':qty<0?'Vendita ':'Neutro ')+fmt.format(Math.abs(qty))+' ES eq.'+stock;
}
function makeModel(pack,frame,out,opts={}){
 const cutoff=finite(opts.cutoff)?opts.cutoff:Math.max(out?.asof??0,out?.availableAt??0);
 if(!out?.ok||!usableFrame(frame,cutoff)||frame.ts!==out.asof||frame.availableAt!==out.availableAt||frame.perspective!==pack.perspective)return null;
 if(finite(out.freshThrough)&&cutoff>out.freshThrough&&!out.stale)out={...out,stale:true,reason:'Lettura scaduta al cutoff'};
 const rawMap=keysOf(frame.rows),modelMap=keysOf(out.rows);
 if(!rawMap||!modelMap||rawMap.size!==modelMap.size||[...rawMap.keys()].some(k=>!modelMap.has(k)))return null;
 const time=flowHistory(pack,frame,cutoff,rawMap),dealer=frame.perspective==='dealer'&&['inventory','signed_flow'].includes(frame.kind);
 const masses=dealer?out.rows.map(r=>Math.abs(r.localGamma??0)).filter(v=>v>0):[];
 const wall=percentile(masses,.75);
 const rows=[...rawMap.values()].sort((a,b)=>b.strike-a.strike).map(raw=>{
  const r=modelMap.get(raw.strike),gFlow=frame.gammaSign==='dealer_long_positive'?measure(frame,raw,'gamma'):null;
  const g=dealer?(finite(r.localGamma)?r.localGamma:gFlow):null,c=dealer?measure(frame,raw,'charm'):null;
  const gammaBasis=finite(r.localGamma)?'inventario':frame.kind==='signed_flow'?'coorte del flusso':'serie';
  const v=dealer?time.velocity(r.strike):{label:null,now:null,prev:null},local=dealer?clean(r.localGamma):null;
  const tag=finite(wall)&&finite(local)?Math.abs(local)>=wall?(local>0?'WALL':'ACCEL'):'NEUTRAL':null;
  const same=dealer&&['inventory','signed_flow'].includes(frame.kind);
  const gh=same&&finite(gFlow)&&finite(out.shocks?.ds)?-gFlow*out.shocks.ds:null;
  const ch=same&&finite(c)&&finite(out.shocks?.dt)?-c*out.shocks.dt:null;
  // C/G compares sensitivities from the exact same cohort; a joined stock gamma is used only for G-Tag.
  const cg=interaction(gh,ch,frame.kind==='inventory'?local:gFlow,frame.kind==='inventory'?wall:null);
  const status=out.stale||out.clockMissing?'sospeso':r.status;
  return {price:r.strike,strike:r.strike,gamma:g,cpt:finite(g)?-.25*g:null,charm:c,esgFlow:time.sum(r.strike,'gamma'),escFlow:time.sum(r.strike,'charm'),gTag:tag,velocity:v.label,flip:null,cg,alert:null,trade:null,dealerAction:action(frame,r),tradeColor:null,highlight:null,status,gammaBasis,caseId:r.caseId||null,side:r.side,direction:status==='confermato'?r.direction:null,hedge:clean(r.tradeHedge),velocity15:v.now,velocityPrior15:v.prev,
   detail:'Gamma '+gammaBasis+' · CPT per +0,25 pt SPX. '+(time.mode==='stock'?'Cumulo hedge stimato dal book, ultimi 60 min.':'Flussi della coorte, ultimo ciclo di 60 min con finestre disgiunte.'),
   trigger:r.trigger||null,invalidation:r.invalidation||null};
 });
 let nearest=Infinity;for(const z of rows)if(finite(out.spot))nearest=Math.min(nearest,Math.abs(z.price-out.spot));
 for(let i=0;i<rows.length;i++){
  const z=rows[i],r=modelMap.get(z.price),up=rows[i-1],isOpen=z.status!=='sospeso';
  if(isOpen&&up&&finite(up.charm)&&finite(z.charm)&&z.charm!==0&&up.charm!==0&&Math.sign(z.charm)!==Math.sign(up.charm)){
   z.flip=up.charm>0?'FLIP↑':'FLIP↓';
   z.alert=isOpen?'INFLECT':null;
  }
  if(!isOpen){z.velocity=null;z.dealerAction=null;}
  z.trade=setup(r,relation(r,out.spot,finite(out.band)?out.band:.5),z.gTag,z.flip,out);
  if(z.trade&&z.status==='confermato')z.tradeColor=r.direction==='LONG'?'up':r.direction==='SHORT'?'down':null;
  if(finite(out.spot)&&Math.abs(z.price-out.spot)===nearest)z.highlight='spot';
  z.detail+=' '+(z.status==='confermato'?'Test e retest verificati.':z.status==='sospeso'?'Lettura sospesa.':'Livello in osservazione.');
 }
 const notes=['Quantistes · regole di classificazione pubblicate nella legenda. Le categorie derivano dalla serie selezionata.','CPT operativo in ES per +0,25 pt SPX, con basis costante. La cattura usa una scala diversa.','ESGFlow / ESCFlow richiedono 60 min omogenei. '+(time.mode==='stock'?'Ribilanciamento parziale stimato su inventari precedenti, prezzi e tempo osservati.':'Cumuli su finestre disgiunte di nuovi contratti, espressi come hedge per +1 pt SPX e +1 minuto.'),
  'Flip e INFLECT seguono il cambio di segno dello charm tra strike contigui visibili. Un segnale operativo richiede un test del prezzo.'];
 const panels=w.OAPanels?.calculate(pack,frame,out,rows,opts)||{};
 return {id:pack.id,label:pack.label,mode:'model',asof:frame.ts,availableAt:frame.availableAt,coordinate:'SPX',spot:out.spot,esSpot:out.esSpot,basis:out.basis,expiry:frame.expiry,regime:out.regime,rows,panels,notes,columns:[...columns],rules,modelStatus:out.reason||out.phase,source:pack.source,sourceMode:pack.mode,stale:!!(out.stale||out.clockMissing)};
}
w.OAMetrics=Object.freeze({calculate:makeModel,rules,columns});
})(window);

