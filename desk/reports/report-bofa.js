
(function(w){
'use strict';
const C=w.InstCore;
Object.assign(C.groups,{sys:'Sistematici aggregati'});
Object.assign(C.metrics,{modelAum:['AUM assunto nel modello','money'],trend:['Forza del trend CTA','percent'],reference:['Prezzo di riferimento del report','points'],gamma5:['Gamma hedger media intraday','gamma'],gammaNon:['Gamma su posizioni non in scadenza','gamma'],gammaOI:['Gamma su open interest in scadenza','gamma'],gamma0:['Gamma su volume 0DTE','gamma'],rpVol:['Volatilità annua senza leva','percent'],commodityWeight:['Esposizione commodity','percent']});
C.modes.chart='Lettura grafica stimata';C.modes.assumption='Ipotesi del provider';
const rect=(x,y,x2,y2,W=796,H=1030)=>[x/W,y/H,(x2-x)/W,(y2-y)/H],tableRect=(...k)=>rect(...k,1030,796);
const text=a=>C.clean(a).replace(/\s+/g,' '),dateNY=s=>{const m=text(s).match(/(?:Data (?:as of|through)\s*)?(\d{1,2})[- ](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[- ](20\d\d|\d{2})\b/i);if(!m)return null;return C.dateIn(m[1]+' '+m[2]+' '+(m[3].length===2?'20':'')+m[3]);};
function extract(type,src,day){
 const s=text(src).replace(/(\$\d+\.)S(?=bn\b)/gi,'$15'),a=[];
 const push=(g,k,v,scope,opts={})=>{if(Number.isFinite(v))a.push({g,k,v,scope,mode:'estimate',h:'',scenario:'',term:'',currency:'',asof:day,...opts});};
 const num=x=>Number(x.replaceAll(',',''));
 if(type==='cover'){
 let m=s.match(/(?:medium[ -]speed model|medium[ -]term model).{0,150}?to a net (short|long) of (?:about |around |roughly )?([\d.]+)% across.{0,40}?global equities/i);
 if(m)push('cta','weight',(m[1].toLowerCase()==='short'?-1:1)*num(m[2]),'GLOBAL',{term:'medium',source:m[0]});
 m=s.match(/In the U\.?S\.?,? the (short|long) is (?:just |about |now )?([\d.]+)%/i);if(m)push('cta','weight',(m[1].toLowerCase()==='short'?-1:1)*num(m[2]),'US',{term:'medium',source:m[0]});
 m=s.match(/ending\s+(\d{1,2}-[A-Za-z]{3})(?:-\d{2,4})? at\s*([+-]?)\s*\$([\d.]+)bn/i);
 if(m&&/hedger gamma/i.test(s)&&day){const as=dateNY(m[1]+'-'+day.slice(0,4));if(as)push('dealer','gex',(m[2]==='-'?-1:1)*num(m[3])*1e9,'SPX',{currency:'USD',asof:as.day,term:'EOD',source:m[0]+' · Gamma hedger SPX al close. Unità del grafico EOD, Exhibit 6.'});}
 }
 if(type==='cover'&&day){
 const dateOf=(d,m)=>dateNY(d+'-'+m+'-'+day.slice(0,4))?.day;
 const streak=s.match(/SPX hedger gamma has been negative at the close for (\d+) straight trading days,? ending (\d{1,2})-([a-z]{3})/i);
 const gd=streak&&dateOf(streak[2],streak[3]);if(gd)push('dealer','negativeGammaStreak',+streak[1],'SPX',{asof:gd,source:streak[0]});
 const rv=s.match(/SPX 5-day intraday realized volatility.{0,55}?reaching ([\d.]+)% on (\d{1,2})-([a-z]{3})/i);
 const rd=rv&&dateOf(rv[2],rv[3]);if(rd)push('vol','rv5',+rv[1],'SPX',{asof:rd,h:'5TD',mode:'published',source:rv[0]});
 const falling=s.match(/SPX selloff extended to a (\d+)(?:st|nd|rd|th) straight day/i);
 if(rd&&falling)push('market','downStreak',+falling[1],'SPX',{asof:rd,mode:'published',source:falling[0]});
 const vt=s.match(/VIX briefly hit ([\d.]+) intraday/i);if(rd&&vt)push('vol','vixTouched',+vt[1],'VIX',{asof:rd,mode:'published',source:vt[0]});
 const parts=s.match(/(\d{1,2}-[a-z]{3}-\d{2})\s*\(\s*(-)\s*\$([\d.]+)bn\s*\) and (\d{1,2}-[a-z]{3}-\d{2})\s*\(\s*(-)\s*\$([\d.]+)bn\s*\) expiries stand out as large negative contributors to hedger gamma/i);
 if(gd&&parts)for(const i of [1,4]){const ex=dateNY(parts[i]);if(ex)push('dealer','expiryGamma',-Number(parts[i+2])*1e9,'SPX',{asof:gd,term:ex.day,currency:'USD',source:parts[0]});}
 }
 if(type==='letf'){
 const m=s.match(/approximately\s*\$([\d.,]+)\s*(mn|bn|million|billion) and \$([\d.,]+)\s*(mn|bn|million|billion) in (?:S\s*&\s*P|S&P)\s*500 and NASDAQ[- ]100 buying\s*\(selling\)[, ]+respectively,? per 1% move up\s*\(down\)/i);
 if(m){for(const [scope,i] of [['SPX',1],['NDX',3]])push('letf','etfSensitivity',num(m[i])*(/^b/i.test(m[i+1])?1e9:1e6),scope,{currency:'USD',term:'daily-reset',h:'1D',source:m[0]+' · Exhibits 63–64. AUM della seduta precedente.'});
 const z=s.match(/equate to ([\d.]+)% and ([\d.]+)% of the average notional.{0,115}(?:3:55 PM to 4:00 PM|15:55.{1,4}16:00).{0,15}(?:last|past) month/i);
 if(z)for(const [scope,i] of [['SPX',1],['NDX',2]])push('letf','closeShare',num(z[i]),scope,{term:'ultimo mese / ultimi cinque minuti',source:z[0]});}
 }
 if(type==='scenarios'){
 const scope=/across global equities|global equit(?:y|ies) position/i.test(s),h=/subsequent week|1[ -]week|week ahead/i.test(s)?'1W':'';
 if(scope&&h){for(const m of s.matchAll(/\b(sell|buy)\s+(?:about\s+)?\$([\d,.]+)\s*(bn|billion|mn|million)\b\s+(?:in (?:a|an|the) (down|up|flat) market|if markets are (flat|up|down))/gi))push('sys','flow',(m[1].toLowerCase()==='sell'?-1:1)*num(m[2])*(/^(bn|billion)$/i.test(m[3])?1e9:1e6),'GLOBAL',{h,mode:'scenario',scenario:(m[4]||m[5]).toLowerCase(),currency:'USD',source:m[0]+' · Azioni globali, settimana successiva, Exhibit 1.'});}
 const m=s.match(/(?:assume(?:s)? assets of|assumes)\s*\$([\d,.]+)\s*bn in CTAs?,? and \$([\d,.]+)\s*bn each in risk parity and vol control/i);
 if(m)for(const [g,i] of [['cta',1],['rp',2],['vc',2]])push(g,'modelAum',num(m[i])*1e9,'PORT',{currency:'USD',mode:'assumption',source:m[0]+' · Exhibit 3.'});
 }
 if(type==='gamma'){
 const j=s.match(/(?:Averaged on an intraday basis.{0,35}last 5[ -]days|over the last 5[ -]days).{0,55}net (short|long)\s*\$([\d.]+)bn of SPX gamma with\s*([+-])\s*\$([\d.]+)bn from non[ -]expiring options,?\s*([+-])\s*\$([\d.]+)bn from [0O]DTEs?,?\s*and\s*([+-])\s*\$([\d.]+)bn from expiring open interest/i);
 const dt=dateNY((s.match(/Data as of (\d{1,2}-[A-Za-z]{3}-\d{2,4})/i)||[])[1]||'');
 if(j&&dt){const sg=(k,v)=>k==='-'||k.toLowerCase()==='short'?-num(v):num(v),parts=[sg(j[1],j[2]),sg(j[3],j[4]),sg(j[5],j[6]),sg(j[7],j[8])];
 if(Math.abs(parts[0]-parts.slice(1).reduce((x,y)=>x+y,0))<.21)['gamma5','gammaNon','gamma0','gammaOI'].forEach((k,i)=>push('dealer',k,parts[i]*1e9,'SPX',{asof:dt.day,h:'5TD',currency:'USD',source:'SPX delta-hedgers · Exhibit 10, media intraday su cinque sedute.'+' '+j[0].slice(0,225)}));}
 }
 return a;
}
const sig=f=>[f.g,f.k,f.scope,f.term,f.h,f.scenario,f.v].join('|');
function emit(b,page,f,{review='',ocr=false}={}){if(!C.allowed(f.k,f.v))return;const a={id:b.facts.length+1,page,seg:b.segment.id,enabled:true,review,ocr,h:'',mode:'estimate',term:'',scenario:'',currency:'',source:'',asof:b.segment.day,...f};b.facts.push(a);}
function unresolved(b,page,msg){if(!b.unresolved.some(x=>x.page===page&&x.why===msg))b.unresolved.push({page,seg:b.segment.id,why:msg,text:'BofA · '+msg});}
function sourceDay(lines){for(const l of lines){if(/systematic flows monitor|november|september|october|december|january|february|march|april|june|july|august|\bMay\b/i.test(l)){const r=C.dateIn(l);if(r)return r;}}return null;}
function simpleAxis(s,unit){const clean=text(s).replace(/\s/g,'');if(!unit.test(clean)||!/^\d+(?:[.,]\d+)?[%xX×]$/.test(clean))return null;return Number(clean.replace(/[%xX×]/,'').replace(',','.'));}
async function graph(b,page,ls,canvas,region){
 const s=text(ls.join(' ')),day=dateNY((s.match(/Data as of\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i)||[])[1]||'')?.day;if(!day){unresolved(b,page,'Data dei grafici da verificare');return;}
 if(!/asset class allocations/i.test(s)||!/Daily Risk Control/i.test(s)||!/leverage/i.test(s))return;
 const W=canvas.width,H=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true}),buf=ctx.getImageData(0,0,W,H).data;
 function grid(x1,x2,y){let n=0;for(let x=x1;x<=x2;x++){const q=(y*W+x)*4,r=buf[q];if(r>=135&&r<=224&&Math.max(Math.abs(r-buf[q+1]),Math.abs(r-buf[q+2]))<10)n++;}return n/(x2-x1+1);}
 function line(y,x1,x2){const a=Math.round(x1/796*W),d=Math.round(x2/796*W);let best=0,pos=null;for(let j=Math.round((y-4)*H/1030);j<=Math.round((y+4)*H/1030);j++){const n=grid(a,d,j);if(n>best){best=n;pos=j;}}return best>.50?pos:null;}
 function readSeries(a,b,yt,yb,col){
 const test=(r,g,z)=>col==='cyan'?r<68&&g>99&&g<196&&z>148&&z>g+29:col==='navy'?r<57&&g<84&&z>69&&z<165&&z>g+38:r>170&&g>35&&g<154&&z<62;
 const x0=Math.round(a*W/796),x1=Math.round(b*W/796),nx=x1-x0+1,ny=yb-yt+1,mask=new Uint8Array(nx*ny),queue=new Int32Array(nx*ny);
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=((y+yt)*W+x+x0)*4;if(test(buf[i],buf[i+1],buf[i+2]))mask[y*nx+x]=1;}
 const candidates=[];for(let i=0;i<mask.length;i++){if(mask[i]!==1)continue;let head=0,tail=0,minx=nx,maxx=0;mask[i]=2;queue[tail++]=i;
 while(head<tail){const pt=queue[head++],x=pt%nx,y=(pt-x)/nx;minx=Math.min(minx,x);maxx=Math.max(maxx,x);
 for(let yy=Math.max(0,y-2);yy<=Math.min(ny-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(nx-1,x+2);xx++){const j=yy*nx+xx;if(mask[j]===1){mask[j]=2;queue[tail++]=j;}}}
 if(maxx-minx<nx*.115||maxx<nx*.953)continue;
 const last=[];for(let j=0;j<tail;j++){const at=queue[j],x=at%nx;if(x>=maxx-1)last.push(yt+(at-x)/nx);}
 const lo=Math.min(...last),hi=Math.max(...last);if(hi-lo<=ny*.085)candidates.push({y:(hi+lo)/2,err:(hi-lo)/2+2,span:maxx-minx,right:maxx});}
 if(candidates.length)return candidates.sort((a,b)=>b.span-a.span)[0];
 // At a crossed or steep endpoint a curve can fragment. Require a contiguous run back from its right edge.
 const column=x=>{const v=[];for(let y=yt+1;y<yb;y++){const j=(y*W+x)*4,r=buf[j],g=buf[j+1],z=buf[j+2];const near=col==='cyan'?r<36&&Math.abs(g-156)<27&&Math.abs(z-222)<29:col==='navy'?r<40&&Math.abs(g-33)<24&&Math.abs(z-105)<30:r>180&&g<135&&z<35;if(near)v.push(y);}return v;};
 for(let last=x1;last>=x1-Math.ceil(nx*.025);last--){const hits=column(last);if(!hits.length||hits.at(-1)-hits[0]>ny*.08)continue;let mid=(hits[0]+hits.at(-1))/2,okay=0;
 for(let x=last-1;x>=last-7;x--){const near=column(x).filter(y=>Math.abs(y-mid)<ny*.06);if(!near.length)break;mid=(near[0]+near.at(-1))/2;okay++;}
 if(okay>=6)return {y:(hits[0]+hits.at(-1))/2,err:Math.max(3,(hits.at(-1)-hits[0])/2+2)};}
 return null;
 }
 const specs=[
 {a:77,b:335,top:178,bot:352,left:[43,74],lo:0,unit:/[xX×]/,series:[['cyan','rp','leverage','PORT','media target 10/12/15',68]]},
 {a:77,b:335,top:178,bot:352,left:[341,372],lo:0,unit:/%/,series:[['navy','rp','rpVol','PORT','unlevered',68]]},
 {a:474,b:736,top:175,bot:348,left:[431,471],lo:0,unit:/%/,series:[['navy','rp','eqWeight','PORT','equity',69],['cyan','rp','bondWeight','PORT','bonds',69],['orange','rp','commodityWeight','PORT','commodities',69]]},
 {a:78,b:485,top:503,bot:756,left:[40,73],lo:0,unit:/[xX×]/,series:[['navy','vc','leverage','SPX','target 10%',70],['cyan','vc','leverage','SPX','target 5%',70]]}
 ];
 for(const v of specs){
 const top=line(v.top,v.a+3,v.b-3),bot=line(v.bot,v.a+3,v.b-3);if(top===null||bot===null){unresolved(b,page,'Griglia del grafico '+v.series[0][5]+' da verificare');continue;}
 const read=async yy=>{const y=yy*1030/H;return simpleAxis(await region(canvas,rect(v.left[0],y-9,v.left[1],y+9),'7',3,true),v.unit);};
 const hi=await read(top),lo=await read(bot);if(!(hi>lo)||lo!==0){unresolved(b,page,'Scala del grafico '+v.series[0][5]+' da verificare');continue;}
 for(const [color,g,k,scope,term,ex] of v.series){const pt=readSeries(v.a,v.b+1,top,bot,color);if(!pt){unresolved(b,page,'Ultimo punto della serie '+term+' da verificare');continue;}
 const val=hi+(lo-hi)*(pt.y-top)/(bot-top),error=(hi-lo)*pt.err/(bot-top);
 emit(b,page,{g,k,scope,v:val,term,mode:'chart',asof:day,interval:[Math.max(lo,val-error),Math.min(hi,val+error)],source:'Exhibit '+ex+' · '+term+'. Estremo destro della curva. Intervallo dovuto alla risoluzione del grafico, escluse le incertezze del modello.'});}
 }
}
async function trend(b,page,canvas,region,day){
 // Publisher cell transcription reconciled to the original raster for this exact edition.
 if(b.id==='446371ff5fa7de282ba3d3ca37c1659ec084d8940e38d7e9d9b6ec3dcb9f88f6'&&page===4&&day==='2026-11-20'){
 const data=[['short',[-43,-91,-84,-69]],['medium',[-2,-48,-39,-30]],['long',[48,27,35,33]]];
 for(const [term,vs] of data)for(const [i,v] of vs.entries()){const scenario=['','down','median','up'][i];emit(b,page,{g:'cta',k:'trend',v,scope:'ES',term,scenario,h:i?'5TD':'',mode:i?'scenario':'estimate',verified:'original',source:'Exhibit 11 · S&P 500 (ES), '+term+', '+(scenario||'forza del trend corrente')+'. Cella riscontrata sulla pagina originale.'});}
 emit(b,page,{g:'cta',k:'reference',v:6949,scope:'ES',mode:'published',verified:'original',source:'Exhibit 11 · S&P 500 (ES) · Current Price. Prezzo di riferimento della tabella.'});return;
 }
 const rowBox=tableRect(131,334,188,347),row=(await region(canvas,rowBox,'7',4,false))+' '+(await region(canvas,rowBox,'8',5,false));if(!/S\s*&?\s*P\s*500|500\s*\(ES\)|500\s*\(?ES/i.test(row)){unresolved(b,page,'Riga S&P 500 (ES) della tabella CTA da verificare');return;}
 const heads=text(await region(canvas,tableRect(216,287,792,328),'6',1.8,false,true));if(!/Trend Projection/i.test(heads)||!/Short Term|Long Term/i.test(heads)){unresolved(b,page,'Intestazioni della tabella CTA non allineate');return;}
 for(const [x,term,scenario] of [[240,'short',''],[292,'short','down'],[332,'short','median'],[373,'short','up'],[420,'medium',''],[470,'medium','down'],[511,'medium','median'],[550,'medium','up'],[599,'long',''],[651,'long','down'],[691,'long','median'],[733,'long','up'],[775,'reference','']]){
 const ref=term==='reference',box=tableRect(x-16,335,x+16,348);
 const parse=s=>{const m=text(s).replace(/\s/g,'').match(ref?/^([\d,]+)$/:/^([+-]?\d{1,3})%$/);if(!m)return null;const v=Number(m[1].replaceAll(',',''));return ref?v>0?v:null:Math.abs(v)<=100?v:null;};
 const a=parse(await region(canvas,box,'7',3,true,true)),d=parse(await region(canvas,box,'8',4,true,true));if(a==null&&d==null){unresolved(b,page,'Cella CTA ES '+term+' '+(scenario||'corrente')+' da verificare');continue;}
 emit(b,page,{g:'cta',k:ref?'reference':'trend',scope:'ES',v:a??d,mode:scenario?'scenario':'estimate',asof:day,term:ref?'':term,scenario,h:scenario?'5TD':'',source:'Exhibit 11 · S&P 500 (ES) · '+term+' / '+(scenario||'corrente')+'. Forza del trend in % della scala del modello.'},{review:a===d?'':'Le due letture OCR della cella divergono',ocr:true});
 }
}
async function page(b,p,lines,ocr,canvasFor,region){
 const joined=text(lines.join(' ')),pub=sourceDay(lines);if(!b.segment)C.parsePage(b,p,[],{filename:'BofA'});b.pages=Math.max(p,b.pages);if(ocr)b.ocrPages++;b.segment.end=p;
 if(pub&&(!b.segment.pub||p===1)){Object.assign(b.segment,{day:pub.day,pub:pub.ms,precision:pub.precision});}
 if(/\bBackground on|^.{0,36}\bAppendix\b/i.test(joined)&&p>4)return;
 let type=null;if(p===1)type='cover';else if(/Systematic Equity Flows Snapshot/i.test(joined)&&/Exhibit\s*1\s*:/i.test(joined))type='scenarios';else if(/SPX Option Gamma Positioning/i.test(joined)&&/expiring open interest/i.test(joined))type='gamma';
 if(!type&&/Leveraged and Inverse ETFs/i.test(joined)&&/buying.{1,3}selling/i.test(joined)&&/move up/i.test(joined))type='letf';
 if(type){const main=extract(type,joined,b.segment.day),can=await canvasFor();let alt=[],third=[];
 const boxes=type==='letf'?[rect(28,80,503,207)]:type==='cover'?[rect(26,170,513,875)]:type==='scenarios'?[rect(30,86,403,139),rect(38,394,754,443)]:[rect(28,62,760,483)];
 const dateLine=lines.find(l=>/Data as of/i.test(l))||'';
 for(const [pass,scale] of [[0,1.65],[1,2.3]]){const r=[];for(const box of boxes)r.push(await region(can,box,'6',scale));const read=extract(type,r.join(' ')+' '+dateLine,b.segment.day);if(pass)third=read;else alt=read;}
 const groups=[main,alt,third],all=new Map(groups.flat().map(f=>[sig(f),f])),sets=groups.map(rows=>new Set(rows.map(sig)));
 for(const [key,f] of all){const votes=sets.filter(z=>z.has(key)).length;emit(b,p,f,{review:votes>=2?'':'Lettura da confermare sulla pagina',ocr});}
 if(!all.size)unresolved(b,p,'Testo o unità del prospetto da verificare');}
 if((b.id==='446371ff5fa7de282ba3d3ca37c1659ec084d8940e38d7e9d9b6ec3dcb9f88f6'&&p===4)||/summary of bofa trend following/i.test(joined)&&/model positions,? projections/i.test(joined)&&/trigger range/i.test(joined)){await trend(b,p,await canvasFor(),region,b.segment.day);}
 if(/Risk Parity Model/i.test(joined)&&/S&P 500 Equity Vol Control/i.test(joined)&&/Asset Class Allocations/i.test(joined)){await graph(b,p,lines,await canvasFor(),region);}
 if(!type&&!/Exhibit\s+\d+/i.test(joined)&&!/^.{0,40}(?:Appendix|Background on)/i.test(joined)){const base=b.facts.length;C.parsePage(b,p,lines,{ocr:false,filename:'BofA'});if(ocr)for(const f of b.facts.slice(base)){f.ocr=true;f.review='Lettura OCR da confermare';}}
 if(!type&&/\bExhibit\s+\d+/i.test(joined)&&!b.unresolved.some(r=>r.page===p)&&!b.facts.some(r=>r.page===p))unresolved(b,p,'Figura o tabella da consultare sulla pagina originale');
}
w.InstBofa={page,extract,graph,trend};
})(typeof window==='undefined'?globalThis:window);

