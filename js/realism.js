// Procedural textures, materials and shapes that make the hardware look manufactured rather than toy-like.
import * as THREE from 'three';
import { rng } from './common.js';

const cache = {};
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const SANS = 'Inter, system-ui, sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(c, { srgb = true, repeat } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// ---------- shapes ----------
function roundedRectPath(path, w, h, r, cx = 0, cy = 0) {
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

// Planar top-down UVs over the footprint, so textures land the right way up on the top face.
function planarUV(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
  const dx = b.max.x - b.min.x || 1, dz = b.max.z - b.min.z || 1;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / dx, (b.max.z - p.getZ(i)) / dz);
  uv.needsUpdate = true;
  return geo;
}

/**
 * A flat part with a rounded-rectangle footprint (w × d), thickness h and a small edge bevel.
 * Sits on y = 0 … h, centred in x/z. `holes` are [w, d, r, cx, cz] cut-outs.
 */
export function slab(w, d, h, r = 0.05, bevel = 0.004, holes = []) {
  const bv = Math.min(bevel, h / 2.2, r * 0.9);
  const shape = roundedRectPath(new THREE.Shape(), w - 2 * bv, d - 2 * bv, Math.max(0.001, r - bv));
  for (const [hw, hd, hr, cx, cz] of holes) shape.holes.push(roundedRectPath(new THREE.Path(), hw + 2 * bv, hd + 2 * bv, hr + bv, cx, -cz));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, h - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bv, 0);
  return planarUV(geo);
}

// A rounded-rectangle ring (a tray wall or a housing).
export function ring(w, d, h, r, wall) {
  const shape = roundedRectPath(new THREE.Shape(), w, d, r);
  shape.holes.push(roundedRectPath(new THREE.Path(), w - 2 * wall, d - 2 * wall, Math.max(0.001, r - wall)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2);
  return planarUV(geo);
}

// A flat ribbon (flex cable) of the given width following a curve; width is along world x.
export function ribbon(curve, width, segments = 40) {
  const pos = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const p = curve.getPoint(i / segments);
    pos.push(p.x - width / 2, p.y, p.z, p.x + width / 2, p.y, p.z);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---------- surface maps ----------
// Fine directional streaks: used as a roughness map so metal looks brushed / bead-blasted.
export function brushedMap() {
  if (cache.brushed) return cache.brushed;
  const [c, g] = canvas(1024, 1024);
  const r = rng(5);
  g.fillStyle = '#8a8a8a';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 14000; i++) {
    const y = r() * 1024, x = r() * 1024 - 200, len = 80 + r() * 500, v = (100 + r() * 70) | 0;
    g.strokeStyle = `rgba(${v},${v},${v},${0.12 + r() * 0.22})`;
    g.lineWidth = 0.5 + r() * 1.1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 1.2); g.stroke();
  }
  return (cache.brushed = toTex(c, { srgb: false, repeat: [1.5, 1.5] }));
}

function noiseMap(seed = 9, base = 128, amp = 40) {
  const key = `noise${seed}${base}${amp}`;
  if (cache[key]) return cache[key];
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = base + (r() - 0.5) * amp;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (cache[key] = toTex(c, { srgb: false, repeat: [6, 6] }));
}

