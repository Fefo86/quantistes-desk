'use client';

import React, { useEffect, useRef } from 'react';

const width = 620;
const height = 240;
const scale = 122;
const yaw = 0.55;
const pitch = 0.38;
const focus = 0.14;
const columns = 44;
const rows = 30;
const palette = ['#354433', '#4c6042', '#71865a', '#9bb575', '#c4df8f', '#e1f3b0'];

function terrain(x, z) {
  const ridge = -0.38 + 0.52 * Math.sin(1.55 * z + 0.35);
  const folded = Math.exp(-(((x - ridge) / 0.39) ** 2) - ((z + 0.18) / 0.83) ** 2);
  const shoulder = Math.exp(-(((x - 0.80) / 0.49) ** 2) - ((z - 0.20) / 0.72) ** 2);
  const basin = 0.04 * Math.cos(4 * x - z) * Math.exp(-z * z);
  return Math.max(0, 1.08 * folded + 0.38 * shoulder + basin);
}

function point(i, j) {
  const x = -1.55 + (3.1 * i) / columns;
  const z = -1.08 + (2.16 * j) / rows;
  return [x, terrain(x, z), z];
}

const lattice = Array.from({ length: rows + 1 }, (_, j) =>
  Array.from({ length: columns + 1 }, (_, i) => point(i, j)));

function project([x, y, z]) {
  const horizontal = x * Math.cos(yaw) + z * Math.sin(yaw);
  const depth = z * Math.cos(yaw) - x * Math.sin(yaw);
  const elevation = (y - focus) * Math.cos(pitch) - depth * Math.sin(pitch);
  return [(width / 2 + horizontal * scale).toFixed(1), (height / 2 - elevation * scale).toFixed(1)].join(' ');
}

function ink(a, b, major) {
  const altitude = (a[1] + b[1]) / 2;
  return Math.min(palette.length - 1, Math.floor(altitude * 4.45) + Number(major));
}

const segments = [];
const triangles = [];
const bands = [];
for (let j = 0; j < rows; j += 1) {
  const near = lattice[j + 1];
  const far = lattice[j];
  const paths = palette.map(() => []);
  function edge(a, b, major) {
    const color = ink(a, b, major);
    segments.push({ a, b, color });
    paths[color].push('M' + project(a) + 'L' + project(b));
  }
  for (let i = 0; i < columns; i += 1) {
    triangles.push(...far[i], ...near[i], ...far[i + 1], ...near[i], ...near[i + 1], ...far[i + 1]);
    edge(near[i], near[i + 1], (j + 1) % 5 === 0);
    edge(far[i], near[i], i % 7 === 0);
    if (j === 0) edge(far[i], far[i + 1], true);
    else {
      const farInk = ink(far[i], far[i + 1], j % 5 === 0);
      paths[farInk].push('M' + project(far[i]) + 'L' + project(far[i + 1]));
    }
  }
  edge(far[columns], near[columns], true);
  bands.push({
    skin: 'M' + far.map(project).join('L') + 'L' + [...near].reverse().map(project).join('L') + 'Z',
    lines: paths.map(p => p.join('')),
  });
}

const pins = [lattice[12][18], lattice[18][27], lattice[8][33]];
const guide = [];
function guideEdge(a, b) { guide.push({ a, b }); }
guideEdge([-1.58, -0.035, 1.22], [1.69, -0.035, 1.22]);
guideEdge([1.69, -0.035, 1.22], [1.69, -0.035, -1.17]);
for (let i = 0; i < 25; i += 1) {
  const x = -1.55 + i * 3.1 / 24;
  guideEdge([x, -0.035, 1.22], [x, -0.035, i % 4 === 0 ? 1.31 : 1.26]);
}
for (let j = 0; j < 17; j += 1) {
  const z = -1.08 + j * 2.16 / 16;
  guideEdge([1.69, -0.035, z], [j % 4 === 0 ? 1.78 : 1.73, -0.035, z]);
}
const guidePath = guide.map(({ a, b }) => 'M' + project(a) + 'L' + project(b)).join('');

