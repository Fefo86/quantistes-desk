import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigation } from '../ui/Navigation';
import { Masthead } from '../ui/Masthead';
import { sections } from '../ui/sections';
import { useDesk } from '../ui/useDesk';

export default function InstitutionalDesk() {
  const view = useDesk();
  const [open,setOpen] = useState(false);
  const [csrf,setCsrf] = useState('');
  const menu = useRef(null);
  const section = sections.find(item => item.id === view.stage) || sections[0];
  const close = useCallback((restore = true) => {
    setOpen(false);
    if (restore !== false) menu.current?.focus({preventScroll:true});
  },[]);
  useEffect(() => {
    if (document.documentElement.dataset.access === 'wordpress') {
      fetch('/auth/session',{credentials:'same-origin',cache:'no-store'}).then(r => {
        if (r.status === 401) { window.location.replace('/'); return {}; }
        return r.ok ? r.json() : {};
      }).then(data => setCsrf(data.csrf || '')).catch(() => {});
    }
    const mq = window.matchMedia('(min-width: 901px)');
    const resize = () => { if (mq.matches) setOpen(false); };
    mq.addEventListener('change',resize);
    return () => mq.removeEventListener('change',resize);
  },[]);
  function navigate(stage) {
    close(false);
    window.QuantistesFlatDesk?.go(stage);
    window.scrollTo({top:0,behavior:'instant'});
    requestAnimationFrame(() => document.getElementById('desk-intestazione')?.focus({preventScroll:true}));
  }
  return <>
    <Head><title>Quantistes | Institutional Desk</title><meta name="description" content="Quantistes Institutional Desk. Scoreboard ES, volatilità, dealer flow, probabilità fisica, ricerca, report istituzionali e scalping su flussi."/></Head>
    <div className="qx"><a className="qx-skip" href="#desk-intestazione">Vai all’area di lavoro</a>
      <Navigation view={view} open={open} close={close} navigate={navigate} csrf={csrf}/>
      <Masthead view={view} section={section} navOpen={open} toggleNav={() => setOpen(!open)} menuRef={menu}/>
    </div>
    <noscript>Attiva JavaScript per utilizzare i calcoli locali del desk.</noscript>
  </>;
}
