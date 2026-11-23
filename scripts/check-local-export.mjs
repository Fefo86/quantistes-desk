import { strict as assert } from 'node:assert';
import { readFileSync,readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir=process.argv[2];
if (!dir) throw Error('Indicare la directory della build statica.');
const doc=readFileSync(join(dir,'index.html'),'utf8').replace(/&#(?:x27|39);|&apos;/gi,"'");
assert.match(doc,/<meta\b(?=[^>]*http-equiv=["']Content-Security-Policy)(?=[^>]*connect-src 'self' blob: data:)[^>]*>/i,'Policy di rete mancante nel documento');
const assets=readdirSync(join(dir,'terminal')).filter(name=>/^block-.*\.js$/.test(name));
assert.ok(assets.length,'Bundle dei motori mancanti');
const scripts=assets.map(f=>readFileSync(join(dir,'terminal',f),'utf8')).join('\n');
assert.doesNotMatch(scripts,/127\.0\.0\.1:8787\/snapshot|api\.sinemath\.app\/thetadata|fetch\(url\.href,\{headers,redirect/,'Presente un trasporto originario');
for(const s of ['Bridge ES/VIX disattivato','Acquisizione da API disattivata','Feed dealer disattivato','Formato file dealer']) assert.ok(scripts.includes(s),'Manca il gestore locale '+s);
for (const id of ['csvFile','skewManualCSV','vc10Slot-0d','q13SnapshotFile']) {
 const all=doc+scripts; assert.ok(all.includes(id),'Ingresso locale mancante '+id);
}
const lazy=readdirSync(join(dir,'terminal')).filter(s=>/^inst-bin-.*\.txt$/.test(s));
assert.equal(lazy.length,7,'Pacchetti PDF/OCR mancanti');
console.log('Documento, '+assets.length+' bundle terminale e '+lazy.length+' risorse PDF/OCR statiche verificati.');
