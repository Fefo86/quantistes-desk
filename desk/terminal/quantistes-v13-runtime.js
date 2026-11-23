

/* Quantistes Confluence Desk — unified numerical & UI presentation */
(function(root){'use strict';
const $=id=>document.getElementById(id), E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const F=Number.isFinite, cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt=(x,n=2)=>x!==null&&x!==undefined&&x!==''&&F(+x)?(+x).toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const pc=x=>F(x)?fmt(x*100,1)+'%':'—';const pcolor={gold:'#eebb76',mint:'#7bd6b4',cyan:'#7dd3e0',red:'#ed95a1',bg:'#0e1924',grid:'#2c4050'};
const R={stage:'score',rows:[],validation:null,atlas:null,ready:false,spot:NaN,vix:NaN,target:NaN,band:3,hour:'all',sample:[],current:null,prototype:[],selected:-1,hovered:-1,locked:false,scenario:'ALL',ladder:null,scenarioTilt:0,source:'REPLAY',snap:null,score:null,renderKey:'',feedTimer:null,flowUnitsOk:false,domReady:false,previousQ:null,sourceStamp:'',pathsLast:0};
let updateClockTimer;
const ck=(key,val)=>document.querySelectorAll('[data-q13-view="'+key+'"]').forEach(e=>{e.classList.toggle('on',key===val);e.setAttribute('aria-current',key===val?'page':'false')});
const dateFmt=s=>String(s??'').replace(/^(\d{4})(\d\d)(\d\d)$/,'$1-$2-$3');
function plotStyle(h=365){return{height:h,margin:{l:59,r:27,t:25,b:50},paper_bgcolor:pcolor.bg,plot_bgcolor:pcolor.bg,font:{family:'Consolas',size:11,color:'#a4bbd1'},xaxis:{gridcolor:'#29445e',zerolinecolor:'#31506a',showspikes:true,spikemode:'across',spikesnap:'cursor',spikecolor:'#66aed0',spikethickness:1},yaxis:{gridcolor:'#29445e',zerolinecolor:'#31506a',showspikes:true,spikemode:'across',spikecolor:'#66aed0'},hovermode:'x unified',showlegend:true,legend:{orientation:'h',x:0,y:1.09,font:{size:10,color:'#abc1d5'}},dragmode:'zoom',uirevision:'q13-fixed',hoverlabel:{bgcolor:'#0b2033',font:{color:'#b1cff8',family:'Consolas',size:11},bordercolor:'#2b6587'}}}
const plotCfg={responsive:true,displaylogo:false,scrollZoom:false,toImageButtonOptions:{format:'png',filename:'Quantistes_Confluence_Terminal',width:2400,height:1350,scale:2},modeBarButtonsToRemove:['lasso2d','select2d','toggleSpikelines']};
async function plot(id,traces,layout){const el=$(id);if(!el||!root.Plotly)return;if(!el.closest('.q13-view.on'))return;try{await root.Plotly.react(el,traces,layout,plotCfg)}catch(e){el.innerHTML='<div class="q13-placeholder">Chart unavailable: '+E(e.message)+'</div>'}}
function placeholder(id,msg){const e=$(id);if(e?.classList.contains('js-plotly-plot'))root.Plotly?.purge?.(e);if(e)e.innerHTML='<div class="q13-placeholder">'+E(msg)+'</div>'}
function tile(label,value,sub=''){return `<div class="q13-strip-card"><small>${E(label)}</small><strong>${E(value)}</strong>${sub?`<em>${E(sub)}</em>`:''}</div>`}
function stateTag(ok,txt){return `<span class="q13-state ${ok===false?'no':ok==='partial'?'warn':''}">${E(txt)}</span>`}
const quant=(a,p)=>{if(!a.length)return NaN;const n=a.length-1,k=cl(p,0,1)*n,i=Math.floor(k),f=k-i;return a[i]*(1-f)+a[Math.min(n,i+1)]*f};
function nowNY(){return new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).format(new Date())}
function isoDayNY(x){if(!x)return null;try{const q=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(x)).filter(v=>v.type!=='literal').map(v=>[v.type,v.value]));return q.year+'-'+q.month+'-'+q.day}catch(_){return null}}
function asMillis(x){return Date.parse(x||'')}
function currentSnapshot(){return root.QuantistesV12?.snapshot?.()||null}
function nativeQ(){const state=root.Desk?.state,rs=state?.result;if(!rs||state.stale||!rs.ws?.model)return null;return rs}
function nativeFlow(){return root.FlowDesk?.scenarioSnapshot?.()||null}
function nativeP(){return root.QuantistesDynamic?.stats?.()||null}
function sources(){const snap=currentSnapshot();if(snap?.asof){R.snap=snap;R.source=(R.feedTimer||root.QuantistesV12?.getState?.()?.connected)?'SNAPSHOT STREAM':'UPLOADED SNAPSHOT';const e=snap.es??{};if(F(+e.last)&&+e.last>0)R.spot=+e.last;if(F(+snap.vix?.value)&&+snap.vix.value>0)R.vix=+snap.vix.value;}else if(['SNAPSHOT STREAM','UPLOADED SNAPSHOT'].includes(R.source)&&R.snap?.asof===undefined)R.source='REPLAY';return snap}
function fresh(t,seconds=90){const ms=asMillis(t);return F(ms)&&Date.now()-ms>=0&&Date.now()-ms<=seconds*1000}
function qAligned(q,s){if(!q?.cfg?.asof||!s?.asof)return false;return DeskMeasures.recent(root.QuantCore.nyEpoch(q.cfg.asof),DeskMeasures.stamp(s.asof),300);}
function ladderAligned(l,s){return DeskMeasures.recent(DeskMeasures.stamp(l?.asof),DeskMeasures.stamp(s?.asof),300);}
function getInput(){const spot=Number($('q13Spot')?.value),vix=Number($('q13Vix')?.value),target=Number($('q13Target')?.value),band=Number($('q13Band')?.value)||3;
 if(!F(spot)||spot<100||!F(target)||target<100||Math.abs(spot*4-Math.round(spot*4))>1e-6||Math.abs(target*4-Math.round(target*4))>1e-6||!F(vix)||vix<6||vix>100)throw Error('ES/TARGET devono rispettare tick da 0,25; VIX fra 6 e 100.');return{spot,vix,target,band:cl(band,.5,15),hour:$('q13Session')?.value||'all'};}
