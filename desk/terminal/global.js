
(function (w, doc) {
'use strict';
const mini = {score:'ES',market:'IV',dealer:'Δ',path:'P',audit:'Σ',reports:'R',scalp:'S'};
const names = {score:'Scoreboard',market:'Volatilità',dealer:'Dealer flow',path:'Probabilità P',audit:'Ricerca',reports:'Report',scalp:'Scalping'};
const price = new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
const et = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const el = id=>doc.getElementById(id);
let tapeSignature='', scheduled=false;
function applyRail(compact){
 doc.documentElement.dataset.qt10Rail=compact?'compact':'full';
 const btn=el('qt10RailToggle');
 if(!btn)return;
 btn.textContent=compact?'›':'‹  Comprimi';
 btn.setAttribute('aria-pressed',String(compact));
 btn.setAttribute('aria-label',compact?'Espandi navigazione':'Comprimi navigazione');
 btn.title=btn.getAttribute('aria-label');
}
function mountNav(nav){
 if(el('qt10RailToggle'))return;
 for (const b of nav.querySelectorAll('[data-ql-stage]')){
  const key=b.dataset.qlStage;
  b.dataset.mini=mini[key]||'·';
  if(names[key])b.title=names[key];
 }
 const toggle=doc.createElement('button');
 toggle.id='qt10RailToggle';toggle.type='button';toggle.setAttribute('aria-controls','qlNav');
 nav.append(toggle);
 let saved=false;
 try{saved=w.localStorage.getItem('quantistes.ui.rail.compact')==='true'}catch{}
 applyRail(saved);
 toggle.addEventListener('click',()=>{
  const compact=doc.documentElement.dataset.qt10Rail!=='compact';applyRail(compact);
  try{w.localStorage.setItem('quantistes.ui.rail.compact',String(compact))}catch{}
  requestAnimationFrame(()=>w.dispatchEvent(new Event('resize')));
 });
}
function markTime(value){
 const raw=String(value);
 if(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)&&Number.isFinite(Date.parse(raw)))return et.format(new Date(raw))+' ET';
 return raw.replace('T',' ').slice(0,16)+' ET';
}
function fields(){
 const rows=[];
 const mark=w.Desk?.state?.result,cfg=mark?.cfg;
 if(!w.Desk?.state?.stale&&Number.isFinite(cfg?.settlement)&&cfg.settlement>0&&cfg.asof)
  rows.push(['SPX ref.',price.format(cfg.settlement),markTime(cfg.asof)]);
 const snap=w.QuantistesV12?.snapshot?.(),a=snap?.es?.asof,vt=snap?.vix?.asof;
 if(Number.isFinite(snap?.es?.last)&&Number.isFinite(Date.parse(a)))
  rows.push(['ES',price.format(snap.es.last),et.format(new Date(a))+' ET']);
 if(Number.isFinite(snap?.vix?.value)&&Number.isFinite(Date.parse(vt)))
  rows.push(['VIX',price.format(snap.vix.value),et.format(new Date(vt))+' ET']);
 else {
  const date=el('deskSession')?.textContent||'',val=el('deskVix')?.textContent||'';
  const clock=(el('deskPeriod')?.textContent||'').match(/\b\d{2}:\d{2}\b/)?.[0];
  if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&clock&&/^\d+[,.]\d+$/.test(val))
   rows.push(['VIX setup',val,date+' '+clock+' ET']);
 }
 return rows;
}
function drawTape(tape){
 const rows=fields(),signature=JSON.stringify(rows);
 if(signature===tapeSignature)return;
 tapeSignature=signature;tape.replaceChildren();tape.hidden=rows.length===0;
 for(const [label,val,asof] of rows){
  const cell=doc.createElement('div');cell.className='qt10-field';
  for(const [tag,content] of [['small',label],['b',val],['time',asof]]){
   const node=doc.createElement(tag);node.textContent=content;cell.append(node);
  }
  tape.append(cell);
 }
}
function render(){
 const nav=el('qlNav');
 if(nav)mountNav(nav);
 const head=doc.querySelector('#q13App .q13-header');
 if(!head)return;
 const search=el('q15ToolsButton');
 if(search&&!search.hasAttribute('data-qt10')){
  search.dataset.qt10='1';search.textContent='Cerca';search.setAttribute('aria-label','Cerca strumento');
  const key=doc.createElement('kbd');key.className='qt10-shortcut';key.textContent=/Mac/i.test(navigator.platform||'')?'⌘ K':'Ctrl K';search.append(key);
 }
 let tape=el('qt10Tape');
 if(!tape){tape=doc.createElement('div');tape.id='qt10Tape';tape.className='qt10-tape';tape.setAttribute('aria-label','Prezzi e riferimenti con data e ora');tape.hidden=true;head.querySelector('.q13-brand')?.after(tape)}
 drawTape(tape);
}
function next(){
 if(scheduled)return;
 scheduled=true;requestAnimationFrame(()=>{scheduled=false;render()});
}
function showActive(e){
 next();
 if(w.matchMedia('(min-width:1200px)').matches)return;
 const stage=e.detail?.stage;
 requestAnimationFrame(()=>{
  const nav=el('qlNav'),active=Array.from(nav?.querySelectorAll('[data-ql-stage]')||[]).find(b=>b.dataset.qlStage===stage);
  if(!active||!nav.clientWidth)return;
  const viewport=nav.getBoundingClientRect(),box=active.getBoundingClientRect();
  if(box.right>viewport.right)nav.scrollLeft+=box.right-viewport.right;
  else if(box.left<viewport.left)nav.scrollLeft-=viewport.left-box.left;
 });
}
w.addEventListener('desk:route',showActive);
for(const name of ['quantistes:v12-feed','desk:frame-changed','quantistes:research-stale','quantistes:distribution','desk:markets','desk:dealer-fields','resize','load'])w.addEventListener(name,next);
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',next,{once:true});else next();
})(window,document);

