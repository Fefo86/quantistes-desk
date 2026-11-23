
(function(w){
'use strict';
// Synthetic book with stated units. All strike distributions are initialized from a previously published screen.
const start=Date.parse('2025-11-13T10:00:00-05:00'), cadence=60000, minutes=90, pivot=6865;
const gammaScale=.01,charmScale=.001;
const units={delta:'ES equivalenti',gamma:'ES / punto SPX',charm:'ES / minuto',vanna:'ES / punto vol',speed:'ES / punto SPX²',color:'ES / punto SPX / minuto'};
const factors={delta:1,gamma:1,charm:1,vanna:1,speed:1,color:1};
const label='Replay sintetico · scala OA',id='oa-scale-demo';
const convention='Book dealer interamente simulato. Nella sola simulazione 1 unità OA gamma = 0,01 ES eq./pt SPX e 1 unità OA charm = 0,001 ES eq./min. Derivate a IV costante e tempo di calendario trascorso; vanna per un punto vol. Pressione = −(Γ × 0,50 pt + vanna × −0,10 pt vol + charm × 5 min); CP include solo il tempo.';
const round=(x,d=6)=>Number(x.toFixed(d));
const sum=(a,f)=>a.reduce((s,r)=>s+f(r),0);
function spot(m){return round(pivot+4.1*Math.sin(m/12.2)-3.2*Math.cos(m/7.1)+.031*m,2);}
function implied(m){return 18.5+.29*Math.cos(m/19)-.025*(spot(m)-pivot);}
function risk(i,k,anchor,m,s,iv){
 const phase=.42*i,x=s-pivot;
 const g=anchor.gamma*gammaScale,c=anchor.charm*charmScale;
 const a=.035*Math.abs(g)+.006,b=.002*Math.abs(g)+.0015,h=.055*Math.abs(c)+.0015;
 const omega=.072,rate=.121,tempo=.085;
 const theta=phase+m*omega,u=.7*phase+m*rate,v=.8*phase+m*tempo;
 const gamma=g+a*Math.sin(theta)+b*Math.cos(u)*x;
 const speed=b*Math.cos(u),color=a*omega*Math.cos(theta)-b*rate*Math.sin(u)*x;
 const charm=c+h*Math.cos(v)+a*omega*Math.cos(theta)*x-.5*b*rate*Math.sin(u)*x*x;
 const vanna=12*Math.cos(phase*.8)*(1+.25*Math.exp(-((k-pivot)**2)/1600));
 // Greek fields differentiate the same modeled delta in S, elapsed minutes and IV points.
 const delta=62*Math.sin(phase-.7)+vanna*(iv-18.5)+(g+a*Math.sin(theta))*x+.5*speed*x*x+c*m+h*(Math.sin(v)-Math.sin(.8*phase))/tempo;
 const callDelta=round(42+12*Math.cos(phase*.4+m/32)+.54*delta),net=round(delta);
 return {strike:k,delta:net,callDelta,putDelta:round(net-callDelta),gamma:round(gamma),charm:round(charm),speed:round(speed,9),color:round(color,9),vanna:round(vanna),
  oaGamma:round(gamma/gammaScale,7),oaCharm:round(charm/charmScale,7),inventoryGamma:round(gamma),dp:round(-(.5*gamma-.1*vanna+5*charm)),cp:round(-5*charm)};
}
let pack;
function build(){
 const reference=w.OAReference;
 if(!reference||!Array.isArray(reference.rows)||reference.rows.length!==48||Date.parse(reference.availableAt)>=start)return null;
 const anchors=[...reference.rows].sort((a,b)=>b.price-a.price);
 const base={id,label,source:'Simulazione Quantistes · profilo OA',kind:'inventory',mode:'demo',expiry:'ALL',timeframe:'intraday',modelPeriod:'intraday',comparableId:'sim-oa-48',
  windowMinutes:null,intervalMinutes:1,coverage:'full_book',perspective:'dealer',gammaSign:'dealer_long_positive',charmClock:'calendar_elapsed',units,oaCompatible:true};
 const frames=[];
 for(let i=0;i<=minutes;i++){
  const ts=start+i*cadence,s=spot(i),open=spot(i-1),iv=implied(i),basis=26.75+.32*Math.sin(i/14);
  const rows=anchors.map((r,j)=>risk(j,6985-5*j,r,i,s,iv));
  const pad=.2+.16*(1+Math.cos(.2*i))*.5;
  frames.push({...base,ts,availableAt:ts,freshThrough:ts+10*cadence,scope:'ALL',optionClass:null,lastTradeAt:null,pmSettled:null,spot:s,spotTs:ts,esSpot:Math.round((s+basis)*4)/4,esTs:ts,esContract:'ESZ25',iv:round(iv,4),
   bar:{start:ts-cadence,end:ts,open,close:s,high:round(Math.max(open,s)+pad,2),low:round(Math.min(open,s)-pad*.9,2)},regimeVerified:true,globalGamma:sum(rows,r=>r.gamma),globalGrossGamma:sum(rows,r=>Math.abs(r.gamma)),
   regimeSource:'Inventario sintetico · tutte le scadenze',pressureBasis:'modeled',units,factors,convention,rows});
 }
 return {...base,frames};
}
function list(cut=Date.now()){
 if(!Number.isFinite(cut)||cut<start)return [];
 if(!pack)pack=build();if(!pack)return [];
 const n=Math.min(pack.frames.length,1+Math.floor((cut-start)/cadence));
 return [{...pack,frames:pack.frames.slice(0,n)}];
}
w.OAReplay=Object.freeze({list});
})(window);

