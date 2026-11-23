import { sections } from './sections';

export function Navigation({ active, ready, navigate }) {
  return <nav className="qx-functions" aria-label="Sezioni del desk">
    {sections.map((section, index) => <button key={section.id} type="button"
      aria-label={section.title} aria-current={section.id === active ? 'page' : undefined}
      title={section.title + ' · Alt+Maiusc+' + (index + 1)}
      aria-keyshortcuts={'Alt+Shift+' + (index + 1)} disabled={!ready}
      onClick={() => navigate(section.id)}>
      <span className="qx-key" aria-hidden="true">{index + 1}</span>
      <span>{section.title}</span>
    </button>)}
  </nav>;
}
