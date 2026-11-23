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
function tagWithId(id) {
 const match=doc.match(new RegExp('<(?:button|input)\\b[^>]*\\sid="'+id+'"[^>]*>', 'i'));
 assert.ok(match,'Controllo mancante '+id);
 return match[0];
}
const uploadField=doc.match(/<div class="qx-chain-upload">([\s\S]*?)<\/div>/)?.[1];
assert.ok(uploadField,'Campo di conferma dello snapshot opzioni mancante');
assert.match(uploadField,/<label for="csvFile">Scegli file<\/label>/);
assert.match(uploadField,/<output\b[^>]*id="qxChainReceipt"[^>]*role="status"[^>]*>Nessun file selezionato<\/output>/);
assert.ok(uploadField.includes(tagWithId('csvFile')));
assert.match(tagWithId('csvFile'),/aria-describedby="qxChainReceipt"/);
assert.equal((doc.match(/\sid="csvFile"/g)||[]).length,1,'Il selettore CSV deve essere unico');
const tenors=['0d','1w','2w','1m','3m','6m','1y'];
for (const id of ['csvFile','sessionFile','skewManualCSV','q13SnapshotFile','tmChain','dxImportFile',
 'vc10Batch',...tenors.map(id=>'vc10File-'+id),'skApiNext-side','skApiDate-mon']) {
 assert.doesNotMatch(tagWithId(id),/\sdisabled\b/,'Importazione o selezione locale disabilitata '+id);
}
for (const id of ['skApiLoad-skew','skApiLoad-side','skApiLoad-mon','vc11FetchSet','vc11Retry','q13Bridge',...tenors.map(id=>'vc11Fetch-'+id)]) {
 assert.match(tagWithId(id),/\sdisabled\b/,'Comando API attivo '+id);
}
assert.match(doc,/aria-label="Importa CSV ThetaData"/);
assert.match(doc,/Importazione CSV ThetaData<\/dt><dd[^>]*>Attiva</);
const lazy=readdirSync(join(dir,'terminal')).filter(s=>/^inst-bin-.*\.txt$/.test(s));
assert.equal(lazy.length,7,'Pacchetti PDF/OCR mancanti');
console.log('Documento, '+assets.length+' bundle terminale e '+lazy.length+' risorse PDF/OCR statiche verificati.');
