
(function(w){
'use strict';
const C=w.InstCore;
Object.assign(C.groups,{sys:'Sistematici aggregati',macro:'Macro e credito',other:'Altre misure'});
Object.assign(C.scopes,{VIX:'Indice VIX',UST:'Treasury USA',EUR:'Azioni europee',EM:'Azioni emergenti',FX:'Valute',COM:'Commodity'});
Object.assign(C.metrics,{
 etfSensitivity:['Ribilanciamento ETF per +1% del sottostante','cashperpct'],closeShare:['Reset per 1% / nozionale medio ultimi 5 min','percent'],custom:['Indicatore del report','custom'],commentary:['Lettura qualitativa','text'],rv5:['SPX · volatilità realizzata intraday a 5 sedute','percent'],negativeGammaStreak:['Sedute consecutive di gamma negativo al close','sessions'],
 downStreak:['Sedute consecutive in ribasso','sessions'],vixTouched:['Livello VIX raggiunto intraday','points'],expiryGamma:['Gamma dealer per scadenza','gamma'],
 triggerBuy:['Trigger CTA di acquisto','points'],triggerSell:['Trigger CTA di vendita','points'],cashAllocation:['Allocazione in liquidità','percent'],
 betaHeadroom:['Capacità residua di aumentare il beta','ratio'],captureGap:['Ritardo dal benchmark','pp'],dispPosition:['Posizione nozionale in dispersione','money'],
 impliedCorr:['Correlazione implicita','ratio'],realizedCorr:['Correlazione realizzata','ratio'],advancing:['Titoli in rialzo','percent'],
 above200:['Titoli sopra la media a 200 sedute','percent'],putCall:['Rapporto put/call sui volumi','ratio'],buybackExec:['Riacquisti azionari eseguiti','money'],
 buybackBlackout:['Società in blackout buyback','percent'],hyOas:['OAS high yield','bp'],igOas:['OAS investment grade','bp'],
 vixCallVega:['Domanda netta cliente di vega sulle call OTM VIX','moneyvol']
});
const rules=[
 ['triggerBuy','cta',/\b(?:buy(?:[ -]side)? (?:trigger|threshold)|stop[ -]in buy level|soglia di acquisto|trigger di acquisto)\b/i],
 ['triggerSell','cta',/\b(?:sell(?:[ -]side)? (?:trigger|threshold)|stop[ -]out sell level|soglia di vendita|trigger di vendita)\b/i],
 ['negativeGammaStreak','dealer',/negative gamma (?:at (?:the )?close )?(?:streak|consecutive sessions)|sedute consecutive di gamma negativo/i],
 ['rv5','vol',/(?:5[ -](?:day|session)|5 sedute).{0,18}(?:realized|realised|realizzata) (?:volatility|vol\b)|(?:realized|realised) volatility.{0,10}5[ -]day/i],
 ['cashAllocation','hf',/cash (?:allocation|weight)|allocazione (?:in )?liquidità/i],['betaHeadroom','hf',/beta headroom|remaining beta capacity|capacità residua di beta/i],
 ['captureGap','hf',/benchmark shortfall|underperformance (?:versus|vs\.?) benchmark|ritardo dal benchmark/i],
 ['dispPosition','disp',/(?:net )?dispersion notional(?: exposure| position)?|(?:net )?dispersion position|nozionale (?:netto )?dispersione/i],
 ['impliedCorr','disp',/implied (?:average )?correlation|correlazione implicita/i],['realizedCorr','disp',/reali[sz]ed (?:average )?correlation|correlazione realizzata/i],
 ['above200','market',/(?:stocks?|members?|constituents?|titoli).{0,22}(?:above|sopra).{0,18}200[ -]?(?:day|sedute|DMA)/i],
 ['advancing','market',/advancing (?:stocks|constituents|issues)|titoli in rialzo/i],['putCall','vol',/put[ /-]+call (?:volume )?ratio|rapporto put.call (?:sui )?volumi/i],
 ['buybackExec','buy',/executed (?:share )?(?:repurchases|buybacks)|riacquisti (?:azionari )?eseguiti/i],
 ['buybackBlackout','buy',/buyback blackout (?:share|coverage)|(?:companies|firms|società) in (?:buyback )?blackout/i],
 ['hyOas','macro',/\b(?:HY|high[ -]yield) (?:credit )?(?:OAS|option.adjusted spread)\b/i],
 ['igOas','macro',/\b(?:IG|investment[ -]grade) (?:credit )?(?:OAS|option.adjusted spread)\b/i],
 ['vixCallVega','vixetn',/net customer (?:OTM VIX call|VIX OTM call) vega (?:flow|demand)/i]
];
const themes=[['cta',/\bCTAs?\b|trend.follow|stop.out/i],['vc',/vol(?:atility)?[ -](?:control|target)/i],['rp',/risk.parity|parità di rischio/i],['dealer',/dealer|hedger|gamma|vanna|charm/i],['letf',/leveraged|inverse ETF|levered ETF/i],['buy',/buyback|repurchase|riacquist/i],['hf',/hedge funds?|prime brokerage|gross exposure|benchmark/i],['pension',/pension/i],['disp',/dispersion|correlation|correlaz/i],['vol',/\b(?:VVIX|VIX|skew|volatility|volatilità|variance|volga|convexity)\b/i],['market',/breadth|equities|equity|stock|azion|momentum|index|S&P|SPX|Nasdaq/i],['macro',/inflation|unemployment|payroll|CPI|credit|treasury|spread|yields?|inflazione/i]];
const topic=t=>themes.find(([,rx])=>rx.test(t))?.[0]||'other';
const label=t=>C.clean(t).replace(/\s+/g,' ').trim(), normal=t=>label(t).toLowerCase();
const noLabel=/^(?:figure|exhibit|chart|page|pagina|contact|tel(?:ephone)?|source|fonte|copyright|analyst|disclaimer|report date|published|data as of|as of|where|formula|example|methodology)\b|@|https?:|^\d+\s*$/i;
const unsafe=/\b(?:historically|previously|prior|last year|peak|record high|from .+ to |ranged|between|up to|at least|instead|would|could|assuming|if|scenario|forecast|projected|predicted|previsto|ipotizz|in caso di|storicamente|picco|precedente|illustrat|example|esempio|simulat|hypothetical|not|never)\b/i;
function scope(t){if(/\bES (?:future[s]?|contract)|E-mini S&P/i.test(t))return 'ES';const s=C.scopeOf(t);if(s!=='UNKNOWN'&&s!=='OTHER')return s;
 if(/\b(?:VIX|VVIX)\b/i.test(t))return 'VIX';if(/\b(?:US|U\.S\.)\b/i.test(t))return 'US';if(/\b(?:EUR equities|european equities|azioni europee)\b/i.test(t))return 'EUR';if(/emerging markets|azioni emergenti/i.test(t))return 'EM';if(/\bglobal equities\b/i.test(t))return 'GLOBAL';return s;}
const unitSpecs={percent:['%','%',1],pp:['pp','pp',1],bp:['bp','bp',1],multiple:['×','×',1],ratio:['rapporto','rapporto',1],points:['punti','punti',1],sessions:['sedute','sedute',1],volpt:['punti vol','punti vol',1]};
function unitTail(t){return t.match(/(?:\(|\[)\s*((?:USD|EUR|GBP)(?:\s*(?:bn|mn|million|billion))?|%|bps?|pp|x|ratio|points?|punti|sessions?)\s*(?:\)|\])\s*$/i)?.[1]||'';}
function scalar(raw,hint='',dim='custom'){
 let v=label(raw),prefix='',suffix='';
 if(/^\(.+\)$/.test(v))v='-'+v.slice(1,-1);
 const m=v.match(/^([+-]?)\s*(USD|EUR|GBP|CAD|AUD|US\$|\$|€|£)?\s*([+-]?)\s*(\d+(?:[.,]\d+)*)\s*(bn|bln|billion|mn|mm|million|mld|mln|[bmk]|trillion)?\s*(%|percent(?:age)? points?|p\.p\.|pp|bps?|basis points?|percent|x|×|pts?|points?|punti|sedute|sessions?|days?|ratio|rapporto)?\s*(USD|EUR|GBP|CAD|AUD)?$/i);
 if(!m||m[1]&&m[3])return null;
 let body=m[4],cur=(m[2]||m[7]||'').toUpperCase(),mag=(m[5]||'').toLowerCase(),u=(m[6]||'').toLowerCase();
 if(!cur&&!mag&&!u&&hint){if(/^(USD|EUR|GBP)/i.test(hint)){prefix=hint.slice(0,3)+' ';suffix=' '+hint.slice(3);}else suffix=' '+hint;return scalar(m[1]+(m[3]||'')+prefix+body+suffix,'',dim);}
 if(!cur&&mag||cur&&u)return null;
 let n=C.numbers(body)[0]?.value;if(!Number.isFinite(n))return null;if((m[1]||m[3])==='-')n=-n;
 cur=({'$':'USD','US$':'USD','€':'EUR','£':'GBP'})[cur]||cur;
 if(cur){const mult=/trillion/.test(mag)?1e12:/^(bn|bln|billion|mld|b)$/.test(mag)?1e9:/^(mn|mm|million|mln|m)$/.test(mag)?1e6:mag==='k'?1e3:1;return {v:n*mult,dim:'money',unit:cur,currency:cur};}
 const d=/^(%|percent)$/.test(u)?'percent':/^(pp|p\.p\.|percentage points?|percent points?)$/.test(u)?'pp':/^(bp|basis)/.test(u)?'bp':/^(x|×)$/.test(u)?'multiple':/^(?:pt|point|punt)/.test(u)?'points':/^(?:sedut|session|day)/.test(u)?'sessions':/^(ratio|rapporto)/.test(u)?'ratio':'';
 if(d)return {v:n,dim:d,unit:unitSpecs[d][0],currency:''};
 if(['points','sessions','ratio'].includes(dim))return {v:n,dim,unit:unitSpecs[dim][0],currency:''};
 return null;
}
function measure(b,page,seg,heading,raw,context,ocr,source,hint=''){
 const title=label(heading),s=title+' '+context;if(title.length<3||title.length>150||noLabel.test(title)||!/[A-Za-zÀ-ÿ]{2}/.test(title))return;
 const spec=rules.find(([, ,rx])=>rx.test(title));const k=spec?.[0]||'custom',dim=C.metrics[k][1],n=scalar(raw,hint||unitTail(title),dim);
 if(!n)return;
 // The existing typed extractor owns familiar measures. Additional series retain their printed definition.
 if(!spec&&C.metricOf(title,topic(s))&&b.facts.some(f=>f.page===page&&f.v===n.v&&f.k!=='custom'))return;
 let val=n.v,review='';
 if(spec&&n.dim!==dim){if(dim==='ratio'&&n.dim==='percent')val/=100;else if(dim==='moneyvol'&&n.dim==='money'&&/per (?:1 )?(?:vol|volatility) (?:point|pt)|\/volpt/i.test(title)){}else return;}
 const universe=scope(s);if(universe==='UNKNOWN'||universe==='OTHER')review='Confermare il perimetro';
 const namedNative=!ocr&&!!seg.provider&&!!seg.series&&!!seg.day&&universe!=='UNKNOWN'&&universe!=='OTHER'&&/[:=|]/.test(source)&&!noLabel.test(title)&&!/[<>]/.test(title)&&title.length<=95;
 if(k==='custom'&&!namedNative)review=review||'Confermare nome, unità e definizione della serie';
 if(unsafe.test(title+' '+source))review='Confermare natura, condizione e periodo';
 if(ocr)review='Confermare testo o cella OCR';
 if(!C.allowed(k,val))return;
 const name=title.replace(/\s*[([][^\])]*[)\]]\s*$/,'').trim(),group=spec?.[1]||topic(s);
 const f={page,seg:seg.id,g:group,k,v:val,scope:universe,currency:n.currency,h:C.horizonOf(title)||(['rv5'].includes(k)?'5TD':''),term:'',scenario:'',mode:'published',asof:seg.day||'',source,review,enabled:true,ocr};
 if(k==='custom')Object.assign(f,{name,unit:n.unit,labelKey:normal(name),verified:namedNative&&!review?'labelled':''});
 if(b.facts.some(a=>a.seg===f.seg&&a.page===page&&a.k===k&&a.v===val&&(k!=='custom'||a.labelKey===f.labelKey)&&a.scope===universe))return;
 f.id=b.facts.reduce((mx,r)=>Math.max(mx,r.id),0)+1;b.facts.push(f);
}
function narrative(b,seg,page,lines,ocr,context){
 const thesis=/\b(?:we (?:expect|anticipate|favor|are bearish|are bullish)|our (?:base case|view is)|we see (?:risk|scope)|net (?:buyers|sellers) of|remain(?:s)? (?:net )?(?:long|short)|ci aspettiamo|il nostro scenario|restano (?:lunghi|corti))\b/i;
 for(let i=0;i<lines.length;i++){const t=lines[i];if(!thesis.test(t)||t.includes('\t')||noLabel.test(t)||/past performance|hypothetical|for example/i.test(t))continue;
 let phrase=t;for(let j=i+1;j<Math.min(lines.length,i+4)&&!/[.!?]$/.test(phrase)&&phrase.length<290;j++){if(noLabel.test(lines[j])||lines[j].includes('\t'))break;phrase+=' '+lines[j];}
 const terms=phrase.match(/^.{18,390}?(?:[.!?](?=\s+[A-Z]|$)|$)/)?.[0]||phrase;const sc=scope(terms+' '+context),g=topic(terms);if(g==='other'&&sc==='UNKNOWN')continue;
 const f={id:b.facts.length+1,page,seg:seg.id,g,k:'commentary',name:'Tesi del report',v:null,scope:sc,source:terms,review:ocr?'Confermare passaggio OCR':sc==='UNKNOWN'?'Confermare il perimetro':'',currency:'',asof:seg.day||'',h:C.horizonOf(terms),term:'',scenario:'',mode:'forecast',enabled:true,ocr};
 if(!b.facts.some(a=>a.k===f.k&&a.seg===seg.id&&a.source===terms))b.facts.push(f);
 }}
