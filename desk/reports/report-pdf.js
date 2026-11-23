
(function(w){
'use strict';
const $=id=>document.getElementById(id),promises=new Map(),links=[];
function once(k,fn){if(!promises.has(k))promises.set(k,Promise.resolve().then(fn).catch(e=>{promises.delete(k);throw e;}));return promises.get(k);}
async function bytes(id){const s=$('inst-bin-'+id)?.textContent;if(!s)throw Error('Componente di lettura assente.');const data=Uint8Array.from(atob(s.trim()),c=>c.charCodeAt(0));return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
function url(parts,type){const u=URL.createObjectURL(new Blob(parts,{type}));links.push(u);return u;}
function pdfLib(){return once('pdf',async()=>{const [main,worker]=await Promise.all([bytes('pdf'),bytes('pdfworker')]);const lib=await import(url([main],'text/javascript'));lib.GlobalWorkerOptions.workerSrc=url([worker],'text/javascript');return lib;});}
async function ocrLib(){return once('ocr',async()=>{const {lib,lang,workerPath}=await once('ocr-assets',async()=>{const [main,core,worker,eng]=await Promise.all(['ocr','ocrcore','ocrworker','eng'].map(bytes));const mod=await import(url([main],'text/javascript')),lib=mod.default;const lang=url([eng],'application/octet-stream');const prefix='const readLocal=self.fetch.bind(self);self.fetch=(input,init)=>{const u=typeof input==="string"?input:input.url; if(u.endsWith("/eng.traineddata"))return readLocal('+JSON.stringify(lang)+',init); if(/^(blob:|data:)/.test(u))return readLocal(input,init);throw Error("Risorsa OCR esterna disabilitata");};';const workerPath=url([prefix,core,'\n',worker],'text/javascript');return {lib,lang,workerPath};});const engine=await lib.createWorker('eng',lib.OEM.LSTM_ONLY,{workerPath,workerBlobURL:false,langPath:lang,cacheMethod:'none',gzip:false,errorHandler:()=>{}});return engine;});}
async function stopOCR(){const p=promises.get('ocr');if(p){promises.delete('ocr');try{await (await p).terminate();}catch{}}}
class Fonts{async fetch({kind,filename}){const data=await once('fontpack',async()=>JSON.parse(new TextDecoder().decode(await bytes('fonts'))));const value=data[kind+'/'+filename];if(!value)throw Error('Risorsa PDF non disponibile: '+filename);return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}}
function textLines(items){
 const rows=[];const ordered=items.filter(o=>typeof o.str==='string'&&o.str.trim()).map(o=>({s:o.str,x:o.transform[4],y:o.transform[5],h:Math.max(2,o.height||Math.abs(o.transform[3])||7),width:Math.abs(o.width||0)})).sort((a,b)=>b.y-a.y||a.x-b.x);
 for(const z of ordered){let r=rows.at(-1);if(!r||Math.abs(r.y-z.y)>Math.min(3,Math.min(z.h,r.h)*.37)){r={y:z.y,h:z.h,items:[]};rows.push(r);}r.items.push(z);}
 return rows.map(r=>{r.items.sort((a,b)=>a.x-b.x);let s='',right=null;for(const o of r.items){const gap=right===null?0:o.x-right;s+=(s?(gap>Math.max(7,r.h*1.3)?'\t':gap>r.h*.14?' ':''):'')+o.s;right=o.x+o.width;}return s;});
}
async function canvasPage(page,scale=2){const natural=page.getViewport({scale:1}),factor=Math.min(scale,Math.sqrt(6200000/(natural.width*natural.height))),vp=page.getViewport({scale:factor});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvas,viewport:vp,annotationMode:0,background:'white'}).promise;return canvas;}
function crop(canvas,box,mult=1,mono=false){
 const [x,y,wd,ht]=box,W=canvas.width,H=canvas.height,dt=document.createElement('canvas');dt.width=Math.max(1,Math.round(wd*W*mult));dt.height=Math.max(1,Math.round(ht*H*mult));const c=dt.getContext('2d',{willReadFrequently:true});c.fillStyle='white';c.fillRect(0,0,dt.width,dt.height);c.drawImage(canvas,x*W,y*H,wd*W,ht*H,0,0,dt.width,dt.height);
 if(mono){const a=c.getImageData(0,0,dt.width,dt.height),v=a.data;for(let i=0;i<v.length;i+=4){const k=Math.max(v[i],v[i+1],v[i+2])<135?0:255;v[i]=v[i+1]=v[i+2]=k;}c.putImageData(a,0,0);}return dt;
}
function blob(c){return new Promise((resolve,reject)=>c.toBlob(r=>r?resolve(r):reject(Error('Pagina non rasterizzabile.')),'image/png'));}
async function recognize(canvas,psm='3',digits=false){
 const worker=await ocrLib();await worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:digits?'0123456789.,-%xX×+':'',preserve_interword_spaces:'1'});
 const o=await worker.recognize(await blob(canvas),{}, {text:true});return o.data.text||'';
}
async function region(canvas,box,psm='6',mult=1.5,digits=false,mono=false){const c=crop(canvas,box,mult,mono);try{return await recognize(c,psm,digits);}finally{c.width=c.height=1;}}
async function ingest(file,id,progress){
 const C=w.InstCore,lib=await pdfLib(),task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWorkerFetch:false,BinaryDataFactory:Fonts,disableFontFace:true,useSystemFonts:false,enableXfa:false,verbosity:0});
 task.onPassword=()=>{task.destroy().catch(()=>{});};let pdf,b=C.book();
 try{pdf=await task.promise;b.name=file.name;b.id=id;b.size=file.size;b.ingested=Date.now();let bofa=false;
 for(let i=1;i<=pdf.numPages;i++){progress(i,pdf.numPages);const page=await pdf.getPage(i);let canvas=null,ls=[],ocr=false,extra=[];
 try{const tx=await page.getTextContent(),native=textLines(tx.items);ls=native;ocr=native.join('').replace(/\s/g,'').length<90;
 const canvasFor=async()=>canvas||(canvas=await canvasPage(page,2.35));
 if(ocr)ls=(await recognize(await canvasFor())).split(/\r?\n/);
 if(!ocr){try{const ops=await page.getOperatorList(),pix=new Set([lib.OPS.paintImageXObject,lib.OPS.paintInlineImageXObject]);const illustrated=ops.fnArray.some((op,j)=>{if(!pix.has(op))return false;const a=ops.argsArray[j];return Number(a?.[1]||a?.[0]?.width)*Number(a?.[2]||a?.[0]?.height)>85000;});if(illustrated){const known=new Set(native.map(w.ReportIntel.normal));extra=(await recognize(await canvasFor())).split(/\r?\n/).filter(line=>line.trim()&&!known.has(w.ReportIntel.normal(line)));}}catch(e){b.errors.push({page:i,msg:'Lettura dello strato grafico incompleta.'});}}
 if(i===1)bofa=/systematic flows monitor/i.test(ls.join(' '))&&/BofA|Bank of America/i.test(ls.join(' '));
 if(bofa){await w.InstBofa.page(b,i,ls,ocr,canvasFor,region);}
 else {C.parsePage(b,i,ls,{ocr,filename:file.name});}
 if(!ls.join('').trim())b.errors.push({page:i,msg:'Pagina priva di testo leggibile'});}
 catch(e){b.errors.push({page:i,msg:String(e.message||e).slice(0,170)});}
 finally{if(ls.length){if(!b.segment)C.parsePage(b,i,[],{filename:file.name});w.ReportIntel?.capture(b,i,ls,ocr);if(extra.length){w.ReportIntel?.capture(b,i,extra,true);b.mixedPages=(b.mixedPages||0)+1;}}if(canvas)canvas.width=canvas.height=1;page.cleanup();}
 }
 b.extraction=2;b.pages=pdf.numPages;if(!b.textPages?.length&&b.errors.length&&b.errors.every(e=>!e.msg.includes('priva')))throw Error('Lettura PDF non completata · '+b.errors[0].msg);
 if(!b.segments.length)C.parsePage(b,1,[],{filename:file.name});delete b.ctx;delete b.segment;delete b.pageKeys;return b;
 }catch(e){if(!pdf&&/password|destroy|abort/i.test(String(e)))throw Error('Il PDF richiede una copia sbloccata.');throw e;}
 finally{await task.destroy().catch(()=>{});}
}
w.InstPdf={ingest,bytes,textLines,region,crop,stopOCR,canvasPage,recognize};
})(window);

