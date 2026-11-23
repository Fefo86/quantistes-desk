
(function (root) {
'use strict';
const D=document, $=id=>D.getElementById(id);
const palette={bg:'#0d1928',grid:'#28394b',axis:'#4c667a',text:'#ece9dc',mono:'Consolas'};
const plotly=root.Plotly;
if(plotly){
 for(const fn of ['newPlot','react']){
  const base=plotly[fn];if(typeof base!=='function')continue;
  plotly[fn]=function(el,traces,input={},cfg={}){
   // Respect figure ranges, scales, annotations, projections and semantic trace colors.
   if(!Array.isArray(traces))return base.apply(this,arguments);
   input=input||{};cfg=cfg||{};const layout={...input,paper_bgcolor:palette.bg,plot_bgcolor:palette.bg,font:{...(input.font||{}),family:palette.mono,color:palette.text},
     hoverlabel:{...input.hoverlabel,bgcolor:'#1b3244',bordercolor:'#72949f',font:{...input.hoverlabel?.font,family:palette.mono,color:'#f4ecdc'}},
     legend:{...input.legend,font:{...input.legend?.font,family:palette.mono,color:'#c0d0d7'}},colorway:['#8abbdf','#dec19a','#7ad2bb','#bbabe1','#e99ba8','#85cee3','#dbca85','#aac8b5']};
   for(const key of Object.keys(input).filter(k=>/^[xy]axis\d*$/.test(k))){
      const ax=input[key]||{};layout[key]={...ax,automargin:true,gridcolor:palette.grid,zerolinecolor:palette.axis,linecolor:palette.axis,tickfont:{...ax.tickfont,family:palette.mono,color:'#b7c9d5'},showspikes:ax.showspikes!==false,spikemode:'across',spikesnap:'cursor',spikecolor:'#a7d8e6',spikethickness:1};
   }
   for(const key of Object.keys(input).filter(k=>/^scene\d*$/.test(k))){
     const source=input[key]||{},scene={...source,bgcolor:palette.bg};
     for(const axis of ['xaxis','yaxis','zaxis']){
       const ax=source[axis]||{},title=typeof ax.title==='string'?{text:ax.title}:(ax.title||{});
       scene[axis]={...ax,backgroundcolor:palette.bg,gridcolor:palette.grid,zerolinecolor:palette.axis,linecolor:palette.axis,
         tickfont:{...ax.tickfont,family:palette.mono,color:'#b7c9d5'},title:{...title,font:{...title.font,family:palette.mono,color:'#e8e8da'}}};
     }
     layout[key]=scene;
   }
   return base.call(this,el,traces,layout,{...cfg,responsive:true,displaylogo:false,scrollZoom:true,
     toImageButtonOptions:{format:'png',width:2560,height:1440,scale:1,...cfg.toImageButtonOptions}});
  };
 }
}
const chartSelector='.js-plotly-plot,canvas,svg[viewBox],svg[viewbox],svg[role="img"]';
let active=null,trigger=null,bar=null,modal=null,body=null,modalPlot=null,copy=null,scale=1,dx=0,dy=0,drag=null,previousFocus=null,hideTimer=0,renderToken=0;
function chartFor(el){
 if(!el?.closest||el.closest('#deskChartModal,#deskChartActions,.modebar,.q13-mark'))return null;
 const chart=el.closest('.js-plotly-plot')||el.closest(chartSelector);
 if(!chart||!chart.closest('.q13-view.on,#q15Settings.open,.view.active')||chart.closest('button,svg svg'))return null;
 const rect=chart.getBoundingClientRect();return rect.width>=145&&rect.height>=80?chart:null;
}
function title(el){
 if(el.id==='deskOutcomeChart')return $('deskFigTitle').textContent;
 const panel=el.closest('section,.card,.qt360-card,.q13-panel,.flow-card,.q26-chart-pair>section,.q16-primary,.m8-chart-card,.dx-panel,.pd-chartbox');
 return (el.getAttribute('aria-label')||el.querySelector(':scope>title')?.textContent||el.layout?.title?.text||panel?.querySelector('h2,h3,h4')?.textContent||el.id||'Grafico').replace(/\s+/g,' ').trim().slice(0,140);
}
function place(chart){
 if(!bar||modal?.open)return;active=chart;clearTimeout(hideTimer);let r=chart.getBoundingClientRect();
 bar.hidden=false;const w=bar.offsetWidth;bar.style.left=Math.max(3,Math.min(innerWidth-w-4,r.right-w-7))+'px';
 bar.style.top=Math.max(4,Math.min(innerHeight-32,r.top+5))+'px';
}
function hide(){if(bar)bar.hidden=true;}
function transform(){if(copy)copy.style.transform='translate('+dx+'px,'+dy+'px) scale('+scale+')';}
function setZoom(f){if(modalPlot){const full=modalPlot._fullLayout;if(!full?.xaxis||!full?.yaxis)return;const upd={};for(const axis of ['xaxis','yaxis']){
 const a=full[axis],r=a.range;if(!r||!['linear','log','date'].includes(a.type))continue;
 const v=r.map(x=>a.type==='date'?new Date(x).getTime():Number(x));if(!v.every(Number.isFinite))continue;const mid=(v[0]+v[1])/2;
 upd[axis+'.range']=v.map(x=>a.type==='date'?new Date(mid+(x-mid)/f).toISOString():mid+(x-mid)/f);}
 if(Object.keys(upd).length)plotly.relayout(modalPlot,upd).catch(()=>{});return;}
 scale=Math.max(1,Math.min(9,scale*f));if(scale===1){dx=0;dy=0;}transform();
}
function reset(){if(modalPlot){plotly.relayout(modalPlot,{'xaxis.autorange':true,'yaxis.autorange':true}).catch(()=>{});return;}scale=1;dx=0;dy=0;transform();}
function svgCopy(el,computed=false){
 const clone=el.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('font-family','Consolas');clone.removeAttribute('id');
 if(computed){const old=[el,...el.querySelectorAll('*')],nodes=[clone,...clone.querySelectorAll('*')];
  for(let i=0;i<old.length;i++){const s=getComputedStyle(old[i]);for(const prop of ['fill','stroke','stroke-width','stroke-dasharray','opacity','fill-opacity','stroke-opacity','font-family','font-size','font-weight','text-anchor','dominant-baseline'])nodes[i].style.setProperty(prop,s.getPropertyValue(prop));}
 }
 // Namespace local references to avoid sharing clip paths and gradients with the source.
 const ids=new Map();for(const n of clone.querySelectorAll('[id]')){ids.set(n.id,'focus-'+n.id);n.id='focus-'+n.id;}
 for(const n of [clone,...clone.querySelectorAll('*')]){for(const a of [...n.attributes]){let v=a.value.replace(/url\(["']?#([^)"']+)["']?\)/g,(s,id)=>ids.has(id)?'url(#'+ids.get(id)+')':s);if(v.startsWith('#')&&['href','xlink:href'].includes(a.name)&&ids.has(v.slice(1)))v='#'+ids.get(v.slice(1));if(v!==a.value)n.setAttribute(a.name,v);}}
 return clone;
}
function nativeSVGDownload(el){
 const clone=svgCopy(el,true),r=el.getBoundingClientRect(),vb=el.viewBox?.baseVal;
 const w=2560,h=Math.max(200,Math.round(w*(vb?.height||r.height)/(vb?.width||r.width)));
 clone.setAttribute('width',w);clone.setAttribute('height',h);clone.style.width=w+'px';clone.style.height=h+'px';
 return new Promise((resolve,reject)=>{const data=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(data),img=new Image();
 img.onload=()=>{try{const cvs=D.createElement('canvas');cvs.width=w;cvs.height=h;const ctx=cvs.getContext('2d');ctx.fillStyle=palette.bg;ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);cvs.toBlob(b=>b?resolve(b):reject(Error('PNG non disponibile')));}catch(err){reject(err);}finally{URL.revokeObjectURL(url);}};
 img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Grafico SVG non esportabile'));};img.src=url;});
}
async function save(chart){
 if(!chart)return;
 try{const name='Quantistes_'+title(chart).replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,70);
 if(chart.classList.contains('js-plotly-plot')){await plotly.downloadImage(chart,{format:'png',width:2560,height:1440,filename:name});return;}
 const blob=chart.tagName.toLowerCase()==='canvas'?await new Promise((res,rej)=>chart.toBlob(b=>b?res(b):rej(Error('PNG non disponibile')))):await nativeSVGDownload(chart);
 const url=URL.createObjectURL(blob),a=D.createElement('a');a.href=url;a.download=name+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }catch(err){if(modal?.open)$('deskModalStatus').textContent=String(err.message||err);else if(bar){bar.title=String(err.message||err);bar.querySelector('[data-inspect=save]').textContent='PNG indisponibile';}}
}
function close(){if(modal?.open)modal.close();}
async function show(chart){
 if(!chart||!modal)return;const job=++renderToken;previousFocus=D.activeElement;trigger=chart;hide();body.replaceChildren();scale=1;dx=0;dy=0;copy=null;modalPlot=null;
 $('deskModalTitle').textContent=title(chart);modal.showModal();$('deskModalClose').focus();
 try{
 if(chart.classList.contains('js-plotly-plot')&&chart.data){
   const host=D.createElement('div');host.style.cssText='height:100%;width:100%';body.append(host);modalPlot=host;
   const layout={...chart.layout,height:body.clientHeight,width:body.clientWidth,autosize:true,uirevision:null};
   await plotly.newPlot(host,chart.data.map(v=>({...v})),layout,{responsive:true,scrollZoom:true,displaylogo:false});if(job!==renderToken)return;
   $('deskModalStatus').textContent='Lettura puntuale · rotella per zoom · doppio clic per gli assi';
 }else{
   if(chart.tagName.toLowerCase()==='canvas'){copy=D.createElement('img');copy.alt=title(chart);copy.src=chart.toDataURL('image/png');}
   else{copy=svgCopy(chart,true);copy.classList.add('desk-copy');copy.removeAttribute('height');copy.removeAttribute('width');copy.removeAttribute('tabindex');}
   body.append(copy);$('deskModalStatus').textContent='Vista del grafico selezionato · rotella per zoom · trascina per spostarti';
 }
 }catch(err){$('deskModalStatus').textContent='Vista non disponibile · '+String(err.message||err);}
}
function init(){
 if(bar)return;
 bar=D.createElement('div');bar.id='deskChartActions';bar.hidden=true;bar.setAttribute('aria-label','Azioni per questo grafico');bar.innerHTML='<button data-inspect="open" type="button">↗ FOCUS</button><button data-inspect="save" type="button">↓ PNG</button>';D.body.append(bar);
 modal=D.createElement('dialog');modal.id='deskChartModal';modal.setAttribute('aria-labelledby','deskModalTitle');modal.innerHTML='<div class="desk-modal-shell"><header class="desk-modal-head"><strong id="deskModalTitle">Grafico</strong><div><button data-inspect="out" aria-label="Riduci">−</button><button data-inspect="in" aria-label="Ingrandisci">+</button><button data-inspect="reset">RESET</button><button data-inspect="save">↓ PNG</button><button id="deskModalClose" data-inspect="close">CHIUDI ×</button></div></header><div class="desk-modal-body"></div><span class="desk-modal-status" id="deskModalStatus"></span></div>';D.body.append(modal);body=modal.querySelector('.desk-modal-body');
 for(const el of [bar,modal])el.addEventListener('click',ev=>{const k=ev.target.closest('[data-inspect]')?.dataset.inspect;if(k==='open')show(active);if(k==='save')save(modal.open?(modalPlot||trigger):active);if(k==='close')close();if(k==='reset')reset();if(k==='in'||k==='out')setZoom(k==='in'?1.4:1/1.4);});
 modal.addEventListener('close',()=>{renderToken++;if(modalPlot)plotly.purge(modalPlot);modalPlot=null;copy=null;body.replaceChildren();previousFocus?.focus?.({preventScroll:true});});
 body.addEventListener('wheel',ev=>{if(modalPlot)return;ev.preventDefault();setZoom(ev.deltaY<0?1.15:1/1.15);},{passive:false});
 body.addEventListener('pointerdown',ev=>{if(!copy)return;drag=[ev.clientX-dx,ev.clientY-dy];body.setPointerCapture(ev.pointerId);});
 body.addEventListener('pointermove',ev=>{if(!drag||!copy)return;dx=ev.clientX-drag[0];dy=ev.clientY-drag[1];transform();});for(const event of ['pointerup','pointercancel'])body.addEventListener(event,()=>drag=null);
 D.addEventListener('pointerover',ev=>{if(ev.target.closest?.('#deskChartActions')){clearTimeout(hideTimer);return;}const chart=chartFor(ev.target);if(chart){place(chart);return;}clearTimeout(hideTimer);hideTimer=setTimeout(hide,240);});
 D.addEventListener('focusin',ev=>{const chart=chartFor(ev.target);if(chart)place(chart);});
 D.addEventListener('keydown',ev=>{if(ev.key.toLowerCase()==='f'&&!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&!modal.open){const chart=chartFor(ev.target);if(chart){ev.preventDefault();show(chart);}}});
 function markCharts(){for(const chart of D.querySelectorAll('.q13-view.on .js-plotly-plot,.q13-view.on canvas,.q13-view.on svg[viewBox]')){if(chart.hasAttribute('tabindex')||chart.closest('.modebar,button')||chart.getBoundingClientRect().width<145)continue;chart.setAttribute('tabindex','0');chart.setAttribute('aria-keyshortcuts','F');}}
 root.addEventListener('scroll',hide,true);root.addEventListener('desk:route',()=>{hide();setTimeout(markCharts,320);});D.addEventListener('focusin',()=>{if(!active)markCharts();},{once:true});setTimeout(markCharts,900);
 root.addEventListener('resize',()=>{hide();if(modalPlot&&modal.open)plotly.relayout(modalPlot,{height:body.clientHeight,width:body.clientWidth}).catch(()=>{});});
}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',init);else init();
})(window);