function setDefaults(){const reg=R.validation?.regime_daily||[];const last=reg[reg.length-1],actualVix=[...reg].reverse().find(r=>F(+r[1])&&+r[1]>=6);R.spot=R.spot||Math.round(Number(last?.[3])*4)/4;R.vix=R.vix||Number(actualVix?.[1])||20;R.target=R.target||R.spot+4;R.band=3;
 $('q13Spot').value=R.spot.toFixed(2);$('q13Target').value=R.target.toFixed(2);$('q13Vix').value=R.vix.toFixed(1);$('q13Band').value=R.band.toFixed(1);
}
function classify(r,bound){const end=r[6],half=r[3],early=r[2],peak=r[7],trough=r[8];if(end>bound&&half>bound*.55&&end-half>bound*.25)return 'UP';if(end<-bound&&half<-bound*.55&&half-end>bound*.25)return 'DOWN';if(Math.abs(end)<bound*.8&&(peak>bound*1.1||trough>bound*1.1))return 'REVERSION';if(end>bound)return 'UP';if(end<-bound)return 'DOWN';if(peak+trough>bound*3)return 'EXPANSION';return 'BALANCE'}
const scenarios=[['UP','UPTREND / INITIATIVE','#85cae5'],['DOWN','DOWN TREND / LIQUIDATION','#dfdbcb'],['BALANCE','BALANCE / COMPRESSION','#88b3eb'],['REVERSION','MEAN REVERSION','#84c9e4'],['EXPANSION','TWO-SIDED EXPANSION','#84b0e9']];
function subset(){const c=getInput();R.spot=c.spot;R.vix=c.vix;R.target=c.target;R.band=c.band;R.hour=c.hour;
 const ref=currentSnapshot(),timing=ref?DeskMeasures.priceClockError(ref):null;if(timing)throw Error(timing);const before=ref?DeskMeasures.dateKey(isoDayNY(ref.asof)):Infinity;const pool=R.rows.filter(r=>r[9]<before);const time=r=>c.hour==='all'||(c.hour==='open'?r[1]<690:c.hour==='mid'?r[1]>=690&&r[1]<840:r[1]>=840);
 let rows=pool.filter(r=>time(r)&&Math.abs(r[0]/100-c.vix)<=c.band);let note='',outOfDomain=false;
 if(rows.length<220){rows=pool.filter(r=>time(r)&&Math.abs(r[0]/100-c.vix)<=Math.max(5,c.band));note='BANDA ESTESA PER CAMPIONE RIDOTTO';outOfDomain=true;}
 if(rows.length<220){rows=pool.filter(time);note='REGIME VIX FUORI SUPPORTO: P NON CONDIZIONATA';outOfDomain=true;}
 if(!rows.length){R.current=null;R.prototype=[];R.selected=-1;throw Error('Nessuna finestra storica disponibile per questo segmento');}
 const ends=rows.map(r=>r[6]).sort((a,b)=>a-b),b=Math.max(2,Math.round((quant(ends,.75)-quant(ends,.25))*.35));let sum=0,sumup=0,sumdn=0,flat=0,touch=0,terminal=0;const dt=Math.round((c.target-c.spot)*4);const cols=Array.from({length:6},()=>[]),classification={};let min=Infinity,max=-Infinity;const byDay={};
 for(const r of rows){for(let j=0;j<6;j++)cols[j].push(j===0?0:r[j+1]);sum+=r[6];if(r[6]>0)sumup++;else if(r[6]<0)sumdn++;else flat++;if(dt>=0){if(dt===0||r[7]>=dt)touch++;if(r[6]>=dt)terminal++}else{if(r[8]>=-dt)touch++;if(r[6]<=dt)terminal++}min=Math.min(min,r[6]);max=Math.max(max,r[6]);const key=classify(r,b);classification[key]=(classification[key]||0)+1;byDay[r[9]]=(byDay[r[9]]||0)+1;}
 const q=cols.map(a=>{a.sort((a,b)=>a-b);return[.05,.25,.5,.75,.95].map(p=>quant(a,p))});
 const n=rows.length,dayCount=Object.keys(byDay).length;R.current={rows,n,mean:sum/n,up:sumup/n,down:sumdn/n,flat:flat/n,touch:touch/n,terminal:terminal/n,lo:q[5][0],hi:q[5][4],q,b,counts:classification,days:dayCount,note,outOfDomain,targetTicks:dt,frameMin:Math.min(...ends),frameMax:Math.max(...ends)};R.sample=rows;
 if(R.stage==='path')computePrototypes();return R.current;}
function compare(r,a){let z=0;for(let j=2;j<=6;j++){let v=r[j]-a[j];z+=(v*v)/(j*4+2);}return z}
function computePrototypes(){const c=R.current;if(!c)return;const limit=110,groups={};for(const r of c.rows){const a=classify(r,c.b);(groups[a]||(groups[a]=[])).push(r)}
 const entries=Object.entries(groups);
 const allocations=entries.map(([k,arr])=>({k,arr,n:1,ideal:Math.min(limit,c.n)*arr.length/c.n}));
 let left=Math.min(limit,c.n)-allocations.length;
 while(left-->0){const candidates=allocations.filter(a=>a.n<a.arr.length);candidates.sort((a,b)=>(b.ideal-b.n)-(a.ideal-a.n));if(!candidates.length)break;candidates[0].n++;}
 const proto=[],masses=[];
 for(const {arr,n} of allocations){arr.sort((a,b)=>a[6]-b[6]||a[3]-b[3]||a[9]-b[9]);const ids=[];
  for(let j=0;j<n;j++){ids.push(proto.length);proto.push(arr[Math.min(arr.length-1,Math.floor((j+.5)*arr.length/n))]);masses.push(0);}
  for(const r of arr){let ix=ids[0],best=Infinity;for(const j of ids){const dist=compare(r,proto[j]);if(dist<best){best=dist;ix=j;}}masses[ix]++;}}
 R.prototype=proto.map((r,i)=>({id:i,row:r,mass:masses[i]/c.n,count:masses[i],scenario:classify(r,c.b)}));
 R.prototype.sort((a,b)=>b.mass-a.mass||a.id-b.id);R.prototype.forEach((p,i)=>p.id=i);R.selected=-1;R.locked=false;R.scenario='ALL';}
