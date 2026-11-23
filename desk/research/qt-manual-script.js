(function(){'use strict';
const input=document.getElementById('qtManualSearch'),count=document.getElementById('qtManualCount');
const cards=[...document.querySelectorAll('#view-method .qt-manual-tool')],groups=[...document.querySelectorAll('#view-method .qt-guide-control-group')];
function norm(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function update(){const words=norm(input?.value).split(/\s+/).filter(Boolean);let hits=0;
 for(const item of cards){const hay=norm(item.dataset.guideSearch||item.textContent);const visible=words.every(t=>hay.includes(t));item.hidden=!visible;if(visible)hits++;}
 for(const group of groups){const any=[...group.querySelectorAll('.qt-manual-tool')].some(x=>!x.hidden);group.hidden=!!words.length&&!any;if(words.length&&any)group.open=true;}
 if(count)count.textContent=hits+' / '+cards.length+' controlli';
}
input?.addEventListener('input',update);update();
window.QuantistesManual={focus:(id)=>{
 const item=document.getElementById('qtManualTool-'+id)||document.getElementById('qtManualSection-'+id)||document.getElementById('qtGuide-'+id);
 if(!item)return false;
 if(input)input.value='';update();
 let ancestor=item.parentElement;while(ancestor){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}
 if(item.tagName==='DETAILS')item.open=true;
 item.scrollIntoView({block:'start',behavior:'instant'});
 item.classList.add('qt-emphasis');setTimeout(()=>item.classList.remove('qt-emphasis'),1700);
 return true;
 }};
})();