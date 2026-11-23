// Presentation only. The original engines still see the exact same textContent.
const ornaments = [
  ['.flow-hero .flow-kicker', ['QUANTISTES / FLOW & VOLATILITY TERMINAL']],
  ['.fa-stage-head .flow-kicker', ['QUANTISTES / M18 · M31 · M34 · M36 · M37 · M39 · M45']],
  ['.op-card header .op-mini-tag', ['INTERACTIVE', 'PROXIMITY']],
  ['.q15-portal-status > span', ['◉ MOTORI NATIVI · CVI / IPPO / Q / P / FLOW / RESEARCH']],
  ['.q15-portal-status > span > b', ['DATA AWARE']],
  ['.q15-hero-forward > span', ['DECISION FLOW →']],
  ['#q13Return > span', ['MODEL LAB / NATIVE ENGINE']],
  ['#dx-global-dock .dx-topline b', ['ONE CHAIN. ALL HORIZONS.']],
  ['.qd-bar-head .qd-eyebrow', ['QUANTISTES / DAILY DESK']],
  ['.q13-screen-title .q13-eyebrow', ['DECISION LAYER / ALL INPUTS CONVERGE HERE']]
];

const prefixes = [
  ['#view-implied .cardbody > p.smalltext', /^(?:W-V29|EX10)\s*·\s*/],
  ['.q24-scenario-metric > small', /^(?:H057|H055|H061)\s*·\s*/],
  ['.flow-card-head > b', /^M17\s*·\s*(?=DEMO INVENTORY × THETADATA GREEKS)/],
  ['.q15-labhead small', /^QUANTISTES\s*\/\s*ANALYTICAL DEPTH\s*·\s*(?=\d+ STUDI\b)/],
  ['.dx-head .dx-eyebrow', /^QUANTISTES \/ INTRADAY PHYSICAL INTELLIGENCE \/ (?=SPX CASH$)/],
  ['.qp-hero .qp-overline', /^QUANTISTES \/ HISTORICAL PROBABILITY INTELLIGENCE \/ (?=SPXW 0DTE$)/],
  ['.op-tophead .op-overline', /^QUANTISTES \/ DESK INTELLIGENCE \/ (?=OPTIONS-TO-FUTURES$)/],
  ['.qt360-toprow .qt360-eyebrow', /^QUANTISTES \/ (?=ES \+ SPXW$)/],
  ['#qtManual .qt-guide-hero .qt-guide-overline', /^QUANTISTES \/ (?=CVI \/ SPXW–ES$)/]
];

const selectors = [...new Set([...ornaments,...prefixes].map(([selector]) => selector))].join(',');
const excluded = 'script,style,template,textarea,input,select,pre,code,svg,canvas,table,.js-plotly-plot';
const wrapped = 'data-desk-copy-fragment';
const concealed = 'data-desk-copy-ornament';
const normalize = s => s.replace(/\s+/g, ' ').trim();

// Call on mount (useEffect) and invoke the returned function on unmount.
export function installDeskCopy(scope = document.body) {
  const doc = scope.ownerDocument;
  const win = doc.defaultView;
  const previousDisplay = new WeakMap();

  function conceal(node, hide) {
    if (hide && !previousDisplay.has(node)) {
      previousDisplay.set(node, [node.style.getPropertyValue('display'), node.style.getPropertyPriority('display')]);
      node.setAttribute(concealed, '');
      node.style.setProperty('display', 'none', 'important');
    } else if (!hide && previousDisplay.has(node)) {
      const [value, priority] = previousDisplay.get(node);
      if (value) node.style.setProperty('display',value,priority);
      else node.style.removeProperty('display');
      previousDisplay.delete(node);
      node.removeAttribute(concealed);
    }
  }

  function maskText(textNode, length) {
    if (length < textNode.length) textNode.splitText(length);
    const span = doc.createElement('span');
    span.setAttribute(wrapped, '');
    span.hidden = true;
    span.style.setProperty('display','none','important');
    textNode.before(span);
    span.appendChild(textNode);
  }

  function review(el) {
    for (const [selector, values] of ornaments) {
      if (!el.matches(selector)) continue;
      // A future dynamic status on the same node becomes visible again.
      const hide = !el.firstElementChild && values.includes(normalize(el.textContent));
      conceal(el,hide);
      if (hide && el.tagName === 'B' && el.textContent === 'DATA AWARE') {
        const separator = el.nextSibling;
        if (separator?.nodeType === 3 && separator.data.trim() === '·') maskText(separator,separator.length);
      }
      return;
    }
    const first = el.firstChild;
    if (!first || first.nodeType !== 3) return;
    for (const [selector, expression] of prefixes) {
      if (!el.matches(selector)) continue;
      const match = expression.exec(first.data);
      if (match) maskText(first,match[0].length);
      return;
    }
  }

  function collect(el, pending, descend) {
    if (!el || el.nodeType !== 1 || el.closest(excluded)) return;
    if (el.matches(selectors)) pending.add(el);
    if (descend && el.firstElementChild) {
      el.querySelectorAll(selectors).forEach(n => { if (!n.closest(excluded)) pending.add(n); });
    }
  }

  // The SPX Atlas owns a separate same-origin srcdoc and emits this event on load.
  let atlasNodes = [];
  function atlasReady() {
    const frame = doc.getElementById('q16Chart');
    if (!frame || frame.tagName !== 'IFRAME' || !frame.hasAttribute('srcdoc')) return;
    const atlas = frame.contentDocument;
    if (!atlas) return;
    atlasNodes.forEach(node => conceal(node,false));
    atlasNodes = [];
    for (const [selector, label] of [
      ['.resolution-pill','HiDPI 3×'],
      ['.topbar .brand .eyebrow','Quantistes / options intelligence']
    ]) {
      const node = atlas.querySelector(selector);
      if (node && !node.firstElementChild && normalize(node.textContent) === label) {
        conceal(node,true);
        atlasNodes.push(node);
      }
    }
  }
  win.addEventListener('desk:atlas-ready',atlasReady);
  atlasReady();

  const initial = new Set();
  collect(scope,initial,true);
  initial.forEach(review);
  const observer = new win.MutationObserver(records => {
    const pending = new Set();
    for (const r of records) {
      const parent = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (!parent || parent.closest(excluded)) continue;
      collect(parent,pending,false);
      for (const node of r.addedNodes) collect(node,pending,true);
    }
    if (!pending.size) return;
    pending.forEach(review);
    // These records only concern wrappers inserted synchronously above.
    observer.takeRecords();
  });
  observer.observe(scope,{childList:true,characterData:true,subtree:true});
  return () => {
    observer.disconnect();
    win.removeEventListener('desk:atlas-ready',atlasReady);
    atlasNodes.forEach(node => conceal(node,false));
    scope.querySelectorAll('['+concealed+']').forEach(node => conceal(node,false));
    for (const span of scope.querySelectorAll('['+wrapped+']')) {
      const parent = span.parentNode;
      span.replaceWith(...span.childNodes);
      parent.normalize();
    }
  };
}
