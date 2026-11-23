import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'out');
const html = fs.readFileSync(path.join(out,'index.html'),'utf8');
const nodes = JSON.parse(fs.readFileSync(path.join(root,'desk/document.json'))).nodes;
const mounted = [];
const delivered = new Map();
function record(el) { mounted.push(el); if (el.id) delivered.set(el.id,el); }
const doc = { currentScript:{before:record}, createElement:() => ({textContent:''}), getElementById:id => delivered.get(id) };
const pdf = {bytes:async id => doc.getElementById('inst-bin-' + id).textContent, ingest(){}, region(){}, recognize(){}};
const delivery = vm.createContext({ document:doc, window:{InstPdf:pdf}, fetch:async location => ({ok:true,text:async () => fs.readFileSync(path.join(out,location),'utf8')}) });
for (const tag of html.matchAll(/<script\b([^>]*?)\bsrc="(\/terminal\/[^"]+)"[^>]*><\/script>/g)) {
  const file = fs.readFileSync(path.join(out, tag[2]), 'utf8');
  if (tag[2].startsWith('/terminal/plotly.')) record({id:'qt360-plotly',textContent:file});
  else vm.runInContext(file,delivery);
}
for (const node of nodes.filter(node => node.id?.startsWith('inst-bin-'))) await pdf.bytes(node.id.slice(9));
const expected = nodes.filter(n => n.kind === 'js' || n.kind === 'data');
assert.equal(mounted.length,expected.length);
for (const [i,item] of expected.entries()) {
  assert.equal(mounted[i].id || null,item.id);
  assert.equal(createHash('sha256').update(mounted[i].textContent).digest('hex'),item.sha256,item.path);
}
console.log('Ordine e SHA-256 dei 111 programmi e dei 20 blocchi dati corrispondenti nell’export.');
const ctx = vm.createContext({Intl,console,document:{readyState:'loading',addEventListener(){}},addEventListener(){}});
ctx.window=ctx; ctx.self=ctx;
const run = id => vm.runInContext(delivered.get(id).textContent,ctx);
const unpack = id => JSON.parse(gunzipSync(Buffer.from(delivered.get(id).textContent,'base64')));
for (const id of ['desk-measures','quantistes-v26-realized-multitf','oa-reference']) run(id);
const archive = unpack('qt360-paths-data');
ctx.Quantistes360 = {data:() => archive};
const model=ctx.QuantistesRealizedMulti;
for (const [before, start, h, N, longCounts, shortCounts, bias] of [
  [20261116,585,30,153,[65,88,0],[72,81,0],'NEUTRALE'],
  [20261012,660,60,115,[45,70,0],[58,57,0],'NEUTRALE'],
  [20260313,585,30,0,[0,0,0],[0,0,0],'ATTESA']
]) {
  const row = archive.rows.find(r => r[9] === before && r[1] === start);
  const sample = model.analyze({before,start,h,spot:0,vix:row[0]/100,band:8,target:4});
  assert.equal(sample.N,N);
  const long=ctx.DeskMeasures.barriers(sample.sel,1,16,12,1);
  const short=ctx.DeskMeasures.barriers(sample.sel,-1,16,12,1);
  for (const [actual, expected] of [[long,longCounts],[short,shortCounts]]) {
    assert.deepEqual([actual.count.target,actual.count.stop,actual.count.timeout],expected);
  }
  assert.equal(ctx.DeskMeasures.choice(long,short),bias);
  if (before === 20261116) assert.deepEqual(Array.from(sample.qr.at(-1), x=>Number(x.toFixed(3))),[-32.8,-9.75,1.25,11.5,25.6]);
}
assert.deepEqual([ctx.OAReference.rows.length,ctx.OAReference.rows[0].price,ctx.OAReference.rows.at(-1).price,ctx.OAReference.basis],[48,6938.5,6821,27.25]);
for (const id of ['core-data','core-fit','core-cert','core-lab-engine','core-marks','core-bounds','core-intraday','quant-core-script']) run(id);
const flow=unpack('quantistes-flow-embedded'), q=ctx.QuantCore;
const input=q.parseCSV(flow.chainRaw), symbol='SPXW', expiry=flow.chainExpiry, asof=q.snapshotInfo(input.rows,{symbol,expiry}).latest;
const result=q.compute(input.rows,{asof,symbol,expiry,settlement:flow.targetAnchor,target:expiry+'T16:00',cviFiles:[{name:'all7(2).csv',text:flow.chainRaw}],sensitivity:false});
assert.equal(result.selectedRows,556);
assert.equal(result.quality.level,'amber');
assert.equal(result.ippo.levels.length,17);
assert.equal(result.ws.levels.length,17);
assert.equal(result.ws.qAudit.outsideQuotes.length,0);
assert.ok(Math.abs(result.forward.F-7364.225431483464)<1e-9);
assert.ok(Math.abs(result.ws.ivATM-.2776189237250228)<1e-12);
console.log('Scoreboard ES (3 sedute/orizzonti), scalping e mark CVI/SPXW verificati.');
