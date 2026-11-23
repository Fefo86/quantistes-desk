(function(){
 const $=id=>document.getElementById(id);
 function tune(){const r=window.CVIModelRouter,g=r?.group?.(),f=g&&r.peekFlexible(g),choice=$('qtGlobalChoice');
  if(choice){for(const o of choice.options)o.hidden=o.value!=='CFLEX';choice.value='CFLEX';}
  const release=$('qtGlobalRelease'),note=$('vc9LegendNote'),v=f?.promotable?'C-FLEX · mark nel dominio congiunto':f?'C-FLEX · vincoli di mercato non superati':'C-FLEX · in attesa di calibrazione';
  if(release&&release.textContent!==v)release.textContent=v;if(note&&note.textContent!==v)note.textContent=v;
  if($('qtGlobalSmoothFit'))$('qtGlobalSmoothFit').hidden=true;
 }
 document.addEventListener('DOMContentLoaded',()=>{tune();setInterval(tune,1200);});
})();