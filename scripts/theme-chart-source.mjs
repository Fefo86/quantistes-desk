/**
 * Build-time paint overrides for the supplied Quantistes renderers. Source programs, point
 * arrays, user imports and data archives stay canonical on disk. This module runs in Node.
 */
export const chartRendererIds = Object.freeze([
  'institutional-desk', 'studio-studio', 'desk-chart-inspector', 'studio-fields',
  'report-figures', 'report-charts', 'qt360-runtime', 'quantistes-v13-runtime',
  'quantistes-v26-realized-multitf', 'quantistes-v24-runtime', 'desk-strike-field',
  'quantistes-flow-engine', 'flow-probability-engine', 'flow-advanced-v3',
  'quantistes-v7-operational', 'qt-dynamic-p-charts', 'quantistes-physical-runtime',
  'qt-daily-runtime', 'qtQ16Runtime', 'vc9-chart', 'terminal-plots',
  'distribution_ui', 'event-explorer', 'implied-workbench', 'time-research-ui',
  'm8-monitor-ui', 'terminal-worker', 'qt-global-lab-ui', 'qt-cflex-production-candidate',
  'qt-ssvi-ui', 'crash-ui', 'q16ChartDocument'
]);
const renderers = new Set(chartRendererIds);

export const chartColors = Object.freeze({
  paper:'#090b0d', panel:'#121519', grid:'#292e35', rule:'#4e555f',
  muted:'#929ba5', tick:'#b8c0c7', ink:'#f0f2ee',
  amber:'#ffb258', cyan:'#47cde5', blue:'#92c6ff', magenta:'#e78bd5',
  green:'#65d99b', red:'#ff7885', amberLight:'#efcf86', violet:'#b9a0f5',
  turquoise:'#8fdcd1', redLow:'#733b48', greenLow:'#295d47',
});
const C = chartColors;
export const densityColors = Object.freeze([
  '#10232d','#163b4c','#1b5266','#206d80','#2c8797','#4cacb6','#82cbd0','#cff1ee'
]);

