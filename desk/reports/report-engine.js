

(function(w){
'use strict';
const C=w.InstCore,D=C.DAY,dayNY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const keyOf=r=>w.ReportIntel?w.ReportIntel.comparable(r)+(r.series?'':JSON.stringify([r.doc,r.seg])):[r.provider,r.g,r.scope,r.k,r.h,r.mode,r.scenario,r.term,r.currency,r.series||''].join('|');
const ratio=v=>v/100,ageDays=(a,b)=>(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/D;
const fq=(f,n)=>Number.isFinite(f)?f.toLocaleString('it-IT',{maximumFractionDigits:n}):'—';
function display(f){
 const n=f.v,k=C.metrics[f.k]?.[1];if(f.k==='commentary')return f.source||'—';if(!Number.isFinite(n))return '—';
 if(k==='cashperpct')return fq(n/1e6,3)+' mln '+(f.currency||'')+' / 1%';if(f.k==='custom')return fq(n,5)+' '+(f.unit||'');
 if(['money','gamma','moneyvol'].includes(k)){const scale=Math.abs(n)>=1e9?1e9:Math.abs(n)>=1e6?1e6:1,factor=scale===1e9?' mld':scale===1e6?' mln':'';
 return fq(n/scale,4)+factor+' '+(f.currency||'?')+(k==='moneyvol'?' / punto vol':k==='gamma'?' / 1%':'');}
 return fq(n,4)+({percent:'%',percentile:'° pct',bp:' pb',multiple:'×',points:' pt',volpt:' pt vol',pp:' pp',sessions:' sedute',ratio:''}[k]||'');
}
function loadFacts(doc){
 const segments=new Map(doc.segments.map(s=>[s.id,s]));
 return doc.facts.map(f=>{const s=segments.get(f.seg);const r={...f,doc:doc.id,file:doc.name,provider:s?.provider||'',pub:s?.pub??null,asof:f.asof||s?.day||'',series:s?.series||'',reportSegment:s?.title||''};r.compKey=keyOf(r);return r;});
}
function eligible(f,cut,day){return (f.k!=='custom'||f.name&&f.unit&&f.scope!=='UNKNOWN')&&(f.k!=='commentary'||f.source&&f.scope!=='UNKNOWN')&&f.enabled&&!f.review&&C.allowed(f.k,f.v)&&f.provider&&Number.isFinite(f.pub)&&f.pub<=cut&&f.asof&&f.asof<=day&&f.asof<=dayNY.format(f.pub);}
function stale(f,day){
 const age=ageDays(day,f.asof),pubAge=ageDays(day,dayNY.format(f.pub));
 const limit=['vix','vvix','skew','dxy','credit','dailyReturn','vixTouched','downStreak','hyOas','igOas','putCall','advancing','above200'].includes(f.k)?0:['gex','gamma5','gammaNon','gammaOI','gamma0','expiryGamma','negativeGammaStreak','rv5'].includes(f.k)?3:7;
 if(age>limit||pubAge>limit)return true;
 if(['scenario','forecast'].includes(f.mode)&&f.h){const m=f.h.match(/^(\d+)(TD|D|W|M)$/);if(m){const n=+m[1],u=m[2];let last=new Date(f.asof+'T00:00:00Z');if(u==='M')last.setUTCMonth(last.getUTCMonth()+n);else if(u==='TD'){let k=n;while(k){last.setUTCDate(last.getUTCDate()+1);if(w.SystematicCore?.session?w.SystematicCore.session(last.toISOString().slice(0,10)):![0,6].includes(last.getUTCDay()))k--;}}else last.setUTCDate(last.getUTCDate()+n*(u==='W'?7:1));if(last.toISOString().slice(0,10)<day)return true;}}
 return false;
}
function at(rows,cut){
 if(!Number.isFinite(cut))return {active:[],conflicts:[],derived:[],cut:null,stale:0};
 const day=dayNY.format(cut),best=new Map();let old=0;
 for(const r of rows){if(!eligible(r,cut,day))continue;if(stale(r,day)){old++;continue;}const key=keyOf(r),prev=best.get(key);
 if(!prev||r.asof>prev[0].asof||r.asof===prev[0].asof&&r.pub>prev[0].pub)best.set(key,[r]);
 else if(r.asof===prev[0].asof&&r.pub===prev[0].pub)prev.push(r);}
 const active=[],contributors=[],conflicts=[];for(const a of best.values()){if(a.some(r=>r.v!==a[0].v)){conflicts.push(...a);continue;}active.push(a[0]);contributors.push(...a);}
 // A calculation uses exactly one vintage and population. Equal copies can exist in separate PDFs.
 const groups=new Map();
 for(const f of contributors){const key=[f.doc,f.seg,f.g,f.scope,f.asof,f.series].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
 const calculations=[];for(const a of groups.values()){const unique=[...new Map(a.map(f=>[keyOf(f)+'|'+f.v,f])).values()];derive(unique,calculations);}const derived=[...new Map(calculations.map(f=>[JSON.stringify([f.provider,f.series||'',f.g,f.scope,f.id,f.title,f.h,f.asof,f.unit,f.v]),f])).values()];
 const latestNotes=new Map();const groupNote=f=>[f.provider,f.series,f.g,f.scope].join('|');for(const f of active)if(f.k==='commentary')latestNotes.set(groupNote(f),Math.max(latestNotes.get(groupNote(f))||0,f.pub));const visible=active.filter(f=>f.k!=='commentary'||f.pub===latestNotes.get(groupNote(f)));
 const changes=w.ReportSignals?.changes(rows,visible,cut)||[];return {cut,active:visible,derived,changes,stale:old,conflicts};
}
function derive(a,out){
 const p=a[0],plain=r=>['published','estimate'].includes(r.mode)&&!r.scenario,base=a.filter(plain);
 function get(k,pool=base){const rows=pool.filter(r=>r.k===k);return rows.length&&rows.every(r=>r.v===rows[0].v&&r.currency===rows[0].currency&&r.h===rows[0].h&&r.mode===rows[0].mode)?rows[0]:null;}
 function add(id,title,v,unit,inputs,h='',detail='',product=''){if(!Number.isFinite(v)||!inputs.every(Boolean))return;out.push({id,title,v,unit,detail,h,product,provider:p.provider,g:p.g,scope:p.scope,asof:p.asof,doc:p.doc,seg:p.seg,pages:[...new Set(inputs.map(f=>f.page))],inputs:inputs.map(f=>f.id),mode:'model',series:p.series||''});}
 const A=get('aum'),t=get('target')||get('targetLev'),cur=get('weight')||get('leverage'),pos=get('position');
 if(A&&t&&(!cur||cur.term===t.term)&&(!pos||pos.term===t.term)&&(!A.term||A.term===t.term)&&['cta','vc','pension','rp'].includes(p.g)){
 const target=t.k==='target'?ratio(t.v):t.v,current=cur?(cur.k==='weight'?ratio(cur.v):cur.v):null;
 const currentMoney=pos&&pos.currency===A.currency?pos.v:current!==null?current*A.v:null;
 if(currentMoney!==null&&!(pos&&cur&&pos.currency===A.currency&&Math.abs(pos.v-current*A.v)>Math.max(1,Math.abs(A.v)*1e-6)))add(({cta:'H221',vc:'H215',pension:'PENSION_GAP',rp:'RP_SLEEVE_GAP'})[p.g],'Gap target − corrente',A.v*target-currentMoney,A.currency,[A,t,pos&&pos.currency===A.currency?pos:cur],'','Stesso patrimonio, perimetro e vintage. Esposizione da riallineare prima di costi o routing.');
 }
 if(p.g==='cta')for(const f of a.filter(r=>r.k==='trend'&&r.mode==='scenario'&&r.h)){const now=a.filter(r=>r.k==='trend'&&r.term===f.term&&plain(r));if(now.length===1)add('CTA_TREND_CHANGE','Variazione forza del trend · '+f.term+' / '+f.scenario,f.v-now[0].v,'punti %',[now[0],f],f.h,'Differenza sullo stesso modello ES. Non è una percentuale di capitale.');}
 if(p.g==='dealer'){const g=['gamma5','gammaNon','gamma0','gammaOI'].map(k=>get(k));if(g.every(Boolean)&&g.every(f=>f.h===g[0].h&&f.currency===g[0].currency)){add('GAMMA_RECON','Residuo gamma totale meno componenti',g[0].v-g.slice(1).reduce((z,f)=>z+f.v,0),g[0].currency+' / 1%',g,g[0].h,'Riconciliazione della stessa media intraday del provider.');}}
 const urls=a.filter(r=>r.k==='flow'&&r.mode==='scenario');
 for(const h of new Set(urls.map(r=>r.h))){if(!h)continue;
 const sc=a.filter(r=>r.h===h&&r.mode==='scenario'),up=get('flow',sc.filter(f=>f.scenario==='up')),down=get('flow',sc.filter(f=>f.scenario==='down'));
 if(up&&down&&up.currency===down.currency&&p.g==='sys'){const mid=get('flow',sc.filter(f=>f.scenario==='flat'));if(mid&&mid.currency===up.currency)add('SYS_RANGE','Dispersione dei flussi fra i tre scenari',Math.max(up.v,down.v,mid.v)-Math.min(up.v,down.v,mid.v),up.currency,[up,mid,down],h,'Massimo meno minimo su tre alternative. Non è flusso eseguito.');}
 const su=get('shock',sc.filter(f=>f.scenario==='up')),sd=get('shock',sc.filter(f=>f.scenario==='down'));
 if(up&&down&&up.currency===down.currency&&p.g==='cta'){
 add('CTA_SPREAD','Differenza di flusso · rialzo meno ribasso',up.v-down.v,up.currency,[up,down],h,'Differenza tra due scenari alternativi del provider.');
 if(su&&sd&&su.v>0&&sd.v<0&&Math.abs(su.v+sd.v)<1e-8&&up.v>=0&&down.v<=0&&up.v-down.v>0)add('H223','Asimmetria CTA · vendita meno acquisto',(-down.v-up.v)/(up.v-down.v),'rapporto',[up,down,su,sd],h,'Shock simmetrici espliciti. Positivo quando prevale la vendita nello scenario ribassista.');
 }}
 if(p.g==='rp'){
 const we=get('eqWeight'),wb=get('bondWeight'),se=get('eqVol'),sb=get('bondVol'),r=get('correlation'),old=get('priorCorr');
 if(we&&wb&&se&&sb&&r&&we.v>=0&&wb.v>=0&&Math.abs(we.v+wb.v-100)<1e-7){
 const x=ratio(we.v)*ratio(se.v),y=ratio(wb.v)*ratio(sb.v),v=Math.max(0,x*x+y*y+2*x*y*r.v);
 add('RP_VOL','Volatilità annua · due asset',Math.sqrt(v)*100,'%', [we,wb,se,sb,r],'','Pesi azioni e obbligazioni con somma 100%. Volatilità annue e correlazione della stessa osservazione.');
 if(v>0)add('RP_EQUITY_RC','Quota azionaria del rischio',100*(x*x+x*y*r.v)/v,'%', [we,wb,se,sb,r]);
 if(old)add('H224','Variazione della varianza dalla correlazione',2*x*y*(r.v-old.v),'varianza annua',[we,wb,se,sb,r,old],'','Pesi e volatilità tenuti fissi.');
 }}
 if(p.g==='letf'){const l=get('leverage'),r=get('dailyReturn'),flow=get('cashflow');if(A&&l&&r&&flow&&flow.currency===A.currency&&flow.h==='1D'&&r.v>-100){
 const markers=[A,l,r,flow].map(f=>String(f.term||'').trim().match(/^ETF\s*:\s*([A-Z0-9.-]{1,16})$/i)?.[1]?.toUpperCase());const product=markers[0]&&markers.every(m=>m===markers[0])?markers[0]:'';
 add('H227','Reset giornaliero stimato',A.v*l.v*(l.v-1)*ratio(r.v)+l.v*flow.v,A.currency,[A,l,r,flow],'1D','AUM iniziale, leva firmata, rendimento del benchmark e capitale accreditato al close.',product);}}
}
function gates(id,v){if(!v?.cut)return null;const us=f=>['US','SPX','ES'].includes(f.scope),conditions=[null,null,null],sources=[],evidence=[];
 function decide(i,items,pred){if(!items.length)return;
  const results=items.map(pred),agrees=results.every(v=>v===results[0]);conditions[i]=agrees?results[0]:null;sources.push(...items);
  evidence.push({index:i,conflict:!agrees,value:conditions[i],readings:items.map(f=>({doc:f.doc,seg:f.seg,inputs:(f.inputs||[]).map(id=>{const a=v.active.find(x=>x.doc===f.doc&&x.seg===f.seg&&x.id===id);return {doc:f.doc,seg:f.seg,id,page:a?.page,provider:f.provider};}),previous:f.previousDoc?{doc:f.previousDoc,seg:f.previousSeg,id:f.previousId,page:f.previousPage,provider:f.provider}:null,channel:JSON.stringify([f.provider,f.series||'',f.g,f.scope,f.k||f.id,f.name||f.title||'',f.h||'',f.term||'',f.unit||f.currency||'',f.mode||'']),id:f.inputs?.[0]??(Number.isInteger(f.id)?f.id:null),page:f.page||f.pages?.[0],provider:f.provider,asof:f.asof||f.to,name:f.title||f.name||C.metrics[f.k]?.[0]||'',value:(f.inputs||f.from?fq(f.v,4)+' '+(f.unit||''):display(f))+(f.marketProof?' · '+f.marketProof:'')}))});
 }
 const obs=v.active.filter(f=>us(f)&&['published','estimate'].includes(f.mode)&&!f.scenario);
 if(id==='P10')decide(1,obs.filter(f=>f.g==='cta'&&['position','weight'].includes(f.k)),f=>f.v>0);
 if(['P11','P12'].includes(id)){const code=id==='P11'?'H221':'H215';decide(id==='P11'?1:2,v.derived.filter(f=>us(f)&&f.id===code),f=>f.v>0);}
 if(id==='P13')decide(2,obs.filter(f=>f.g==='rp'&&f.scope==='ES'&&['position','weight','eqWeight'].includes(f.k)),f=>f.v!==0);
 w.ReportSignals?.gate(id,v,decide,obs);
 if(v.conflicts?.length){
  const disputed=gates(id,{...v,active:v.conflicts,derived:[],changes:[],conflicts:[]});
  for(const e of disputed?.evidence||[]){
   if(!e.conflict)continue;
   const current=evidence.find(a=>a.index===e.index);
   if(current){current.conflict=true;current.value=null;current.readings.push(...e.readings);}else evidence.push(e);
   conditions[e.index]=null;sources.push(...e.readings);
  }
 }
 if(!sources.length)return null;return {gates:conditions,evidence,asof:new Date(v.cut).toISOString(),source:[...new Set(sources.map(f=>f.provider+' · p. '+(f.page||f.pages?.join('/')||'—')))].join(' / '),definition:'Condizioni documentate al cutoff. Il target richiede tutte le condizioni e uno storico di esiti omogenei.',veto:null};
}
w.InstEngine={at,gates,loadFacts,display,derive,eligible};
})(typeof window==='undefined'?globalThis:window);


