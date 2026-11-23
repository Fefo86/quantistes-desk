

(function(w){
'use strict';
const fields={H001:['Contratti firmati','contratti'],H002:['Premio firmato','USD'],H003:['Delta nozionale','USD'],H004:['Gamma per movimento 1%','USD / 1% spot'],H005:['Vega','USD / pt vol'],H006:['Vanna','USD delta / pt vol'],H007:['Charm','USD delta / min'],H008:['Volga','USD / pt vol²'],H009:['Speed','USD / pt spot³'],H010:['Zomma','USD / pt spot² / pt vol'],H011:['Color','USD / pt spot² / min'],H012:['Ultima','USD / pt vol³'],H014:['Imbalance call/put pesato per delta','rapporto'],H015:['Quota di apertura · delta lordo','rapporto'],H016:['Quota di chiusura · delta lordo','rapporto'],H018:['Intensità sweep dichiarati','contratti / s']};
const cols=['source','basis','trade_id','leg_id','revision','action','executed_at','available_at','underlying','expiry','strike','right','side','quantity','multiplier','price','spot','delta','gamma','vega_per_volpt','vanna_delta_per_volpt','charm_delta_per_min','volga_per_volpt2','speed_raw','zomma_gamma_per_volpt','color_gamma_per_min','ultima_per_volpt3','open_close','sweep_id','data_origin','last_trade_at'];
const opt=cols.slice(17,cols.indexOf('open_close')),stamp=s=>/T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/i.test(s)?Date.parse(s):NaN;
let store=new Map(),revision=0;
function parseCSV(text){const rows=w.CVIData.csv(text),head=rows.shift()?.map(s=>s.trim().toLowerCase());if(!head||new Set(head).size!==head.length||!cols.slice(0,17).every(k=>head.includes(k)))throw Error('Tracciato eseguiti SPX incompleto. Scarica il CSV di esempio.');return rows.filter(r=>r.some(t=>String(t).trim())).map((r,i)=>{if(r.length!==head.length)throw Error('Numero colonne errato alla riga '+(i+2));return Object.fromEntries(r.map((v,j)=>[head[j],String(v).trim()]));});}
function install(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error('Nessun evento opzioni da importare.');const next=new Map(store);
 rows.forEach((r,i)=>{const fail=()=>{throw Error('Eseguito '+(i+1)+' non valido. Controlla clock con fuso, lato, unità e revisione.');};
 const source=String(r.source||'').trim(),basis=r.basis,id=String(r.trade_id||'').trim(),leg=String(r.leg_id||'').trim(),nr=Number(r.revision),e=stamp(r.executed_at),a=stamp(r.available_at);
 if(!source||!['customer','aggressor','dealer'].includes(basis)||!id||!leg||r.revision===''||!Number.isInteger(nr)||nr<0||!['trade','cancel'].includes(r.action)||!Number.isFinite(e)||!Number.isFinite(a)||a<e)fail();
 const eventKey=JSON.stringify([source,basis,id,leg]),prior=next.get(eventKey)||[],origin=r.data_origin||prior[0]?.origin||(/^EXAMPLE$/i.test(source)?'sample':'observed');if(!['observed','sample','synthetic'].includes(origin)||prior.length&&prior[0].origin!==origin)throw Error('Origine discordante nelle revisioni del medesimo eseguito.');
 const ev={source,basis,id,leg,nr,e,a,action:r.action,origin};
 if(r.action==='trade'){if(!['SPX','SPXW'].includes(r.underlying)||!/^\d{4}-\d\d-\d\d$/.test(r.expiry)||!(r.strike>0)||!['C','P'].includes(r.right)||!['buy','sell'].includes(r.side)||!Number.isSafeInteger(+r.quantity)||!(r.quantity>0&&r.multiplier>0&&r.spot>0&&r.price!==''&&r.price!=null&&r.price>=0)||![r.quantity,r.multiplier,r.spot,r.price,r.strike].every(k=>Number.isFinite(+k)))fail();
 const lastTradeAt=r.last_trade_at?stamp(r.last_trade_at):null;if(r.last_trade_at&&(!Number.isFinite(lastTradeAt)||w.DeskMeasures?.clock?.(r.last_trade_at)?.date>r.expiry))fail();
 Object.assign(ev,{optionClass:r.underlying,lastTradeAt,strike:+r.strike,expiry:r.expiry,right:r.right,side:r.side==='buy'?1:-1,quantity:+r.quantity,multiplier:+r.multiplier,price:+r.price,spot:+r.spot,oc:r.open_close||'',sweep:String(r.sweep_id||'').trim()});if(!['','open','close'].includes(ev.oc))fail();
 for(const k of opt){const n=r[k];ev[k]=n==null||n===''?null:Number(n);if(ev[k]!==null&&!Number.isFinite(ev[k]))fail();}if(ev.delta!==null&&(Math.abs(ev.delta)>1.000001||r.right==='P'&&ev.delta>0||r.right==='C'&&ev.delta<0))fail();}
 const key=eventKey,seq=prior,prev=seq.find(t=>t.nr===nr);
 if(prev){if(JSON.stringify(prev)!==JSON.stringify(ev))throw Error('Revisione duplicata e discordante.');return;}
 const history=[...seq,ev].sort((u,v)=>u.nr-v.nr);if(history.some((t,j)=>j&&(history[j-1].a>t.a||history[j-1].e!==t.e)))throw Error('Cronologia revisioni incoerente.');next.set(key,history);});
 store=next;revision++;w.dispatchEvent(new CustomEvent('desk:tape-updated'));w.InstitutionalDesk?.refreshPlaybooks?.();w.InstPanels?.panels?.();return rows.length;
}
function at(cut,minutes=5,observedOnly=true){
 if(!Number.isFinite(cut)||!(minutes>0))return [];const books=new Map(),lo=cut-minutes*60000;
 for(const versions of store.values()){const e=versions.filter(t=>t.a<=cut).at(-1);if(!e||observedOnly&&e.origin!=='observed'||e.action==='cancel'||e.e<=lo||e.e>cut)continue;
 const key=JSON.stringify([e.source,e.basis,e.origin]);if(!books.has(key))books.set(key,{source:e.source,basis:e.basis,origin:e.origin,n:0,values:{},missing:{},gross:0,op:0,cl:0,ocKnown:true,sweeps:{},sweepKnown:true});const b=books.get(key);b.n++;const q=e.side*e.quantity,f=q*e.multiplier,s=e.spot;if(!e.sweep)b.sweepKnown=false;else if(e.sweep!=='none'){const k='id:'+e.sweep;b.sweeps[k]=(b.sweeps[k]||0)+q;}
 const values=[q,f*e.price,e.delta==null?null:f*s*e.delta,e.gamma==null?null:f*.01*s*s*e.gamma,e.vega_per_volpt==null?null:f*e.vega_per_volpt,e.vanna_delta_per_volpt==null?null:f*s*e.vanna_delta_per_volpt,e.charm_delta_per_min==null?null:f*s*e.charm_delta_per_min,...['volga_per_volpt2','speed_raw','zomma_gamma_per_volpt','color_gamma_per_min','ultima_per_volpt3'].map(k=>e[k]==null?null:f*e[k])];
 values.forEach((v,i)=>{const k='H'+String(i+1).padStart(3,'0');if(!Number.isFinite(v))b.missing[k]=(b.missing[k]||0)+1;else b.values[k]=(b.values[k]||0)+v;});
 if(values[2]!=null){const g=Math.abs(values[2]);b.gross+=g;if(g&&!(e.oc))b.ocKnown=false;if(e.oc==='open')b.op+=g;if(e.oc==='close')b.cl+=g;}}
 for(const b of books.values()){b.values.H018=b.sweepKnown?Object.values(b.sweeps).reduce((s,q)=>s+Math.abs(q),0)/(minutes*60):null;for(const k of Object.keys(b.missing))b.values[k]=null;const good=!b.missing.H003&&b.gross>0;b.values.H014=good?b.values.H003/b.gross:null;b.values.H015=good&&b.ocKnown?b.op/b.gross:null;b.values.H016=good&&b.ocKnown?b.cl/b.gross:null;}
 return [...books.values()];
}
function template(){return cols.join(',')+'\n'+['EXAMPLE','customer','T001','L1','0','trade','2026-11-20T15:00:00Z','2026-11-20T15:00:01Z','SPXW','2026-11-20','6800','C','buy','2','100','12.5','6805','.52','.002','1.8','.012','-.00001','','','','','','open','none','sample',''].join(',')+'\n';}
w.InstTape={strikeVersions:()=>store.values(),at,install,parseCSV,template,fields,revision:()=>revision};
})(window);