function createScene(T, canvas) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0);
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  function geometry(positions) {
    const result = new T.BufferGeometry();
    result.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    return result;
  }
  const skin = new T.MeshBasicMaterial({
    color: '#172019', side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  scene.add(new T.Mesh(geometry(triangles), skin));
  const colors = palette.map(value => new T.Color(value).toArray());
  const wire = geometry(segments.flatMap(({ a, b }) => [...a, ...b]));
  wire.setAttribute('color', new T.Float32BufferAttribute(
    segments.flatMap(({ color }) => [...colors[color], ...colors[color]]), 3));
  scene.add(new T.LineSegments(wire, new T.LineBasicMaterial({ vertexColors: true })));
  const ruler = geometry(guide.flatMap(({ a, b }) => [...a, ...b]));
  scene.add(new T.LineSegments(ruler, new T.LineBasicMaterial({ color: '#69775a' })));
  const pinsGeometry = geometry(pins.flatMap(([x, y, z]) => [x, y + 0.008, z]));
  scene.add(new T.Points(pinsGeometry, new T.PointsMaterial({ size: 2.4, sizeAttenuation: false, color: '#e0efb5' })));
  let lastW = 0;
  let lastH = 0;

  return {
    draw(w, h, pointer) {
      if (w < 1 || h < 1) return false;
      if (w !== lastW || h !== lastH) {
        lastW = w;
        lastH = h;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
        renderer.setSize(w, h, false);
        const s = scale * Math.min(w / width, h / height);
        camera.left = -w / (2 * s);
        camera.right = -camera.left;
        camera.top = h / (2 * s);
        camera.bottom = -camera.top;
        camera.updateProjectionMatrix();
      }
      const angle = yaw + pointer * 0.075;
      camera.position.set(-6 * Math.sin(angle) * Math.cos(pitch), focus + 6 * Math.sin(pitch), 6 * Math.cos(angle) * Math.cos(pitch));
      camera.lookAt(0, focus, 0);
      renderer.render(scene, camera);
      return true;
    },
    dispose() {
      scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

export default function QuantSurface({ className = '', style }) {
  const host = useRef(null);
  const canvas = useRef(null);
  const fallback = useRef(null);
  useEffect(() => {
    const el = host.current;
    const layer = canvas.current;
    const vector = fallback.current;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scene, job, frame = 0, dead = false, visible = false, pointer = 0, attempted = false;
    function paint() {
      frame = 0;
      if (dead || !visible || !scene || motion.matches) return;
      const shown = scene.draw(el.clientWidth, el.clientHeight, pointer);
      if (shown) { vector.style.opacity = '0'; layer.style.opacity = '1'; }
    }
    function schedule() { if (!frame && scene && visible) frame = requestAnimationFrame(paint); }
    async function load() {
      if (dead || !visible || motion.matches || attempted) return;
      attempted = true;
      try {
        const T = await import('three');
        if (dead || !visible || motion.matches) { attempted = false; return; }
        scene = createScene(T, layer);
        schedule();
      } catch { /* The vector artwork remains available without WebGL. */ }
    }
    function update() {
      if (motion.matches) {
        vector.style.opacity = '1'; layer.style.opacity = '0'; pointer = 0;
      } else if (visible) {
        if (scene) schedule();
        else if (!attempted && !job) job = setTimeout(() => { job = null; load(); }, 70);
      }
    }
    function move(event) {
      if (!scene || motion.matches || event.pointerType === 'touch') return;
      const rect = el.getBoundingClientRect();
      pointer = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      schedule();
    }
    function reset() { pointer = 0; schedule(); }
    function lost() {
      vector.style.opacity = '1'; layer.style.opacity = '0';
      visible = false;
    }
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    }) : null;
    if (io) io.observe(el); else { visible = true; update(); }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    ro?.observe(el);
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', reset);
    layer.addEventListener('webglcontextlost', lost);
    motion.addEventListener('change', update);
    return () => {
      dead = true; clearTimeout(job); cancelAnimationFrame(frame);
      io?.disconnect(); ro?.disconnect();
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', reset);
      layer.removeEventListener('webglcontextlost', lost); motion.removeEventListener('change', update);
      vector.style.opacity = '1'; layer.style.opacity = '0';
      scene?.dispose();
    };
  }, []);

  const fill = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' };
  return <div ref={host} aria-hidden="true" className={className} style={{
    width: '100%', height: '100%', position: 'relative', overflow: 'hidden', isolation: 'isolate',
    background: 'radial-gradient(ellipse at 50% 57%, #222a20 0%, #161c18 42%, #111613 83%)', ...style,
  }}>
    <svg ref={fallback} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" focusable="false" style={fill}>
      <path d={guidePath} fill="none" stroke="#69775a" strokeWidth="0.75" />
      {bands.map((band, i) => <g key={i}>
        <path d={band.skin} fill="#172019" />
        {band.lines.map((line, k) => line && <path key={k} d={line} fill="none" stroke={palette[k]} strokeWidth={k >= 4 ? 1.04 : 0.78} strokeLinecap="round" />)}
      </g>)}
      {pins.map((p, i) => {
        const [cx, cy] = project(p).split(' ');
        return <circle key={i} cx={cx} cy={cy} r="1.35" fill="#e0efb5" />;
      })}
    </svg>
    <canvas ref={canvas} style={{ ...fill, opacity: 0 }} />
  </div>;
}
