import { useEffect, useState } from 'react';

const initial = { stage:'score', ready:false, clock:'', replay:'Replay', replayBusy:false, source:'', tape:[], compact:false };
export function useDesk() {
  const [view, setView] = useState(initial);
  useEffect(() => {
    const text = id => document.getElementById(id)?.textContent?.trim() || '';
    let mounted = true;
    let observer;
    let poll;
    let last = '';
    function sync() {
      if (!mounted) return;
      const router = window.QuantistesFlatDesk;
      const replay = document.getElementById('q13Demo');
      const state = {
        ready: Boolean(router && document.getElementById('deskBoard')),
        stage: router?.state().stage || 'score',
        clock: text('q13Clock'),
        source: text('q13RunMode'),
        replay: (replay?.textContent || 'Replay').replace(/^[▶▷►↺⟳\s]+/u,''),
        replayBusy: Boolean(replay?.disabled),
        compact: document.documentElement.dataset.qt10Rail === 'compact',
        tape: Array.from(document.querySelectorAll('#qt10Tape .qt10-field')).map(cell => ({
          label: cell.querySelector('small')?.textContent || '',
          value: cell.querySelector('b')?.textContent || '',
          time: cell.querySelector('time')?.textContent || ''
        }))
      };
      const key = JSON.stringify(state);
      if (key !== last) { last = key; setView(state); }
      if (state.ready) {
        document.documentElement.dataset.deskReady = 'yes';
        if (!observer) {
          observer = new MutationObserver(sync);
          const header = document.querySelector('#q13App .q13-header');
          if (header) observer.observe(header,{ childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:['hidden','disabled'] });
          observer.observe(document.documentElement,{ attributes:true, attributeFilter:['data-qt10-rail'] });
          clearInterval(poll);
        }
      }
    }
    poll = setInterval(sync, 180);
    const events = ['desk:route','desk:frame-changed','quantistes:v12-feed','load'];
    events.forEach(name => window.addEventListener(name,sync));
    sync();
    return () => { mounted = false; clearInterval(poll); observer?.disconnect(); events.forEach(name => window.removeEventListener(name,sync)); };
  }, []);
  return view;
}