function capture(b,page,raw,ocr){
 if(!b.segment)return;const seg=b.segment,lines=raw.map(t=>String(t).normalize('NFKC').trim()).filter(Boolean);
 if(!seg.series){const named=lines.slice(0,15).map(t=>t.match(/^(?:research series|report series|series|pubblicazione|collana)\s*[:=]\s*(.{3,100})$/i)).find(Boolean);if(named)seg.series=label(named[1]);else if(seg.provider==='BofA'&&/systematic flows monitor/i.test(lines.slice(0,14).join(' ')))seg.series='Systematic Flows Monitor';else if(seg.provider==='Goldman Sachs'&&/GS Tactical Flow.of.Funds/i.test(lines.slice(0,18).join(' ')))seg.series='GS Tactical Flow-of-Funds';}
 b.textPages??=[];b.textPages.push({page,seg:seg.id,ocr,lines});b.extraction=2;
 let context='',header=null;narrative(b,seg,page,lines,ocr,lines.find(t=>/^(?:scope|universe|universo)\s*[:=]/i.test(t))||'');
 for(const line of lines){
  const cells=line.split(/\t+|\s*\|\s*/).map(label).filter(Boolean);
  if(/^\s*(?:universe|scope|market|universo|perimetro)\s*[:=]/i.test(line)){context=line;header=null;continue;}
  if(cells.length>=2){
   if(cells.slice(1).every(c=>/[a-z%]/i.test(c)&&!/^[-+$€£(\d]/.test(c))){header=cells;continue;}
   if(header?.length===cells.length&&cells.slice(1).some(c=>/\d/.test(c))){
    for(let i=1;i<cells.length;i++){const labelCell=cells[0],h=header[i],anchor=scope(labelCell)!=='UNKNOWN';
     measure(b,page,seg,anchor?h:labelCell+' · '+h,cells[i],[labelCell,context].join(' '),ocr,header.join(' | ')+' → '+cells.join(' | '),unitTail(h));}continue;}
   header=null;if(cells.length===2)measure(b,page,seg,cells[0],cells[1],context,ocr,line);
  }else{
   header=null;for(const clause of line.split(/;\s*|\s+[•]\s+|(?<=[%×])\s+and\s+/i)){
    const pair=clause.match(/^(.{3,150}?)(?:\s*[:=]\s*|\s+(?:stands at|is at|is|was|at|è pari a|è)\s+)(.+?)\s*[.]?$/i);
    if(pair)measure(b,page,seg,pair[1],pair[2],context,ocr,clause);
   }
  }
 }
}
function passages(doc,seg,q='',page=0){
 const search=normal(q),matches=[];for(const p of doc.textPages||[]){if(p.seg!==seg)continue;
 const lines=p.lines||[];for(let i=0;i<lines.length;i++){let t=lines[i];if(search&&!normal(t).includes(search)){const next=lines[i+1];if(!next||normal(next).includes(search)||!normal(t+' '+next).includes(search))continue;t+=' '+next;}
 if(!search&&(noLabel.test(t)||!/[A-Za-zÀ-ÿ]{3}/.test(t)||topic(t)==='other'&&!/\d\s*(%|bn|bps?)|[$€£]\s*\d/i.test(t)))continue;
 matches.push({page:p.page,index:i,text:t,topic:topic(t),ocr:p.ocr});}}
 return {count:matches.length,rows:matches.slice(page*8,page*8+8)};
}
function provenance(f){return {report:f.file||'',provider:f.provider,date:f.asof,page:f.page,available_at:f.pub,series:f.series||'',label:f.name||C.metrics[f.k]?.[0],source:f.source};}
function comparable(f){return JSON.stringify([f.provider,f.series||'',f.scope,f.g,f.k,f.k==='custom'?normal(f.name||''):f.k==='commentary'?normal(f.source||''):'',f.k==='custom'?f.unit:'',f.mode,f.term||'',f.h||'',f.currency||'',f.scenario||'']);}
const allowedDates=(k,v)=>k==='rv5'?v>=0&&v<1000:['downStreak','negativeGammaStreak'].includes(k)?Number.isSafeInteger(v)&&v>=0:['cashAllocation','above200','advancing','buybackBlackout'].includes(k)?v>=0&&v<=100:['triggerBuy','triggerSell','vixTouched'].includes(k)?v>0:['impliedCorr','realizedCorr'].includes(k)?Math.abs(v)<=1:k==='putCall'?v>=0:true;
w.ReportIntel={special:t=>rules.some(r=>r[2].test(t)),capture,passages,provenance,comparable,topic,scope,allowed:allowedDates,normal};
})(window);