function ensurePrototypes(){if(!R.current)return;if(!R.prototype.length)computePrototypes()}
function calcOnChange(){try{const c=subset();R.prototype=[];computePrototypes();renderStage();}catch(e){R.current=null;R.prototype=[];R.probPaths=[];R.selected=-1;for(const id of ['q13FanSvg','q13MiniScenarios','q13PathKpis','q13PathRows','q13ScenarioList'])$(id)?.replaceChildren();$('q13SideStatus').textContent=String(e.message||e);if($('q13PathsNote'))$('q13PathsNote').textContent=String(e.message||e);}}
function getScore(){
 const snap=sources(),q=nativeQ(),l=R.ladder;
 return {regime:R.vix>=30?'STRESS':R.vix>=21?'ELEVATED':R.vix>=14?'NORMAL':'LOW VOL',
 hasDealer:!!(l?.rows?.length&&l.signed===true&&l.provenance==='PROVIDER_OBSERVED'&&l.dealer_position_identified===true&&ladderAligned(l,snap)),validHorizon:!!l?.expiry&&l.expiry===q?.cfg?.expiry};
}
function renderScore(){
 const snap=sources(),source=snap?(R.feedTimer?'FLUSSO ES':'SNAPSHOT ES'):'ARCHIVIO ES';
 for(const [id,text] of [['q13SideStatus',source],['q13SideSource',snap?snap.asof:fmt(R.rows.length,0)+' finestre ES'],['q13RunMode',source],['q13StampBar',snap?snap.asof:'ARCHIVIO ES  /  SPXW SU SNAPSHOT']]){const n=$(id);if(n&&n.textContent!==text)n.textContent=text;}
}
function renderMarket(){const q=nativeQ(),c=R.current,dp=nativeP();let m=q?.ws?.model,cv=q?.ws?.cvi;
 $('q13MarketKpis').innerHTML=[tile('ES • REFERENCE',fmt(R.spot),'futures · 0.25 tick'),tile('VIX • REGIME',fmt(R.vix,2),getScore().regime),tile('CVI • Q',m?'FITTED':'NO CHAIN',q?.cfg?.expiry||'SPXW expected'),tile('P • ES',c?fmt(c.n,0)+' WINDOWS':'WAIT',c?fmt(c.days,0)+' sessions / 5m':'historical')].join('');
 $('q13SkewStatus').textContent=m?'CVI FIT · SPXW '+(q.cfg?.expiry||''):'AWAITING SPXW CHAIN';
 if(!m||!cv?.marks?.canonical||!(q.T>0||cv.T>0)||!root.CVIFit?.evaluate){placeholder('q13Skew','IMPORTA / CALCOLA UNA CHAIN THETADATA SPXW \n La curva di skew non può essere dedotta dai futures ES.');placeholder('q13Survival','Q terminale disponibile dopo CVI fitting SPXW.');}
 else try{
 const Fwd=m.F||q.forward?.F,T=q.T||cv.T;let low=cv.observedStrike?.[0]||F*.94,high=cv.observedStrike?.[1]||F*1.06;if(!F(low)||!F(high)||low>=high){low=Fwd*.95;high=Fwd*1.05}
 const K=Array.from({length:180},(_,i)=>low+i*(high-low)/179),iv=K.map(k=>Math.sqrt(Math.max(0,root.CVIFit.evaluate(cv.marks.canonical,Math.log(k/Fwd)).w/T))*100),qn=K.map(k=>m.survival(k));
 const a=plotStyle(365);a.xaxis.title='SPX STRIKE';a.yaxis.title='ANNUALIZED IV %';a.shapes=[{type:'line',xref:'x',yref:'paper',x0:Fwd,x1:Fwd,y0:0,y1:1,line:{color:pcolor.gold,width:1,dash:'dash'}}];
 plot('q13Skew',[{type:'scatter',mode:'lines',x:K,y:iv,name:'CVI / IV',line:{color:pcolor.gold,width:3},hovertemplate:'SPX STRIKE %{x:.2f}<br>IV %{y:.3f}%<extra></extra>'}],a);
 const b=plotStyle(365);b.xaxis.title='STRIKE';b.yaxis.title='Q(S EXPIRY > K)';b.yaxis.tickformat='.0%';
 plot('q13Survival',[{type:'scatter',mode:'lines',x:K,y:qn,name:'RISK NEUTRAL Q',fill:'tozeroy',fillcolor:'rgba(134,203,230,.08)',line:{color:pcolor.cyan,width:3},hovertemplate:'STRIKE %{x:.2f}<br>Q SURVIVAL %{y:.2%}<extra></extra>'}],b);
 }catch(e){placeholder('q13Skew','CVI plot unavailable: '+e.message);placeholder('q13Survival','Fit stored, but Q survival evaluation not available: '+e.message)}
 const reg=R.validation?.regime_daily||[];if(reg.length){const x=reg.map(v=>v[0]),vix=reg.map(v=>v[1]),vvix=reg.map(v=>v[2]);const l=plotStyle(365);l.xaxis.type='date';l.yaxis.title='VIX';l.yaxis2={overlaying:'y',side:'right',showgrid:false,title:'VVIX',tickfont:{color:pcolor.cyan}};plot('q13Regime',[{type:'scatter',mode:'lines',x,y:vix,name:'VIX',line:{color:pcolor.gold,width:2},connectgaps:false},{type:'scatter',mode:'lines',x,y:vvix,name:'VVIX',yaxis:'y2',line:{color:pcolor.cyan,width:2},connectgaps:false}],l)}else placeholder('q13Regime','Historical VIX/VVIX not loaded');
 renderMarketLevels(q);
}
function renderMarketLevels(q){const e=$('q13MarketLevels'),levels=q?.ippo?.levels||[],ws=q?.ws?.levels||[];if(!levels.length&&!ws.length){e.innerHTML='<div class="q13-placeholder">IPPO / Wall Street levels disponibili dopo caricamento chain e fitting CVI.</div>';return}
 const selected=levels.filter(x=>[-2,-1,0,1,2].includes(Number(x.z))).sort((a,b)=>Number(a.z)-Number(b.z));const wsel=ws.filter(x=>[-2,-1,0,1,2].includes(Number(x.z))).sort((a,b)=>Number(a.z)-Number(b.z));
 const cards=arr=>arr.map(v=>'<div class="q13-levelitem"><small>'+E(''+v.z)+'σ</small><strong>'+fmt(v.price,2)+'</strong></div>').join('');
 e.innerHTML='<div class="q13-levelrow"><b>IPPO</b>'+cards(selected)+'</div>'+(wsel.length?'<div class="q13-levelrow"><b>WALL STREET</b>'+cards(wsel)+'</div>':'');$('q13LevelsMeta').textContent='SPX '+(q?.cfg?.expiry||'UNKNOWN EXPIRY')+' · THEORETICAL LEVELS · NOT ES FUTURES';
}
function parseDealerRows(rs){
 const rows=rs.map((row,i)=>{const take=(...keys)=>{for(const key of keys){const v=DeskMeasures.number(row?.[key]);if(v!==null)return v;}return null;};
 const strike=take('strike','K','k'),gamma=take('gamma','gamma_per_point'),vanna=take('vanna','vanna_per_vol_point'),charm=take('charm','charm_per_minute');
 if(!(strike>0)||[gamma,vanna,charm].includes(null))throw Error('Riga dealer '+(i+1)+' · specificare strike, gamma, vanna e charm; zero esplicito ammesso.');
 const rowOut={strike,gamma,vanna,charm};for(const g of ["delta","speed","color"]){if(row[g]!=null){const v=take(g);if(v===null)throw Error("Valore invalido per "+g);rowOut[g]=v;}}return rowOut;}).sort((a,b)=>a.strike-b.strike);
 if(rows.some((row,i)=>i>0&&row.strike===rows[i-1].strike))throw Error('Strike duplicato nella stessa ladder firmata');
 return rows;
}
async function loadDealer(file){if(!file||file.size>4e6)throw Error('Dealer ladder max 4 MB');const raw=await file.text();if(file.name.toLowerCase().endsWith('.csv'))throw Error('Usa JSON con unità, expiry e asof espliciti.');return applyDealerObject(JSON.parse(raw))}
function applyDealerObject(o){
 if(o.available_at!=null&&(DeskMeasures.stamp(o.available_at)===null||DeskMeasures.stamp(o.available_at)<DeskMeasures.stamp(o.asof)))throw Error('Disponibilità della ladder precedente al dato o priva di fuso.');if(o.schema!=='quantistes.dealer_strikes.v1')throw Error('Schema atteso: quantistes.dealer_strikes.v1');
 if(o.signed!==true||DeskMeasures.stamp(o.asof)===null||!/^\d{4}-\d{2}-\d{2}$/.test(o.expiry)||o.units!=='ES_DELTA_EQUIVALENT'||!o.asof||!o.expiry||!F(asMillis(o.asof))||!Array.isArray(o.rows)||o.rows.length<3)throw Error('Richiesti signed=true, units=ES_DELTA_EQUIVALENT, asof ISO, expiry e >=3 strikes');
 if(!(Number(o.spot_spx)>100)||DeskMeasures.number(o.es_basis)===null)throw Error('Richiesti spot_spx e es_basis=ES-SPX entrambi osservati al cutoff');
 const lastTradeAt=o.last_trade_at==null?null:DeskMeasures.stamp(o.last_trade_at);if(o.last_trade_at!=null&&(lastTradeAt===null||DeskMeasures.clock(o.last_trade_at).date>o.expiry)||o.option_class!=null&&!['SPX','SPXW'].includes(o.option_class)||o.pm_settled!=null&&typeof o.pm_settled!=='boolean'||o.option_class==='SPXW'&&o.pm_settled===false)throw Error('Classe o fine negoziazione della ladder incoerente.');
 const rows=parseDealerRows(o.rows);
 const optionalUnits={delta:'ES',speed:'ES_PER_SPX_POINT2',color:'ES_PER_SPX_POINT_PER_MINUTE'};for(const [name,unit] of Object.entries(optionalUnits))if(rows.some(r=>r[name]!=null)&&o.greek_units?.[name]!==unit)throw Error('Specificare greek_units.'+name+' = '+unit+' per i campi opzionali.');
 if(rows.some(r=>!F(r.gamma)||!F(r.vanna)||!F(r.charm)))throw Error('Greche firmate non valide');R.ladder={option_class:o.option_class||null,lastTradeAt,pmSettled:o.pm_settled??(o.option_class==='SPXW'?true:null),es_contract:typeof o.es_contract==='string'?o.es_contract.trim()||null:null,available_at:o.available_at||o.asof,schema:o.schema,signed:true,asof:o.asof,expiry:o.expiry,units:o.units,spot_spx:Number(o.spot_spx),es_basis:Number(o.es_basis),source:String(o.source||'USER-SUPPLIED'),provenance:o.provenance,dealer_position_identified:o.dealer_position_identified===true,iv_slope_volpoints_per_spx:DeskMeasures.number(o.iv_slope_volpoints_per_spx),rows};root.dispatchEvent(new CustomEvent('desk:dealer-ladder'));R.scenarioTilt=0;$('q13HedgeBeta').value=0;$('q13BetaValue').textContent='OFF / β 0.0';renderScore();if(R.stage==='dealer')renderDealer();if(R.stage==='path')renderPaths();root.DeskFields?.refresh();return R.ladder;}