// ---------- materials ----------
export const MAT = {
  aluminium: (color = 0xc3c6cc) => new THREE.MeshPhysicalMaterial({
    color, metalness: 1, roughness: 0.55, roughnessMap: brushedMap(), anisotropy: 0.45, clearcoat: 0.05,
  }),
  darkAluminium: () => new THREE.MeshPhysicalMaterial({ color: 0x5b5f66, metalness: 1, roughness: 0.6, roughnessMap: brushedMap() }),
  plastic: (color = 0x1d2025, rough = 0.62) => new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: rough, roughnessMap: noiseMap(3, 140, 30) }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x141518, metalness: 0, roughness: 0.92 }),
  copper: () => new THREE.MeshPhysicalMaterial({ color: 0xc77b4f, metalness: 1, roughness: 0.38, roughnessMap: noiseMap(7, 128, 50), clearcoat: 0.2 }),
  nickel: () => new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.32, roughnessMap: noiseMap(11, 128, 60) }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xe0b356, metalness: 1, roughness: 0.22 }),
  epoxy: () => new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.1, roughness: 0.48, roughnessMap: noiseMap(13, 128, 40) }),
  silicon: () => new THREE.MeshPhysicalMaterial({ color: 0x1b2130, metalness: 0.7, roughness: 0.12, iridescence: 0.8, iridescenceIOR: 1.6, clearcoat: 1 }),
  glassBlack: () => new THREE.MeshPhysicalMaterial({ color: 0x050608, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03 }),
  mlcc: () => new THREE.MeshStandardMaterial({ color: 0xa9906a, metalness: 0.1, roughness: 0.55 }),
  keycap: () => new THREE.MeshStandardMaterial({ color: 0x18191c, metalness: 0.05, roughness: 0.5, roughnessMap: noiseMap(17, 120, 30) }),
  flex: () => new THREE.MeshPhysicalMaterial({ color: 0xc9781f, metalness: 0, roughness: 0.35, clearcoat: 0.6, side: THREE.DoubleSide }),
};

// ---------- printed / etched surfaces ----------
// ---------- printed circuit boards, laid out like real ones ----------
function dedupe(pts) {
  const out = [pts[0]];
  for (const p of pts.slice(1)) { const q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) out.push(p); }
  return out;
}
// Orthogonal route with a single 45° jog, the way a PCB tool routes a bus.
function route([x0, y0], [x1, y1]) {
  const dx = x1 - x0, dy = y1 - y0;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sx = Math.sign(dx) || 1, run = (Math.abs(dx) - Math.abs(dy)) / 2;
    return dedupe([[x0, y0], [x0 + sx * run, y0], [x1 - sx * run, y1], [x1, y1]]);
  }
  const sy = Math.sign(dy) || 1, run = (Math.abs(dy) - Math.abs(dx)) / 2;
  return dedupe([[x0, y0], [x0, y0 + sy * run], [x1, y1 - sy * run], [x1, y1]]);
}
// Parallel copy of a polyline (mitred corners) so a bus keeps constant spacing through its bends.
function offsetLine(pts, off) {
  const segN = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy) || 1;
    segN.push([-dy / l, dx / l]);
  }
  return pts.map((p, i) => {
    let m;
    if (i === 0) m = segN[0];
    else if (i === pts.length - 1) m = segN[segN.length - 1];
    else {
      const a = segN[i - 1], b = segN[i];
      let mx = a[0] + b[0], my = a[1] + b[1];
      const l = Math.hypot(mx, my) || 1;
      mx /= l; my /= l;
      const k = 1 / Math.max(0.3, mx * b[0] + my * b[1]);
      m = [mx * k, my * k];
    }
    return [p[0] + m[0] * off, p[1] + m[1] * off];
  });
}

/**
 * Draw a board from a layout (all coordinates in world units, x right, z towards the viewer):
 * { x0, x1, z0, z1, mask, copper, parts: [{ id, x, z, w, d, kind }], buses: [{ a, b, n, pitch, w }],
 *   pours: [[[x, z], …]], pads: [{ x, z, w, d }], holes: [[x, z, r]], stitch: step, title: { lines, x, z } }
 * Returns a material whose map (and bump) line up exactly with the 3D parts placed from the same layout.
 */
