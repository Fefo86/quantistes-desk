const icons = {
  score: <><path d="M3 3v14h18"/><path d="m5 13 4-5 4 3 6-7"/></>,
  market: <><path d="M2 12h4l2-7 4 14 4-14 2 7h4"/></>,
  dealer: <><path d="M3 6h11m-8 6h15M3 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></>,
  path: <><path d="M3 18c4 0 5-2 7-8s3-7 5 0 4 8 6 8M2 20h20"/></>,
  audit: <><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 6 6m-14-9 2-2 2 1.5 2-3"/></>,
  reports: <><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7m-7 4h6"/></>,
  scalp: <><path d="M5 3v5m0 7v5m7-16v9m0 5v3m7-19v3m0 7v9"/><path d="M3 8h4v7H3zm7 5h4v5h-4zm7-8h4v7h-4z"/></>,
  sliders: <><path d="M3 7h7m4 0h7M3 17h12m4 0h2"/><path d="M10 4h4v6h-4zm5 10h4v6h-4z"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  replay: <><path d="M3 10a8.5 8.5 0 1 1 .8 7M3 4v6h6"/></>,
  terminal: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 9 3 3-3 3m5 0h5"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
  collapse: <><rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M9 4v16m7-11-3 3 3 3"/></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18"/></>,
  close: <path d="m5 5 14 14M19 5 5 19"/>,
  exit: <><path d="M12 4H4v16h8m-2-8h11m-4-4 4 4-4 4"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v13c0 4 16 4 16 0V5M4 11c0 4 16 4 16 0"/></>
};
export function Icon({ name, size = 19 }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}
export function Mark() {
  return <svg aria-hidden="true" width="34" height="34" viewBox="0 0 36 36" fill="currentColor"><path fillRule="evenodd" d="M10 3h18l5 5-5 18-7 6H6l-4-5L7 8zm3 6-2 2-3 14h10l3-3-6-5h7l3-8zm9 16h7l5 8h-8z"/></svg>;
}