function hedgeForPath(row,beta=R.scenarioTilt){const L=R.ladder;if(!L?.rows?.length)return null;const spot=R.spot;
 // The local-linear map uses signed dealer delta equivalents at as-of. It is not an SDE forecast.

 const deltaVolPerPt=Number(L.iv_slope_volpoints_per_spx)||0;let gross=0,signed=0,abs=0,components={gamma:0,vanna:0,charm:0};const perStrike=L.rows.map(r=>({strike:r.strike,gamma:0,vanna:0,charm:0})),perMinute=[];for(let j=1;j<=5;j++){
  const px=spot+Number(row[j+1])*.25,prev=spot+(j===1?0:Number(row[j]))*.25;const dp=px-prev;
  let g=0,v=0,h=0;L.rows.forEach((s,i)=>{g+=s.gamma;v+=s.vanna;h+=s.charm;perStrike[i].gamma-=s.gamma*dp;perStrike[i].vanna-=s.vanna*deltaVolPerPt*dp;perStrike[i].charm-=s.charm;});
  const a=-g*dp,b=-v*deltaVolPerPt*dp,d=-h*1;let hed=a+b+d;gross+=hed;components.gamma+=a;components.vanna+=b;components.charm+=d;abs+=Math.abs(hed);signed+=dp*hed;perMinute.push({minute:j,hedge:hed,cum:gross,price:px});
 }
 const align=abs>1e-8?cl(signed/(abs*(Math.max(.25,Math.abs(row[6]*.25)/5))),-4,4):0;return{net:gross,align,components,abs,perStrike,perMinute};}