// Only these literal pigments are eligible for replacement. A renderer-specific match
// can override one hue shared by positive, negative and informational marks in the HTML.
const swatches = new Map();
function swatch(color, sourceHexes) {
  for (const hex of sourceHexes.trim().split(/\s+/)) swatches.set('#' + hex, color);
}
swatch(C.paper, '061423 071525 071727 081828 081829 081929 08192a 091a2b 091a2c 091b2c 091b2d 091c2d 091c2e 0a1c2e 0a1c2f 0a1d2f 0a1d30 0a1e30 0a2035 0b1522 0b1623 0b1d31 0b1e31 0b1f32 0b2033 0c1927 0d1928 0e1924 101d2b 131719');
swatch(C.panel, '0c2134 0d2236 0e2438 0f2539 10263b 10273c 11283d 121c2b 12293e 132332 132a40 142332 152632 152635 162736 162d3d 1b3244 202527 213444');
swatch(C.grid, '162e45 162f45 172f46 173047 17324d 183148 183550 19334a 193651 193652 1a344c 1a3753 1b354c 1b354d 1b364e 1b3855 1b3955 1b3956 1c364e 1c374f 1c3a57 1c3b58 1d3850 1d3951 1d3c59 1d3c5a 1e3952 1e3e5c 1f3a53 1f3b54 203c55 234464 25486a 273c4e 274661 28394b 293b4b 29445e 294863 294f74 2a5177 2b4964 2b4a65 2c4050 2c537a 2d4352 2e4453 2e5780 2f5982 305b85 314b61 31506a 374452 383d3f 393e40');
swatch(C.rule, '214856 2b6587 2d567e 30475b 365368 385671 386899 3a6b9c 3b5974 3c5364 3d5365 3e5c77 42607b 44627c 45637d 46647e 496781 4c667a 4d6475 575e60 5b7791 5c7993 72949f');
swatch(C.muted, '39699a 497db4 4b7eb5 4d81b9 4e82ba 5185be 5186bf 5387c1 558ac5 568bc6 588dc9 598eca 5c91ce 5c92cf 5ca3c6 5e7b95 6095d4 6197d5 6298d7 64819a 649ad8 679cda 689cda 699ddb 6a9edb 6d89a2 6da0dd 6f8ba5 6fa1de 7590aa 7d98b1 819cb5 8295a1 8a9eb2 8b9db1 98a8b0 98b1ca 99b2ca 9cabb2 b1bbb9 b1bdcb b3b8b6');
swatch(C.tick, '75a6e1 76a6e1 77a7e2 77bfdd 78a7e2 79a8e3 7aa9e4 7ba9e4 7caae5 7eace6 80ade7 82aee8 82afe8 83afe8 84b0e9 86b1ea 86cbe6 87b2ea 87b2eb 88b3eb 8bb5ed 8cb5ed 8db6ee 8fb8ef 90b8ef 90b9ef 91b9f0 91baf0 93bbf1 96bdf2 97bdf2 99b3ca 99bff3 9bc0f3 9bc6d6 9bccdb a0def3 a1afb5 a2c5f5 a4bbd1 a5c7f5 a6c7f5 a7c8f6 aacaf6 abc1d5 abc3d0 adbfcb adc3cd adc3d7 aec3d7 aeccf7 aecdf7 afc1cb afc2cc b0bdce b0cef7 b1cef8 b1cff8 b2c3d0 b3d0f8 b5d1dc b6d2f9 b7c9d5 b7d3f9 b8d3f9 b9cdde bbcee0 bbd5fa bccfe0 bfd8fa c0d0d7 c1d3da c1d3e3 c1d9fb c3dafb c4d1da c4dbfb c6dcfc c7ddfc c8d6dd c8defc c9cdc6 c9defc cacec6 cbd7df cbe0fd d5d8e7');
swatch(C.ink, 'bde9f9 bfeaf9 c0ebfa c4ecfb d8e6f4 dce4ef dcdaca dfdbcb dfdccb e0dccb e3decc e4eaea e5e0cc e6e0cc e7e0cc e7e1cc e8e8da e8e9df e8ecea eee9dd eeece1 ece9dc ede4ce f0e7ce f0ece1 f1e7ce f4ecdc f5efde f5f3e9');
swatch(C.amber, '87b5ff d2d3c8 d9d8ca dbc29b dbd9ca dcd9ca dddaca dec19a e9ac61 edb675 edb978 eeb273 eebb76 efba75 efbb77 f0b071 f0bb75 f3bd79 f5d3a4 ffac56');
swatch(C.cyan, '63abcd 67afd0 67b0d1 69b1d2 69b2d3 6ab3d4 70b9d9 71bada 71c6fb 72cddc 76c5c9 78c0de 79c9ec 7bc2df 7cc3e0 7dabe5 7dc4e1 7dd3e0 7ec4e1 7ed3df 7ed5df 82c7e3 83c8e4 83cad5 83cde1 84c9e4 85cae5 86cae5 87cbe6 87cce6 88cce6 88cce7 89cde7 8acee8 8bcedf 8bcfe8 8bcfe9 8dd0e9 8dd0ea 8ed1ea 90d2eb 91d3ec 93d5ed 94d6ed 95deff 96d7ee 97d8ef 99daf0 99deff 9bdbf1 9cdcf2 a7d8e6 b2e5f7');
swatch(C.blue, '7fade6 83baff 87bbff 88baff 89b4ec 89b7ff 89c6f2 8abbdf 8cb6ed 8eb3ff 90b9f0 94bcf2 94bdf7 9bbde0 9fc3f4 a0c3f4 a4b9e9 d3e8ff');
swatch(C.green, '6bdcc1 74d8af 75d5b1 75d5b2 75d6b2 76d2a7 77d6af 79d5b2 7ad2bb 7bd6b4 7cc2e0 7dd6b4 7fd8b5 80d5b4 83dcc0 88d9b1 8de1bc 92d8bf');
swatch(C.red, 'e79aa9 e99ba8 eb929c ec8c92 ec929b ed939f ed95a1 ed969f ed96ac ed97a2 ed9cac ef929c ef96a2 f29aa1 f38d93');
swatch(C.magenta, 'b7a5ee b7ceff baa4ed bba8dd bba9f3 bbabe1 c0a5ef c3acf3 c3b2ed');
swatch(C.violet, 'c3b4db');
swatch(C.turquoise, '84d3da 85cee3 86d6d5 aac8b5 b4e6df');
swatch(C.amberLight, 'd7b38f dacb8a dace80 dbca85 e6c68e');
swatch(C.redLow, '955e71');
swatch(C.greenLow, '397e80');

