
(function(w){
'use strict';
const C=w.InstCore,E=w.InstEngine,I=w.ReportIntel;
const ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const dimension={percent:'%',pp:'pp',percentile:'percentile',multiple:'×',ratio:'rapporto',points:'punti',sessions:'sedute',bp:'pb',volpt:'punti vol'};
const words={up:'Rialzo',down:'Ribasso',flat:'Invariato',median:'Mediano',short:'Breve',medium:'Medio',long:'Lungo','daily-reset':'Reset giornaliero'};
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const label=f=>f.name||C.metrics[f.k]?.[0]||f.k;
function unit(f){
 if(f.calc||f.k==='custom')return f.unit||'';
 const d=C.metrics[f.k]?.[1];
 if(d==='money')return f.currency||'';
 if(d==='gamma'||d==='cashperpct')return (f.currency||'')+' / 1%';
 if(d==='moneyvol')return (f.currency||'')+' / punto vol';
 return dimension[d]||d||'';
}
const sourceSeries=f=>f.series||f.file||f.doc;
const identity=f=>f.calc?JSON.stringify([f.k,f.name,f.provider,sourceSeries(f),f.g,f.scope,f.h,f.term,f.unit]):I.comparable(f)+(f.series?'':JSON.stringify([f.doc,f.seg]));
const groupKey=f=>JSON.stringify([f.provider,sourceSeries(f),f.series?'':f.doc,f.g,f.k,f.k==='custom'||f.calc?norm(label(f)):'',f.scope,f.mode,f.h||'',unit(f)]);
const readout=f=>f.calc?new Intl.NumberFormat('it-IT',{maximumSignificantDigits:7}).format(f.v)+' '+unit(f):E.display(f);
function lane(f){return [words[f.scenario]||f.scenario,words[f.term]||f.term].filter(Boolean).join(' · ')||'Valore';}
const ref=f=>({doc:f.doc,seg:f.seg,id:f.id,page:f.page,provider:f.provider,series:f.series,asof:f.asof,file:f.file,source:f.source,pub:f.pub,g:f.g,scope:f.scope,name:label(f)});
function calendarDay(t,cache){if(!cache.has(t))cache.set(t,ny.format(t));return cache.get(t);}
function build(rows,cut,filter={}){
 const output={groups:[],notes:[],issues:[],cut,usable:0,calc:0},days=new Map(),slots=new Map(),byDoc=new Map();
 if(!Number.isFinite(cut))return output;
 const endDay=calendarDay(cut,days);
 function belongs(f){return !filter.doc||f.doc===filter.doc&&(filter.seg==null||f.seg===filter.seg);}
 function add(f){
  const key=identity(f),id=JSON.stringify([key,f.asof]);let s=slots.get(id);
  if(!s){s={key,asof:f.asof,pub:f.pub,entries:[]};slots.set(id,s);}
  if(f.pub>s.pub){s.pub=f.pub;s.entries=[];}
  if(f.pub===s.pub)s.entries.push(f);
 }
 for(const f of rows){
  if(!belongs(f)||!Number.isFinite(f.pub)||f.pub>cut||!f.asof||f.asof>endDay)continue;
  if(!f.enabled||f.review||!f.provider||f.asof>calendarDay(f.pub,days)||!C.allowed(f.k,f.v)||f.k==='custom'&&(!f.name||!f.unit||f.scope==='UNKNOWN')||f.k==='commentary'&&f.scope==='UNKNOWN'){
   if(belongs(f))output.issues.push({...ref(f),reason:f.review||(!f.enabled?'Lettura esclusa':'Definizione da verificare')});continue;
  }
  if(f.k==='commentary'){if(belongs(f))output.notes.push(f);continue;}
  if(Number.isFinite(f.v))add(f);
 }
 const graphRows=[],conflicts=[];
 function resolve(s){
  const first=s.entries[0];const unique=s.entries.filter((x,i,a)=>a.findIndex(y=>y.doc===x.doc&&y.seg===x.seg&&y.id===x.id)===i);
  const conflict=unique.some(f=>f.v!==unique[0].v);
  if(first){const point={...first,key:s.key,conflict,refs:unique.flatMap(f=>f.refs||[ref(f)])};if(conflict){point.v=null;conflicts.push(point);}graphRows.push(point);}
  return conflict?[]:unique;
 }
 for(const s of [...slots.values()]){
  for(const f of resolve(s)){
   if(!belongs(f))continue;
   const key=JSON.stringify([f.doc,f.seg,f.provider,f.series,f.asof,f.g,f.scope]);
   if(!byDoc.has(key))byDoc.set(key,new Map());byDoc.get(key).set(identity(f),f);
  }
 }
 slots.clear();
 for(const unique of byDoc.values()){
  const group=[...unique.values()],byId=new Map(group.map(f=>[f.id,f])),derived=[];E.derive(group,derived);
  for(const d of derived){
   const inputs=d.inputs.map(i=>byId.get(i)).filter(Boolean);if(inputs.length!==d.inputs.length)continue;
   const f=inputs[0],term=inputs.every(x=>x.term===f.term)?f.term:'';
   add({...f,k:'calc-'+d.id,calc:true,name:d.title,term:term||'',scenario:'',mode:'model',h:d.h||'',unit:d.unit,
    v:d.v,interval:null,pub:Math.max(...inputs.map(x=>x.pub)),source:d.detail||d.title,refs:inputs.map(ref)});
  }
 }
 for(const s of slots.values())resolve(s);
 for(const f of conflicts)output.issues.push({...ref(f),reason:'Valori discordanti nella stessa edizione',refs:f.refs});
 const panels=new Map();
 for(const f of graphRows){
  const key=groupKey(f);if(!panels.has(key))panels.set(key,{key,title:label(f),unit:unit(f),scope:f.scope,g:f.g,mode:f.mode,h:f.h||'',provider:f.provider,series:sourceSeries(f),calc:!!f.calc,k:f.k,lanes:new Map()});
  const p=panels.get(key);if(!p.lanes.has(f.key))p.lanes.set(f.key,{key:f.key,title:lane(f),scenario:f.scenario,term:f.term,points:[]});
  p.lanes.get(f.key).points.push(f);
  if(!f.conflict){if(f.calc)output.calc++;else output.usable++;}
 }
 const ord={down:0,flat:1,median:2,up:3,short:0,medium:1,long:2};
 for(const p of panels.values()){
  p.lanes=[...p.lanes.values()].sort((a,b)=>(ord[a.term]??4)-(ord[b.term]??4)||String(a.term||'').localeCompare(String(b.term||''))||(ord[a.scenario]??4)-(ord[b.scenario]??4)||a.title.localeCompare(b.title));
  for(const l of p.lanes)l.points.sort((a,b)=>a.asof.localeCompare(b.asof));
  p.days=[...new Set(p.lanes.flatMap(l=>l.points.map(f=>f.asof)))].sort();
  p.search=norm([p.title,C.groups[p.g],C.scopes[p.scope],p.scope,p.k,p.unit,p.h,p.provider,p.series,...p.lanes.map(l=>l.title)].join(' '));
 }
 function order(p){
  if(p.g==='cta'&&p.k==='weight'&&['US','ES','SPX'].includes(p.scope))return 0;
  if(p.k==='gex'&&p.scope==='SPX')return 1;
  if(p.g==='vc'&&p.k==='leverage')return 2;
  if(p.g==='rp'&&p.k==='leverage')return 3;
  if(p.g==='cta'&&p.k==='flow')return 4;
  if(p.k==='flow'||p.k==='weight')return 5;
  return 6;
 }
 output.groups=[...panels.values()].sort((a,b)=>b.days.at(-1).localeCompare(a.days.at(-1))||Number(a.calc)-Number(b.calc)||order(a)-order(b)||a.provider.localeCompare(b.provider)||a.g.localeCompare(b.g)||a.title.localeCompare(b.title)||a.scope.localeCompare(b.scope)||a.h.localeCompare(b.h));
 output.notes.sort((a,b)=>b.pub-a.pub);output.issues.sort((a,b)=>b.pub-a.pub);
 return output;
}
function lastRelease(rows,now){let v=null;for(const f of rows)if(Number.isFinite(f.pub)&&f.pub<=now&&(v===null||f.pub>v))v=f.pub;return v;}
w.ReportChartModel={build,lastRelease,readout,unit,norm,label,ref};
})(window);

