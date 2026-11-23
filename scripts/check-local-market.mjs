import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {localMarketPolicy, localMarketSource} from './local-market.mjs';

const root = process.argv[2] || process.cwd();
const source = p => readFileSync(join(root,p),'utf8');
const {nodes} = JSON.parse(source('desk/document.json'));
const scripts = new Map();
for (const n of nodes) {
  if (n.kind !== 'js') continue;
  const p = 'desk/' + n.path;
  const original = source(p);
  const local = localMarketSource(p,original);
  new vm.Script(local,{filename:p});
  scripts.set(p,local);
}

const projected = Object.fromEntries(['desk/volatility/sinemath-api.js','desk/volatility/vc10-intake.js',
  'desk/terminal/quantistes-v13-runtime.js','desk/terminal/terminal-worker.js','desk/reports/daily-hub.js']
  .map(path => [path,scripts.get(path)]));
assert.ok(Object.values(projected).every(Boolean),'Manca uno dei cinque moduli attivi');
for (const [path,s] of Object.entries(projected)) {
  assert.doesNotMatch(s,/\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon)\s*\(/,path);
}
const fetches = [...scripts].filter(([p,s]) => !(p in projected) && !p.includes('/vendor/') && p!=='desk/reports/report-pdf.js' && /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon)\s*\(/.test(s));
assert.deepEqual(fetches.map(([p])=>p),[],'Valutare ogni nuova richiesta o trasporto');
for (const p of Object.keys(projected)) {
  const s=projected[p];
  if(p.includes('vc10-intake'))assert.match(s,/function beginApi\(\)\{el\('vc11BatchStatus'\)/);
  if(p.includes('daily-hub')){
    assert.doesNotMatch(s,/id="rdSecret"|id="rdAuth"|setInterval\(\(\)=>fetchDealer/);
    assert.match(s,/w\.DealerAdapter\.controls\(\)/);
    assert.match(s,/\['format','Tracciato greche'\]/);
    assert.match(s,/\['chain','Chain CSV'\]/);
    assert.match(s,/\['odfiles','CSV nativi OptionsDepth'\]/);
  }
}
const apiContext=vm.createContext({fetch:()=>assert.fail('Rete invocata')});
vm.runInContext(projected['desk/volatility/sinemath-api.js'],apiContext);
await assert.rejects(apiContext.QuantistesAPI.load('2026-11-20'),/CSV/);
assert.match(source('hosting/desk/index.php'),/qd_admitted\(\$config\)/,'Autenticazione WordPress sul gateway Hostinger');
assert.match(source('src/ui/pdf-resources.js'),/fetch\(paths\[id\]/);
assert.match(source('desk/reports/report-pdf.js'),/useWorkerFetch:false/);
assert.match(source('desk/views/058-smile.html'),/id="skewManualCSV"/);
assert.match(localMarketPolicy,/^connect-src 'self' blob: data:$/);
console.log('Verificati '+scripts.size+' moduli originali compilabili, i tre connettori, gli import locali, PDF/OCR e il login WordPress.');