// Named color tables restore meaning where the legacy design assigned one literal
// to multiple roles. Only color-valued properties inside the specified table match.
const namedTables = {
  'institutional-desk':'palette', 'desk-chart-inspector':'palette', 'studio-fields':'colors',
  'flow-advanced-v3':'COLORS', 'quantistes-flow-engine':'COLORS', 'distribution_ui':'C',
  'event-explorer':'COLORS', 'qt-dynamic-p-charts':'PAL', 'qt360-runtime':'COLORS',
  'quantistes-physical-runtime':'C', 'quantistes-v7-operational':'C', 'terminal-plots':'C',
  'terminal-worker':'C', 'quantistes-v13-runtime':'pcolor', 'quantistes-v26-realized-multitf':'colors',
  'qt-global-lab-ui':'colors', 'atlas-document':'COL',
};
const roles = {
  bg:C.paper, paper:C.paper, deep:C.paper, grid:C.grid, line:C.rule, muted:C.muted, dim:C.muted,
  sub:C.tick, text:C.tick, tick:C.tick, ink:C.ink, white:C.ink, fg:C.ink, silver:C.ink,
  axis:C.tick, gray:C.muted, gold:C.amber, amber:C.amber, mid:C.amber, lo:'#c1e7ed',
  open:C.cyan, cyan:C.cyan, cyanBright:'#a4f0ed', ice:C.cyan, mint:C.green, green:C.green,
  red:C.red, teal:C.turquoise, blue:C.blue, violet:C.magenta, purple:C.magenta, q:C.amber,
  p:C.cyan, delta:C.blue, gamma:C.amber, vanna:C.magenta, charm:C.cyan, speed:C.green, color:C.red,
  CVI:C.amber, SMOOTH:C.cyan, CFLEX:C.magenta, SSVI:'#d9e9ed'
};
const local = {
  'desk-chart-inspector':{'#4c667a':C.rule, '#a7d8e6':C.cyan, '#1b3244':C.panel, '#72949f':C.amber},
  'institutional-desk':{'#99b3ca':C.rule, '#9fc3f4':C.cyan, '#98b1ca':C.tick},
  'studio-studio':Object.fromEntries(['#1b344b','#24485e','#2c6172','#397b84','#519695','#78b4aa','#afd1bc','#f0e6c9'].map((key,i)=>[key,densityColors[i]])),
  'qtQ16Runtime':{'#99deff':C.green, '#dedbcb':C.red},
  'flow-probability-engine':{'#ede5ce':C.red},
  'quantistes-v26-realized-multitf':{'#f0e7ce':C.ink},
  'time-research-ui':{'#e4eaea':C.ink},
  'qt-ssvi-ui':{'#dddaca':C.amber,'#8dd0ea':C.cyan},
  'report-figures':{'#79c9ec':C.cyan, '#95deff':'#b1f3fa'},
  'atlas-document':{'#6bdcc1':C.green, '#e4dfcc':C.red, '#87cbe6':'#a1e2bd', '#ece4cd':'#ffa2af'},
};

