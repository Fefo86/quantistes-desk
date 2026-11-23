

(function(w){
'use strict';
const C=w.InstCore,M=w.ReportChartModel,F=Number.isFinite;
const fmt=new Intl.NumberFormat('it-IT',{maximumFractionDigits:3});
const fmtAxis=new Intl.NumberFormat('it-IT',{maximumFractionDigits:2});
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scopes={US:'USA',TOTAL:'Totale',PORT:'Portafoglio',GLOBAL:'Globale'},terms={short:'Breve',medium:'Medio',long:'Lungo',EOD:'Chiusura'};
const scenario={down:'Ribasso',flat:'Invariato',median:'Mediano',up:'Rialzo'};
const gamma={gammaNon:'Non-0DTE',gamma0:'0DTE',gammaOI:'Rettifica OI',gamma5:'Media pubblicata'};
const tint=['#80cef3','#f3bd79','#92d8bf','#c3b2ed','#ed9cac','#a4b9e9','#dacb8a','#84d3da'];
const up='#74d8af',down='#f38d93',dim='#b3b8b6',pale='#eee9dd',rule='#393e40',canvas='#131719',amber='#ffac56';
const scope=s=>scopes[s]||C.scopes[s]||s,term=s=>terms[s]||s;
const isMoney=u=>/^(USD|EUR|GBP|CAD|AUD)(\b|$)/.test(u);
function scale(unit,peak){const fac=isMoney(unit)?peak>=1e9?1e9:peak>=1e6?1e6:peak>=1e3?1e3:1:1;return {fac,unit:(fac===1e9?'mld ':fac===1e6?'mln ':fac===1e3?'mila ':'')+unit};}
const num=(v,fac=1,plus=false)=>!F(v)?'n/d':(v<0?'−':v>0&&plus?'+':'')+fmt.format(Math.abs(v/fac));
const short=(x,n)=>x.length>n?x.slice(0,n-1)+'…':x;
const tickDate=d=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(2,4);
function grouping(g){
 if(g.k==='calc-CTA_SPREAD')return ['profile','Rialzo meno ribasso',g.k];
 if(g.k==='calc-CTA_TREND_CHANGE')return ['profile','Scostamento del trend dal livello attuale',g.scope,g.h];
 if(g.g==='cta'&&g.k==='trend')return ['trend','Segnale CTA per orizzonte',g.scope];
 if(g.k==='flow'&&g.lanes.every(l=>l.scenario&&scenario[l.scenario]))return ['flow','Flussi condizionati al mercato',g.g];
 if(g.g==='dealer'&&Object.hasOwn(gamma,g.k))return ['bridge','Gamma dealer · riconciliazione',g.scope,g.h];
 if(g.g==='rp'&&['eqWeight','bondWeight','commodityWeight'].includes(g.k))return ['profile','Risk parity · pesi per classe',g.scope,g.h];
 if(['weight','leverage','expiryGamma','etfSensitivity','closeShare','trigger','modelAum'].includes(g.k))return ['profile',({weight:'Posizionamento per universo',leverage:'Leva per mandato',expiryGamma:'Gamma per scadenza',etfSensitivity:'Reset ETF per indice',closeShare:'Quota dei volumi al close',trigger:'Livelli di attivazione',modelAum:'Patrimonio del modello'})[g.k],g.g,g.k,g.h];
 return ['series',g.title,g.key];
}
function label(f,type){
 if(f.k==='calc-CTA_TREND_CHANGE'){const last=(f.name||'').split(' / ').at(-1);return [term(f.term),scenario[last]||last].filter(Boolean).join(' · ');}
 if(f.k==='calc-CTA_SPREAD')return scope(f.scope)+' · '+f.h;
 if(type==='trend')return term(f.term)||scope(f.scope);
 if(type==='flow')return scope(f.scope)+(f.h?' · '+f.h:'')+(f.term?' · '+term(f.term):'');
 if(type==='bridge')return gamma[f.k];
 if(f.g==='rp'&&['eqWeight','bondWeight','commodityWeight'].includes(f.k))return ({eqWeight:'Azioni',bondWeight:'Obbligazioni',commodityWeight:'Materie prime'})[f.k];
 const arr=[scope(f.scope),term(f.term),scenario[f.scenario]||f.scenario];return arr.filter(Boolean).join(' · ')||f.name||M.label(f);
}
function keyOf(f){return JSON.stringify([f.doc,f.seg,f.asof,f.pub]);}
function catalog(groups){
 const out=new Map();
 for(const g of groups){
  const [type,title,...dims]=grouping(g),key=JSON.stringify([type,g.provider,g.series,g.g,g.unit,...dims,...(type==='profile'?[g.mode]:[])]);
  if(!out.has(key))out.set(key,{key,type,title,g:g.g,provider:g.provider,series:g.series,unit:g.unit,groups:[],editions:new Map(),lanes:[]});
  const spec=out.get(key);spec.groups.push(g);
  for(const l of g.lanes){
   spec.lanes.push({...l,label:[label(l.points.at(-1),type),type==='trend'||type==='flow'?scenario[l.scenario]||(type==='trend'?'Attuale':''):null].filter(Boolean).join(' · '),group:g});
   for(const f of l.points){const id=keyOf(f);if(!spec.editions.has(id))spec.editions.set(id,{id,pub:f.pub,asof:f.asof,doc:f.doc,seg:f.seg,facts:[]});spec.editions.get(id).facts.push(f);}
  }
 }
 for(const s of out.values()){
  s.editions=[...s.editions.values()].sort((a,b)=>b.pub-a.pub||b.asof.localeCompare(a.asof)||String(a.id).localeCompare(String(b.id)));
  s.today=s.editions[0];s.days=[...new Set(s.lanes.flatMap(l=>l.points.map(f=>f.asof)))].sort();
  s.all=s.lanes.flatMap(l=>l.points);s.links=[...new Set(s.today.facts.flatMap(f=>w.ReportLinks.playbooks(f)))];
 }
 const order=s=>s.type==='trend'?0:s.g==='cta'&&s.groups[0].k==='weight'?1:s.type==='flow'?2:s.type==='bridge'?3:s.groups[0].k==='gex'?4:s.groups[0].k==='leverage'?5:s.type==='profile'?6:7;
 return [...out.values()].sort((a,b)=>b.today.pub-a.today.pub||order(a)-order(b)||Number(!!a.groups[0].calc)-Number(!!b.groups[0].calc)||a.title.localeCompare(b.title)||a.key.localeCompare(b.key));
}
const topicOrder=['cta','alloc','dealer','flows','macro'];
const topicNames={cta:'CTA · trend e livelli',alloc:'Allocazione e leva',dealer:'Gamma e regime di mercato',flows:'Flussi sistematici',macro:'Mercato e macro'};
const topics={cta:'cta',vc:'alloc',rp:'alloc',hf:'alloc',dealer:'dealer',vol:'dealer',disp:'dealer',vixetn:'dealer',letf:'flows',sys:'flows',buy:'flows',pension:'flows',market:'dealer',macro:'macro'};
function spreads(specs){
 const all=new Map();
 for(const spec of specs){
  const family=topics[spec.g]||'macro',groupKey=JSON.stringify([spec.provider,spec.series,family]);
  if(!all.has(groupKey))all.set(groupKey,{key:groupKey,family,title:topicNames[family],provider:spec.provider,series:spec.series,releases:new Map()});
  const book=all.get(groupKey);
  for(const [index,ed] of spec.editions.entries()){
   const key=JSON.stringify([ed.doc,ed.seg,ed.pub]);
   if(!book.releases.has(key))book.releases.set(key,{key,doc:ed.doc,seg:ed.seg,pub:ed.pub,panels:[],count:0});
   const release=book.releases.get(key);release.panels.push({spec,ed,index,key:JSON.stringify([spec.key,ed.asof])});release.count+=ed.facts.length;
  }
 }
 const seriesOrder=p=>p.spec.type==='trend'||p.spec.type==='flow'||p.spec.type==='bridge'?0:p.spec.groups[0].k==='expiryGamma'?1:p.spec.groups[0].k==='weight'?1:p.spec.groups[0].k==='leverage'?1:p.spec.groups[0].calc?3:2;
 for(const b of all.values()){
  b.releases=[...b.releases.values()].sort((a,b)=>b.pub-a.pub||a.key.localeCompare(b.key));
  for(const v of b.releases)v.panels.sort((a,b)=>seriesOrder(a)-seriesOrder(b)||Number(!!a.spec.groups[0].calc)-Number(!!b.spec.groups[0].calc)||a.spec.title.localeCompare(b.spec.title)||b.ed.asof.localeCompare(a.ed.asof));
 }
 return [...all.values()].sort((a,b)=>b.releases[0].pub-a.releases[0].pub||topicOrder.indexOf(a.family)-topicOrder.indexOf(b.family)||a.key.localeCompare(b.key));
}

function previous(s,f){const lane=s.lanes.find(l=>l.key===f.key);return lane?.points.filter(x=>x.asof<f.asof&&x.pub<=f.pub).at(-1)||null;}
function describe(s,f){
 if(!f)return null;const p=previous(s,f),scale0=scale(s.unit,Math.max(Math.abs(f.v||0),Math.abs(p?.v||0)));
 const deltaUnit=s.unit==='%'?'pp':scale0.unit;
 return {label:label(f,s.type),metric:M.label(f),value:F(f.v)?num(f.v,scale0.fac)+' '+scale0.unit:'Discordante',scenario:scenario[f.scenario]||f.scenario,mode:C.modes[f.mode]||f.mode,asof:f.asof,publication:f.pub,scope:scope(f.scope),h:f.h||'',prior:p?{asof:p.asof,value:num(p.v,scale0.fac)+' '+scale0.unit,delta:F(f.v)&&F(p.v)?num(f.v-p.v,scale0.fac,true)+' '+deltaUnit:'n/d'}:null,
 interval:f.interval?f.interval.map(v=>num(v,scale0.fac)).join(' – ')+' '+scale0.unit:'',refs:f.refs||[],usable:!!f.usable};
}
function insight(spec,f,edition){
 const facts=edition.facts,ss=scale(spec.unit,Math.max(0,...facts.filter(x=>F(x.v)).map(x=>Math.abs(x.v))));
 if(spec.type==='trend'){
  const group=facts.filter(x=>x.term===f.term&&x.scope===f.scope&&F(x.v)),base=group.find(x=>!x.scenario);
  if(!base)return '';
  if(f.scenario)return term(f.term)+' · '+scenario[f.scenario]+' a '+f.h+' sposta il trend da '+num(base.v)+' a '+num(f.v)+' ('+num(f.v-base.v,1,true)+' pp).';
  const branches=group.filter(x=>x.scenario),horizons=[...new Set(branches.map(x=>x.h))];if(!branches.length||horizons.length!==1)return '';
  return term(f.term)+' · attuale '+num(base.v)+'%. A '+horizons[0]+' gli scenari pubblicati vanno da '+num(Math.min(...branches.map(x=>x.v)))+'% a '+num(Math.max(...branches.map(x=>x.v)))+'%.';
 }
 if(spec.type==='flow'){
  const group=facts.filter(x=>x.scope===f.scope&&x.term===f.term&&x.h===f.h&&F(x.v));if(group.length<2)return '';
  const a=group.reduce((a,b)=>a.v<b.v?a:b),b=group.reduce((a,b)=>a.v>b.v?a:b);
  return scope(f.scope)+' · '+f.h+' · '+(b.v<0?'Vendite in tutti gli scenari pubblicati. ':a.v>0?'Acquisti in tutti gli scenari pubblicati. ':'Il segno del flusso dipende dallo scenario. ')+'Minimo '+num(a.v,ss.fac,true)+' ('+scenario[a.scenario]+'), massimo '+num(b.v,ss.fac,true)+' ('+scenario[b.scenario]+') '+ss.unit+'.';
 }
 if(f.g==='cta'&&f.k==='weight')return (f.scope==='US'?'Sulla coorte USA':'Su '+scope(f.scope))+' la posizione '+(f.v<0?'è corta':f.v>0?'è lunga':'è neutrale')+' per '+num(Math.abs(f.v))+'%. La direzione dello stop-out richiede il trigger sul prezzo.';
 if(f.g==='vc'&&f.k==='leverage')return 'Leva stimata '+num(f.v)+'× per il mandato '+f.term+'. Per misurare il ribilanciamento servono il target aggiornato e l’esposizione già detenuta.';
 if(f.k==='gex'||f.k==='expiryGamma')return 'Gamma firmata '+num(f.v,ss.fac,true)+' '+ss.unit+' · '+(f.term||f.asof)+'. La copertura effettiva dipende anche dal movimento del sottostante e dall’inventario al cutoff.';
 return '';
}
const esc=e;const text=(x,y,t,opts='')=>'<text x="'+x+'" y="'+y+'" '+opts+'>'+e(t)+'</text>';
const line=(a,b,c,d,col=rule,opts='')=>'<line x1="'+a+'" y1="'+b+'" x2="'+c+'" y2="'+d+'" stroke="'+col+'" '+opts+'/>';
const rect=(x,y,width,height,fill,opts='')=>'<rect x="'+x+'" y="'+y+'" width="'+Math.max(0,width)+'" height="'+Math.max(0,height)+'" fill="'+fill+'" '+opts+'/>';
const anch=(side,color=pale,size=13)=>'text-anchor="'+side+'" fill="'+color+'" font-size="'+size+'"';
const circle=(x,y,r,color)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+color+'" stroke="'+canvas+'" stroke-width="2"/>';
function range(vals,zero=true){
 let lo=Math.min(...vals),hi=Math.max(...vals);if(!F(lo)||!F(hi))return [0,1];
 if(zero){lo=Math.min(0,lo);hi=Math.max(0,hi);}if(lo===hi){const d=lo===0?1:Math.abs(lo)*.12;return [lo-d,hi+d];}
 const rough=(hi-lo)/4,p=Math.pow(10,Math.floor(Math.log10(rough))),u=rough/p,step=(u<=1?1:u<=2?2:u<=2.5?2.5:u<=5?5:10)*p;
 return [Math.floor(lo/step)*step,Math.ceil(hi/step)*step,step];
}
function make(s,{view='snapshot',edition=0,historyLane=0,windowSize=0,width=860,page=0}={}){
 const ed=s.editions[Math.max(0,Math.min(edition,s.editions.length-1))],W=Math.max(240,Math.min(1800,Math.round(width))),compact=W<560;
 const facts=ed.facts,values=facts.filter(f=>F(f.v)),units=scale(s.unit,Math.max(0,...values.map(f=>Math.abs(f.v))));
 let H=340,body='',hits=[],caption='',mode='',chunk=10,nPages=1;
 const scaleTag=(label)=>{body+=text(compact?12:22,24,label,anch('start',dim,11));};
 function hit(f,x,y,box){hits.push({f,x,y,box:box||[x-14,y-13,28,26]});}
 const ids=s.lanes.map((l,i)=>[l,i]);const lane=ids[Math.min(Math.max(0,historyLane),ids.length-1)]?.[0];
 if(view==='history'&&lane){
  mode='history';const all=lane.points.filter(f=>f.pub<=ed.pub&&f.asof<=ed.asof),a=windowSize?all.slice(-windowSize):all;
  const hs=scale(s.unit,Math.max(0,...a.flatMap(f=>[Math.abs(f.v||0),...(f.interval||[]).map(Math.abs)]))),L=compact?48:72,R=W-(compact?22:45),T=53,B=205;H=245;scaleTag(hs.unit+'  /  '+short(lane.label,compact?22:64));
  const yr=range(a.filter(f=>F(f.v)).flatMap(f=>[f.v,...(f.interval||[])]).map(x=>x/hs.fac),false),y=v=>B-(v/hs.fac-yr[0])/(yr[1]-yr[0])*(B-T);
  const ts=a.map(f=>Date.parse(f.asof+'T12:00Z')),start=ts[0],end=ts.at(-1),x=t=>start===end?(L+R)/2:L+(t-start)/(end-start)*(R-L);
  for(let j=0;j<=4;j++){const v=yr[0]+(yr[1]-yr[0])*j/4,py=B-(B-T)*j/4;body+=line(L,py,R,py)+text(L-7,py+4,fmtAxis.format(v),anch('end',dim,11));}
  if(yr[0]<0&&yr[1]>0)body+=line(L,y(0),R,y(0),amber,'stroke-dasharray="4 4"');
  let prev=null;for(const [i,f] of a.entries()){
   const px=x(ts[i]);if(!F(f.v)){prev=null;continue;}const py=y(f.v);
   if(prev)body+=line(prev[0],prev[1],px,py,'#79c9ec','stroke-width="2"');
   if(f.interval){const b=y(f.interval[0]),t=y(f.interval[1]);body+=line(px,b,px,t,amber,'stroke-width="2"')+line(px-4,t,px+4,t,amber)+line(px-4,b,px+4,b,amber);}
   body+=circle(px,py,a.length>80?3.4:5,'#95deff');hit(f,px,py);prev=[px,py];
  }
  const idx=[...new Set(Array.from({length:Math.min(a.length,compact?3:5)},(_,i)=>Math.round(i*(a.length-1)/Math.max(1,Math.min(a.length,compact?3:5)-1))))];
  for(const i of idx)body+=text(x(ts[i]),B+23,tickDate(a[i].asof),anch('middle',dim,11));
  caption=a.length===1?'Una sola osservazione disponibile. La variazione richiede una seconda edizione comparabile.':'Date di osservazione della stessa serie. Il dettaglio riporta anche la disponibilità effettiva.';
 }else if(s.type==='trend'||s.type==='flow'){
  mode='matrix';const trend=s.type==='trend';let keys=[...new Set(facts.map(f=>trend?(f.term||''):JSON.stringify([f.scope,f.h||'',f.term||''])))];
  const ord=(k)=>{if(trend)return ['short','medium','long'].indexOf(k);const [sc,h]=JSON.parse(k);const period=Number.parseInt(h)||0;return (sc==='US'?0:sc==='SPX'?1:sc==='ES'?2:5)*10000+period*(h.endsWith('M')?30:h.endsWith('W')?7:1);};
  keys.sort((a,b)=>ord(a)-ord(b)||a.localeCompare(b));
  const scenarios=['down','flat','median','up'].filter(sc=>facts.some(f=>f.scenario===sc));const legs=[...new Set(facts.filter(f=>f.scenario).map(f=>f.h||''))];
  const cols=[...(trend&&facts.some(f=>!f.scenario)?[{k:'',h:'',title:'Attuale'}]:[]),...legs.flatMap(h=>scenarios.filter(k=>facts.some(f=>f.scenario===k&&f.h===h)).map(k=>({k,h,title:scenario[k]+(trend&&legs.length>1?' '+h:'')})))];
  // A flow horizon identifies its row. Collapse scenario headings across the different row maturities.
  if(!trend){cols.splice(0,cols.length,...scenarios.map(k=>({k,title:scenario[k]})));}
  chunk=8;nPages=Math.max(1,Math.ceil(keys.length/chunk));keys=keys.slice(page*chunk,(page+1)*chunk);
  const L=compact?74:Math.min(128,W*.20),R=W-(compact?8:22),T=66,gap=compact?3:7,cellW=(R-L)/Math.max(1,cols.length),rh=compact?49:54,peak=Math.max(1,...values.map(f=>Math.abs(f.v)));
  H=T+rh*keys.length+35;scaleTag(units.unit+(trend&&legs.length===1?'   /   proiezione '+legs[0]:''));
  cols.forEach((c,j)=>{body+=text(L+(j+.5)*cellW,T-12,c.title,anch('middle',j===0&&trend?pale:dim,compact?10:13));});
  for(const [i,k] of keys.entries()){
   const ry=T+i*rh,group=facts.filter(f=>(trend?(f.term||''):JSON.stringify([f.scope,f.h||'',f.term||'']))===k);
   const name=trend?term(k):scope(group[0].scope);body+=text(L-9,ry+rh/2+(trend?3:-3),short(name,compact?10:21),anch('end',pale,compact?11:14));
   if(!trend)body+=text(L-9,ry+rh/2+14,[group[0].h,term(group[0].term)].filter(Boolean).join(' · '),anch('end',dim,11));
   for(const [j,c] of cols.entries()){
    const f=group.find(f=>(f.scenario||'')===c.k&&(!trend||(f.h||'')===c.h)),v=f?.v,xx=L+j*cellW,ww=cellW-gap,hh=rh-gap,col=v<0?down:v>0?up:dim,mid=xx+ww/2;
    body+=rect(xx,ry,ww,hh,'#202527','rx="2"');
    if(F(v)){const intensity=Math.abs(v)/peak;
     body+=rect(xx,ry,ww,hh,col,'opacity="'+(.07+.28*intensity)+'" rx="2"');
     const ref=group.find(x=>trend?!x.scenario&&!(x.h||''):x.scenario==='flat'),showDelta=F(ref?.v)&&ref!==f;
     body+=text(mid,ry+hh*(showDelta?.37:.5),num(v,units.fac,true),anch('middle',pale,compact?12:16));
     if(showDelta)body+=text(mid,ry+hh*.68,'Δ '+num(v-ref.v,units.fac,true),anch('middle',dim,compact?9:10));
     body+=line(xx+8,ry+hh-9,xx+ww-8,ry+hh-9,'#575e60')+line(mid,ry+hh-12,mid,ry+hh-6,'#b0bdce')+line(mid,ry+hh-9,mid+Math.sign(v)*intensity*Math.max(1,(ww-16)/2),ry+hh-9,col,'stroke-width="3"');}
    else body+=rect(xx,ry,ww,hh,'url(#rfHatch)')+text(mid,ry+hh*.6,'n/d',anch('middle',dim,12));
    if(f)hit(f,mid,ry+hh/2,[xx,ry,ww,hh]);
   }
  }
  caption=trend?'Forza del trend in %. Δ in punti percentuali rispetto all’attuale, per lo stesso orizzonte del modello.':'Flusso netto in '+units.unit+'. Δ rispetto allo scenario invariato dello stesso universo e orizzonte, se disponibile.';
 }else if(s.type==='bridge'&&Object.keys(gamma).every(k=>facts.some(f=>f.k===k&&F(f.v)))){
  mode='bridge';const a=Object.keys(gamma).map(k=>facts.find(f=>f.k===k));const totals=[a[0].v,a[0].v+a[1].v,a[0].v+a[1].v+a[2].v,a[3].v],yr=range([0,...totals.map(v=>v/units.fac)]),L=compact?42:66,R=W-(compact?9:26),T=51,B=187,y=v=>B-(v/units.fac-yr[0])/(yr[1]-yr[0])*(B-T),step=(R-L)/4;
  H=238;scaleTag(units.unit+'   /   '+(a[3].h||''));for(let j=0;j<=4;j++){const py=B-(B-T)*j/4;body+=line(L,py,R,py)+text(L-7,py+4,fmtAxis.format(yr[0]+(yr[1]-yr[0])*j/4),anch('end',dim,11));}
  body+=line(L,y(0),R,y(0),'#8a9eb2');for(const [i,f] of a.entries()){
   const start=i===0||i===3?0:totals[i-1],end=totals[i],cx=L+(i+.5)*step,bw=step*.54,py=y(end),py0=y(start),col=i===3?'#89c6f2':f.v<0?down:up;
   body+=rect(cx-bw/2,Math.min(py,py0),bw,Math.max(2,Math.abs(py-py0)),col,'opacity=".79"')+line(cx-bw/2,py,cx+bw/2,py,col,'stroke-width="2"');
   if(i<2)body+=line(cx+bw/2,py,cx+step-bw/2,py,dim,'stroke-dasharray="4 3"');
   body+=text(cx,Math.max(T-13,Math.min(py,py0)-8),num(f.v,units.fac,true),anch('middle',pale,compact?11:15))+text(cx,B+23,compact?['Non-0DTE','0DTE','Rett. OI','Media'][i]:gamma[f.k],anch('middle',dim,compact?10:12));
   hit(f,cx,(py+py0)/2,[cx-step*.47,T-17,step*.94,B-T+50]);
  }
  const gapValue=totals[2]-totals[3];caption='Somma componenti '+num(totals[2],units.fac)+' · media pubblicata '+num(totals[3],units.fac)+' · scarto '+num(gapValue,units.fac)+' '+units.unit+'.';
 }else{
  mode='profile';const ordered=[...facts].sort((a,b)=>label(a,s.type).localeCompare(label(b,s.type),'it',{numeric:true})||a.k.localeCompare(b.k)),chunkSize=8;
  nPages=Math.max(1,Math.ceil(ordered.length/chunkSize));const a=ordered.slice(page*chunkSize,(page+1)*chunkSize);
  const prior=f=>previous(s,f);const rangeValues=ordered.flatMap(f=>[f.v,...(f.interval||[]),prior(f)?.v]).filter(F),sc=scale(s.unit,Math.max(0,...rangeValues.map(Math.abs))),rr=range(rangeValues.map(v=>v/sc.fac)),L=compact?72:Math.min(170,W*.22),R=W-(compact?64:105),T=69,rowH=a.length<3?55:37;
  const x=v=>L+(v/sc.fac-rr[0])/(rr[1]-rr[0])*(R-L),zx=x(0);H=Math.max(151,T+a.length*rowH+33);scaleTag(sc.unit);
  for(let j=0;j<=4;j++){const xx=L+(R-L)*j/4;body+=line(xx,T-14,xx,T+rowH*a.length,rule,'stroke-dasharray="2 4"')+text(xx,T-23,fmtAxis.format(rr[0]+(rr[1]-rr[0])*j/4),anch('middle',dim,10));}
  body+=line(zx,T-15,zx,T+rowH*a.length,'#8b9db1');
  a.forEach((f,i)=>{const yy=T+(i+.46)*rowH,col=f.v<0?down:s.type==='profile'||f.v===0?tint[i%tint.length]:'#8bcedf',lab=label(f,s.type);
   if(compact&&lab.includes(' · ')){const parts=lab.split(' · ');body+=text(L-7,yy-4,short(parts.shift(),10),anch('end',pale,10))+text(L-7,yy+10,short(parts.join(' · '),10),anch('end',dim,9));}
   else body+=text(L-9,yy+4,short(lab,compact?10:25),anch('end',pale,compact?10:12));
   body+=line(L,yy,R,yy,'#383d3f');
   if(F(f.v)){const v=x(f.v);body+=line(zx,yy,v,yy,col,'stroke-width="3"')+circle(v,yy,6,col);
    if(f.interval){const u=x(f.interval[0]),b=x(f.interval[1]);body+=line(u,yy+9,b,yy+9,amber,'stroke-width="2"')+line(u,yy+5,u,yy+13,amber)+line(b,yy+5,b,yy+13,amber);}
    const p=prior(f);if(F(p?.v)){const xx=x(p.v);body+=line(xx,yy-8,xx,yy+8,amber,'stroke-width="2"');}
    body+=text(W-(compact?6:18),yy+4,num(f.v,sc.fac),anch('end',pale,compact?12:16));hit(f,v,yy,[0,yy-rowH*.43,W,rowH*.86]);
   }else{body+=text(R,yy-5,'Discordante',anch('end',amber,11));hit(f,R,yy);}
  });
  caption=ordered.some(f=>previous(s,f))?'Tratto verticale ambra = precedente edizione comparabile. Le barre sottili sotto i punti indicano gli intervalli della fonte.':'Ogni punto è una lettura della fonte. Le barre sottili sotto i punti indicano gli intervalli di lettura, quando disponibili.';
 }
 const marker=(x,label,col,y)=>rect(x,y-7,10,3,col)+text(x+15,y-3,label,anch('start',dim,compact?9:11));const baseY=H-10;
 if(mode==='matrix'){const first=mode==='matrix'&&s.type==='flow'?['Vendite','Acquisti']:['Trend negativo','Trend positivo'];body+=marker(compact?10:22,first[0],down,baseY)+marker(compact?112:158,first[1],up,baseY)+text(W-(compact?8:22),baseY-3,'Centro = 0',anch('end',dim,compact?9:11));}
 if(mode==='bridge')body+=marker(compact?10:22,'Negativo',down,baseY)+marker(compact?91:152,'Positivo',up,baseY)+marker(compact?174:279,'Totale fonte',tint[0],baseY);
 if(mode==='profile'){body+=marker(compact?10:22,'Lettura',tint[0],baseY);if(facts.some(f=>f.interval))body+=marker(compact?86:141,'Intervallo',amber,baseY);if(facts.some(f=>previous(s,f)))body+=marker(compact?182:270,'Precedente',amber,baseY);}
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img" aria-label="'+e(s.title)+'" font-family="Consolas, monospace"><title>'+e(s.title)+'</title><defs><pattern id="rfHatch" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 L7 0" stroke="#374452"/></pattern></defs>'+rect(0,0,W,H,canvas)+body+'<g id="irCross" pointer-events="none"></g></svg>';
 return {svg,hits,width:W,height:H,caption,mode,pages:nPages,edition:ed};
}
w.ReportFigures={catalog,spreads,make,describe,insight,previous,scope,term,num,scale,label,scenario,esc};
})(window);


