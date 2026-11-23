
(function(w){
'use strict';
const F=Number.isFinite;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>F(n)?new Intl.NumberFormat('it-IT',{maximumFractionDigits:2}).format(n):'—';
const factor=cg=>!cg?null:cg==='NEG SYN'||cg==='NEG STRONG'?300:cg==='MOD SYN'||cg==='STRONG SYN'?250:200;
const nativeUnit=(s,k)=>String(s||'').trim().toLowerCase()==='oa '+k;
const sign=x=>F(x)?Math.sign(x):null;
const side=(x,s)=>!F(s)?null:x>s?'above':x<s?'below':'at';
function fit(rows,key){
 const b=[];
 for(const r of [...rows].filter(r=>r[key]&&F(r.gamma)).sort((a,b)=>a.gamma-b.gamma)){
  const last=b.at(-1);if(last?.label===r[key]){last.hi=r.gamma;last.n++;}else b.push({lo:r.gamma,hi:r.gamma,label:r[key],n:1});
 }
 return b;
}
function read(b,x){
 if(!F(x))return null;
 const hits=b.filter(z=>z.lo<=x&&x<=z.hi);
 return hits.length===1?hits[0].label:null;
}
function inferred(rows,g,c,zone,k){
 if(!F(g))return {};
 const tag=read(fit(rows,'gTag'),g),cg=F(c)&&c!==0?read(fit(rows.filter(r=>sign(r.charm)===sign(c)),'cg'),g):null;
 const subset=rows.filter(r=>r.cg===cg&&side(r.price,k)===zone);
 return {tag,cg,trade:read(fit(subset,'trade'),g),dealer:read(fit(subset,'dealerAction'),g)};
}
function intervals(gamma,charm,cg){
 const m=factor(cg),g=F(gamma)?[80*Math.min(Math.abs(gamma),Math.abs(gamma-1)),80*Math.max(Math.abs(gamma),Math.abs(gamma-1))]:null;
 if(gamma===0&&g)g[0]=0;
 return {g,c:F(charm)&&m?[-m*charm,m*(1-charm)]:null};
}
let stats=null;
function audit(){
 if(stats)return stats;
 const ref=w.OAReference,rows=ref.rows,totals={cpt:0,g:0,c:0,flip:0,nFlip:0,loo:{gTag:[0,0],cg:[0,0],trade:[0,0],dealerAction:[0,0]}};
 for(let i=0;i<rows.length;i++){
  const r=rows[i],up=rows[i-1],range=intervals(r.gamma,r.charm,r.cg);
  if(Math.abs(r.gamma/5-r.cpt)<1e-9)totals.cpt++;
  if(r.esgFlow>=range.g[0]-.5&&r.esgFlow<=range.g[1]+.5)totals.g++;
  if(r.escFlow>=range.c[0]-.5&&r.escFlow<=range.c[1]+.5)totals.c++;
  if(up){const flip=sign(up.charm)!==sign(r.charm)?(up.charm>0?'FLIP↑':'FLIP↓'):null;if(flip===r.flip&&r.alert===(flip?'INFLECT':null))totals.flip++;if(flip)totals.nFlip++;}
  const leave=rows.filter((_,j)=>j!==i),v=inferred(leave,r.gamma,r.charm,side(r.price,ref.priceSpot),ref.priceSpot);
  for(const [key,target] of [['tag','gTag'],['cg','cg'],['trade','trade'],['dealer','dealerAction']])if(v[key]!=null){totals.loo[target][1]++;if(v[key]===r[target])totals.loo[target][0]++;}
 }
 return stats={...totals,n:rows.length,bands:fit(rows,'gTag')};
}
const profileRules={
 price:'Strike nella coordinata selezionata.',
 gamma:'Gamma e CPT nella convenzione della cattura. Il CPT è Γ visualizzata / 5. La scala OA va dichiarata esplicitamente.',
 charm:'Charm espresso nella convenzione della cattura.',
 esgFlow:'Stima della colonna originale: 80 × |Γ| in unità OA. Il valore originale conserva la precisione interna.',
 escFlow:'Stima −m × Charm in unità OA. In questa cattura m è compatibile con 300 per NEG SYN/STRONG, 250 per MOD/STRONG SYN positivi, 200 nelle altre classi osservate.',
 gTag:'Intervalli di Γ in cui le righe della cattura condividono la classe. Le zone tra le soglie osservate restano aperte.',
 velocity:'La velocità del modello Quantistes confronta due finestre consecutive. Il riferimento contiene un solo istante.',
 flip:'Cambio di segno dello charm, attribuito allo strike minore della coppia. Direzione data dal segno dello charm sullo strike superiore.',
 cg:'Classe dedotta dal segno di Charm e dagli intervalli di Γ osservati a pari segno.',
 alert:'INFLECT accompagna un cambio di segno dello charm nella tabella di riferimento.',
 trade:'Etichetta della cattura applicata entro gli intervalli osservati a parità di C/G e lato dello spot. È un setup in osservazione.',
 dealerAction:'Descrizione della cattura entro le combinazioni osservate. Il dettaglio del desk fornisce la copertura teorica in ES.'
};
function apply(model,pack,frame,out,opts={}){
 if(!model||model.mode!=='model')return model;
 const ref=w.OAReference,cut=opts.cutoff??model.availableAt,earlier=F(cut)&&cut<Date.parse(ref.availableAt);
 const eligibleTime=!earlier||pack.mode!=='observed';
 const rawUnit=nativeUnit(frame.units?.gamma,'gamma')&&nativeUnit(frame.units?.charm,'charm');
 const separate=pack.oaCompatible===true;
 const comparable=(separate||rawUnit||opts.nativeScale===true)&&eligibleTime&&frame.perspective==='dealer';
 const raw=new Map(frame.rows.map(r=>[r.strike,r]));
 const rows=model.rows.map(r=>{
  const v=raw.get(r.strike??r.price),g0=separate?v?.oaGamma:v?.gamma,c0=separate?v?.oaCharm:v?.charm;
  const g=F(g0)?Math.ceil(g0):null,c=F(c0)?Math.ceil(c0):null;
  const zone=side(r.price,model.spot);
  const p=comparable?inferred(ref.rows,g,c,zone,ref.priceSpot):{};
  const blocked=model.stale||r.status==='sospeso'||out.clockMissing||frame.perspective!=='dealer';
  const m=factor(p.cg);
  const reason=!eligibleTime?'Il cutoff precede la disponibilità della cattura.':!comparable?'Scala e segni OA da dichiarare. I punti greci operativi restano leggibili nel profilo Quantistes.':!p.trade?'La cattura non identifica univocamente questa classe/lato/intervallo.':'Regola osservata nella cattura. Richiede un test del prezzo.';
  return {...r,gamma:comparable?g:r.gamma,charm:comparable?c:r.charm,cpt:comparable&&F(g)?g/5:null,
   esgFlow:comparable&&F(g0)?Math.round(80*Math.abs(g0)):null,escFlow:comparable&&m&&F(c0)?Math.round(-m*c0):null,
   gTag:p.tag||null,cg:p.cg||null,trade:blocked?null:p.trade||null,dealerAction:blocked?null:p.dealer||null,tradeColor:null,status:blocked?'sospeso':'osservazione',
   detail:reason+(comparable?' ESGFlow e ESCFlow sono stime nella scala OA.':'')+(p.dealer?' La voce Dealer Action è un’etichetta OA dedotta. Copertura Quantistes al medesimo strike: '+(r.dealerAction||'non disponibile')+'.':'')};
 });
 rows.sort((a,b)=>b.price-a.price);
 for(let i=0;i<rows.length;i++){
  const r=rows[i],hi=rows[i-1],a=hi?.charm,b=r.charm;
  const known=eligibleTime&&F(a)&&F(b)&&a!==0&&b!==0&&(comparable||frame.charmClock==='calendar_elapsed'&&frame.perspective==='dealer');
  r.flip=known&&sign(a)!==sign(b)?(a>0?'FLIP↑':'FLIP↓'):null;r.alert=r.flip&&r.status!=='sospeso'?'INFLECT':null;
  if(!eligibleTime||r.status==='sospeso')r.velocity=null;
 }
 return {...model,rows,profile:'inferred',nativeScale:comparable,rules:{...model.rules,...profileRules},
  notes:['Profilo dedotto dalle 48 righe del 12/11/2025. I pannelli e la velocity usano il modello Quantistes. Le etichette Trade sono ipotesi da verificare al prezzo.',
   !eligibleTime?'Riferimento pubblicato dopo questo cutoff: classificazioni dedotte sospese.':earlier?'Esercizio retrospettivo su dati dimostrativi precedenti alla cattura.':comparable?'Calcolo nella scala OA dichiarata. Gli intervalli privi di osservazioni sono lasciati aperti.':'Le quantità del feed richiedono unità e convenzione di segno compatibili con la cattura per usare le soglie numeriche.']};
}
function describe(model,row){
 if(!model||!w.OAReference)return '';
 const a=audit(),ref=w.OAReference,loo=k=>{const z=a.loo[k];return z[0]+' / '+z[1]+' classificati su '+a.n;};
 const current=model.mode==='reference'&&row?intervals(row.gamma,row.charm,row.cg):null;
 const it=v=>v.map(fmt).join(' … ');
 const mark=x=>'<li>'+x+'</li>';
 return '<details class="oa-inference"><summary>Formule e verifica sulle 48 righe</summary><ul>'+
 mark('<b>Gamma/CPT.</b> Γ / 5 riproduce '+a.cpt+' valori su '+a.n+'.')+
 mark('<b>ESGFlow.</b> 80 × |Γ| riproduce la scala. Tutti i '+a.g+' valori cadono nell’intervallo compatibile con Γ arrotondata per eccesso.')+
 mark('<b>ESCFlow.</b> −m × Charm. La classe C/G identifica tre coefficienti osservati: 200, 250 e 300. Gli intervalli comprendono '+a.c+' valori su '+a.n+'.')+
 mark('<b>Flip / Alert.</b> Il cambio di segno dello charm è attribuito allo strike minore. '+a.flip+' / '+(a.n-1)+' coppie, '+a.nFlip+' alert INFLECT.')+
 (row?.dealerAction&&/short gamma.*sell rallies|short delta.*sell into any bounce/i.test(row.dealerAction)?mark('La frase Dealer Action riprende la classificazione OA. A neutralità delta, per il solo contributo gamma vale ΔH ≈ −Γ × ΔS. Con gamma corta, un rialzo implica acquisti di copertura. Il segno del delta da solo non stabilisce la reazione al rimbalzo.'):'')+
 mark('<b>G-Tag.</b> '+a.bands.map(x=>esc(x.label)+' da '+fmt(x.lo)+' a '+fmt(x.hi)).join(' · ')+'. Intervalli osservati, espressi in unità OA.')+
 mark('<b>Classificazione a turno escluso.</b> Ogni riga viene esclusa prima di stimarne la classe sulle altre 47. Risultati corretti / assegnati: G-Tag '+loo('gTag')+', C/G '+loo('cg')+', Trade '+loo('trade')+'. Le righe indeterminate restano in attesa. È una verifica trasversale su un solo orario.')+
 (current?mark('<b>Strike '+fmt(row.price)+' '+esc(ref.coordinate)+'.</b> CPT '+fmt(row.gamma)+' / 5 = '+fmt(row.cpt)+'. Intervallo ESGFlow '+it(current.g)+', ESCFlow '+it(current.c)+' con m = '+factor(row.cg)+'. Γ implicita da ESGFlow '+fmt(Math.sign(row.gamma)*row.esgFlow/80)+', Charm implicito da ESCFlow '+fmt(-row.escFlow/factor(row.cg))+'.'):'')+
 '</ul></details>';
}
w.OAProfile=Object.freeze({apply,describe,audit,intervals});
})(window);

