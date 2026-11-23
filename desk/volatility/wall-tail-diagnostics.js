(function(root){
'use strict';
const Q=root.QuantCore,X=[.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363],W=[.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
function profile(r,alt,coord){
 const m=r.ws.model,F=m.F,x=alt?alt.nativeProfile.prices:m.knots.map(k=>F+m.scale*k),h=alt?alt.nativeProfile.densities:x.map(k=>m.pdf(k));
 const source=alt?Q.cviModel(alt.nativeProfile.cvi,[],r.T,Math.max(4,4*(coord==='native'?1:r.ws.mapping.alpha))):m;
 const law={lo:x[0],hi:x.at(-1),mass:1,cdf:source.cdf,survival:source.survival,quantile:source.quantile,isf:source.isf},mp=r.ws.mapping,anchor=coord==='native'?F:mp.anchor,alpha=coord==='native'?1:mp.alpha;
 function integrate(a,b,fn){
  let total=0;
  for(let i=1;i<x.length;i++){const l=Math.max(a,x[i-1]),u=Math.min(b,x[i]);if(l>=u)continue;
   const mid=(l+u)/2,half=(u-l)/2,d=x[i]-x[i-1];
   for(let k=0;k<X.length;k++){const off=half*X[k];for(const K of [mid-off,mid+off]){
    const density=source.pdf(K);
    if(density>0)total+=half*W[k]*density*fn(K);
   }}
  }return total/law.mass;
 }
 const norm=alpha===1?1:alt?(alt.mapping?.norm??integrate(law.lo,law.hi,k=>Math.pow(k/F,alpha))):mp.norm;
 const map=k=>alpha===1?k*(anchor/F):anchor*Math.pow(k/F,alpha)/norm;
 const inverse=k=>F*Math.pow(k*norm/anchor,1/alpha);
 const drift=integrate(law.lo,law.hi,k=>map(k)-anchor),mean=anchor+drift,midNative=inverse(mean);
 const down=integrate(law.lo,midNative,k=>(map(k)-mean)**2),up=integrate(midNative,law.hi,k=>(map(k)-mean)**2);
 return {law,map,integrate,mean,variance:down+up,sd:Math.sqrt(down+up),downsideSemideviation:Math.sqrt(down),upsideSemideviation:Math.sqrt(up),liquid:alt?.nativeLiquid||r.ws.nativeLiquid,
 liquidOrigin:alt&&!alt.nativeLiquid?'base':'individual',minimum:map(law.lo),maximum:map(law.hi),label:alt?.label||'Fit principale',fitQuotes:alt?.observations??r.ws.info.observations,
 within:alt?.within??r.ws.info.within};
}
function level(f,z){
 const upper=z>0,alpha=Q.Phi(-Math.abs(z)),law=f.law,cut=upper?law.isf(alpha):law.quantile(alpha),price=f.map(cut);
 const mass=upper?law.survival(cut):law.cdf(cut);
 if(!(mass>0))throw Error('La soglia arrotondata ha massa di coda nulla.');
 const a=upper?cut:law.lo,b=upper?law.hi:cut,excess=f.integrate(a,b,k=>f.map(k)-price)/mass,tailMean=price+excess;
 const tailVariance=f.integrate(a,b,k=>(f.map(k)-tailMean)**2)/mass,tailSD=Math.sqrt(Math.max(0,tailVariance));
 const outside=upper?law.survival(Math.max(cut,f.liquid[1])):law.cdf(Math.min(cut,f.liquid[0]));
 const varianceWeight=mass*(tailVariance+(tailMean-f.mean)**2)/f.variance;
 return {z,side:upper?'upper':'lower',targetMass:alpha,tailMass:mass,nativeCut:cut,price,withinLiquid:cut>=f.liquid[0]&&cut<=f.liquid[1],standardizedDistance:(price-f.mean)/f.sd,conditionalMean:tailMean,conditionalSD:tailSD,meanExcess:Math.abs(excess),outsideLiquidFraction:Math.max(0,Math.min(1,outside/mass)),shareOfTotalVariance:varianceWeight};
}
function analyze(r,coord){
 if(!r?.ws?.model||!['native','mapped'].includes(coord))throw Error('Servono un fit e una coordinata valida.');
 const levels=r.ws.levels.filter(v=>v.z!==0).map(v=>v.z),attempts=r.ws.sensitivityDetails||[];
 const out=[],fail=attempts.filter(a=>!a.ok).map(a=>({label:a.label,reason:a.error}));
 for(const a of [null,...attempts.filter(a=>a.ok&&a.nativeProfile)]){
  try{const p=profile(r,a,coord);out.push({label:p.label,fitQuotes:p.fitQuotes,within:p.within,liquid:p.liquid,liquidOrigin:p.liquidOrigin,mean:p.mean,sd:p.sd,downsideSemideviation:p.downsideSemideviation,upsideSemideviation:p.upsideSemideviation,support:[p.minimum,p.maximum],rows:levels.map(z=>level(p,z))});}
  catch(err){if(!a)throw err;fail.push({label:a.label,reason:err.message});}
 }
 const base=out[0],range=list=>out.length>1?[Math.min(...list),Math.max(...list)]:null;
 const bands=levels.map((z,j)=>Object.fromEntries(['price','conditionalMean','conditionalSD','outsideLiquidFraction','shareOfTotalVariance'].map(key=>[key,range(out.map(p=>p.rows[j][key]))])));
 return {format:'quantistes-ws-conditional-tails-v1',asof:r.cfg.asof,symbol:r.cfg.symbol,coordinate:coord,target:coord==='native'?r.cfg.expiry+'T'+r.cfg.expiryTime:r.cfg.target,anchor:r.cfg.anchor,quoteSource:r.cfg.quoteSource,quality:r.quality?.level,cviFingerprint:r.ws.model.cvi.certificate.fingerprint,primary:base,bands,sdRange:range(out.map(v=>v.sd)),alternatives:out.slice(1),failures:fail,requested:attempts.length};
}
root.WallTailDesk={analyze};
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const rows=$('wsTailRows'),summary=$('wsTailSummary'),status=$('wsTailStatus'),exp=$('wsTailExport');
const f=(x,d=2)=>Number.isFinite(x)?x.toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}):'—',pct=(x,d)=>f(100*x,d)+'%',band=(x)=>x?x.map(v=>f(v)).join(' – '):'—';
const table=(headers,data)=>'<table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+data.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
let saved=null,last=null;
function clear(){saved=null;exp.disabled=true;rows.textContent='';summary.textContent='';status.textContent='Seleziona una coordinata e calcola la diagnostica.';}
root.addEventListener('quantistes:research-stale',e=>{if(e.detail?.all)clear();});
root.addEventListener('quantistes:distribution',e=>{if(e.detail.result!==last){clear();last=e.detail.result;}});
$('wsTailCoord').onchange=clear;
$('wsTailCalc').onclick=()=>{clear();const r=root.Desk.state.result;if(!r?.ws||root.Desk.state.stale){status.textContent='Ricalcola prima il fit del desk.';return;}
 try{const a=analyze(r,$('wsTailCoord').value),p=a.primary;status.textContent=(r.quality?.level==='red'?'Fit in revisione · solo diagnostica. ':'')+(a.coordinate==='native'?'Cash nativo':'Scenario della mappa')+' · '+a.target+' ET · '+a.alternatives.length+' varianti utilizzabili su '+a.requested+' richieste.';
 summary.innerHTML=table(['Media Q','SD terminale','Intervallo SD · sensibilità','Semideviazione sotto media','Semideviazione sopra media','Finestra di quadratura'],[[f(p.mean),f(p.sd),band(a.sdRange),f(p.downsideSemideviation),f(p.upsideSemideviation),band(p.support)]]);
 rows.innerHTML=table(['z equiv.','K','Distanza / SD','Massa coda Q','Media oltre K','SD oltre K','Intervallo K · sensibilità','Intervallo SD oltre K','Eccesso medio','Massa di coda fuori strike','Quota varianza'],p.rows.map((v,i)=>[f(v.z,2),f(v.price),f(v.standardizedDistance,3),pct(v.tailMass,6),f(v.conditionalMean),f(v.conditionalSD),band(a.bands[i].price),band(a.bands[i].conditionalSD),f(v.meanExcess),pct(v.outsideLiquidFraction,1),pct(v.shareOfTotalVariance,3)]));
 saved=a;exp.disabled=false;
 }catch(e){status.textContent=e.message;}
};
exp.onclick=()=>{if(!saved||root.Desk.state.stale)return;const url=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Quantistes_code_WS_'+saved.coordinate+'_'+saved.target.slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
clear();
})(globalThis);
