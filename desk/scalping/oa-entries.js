
(function (w) {
'use strict';
const CARD='OA Quick Entry Card';
const GUIDE='SPX Dashboard User Guide';
const empty='Non precisato nella fonte.';
const roles={above:'Resistenza sopra il prezzo',below:'Supporto sotto il prezzo',at:'Prezzo sul livello',unknown:'Posizione da verificare'};
const finite=Number.isFinite;
const fmt=x=>x.toLocaleString('it-IT',{maximumFractionDigits:4});
function cfg(id,code,label,side,trigger,stop,target,size,page,extra={}){
 return Object.freeze({id,code,label,side,trigger,stop,target,size,source:(page?CARD+' · p. '+page:GUIDE+' · appendice'),...extra});
}
const catalog=Object.freeze([
 cfg('premium-above','PREMIUM SCALP','Premium · resistenza','SHORT','Attendere la risalita allo strike e la reiezione del prezzo.','3–5 pt sopra lo strike.','10–15 pt verso il supporto.','100%',1,{stopFrom:'strike',stopSign:1,stopPts:[3,5],targetPts:[10,15]}),
 cfg('premium-below','PREMIUM SCALP','Premium · supporto','LONG','Attendere il pullback sullo strike e un rimbalzo.','3–5 pt sotto lo strike.','10–15 pt verso la resistenza.','100%',1,{stopFrom:'strike',stopSign:-1,stopPts:[3,5],targetPts:[10,15]}),
 cfg('premium-shortgamma','PREMIUM SCALP','Premium · gamma negativa','CON IL MOMENTUM','Attendere un movimento direzionale confermato. Il lato segue il movimento osservato.','8–12 pt.','Lasciare correre la posizione. La scheda prevede un’uscita aperta.','60–80%',3),
 cfg('buydip-below','BUY DIP SCALP','Buy dip · supporto','LONG','Attendere il ritorno sullo strike seguito dal rimbalzo.','5–8 pt sotto lo strike.','15–20 pt verso la resistenza.','100%',1,{stopFrom:'strike',stopSign:-1,stopPts:[5,8],targetPts:[15,20]}),
 cfg('buydip-above','BUY DIP SCALP','Buy dip · breakout','LONG','Attendere la rottura sopra lo strike e il primo pullback.','Rientro sotto lo strike.','20–40 pt verso la resistenza successiva.','60–80%',1,{targetPts:[20,40]}),
 cfg('fade','FADE SETUP','Fade su rialzo','SHORT','Attendere la risalita allo strike e l’inversione.','3–5 pt sopra lo strike.','10–15 pt verso il supporto.','50%',1,{stopFrom:'strike',stopSign:1,stopPts:[3,5],targetPts:[10,15]}),
 cfg('strong-fade','STRONG FADE','Fade forte su rialzo','SHORT','Attendere la risalita allo strike e l’inversione.','3–5 pt sopra lo strike.','15–20 pt verso il supporto.','70–80%',1,{stopFrom:'strike',stopSign:1,stopPts:[3,5],targetPts:[15,20]}),
 cfg('sell-bounce','SELL INTO ANY BOUNCE','Vendita del rimbalzo','SHORT','La scheda associa il setup a delta e gamma dealer negativi. Attendere un rimbalzo e conferma del prezzo.','5–8 pt sopra il prezzo d’ingresso.','10–20 pt verso il supporto successivo.','50–70%','1–2',{stopFrom:'entry',stopSign:1,stopPts:[5,8],targetPts:[10,20]}),
 cfg('flip-reversal','INFLECTION POINT','Flip · inversione','CON IL FLIP','Attendere il contatto con lo strike e l’inversione. Flip verso l’alto per il long, verso il basso per lo short.','5–10 pt oltre lo strike sul lato opposto al trade.','20–30 pt.','60–70%',2,{stopFrom:'strike',stopPts:[5,10],targetPts:[20,30]}),
 cfg('flip-breakout','INFLECTION POINT','Flip · breakout','CON LA ROTTURA','Attendere rottura con momentum e retest dello strike. Il lato segue la rottura.','Ritorno attraverso lo strike, con fallimento della rottura.','30–60 pt verso il livello principale successivo.','60–70%',2,{targetPts:[30,60]}),
 cfg('wall-above-fade','GAMMA WALL','Muro superiore · fade','SHORT','Sul rally, osservare la fascia a 5–10 pt dal muro. Confermare la reazione del prezzo.','5–8 pt oltre il muro.','20–30 pt.','80–100%',2,{stopFrom:'strike',stopSign:1,stopPts:[5,8],targetPts:[20,30]}),
 cfg('wall-above-break','GAMMA WALL','Muro superiore · breakout','LONG','Se il muro cede al rialzo, la scheda prevede il passaggio immediato long alla rottura.','La scheda assegna al muro un buffer di 5–8 pt e lascia implicito il lato dello stop per il breakout.','Muro successivo.','80–100%',2),
 cfg('wall-below','GAMMA WALL','Muro inferiore · rimbalzo','LONG','Sul pullback, osservare l’avvicinamento entro 5–10 pt dal muro e attendere il rimbalzo.','5–8 pt sotto il muro.','20–40 pt verso il centro del range.','80–100%',2,{stopFrom:'strike',stopSign:-1,stopPts:[5,8],targetPts:[20,40]}),
 cfg('scalp-plus','SCALP+','Scalp con conferma','LONG','Attendere il prezzo in prossimità dello strike e una conferma della price action.','5–8 pt oltre lo strike sul lato di invalidazione.','8–12 pt.','40–60%',2,{stopFrom:'strike',stopSign:-1,stopPts:[5,8],targetPts:[8,12]}),
 cfg('support-watch','SUPPORT WATCH','Supporto in osservazione','ATTESA','Monitorare il test del supporto e attendere confluenza con un altro segnale.','Da definire con il setup che conferma.','Da definire con il setup che conferma.','40–50% solo con altra conferma',2,{watch:true}),
 cfg('resistance-watch','RESISTANCE WATCH','Resistenza in osservazione','ATTESA','Monitorare il test della resistenza e attendere confluenza con un altro segnale.','Da definire con il setup che conferma.','Da definire con il setup che conferma.','40–50% solo con altra conferma',2,{watch:true}),
 cfg('support-pressure','SUPPORT PRESSURE','Pressione sul supporto','ATTESA','Osservare una possibile rottura del supporto. La guida descrive un avviso al livello.',empty,empty,'Non indicata.',null,{watch:true}),
 cfg('resistance-pressure','RESISTANCE PRESSURE','Pressione sulla resistenza','ATTESA','Osservare una possibile rottura della resistenza. La guida descrive un avviso al livello.',empty,empty,'Non indicata.',null,{watch:true}),
 cfg('scalp-dip','SCALP DIP','Acquisto moderato sul pullback','LONG','La guida descrive un acquisto moderato sul dip. Il trigger quantitativo è da specificare.',empty,empty,'Non indicata.',null,{watch:true}),
 cfg('strong-dir','STRONG DIR','Pressione direzionale','ATTESA','L’etichetta nello snapshot indica pressione direzionale. Lato e condizioni di ingresso richiedono una conferma indipendente.',empty,empty,'Non indicata.',null,{source:'Snapshot del 12/11/2025 · colonna Trade',watch:true})
]);
const byId=new Map(catalog.map(v=>[v.id,v]));
const norm=x=>String(x??'').trim().toUpperCase().replace(/[_-]+/g,' ').replace(/[^A-Z0-9+↑↓ ]+/g,' ').replace(/\s+/g,' ').trim();
function code(raw){
 const label=norm(raw);
 if(/^FLIP\s*[↑↓]/.test(label)||/INFLECT/.test(label))return 'INFLECTION POINT';
 if(label==='WALL'||label.includes('GAMMA WALL'))return 'GAMMA WALL';
 if(label.includes('BUY DIP'))return 'BUY DIP SCALP';
 if(label.includes('STRONG FADE'))return 'STRONG FADE';
 if(label.includes('FADE SETUP'))return 'FADE SETUP';
 if(label.includes('SCALP+'))return 'SCALP+';
 if(label.includes('PREMIUM SCALP'))return 'PREMIUM SCALP';
 if(label.includes('SELL INTO ANY BOUNCE'))return 'SELL INTO ANY BOUNCE';
 if(label.includes('STRONG DIR'))return 'STRONG DIR';
 return catalog.find(x=>label===x.code||label.endsWith(' '+x.code))?.code||null;
}
function direction(raw){
 const k=norm(raw);
 if(k.includes('↑')||['LONG','UP','UPWARD','RIALZO','FLIP UP'].includes(k))return 'LONG';
 if(k.includes('↓')||['SHORT','DOWN','DOWNWARD','RIBASSO','FLIP DOWN'].includes(k))return 'SHORT';
 return null;
}
function gammaSide(raw){
 if(finite(raw))return Math.sign(raw);
 const str=norm(raw);
 if(/SHORT GAMMA|GAMMA (NEGATIV[AO]|SHORT|CORT[AO])|NEGATIVE GAMMA/.test(str))return -1;
 if(/LONG GAMMA|GAMMA (POSITIV[AO]|LONG|LUNG[AO])|POSITIVE GAMMA/.test(str))return 1;
 return 0;
}
function relation(price,spot,approach){
 const a=norm(approach);
 if(['DA SOTTO','RESISTENZA','RESISTANCE','FROM BELOW'].includes(a))return 'above';
 if(['DA SOPRA','SUPPORTO','SUPPORT','FROM ABOVE'].includes(a))return 'below';
 if(!finite(price)||!finite(spot))return 'unknown';
 return price>spot?'above':price<spot?'below':'at';
}
function choose(label,pos,opts){
 if(label==='PREMIUM SCALP'){
  const g=gammaSide(opts.regime);
  if(g<0)return ['premium-shortgamma'];
  const normal=pos==='above'?['premium-above']:pos==='below'?['premium-below']:['premium-above','premium-below'];
  return g>0?normal:[...normal,'premium-shortgamma'];
 }
 if(label==='BUY DIP SCALP')return pos==='above'?['buydip-above']:pos==='below'?['buydip-below']:['buydip-below','buydip-above'];
 if(label==='GAMMA WALL')return pos==='above'?['wall-above-fade','wall-above-break']:pos==='below'?['wall-below']:['wall-above-fade','wall-above-break','wall-below'];
 return catalog.filter(x=>x.code===label).map(x=>x.id);
}
function priceBand(base,d,range){
 if(!finite(base)||!range||!finite(d)||!d)return null;
 const a=range.map(x=>base+d*x).sort((x,y)=>x-y);
 if(!a.every(finite))return null;
 return a;
}
function renderPlan(id,strike,opts){
 const p=byId.get(id);
 let side=p.side;
 if(id==='flip-reversal')side=direction(opts.flip)||p.side;
 if(id==='flip-breakout')side=direction(opts.breakDirection)||p.side;
 if(id==='premium-shortgamma')side=direction(opts.momentumDirection)||p.side;
 const d=side==='LONG'?1:side==='SHORT'?-1:null;
 const stopBase=p.stopFrom==='strike'?strike:p.stopFrom==='entry'?opts.entryPrice:null;
 const st=priceBand(stopBase,p.stopSign||(d?-d:null),p.stopPts);
 const tg=priceBand(opts.entryPrice,d,p.targetPts);
 return {...p,side,stopRange:st,targetRange:tg,status:p.watch?'Osservazione':'Attesa del trigger'};
}
const conflictNotes=Object.freeze([
 'La size è una percentuale della taglia base usata dall’autore. La scheda lascia aperti capitale, volatilità e limite di perdita per trade.',
 'I valori dettagliati di ciascun setup hanno priorità sul riepilogo della card. Nel riepilogo i muri ricevono 100%, i breakout 70–80% e Fade Setup e Scalp+ sono raggruppati al 50–70%.',
 'La card distingue la regola sul prezzo dalla pubblicazione dell’avviso. Un’etichetta Trade da sola non documenta un ingresso o un’esecuzione.'
]);
const regimeRules=Object.freeze([
 {label:'Gamma positiva',mechanism:'La scheda associa la copertura stabilizzante a vendite sui rialzi e acquisti sulle discese.',plan:'Fade sugli estremi del range, rimbalzo sul supporto o rifiuto della resistenza. La distanza generale dello stop è di 3–5 pt.'},
 {label:'Gamma negativa',mechanism:'La scheda associa la copertura amplificante ad acquisti sui rialzi e vendite sulle discese.',plan:'La guida privilegia il momentum. La vendita del rimbalzo è una tattica del trader. La distanza generale dello stop è di 8–12 pt con obiettivo aperto nei setup di momentum.'}
]);
function forTrade(trade,price,spot,opts={}){
 const label=code(trade);
 const pos=relation(price,spot,opts.approach);
 const planOpts={...opts,flip:opts.flip||trade};
 if(label==='PREMIUM SCALP'&&gammaSide(trade)<0)planOpts.regime='SHORT GAMMA';
 const variants=choose(label,pos,planOpts).map(id=>renderPlan(id,price,planOpts));
 const first=variants[0],single=variants.length===1;
 const related=[];
 if(label!=='INFLECTION POINT'&&(code(opts.alert)==='INFLECTION POINT'||direction(opts.flip)))related.push(...choose('INFLECTION POINT',pos,opts).map(id=>renderPlan(id,price,planOpts)));
 if(label!=='GAMMA WALL'&&code(opts.gTag)==='GAMMA WALL')related.push(...choose('GAMMA WALL',pos,opts).map(id=>renderPlan(id,price,planOpts)));
 const fixedSide=single?first.side:variants.length&&variants.every(v=>v.side===first.side)?first.side:'CONDIZIONALE';
 return {label:label||String(trade??'').trim()||'Segnale in attesa',side:!first?'ATTESA':fixedSide,relation:roles[pos],status:!first?'Scheda non disponibile':single?first.status:'Condizionale',trigger:single?first.trigger:first?'Scegli la variante compatibile con il test del livello.':'Attendere la conferma del prezzo al livello.',stop:single?first.stop:'—',target:single?first.target:'—',size:single?first.size:'—',variants,related,source:first?.source||GUIDE,notes:conflictNotes};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function detailsOf(p,coord){
 const range=r=>r?' · '+r.map(fmt).join(' – ')+(coord?' '+esc(coord):''):'';
 const target=(p.targetRange?' · dal prezzo d’ingresso dichiarato':'');
 return '<article class="oa-entry-rule"><header><b>'+esc(p.label)+'</b><strong>'+esc(p.side)+'</strong></header><p>'+esc(p.trigger)+'</p><dl><div><dt>Stop</dt><dd>'+esc(p.stop)+range(p.stopRange)+'</dd></div><div><dt>Obiettivo</dt><dd>'+esc(p.target)+range(p.targetRange)+target+'</dd></div><div><dt>Size di riferimento</dt><dd>'+esc(p.size)+'</dd></div></dl></article>';
}
function html(row,model,opts={}){
 const h=model?.panels?.header||model?.header||{};
 const price=finite(opts.price)?opts.price:row?.price;
 const spot=finite(opts.spot)?opts.spot:(finite(model?.spot)?model.spot:null);
 const regime=opts.regime??h.regime??model?.regime;
 const p=forTrade(row?.trade,price,spot,{...opts,regime,flip:opts.flip??row?.flip,gTag:opts.gTag??row?.gTag,alert:opts.alert??row?.alert});
 const coord=opts.coord||model?.coord||'';
 const reg=regimeRules.map(r=>'<div><strong>'+esc(r.label)+'</strong> '+esc(r.mechanism)+' '+esc(r.plan)+'</div>').join('');
 if(!row)return '<section class="oa-entry"><div class="oa-entry-grid">'+catalog.map(x=>detailsOf(x,'')).join('')+'</div><h3>Regimi di mercato</h3><div class="oa-entry-regimes">'+reg+'</div></section>';
 const title=finite(price)?'Strike '+fmt(price)+(coord?' '+esc(coord):''):'Strike n/d';
 let selected=p.variants.map(x=>detailsOf(x,coord)).join('');
 if(!p.variants.length)selected='<p>'+esc(p.trigger)+'</p>';
 const secondary=p.related.length?'<h4>Altri scenari per questo strike</h4><div class="oa-entry-grid">'+p.related.map(x=>detailsOf(x,coord)).join('')+'</div>':'';
 return '<section class="oa-entry"><header><h3>Condizioni di ingresso</h3><span>'+esc(p.relation)+'</span></header><div class="oa-entry-grid">'+selected+'</div>'+secondary+'<p class="oa-foot">Distanze in punti. Size relativa alla taglia base.</p></section>';
}
w.OAEntries=Object.freeze({catalog,regimeRules,forTrade,html});
})(window);

