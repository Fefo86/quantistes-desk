/*
 * Project the archived desk into a local-market-data build. Only transport entry
 * points and the associated controls vary. Source archives remain verifiable.
 */
const chainNote = 'Acquisizione da API disattivata. Carica la chain CSV.';
const bridgeNote = 'Bridge ES/VIX disattivato. Importa uno snapshot JSON o CSV.';
const dealerNote = 'Feed dealer disattivato. Importa un file dalla routine giornaliera.';

export const localMarketPolicy = "connect-src 'self' blob: data:";

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
        `async function loadSkewAPI(){skewStatus(${JSON.stringify(chainNote)});}`,file);
    case 'vc10-intake.js':
      // A failed API batch would clear an existing local fit. Exit before queuing it.
      return replaceSection(source,'function beginApi(ids,batch){','function bindApi(){',
        `function beginApi(){el('vc11BatchStatus').textContent=${JSON.stringify(chainNote)};}`,file);
    case 'quantistes-v13-runtime.js':
      return replaceSection(source,'function connectBridge(){','function bindEvents(){',
        `function connectBridge(){const status=$('q13SourceMsg');if(status)status.textContent=${JSON.stringify(bridgeNote)};}`,file);
    case 'daily-hub.js': {
      let local = replaceSection(source,'async function fetchDealer(urlText,gen=generation){','async function click(e){',
        `async function fetchDealer(){throw Error(${JSON.stringify(dealerNote)});}`,file);
      local = replaceSection(local,' if([\'once\',\'poll\'].includes(id)){'," }catch(err){output(['once','poll']",
        ` if(['once','poll'].includes(id)){output('rdFeedState',${JSON.stringify(dealerNote)});return;}`,file);
      // Keep the local sample-file mapper and the format download in this section.
      local = replaceSection(local,'<summary>Connessione dealer · OptionsDepth</summary>', "'+w.DealerAdapter.controls()+'",
        `<summary>Formato file dealer · OptionsDepth</summary><p>Importa un esempio JSON per associare colonne, unità e orari.</p><input id="rdUrl" type="hidden"><div class="rd-actions">'+controls(['format','Tracciato greche'])+'</div>`,file,'');
      return local
        .replace("['api','Scadenza / API'],",'')
        .replace(",['pricebridge','Connetti / ferma prezzi']",'')
        .replace("['od','Connessione dealer']","['od','Formato file dealer']")
        .replace("reveal($('rdUrl'));return;","reveal($('rdSample'));return;")
        .replace('Seleziona la scadenza ThetaData.','Seleziona la chain CSV della scadenza.')
        .replace('con contratto ES e due orari distinti, oppure attiva il bridge prezzi.','con contratto ES e due orari distinti.');
    }
    default:
      return source;
  }
}

// Keep the native DOM IDs available to existing event bindings. In particular,
// skewManualCSV shares a row with the remote SineMath controls.
export const localMarketStyles = `
html :is(#q13Bridge, [data-ql-feed="connect"], [data-rd="api"], [data-rd="pricebridge"]),
html :is(.sk-api:not(.sk-api-card), .sk-api-card label[for^="skApi"], .sk-api-card [id^="skApi"]),
html :is(.vc11-api-actions, .vc11-date, .vc11-title label:has([id^="vc11Pick-"]), [id^="vc11Fetch-"], [id^="vc11State-"]) {
  display:none!important;
}
`;
