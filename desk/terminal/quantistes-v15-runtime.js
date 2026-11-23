
/* QUANTISTES v15: in-place native research integration. No iframe / secondary terminal. */
(function(global){'use strict';
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const CONFIG={
  score:{title:'CENTRAL SCOREBOARD',caption:'Segnali finali · flussi · qualità dei dati.',initial:'flow-score',tools:[['flow-score','FLOW SCORE','Segnali operativi e gate',1]]},
  market:{title:'VOLATILITY',caption:'Opzioni SPXW, curva implicita, livelli e rischio di coda.',initial:'skewfit',tools:[['skewfit','SKEW & MARK/FIT','Smile, quote, Q e fitting CVI',1],['levels','LEVELS / IPPO','Livelli IPPO e Wall Street',1],['implied','IMPLIED METRICS','Greche e metriche delle opzioni',1],['volcube','CVI SURFACE','Superficie multiscadenza',1],['surface','TERM STRUCTURE','Struttura a termine',1],['tailrisk','TAIL BOUNDS & STRESS','Vincoli e stress di coda',1],['export','TRADINGVIEW / EXPORT','Livelli ed esportazione',1]]},
  dealer:{title:'DEALER FLOW',caption:'Un solo terminale opzioni: Gamma, Charm, inventory, hedge e flow paths.',initial:'flow-ops',tools:[['flow-ops','OPTIONS FLOW','Terminale flussi',1],['flow-overview','GAMMA / CHARM','Sensibilità e profilo',1],['flow-position','DEALER STATE','Inventory e gamma concentration',1],['flow-hedge','HEDGE ENGINE','Scenari di copertura',1],['flow-paths','FLOW PATHS','Distribuzioni condizionate',1]]},
  path:{title:'PHYSICAL P',caption:'Probabilità real-world, percorsi SPX/ES, eventi, storicizzazione.',initial:'dynamic-p',tools:[['dynamic-p','DYNAMIC P / SPX','Distribuzione intraday SPX',1],['physical-p','PHYSICAL P 09:45','Distribuzione storica SPX',1],['distributions','DISTRIBUZIONI Q/P','Quantili e terminal probability',1],['history','PIT HISTORY','Storico e replay',1],['research','P RISK','Rischio probabilistico',1]]},
  audit:{title:'RESEARCH',caption:'Certificazione dei modelli, backtest e manuale.',initial:'audit',tools:[['audit','MODEL CERTIFICATION','Repricing e test',1],['systematic','BACKTEST','Benchmark e strategie sistematiche',1],['method','METHOD LIBRARY','Manuale quantitativo',1]]}
 };
 const STAGE={score:'SCOREBOARD',market:'VOLATILITY',dealer:'POSITIONING',path:'DISTRIBUTIONS',audit:'RESEARCH',reports:'REPORT',scalp:'SCALPING'};
 const state={stage:'score',opened:{},last:{},mounts:{},archiveRoot:null,setting:false,ready:false,internal:false,lastNative:null};
 const keyToStage=Object.fromEntries(Object.entries(CONFIG).flatMap(([key,c])=>c.tools.map(v=>[v[0],key])));
 function studioFor(id){return (document.querySelector('#q15Nav [data-q15-tool="'+CSS.escape(id)+'"]')||null)}
 function stageRoot(stage){return document.querySelector('[data-q13-panel="'+stage+'"]')}
 function context(stage){
  state.stage=stage; for(const btn of document.querySelectorAll('.q15-spine [data-q15-stage]')) btn.classList.toggle('on',btn.dataset.q15Stage===stage);
  const crumb=$('q15CurrentStage');if(crumb)crumb.textContent=STAGE[stage]||stage.toUpperCase();
 }
 function nativeArea(stage){return state.mounts[stage]?.querySelector('.q15-native-host')}
 function resizeSoon(){for(const delay of [100,420,900])setTimeout(()=>{
  try{window.dispatchEvent(new Event('resize'));const p=global.Plotly;if(!p?.Plots?.resize)return;const a=nativeArea(state.stage)||document;
   for(const el of a.querySelectorAll('.js-plotly-plot'))if(el.offsetWidth>20&&el.offsetHeight>20)p.Plots.resize(el).catch?.(()=>{});
  }catch(e){}
 },delay)}
 function showResearch(stage='audit'){global.QuantistesConfluence?.go(stage);context(stage);}
 function navCurrent(stage,id){
  const mount=state.mounts[stage];if(!mount)return;
  for(const btn of mount.querySelectorAll('[data-q15-tool]'))btn.classList.toggle('on',btn.dataset.q15Tool===id);
  const desc=CONFIG[stage].tools.find(x=>x[0]===id);const lab=mount.querySelector('.q15-active-label');if(lab)lab.textContent=desc?.[1]||id;
  const sub=mount.querySelector('.q15-active-desc');if(sub)sub.textContent=desc?.[2]||'';
  mount.dataset.activeTool=id;
 }
 function mountDynamic(){
  let div=$('q15DynamicShell');if(!div){div=document.createElement('div');div.id='q15DynamicShell';div.className='q15-dynamic-native';}
  const dock=$('dx-global-dock'),flow=$('view-flows');if(dock&&dock.parentNode!==div)div.appendChild(dock);
  if(flow&&flow.parentNode!==div)div.appendChild(flow);
  return div;
 }
 function mountArchive(){
  if(state.archiveRoot)return state.archiveRoot;
  const original=$('view-quant360');if(!original)return null;
  const root=document.createElement('div');root.id='q15Qt360';root.className='q15-archive-native';
  const moved=[...original.children].filter(n=>Array.from(n.classList||[]).some(c=>c.startsWith('qt360-')));
  for(const n of moved)root.appendChild(n);for(const pid of ['path','val','atlas']){const p=$('qt360-panel-'+pid);if(p&&p.parentNode!==root)root.appendChild(p);}
  state.archiveRoot=root;return root;
 }
 function openNative(id,stage=state.stage,autonavigate=false){
  if(!state.mounts[stage])stage=keyToStage[id]||'audit';
  if(autonavigate&&state.stage!==stage){global.QuantistesConfluence?.go(stage);context(stage)}
  const mount=state.mounts[stage];if(!mount)return;
  const el=mount.querySelector('.q15-native-host');if(!el)return;
  const flowPanels={'flow-ops':'ops','flow-overview':'overview','flow-position':'position','flow-hedge':'hedge','flow-paths':'paths','dynamic-p':'dynamic','physical-p':'physical'};
  function compound(kind,ids){let c=$('q25Composite-'+kind);if(!c){c=document.createElement('section');c.id='q25Composite-'+kind;c.className='q25-composite';}
    ids.forEach((id,i)=>{const node=$('view-'+id);if(node&&node.parentNode!==c)c.appendChild(node);node?.classList.add('active');});return c;}
  const target=id==='quant360'?mountArchive():id==='dynamic-p'||id==='physical-p'?mountDynamic():
   flowPanels[id]?$('view-flows'):id==='skewfit'?compound('skewfit',['smile','monitor']):
   id==='tailrisk'?compound('tailrisk',['tailbook','crash']):$('view-'+id);
  if(!target){el.innerHTML='<div class="q15-portal-pending">Studio non disponibile con queste fonti: '+esc(id)+'</div>';return;}
  // Detach any already mounted native view, keeping it in the DOM for native event listeners.
  for(const child of [...el.children]){
   if(child!==target){const parking=$('q15Parking');parking?.appendChild(child)}
  }
  if(target.parentNode!==el)el.appendChild(target);
  state.opened[stage]=true;state.last[stage]=id;mount.classList.add('open');
  mount.querySelector('.q15-labcontent').hidden=false;
  mount.querySelector('.q15-toggle').textContent='▾ COMPATTA';
  navCurrent(stage,id);
  state.internal=true;try{if(id==='quant360'){
   global.Desk?.tab?.('quant360');
  }else if(flowPanels[id]){
    global.Desk?.tab?.('flows');
    setTimeout(()=>{if(state.stage!==stage||state.last[stage]!==id)return;const key=flowPanels[id],btn=document.querySelector('#view-flows .flow-subnav [data-flow-panel="'+key+'"]');btn?.click();
      document.querySelectorAll('#view-flows .flow-inner').forEach(n=>n.classList.toggle('active',n.id==='flow-panel-'+key));resizeSoon();},95);
  }else if(id==='skewfit'||id==='tailrisk'){
    const ids=id==='skewfit'?['monitor','smile']:['crash','tailbook'];
    ids.forEach(k=>global.Desk?.tab?.(k));
    target.querySelectorAll('.view').forEach(node=>node.classList.add('active'));
  }else{global.Desk?.tab?.(id);if(id==='flows')setTimeout(()=>document.querySelector('#view-flows [data-flow-panel="ops"]')?.click(),40);}
  }catch(e){console.error('q15 native switch',id,e)}finally{state.internal=false;}
  requestAnimationFrame(()=>{target.classList.add('active');resizeSoon()});
 }
 function toggleLab(stage){const m=state.mounts[stage];if(!m)return;const next=!state.opened[stage];state.opened[stage]=next;
  m.querySelector('.q15-labcontent').hidden=!next;m.querySelector('.q15-toggle').textContent=next?'▾ COMPATTA':'▸ ESPLORA GLI STUDI';
  if(next){openNative(state.last[stage]||CONFIG[stage].initial,stage);resizeSoon()}
 }
 function makeLab(stage){
  const c=CONFIG[stage],div=document.createElement('section');div.className='q15-instrument';div.dataset.q15Lab=stage;
  div.innerHTML=`<div class="q15-labhead"><div><small>QUANTISTES / ANALYTICAL DEPTH &nbsp; · &nbsp; ${c.tools.length} STUDI</small><h3>${esc(c.title)}</h3><p>${esc(c.caption)}</p></div><button class="q15-toggle" type="button">▾ COMPATTA</button></div>
   <div class="q15-labcontent"><div class="q15-toolnav" role="tablist" aria-label="Analisi ${STAGE[stage]}">
   ${c.tools.map(([id,name,info,major],i)=>`<button data-q15-tool="${esc(id)}" type="button" role="tab" title="${esc(info)}" class="${major?'':'q15-mutedtool'}"><span>${String(i+1).padStart(2,'0')}</span>${esc(name)}</button>`).join('')}
   </div><div class="q15-portal-head"><div><b class="q15-active-label">${esc(c.title)}</b><p class="q15-active-desc"></p></div><div class="q15-toolbar"><button type="button" data-q15-action="expand">↗ ESPANDI</button><button type="button" data-q15-action="params">⚙ DATA / FIT</button><button type="button" data-q15-action="search">⌕ STRUMENTI</button></div></div>
   <div class="q15-native-host"><div class="q15-portal-pending">Seleziona uno studio.</div></div></div>
   <div class="q15-portal-status"><span>◉ MOTORI NATIVI · CVI / IPPO / Q / P / FLOW / RESEARCH</span><span><b>DATA AWARE</b> · <em>Campioni non contemporanei non generano falsi segnali</em></span></div>`;
  div.querySelector('.q15-toggle').onclick=()=>toggleLab(stage);
  div.querySelectorAll('[data-q15-tool]').forEach(b=>b.onclick=()=>openNative(b.dataset.q15Tool,stage));
  div.querySelector('[data-q15-action="expand"]')?.addEventListener('click',()=>{
   const n=div.querySelector('.q15-native-host'),expand=n.classList.toggle('q15-expanded');
   div.querySelector('[data-q15-action="expand"]').textContent=expand?'↙ COMPATTA':'↗ ESPANDI';resizeSoon();
  });
  div.querySelector('[data-q15-action="params"]')?.addEventListener('click',()=>settings(true));
  div.querySelector('[data-q15-action="search"]')?.addEventListener('click',()=>showLookup(true));
  state.mounts[stage]=div;return div;
 }
 function settings(flag){const overlay=$('q15Settings');if(!overlay)return;state.setting=Boolean(flag);overlay.classList.toggle('open',state.setting);overlay.setAttribute('aria-hidden',String(!state.setting));document.body.style.overflow=state.setting?'hidden':'';
  const native=$('terminalSidebar');if(native&&state.setting)native.hidden=false; if(state.setting){$('q15SettingsClose')?.focus()} }
 function mkSettings(){const wrap=document.createElement('div');wrap.className='q15-settings-overlay';wrap.id='q15Settings';wrap.setAttribute('aria-hidden','true');
  wrap.innerHTML='<div class="q15-settings-drawer" role="dialog" aria-modal="true" aria-label="Data & Fit Studio"><div class="q15-settings-head"><div><b>DATA / FIT STUDIO</b><br><small>Chain, orologi e riferimenti di mercato</small></div><button class="q15-close" id="q15SettingsClose" type="button">✕ CHIUDI</button></div><div class="q15-settings-main" id="q15ParamsMount"><div class="q15-notice">Carica la chain SPXW, verifica il fixing e calcola il mark. I motori dello Scoreboard ricevono i risultati dalla stessa sessione. In demo Q e P possono avere date differenti.</div></div><div class="q15-settings-footer"><div class="q15-drawer-row"><button id="q15Calculate" type="button">▶ CALCOLA / CERTIFICA CVI</button><button id="q15OpenChain" type="button">＋ IMPORTA CSV</button></div><p style="margin-top:7px">QUOTE QUALITY · TIMESTAMP PIT · SETTLEMENT · NO-ARBITRAGE</p></div></div>';
  document.body.appendChild(wrap);const sidebar=$('terminalSidebar');if(sidebar)wrap.querySelector('#q15ParamsMount').appendChild(sidebar);
  wrap.addEventListener('click',e=>{if(e.target===wrap)settings(false)});
  $('q15SettingsClose').onclick=()=>settings(false);
  $('q15Calculate').onclick=()=>{if($('calculate'))$('calculate').click()};
  $('q15OpenChain').onclick=()=>$('csvFile')?.click();
  $('qtCloseParams')?.addEventListener('click',()=>settings(false));
 }
 const cmdTools=[...new Map(Object.entries(CONFIG).flatMap(([stage,c])=>c.tools.map(t=>[t[0],{stage,id:t[0],name:t[1],desc:t[2]}]))).values()];
 function showLookup(flag){const o=$('q15Lookup');o.classList.toggle('open',!!flag);if(flag){const i=$('q15Search');i.value='';fillLookup('');setTimeout(()=>i.focus(),50)}else $('q15Search')?.blur()}
 function fillLookup(term){const x=term.trim().toLowerCase(),out=$('q15Results');if(!out)return;const arr=(global.QuantistesFlatDesk?.catalog?.()||cmdTools).filter(t=>(t.name+' '+t.desc+' '+STAGE[t.stage]).toLowerCase().includes(x));
  out.innerHTML=arr.map(t=>`<button class="q15-result" type="button" data-q15-lookup="${t.id}" data-q15-lookup-stage="${t.stage}"><div><strong>${esc(t.name)}</strong><span>${esc(t.desc)}</span></div><em>${esc(STAGE[t.stage])} ↗</em></button>`).join('')||'<p style="padding:16px;color:#78c0de">Nessuno strumento con questo filtro.</p>';
  out.querySelectorAll('button').forEach(b=>b.onclick=()=>{showLookup(false);global.QuantistesFlatDesk?.go(b.dataset.q15LookupStage,b.dataset.q15Lookup);});

 }
 function mkLookup(){const m=document.createElement('div');m.id='q15Lookup';m.className='q15-lookup';m.innerHTML='<div class="q15-lookup-card" role="dialog" aria-modal="true" aria-label="Command palette"><div class="q15-lookup-header"><div><b>⌕ INSTRUMENT FINDER</b><br><span>RICERCA PER STRUMENTO, EVENTO O MERCATO</span></div><button class="q15-close" id="q15SearchClose" type="button">ESC / CHIUDI</button></div><input id="q15Search" placeholder="Cerca skew, gamma, path, term structure, P, IPPO..." autocomplete="off"><div id="q15Results"></div></div>';
  document.body.appendChild(m);$('q15Search').oninput=e=>fillLookup(e.target.value);$('q15SearchClose').onclick=()=>showLookup(false);m.addEventListener('click',e=>{if(e.target===m)showLookup(false)})}
 function mkSpine(){const hd=document.querySelector('.q13-header');if(!hd)return;
  hd.insertAdjacentHTML('afterend',`<div class="q15-spine" id="q15Spine"><div class="q15-spine-head"><b>DECISION CHAIN</b><small id="q15CurrentStage">SCOREBOARD</small></div>${[
   ['market','01','SPX / Γ → Q','Price · skew · GEX'],['dealer','02','DEALER / FLOW','Gamma · Charm · MM'],['path','03','PHYSICAL → P','Touch · corridor'],['score','04','CONFLUENCE','Compatible evidence']].map(a=>`<button data-q15-stage="${a[0]}"><span>${a[1]}</span><div><b>${a[2]}</b><small>${a[3]}</small></div></button>`).join('')}<span class="q15-source-tag" id="q15ScopeStatus">HISTORICAL / NOT LIVE</span></div>`);
  for(const b of $('q15Spine').querySelectorAll('button'))b.onclick=()=>{global.QuantistesConfluence?.go(b.dataset.q15Stage);context(b.dataset.q15Stage)};
  const a=hd.querySelector('.q13-actions');a.insertAdjacentHTML('beforeend','<button class="q13-btn" id="q15DataButton" type="button">⚙ DATA / FIT</button><button class="q13-btn" id="q15ToolsButton" type="button">⌕ FIND</button>');
  $('q15DataButton').onclick=()=>settings(true);$('q15ToolsButton').onclick=()=>showLookup(true);
  const n=$('q13Nav');const btn=document.createElement('button');btn.dataset.q13View='audit';btn.innerHTML='<span>05</span><div><b>RESEARCH LAB</b><small>Methods / robustness</small></div><i>⌁</i>';n.appendChild(btn);
  const audit=stageRoot('audit');audit?.querySelector('h1')?.replaceChildren(document.createTextNode('RESEARCH & MODEL LAB'));
  const p=a.querySelector('#q13ImportChain');if(p)p.textContent='+ CHAIN / CSV';
 }
 function mkContent(){for(const [stage,c] of Object.entries(CONFIG)){
  const page=stageRoot(stage);if(!page)continue;
  const title=page.querySelector('.q13-screen-title');if(title){
   const mode=document.createElement('div');mode.className='q15-mode-switch';mode.setAttribute('role','group');mode.setAttribute('aria-label','Livello di dettaglio');
   mode.innerHTML='<button type="button" class="on" data-q15-mode="overview">◉ OVERVIEW</button><button type="button" data-q15-mode="deep">▦ FULL ANALYTICS</button>';
   mode.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const deep=b.dataset.q15Mode==='deep';page.classList.toggle('q15-native-only',deep);
    mode.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
    if(deep){openNative(state.last[stage]||CONFIG[stage].initial,stage);if(!state.opened[stage])toggleLab(stage);}
    window.scrollTo({top:0,behavior:'instant'});resizeSoon();
   });title.appendChild(mode);
  }
  const lab=makeLab(stage);page.appendChild(lab);
  if(stage!=='audit'&&stage!=='score'){
   const forward=document.createElement('div');forward.className='q15-hero-forward';const next={market:'dealer',dealer:'path',path:'score'}[stage];
   forward.innerHTML='<span>DECISION FLOW →</span><b>'+STAGE[stage]+'</b><em>· Output aggiornato nello Scoreboard quando le fonti sono coerenti</em><button class="q13-btn" data-q15-stage="'+next+'" style="margin-left:auto" type="button">CONTINUA → '+STAGE[next]+'</button>';
   forward.querySelector('button').onclick=()=>{global.QuantistesConfluence?.go(next);context(next)};
   page.insertBefore(forward,lab);
  }
 }
 const park=document.createElement('div');park.id='q15Parking';park.style='display:none!important';document.body.appendChild(park);
 for(const [stage,meta] of Object.entries(CONFIG)){
  if(stage==='score'){state.opened[stage]=false;state.mounts[stage].querySelector('.q15-labcontent').hidden=true;state.mounts[stage].querySelector('.q15-toggle').textContent='▸ ESPLORA GLI STUDI';}
  else if(stage==='audit'){state.opened[stage]=false;state.mounts[stage].querySelector('.q15-labcontent').hidden=true;state.mounts[stage].querySelector('.q15-toggle').textContent='▸ ESPLORA GLI STUDI';}
  else {state.opened[stage]=true;state.last[stage]=meta.initial;}
 }
 }
 function interceptLegacy(){
   // Remove only the old navigation action; keep all computational functions and controls.
   document.addEventListener('click',e=>{
    const t=e.target.closest('#q13Advanced,#q13ImportChain,#q13OpenNativeQ,#q13OpenManual,[data-q13-native]');
    if(!t)return; e.preventDefault();e.stopImmediatePropagation();
    if(t.id==='q13OpenManual') {global.QuantistesConfluence?.go('audit');context('audit');return;}
    if(t.dataset.q13Native){const id=t.dataset.q13Native;if(id==='flows'){global.QuantistesConfluence?.go('dealer');context('dealer');openNative('flows','dealer',true)}else if(id==='quant360'){global.QuantistesConfluence?.go('path');context('path');openNative('quant360','path',true)}else {global.QuantistesConfluence?.go('market');context('market');openNative(id,'market',true)}return;}
    settings(true);
   },true);
   document.addEventListener('click',e=>{const p=e.target.closest('[data-q13-view]');if(p){const stage=p.dataset.q13View;setTimeout(()=>{
    if(global.QuantistesFlatDesk)return;context(stage);if(state.opened[stage]&&state.mounts[stage])openNative(state.last[stage]||CONFIG[stage].initial,stage);
   },0)}},true);
   document.addEventListener('keydown',e=>{if(e.key==='Escape'){showLookup(false);settings(false);return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showLookup(true)}
    if(['1','2','3','4','5','6','7'].includes(e.key)&&e.altKey&&!e.shiftKey){const a=['score','market','dealer','path','audit','reports','scalp'][Number(e.key)-1];e.preventDefault();if(global.QuantistesFlatDesk)global.QuantistesFlatDesk.go(a);else{global.QuantistesConfluence?.go(a);context(a)}}
   });
 }
 function init(){if(state.ready)return;
  if(!$('q13App')||!global.QuantistesConfluence){setTimeout(init,150);return}
  state.ready=true;mkLookup();mkSpine();mkContent();mkSettings();interceptLegacy();context('score');
  for(const stage of ['market','dealer','path'])setTimeout(()=>{const m=state.mounts[stage];if(m){m.dataset.activeTool=CONFIG[stage].initial;navCurrent(stage,CONFIG[stage].initial)}},10);
  // Do not pre-open hidden Plotly plots. Native studies are mounted lazily on first visit.
  window.Quantistes15=Object.freeze({open:(stage,id)=>{global.QuantistesConfluence.go(stage);context(stage);openNative(id||CONFIG[stage].initial,stage);},settings:()=>settings(true),search:()=>showLookup(true),getState:()=>({stage:state.stage,native:state.last[state.stage]||null,functionsPreserved:[...new Set(cmdTools.map(c=>c.id==='dynamic-p'?'flows':c.id))].length})});
  setInterval(()=>{const q=global.Desk?.state,st=global.QuantistesConfluence?.getState?.(),ready=!!(q?.result&&!q?.stale),dealer=!!st?.ladderReady;
   const e=$('q15ScopeStatus');if(e)e.textContent=(st?.source==='SNAPSHOT STREAM'?'SNAPSHOT / VERIFY LICENSE':'REPLAY / HISTORICAL')+' · Q '+(ready?'FIT':'NO CHAIN')+' · DEALER '+(dealer?'IMPORTED':'MISSING');
   // Native original tab can be changed internally by a native chart/tool. Bring the selected study into this workstation, not a hidden legacy panel.
   if(!state.internal&&state.opened[state.stage]){
    const active=[...document.querySelectorAll('#qtWorkArea .view.active, .q15-native-host .view.active')].find(x=>x.id?.startsWith('view-')&&x.id!=='view-quant360');
    if(active&&active.id!=='view-'+state.last[state.stage]&&active.parentNode?.id==='q15Parking'){
     const id=active.id.slice(5),possible=CONFIG[state.stage].tools.some(x=>x[0]===id);if(possible)openNative(id,state.stage);
    }
   }
  },3200);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);

