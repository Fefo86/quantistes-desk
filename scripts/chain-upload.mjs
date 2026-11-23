export function chainUploadField(inputTag) {
  const input = inputTag.replace('id="csvFile"', 'id="csvFile" aria-describedby="qxChainReceipt" title="Scegli uno o più file CSV"');
  return `<div class="qx-chain-upload">
    <label for="csvFile">Scegli file</label>
    <output id="qxChainReceipt" for="csvFile" role="status" aria-live="polite" aria-atomic="true">Nessun file selezionato</output>
    ${input}
  </div>`;
}

function showChainReceipt(phase, files) {
  const receipt = document.getElementById('qxChainReceipt');
  if (!receipt) return;
  let message = 'Caricamento non riuscito';
  if (phase === 'reading') message = 'Lettura in corso…';
  if (phase === 'loaded') message = files.length === 1 ? 'Caricato' : files.length + ' file caricati';
  receipt.dataset.state = phase;
  receipt.textContent = message + ' · ' + files.map(file => file.name).join(' · ');
}

// The native picker resets so the same file can be opened again. Its receipt
// follows the original importer's active request and validated dataset instead.
export function addChainReceipt(source) {
  const start = 'async function importDeskChain(chosen){\n const token=++importId;';
  const finish = '}finally{if(token===importId)syncSession();}';
  if (!source.includes(start) || !source.includes(finish)) {
    throw Error('Verificare i punti di aggiornamento del campo CSV nel gestore di importazione.');
  }
  return source
    .replace(start, () => `${showChainReceipt}\n${start}\n showChainReceipt('reading', chosen);`)
    .replace(finish, `}finally{
  if(token===importId){
   syncSession();
   const accepted = !!state.parsed?.rows.length;
   showChainReceipt(accepted ? 'loaded' : 'error', accepted ? state.files : chosen);
  }
 }`);
}