function renderDealer(){const f=nativeFlow(),L=R.ladder,z=getScore(),valid=L?.rows?.length>0;let from=valid?'LADDER FIRMATA':'IN ATTESA DI POSIZIONI';
 $('q13DealerNotice').innerHTML=valid?`<b>${E(L.source||'USER-SUPPLIED DEALER LADDER')}</b> · ${E(L.provenance||'UNVERIFIED / USER INPUT')} · as-of ${E(L.asof)} · ${L.rows.length} strike · expiry ${E(L.expiry)}. ${z.hasDealer?'Clock aligned with ES snapshot.':'NOT CONTEMPORANEOUS WITH ES.'} ${!z.validHorizon?'Expiry mapping to Q unverified.':''} Sensibilità al cutoff, aggregate sugli strike. ${DeskMeasures.number(L.iv_slope_volpoints_per_spx)===null?'IV costante nello scenario.':'ΔIV = slope × ΔSPX.'} Base ES–SPX costante.`:'<b>INVENTARIO IN ATTESA</b> · Carica esposizioni firmate per strike con data, scadenza e unità. I campi per spot di scenario sono disponibili in Greek Response.';
 const rows=valid?L.rows:[],gamma=rows.reduce((s,r)=>s+r.gamma,0),vanna=rows.reduce((s,r)=>s+r.vanna,0),charm=rows.reduce((s,r)=>s+r.charm,0),kdom=rows.reduce((a,b)=>Math.abs(b.gamma)>Math.abs(a?.gamma||0)?b:a,rows[0]);
 $('q13DealerKpis').innerHTML=[tile('SOURCE',from,valid?(z.hasDealer?'TIME ALIGNED':'DATE NOT ALIGNED'):'NOT SCORED'),tile('NET SIGNED GAMMA',valid?fmt(gamma,1):'—',valid?'ES equiv / SPX pt':'requires signed strikes'),tile('NET VANNA',valid?fmt(vanna,1):'—',valid?'ES equiv / vol point':'unavailable'),tile('DOMINANT GAMMA WALL',valid?fmt(kdom?.strike):'—',valid?'by absolute exposure':'no verified wall')].join('');
 const choose=$('stLadderGreek');if(choose){choose.disabled=!valid;choose.onchange=renderDealer;}
 if(valid){const x=rows.map(x=>x.strike),key=choose?.value||'gamma',unit={delta:'ES equivalenti',gamma:'ES / punto SPX',vanna:'ES / punto vol',charm:'ES / minuto',speed:'ES / punto SPX²',color:'ES / punto SPX / minuto'}[key];
 const l=plotStyle(400);l.showlegend=false;l.xaxis.title='Strike SPX';l.yaxis.title=unit;l.hovermode='closest';
 if(rows.some(r=>Number.isFinite(r[key])))plot('q13DealerPlot',[{type:'bar',x,y:rows.map(r=>Number.isFinite(r[key])?r[key]:null),name:key.toUpperCase(),marker:{color:rows.map(r=>r[key]>=0?'#90d2eb':'#e6e0cc')},hovertemplate:'Strike %{x:.2f}<br>'+key.toUpperCase()+' %{y:,.5g} '+unit+'<extra></extra>'}],l);
 else placeholder('q13DealerPlot','La ladder caricata non riporta '+key+' con unità dichiarate.');
 const es=L.spot_spx+L.es_basis,basis=Number(L.es_basis),minK=Math.min(...x),maxK=Math.max(...x);let low=Math.max(es-40,minK+basis-5),high=Math.min(es+40,maxK+basis+5);if(low>=high){low=es-30;high=es+30}const prices=Array.from({length:100},(_,i)=>low+(high-low)*i/99),ts=Array.from({length:41},(_,i)=>i*5/40),width=Math.max(10,(maxK-minK)/Math.max(5,rows.length));const slope=Number(L.iv_slope_volpoints_per_spx)||0;
 const zmap=prices.map(s=>ts.map(t=>{let val=0;for(const r of rows){const w=1;val-=w*(r.gamma*(s-es)+r.vanna*slope*(s-es)+r.charm*t)}return val}));
 const scale=Math.max(1,...zmap.flat().map(Math.abs));const lo=plotStyle(460);lo.xaxis.title='MINUTES / TIME DECAY';lo.yaxis.title='ES PATH PRICE · BASIS CONSTANT';lo.hovermode='closest';plot('q13HedgeHeat',[{type:'heatmap',x:ts,y:prices,z:zmap,zmin:-scale,zmax:scale,colorscale:[[0,'#9cabb2'],[.35,'#1d3c5a'],[.5,'#0a1d2f'],[.65,'#29445e'],[1,'#9cdcf2']],colorbar:{title:'Δ HEDGE',tickfont:{color:'#94d6ed'}},hovertemplate:'T+%{x:.2f}m<br>ES %{y:.2f}<br>SCENARIO ΔH %{z:.2f}<extra></extra>'}],lo);
 }else{placeholder('q13DealerPlot','Carica una ladder firmata per leggere segno e concentrazione a ogni strike.');placeholder('q13HedgeHeat','La mappa si attiva con gamma, vanna e charm espresse in equivalenti ES.');}

}
function pathWeight(p){const beta=R.scenarioTilt;if(!R.ladder||beta<=0)return p.mass;const h=hedgeForPath(p.row);if(!h)return p.mass;return p.mass*Math.exp(cl(beta*h.align,-5,5));}
function mapPathMass(){const raw=R.prototype.map(pathWeight),total=raw.reduce((a,b)=>a+b,0)||1;return R.prototype.map((p,i)=>({...p,adj:raw[i]/total,hedge:hedgeForPath(p.row)}));}
function pathPrice(p,t){if(!p)return NaN;const k=cl(t,0,5),i=Math.floor(k),u=k-i,arr=p.row||p;const a=i===0?0:arr[i+1],b=i>=5?arr[6]:arr[i+2];return R.spot+.25*(a+(b-a)*u)}
function pathColor(label){return({UP:'#8bcfe8',DOWN:'#dfdbcb',BALANCE:'#88b3eb',REVERSION:'#86cae5',EXPANSION:'#90b9ef'})[label]||'#b9cdde'}
function fanBounds(){const c=R.current;let yy=c.q.flat().map(v=>R.spot+v*.25);yy.push(R.spot,R.target);if(R.ladder?.rows?.length){const basis=Number(R.ladder.es_basis);for(const v of R.ladder.rows.slice(0,150)){const y=v.strike+basis;if(Math.abs(y-R.spot)<=45)yy.push(y)}}const a=Math.min(...yy),b=Math.max(...yy),pad=Math.max(2.5,(b-a)*.13);return [a-pad,b+pad]}
function renderPaths(){const c=R.current;if(!c)return;ensurePrototypes();const selectedBefore=R.selected,proto=mapPathMass();R.probPaths=proto;
 $('q13PathKpis').innerHTML=[tile('P TERMINAL / 90%',fmt(R.spot+c.q[5][0]*.25)+' — '+fmt(R.spot+c.q[5][4]*.25),c.outOfDomain?c.note:'Intervallo empirico a 5 minuti'),tile('P(TARGET TOUCH)',pc(c.touch),'high/low over 5m'),tile('P(TERMINAL BEYOND)',pc(c.terminal),'at T+5m'),tile('ANALOG SUPPORT',fmt(c.days,0)+' DAYS',fmt(c.n,0)+' overlapping windows')].join('');
 const b=fanBounds(),W=1200,H=560,L=84,X=1103,T=33,B=499,dx=X-L,dy=B-T,x=t=>L+t/5*dx,y=v=>B-(v-b[0])/(b[1]-b[0])*dy;
 const q=c.q,qs=idx=>q.map(r=>R.spot+r[idx]*.25),q05=qs(0),q25=qs(1),q50=qs(2),q75=qs(3),q95=qs(4),xx=[0,1,2,3,4,5];
 const path=(arr)=>arr.map((v,i)=>(i?'L':'M')+x(xx[i]).toFixed(2)+' '+y(v).toFixed(2)).join(' ');
 const area=(a,b)=>'M'+xx.map((t,i)=>x(t)+','+y(a[i])).join(' L')+' L'+[...xx].reverse().map(t=>x(t)+','+y(b[t])).join(' L')+' Z';
 const grid=[];for(let t=0;t<=5;t++)grid.push(`<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${B}" stroke="#1f3b54" stroke-dasharray="3 5"/><text x="${x(t)}" y="${B+25}" fill="#679cda" font-size="11" text-anchor="middle">T+${t}m</text>`);
 for(let i=0;i<=8;i++){const p=b[0]+(b[1]-b[0])*i/8;grid.push(`<line x1="${L}" x2="${X}" y1="${y(p)}" y2="${y(p)}" stroke="#162f45"/><text x="${L-11}" y="${y(p)+4}" fill="#679cda" font-size="11" text-anchor="end">${fmt(p,2)}</text>`)}
 let svg=`<defs><clipPath id="q13FanClip"><rect x="${L}" y="${T}" width="${dx}" height="${dy}"/></clipPath><linearGradient id="q13BandFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#3f85ad" stop-opacity=".20"/><stop offset="100%" stop-color="#4a91b7" stop-opacity=".08"/></linearGradient></defs><rect width="${W}" height="${H}" fill="#091c2e"/>${grid.join('')}<g clip-path="url(#q13FanClip)"><path d="${area(q05,q95)}" fill="url(#q13BandFill)" stroke="none"/><path d="${area(q25,q75)}" fill="#80ade7" fill-opacity=".14"/><path d="${path(q05)}" stroke="#69b2d3" stroke-width="1.2" stroke-dasharray="3 5" fill="none"/><path d="${path(q95)}" stroke="#69b2d3" stroke-width="1.2" stroke-dasharray="3 5" fill="none"/>`;
 // Render every displayed representative in an invariant coordinate frame. The exact physical P mass belongs to its discrete nearest-analog cell.
 for(let i=proto.length-1;i>=0;i--){const p=proto[i],val=[R.spot,...p.row.slice(2,7).map(t=>R.spot+.25*t)],op=R.scenario!=='ALL'&&p.scenario!==R.scenario?.055:.29;
  svg+=`<path data-q13-path="${i}" d="${path(val)}" fill="none" stroke="${pathColor(p.scenario)}" stroke-width="${R.selected===i?3.5:1.2}" stroke-opacity="${R.selected===i?1:op}" vector-effect="non-scaling-stroke"/>`;}
 svg+=`<path d="${path(q50)}" stroke="${pcolor.gold}" stroke-width="3.1" fill="none" vector-effect="non-scaling-stroke"/><line x1="${L}" x2="${X}" y1="${y(R.spot)}" y2="${y(R.spot)}" stroke="#6da0dd" stroke-dasharray="3 7" stroke-width="1.1"/><line x1="${L}" x2="${X}" y1="${y(R.target)}" y2="${y(R.target)}" stroke="${pcolor.cyan}" stroke-dasharray="7 4" stroke-width="1.7"/>`;
 svg+='</g>';
 const labels=[['P95',q95[5],pcolor.cyan],['P50',q50[5],pcolor.gold],['P05',q05[5],pcolor.cyan],['TARGET',R.target,pcolor.cyan]];let previousY=T-19;const ordered=labels.sort((a,b)=>y(a[1])-y(b[1]));for(let i=0;i<ordered.length;i++){const [label,p,color]=ordered[i],at=cl(Math.max(previousY+16,y(p)),T+2,B-(ordered.length-i-1)*16);previousY=at;svg+='<path d="M'+X+' '+y(p)+' L'+(X+6)+' '+at+'" stroke="'+color+'" fill="none"/><text x="'+(X+9)+'" y="'+(at+4)+'" fill="'+color+'" font-size="11">'+label+' '+fmt(p)+'</text>';}
 svg+=`<line id="q13CrossX" x1="${x(2.5)}" x2="${x(2.5)}" y1="${T}" y2="${B}" stroke="#90b8ef" stroke-width="1.3" stroke-dasharray="4 4" style="display:none"/><line id="q13CrossY" x1="${L}" x2="${X}" y1="${y(R.spot)}" y2="${y(R.spot)}" stroke="#90b8ef" stroke-width="1.3" stroke-dasharray="4 4" style="display:none"/><circle id="q13CrossDot" cx="0" cy="0" r="5" fill="#8fb8ef" stroke="#071525" stroke-width="2" style="display:none"/><rect id="q13PointerCapture" x="${L}" y="${T}" width="${dx}" height="${dy}" fill="transparent" style="cursor:crosshair"/><text x="${L}" y="18" fill="#71bada" font-size="10">EMPIRICAL ANALOG CORRIDORS · HORIZON 5 MIN · ES</text><text x="${X}" y="${H-16}" text-anchor="end" fill="#819cb5" font-size="10">FIXED AXES · CROSSHAIR × TOUCH / TERMINAL</text>`;
 const svgNode=$('q13FanSvg');svgNode.innerHTML=svg;R.fanFrame={b,L,X,T,B,x,y};
 const capture=$('q13PointerCapture');capture.addEventListener('pointermove',pointerFan);capture.addEventListener('pointerleave',()=>{for(const id of ['q13CrossX','q13CrossY','q13CrossDot'])$(id).style.display='none';$('q13CrossTooltip').hidden=true;if(!R.locked)drawSelected(-1,false)});capture.addEventListener('click',()=>{if(R.hovered>=0)drawSelected(R.hovered,true)});
 const qMatched=R.ladder&&getScore().hasDealer&&getScore().validHorizon,bet=R.scenarioTilt;
 $('q13FanCaption').textContent=`N ${fmt(c.n,0)} / ${fmt(c.days,0)} days · ${proto.length} nearest-analog cells · VIX ${fmt(R.vix,1)} ±${fmt(R.band,1)} · ${R.hour.toUpperCase()} · ${c.note||'no gaps'}`;
 $('q13FanStatus').textContent=bet>0&&R.ladder?'DEALER HEDGE SENSITIVITY · NOT CALIBRATED':'P HISTORICAL · NO DEALER TILT';
 $('q13BetaValue').textContent=R.scenarioTilt>0?'β '+fmt(R.scenarioTilt,1)+' · SCENARIO':'OFF / β 0.0';
 $('q13PathGate').textContent=R.ladder?(bet>0?'I pesi con hedge tilt sono uno stress test β, non probabilità calibrate. Esposizioni local-linear mantenute costanti nell’orizzonte.':'Dealer ladder disponibile: β=0 preserva masse storiche P. Attiva β solo per sensibilità di scenario non calibrata.'):'Nessuna esposizione dealer firmata importata: le probabilità sono masse empiriche dei corridoi P; non includono un modello dealer per strike.';
 const moves=R.sample||[],direction=R.target>=R.spot?1:-1,dist=Math.abs(R.target-R.spot)*4;
 const closeTimes=moves.map(r=>{if(dist===0)return 0;for(let j=2;j<=6;j++)if(direction*r[j]>=dist)return j-1;return null;}).filter(Number.isFinite).sort((a,b)=>a-b);
 const pass=$('stAtlasFacts');if(pass)pass.textContent='Target '+fmt(R.target,2)+' ES · '+closeTimes.length+'/'+moves.length+' finestre raggiungono il target su chiusura 1m · tempo mediano dei tocchi '+(closeTimes.length?fmt(quant(closeTimes,.5),1)+' min':'—')+' · sessioni distinte '+c.days+'.';
 renderScenarioList();renderPathTable();drawSelected(selectedBefore>=0&&selectedBefore<proto.length?selectedBefore:-1,false);renderSpX();}
