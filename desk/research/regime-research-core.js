(function(root){
'use strict';
const T=root.TimeResearchCore,D=root.DistributionCore,Q=root.QuantCore;
const finite=Number.isFinite;
const spec={version:'Q-width-PIT-1',predictor:'(Q90−Q10)/F',minimumTraining:80,minimumGroup:30,shrinkage:40,
 minimumHAC:30,pitBins:6,pitPrior:12,quantiles:[.05,.25,.5,.75,.95],
 selection:'Fixed ex ante. Exact series, ET fixing and time to maturity. Known, non-overlapping labeled forecasts only.'};
const key=d=>[d.series,d.asof_utc,d.expiry_utc].join('|');
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function median(a){const b=a.slice().sort((x,y)=>x-y),n=b.length;return n?(b[(n-1)>>1]+b[n>>1])/2:null;}
function mapFor(rows){
 const bins=Array(spec.pitBins).fill(0);
 for(const r of rows)bins[Math.min(bins.length-1,Math.floor(bins.length*r.u))]++;
 return D.pitMap(bins);
}
function blend(a,b,w){
 return {cdf:u=>(1-w)*a.cdf(u)+w*b.cdf(u),density:u=>(1-w)*a.density(u)+w*b.density(u),
  weights:a.weights.map((v,i)=>(1-w)*v+w*b.weights[i])};
}
const qMap={cdf:x=>x,density:()=>1};
function forecast(law,F,map){
 function inverse(p){
  if(map===qMap)return law.inverse(p);
  let lo=0,hi=1;for(let i=0;i<52;i++){const m=(lo+hi)/2;if(map.cdf(m)<p)lo=m;else hi=m;}
  return law.inverse((lo+hi)/2);
 }
 return {aboveForward:1-map.cdf(law.cdf(F)),quantiles:spec.quantiles.map(inverse)};
}
function assess(doc,law,y,map,qCRPS){
 const dens=law.pdf(y)*map.density(law.cdf(y));
 return {crps:finite(qCRPS)?qCRPS:T.scores(doc,law,y,map.cdf).crps,negativeLog:dens>0?-Math.log(dens):null,zeroDensity:!(dens>0)};
}
function hac(d){
 const n=d.length,estimate=avg(d);
 if(n<spec.minimumHAC)return {n,estimate,interval95:null,lag:null,standardError:null};
 const lag=Math.min(n-1,Math.max(1,Math.floor(4*(n/100)**(2/9)))),x=d.map(a=>a-estimate);
 let v=avg(x.map(a=>a*a));
 for(let k=1;k<=lag;k++){
  let c=0;for(let i=k;i<n;i++)c+=x[i]*x[i-k];
  v+=2*(1-k/(lag+1))*c/n;
 }
 const se=Math.sqrt(Math.max(v,0)/n);
 return {n,estimate,lag,standardError:se,interval95:[estimate-1.959964*se,estimate+1.959964*se]};
}
function summarize(rows){
 const paired=rows.filter(r=>r.score),names=['q','pooled','regime'],losses=['crps','negativeLog'],models={},differences={};
 const zeros=paired.filter(r=>names.some(k=>r.score[k].zeroDensity)).length;
 for(const n of names){
  models[n]={};for(const v of losses)models[n][v]=v==='negativeLog'&&zeros?null:avg(paired.map(r=>r.score[n][v]));
 }
 for(const [a,b] of [['regime','pooled'],['regime','q'],['pooled','q']]){
  const pair={};for(const v of losses)pair[v]=v==='negativeLog'&&zeros?{n:paired.length,estimate:null,interval95:null,lag:null,standardError:null,reason:'zero-density'}:hac(paired.map(r=>r.score[a][v]-r.score[b][v]));
  differences[a+'-'+b]=pair;
 }
 return {cohort:rows[0].cohort,paired:paired.length,zeroDensity:zeros,forecasts:rows.filter(r=>r.forecast.regime).length,models,differences};
}
function evaluate(evaluated){
 const labels=new Map(evaluated.pits.map(p=>[key(p),p])),cohorts=new Map(),output=[],seen=new Set();
 const sorted=evaluated.table.slice().sort((a,b)=>a.doc.asof_utc.localeCompare(b.doc.asof_utc)||a.doc.expiry_utc.localeCompare(b.doc.expiry_utc));
 for(const row of sorted){
  const d=row.doc,id=key(d);
  if(seen.has(id))throw Error('Previsione duplicata nel replay per regime.');seen.add(id);
  const origin=Date.parse(d.asof_utc),end=Date.parse(d.expiry_utc),clock=Q.nyFormat(end).slice(11)+'.'+String(end%1000).padStart(3,'0');
  const cohort=d.series+' | '+clock+' ET | '+(end-origin)+' ms',group=cohorts.get(cohort)||{past:[],records:[]};
  cohorts.set(cohort,group);
  const law=T.archiveLaw(d),width=d.forward>0?(law.inverse(.90)-law.inverse(.10))/d.forward:null;
  const current={cohort,series:d.series,asof:d.asof_utc,expiry:d.expiry_utc,forward:d.forward,width,threshold:null,group:null,weight:null,
   train:0,groupCount:0,breaches:0,zeroDensityTraining:0,pending:!finite(row.y),forecast:{q:forecast(law,d.forward,qMap),pooled:null,regime:null},score:null};
  const past=[];
  let lastEnd=-Infinity;
  for(const p of group.past){
   if(p.available>=origin||p.end>origin||p.origin<lastEnd)continue;
   past.push(p);lastEnd=p.end;
  }
  const n=past.length,threshold=median(past.map(p=>p.width)),bad=past.filter(p=>p.breach||p.u<=0||p.u>=1||p.zeroDensity).length;
  const isWide=p=>p>threshold;
  const subset=past.filter(p=>isWide(p.width)===isWide(width)),ng=subset.length;
  Object.assign(current,{train:n,threshold,group:threshold!==null?(isWide(width)?'wide':'narrow'):null,groupCount:ng,breaches:bad,
    zeroDensityTraining:past.filter(p=>p.zeroDensity).length,lastPublished:n?new Date(past.reduce((m,p)=>Math.max(m,p.available),0)).toISOString():null});
  if(!(width>0))current.reason='Ampiezza Q o forward inutilizzabile';
  else if(n<spec.minimumTraining)current.reason='Servono almeno 80 fixing già pubblicati';
  else if(bad)current.reason='Violazione del supporto, PIT estremo o densità nulla nel training';
  else{
   const pooled=mapFor(past);current.forecast.pooled=forecast(law,d.forward,pooled);
   const ws=past.map(p=>p.width),min=ws.reduce((a,b)=>Math.min(a,b),Infinity),max=ws.reduce((a,b)=>Math.max(a,b),-Infinity);
   if(max-min<1e-10*Math.max(1,max)||ng===n)current.reason='Due gruppi distinguibili assenti nel training';
   else if(ng<spec.minimumGroup)current.reason='Servono almeno 30 fixing nel gruppo';
   else{
    const w=ng/(ng+spec.shrinkage),selected=blend(pooled,mapFor(subset),w);
    current.weight=w;current.reason='Previsione sperimentale disponibile';current.pooledWeights=pooled.weights;current.regimeWeights=selected.weights;
    current.forecast.regime=forecast(law,d.forward,selected);
    if(finite(row.y)){
     current.score={q:assess(d,law,row.y,qMap,row.q?.crps),pooled:assess(d,law,row.y,pooled),regime:assess(d,law,row.y,selected)};
     current.score.fixing=row.y;current.score.supportBreach=law.breach(row.y);
    }
   }
  }
  const label=labels.get(id);
  if(label&&width>0){
   const available=Date.parse(label.available_utc);
   if(!(end>=origin&&available>=end))throw Error('Settlement con marca temporale incoerente.');
   group.past.push({origin,end,available,width,u:label.pit_q,breach:label.support_breach===1,zeroDensity:!finite(row.y)||!(law.pdf(row.y)>0)});
  }
  group.records.push(current);output.push(current);
 }
 return {spec,rows:output,cohorts:[...cohorts.values()].map(v=>summarize(v.records))};
}
root.RegimeResearch={evaluate,hac,spec};
})(globalThis);
