/* Independent integration of the piecewise-linear native density using local polynomial primitives. */
(function(root){
'use strict';
function verify(r){
 const m=r.ws.model,book=r.ws.cvi;
 if(!m.cvi||!book?.markReleased)throw Error('Serve un mark CVI verificato.');
 const strikeSet=new Set([...m.knots.map(k=>m.F+m.scale*k),...book.points.map(p=>p.K),r.cfg.settlement]);
 const x=[...strikeSet].filter(k=>k>0&&Number.isFinite(k)).sort((a,b)=>a-b);
 const pos=[.09501250983763744,.2816035507792589,.4580167776572274,.6178762444026438,.755404408355003,.8656312023878318,.9445750230732326,.9894009349916499];
 const weights=[.1894506104550685,.1826034150449236,.16915651939500254,.14959598881657673,.12462897125553387,.09515851168249278,.06225352393864789,.027152459411754095];
 const cum=[0],first=[0],rev=Array(x.length).fill(0),revFirst=Array(x.length).fill(0),cell=[];
 for(let j=1;j<x.length;j++){const l=x[j-1],b=x[j],mid=(l+b)/2,h=(b-l)/2;let dm=0,df=0;
  for(let i=0;i<pos.length;i++)for(const k of [mid-h*pos[i],mid+h*pos[i]]){
   const d=m.pdf(k)*h*weights[i];dm+=d;df+=d*(k-m.F);}
  cell.push([dm,df]);cum.push(cum.at(-1)+dm);first.push(first.at(-1)+df);
 }
 for(let j=x.length-2;j>=0;j--){rev[j]=rev[j+1]+cell[j][0];revFirst[j]=revFirst[j+1]+cell[j][1];}
 const mass=cum.at(-1),mean=m.F+first.at(-1)/mass,firstError=Math.abs(mean-m.F);
 let max=0,inside=0;
 const at=new Map(x.map((k,i)=>[k,i]));
 for(const z of book.points){const j=at.get(z.K),u=z.K-m.F;
  const px=m.D*(z.side==='PUT'?u*cum[j]-first[j]:revFirst[j]-u*rev[j]);
  max=Math.max(max,Math.abs(px-z.mark));if((z.bid==null||px>=z.bid-1e-8)&&(z.ask==null||px<=z.ask+1e-8))inside++;
 }
 const maxCDF=x.reduce((v,k,i)=>Math.max(v,Math.abs(cum[i]-m.cdf(k))),0);
 return {mass,mean,forward:m.F,firstError,repricingError:max,cdfError:maxCDF,count:book.points.length,inside,
  probabilityAboveReference:rev[at.get(r.cfg.settlement)],passes:Math.abs(mass-1)<1e-8&&firstError<1e-6&&max<1e-7&&maxCDF<1e-8&&inside===book.points.length};
}
root.ResearchVerification={verify};
const $=id=>document.getElementById(id),n=(v,d=8)=>Number.isFinite(v)?v.toLocaleString('it-IT',{maximumFractionDigits:d}):'—';
const output=$('rsVerifyOut');let epoch=0;
root.addEventListener('quantistes:research-stale',e=>{if(e.detail?.all){epoch++;output.textContent='';}});
$('rsVerify').onclick=async()=>{
 const result=root.Desk.state.result,asof=epoch;
 if(!result?.ws||root.Desk.state.stale){output.textContent='Calcola prima una curva aggiornata.';return;}
 try{const z=verify(result);
 const hashResult='Impronta dei coefficienti '+result.ws.model.cvi.certificate.fingerprint.slice(0,16)+'.';
 if(epoch!==asof)return;
 output.textContent=(z.passes?'Controlli numerici superati. ':'Controllo numerico fuori tolleranza. ')+z.inside+' / '+z.count+' riprezzamenti conformi ai lati quotati. Massa '+n(z.mass,12)+' · errore media rispetto al forward '+z.firstError.toExponential(3)+' punti · massimo scarto prezzi '+z.repricingError.toExponential(3)+' punti · massimo scarto CDF ai nodi '+z.cdfError.toExponential(3)+' · Q sopra il riferimento '+n(z.probabilityAboveReference*100,6)+'%. '+hashResult;
 }catch(e){if(epoch===asof)output.textContent=e.message;}
};
})(globalThis);
