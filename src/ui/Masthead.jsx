import { Icon } from './Icon';
import QuantSurface from './QuantSurface';

export function Masthead({ view, section, navOpen, toggleNav, menuRef }) {
  return <div className="qx-mainhead">
    <header className="qx-top">
      <button className="qx-icon mobile-only" ref={menuRef} aria-label="Apri navigazione" aria-expanded={navOpen} aria-controls="desk-navigation" onClick={toggleNav}><Icon name="menu"/></button>
      <span className="qx-crumb"><Icon name="terminal" size={17}/><b>Institutional Desk</b><i>/</i><span>{section.title}</span></span>
      <div className="qx-top-actions">
        <button className="qx-search" aria-label="Cerca strumento" disabled={!view.ready} onClick={() => window.Quantistes15?.search()}><Icon name="search" size={16}/><span>Cerca strumento</span><kbd>Ctrl K</kbd></button>
        <button className="qx-replay" aria-label={view.replay} disabled={!view.ready || view.replayBusy} onClick={() => document.getElementById('q13Demo')?.click()}><Icon name="replay" size={16}/><span>{view.replay}</span></button>
      </div>
    </header>
    <section className="qx-hero" id="desk-intestazione" aria-labelledby="desk-page-title" tabIndex="-1">
      <div className="qx-hero-copy"><p className="qx-overline qx-product"><i aria-hidden="true"/>SPX <em>/</em> ES</p>
        <h1 id="desk-page-title">{section.title}</h1><div className="qx-hero-meta"><p className="qx-sub">{section.sub}</p>{section.id === 'score' && <button className="qx-session" disabled={!view.ready} onClick={() => document.querySelector('.desk-title-action')?.click()}><Icon name="sliders" size={14}/>Parametri sessione</button>}</div>
      </div>
      <div className="qx-visual" aria-hidden="true"><div className="qx-graticule"/><QuantSurface className="qx-surface" style={{ background:'transparent' }}/><span className="qx-cross nw">+</span><span className="qx-cross se">+</span></div>
    </section>
    {view.tape.length > 0 && <div className="qx-tape" aria-label="Prezzi e riferimenti con data e ora">{view.tape.map(c => <span key={c.label}><small>{c.label}</small><b>{c.value}</b><time>{c.time}</time></span>)}</div>}
    {!view.ready && <div className="qx-load" role="status"><span/>Caricamento del desk…</div>}
  </div>;
}
