(function(root){
'use strict';
const $=id=>document.getElementById(id),ids=['crLoss','crForward','crJump','crWeight'],engine=root.CVICrashRisk;
let last=null;
const num=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const pp=p=>p===0?'0%':p>0&&p<.000001?(p*100).toExponential(3).replace('.',',')+'%':num(p*100,p<.001?5:3)+'%';
const cell=v=>'<td>'+v+'</td>';
const fact=(s,v)=>'<div><div class="factlabel">'+s+'</div><div class="factvalue">'+v+'</div></div>';
const detail=(id,s)=>{$(id).textContent=s;};
function clear(s='Ricalcola il mark CVI per la scadenza selezionata.'){
 last=null;for(const id of ['crFacts','crChart','crRows','crWitness'])$(id).replaceChildren();$('crExport').disabled=true;detail('crStatus',s);
}
function snapshot(){const state=root.Desk?.state;return state?.result?.ws&&!state.stale?state.result:null;}
function draw(r){
 const width=760,height=215,l=73,t=14,rt=741,bot=182,minPower=-10;
 const x=loss=>l+(rt-l)*loss/65,y=p=>bot-(bot-t)*Math.max(0,Math.min(1,(Math.log10(Math.max(10**minPower,p))-minPower)/-minPower));
 const text=(xx,yy,label,anchor='middle')=>'<text x="'+xx+'" y="'+yy+'" fill="#bccfe0" font-size="11" text-anchor="'+anchor+'">'+label+'</text>';
 const line=(x1,y1,x2,y2,color,dash='')=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" '+(dash?'stroke-dasharray="4 4"':'')+'/>';
 let content='';
 for(const [p,label] of [[1,'100%'],[.01,'1%'],[1e-4,'0,01%'],[1e-6,'0,0001%'],[1e-8,'10⁻⁶%'],[1e-10,'≤10⁻⁸%']])content+=line(l,y(p),rt,y(p),'#162e45')+text(l-6,y(p)+4,label,'end');
 for(const v of [0,10,20,30,40,50,60])content+=text(x(v),bot+18,'−'+v+'%');
 const series=[['native','#dbd9ca'],['shock','#91d3ec']];
 for(const [key,col] of series){const path=r.rows.map((v,i)=>(i?'L':'M')+x(v.loss).toFixed(2)+' '+y(v[key].p).toFixed(2)).join(' ');content+='<path d="'+path+'" stroke="'+col+'" stroke-width="2" fill="none"/>';for(const v of r.rows)content+='<circle cx="'+x(v.loss)+'" cy="'+y(v[key].p)+'" r="2.7" fill="'+col+'"/>';}
 content+=line(x(r.selected.loss),t,x(r.selected.loss),bot,'#f5f3e9','4');
 $('crChart').innerHTML='<p class="hint">Arancio · Q nativa &nbsp; Azzurro · Q di scenario &nbsp; | &nbsp; Asse verticale logaritmico · segmenti fra le soglie calcolate.</p><svg font-family="Consolas" viewBox="0 0 '+width+' '+height+'" style="width:100%;max-height:270px" role="img" aria-label="Probabilità di ribasso nativa e stressata per le soglie elencate nella tabella">'+content+'</svg>';
 const svg=$('crChart').querySelector('svg');if(svg)svg.onpointerdown=e=>{const a=svg.getBoundingClientRect(),v=Math.max(.1,Math.min(65,((e.clientX-a.left)/a.width*width-l)*65/(rt-l)));$('crLoss').value=v.toFixed(1);refresh();};
}
function refresh(){
 const s=snapshot();
 if(!s){clear();return;}
 try{
  const a=ids.map(id=>$(id).valueAsNumber),params={loss:a[0],forwardDrop:a[1],jump:a[2],weight:a[3]};
  const r=engine.evaluate(s.ws,params);last=r;$('crExport').disabled=false;$('crCursor').value=a[0];
  const v=r.selected,w=r.witness;detail('crStatus',r.symbol+' · cutoff '+r.asof+' ET · fixing '+r.expiry+' · mark '+r.mark.slice(0,12)+' · prezzi in punti SPX.');
  $('crFacts').innerHTML=[fact('Forward nativo / stress',num(r.modelF)+' / '+num(r.stressF)),fact('Strike selezionato',num(v.K)),fact('Put nativa / stress',num(v.native.put,5)+' / '+num(v.shock.put,5)),fact('Media al fixing se sotto strike · nativa / stress',num(v.native.meanBelow)+' / '+num(v.shock.meanBelow))].join('');
  $('crRows').innerHTML=r.rows.map(v=>'<tr'+(v.loss===a[0]?' class="selected"':'')+'>'+[num(v.loss,1)+'%',num(v.K),pp(v.native.p),pp(v.bounds.low)+' – '+pp(v.bounds.high),pp(v.shock.p),num(v.native.put,5)+' / '+num(v.shock.put,5),v.region].map(cell).join('')+'</tr>').join('');
  draw(r);detail('crWitness',w?'Sotto '+num(w.join)+' SPX la massa Q del mark è '+pp(w.mass)+', con media condizionata '+num(w.conditionalMean)+' SPX. Alla soglia '+num(w.threshold)+', la prima legge assegna '+pp(w.firstCDF)+' e la seconda '+pp(w.secondCDF)+'. Entrambe riprezzano tutti gli strike ammessi.':'Per vedere due esempi scegli una soglia sotto '+num(r.join)+' SPX. Gli esempi richiedono massa e media di coda numericamente risolvibili.');
 }catch(e){clear(e.message);}
}
function preset(v){ids.forEach((s,i)=>$(s).value=v[i]);refresh();}
for(const id of ids)$(id).oninput=refresh;
$('crCursor').oninput=()=>{$('crLoss').value=$('crCursor').value;refresh();};
$('crBase').onclick=()=>preset([10,0,0,0]);$('crSelloff').onclick=()=>preset([10,3,8,3]);$('crSevere').onclick=()=>preset([20,10,25,10]);
$('crExport').onclick=()=>{const s=snapshot();if(!last||!s||s.ws.cvi.marks.candidateFingerprint!==last.mark)return clear();const h=['symbol','cutoff_ET','expiry','mark_sha256','forward','stress_forward','forward_drop_pct','jump_pct','weight_pct','loss_pct','strike','Q_native','Q_market_lower','Q_market_upper','Q_scenario','native_put','scenario_put','native_conditional_mean','scenario_conditional_mean'];const rows=last.rows.map(v=>[last.symbol,last.asof,last.expiry,last.mark,last.modelF,last.stressF,last.settings.forwardDrop,last.settings.jump,last.settings.weight,v.loss,v.K,v.native.p,v.bounds.low,v.bounds.high,v.shock.p,v.native.put,v.shock.put,v.native.meanBelow,v.shock.meanBelow]);root.CVIDeskFiles.csv('Quantistes_Stress_'+last.expiry+'.csv',h,rows);};
root.CrashTerminal={clear,refresh};
})(globalThis);
