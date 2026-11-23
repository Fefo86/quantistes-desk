
(function(root){
'use strict';
const by=id=>document.getElementById(id),Q=root.QuantCore,E=root.QuoteTailEnvelope,C=root.TailCompletion;
const dec=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—',pct=(p,n=4)=>Number.isFinite(p)?dec(100*p,n)+'%':'—';
const esc=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
const table=(headers,rows)=>'<div class="tablewrap"><table><thead><tr>'+headers.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const put=(id,s)=>{by(id).textContent=s;},markup=(id,s)=>{by(id).innerHTML=s;};
let saved=null,active=null;
function clearStress(){if(saved)saved.completion=null;put('tbStressStatus','');markup('tbStressRows','');}
function clear(){saved=null;active=null;put('tbStatus','');markup('tbRows','');markup('tbVariance','');clearStress();by('tbExport').disabled=true;}
function input(){const desk=root.Desk;if(desk.state.stale||!desk.state.result?.ws)throw Error('Calcola una curva aggiornata nel desk.');const r=desk.state.result;if(r.quality?.level==='red')throw Error('Qualità del fit insufficiente; consulta la qualità delle quotazioni.');return r;}
function run(){
 clear();const r=input(),mode=by('tbBook').value,raw=root.Desk.state.parsed?.rows||[],qset=E.quoteSet(r,raw,mode);
 const levels=r.ws.levels.filter(l=>l.z!==0).map(l=>{const tail=Q.Phi(-Math.abs(l.z)),p=l.z<0?tail:1-tail;return {z:l.z,p,tail,native:l.z<0?r.ws.model.quantile(tail):r.ws.model.isf(tail)};});
 const b=E.analyze(qset.quotes,qset.F,qset.D,levels);active={r,qset,levels};saved={format:'quantistes-tail-constraints-v1',asof:r.cfg.asof,expiry:r.cfg.expiry,fixing:r.cfg.expiryTime,root:r.cfg.symbol,forwardSource:r.forward.source,forward:qset.F,discount:qset.D,coordinate:'native_expiry',maxAgeSeconds:r.cfg.maxAge,
 quoteSet:mode,files:root.Desk.state.files.map(v=>v.name),baseQuality:r.quality?.level,bounds:b,modelLevels:levels,completion:null};
 by('tbExport').disabled=false;
 if(!b.ok){put('tbStatus','Verifica sospesa. '+b.reason+(b.worstGap!=null?' Scarto richiesto almeno in questo controllo '+dec(b.worstGap,5)+' punti allo strike '+dec(b.strike)+'.':''));return;}
 put('tbStatus',b.quoteCount+' quote, '+b.strikes+' strike da '+dec(b.loStrike)+' a '+dec(b.hiStrike)+' · forward '+dec(b.F)+' ('+r.forward.source+') · '+b.atomCount+' masse nella distribuzione di controllo · massimo scarto dai bid/ask '+b.maxQuoteError.toExponential(2)+' punti.');
 markup('tbRows',table(['z equivalente','Coda nominale','Livello Q nativo','Limite inferiore da quote','Limite superiore da quote','Ampiezza','Livello entro limiti'],b.levels.map((v,i)=>[dec(v.z,2),pct(levels[i].tail,5),dec(levels[i].native),dec(v.lo),dec(v.hi),v.ok?dec(v.hi-v.lo):'—',v.ok?(levels[i].native>=v.lo-1e-6&&levels[i].native<=v.hi+1e-6?'Sì':'Fuori'):'Verifica sospesa'])));
 const z=b.variance;
 markup('tbVariance',table(['Deviazione standard cash nativa','Punti'],[['Limite inferiore ricavato dai bid',dec(z.sdFloor)],['Mark CVI del desk',dec(r.ws.model.info.sd)],['Distribuzione discreta di controllo',dec(z.witnessSD)],...(z.rightTailFree?[['Stesse quote, ultima massa allontanata',dec(z.stretchSD)]]:[])]));
 if(z.rightTailFree)by('tbVariance').innerHTML+='<p>La costruzione conserva tutti i prezzi osservati e permette di aumentare arbitrariamente il secondo momento. Da queste quote e dal solo forward non segue un limite superiore finito per σ.</p>';
 else by('tbVariance').innerHTML+='<p>Questo test non determina un limite superiore per la deviazione standard.</p>';
}
function stress(){
 const r=input();if(!active||active.r!==r)run();if(!active)throw Error('Verifica prima lo snapshot.');
 clearStress();const {qset,levels}=active,selected=root.DistributionUI.getState();
 const q=selected.valid&&selected.bundle?.settings.coordinate==='native'?selected.bundle.q:root.DistributionCore.build(r,{coordinate:'native'}).q;
 const s=C.make(r,q,Number(by('tbShape').value),Number(by('tbMix').value)),z=C.review(s,qset.quotes,levels);saved.completion=z;
 put('tbStressStatus','Raccordi '+dec(s.L)+' / '+dec(s.U)+' · massa sinistra '+pct(z.pLower)+' / destra '+pct(z.pUpper)+' · rapporto densità esterna/interna '+dec(z.leftDensityRatio,3)+' / '+dec(z.rightDensityRatio,3)+'. Deviazione standard dello scenario '+(z.finiteVariance?dec(z.sd)+' punti':'infinita')+' · '+z.within+' / '+z.total+' prezzi dello scenario entro i bid/ask selezionati, massimo sforamento '+dec(z.maxOutside,5)+' punti.');
 markup('tbStressRows',table(['z equivalente','Coda','Livello Q nativo','Livello con ali alternative','Differenza punti','Media oltre soglia · scenario'],z.levels.map((v,i)=>[dec(v.z,2),pct(v.tail,5),dec(levels[i].native),dec(v.level),dec(v.level-levels[i].native),dec(v.conditionalMean)])));
}
by('tbRun').onclick=()=>{try{run();}catch(e){put('tbStatus',e.message);}};
by('tbStress').onclick=()=>{try{stress();}catch(e){put('tbStressStatus',e.message);}};
by('tbBook').onchange=clear;for(const id of ['tbMix','tbShape'])by(id).onchange=clearStress;
by('tbExport').onclick=()=>{try{if(!saved||active?.r!==input())throw Error('Aggiorna il calcolo prima dell’export.');
 const blob=new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='Quantistes_code_'+saved.root+'_'+saved.expiry+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){put('tbStatus',e.message);}};
by('tbOpen').onclick=()=>root.Desk.tab('tailbook');
root.addEventListener('quantistes:research-stale',e=>{if(e.detail?.all)clear();});
root.addEventListener('quantistes:distribution',e=>{if(active&&e.detail?.result!==active.r)clear();});
})(globalThis);
