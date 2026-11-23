import { Icon, Mark } from './Icon';
import { CommandLine } from './CommandLine';
import { Navigation } from './Navigation';

export function Masthead({ view, section, navigate, csrf }) {
  function importThetaCsv() {
    const input = document.getElementById('csvFile');
    if (!input) return;
    window.Quantistes15?.settings();
    input.scrollIntoView({ block: 'center' });
    input.click();
  }
  return <>
    <header className="qx-console">
      <div className="qx-titlebar">
        <div className="qx-brand"><span className="qx-mark"><Mark/></span><b>Quantistes</b><span className="qx-brand-desk">Institutional Desk</span></div>
        <div className="qx-actions">
          <span className="qx-clock" title="Ora di New York"><span>NY</span> <time>{view.clock.replace(/^NEW YORK\s*·\s*/i,'') || '––:––'}</time></span>
          <button type="button" disabled={!view.ready || view.replayBusy} onClick={() => document.getElementById('q13Demo')?.click()} aria-label="Replay storico"><Icon name="replay" size={15}/><span>{view.replayBusy ? 'Caricamento…' : 'Replay'}</span></button>
          <button className="qx-session" type="button" disabled={!view.ready} onClick={() => window.Quantistes15?.settings()} aria-label="Dati e parametri"><Icon name="sliders" size={15}/><span>Parametri</span></button>
          {csrf && <form action="/auth/logout" method="post"><input type="hidden" name="csrf" value={csrf}/><button type="submit" aria-label="Esci dal desk"><Icon name="exit" size={15}/><span>Esci</span></button></form>}
        </div>
      </div>
      <div className="qx-command-row">
        <CommandLine ready={view.ready} navigate={navigate}/>
        <button className="qx-import-csv" type="button" disabled={!view.ready} onClick={importThetaCsv}
          title="Importa CSV ThetaData" aria-label="Importa CSV ThetaData">
          <Icon name="upload" size={15}/><span><span className="qx-import-verb">Importa </span>CSV ThetaData</span>
        </button>
        <details className="qx-feeds"><summary><i aria-hidden="true"/>Dati locali</summary>
          <div className="qx-feeds-pop"><strong>Sorgenti dati</strong>
            <dl><div><dt>Importazione CSV ThetaData</dt><dd className="qx-import-active">Attiva</dd></div>
              {['API SineMath / ThetaData','API bridge ES / VIX','API OptionsDepth'].map(name => <div key={name}><dt>{name}</dt><dd>Disattivata</dd></div>)}
            </dl>
          </div>
        </details>
      </div>
      <Navigation ready={view.ready} active={view.stage} navigate={navigate}/>
    </header>
    <div className="qx-viewhead" id="desk-intestazione" tabIndex="-1">
      <div className="qx-heading"><span className="qx-function-code">{section.code}</span><h1 id="desk-page-title">{section.title}</h1><span className="qx-context">{section.context}</span></div>
      {view.tape.length > 0 && <dl className="qx-tape" aria-label="Riferimenti di mercato">{view.tape.map(row =>
        <div key={row.label}><dt>{row.label}</dt><dd>{row.value} <time>{row.time}</time></dd></div>)}</dl>}
    </div>
    {!view.ready && <div className="qx-load" role="status">Caricamento del desk…</div>}
  </>;
}
