
/* QUANTISTES FLAT DESK 25 / UI-ONLY ROUTING
   One canonical home for each study. Legacy numerical engines remain intact. */
(function(w){'use strict';
 const $=id=>document.getElementById(id);
 const root=s=>document.querySelector('[data-q13-panel="'+s+'"]');
 const registry={
  score:{name:'CENTRAL SCOREBOARD',sub:'FLOW SCORE · FINAL SIGNALS',default:'decision',tools:[['decision','SCOREBOARD','custom']]},
  market:{name:'VOLATILITY',sub:'CVI · Q · IPPO',default:'skewfit',tools:[['atlas','SPX CHART','custom'],['skewfit','SKEW + MARK/FIT','native'],['levels','LEVELS / IPPO','native'],['implied','OPTION GREEKS','native'],['volcube','C-FLEX · SURFACE 3D','native'],['surface','TERM STRUCTURE','native'],['regime','REGIMI VIX / VVIX','native'],['tailrisk','TAIL BOUNDS + STRESS','native'],['export','TRADINGVIEW','native']]},
  dealer:{name:'DEALER FLOW',sub:'FLOW · GAMMA · HEDGE',default:'flow-ops',tools:[['flow-ops','OPTIONS FLOW','native'],['flow-overview','GREEK RESPONSE','native'],['flow-position','DEALER STATE','native'],['flow-hedge','HEDGE ENGINE','native'],['flow-paths','FLOW PATHS','native'],['signed','SIGNED LADDER','custom'],['gammaatlas','GREEK STRIKE ATLAS','custom']]},
  path:{name:'PHYSICAL P',sub:'REAL-WORLD · EVENT PROBABILITY',default:'dynamic-p',tools:[['dynamic-p','DYNAMIC P / SPX','native'],['physical-p','PHYSICAL P 09:45','native'],['espath','ES PATH ATLAS','custom'],['realized','REALIZED P · MULTI-TF','native'],['distributions','Q / P DISTRIBUTIONS','native'],['history','HISTORICAL REPLAY','native'],['research','PROBABILITY RISK','native']]},
  audit:{name:'RESEARCH',sub:'QUOTAZIONI · REGIMI',default:'audit',tools:[['audit','QUALITÀ DEL MARK','native'],['systematic','REGIMI / VOL CONTROL','native'],['method','GUIDA OPERATIVA','native'],['registry','INDICATOR CATALOG','custom'],['matrix','COPERTURA DATI','native']]},
  reports:{name:'Report istituzionali',sub:'Report · BofA · Rubner · McElligott · CTA · vol control · risk parity · scenari · PDF',default:'report-charts',tools:[['report-charts','GRAFICI E SERIE','custom'],['report-archive','DOCUMENTI E LETTURE','custom']]},
  scalp:{name:'SCALPING',sub:'Scalping su flussi opzionari · OptionsDepth · strike · delta gamma charm vanna · copertura dealer · pattern · replay · dashboard indicatore SPX · Gamma/CPT ESGFlow ESCFlow G-Tag Velocity Flip C/G Alert Trade Dealer Action',default:'scalp-indicator',tools:[['scalp-indicator','STRIKE FLOW ANALYSIS','custom']]}
 };
 const NAV={score:'COMMAND',market:'VOLATILITY',dealer:'DEALER FLOW',path:'PHYSICAL P',audit:'RESEARCH',reports:'REPORT',scalp:'SCALPING'};
 let ready=false,activeStage='score',activeTool={},opening=false,refreshNo=0;
 function sourceTag(stage){
  if(stage==='score'||stage==='reports')return '';
  if(stage==='scalp')return 'FLUSSI PER STRIKE';
  if(stage==='dealer')return 'POSIZIONAMENTO / SCENARI';
  if(stage==='path')return 'P / HISTORICAL DATA';
  if(stage==='market')return 'SPXW / CVI · SNAPSHOT';
  return 'RESEARCH / HISTORICAL';
 }
 function mountTabs(){
  for(const [stage,obj] of Object.entries(registry)){
   const view=root(stage);if(!view)continue;
   const h=view.querySelector('.q13-screen-title');if(!h)continue;
   const name=h.querySelector('h1');if(name)name.textContent=obj.name;
   // Keep a single visible header, not headings repeated in child portals.
   const toolbar=document.createElement('nav');toolbar.className='q25-toolbar';toolbar.id='q25-toolbar-'+stage;
   toolbar.setAttribute('aria-label','Strumenti · '+obj.name);
   if(obj.tools.length>1){
    for(const [id,label] of obj.tools){
     const b=document.createElement('button');b.type='button';b.className='q25-tool';b.dataset.q25Tool=id;
     b.textContent=label;b.setAttribute('aria-current','false');b.onclick=()=>activate(stage,id,true);
     toolbar.appendChild(b);
    }
   }
   const provenance=sourceTag(stage);
   if(provenance){const p=document.createElement('span');p.className='q25-pit';p.dataset.alert=String(stage==='dealer');p.textContent=provenance;toolbar.appendChild(p)}
   h.after(toolbar);
  }
  const nav=$('qlNav');if(nav){for(const b of nav.querySelectorAll('[data-ql-stage]')){
   const stage=b.dataset.qlStage,label=NAV[stage],t=b.querySelector('span');if(!label||!t)continue;
   const child=[...t.childNodes].find(n=>n.nodeType===3);if(child)child.nodeValue=label;else t.insertBefore(document.createTextNode(label),t.firstChild);
   b.setAttribute('title',label);
  }}
  const brand=document.querySelector('.q13-header .q13-brand strong');if(brand)brand.innerHTML='QUANTISTES';
  const caps=document.querySelector('.q13-header .q13-brand>span');if(caps)caps.textContent='INSTITUTIONAL DESK  /  SPX · ES';
  const advanced=$('q15Settings');if(advanced){advanced.querySelector('.q15-notice')?.remove();advanced.querySelector('.q15-settings-footer p')?.remove()}
  // Nested textual method glosses were generated throughout calculators. The numerical method library remains in Research.
  document.querySelectorAll('#terminalSidebar details:not(.tool-help)').forEach(x=>x.open=true);
  // Original Flow navigation remains in DOM for its numerical event handlers, but is no longer a second menu.
 }
 function activeTab(stage,tool){
  const bar=$('q25-toolbar-'+stage);if(!bar)return;
  for(const b of bar.querySelectorAll('[data-q25-tool]')){
   const yes=b.dataset.q25Tool===tool;
   b.setAttribute('aria-current',yes?'page':'false');b.setAttribute('aria-selected',yes?'true':'false');
  }
 }
 function chartRefresh(){
  try{w.dispatchEvent(new Event('resize'))}catch(e){}
  try{w.VolCube9?.refresh?.()}catch(e){}
  const plots=document.querySelectorAll('.q13-view.on .js-plotly-plot');
  if(w.Plotly?.Plots?.resize)for(const p of plots){if(p.offsetWidth>20)try{const out=w.Plotly.Plots.resize(p);out?.catch?.(()=>{});}catch(e){}}
 }
 function nativeTarget(stage,tool){
  if((stage==='path'&&tool==='realized')||(stage==='audit'&&tool==='matrix')||(stage==='market'&&tool==='regime'))return 'quant360';
  return tool;
 }
 function activate(stage,tool,userClick=false){
  if(stage==='scalp'&&tool==='scalp-desk')tool='scalp-indicator';
  const cfg=registry[stage],pane=root(stage);if(!cfg||!pane||!cfg.tools.some(r=>r[0]===tool))return;
  if(opening)return;
  opening=true;
  try{
   activeStage=stage;activeTool[stage]=tool;if(document.documentElement)document.documentElement.dataset.deskStage=stage;
   if($('q24StageTitle'))$('q24StageTitle').textContent=NAV[stage];
   if($('q24SourceNote'))$('q24SourceNote').textContent='· '+(sourceTag(stage)||(stage==='reports'?'REPORT ISTITUZIONALI':'DECISION SIGNALS'));
   // q15 is a presentation portal; the unchanged original programs still own the DOM, state and computations.
   const isCustom=cfg.tools.find(t=>t[0]===tool)[2]==='custom';
   for(const c of [...pane.classList])if(c.startsWith('q25-tool-'))pane.classList.remove(c);
   pane.classList.add('q25-tool-'+tool);
   pane.classList.toggle('q25-custom',isCustom);
   if(isCustom){
    w.QuantistesConfluence?.go?.(stage);
    pane.classList.remove('q15-native-only');
    
   }else{
    pane.classList.add('q15-native-only');
    const target=nativeTarget(stage,tool);
    w.Quantistes15?.open?.(stage,target);
    if(target==='quant360')setTimeout(()=>{
      if(activeStage!==stage||activeTool[stage]!==tool)return;const key=tool==='regime'?'val':tool==='realized'?'path':'atlas';w.Quantistes360?.openPanel?.(key);
      const panel=$('qt360-panel-'+key);panel?.classList.add('on');
    },130);
   }
   activeTab(stage,tool);w.dispatchEvent(new CustomEvent('desk:route',{detail:{stage,tool}}));
   if(stage==='score')pane.classList.add('q25-single');
   // One active, full-width tool. No overview and no hidden level of navigation.
   if(userClick){
    const header=pane.querySelector('.q13-screen-title');header?.scrollIntoView({behavior:'smooth',block:'start'});
   }
   setTimeout(chartRefresh,160);
   
  }catch(e){console.error('[Q25] Workstation tool routing:',e)}finally{opening=false}
 }
 function selectStage(stage){
  if(!registry[stage])return;
  // The original stage switch has already run by the time this is called.
  if(w.QuantistesConfluence?.getState?.()?.stage===stage)activate(stage,activeTool[stage]||registry[stage].default);
 }
 function init(){
  if(ready)return;
  if(!w.Quantistes15||!w.QuantistesConfluence||!$('qlNav')||!root('score')){setTimeout(init,130);return}
  ready=true;mountTabs();
  const nav=$('qlNav');nav?.querySelectorAll('button[data-ql-stage]').forEach(b=>b.addEventListener('click',()=>selectStage(b.dataset.qlStage)));
  // Keep built-in nav actions (Chart, Dealer, etc.) functional; update flat toolbar after the native navigation.
  document.addEventListener('click',e=>{
   const legacy=e.target.closest('[data-q13-view]');
   if(legacy?.dataset.q13View&&registry[legacy.dataset.q13View])selectStage(legacy.dataset.q13View);
   const source=e.target.closest('#flowScoreFlows');if(source){setTimeout(()=>activate('dealer','flow-ops'),240)}
  });
  w.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k')return;
   if(e.altKey&&e.shiftKey&&/^[1-7]$/.test(e.key)){
    e.preventDefault();const stage=['score','market','dealer','path','audit','reports','scalp'][Number(e.key)-1];
    $('qlNav')?.querySelector('button[data-ql-stage="'+stage+'"]')?.click();
   }
  });
  activate('score','decision');
  // Preserve signal refresh logic, but do not rebuild a second recap dashboard.
  document.title='Quantistes | Institutional Desk';
  w.QuantistesFlatDesk=Object.freeze({version:'28.0',catalog:()=>Object.entries(registry).flatMap(([stage,section])=>section.tools.map(([id,name])=>({stage,id,name,desc:section.sub}))),go:(stage,tool)=>{if(tool){if(activeStage!==stage){$('qlNav')?.querySelector('button[data-ql-stage="'+stage+'"]')?.click();activate(stage,tool)}else activate(stage,tool)}else $('qlNav')?.querySelector('button[data-ql-stage="'+stage+'"]')?.click()},state:()=>({stage:activeStage,tool:activeTool[activeStage],tools:Object.values(registry).reduce((n,v)=>n+v.tools.length,0),singleOwner:true})});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,300));else setTimeout(init,300);
})(window);

