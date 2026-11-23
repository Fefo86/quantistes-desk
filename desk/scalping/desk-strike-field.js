(function(w){
'use strict';
const F=Number.isFinite;
const nf=new Intl.NumberFormat('it-IT',{maximumFractionDigits:3});
const clock=new Intl.DateTimeFormat('it-IT',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const names={delta:'Delta',gamma:'Gamma',charm:'Charm',vanna:'Vanna',price:'Prezzo',level:'Strike'};
const colors={delta:[116,191,239],gamma:[102,214,199],charm:[182,159,234],vanna:[235,177,136],price:[121,212,218],level:[231,191,133]};
const negative=[220,137,161],midnight=[16,30,44];
const mix=(a,b,f)=>a.map((x,i)=>x+(b[i]-x)*f);
const fmt=v=>F(v)?nf.format(v):'—';
const signed=v=>F(v)?(v>0?'+':'')+fmt(v):'—';
const modeLabels={profile:'Profilo',price:'Prezzo',history:'Storico strike',map:'Mappa tempo × strike'};
const vs='attribute vec2 p; attribute vec3 col; varying vec3 tint; void main(){ gl_Position=vec4(p,0.0,1.0); tint=col; }';
const fs='precision mediump float; varying vec3 tint; void main(){gl_FragColor=vec4(tint,1.0);}';
function gpu(canvas){
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:false,stencil:false,preserveDrawingBuffer:false});
 if(!gl)return null;
 let buffer=null,program=null;const shaders=[];
 function release(){if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);for(const s of shaders)gl.deleteShader(s);}
 try{
  program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){
   const sh=gl.createShader(type);shaders.push(sh);gl.shaderSource(sh,source);gl.compileShader(sh);
   if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('Shader');gl.attachShader(program,sh);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Programma');
  const p=gl.getAttribLocation(program,'p'),color=gl.getAttribLocation(program,'col');
  buffer=gl.createBuffer();if(!buffer||p<0||color<0)throw Error('Buffer');
  return {draw(verts){
   gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
   gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,verts,gl.DYNAMIC_DRAW);
   gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,20,0);
   gl.enableVertexAttribArray(color);gl.vertexAttribPointer(color,3,gl.FLOAT,false,20,8);
   gl.drawArrays(gl.TRIANGLES,0,verts.length/5);
  },release};
 }catch{release();return null;}
}
function nearest(xs,x){let lo=0,hi=xs.length-1;while(lo<hi){const m=(lo+hi)>>>1;if(xs[m]<x)lo=m+1;else hi=m;}return lo&&x-xs[lo-1]<=xs[lo]-x?lo-1:lo;}
function series(state,mode){
 const {rows,chart,selected,coord,cadence}=state;
 const tracks=['delta','gamma','charm','vanna'];
 if(mode==='profile'){
  const seq=rows.filter(r=>F(r.x)).slice().sort((a,b)=>a.x-b.x);
  return {points:seq,keys:tracks.filter(k=>seq.some(r=>F(r[k]))),units:state.units,axis:coord,reference:state.spot,anchor:'Spot',scale:'Massimo assoluto per greca'};
 }
 if(mode==='price'){
  const seq=chart.map(r=>({x:r.ts,price:coord==='ES'?r.esSpot:r.spot,level:F(selected)&&F(r.spot)&&(coord==='SPX'||F(r.esSpot))?selected+(coord==='ES'?r.esSpot-r.spot:0):null})).filter(r=>F(r.x));
  return {points:seq,keys:['price','level'],units:{price:'pt '+coord,level:'pt '+coord},axis:'ET',cadence,scale:'Punti '+coord};
 }
 return {points:(state.history||[]).map(r=>({...r,x:r.ts})),keys:tracks.filter(k=>state.history?.some(r=>F(r[k]))),units:state.historyUnits,axis:'ET',cadence,scale:'Massimo assoluto per greca'};
}
function timeMap(state,key){
 const lanes=[],times=new Set(),values=[];
 for(const row of state.rows){
  const strike=row.raw,tape=state.tracks?.get(strike),entries=new Map();
  for(const tick of tape||[])if(F(tick.ts)&&F(tick[key])){
   entries.set(tick.ts,{v:tick[key],release:tick.availableAt});times.add(tick.ts);values.push(Math.abs(tick[key]));
  }
  if(entries.size)lanes.push({x:row.x,strike,entries});
 }
 lanes.sort((a,b)=>a.x-b.x);values.sort((a,b)=>a-b);
 return {points:[...times].sort((a,b)=>a-b).map(x=>({x})),keys:[key],units:state.historyUnits||{},lanes,
  extent:values[Math.max(0,Math.ceil(values.length*.90)-1)]||1,axis:'ET',cadence:state.cadence,
  scale:'Edizioni note al cutoff · P90 |'+names[key]+'|'};
}
function structure(parent,select,seek){
 if(!parent)return null;
 const doc=parent.ownerDocument;
 const surface=parent.querySelector('.uf-ink'),fallback=parent.querySelector('.uf-back'),overlay=parent.querySelector('.uf-axes'),host=parent.querySelector('.uf-scope');
 if(!surface?.getContext||!overlay?.getContext||!host)return null;
 const ctx=overlay.getContext('2d'),soft=fallback.getContext('2d');if(!ctx||!soft)return null;
 let hw=null;try{hw=gpu(surface);}catch{}
 let mapKey='gamma',pointY=null,mapCache=null;let mode='profile',state=null,observed=null,raf=0,layout=null,hover=null,locked=false,signature=null;
 const legend=parent.querySelector('.uf-read'),status=parent.querySelector('.uf-empty'),measure=parent.querySelector('.uf-scale');
 function request(){if(!raf)raf=w.requestAnimationFrame(()=>{raf=0;draw();});}
 function buttonState(){
  for(const b of parent.querySelectorAll('button[data-mode]')){
   b.disabled=b.dataset.mode==='map'?!state?.mapKeys?.length:b.dataset.mode==='price'?!state?.chart?.some(p=>F(state.coord==='ES'?p.esSpot:p.spot)):b.dataset.mode==='history'?!(state?.history?.length>=2):false;
   b.setAttribute('aria-pressed',String(mode===b.dataset.mode));
  }
 }
 function resizeCanvas(canvas,width,height,ratio){
  const W=Math.max(1,Math.round(width*ratio)),H=Math.max(1,Math.round(height*ratio));
  if(canvas.width!==W)canvas.width=W;if(canvas.height!==H)canvas.height=H;
 }
 function draw(){
  if(!state||!parent.isConnected||parent.clientWidth===0)return;
  const W=host.clientWidth,H=host.clientHeight;if(W<50||H<65)return;
  const ratio=Math.min(2,w.devicePixelRatio||1);
  for(const c of [surface,fallback,overlay])resizeCanvas(c,W,H,ratio);
  surface.hidden=!hw;fallback.hidden=!!hw;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,W,H);
  const chooser=parent.querySelector('.uf-map-key');if(chooser)chooser.hidden=mode!=='map';
  if(!state.mapKeys?.includes(mapKey))mapKey=state.mapKeys?.[0]||'gamma';
  if(chooser){const sel=chooser.querySelector('select');sel.value=mapKey;for(const opt of sel.querySelectorAll('option'))opt.disabled=!state.mapKeys?.includes(opt.value);}
  if(mode==='map'&&(mapCache?.identity!==state.rows||mapCache.key!==mapKey))mapCache={identity:state.rows,key:mapKey,data:timeMap(state,mapKey)};
  const data=mode==='map'?mapCache.data:series(state,mode),points=data.points,xs=points.map(r=>r.x),keys=data.keys;
  buttonState();measure.textContent=data.scale;
  const valid=points.length&&(mode==='map'?data.lanes.length:keys.some(k=>points.some(r=>F(r[k]))));
  status.hidden=!!valid;host.setAttribute('aria-label',modeLabels[mode]+(mode==='profile'?' per strike '+state.coord: ' per orario ET'));
  if(!valid){status.textContent='Osservazioni insufficienti nella selezione.';legend.replaceChildren();parent.querySelector('.uf-hair').hidden=true;const hline=parent.querySelector('.uf-yhair');if(hline)hline.hidden=true;if(hw)hw.draw(new Float32Array(0));soft.clearRect(0,0,fallback.width,fallback.height);layout=null;return;}
  const L=W<480?51:67,R=W-19,T=17,B=H-25,span=R-L;
  const xmin=xs[0],xmax=xs.at(-1),delta=xmax-xmin;
  const step=xs.slice(1).map((x,i)=>x-xs[i]).filter(v=>v>0).sort((a,b)=>a-b);
  const spacing=step.length?step[Math.floor((step.length-1)/2)]:1;
  const pad=mode==='profile'&&delta?Math.min(spacing*.65,delta*.08):0;
  const x0=xmin-pad,x1=xmax+pad;
  const X=x=>x1===x0?(L+R)/2:L+span*(x-x0)/(x1-x0);
  layout={W,H,L,R,T,B,xs,X,x0,x1,points,data};
  const verts=[],pieces=[];
  function tri(a,b,c,paint,end=paint){
   for(const [pt,col] of [[a,paint],[b,paint],[c,end]])verts.push(2*pt[0]/W-1,1-2*pt[1]/H,col[0]/255,col[1]/255,col[2]/255);
   if(!hw)pieces.push([a,b,c,paint,end]);
  }
  function quad(xa,ya,xb,yb,col,far=col){tri([xa,ya],[xb,ya],[xb,yb],col,far);tri([xb,yb],[xa,yb],[xa,ya],far,col);}
  function segment(xa,ya,xb,yb,width,col){
   const dx=xb-xa,dy=yb-ya,len=Math.hypot(dx,dy);if(!len)return;
   const ox=-dy/len*width*.5,oy=dx/len*width*.5;
   const a=[xa+ox,ya+oy],b=[xa-ox,ya-oy],c=[xb-ox,yb-oy],d=[xb+ox,yb+oy];tri(a,b,c,col);tri(a,c,d,col);
  }
  const lanes=mode==='price'?1:keys.length,lh=(B-T)/lanes;
  const ticks=Math.max(2,Math.min(8,Math.floor(span/85)));
  ctx.font='11px Consolas, monospace';ctx.textBaseline='middle';
  for(let j=0;j<ticks;j++){
   const i=Math.round(j*(xs.length-1)/(ticks-1));if(j&&i===Math.round((j-1)*(xs.length-1)/(ticks-1)))continue;
   const x=X(xs[i]);quad(x-.42,T,x+.42,B,[37,56,73]);ctx.fillStyle='#afc1cb';ctx.textAlign=j===0?'left':j===ticks-1?'right':'center';
   ctx.fillText(mode==='profile'?fmt(xs[i]):clock.format(xs[i]),x,H-10);
  }
  const priceValues=mode==='price'?points.flatMap(r=>keys.map(k=>r[k]).filter(F)):[];
  let low=Infinity,high=-Infinity;for(const p of priceValues){low=Math.min(low,p);high=Math.max(high,p);}
  const prange=high-low||1,top=high+prange*.09,bottom=low-prange*.09;
  if(mode==='map'){
   const ys=data.lanes.map(r=>r.x),dy=ys.slice(1).map((v,i)=>v-ys[i]).filter(v=>v>0).sort((a,b)=>a-b);
   const rowStep=dy.length?dy[Math.floor((dy.length-1)/2)]:1,yMin=ys[0]-rowStep/2,yMax=ys.at(-1)+rowStep/2;
   const Y=v=>B-(B-T)*(v-yMin)/(yMax-yMin),dt=(data.cadence||1)*60000;
   const width=Math.max(.7,Math.min(span,(xs.length===1?span:span*dt/(x1-x0))*.98));
   const hh=Math.max(.7,(B-T)*rowStep/(yMax-yMin)*.97);
   layout.map={ys,Y,yMin,yMax,lanes:data.lanes,width,hh};
   for(const lane of data.lanes){
    const py=Y(lane.x);
    for(const [ts,o] of lane.entries){
     const x=X(ts),strength=Math.sqrt(Math.min(1,Math.abs(o.v)/data.extent));
     const tint=o.v<0?mix([77,58,85],[225,146,167],strength):mix([37,74,87],[121,205,189],strength);
     const shade=o.v===0?[45,59,73]:mix(midnight,tint,.22+.78*strength);
     quad(Math.max(L,x-width/2),Math.max(T,py-hh/2),Math.min(R,x+width/2),Math.min(B,py+hh/2),shade);
    }
   }
   ctx.fillStyle='#c8d6dd';ctx.textAlign='left';let lastY=Infinity;
   for(const lev of ys){const py=Y(lev);if(lastY-py<24)continue;lastY=py;ctx.fillText(fmt(lev),3,py);}
   ctx.fillStyle='#c1d3da';ctx.fillText('Strike '+state.coord,4,7);
  }else for(const [j,k] of keys.entries()){
   const maxima=points.reduce((v,r)=>F(r[k])?Math.max(v,Math.abs(r[k])):v,0)||1;
   const center=T+(j+.5)*lh,Y=v=>mode==='price'?B-(v-bottom)/(top-bottom)*(B-T):center-v/maxima*(lh*.41);
   if(mode!=='price'){quad(L,center-.5,R,center+.5,[48,70,86]);ctx.fillStyle='#cbd7df';ctx.textAlign='left';ctx.fillText(names[k],4,center);}
   else if(j===0){for(let j2=0;j2<4;j2++){const v=bottom+(top-bottom)*j2/3,y=Y(v);quad(L,y-.4,R,y+.4,[48,70,86]);ctx.textAlign='left';ctx.fillStyle='#c4d1da';ctx.fillText(fmt(v),3,y);}}
   let prev=null;
   for(let i=0;i<points.length;i++){
    const r=points[i],v=r[k],xp=X(r.x);if(!F(v)){prev=null;continue;}
    const yp=Y(v);
    if(mode==='profile'){
     const width=Math.max(.6,Math.min(16,(xs.length===1?12:span*spacing/Math.max(spacing,x1-x0))*.7));
     const col=v>=0?colors[k]:negative,end=mix(midnight,col,.72+.28*Math.abs(v)/maxima);
     const left=Math.max(L,xp-width/2),right=Math.min(R,xp+width/2);
     quad(left,center,right,v===0?center+.8:yp,mix(midnight,col,.30),end);
    }else{
     if(prev&&r.x-prev.r.x<=(data.cadence||1)*90000){segment(prev.x,prev.y,xp,yp,k==='level'?1.15:1.7,colors[k]);}
     quad(xp-1.15,yp-1.15,xp+1.15,yp+1.15,colors[k]);prev={x:xp,y:yp,r};
    }
   }
  }
  if(mode==='profile'&&F(data.reference)&&data.reference>=x0&&data.reference<=x1){const x=X(data.reference);for(let y=T;y<B;y+=7)quad(x-.6,y,x+.6,Math.min(y+3,B),[231,191,133]);ctx.textAlign='left';ctx.fillStyle='#f5d3a4';ctx.fillText('Spot',Math.min(x+4,R-30),7);}
  if(hw)hw.draw(new Float32Array(verts));else{
   soft.setTransform(ratio,0,0,ratio,0,0);soft.clearRect(0,0,W,H);
   for(const [a,b,c,col,end] of pieces){
    const rgb=v=>'rgb('+v.map(Math.round).join(',')+')';let paint=rgb(col);
    if(col!==end&&(a[0]!==c[0]||a[1]!==c[1])){const grd=soft.createLinearGradient(a[0],a[1],a[0],c[1]===a[1]?a[1]+.01:c[1]);grd.addColorStop(0,paint);grd.addColorStop(1,rgb(end));paint=grd;}
    soft.fillStyle=paint;soft.beginPath();soft.moveTo(...a);soft.lineTo(...b);soft.lineTo(...c);soft.closePath();soft.fill();
   }
  }
  cursor();
 }
 function cursor(){
  if(!layout)return;
  const {W,H,L,R,T,B,xs,points,X,data}=layout,show=hover??(mode==='profile'?state.selectedDisplay:xs.at(-1));
  if(!F(show))return;
  const i=nearest(xs,show),p=points[i],x=X(p.x);
  // Cursor uses DOM for the line, leaving the GPU field and axis labels intact.
  const hair=parent.querySelector('.uf-hair');hair.hidden=false;hair.style.left=(100*x/W)+'%';
  hair.style.top=(100*T/H)+'%';hair.style.height=(100*(B-T)/H)+'%';
  const lx=mode==='profile'?fmt(p.x)+' '+state.coord:clock.format(p.x)+' ET';
  let parts=[[mode==='profile'?'Strike':'Ora',lx,''],...data.keys.map(k=>[names[k],mode==='price'?fmt(p[k]):signed(p[k]),data.units?.[k]||''])];
  const horizontal=parent.querySelector('.uf-yhair');
  if(horizontal)horizontal.hidden=mode!=='map';
  if(mode==='map'&&layout.map){
   const m=layout.map,lane=m.lanes[nearest(m.ys,pointY??state.selectedDisplay??m.ys[0])],entry=lane.entries.get(p.x);
   if(horizontal){horizontal.style.top=(100*m.Y(lane.x)/H)+'%';horizontal.style.left=(100*L/W)+'%';horizontal.style.width=(100*(R-L)/W)+'%';}
   parts=[['Ora',lx,''],['Strike',fmt(lane.x),state.coord],[names[mapKey],signed(entry?.v),data.units?.[mapKey]||''],['P90 |'+names[mapKey]+'|',fmt(data.extent),data.units?.[mapKey]||'']];
   if(F(entry?.release)&&entry.release>p.x)parts.push(['Disponibile',clock.format(entry.release)+' ET','']);
  }
  const sig=JSON.stringify(parts);if(sig===signature)return;signature=sig;
  legend.replaceChildren();for(const [name,v,u] of parts){const item=doc.createElement('span'),a=doc.createElement('small'),b=doc.createElement('b');a.textContent=name;b.textContent=v;item.append(a,b);if(u){const em=doc.createElement('em');em.textContent=u;item.append(em);}legend.append(item);}
 }
 function point(e){if(!layout)return null;const {xs,L,R,x0,x1}=layout,rect=host.getBoundingClientRect();
  if(mode==='map'&&layout.map&&F(e.clientY)){const m=layout.map;pointY=m.yMin+(layout.B-Math.max(layout.T,Math.min(layout.B,e.clientY-rect.top)))*(m.yMax-m.yMin)/(layout.B-layout.T);}
  const x=Math.max(L,Math.min(R,e.clientX-rect.left));return xs[nearest(xs,x0+(x-L)/(R-L)*(x1-x0))];}
 host.addEventListener('pointermove',e=>{if(!locked&&e.pointerType!=='touch'){hover=point(e);cursor();}});
 host.addEventListener('pointerleave',()=>{if(!locked){hover=null;cursor();}});
 function commit(inspect=true){if(!F(hover)||!layout)return;if(mode==='profile'){const p=layout.points[nearest(layout.xs,hover)];select(p.raw);}else if(mode==='map'&&layout.map){
   const m=layout.map,lane=m.lanes[nearest(m.ys,pointY??state.selectedDisplay??m.ys[0])];if(lane)select(lane.strike,inspect);
  }else locked=!locked;}
 host.addEventListener('click',e=>{hover=point(e);cursor();commit(mode!=='map');});
 function recall(){
  if(mode!=='map'||!layout?.map||!F(hover))return;
  const m=layout.map,lane=m.lanes[nearest(m.ys,pointY??state.selectedDisplay??m.ys[0])],sample=lane?.entries.get(hover);
  if(sample&&F(sample.release))seek?.(lane.strike,Math.max(hover,sample.release));
 }
 host.addEventListener('dblclick',e=>{if(mode==='map'){hover=point(e);recall();}});
 host.addEventListener('keydown',e=>{if(!layout)return;
  if(mode==='map'&&e.key==='Enter'&&e.shiftKey){e.preventDefault();recall();return;}
  if(mode==='map'&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const ys=layout.map.ys,i=nearest(ys,pointY??state.selectedDisplay??ys[0]);pointY=ys[Math.max(0,Math.min(ys.length-1,i+(e.key==='ArrowUp'?1:-1)))];cursor();return;}
  if(e.key==='Escape'){locked=false;hover=null;cursor();return;}
  if(e.key==='Enter'||e.key===' '){e.preventDefault();commit();return;}
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const xs=layout.xs,i=nearest(xs,hover??(mode==='profile'?state.selectedDisplay:xs.at(-1))),n=e.key==='Home'?0:e.key==='End'?xs.length-1:i+(e.key==='ArrowRight'?1:-1);
  hover=xs[Math.max(0,Math.min(xs.length-1,n))];cursor();
 });
 parent.addEventListener('click',e=>{const b=e.target.closest?.('button[data-mode]');if(!b||b.disabled)return;mode=b.dataset.mode;hover=null;locked=false;signature=null;request();});
 const mk=parent.querySelector('.uf-map-key select');if(mk)mk.addEventListener('change',()=>{mapKey=mk.value;signature=null;request();});
 surface.addEventListener('webglcontextlost',e=>{e.preventDefault();hw=null;signature=null;request();});
 surface.addEventListener('webglcontextrestored',()=>{try{hw=gpu(surface);}catch{hw=null;}request();});
 if(w.ResizeObserver){observed=new w.ResizeObserver(request);observed.observe(host);}else w.addEventListener('resize',request);
 return {update(next){
  const changed=state?.identity!==next.identity||state?.selected!==next.selected||state?.coord!==next.coord;
  if(changed){hover=null;pointY=null;locked=false;signature=null;}
  state=next;if(mode==='map'&&!state.mapKeys?.length||mode==='history'&&!(state.history?.length>=2)||mode==='price'&&!state.chart?.some(p=>F(state.coord==='ES'?p.esSpot:p.spot)))mode='profile';
  parent.querySelector('.uf-hair').hidden=true;buttonState();request();
 },destroy(){observed?.disconnect();if(!observed)w.removeEventListener('resize',request);if(raf)w.cancelAnimationFrame(raf);hw?.release();}};
}
w.DeskStrikeField=Object.freeze({mount:structure});
})(window);
