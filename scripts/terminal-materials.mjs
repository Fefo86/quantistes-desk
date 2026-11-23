// Apply the desk palette to the archived stylesheets, including native tool windows.
function remapCool(r, g, b) {
  const light = .213 * r + .715 * g + .072 * b;
  if (light < 17) return [3, 4, 5];
  if (light < 28) return [9, 10, 11];
  if (light < 40) return [17, 18, 20];
  if (light < 55) return [31, 32, 34];
  if (light < 80) return [53, 55, 58];
  if (light < 105) return [87, 90, 93];
  if (light < 137) return [155, 157, 161];
  if (light < 164) return [185, 187, 189];
  if (light < 192) return [210, 211, 213];
  return [238, 239, 240];
}

function palette(r, g, b) {
  if (b >= g && g >= r && b - r > 5) return remapCool(r, g, b);
  // The archived palette also uses pale blue-green for gains and warm red for losses.
  if (g > r + 24 && b >= g - 4 && b < g + 14 && g > 118) return [83, 211, 226];
  if (g > r + 20 && g > b + 6 && g > 120) return [88, 210, 136];
  if (r > 145 && r > g + 27 && r > b + 20 && Math.abs(b - g) < 32) return [245, 111, 114];
  if (r > 145 && r > g + 8 && g > b + 25) return [246, 177, 78];
  if (Math.max(r,g,b)-Math.min(r,g,b)<26 && Math.min(r,g,b)>185) return [231,231,232];
  return [r, g, b];
}

function material(hex) {
  let raw = hex.slice(1);
  if (![3,4,6,8].includes(raw.length)) return hex;
  if (raw.length < 5) raw = [...raw].map(c => c + c).join('');
  const [r,g,b] = [0,2,4].map(i => parseInt(raw.slice(i,i+2),16));
  return '#' + palette(r,g,b).map(n => n.toString(16).padStart(2,'0')).join('') + raw.slice(6);
}

export function terminalMaterials(styles) {
  return styles.replace(/#[\da-f]{3,8}\b/gi, material)
    .replace(/\b(rgb|rgba)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(\s*,\s*[.\d]+)?\s*\)/gi,
      (_, type, r, g, b, a) => type + '(' + palette(+r,+g,+b).join(',') + (a || '') + ')')
    .replace(/(["']?)\bConsolas\b\1/g, 'var(--terminal-mono)')
    .replace(/((?:^|[{;])\s*font(?:-size)?\s*:\s*)([^;{}]+)/gi, (_, property, declaration) => {
      const scaled = declaration.replace(/\b(\d+(?:\.\d+)?)px\b/, (original, size) => {
        const px = Number(size);
        return px >= 7 && px <= 26 ? Math.max(px, 12) / 16 + 'rem' : original;
      });
      return property + scaled;
    });
}
