
(function(w){
'use strict';
const DAY=86400000;
const metrics={
 position:['Posizione netta','money'],aum:['Patrimonio / AUM','money'],weight:['Esposizione corrente','percent'],target:['Esposizione obiettivo','percent'],
 leverage:['Leva corrente','multiple'],targetLev:['Leva obiettivo','multiple'],riskTarget:['Target di volatilità annua','percent'],forecastVol:['Volatilità prevista annua','percent'],
 percentile:['Percentile di posizionamento','percentile'],flow:['Flusso netto','money'],cashflow:['Sottoscrizioni / riscatti netti','money'],trigger:['Soglia di prezzo','points'],
 eqWeight:['Peso azionario','percent'],bondWeight:['Peso obbligazionario','percent'],eqVol:['Volatilità annua azioni','percent'],bondVol:['Volatilità annua obbligazioni','percent'],correlation:['Correlazione azioni / obbligazioni','ratio'],
 priorCorr:['Correlazione precedente','ratio'],dailyReturn:['Rendimento giornaliero indice di riferimento','percent'],shock:['Ampiezza dello shock di prezzo','percent'],gross:['Esposizione lorda','percent'],net:['Esposizione netta','percent'],grossPct:['Percentile di esposizione lorda','percentile'],netPct:['Percentile di esposizione netta','percentile'],
 vix:['VIX spot','points'],vvix:['VVIX','points'],dxy:['Dollar index','points'],credit:['Spread di credito','bp'],breadth:['Partecipazione azionaria','percent'],
 vega:['Flusso vega · per punto vol','moneyvol'],gex:['Esposizione gamma pubblicata','gamma'],zeroDte:['Quota volumi 0DTE','percent'],buyback:['Autorizzazioni al riacquisto','money'],skew:['Skew opzioni','volpt']
};
const groups={cta:'CTA',vc:'Vol control',rp:'Risk parity',letf:'ETF a leva',hf:'Hedge fund',buy:'Buyback',pension:'Fondi pensione',vixetn:'ETP VIX',vol:'Volatilità',dealer:'Dealer',market:'Cross-market',disp:'Dispersione'};
const scopes={SPX:'SPX cash',ES:'ES futures',US:'Azioni USA',GLOBAL:'Azioni globali',TOTAL:'Totale del report',NDX:'Nasdaq 100',RTY:'Russell 2000',BONDS:'Obbligazioni',PORT:'Portafoglio multi-asset',OTHER:'Altro universo',UNKNOWN:'Universo da identificare'};
const modes={published:'Dato riportato',estimate:'Stima del desk',forecast:'Previsione',scenario:'Scenario condizionato'};
const phrases=[
 ['vixetn',/\bvix\s*(?:etn|etp|etf)s?\b/i],['vc',/\b(?:vol(?:atility)?[ -](?:control|target(?:ing)?)|target[ -]vol(?:atility)?|controllo (?:della )?volatilità)\b/i],
 ['rp',/\b(?:risk[ -]parity|parità di rischio)\b/i],['cta',/\b(?:CTAs?|trend[ -]followers?)\b/i],['letf',/\b(?:lever(?:ed|aged) etfs?|LETFs?|ETF a leva)\b/i],
 ['hf',/\b(?:hedge funds?|prime brokerage|HF gross|HF net)\b/i],['buy',/\b(?:buybacks?|riacquisti)\b/i],['pension',/\b(?:pension(?:s| funds?)?|fondi pensione)\b/i],
 ['dealer',/\b(?:GEX|dealer(?:s| gamma)?)\b/i],['disp',/\bdispersion\b/i],['vol',/\b(?:VVIX|VIX|0DTE|skew)\b/i],['market',/\b(?:DXY|credit spread|breadth)\b/i]
];
const clean=s=>String(s??'').normalize('NFKC').replace(/[−–—]/g,'-').replace(/[’‘]/g,"'").replace(/\u00ad/g,'').replace(/\u00a0/g,' ').trim();
const groupsOf=s=>phrases.filter(p=>p[1].test(s)).map(p=>p[0]);
function scopeOf(s){
 if(/\b(?:ex[ -]?US|non[ -]?US|outside (?:the )?US|Europe(?:an)?|Japanese|emerging markets|Asia(?:n)?)\b/i.test(s))return 'OTHER';
 for(const [k,rx] of [['SPX',/\b(?:SPX|S\s*&\s*P\s*500)\b/i],['ES',/\b(?:E-mini S&P|ES futures?|ES contract)\b/i],['NDX',/\b(?:NDX|NASDAQ[ -]?100)\b/i],['RTY',/\b(?:RTY|Russell[ -]?2000)\b/i],['PORT',/\b(?:multi[ -]asset|stock.bond portfolio|balanced portfolio)\b/i],['US',/\b(?:U\.?S\.?A? (?:equiti|stock)|US equity|US sleeve|azioni USA|US equities|US stocks|out (?:of )?(?:the )?US)\b/i],['GLOBAL',/\b(?:global|world(?:wide)?) (?:equities|equity|equity futures|stocks)\b/i],['BONDS',/\b(?:fixed income|Treasur(?:ies|y)|bond futures)\b/i]])if(rx.test(s))return k;
 return 'UNKNOWN';
}
function horizonOf(s){
 const m=s.match(/\b(?:(?:over|during|in|for) (?:the )?)?(?:(?:next|past|last|prior|coming|this)\s+)?(\d+(?:\.\d+)?)?\s*(business days?|trading days?|days?|weeks?|months?|giorn[io]|settiman[ae]|mes[ei])\b/i)||s.match(/\b(\d+)([dwm])\b/i);
 if(!m)return /\b(?:today|overnight|at the close)\b/i.test(s)?'1D':'';
 const n=Number(m[1]||1);if(!(n>0&&n<=365))return '';const k=m[2].toLowerCase();return n+(/^(w|settiman)/.test(k)?'W':/^(m|mes)/.test(k)?'M':/^(business|trading)/.test(k)?'TD':'D');
}
function scenarioOf(s){if(/\b(?:flat tape|flat market|flat scenario|unchanged|sideways|flat)\b/i.test(s))return 'flat';if(/\b(?:up(?:side)? (?:tape|market|scenario)|rally scenario|rising market|up tape|rialzo)\b/i.test(s))return 'up';if(/\b(?:down(?:side)? (?:tape|market|scenario)|selloff scenario|falling market|ribasso)\b/i.test(s))return 'down';return '';}
function providerOf(s){const published=String(s).match(/^(?:publisher|issued by|emittente)\s*[:=]\s*([^|\t]{2,65})(?:$|[|\t])/i);if(published)return clean(published[1]);for(const [key,r] of [['J.P. Morgan',/j\.?p\.?\s*morgan/i],['Morgan Stanley',/morgan stanley/i],['Barclays',/barclays/i],['Deutsche Bank',/deutsche bank/i],['UBS',/\bUBS\b/i],['Citi',/\bcitigroup|citi research\b/i],['BNP Paribas',/bnp paribas/i],['Société Générale',/soci[eé]t[eé] g[eé]n[eé]rale/i]])if(r.test(s))return key;return /bofa|bank of america|merrill lynch/i.test(s)?'BofA':/goldman sachs|\bGS Tactical|Scott Rubner|Market Insights\s*-\s*Marquee/i.test(s)?'Goldman Sachs':/nomura|mcelligott|mcellig[oﬀ]tt/i.test(s)?'Nomura':'';}
function instant(day,clock='',zone=''){
 if(!/^\d{4}-\d\d-\d\d$/.test(day)||isNaN(Date.parse(day))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)return null;
 const wall=day+'T'+(clock||'23:59:59');let ms;
 if(zone==='UTC'||zone==='Z'||/^[+-]\d\d:\d\d$/.test(zone))ms=Date.parse(wall+(zone==='UTC'?'Z':zone));
 else if(zone==='EST'||zone==='EDT')ms=Date.parse(wall+(zone==='EST'?'-05:00':'-04:00'));
 else{const t=Date.parse(wall+'Z');if(!Number.isFinite(t))return null;const ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});const p=Object.fromEntries(ny.formatToParts(t).map(x=>[x.type,x.value]));ms=2*t-Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');}
 return Number.isFinite(ms)?ms:null;
}
const months='jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
function dateIn(s){
 let m=s.match(/\b(20\d\d)[-/](\d{1,2})[-/](\d{1,2})\b/),y,mo,d;
 if(m){[,y,mo,d]=m;}
 else if((m=s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d\d|\d{2})\b/))){[,mo,d,y]=m;if(y.length===2)y='20'+y;}
 else if((m=s.match(/\b(\d{1,2})\s+(Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\.?\s*,?\s*(20\d\d)\b/i))){d=m[1];mo=months.indexOf(m[2].slice(0,3).toLowerCase())+1;y=m[3];}
 else if((m=s.match(/\b(Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d\d)\b/i))){mo=months.indexOf(m[1].slice(0,3).toLowerCase())+1;d=m[2];y=m[3];}
 else return null;
 const day=y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');const tail=s.slice(m.index+m[0].length),c=tail.match(/^[,\sT-]*(\d{1,2}):(\d\d)(?::(\d\d))?\s*(AM|PM)?\s*(UTC|Z\b|EST|EDT|ET\b|[+-]\d\d:\d\d)?/i);
 let clock='',zone='';if(c&&c[5]){let hr=+c[1];if(c[4])hr=hr%12+(c[4].toUpperCase()==='PM'?12:0);clock=String(hr).padStart(2,'0')+':'+c[2]+':'+(c[3]||'00');zone=c[5].toUpperCase();}
 const ms=instant(day,clock,zone);return ms==null?null:{day,ms,precision:clock?'time':'day'};
}
function publication(lines){
 for(const s of lines.slice(0,17)){const l=clean(s);if(/^(?:publication date|published(?: on| at)?|report date|data di pubblicazione|issued|release date|date|sent)\s*[:-]/i.test(l)||/Market Insights\s*-\s*Marquee/i.test(l)||l.length<45&&/^(?:\d{1,2}\s+[a-z]{3}|[a-z]{3,9}\s+\d{1,2},?\s+20|20\d\d-\d\d-\d\d$)/i.test(l)){const dt=dateIn(l);if(dt)return dt;}}
 return null;
}
function normalizeNum(s){
 let v=s.replace(/[\s']/g,'');const i=v.indexOf(','),j=v.indexOf('.');
 if(i>=0&&j>=0)v=v.lastIndexOf('.')>v.lastIndexOf(',')?v.replace(/,/g,''):v.replace(/\./g,'').replace(',','.');
 else if(i>=0)v=/^\d{1,3}(?:,\d{3})+$/.test(v)?v.replace(/,/g,''):v.replace(',','.');
 return Number(v);
}
const numberRx=/(?<![\w.])([+-]?)\s*(US\$|USD|EUR|GBP|AUD|CAD|\$|€|£)?\s*([+-]?)\s*(\d+(?:[.,]\d+)*)\s*(trillions?|billions?|millions?|thousands?|trn|tn|bn|bln|mm|mln|mn|[bmk](?![a-z])|bps?\b|basis points?|%ile|%|(?:st|nd|rd|th)\s+percentile|percentile|percent\b|[x×](?![a-z]))?/gi;
function numbers(s){
 const out=[];for(const m of s.matchAll(numberRx)){let i=m.index+ m[0].search(/[^\s]/),j=m.index+m[0].trimEnd().length;const raw=m[4],mag=(m[5]||'').toLowerCase().trim(),cur=(m[2]||'').toUpperCase();
 let n=normalizeNum(raw),kind='number',currency=({'$':'USD','US$':'USD','€':'EUR','£':'GBP'})[cur]||cur,sign=m[1]||m[3];
 if(cur||/^(?:trill|bill|mill|thous|trn|tn|bn|bln|mm|mln|mn|b$|m$|k$)/.test(mag)){
 const factor=/^(?:trill|trn|tn)/.test(mag)?1e12:/^(?:bill|bn|bln|b$)/.test(mag)?1e9:/^(?:mill|mm|mln|mn|m$)/.test(mag)?1e6:/^(?:thous|k$)/.test(mag)?1e3:1;n*=factor;kind='money';
 }else if(mag.includes('percentile')||mag==='%ile')kind='percentile';else if(mag==='%'||mag==='percent')kind='percent';else if(mag.startsWith('bp')||mag.startsWith('basis'))kind='bp';else if(mag==='x'||mag==='×')kind='multiple';
 if(sign==='-')n=-n;const inPar=/\(\s*$/.test(s.slice(0,i))&&/^\s*\)/.test(s.slice(j));
 out.push({value:n,kind,currency,sign,index:i,end:j,inPar,raw:m[0].trim()});}
 return out;
}
function metricOf(s,g){
 if(g==='vixetn'&&/vega/i.test(s))return 'vega';
 if(/\b(?:threshold|trigger|soglia|stop[ -](?:in|out) level)\b/i.test(s))return 'trigger';
 if(/\b(?:assets under management|aum|patrimonio)\b/i.test(s)&&!/\b(?:%|percent) of (?:its )?aum/i.test(s)&&!/%\s*(?:of\s*)?aum/i.test(s))return 'aum';
 if(/(?:scenario|tape|market|spot) shock|shock di prezzo/i.test(s))return 'shock';
 if(g==='letf'&&/daily (?:benchmark |index )?return|rendimento giornaliero/i.test(s))return 'dailyReturn';
 if(g==='rp'){
 if(/(?:prior|previous|precedente).{0,20}correlat/i.test(s))return 'priorCorr';
 if(/(?:equity|stock|azion).{0,16}(?:volatility|vol\b|volatilità)/i.test(s))return 'eqVol';
 if(/(?:bond|fixed income|obblig).{0,16}(?:volatility|vol\b|volatilità)/i.test(s))return 'bondVol';
 if(/correlat|correlazione/i.test(s))return 'correlation';
 if(/(?:equity|stock|azion).{0,13}(?:weight|allocation|peso)/i.test(s))return 'eqWeight';
 if(/(?:bond|fixed income|obblig).{0,13}(?:weight|allocation|peso)/i.test(s))return 'bondWeight';}
 if(/(?:volatility target|vol target|target (?:annual(?:ized)? )?volatility|target annual vol|obiettivo di volatilità)/i.test(s))return 'riskTarget';
 if(/(?:forecast|expected|realized forecast).{0,12}(?:volatility|annual vol)|volatility forecast/i.test(s))return 'forecastVol';
 if(/(?:target|desired|natural|obiettivo).{0,15}(?:leverage|leva)/i.test(s))return 'targetLev';
 if(/(?:leverage|leva)\b/i.test(s)&&!/(?:leveraged|levered)/i.test(s))return 'leverage';
 if(/(?:target|desired|natural|obiettivo).{0,20}(?:exposure|weight|allocat|position|esposizione)/i.test(s))return 'target';
 if(g==='hf'&&/gross|lord[ao]/i.test(s))return /percentile|%ile/i.test(s)?'grossPct':'gross';
 if(g==='hf'&&/net|nett[ao]/i.test(s))return /percentile|%ile/i.test(s)?'netPct':'net';
 if(/percentile|%ile/i.test(s))return 'percentile';
 if(g==='letf'&&/subscription|redemption|creation|sottoscriz|riscatt/i.test(s))return 'cashflow';
 if(g==='buy'&&/authorization|authorisation|autorizzaz/i.test(s))return 'buyback';
 if(/\b(?:flows?|buy(?:ing|ers?|s)?|bought|sell(?:ing|ers?|s)?|sold|purchase[ds]?|outflows?|inflows?|vendit[ae]|acquist[io]|domanda netta|flussi?|rebalanc\w*|demand|for sale)\b/i.test(s))return 'flow';
 if(g==='vol'){if(/\b0dte\b/i.test(s)&&/share|quota/i.test(s))return 'zeroDte';if(/\bVVIX\b/i.test(s))return 'vvix';if(/\bVIX\b/i.test(s)&&!/future|curve|basis|option|call|put/i.test(s))return 'vix';if(/skew/i.test(s))return 'skew';}
 if(g==='market'){if(/DXY/i.test(s))return 'dxy';if(/credit spread/i.test(s))return 'credit';if(/breadth/i.test(s))return 'breadth';}
 if(g==='dealer'&&/GEX|gamma exposure/i.test(s))return 'gex';
 if(/(?:position|exposure|allocation|weight|net long|net short|esposizione|peso|allocazione)/i.test(s))return /[$€£]|\b(?:USD|EUR|GBP)\b/i.test(s)?'position':'weight';
 return '';
}
function methodOf(s,context){return scenarioOf(s)||/\b(?:if|assuming|conditional|in case|se il)\b/i.test(s)||context.scenario?'scenario':/\b(?:will|would|expect(?:ed)?|project(?:ed)?|forecast|next|previst\w*)\b/i.test(s)?'forecast':/\b(?:model(?:led|ed)?|estimat(?:ed|e)|stimat\w*)\b/i.test(s)?'estimate':'published';}
function direction(s){const neg=/\b(?:sell(?:ers?|s|ing)?|sold|short|outflows?|out of|redemptions?|vendit[ae])\b/i.test(s),pos=/\b(?:buy(?:ers?|s|ing)?|bought|long|inflows?|purchases?|acquist[io])\b/i.test(s);return neg&&pos?2:neg?-1:pos?1:0;}
function allowed(k,v){if(k==='commentary')return v===null;if(!Number.isFinite(v)||!metrics[k]||w.ReportIntel&&!w.ReportIntel.allowed(k,v))return false;if(['aum','vix','vvix','dxy','trigger','riskTarget','forecastVol','eqVol','bondVol'].includes(k))return v>0;if(['percentile','grossPct','netPct','breadth','zeroDte'].includes(k))return v>=0&&v<=100;if(['correlation','priorCorr'].includes(k))return Math.abs(v)<=1;return true;}
function book(){return {segments:[],facts:[],unresolved:[],pages:0,ocrPages:0,errors:[],ctx:{group:'',scope:'UNKNOWN',horizon:'',table:null},segment:null};}
function newSegment(b,page,provider,pub){const seg={id:b.segments.length+1,page,provider,pub:pub?.ms??null,day:pub?.day||'',precision:pub?.precision||'',end:page};b.segments.push(seg);b.segment=seg;b.ctx={group:'',scope:'UNKNOWN',horizon:'',table:null};return seg;}
function addUnresolved(b,page,s,why){s=clean(s);if(s&&b.unresolved.at(-1)?.text!==s)b.unresolved.push({page,seg:b.segment.id,text:s.slice(0,390),why});}
function makeFact(b,row,g,k,n,s,ctx,opt={}){
 const dim=metrics[k]?.[1];if(!dim)return;const source=s,mode=opt.mode||methodOf(s,ctx),scenario=opt.scenario||scenarioOf(s)||ctx.scenario||'',h=opt.horizon||horizonOf(s)||ctx.horizon||'';
 let scope=opt.scope||scopeOf(s);if(scope==='UNKNOWN')scope=ctx.scope||scope;
 let v=n.value,review='',currency=n.currency||opt.currency||'',term=opt.term||(/short[ -]term/i.test(s)?'short':/medium[ -]term/i.test(s)?'medium':/long[ -]term/i.test(s)?'long':'');
 if(['flow','position','vega','cashflow'].includes(k)){
 const dir=direction(opt.signText||s);if(dir===2||dir<0&&n.sign==='+'||dir===1&&v<0)review='Direzione discordante o multipla';
 else if(v>0&&dir===-1)v=-v;else if(!n.sign&&!dir&&n.inPar&&ctx.accounting)v=-v;
 else if(!n.sign&&!dir&&k!=='position'&&!ctx.signed)review='Segno da confermare';
 if(k==='position'&&!n.sign&&!dir&&!/net (?:position|exposure)|posizione netta/i.test(s))review='Esposizione netta da confermare';}
 if(['money','moneyvol','gamma'].includes(dim)&&!currency)review='Valuta non identificata';
 if(k==='gex'&&!/per (?:1%|1 percent)|\/1%/i.test(s))review='Scala gamma da confermare';
 if(k==='vega'&&!/per (?:1 )?(?:vol|volatility) (?:point|pt)|\/vol\s*(?:pt|point)/i.test(s))review='Scala vega da confermare';
 if(['correlation','priorCorr'].includes(k)&&n.kind==='percent')v/=100;
 if(k==='trigger'&&!['SPX','ES','NDX','RTY'].includes(scope))review='Sottostante della soglia da confermare';
 if(scope==='UNKNOWN'&&!['vix','vvix','dxy','credit','zeroDte','skew'].includes(k))review=review||'Universo da confermare';
 if(['flow','cashflow','vega'].includes(k)&&!h)review=review||'Orizzonte del flusso assente';
 if(mode==='scenario'&&!scenario)review=review||'Condizione da specificare';
 if(row.ocr)review='Lettura OCR da confermare';
 if(opt.review)review=opt.review;
 if(!allowed(k,v)){addUnresolved(b,row.page,s,'Valore fuori dominio');return;}
 if(k==='weight'&&/net short|short exposure/i.test(s)&&v>0)v=-v;
 const as=dateIn((s.match(/\bas (?:of|at)\s+(.{5,28})/i)||[])[1]||'')?.day||ctx.asof||b.segment.day||'';
 const f={page:row.page,seg:b.segment.id,g,k,v,currency,scope,h:k==='trigger'&&!horizonOf(s)?'':h,mode,scenario,term,asof:as,review,source:source.slice(0,410),ocr:!!row.ocr,enabled:true};
 const sig=[f.page,f.seg,g,k,v,currency,scope,h,mode,scenario,term,f.asof].join('|');if(b.pageKeys.has(sig))return;b.pageKeys.add(sig);f.id=b.facts.length+1;b.facts.push(f);
}
function compatible(k,n){const d=metrics[k][1];return d==='money'||d==='moneyvol'||d==='gamma'?n.kind==='money':d==='ratio'?['number','percent'].includes(n.kind):d==='volpt'?n.kind==='number':d==='points'?n.kind==='number':d===n.kind;}
function parseOne(b,row,txt,ctx,override={}){
 const s=clean(txt);if(!s||s.length>1200||/^https?:|past performance|no assurance|sources?:/i.test(s))return;
 if(!override.k&&w.ReportIntel?.special?.(s))return;
 const gs=groupsOf(s),g=override.g||gs[0]||ctx.group||'';if(!g)return;
 if(!override.g&&gs.filter(x=>!['vol','market'].includes(x)).length>1){if(/\d/.test(s))addUnresolved(b,row.page,s,'Più strategie nella stessa frase');return;}
 const k=override.k||metricOf(s,g);if(!k)return;
 if(k==='trigger'&&!override.numText&&!/(?:level|trigger|threshold|soglia)\s*(?:is|at|of|level)?\s*[:=]?\s*\d/i.test(s))return;
 if(/\b(?:not|didn't|no longer|instead of|did not|never|up to|at least|between|from .+ to |compared (?:with|to)|versus|last year|previously|a year ago|year ago)\b/i.test(s)||/\d\s*[-–]\s*\d\s*%/.test(s)){if(/\d/.test(s))addUnresolved(b,row.page,s,'Intervallo, confronto o negazione');return;}
 const numText=override.numText??s;let ns=numbers(numText).filter(n=>compatible(k,n));
 if(metrics[k][1]==='points'&&!override.numText)ns=ns.filter(n=>!/(?:S&P|NASDAQ-|Russell )\s*$/i.test(s.slice(0,n.index))&&!/^(?:d|w|m| day| week| month| year)/i.test(s.slice(n.end))&&!/^\d{4}-\d\d-\d\d/.test(s.slice(n.index)));
 if(!override.numText&&k==='vix'&&/\b(?:briefly|intraday high|touched|hit|peaked|massimo)\b/i.test(s))return addUnresolved(b,row.page,s,'Livello intraday citato');
 if(!ns.length){if(/\d/.test(s)&&!override.quiet)addUnresolved(b,row.page,s,'Unità o misura non riconosciuta');return;}
 if(ns.length!==1){addUnresolved(b,row.page,s,'Più valori per una misura');return;}
 const a=ns[0];if(!override.numText&&/\d/.test(s.slice(0,a.index))&&metrics[k][1]==='money'&&!override.mode&&/from|versus|vs\.?|previous/i.test(s))return addUnresolved(b,row.page,s,'Valore storico e corrente da separare');
 if(!override.numText&&/\b(?:up|down|increase[ds]?|decrease[ds]?|rose|fell|change[ds]?|delta)\s+(?:by\s+)?[+-]?[$\d]/i.test(s)&&!['flow','cashflow'].includes(k))return addUnresolved(b,row.page,s,'Variazione distinta dal livello');
 makeFact(b,row,g,k,a,override.source||s,ctx,override);
}
function parsePage(b,page,raw,{ocr=false,filename=''}={}){
 const lines=raw.map(clean).filter(Boolean);b.pages=Math.max(b.pages,page);if(ocr)b.ocrPages++;b.pageKeys=new Set();
 const heading=lines.slice(0,15).join(' '),prov=lines.slice(0,8).map(s=>/^publisher|^issued by|^emittente/i.test(s)?providerOf(s):'').find(Boolean)||providerOf(heading)||providerOf(lines.at(-1)||''),pub=publication(lines),subject=lines.slice(0,12).find(x=>/^subject\s*:/i.test(x)),marquee=lines.slice(0,3).some(s=>/Market Insights\s*-\s*Marquee/i.test(s));
 const changed=!b.segment||subject&&subject!==b.segment.title||marquee&&!b.segment.marquee||prov&&b.segment.provider&&prov!==b.segment.provider||pub&&b.segment.day&&pub.day!==b.segment.day;
 if(changed){newSegment(b,page,prov||(!b.segment?providerOf(filename):''),pub);b.segment.title=subject||'';b.segment.marquee=marquee;}
 else {if(!b.segment.provider&&prov)b.segment.provider=prov;if(!b.segment.pub&&pub)Object.assign(b.segment,{pub:pub.ms,day:pub.day,precision:pub.precision});}
 b.segment.end=page;const ctx=b.ctx;ctx.table=null;
 for(const s of lines){const row={page,ocr};if(/^(?:source|past performance|https?:)/i.test(s))continue;
 if(/^(?:data\s+as (?:of|at)|as (?:of|at)|observation date)\s*[:-]?\s*\d/i.test(s)){ctx.asof=dateIn(s)?.day||'';continue;}
 if(/^\d+[.)]\s+[a-z]/i.test(s))ctx.major=groupsOf(s)[0]||'';
 if(/^\d+[.)]\s+[a-z]/i.test(s)&&!groupsOf(s).length){ctx.group='';ctx.scope='UNKNOWN';ctx.horizon='';ctx.table=null;}
 const gs=groupsOf(s),scp=scopeOf(s),h=horizonOf(s),cells=s.split(/\t+|\s*\|\s*/).map(x=>x.trim()).filter(Boolean);
 if(cells.length>=2){
  const hs=cells.slice(1).map(x=>({label:x,k:metricOf(x,gs[0]||ctx.group||'cta'),h:horizonOf(x),sc:scenarioOf(x)}));
  if(hs.every(x=>x.k||x.sc)&&hs.every(x=>!numbers(x.label).some(n=>n.kind==='money'))&&!hs.some(x=>/\d\s*(%|[x×])/.test(x.label))){ctx.table=hs;continue;}
  if(ctx.table&&ctx.table.length===cells.length-1){const g=groupsOf(cells[0])[0]||ctx.group;if(g){for(let i=1;i<cells.length;i++){const col=ctx.table[i-1],unit=col.label.match(/(?:USD|EUR|GBP)\s*(?:bn|mn|mm|billion|million)?|percentile|\(%\)|\(x\)/i)?.[0]||'';
   let val=cells[i];if(/^\(?[+-]?[\d,.]+\)?$/.test(val)&&unit){if(/USD|EUR|GBP/i.test(unit))val=val.replace(/([\d,.]+)/,(_,n)=>unit.slice(0,3)+' '+n+' '+unit.slice(3));else val+=unit.replace(/[()]/g,'');}
   if(/^\([\d.,$€£A-Z +\-]+\)$/i.test(val))val='-'+val.slice(1,-1);
   parseOne(b,row,cells[0]+' · '+col.label+' · '+val,ctx,{g,k:col.k||'flow',numText:val,source:cells[0]+' | '+col.label+' | '+cells[i],scope:scopeOf(cells[0])==='UNKNOWN'?ctx.scope:scopeOf(cells[0]),mode:col.sc?'scenario':undefined,scenario:col.sc,horizon:col.h||ctx.horizon,signText:val});}continue;}}
 }else ctx.table=null;
 const scen=scenarioOf(s),rub=s.match(/(?:flat|up|down) tape\s*:\s*([^()]+)\(\s*([^()]*?)(?:\s+out (?:of )?(?:the )?|\s+in (?:the )?|\s+in )US\s*\)/i);
 if(rub&&(ctx.major==='cta'||ctx.group==='cta')){const cur=ctx.horizon;for(const [j,scope] of [[1,ctx.scope==='GLOBAL'?'GLOBAL':'TOTAL'],[2,'US']])parseOne(b,row,s,ctx,{g:'cta',k:'flow',numText:rub[j],signText:rub[j],mode:'scenario',scenario:scen,horizon:cur,scope});continue;}
 const isHeading=s.length<135&&!numbers(s).some(n=>n.kind!=='number')&&!/(?:threshold|trigger|level)\s*(?:=|:)|\b(?:at|was|is)\s+[+-]?\d|\b(?:sources?|estimat)\w*:/i.test(s);
 if(isHeading&&gs[0]==='cta'&&/CTA (?:downside|upside|asymmetric|position|threshold|exposure)/i.test(s))ctx.group='cta';
 if(isHeading&&gs.length===1&&!/\b(?:are|were|would|should)\b/i.test(s)){if(ctx.group!==gs[0]){ctx.horizon='';ctx.scope='UNKNOWN';ctx.asof='';}ctx.group=gs[0];if(scp!=='UNKNOWN')ctx.scope=scp;}
 if(isHeading&&/\b(?:over|for|during) the next\b/i.test(s)&&h)ctx.horizon=h;
 if(isHeading&&scp!=='UNKNOWN'&&/^(?:universe|scope|asset class|perimeter|market)\s*[:|]/i.test(s))ctx.scope=scp;
 if(!gs.length&&!ctx.group&&!scen)continue;
 for(const clause of s.split(/;\s*|\s+\u2022\s+/))parseOne(b,row,clause,ctx);
 }
 return b;
}
w.InstCore={metrics,groups,scopes,modes,book,parsePage,clean,dateIn,instant,allowed,horizonOf,scopeOf,metricOf,numbers,DAY};
})(typeof window==='undefined'?globalThis:window);

