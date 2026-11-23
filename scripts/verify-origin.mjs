import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const desk = fileURLToPath(new URL('../desk/', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(desk, 'document.json')));
const digest = createHash('sha256');
const counts = {};
for (const item of manifest.nodes) {
  counts[item.kind] = (counts[item.kind] || 0) + 1;
  if (item.kind === 'space') { digest.update(item.raw); continue; }
  const bytes = fs.readFileSync(path.join(desk, item.path));
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw Error('Frammento modificato: ' + item.path);
  digest.update(item.opening || '').update(bytes).update(item.closing || '');
}
const hash = digest.digest('hex');
if (hash !== manifest.sha256) throw Error('Ordine o delimitatori diversi dal documento originale');
console.log('SHA-256 intero HTML:', hash, counts);
