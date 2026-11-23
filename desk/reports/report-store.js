
(function(w){
'use strict';
const C=w.InstCore,E=w.InstEngine;let dbp=null,version=0;const ready=new Map(),pending=new Map();let chan=null;
function db(){if(!dbp)dbp=new Promise((resolve,reject)=>{if(!w.indexedDB){reject(Error('Archiviazione locale non disponibile in questo browser.'));return;}const q=w.indexedDB.open('quantistes.institutional.reports',2);
 q.onupgradeneeded=e=>{const d=q.result;if(e.oldVersion===0){d.createObjectStore('index',{keyPath:'id'}).createIndex('ingested','ingested');d.createObjectStore('books',{keyPath:'id'});d.createObjectStore('originals');const facts=d.createObjectStore('readings',{keyPath:['doc','id']});facts.createIndex('asof','asof');facts.createIndex('doc','doc');}if(e.oldVersion<2){const facts=q.transaction.objectStore('readings');facts.createIndex('comparison',['compKey','asof']);d.createObjectStore('rules',{keyPath:'id'});if(e.oldVersion>0){const r=facts.openCursor();r.onsuccess=()=>{const c=r.result;if(c){const f=c.value;f.compKey=w.ReportIntel.comparable(f);c.update(f);c.continue();}};}}};
 q.onsuccess=()=>{const d=q.result;d.onversionchange=()=>{d.close();dbp=null;};resolve(d);};q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Chiudi le altre copie del desk per aggiornare l’archivio.'));}).catch(e=>{dbp=null;throw e;});return dbp;}
function get(store,id){return db().then(d=>new Promise((res,rej)=>{const q=d.transaction(store).objectStore(store).get(id);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}));}
function invalidate(broadcast=true){version++;ready.clear();pending.clear();if(broadcast)chan?.postMessage('changed');w.dispatchEvent(new CustomEvent('desk:reports-changed'));w.InstitutionalDesk?.refreshPlaybooks?.();}
async function save(doc,file,expected=0){
 const d=await db();const result=await new Promise((resolve,reject)=>{const t=d.transaction(['index','books','originals','readings','rules'],'readwrite'),ix=t.objectStore('index'),books=t.objectStore('books'),reads=t.objectStore('readings');let issue='',changed=false;
 const q=ix.get(doc.id);q.onsuccess=()=>{const prev=q.result;if(prev&&expected===0)return;if((prev?.version||0)!==expected){issue='Il documento è cambiato in un’altra scheda. Riapri il dettaglio.';t.abort();return;}
 const put=()=>{doc.version=expected+1;books.put(doc);if(file)t.objectStore('originals').put(file,doc.id);
 const facts=E.loadFacts(doc);for(const f of facts){reads.put(f);if(f.teach&&f.enabled&&!f.review&&f.series&&f.originLabel){const rule=ruleFor(f);t.objectStore('rules').put(rule);}}
 ix.put({id:doc.id,extraction:doc.extraction||1,name:doc.name,pages:doc.pages,n:facts.length,review:facts.filter(f=>f.review&&f.enabled).length,unresolved:doc.unresolved.length,when:doc.segments[0]?.day||'',providers:[...new Set(doc.segments.map(s=>s.provider).filter(Boolean))].join(' / '),ingested:doc.ingested,size:doc.size,version:doc.version});changed=true;};
 if(!prev){put();return;}const oldBook=books.get(doc.id);oldBook.onsuccess=()=>{if(oldBook.result)forgetRules(t,oldBook.result,doc);};const cur=reads.index('doc').openKeyCursor(IDBKeyRange.only(doc.id));cur.onsuccess=()=>{const c=cur.result;if(c){reads.delete(c.primaryKey);c.continue();}else put();};};
 t.oncomplete=()=>resolve(changed);t.onabort=t.onerror=()=>reject(Error(issue||(t.error?.name==='QuotaExceededError'?'Spazio locale esaurito. Il PDF non è stato aggiunto.':t.error?.message||'Salvataggio non completato.')));});
 if(result)invalidate();return result;
}
async function erase(id,expected){const d=await db();await new Promise((res,rej)=>{const t=d.transaction(['index','books','originals','readings','rules'],'readwrite');const q=t.objectStore('index').get(id);q.onsuccess=()=>{if(q.result?.version!==expected){t.abort();return;}const old=t.objectStore('books').get(id);old.onsuccess=()=>{if(old.result)forgetRules(t,old.result,null);};for(const s of ['index','books','originals'])t.objectStore(s).delete(id);const a=t.objectStore('readings'),r=a.index('doc').openKeyCursor(IDBKeyRange.only(id));r.onsuccess=()=>{const c=r.result;if(c){a.delete(c.primaryKey);c.continue();}};};t.oncomplete=res;t.onabort=t.onerror=()=>rej(Error('Eliminazione non completata. Riapri il report.'));});invalidate();}
async function list(term='',page=0){const d=await db(),query=String(term).trim().toLowerCase();return new Promise((res,rej)=>{const ix=d.transaction('index').objectStore('index').index('ingested'),q=ix.openCursor(null,'prev'),items=[];let total=0;q.onsuccess=()=>{const c=q.result;if(!c){res({total,items});return;}const m=c.value;if(!query||[m.name,m.providers,m.when].join(' ').toLowerCase().includes(query)){if(total>=page*10&&items.length<10)items.push(m);total++;}c.continue();};q.onerror=()=>rej(q.error);});}
function peek(cut){if(!Number.isFinite(cut))return null;if(!ready.has(cut))query(cut).catch(()=>{});return ready.get(cut)||null;}
function ruleId(f){return JSON.stringify([f.provider,f.series,w.ReportIntel.normal(f.originLabel||f.name||''),f.originUnit||f.unit||'',f.originScope||f.scope||'']);}
function ruleFor(f){return {id:ruleId(f),owner:f.doc,k:f.k,g:f.g,name:f.name,unit:f.unit,scope:f.scope,term:f.term,h:f.h,mode:f.mode,currency:f.currency};}
function forgetRules(t,prev,next){const table=t.objectStore('rules'),keep=new Set((next?E.loadFacts(next):[]).filter(f=>f.teach&&f.enabled&&!f.review&&f.originLabel).map(ruleId));for(const f of E.loadFacts(prev).filter(f=>f.teach&&f.originLabel)){const id=ruleId(f);if(keep.has(id))continue;const q=table.get(id);q.onsuccess=()=>{if(q.result?.owner===prev.id)table.delete(id);};}}
async function outdated(){const d=await db();return new Promise((res,rej)=>{const q=d.transaction('index').objectStore('index').openCursor(),out=[];q.onsuccess=()=>{const c=q.result;if(!c){res(out);return;}if((c.value.extraction||1)<2)out.push(c.value.id);c.continue();};q.onerror=()=>rej(q.error);});}
async function applyRules(doc){const segs=new Map(doc.segments.map(s=>[s.id,s])),list=await db().then(d=>new Promise((res,rej)=>{const q=d.transaction('rules').objectStore('rules').getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}));const rules=new Map(list.map(r=>[r.id,r]));
 for(const f of doc.facts){const s=segs.get(f.seg);if(f.k!=='custom'||f.ocr||!['','Confermare nome, unità e definizione della serie','Confermare il perimetro'].includes(f.review)||!s?.series)continue;
 const id=ruleId({...f,provider:s.provider,series:s.series}),r=rules.get(id);if(!r||!C.allowed(r.k,f.v))continue;
 f.originLabel=f.name;f.originUnit=f.unit;f.originScope=f.scope;for(const k of ['k','g','name','unit','scope','term','h','mode','currency'])f[k]=r[k];f.review='';f.verified='series';}
}
function previous(d,active,cut){return new Promise((resolve,reject)=>{if(!active.length){resolve([]);return;}const old=[],t=d.transaction('readings'),ix=t.objectStore('readings').index('comparison');
 for(const f of active){if(!f.series||!['published','estimate','chart'].includes(f.mode)||f.scenario)continue;const key=f.compKey||w.ReportIntel.comparable(f),r=ix.openCursor(IDBKeyRange.bound([key,''],[key,f.asof],false,true),'prev');let day='';
 r.onsuccess=()=>{const c=r.result;if(!c)return;const a=c.value;if(day&&a.asof!==day)return;if(a.enabled&&!a.review&&Number.isFinite(a.pub)&&a.pub<=Math.min(f.pub,cut)&&a.asof<=new Date(a.pub).toLocaleDateString('en-CA',{timeZone:'America/New_York'})){day=a.asof;old.push(a);}c.continue();};}
 t.oncomplete=()=>resolve(old);t.onabort=t.onerror=()=>reject(t.error||Error('Lettura delle edizioni precedenti interrotta.'));});}
function query(cut){
 if(!Number.isFinite(cut))return Promise.resolve(E.at([],null));
 if(ready.has(cut))return Promise.resolve(ready.get(cut));if(pending.has(cut))return pending.get(cut);
 const generation=version,key=new Date(cut+864e5).toISOString().slice(0,10),lo=new Date(cut-10*864e5).toISOString().slice(0,10);
 const p=db().then(d=>new Promise((res,rej)=>{const req=d.transaction('readings').objectStore('readings').index('asof').getAll(IDBKeyRange.bound(lo,key));req.onsuccess=()=>{const current=E.at(req.result,cut);previous(d,current.active,cut).then(p=>{current.changes=w.ReportSignals.changes(p,current.active,cut);res(current);},rej);};req.onerror=()=>rej(req.error);})).then(value=>{if(version!==generation)return query(cut);ready.set(cut,value);while(ready.size>12)ready.delete(ready.keys().next().value);w.dispatchEvent(new CustomEvent('desk:reports-ready',{detail:{cut}}));w.InstitutionalDesk?.refreshPlaybooks?.();return value;}).finally(()=>{if(pending.get(cut)===p)pending.delete(cut);});pending.set(cut,p);return p;
}
async function hash(file){const raw=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',raw);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function attach(id,file){const dbi=await db();return new Promise((res,rej)=>{let linked=false;const t=dbi.transaction(['index','originals'],'readwrite'),m=t.objectStore('index'),o=t.objectStore('originals'),a=m.get(id);a.onsuccess=()=>{if(!a.result)return;const key=o.getKey(id);key.onsuccess=()=>{if(key.result===undefined){o.put(file,id);linked=true;}};};t.oncomplete=()=>res(linked);t.onabort=t.onerror=()=>rej(Error('Spazio insufficiente o PDF originale non salvato.'));});}
function merge(old,fresh){if(!old)return fresh;
 const signature=f=>JSON.stringify([f.page,f.g,f.k,f.scope,f.term||'',f.h||'',f.scenario||'',f.name||'',f.asof||'']);
 const manually=old.facts.filter(f=>f.verified==='manual'||f.teach||!f.enabled);
 for(const f of manually){const initial=f.originalSig||signature(f),i=fresh.facts.findIndex(a=>signature(a)===initial);if(i<0)fresh.facts.push({...f});else fresh.facts[i]={...f};}
 for(const seg of fresh.segments){const s=old.segments.find(v=>v.page===seg.page);if(!s)continue;if(s.precision==='manual'||s.precision==='receipt')for(const k of ['pub','day','precision','provider'])seg[k]=s[k];if(s.series)seg.series=s.series;}
 fresh.ingested=old.ingested;fresh.facts.forEach((f,i)=>f.id=i+1);return fresh;
}
async function reprocess(id,file,progress=()=>{}){const old=await get('books',id);if(!old)throw Error('Report assente.');file=file||await get('originals',id);
 if(!file&&old.example){const sample=JSON.parse(document.getElementById('ir-bofa-example').textContent);await save(merge(old,sample),null,old.version);return id;}
 if(!file)throw Error('Aggiungi il PDF originale per indicizzare tutte le pagine.');const f=file.name?file:new File([file],old.name,{type:'application/pdf'});
 const doc=merge(old,await w.InstPdf.ingest(f,id,progress));await applyRules(doc);await save(doc,f,old.version);return id;}
async function example(){const b=JSON.parse(document.getElementById('ir-bofa-example').textContent);b.ingested=Date.now();const saved=await save(b,null);return {id:b.id,dup:!saved};}
async function importFile(file,progress){const check=new Uint8Array(await file.slice(0,1024).arrayBuffer());if(!new TextDecoder('latin1').decode(check).includes('%PDF-'))throw Error('Il contenuto non è un PDF.');const id=await hash(file);if(await get('index',id)){const prior=await get('books',id);if(prior.extraction!==2||!prior.textPages?.length){await reprocess(id,file,progress);return {dup:false,updated:true,id};}const linked=await attach(id,file);return {dup:true,linked,id};}const doc=await w.InstPdf.ingest(file,id,progress);for(const s of doc.segments)if(s.precision==='day'&&s.pub>doc.ingested&&s.day===new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(doc.ingested)){s.pub=doc.ingested;s.precision='receipt';}await applyRules(doc);const saved=await save(doc,file);return {dup:!saved,id,n:doc.facts.length};}
try{chan=new BroadcastChannel('quantistes.institutional.reports');chan.onmessage=()=>invalidate(false);}catch{}
function range(lo,hi){return db().then(d=>new Promise((res,rej)=>{const q=d.transaction('readings').objectStore('readings').index('asof').getAll(IDBKeyRange.bound(lo,hi));q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}));}
let chartCache=null;
function chartReadings(){
 if(chartCache?.version===version)return chartCache.request;
 const generation=version;
 const request=db().then(d=>new Promise((resolve,reject)=>{
  const rows=[],tx=d.transaction('readings'),cursor=tx.objectStore('readings').openCursor();
  cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const f=item.value;
   rows.push({id:f.id,doc:f.doc,seg:f.seg,file:f.file,page:f.page,provider:f.provider,series:f.series,
    pub:f.pub,asof:f.asof,g:f.g,k:f.k,name:f.name,unit:f.unit,currency:f.currency,scope:f.scope,
    mode:f.mode,h:f.h,term:f.term,scenario:f.scenario,v:f.v,interval:f.interval,source:f.source,
    review:f.review,enabled:f.enabled});item.continue();};
  tx.oncomplete=()=>resolve(rows);tx.onerror=tx.onabort=()=>reject(tx.error||Error('Archivio delle misure non disponibile.'));
 })).then(rows=>version===generation?rows:chartReadings()).catch(e=>{if(chartCache?.version===generation)chartCache=null;throw e;});
 chartCache={version:generation,request};return request;
}
w.InstReports={chartReadings,peek,query,range,example,save,outdated,reprocess,erase,list,get,importFile,version:()=>version,gates:(id,cut)=>E.gates(id,peek(cut)),dataChanged:invalidate};
})(window);