export function boardMaterial(L) {
  const S = L.ppu || Math.min(2048 / (L.x1 - L.x0), 2048 / (L.z1 - L.z0));
  const W = Math.round((L.x1 - L.x0) * S), H = Math.round((L.z1 - L.z0) * S);
  const X = (x) => (x - L.x0) * S, Y = (z) => (z - L.z0) * S;
  const [c, g] = canvas(W, H), [cb, gb] = canvas(W, H);
  const r = rng(L.seed || 1);
  g.fillStyle = L.mask || '#0f3326'; g.fillRect(0, 0, W, H);
  gb.fillStyle = '#000'; gb.fillRect(0, 0, W, H);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.018})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3); }
  const copper = L.copper || 'rgba(96,168,118,0.42)';

  for (const poly of L.pours || []) {
    for (const [ctx2, col] of [[g, copper], [gb, '#555']]) {
      ctx2.fillStyle = col; ctx2.beginPath();
      poly.forEach(([x, z], i) => (i ? ctx2.lineTo(X(x), Y(z)) : ctx2.moveTo(X(x), Y(z))));
      ctx2.closePath(); ctx2.fill();
    }
  }
  for (const b of L.buses || []) {
    const center = b.pts ? dedupe(b.pts.map(([x, z]) => [X(x), Y(z)])) : route([X(b.a[0]), Y(b.a[1])], [X(b.b[0]), Y(b.b[1])]);
    const pitch = (b.pitch || 0.009) * S;
    for (let k = 0; k < b.n; k++) {
      const line = offsetLine(center, (k - (b.n - 1) / 2) * pitch);
      for (const [ctx2, col] of [[g, copper], [gb, '#fff']]) {
        ctx2.strokeStyle = col; ctx2.lineWidth = (b.w || 0.0035) * S; ctx2.lineJoin = 'miter'; ctx2.lineCap = 'round';
        ctx2.beginPath(); line.forEach(([x, y], i) => (i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y))); ctx2.stroke();
      }
    }
  }
  const gold = L.gold || '#cda65a';
  const pad = (x, z, w, d) => { g.fillStyle = gold; g.fillRect(X(x - w / 2), Y(z - d / 2), w * S, d * S); gb.fillStyle = '#ddd'; gb.fillRect(X(x - w / 2), Y(z - d / 2), w * S, d * S); };
  for (const p of L.pads || []) pad(p.x, p.z, p.w, p.d);
  for (const p of L.parts || []) {
    if (p.kind !== 'cap') continue;
    const vert = p.d > p.w;
    const pw = vert ? p.w : p.w * 0.36, pd = vert ? p.d * 0.36 : p.d;
    if (vert) { pad(p.x, p.z - p.d * 0.36, pw * 1.1, pd); pad(p.x, p.z + p.d * 0.36, pw * 1.1, pd); }
    else { pad(p.x - p.w * 0.36, p.z, pw, pd * 1.1); pad(p.x + p.w * 0.36, p.z, pw, pd * 1.1); }
  }
  const via = (x, z) => {
    g.fillStyle = '#b89a5a'; g.beginPath(); g.arc(X(x), Y(z), 0.0045 * S, 0, 7); g.fill();
    g.fillStyle = '#1a1f22'; g.beginPath(); g.arc(X(x), Y(z), 0.002 * S, 0, 7); g.fill();
    gb.fillStyle = '#999'; gb.beginPath(); gb.arc(X(x), Y(z), 0.0045 * S, 0, 7); gb.fill();
  };
  if (L.stitch) {
    const st = L.stitch, ins = st * 0.8;
    for (let x = L.x0 + ins; x <= L.x1 - ins + 1e-6; x += st) { via(x, L.z0 + ins); via(x, L.z1 - ins); }
    for (let z = L.z0 + ins + st; z <= L.z1 - ins - st + 1e-6; z += st) { via(L.x0 + ins, z); via(L.x1 - ins, z); }
  }
  for (const [x, z] of L.vias || []) via(x, z);
  for (const [x, z, rr] of L.holes || []) {
    g.fillStyle = '#c9a75c'; g.beginPath(); g.arc(X(x), Y(z), rr * 1.6 * S, 0, 7); g.fill();
    g.fillStyle = '#0b0d10'; g.beginPath(); g.arc(X(x), Y(z), rr * S, 0, 7); g.fill();
  }
  // silkscreen: one tidy outline + designator per part, all in the same font and position
  const silk = 'rgba(236,240,242,0.82)';
  const fs = (L.font || 0.016) * S;
  g.strokeStyle = silk; g.fillStyle = silk; g.lineWidth = Math.max(1.2, 0.0016 * S);
  g.font = `600 ${fs}px ${MONO}`; g.textBaseline = 'bottom';
  for (const p of L.parts || []) {
    if (p.kind === 'cap' || p.silk === false) continue;
    const m = 0.008;
    const x0 = X(p.x - p.w / 2 - m), y0 = Y(p.z - p.d / 2 - m), w = (p.w + 2 * m) * S, h = (p.d + 2 * m) * S;
    g.strokeRect(x0, y0, w, h);
    g.beginPath(); g.moveTo(x0, y0 + 0.012 * S); g.lineTo(x0, y0); g.lineTo(x0 + 0.012 * S, y0); g.lineWidth *= 2.2; g.stroke(); g.lineWidth /= 2.2;
    if (p.id) {
      const above = y0 - fs * 1.1 > 0;
      g.textBaseline = above ? 'bottom' : 'top';
      g.fillText(p.id, x0, above ? y0 - 0.003 * S : y0 + h + 0.003 * S);
    }
  }
  if (L.title) {
    g.textBaseline = 'top';
    L.title.lines.forEach((t, i) => { g.font = `${i ? 500 : 700} ${(i ? 0.014 : 0.018) * S}px ${MONO}`; g.fillText(t, X(L.title.x), Y(L.title.z) + i * 0.024 * S); });
  }
  return new THREE.MeshStandardMaterial({ map: toTex(c), bumpMap: toTex(cb, { srgb: false }), bumpScale: 0.5, roughness: 0.42, metalness: 0.05 });
}

