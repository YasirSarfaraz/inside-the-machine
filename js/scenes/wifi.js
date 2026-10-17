import * as THREE from 'three';
import {
  M, rbox, glow, textSprite, makeLine, setLine, staticLine, makeFloor, canvasTexture, clamp01, frac, rng, smooth, lerp,
  arrowSet, panelMesh,
} from '../common.js';
import { MAT, slab, pcbMaterial, etchedTop, stampedTop, grilleAlpha, dieMesh } from '../realism.js';
import { flyIn, buildLaptopModel } from './laptop.js';

// The message we "receive": ASCII → 4-bit nibbles → 16-QAM symbols (Gray-coded, as in 802.11).
const MSG = 'HELLO';
const GRAY = { '00': -3, '01': -1, '11': 1, '10': 3 };
const SYMS = [];
for (const ch of MSG) {
  const byte = ch.charCodeAt(0).toString(2).padStart(8, '0');
  for (const nib of [byte.slice(0, 4), byte.slice(4)]) SYMS.push({ bits: nib, I: GRAY[nib.slice(0, 2)], Q: GRAY[nib.slice(2)] });
}
const QAM_POINTS = [];
for (const [bi, I] of Object.entries(GRAY)) for (const [bq, Q] of Object.entries(GRAY)) QAM_POINTS.push({ bits: bi + bq, I, Q });
const hash = (i, k) => frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function shellMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOp; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = pow(f, 3.0); gl_FragColor = vec4(uColor * (0.02 + 0.9 * f) * uOp, 1.0); }`,
  });
}

// smooth I/Q baseband built from the message symbols (used by the mixer scene)
function iq(t, Ts) {
  const k = Math.floor(t / Ts);
  const f = t / Ts - k;
  const n = SYMS.length;
  const a = SYMS[((k % n) + n) % n];
  const b = SYMS[(((k + 1) % n) + n) % n];
  const m = smooth((f - 0.75) / 0.25);
  return [lerp(a.I, b.I, m) / 3, lerp(a.Q, b.Q, m) / 3];
}

export function wifiChapter(ctx) {
  const { gsap } = ctx;
  const s = {
    waveOn: 0, hit: 0, front: -7.6, lam: 0, amp: 0, open1: 0, open2: 0, p: 0, filt: 0, iq: 0, prod: 0,
    samp: 0, quant: 0, codes: 0, split: 0, orth: 0, pick: 0, sym: -5.2, readout: 0, pkt: 0, crc: 0, page: 0,
  };
  const tl = gsap.timeline();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const r = rng(3);
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();

  // =============== 1. router → laptop ===============
  const wide = ctx.register('wifiWide', new THREE.Group());
  wide.add(makeFloor(48, 0, 96));
  const router = new THREE.Group();
  router.position.set(-4.5, 0, 0);
  wide.add(router);
  add(router, slab(1.7, 1.05, 0.3, 0.16, 0.05), MAT.plastic(0x16181c, 0.38), 0, 0, 0);
  add(router, new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x050607, alphaMap: grilleAlpha(20, 10), transparent: true, depthWrite: false }), 0, 0.302, -0.05).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 4; i++) add(router, new THREE.SphereGeometry(0.03, 12, 8), glow(0x46ff9a, 2.5), -0.45 + i * 0.2, 0.2, 0.53);
  for (const [x, a] of [[-0.6, 0.18], [0, 0], [0.6, -0.18]]) {
    add(router, new THREE.CylinderGeometry(0.035, 0.045, 1.2, 14), M.rubber, x, 0.9, -0.38).rotation.z = a;
  }
  const shells = [];
  for (let i = 0; i < 7; i++) {
    const m = add(wide, new THREE.SphereGeometry(1, 64, 32), shellMaterial(0x8fd0c8), -4.5, 1.1, -0.38);
    m.renderOrder = 2;
    shells.push(m);
  }
  const miniModel = buildLaptopModel();
  const mini = miniModel.group;
  mini.scale.setScalar(0.72);
  mini.position.set(3.6, 0, 0.6);
  mini.rotation.y = -0.6;
  miniModel.parts.shadow.visible = false;
  miniModel.parts.platform.visible = false;
  miniModel.state.open = 1;
  miniModel.update();
  wide.add(mini);
  const antMat = miniModel.parts.antMat;
  const antenna = miniModel.parts.antennas.children[4]; // right-hand antenna radiator
  wide.updateMatrixWorld(true);
  const antPos = antenna.getWorldPosition(new THREE.Vector3());
  const Lrouter = ctx.label({ obj: router, at: [0, 0.3, 0.4], text: 'Wi-Fi router', sub: 'turns data into radio waves', dx: -60, dy: 90 });
  const Lwave = ctx.label({ obj: anchor(wide, -0.6, 2.6, 0), text: 'Radio waves', sub: 'spreading in every direction', dx: 60, dy: -80 });
  const Lant = ctx.label({ obj: antenna, text: 'Antennas', sub: 'in the top of the lid', dx: 90, dy: -70, hot: true });

  // =============== 2. the electromagnetic wave ===============
  const em = ctx.register('wifiEM', new THREE.Group());
  em.add(makeFloor(40, -2.2, 80));
  const NA = 49, XA0 = -7.4, XA1 = 7.4, LAMV = 4.6;
  em.add(staticLine([[XA0 - 0.4, 0, 0], [XA1 + 0.2, 0, 0]], { width: 1.5, color: 0x8e887f }));
  const dirArrow = arrowSet(1, 0xffffff, 0.04, 0.9);
  dirArrow.userData.set(0, new THREE.Vector3(XA1 + 0.2, 0, 0), X, 0.9);
  dirArrow.userData.commit();
  em.add(dirArrow);
  const Earr = arrowSet(NA, 0xe39a7c, 0.022, 1.8), Barr = arrowSet(NA, 0x8fb4d6, 0.022, 1.8);
  em.add(Earr, Barr);
  const NC = 300;
  const Ecurve = makeLine(NC, { width: 2.5, color: 0xe39a7c }), Bcurve = makeLine(NC, { width: 2.5, color: 0x8fb4d6 });
  em.add(Ecurve, Bcurve);
  const ePts = new Float32Array(NC * 3), bPts = new Float32Array(NC * 3);
  const lamLine = staticLine([[-LAMV / 2, 1.6, 0], [-LAMV / 2, 1.85, 0], [LAMV / 2, 1.85, 0], [LAMV / 2, 1.6, 0]], { width: 2, color: 0xffffff });
  em.add(lamLine);
  const LE = ctx.label({ obj: anchor(em, -4.65, 1.25, 0), text: 'Electric field (E)', sub: 'pushes on electric charges', dx: -40, dy: -80 });
  const LB = ctx.label({ obj: anchor(em, -3.5, 0, 1.25), text: 'Magnetic field (B)', sub: 'at 90° to E, in step with it', dx: -60, dy: 90 });
  const Ldir = ctx.label({ obj: anchor(em, XA1 + 0.6, 0, 0), text: 'Travels at light speed', sub: '300,000 km per second', dx: -60, dy: 80 });
  const Llam = ctx.label({ obj: anchor(em, 0, 1.85, 0), text: 'Wavelength λ', sub: '≈ 6 cm at 5 GHz', dx: 0, dy: -50, center: true, hot: true });

  // =============== 3. the antenna ===============
  const ant = ctx.register('wifiAnt', new THREE.Group());
  ant.add(makeFloor(40, -0.25, 80));
  add(ant, rbox(10.5, 0.12, 4.6, 0.04), M.plastic, 0, -0.16, 0);
  const strip = add(ant, new THREE.BoxGeometry(6, 0.06, 0.44), new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.8, roughness: 0.3, transparent: true, opacity: 0.42, depthWrite: false }), 0, 0, 0);
  ant.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(6, 0.06, 0.44)), new THREE.LineBasicMaterial({ color: 0xffd27a })));
  const coaxCurve = new THREE.CatmullRomCurve3([[-3, 0, 0], [-3.7, 0, 0.3], [-4.4, 0, 1.1], [-5.0, 0, 2.3]].map((p) => new THREE.Vector3(...p)));
  add(ant, new THREE.TubeGeometry(coaxCurve, 40, 0.09, 12), M.rubber);
  const NEA = 170;
  const eMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), glow(0xb5e3dc, 2.6), NEA);
  eMesh.renderOrder = 4;
  const eBase = Array.from({ length: NEA }, () => [-2.92 + r() * 5.84, (r() - 0.5) * 0.03, (r() - 0.5) * 0.36, r() * 6.28]);
  ant.add(eMesh);
  const NFX = 7, NFZ = 9;
  const field = arrowSet(NFX * NFZ, 0xe39a7c, 0.02, 1.6);
  ant.add(field);
  const graph = new THREE.Group();
  graph.position.set(-3.9, 1.35, 1.7);
  graph.rotation.set(-0.25, 0.35, 0);
  ant.add(graph);
  graph.add(panelMesh(3.4, 1.5));
  const curLine = makeLine(140, { width: 2.5, color: 0xb5e3dc });
  graph.add(curLine);
  const cPts = new Float32Array(140 * 3);
  const gt = textSprite('current at the feed', { size: 0.2, color: '#8e887f', mono: true });
  gt.position.set(-0.6, 0.95, 0);
  graph.add(gt);
  const Lstrip = ctx.label({ obj: strip, at: [2.4, 0.03, -0.2], text: 'Antenna', sub: 'a thin strip of metal', dx: 70, dy: -80 });
  const Lfree = ctx.label({ obj: anchor(ant, 0.8, 0.02, 0.15), text: 'Free electrons', sub: 'can move inside the metal', dx: 40, dy: 110, hot: true });
  const Lfield = ctx.label({ obj: anchor(ant, 2.6, 0.42, 1.6), text: 'Wave’s electric field', sub: 'pushes them back and forth', dx: 80, dy: 50 });
  const Lcoax = ctx.label({ obj: anchor(ant, -4.9, 0, 2.2), text: 'Coax cable', sub: 'carries the current to the chip', dx: 70, dy: 40 });

  // =============== 4. inside the Wi-Fi card ===============
  const chip = ctx.register('wifiChip', new THREE.Group());
  chip.add(makeFloor(40, -0.13, 80));
  add(chip, slab(8, 5.4, 0.12, 0.25, 0.02), [pcbMaterial({ mask: '#173a5c', copper: 'rgba(100,160,215,0.45)', w: 8, d: 5.4, title: ['M.2 2230 · EP01-WLAN', 'REV B'], buses: [{ pts: [[-2.6, 2.0], [-2.6, 2.35]], n: 9, pitch: 0.23, w: 0.05 }, { pts: [[0.4, 2.0], [0.4, 2.35]], n: 14, pitch: 0.23, w: 0.05 }] }), new THREE.MeshStandardMaterial({ color: 0x15283c })], 0, -0.12, 0);
  for (let i = 0; i < 24; i++) add(chip, new THREE.BoxGeometry(0.16, 0.02, 0.5), M.gold, -2.65 + i * 0.23, 0.005, 2.45);
  for (const x of [-3.3, -2.6]) add(chip, new THREE.CylinderGeometry(0.17, 0.17, 0.16, 20), M.gold, x, 0.08, -2.1);
  const pkgMat = new THREE.MeshStandardMaterial({ map: etchedTop(['EP01 WLAN', 'Wi-Fi 6E · 2x2 MIMO', '2326 TW'], { w: 700, h: 500, size: 0.11 }), metalness: 0.1, roughness: 0.45, transparent: true, opacity: 1 });
  const pkgBody = add(chip, rbox(5, 0.3, 3.6, 0.04), pkgMat, 0, 0.15, 0);
  const shield = new THREE.Group();
  chip.add(shield);
  add(shield, slab(6.4, 4.4, 0.36, 0.12, 0.03), [new THREE.MeshStandardMaterial({ map: stampedTop(['802.11ax · BT 5.3', 'EP01-WLAN', 'FCC ID: EP01W']), metalness: 1, roughness: 0.32 }), MAT.nickel()], 0, 0, 0);
  const die = new THREE.Group();
  die.position.y = 0.03;
  chip.add(die);
  const KIND = { 'RF input': 'io', LNA: 'rf', Mixer: 'rf', 'Local oscillator': 'rf', ADC: 'logic', 'Baseband DSP': 'core', 'MAC processor': 'cache', 'PCIe link': 'io' };
  const B = [
    // name, sub, x, z, w, d, color, label dx, dy
    ['RF input', 'from the antenna cable', -1.95, -0.75, 0.3, 0.5, 0xd9a441, -90, -40],
    ['LNA', 'low-noise amplifier', -1.4, -0.75, 0.7, 0.9, 0x3d63b8, -60, 90],
    ['Mixer', 'shifts 5 GHz down', -0.45, -0.75, 0.8, 0.9, 0x8a5cc8, -20, 100],
    ['Local oscillator', 'PLL: makes an exact 5 GHz wave', -0.45, 0.6, 0.8, 0.9, 0xc0508a, -80, 60],
    ['ADC', 'analog → digital', 0.55, -0.75, 0.8, 0.9, 0x2fa087, 20, 100],
    ['Baseband DSP', 'OFDM + QAM decoding', 1.55, -0.45, 0.95, 1.5, 0x3a8fc0, 90, 40],
    ['MAC processor', 'frames, encryption', 1.55, 0.95, 0.95, 0.7, 0x6b7fa8, 90, 30],
    ['PCIe link', 'to the laptop’s CPU', 0.55, 0.85, 0.8, 0.7, 0xb08a3a, 0, 80],
  ];
  const dieBody = dieMesh(4.4, 0.06, 3.0, B.map(([name, , x, z, w, d]) => ({ x0: (x - w / 2 + 2.2) / 4.4, x1: (x + w / 2 + 2.2) / 4.4, y0: (z - d / 2 + 1.5) / 3, y1: (z + d / 2 + 1.5) / 3, kind: KIND[name] })), { W: 1500, H: 1020, seed: 9 });
  dieBody.position.y = 0.03;
  die.add(dieBody);
  const blocks = B.map(([name, sub, x, z, w, d, color, dx, dy]) => {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = add(die, new THREE.PlaneGeometry(w, d), mat, x, 0.062, z);
    m.rotation.x = -Math.PI / 2;
    return { m, mat, L: ctx.label({ obj: m, at: [0, 0.02, 0], text: name, sub, dx, dy }) };
  });
  const path = [[-2.15, -0.75], [-1.4, -0.75], [-0.45, -0.75], [0.55, -0.75], [1.55, -0.45], [1.55, 0.95], [0.55, 0.85], [0.55, 1.5]];
  die.add(staticLine(path.map(([x, z]) => [x, 0.1, z]), { width: 3, color: 0xd9a441 }));
  die.add(staticLine([[-0.45, 0.1, 0.6], [-0.45, 0.1, -0.75]], { width: 2, color: 0xc0508a }));
  const segLen = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  const totLen = segLen.reduce((a, b) => a + b, 0);
  const pathAt = (u) => {
    let d = clamp01(u) * totLen;
    for (let i = 0; i < segLen.length; i++) {
      if (d <= segLen[i] || i === segLen.length - 1) { const f = Math.min(1, d / segLen[i]); return [lerp(path[i][0], path[i + 1][0], f), lerp(path[i][1], path[i + 1][1], f)]; }
      d -= segLen[i];
    }
    return path[path.length - 1];
  };
  const arrive = [0, ...segLen.map((_, i) => segLen.slice(0, i + 1).reduce((a, b) => a + b, 0) / totLen)];
  const pathBlock = [0, 1, 2, 4, 5, 6, 7, -1]; // which block sits at each path point
  const pulse = add(die, new THREE.SphereGeometry(0.09, 20, 12), glow(0xcdebe6, 3));
  const chipGraphs = [];
  const chipGraph = (x, z, fn, after, color = 0x8fd0c8) => {
    const pts = [];
    for (let k = 0; k < 120; k++) { const u = k / 119 - 0.5; pts.push([x + u * 1.1, 1.05 + fn(u), z]); }
    const l = staticLine(pts, { width: 2.2, color });
    die.add(l);
    chipGraphs.push([l.material, after]);
  };
  chipGraph(-1.95, -0.75, (u) => 0.04 * Math.sin(u * 55) + (r() - 0.5) * 0.05, arrive[0]);
  chipGraph(-1.4, -0.75, (u) => 0.22 * Math.sin(u * 55) + (r() - 0.5) * 0.04, arrive[1]);
  chipGraph(-0.45, -0.75, (u) => 0.22 * Math.sin(u * 7 + 0.6), arrive[2]);
  const bitsSprite = textSprite('1011 0010', { size: 0.26, mono: true, color: '#e6c08f' });
  bitsSprite.position.set(1.55, 1.05, -0.45);
  die.add(bitsSprite);
  chipGraphs.push([bitsSprite.material, arrive[4]]);
  const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe6c08f).multiplyScalar(2), transparent: true });
  for (let k = 0; k < 11; k++) { const u = k / 10 - 0.5; add(die, new THREE.SphereGeometry(0.035, 10, 8), dotMat, 0.55 + u * 1.1, 1.05 + 0.22 * Math.sin(u * 7 + 0.6), -0.75); }
  chipGraphs.push([dotMat, arrive[3]]);
  const Lshield = ctx.label({ obj: shield, at: [2.6, 0.36, -1.5], text: 'RF shield', sub: 'metal can that blocks interference', dx: 80, dy: -60 });

  // =============== 5. the mixer ===============
  const mix = ctx.register('wifiMix', new THREE.Group());
  const NM = 520, MX0 = -4.3, MX1 = 4.3, PY = [2.3, 0.2, -1.9];
  PY.forEach((y) => { const p = panelMesh(9, 1.55); p.position.y = y; mix.add(p); });
  const rfLine = makeLine(NM, { width: 2, color: 0x8fd0c8 }), loLine = makeLine(NM, { width: 2, color: 0xc070ff });
  const prodLine = makeLine(NM, { width: 2.2, color: 0x8fd0c8 }), qLine = makeLine(NM, { width: 2.2, color: 0xe6c08f });
  mix.add(rfLine, loLine, prodLine, qLine);
  const mA = new Float32Array(NM * 3), mB = new Float32Array(NM * 3), mC = new Float32Array(NM * 3), mD = new Float32Array(NM * 3);
  [['Received signal · 5 GHz', PY[0]], ['Local oscillator · exactly 5 GHz', PY[1]], ['Multiply, then filter → baseband', PY[2]]].forEach(([t, y]) => {
    const sp = textSprite(t, { size: 0.24, color: '#cfc8bd' });
    sp.position.set(MX0 + 0.1 + sp.scale.x / 2, y + 1.0, 0);
    mix.add(sp);
  });
  const times = textSprite('×', { size: 0.7, color: '#ffffff', weight: 800 }); times.position.set(-5.0, 1.25, 0); mix.add(times);
  const equals = textSprite('=', { size: 0.7, color: '#ffffff', weight: 800 }); equals.position.set(-5.0, -0.85, 0); mix.add(equals);
  const LI = ctx.label({ obj: anchor(mix, 3.6, PY[2] + 0.3, 0), text: 'I (in-phase)', sub: 'mixed with cos', dx: 80, dy: -40 });
  const LQ = ctx.label({ obj: anchor(mix, 3.6, PY[2] - 0.3, 0), text: 'Q (quadrature)', sub: 'mixed with a 90°-shifted copy', dx: 80, dy: 40 });

  // =============== 6. the ADC ===============
  const adc = ctx.register('wifiAdc', new THREE.Group());
  adc.add(panelMesh(8.6, 3.9));
  const AX0 = -4.2, AX1 = 3.4, LV = 16, LY0 = -1.6, LSTEP = 3.2 / (LV - 1);
  const levels = new THREE.Group();
  for (let q = 0; q < LV; q++) levels.add(staticLine([[AX0, LY0 + q * LSTEP, 0.01], [AX1, LY0 + q * LSTEP, 0.01]], { width: 1, color: 0x2c2924 }));
  adc.add(levels);
  adc.add(staticLine([[AX1, -1.85, 0.02], [AX1, 1.85, 0.02]], { width: 2, color: 0xffffff }));
  const NAW = 300;
  const anaLine = makeLine(NAW, { width: 2.6, color: 0x8fd0c8 });
  adc.add(anaLine);
  const aPts = new Float32Array(NAW * 3);
  const MAXS = 26;
  const stems = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 1, 0.02).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x8fa3c0, transparent: true }), MAXS);
  const sdots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe6c08f).multiplyScalar(2), transparent: true }), MAXS);
  adc.add(stems, sdots);
  const stair = makeLine(MAXS * 2, { width: 2.4, color: 0xe6c08f });
  adc.add(stair);
  const stPts = new Float32Array(MAXS * 2 * 3);
  const bsig = (t) => 1.25 * Math.sin(1.7 * t) * Math.cos(0.55 * t + 0.4) + 0.28 * Math.sin(4.1 * t + 1);
  const LnowA = ctx.label({ obj: anchor(adc, AX1, 1.85, 0), text: 'Now', sub: 'newest sample', dx: 30, dy: -40 });
  const Lsamp = ctx.label({ obj: anchor(adc, -1.2, -1.85, 0), text: 'Sample clock', sub: 'measures at fixed instants', dx: -60, dy: 50 });
  const Llev = ctx.label({ obj: anchor(adc, AX0, LY0 + 15 * LSTEP, 0), text: '16 levels', sub: '4 bits per sample', dx: -60, dy: -40 });

  // =============== 7. OFDM ===============
  const ofdm = ctx.register('wifiOfdm', new THREE.Group());
  ofdm.add(makeFloor(40, -0.02, 80));
  ofdm.add(staticLine([[-6.4, 0, 0], [6.6, 0, 0]], { width: 1.5, color: 0x8e887f }));
  const fl = textSprite('frequency →', { size: 0.24, color: '#8e887f', mono: true }); fl.position.set(5.6, -0.3, 0); ofdm.add(fl);
  const chanMat = new THREE.MeshBasicMaterial({ color: 0x8fd0c8, transparent: true, opacity: 0.25, depthWrite: false });
  const chanBox = add(ofdm, new THREE.BoxGeometry(11.6, 1.4, 0.04), chanMat, 0, 0.7, 0);
  const NS = 24, SP = 0.5, NSP = 160;
  const subs = [];
  for (let i = 0; i < NS; i++) {
    const col = new THREE.Color().setHSL(0.52 + (i % 6) * 0.035, 0.85, 0.6);
    const l = makeLine(NSP, { width: 2, color: col.getHex() });
    ofdm.add(l);
    subs.push({ l, xc: -5.75 + i * SP, pts: new Float32Array(NSP * 3) });
  }
  const PICK = 15;
  const orth = new THREE.Group();
  for (let i = 0; i < NS; i++) orth.add(staticLine([[-5.75 + i * SP, 0, 0.01], [-5.75 + i * SP, 1.7, 0.01]], { width: 1, color: 0x4b5a70 }));
  ofdm.add(orth);
  const inset = new THREE.Group();
  inset.position.set(-5.75 + PICK * SP + 1.6, 2.1, 1.6);
  ofdm.add(inset);
  inset.add(panelMesh(1.5, 1.5));
  const insetDots = QAM_POINTS.map((p) => add(inset, new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: 0x4f4a43 }), p.I * 0.2, p.Q * 0.2, 0.01));
  const sinc = (u) => (Math.abs(u) < 1e-4 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u));
  const Lchan = ctx.label({ obj: chanBox, at: [-4.5, 0.7, 0], text: 'One Wi-Fi channel', sub: '80 MHz wide', dx: -40, dy: -80 });
  const Lsub = ctx.label({ obj: inset, at: [0, -0.8, 0], text: 'One subcarrier', sub: 'carries its own QAM symbol', dx: 100, dy: 40, hot: true });
  const Lorth = ctx.label({ obj: anchor(ofdm, -5.75 + 4 * SP, 1.7, 0), text: 'Peaks sit on the others’ zeros', sub: 'so they don’t interfere', dx: -40, dy: -70 });

  // =============== 8. QAM: the wave and the constellation ===============
  const qam = ctx.register('wifiQam', new THREE.Group());
  const X0 = -9.4, X1 = -0.5, SEG = 1.6, W = (Math.PI * 2 * 2) / SEG, NW = 720;
  const waveLine = makeLine(NW, { width: 3.5, vertexColors: true });
  qam.add(waveLine);
  qam.add(staticLine([[X0, 0, 0], [X1, 0, 0]], { width: 1, color: 0x2c2924 }));
  const wPts = new Float32Array(NW * 3), wCols = new Float32Array(NW * 3);
  const C_A = new THREE.Color(0x8fd0c8).multiplyScalar(1.6), C_B = new THREE.Color(0xe6c08f).multiplyScalar(1.6), C_IDLE = new THREE.Color(0x4a453e);
  const cons = new THREE.Group();
  cons.position.set(3.4, 0, 0);
  qam.add(cons);
  const U = 0.45;
  cons.add(staticLine([[-2.1, 0, 0], [2.1, 0, 0]], { width: 1.5, color: 0x6b655c }));
  cons.add(staticLine([[0, -2.1, 0], [0, 2.1, 0]], { width: 1.5, color: 0x6b655c }));
  cons.add(staticLine([[-2.4, -2.4, 0], [2.4, -2.4, 0], [2.4, 2.4, 0], [-2.4, 2.4, 0], [-2.4, -2.4, 0]], { width: 1, color: 0x2c2924 }));
  for (const b of [-2 * U, 2 * U]) {
    cons.add(staticLine([[b, -1.8, 0], [b, 1.8, 0]], { width: 1, color: 0x6e5a40 }));
    cons.add(staticLine([[-1.8, b, 0], [1.8, b, 0]], { width: 1, color: 0x6e5a40 }));
  }
  const tI = textSprite('I  (in-phase)', { size: 0.2, color: '#8e887f' }); tI.position.set(1.65, -0.2, 0); cons.add(tI);
  const tQ = textSprite('Q', { size: 0.24, color: '#8e887f' }); tQ.position.set(0.18, 2.15, 0); cons.add(tQ);
  const dots = QAM_POINTS.map((p) => {
    const m = add(cons, new THREE.SphereGeometry(0.08, 20, 12), new THREE.MeshBasicMaterial({ color: 0x4f4a43 }), p.I * U, p.Q * U, 0);
    const t = textSprite(p.bits, { size: 0.15, mono: true, color: '#8e887f' });
    t.position.set(p.I * U, p.Q * U - 0.19, 0);
    cons.add(t);
    return { m, p };
  });
  const vec = makeLine(2, { width: 3, color: 0xffffff });
  cons.add(vec);
  const ring = add(cons, new THREE.RingGeometry(0.13, 0.17, 40), glow(0xe6c08f, 2.4));
  const rx = add(cons, new THREE.SphereGeometry(0.06, 16, 10), glow(0xffffff, 2.2));
  const scatter = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xa8b8d0 }), SYMS.length);
  cons.add(scatter);
  const noise = SYMS.map((_, j) => [(hash(j, 1) - 0.5) * 0.36, (hash(j, 2) - 0.5) * 0.36]);
  const symAnchor = anchor(qam, 0, 1, 0);
  const Lsym = ctx.label({ obj: symAnchor, text: 'One symbol', sub: 'a slice of wave: height + timing', dx: 0, dy: -110, center: true });
  const Lcons = ctx.label({ obj: anchor(cons, -1.9, 1.9, 0), text: 'Constellation', sub: '16 dots → 4 bits each', dx: -40, dy: -50 });
  const Lvec = ctx.label({ obj: ring, text: 'Length = amplitude', sub: 'angle = phase', dx: 70, dy: -60 });
  const Lrx = ctx.label({ obj: rx, text: 'What actually arrived', sub: 'noise moves it off the ideal dot', dx: 80, dy: 70, hot: true });
  const Lbound = ctx.label({ obj: anchor(cons, 2 * U, 1.8, 0), text: 'Decision boundary', sub: 'nearest dot wins', dx: 60, dy: -40 });

  // =============== 9. packet ===============
  const pkt = ctx.register('wifiPkt', new THREE.Group());
  pkt.add(makeFloor(40, -1.2, 80));
  const SEGS = [
    ['PHY preamble', 'lets the radio lock on', 1.3, 0x5b6575, 'SYNC'],
    ['MAC header', 'Wi-Fi addresses: router → you', 1.7, 0x3d63b8, 'MAC'],
    ['IP header', 'internet addresses', 1.4, 0x8a5cc8, 'IP'],
    ['TCP header', 'port + sequence number', 1.4, 0x2fa087, 'TCP'],
    ['Payload', 'the web page data itself', 3.0, 0xd9902f, 'HTTP · HELLO'],
    ['FCS', 'CRC-32 error check', 1.0, 0x2f9a4a, 'CRC'],
  ];
  let px = -(SEGS.reduce((a, q) => a + q[2], 0) + 0.1 * (SEGS.length - 1)) / 2;
  const segs = SEGS.map(([name, sub, w, color, short], i) => {
    const g = new THREE.Group();
    const x = px + w / 2;
    px += w + 0.1;
    pkt.add(g);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.45, metalness: 0.1 });
    add(g, rbox(w, 0.9, 0.9, 0.08), mat);
    const t = textSprite(short, { size: 0.28, color: '#ffffff', weight: 700, mono: true });
    t.position.set(0, 0, 0.5);
    g.add(t);
    return { g, x, mat, from: new THREE.Vector3(x * 1.4 + (r() - 0.5) * 3, 3 + r() * 2, -3 - r() * 3), L: ctx.label({ obj: g, at: [0, -0.45, 0.45], text: name, sub, dx: 0, dy: 50 + (i % 2) * 46, center: true }) };
  });
  const rawBits = textSprite('0100 1000 0100 0101 0100 1100 0100 1100 0100 1111 …', { size: 0.3, mono: true, color: '#8fd0c8' });
  rawBits.position.set(0, 2.2, 0);
  pkt.add(rawBits);
  const okSprite = textSprite('✓ CRC OK', { size: 0.34, color: '#7dff9e', weight: 700 });
  pkt.add(okSprite);
  const pageTex = canvasTexture(900, 600, (c, w, h) => {
    c.fillStyle = '#f4f6fa'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#dde3ec'; c.fillRect(0, 0, w, 64);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(30 + i * 26, 32, 8, 0, 7); c.fill(); });
    c.fillStyle = '#ffffff'; c.fillRect(120, 16, 640, 32);
    c.fillStyle = '#5b6575'; c.font = '500 20px "JetBrains Mono", monospace'; c.fillText('https://hello.world', 136, 39);
    c.fillStyle = '#0d1420'; c.font = '800 120px Inter, sans-serif'; c.fillText('HELLO', 60, 230);
    c.fillStyle = '#8fd0c8'; c.fillRect(60, 270, 230, 10);
    c.fillStyle = '#c9d1dd';
    [330, 370, 410, 450].forEach((y, i) => c.fillRect(60, y, 520 - i * 60, 18));
    const gr = c.createLinearGradient(620, 300, 860, 540); gr.addColorStop(0, '#8fd0c8'); gr.addColorStop(1, '#7b5cff');
    c.fillStyle = gr; c.fillRect(620, 300, 230, 220);
  });
  const pageMat = new THREE.MeshBasicMaterial({ map: pageTex, transparent: true, opacity: 0 });
  pageMat.color.setScalar(0.92);
  const page = add(pkt, new THREE.PlaneGeometry(3.6, 2.4), pageMat, 0, 2.3, 0.6);

  // =============== timeline (in scroll-seconds) ===============
  const T0 = flyIn(ctx, tl, ctx.laptop.parts.wifi, { off: [-0.55, 0.38, 0.75], text: 'Wi-Fi card', sub: 'radio + modem on an M.2 card' });
  ctx.show(tl, 'wifiWide', T0);
  ctx.camSet(tl, { p: [-1.5, 2.4, 9.5], t: [-0.5, 0.9, 0] }, T0);
  ctx.fade(tl, 0, T0 + 0.05, 0.6);
  ctx.title(tl, 4.4, 'PART 1 · WIRELESS', 'How Wi-Fi Works', 2.6);
  ctx.camTo(tl, { p: [0.4, 3.3, 13.8], t: [0, 0.9, 0] }, 4.4, 5, 'sine.inOut');
  tl.to(s, { waveOn: 1, duration: 1.2 }, 4.8);
  ctx.showLabel(tl, Lrouter, 6.8, 4.0);
  ctx.showLabel(tl, Lwave, 7.6, 3.2);
  ctx.camTo(tl, { p: [antPos.x + 1.6, antPos.y + 0.5, antPos.z + 3.6], t: [antPos.x - 0.4, antPos.y - 0.2, antPos.z] }, 10.6, 3, 'power2.inOut');
  tl.to(s, { hit: 1, duration: 0.8 }, 11.8);
  ctx.showLabel(tl, Lant, 12.4, 3.0);

  // EM wave
  ctx.cut(tl, 16, 'wifiWide', 'wifiEM', { p: [-1, 0.6, 12.5], t: [-0.6, 0, 0] });
  tl.to(s, { front: XA1 + 1, duration: 4.5, ease: 'none' }, 16.2);
  ctx.showLabel(tl, LE, 18.2, 11.4);
  ctx.showLabel(tl, LB, 19.4, 10.2);
  ctx.camTo(tl, { p: [6.5, 3.6, 9.5], t: [0, 0, 0] }, 20, 4, 'power2.inOut');
  ctx.showLabel(tl, Ldir, 21.2, 8.4);
  tl.to(s, { lam: 1, duration: 0.6 }, 23.4);
  ctx.showLabel(tl, Llam, 23.6, 6.0);
  ctx.camTo(tl, { p: [0.5, 1.4, 10.5], t: [0, 0.3, 0] }, 24.2, 4, 'power2.inOut');

  // antenna
  ctx.cut(tl, 30.5, 'wifiEM', 'wifiAnt', { p: [1.0, 4.2, 8.2], t: [-0.8, 0, 0.3] });
  ctx.showLabel(tl, Lstrip, 31.6, 12.2);
  ctx.showLabel(tl, Lfree, 33.0, 10.8);
  tl.to(s, { amp: 1, duration: 2.5 }, 36.6);
  ctx.showLabel(tl, Lfield, 37.4, 6.4);
  ctx.camTo(tl, { p: [-2.4, 2.6, 6.8], t: [-3.0, 0.4, 0.6] }, 39.6, 3.4, 'power2.inOut');
  ctx.showLabel(tl, Lcoax, 41.0, 2.8);

  // chip
  ctx.cut(tl, 44.5, 'wifiAnt', 'wifiChip', { p: [5.5, 6.0, 7.5], t: [0, 0, 0] });
  ctx.showLabel(tl, Lshield, 45.4, 2.6);
  tl.to(s, { open1: 1, duration: 2.2, ease: 'power2.in' }, 47.6);
  tl.to(s, { open2: 1, duration: 1.6 }, 49.6);
  ctx.camTo(tl, { p: [0.2, 4.6, 4.4], t: [0, 0, 0.1] }, 49.4, 3.4, 'power2.inOut');
  const P0 = 53.2, P1 = 61.6;
  tl.to(s, { p: 1, duration: P1 - P0, ease: 'none' }, P0);
  pathBlock.forEach((bi, k) => {
    if (bi < 0) return;
    const at = P0 + arrive[k] * (P1 - P0) - 0.2;
    ctx.showLabel(tl, blocks[bi].L, at, P1 + 0.6 - at);
  });
  ctx.showLabel(tl, blocks[3].L, P0 + arrive[2] * (P1 - P0), 2.6);

  // mixer
  ctx.cut(tl, 62.5, 'wifiChip', 'wifiMix', { p: [-1.6, 0.7, 13.6], t: [-1.2, 0.55, 0] });
  tl.to(s, { prod: 1, duration: 1.2 }, 65.4);
  tl.to(s, { filt: 1, duration: 3.0 }, 69.4);
  tl.to(s, { iq: 1, duration: 1.0 }, 72.8);
  ctx.showLabel(tl, LI, 70.4, 5.4);
  ctx.showLabel(tl, LQ, 73.0, 3.0);

  // ADC
  ctx.cut(tl, 76.5, 'wifiMix', 'wifiAdc', { p: [-1.2, 0.0, 10.4], t: [-0.9, -0.1, 0] });
  ctx.showLabel(tl, LnowA, 77.4, 11.4);
  tl.to(s, { samp: 1, duration: 1.2 }, 79.2);
  ctx.showLabel(tl, Lsamp, 79.6, 4.0);
  tl.to(s, { quant: 1, duration: 1.4 }, 82.6);
  ctx.showLabel(tl, Llev, 83.2, 5.6);
  tl.to(s, { codes: 1, duration: 0.8 }, 85.2);

  // OFDM
  ctx.cut(tl, 89.5, 'wifiAdc', 'wifiOfdm', { p: [0, 3.0, 11.5], t: [0, 0.5, 0] });
  ctx.showLabel(tl, Lchan, 90.2, 2.8);
  tl.to(s, { split: 1, duration: 3.0 }, 92.4);
  tl.to(s, { orth: 1, duration: 1.0 }, 96.2);
  ctx.showLabel(tl, Lorth, 96.6, 3.0);
  ctx.camTo(tl, { p: [4.6, 2.8, 9.0], t: [1.6, 1.5, 0.6] }, 98.8, 2.5, 'power2.inOut');
  tl.to(s, { pick: 1, duration: 1.6 }, 99.2);
  ctx.showLabel(tl, Lsub, 100.0, 2.2);

  // QAM
  ctx.cut(tl, 102.5, 'wifiOfdm', 'wifiQam', { p: [-5.4, 1.0, 6.6], t: [-5.4, 0, 0] });
  tl.to(s, { sym: 10, duration: 17.4, ease: 'none' }, 102.6);
  ctx.showLabel(tl, Lsym, 103.4, 4.4);
  ctx.camTo(tl, { p: [-0.6, 0.4, 11.6], t: [-0.6, -0.3, 0] }, 106.4, 3.4, 'power2.inOut');
  tl.to(s, { readout: 1, duration: 0.6 }, 108.6);
  ctx.showLabel(tl, Lcons, 109.0, 5.0);
  ctx.showLabel(tl, Lvec, 110.0, 4.6);
  ctx.camTo(tl, { p: [3.6, 0.6, 8.8], t: [3.2, 0.25, 0] }, 115.0, 2.2, 'power2.inOut');
  ctx.showLabel(tl, Lrx, 115.6, 8.2);
  ctx.showLabel(tl, Lbound, 116.6, 7.2);
  tl.to(s, { readout: 0, duration: 0.4 }, 123.6);

  // packet
  ctx.cut(tl, 124.5, 'wifiQam', 'wifiPkt', { p: [0, 1.4, 12.5], t: [0, -0.2, 0] });
  tl.to(s, { pkt: 1, duration: 4.6, ease: 'power1.inOut' }, 125.0);
  segs.forEach((sg, i) => ctx.showLabel(tl, sg.L, 127.4 + i * 0.5, 131.0 - (127.4 + i * 0.5)));
  tl.to(s, { crc: 1, duration: 1.0 }, 131.6);
  ctx.camTo(tl, { p: [0.6, 2.4, 10.6], t: [0, 1.45, 0] }, 135.6, 2.4, 'power2.inOut');
  tl.to(s, { page: 1, duration: 1.6, ease: 'back.out(1.3)' }, 136.0);
  ctx.fade(tl, 1, 140.3, 0.6);
  ctx.hide(tl, 'wifiPkt', 140.95);
  ctx.pad(tl, 141);

  const steps = [
    [0.6, 3.6, 'The Wi-Fi card',
      'This small card is the laptop’s Wi-Fi: a radio and a modem on one module.',
      'An M.2 2230 card (22 × 30 mm). Thin coaxial cables connect it to antennas hidden in the lid.'],
    [4.4, 6.0, 'Radio waves',
      'Your router sends data as radio waves: invisible light that spreads out in every direction.',
      'Wi-Fi uses the 2.4, 5 and 6 GHz bands. Power spreads over a growing sphere, so it falls with the square of distance, plus losses through walls.'],
    [10.4, 5.2, 'Reaching the laptop',
      'Only a tiny fraction of that energy reaches the antennas in your laptop’s lid.',
      'A typical received power is around −60 dBm: one nanowatt, a billionth of a watt.'],
    [16.2, 7.0, 'What a radio wave really is',
      'A radio wave is an electric field and a magnetic field, swinging back and forth together and travelling at the speed of light.',
      'E and B are perpendicular to each other and to the direction of travel. Here it is slowed about ten billion times: at 5 GHz the field flips direction 10 billion times every second.'],
    [23.2, 6.8, 'Wavelength',
      'The distance from one peak to the next is the wavelength. For 5 GHz Wi-Fi it’s about 6 centimetres.',
      'λ = c ÷ f = 3×10⁸ m/s ÷ 5×10⁹ Hz ≈ 6 cm. At 2.4 GHz it’s 12.5 cm, which is part of why 2.4 GHz gets through walls a little better.'],
    [30.8, 6.0, 'The antenna',
      'The antenna is just a strip of metal. Metals are full of free electrons that can move easily.',
      'Antenna size is tuned to the wavelength: a quarter-wave element at 5 GHz is about 1.5 cm. Laptop antennas are folded metal traces (often PIFA designs) in the top bezel.'],
    [36.8, 7.4, 'Electrons start to dance',
      'The passing electric field pushes those electrons back and forth, billions of times a second. Moving electrons are an electric current.',
      'The field induces an alternating current: strongest at the feed point, zero at the open end. The voltage is tiny, microvolts to millivolts. It flows down the coax cable to the Wi-Fi chip.'],
    [44.8, 5.0, 'Under the shield',
      'Under the metal can sits the chip. The can blocks interference from the rest of the laptop.',
      'The RF shield is a small Faraday cage: it keeps noise from the CPU and memory away from the sensitive radio. Inside the package is a single silicon die.'],
    [49.8, 3.6, 'A whole radio on one chip',
      'The die holds a complete radio: an amplifier, a mixer, converters and a small processor.',
      'Modern Wi-Fi chips put the RF front-end, frequency synthesizer, ADCs/DACs, baseband DSP and a MAC processor on one CMOS die.'],
    [53.4, 8.6, 'Follow the signal',
      'The signal is amplified, slowed down, measured into numbers, decoded into bits, then sent on to the CPU.',
      'LNA → mixer (fed by the PLL local oscillator) → ADC → baseband DSP (OFDM, QAM, error correction) → MAC (frames, WPA3 decryption) → PCIe to the CPU.'],
    [62.8, 6.4, 'The mixer',
      'The signal wiggles far too fast to read directly. The mixer multiplies it by a wave the chip makes itself, at the same frequency.',
      'cos(a)·cos(b) = ½cos(a−b) + ½cos(a+b). Multiplying by a 5 GHz local oscillator leaves a slow “difference” part plus a fast “sum” part near 10 GHz.'],
    [69.2, 7.0, 'Baseband',
      'A filter strips away the fast part. What’s left is the slow shape, and that shape carries the data.',
      'A second mixer driven 90° out of step gives a second output. The pair, I and Q, captures both the height (amplitude) and the timing (phase) of the original wave.'],
    [76.8, 5.6, 'The ADC',
      'The analog-to-digital converter measures the wave at regular instants, many millions of times per second.',
      'An 80 MHz channel needs at least 80 million complex samples per second (the Nyquist rate). Chips oversample to make filtering easier.'],
    [82.4, 6.8, 'Wave → numbers',
      'Each measurement is rounded to the nearest level and written as a binary number. From here on, the signal is just numbers.',
      'Shown with 4 bits (16 levels). Wi-Fi ADCs typically use about 10–12 bits. The rounding error is called quantisation noise.'],
    [89.8, 6.2, 'OFDM: many signals at once',
      'Wi-Fi doesn’t send one signal. It splits the channel into hundreds of narrow sub-channels, each carrying its own data at the same time.',
      'Wi-Fi 6 in an 80 MHz channel uses a 1024-point FFT: subcarriers 78.125 kHz apart, about 980 of them carrying data.'],
    [96.0, 6.4, 'Why they don’t clash',
      'The sub-channels overlap, but each one peaks exactly where all the others are zero, so they don’t interfere.',
      'This is called orthogonality. The DSP separates them with a Fast Fourier Transform. A new set of symbols arrives every 13.6 µs.'],
    [102.8, 6.0, 'One symbol',
      'Take one sub-channel. Its data is hidden in the height and the timing of each short slice of wave, called a symbol.',
      'Each symbol has an amplitude and a phase, which the receiver measures as the two numbers I and Q.'],
    [108.8, 6.2, 'The constellation',
      'The chip plots each symbol as a dot: distance from the centre is the height, direction is the timing. 16 possible dots means 4 bits per dot.',
      '16-QAM, Gray-coded so neighbouring dots differ by only one bit. Wi-Fi 6 uses up to 1024-QAM (10 bits); Wi-Fi 7 up to 4096-QAM (12 bits).'],
    [115.0, 9.0, 'Noise',
      'Real signals are noisy, so the received dot never lands exactly. The chip picks whichever ideal dot is closest. Scroll on to decode the message.',
      'The lines between dots are decision boundaries. Too much noise pushes the dot across one: a bit error, fixed later by error-correcting codes (LDPC).'],
    [124.8, 6.6, 'Bits become a packet',
      'The bits form a packet: addresses at the front, the data in the middle, and a check value at the end.',
      'An 802.11 frame wrapping IP and TCP headers around HTTP data. The FCS is a CRC-32 computed over the whole frame.'],
    [131.4, 4.4, 'Error check',
      'The chip recomputes the check value. If it matches, the packet arrived intact.',
      'If the CRC fails, the frame is dropped and the router sends it again. Every good frame is acknowledged within microseconds.'],
    [135.8, 4.6, 'A web page',
      'The data travels over PCIe to the CPU, and your browser draws the page. This happens thousands of times every second.',
      'Encryption (WPA3, AES) is removed in the MAC hardware. Real throughput: hundreds of Mbit/s up to several Gbit/s.'],
  ];
  const outline = [['Card', 0], ['Waves', 4.2], ['EM field', 15.5], ['Antenna', 30], ['Chip', 44], ['Mixer', 62], ['ADC', 76], ['OFDM', 89], ['QAM', 102], ['Packet', 124]];

  let lastCur = null, readHTML = '';
  function update(now) {
    const V = ctx.vis;
    // 1. expanding wave shells
    if (V.wifiWide) {
      for (let i = 0; i < shells.length; i++) {
        const f = frac(now * 0.32 + i / shells.length);
        shells[i].scale.setScalar(0.2 + f * 11);
        shells[i].material.uniforms.uOp.value = Math.pow(1 - f, 1.8) * s.waveOn * 0.8;
      }
      antMat.emissiveIntensity = s.hit * (2.2 + Math.sin(now * 12) * 0.8);
    }

    // 2. E and B fields along the propagation axis
    if (V.wifiEM) {
      const k = (Math.PI * 2) / LAMV, w = 2.4;
      const E = (x) => 1.25 * smooth((s.front - x) / 1.2) * Math.sin(k * x - w * now);
      for (let i = 0; i < NA; i++) {
        const x = XA0 + ((XA1 - XA0) * i) / (NA - 1);
        const e = E(x);
        v3.set(x, 0, 0);
        Earr.userData.set(i, v3, Y, e);
        Barr.userData.set(i, v3, Z, e * 0.9);
      }
      Earr.userData.commit(); Barr.userData.commit();
      for (let n = 0; n < NC; n++) {
        const x = XA0 + ((XA1 - XA0) * n) / (NC - 1);
        const e = E(x);
        ePts.set([x, e, 0], n * 3);
        bPts.set([x, 0, e * 0.9], n * 3);
      }
      setLine(Ecurve, ePts); setLine(Bcurve, bPts);
      lamLine.material.opacity = s.lam;
    }

    // 3. electrons sloshing in the antenna
    if (V.wifiAnt) {
      const w = Math.PI * 2 * 0.7;
      const osc = Math.sin(w * now);
      for (let i = 0; i < NEA; i++) {
        const [bx, by, bz, ph] = eBase[i];
        const prof = Math.cos((Math.PI * (bx + 3)) / 12); // current max at the feed (x = −3), zero at the open end
        const x = bx + s.amp * 0.34 * prof * osc + 0.012 * Math.sin(now * 7 + ph);
        m4.makeTranslation(x, by + 0.008 * Math.cos(now * 9 + ph), bz);
        eMesh.setMatrixAt(i, m4);
      }
      eMesh.instanceMatrix.needsUpdate = true;
      const kz = (Math.PI * 2) / 3.2;
      for (let a = 0; a < NFX; a++) for (let b = 0; b < NFZ; b++) {
        const x = -2.7 + a * 0.9, z = -1.9 + b * 0.5;
        const e = s.amp * 0.5 * Math.sin(kz * z + w * now);
        v3.set(x - e / 2, 0.42, z);
        field.userData.set(a * NFZ + b, v3, X, e);
      }
      field.userData.commit();
      for (let n = 0; n < 140; n++) {
        const u = n / 139;
        cPts.set([-1.55 + u * 3.1, 0.5 * s.amp * Math.sin(w * (now - (1 - u) * 3)), 0.01], n * 3);
      }
      setLine(curLine, cPts);
    }

    // 4. chip: shield + package open, signal pulse along the die
    if (V.wifiChip) {
      shield.position.set(1.5 * s.open1, 4.5 * s.open1, -1.2 * s.open1);
      shield.rotation.set(-0.5 * s.open1, 0, 0.3 * s.open1);
      shield.visible = s.open1 < 0.98;
      const lift = smooth(s.open2);
      pkgBody.position.set(-1.2 * lift, 0.15 + 3.2 * lift, -0.8 * lift);
      pkgBody.rotation.set(-0.4 * lift, 0, 0.25 * lift);
      pkgBody.visible = s.open2 < 0.98;
      const [x, z] = pathAt(s.p);
      pulse.position.set(x, 0.14, z);
      pulse.visible = s.p > 0.001 && s.p < 0.999;
      blocks.forEach((b, i) => {
        const k = pathBlock.indexOf(i);
        const at = k >= 0 ? arrive[k] : arrive[2];
        b.mat.opacity = (s.p >= at ? 0.16 : 0) + 0.5 * Math.exp(-Math.pow((s.p - at) * 9, 2));
      });
      chipGraphs.forEach(([m, at]) => { m.opacity = clamp01((s.p - at) * 8); });
    }

    // 5. mixer: RF × LO → product → low-pass → I (and Q)
    if (V.wifiMix) {
      const wc = Math.PI * 2 * 7;
      for (let n = 0; n < NM; n++) {
        const x = MX0 + ((MX1 - MX0) * n) / (NM - 1);
        const t = now * 0.3 + (x - MX0) * 0.22;
        const [I, Q] = iq(t, 0.45);
        const c = Math.cos(wc * t), sn = Math.sin(wc * t);
        const rf = I * c - Q * sn;
        mA.set([x, PY[0] + 0.6 * rf, 0.01], n * 3);
        mB.set([x, PY[1] + 0.5 * c, 0.01], n * 3);
        const raw = rf * c; // = I/2 + I/2·cos(2wt) − Q/2·sin(2wt)
        mC.set([x, PY[2] + 1.1 * s.prod * lerp(raw, I / 2, s.filt), 0.01], n * 3);
        mD.set([x, PY[2] + 1.1 * (Q / 2), 0.012], n * 3);
      }
      setLine(rfLine, mA); setLine(loLine, mB); setLine(prodLine, mC); setLine(qLine, mD);
      prodLine.material.opacity = s.prod;
      qLine.material.opacity = s.iq;
    }

    // 6. ADC: sample, quantise, output codes
    if (V.wifiAdc) {
      const tn = now * 0.6;
      const tAt = (x) => tn + (x - AX1) * 0.4;
      for (let n = 0; n < NAW; n++) {
        const x = AX0 + ((AX1 - AX0) * n) / (NAW - 1);
        aPts.set([x, bsig(tAt(x)), 0.02], n * 3);
      }
      setLine(anaLine, aPts);
      const D = 0.16;
      const jLast = Math.floor(tn / D);
      const codes = [];
      let firstX = null;
      for (let i = 0; i < MAXS; i++) {
        const j = jLast - MAXS + 1 + i;
        const tj = j * D;
        const x = AX1 + (tj - tn) / 0.4;
        if (x < AX0) {
          m4.makeScale(0, 0, 0);
          stems.setMatrixAt(i, m4); sdots.setMatrixAt(i, m4);
          stPts.set([AX0, 0, 0.03, AX0, 0, 0.03], i * 6);
          continue;
        }
        const b = bsig(tj);
        const q = Math.max(0, Math.min(LV - 1, Math.round((b - LY0) / LSTEP)));
        const yq = LY0 + q * LSTEP;
        const yy = lerp(b, yq, s.quant);
        m4.makeScale(1, Math.abs(yy) < 1e-4 ? 1e-4 : yy, 1).setPosition(x, 0, 0.02);
        stems.setMatrixAt(i, m4);
        m4.makeTranslation(x, yy, 0.03);
        sdots.setMatrixAt(i, m4);
        stPts.set([x, yq, 0.03, Math.min(AX1, x + D / 0.4), yq, 0.03], i * 6);
        if (firstX === null) firstX = i;
        codes.push(q);
      }
      // samples off the left edge collapse onto the first visible one so the staircase has no stray segments
      for (let i = 0; i < (firstX ?? 0); i++) stPts.set(stPts.subarray(firstX * 6, firstX * 6 + 3), i * 6), stPts.set(stPts.subarray(firstX * 6, firstX * 6 + 3), i * 6 + 3);
      stems.instanceMatrix.needsUpdate = sdots.instanceMatrix.needsUpdate = true;
      stems.material.opacity = sdots.material.opacity = s.samp;
      levels.visible = s.quant > 0.02;
      setLine(stair, stPts);
      stair.material.opacity = s.quant;
      if (s.codes > 0.01) {
        const last = codes.slice(-7).reverse();
        ctx.readout(`<h4>ADC OUTPUT · NEWEST FIRST</h4><table>${last.map((q, i) => `<tr class="${i ? '' : 'on'}"><td>${q.toString(2).padStart(4, '0')}</td><td>= ${q}</td></tr>`).join('')}</table>`, s.codes);
      }
    }

    // 7. OFDM subcarriers
    if (V.wifiOfdm) {
      const symK = Math.floor(now / 1.4), blend = smooth(frac(now / 1.4) / 0.15);
      chanMat.opacity = 0.25 * (1 - s.split);
      subs.forEach((sb, i) => {
        const h = lerp(0.75 + 0.55 * hash(i, symK - 1), 0.75 + 0.55 * hash(i, symK), blend);
        const hi = i === PICK;
        const zOff = hi ? s.pick * 1.6 : 0;
        for (let n = 0; n < NSP; n++) {
          const x = sb.xc - 2.4 + (4.8 * n) / (NSP - 1);
          const inside = x > -6.3 && x < 6.3;
          sb.pts.set([Math.max(-6.3, Math.min(6.3, x)), inside ? h * s.split * sinc((x - sb.xc) / SP) : 0, zOff], n * 3);
        }
        setLine(sb.l, sb.pts);
        sb.l.material.opacity = hi ? 1 : 1 - 0.75 * s.pick;
        if (hi) sb.l.material.color.set(0xe6c08f).multiplyScalar(1 + s.pick);
      });
      orth.visible = s.orth > 0.02;
      inset.visible = s.pick > 0.02;
      inset.scale.setScalar(Math.max(0.01, s.pick));
      const lit = Math.floor(hash(PICK, symK) * 16);
      insetDots.forEach((d, i) => d.material.color.setHex(i === lit ? 0xe6c08f : 0x4f4a43));
    }

    // 8. QAM decode
    if (V.wifiQam) {
      for (let n = 0; n < NW; n++) {
        const x = X0 + ((X1 - X0) * n) / (NW - 1);
        const j = Math.floor(s.sym + (X1 - x) / SEG);
        const ph = W * (x - s.sym * SEG);
        let y, c;
        if (j >= 0 && j < SYMS.length) {
          const q = SYMS[j];
          y = 0.22 * (q.I * Math.cos(ph) - q.Q * Math.sin(ph));
          c = j % 2 ? C_B : C_A;
        } else { y = 0.06 * Math.cos(ph); c = C_IDLE; }
        const fi = clamp01((x - X0) / 1.2);
        wPts[n * 3] = x; wPts[n * 3 + 1] = y * fi; wPts[n * 3 + 2] = 0;
        wCols[n * 3] = c.r * fi; wCols[n * 3 + 1] = c.g * fi; wCols[n * 3 + 2] = c.b * fi;
      }
      setLine(waveLine, wPts, wCols);
      const nextSym = Math.max(0, Math.floor(s.sym) + 1);
      symAnchor.position.set(X1 - SEG * (nextSym + 0.5 - s.sym), 1.0, 0);

      const cur = Math.min(SYMS.length - 1, Math.floor(s.sym));
      const active = s.sym >= 0;
      ring.visible = vec.visible = rx.visible = active;
      dots.forEach((d) => {
        const seen = active && SYMS.slice(0, cur + 1).some((q) => q.bits === d.p.bits);
        d.m.material.color.setHex(seen ? 0x8fd0c8 : 0x4f4a43);
        d.m.scale.setScalar(1);
      });
      for (let j = 0; j < SYMS.length; j++) {
        const show = active && j < cur;
        m4.makeScale(show ? 1 : 0, show ? 1 : 0, show ? 1 : 0).setPosition(SYMS[j].I * U + noise[j][0], SYMS[j].Q * U + noise[j][1], 0.02);
        scatter.setMatrixAt(j, m4);
      }
      scatter.instanceMatrix.needsUpdate = true;
      if (active) {
        const q = SYMS[cur];
        const di = dots.find((d) => d.p.bits === q.bits);
        di.m.material.color.setRGB(2.4, 1.6, 0.6);
        di.m.scale.setScalar(1.5 + 0.2 * Math.sin(now * 8));
        ring.position.set(q.I * U, q.Q * U, 0.01);
        const jx = 0.025 * Math.sin(now * 5.3), jy = 0.025 * Math.cos(now * 4.1);
        rx.position.set(q.I * U + noise[cur][0] + jx, q.Q * U + noise[cur][1] + jy, 0.03);
        setLine(vec, new Float32Array([0, 0, 0.01, rx.position.x, rx.position.y, 0.01]));
      }
      const key = active ? cur : -1;
      if (key !== lastCur) {
        lastCur = key;
        const got = active ? SYMS.slice(0, cur + 1) : [];
        const bits = got.map((q, i) => `<i class="${i % 2 ? 'alt' : ''}">${q.bits}</i>`).join(' ');
        const text = MSG.slice(0, Math.floor(got.length / 2));
        readHTML = `<h4>DECODED BITS</h4><div class="bits">${bits || '…'}</div><h4 style="margin-top:12px">TEXT</h4><div class="text">${text || '&nbsp;'}</div>`;
      }
      if (s.readout > 0.01) ctx.readout(readHTML, s.readout);
    }

    // 9. packet assembly, CRC, page
    if (V.wifiPkt) {
      segs.forEach((sg, i) => {
        const k = smooth(s.pkt * 1.7 - i * 0.14);
        sg.g.position.set(lerp(sg.from.x, sg.x, k), lerp(sg.from.y, 0, k), lerp(sg.from.z, 0, k));
        sg.g.rotation.set((1 - k) * 1.2, (1 - k) * 0.8, 0);
        sg.g.scale.setScalar(0.4 + 0.6 * k);
      });
      rawBits.material.opacity = 1 - s.pkt;
      const fcs = segs[5];
      fcs.mat.emissive.setHex(s.crc > 0.5 ? 0x46ff9a : 0x2f9a4a);
      fcs.mat.emissiveIntensity = 0.15 + s.crc * (0.8 + 0.3 * Math.sin(now * 6));
      okSprite.position.set(fcs.x, 1.0, 0.3);
      okSprite.material.opacity = s.crc;
      segs[4].mat.emissiveIntensity = 0.15 + s.page * 0.6;
      page.scale.setScalar(0.5 + 0.5 * s.page);
      pageMat.opacity = s.page;
    }
  }

  return { title: 'Wi-Fi', tl, steps, outline, update };
}
