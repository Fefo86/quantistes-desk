
(function(w){
'use strict';
const schema='quantistes.oa_snapshot.v1',num=Number.isFinite;
const fields=['gamma','cpt','charm','esgFlow','escFlow'],tags=['gTag','velocity','flip','cg','alert','trade','dealerAction'];
const panelsSchema={
 header:{title:'s',spot:'n',spotLabel:'s',es:'n',range:['n'],coordinate:'s',basis:'n',asof:'s',refreshMinutes:'n',scope:'s',regime:'s',regimePct:'n',regimeConfidence:'s',regimeMinutes:'n'},
 convergence:{price:'n',daily:'n',intraday:'n',label:'s'},
 charmDaily:{minutes:'n',levels:[{rank:'n',price:'n',value:'n',label:'s'}]},
 charmTactical:{phase:'s',levels:[{rank:'n',name:'s',price:'n',value:'n',label:'s',aligned:'b'}]},
 tactical:{pivot:'n',regime:'s',gamma:'s',charm:'n',bias:'s',qualifier:'s',levels:[{price:'n',side:'s',strength:'s'}]},
 delta:{net:'n',bias:'s',ratio:'n',min:'n',max:'n',avg:'n',supports:[{price:'n',distance:'n',delta:'n'}],resistances:[{price:'n',distance:'n',delta:'n'}]},
 momentum:{focus:'n',windows:[{minutes:'n',velocity:'n',label:'s'}],strikes:[{price:'n',velocity:'n',state:'s'}]},
 projections:{quality:'s',horizon:'n',rows:[{minutes:'n',gamma:'n',charm:'n',confidence:'%',convergence:'%',trend:'s'}],next:{minutes:'n',type:'s',description:'s'}},
 speed:{counts:{confirmed:'n',likely:'n',watch:'n'},confirmed:[{price:'n',score:'n',distance:'n',zone:'n'}],likely:[{price:'n',score:'n',distance:'n',zone:'n'}],watch:[{price:'n',score:'n',distance:'n',zone:'n'}],insights:[{price:'n',regime:'s'}]}
};
const fail=x=>{throw Error(x);};
function stamp(x,key){
 const t=typeof x==='number'?x:typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/i.test(x)?Date.parse(x):NaN;
 if(!Number.isSafeInteger(t)||t<=0||!num(new Date(t).getTime()))fail('Orario '+key+' non valido. Usa un timestamp ISO con fuso.');
 return t;
}
function plain(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
function checked(v,kind,key){
 if(v==null)return null;
 if(kind==='s'){if(typeof v!=='string'||v.length>1200)fail('Testo non valido in '+key);return v;}
 if(kind==='b'){if(typeof v!=='boolean')fail('Valore booleano richiesto in '+key);return v;}
 if(kind==='n'||kind==='%'){if(!num(v)||kind==='%'&&(v<0||v>100))fail('Valore numerico non valido in '+key);return v;}
 if(Array.isArray(kind)){if(!Array.isArray(v)||v.length>50000)fail('Lista non valida in '+key);return v.map(z=>{if(z==null)fail('Elemento nullo in '+key);return checked(z,kind[0],key);});}
 if(!plain(v))fail('Oggetto richiesto in '+key);
 return Object.fromEntries(Object.entries(kind).filter(([k])=>Object.hasOwn(v,k)).map(([k,s])=>[k,checked(v[k],s,key+'.'+k)]));
}
function required(s,k){if(typeof s!=='string'||!s.trim()||s.length>180)fail('Campo obbligatorio: '+k);return s.trim();}
function normalize(raw){
 if(!plain(raw)||raw.schema!==schema)fail('Formato previsto: '+schema);
 const source=required(raw.source,'source'),sid=required(raw.seriesId,'seriesId'),asof=stamp(raw.asof,'asof'),availableAt=stamp(raw.availableAt,'availableAt');
 if(availableAt<asof)fail('La pubblicazione precede il calcolo.');
 if(!['ES','SPX'].includes(raw.coordinate))fail('Coordinate ammesse: SPX, ES.');
 if(!['0DTE','ALL','ALL_EXP'].includes(raw.scope))fail('Indica scope 0DTE o ALL.');
 if(!Array.isArray(raw.rows)||!raw.rows.length||raw.rows.length>50000)fail('Servono da 1 a 50.000 righe per edizione.');
 const keys=new Set(),rows=raw.rows.map((r,i)=>{
  if(!plain(r)||!num(r.price)||r.price<=0||keys.has(r.price))fail('Prezzo assente, non valido o duplicato alla riga '+(i+1));
  keys.add(r.price);const row={price:r.price};
  for(const k of fields)row[k]=checked(r[k],'n','riga '+(i+1)+' · '+k);
  for(const k of tags)row[k]=checked(r[k],'s','riga '+(i+1)+' · '+k);
  if(![...fields,...tags].some(k=>row[k]!=null))fail('Riga vuota: '+r.price);
  for(const k of ['highlight','gammaMark','tradeColor'])if(r[k]!=null)row[k]=checked(r[k],'s',k);
  return row;
 }).sort((a,b)=>b.price-a.price);
 const panels=checked(raw.panels||{},panelsSchema,'panels');
 const scope=raw.scope==='ALL_EXP'?'ALL':raw.scope,origin=raw.dataOrigin??'observed';
 if(!['observed','sample','synthetic'].includes(origin))fail('dataOrigin deve essere observed, sample o synthetic.');
 if(panels.header?.coordinate&&panels.header.coordinate!==raw.coordinate)fail('La coordinata in testata contraddice la serie.');
 const primary=key=>{const value=checked(raw[key],'n',key);if(value!=null&&value<=0)fail('Prezzo non valido: '+key);return value;};
 const spot=primary('spot'),esSpot=primary('esSpot'),basis=checked(raw.basis,'n','basis'),priceSpot=primary('priceSpot')??(raw.coordinate==='ES'?esSpot:spot);
 const seriesId=JSON.stringify([source,sid,raw.coordinate,scope,origin]);
 return {id:'native:'+JSON.stringify([seriesId,asof,availableAt]),seriesId,sourceSeries:sid,source,mode:'native',dataOrigin:origin,label:source+' · '+sid,scope,coordinate:raw.coordinate,spot,esSpot,basis,priceSpot,asof,availableAt,rows,panels,notes:checked(raw.notes??[],['s'],'notes')};
}
function encode(x){return {schema,source:x.source,seriesId:x.sourceSeries,coordinate:x.coordinate,scope:x.scope,dataOrigin:x.dataOrigin,spot:x.spot,esSpot:x.esSpot,priceSpot:x.priceSpot,basis:x.basis,asof:new Date(x.asof).toISOString(),availableAt:new Date(x.availableAt).toISOString(),rows:x.rows,panels:x.panels,notes:x.notes};}
let cache=new Map(),opening,loading;
const emit=()=>w.dispatchEvent(new CustomEvent('desk:oa-native'));
function db(){
 if(!opening)opening=new Promise((resolve,reject)=>{
  if(!w.indexedDB){reject(Error('Archivio locale del browser indisponibile.'));return;}
  const q=w.indexedDB.open('quantistes.scalping.oa.editions',1);
  q.onupgradeneeded=()=>q.result.createObjectStore('editions',{keyPath:'id'});
  q.onsuccess=()=>{const d=q.result;d.onversionchange=()=>{d.close();opening=loading=null;};resolve(d);};
  q.onerror=()=>reject(q.error||Error('Archivio non accessibile.'));q.onblocked=()=>reject(Error('Chiudi la scheda che blocca l’archivio e riprova.'));
 }).catch(e=>{opening=null;throw e;});
 return opening;
}
function ready(){
 if(!loading)loading=db().then(d=>new Promise((resolve,reject)=>{const t=d.transaction('editions'),q=t.objectStore('editions').getAll();t.oncomplete=()=>{cache=new Map(q.result.map(r=>[r.id,r]));resolve();};t.onerror=t.onabort=()=>reject(t.error||Error('Lettura archivio non riuscita.'));})).catch(e=>{loading=null;throw e;});
 return loading;
}
function list(cut=Date.now()){
 if(!num(cut))return [];
 const latest=new Map();
 for(const r of cache.values()){if(r.asof>cut||r.availableAt>cut)continue;const key=JSON.stringify([r.seriesId,r.asof]),prev=latest.get(key);if(!prev||r.availableAt>prev.availableAt)latest.set(key,r);}
 return [...latest.values()].sort((a,b)=>a.asof-b.asof||a.availableAt-b.availableAt);
}
let channel=null;
try{if(typeof w.BroadcastChannel==='function'){channel=new w.BroadcastChannel('quantistes.scalping.oa.revision');channel.onmessage=()=>{loading=null;ready().then(emit).catch(()=>{});};}}catch{}
async function importFile(file){
 const raw=JSON.parse(await file.text()),group=Array.isArray(raw?.editions)&&raw.schema===schema?raw.editions:[raw];
 if(!group.length)fail('Archivio senza edizioni.');
 const unique=new Map();
 for(const input of group){const item=normalize(input),prior=unique.get(item.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(item))fail('Due edizioni discordanti hanno la stessa ora di pubblicazione.');unique.set(item.id,item);}
 const records=[...unique.values()];await ready();const d=await db();
 await new Promise((resolve,reject)=>{const t=d.transaction('editions','readwrite'),store=t.objectStore('editions');let issue='';
  for(const record of records){const q=store.get(record.id);q.onsuccess=()=>{if(q.result&&JSON.stringify(q.result)!==JSON.stringify(record)){issue='Edizione già presente con valori diversi. Una revisione richiede un nuovo availableAt.';t.abort();}else if(!q.result)store.put(record);};}
  t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(Error(issue||t.error?.message||'Scrittura non completata.'));
 });
 records.forEach(r=>cache.set(r.id,r));emit();channel?.postMessage(1);return records.at(-1);
}
function template(){
 const r=w.OAReference;
 return {schema,source:'Esempio · cattura 12-11-2025',seriesId:'SPX Dashboard',coordinate:r.coordinate,scope:'0DTE',dataOrigin:'sample',spot:r.spot,esSpot:r.esSpot,priceSpot:r.priceSpot,basis:r.basis,asof:r.asof,availableAt:r.availableAt,rows:r.rows.map(x=>({...x})),panels:r.panels,notes:r.notes};
}
w.OANative=Object.freeze({schema,ready,list,vintages:(cut=Date.now())=>[...cache.values()].filter(x=>x.availableAt<=cut&&x.asof<=cut).sort((a,b)=>a.availableAt-b.availableAt||a.asof-b.asof),importFile,normalize,template,backup:()=>({schema,editions:[...cache.values()].map(encode)})});
})(window);

