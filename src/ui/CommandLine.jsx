import { useEffect, useRef, useState } from 'react';
import { sections } from './sections';

function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function commands(value) {
  const query = normalize(value);
  if (!query) return [];
  const stages = sections.map(({ id, title, code }) => ({ stage: id, label: title, code }));
  const tools = (window.QuantistesFlatDesk?.catalog() || []).map(item => ({
    stage: item.stage, tool: item.id, label: item.name, code: item.id
  }));
  return [...stages, ...tools].map(item => {
    const fields = [normalize(item.code), normalize(item.label), ...(!item.tool ? [item.stage] : [])];
    const score = fields.some(f => f === query) ? 3 : fields.some(f => f.startsWith(query)) ? 2
      : fields.some(f => f.includes(query)) ? 1 : 0;
    return { ...item, score };
  }).filter(item => item.score).sort((a,b) => b.score - a.score);
}

export function CommandLine({ ready, navigate }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const field = useRef(null);
  const matches = ready && query.trim() ? commands(query) : [];
  const expanded = open && Boolean(query.trim());
  useEffect(() => {
    function focus(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); event.stopImmediatePropagation();
        field.current?.focus(); field.current?.select(); setOpen(true);
      }
    }
    window.addEventListener('keydown', focus, true);
    return () => window.removeEventListener('keydown', focus, true);
  }, []);
  useEffect(() => {
    if (expanded) document.getElementById('qx-result-' + current)?.scrollIntoView({block:'nearest'});
  }, [current, expanded]);
  function choose(item) {
    if (!item) return;
    setOpen(false); setQuery(''); setCurrent(0);
    navigate(item.stage, item.tool);
  }
  function keyboard(event) {
    if (event.key === 'Escape') { setOpen(false); setQuery(''); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (!matches.length) return;
    event.preventDefault(); setOpen(true);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    setCurrent(index => (index + direction + matches.length) % matches.length);
  }
  return <form className="qx-command" role="search" aria-label="Ricerca nel terminale"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onSubmit={event => {
      event.preventDefault();
      if (matches.length) choose(matches[current] || matches[0]);
      else if (query.trim()) { field.current?.focus(); setOpen(true); }
      else { field.current?.focus(); window.Quantistes15?.search(); }
    }}>
    <span className="qx-prompt" aria-hidden="true">›</span>
    <input ref={field} value={query} className="qx-field" id="qx-command" type="text" role="combobox"
      autoComplete="off" spellCheck="false" placeholder="Cerca strumento o digita un comando"
      aria-label="Cerca uno strumento o un comando" aria-autocomplete="list" aria-expanded={Boolean(expanded)}
      aria-controls="qx-command-list" aria-activedescendant={expanded && matches.length ? 'qx-result-' + current : undefined}
      onFocus={() => setOpen(true)} onKeyDown={keyboard}
      onChange={event => { setQuery(event.target.value); setCurrent(0); setOpen(true); }}/>
    <kbd aria-hidden="true">Ctrl K</kbd><button className="qx-go" type="submit" disabled={!ready} aria-label="Esegui comando">GO</button>
    <div className="qx-command-menu" hidden={!expanded}>
      {!matches.length && <p role="status">Nessuno strumento trovato</p>}
      <ul id="qx-command-list" role="listbox" aria-label="Strumenti corrispondenti">
        {matches.map((item, i) => <li id={'qx-result-' + i} role="option" aria-selected={i === current}
          key={item.stage + '/' + (item.tool || '')} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}>
          <b>{item.label}</b><span>{item.tool ? sections.find(s => s.id === item.stage).title : item.code}</span>
        </li>)}
      </ul>
    </div>
  </form>;
}
