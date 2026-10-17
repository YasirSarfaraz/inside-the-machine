import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const frac = (v) => v - Math.floor(v);

// Deterministic random so every playback looks identical.
export function rng(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

export function rbox(w, h, d, r = 0.02, seg = 3) {
  const radius = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  return new RoundedBoxGeometry(w, h, d, seg, radius);
}

const std = (o) => new THREE.MeshStandardMaterial(o);
export const M = {
  alu: std({ color: 0xbfc4cc, metalness: 0.75, roughness: 0.55 }),
  aluDark: std({ color: 0x6c717b, metalness: 0.85, roughness: 0.4 }),
  pcb: std({ color: 0x1f6b45, metalness: 0.15, roughness: 0.55 }),
  pcbDark: std({ color: 0x173c5e, metalness: 0.15, roughness: 0.5 }),
  chip: std({ color: 0x17191f, metalness: 0.3, roughness: 0.35 }),
  gold: std({ color: 0xd9a441, metalness: 1, roughness: 0.25 }),
  copper: std({ color: 0xc8743f, metalness: 1, roughness: 0.3 }),
  silver: std({ color: 0xd5d9e0, metalness: 1, roughness: 0.3 }),
  rubber: std({ color: 0x1d1f24, metalness: 0, roughness: 0.85 }),
  plastic: std({ color: 0x2a2e36, metalness: 0.1, roughness: 0.55 }),
  key: std({ color: 0x202328, metalness: 0.2, roughness: 0.55 }),
  battery: std({ color: 0x2b2f37, metalness: 0.35, roughness: 0.4 }),
  stripe: std({ color: 0x2f6fd6, metalness: 0.2, roughness: 0.45 }),
  black: std({ color: 0x050608, metalness: 0.2, roughness: 0.5 }),
};

// Unlit HDR colour: values > 1 make it bloom.
export function glow(hex, k = 2.2) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: true });
}

export function textSprite(text, { size = 0.3, color = '#e8f1ff', weight = 600, mono = false } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `${weight} 64px ${mono ? '"JetBrains Mono", monospace' : 'Inter, system-ui, sans-serif'}`;
  g.font = font;
  if (!mono) g.letterSpacing = '1px';
  const w = Math.ceil(g.measureText(text).width) + 24;
  c.width = w; c.height = 92;
  g.font = font; g.fillStyle = color; g.textBaseline = 'middle';
  if (!mono) g.letterSpacing = '1px';
  g.fillText(text, 12, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set((size * w) / 92, size, 1);
  return s;
}

// ---- thick lines (Line2) ----
export const lineMats = [];
export function makeLine(n, { width = 3, color = 0xffffff, vertexColors = false, opacity = 1 } = {}) {
  const geo = new LineGeometry();
  geo.setPositions(new Float32Array(n * 3));
  if (vertexColors) geo.setColors(new Float32Array(n * 3).fill(1));
  const mat = new LineMaterial({ color, linewidth: width, vertexColors, transparent: true, opacity, depthWrite: false });
  mat.resolution.set(innerWidth, innerHeight);
  lineMats.push(mat);
  const line = new Line2(geo, mat);
  line.frustumCulled = false;
  line.userData.n = n;
  return line;
}

// Update a Line2 in place (no reallocation): pts / cols are Float32Array(3n).
export function setLine(line, pts, cols) {
  const n = line.userData.n;
  const g = line.geometry;
  const a = g.attributes.instanceStart.data;
  for (let i = 0; i < n - 1; i++) {
    a.array.set(pts.subarray(i * 3, i * 3 + 6), i * 6);
  }
  a.needsUpdate = true;
  if (cols && g.attributes.instanceColorStart) {
    const c = g.attributes.instanceColorStart.data;
    for (let i = 0; i < n - 1; i++) c.array.set(cols.subarray(i * 3, i * 3 + 6), i * 6);
    c.needsUpdate = true;
  }
}

export function staticLine(points, opts) {
  const line = makeLine(points.length, opts);
  line.geometry.setPositions(points.flat());
  return line;
}

// Faint blueprint floor grid
export function makeFloor(size = 30, y = 0, div = 60) {
  const grid = new THREE.GridHelper(size, div, 0x2c2924, 0x181612);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.material.depthWrite = false;
  grid.position.y = y;
  return grid;
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// A set of n arrows (shaft + head) whose origin, direction and signed length are set per frame.
export function arrowSet(n, color, radius = 0.025, k = 2.2) {
  const mat = glow(color, k);
  const shaft = new THREE.InstancedMesh(new THREE.CylinderGeometry(radius, radius, 1, 8).translate(0, 0.5, 0), mat, n);
  const headLen = radius * 6;
  const head = new THREE.InstancedMesh(new THREE.ConeGeometry(radius * 2.4, headLen, 12).translate(0, headLen / 2, 0), mat, n);
  const g = new THREE.Group();
  g.add(shaft, head);
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
  const sc = new THREE.Vector3(), p = new THREE.Vector3();
  g.userData.mat = mat;
  g.userData.set = (i, origin, dir, len) => {
    const L = Math.abs(len);
    d.copy(dir).multiplyScalar(len < 0 ? -1 : 1);
    q.setFromUnitVectors(up, d);
    const hs = Math.min(1, L / headLen);
    const sl = Math.max(1e-4, L - headLen * hs);
    m.compose(origin, q, sc.set(L > 1e-3 ? 1 : 0, sl, L > 1e-3 ? 1 : 0));
    shaft.setMatrixAt(i, m);
    p.copy(d).multiplyScalar(sl).add(origin);
    m.compose(p, q, sc.set(hs, hs, hs));
    head.setMatrixAt(i, m);
  };
  g.userData.commit = () => { shaft.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true; };
  return g;
}

// Flat dark panel with a thin border, used as a "graph paper" backing for plots.
export function panelMesh(w, h, color = 0x0e0d0b, border = 0x2c2924) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false })));
  g.add(staticLine([[-w / 2, -h / 2, 0.001], [w / 2, -h / 2, 0.001], [w / 2, h / 2, 0.001], [-w / 2, h / 2, 0.001], [-w / 2, -h / 2, 0.001]], { width: 1, color: border }));
  return g;
}

export const ease = (a, b, t) => smooth((t - a) / (b - a));