// A plain but believable board for parts with no detailed layout: stitched edges, a title, a few buses.
export function pcbMaterial({ mask = '#123a2a', copper, title = [], w = 2, d = 1, buses = [], gold } = {}) {
  return boardMaterial({
    x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2, mask, copper, gold, buses, stitch: Math.min(w, d) / 12,
    title: title.length ? { lines: title, x: -w / 2 + Math.min(w, d) * 0.12, z: d / 2 - Math.min(w, d) * 0.22 } : null,
    font: Math.min(w, d) * 0.03,
  });
}

// Black epoxy package top with laser-etched text and a pin-1 dot.
export function etchedTop(lines, { w = 512, h = 512, bg = '#16181d', fg = 'rgba(176,182,194,0.72)', dot = true, size = 0.13 } = {}) {
  const key = `etch${lines.join('|')}${w}${h}${bg}`;
  if (cache[key]) return cache[key];
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const r = rng(lines.join('').length + 3);
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.03})`; g.fillRect(r() * w, r() * h, 2, 2); }
  g.fillStyle = fg; g.textAlign = 'center';
  const fs = Math.round(Math.min(w, h) * size);
  lines.forEach((t, i) => {
    g.font = `${i ? 500 : 700} ${i ? fs * 0.8 : fs}px ${MONO}`;
    g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.25 + fs * 0.35);
  });
  if (dot) { g.beginPath(); g.arc(w * 0.12, h * 0.14, Math.min(w, h) * 0.035, 0, 7); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill(); g.strokeStyle = 'rgba(200,200,210,0.25)'; g.stroke(); }
  return (cache[key] = toTex(c));
}

// A chip/package: rounded epoxy block with etched markings on top.
export function chip(w, h, d, lines, opts = {}) {
  const geo = slab(w, d, h, opts.r ?? 0.006, opts.bevel ?? 0.0015);
  const side = opts.sideMat || MAT.epoxy();
  const top = new THREE.MeshStandardMaterial({ map: etchedTop(lines, opts), roughness: 0.5, metalness: 0.1 });
  // ExtrudeGeometry groups: 0 = caps (top + bottom), 1 = sides
  return new THREE.Mesh(geo, [top, side]);
}

// Shiny metal RF shield / lid with stamped text.
export function stampedTop(lines, { w = 512, h = 512 } = {}) {
  const key = `stamp${lines.join('|')}`;
  if (cache[key]) return cache[key];
  const [c, g] = canvas(w, h);
  g.fillStyle = '#7c7f86'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(40,42,48,0.75)'; g.textAlign = 'center';
  lines.forEach((t, i) => { g.font = `${i ? 500 : 700} ${i ? 30 : 40}px ${SANS}`; g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 46); });
  g.strokeStyle = 'rgba(40,42,48,0.4)'; g.lineWidth = 3; g.strokeRect(24, 24, w - 48, h - 48);
  return (cache[key] = toTex(c));
}

export function battLabel() {
  if (cache.batt) return cache.batt;
  const [c, g] = canvas(1024, 900);
  g.fillStyle = '#16181c'; g.fillRect(0, 0, 1024, 900);
  g.fillStyle = 'rgba(220,226,235,0.9)';
  g.font = `700 64px ${SANS}`; g.fillText('Li-ion Polymer Cell', 70, 150);
  g.font = `500 40px ${MONO}`;
  ['3.85 V ⎓ 4380 mAh  16.9 Wh', 'Charge limit 4.40 V', 'Model EP-01 · Rev. A'].forEach((t, i) => g.fillText(t, 70, 250 + i * 60));
  g.fillStyle = 'rgba(220,226,235,0.55)'; g.font = `400 26px ${SANS}`;
  ['CAUTION: Do not puncture, crush or heat above 60 °C.', 'Risk of fire and burns. Do not short-circuit.', 'Recycle properly. Contains lithium.'].forEach((t, i) => g.fillText(t, 70, 520 + i * 40));
  g.strokeStyle = 'rgba(220,226,235,0.6)'; g.lineWidth = 4;
  for (let i = 0; i < 3; i++) g.strokeRect(70 + i * 120, 700, 90, 90);
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(220,226,235,0.8)'; g.fillRect(520 + i * 11, 700, (i * 7) % 3 + 2, 90); }
  return (cache.batt = toTex(c));
}

export function ssdLabel() {
  if (cache.ssd) return cache.ssd;
  const [c, g] = canvas(1024, 320);
  g.fillStyle = '#eceef1'; g.fillRect(0, 0, 1024, 320);
  g.fillStyle = '#1b1e24'; g.font = `800 64px ${SANS}`; g.fillText('NVMe SSD', 40, 90);
  g.font = `500 34px ${MONO}`; g.fillText('1 TB · PCIe 4.0 x4 · M.2 2280', 40, 150);
  g.fillText('S/N EP01-2026-0042', 40, 200);
  for (let i = 0; i < 70; i++) g.fillRect(40 + i * 8, 230, (i * 13) % 4 + 1.5, 60);
  g.fillRect(680, 40, 280, 250);
  g.fillStyle = '#eceef1';
  const r = rng(4);
  for (let i = 0; i < 14; i++) for (let j = 0; j < 12; j++) if (r() < 0.5) g.fillRect(690 + i * 19, 50 + j * 19, 18, 18);
  return (cache.ssd = toTex(c));
}

// Dot-perforation for speaker grilles (alpha map: white = hole).
export function grilleAlpha(cols = 8, rows = 60) {
  const key = `grille${cols}${rows}`;
  if (cache[key]) return cache[key];
  const [c, g] = canvas(cols * 16, rows * 16);
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { g.beginPath(); g.arc(i * 16 + 8 + (j % 2) * 4, j * 16 + 8, 3.6, 0, 7); g.fill(); }
  return (cache[key] = toTex(c, { srgb: false }));
}

// Cover glass: thin black border, a camera notch at the top, clear (with rounded top corners) over the screen.
export const BEZEL = { w: 3.18, d: 2.18, side: 0.04, top: 0.065, bottom: 0.095, notchW: 0.22, notchD: 0.032 };
export function coverGlassMaps() {
  if (cache.glass) return cache.glass;
  const S = 600, W = Math.round(BEZEL.w * S), H = Math.round(BEZEL.d * S);
  const [c, g] = canvas(W, H), [ca, ga] = canvas(W, H);
  const sx = BEZEL.side * S, st = BEZEL.top * S, sb = BEZEL.bottom * S, rr = 0.045 * S;
  g.fillStyle = '#040506'; g.fillRect(0, 0, W, H);
  ga.fillStyle = '#fff'; ga.fillRect(0, 0, W, H);
  // screen window (rounded top corners) is see-through
  ga.fillStyle = '#121212';
  ga.beginPath();
  ga.moveTo(sx, H - sb); ga.lineTo(sx, st + rr); ga.quadraticCurveTo(sx, st, sx + rr, st);
  ga.lineTo(W - sx - rr, st); ga.quadraticCurveTo(W - sx, st, W - sx, st + rr); ga.lineTo(W - sx, H - sb); ga.closePath(); ga.fill();
  // notch: stays black, with the camera
  const nw = BEZEL.notchW * S, nd = BEZEL.notchD * S, nx = (W - nw) / 2;
  ga.fillStyle = '#fff'; ga.beginPath(); ga.moveTo(nx, st); ga.lineTo(nx, st + nd - 10); ga.quadraticCurveTo(nx, st + nd, nx + 10, st + nd);
  ga.lineTo(nx + nw - 10, st + nd); ga.quadraticCurveTo(nx + nw, st + nd, nx + nw, st + nd - 10); ga.lineTo(nx + nw, st); ga.closePath(); ga.fill();
  const cy = st + nd * 0.45;
  g.fillStyle = '#0e1016'; g.beginPath(); g.arc(W / 2, cy, 8, 0, 7); g.fill();
  g.fillStyle = '#1b2a48'; g.beginPath(); g.arc(W / 2, cy, 4.5, 0, 7); g.fill();
  g.fillStyle = 'rgba(160,200,255,0.8)'; g.beginPath(); g.arc(W / 2 - 1.5, cy - 1.5, 1.4, 0, 7); g.fill();
  // printed model name on the chin
  g.fillStyle = 'rgba(120,124,132,0.6)'; g.font = `500 ${Math.round(0.022 * S)}px ${SANS}`; g.textAlign = 'center';
  g.fillText('EP-01 Pro', W / 2, H - sb * 0.42);
  return (cache.glass = { map: toTex(c), alpha: toTex(ca, { srgb: false }) });
}

// What's on the display: a calm, luminous welcome screen with the logogram.
export function screenTexture() {
  if (cache.screen) return cache.screen;
  const W = 1600, H = 1040;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#0b0a09'; g.fillRect(0, 0, W, H);
  // soft light, like dawn through mist
  for (const [x, y, r, col] of [[W * 0.3, H * 0.85, 700, 'rgba(226,195,155,0.30)'], [W * 0.78, H * 0.2, 640, 'rgba(160,190,185,0.22)'], [W * 0.55, H * 0.55, 420, 'rgba(255,240,220,0.10)']]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  g.textAlign = 'center';
  g.fillStyle = 'rgba(240,234,224,0.95)'; g.font = `300 72px ${SANS}`; g.letterSpacing = '2px';
  g.fillText('Inside the Machine', W / 2, H * 0.5);
  g.letterSpacing = '0px';
  return (cache.screen = toTex(c));
}

// ---------- keyboard ----------
// A real layout (in key units) and the legend texture that sits on the keycaps.
export function keyboardLayout(U = 0.19) {
  const rows = [
    { h: 0.55, keys: [['esc', 1.5], ...Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, 1]), ['⏻', 1.5]] },
    { h: 1, keys: [['`', 1], ...'1234567890'.split('').map((k) => [k, 1]), ['-', 1], ['=', 1], ['delete', 2]] },
    { h: 1, keys: [['tab', 1.5], ...'QWERTYUIOP'.split('').map((k) => [k, 1]), ['[', 1], [']', 1], ['\\', 1.5]] },
    { h: 1, keys: [['caps lock', 1.8], ...'ASDFGHJKL'.split('').map((k) => [k, 1]), [';', 1], ["'", 1], ['return', 2.2]] },
    { h: 1, keys: [['shift', 2.35], ...'ZXCVBNM'.split('').map((k) => [k, 1]), [',', 1], ['.', 1], ['/', 1], ['shift', 2.65]] },
    { h: 1, keys: [['fn', 1], ['control', 1], ['option', 1], ['command', 1.25], ['', 5.5], ['command', 1.25], ['option', 1], ['←', 1], ['↑↓', 1], ['→', 1]] },
  ];
  const keys = [];
  const totalDepth = rows.reduce((a, r) => a + r.h, 0) * U;
  let z = -totalDepth / 2;
  for (const row of rows) {
    let x = -7.5 * U;
    const d = row.h * U;
    for (const [label, wu] of row.keys) {
      const w = wu * U;
      if (label === '↑↓') {
        keys.push({ label: '↑', x: x + w / 2, z: z + d * 0.25, w: w - 0.024, d: d / 2 - 0.016 });
        keys.push({ label: '↓', x: x + w / 2, z: z + d * 0.75, w: w - 0.024, d: d / 2 - 0.016 });
      } else keys.push({ label, x: x + w / 2, z: z + d / 2, w: w - 0.024, d: d - 0.024, small: label.length > 1 && !/^F\d+$/.test(label) && label !== '⏻' });
      x += w;
    }
    z += d;
  }
  return { keys, width: 15 * U, depth: totalDepth };
}

