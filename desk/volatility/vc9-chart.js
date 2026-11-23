
(function(root){
'use strict';
const $ = id => document.getElementById(id);
const fmt = (n,d=2) => Number.isFinite(n) ? n.toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
const esc = s => String(s ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const finite = Number.isFinite;
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const between = (lo,hi,u) => lo+(hi-lo)*u;
const days = T => T*365;
const timeLabel = T => days(T)<1 ? fmt(days(T)*24,2)+' h' : fmt(days(T),2)+' g';
const fixed = n => Number(n).toFixed(2);
const dateLabel = v => {const s=String(v || '');return /^\d{4}-\d\d-\d\d/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):s;};
const asofLabel = g => {const d=dateLabel(g.date),a=String(g.asof ?? ''),m=a.match(/(?:T|^|\s)(\d\d:\d\d(?::\d\d)?)/);return [d || a,m ? m[1] : ''].filter(Boolean).join(' ');};
const dateValue = g => {if(finite(g.timeMs))return g.timeMs;const a=String(g.asof || ''),d=String(g.date || ''),v=Date.parse(/^\d{4}-\d\d-\d\d/.test(a)?a:d+'T'+(/^\d\d:\d\d/.test(a)?a:'00:00:00'));return finite(v)?v:0;};
const knots = [[23,56,84],[26,74,112],[28,96,142],[37,121,167],[64,154,196],[102,185,217],[154,218,237],[236,237,220]];
function color(t,shade=1){const z=clamp(t,0,1)*(knots.length-1),i=Math.min(knots.length-2,Math.floor(z)),a=knots[i],b=knots[i+1];const base=a.map((v,j)=>Math.round(between(v,b[j],z-i)));const lit=base.map(v=>Math.round(clamp(v*shade+(shade>1?18*(shade-1):0),0,255)));return 'rgb('+lit.join(',')+')';}
function path(points){return points.map((p,i)=>(i?'L':'M')+fixed(p.x)+' '+fixed(p.y)).join('');}
function line(a,b,col,w=1,extra=''){return '<path d="'+path([a,b])+'" fill="none" stroke="'+col+'" stroke-width="'+w+'" '+extra+'/>';}
function label(p,s,anchor='middle',fill='#87b2eb',size=10){return '<text x="'+fixed(p.x)+'" y="'+fixed(p.y)+'" text-anchor="'+anchor+'" fill="'+fill+'" font-size="'+size+'">'+esc(s)+'</text>';}
const shifted = (p,dx,dy) => ({x:p.x+dx,y:p.y+dy});
const textAt=(x,y,s,anchor,col,size)=>label({x,y},s,anchor,col,size);
function tickStep(span,count){const b=10**Math.floor(Math.log10(span/count)),m=span/count/b;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*b;}
function ticks(lo,hi,n){const step=tickStep(hi-lo,n),out=[];if(!finite(step)||step<=0)return [lo]; for(let i=Math.ceil(lo/step-1e-9);i<=Math.floor(hi/step+1e-9)&&out.length<24;i++)out.push(i*step);return out;}
function numberTick(v,step){let d=0;while(d<5&&Math.abs(step*10**d-Math.round(step*10**d))>1e-7)d++;return fmt(v,d);}
function rangeY(a,b){const pad=Math.max((b-a)*.10,Math.abs(b)*.012,.03);return [Math.max(0,a-pad),b+pad];}
function valid(c){return c && finite(c.T)&&c.T>0&&finite(c.F)&&c.F>0&&finite(c.lo)&&finite(c.hi)&&c.hi>c.lo&&c.canonical;}
function curves(g){return (g.curves || []).filter(valid).slice().sort((a,b)=>a.T-b.T);}
const S={book:null,scopes:[],scope:null,hover:false,rows:[],sources:[],bands:[],indicative:false,plot:'3d',blend:'linear',xgrid:[],kDomain:[],selectedRow:null,pi:0,axis:'k',near:true,az:32,el:28,zoom:1.06,data:null,vp:null,canvas:null,hits:[],mini:null,drag:null,raf:0,temporalCache:new WeakMap()};
function mainText(id,value){const el=$(id);if(el) el.textContent=value;}
function engine(){return root.CVISurface9;}
function sample(raw,k){let p=engine().point(raw,k);if(!p||!finite(p.iv)||p.iv<=0||!finite(p.strike)||p.strike<=0)return null;return {...p,k,T:raw.T,F:raw.F};}
function blendLabel(){return 'normalizzato in prezzo europeo, lineare fra scadenze, certificazione butterfly/calendar continua';}
function valueX(p){return S.axis==='K'?p.strike:100*p.k;}
function rangeK(c){return [S.near?Math.max(c.lo,-.02):c.lo,S.near?Math.min(c.hi,.02):c.hi];}
function makeCommonGrid(list){
  if(!list.length)return [];
  let lo=Infinity,hi=-Infinity;
  for(const row of list){const c=row.raw||row;const a=S.axis==='K'?c.F*Math.exp(c.lo):100*c.lo,b=S.axis==='K'?c.F*Math.exp(c.hi):100*c.hi;
    lo=Math.min(lo,a);hi=Math.max(hi,b);
  }
  if(S.near){const F=list.reduce((s,r)=>s+(r.raw||r).F,0)/list.length;
    lo=S.axis==='K'?F*Math.exp(-.02):-2;hi=S.axis==='K'?F*Math.exp(.02):2;
  }else if(S.axis==='k'){
    // Keep all available quoted wings visible, but avoid a vanishingly small
    // center when the currently selected term structure is very short.
    const pad=Math.max(.25,(hi-lo)*.035);lo=Math.max(-75,lo-pad);hi=Math.min(75,hi+pad);
  }else{const pad=Math.max(5,(hi-lo)*.025);lo-=pad;hi+=pad;}
  if(!(hi>lo))return [];
  return Array.from({length:113},(_,i)=>between(lo,hi,i/112));
}
function sampleGrid(c,x){const k=S.axis==='K'?Math.log(x/c.F):x/100;
  const p=sample(c,k);return p?{...p,observed:k>=c.lo-1e-12&&k<=c.hi+1e-12}:null;
}
function sampleRow(group,raw,ordinal){
  const model=root.CVIModelRouter?.get(group);
  const nodes=S.xgrid.map(x=>{
    const k=S.axis==='K'?Math.log(x/raw.F):x/100;
    if(model?.ok)return model.at(raw.T,k,{allowWings:true});
    return sampleGrid(raw,x);
  }),pts=nodes.filter(Boolean);
  return {group,raw,T:raw.T,y:0,pts,nodes,ordinal,kind:'node'};
}
function interpRow(g,A,B,u){
  const near=A.raw,far=B.raw,T=between(near.T,far.T,u),F=Math.exp((1-u)*Math.log(near.F)+u*Math.log(far.F)),nodes=[];
  const model=root.CVIModelRouter?.get(g);
  for(const x of S.xgrid){
    const k=S.axis==='K'?Math.log(x/F):x/100;
    const p=model?.ok?model.at(T,k,{allowWings:true}):indicativePoint(near,far,T,k);
    nodes.push(p&&finite(p.iv)&&p.iv>0&&finite(p.strike)?p:null);
  }
  return {group:g,T,y:0,pts:nodes.filter(Boolean),nodes,kind:'interp'};
}
// Non-certified diagnostics remain visible but never become canonical prices.
function indicativePoint(a,b,T,k){
 const u=(T-a.T)/(b.T-a.T),x=Math.exp(k),side=k<0?'PUT':'CALL';
 if(!(u>0&&u<1)||!finite(x))return null;
 const D=root.CVIData,Fit=root.CVIFit;
 const v1=Fit.evaluate(a.canonical,k).w,v2=Fit.evaluate(b.canonical,k).w;
 if(!(v1>0&&v2>0))return null;
 const p1=D.black(1,x,1,v1,side),p2=D.black(1,x,1,v2,side);
 const w=D.implied(1,x,1,(1-u)*p1+u*p2,side);
 if(!(finite(w)&&w>0))return null;
 const F=a.F*Math.exp(u*Math.log(b.F/a.F));
 return {iv:Math.sqrt(w/T),variance:w,w,F,strike:F*x,k,T,observed:false,
   source:'DIAGNOSTIC_NOT_CERTIFIED',expiry:a.expiry+' / '+b.expiry,near:a.expiry,far:b.expiry};
}
function buildScopes(book){
  const gs=(book?.groups||[]).slice().sort((a,b)=>dateValue(a)-dateValue(b)),by=new Map();
  for(const g of gs){const sym=g.symbol||'Sottostante';if(!by.has(sym))by.set(sym,[]);by.get(sym).push(g);}
  const out=[];
  for(const [sym,groups] of by){
    const singles=groups.filter(g=>curves(g).length===1);
    if(singles.length>1)out.push({type:'history',label:sym+' · Storico degli snapshot',groups:singles,symbol:sym,withheld:groups.filter(g=>!curves(g).length)});
    for(const g of groups)out.push({type:'market',label:sym+' · '+asofLabel(g)+' · '+(g.partial?'superficie parziale certificata':g.marketReady?'superficie':curves(g).length?curves(g).length+' scad. CVI':'mark sospeso'),groups:[g],symbol:sym});
  }

  return out;
}
function selectOption(i){
  if(!S.scopes[i])return;
  const scope=S.scopes[i];S.scope=scope;S.hover=false;$('vc9Scope').value=String(i);
  rebuild(null,0);
}
function chooseRow(row,k=0){
  if(!row||!row.pts.length)return;
  S.selectedRow=row;
  S.pi=row.pts.reduce((a,p,i)=>Math.abs(p.k-k)<Math.abs(row.pts[a].k-k)?i:a,0);
}
function rebuild(previous,k){
  const scope=S.scope;if(!scope)return;
  const history=scope.type==='history',group=scope.groups[0];
  const contract=!history&&group?root.CVIModelRouter?.get(group):null;
  const ready=!history&&!!contract?.ok,indicative=!history&&!ready&&curves(group).length>=2;S.indicative=indicative;
  S.canonical=ready?contract:null;
  const allRaw=scope.groups.flatMap(g=>curves(g).map(raw=>({group:g,raw})));
  S.xgrid=makeCommonGrid(allRaw);
  S.sources=allRaw.map((r,i)=>sampleRow(r.group,r.raw,i));
  const nodeList=S.sources.filter(r=>r.pts.length);
  S.rows=nodeList.slice();S.bands=[];S.selectedRow=null;
  if((ready||indicative)&&nodeList.length>=2){
    const connected=[],bands=[];
    let segment=[];
    for(let i=0;i<nodeList.length;i++){
      const row=nodeList[i];
      if(i>0){const A=nodeList[i-1],B=row,dt=B.T-A.T;
        const blocked=ready&&S.canonical.meta.blockedIntervals.some(x=>x.near===A.raw.expiry&&x.far===B.raw.expiry);
        if(blocked){if(segment.length>=2)bands.push(segment);segment=[];}
        else if(A.group===B.group&&dt>0){const subdivisions=Math.max(8,Math.min(22,Math.round(12+4*Math.log1p(365*dt))));
          for(let j=1;j<subdivisions;j++){const interpolated=interpRow(group,A,B,j/subdivisions);if(interpolated.pts.length){segment.push(interpolated);connected.push(interpolated);}}
        }
      }
      segment.push(row);connected.push(row);
    }
    if(segment.length>=2)bands.push(segment);
    S.rows=connected.slice().sort((a,b)=>a.T-b.T);
    S.bands=bands;
  }
  const meshVisible=S.bands.some(b=>b.slice(1).some((r,i)=>r.nodes?.some((p,j)=>j>0&&p&&r.nodes[j-1]&&b[i]?.nodes?.[j]&&b[i]?.nodes?.[j-1])));
  const yValue=r=>history?dateValue(r.group):days(r.T);
  const yData=nodeList.map(yValue),yMin=yData.length?Math.min(...yData):0,yMax=yData.length?Math.max(...yData):1;
  const dates=history?[...new Set(yData)].sort((a,b)=>a-b):[];
  const normalizeY=r=>history&&dates.length>1?dates.indexOf(yValue(r))/(dates.length-1):
    yMax===yMin?.45:(Math.sqrt(Math.max(0,yValue(r)))-Math.sqrt(Math.max(0,yMin)))/
      Math.max(1e-14,Math.sqrt(Math.max(0,yMax))-Math.sqrt(Math.max(0,yMin)));
  for(const row of S.rows)row.y=normalizeY(row);
  const pts=S.rows.flatMap(r=>r.pts);
  if(pts.length){let xmin=Infinity,xmax=-Infinity,vmin=Infinity,vmax=-Infinity;
    const pool=[];
    for(const p of pts){const x=valueX(p),v=100*p.iv;if(!finite(x)||!finite(v))continue;
      xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);vmin=Math.min(vmin,v);vmax=Math.max(vmax,v);pool.push(v);
    }
    pool.sort((a,b)=>a-b);
    // Percentile-trimmed *palette only*: actual IV and exact value remain
    // accessible in the tooltip; outlier colors do not distort the axes.
    const cliplo=pool[Math.floor(pool.length*.01)]??vmin,cliphi=pool[Math.floor(pool.length*.99)]??vmax;
    const pad=Math.max(.00001,(xmax-xmin)*.018),[zlo,zhi]=rangeY(cliplo,cliphi);
    S.data={xmin:xmin-pad,xmax:xmax+pad,vmin:cliplo,vmax:cliphi,zlo,zhi,yMin,yMax,ready:meshVisible,history};
    const same=previous?S.rows.find(r=>r.raw&&r.raw===previous.raw||!r.raw&&previous.group===r.group&&Math.abs(r.T-previous.T)<1e-12):null;
    chooseRow(same||nodeList[nodeList.length-1],k);
  }else S.data=null;
  const title=history?'Smile storici':meshVisible?(ready?(group?.partial?'Superficie CVI · PARZIALE CERTIFICATA':'Superficie di volatilità'):'Superficie DIAGNOSTICA · NON CERTIFICATA'):nodeList.length===1?'Smile dello snapshot':'Smile per scadenza';
  const reason=group?.reason?String(group.reason):'';
  const common=(history?scope.groups.length+' snapshot storici indipendenti; non costituiscono una superficie alla stessa data.':meshVisible?(ready?(group?.partial?'Copertura certificata LIMITATA alle '+group.curves.length+' scadenze rilasciate ('+group.coverage.from+' → '+group.coverage.to+'). Escluse: '+group.missing.join(', ')+'. ':'')+'Superficie CVI con skew e vincoli statici certificati. Motore temporale: '+blendLabel()+'. Alle scadenze quotate il fit resta invariato; fuori dai bid/ask le ali sono estrapolazioni, non quotazioni.':'Griglia DIAGNOSTICA non certificata.')+' Coordinate strike omogenee, asse tempo √T solo nella prospettiva, griglia unificata.':nodeList.length===1?'Una sola scadenza dello snapshot: impossibile una superficie reale.':'Griglia temporale sospesa. '+reason);
  updateContractPanel(S.canonical,group,history);
  mainText('vc9Title',scope.symbol+' · '+title);
  mainText('vc9Context',indicative?'SOLO DIAGNOSTICA, NON USARE PER PRICING: '+(group?.reason||'Il calendar non è certificato.')+' La griglia visualizza una semplice interpolazione fra mark singoli ed è deliberatamente esclusa dai calcoli operativi.':common);
  mainText('vc9LegendNote',indicative?'NON CERTIFICATA · RICERCA SOLTANTO':history?'Skew storiche, date non simultanee':ready&&group?.partial?'PARZIALE CERTIFICATA · TENOR ESCLUSI NON VALUTABILI':meshVisible?'TRACCE · SCADENZE DI MERCATO    SUPERFICIE · MODELLO CVI    PUNTI · LIMITI DELLE QUOTE':'Linee · CVI per scadenza');
  const missing=[];
  for(const g of [...scope.groups,...(scope.withheld||[])]){
    const expiries=g.missing?.length?g.missing:curves(g).length?[]:g.expiries||[];
    for(const expiry of expiries){
      const reason=g.errors?.find(e=>e.expiry===expiry)?.reason||g.reason||'Nessun mark CVI rilasciato.';
      missing.push({g,expiry,reason});
    }
  }
  mainText('vc9RowCount',S.sources.length+' rilasciate'+(missing.length?' · '+missing.length+' sospese':''));
  mainText('vc9Low',S.data?fmt(S.data.vmin,1)+'%':'—');mainText('vc9High',S.data?fmt(S.data.vmax,1)+'%':'—');
  const good=S.sources.map(r=>{
    const c=r.raw,atm=0>=c.lo&&0<=c.hi?sample(c,0):null,source=(c.sources||r.group.sources||[]).join(', ')||'—';
    const st=c.stats||{},both=finite(st.inside)&&finite(st.bilateral)?st.inside+' / '+st.bilateral:'—';
    const one=finite(st.allInside)&&finite(st.inside)&&finite(st.oneSide)?(st.allInside-st.inside)+' / '+st.oneSide:'—';
    const ts=esc(r.group.asof)+' ET';
    const row='<tr id="vc9Tr'+r.ordinal+'"><td title="'+ts+'"><button type="button" title="'+ts+'" data-vc9-row="'+r.ordinal+'" '+(r.pts.length?'':'disabled')+'>'+esc(asofLabel(r.group))+'</button></td><td>'+esc(dateLabel(c.expiry))+'</td><td class="vc9-good">Rilasciato</td><td>'+both+'</td><td>'+one+'</td><td>'+timeLabel(c.T)+'</td><td>'+fmt(c.F)+'</td><td>'+fmt(c.F*Math.exp(c.lo),2)+'</td><td>'+fmt(c.F*Math.exp(c.hi),2)+'</td><td>'+(atm?fmt(atm.iv*100)+'%':'—')+'</td><td>'+esc(source)+'</td></tr>';
    return {key:dateValue(r.group),row};
  });
  const withheld=missing.map(({g,expiry,reason})=>({key:dateValue(g),row:'<tr class="vc9-suspended"><td title="'+esc(g.asof)+' ET">'+esc(asofLabel(g))+'</td><td>'+esc(dateLabel(expiry))+'</td><td>Sospeso</td><td colspan="7" class="vc9-reason">'+esc(reason)+'</td><td>'+esc((g.sources||[]).join(', '))+'</td></tr>'}));
  $('vc9Table').innerHTML=good.concat(withheld).sort((a,b)=>b.key-a.key).map(x=>x.row).join('');
  redraw();
}
function projection(W,H){
  const thin=W<430,padL=thin?44:63,padR=thin?62:87,padU=31,padB=thin?52:54;
  const a=S.az*Math.PI/180,e=S.el*Math.PI/180;
  const A=[1.70*Math.cos(a),1.70*Math.sin(a)*Math.sin(e)],B=[1.04*Math.sin(a),-1.04*Math.cos(a)*Math.sin(e)],C=[0,-.90*Math.cos(e)];
  const base=(x,y,z)=>[A[0]*x+B[0]*y+C[0]*z,A[1]*x+B[1]*y+C[1]*z];
  const corners=[];for(const x of [0,1])for(const y of [0,1])for(const z of [0,1])corners.push(base(x,y,z));
  const xx=corners.map(v=>v[0]),yy=corners.map(v=>v[1]),minX=Math.min(...xx),lo=Math.min(...yy),rangeX=Math.max(...xx)-minX,rangeZ=Math.max(...yy)-lo;
  const zoom=S.zoom||1;
  const sx=((W-padL-padR)/rangeX)*zoom,sy=Math.min(((H-padU-padB)/rangeZ)*zoom,sx*1.3);
  const ox=padL+((W-padL-padR)-sx*rangeX)*.5-sx*minX,oy=padU+(H-padU-padB-sy*rangeZ)*.5-sy*lo;
  return (x,y,z)=>{const [u,v]=base(x,y,z);return {x:ox+u*sx,y:oy+v*sy};};
}
function posFor(r,p){const d=S.data;return S.vp((valueX(p)-d.xmin)/(d.xmax-d.xmin),r.y,(p.iv*100-d.zlo)/(d.zhi-d.zlo));}
function intensity(p){const d=S.data;return (100*p.iv-d.vmin)/(d.vmax-d.vmin||1);}
function grid(W,H){
  const d=S.data,v=S.vp,small=W<465,gridCol='#1b364e',axisCol='#6d89a2',zTicks=ticks(d.zlo,d.zhi,5),xTicks=ticks(d.xmin,d.xmax,small?4:6);
  let out='<path d="'+path([v(0,0,0),v(1,0,0),v(1,1,0),v(0,1,0)])+'Z" fill="#091a2b" stroke="#1b3855"/>';
  for(const z of zTicks){
    const t=(z-d.zlo)/(d.zhi-d.zlo),p=v(0,0,t);out+=line(p,v(0,1,t),gridCol)+line(v(0,1,t),v(1,1,t),'#11283d')+line(shifted(p,-4,0),p,axisCol)+label(shifted(p,-7,3),numberTick(z,zTicks.length>1?zTicks[1]-zTicks[0]:1),'end');
  }
  out+=line(v(0,0,0),v(0,0,1),axisCol)+label(shifted(v(0,0,1),0,-10),'IV %','middle','#a2c5f5',11);
  for(const x of xTicks){const n=(x-d.xmin)/(d.xmax-d.xmin),p=v(n,0,0);out+=line(p,v(n,1,0),gridCol)+line(p,shifted(p,0,4),axisCol)+label(shifted(p,-2,17),numberTick(x,xTicks.length>1?xTicks[1]-xTicks[0]:1),'middle');}
  out+=label({x:v(.6,0,0).x,y:v(1,0,0).y+40},S.axis==='K'?'Strike K':'100 ln(K/F) · %','middle','#a5c7f5',11);
  const names=[];
  if(d.history){
    const ordered=S.sources.filter(r=>r.pts.length).sort((a,b)=>a.y-b.y);
    for(const r of ordered)names.push({n:r.y,txt:dateLabel(r.group.date).slice(0,5)});
  }else{
    const ordered=S.sources.filter(r=>r.pts.length).sort((a,b)=>a.y-b.y);
    for(const r of ordered)names.push({n:r.y,txt:days(r.T)<1?fmt(days(r.T)*24,1)+'h':fmt(days(r.T),1)+'g'});
  }
  let last=null;for(const tick of names){
    const p=v(1,tick.n,0);out+=line(v(0,tick.n,0),p,gridCol)+line(p,shifted(p,4,0),axisCol);
    if(last===null||Math.hypot(p.x-last.x,p.y-last.y)>19){out+=label(shifted(p,7,4),tick.txt,'start');last=p;}
  }
  const yp=v(1,1,0);out+=label({x:W-8,y:yp.y-12},d.history?'Snapshot':'T · √T visivo','end','#a5c7f5',10);
  return out;
}
function surface(){
  const d=S.data,faces=[];
  for(const band of S.bands)for(let i=1;i<band.length;i++){
    const near=band[i-1],far=band[i],len=Math.min(near.nodes.length,far.nodes.length);
    for(let j=1;j<len;j++){
      const vs=[near.nodes[j-1],near.nodes[j],far.nodes[j],far.nodes[j-1]];
      if(vs.some(p=>!p))continue;
      const xy=vs.map((p,n)=>posFor(n<2?near:far,p));
      const avg=vs.reduce((s,p)=>s+intensity(p),0)/4;
      const confid=vs.reduce((s,p)=>s+(p.observed?1:0),0)/4;
      const midX=vs.reduce((s,p)=>s+(valueX(p)-d.xmin)/(d.xmax-d.xmin),0)/4;
      const angle=S.az*Math.PI/180;
      const depth=-(midX*1.70*Math.sin(angle))+(near.y+far.y)*.5*1.04*Math.cos(angle);
      const ux={x:xy[1].x-xy[0].x,y:xy[1].y-xy[0].y},vy={x:xy[3].x-xy[0].x,y:xy[3].y-xy[0].y};
      const face=(ux.x*vy.y-ux.y*vy.x);
      const shade=clamp(.82+face/8500+confid*.12,0.62,1.18);
      const opacity=S.indicative?.42:(confid>.85?.94:.86);
      const stroke=confid>.85?'#12293e':'#1c364e';
      faces.push({depth,s:'<path d="'+path(xy)+'Z" fill="'+color(avg,shade)+'" fill-opacity="'+opacity+'" stroke="'+stroke+'" stroke-opacity=".28" stroke-width=".20"/>'});
    }
  }
  faces.sort((a,b)=>b.depth-a.depth);
  return faces.map(f=>f.s).join('');
}
function meshOverlay(){
  if(S.plot!=='3d'||!S.rows.length)return '';
  let out='';
  const rowStep=Math.max(1,Math.round(S.rows.length/9)),colStep=Math.max(6,Math.round(S.xgrid.length/11));
  for(let r=0;r<S.rows.length;r+=rowStep){const row=S.rows[r],pts=row.pts;if(pts.length<2)continue;out+='<path d="'+path(pts.map(p=>posFor(row,p)))+'" fill="none" stroke="#e9e2cd" stroke-opacity=".18" stroke-width=".55"/>';}
  for(let j=0;j<S.xgrid.length;j+=colStep){for(const band of S.bands){const curve=[];for(const row of band){const p=row.nodes[j];if(p)curve.push(posFor(row,p));}if(curve.length>=2)out+='<path d="'+path(curve)+'" fill="none" stroke="#89cde7" stroke-opacity=".16" stroke-width=".48"/>';}}
  return out;
}
function heatmap(W,H){
  const d=S.data,rows=S.rows,svg=$('vc9Chart'),left=69,right=W-40,top=27,bottom=H-51;
  S.vp=(u,v)=>({x:left+(right-left)*u,y:bottom-(bottom-top)*v});
  let out='<rect width="'+W+'" height="'+H+'" fill="#08192a"/>';
  const CW=Math.max(2,Math.round(right-left)),CH=Math.max(2,Math.round(bottom-top));
  const cnv=document.createElement('canvas');cnv.width=CW;cnv.height=CH;const ctx=cnv.getContext('2d',{willReadFrequently:false});
  const raster=ctx.createImageData(CW,CH);
  const rgb=t=>{const zz=clamp(t,0,1)*(knots.length-1),j=Math.min(knots.length-2,Math.floor(zz));return knots[j].map((v,i)=>Math.round(between(v,knots[j+1][i],zz-j)));};
  const xsize=S.xgrid.length,n=rows.length;
  for(let iy=0;iy<CH;iy++){
    let j0=0;const uy=1-iy/Math.max(1,CH-1);
    while(j0<n-2&&rows[j0+1].y<uy)j0++;
    const a=rows[j0],b=rows[Math.min(n-1,j0+1)],v=clamp((uy-a.y)/Math.max(1e-10,b.y-a.y),0,1);
    const gapBlocked=!!(S.canonical?.ok&&a.raw&&b.raw&&S.canonical.meta.blockedIntervals.some(g=>g.near===a.raw.expiry&&g.far===b.raw.expiry));
    for(let ix=0;ix<CW;ix++){
      if(gapBlocked){const at=(iy*CW+ix)*4;raster.data[at]=13;raster.data[at+1]=20;raster.data[at+2]=27;raster.data[at+3]=255;continue;}
      const ux=ix/Math.max(1,CW-1),jx=Math.min(xsize-2,Math.floor(ux*(xsize-1))),u=clamp(ux*(xsize-1)-jx,0,1);
      const ps=[a.nodes[jx],a.nodes[jx+1],b.nodes[jx],b.nodes[jx+1]],at=(iy*CW+ix)*4;
      if(ps.some(p=>!p)){raster.data[at]=8;raster.data[at+1]=16;raster.data[at+2]=24;raster.data[at+3]=255;continue;}
      const va=between(100*ps[0].iv,100*ps[1].iv,u),vb=between(100*ps[2].iv,100*ps[3].iv,u),iv=between(va,vb,v);
      const col=rgb((iv-d.vmin)/(d.vmax-d.vmin||1));
      raster.data[at]=col[0];raster.data[at+1]=col[1];raster.data[at+2]=col[2];raster.data[at+3]=255;
    }
  }
  ctx.putImageData(raster,0,0);
  out+='<image x="'+left+'" y="'+top+'" width="'+CW+'" height="'+CH+'" preserveAspectRatio="none" href="'+cnv.toDataURL('image/png')+'"/>';
  const xVals=ticks(d.xmin,d.xmax,Math.max(3,Math.min(9,Math.floor(W/90))));
  for(const x of xVals){const p=S.vp((x-d.xmin)/(d.xmax-d.xmin),0);out+=line({x:p.x,y:top},{x:p.x,y:bottom},'#294f74',.65,'stroke-opacity=".38"')+label({x:p.x,y:bottom+19},fmt(x,S.axis==='K'?0:1),'middle','#7ba9e4',10);}
  const yTicks=S.sources.filter(r=>r.pts.length).map(r=>({v:r.y,t:days(r.T)<1?fmt(days(r.T)*24,1)+'h':fmt(days(r.T),1)+'d'}));
  for(const t of yTicks){const p=S.vp(0,t.v);out+=line({x:left,y:p.y},{x:right,y:p.y},'#5185be',.8,'stroke-dasharray="3 4"')+label({x:left-8,y:p.y+3},t.t,'end','#b2e5f7',10);}
  // The bid/ask coverage is outlined instead of applying a discontinuous
  // transparency mask. An apparent visual seam is not mistaken for a quote.
  for(const row of S.sources){
    const low=S.axis==='K'?row.raw.F*Math.exp(row.raw.lo):100*row.raw.lo;
    const high=S.axis==='K'?row.raw.F*Math.exp(row.raw.hi):100*row.raw.hi;
    for(const x of [low,high])if(x>=d.xmin&&x<=d.xmax){const pos=S.vp((x-d.xmin)/(d.xmax-d.xmin),row.y);
      out+='<circle cx="'+fixed(pos.x)+'" cy="'+fixed(pos.y)+'" r="2.8" fill="#081829" stroke="#b3d0f8" stroke-width="1"/>';
    }
  }
  out+='<rect x="'+left+'" y="'+top+'" width="'+(right-left)+'" height="'+(bottom-top)+'" fill="none" stroke="#4d81b9" stroke-width=".8"/>';
  out+=label({x:(left+right)/2,y:H-10},S.axis==='K'?'STRIKE K':'100 ln(K/F) · %','middle','#b1cef8',11);
  out+=label({x:10,y:top-9},'T / tenor','start','#94bcf2',10);
  for(const row of rows)row.pts.forEach((p,i)=>{const q=S.vp((valueX(p)-d.xmin)/(d.xmax-d.xmin),row.y);S.hits.push({x:q.x,y:q.y,row,i});});
  out+='<g id="vc9Cross" pointer-events="none"></g>';
  svg.innerHTML=out;renderPoint();
}
function redraw(){
  const svg=$('vc9Chart');if(!svg)return;
  const box=svg.getBoundingClientRect?.()||{},W=Math.max(230,Math.round(box.width||700)),H=Math.max(185,Math.round(box.height||380));
  svg.setAttribute('viewBox','0 0 '+W+' '+H);S.canvas={W,H};S.hits=[];
  if(!S.data){svg.innerHTML=textAt(W/2,H/2,'Nessuna sezione CVI nel dominio selezionato.','middle','#97bdf2',11);renderPoint();return;}
  if(S.plot==='heat'){heatmap(W,H);return;}
  S.vp=projection(W,H);let graph=grid(W,H)+surface()+meshOverlay();
  for(const r of [...S.sources].sort((a,b)=>b.y-a.y)){
    const pts=r.pts;if(!pts.length)continue;
    const xy=pts.map(p=>posFor(r,p));
    for(const j of [0,pts.length-1]){const p=pts[j],fp=S.vp((valueX(p)-S.data.xmin)/(S.data.xmax-S.data.xmin),r.y,0);graph+=line(fp,xy[j],'#496781',.8,'stroke-dasharray="2 4"');}
    graph+='<path d="'+path(xy)+'" fill="none" stroke="#081929" stroke-width="3.8" stroke-linecap="round"/>';
    for(let j=1;j<xy.length;j++)graph+=line(xy[j-1],xy[j],color((intensity(pts[j])+intensity(pts[j-1]))/2),S.data.ready?1.65:2.5,'stroke-linecap="round"');
  }
  for(const row of S.rows)row.pts.forEach((p,i)=>{const q=posFor(row,p);S.hits.push({x:q.x,y:q.y,row,i});});
  graph+='<g id="vc9Cross" pointer-events="none"></g>';svg.innerHTML=graph;
  renderPoint();
}
function schedule(){if(S.raf)return;const fn=()=>{S.raf=0;redraw();};if(typeof root.requestAnimationFrame==='function')S.raf=root.requestAnimationFrame(fn);else fn();}
function renderPoint(){
  const row=S.selectedRow,p=row?.pts[S.pi],ids=['vc9IV','vc9PointKind','vc9K','vc9F','vc9LogK','vc9T','vc9W','vc9Exp','vc9SliceTag'];
  if(!p){for(const id of ids)mainText(id,'—');$('vc9Tenor').disabled=true;$('vc9Strike').disabled=true;$('vc9SliceChart').innerHTML='';return;}
  const raw=row.raw,intr=!raw,day=row.group?.date,expiry=raw?.expiry;
  mainText('vc9PointKind',S.indicative?(intr?'DIAGNOSTICA · NON PRICING':'Skew singola valida'):(intr?'MARK CANONICO · PREZZO NORMALIZZATO':'NODO CVI CERTIFICATO'));
  mainText('vc9QuoteCoverage',p.observed?'Entro la copertura bilaterale comune':'ALA ESTRAPOLATA: modello CVI, nessuna quotazione bilaterale comune');
  mainText('vc9IV',fmt(p.iv*100,2)+'%');mainText('vc9K',fmt(p.strike));mainText('vc9F',fmt(p.F));
  mainText('vc9LogK',fmt(p.k*100,3)+'%');mainText('vc9T',timeLabel(row.T));mainText('vc9W',fmt(p.variance,8));
  mainText('vc9Exp',intr?'Intermedia':dateLabel(expiry));$('vc9Exp').title=intr?[dateLabel(p.near),dateLabel(p.far)].join(' → '):dateLabel(expiry);mainText('vc9SliceTag',dateLabel(day));
  const t=$('vc9Tenor'),x=$('vc9Strike');t.max=String(S.rows.length-1);t.value=String(S.rows.indexOf(row));t.disabled=S.rows.length<2;
  t.setAttribute('aria-valuetext',(intr?'Interpolata':dateLabel(expiry))+' · '+timeLabel(row.T));
  x.max=String(row.pts.length-1);x.value=String(S.pi);x.disabled=row.pts.length<2;x.setAttribute('aria-valuetext','Strike '+fmt(p.strike)+' · IV '+fmt(100*p.iv)+'%');
  for(const r of S.sources){const tr=$('vc9Tr'+r.ordinal);if(tr)tr.setAttribute('aria-selected',String(r===row));}
  const cross=$('vc9Cross');
  if(cross){const g=S.data,here=posFor(row,p),ground=S.vp((valueX(p)-g.xmin)/(g.xmax-g.xmin),row.y,0);
    let tip='';
    if(S.hover){const msg='K '+fmt(p.strike)+' · '+fmt(100*p.iv)+'%',width=msg.length*6.3+12,tx=clamp(here.x+9,3,S.canvas.W-width-3),ty=here.y<28?here.y+12:here.y-26;tip='<rect x="'+fixed(tx)+'" y="'+fixed(ty)+'" width="'+fixed(width)+'" height="19" fill="#0a1d30" stroke="#6f8ba5"/>'+textAt(tx+6,ty+13,msg,'start','#e9e2cd',10);}
    cross.innerHTML=(S.plot==='heat'?line({x:here.x,y:27},{x:here.x,y:S.canvas.H-51},'#b8d3f9',.8,'stroke-dasharray="3 4"')+line({x:69,y:here.y},{x:S.canvas.W-40,y:here.y},'#b8d3f9',.8,'stroke-dasharray="3 4"'):line(here,ground,'#b8d3f9',.9,'stroke-dasharray="3 4"'))+'<circle cx="'+fixed(here.x)+'" cy="'+fixed(here.y)+'" r="5" fill="#081828" stroke="#efe6ce" stroke-width="2"/><circle cx="'+fixed(here.x)+'" cy="'+fixed(here.y)+'" r="1.5" fill="#dcd9ca"/>'+tip;}
  drawMini(row,p);
}
function drawMini(row,p){
  const svg=$('vc9SliceChart'),box=svg.getBoundingClientRect?.()||{},W=Math.max(140,Math.round(box.width||250)),H=Math.max(75,Math.round(box.height||118));
  const pts=row.pts,xx=pts.map(valueX),vv=pts.map(q=>100*q.iv),[vlo,vhi]=rangeY(Math.min(...vv),Math.max(...vv));
  const left=38,right=W-10,top=13,bottom=H-24,lo=xx[0],hi=xx.at(-1);
  const X=v=>left+(right-left)*(v-lo)/(hi-lo||1),Y=v=>bottom-(bottom-top)*(v-vlo)/(vhi-vlo);
  const xTicks=ticks(lo,hi,W<280?3:5),yTicks=ticks(vlo,vhi,3);
  let s='';for(const t of yTicks)s+=line({x:left,y:Y(t)},{x:right,y:Y(t)},'#183148')+label({x:left-4,y:Y(t)+3},numberTick(t,tickStep(vhi-vlo,3)),'end','#7fade6',9);
  for(const t of xTicks)s+=label({x:X(t),y:bottom+15},numberTick(t,tickStep(hi-lo,W<280?3:5)),'middle','#7fade6',9);
  const forward=S.axis==='k'?0:p.F;if(forward>=lo&&forward<=hi)s+=line({x:X(forward),y:top},{x:X(forward),y:bottom},'#5c7993',1,'stroke-dasharray="2 4"');
  const xy=pts.map((q,i)=>({x:X(xx[i]),y:Y(vv[i])})),here={x:X(valueX(p)),y:Y(100*p.iv)};
  s+='<path d="'+path(xy)+'" stroke="#dcdaca" stroke-width="1.7" fill="none"/>'+line({x:here.x,y:top},{x:here.x,y:bottom},'#8acee8',.8,'stroke-dasharray="2 3"')+'<circle cx="'+fixed(here.x)+'" cy="'+fixed(here.y)+'" r="3" fill="#9bdbf1" stroke="#081829"/>';
  svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.innerHTML=s;S.mini={W,lo,hi,left,right};
}
function local(e,svg,W,H){const b=svg.getBoundingClientRect();return {x:(e.clientX-b.left)*W/(b.width||1),y:(e.clientY-b.top)*H/(b.height||1)};}
function pick(e){
  if(!S.canvas||!S.hits.length)return;const b=local(e,$('vc9Chart'),S.canvas.W,S.canvas.H);
  let best=null,dmin=19**2;
  for(const hit of S.hits){const d=(hit.x-b.x)**2+(hit.y-b.y)**2;if(d<dmin){best=hit;dmin=d;}}
  if(best){if(!S.hover||S.selectedRow!==best.row||S.pi!==best.i){S.hover=true;S.selectedRow=best.row;S.pi=best.i;renderPoint();}}
  else if(S.hover){S.hover=false;renderPoint();}
}
function setAngles(a,e){
  S.az=Math.round((((a%360)+360)%360));S.el=Math.round(clamp(e,5,80));$('vc9Az').value=String(S.az);$('vc9El').value=String(S.el);
  mainText('vc9AzOut',S.az+'°');mainText('vc9ElOut',S.el+'°');schedule();
}
function updateContractPanel(model,group,history){
 const flag=$('vc14ContractFlag'),summary=$('vc14Summary'),metrics=$('vc14Metrics'),result=$('vc14ProbeResult'),t=$('vc14T'),K=$('vc14K');
 if(!flag||!summary)return;
 if(!model?.ok){
  flag.textContent=history?'ARCHIVIO STORICO':'NON CERTIFICATA';
  summary.textContent=history?'Seleziona uno snapshot con scadenze coeve. Lo storico non è una superficie di mercato.':
    'Nessun contratto canonico pubblicabile: '+(model?.reason||group?.reason||'Calibrazione o verifica incompleta.');
  metrics.textContent='';t.value='';K.value='';result.textContent='Il pricing multiscadenza è sospeso.';t.disabled=true;K.disabled=true;$('vc14Probe').disabled=true;return;
 }
 const m=model.meta,ts=m.tenors,lo=ts[0],hi=ts.at(-1),atm=ts[Math.floor(ts.length/2)];
 flag.textContent=m.partial?'PARZIALE CERTIFICATA':'CERTIFICATA';
 summary.textContent='Unica fonte numerica: '+m.kernel+' · '+m.symbol+' · cutoff '+m.asof+' · maturità '+m.expiryRange[0]+' / '+m.expiryRange[1]+'. Tutte le scadenze rilasciate hanno certificati butterfly e calendar indipendenti. '+(m.blockedIntervals.length?'ATTENZIONE: '+m.blockedIntervals.length+' intervalli contenenti scadenze richieste ma non rilasciate sono esclusi dal pricing e dalla superficie.':'');
 metrics.innerHTML='<span>'+ts.length+' TENOR</span><span>'+m.calendarCertificates.length+' CALENDAR CERT.</span><span>'+m.eligibleIntervals.length+' INTERVALLI PREZZABILI</span><span>'+m.dayCount+'</span><span>ID '+m.modelId.slice(0,14)+'…</span><span>Q · STATIC ARBITRAGE</span>';
 t.disabled=false;K.disabled=false;$('vc14Probe').disabled=false;
 t.min=String((lo.T*365).toFixed(6));t.max=String((hi.T*365).toFixed(6));
 if(!t.value||+t.value < lo.T*365||+t.value > hi.T*365)t.value=(atm.T*365).toFixed(4);
 if(!K.value||!(+K.value>0))K.value=atm.F.toFixed(2);
 result.textContent='Interroga il contratto canonico per il prezzo CALL/PUT, IV e probabilità digitale Q. Le ali prive di bid/ask sono escluse dal pricing operativo.';
}
function canonicalProbe(){
 const model=S.canonical,out=$('vc14ProbeResult');if(!out)return;
 if(!model?.ok){out.textContent='Surface mark non certificato.';return;}
 const days=Number($('vc14T').value),K=Number($('vc14K').value);
 const point=model.price(days/365,K,'CALL',{allowWings:false});
 if(!point){out.textContent='Nessun mark nel dominio certificato: verifica T e copertura bilaterale comune. Nessuna estrapolazione forzata.';return;}
 const digital=model.digital(days/365,point.k,{allowWings:false});
 out.textContent='K '+fmt(K)+' · T '+fmt(days,3)+' giorni · IV '+fmt(point.iv*100,4)+'% · CALL '+fmt(point.call,5)+' pt · PUT '+fmt(point.put,5)+' pt · Pᴽ(SPX ≥ K) ≈ '+(digital?fmt(digital.probabilityAbove*100,3)+'%':'non disponibile')+' · MODEL ID '+model.meta.modelId.slice(0,12);
}
function showError(message){
  S.canonical=null;updateContractPanel(null,null,false);
  S.data=null;S.rows=[];S.sources=[];S.selectedRow=null;S.drag=null;S.hits=[];S.mini=null;mainText('vc9Context',message);mainText('vc9Title','Superficie di volatilità');mainText('vc9RowCount','');mainText('vc9Low','—');mainText('vc9High','—');mainText('vc9LegendNote','');$('vc9Table').innerHTML='';redraw();
}
function setData(book){
  root.CVIModelRouter?.setBook(book);root.CVISSVIUI?.refresh?.();root.CVIUnifiedModelUI?.refresh?.();
  if(!$('vc9Scope'))return;
  const previous=(S.scope?.type||'')+'|'+(S.scope?.label||'');
  S.book=book;S.scopes=buildScopes(book);const menu=$('vc9Scope');
  menu.innerHTML=S.scopes.map((s,i)=>'<option value="'+i+'">'+esc(s.label)+'</option>').join('');menu.disabled=!S.scopes.length;
  if(!book){S.scope=null;showError('In attesa dei risultati della calibrazione.');return;}
  const ready=S.scopes.findIndex(s=>s.type==='market'&&s.groups[0].marketReady),history=S.scopes.findIndex(s=>s.type==='history'),working=S.scopes.findIndex(s=>s.type==='market'&&curves(s.groups[0]).length);
  let i=S.scopes.findIndex(s=>s.type+'|'+s.label===previous);
  if(i<0)i=ready>=0?ready:history>=0?history:working>=0?working:(S.scopes.length?0:-1);
  if(i>=0)selectOption(i);
  else{menu.selectedIndex=-1;S.scope=null;showError('Nessuno snapshot di mercato disponibile. Importa le catene CSV e ricalcola.');}
}
function bind(){
  if(!$('vc9Scope'))return;
  $('vc14Probe').onclick=canonicalProbe;
  $('vc9Scope').onchange=e=>selectOption(Number(e.target.value));
  const view=()=>{const old=S.selectedRow,k=old?.pts[S.pi]?.k??0;S.axis=$('vc9Axis').value;S.near=$('vc9Zoom').value==='atm';rebuild(old,k);};
  $('vc9Axis').onchange=view;$('vc9Zoom').onchange=view;
  $('vc9Blend').value='linear';$('vc9Blend').onchange=()=>{S.blend='linear';$('vc9Blend').value='linear';};
  $('vc9Render').onchange=e=>{S.plot=e.target.value;schedule();};
  $('vc9Az').oninput=e=>setAngles(+e.target.value,S.el);$('vc9El').oninput=e=>setAngles(S.az,+e.target.value);
  const setZoom=v=>{S.zoom=clamp(v,.78,1.45);const pct=Math.round(S.zoom*100);$('vc9ZoomCam').value=String(pct);mainText('vc9ZoomOut',pct+'%');schedule();};
  $('vc9ZoomCam').oninput=e=>setZoom((+e.target.value)/100);
  $('vc9Reset').onclick=()=>{S.near=false;S.axis='k';$('vc9Axis').value='k';$('vc9Zoom').value='full';$('vc9Blend').value='linear';S.blend='linear';setZoom(1.06);setAngles(32,28);rebuild(null,0);};
  $('vc9Tenor').oninput=e=>{const k=S.selectedRow?.pts[S.pi]?.k??0;chooseRow(S.rows[+e.target.value],k);renderPoint();};
  $('vc9Strike').oninput=e=>{S.pi=+e.target.value;renderPoint();};
  $('vc9Table').onclick=e=>{const btn=e.target.closest?.('[data-vc9-row]');if(!btn)return;const r=S.sources[Number(btn.getAttribute('data-vc9-row'))];chooseRow(r,0);renderPoint();};
  const chart=$('vc9Chart');chart.onpointerdown=e=>{pick(e);S.drag={id:e.pointerId,x:e.clientX,y:e.clientY,a:S.az,b:S.el,active:false};chart.setPointerCapture?.(e.pointerId);};
  chart.onpointermove=e=>{
    if(S.drag&&e.pointerId===S.drag.id){const d=S.drag,dx=e.clientX-d.x,dy=e.clientY-d.y;if(d.active||Math.hypot(dx,dy)>4){d.active=true;chart.classList?.add('vc9-dragging');setAngles(d.a+dx*.24,d.b-dy*.21);}return;}
    pick(e);
  };
  chart.onpointerleave=()=>{if(S.hover&&!S.drag){S.hover=false;renderPoint();}};
  chart.onpointerup=chart.onpointercancel=chart.onlostpointercapture=()=>{S.drag=null;chart.classList?.remove('vc9-dragging');};
  chart.onwheel=e=>{if(S.plot!=='3d')return; e.preventDefault();const step=e.deltaY<0?1.04:1/1.04;setZoom((S.zoom||1.06)*step);};
  chart.onkeydown=e=>{const k=e.key;if(k==='ArrowLeft'){e.preventDefault();setAngles(S.az-2,S.el);}else if(k==='ArrowRight'){e.preventDefault();setAngles(S.az+2,S.el);}else if(k==='ArrowUp'){e.preventDefault();setAngles(S.az,S.el+2);}else if(k==='ArrowDown'){e.preventDefault();setAngles(S.az,S.el-2);}else if(k==='+'||k==='='){e.preventDefault();setZoom((S.zoom||1.06)*1.04);}else if(k==='-'||k==='_'){e.preventDefault();setZoom((S.zoom||1.06)/1.04);}};
  const mini=$('vc9SliceChart');mini.onpointermove=mini.onpointerdown=e=>{const m=S.mini,r=S.selectedRow;if(!m||!r)return;const x=local(e,mini,m.W,1).x,v=between(m.lo,m.hi,clamp((x-m.left)/(m.right-m.left),0,1));const i=r.pts.reduce((a,p,j)=>Math.abs(valueX(p)-v)<Math.abs(valueX(r.pts[a])-v)?j:a,0);if(S.pi!==i){S.pi=i;renderPoint();}};
  root.addEventListener?.('resize',()=>{if(S.scope&&$('view-volcube').classList.contains('active'))schedule();});
  if(typeof root.ResizeObserver==='function'){const observer=new root.ResizeObserver(()=>{if(S.scope&&$('view-volcube').classList.contains('active'))schedule();});observer.observe($('vc9Chart'));}
}
mainText('vc9ZoomOut',Math.round(S.zoom*100)+'%');$('vc9ZoomCam').value=String(Math.round(S.zoom*100));$('vc9Blend').value=S.blend;bind();
root.VolCube9={setData,refresh:schedule,showError,open:name=>{if(name==='volcube')schedule();}};
})(window);

