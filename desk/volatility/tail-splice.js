
/* Tail completion only: each replacement keeps the wing mass and its first
   moment, which are the only two wing integrals entering an interior vanilla. */
(function(root){
'use strict';
function make(r,q,xi,spread){
 if(![-.25,0,.25,.6].includes(xi)||![1,2,4].includes(spread))throw Error('Specifica delle code non valida.');
 const m=r.ws.model,[L,U]=r.ws.nativeLiquid,{F,D}=m,pl=m.cdf(L),pu=m.survival(U);
 if(!(0<L&&L<U&&pl>1e-12&&pu>1e-12&&pl+pu<1))throw Error('Massa positiva identificabile numericamente richiesta su entrambi i raccordi.');
 const el=m.price(L,'PUT')/(D*pl),eu=m.price(U,'CALL')/(D*pu);
 if(!(el>0&&el<L&&eu>0))throw Error('Momenti di raccordo non validi.');
 const a=(L-el)/el,low=a/spread,high=a*spread,meanRatio=x=>x/(1+x);
 const weight=spread===1?1:(meanRatio(high)-meanRatio(a))/(meanRatio(high)-meanRatio(low));
 const powers=[[weight,low],[1-weight,high]],mix=fn=>powers.reduce((a,[w,k])=>a+w*fn(k),0),scale=(1-xi)*eu;
 const leftRelative=x=>mix(k=>x<=0?0:Math.exp(k*Math.log(x/L)));
 function rightRelative(s){const y=(s-U)/scale;if(xi===0)return Math.exp(-y);if(1+xi*y<=0)return 0;return Math.exp(-Math.log1p(xi*y)/xi);}
 function price(k,side){
 if(k>=L&&k<=U)return m.price(k,side);
 if(k<L){const put=k<=0?0:D*pl*k*mix(a=>Math.exp(a*Math.log(k/L))/(a+1));return side==='PUT'?put:put+D*(F-k);}
 const call=D*pu*rightRelative(k)*Math.max(0,scale+xi*(k-U))/(1-xi);return side==='CALL'?call:call+D*(k-F);
 }
 function quantile(p,t){
 if(!(p>0&&p<1&&t>0&&t<1))throw Error('Probabilità interna richiesta.');if(p<pl){let l=0,u=L;for(let i=0;i<75;i++){const mid=(l+u)/2;if(leftRelative(mid)<p/pl)l=mid;else u=mid;}return u;}
 if(t<pu){const logRatio=Math.log(t/pu);return U+scale*(xi===0?-logRatio:Math.expm1(-xi*logRatio)/xi);}
 return p<=.5?m.quantile(p):m.isf(t);
 }
 const central=q.integrate(s=>(s-F)**2,L,U),leftSecond=mix(k=>L*L*k/((k+1)**2*(k+2))+(L*meanRatio(k)-F)**2);
 const rightSecond=xi>=.5?Infinity:eu*eu/(1-2*xi)+(U+eu-F)**2;
 const sd=Math.sqrt(central+pl*leftSecond+pu*rightSecond),leftPDF=pl*mix(k=>k)/L,rightPDF=pu/scale;
 return {L,U,F,D,pl,pu,el,eu,xi,spread,weight,low,high,sd,price,quantile,leftDensityRatio:m.pdf(L)>0?leftPDF/m.pdf(L):null,rightDensityRatio:m.pdf(U)>0?rightPDF/m.pdf(U):null,
  cdf(s){return s<L?pl*leftRelative(s):s<=U?m.cdf(s):1-pu*rightRelative(s);},survival(s){return s>U?pu*rightRelative(s):s>=L?m.survival(s):1-pl*leftRelative(s);}};
}
function review(s,quotes,levels){
 const checks=quotes.map(o=>{const v=s.price(o.k,o.right);return Math.max(0,Number.isFinite(o.bid)?o.bid-v:0,Number.isFinite(o.ask)?v-o.ask:0);});
 const output=levels.map(({z,p,tail})=>{const chance=tail??(z>0?1-p:p),level=s.quantile(p,z>0?chance:1-p),expected=z>0?level+s.price(level,'CALL')/(s.D*chance):level-s.price(level,'PUT')/(s.D*chance);
 return {z,p,tail:chance,level,conditionalMean:expected};});
 return {lower:s.L,upper:s.U,pLower:s.pl,pUpper:s.pu,leftMeanShortfall:s.el,rightMeanExcess:s.eu,xi:s.xi,powerSpread:s.spread,lowExponent:s.low,highExponent:s.high,lowerMixtureWeight:s.weight,
 sd:Number.isFinite(s.sd)?s.sd:null,finiteVariance:Number.isFinite(s.sd),leftDensityRatio:s.leftDensityRatio,rightDensityRatio:s.rightDensityRatio,
 within:checks.filter(c=>c<=1e-6).length,total:checks.length,maxOutside:Math.max(...checks),levels:output};
}
root.TailCompletion={make,review};
})(globalThis);
