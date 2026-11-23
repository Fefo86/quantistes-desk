(function(w){
 function go(id,t,k,coord){return w.OADashboard?.openAt(id,t,k,coord)??false;}
 w.ScalpUI=Object.freeze({refresh:()=>w.OADashboard?.refresh(),openAt:go,openReplayAt:go,inspect:()=>{
  const s=w.OADashboard?.state();return s?.id?.startsWith('flow:')?{...s,id:s.id.slice(5)}:null;
 }});
})(window);