// Paint switches whose source literals also occur in unrelated labels.
const signedPigments = {
  'quantistes-v13-runtime': [["r[key]>=0?'#90d2eb':'#e6e0cc'", C.green, C.red]],
  'qt360-runtime': [["x<c.spot?'#98a8b0':'#377ba3'", C.red, C.green]],
  'quantistes-flow-engine': [["type==='error'?'#a1afb5':'#87b5ff'", C.red, C.amber]],
};

// RGB anchors occur in Canvas/WebGL paint gradients. The interpolation, sign
// selection, bin thresholds, default opacity, arrays of observations and axes are untouched.
function rgb(hex) { return [1,3,5].map(n => parseInt(hex.slice(n,n+2),16)).join(','); }
const signedRamps = {'245,239,222':C.red, '153,222,255':C.green, '15,37,58':C.paper};
const triples = {
  'quantistes-flow-engine':signedRamps,
  'qtQ16Runtime':signedRamps,
  'quantistes-v7-operational':{
    ...signedRamps, '135,181,255':C.cyan,
    ...Object.fromEntries(['23,56,84','26,74,112','28,96,142','37,121,167','64,154,196','102,185,217','154,218,237','236,237,220'].map((key,i)=>[key,densityColors[i]])),
  },
  'desk-strike-field':{
    '116,191,239':C.blue,'102,214,199':C.green,'182,159,234':C.magenta,'235,177,136':C.amber,
    '121,212,218':C.cyan,'231,191,133':C.amberLight,'220,137,161':C.red,'16,30,44':C.paper,
    '37,56,73':C.grid,'48,70,86':C.rule,'45,59,73':C.panel,'77,58,85':'#472c35',
    '225,146,167':C.red,'37,74,87':'#244633','121,205,189':C.green,
  }
};
const alphaColors = {
  'qt-dynamic-p-charts':{'123,194,223':C.cyan,'73,125,179':C.blue,'178,207,248':C.blue,'183,206,255':C.magenta,'224,220,203':C.amber,'227,222,204':C.ink},
  'quantistes-physical-runtime':{'110,183,215':C.cyan,'157,194,244':C.blue,'124,170,229':C.blue,'220,218,202':C.amber,'225,221,203':C.ink,'177,198,218':C.tick},
  'qt360-runtime':{'67,137,176':C.tick,'131,200,228':C.cyan,'136,204,231':C.cyan,'210,211,200':C.amber,'218,216,202':C.amber,'222,219,203':C.amber},
  'studio-studio':{'164,198,245':C.magenta,'245,239,222':C.red},
  'flow-advanced-v3':{'30,61,91':C.grid,'207,209,199':C.red,'93,164,199':C.green},
  'quantistes-v7-operational':{'212,213,200':C.red,'88,141,200':C.green,'93,165,200':C.cyan,'12,33,53':C.panel,'204,224,253':C.tick},
  'quantistes-v26-realized-multitf':{'108,159,220':C.cyan,'133,177,234':C.cyan,'129,198,227':C.cyan,'222,219,203':C.amber,'123,150,171':C.tick},
  'qt-daily-runtime':{'79,131,188':C.tick},
  'atlas-document':{'8,25,42':C.paper,'9,27,44':C.panel,'219,217,202':C.ink},
};
const canvasRenderers = new Set(['quantistes-flow-engine','flow-probability-engine','flow-advanced-v3','quantistes-v7-operational','qt-dynamic-p-charts','quantistes-physical-runtime','qt-daily-runtime','qtQ16Runtime','desk-strike-field','atlas-document','quantistes-v24-runtime','vc9-chart']);
const lookup = (table,key) => table && Object.hasOwn(table,key) ? table[key] : null;