export function legendTexture(layout) {
  const S = 700; // px per world unit
  const W = Math.round(layout.width * S), H = Math.round(layout.depth * S);
  const [c, g] = canvas(W, H);
  g.fillStyle = 'rgba(236,240,246,0.92)';
  g.textBaseline = 'middle';
  for (const k of layout.keys) {
    if (!k.label) continue;
    const cx = (k.x + layout.width / 2) * S, cy = (k.z + layout.depth / 2) * S;
    if (k.small) {
      g.font = `500 ${Math.round(S * 0.024)}px ${SANS}`; g.textAlign = 'left';
      g.fillText(k.label, cx - (k.w / 2) * S + S * 0.018, cy + (k.d / 2) * S - S * 0.03);
    } else {
      g.font = `500 ${Math.round(S * (k.label.length > 1 ? 0.026 : 0.042))}px ${SANS}`; g.textAlign = 'center';
      g.fillText(k.label, cx, cy);
    }
  }
  return toTex(c);
}

// ---------- silicon die shots ----------
/**
 * A die photo look: dark silicon with functional regions drawn the way they appear under a microscope.
 * regions: [{ x0, y0, x1, y1, kind }] in 0…1 (y down = towards the back), kind: core | cache | gpu | rf | logic | io.
 */
export function dieShot(regions, { W = 1400, H = 1000, seed = 3 } = {}) {
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  g.fillStyle = '#141a26'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(150,170,210,${r() * 0.04})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  // bond-pad ring
  g.fillStyle = 'rgba(185,170,120,0.55)';
  for (let x = 14; x < W - 14; x += 22) { g.fillRect(x, 6, 12, 12); g.fillRect(x, H - 18, 12, 12); }
  for (let y = 30; y < H - 30; y += 22) { g.fillRect(6, y, 12, 12); g.fillRect(W - 18, y, 12, 12); }
  for (const R of regions) {
    const x0 = R.x0 * W, y0 = R.y0 * H, w = (R.x1 - R.x0) * W, h = (R.y1 - R.y0) * H;
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    if (R.kind === 'cache') {
      g.fillStyle = '#2a2a33'; g.fillRect(x0, y0, w, h);
      const cw = 9, ch = 6;
      for (let y = y0 + 3; y < y0 + h; y += ch) for (let x = x0 + 3; x < x0 + w; x += cw) {
        g.fillStyle = (Math.floor((x - x0) / 60) + Math.floor((y - y0) / 40)) % 2 ? 'rgba(170,150,105,0.55)' : 'rgba(150,135,100,0.45)';
        g.fillRect(x, y, cw - 2, ch - 2);
      }
    } else if (R.kind === 'core') {
      g.fillStyle = '#1e2638'; g.fillRect(x0, y0, w, h);
      const rc = rng(77); // every core is an identical copy, as on a real die
      for (let k = 0; k < 7; k++) { // functional units inside a core
        const bx = x0 + rc() * w * 0.7, by = y0 + rc() * h * 0.7, bw = w * (0.15 + rc() * 0.25), bh = h * (0.1 + rc() * 0.18);
        g.fillStyle = `rgba(${90 + rc() * 60},${100 + rc() * 50},${150 + rc() * 60},0.35)`; g.fillRect(bx, by, bw, bh);
      }
      g.fillStyle = 'rgba(170,150,105,0.5)';
      for (let y = y0 + h * 0.78; y < y0 + h - 4; y += 6) for (let x = x0 + 4; x < x0 + w - 4; x += 8) g.fillRect(x, y, 6, 4);
      g.strokeStyle = 'rgba(120,140,190,0.12)';
      for (let y = y0; y < y0 + h; y += 3) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); }
    } else if (R.kind === 'gpu') {
      g.fillStyle = '#1b2a2a'; g.fillRect(x0, y0, w, h);
      const n = 6;
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
        const bx = x0 + 6 + j * (w / 2), by = y0 + 6 + i * (h / n), bw = w / 2 - 12, bh = h / n - 12;
        g.fillStyle = 'rgba(80,150,130,0.35)'; g.fillRect(bx, by, bw, bh);
        g.strokeStyle = 'rgba(140,210,190,0.25)'; g.strokeRect(bx, by, bw, bh);
      }
    } else if (R.kind === 'rf') {
      g.fillStyle = '#1d1f2c'; g.fillRect(x0, y0, w, h);
      // spiral inductors: the signature of an RF circuit
      const s = Math.min(w, h) * 0.38;
      const cx = x0 + w / 2, cy = y0 + h / 2;
      g.strokeStyle = 'rgba(205,175,110,0.8)'; g.lineWidth = Math.max(2, s * 0.05);
      g.beginPath();
      for (let k = 0; k < 4; k++) { const d = s * (1 - k * 0.2); g.rect(cx - d, cy - d, 2 * d, 2 * d); }
      g.stroke();
    } else if (R.kind === 'logic') {
      g.fillStyle = '#1c2130'; g.fillRect(x0, y0, w, h);
      for (let y = y0 + 2; y < y0 + h; y += 4) { g.fillStyle = `rgba(130,140,180,${0.08 + r() * 0.12})`; g.fillRect(x0, y, w, 2); }
      for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(160,140,100,0.35)'; g.fillRect(x0 + w * (0.08 + (k % 2) * 0.5), y0 + h * (0.1 + Math.floor(k / 2) * 0.45), w * 0.34, h * 0.3); }
    } else if (R.kind === 'io') {
      g.fillStyle = '#1e1e26'; g.fillRect(x0, y0, w, h);
      g.fillStyle = 'rgba(185,170,120,0.5)';
      for (let y = y0 + 5; y < y0 + h - 8; y += 14) for (let x = x0 + 5; x < x0 + w - 8; x += 14) g.fillRect(x, y, 8, 8);
    }
    g.restore();
    g.strokeStyle = 'rgba(160,175,210,0.28)'; g.lineWidth = 2; g.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
  }
  return toTex(c);
}

