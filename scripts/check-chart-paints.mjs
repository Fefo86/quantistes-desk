import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {chartColors, chartRendererIds, densityColors, themeChartSource} from './theme-chart-source.mjs';

const digest = text => createHash('sha256').update(text).digest('hex');

// Independent shape test. Colors and label fonts are normalized; coordinates,
// values, alpha, tick formatting, units, all other strings, operators and calls remain.
function shape(text, allowTriples = false) {
  let form = text.replace(/#[a-f\d]{6}(?!\w)/gi, '~hex~')
    .replace(/(rgba?\()\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}(?=[,)])/g, '$1~rgb~')
    .replace(/\b(?:\d+(?:\.\d+)?px )?(?:Consolas|IBM Plex Mono)\b/g, '~font~')
    .replace(/Math\.min\([23],((?:root|window|w)\.devicePixelRatio\|\|1)\)/g, 'Math.min(~pixel-cap~,$1)');
  if (allowTriples) form = form.replace(/\[\d{1,3},\d{1,3},\d{1,3}\]/g, '[~rgb~]');
  return form;
}
const rgbPrograms = new Set(['quantistes-flow-engine','qtQ16Runtime','quantistes-v7-operational','desk-strike-field']);
function validateAtlas(a, b) {
  const inputs = [], outputs = [];
  function split(body, list) {
    return Buffer.from(body,'base64').toString('utf8').replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi, (_,open,kind,inner,close)=>{
      list.push({open,kind,inner}); return open + '~body~' + close;
    });
  }
  assert.equal(split(a,inputs), split(b,outputs),'Atlas document structure outside programs');
  assert.equal(inputs.length,outputs.length);
  let dataIslands = 0;
  for (let i=0;i<inputs.length;i++) {
    const x=inputs[i],y=outputs[i];
    if (x.kind==='script' && /\btype=/.test(x.open)) {
      assert.equal(y.inner,x.inner,x.open); dataIslands++; continue;
    }
    if (x.kind==='script') new vm.Script(y.inner);
    // The separate srcdoc needs one local face declaration; no extra executable will load.
    const at = x.kind==='style' ? y.inner.indexOf('\n@font-face{font-family:"IBM Plex Mono"') : -1;
    const base = at<0 ? y.inner : y.inner.slice(0,at);
    if (at>=0) {
      const css = y.inner.slice(at);
      assert.equal(css.match(/url\([^)]*\)/g)?.join(), 'url("/ui-fonts/ibm-plex-mono-latin-400-normal.woff2")');
      assert(!/[<>@]import/i.test(css));
    }
    assert.equal(shape(x.inner),shape(base),'Atlas ' + x.open);
  }
  assert.equal(dataIslands,3);
}

// For check-export, supply the original value from disk and the actual text delivered by
// the assembled HTML. The existing canonical SHA check is an independent first assertion.
export function assertChartDelivery(key, canonical, actual) {
  assert.equal(actual,themeChartSource(key,canonical), 'Unexpected bytes delivered by ' + key);
  if (canonical === actual) return false;
  if (key==='q16ChartDocument') validateAtlas(canonical,actual);
  else {
    new vm.Script(actual,{filename:key});
    assert.equal(shape(canonical,rgbPrograms.has(key)),shape(actual,rgbPrograms.has(key)), 'Non-paint delta in ' + key);
  }
  return true;
}

function checkES(desk,nodes) {
  const get = id => fs.readFileSync(path.join(desk,nodes.find(n=>n.id===id).path),'utf8');
  const archive = JSON.parse(gunzipSync(Buffer.from(get('qt360-paths-data'),'base64')));
  function sample(painted) {
    const ctx = vm.createContext({Intl,console,document:{readyState:'loading',addEventListener(){}},addEventListener(){}});
    ctx.window=ctx;ctx.self=ctx;
    for(const id of ['desk-measures','quantistes-v26-realized-multitf','studio-studio']) vm.runInContext(painted?themeChartSource(id,get(id)):get(id),ctx);
    ctx.Quantistes360={data:()=>archive};
    const before=20261116,start=585,h=30,row=archive.rows.find(r=>r[9]===before&&r[1]===start);
    const model=ctx.QuantistesRealizedMulti.analyze({before,start,h,spot:0,vix:row[0]/100,band:8,target:4});
    assert.equal(model.N,153);
    const mesh=ctx.DeskStudio.densityMesh(model.sel,h,-40,40,x=>58+x*754/h,y=>342-(y+40)*315/80);
    return {svg:mesh.svg,cells:JSON.stringify(mesh.counts),outside:JSON.stringify(mesh.outside)};
  }
  const a=sample(false),b=sample(true);
  assert.equal(shape(a.svg),shape(b.svg),'ES density paths and visible labels');
  assert.equal(a.cells,b.cells,'ES 44 × 31 density cell values');
  assert.equal(a.outside,b.outside,'ES out-of-chart observations');
  for (const paint of densityColors) assert(b.svg.includes('fill="' + paint + '"'));
  const es=themeChartSource('institutional-desk',get('institutional-desk'));
  for (const [role,expected] of Object.entries({gold:chartColors.amber,green:chartColors.green,red:chartColors.red,open:chartColors.cyan})) {
    assert(es.includes(role+":'"+expected+"'"),role);
  }
  // Black/white, price, up/down, neutral and dispersion have separate device-independent pigments.
  assert(new Set([chartColors.paper,chartColors.ink,chartColors.amber,chartColors.cyan,chartColors.magenta,chartColors.green,chartColors.red]).size===7);
}

function checkSources(desk) {
  const nodes=JSON.parse(fs.readFileSync(path.join(desk,'document.json'))).nodes;
  let programs=0, data=0, changed=0;
  for(const n of nodes.filter(n=>n.kind==='js'||n.kind==='data')) {
    const raw=fs.readFileSync(path.join(desk,n.path),'utf8'),key=n.id||n.path;
    assert.equal(digest(raw),n.sha256,n.path);
    if(assertChartDelivery(key,raw,themeChartSource(key,raw))) changed++;
    if(n.kind==='js') programs++; else data++;
  }
  assert.equal(changed,chartRendererIds.length);
  checkES(desk,nodes);
  console.log(`${programs} canonical programs, ${data} data blocks, ${changed-1} themed programs and one themed Atlas shell. Its 3 embedded datasets, ES counts and all 1,364 grid cells match.`);
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkSources(path.resolve(process.argv[2] || 'desk'));
}