function renderSpX(){const obj=root.QuantistesDynamic,stats=obj?.stats?.(),cur=obj?.get?.(),rows=obj?.getRows?.();
 if(!stats?.n||!Array.isArray(rows)||rows.length<4||!cur?.spot){$('q13SpXMeta').textContent='NO SPX PHYSICAL REPLAY';placeholder('q13SpXPlot','SPX historical P not initialized. Click REPLAY SPX or DEMO.');return}
 const plotted=rows.filter(r=>F(+r.K)&&F(+r.pAbove)&&F(+r.pTouch)),x=plotted.map(r=>+r.K),trace=[{type:'scatter',mode:'lines',x,y:plotted.map(r=>+r.pAbove),name:'P · TERMINAL ABOVE',line:{color:pcolor.gold,width:2.8},hovertemplate:'SPX strike %{x:.2f}<br>P above %{y:.2%}<extra></extra>'},{type:'scatter',mode:'lines',x,y:plotted.map(r=>+r.pTouch),name:'P · TOUCH',line:{color:pcolor.mint,width:2.4},hovertemplate:'SPX strike %{x:.2f}<br>P touch %{y:.2%}<extra></extra>'}];
 const qMatched=stats.qMatched&&plotted.every(r=>F(+r.qAbove)&&r.qAbove!==null);if(qMatched)trace.push({type:'scatter',mode:'lines',x,y:plotted.map(r=>+r.qAbove),name:'Q · TERMINAL ABOVE (MATCHED)',line:{color:pcolor.cyan,width:2,dash:'dash'}});
 const layout=plotStyle(355);layout.xaxis={...layout.xaxis,title:'SPX · STRIKE'};layout.yaxis={...layout.yaxis,range:[0,1],tickformat:'.0%',title:'PROBABILITY'};layout.shapes=[{type:'line',x0:cur.spot,x1:cur.spot,y0:0,y1:1,xref:'x',yref:'paper',line:{color:'#a4bbd1',width:1.3,dash:'dash'}}];plot('q13SpXPlot',trace,layout);
 $('q13SpXMeta').textContent=`${stats.date} ${stats.cutoff} NY · ${stats.horizon}M · N ${stats.n} · ESS ${fmt(stats.ESS,0)} · ${qMatched?'Q MATCHED':'Q NOT MATCHED'}`;
}
function renderScenarioList(){const c=R.current;let path=R.probPaths||[],mass={};for(const p of path)mass[p.scenario]=(mass[p.scenario]||0)+p.adj;const active=R.scenario;
 $('q13ScenarioList').innerHTML=scenarios.map(([key,label,color])=>`<button class="q13-scenario-pick ${active===key?'on':''}" data-q13-scenario="${key}"><b>${E(label)}</b><span><i style="width:${(100*(mass[key]||0)).toFixed(2)}%;background:${color}"></i></span><strong>${pc(mass[key]||0)}</strong></button>`).join('')+`<button class="q13-scenario-pick ${active==='ALL'?'on':''}" data-q13-scenario="ALL"><b>ALL PATHS</b><span><i style="width:100%"></i></span><strong>100%</strong></button>`;
 $('q13Targets').innerHTML=`<b>TARGET ${fmt(R.target)}</b> · P(final ≥/≤ target) <b>${pc(c.terminal)}</b> · P(touch intraminute observed) <b>${pc(c.touch)}</b>. ${R.scenarioTilt>0?'Scenario-weighted corridor masses are sensitivity-only.':'Raw P frequencies are from the filtered historical windows.'}`;
}
function renderPathTable(){const s=(R.probPaths||[]).slice().sort((a,b)=>b.adj-a.adj).slice(0,14);$('q13PathRows').innerHTML=s.map(p=>`<tr><td><button data-q13-path-id="${p.id}">PATH ${String(p.id+1).padStart(3,'0')} ↗</button></td><td>${dateFmt(p.row[9])}<br><small>VIX ${fmt(p.row[0]/100,1)}</small></td><td>${E(scenarios.find(a=>a[0]===p.scenario)?.[1]||p.scenario)}</td><td>${p.row[6]>0?'+':''}${fmt(p.row[6]*.25,2)} pt</td><td><b style="color:#87b5ff">${pc(p.adj)}</b>${R.scenarioTilt>0?'<br><small>scenario / not calibrated</small>':''}</td><td>${p.hedge?fmt(p.hedge.net,1)+' ES Δeq':'N/A'}</td></tr>`).join('')}
function pointerFan(ev){if(!R.current)return;const svg=$('q13FanSvg'),b=svg.getBoundingClientRect(),a=R.fanFrame;if(!b.width)return;
 const viewX=(ev.clientX-b.left)/b.width*1200,viewY=(ev.clientY-b.top)/b.height*560,t=cl((viewX-a.L)/(a.X-a.L)*5,0,5),price=a.b[0]+(a.B-viewY)/(a.B-a.T)*(a.b[1]-a.b[0]);
 let closest=-1,mind=Infinity;for(let i=0;i<R.probPaths.length;i++){const p=R.probPaths[i];if(R.scenario!=='ALL'&&R.scenario!==p.scenario)continue;const d=Math.abs(pathPrice(p,t)-price);if(d<mind){mind=d;closest=i}}R.hovered=closest;
 const yval=R.probPaths[closest]?pathPrice(R.probPaths[closest],t):price;
 $('q13CrossX').setAttribute('x1',a.x(t));$('q13CrossX').setAttribute('x2',a.x(t));$('q13CrossY').setAttribute('y1',a.y(price));$('q13CrossY').setAttribute('y2',a.y(price));$('q13CrossDot').setAttribute('cx',a.x(t));$('q13CrossDot').setAttribute('cy',a.y(yval));for(const id of ['q13CrossX','q13CrossY','q13CrossDot'])$(id).style.display='';
 const p=R.probPaths[closest],L=$('q13CrossTooltip');L.hidden=false;L.style.left=cl(ev.clientX-b.left+12,5,b.width-235)+'px';L.style.top=cl(ev.clientY-b.top-80,6,b.height-120)+'px';
 if(p){L.innerHTML=`T+${fmt(t,2)} MIN<br><strong>ES ${fmt(price)}</strong>NEAREST CORRIDOR #${p.id+1}<br>Path @ t ${fmt(yval)}<br>Cell mass ${pc(p.adj)}${p.hedge?'<br>Hedge Δ '+fmt(p.hedge.net,1)+' eq':''}`;if(!R.locked)drawSelected(closest,false)}else L.textContent='ES '+fmt(price);
 $('q13PointerRead').textContent=`CROSSHAIR T+${fmt(t,2)} MIN / ES ${fmt(price)} / NEAREST ${fmt(yval)}`;}