// Silicon die mesh: dark, slightly iridescent box with the die shot on top.
export function dieMesh(w, h, d, regions, opts) {
  const top = new THREE.MeshPhysicalMaterial({ map: dieShot(regions, opts), metalness: 0.55, roughness: 0.28, iridescence: 0.6, iridescenceIOR: 1.5, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const side = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.5, roughness: 0.4 });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, side, side, side]);
}

// ---------- swept shells ----------
// Points (with outward normals) around a rounded rectangle, seen from above.
export function roundedPerimeter(w, d, r, perCorner = 12) {
  const hw = w / 2 - r, hd = d / 2 - r, pts = [];
  for (const [cx, cz, a0] of [[hw, hd, 0], [-hw, hd, Math.PI / 2], [-hw, -hd, Math.PI], [hw, -hd, Math.PI * 1.5]]) {
    for (let i = 0; i <= perCorner; i++) {
      const a = a0 + (i / perCorner) * (Math.PI / 2), nx = Math.cos(a), nz = Math.sin(a);
      pts.push({ x: cx + nx * r, z: cz + nz * r, nx, nz });
    }
  }
  return pts;
}

/**
 * Sweep a closed cross-section around a rounded-rectangle outline: how a unibody laptop shell is shaped.
 * profile: [[o, y], …] where o is the offset from the outline (0 = outermost, negative = inwards).
 */
export function shell(w, d, r, profile, perCorner = 14) {
  const per = roundedPerimeter(w, d, r, perCorner);
  const P = per.length, Q = profile.length, pos = [], uv = [], idx = [];
  let run = 0;
  per.forEach((p, i) => {
    if (i) run += Math.hypot(p.x - per[i - 1].x, p.z - per[i - 1].z);
    profile.forEach(([o, y], j) => { pos.push(p.x + p.nx * o, y, p.z + p.nz * o); uv.push(run / 2, j / (Q - 1)); });
  });
  for (let i = 0; i < P; i++) for (let j = 0; j < Q; j++) {
    const a = i * Q + j, b = ((i + 1) % P) * Q + j, c = ((i + 1) % P) * Q + ((j + 1) % Q), e = i * Q + ((j + 1) % Q);
    idx.push(a, b, e, b, c, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Cross-section helpers: quarter arcs between two points around a centre.
export function arc(cx, cy, r, a0, a1, n = 8) {
  return Array.from({ length: n + 1 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
}
