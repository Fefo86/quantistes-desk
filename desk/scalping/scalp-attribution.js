
(function(w){
'use strict';
const F=Number.isFinite,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ts=v=>F(v)?v:typeof v==='string'?Date.parse(v):NaN;
const date=t=>F(t)?new Date(t).toISOString().slice(0,19).replace('T',' ')+' UTC':'—';
const num=x=>F(x)?x.toLocaleString('it-IT',{maximumFractionDigits:2}):'—';
let snapshot=null;
function at(cut){
 if(!F(cut)||!w.ScalpSources?.at||!w.ScalpEngine?.analyze)return null;
 const rev=w.ScalpSources.revision();
 if(snapshot?.cut===cut&&snapshot.rev===rev)return snapshot.value;
 const packs=w.ScalpSources.at(cut),books=[];
 for(const p of packs){
  if(p.mode!=='observed')continue;
  const eligible=p.frames.filter(f=>ts(f.ts)<=cut&&ts(f.availableAt??f.ts)<=cut);
  if(!eligible.length)continue;
  const last=eligible.reduce((a,b)=>ts(a.ts)>ts(b.ts)||(ts(a.ts)===ts(b.ts)&&ts(a.availableAt??a.ts)>ts(b.availableAt??b.ts))?a:b);
  const fresh=cut-ts(last.ts)<=5*60000;
  const proof=fresh&&last.regimeVerified===true&&(last.perspective||p.perspective)==='dealer';
  const book={id:p.id,label:p.label||p.id,source:p.source||p.id,kind:p.kind,expiry:p.expiry,asof:ts(last.ts),availableAt:ts(last.availableAt??last.ts),fresh,full:!!proof,
   n:last.rows?.length||0,confirmed:0,watch:0,cases:0,levels:[],regime:null};
  if(fresh){
   const result=w.ScalpEngine.analyze(p,{cutoff:cut,ds:1,div:0,dt:1,band:.5,maxAgeMinutes:5});
   if(!result.ok||result.reason||result.clockMissing||result.stale||!result.observed||ts(result.asof)>cut||ts(result.availableAt)>cut){
    book.fresh=false;book.full=false;book.unavailable=result.reason||'Lettura inutilizzabile';
   }else{
    book.regime=result.regime;book.n=result.rows.length;
    if(result.clockMissing){book.full=false;book.unavailable=result.reason;}
    for(const row of result.rows){
     if(row.caseId)book.cases++;
     if(row.status==='osservazione')book.watch++;
     if(!proof||!row.caseId||!['LONG','SHORT'].includes(row.direction)||row.status!=='confermato')continue;
     book.confirmed++;
     book.levels.push({strike:row.strike,esStrike:F(row.esStrike)?row.esStrike:null,signal:row.direction,pattern:row.pattern,caseId:row.caseId,caseBasis:row.caseBasis,trigger:row.trigger,invalidation:row.invalidation,
       distance:F(result.spot)&&F(row.strike)?Math.abs(row.strike-result.spot):null});
    }
    book.levels.sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity)||a.strike-b.strike);
   }
  }
  books.push(book);
 }
 books.sort((a,b)=>Number(b.fresh)-Number(a.fresh)||Number(!!b.confirmed)-Number(!!a.confirmed)||Number(b.full)-Number(a.full)||b.asof-a.asof||String(a.label).localeCompare(String(b.label)));
 const live=books.filter(b=>b.fresh),primary=live[0],signals=live.flatMap(b=>b.levels),directions=new Set(signals.map(s=>s.signal));
 const uniqueStrikes=new Set(signals.map(s=>s.strike)).size;
 const role=signals.length?'Conferma tattica per strike':live.length?'Contesto tattico':'In attesa';
 const value={cut,n:live.length,books,role,direction:directions.size===1?[...directions][0]:null,
  text:!primary?books.length?(books[0].unavailable||'Ultimo flusso oltre 5 min'):'Flussi per strike in attesa':signals.length?uniqueStrikes+(uniqueStrikes===1?' strike con test del prezzo confermato':' strike con test del prezzo confermati'):live.length+(live.length===1?' perimetro coevo':' perimetri coevi')+' · '+primary.n+' strike nel primo perimetro',
  origin:primary?primary.label+' · '+date(primary.asof):books.length?date(books[0].asof):'Option flow · ora ES',
  detail:signals.length?'Ogni conferma appartiene al proprio strike e perimetro. La probabilità ES viene stimata sul suo storico.':'Servono posizione dealer, pressioni comparabili e sequenza di prezzo per confermare un pattern. Orizzonte tattico di freschezza: 5 minuti.'};
 snapshot={cut,rev,value};return value;
}
function open(cut,id,strike){
 const sourceId=id||at(cut)?.books?.[0]?.id;
 if(w.OADashboard?.openScore){w.OADashboard.openScore(cut,sourceId,strike);return;}
 if(sourceId&&w.ScalpUI?.openAt)w.ScalpUI.openAt(sourceId,cut,strike);
 else w.QuantistesFlatDesk?.go('scalp','scalp-indicator');
}
let rendered='';
function render(cut,decision){
 const el=document.getElementById('deskScalpTape');if(!el)return;
 const state=at(cut);el.hidden=!state?.n;if(el.hidden){rendered='';el.textContent='';return;}
 const payload=JSON.stringify([state,decision]);if(rendered===payload)return;
 rendered=payload;
 const active=state.books.filter(b=>b.fresh),action=active.flatMap(b=>b.levels.map(l=>({...l,id:b.id}))),signal=state.direction;
 const title=action.length?(signal?(decision==='LONG'||decision==='SHORT'?signal===decision?'Concorde con il bias ES':'In divergenza dal bias ES':'Conferma locale '+signal):'Direzioni diverse per strike'):'In osservazione';
 el.innerHTML='<header class="ds-tape-head"><h2>Conferme per strike</h2><b>'+esc(title)+'</b><span>'+esc(state.text)+'</span></header><div class="ds-tape">'+active.map(b=>{
  const link='<button type="button" data-sbook="'+esc(b.id)+'">Apri perimetro ↗</button>';
  return '<section><div><b>'+esc(b.label)+'</b> <small>'+esc(date(b.asof))+'</small>'+link+'</div><p>'+esc(b.n+' strike · '+b.cases+' casi classificati · '+b.confirmed+' test confermati')+(b.unavailable?' · '+esc(b.unavailable):'')+'</p>'+
   b.levels.slice(0,4).map(l=>'<button type="button" data-sbook="'+esc(b.id)+'" data-sstrike="'+esc(l.strike)+'">'+esc(l.caseId+' · '+num(l.strike)+' SPX · '+l.signal+' · '+l.pattern)+'</button>').join('')+'</section>';}).join('')+'</div>';
 el.onclick=e=>{const b=e.target.closest('[data-sbook]');if(b)open(cut,b.dataset.sbook,b.hasAttribute('data-sstrike')?Number(b.dataset.sstrike):undefined);};
}
w.ScalpAttribution=Object.freeze({at,open,render});
})(window);

