

(function(w){
'use strict';
const M=w.ReportChartModel,C=w.InstCore,R=w.InstReports,F=Number.isFinite;
const $=id=>document.getElementById(id),esc=t=>String(t??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const colors=['#71c6fb','#e9ac61','#8de1bc','#c3acf3','#ef929c','#8eb3ff','#dace80','#86d6d5'];
const familyColors={cta:'#f0b071',vc:'#72cddc',rp:'#bba9f3',letf:'#ed96ac',dealer:'#83baff',vol:'#7fd8b5',disp:'#b7a5ee',market:'#83cad5',sys:'#eeb273',hf:'#e6c68e',buy:'#88d9b1',pension:'#d7b38f',macro:'#c3b4db'};
const signColors={down:'#ec8c92',flat:'#b1bdcb',median:'#94bdf7',up:'#77d6af'};
const dayStamp=ms=>F(ms)?new Date(ms).toISOString().slice(0,19).replace('T',' ')+' UTC':'—';
const formatter=new Intl.NumberFormat('it-IT',{maximumSignificantDigits:7});
const val=(f,n=f.v)=>F(n)?formatter.format(n)+' '+M.unit(f):'Discordante';
const opts=(vals,now)=>'<option value="">Tutti</option>'+vals.map(([k,title])=>'<option value="'+esc(k)+'"'+(now===k?' selected':'')+'>'+esc(title)+'</option>').join('');
const tableSize=12;
const G=w.ReportFigures;
let requestedMetric='',picked=null,books=[],currentBook=null,currentRelease=null,releaseKey='',panels=[],choices=['',''],lanes=[0,0],plotPages=[0,0],drawings=[],windowN=0,obs=null,focusIndex=-1,activePanel=0,pinned=false,resize=0;
function resetPanes(){choices=['',''];lanes=[0,0];plotPages=[0,0];}
const S={clock:'latest',utc:'',doc:null,seg:null,family:'',issuer:'',scope:'',term:'',view:'snapshot',page:0,tablePages:new Map(),pageGroups:[],lanePages:new Map(),renderKey:'',model:null,rawVersion:-1,rows:null};
let sequence=0,dataKey='',scheduled=false,queueTimer=0,charts=[],narrPage=0,issuePage=0;
function atReports(){return w.QuantistesFlatDesk?.state?.().tool==='report-charts';}
function go(){w.QuantistesFlatDesk?.go('reports','report-charts');queue();}
function atDesk(){requestedMetric='';S.clock='desk';S.doc=null;S.seg=null;picked=null;releaseKey='';resetPanes();S.page=0;S.family=S.issuer=S.scope=S.term='';go();}
function documentOnly(id,seg,metric=''){requestedMetric=metric;S.doc=id;S.seg=seg;S.clock='latest';picked=null;releaseKey='';resetPanes();S.page=0;S.family=S.issuer=S.scope=S.term='';go();}
function reset(){requestedMetric='';picked=null;releaseKey='';resetPanes();S.family=S.issuer=S.scope=S.term='';S.doc=null;S.seg=null;S.page=0;S.clock='latest';S.tablePages.clear();S.lanePages.clear();narrPage=issuePage=0;queue();}
function optSelect(id,t){return '<label>'+t+'<select id="'+id+'"></select></label>';}
function mount(){
 const root=$('irChartsHome');if(!root||$('irSheet'))return;
 root.innerHTML='<div id="irSheet" class="ir-sheet"><section class="ir-controls" aria-label="Selezione delle letture">'+
 '<label>Disponibilità<select id="irClock"><option value="latest">Ultima pubblicazione</option><option value="desk">Ora della scoreboard ES</option><option value="manual">Data e ora UTC</option></select></label>'+
 '<label id="irManualRow" hidden>Cutoff UTC<input id="irManualCut" type="datetime-local" step="1"></label>'+
 optSelect('irIssuer','Fonte')+optSelect('irFamily','Strategia')+optSelect('irScope','Universo')+
 '<label class="ir-query">Indicatore<input id="irQuery" type="search" placeholder="Nome, unità o scenario"></label>'+
 '<label id="irHistoryWindow" hidden>Osservazioni<select id="irWindow"><option value="0">Tutte</option><option value="20">20</option><option value="60">60</option><option value="120">120</option></select></label><div class="ir-switch" role="group" aria-label="Tipo di grafico"><button type="button" data-rp="snapshot">Ultima lettura</button><button type="button" data-rp="history">Serie storica</button></div></section>'+
 '<div class="ir-summary-line"><output id="irCoverage" aria-live="polite"></output><button type="button" data-rp="reset" id="irReset" hidden>Azzera filtri</button></div>'+
 '<div id="irCards" class="ir-cards"></div><nav class="ir-paging" id="irChartPages" aria-label="Pagine dei grafici"></nav>'+
 '<section id="irAnnotations" class="ir-annotations" hidden></section></div>';
 root.addEventListener('click',click);
 for(const [id,key] of [['irIssuer','issuer'],['irFamily','family'],['irScope','scope'],['irClock','clock'],['irManualCut','utc']])$(id).onchange=e=>{
  S[key]=e.target.value;S.page=0;picked=null;releaseKey='';resetPanes();if(key==='clock'&&S.clock==='manual'&&!S.utc)S.utc=new Date(S.model?.cut||Date.now()).toISOString().slice(0,19);narrPage=issuePage=0;queue();
 };
 $('irWindow').onchange=e=>{windowN=Number(e.target.value);queue();};
 $('irQuery').oninput=e=>{S.term=e.target.value;S.page=0;picked=null;releaseKey='';resetPanes();narrPage=issuePage=0;clearTimeout(queueTimer);queueTimer=setTimeout(queue,90);};
}
function dispose(){obs?.disconnect();obs=null;if(resize)cancelAnimationFrame(resize);resize=0;pinned=false;activePanel=0;focusIndex=-1;drawings=[];}
function queue(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;if(atReports())refresh();});}
function syncSelectors(model){
 const all=[...model.groups,...model.notes,...model.issues],map=(key,title)=>[...new Map(all.map(p=>[p[key],title(p)])).entries()].filter(a=>a[0]).sort((a,b)=>String(a[1]).localeCompare(String(b[1])));
 for(const [id,key,values] of [['irIssuer','issuer',map('provider',p=>p.provider)],['irFamily','family',map('g',p=>C.groups[p.g]||p.g)],['irScope','scope',map('scope',p=>C.scopes[p.scope]||p.scope)]]){
  const el=$(id);if(S[key]&&!values.some(a=>a[0]===S[key]))values.push([S[key],key==='family'?C.groups[S[key]]:key==='scope'?C.scopes[S[key]]:S[key]]);
  const html=opts(values,S[key]);if(el.dataset.opts!==html){el.innerHTML=html;el.dataset.opts=html;}el.value=S[key];
 }
 $('irHistoryWindow').hidden=S.view!=='history';$('irWindow').value=String(windowN);
 $('irClock').value=S.clock;$('irManualRow').hidden=S.clock!=='manual';$('irManualCut').value=S.utc;
 if($('irQuery').value!==S.term)$('irQuery').value=S.term;
 for(const b of $('irSheet').querySelectorAll('.ir-switch button'))b.setAttribute('aria-pressed',String(b.dataset.rp===S.view));
 $('irReset').hidden=!(S.doc||S.issuer||S.family||S.scope||S.term||S.clock!=='latest');
}
const filter=p=>(!S.issuer||p.provider===S.issuer)&&(!S.family||p.g===S.family)&&(!S.scope||p.scope===S.scope)&&(!S.term||(p.search||M.norm([p.name,p.source,p.reason,p.file,C.groups[p.g],p.provider].join(' '))).includes(M.norm(S.term)));
function pages(p,n,prev,next){
 return '<button type="button" data-rp="'+prev+'" aria-label="Pagina precedente"'+(p===0?' disabled':'')+'>←</button><span>'+String(p+1)+' / '+Math.max(1,Math.ceil(n))+'</span><button type="button" data-rp="'+next+'" aria-label="Pagina successiva"'+(p+1>=n?' disabled':'')+'>→</button>';
}
async function refresh(){
 mount();if(!$('irSheet'))return;const ticket=++sequence;
 try{
  const ver=R.version();
  if(S.rawVersion!==ver){const rows=await R.chartReadings();if(ticket!==sequence||!atReports())return;S.rows=rows;S.rawVersion=ver;}
  const rows=S.rows||[],within=f=>!S.doc||f.doc===S.doc&&(S.seg==null||S.seg===f.seg);
  const now=Date.now(),manual=Date.parse(S.utc+'Z'),desk=w.InstitutionalDesk?.clock?.();
  const cut=S.clock==='latest'?M.lastRelease(S.doc?rows.filter(within):rows,now):S.clock==='desk'?desk:(F(manual)&&manual<=now?manual:null);
  const key=JSON.stringify([ver,cut,S.doc,S.seg]);
  if(dataKey!==key||!S.model){
   const model=M.build(rows,cut,{doc:S.doc,seg:S.seg}),live=F(cut)?await R.query(cut):null;
   if(S.doc&&model.groups.length){
    const old=new Map(M.build(rows,cut).groups.flatMap(g=>g.lanes.map(l=>[l.key,l.points])));
    for(const group of model.groups){for(const l of group.lanes){
     const first=l.points[0],prior=(old.get(l.key)||[]).filter(f=>f.asof<first.asof&&f.pub<=first.pub);
     l.points=prior.concat(l.points);
    }group.days=[...new Set(group.lanes.flatMap(l=>l.points.map(f=>f.asof)))].sort();}
   }
   if(ticket!==sequence||!atReports())return;
   const vintage=f=>JSON.stringify([w.ReportIntel.comparable(f),f.series?'':f.doc,f.asof,f.pub,f.v]);
   const active=new Set((live?.active||[]).map(vintage));
   const calculated=new Set((live?.derived||[]).map(d=>JSON.stringify([d.provider,d.series||'',d.scope,d.g,d.h,d.unit,d.id,d.title,d.asof,d.v])));
   for(const g of model.groups){for(const l of g.lanes)for(const f of l.points){
    f.usable=!f.conflict&&(f.calc?calculated.has(JSON.stringify([f.provider,f.series||'',f.scope,f.g,f.h,f.unit,f.k.slice(5),f.name,f.asof,f.v])):active.has(vintage(f)));
   }}
   S.model=model;S.live=live;dataKey=key;
  }
  const model=S.model,groups=model.groups.filter(filter);
  const filtered=JSON.stringify([key,S.family,S.issuer,S.scope,S.term]);
  if(S.catalogKey!==filtered){books=G.spreads(G.catalog(groups));S.catalogKey=filtered;}
  const requested=requestedMetric;requestedMetric='';
  currentBook=(requested?books.find(b=>b.releases.some(r=>r.panels.some(p=>p.spec.groups.some(g=>g.k===requested)))):null)||books.find(b=>b.key===picked)||books[0]||null;
  if(currentBook?.key!==picked){picked=currentBook?.key||null;releaseKey='';resetPanes();}
  currentRelease=(requested&&currentBook?.releases.find(r=>r.panels.some(p=>p.spec.groups.some(g=>g.k===requested))))||currentBook?.releases.find(r=>r.key===releaseKey)||currentBook?.releases[0]||null;
  if(currentRelease){releaseKey=currentRelease.key;panels=choose(currentBook,currentRelease,requested);}else{panels=[];}
  syncSelectors(model);
  const paintKey=JSON.stringify([filtered,S.view,picked,releaseKey,choices,lanes,windowN,plotPages,narrPage,issuePage]);
  if(paintKey===S.renderKey)return;S.renderKey=paintKey;dispose();
  const ctx=S.doc?rows.find(within):null;
  const total=currentRelease?.count||0;
  $('irCoverage').textContent=books.length+' tavole · '+total+' valori nella tavola'+(ctx?' · '+ctx.file:'')+(F(cut)?' · cutoff '+dayStamp(cut):'');
  if(currentBook){
   $('irCards').innerHTML=stage();wire();
  }else{
   const reason=!rows.length?'Carica un PDF istituzionale per vedere i suoi indicatori.':!F(cut)?(S.clock==='desk'?'Imposta una seduta nella scoreboard ES.':S.clock==='manual'?'Inserisci un cutoff UTC valido già trascorso.':'Manca una pubblicazione datata utilizzabile.'):'Nessuna misura numerica corrisponde a fonte, universo e cutoff selezionati.';
   $('irCards').innerHTML='<section class="ir-await"><p>'+esc(reason)+'</p><button type="button" data-rp="docs">Documenti e letture</button>'+(!rows.length?'<button type="button" data-rp="upload">Carica PDF nel Data Hub</button>':'')+'</section>';
  }
  $('irChartPages').innerHTML='';renderAnnotations(model);
 }catch(e){if(ticket===sequence&&atReports()){dispose();S.renderKey='';S.pageGroups=[];S.model=null;dataKey='';$('irCards').replaceChildren();$('irChartPages').replaceChildren();$('irAnnotations').hidden=true;$('irCoverage').textContent='Tavola non disponibile · '+e.message;}}
}
function sourceButton(f,title){return '<button type="button" data-rp="source" data-doc="'+esc(f.doc)+'" data-seg="'+esc(f.seg??'')+'" data-fact="'+esc(f.id??'')+'">'+esc(title||f.provider+' · p. '+f.page)+'</button>';}
function panelName(p){
 const s=p.spec;return (s.g==='rp'?'Risk parity · ':s.g==='vc'?'Vol control · ':'')+s.title;
}
function selectHtml(id,label,rows,index){
 return '<label>'+esc(label)+'<select id="'+id+'">'+rows.map((txt,i)=>'<option value="'+i+'"'+(i===index?' selected':'')+'>'+esc(txt)+'</option>').join('')+'</select></label>';
}
function choose(book,release,preferred){
 const panels=release.panels;
 let left=preferred?panels.findIndex(p=>p.spec.groups.some(g=>g.k===preferred)):-1;
 if(left<0)left=panels.findIndex(p=>p.key===choices[0]);if(left<0)left=0;
 let right=panels.findIndex((p,i)=>i!==left&&p.key===choices[1]);
 if(right<0&&book.family==='alloc')right=panels.findIndex((p,i)=>i!==left&&p.spec.g!==panels[left].spec.g&&p.spec.groups[0].k==='leverage');
 if(right<0)right=panels.findIndex((p,i)=>i!==left&&p.spec.key!==panels[left].spec.key);
 if(right<0&&panels.length>1)right=left===0?1:0;
 choices=[panels[left].key,right>=0?panels[right].key:''];
 return [left,right].filter(i=>i>=0).map(i=>panels[i]);
}
function panelHeader(panel,pos){
 const s=panel.spec,all=currentRelease.panels,names=all.map(p=>panelName(p)+(all.filter(q=>q.spec.key===p.spec.key).length>1?' · '+p.ed.asof:''));
 const selected=all.indexOf(panel);
 const series=s.lanes.map(l=>l.label);
 return '<section class="rc-panel"><div class="rc-plot-head">'+selectHtml('irMetric'+pos,'Misura',names,selected)+
 (S.view==='history'&&series.length>1?selectHtml('irLane'+pos,'Serie',series,Math.min(lanes[pos],series.length-1)):'')+
 '<span>'+esc(panel.ed.asof)+'</span></div><div id="irPlot'+pos+'" class="rc-plot" tabindex="0" role="group" aria-label="'+esc(panelName(panel))+'. Frecce per selezionare, Invio per fissare."></div>'+
 '<div class="rc-plot-foot"><span id="irFigNote'+pos+'"></span><nav class="ir-paging" id="irPlotPages'+pos+'"></nav></div></section>';
}
function stage(){
 const b=currentBook,rel=currentRelease;
 const booksOfDossier=books.filter(q=>q.provider===b.provider&&q.series===b.series);
 const dossiers=[...new Map(books.map(q=>[JSON.stringify([q.provider,q.series]),q])).values()];
 const ri=b.releases.indexOf(rel),di=dossiers.findIndex(q=>q.provider===b.provider&&q.series===b.series);
 return '<article id="irStage" class="rc-stage"><header class="rc-strip"><div class="rc-publisher"><b>'+esc(b.provider)+'</b><span>'+esc(b.series)+'</span></div><div class="rc-dates">'+
 (dossiers.length>1?selectHtml('irDossier','Pubblicazione',dossiers.map(d=>d.provider+' · '+d.series),di):'')+
 (b.releases.length>1?selectHtml('irEdition','Edizione',b.releases.map(v=>dayStamp(v.pub).slice(0,16)+' · '+(v.panels[0].ed.facts[0].file||v.panels[0].ed.asof)),ri):'<span class="rc-date">'+esc(dayStamp(rel.pub))+'</span>')+
 '<button type="button" data-rp="zoom">⛶ Espandi</button></div></header>'+
 '<nav class="rc-topics" aria-label="Tavole del report">'+booksOfDossier.map(q=>'<button type="button" data-rp="topic" data-idx="'+books.indexOf(q)+'" aria-pressed="'+String(q.key===b.key)+'">'+esc(q.title)+'</button>').join('')+'</nav>'+
 '<div class="rc-spread'+(panels.length===1?' rc-solo':'')+'">'+panels.map(panelHeader).join('')+'</div>'+
 '<div id="irInstrument" class="rc-instrument" aria-live="off"></div><div id="irPublicationImpact" class="rc-impact"></div>'+
 '<details class="rc-register"><summary>Registro della tavola <span>'+rel.count+' valori · unità, intervalli e pagine</span></summary><div id="irPointTable0"></div></details></article>';
}
function releaseFacts(){return currentRelease.panels.flatMap(p=>p.ed.facts.map(f=>({p,f})));}
function table(){
 const rows=releaseFacts(),n=Math.ceil(rows.length/tableSize),pg=Math.min(S.tablePages.get(currentRelease.key+currentBook.key)||0,Math.max(0,n-1));
 $('irPointTable0').innerHTML='<div class="ir-scroll"><table><thead><tr><th>Misura</th><th>Universo / finestra</th><th>Valore</th><th>Δ edizione</th><th>Riferimento</th><th>Fonte</th></tr></thead><tbody>'+
 rows.slice(pg*tableSize,(pg+1)*tableSize).map(({p,f})=>{const s=p.spec,d=G.describe(s,f);return '<tr><td>'+esc(d.metric)+(f.calc?' <small>derivata</small>':'')+'</td><td>'+esc([d.label,d.scenario,d.h].filter(Boolean).join(' · '))+'</td><td>'+esc(d.value)+(d.interval?'<small>'+esc(d.interval)+'</small>':'')+'</td><td>'+esc(d.prior?.delta||'—')+'</td><td>'+esc(d.asof)+'</td><td>'+f.refs.map(r=>sourceButton(r)).join(' ')+'</td></tr>';}).join('')+'</tbody></table></div>'+(n>1?'<nav class="ir-paging">'+pages(pg,n,'tprev','tnext')+'</nav>':'');
}
function clearCross(slot){const cross=$('irCross'+slot);if(cross)cross.replaceChildren();}
function inspect(pos,idx){
 const plot=drawings[pos],panel=panels[pos],h=plot?.hits[idx];if(!h||!panel)return;
 if(activePanel!==pos)clearCross(activePanel);
 activePanel=pos;focusIndex=idx;const s=panel.spec,f=h.f,d=G.describe(s,f),[x,y,w0,h0]=h.box,cross=$('irCross'+pos);
 if(cross){cross.innerHTML=plot.mode==='matrix'?'<rect x="'+(x+1)+'" y="'+(y+1)+'" width="'+Math.max(1,w0-2)+'" height="'+Math.max(1,h0-2)+'" fill="none" stroke="#ffac56" stroke-width="1.6"/>':'<path d="M'+h.x+' 32 V'+(plot.height-22)+' M8 '+h.y+' H'+(plot.width-8)+'" stroke="#b1bbb9" stroke-width=".8" stroke-dasharray="3 4"/><circle cx="'+h.x+'" cy="'+h.y+'" r="7" stroke="#ffac56" stroke-width="1.7" fill="none"/>';}
 const prev=d.prior?d.prior.delta+' da '+d.prior.asof:'Prima lettura comparabile',analytic=G.insight(s,f,plot.edition),books=w.ReportLinks.playbooks(f);
 const role=!d.usable?'Storica al cutoff':f.scenario?'Scenario della fonte':f.calc?'Misura derivata':'Vigente al cutoff';
 $('irInstrument').innerHTML='<div class="rc-probe"><div><small>'+esc(d.metric)+'</small><b>'+esc(d.value)+'</b></div><div><small>Serie</small><span>'+esc([d.label,d.scenario,d.h].filter(Boolean).join(' · '))+'</span></div><div><small>Δ precedente</small><span>'+esc(prev)+'</span></div><div><small>'+esc(d.interval?'Intervallo':'Stato')+'</small><span>'+esc(d.interval||role)+'</span></div><div><small>Fonte · '+esc(role)+'</small><span>'+d.refs.map(r=>sourceButton(r,r.provider+' p. '+r.page)).join(' ')+'</span></div></div>'+
 (analytic||books.length?'<div class="rc-inference">'+(analytic?'<span>'+esc(analytic)+'</span>':'')+books.map(id=>'<button type="button" data-rp="book" data-book="'+esc(id)+'">'+esc(id)+' ↗</button>').join('')+'</div>':'');
}
function publicationImpact(){
 const facts=releaseFacts().map(r=>r.f),rel=currentRelease,b=currentBook,first=facts[0],rows=S.rows.filter(f=>f.provider===b.provider&&f.series===first.series&&f.pub<=rel.pub),at=w.InstEngine.at(rows,rel.pub);
 const ids=[...new Set(facts.flatMap(f=>w.ReportLinks.playbooks(f)))],checks=[];
 for(const id of ids){const gate=w.InstEngine.gates(id,at),spec=w.DeskPlaybooks?.specs?.find(x=>x.id===id);
  for(const g of gate?.evidence||[]){const matches=g.readings.filter(r=>facts.some(f=>f.refs.some(v=>v.doc===r.doc&&v.seg===r.seg&&v.id===r.id)));
   if(matches.length)checks.push('<button type="button" data-rp="book" data-book="'+esc(id)+'">'+esc(id)+' ↗</button> '+esc((spec?.labels[g.index]||'Condizione '+(g.index+1))+' '+(g.conflict?'discordante':g.value?'confermata':'assente'))+' · '+esc(matches[0].value)+' '+sourceButton(matches[0]));
  }
 }
 const time=w.InstitutionalDesk?.clock?.(),late=F(time)&&rel.pub>time;
 $('irPublicationImpact').innerHTML='<small>Playbook alla pubblicazione</small><div>'+(checks.length?checks.join(' / '):ids.length?ids.map(id=>'<button type="button" data-rp="book" data-book="'+esc(id)+'">'+esc(id)+' ↗</button>').join(' ')+' · contesto operativo':'Letture di contesto')+'</div>'+(late?'<span class="rc-late">Successiva all’ora ES selezionata</span>':'');
}
function wire(){
 const select=(id,fn)=>{const n=$(id);if(n)n.onchange=()=>{fn(+n.value);queue();};};
 select('irDossier',i=>{const docs=[...new Map(books.map(b=>[JSON.stringify([b.provider,b.series]),b])).values()];const target=docs[i];picked=books.find(b=>b.provider===target.provider&&b.series===target.series).key;releaseKey='';resetPanes();});
 select('irEdition',i=>{releaseKey=currentBook.releases[i].key;plotPages=[0,0];});
 const details=$('irStage').querySelector('details');details.ontoggle=()=>{if(details.open)table();};
 publicationImpact();
 const widths=[];
 function render(pos){
  const panel=panels[pos],el=$('irPlot'+pos);if(!el)return;
  const width=Math.round(el.getBoundingClientRect?.().width||600);
  if(width<=0||widths[pos]===width&&drawings[pos])return;widths[pos]=width;
  const data=G.make(panel.spec,{view:S.view,width,edition:panel.index,historyLane:lanes[pos],windowSize:windowN,page:plotPages[pos]});drawings[pos]=data;
  el.innerHTML=data.svg.replaceAll('irCross','irCross'+pos).replaceAll('rfHatch','rfHatch'+pos);
  $('irFigNote'+pos).textContent=data.caption;$('irPlotPages'+pos).innerHTML=data.pages>1?pages(plotPages[pos],data.pages,'sheetPrev'+pos,'sheetNext'+pos):'';
  if(activePanel===pos&&data.hits.length)inspect(pos,focusIndex>=0?Math.min(focusIndex,data.hits.length-1):S.view==='history'?data.hits.length-1:0);
 }
 const setPin=v=>{pinned=v;panels.forEach((_,i)=>{$('irPlot'+i).dataset.pinned=String(v&&i===activePanel);});};
 panels.forEach((panel,pos)=>{
  select('irMetric'+pos,i=>{const next=currentRelease.panels[i];if(next.key===choices[1-pos])choices[1-pos]=choices[pos];choices[pos]=next.key;lanes=[0,0];plotPages=[0,0];});
  select('irLane'+pos,i=>{lanes[pos]=i;});
  render(pos);const el=$('irPlot'+pos);
  const nearest=ev=>{const drawing=drawings[pos],svg=el.querySelector('svg');if(!svg||!drawing?.hits.length)return -1;const r=svg.getBoundingClientRect(),x=(ev.clientX-r.left)*drawing.width/r.width,y=(ev.clientY-r.top)*drawing.height/r.height;let best=Infinity,index=-1;
   for(const [i,h] of drawing.hits.entries()){const [l,t,ww,hh]=h.box;if(drawing.mode!=='history'&&x>=l&&x<=l+ww&&y>=t&&y<=t+hh)return i;const dist=drawing.mode==='history'?Math.abs(h.x-x)+.002*Math.abs(h.y-y):Math.hypot(h.x-x,h.y-y);if(dist<best){best=dist;index=i;}}return index;};
  el.onpointermove=ev=>{if(pinned)return;const i=nearest(ev);if(pos!==activePanel||i!==focusIndex)inspect(pos,i);};
  el.onclick=ev=>{const i=nearest(ev);if(i<0)return;const was=pinned&&activePanel===pos;inspect(pos,i);setPin(!was);};
  el.onkeydown=ev=>{const n=drawings[pos]?.hits.length||0;if(!n)return;if(ev.key==='Escape'){setPin(false);return;}
   if(['Enter',' '].includes(ev.key)){ev.preventDefault();if(activePanel!==pos)inspect(pos,0);setPin(!pinned);return;}
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(ev.key))return;ev.preventDefault();const i=activePanel===pos?focusIndex:0;inspect(pos,ev.key==='Home'?0:ev.key==='End'?n-1:Math.max(0,Math.min(n-1,i+(['ArrowDown','ArrowRight'].includes(ev.key)?1:-1))));};
 });
 if(w.ResizeObserver){obs=new w.ResizeObserver(()=>{if(resize)cancelAnimationFrame(resize);resize=requestAnimationFrame(()=>{resize=0;panels.forEach((_,i)=>render(i));});});panels.forEach((_,i)=>obs.observe($('irPlot'+i)));}
}

