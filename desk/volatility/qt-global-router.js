
/* Model selection is scoped ONLY to the volatility surface.
 * The single-expiry CVI fit and Quantistes IPPO / Wall Street level motors
 * are deliberately not routed through this selector.
 */
(function(root){
'use strict';
const previous=root.CVIModelRouter,smooth=root.CVISmoothGlobal,cflex=root.CVICFlexGlobal;
if(!previous||!smooth||!cflex)throw Error('Global surface models unavailable.');
const chosen=new WeakMap(),lastFlexible=new WeakMap();
function choice(){return 'CFLEX';}
function selected(g){const f=g&&lastFlexible.get(g);return f?.promotable?f.model:null;}
function select(g,model){return !!g&&model==='CFLEX'&&!!lastFlexible.get(g)?.promotable;}
function analyzeFlexible(g,opts={}){const a=cflex.analyze(g,opts);if(!opts.holdout){lastFlexible.set(g,a);if(a?.model?.ok)chosen.set(g,'CFLEX');}return a;}
function peekFlexible(g){return lastFlexible.get(g)||null;}
function analyzeSmooth(g){return smooth.analyze(g);}
function exportBook(book){
 const base=previous.exportBook(book);
 return base.map((v,i)=>{
  const g=book?.groups?.[i],sm=smooth.peek(g),fl=peekFlexible(g);
  return {...v,selectedModel:choice(g),SMOOTH:sm?sm.model?.audit({sampleCount:9})||sm:{status:'NOT_RUN'},
   CFLEX:fl?fl.model?.audit({sampleCount:9})||fl:{status:'NOT_RUN'},
   surfaceModelIsolation:'CVI_SINGLE_SLICE_AND_IPPO_LEVELS_UNCHANGED'};
 });
}
root.CVIModelRouter=Object.freeze({
 version:'2.0.0',analyze:previous.analyze,peek:previous.peek,ssvi:previous.ssvi,
 butterfly:previous.butterfly,sufficient:previous.sufficient,
 setBook(book){
  previous.setBook(book);
  for(const g of book?.groups||[])if(g?.marketReady&&g.curves?.length>=2&&!lastFlexible.has(g))analyzeFlexible(g,{degree:14,budget:340});
 },book:previous.book,group:previous.group,
 preference:choice,select,get:selected,exportBook,
 analyzeSmooth,peekSmooth:smooth.peek,analyzeFlexible,peekFlexible
});
})(globalThis);

