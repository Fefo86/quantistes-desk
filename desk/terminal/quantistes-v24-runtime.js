
/* QUANTISTES / DESIGN SYSTEM 24
   UI orchestration only. The original numerical engines, parsers and tools are not replaced. */
(function(root){'use strict';
const $=id=>document.getElementById(id);
const readable=id=>($(id)?.textContent||'').replace(/\s+/g,' ').trim();
const finite=Number.isFinite;
const fmt=(v,n=1)=>finite(+v)?Number(v).toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const stageMap={score:['COMMAND','Decision cockpit'],market:['VOLATILITY','SPX · Q · livelli'],dealer:['DEALER FLOW','Gamma · Vanna · Charm'],path:['PHYSICAL P','Probabilità · percorsi'],audit:['RESEARCH','Qualità delle quotazioni'],reports:['REPORT','Indicatori istituzionali'],scalp:['SCALPING','Flussi per strike']};
const tone={market:'#dedbcb',path:'#90b9f0',dealer:'#a0c3f4',audit:'#e1ddcb'};
function nyToday(){try{const x=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return x.year+'-'+x.month+'-'+x.day;}catch(_){return new Date().toISOString().slice(0,10)}}
let initialized=false,updateFrame=0,lastState='',spectrum=null,spectralData=null,selectedIndex=-1,locked=false,lastDataStamp='',lastWidth=0;
function liveScoreState(){return root.QuantistesConfluence?.getState?.()||{};}
function go(stage,tool){
 try{if(tool&&typeof root.QuantistesLayout?.tool==='function')root.QuantistesLayout.tool(stage,tool);
 else if(typeof root.QuantistesLayout?.go==='function')root.QuantistesLayout.go(stage);
 else root.QuantistesConfluence?.go?.(stage);
 }catch(e){console.warn('Navigazione studio:',e.message)}
}
function renameNav(){
 const nav=$('qlNav');if(!nav)return;
 nav.setAttribute('aria-label','Quantistes · navigazione desk');
 for(const b of nav.querySelectorAll('button[data-ql-stage]')){
  const pair=stageMap[b.dataset.qlStage];if(!pair)continue;
  const s=b.querySelector('span');if(!s)continue;
  const small=s.querySelector('small');for(const n of s.childNodes){if(n.nodeType===3){n.nodeValue=pair[0];break;}}
  if(small)small.textContent=pair[1];b.setAttribute('title',pair[0]+' · '+pair[1]);
 }
 for(const [id,label] of [['qlOpenData','◎ DATA HUB'],['qlFindTools','⌕ STRUMENTI'],['qlOpenEvidence','◈ EVIDENCE']]){
  const b=$(id);if(b){const t=b.querySelector('b');if(t)t.textContent=label;b.setAttribute('title',label)}
 }
 for(const b of document.querySelectorAll('.ql-studio .ql-studio-start>button')){
  b.textContent=b.closest('[data-q13-panel]')?.dataset.q13Panel==='market'?'SINTESI + CHART':'SINTESI';
 }
 const description={score:'SCORE / READINESS',market:'PREZZI → VOLATILITÀ → Q',dealer:'POSIZIONAMENTO → HEDGE',path:'PROBABILITÀ → EVENTI',audit:'FONTI E REGIMI'};
 for(const [stage,desc] of Object.entries(description)){
  const e=document.querySelector('[data-q13-panel="'+stage+'"] .ql-studio-kicker');if(e)e.textContent=desc;
 }
 const guide=$('qlDataGuide');if(guide){
  const head=guide.querySelector('h3');if(head)head.textContent='DATA HUB / NUOVA SESSIONE SPXW';
  const desc=head?.nextElementSibling;if(desc)desc.textContent='Importa la chain ThetaData, controlla data e cutoff ET, imposta il settlement SPX, quindi calcola usando il motore CVI nativo. Gli strumenti avanzati e le altre sorgenti restano disponibili qui sotto.';
 }
 const feeds=$('qlFeeds');if(feeds){const t=feeds.querySelector('.ql-feeds-title');if(t)t.textContent='FEED COMPLEMENTARI · STRUMENTI NATIVI';}
 const title=document.querySelector('[data-q13-panel="score"] .q13-screen-title h1');
 if(title){title.innerHTML='CENTRAL <span>SCOREBOARD</span>';}
 document.title='QUANTISTES · INSTITUTIONAL DESK / CENTRAL SCOREBOARD';
}
function mountContext(){
 const nav=$('qlNav');if(!nav||$('q24Context'))return;
 const bar=document.createElement('div');bar.id='q24Context';
 const l=document.createElement('div');l.className='q24-context-left';
 const dot=document.createElement('span');dot.className='q24-dot';dot.setAttribute('aria-hidden','true');
 const workflow=document.createElement('span');workflow.innerHTML='<strong id="q24StageTitle">COMMAND</strong> <span id="q24SourceNote">· INPUTS / NOT VERIFIED</span>';
 l.append(dot,workflow);
 const st=$('qlDataStatus');if(st)l.append(st);
 const right=document.createElement('div');right.className='q24-context-right';
 const stamp=$('q13StampBar');if(stamp)right.append(stamp);
 const hor=document.createElement('span');hor.id='q24WorkClock';hor.textContent='Q / SPXW ≠ P / ES 5M';right.append(hor);
 bar.append(l,right);nav.after(bar);
}
function copy(id,txt){const el=$(id);if(el&&el.textContent!==String(txt))el.textContent=String(txt)}
function mountFlowSpectrum(){
 const dealer=document.querySelector('[data-q13-panel="dealer"]'),kpis=$('q13DealerKpis');
 if(!dealer||!kpis||$('q24FlowSpectrum'))return;
 const panel=document.createElement('section');panel.id='q24FlowSpectrum';panel.className='q24-awaiting';
 panel.innerHTML='<div class="q24-spectrum-head"><div><h3>SIGNED GREEKS / SPECTRAL FIELD</h3><div class="q24-spectrum-sub" id="q24FlowProvenance">Gamma e charm nelle unità dichiarate dal provider</div></div><div class="q24-spectral-legend"><span><i></i>POSITIVO</span><span><i class="neg"></i>NEGATIVO</span><button type="button" id="q24FlowOpen">OPEN FLOW LAB ↗</button></div></div><div class="q24-spectral-canvaswrap"><canvas id="q24SpectrumCanvas" tabindex="0" role="img" aria-label="Mappa WebGL gamma e charm per strike. Usa il puntatore o le frecce per leggere i valori."></canvas><span class="q24-sp-rowname">Γ / GAMMA</span><span class="q24-sp-rowname down">Χ / CHARM</span><span class="q24-sp-hoverline" id="q24HoverLine"></span><div class="q24-sp-tip" id="q24SpectrumTip" role="status"></div></div><div class="q24-spectrum-empty">Mappa in attesa di uno scenario FlowDesk. Carica un profilo di scenario.</div><div class="q24-sp-axis"><span id="q24FlowMin">—</span><span>SPX · SPOT SCENARIO RIMAPPATO</span><span id="q24FlowMax">—</span></div><div id="q24ScenarioMetrics" class="q24-scenario-metrics"><div class="q24-scenario-metric"><small>H057 · GAMMA FLIP / SCENARIO</small><b id="q24GammaFlip">—</b><span id="q24GammaFlipSub">Non dealer live</span></div><div class="q24-scenario-metric"><small>H055 · BARICENTRO |Γ(S)| / PROXY</small><b id="q24GammaCentroid">—</b><span>Spot ponderato sulla superficie di scenario</span></div><div class="q24-scenario-metric"><small>H061 · MASSIMO |Γ(S)| / PROXY</small><b id="q24GammaPeak">—</b><span>Non è una gamma wall strike osservata</span></div></div><div class="q24-spectrum-note" id="q24FlowNote">Visualizzazione normalizzata per greca; nessun segnale operativo senza inventario dealer osservato e sincronizzato.</div>';
 kpis.after(panel);
 $('q24FlowOpen')?.addEventListener('click',()=>go('dealer','flows'));
 const canvas=$('q24SpectrumCanvas');
 canvas.addEventListener('pointermove',e=>{if(locked)return;const b=canvas.getBoundingClientRect();selectSpectral(Math.round((e.clientX-b.left)/Math.max(1,b.width)*(spectralData?.spots.length-1||0)))});
 canvas.addEventListener('pointerleave',()=>{if(!locked)hideSpectral()});
 canvas.addEventListener('click',e=>{locked=!locked;if(!locked){const b=canvas.getBoundingClientRect();selectSpectral(Math.round((e.clientX-b.left)/Math.max(1,b.width)*(spectralData?.spots.length-1||0)))}});
 canvas.addEventListener('keydown',e=>{if(!spectralData)return;if(['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape'){locked=false;hideSpectral();return}locked=true;const n=spectralData.spots.length;const k=e.key==='Home'?0:e.key==='End'?n-1:(selectedIndex>=0?selectedIndex:Math.floor(n/2))+(e.key==='ArrowLeft'?-1:1);selectSpectral(Math.max(0,Math.min(n-1,k)))}});
 if(root.ResizeObserver){new ResizeObserver(()=>drawSpectrum()).observe(panel)}
}
function selectSpectral(i){
 if(!spectralData||!spectralData.spots.length)return;
 const n=spectralData.spots.length;i=Math.max(0,Math.min(n-1,i));selectedIndex=i;
 const tip=$('q24SpectrumTip'),line=$('q24HoverLine');
 if(!tip||!line)return;
 const x=n>1?i/(n-1):0;line.style.left=(100*x)+'%';line.style.opacity='1';
 tip.style.left=`clamp(5px,${(100*x).toFixed(2)}%,calc(100% - 230px))`;tip.style.opacity='1';
 tip.textContent='SPX '+fmt(spectralData.spots[i],2)+' · Γ '+fmt(spectralData.gamma[i],2)+' · Charm '+fmt(spectralData.charm[i],2)+' · UNITÀ NON VERIFICATE'+(locked?' · LOCKED':'');
}
function hideSpectral(){selectedIndex=-1;const tip=$('q24SpectrumTip'),line=$('q24HoverLine');if(tip)tip.style.opacity='0';if(line)line.style.opacity='0'}
function scaleColumn(v,m){const s=finite(v)?Math.max(-1,Math.min(1,v/m)):0;return [Math.max(0,-s),Math.max(0,s)];}
function p98(a){const x=a.filter(finite).map(Math.abs).sort((a,b)=>a-b);return Math.max(x[Math.floor((x.length-1)*.98)]||0,1e-12)}
function prepareSpectrum(){
 if(!$('q24FlowSpectrum'))return;
 const snap=root.FlowDesk?.scenarioSnapshot?.();
 const n=Math.min(snap?.spots?.length||0,snap?.gamma?.length||0,snap?.charm?.length||0);
 if(n<6){$('q24FlowSpectrum').classList.add('q24-awaiting');return;}
 const spots=snap.spots.slice(0,n).map(Number),gamma=snap.gamma.slice(0,n).map(Number),charm=snap.charm.slice(0,n).map(Number);
 if(spots.some(x=>!finite(x)))return;
 const stamp=[n,snap.sourceDates?.gamma,snap.sourceDates?.charm,spots[0],spots[n-1],gamma[0],charm[n-1]].join('|');
 if(stamp!==lastDataStamp){
  const mg=p98(gamma),mc=p98(charm);const tex=new Uint8Array(4*n*2);
  for(let j=0;j<n;j++)for(let row=0;row<2;row++){
   const [neg,pos]=scaleColumn(row===0?gamma[j]:charm[j],row===0?mg:mc),idx=4*(row*n+j);
   tex[idx]=Math.round(255*neg);tex[idx+1]=Math.round(255*pos);tex[idx+2]=0;tex[idx+3]=255;
  }
  spectralData={spots,gamma,charm,texture:tex,n,sourceDates:snap.sourceDates||{}};lastDataStamp=stamp;
  const d=snap.sourceDates||{};copy('q24FlowProvenance','Gamma '+(d.gamma||'storica')+' / Charm '+(d.charm||'storica')+' · SCENARIO NON COEVALE');
  copy('q24FlowNote','GRADIENTE: ± intensità normalizzata separatamente per Gamma e Charm (percentile assoluto 98%). I valori puntuali sono quelli del motore FlowDesk; scenario storico / non dealer live.');
  copy('q24FlowMin',fmt(spots[0],0));copy('q24FlowMax',fmt(spots[n-1],0));
  // H057/H055/H061 are descriptive proxies on a rebased scenario curve, never measured dealer positions.
  const roots=[];for(let i=0;i<n-1;i++){const a=gamma[i],b=gamma[i+1];if(!finite(a)||!finite(b)||!(spots[i+1]>spots[i]))continue;if(a===0)roots.push(spots[i]);else if(a*b<0)roots.push(spots[i]+(spots[i+1]-spots[i])*(-a)/(b-a));}
  const reference=finite(+snap.reference)?+snap.reference:(spots[0]+spots[n-1])/2;roots.sort((a,b)=>Math.abs(a-reference)-Math.abs(b-reference));
  let total=0,mass=0;for(let i=0;i<n-1;i++){const width=spots[i+1]-spots[i],area=width*(Math.abs(gamma[i])+Math.abs(gamma[i+1]))/2;if(width>0&&finite(area)){total+=area;mass+=(spots[i]+spots[i+1])/2*area}}
  const peakIndex=gamma.reduce((best,v,i)=>finite(v)&&Math.abs(v)>Math.abs(gamma[best])?i:best,0);
  copy('q24GammaFlip',roots.length?fmt(roots[0],2):'NESSUNO');copy('q24GammaFlipSub',roots.length?(roots.length+' zero-crossing · riferimento '+fmt(reference,1)):'Zero crossing non presente nel dominio');
  copy('q24GammaCentroid',total>0?fmt(mass/total,2):'—');copy('q24GammaPeak',finite(gamma[peakIndex])?fmt(spots[peakIndex],2):'—');
 }
 $('q24FlowSpectrum').classList.remove('q24-awaiting');drawSpectrum();
}
const vertex='attribute vec2 aPos;varying vec2 uv;void main(){uv=.5*aPos+.5;gl_Position=vec4(aPos,0.,1.);}';
const fragment='precision mediump float;varying vec2 uv;uniform sampler2D uField;void main(){float band=uv.y>.5?.25:.75;vec4 sample=texture2D(uField,vec2(uv.x,band));float val=sample.g-sample.r;float v=pow(clamp(abs(val),0.,1.),.76);vec3 base=vec3(.037,.080,.111);vec3 positive=vec3(.18,.84,.70);vec3 negative=vec3(.94,.32,.43);vec3 tint=val>=0.?positive:negative;float grid=min(fract(uv.x*10.),1.-fract(uv.x*10.));vec3 c=mix(base,tint,v*.82);c+=vec3(.01,.024,.028)*smoothstep(.014,0.,grid);c*=.94+.06*sin(uv.y*6.2831);if(abs(uv.y-.5)<.003)c=vec3(.24,.33,.38);gl_FragColor=vec4(c,1.);}';
function shader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
function initGL(canvas){
 const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true})||canvas.getContext('experimental-webgl',{alpha:false,preserveDrawingBuffer:true});
 if(!gl)return null;
 const prog=gl.createProgram();gl.attachShader(prog,shader(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(prog,shader(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(prog);
 if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);
 const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 const loc=gl.getAttribLocation(prog,'aPos');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.uniform1i(gl.getUniformLocation(prog,'uField'),0);
 return {gl,texture,canvas,program:prog,lastData:''};
}
function fallbackSpectrum(c){
 const ctx=c.getContext('2d');if(!ctx||!spectralData)return;
 const {n,gamma,charm}=spectralData,w=c.width,h=c.height;ctx.fillStyle='#091a2b';ctx.fillRect(0,0,w,h);
 for(let r=0;r<2;r++)for(let i=0;i<n;i++){
  const x=i*w/n,val=(r===0?gamma:charm)[i],m=p98(r===0?gamma:charm),alpha=Math.pow(Math.min(1,Math.abs(val)/m),.75);
  ctx.fillStyle=(val>=0?'rgba(90,162,197,':'rgba(211,212,200,')+(alpha*.78)+')';ctx.fillRect(x,r*h/2,Math.ceil(w/n)+1,h/2);
 }
 ctx.fillStyle='#234464';ctx.fillRect(0,h/2,w,1);
}
function drawSpectrum(){
 const canvas=$('q24SpectrumCanvas');if(!canvas||!spectralData||!canvas.getBoundingClientRect().width)return;
 const b=canvas.getBoundingClientRect(),dpr=Math.min(root.devicePixelRatio||1,2);
 const w=Math.max(2,Math.floor(b.width*dpr)),h=Math.max(2,Math.floor(b.height*dpr));
 if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
 try{
  if(spectrum===null)spectrum=initGL(canvas)||'2d';
  if(spectrum==='2d'){fallbackSpectrum(canvas);return}
  const gl=spectrum.gl;if(!gl||gl.isContextLost?.())return;
  gl.viewport(0,0,w,h);gl.useProgram(spectrum.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,spectrum.texture);
  if(spectrum.lastData!==lastDataStamp){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,spectralData.n,2,0,gl.RGBA,gl.UNSIGNED_BYTE,spectralData.texture);spectrum.lastData=lastDataStamp}
  gl.clearColor(.03,.06,.085,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 }catch(e){console.warn('Flow WebGL fallback:',e.message);spectrum='2d';fallbackSpectrum(canvas)}
}
function mountInputSteps(){
 const guide=$('qlDataGuide');if(!guide||$('q24ImportSteps'))return;
 const bar=document.createElement('div');bar.className='q24-import-steps';bar.id='q24ImportSteps';
 for(const [no,label,id] of [['01','CHAIN CSV','csvFile'],['02','SNAPSHOT / ET','asof'],['03','SETTLEMENT','settlement'],['04','CALCOLO CVI','calculate']]){
  const b=document.createElement('button');b.type='button';b.innerHTML='<b>'+no+'</b>'+label;
  b.addEventListener('click',()=>{const target=$(id);target?.scrollIntoView({block:'center',behavior:'smooth'});if(id!=='calculate')target?.focus?.({preventScroll:true});});bar.append(b);
 }
 guide.after(bar);
}
function ensureChartTools(){
 const active=document.querySelector('.q13-view.on');if(!active)return;
 const panes=active.querySelectorAll('.q13-panel,#q16AtlasDock .q16-primary,.q15-native-host .card,#view-volcube .vc9-chartwrap');
 for(const pane of panes){
  if(pane.classList.contains('q24-chart-root')||pane.closest('#q24FlowSpectrum')||pane.closest('#q24SignalDeck'))continue;
  const chart=pane.querySelector('.js-plotly-plot,canvas,svg[viewBox],svg[viewbox]');
  if(!chart||pane.closest('[data-q13-panel="score"]'))continue;
  pane.classList.add('q24-chart-root');
  const bar=document.createElement('div');bar.className='q24-chart-actions';bar.setAttribute('aria-label','Azioni grafico');
  const focus=document.createElement('button');focus.type='button';focus.textContent='⛶ FOCUS';focus.title='Espandi il grafico';
  const png=document.createElement('button');png.type='button';png.textContent='↓ PNG';png.title='Esporta il grafico';
  focus.addEventListener('click',()=>{if(pane.classList.contains('q24-floating-focus')){pane.classList.remove('q24-floating-focus');requestAnimationFrame(reflowGraphics);return}if(document.fullscreenElement===pane){document.exitFullscreen?.();return}if(pane.requestFullscreen){pane.requestFullscreen().catch(()=>{pane.classList.add('q24-floating-focus');requestAnimationFrame(reflowGraphics)});}else{pane.classList.add('q24-floating-focus');requestAnimationFrame(reflowGraphics)}});
  png.addEventListener('click',()=>exportNativeGraph(pane));bar.append(focus,png);pane.append(bar);
 }
}
function reflowGraphics(){
 root.dispatchEvent(new Event('resize'));
 const pane=document.fullscreenElement;if(!pane)return;
 pane.querySelectorAll('.js-plotly-plot').forEach(x=>{try{root.Plotly?.Plots?.resize(x)}catch(_){}});
 try{root.VolCube9?.refresh?.()}catch(_){}
 drawSpectrum();
}
function triggerDownload(data,name){const a=document.createElement('a');a.href=data;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();if(data.startsWith('blob:'))setTimeout(()=>URL.revokeObjectURL(data),4000)}
function exportNativeGraph(pane){
 const plot=pane.querySelector('.js-plotly-plot');
 if(plot&&root.Plotly?.downloadImage){root.Plotly.downloadImage(plot,{format:'png',width:3840,height:2160,scale:1,filename:'Quantistes_Chart'}).catch?.(e=>console.warn('Export Plotly:',e.message));return}
 const svg=pane.querySelector('svg[viewBox],svg[viewbox]');
 if(svg){
  try{
   const b=svg.getBoundingClientRect(),outW=3840,outH=Math.round(3840*(b.height||450)/Math.max(1,b.width||850));
   const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
   clone.setAttribute('width',outW);clone.setAttribute('height',outH);
   const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'});
   const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=outW;c.height=outH;const ctx=c.getContext('2d');ctx.fillStyle='#0a1c2e';ctx.fillRect(0,0,outW,outH);ctx.drawImage(img,0,0,outW,outH);triggerDownload(c.toDataURL('image/png'),'Quantistes_Vector_4K.png');URL.revokeObjectURL(url)};img.onerror=()=>{URL.revokeObjectURL(url);console.warn('SVG export not supported for this graph')};img.src=url;return;
  }catch(e){console.warn('Export SVG:',e.message)}
 }
 const canvas=pane.querySelector('canvas');if(canvas){try{triggerDownload(canvas.toDataURL('image/png'),'Quantistes_Chart.png')}catch(e){console.warn('Canvas export unavailable:',e.message)}}
}
function refresh(){
 if(!initialized)return;
 try{prepareSpectrum();ensureChartTools()}catch(e){console.warn('Desk UI refresh:',e.message)}
}
function init(){
 if(initialized)return;
 if(!$('qlNav')||!$('q13App')||!root.QuantistesConfluence){setTimeout(init,130);return}
 initialized=true;
 renameNav();mountContext();mountFlowSpectrum();mountInputSteps();
 document.addEventListener('fullscreenchange',()=>setTimeout(reflowGraphics,170));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const floating=document.querySelector('.q24-floating-focus');if(floating){floating.classList.remove('q24-floating-focus');requestAnimationFrame(reflowGraphics)}}});
 for(const b of document.querySelectorAll('#qlNav [data-ql-stage], .ql-studio button'))b.addEventListener('click',()=>setTimeout(refresh,190));
 root.addEventListener('resize',()=>{if(!initialized)return;requestAnimationFrame(drawSpectrum)});
 refresh();setInterval(refresh,2400);
 root.QuantistesDeskUI24=Object.freeze({version:'24.0.0',refresh,go,state:()=>({sourceUnmodified:true,webgl:spectrum&&spectrum!=='2d',flowSource: spectralData?.sourceDates||null,scenarioMetrics:{gammaFlip:readable('q24GammaFlip'),gammaCentroid:readable('q24GammaCentroid'),gammaPeak:readable('q24GammaPeak')}})});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,50));else setTimeout(init,50);
})(window);

