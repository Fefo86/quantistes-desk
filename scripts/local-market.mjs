/*
 * Project the archived desk into a local-market-data build. Only transport entry
 * points and the associated controls vary. Source archives remain verifiable.
 */
const chainNote = 'Acquisizione da API disattivata. Carica la chain CSV.';
const bridgeNote = 'Bridge ES/VIX disattivato. Importa uno snapshot JSON o CSV.';
const dealerNote = 'Feed dealer disattivato. Importa un file dalla routine giornaliera.';

export const localMarketPolicy = "connect-src 'self' blob: data:";

// These are network actions. File inputs, labels, date pickers and their
// containers keep their native behavior, even when they share the same row.
const remoteButtonId = /\bid="(?:skApiLoad-(?:mon|skew|side)|vc11Fetch(?:Set|-(?:0d|1w|2w|1m|3m|6m|1y))|vc11Retry|q13Bridge)"/;
const disabledAttributes = ' disabled title="API disattivata"';

export function localMarketMarkup(html) {
  return html.replace(/<button\b[^>]*>/gi, tag => remoteButtonId.test(tag)
    ? tag.slice(0,-1) + disabledAttributes + '>'
    : tag);
}

function replaceSection(source, start, end, replacement, file, separator = '\n') {
  const from = source.indexOf(start);
  const until = source.indexOf(end, from + start.length);
  if (from < 0 || until < 0 || source.indexOf(start,from + 1) >= 0) {
    throw Error('Controllare la proiezione dei connettori dopo la modifica di ' + file + ' (' + start + ')');
  }
  return source.slice(0,from) + replacement + separator + source.slice(until);
}

export function localMarketSource(file, source) {
  const path = file.split('/').at(-1);
  switch (path) {
    case 'sinemath-api.js':
      return `(function(root){'use strict'; const disabled=()=>{throw Error(${JSON.stringify(chainNote)});};
root.QuantistesAPI=Object.freeze({urlFor:disabled,load:async()=>disabled()});})(globalThis);`;
    case 'terminal-worker.js':
      return replaceSection(source,'async function loadSkewAPI(){','for(const id of skewApiViews){\n const input=',
        `async function loadSkewAPI(){skewStatus(${JSON.stringify(chainNote)});}`,file)
        .replace("$('skApiLoad-'+id).disabled=busy;", "$('skApiLoad-'+id).disabled=true;");
    case 'vc10-intake.js':
      // A failed API batch would clear an existing local fit. Exit before queuing it.
      return replaceSection(source,'function beginApi(ids,batch){','function bindApi(){',
        `function beginApi(){el('vc11BatchStatus').textContent=${JSON.stringify(chainNote)};}`,file)
        .replace("el('vc11Fetch-'+id).disabled=pending||!!reads.size||!el('vc11Expiry-'+id).value;", "el('vc11Fetch-'+id).disabled=true;")
        .replace("el('vc11FetchSet').disabled=pending||!!reads.size||!selected.length;", "el('vc11FetchSet').disabled=true;");
    case 'quantistes-v13-runtime.js':
      return replaceSection(source,'function connectBridge(){','function bindEvents(){',
        `function connectBridge(){const status=$('q13SourceMsg');if(status)status.textContent=${JSON.stringify(bridgeNote)};}`,file);
    case 'quantistes-v15-runtime.js':
      // Bring the original 09:45 CSV form and its bound handlers into its workspace.
      return source.replace("const dock=$('dx-global-dock'),flow=$('view-flows');",
        "const daily=$('qdBar');if(daily&&daily.parentNode!==div)div.prepend(daily);\n  const dock=$('dx-global-dock'),flow=$('view-flows');");
    case 'quantistes-v23-ux-only.js':
      return source.replace('data-ql-feed="connect">', 'data-ql-feed="connect"' + disabledAttributes + '>')
        .replace('button.title=bridge.textContent;', 'button.title="API disattivata";');
    case 'daily-hub.js': {
      let local = replaceSection(source,'async function fetchDealer(urlText,gen=generation){','async function click(e){',
        `async function fetchDealer(){throw Error(${JSON.stringify(dealerNote)});}`,file);
      local = replaceSection(local,' if([\'once\',\'poll\'].includes(id)){'," }catch(err){output(['once','poll']",
        ` if(['once','poll'].includes(id)){output('rdFeedState',${JSON.stringify(dealerNote)});return;}`,file);
      // Keep the local sample-file mapper and the format download in this section.
      local = replaceSection(local,'<summary>Connessione dealer · OptionsDepth</summary>', "'+w.DealerAdapter.controls()+'",
        `<summary>Formato file dealer · OptionsDepth</summary><p>Importa un esempio JSON per associare colonne, unità e orari.</p><input id="rdUrl" type="hidden"><div class="rd-actions">'+controls(['format','Tracciato greche'],['once','Leggi da API'],['poll','Avvia aggiornamento API'])+'</div>`,file,'');
      return local
        .replace('el.innerHTML=html();hub.prepend(el);', `el.innerHTML=html();for(const button of el.querySelectorAll('[data-rd="once"],[data-rd="poll"],[data-rd="pricebridge"]')){button.disabled=true;button.title="API disattivata";}hub.prepend(el);`)
        .replace("['api','Scadenza / API']","['api','Scadenza SPXW']")
        .replace("['od','Connessione dealer']","['od','Formato file dealer']")
        .replace("reveal($('rdUrl'));return;","reveal($('rdSample'));return;")
        .replace('Seleziona la scadenza ThetaData.','Seleziona la chain CSV della scadenza.')
        .replace('con contratto ES e due orari distinti, oppure attiva il bridge prezzi.','con contratto ES e due orari distinti.');
    }
    default:
      return source;
  }
}

export const localMarketStyles = `
html.quantistes body.q13-on:not(.q13-native) [data-q13-panel="market"].q25-tool-skewfit #view-smile > .sk-api-card {
  display:flex!important;
}
html.quantistes .q25-tool-physical-p #q15DynamicShell > #qdBar {display:block!important}
html.quantistes button[title="API disattivata"]:disabled {opacity:.52;cursor:not-allowed}
`;
