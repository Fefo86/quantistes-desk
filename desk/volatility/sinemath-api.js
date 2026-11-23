(function (root) {
  'use strict';
  const endpoint = 'https://api.sinemath.app/thetadata/option/snapshot/greeks/all';
  const maxBytes = 35_000_000;
  const timeoutMs = 40_000;

  function urlFor(expiry) {
    if (typeof expiry !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiry))
      throw Error('Scegli una scadenza valida.');
    const midnight = new Date(expiry + 'T00:00:00Z');
    if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== expiry)
      throw Error('La data di scadenza non esiste.');
    return endpoint + '?symbol=SPXW&expiration=' + expiry.replaceAll('-', '') + '&format=csv';
  }

  function tooLarge() {
    return Error('La risposta supera i 35 MB previsti per una singola chain.');
  }

  async function readCSV(response) {
    if (Number(response.headers.get('content-length')) > maxBytes) throw tooLarge();
    const reader = response.body?.getReader?.();
    if (!reader) {
      const source = await response.text();
      if (new Blob([source]).size > maxBytes) throw tooLarge();
      return source;
    }
    const decoder = new TextDecoder('utf-8');
    const parts = [];
    let bytes = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel().catch(() => {});
          throw tooLarge();
        }
        parts.push(decoder.decode(value, {stream: true}));
      }
      parts.push(decoder.decode());
      return parts.join('');
    } finally {
      reader.releaseLock();
    }
  }

  function httpError(response, expiry) {
    const status = response.status;
    if (status === 472) return noData(expiry, status);
    let message = 'Il servizio SineMath ha risposto HTTP ' + status + ' per ' + expiry + '.';
    if (status === 401 || status === 403) message += ' Verifica l’accesso al servizio.';
    else if (status === 404) message += ' Controlla se la scadenza SPXW è disponibile.';
    else if (status === 429) {
      const delay = response.headers.get('Retry-After') || '';
      message += /^\d{1,6}$/.test(delay) ? ' Riprova fra ' + delay + ' s.' : ' Limite di richieste raggiunto. Riprova tra poco.';
    } else if (status >= 500) message += ' Riprova tra poco.';
    const error = Error(message);
    error.status = status;
    return error;
  }

  function noData(expiry, status) {
    const error = Error('Nessun contratto SPXW restituito per ' + expiry + '.');
    error.code = 'NO_DATA';
    if (status) error.status = status;
    return error;
  }

  function validateCSV(source, name, expiry) {
    const prefix = source.trimStart().slice(0, 100);
    if (!prefix) throw Error('SineMath ha restituito un file vuoto per ' + expiry + '.');
    if (source.length < 2048) {
      let note = source.trim();
      if (prefix.startsWith('{') || prefix.startsWith('"')) {
        try {
          const parsed = JSON.parse(note);
          note = typeof parsed === 'string' ? parsed : (parsed.message || parsed.error || parsed.detail || '');
        } catch {}
      }
      if (typeof note === 'string' && /^no data (found|available)( for (your|this) request)?[.!]?$/i.test(note.trim())) throw noData(expiry);
    }
    if (['<', '{', '['].includes(prefix[0])) throw Error('Il servizio ha restituito una pagina o un messaggio al posto del CSV per ' + expiry + '.');
    let dataset;
    try {
      dataset = root.CVIData.parseFiles([{name, text: source}]);
    } catch (error) {
      throw Error('CSV API non leggibile. ' + error.message);
    }
    if (dataset.files[0].inputRows === 0) throw noData(expiry);
    if (!dataset.rows.length) throw Error('La risposta per ' + expiry + ' non contiene contratti con strike e timestamp validi.');
    if (dataset.groups.some(group => group.symbol !== 'SPXW' || group.expiries.some(date => date !== expiry)))
      throw Error('I contratti ricevuti non corrispondono a SPXW con scadenza ' + expiry + '.');
    const usable = dataset.rows.some(q => !q.malformed && (q.bid === null || q.bid >= 0)
      && (q.ask === null || q.ask > 0) && (q.bid > 0 || q.ask > 0)
      && (q.bid === null || q.ask === null || q.bid <= q.ask));
    if (!usable) throw Error('La chain ' + expiry + ' non contiene prezzi bid o ask utilizzabili.');
  }

  function cancelled() {
    return new DOMException('Caricamento annullato.', 'AbortError');
  }

  async function load(expiry, {signal} = {}) {
    const url = urlFor(expiry);
    if (signal?.aborted) throw cancelled();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    let timedOut = false;
    signal?.addEventListener('abort', cancel, {once: true});
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      let source;
      try {
        const response = await root.fetch(url, {
          method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit', signal: controller.signal
        });
        if (!response.ok) throw httpError(response, expiry);
        if (response.status === 204) throw noData(expiry, response.status);
        source = await readCSV(response);
      } catch (error) {
        if (signal?.aborted) throw cancelled();
        if (timedOut) throw Error('SineMath non ha completato la richiesta per ' + expiry + ' entro 40 secondi. Riprova.');
        if (error.name === 'TypeError' || error.name === 'NetworkError')
          throw Error('SineMath non è raggiungibile da questo browser. Verifica la connessione e l’accesso al servizio oppure carica il CSV.');
        throw error;
      }
      if (signal?.aborted) throw cancelled();
      const name = 'SineMath_SPXW_' + expiry + '.csv';
      validateCSV(source, name, expiry);
      const options = {type: 'text/csv;charset=utf-8'};
      if (typeof root.File?.prototype?.text === 'function') return new root.File([source], name, options);
      const file = new Blob([source], options);
      Object.defineProperty(file, 'name', {value: name});
      return file;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.abort();
    }
  }

  root.QuantistesAPI = Object.freeze({urlFor, load});
})(globalThis);
