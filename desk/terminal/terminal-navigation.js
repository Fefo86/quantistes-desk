(function(){
 'use strict';
 const el=id=>document.getElementById(id);
 const form=el('terminalNav'),search=el('terminalLookup'),options=el('terminalOptions'),workspace=el('qtWorkspace');
 const rail=el('terminalMenuRail'),side=el('terminalSidebar'),menu=el('qtMenu'),data=el('terminalSettings'),ref=el('qtCommandReference');
 const mql=typeof window.matchMedia==='function'?window.matchMedia('(max-width:900px)'):null;
 const mid=typeof window.matchMedia==='function'?window.matchMedia('(min-width:901px) and (max-width:1220px)'):null;
 const normal=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const aliases={volcube:'volatilità superficie CVI 3D skew strike scadenza archivio multiscadenza',levels:'ippo wall street livelli mappa settlement',distributions:'q p distribuzioni probabilità cdf pdf',tailbook:'vincoli bid ask ali bounds',crash:'crash crollo stress ribasso drawdown',implied:'greche opzioni implied',smile:'vol smile skew densità',history:'replay percorsi storico pit',systematic:'modelli systematici sistematici',surface:'term struttura superficie dinamica',research:'ricerca rischio quantili pnl',export:'export tradingview pine csv livelli',audit:'qualità quotazioni mark',method:'help guida metodo istruzioni'};
 const tabs=Array.from(document.querySelectorAll('.tab')).map(tab=>({tab,id:tab.dataset.tab,code:tab.dataset.fn||tab.dataset.tab.toUpperCase(),title:tab.textContent.trim()}));
 const pane=id=>el('view-'+id);
 const commands=[{id:'@data',code:'CSV',title:'Dati CSV e parametri'},{id:'@menu',code:'MENU',title:'Menu delle funzioni'},{id:'@prev',code:'PREV',title:'Funzione precedente'},{id:'@next',code:'NEXT',title:'Funzione successiva'},{id:'@syntax',code:'?',title:'Guida ai comandi'}];
 const fields=Array.from(document.querySelectorAll('[data-qcode]')).map(el=>({
   id:'@field:'+el.id,elementId:el.id,view:el.dataset.qview,code:el.dataset.qcode,title:el.dataset.qname,
   className:el.dataset.qtype||'Controllo',search:[el.dataset.qcode,el.dataset.qname,el.dataset.qview,el.id].join(' ')
 }));
 const pool=tabs.concat(commands,fields);
 let active='',route=[],cursor=-1,replaying=false,selected=0,params=false,compactMenu=false,wideMenu=true;
 let commandHistory=[],historyAt=-1,typed='';
 const small=()=>Boolean(mql&&mql.matches);
 function setAttr(n,k,v){n.setAttribute(k,String(v));}
 function close(){options.hidden=true;setAttr(search,'aria-expanded',false);setAttr(search,'aria-activedescendant','');}
 function commandHelp(yes){ref.hidden=!yes;setAttr(el('qtCommandHelp'),'aria-expanded',yes);}
 function navUI(){
  const shown=small()?compactMenu:wideMenu&&!(mid?.matches&&params);
  rail.hidden=!shown;setAttr(menu,'aria-expanded',shown);workspace.classList.toggle('qt-rail-closed',!shown);
  side.hidden=!params;setAttr(data,'aria-expanded',params);workspace.classList.toggle('qt-params-open',params);
 }
 function setParams(on){
  params=on;if(on&&small())compactMenu=false;navUI();
  if(on)el('csvFile')?.focus?.({preventScroll:true});
  else data.focus?.({preventScroll:true});
 }
 function toggleMenu(){if(small()){compactMenu=!compactMenu;if(compactMenu)params=false;}else if(mid?.matches&&params){params=false;wideMenu=true;}else wideMenu=!wideMenu;navUI();}
 function selectedRoute(id){
  const entry=tabs.find(t=>t.id===id);if(!entry)return;
  if(active!==id&&!replaying){route=route.slice(0,cursor+1);route.push(id);cursor=route.length-1;if(route.length>64){route.shift();cursor--;}}
  active=id;el('qtHeading').textContent=entry.title;el('qtHeadingCode').textContent=entry.code;el('qtLocation').textContent=entry.title;
  for(const t of tabs)setAttr(t.tab,'aria-current',t===entry?'page':'false');
  el('qtBack').disabled=cursor<=0;el('qtNext').disabled=cursor===route.length-1;
  if(small()&&(params||compactMenu)){params=false;compactMenu=false;navUI();}
 }
 function go(id){const entry=tabs.find(t=>t.id===id);if(!entry)return false;entry.tab.click();selectedRoute(id);return true;}
 function move(delta){const j=cursor+delta;if(j<0||j>=route.length)return;cursor=j;replaying=true;try{go(route[j]);}finally{replaying=false;}}
 function query(){
  let q=normal(search.value).replace(/\s+/g,' ').replace(/\s+(?:<go>|go)$/,'');
  q=q.replace(/^(?:spxw?|spx)\s+(?:index|indice)\b\s*/,'').trim();
  const help=q.startsWith('help ')&&q!=='help help';if(help)q=q.slice(5).trim();
  if(q==='help help')q='?';
  return {q,help};
 }
 function lookup(){
  const {q,help}=query();
  const list=help?tabs.concat(fields):pool;
  const ranked=list.filter(t=>!q||[t.code,t.title,t.id,t.search,aliases[t.id]].some(v=>normal(v).includes(q)));
  const rank=t=>{const c=normal(t.code),h=normal(t.title),id=normal(t.elementId||t.id);
   return (c===q?200:0)+(id===q?170:0)+(h===q?160:0)+(c.startsWith(q)?90:0)+(h.startsWith(q)?70:0)+(h.includes(q)?25:0)+
    (t.elementId?0:6);};
  return ranked.sort((a,b)=>rank(b)-rank(a)||String(a.code).localeCompare(String(b.code))).slice(0,100);
 }
 function show(){
  const items=lookup();options.replaceChildren();selected=Math.max(0,Math.min(selected,items.length-1));
  if(!items.length){const l=document.createElement('li');l.textContent='Nessuna funzione corrispondente';l.className='terminal-no-match';options.appendChild(l);}
  items.forEach((t,i)=>{
   const l=document.createElement('li');l.id='terminalMatch'+i;setAttr(l,'role','option');setAttr(l,'aria-selected',i===selected);
   const k=document.createElement('b'),a=document.createElement('span');k.textContent=t.code;a.textContent=t.title;
   if(t.elementId)l.classList.add('qt-control-match');l.appendChild(k);l.appendChild(a);
   l.addEventListener('mousedown',e=>e.preventDefault());l.addEventListener('click',()=>run(t));options.appendChild(l);
  });options.hidden=false;setAttr(search,'aria-expanded',true);setAttr(search,'aria-activedescendant',items.length?'terminalMatch'+selected:'');
  options.children[selected]?.scrollIntoView?.({block:'nearest'});
 }
 function remember(s){if(!s)return;commandHistory=commandHistory.filter(x=>x!==s);commandHistory.push(s);if(commandHistory.length>30)commandHistory.shift();historyAt=-1;typed='';}
 function recall(step){
  if(!commandHistory.length)return;
  if(historyAt<0){if(step>0)return;typed=search.value;historyAt=commandHistory.length;}
  historyAt=Math.max(0,Math.min(commandHistory.length,historyAt+step));
  search.value=historyAt===commandHistory.length?typed:commandHistory[historyAt];selected=0;show();
 }
 function guide(id){
  const section=pane(id),first=section?.querySelector('.tool-help')||section?.querySelector('details');if(!first)return;
  first.open=true;first.scrollIntoView?.({block:'nearest'});first.querySelector('summary')?.focus?.({preventScroll:true});
 }
 function run(t){
  if(!t)return;const {help}=query();
  remember(search.value.trim()||t.code);close();search.value='';commandHelp(false);
  if(t.id==='@data')setParams(true);
  else if(t.id==='@menu')toggleMenu();
  else if(t.id==='@prev')move(-1);
  else if(t.id==='@next')move(1);
  else if(t.id==='@syntax')commandHelp(true);
  else if(help){
    go('method');const which=t.elementId||t.id;
    const focus=()=>{if(window.QuantistesManual?.focus(which))return;
      const target=el('qtManualSection-'+which);target?.scrollIntoView?.({block:'start'});};
    requestAnimationFrame(focus);
  }else if(t.elementId){
    if(t.view==='csvsidebar'){setParams(true);}
    else if(!go(t.view))return;
    const target=el(t.elementId);
    if(target){if(target.tagName==='DETAILS')target.open=true;
      const scrollTarget=(target.type==='file'?target.closest('label'):null)||target;
      requestAnimationFrame(()=>{scrollTarget?.scrollIntoView?.({block:'center',behavior:'smooth'});
       try{target.focus({preventScroll:true});}catch(_){} target.classList.add('qt-nav-emphasis');
       setTimeout(()=>target.classList.remove('qt-nav-emphasis'),1700);});}
  }else{go(t.id);el('qtWorkArea').focus?.({preventScroll:true});}
 }
 search.addEventListener('focus',()=>{selected=0;show();});
 search.addEventListener('input',()=>{selected=0;historyAt=-1;show();});
 search.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==search)close();},130));
 search.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();close();commandHelp(false);search.blur?.();return;}
  if(e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();recall(e.key==='PageUp'?-1:1);return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=lookup().length;if(n){selected=(selected+(e.key==='ArrowDown'?1:-1)+n)%n;show();}}
 });
 form.addEventListener('submit',e=>{e.preventDefault();const found=lookup();if(!found.length){show();return;}run(found[selected]||found[0]);});
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.activeElement!==search){if(!ref.hidden)commandHelp(false);else if(params)setParams(false);else if(small()&&compactMenu)toggleMenu();return;}
  if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey||e.target?.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/i.test(e.target?.tagName||''))return;
  e.preventDefault();search.focus?.();
 });
 data.addEventListener('click',()=>setParams(!params));menu.addEventListener('click',toggleMenu);
 el('qtCloseParams').addEventListener('click',()=>setParams(false));
 el('qtBack').addEventListener('click',()=>move(-1));el('qtNext').addEventListener('click',()=>move(1));
 el('qtCommandHelp').addEventListener('click',()=>{close();commandHelp(ref.hidden);});
 mql?.addEventListener?.('change',()=>{compactMenu=false;navUI();});
 mid?.addEventListener?.('change',navUI);
 function rootLabel(){const v=el('symbol')?.value||'SPXW';el('qtRoot').textContent=v;}
 el('symbol')?.addEventListener('change',rootLabel);
 if(typeof MutationObserver!=='undefined')new MutationObserver(rootLabel).observe(el('symbol'),{childList:true});
 navUI();rootLabel();window.QuantistesTerminal={select:selectedRoute};
 selectedRoute(tabs.find(t=>t.tab.classList.contains('active'))?.id||'levels');
})();
