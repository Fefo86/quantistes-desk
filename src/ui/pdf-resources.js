function connectPdfResources(paths) {
  const pending = new Map();
  function fill(key) {
    const id = 'inst-bin-' + key;
    if (!paths[id] || document.getElementById(id).textContent) return Promise.resolve();
    if (!pending.has(id)) {
      pending.set(id, fetch(paths[id], { credentials: 'same-origin' }).then(async response => {
        if (!response.ok) throw Error('Impossibile caricare la risorsa PDF/OCR (' + response.status + ').');
        document.getElementById(id).textContent = await response.text();
      }).finally(() => pending.delete(id)));
    }
    return pending.get(id);
  }
  let installed = false;
  function install() {
    if (installed) return true;
    const native = window.InstPdf;
    if (!native) return false;
    const all = Object.keys(paths).map(id => id.slice('inst-bin-'.length));
    for (const [name, keys] of [['ingest', all], ['region', ['ocr','ocrworker','ocrcore','eng']], ['recognize', ['ocr','ocrworker','ocrcore','eng']]]) {
      const original = native[name];
      native[name] = async (...args) => {
        await Promise.all(keys.map(fill));
        return original(...args);
      };
    }
    const bytes = native.bytes;
    native.bytes = async key => { await fill(key); return bytes(key); };
    installed = true;
    return true;
  }
  if (!install()) {
    // Parser-inserted and dynamically inserted classic scripts may finish in separate queues.
    document.addEventListener('DOMContentLoaded', install, { once:true });
    window.addEventListener('load', install, { once:true });
  }
}
