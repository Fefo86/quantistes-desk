import { useEffect, useRef } from 'react';
import { Icon, Mark } from './Icon';
import { sections } from './sections';

export function Navigation({ view, open, close, navigate, csrf }) {
  const rail = useRef(null);
  useEffect(() => {
    if (!open) return;
    const first = rail.current.querySelector('[data-close]');
    first?.focus();
    function keydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const list = [...rail.current.querySelectorAll('button:not(:disabled)')].filter(x => x.offsetWidth);
      if (e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0]?.focus(); }
    }
    document.addEventListener('keydown',keydown);
    return () => document.removeEventListener('keydown',keydown);
  }, [open,close]);
  return <>
    {open && <button className="qx-scrim" tabIndex={-1} onClick={close} aria-label="Chiudi navigazione"/>}
    <aside className={'qx-rail' + (open ? ' is-open' : '')} ref={rail} id="desk-navigation" role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-label="Navigazione del desk">
      <div className="qx-brand"><span className="qx-mark"><Mark /></span><div><b>Quantistes</b><small>Institutional Desk</small></div>
        <button data-close className="qx-icon mobile-only" onClick={close} aria-label="Chiudi navigazione"><Icon name="close"/></button>
      </div>
      <div className="qx-navgroup"><div className="qx-overline qx-rail-label">Desk workflow</div>
        <nav aria-label="Sezioni del desk">{sections.map(s => <button key={s.id} title={s.title} aria-label={s.title} aria-current={s.id === view.stage ? 'page' : undefined} disabled={!view.ready} onClick={() => navigate(s.id)}>
          <Icon name={s.id} /><span>{s.title}</span>
        </button>)}</nav>
      </div>
      <div className="qx-navgroup qx-utils">
        <div className="qx-overline qx-rail-label">Strumenti</div>
        <button className="qx-rail-action" disabled={!view.ready} onClick={() => { close(false); window.Quantistes15?.settings(); }} title="Dati e parametri" aria-label="Dati e parametri"><Icon name="sliders"/><span>Dati e parametri</span></button>
      </div>
      <div className="qx-rail-bottom">
        <div className="qx-ny" title={view.clock || 'New York'}><Icon name="clock" /><span><small>New York</small><b>{view.clock.replace(/^NEW YORK\s*·\s*/i,'') || '––:––'}</b></span></div>
        {csrf && <form action="/auth/logout" method="post"><input type="hidden" name="csrf" value={csrf}/><button className="qx-rail-action" title="Esci dal desk" aria-label="Esci dal desk"><Icon name="exit"/><span>Esci dal desk</span></button></form>}
        <button className="qx-rail-action qx-collapse" title={view.compact ? 'Espandi navigazione' : 'Comprimi navigazione'} aria-label={view.compact ? 'Espandi navigazione' : 'Comprimi navigazione'} disabled={!view.ready} onClick={() => document.getElementById('qt10RailToggle')?.click()}><Icon name="collapse" /><span>Comprimi</span></button>
      </div>
    </aside>
  </>;
}
