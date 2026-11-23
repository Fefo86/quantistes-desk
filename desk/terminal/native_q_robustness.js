
/* Terminal Q sensitivity in cash coordinates. Keep the off-grid CDF exact:
   the density between two knots is linear and its integral is quadratic. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  const pct=n=>Number.isFinite(n)?(100*n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':'—';
  const fmt=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let active=null;
  function cdf(profile,k){
    if(profile.cvi)return CVILab.point({...profile.cvi.context,canonical:profile.cvi.canonical},Math.log(k/profile.cvi.context.F)).probBelow;
    const {prices,densities,cumulative}=profile;
    if(k<=prices[0])return 0;
    if(k>=prices.at(-1))return 1;
    let lo=0,hi=prices.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(k<prices[mid])hi=mid;else lo=mid;}
    const dx=k-prices[lo],width=prices[hi]-prices[lo];
    return Math.min(1,Math.max(0,cumulative[lo]+densities[lo]*dx+(densities[hi]-densities[lo])*dx*dx/(2*width)));
  }
function witnessProfiles(r,threshold){
  const box=el('stressWitness'),w=r.ws.cvi?.quantiles.find(v=>v.z===4)?.sameMarksWitness;box.hidden=!w;if(!w)return;
  el('stressWitnessResult').textContent='Stessi premi su tutti gli strike ammessi. Due leggi con il forward della calibrazione producono quantili Q +4σ di '+fmt(w.quantileA,2)+' e '+fmt(w.quantileBLo,2)+' punti.';
}

  function reset(){active=null;el('stressBody').replaceChildren();el('stressResult').textContent='Disponibile al termine del fit della curva.';el('stressRoot').hidden=true;}
  function CVIDownDigital(s,K){return CVILab.point({...s.context,canonical:s.canonical},Math.log(K/s.context.F)).probAbove;}
  function update(){
    if(!active||window.Desk?.state.stale||window.Desk.state.result!==active)return reset();
    const K=el('stressThreshold').valueAsNumber,r=active,w=r.ws;
    if(!(K>0&&Number.isFinite(K))){el('stressWitness').hidden=true;el('stressBody').replaceChildren();el('stressResult').textContent='Inserisci un prezzo cash positivo.';return;}
    const base=w.model.survival(K),alt=w.sensitivityDetails||[],rows=[{label:'Fit principale',value:base,obs:w.info.observations}];
    for(const variant of alt){
      rows.push({label:variant.label,value:variant.ok&&variant.nativeProfile?CVIDownDigital(variant.nativeProfile.cvi,K):null,obs:variant.observations,error:variant.error});
    }
    const usable=rows.filter(x=>Number.isFinite(x.value)),values=usable.map(x=>x.value);
    const delta=v=>Number.isFinite(v)?(v>=0?'+':'')+fmt(v*100,2)+' pp':'—';
    el('stressBody').innerHTML=rows.map(row=>'<tr><td>'+safe(row.label)+'</td><td class="num">'+(row.obs??'—')+'</td><td class="num">'+pct(row.value)+'</td><td class="num">'+delta(Number.isFinite(row.value)?row.value-base:NaN)+'</td></tr>').join('');
    witnessProfiles(r,K);
    const native='Q(Sₜ > '+fmt(K)+') nel fit principale '+pct(base)+'. ';
    el('stressResult').textContent=native+(usable.length>1?'Intervallo fra i fit '+pct(Math.min(...values))+' – '+pct(Math.max(...values))+'. Varianti calcolate '+(usable.length-1)+' su '+alt.length+'.':'La curva pubblicata è il mark CVI per questa scadenza.')+(K<w.nativeLiquid[0]||K>w.nativeLiquid[1]?' Soglia oltre il range degli strike utilizzati.':'');
  }
  function render(r){
    if(!r?.ws){reset();return;}
    active=r;
    el('stressRoot').hidden=false;
    el('stressThreshold').value=String(r.cfg.settlement);
    const a=r.calibration,src=r.cfg.quoteSource==='mid'?'bid/ask osservati':'prezzi sintetici da IV';
    el('stressTime').textContent=r.cfg.symbol+' · scadenza '+r.cfg.expiry+' '+r.cfg.expiryTime+' ET · '+src+'.';
    const ok=(a?.candidates||[]).filter(c=>c.ok);
    el('stressCv').textContent=r.ws.cvi?.markReleased?'Mark CVI pubblicato dopo verifica continua della smile e controllo su tutti i lati di quotazione ammessi.':a?.mode==='cross_validation'?
      'Regolarizzazione scelta su tre gruppi alternati di strike, con forward comune. Perdita Huber media sui prezzi esclusi dal rispettivo fit (per λ) '+ok.map(c=>c.lambda+' → '+fmt(c.score,5)).join(' · ')+'. λ selezionata '+a.selectedLambda+'.':
      'Regolarizzazione fissata manualmente, λ '+(a?.selectedLambda??'—')+'.';
    update();
  }
  el('stressThreshold').addEventListener('input',update);
  el('stressUseF').addEventListener('click',()=>{if(!active)return;el('stressThreshold').value=String(active.forward.F);update();});
  el('stressUseRef').addEventListener('click',()=>{if(!active)return;el('stressThreshold').value=String(active.cfg.settlement);update();});
  window.QuantistesStability={render,reset,cdf};
})();

