(function(root){
'use strict';
let snapshot=null, mode='ARCHIVE', connected=false;
function validateTimestamp(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)||!Number.isFinite(Date.parse(value)))throw Error('Specificare data, ora e fuso ISO 8601.');
  return value;
}
function normaliseSnapshot(input){
  if(!input||typeof input!=='object')throw Error('Snapshot ES non valido.');
  const es=input.es&&typeof input.es==='object'?input.es:{};
  const vix=input.vix&&typeof input.vix==='object'?input.vix:{};
  const asof=validateTimestamp(input.asof||input.timestamp||es.asof);
  const last=DeskMeasures.number(es.last??es.price??input.es_last??input.es_price??input.last??input.es);
  const volatility=DeskMeasures.number(vix.value??vix.last??input.vix_value??(typeof input.vix==='object'?null:input.vix));
  if(!(last>1000&&DeskMeasures.onTick(last)))throw Error('Il prezzo ES deve essere in punti e rispettare il tick di 0,25.');
  if(!(volatility>=6&&volatility<=100))throw Error('Il VIX deve essere compreso fra 6 e 100.');
  const vixAt=vix.asof||input.vix_asof;
  return {schema:'quantistes.es.price_snapshot.v2',asof,
    es:{last,asof:validateTimestamp(es.asof||input.es_asof||asof),contract:String(es.contract||input.contract||'')},
    vix:{value:volatility,asof:vixAt?validateTimestamp(vixAt):null},
    provider:typeof input.provider==='string'?input.provider:'USER-SUPPLIED'};
}
function csvSnapshot(text){
  const lines=String(text).replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(s=>s.trim());
  if(lines.length<2)throw Error('Il CSV richiede intestazione e almeno uno snapshot.');
  const sep=lines[0].includes(';')?';':lines[0].includes('\t')?'\t':',';
  function split(line){const cells=[];let cell='',quoted=false;for(let i=0;i<line.length;i++){
    const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===sep&&!quoted){cells.push(cell.trim());cell='';}else cell+=c;
  }if(quoted)throw Error('Virgolette CSV incomplete.');cells.push(cell.trim());return cells;}
  const headers=split(lines[0]).map(s=>s.toLowerCase()),values=split(lines.at(-1));
  if(values.length!==headers.length)throw Error('Numero di colonne CSV incoerente.');
  const r=Object.fromEntries(headers.map((k,i)=>[k,values[i]]));
  const dec=x=>typeof x==='string'&&sep!==','?x.replace(',','.'):x;
  return {asof:r.asof||r.timestamp,es:{last:dec(r.es_last||r.es_price||r.last||r.es),asof:r.es_asof,contract:r.contract},vix:{value:dec(r.vix||r.vix_value),asof:r.vix_asof},provider:r.provider||'USER-CSV'};
}
function notify(){root.dispatchEvent(new CustomEvent('quantistes:v12-feed',{detail:{snapshot,mode}}));}
function ingest(raw,source='UPLOAD'){const next=normaliseSnapshot(raw);snapshot=next;connected=source==='BRIDGE';mode=connected?'STREAM':'SNAPSHOT';notify();return next;}
function stop(){connected=false;if(snapshot)mode='SNAPSHOT';}
async function loadDemo(){snapshot=null;connected=false;mode='ARCHIVE';notify();await root.FlowDesk?.loadDemoChain?.();root.QuantistesDynamic?.replayHistorical?.();}
root.QuantistesV12=Object.freeze({normalize:normaliseSnapshot,parseCSV:csvSnapshot,ingest,loadDemo,stop,snapshot:()=>snapshot,getState:()=>({mode,connected,sourceAsOf:snapshot?.asof||null})});
})(window);