function drawSelected(index,lock=false){if(lock)R.locked=true;if(index>=0)R.selected=index;else if(!R.locked)R.selected=-1;
 const svg=$('q13FanSvg');if(!svg)return;for(const el of svg.querySelectorAll('[data-q13-path]')){const i=+el.getAttribute('data-q13-path'),p=R.probPaths?.[i];const active=i===R.selected;const off=R.scenario!=='ALL'&&p?.scenario!==R.scenario;el.setAttribute('stroke-width',active?'4':'1.2');el.setAttribute('stroke-opacity',active?'1':off?'.05':'.28');if(active)el.parentElement?.append(el)}
 const p=R.probPaths?.[R.selected];renderSelectedHedge(p);$('q13CorridorClass').textContent=p?(scenarios.find(s=>s[0]===p.scenario)?.[1]||p.scenario):'HISTORICAL ANALOG CELL';
 if(!p){$('q13PathInspect').textContent='Crosshair: muovi il cursore sul fan. Fai clic per bloccare il corridoio più vicino; usa PATH ± per confrontare gli analoghi.';$('q13PathFactors').innerHTML='';return}
 const r=p.row,need=R.scenarioTilt>0&&R.ladder?'hedge stress-adjusted':'empirical P';$('q13PathInspect').innerHTML=`<strong>${R.locked?'◉ LOCKED':'○ INSPECT'} PATH ${String(p.id+1).padStart(3,'0')}</strong> · ${E(dateFmt(r[9]))} · VIX ${fmt(r[0]/100,2)}<br>ES CLOSE ${fmt(R.spot+r[6]*.25)} · Δ ${r[6]>=0?'+':''}${fmt(r[6]*.25)} pt · max excursion +${fmt(r[7]*.25)} / −${fmt(r[8]*.25)} pt<br><b style="color:#88b3eb">CORRIDOR MASS ${pc(p.adj)}</b> (${need}; ${fmt(p.count,0)} analoghi in cella). Non è probabilità del path continuo esatto.`;
 const h=p.hedge;$('q13PathFactors').innerHTML=[['MASSA CORRIDOIO',pc(p.mass)],['MAX ESCURSIONE ↑',fmt(r[7]*.25,2)+' pt'],['MAX ESCURSIONE ↓',fmt(r[8]*.25,2)+' pt'],['CHIUSURA 5m',fmt(r[6]*.25,2)+' pt'],['HEDGE NET',h?fmt(h.net,1):'—'],['HEDGE GAMMA',h?fmt(h.components.gamma,1):'—']].map(([k,v])=>`<div>${E(k)}<b>${E(v)}</b></div>`).join('');}
function renderSelectedHedge(p){const details=$('q13HedgeDetail');if(!details?.open)return;const h=p?.hedge;if(!h){placeholder('q13HedgeByStrike','Requires signed dealer gamma/vanna/charm exposures per strike.');placeholder('q13HedgeByTime','Requires signed dealer gamma/vanna/charm exposures per strike.');return}const x=h.perStrike.map(r=>r.strike),l=plotStyle(260);l.barmode='relative';l.margin={l:55,r:14,t:15,b:38};l.xaxis.title='SPX STRIKE';l.yaxis.title='Δ HEDGE / ES EQUIV';plot('q13HedgeByStrike',[['gamma',pcolor.gold],['vanna',pcolor.cyan],['charm',pcolor.mint]].map(([key,color])=>({type:'bar',x,y:h.perStrike.map(v=>v[key]),name:key.toUpperCase(),marker:{color}})),l);const y=h.perMinute.map(v=>v.cum),b=plotStyle(260);b.margin={l:50,r:13,t:18,b:43};b.xaxis.title='MINUTE';b.yaxis.title='CUMULATIVE Δ HEDGE';plot('q13HedgeByTime',[{type:'scatter',mode:'lines+markers',x:h.perMinute.map(v=>v.minute),y,name:'SIGNED DELTA EQ',line:{color:pcolor.gold,width:2.2}}],b)}
function changePath(d){const n=R.probPaths?.length||0;if(!n)return;const i=R.selected<0?(d<0?n-1:0):(R.selected+d+n)%n;drawSelected(i,true)}
function renderStage(){if(!R.ready)return;try{renderScore();if(R.stage==='market')renderMarket();else if(R.stage==='dealer')renderDealer();else if(R.stage==='path')renderPaths();}catch(e){console.error('Q13 rendering',e);$('q13SideStatus').textContent='RENDER / '+String(e.message||e)}}
function go(stage){if(!['score','market','dealer','path','audit','reports','scalp'].includes(stage))return;R.stage=stage;
 for(const v of document.querySelectorAll('[data-q13-panel]'))v.classList.toggle('on',v.dataset.q13Panel===stage);
 for(const v of document.querySelectorAll('#q13Nav [data-q13-view]'))v.classList.toggle('on',v.dataset.q13View===stage);
 window.scrollTo({top:0,behavior:'instant'});renderStage();}
function nativeOpen(stage){document.body.classList.add('q13-native');$('q13Return').hidden=false;let tab=stage||'monitor';if(tab==='quant360')tab='monitor';root.Desk?.tab?.(tab);if(!root.Desk?.tab)document.querySelector('.tab[data-tab="'+tab+'"]')?.click();if(tab==='monitor')$('terminalSettings')?.click();}
function nativeBack(){document.body.classList.remove('q13-native');$('q13Return').hidden=true;root.Desk?.tab?.('quant360');renderStage()}
async function demo(){const b=$('q13Demo');b.disabled=true;b.textContent='LOADING...';try{R.source='HISTORICAL DEMO';R.snap=null;R.spot=NaN;R.target=NaN;R.vix=NaN;R.ladder=null;R.scenarioTilt=0;stopBridge();$('q13Bridge').textContent='○ CONNECT';root.QuantistesV12?.stop?.();if(root.QuantistesV12?.loadDemo)await root.QuantistesV12.loadDemo();let sp=root.QuantistesDynamic?.stats?.();if(!sp)root.QuantistesDynamic?.replayHistorical?.();
 $('q13SourceMsg').textContent='REPLAY · ARCHIVI ES E SPXW';$('q13RunMode').textContent='DEMO · NON-COEVAL';$('q13RunMode').className='q13-pill gold';renderStage();go('score');root.QuantistesFlatDesk?.go('score','decision')}
 catch(e){$('q13SideStatus').textContent='DEMO LOAD ERROR / '+String(e.message||e);console.error(e)}finally{b.disabled=false;b.textContent='▶ REPLAY'}}
