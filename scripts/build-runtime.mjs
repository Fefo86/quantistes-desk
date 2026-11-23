import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const desk = path.join(root, 'desk');
const out = path.join(root, 'public/terminal');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(desk, 'document.json')));
const layout = [];
const sheets = [];
const preload = [];
const lazy = [];
let group = [];
let bytes = 0;
let number = 0;
const load = node => fs.readFileSync(path.join(desk, node.path), 'utf8');

function asset(name, extension, contents) {
  const digest = createHash('sha256').update(contents).digest('hex').slice(0, 12);
  const filename = name + '.' + digest + '.' + extension;
  fs.writeFileSync(path.join(out, filename), contents);
  return '/terminal/' + filename;
}
function scriptAsset(name, contents, id) {
  const src = asset(name, 'js', contents);
  preload.push(src);
  layout.push('<script' + (id ? ' id="' + id + '"' : '') + ' src="' + src + '"></script>');
}
function flush() {
  if (!group.length) return;
  // Each program is its own classic script. Workers can read its exact text by ID.
  // The parser waits at this position, preserving the original events and dependency order.
  const entries = JSON.stringify(group);
  const program = '(function(entries){const anchor=document.currentScript;for(const [id,type,source] of entries){const el=document.createElement("script");if(id)el.id=id;if(type)el.type=type;el.textContent=source;anchor.before(el);}})(' + entries + ');';
  scriptAsset('block-' + String(++number).padStart(2, '0'), program);
  group = [];
  bytes = 0;
}

for (const node of manifest.nodes) {
  if (node.kind === 'space') continue;
  if (node.kind === 'css') { sheets.push(load(node)); continue; }
  if (node.kind === 'markup') {
    let html = load(node);
    if (!node.body && !html.includes('</head><body>')) continue;
    if (html.includes('</head><body>')) html = html.split('</head><body>')[1];
    html = html.replace(/<\/body>\s*<\/html>\s*$/i, '');
    if (html.trim()) { flush(); layout.push(html); }
    continue;
  }
  const value = load(node);
  if (node.id?.startsWith('inst-bin-')) {
    lazy.push([node.id, asset(node.id, 'txt', value)]);
    group.push([node.id, node.type, '']);
  } else if (node.id === 'qt360-plotly') {
    flush();
    scriptAsset('plotly', value, node.id);
  } else {
    if (bytes + value.length > 900000) flush();
    group.push([node.id, node.type, value]);
    bytes += value.length;
  }
}
flush();
const pdfAdapter = fs.readFileSync(path.join(root, 'src/ui/pdf-resources.js'), 'utf8');
scriptAsset('pdf-resources', '(' + pdfAdapter.trim() + ')(' + JSON.stringify(Object.fromEntries(lazy)) + ');');

// Apply the desk materials to presentation CSS only. Keep warm, gain/loss and chart
// encodings distinct. The original styles remain independently editable in desk/styles.
function graphite(hex) {
  let raw = hex.slice(1);
  if (raw.length === 3 || raw.length === 4) raw = [...raw].map(x => x + x).join('');
  const channels = [0,2,4].map(i => parseInt(raw.slice(i, i+2), 16));
  const [r,g,b] = channels;
  if (b <= r || b <= g || r > g + 8 || b - r < 5) return hex;
  const y = (0.2126*r + 0.7152*g + 0.0722*b);
  const colors = y < 120 ? [y*0.94+2, y*0.99+3, y*0.90+3] : [y*0.98+3, y*1.01+2, y*0.94+3];
  return '#' + colors.map(n => Math.min(255,Math.round(n)).toString(16).padStart(2,'0')).join('') + raw.slice(6);
}
function typeScale(css) {
  return css.replace(/(["']?)\bConsolas\b\1/g, '"IBM Plex Mono"')
    .replace(/((?:^|[{;])\s*font(?:-size)?\s*:\s*)([^;{}]+)/gi, (_, property, declaration) => {
      const scaled = declaration.replace(/\b(\d+(?:\.\d+)?)px\b/, (original, size) => {
        const px = Number(size);
        return px >= 7 && px <= 24 ? (Math.max(px, 12) / 16) + 'rem' : original;
      });
      return property + scaled;
    });
}
const materials = sheets.join('\n').replace(/#[\da-f]{3,8}\b/gi, color =>
  [4,5,7,9].includes(color.length) ? graphite(color) : color);
const originalCss = asset('workspaces', 'css', typeScale(materials));
const uiFiles = ['tokens.css','chrome.css','workspace.css','mobile.css'];
const theme = asset('institutional','css',uiFiles.map(file => fs.readFileSync(path.join(root, 'src/styles',file),'utf8')).join('\n'));
const fontDir = path.join(root, 'public/ui-fonts');
fs.mkdirSync(fontDir,{recursive:true});
for (const [font, weights] of [['barlow',[400,500,600,700]],['ibm-plex-mono',[400,500,600]]]) {
  for (const weight of weights) {
    const name = font + '-latin-' + weight + '-normal.woff2';
    fs.copyFileSync(path.join(root, 'node_modules/@fontsource', font,'files',name),path.join(fontDir,name));
  }
}
const generated = path.join(root,'.next-assets');
fs.mkdirSync(generated,{recursive:true});
fs.writeFileSync(path.join(generated,'body.html'),layout.join('\n'));
fs.writeFileSync(path.join(generated,'head.html'),'<link rel="stylesheet" href="' + originalCss + '"><link rel="stylesheet" href="' + theme + '">' +
  preload.map(src => '<link rel="preload" as="script" href="'+src+'">').join(''));
console.log('Assemblati ' + number + ' gruppi ordinati e ' + lazy.length + ' risorse PDF/OCR su richiesta.');