function pointMeta(f,l){
 const refs=f.refs||[];
 return [esc(l.title),esc(f.asof),esc(val(f)),esc(refs.map(r=>r.provider+' · p. '+r.page).join(' / ')),dayStamp(f.pub),f.interval?'Intervallo '+esc(f.interval.map(x=>val(f,x)).join(' / ')):'',f.usable?'In vigore al cutoff':f.conflict?'Discordante':'Osservazione storica'];
}
const tooltip='%{customdata[0]} · %{customdata[1]}<br><b>%{customdata[2]}</b><br>%{customdata[3]}<br>Disponibile %{customdata[4]}<br>%{customdata[5]} %{customdata[6]}<extra></extra>';
function figure(g,view){
 const hist=view==='history',all=hist?g.lanes.flatMap(l=>l.points):g.lanes.map(l=>l.points.at(-1)),peak=all.reduce((a,f)=>F(f.v)?Math.max(a,Math.abs(f.v)):a,0);
 const money=/^(USD|EUR|GBP|CAD|AUD)(\b|$)/.test(g.unit),fac=money?(peak>=1e9?1e9:peak>=1e6?1e6:peak>=1e3?1e3:1):1;
 const suffix=(fac===1e9?'mld ':fac===1e6?'mln ':fac===1e3?'mila ':'')+g.unit;
 const error=(rows)=>({type:'data',visible:rows.some(f=>Array.isArray(f.interval)&&F(f.v)),symmetric:false,
   array:rows.map(f=>f.interval&&F(f.v)?Math.max(0,f.interval[1]-f.v)/fac:0),arrayminus:rows.map(f=>f.interval&&F(f.v)?Math.max(0,f.v-f.interval[0])/fac:0),width:3,thickness:1.2,color:'#dce4ef'});
 const lineColor=(l,i)=>signColors[l.scenario]||colors[i%colors.length];
 const axis={automargin:true,fixedrange:false,showspikes:true,spikesnap:'cursor',tickfont:{size:11},zeroline:true,zerolinewidth:1.3};
 if(hist){
  const traces=g.lanes.map((l,i)=>{const col=lineColor(l,i);return {type:'scatter',mode:l.points.length>1?'lines+markers':'markers',name:esc(l.title),x:l.points.map(f=>f.asof),y:l.points.map(f=>F(f.v)?f.v/fac:null),connectgaps:false,
   customdata:l.points.map(f=>pointMeta(f,l)),line:{width:1.8,color:col,dash:['solid','dash','dot','dashdot'][Math.floor(i/colors.length)%4]},marker:{color:col,size:l.points.length>80?4:7,symbol:['circle','diamond','square','triangle-up'][i%4]},error_y:error(l.points),hovertemplate:tooltip};});
  return {traces,layout:{height:267,margin:{l:48,r:14,t:12,b:42},xaxis:{...axis,type:'date',tickformat:'%d/%m/%y',nticks:5},yaxis:{...axis,title:{text:esc(suffix),standoff:6},nticks:5},legend:{orientation:'h',x:0,y:-.25,font:{size:11}},showlegend:g.lanes.length>1,hovermode:'closest',dragmode:'zoom'}};
 }
 const items=g.lanes.map(l=>({l,f:l.points.at(-1)})),x=items.map(z=>F(z.f.v)?z.f.v/fac:null);
 const signed=['gamma','moneyvol'].includes(C.metrics?.[g.k]?.[1])||['flow','cashflow','position','net','weight','dispPosition'].includes(g.k);
 const ys=items.map((_,i)=>'p'+i);
 const trace={type:'bar',orientation:'h',y:ys,x,customdata:items.map(z=>pointMeta(z.f,z.l)),hovertemplate:tooltip,showlegend:false,
  marker:{color:items.map(({l,f},i)=>signed&&F(f.v)&&f.v!==0?(f.v>0?'#75d5b1':'#eb929c'):signColors[l.scenario]||(g.lanes.length===1?familyColors[g.g]||colors[0]:colors[i%colors.length])),line:{width:0}},error_x:error(items.map(z=>z.f))};
 return {traces:[trace],layout:{height:Math.max(170,Math.min(620,80+items.length*28)),margin:{l:49,r:22,t:8,b:38},bargap:.40,xaxis:{...axis,rangemode:'tozero',nticks:5,title:{text:esc(suffix),standoff:5}},yaxis:{...axis,type:'category',categoryorder:'array',categoryarray:ys.slice().reverse(),tickmode:'array',tickvals:ys,ticktext:items.map(z=>esc(z.l.title.length>24?z.l.title.slice(0,23)+'…':z.l.title))},showlegend:false,hovermode:'closest'}};
}
function chartSpec(g,view){return g.editions?G.make(g,typeof view==='string'?{view}:view):figure(g,view);}
function renderAnnotations(model){
 const el=$('irAnnotations'),notes=model.notes.filter(filter),issues=model.issues.filter(filter);el.hidden=!notes.length&&!issues.length;
 function list(title,rows,page,prev,next,note){if(!rows.length)return '';const n=Math.ceil(rows.length/5),p=Math.min(page,n-1);
  return '<details><summary>'+title+' · '+rows.length+'</summary>'+rows.slice(p*5,p*5+5).map(f=>'<div><p>'+esc(note?f.source:f.reason)+'</p>'+sourceButton(f)+' <small>'+esc(f.asof||'')+'</small></div>').join('')+(n>1?'<nav class="ir-paging">'+pages(p,n,prev,next)+'</nav>':'')+'</details>';
 }
 const open=[...el.querySelectorAll('details')].map(d=>d.open);
 el.innerHTML=list('Tesi pubblicate',notes,narrPage,'nprev','nnext',true)+list('Letture da verificare',issues,issuePage,'iprev','inext',false);
 [...el.querySelectorAll('details')].forEach((d,i)=>d.open=!!open[i]);
}
function click(e){const b=e.target.closest?.('[data-rp]');if(!b)return;const a=b.dataset.rp;
 if(a==='source'){w.InstPanels.source(b.dataset.doc,Number(b.dataset.seg)||null,Number(b.dataset.fact)||null);return;}
 if(a==='book'){w.DeskPlaybooks.focusBook(b.dataset.book);return;}
 if(a==='docs'){w.QuantistesFlatDesk.go('reports','report-archive');return;}
 if(a==='upload'){$('q15DataButton')?.click();$('irFiles')?.click();return;}
 if(a==='reset'){reset();return;}
 if(a==='topic'){const next=books[+b.dataset.idx];if(next){picked=next.key;resetPanes();queue();}return;}
 if(a==='history'||a==='snapshot'){S.view=a;plotPages=[0,0];queue();return;}
 if(/^sheet(Prev|Next)[01]$/.test(a)){const pos=+a.slice(-1);plotPages[pos]=Math.max(0,plotPages[pos]+(a.includes('Next')?1:-1));queue();return;}
 if(a==='tprev'||a==='tnext'){const k=currentRelease.key+currentBook.key,p=S.tablePages.get(k)||0;S.tablePages.set(k,Math.max(0,p+(a==='tnext'?1:-1)));table();return;}
 if(a==='zoom'){const el=$('irStage');if(document.fullscreenElement){document.exitFullscreen?.();}else if(el?.requestFullscreen){el.requestFullscreen().catch(()=>el.classList.toggle('rf-expanded'));}else{el?.classList.toggle('rf-expanded');}return;}
 if(a==='nprev'||a==='nnext')narrPage=Math.max(0,narrPage+(a==='nnext'?1:-1));
 if(a==='iprev'||a==='inext')issuePage=Math.max(0,issuePage+(a==='inext'?1:-1));
 renderAnnotations(S.model);
}
function route(e){if(e.detail?.tool==='report-charts'){queue();}else if(S.renderKey){sequence++;dispose();S.renderKey='';}}
w.addEventListener('desk:route',route);
w.addEventListener('desk:reports-changed',()=>{if(atReports())queue();});
w.addEventListener('desk:frame-changed',()=>{if(atReports()&&S.clock==='desk')queue();});
w.ReportWorkspace={atDesk,document:documentOnly,figure:chartSpec,mount,refresh};
})(window);


