
(function(root){
'use strict';
const el=id=>document.getElementById(id),R=root.CVIModelRouter,F=root.CVIFit,fmt=(v,n=3)=>Number.isFinite(v)?v.toLocaleString('it-IT',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const panel=el('qtGlobalModelPanel'),fit=el('qtSSVIFit'),choose=el('qtSSVIModelSelect'),tenor=el('qtSSVITenor');
function chart(group,a){
 const svg=el('qtSSVIChart'),idx=Number(tenor?.value)||0,c=group?.curves?.[idx];
 if(!svg||!c){if(svg)svg.innerHTML='';return;}
 const chartRows=[];let lo=Infinity,hi=-Infinity;
 const minK=Math.max(-.08,c.lo),maxK=Math.min(.08,c.hi),range=maxK>minK?maxK-minK:.02;
 for(let i=0;i<=90;i++){
  const k=(maxK>minK?minK:-.01)+(maxK>minK?range:.02)*i/90,w=F.evaluate(c.canonical,k).w;
  const cv=Math.sqrt(w/c.T)*100,sv=a?.ok?Math.sqrt(R.ssvi(a.parameters.theta[idx],k,a.parameters.rho,a.parameters.eta,a.parameters.gamma)/c.T)*100:null;
  if(Number.isFinite(cv)){lo=Math.min(lo,cv);hi=Math.max(hi,cv);}
  if(Number.isFinite(sv)){lo=Math.min(lo,sv);hi=Math.max(hi,sv);}
  chartRows.push({k,cv,sv});
 }
 if(!Number.isFinite(lo)){svg.innerHTML='';return;}
 const W=940,H=315,L=65,Right=915,Top=22,Bottom=278,pad=Math.max(.15,(hi-lo)*.12);lo=Math.max(0,lo-pad);hi+=pad;
 const X=k=>L+(k-chartRows[0].k)/(chartRows.at(-1).k-chartRows[0].k)*(Right-L),Y=v=>Bottom-(v-lo)/(hi-lo)*(Bottom-Top);
 let lines='<rect width="940" height="315" fill="#08192a"/>';
 for(let q=0;q<=4;q++){let y=Top+(Bottom-Top)*q/4,v=hi-(hi-lo)*q/4;lines+=`<path d="M${L} ${y}H${Right}" stroke="#183550" stroke-width=".7"/><text x="${L-9}" y="${y+4}" font-size="12" text-anchor="end" fill="#649ad8">${fmt(v,1)}</text>`;}
 for(let q=0;q<=6;q++){let k=chartRows[0].k+(chartRows.at(-1).k-chartRows[0].k)*q/6,x=X(k);lines+=`<path d="M${x} ${Top}V${Bottom}" stroke="#162f45" stroke-width=".6"/><text x="${x}" y="${Bottom+20}" font-size="12" text-anchor="middle" fill="#649ad8">${fmt(k*100,2)}%</text>`;}
 const linePath=(field,color)=>{const points=chartRows.filter(p=>Number.isFinite(p[field]));if(points.length<2)return '';return `<path d="${points.map((p,i)=>(i?'L':'M')+X(p.k).toFixed(2)+' '+Y(p[field]).toFixed(2)).join('')}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round"/>`;};
 lines+=linePath('cv','#dddaca')+linePath('sv','#8dd0ea');
 lines+=`<text x="${Right}" y="17" text-anchor="end" fill="#dddaca" font-size="13">CVI osservato</text><text x="${Right-122}" y="17" text-anchor="end" fill="#8dd0ea" font-size="13">${a?.ok?'SSVI globale':'SSVI non calcolato'}</text>`;
 lines+=`<text x="${(L+Right)/2}" y="310" text-anchor="middle" fill="#77a7e2" font-size="11">100 × ln(K/F) · % · ${escape(c.expiry)}</text>`;
 svg.setAttribute('viewBox','0 0 940 315');svg.innerHTML=lines;
}
function render(){
 const g=R.group(),a=g?R.peek(g):null;
 const name=el('qtSSVIModelFlag'),status=el('qtSSVIStatus'),metrics=el('qtSSVIMetrics');
 if(!g||!g.marketReady){if(name)name.textContent='IN ATTESA';if(status)status.textContent='Importa almeno due chain SPXW allo stesso cutoff e calibra la superficie CVI. La ricerca SSVI è disponibile soltanto per un gruppo certificato.';if(metrics)metrics.innerHTML='<div><dt>Stato SSVI</dt><dd>Non disponibile</dd></div>';fit.disabled=true;choose.disabled=true;tenor.innerHTML='';chart(null,null);return;}
 fit.disabled=false;choose.disabled=false;
 const prev=tenor.value;tenor.innerHTML=g.curves.map((c,i)=>`<option value="${i}">${escape(c.expiry)} · ${fmt(c.T*365,2)}g</option>`).join('');tenor.value=String(Math.max(0,Math.min(g.curves.length-1,Number(prev)||0)));
 const ran=!!a?.ok,qualified=!!a?.promotable,selected=R.preference(g);
 choose.options[1].disabled=!qualified;choose.value=['CVI','SSVI'].includes(selected)?selected:'CVI';
 if(name)name.textContent=qualified?'SSVI CERTIFICABILE · SELEZIONE MANUALE':ran?'SSVI SOLO RICERCA · CVI ATTIVO':'CVI OPERATIVO';
 if(status)status.textContent=!ran?'CVI rilasciato. Avvia il fit SSVI globale per misurare l’errore sui premi senza sostituire automaticamente il mark.':qualified?'Il modello SSVI rispetta tutti i premi ammessi; puoi selezionarlo esplicitamente per la superficie. Le code fuori quotazione restano modellistiche.':`SSVI non promosso: ${a.reason}. Il CVI mantiene pricing, grafici e audit. Scarto peggiore: ${fmt(a.stats?.worst?.breach,5)} punti SPX.`;
 const rows=[['Modello operativo',selected],['SSVI',ran?(qualified?'Quote certificate':'Benchmark non operativo'):'Da calibrare'],['Premi verificati',ran?`${a.stats.within} / ${a.stats.n}`:'—'],['Premi fuori spread',ran?String(a.stats.failures):'—'],['Max violazione',ran?fmt(a.stats.worst.breach,5)+' pt':'—'],['RMSE sui mid',ran?fmt(a.stats.rmse,5)+' pt':'—'],['ρ · η · γ',ran?`${fmt(a.parameters.rho,3)} · ${fmt(a.parameters.eta,3)} · ${fmt(a.parameters.gamma,3)}`:'—'],['Butterfly min.',ran?fmt(a.minButterfly,7):'—'],['Punto peggiore',ran&&a.stats.worst.expiry?`${a.stats.worst.expiry} K ${fmt(a.stats.worst.strike,1)} ${a.stats.worst.side}`:'—']];
 if(metrics)metrics.innerHTML=rows.map(([l,v])=>`<div><dt>${escape(l)}</dt><dd>${escape(v)}</dd></div>`).join('');
 chart(g,ran?a:null);
}
fit.onclick=()=>{
 const g=R.group();if(!g)return;
 fit.disabled=true;el('qtSSVIStatus').textContent='Calibrazione SSVI e verifica integrale dei prezzi in corso…';
 root.setTimeout(()=>{try{R.analyze(g);}finally{fit.disabled=false;render();}},20);
};
choose.onchange=()=>{
 const g=R.group();if(!g)return;
 if(!R.select(g,choose.value)){choose.value='CVI';return;}
 const book=R.book();if(book)root.VolCube9?.setData(book);render();
};
tenor.onchange=render;
function refresh(){render();}
root.CVISSVIUI=Object.freeze({refresh});
refresh();
})(window);
