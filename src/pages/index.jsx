import Head from 'next/head';
import { useEffect, useState } from 'react';
import { Masthead } from '../ui/Masthead';
import { sections } from '../ui/sections';
import { useDesk } from '../ui/useDesk';
import { installDeskCopy } from '../ui/terminal-copy';

export default function InstitutionalDesk() {
  const view = useDesk();
  const [csrf, setCsrf] = useState('');
  const section = sections.find(item => item.id === view.stage) || sections[0];
  useEffect(() => {
    if (document.documentElement.dataset.access === 'wordpress') {
      const cookie = document.cookie.split('; ').find(field => field.startsWith('__Host-QuantistesCSRF='));
      if (cookie) setCsrf(cookie.slice(cookie.indexOf('=') + 1));
    }
  }, []);
  useEffect(() => {
    if (!view.ready) return;
    const chart = document.querySelector('#deskBoard .desk-main-grid');
    const attribution = document.getElementById('deskImpact');
    if (chart && attribution?.parentNode === chart.parentNode) attribution.before(chart);
  }, [view.ready]);
  useEffect(() => installDeskCopy(), []);
  useEffect(() => {
    const consoleBar = document.querySelector('.qx-console');
    if (!consoleBar || !window.ResizeObserver) return;
    function measure() {
      const height = consoleBar.getBoundingClientRect().height;
      if (height) document.documentElement.style.setProperty('--console-height', height + 'px');
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(consoleBar);
    return () => observer.disconnect();
  }, []);
  function navigate(stage, tool) {
    window.QuantistesFlatDesk?.go(stage, tool);
    window.scrollTo({top:0,behavior:'instant'});
    requestAnimationFrame(() => document.getElementById('desk-intestazione')?.focus({preventScroll:true}));
  }
  return <>
    <Head><title>Quantistes | Institutional Desk</title><meta name="description" content="Terminale Quantistes per Scoreboard ES, volatilità, dealer flow, probabilità fisica, ricerca, report e scalping."/></Head>
    <div className="qx"><a className="qx-skip" href="#desk-intestazione">Vai all’area di lavoro</a>
      <Masthead view={view} section={section} navigate={navigate} csrf={csrf}/>
    </div>
    <noscript>Attiva JavaScript per utilizzare i calcoli del desk.</noscript>
  </>;
}