async function snapshotUpload(file){if(!file)return;if(file.size>5e6)throw Error('ES snapshot max 5MB');const text=await file.text();let obj;
 if(file.name.toLowerCase().endsWith('.json'))obj=JSON.parse(text);else obj=root.QuantistesV12.parseCSV(text);
 const normalized=root.QuantistesV12.normalize(obj);
 if(obj.dealer_strikes)applyDealerObject(obj.dealer_strikes);
 root.QuantistesV12.ingest(obj,'UPLOAD');R.snap=normalized;R.source='UPLOADED SNAPSHOT';
 stopBridge();
 $('q13SourceMsg').textContent='SNAPSHOT ES · '+normalized.asof;
}
let bridgeVersion=0;
function stopBridge(){bridgeVersion++;if(R.feedTimer)clearInterval(R.feedTimer);R.feedTimer=null;root.QuantistesV12?.stop?.();if($('q13Bridge'))$('q13Bridge').textContent='○ CONNETTI';}
function applyReference(snap){
 const target=DeskMeasures.number($('q13Target').value),last=DeskMeasures.number($('q13Spot').value),distance=target!==null&&last!==null?target-last:4;
 R.spot=snap.es.last;R.vix=snap.vix.value;R.target=Number.isFinite(distance)?R.spot+distance:R.spot+4;
 $('q13Spot').value=R.spot;$('q13Vix').value=R.vix;$('q13Target').value=R.target;
 if(R.ready)calcOnChange();
}
function connectBridge(){
 if(R.feedTimer){stopBridge();R.source=currentSnapshot()?'UPLOADED SNAPSHOT':'REPLAY';renderScore();return;}
 const v=++bridgeVersion;let pending=false;
 async function poll(){
  if(pending||v!==bridgeVersion)return;pending=true;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),1800);
  try{
   const response=await fetch('http://127.0.0.1:8787/snapshot',{signal:ctl.signal,cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
   const raw=await response.json();if(v!==bridgeVersion)return;const next=root.QuantistesV12.normalize(raw),prior=currentSnapshot();
   if(!prior||DeskMeasures.stamp(next.asof)>DeskMeasures.stamp(prior.asof)){
    if(raw.dealer_strikes)applyDealerObject(raw.dealer_strikes);
    root.QuantistesV12.ingest(next,'BRIDGE');R.snap=next;R.source='SNAPSHOT STREAM';
   }
   $('q13Bridge').textContent='● CONNESSO';$('q13SourceMsg').textContent='PREZZI ES / VIX · '+(currentSnapshot()?.asof||next.asof);
  }catch(err){if(v===bridgeVersion){$('q13Bridge').textContent='○ OFFLINE';$('q13SourceMsg').textContent='BRIDGE / '+String(err.message||err).slice(0,90);}}
  finally{clearTimeout(timer);pending=false;}
 }
 R.feedTimer=setInterval(poll,2500);poll();
}
function bindEvents(){document.body.addEventListener('click',e=>{const view=e.target.closest('[data-q13-view]');if(view){go(view.dataset.q13View);return}const nav=e.target.closest('[data-q13-native]');if(nav){nativeOpen(nav.dataset.q13Native);return}const sc=e.target.closest('[data-q13-scenario]');if(sc){R.scenario=sc.dataset.q13Scenario;renderPaths();return}const p=e.target.closest('[data-q13-path-id]');if(p){go('path');drawSelected(+p.dataset.q13PathId,true);return}});
 $('q13Demo').onclick=demo;$('q13ImportChain').onclick=()=>nativeOpen('monitor');if($('q13OpenNativeQ'))$('q13OpenNativeQ').onclick=()=>nativeOpen('monitor');$('q13Advanced').onclick=()=>nativeOpen('monitor');if($('q13OpenManual'))$('q13OpenManual').onclick=()=>nativeOpen('audit');$('q13BackButton').onclick=nativeBack;$('q13Bridge').onclick=connectBridge;
 $('q13SpXReplay').onclick=()=>{try{root.QuantistesDynamic?.replayHistorical?.();if(R.stage!=='path')go('path');else renderSpX()}catch(e){placeholder('q13SpXPlot','Replay unavailable: '+e.message)}};
 $('q13HedgeDetail').addEventListener('toggle',()=>{if(R.stage==='path'&&R.current)renderSelectedHedge(R.probPaths?.[R.selected])});$('q13FanReset').onclick=()=>{R.scenario='ALL';R.locked=false;R.selected=-1;renderPaths()};$('q13PathPrev').onclick=()=>changePath(-1);$('q13PathNext').onclick=()=>changePath(1);$('q13PathUnlock').onclick=()=>{R.locked=false;drawSelected(-1,false)};
 $('q13HedgeBeta').oninput=e=>{R.scenarioTilt=Number(e.target.value);if(!R.ladder&&R.scenarioTilt>0){R.scenarioTilt=0;e.target.value=0;}$('q13BetaValue').textContent=R.scenarioTilt>0?'β '+fmt(R.scenarioTilt,1)+' · SCENARIO':'OFF / β 0.0';if(R.stage==='path')renderPaths();};
 for(const id of ['q13Spot','q13Vix','q13Target','q13Band'])$(id).addEventListener('change',calcOnChange);$('q13Session').addEventListener('change',calcOnChange);
 $('q13DealerFile').addEventListener('change',async e=>{try{await loadDealer(e.target.files?.[0]);go('dealer')}catch(err){$('q13DealerNotice').textContent='IMPORT ERROR · '+String(err.message||err)}});
 $('q13SnapshotFile').addEventListener('change',async e=>{if(!e.target.files?.[0])return;try{await snapshotUpload(e.target.files[0]);root.QuantistesFlatDesk?.go('score','decision')}catch(err){$('q13SourceMsg').textContent='IMPORT ERROR / '+String(err.message||err)}});
 root.addEventListener('quantistes:dynamicP',()=>{if(R.ready)renderStage()});root.addEventListener('quantistes:v12-feed',()=>{
 const snap=currentSnapshot();if(snap){sources();if(R.ready)applyReference(snap);}
 else if(R.ready){R.snap=null;R.spot=NaN;R.target=NaN;R.vix=NaN;R.source='REPLAY';setDefaults();calcOnChange();}
});
 let lastQ=null,lastFlow=null,lastSource='';setInterval(()=>{if(!R.ready)return;const q=nativeQ(),f=root.FlowDesk?.stats?.(),snap=currentSnapshot(),key=snap?.asof||'';if(q!==lastQ||(f?.sourceDates?.gamma||'')!==lastFlow||key!==lastSource){lastQ=q;lastFlow=f?.sourceDates?.gamma||'';lastSource=key;renderStage()}},1800);
 updateClockTimer=setInterval(()=>{$('q13Clock').textContent='NEW YORK · '+nowNY()},15000);$('q13Clock').textContent='NEW YORK · '+nowNY();}
async function initializeData(){
 try{const data=await root.Quantistes360.load();R.rows=data.rows;R.validation=data.validation;setDefaults();R.ready=true;const snap=currentSnapshot();if(snap)applyReference(snap);else calcOnChange();$('q13SourceMsg').textContent=fmt(R.rows.length,0)+' FINESTRE ES';}
 catch(e){$('q13SideStatus').textContent='ARCHIVIO INDISPONIBILE';$('q13SideSource').textContent=String(e.message||e);}
}
function init(){if(R.domReady)return;R.domReady=true;const target=$('view-quant360'),tmpl=$('q13Template');if(!target||!tmpl)return;
 target.insertAdjacentHTML('afterbegin',tmpl.innerHTML);const ret=$('q13Return');if(ret)document.body.append(ret);document.body.classList.add('q13-on');root.Desk?.tab?.('quant360');bindEvents();go('score');initializeData();}
root.QuantistesConfluence=Object.freeze({go,refresh:renderStage,loadDemo:demo,importDealerData:()=>$('q13DealerFile').click(),evidence:()=>({snapshot:currentSnapshot(),ladder:R.ladder,cohort:R.current,source:R.source}),getState:()=>({stage:R.stage,source:R.source,paths:R.rows.length,scenarios:R.current?.counts,selectedPath:R.selected,ladderReady:!!R.ladder})});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);