function themePaint(id, text) {
  // Record semantic overrides at their original offsets before rewriting any tokens.
  const semantic = new Map();
  if (namedTables[id]) {
    const declaration = new RegExp('\\b' + namedTables[id] + '\\s*=\\s*\\{([^{}]*)\\}');
    const table = declaration.exec(text);
    if (table) {
      const start = table.index + table[0].indexOf('{') + 1;
      for (const match of table[1].matchAll(/(\w+)\s*:\s*['"](#[\da-f]{6})['"]/gi)) {
        let dest = lookup(roles,match[1]);
        if (id === 'desk-chart-inspector' && match[1] === 'axis') dest = C.rule;
        if (id === 'desk-chart-inspector' && match[1] === 'text') dest = C.ink;
        if (dest) semantic.set(start + match.index + match[0].indexOf('#'), dest);
      }
    }
  }
  for (const [expression,first,second] of signedPigments[id] || []) {
    let at = text.indexOf(expression);
    while (at>=0) {
      semantic.set(at+expression.indexOf('#'),first);
      semantic.set(at+expression.lastIndexOf('#'),second);
      at = text.indexOf(expression,at+expression.length);
    }
  }
  // Match entire CSS pigments, CSS font declarations, and the listed RGB paint anchors only.
  return text.replace(/#[\da-f]{6}(?![\da-f\w])|rgba?\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3}(?=[,)])|\[\d{1,3},\d{1,3},\d{1,3}\]|\b(?:\d+(?:\.\d+)?px )?Consolas\b|Math\.min\(2,(?=(?:root\.|window\.|w\.)devicePixelRatio\|\|1\))/gi, (token, index) => {
    if (token.startsWith('#')) {
      const key = token.toLowerCase();
      return semantic.get(index) || lookup(local[id],key) || swatches.get(key) || token;
    }
    if (token.startsWith('[')) {
      const paint = lookup(triples[id],token.slice(1,-1));
      return paint ? '['+rgb(paint)+']' : token;
    }
    if (token.startsWith('rgb')) {
      const split = token.indexOf('(') + 1;
      const paint = lookup(alphaColors[id],token.slice(split).replace(/\s+/g,''));
      return paint ? token.slice(0,split) + rgb(paint) : token;
    }
    if (token.startsWith('Math.')) return canvasRenderers.has(id) ? 'Math.min(3,' : token;
    const size = token.match(/^(\d+(?:\.\d+)?)px /);
    if (!size) return 'IBM Plex Mono';
    return (canvasRenderers.has(id) ? Math.max(12,Number(size[1])) : size[1]) + 'px IBM Plex Mono';
  });
}

// A srcdoc has its own font set. Supply the same self-hosted face at its parent origin.
const atlasCSS = `\n@font-face{font-family:"IBM Plex Mono";font-style:normal;font-weight:400;font-display:swap;src:url("/ui-fonts/ibm-plex-mono-latin-400-normal.woff2") format("woff2")}\n:root{--bg:${C.paper};--panel:${C.panel};--line:${C.grid};--edge:${C.rule};--text:${C.ink};--soft:${C.tick};--dim:${C.muted};--gold:${C.amber};--cyan:${C.cyan};--mint:${C.green};--red:${C.red};--blue:${C.blue};--mono:"IBM Plex Mono",monospace;--sans:"IBM Plex Mono",monospace}canvas{font-variant-numeric:tabular-nums}\n`;
function themeAtlas(source) {
  const doc = Buffer.from(source.trim(),'base64').toString('utf8');
  const painted = doc.replace(/(<(style|script)\b([^>]*)>)([\s\S]*?)(<\/\2\s*>)/gi, (all,open,kind,attrs,body,close) => {
    if (kind.toLowerCase() === 'style') return open + themePaint('atlas-style',body) + atlasCSS + close;
    if (/\btype\s*=/i.test(attrs)) return all;
    return open + themePaint('atlas-document',body) + close;
  });
  const leading = source.match(/^\s*/)[0];
  const trailing = source.match(/\s*$/)[0];
  return leading + Buffer.from(painted,'utf8').toString('base64') + trailing;
}

export function themeChartSource(key, source) {
  const id = key === 'terminal/terminal-worker.js' ? 'terminal-worker' : key;
  if (!renderers.has(id)) return source;
  return id === 'q16ChartDocument' ? themeAtlas(source) : themePaint(id,source);
}
