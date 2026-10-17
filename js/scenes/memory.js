import * as THREE from 'three';
import { M, rbox, glow, makeFloor, rng, clamp01, smooth, lerp, frac, staticLine } from '../common.js';
import { flyIn } from './laptop.js';

const lit = (hex, k = 1, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, ...extra });

export function memoryChapter(ctx) {
  const { gsap } = ctx;
  const s = { bars: 0, hop: 0, act: 0, col: 0, gate: 0, fill: 0, leak: 0, build: 0, cellHi: 0, fgate: 0, prog: 0, cmp: 0 };
  const tl = gsap.timeline();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const r = rng(5);
  const m4 = new THREE.Matrix4();
  const elMat = glow(0xb5e3dc, 2.6);
  const elGeo = new THREE.SphereGeometry(0.07, 12, 8);
  const silicon = new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.55, metalness: 0.25 });
  const oxide = new THREE.MeshStandardMaterial({ color: 0xdfe8ea, roughness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
  const DIM = new THREE.Color(0x3a3d42), col = new THREE.Color();

  // =============== 1. how far away each kind of memory is ===============
  const hier = ctx.register('memHier', new THREE.Group());
  hier.add(makeFloor(40, -1.2, 80));
  const CPU_X = -7.4;
  add(hier, rbox(1.1, 0.25, 1.1, 0.04), M.chip, CPU_X, 0, 0);
  add(hier, new THREE.BoxGeometry(0.6, 0.02, 0.6), new THREE.MeshStandardMaterial({ color: 0x9aa2ae, metalness: 0.9, roughness: 0.3 }), CPU_X, 0.135, 0);
  hier.add(staticLine([[CPU_X, 0, 0], [7.6, 0, 0]], { width: 1, color: 0x55514b }));
  const NODES = [
    ['L1 cache', 'inside each core · 64 KB', 1, -5.4, 0.35],
    ['L3 cache', 'shared, on the CPU chip · 24 MB', 10, -3.0, 0.6],
    ['RAM', 'memory chips · 16 GB', 100, -0.2, 0.95],
    ['SSD', 'storage · 1 TB', 100000, 6.8, 1.25],
  ];
  const nodes = NODES.map(([name, sub, ns, x, size], i) => {
    const g = new THREE.Group();
    g.position.x = x;
    hier.add(g);
    if (i < 2) add(g, rbox(size, 0.18, size, 0.03), M.chip);
    else if (i === 2) {
      add(g, rbox(size * 1.6, 0.03, 0.5, 0.01), new THREE.MeshStandardMaterial({ color: 0x1f4a36, roughness: 0.5 }));
      for (let k = 0; k < 4; k++) add(g, rbox(0.3, 0.06, 0.3, 0.01), M.chip, -0.57 + k * 0.38, 0.045, 0);
    } else {
      add(g, rbox(size * 1.5, 0.03, 0.42, 0.01), new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.5 }));
      for (let k = 0; k < 3; k++) add(g, rbox(0.38, 0.06, 0.3, 0.01), M.chip, -0.5 + k * 0.48, 0.045, 0);
    }
    const h = 0.35 + 0.62 * Math.log10(ns);
    const bar = add(g, new THREE.BoxGeometry(0.16, 1, 0.16).translate(0, 0.5, 0), lit(i === 3 ? 0xe39a7c : 0x8fd0c8, 1.1), 0, 0.2, -0.6);
    const L = ctx.label({ obj: g, at: [0, 0.2, 0.3], text: name, sub, dx: 0, dy: 70, center: true });
    const Lt = ctx.label({ obj: anchor(g, 0, 0.35 + h, -0.6), text: ns >= 1000 ? `${ns / 1000} µs` : `${ns} ns`, sub: i === 3 ? '1000× slower than RAM' : '', dx: 0, dy: -30, center: true, hot: i === 3 });
    return { g, x, h, bar, L, Lt, ns };
  });
  const pulse = add(hier, new THREE.SphereGeometry(0.12, 16, 12), glow(0xe6c08f, 3), CPU_X, 0.15, 0);
  const Lcpu = ctx.label({ obj: anchor(hier, CPU_X, 0.15, 0), text: 'CPU core', sub: 'asks for data', dx: 0, dy: -70, center: true });
  const ANALOGY = ['1 second', '10 seconds', '1.7 minutes', '28 hours'];

  // =============== 2. inside a RAM chip: the cell array ===============
  const arr = ctx.register('memArray', new THREE.Group());
  const CR = 8, CC = 12, AP = 0.7;
  const ax = (i) => (i - (CC - 1) / 2) * AP, ay = (j) => ((CR - 1) / 2 - j) * AP + 0.6;
  add(arr, new THREE.PlaneGeometry(CC * AP + 2.6, CR * AP + 3.4), new THREE.MeshBasicMaterial({ color: 0x0a0b0c }), -0.6, -0.2, -0.05);
  const bits = Array.from({ length: CR * CC }, () => (r() > 0.5 ? 1 : 0));
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.4, metalness: 0.4 });
  const chargeMat = glow(0xb5e3dc, 2.2);
  const charges = [];
  for (let j = 0; j < CR; j++) for (let i = 0; i < CC; i++) {
    add(arr, new THREE.CylinderGeometry(0.15, 0.15, 0.08, 20).rotateX(Math.PI / 2), capMat, ax(i) + 0.12, ay(j) - 0.12, 0);
    add(arr, new THREE.BoxGeometry(0.12, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0x4a525b, roughness: 0.4 }), ax(i) - 0.16, ay(j) + 0.12, 0.01);
    const c = add(arr, new THREE.SphereGeometry(0.08, 12, 8), chargeMat, ax(i) + 0.12, ay(j) - 0.12, 0.06);
    c.visible = !!bits[j * CC + i];
    charges.push(c);
  }
  const wls = Array.from({ length: CR }, (_, j) => add(arr, new THREE.BoxGeometry(CC * AP + 0.2, 0.035, 0.02), lit(0x3a3d42), 0, ay(j) + 0.12, 0.04));
  const bls = Array.from({ length: CC }, (_, i) => add(arr, new THREE.BoxGeometry(0.035, CR * AP + 1.0, 0.02), lit(0x3a3d42), ax(i) - 0.3, ay(CR - 1) + (CR * AP) / 2 - 0.1 - 0.45, 0.045));
  const decoder = add(arr, rbox(0.7, CR * AP, 0.1, 0.03), new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.5 }), ax(0) - 1.05, ay((CR - 1) / 2), 0);
  const SA_Y = ay(CR - 1) - 0.9;
  const amps = Array.from({ length: CC }, (_, i) => add(arr, new THREE.BoxGeometry(0.42, 0.42, 0.08), lit(0x3a3d42), ax(i) - 0.1, SA_Y, 0));
  const ROW = 4, COLS = [4, 5, 6, 7];
  const bitDots = Array.from({ length: CC }, (_, i) => add(arr, new THREE.SphereGeometry(0.07, 12, 8), chargeMat, ax(i) - 0.3, 0, 0.07));
  const outDots = COLS.map((i) => add(arr, new THREE.SphereGeometry(0.08, 12, 8), glow(0xe6c08f, 3), ax(i) - 0.1, SA_Y, 0.07));
  const Lcells = ctx.label({ obj: charges[1], text: 'Memory cells', sub: 'charged = 1, empty = 0', col: 'right', dy: 0 });
  const Lwl = ctx.label({ obj: wls[ROW], at: [(CC * AP) / 2, 0, 0], text: 'Row (word line)', sub: 'opens every cell in the row', col: 'right', dy: 0, hot: true });
  const Lbl = ctx.label({ obj: bls[0], at: [0, (CR * AP) / 2 + 0.3, 0], text: 'Bit lines', sub: 'one per column', col: 'left', dy: 0 });
  const Ldec = ctx.label({ obj: decoder, at: [0, (CR * AP) / 2 - 0.4, 0], text: 'Row decoder', sub: 'picks a row from the address', col: 'left', dy: 0 });
  const Lamp = ctx.label({ obj: amps[CC - 1], text: 'Sense amplifiers', sub: 'detect the tiny charge, then rewrite it', col: 'right', dy: 0 });

  // =============== 3. one DRAM cell ===============
  const cell = ctx.register('memCell', new THREE.Group());
  cell.add(makeFloor(30, -1.6, 60));
  add(cell, new THREE.BoxGeometry(6.4, 1.2, 2.4), silicon, 0, -1.0, 0);
  const nDoped = new THREE.MeshStandardMaterial({ color: 0x6b5a8a, roughness: 0.5 });
  add(cell, new THREE.BoxGeometry(1.2, 0.3, 2.0), nDoped, -1.9, -0.53, 0);
  add(cell, new THREE.BoxGeometry(1.2, 0.3, 2.0), nDoped, 0.5, -0.53, 0);
  add(cell, new THREE.BoxGeometry(1.2, 0.08, 2.0), oxide, -0.7, -0.36, 0);
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.7, roughness: 0.35, emissive: 0xe6c08f, emissiveIntensity: 0 });
  const gate = add(cell, new THREE.BoxGeometry(1.2, 0.5, 2.4), gateMat, -0.7, -0.07, 0);
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.9, roughness: 0.3 });
  add(cell, new THREE.BoxGeometry(0.3, 1.9, 0.3), metal, -1.9, 0.55, 0);
  add(cell, new THREE.BoxGeometry(4.2, 0.2, 0.3), metal, -3.8, 1.55, 0);
  add(cell, new THREE.BoxGeometry(0.3, 0.6, 0.3), metal, 0.5, -0.1, 0);
  const CAP_X = 1.9;
  add(cell, new THREE.BoxGeometry(1.7, 0.18, 0.3), metal, 1.2, 0.15, 0);
  const capShell = add(cell, new THREE.CylinderGeometry(0.62, 0.62, 2.6, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x9aa2ae, metalness: 0.6, roughness: 0.3, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }), CAP_X + 0.15, 1.45, 0);
  add(cell, new THREE.CylinderGeometry(0.66, 0.66, 0.12, 40), metal, CAP_X + 0.15, 2.8, 0);
  const NE = 26;
  const capEls = Array.from({ length: NE }, (_, i) => {
    const a = r() * Math.PI * 2, rad = 0.12 + r() * 0.36;
    return { m: add(cell, elGeo, elMat), x: CAP_X + 0.15 + Math.cos(a) * rad, y: 0.35 + (i / NE) * 2.2, z: Math.sin(a) * rad, ph: r() * 6.28 };
  });
  const movers = Array.from({ length: 4 }, () => add(cell, elGeo, elMat));
  const leakers = Array.from({ length: 2 }, () => add(cell, elGeo, elMat));
  const chanPath = [[-3.6, 1.55], [-1.9, 1.55], [-1.9, -0.45], [0.5, -0.45], [0.5, 0.15], [CAP_X + 0.15, 0.3]];
  const along = (u, out) => {
    const seg = chanPath.length - 1, f = clamp01(u) * seg, k = Math.min(seg - 1, Math.floor(f)), t = f - k;
    out.set(lerp(chanPath[k][0], chanPath[k + 1][0], t), lerp(chanPath[k][1], chanPath[k + 1][1], t), 0.5);
    return out;
  };
  const Lgate = ctx.label({ obj: gate, at: [0, 0.25, 1.2], text: 'Transistor (gate = word line)', sub: 'a switch that connects the capacitor', dx: -60, dy: -90 });
  const Lcap = ctx.label({ obj: capShell, at: [0.62, 0.9, 0], text: 'Capacitor', sub: 'a tiny bucket for electrons', col: 'right', dy: 0, hot: true });
  const Lbit = ctx.label({ obj: anchor(cell, -5.2, 1.55, 0), text: 'Bit line', sub: 'brings electrons in, reads them out', dx: -10, dy: -60 });
  const Lleak = ctx.label({ obj: leakers[0], text: 'Leaking away', sub: 'every cell slowly loses charge', col: 'right', dy: 0 });

  // =============== 4. 3D NAND: the SSD's memory chip ===============
  const nand = ctx.register('memNAND', new THREE.Group());
  nand.add(makeFloor(30, -0.2, 60));
  const NLAY = 14, LH = 0.11, LG = 0.07;
  const wlMat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.7, roughness: 0.35 });
  const layers = Array.from({ length: NLAY }, (_, k) => {
    const g = new THREE.Group();
    g.position.y = k * (LH + LG);
    nand.add(g);
    // cut away at the front row of channels, so the channels show on the cut face
    add(g, new THREE.BoxGeometry(4.2, LH, 2.4), wlMat, 0, 0, -0.3);
    add(g, new THREE.BoxGeometry(4.2, LG, 2.4), oxide, 0, (LH + LG) / 2, -0.3);
    return g;
  });
  add(nand, new THREE.BoxGeometry(4.6, 0.18, 3.4), silicon, 0, -0.14, 0);
  const CHX = [-1.5, -0.75, 0, 0.75, 1.5], CHZ = [-0.9, -0.3, 0.3, 0.9];
  const STACK_H = NLAY * (LH + LG);
  const chanMat = new THREE.MeshStandardMaterial({ color: 0x4a6a8a, roughness: 0.4, metalness: 0.2 });
  const chans = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 1, 18).translate(0, 0.5, 0), chanMat, CHX.length * CHZ.length);
  { let n = 0; for (const x of CHX) for (const z of CHZ) { m4.makeTranslation(x, 0, z); chans.setMatrixAt(n++, m4); } }
  nand.add(chans);
  const ring = add(nand, new THREE.TorusGeometry(0.2, 0.04, 10, 32).rotateX(Math.PI / 2), glow(0xe6c08f, 2.6), CHX[3], 6 * (LH + LG), CHZ[3]);
  const Lstack = ctx.label({ obj: layers[NLAY - 1], at: [2.1, 0, 1.5], text: 'Stacked layers', sub: 'over 200 in today’s chips', col: 'right', dy: 0 });
  const Lchan = ctx.label({ obj: anchor(nand, CHX[0], STACK_H + 0.05, CHZ[3]), text: 'Vertical channels', sub: 'holes etched through every layer', col: 'left', dy: 0 });
  const Lone = ctx.label({ obj: ring, text: 'One memory cell', sub: 'where a channel crosses a layer', col: 'right', dy: 0, hot: true });

  // =============== 5. one flash cell ===============
  const fl = ctx.register('memFlash', new THREE.Group());
  fl.add(makeFloor(30, -2.0, 60));
  const FW = 5.2, FD = 2.2;
  const chanBox = add(fl, new THREE.BoxGeometry(FW - 2, 0.8, FD), new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.5, transparent: true, opacity: 0.4, depthWrite: false }), 0, -1.4, 0);
  add(fl, new THREE.BoxGeometry(1.0, 0.82, FD + 0.02), nDoped, -FW / 2 + 0.5, -1.4, 0);
  add(fl, new THREE.BoxGeometry(1.0, 0.82, FD + 0.02), nDoped, FW / 2 - 0.5, -1.4, 0);
  const tunnel = add(fl, new THREE.BoxGeometry(FW - 2, 0.16, FD), oxide, 0, -0.92, 0);
  const trap = add(fl, new THREE.BoxGeometry(FW - 2, 0.34, FD), new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false }), 0, -0.67, 0);
  add(fl, new THREE.BoxGeometry(FW - 2, 0.26, FD), oxide, 0, -0.37, 0);
  const cgMat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.7, roughness: 0.35, emissive: 0xe39a7c, emissiveIntensity: 0 });
  const cgate = add(fl, new THREE.BoxGeometry(FW - 2, 0.6, FD), cgMat, 0, 0.06, 0);
  const NF = 34, NTRAP = 12;
  const fEls = Array.from({ length: NF }, (_, i) => ({
    m: add(fl, elGeo, elMat),
    x: -FW / 2 + 0.3 + r() * (FW - 0.6), y: -1.65 + r() * 0.45, z: -0.9 + r() * 1.8, ph: r() * 6.28,
    tx: -1.3 + (i % 6) * 0.52, ty: -0.67 + (Math.floor(i / 6) % 2 ? 0.07 : -0.07), tz: i % 12 < 6 ? -0.4 : 0.4,
    d: (i % NTRAP) / NTRAP,
  }));
  const Lcg = ctx.label({ obj: cgate, at: [(FW - 2) / 2, 0.15, FD / 2], text: 'Control gate', sub: 'the word line', col: 'right', dy: 0 });
  const Ltrap = ctx.label({ obj: trap, at: [(FW - 2) / 2, 0, FD / 2], text: 'Charge-trap layer', sub: 'silicon nitride: holds electrons', col: 'right', dy: 0, hot: true });
  const Ltun = ctx.label({ obj: tunnel, at: [-(FW - 2) / 2, 0, FD / 2], text: 'Tunnel oxide', sub: 'insulator, a few nm thick', col: 'left', dy: 0 });
  const Lch = ctx.label({ obj: chanBox, at: [-FW / 2, 0, FD / 2], text: 'Silicon channel', sub: 'full of free electrons', col: 'left', dy: 0 });

  // =============== timeline ===============
  const ramAt = anchor(ctx.laptop.parts.board, -0.385, 0.02, -0.56);
  const T0 = flyIn(ctx, tl, ramAt, { off: [0.35, 0.6, 0.8], text: 'Memory chips (RAM)', sub: 'LPDDR5X, next to the CPU', dx: -60, dy: -100 });
  ctx.show(tl, 'memHier', T0);
  ctx.camSet(tl, { p: [0, 4.6, 16.5], t: [0, 1.5, 0] }, T0);
  ctx.fade(tl, 0, T0 + 0.05, 0.6);
  ctx.title(tl, 4.4, 'PART 5 · MEMORY', 'RAM vs SSD', 2.6);
  ctx.showLabel(tl, Lcpu, 7.2, 13.8);
  nodes.forEach((n, i) => { ctx.showLabel(tl, n.L, 7.4 + i * 0.3, 13.6 - i * 0.3); ctx.showLabel(tl, n.Lt, 9.4 + i * 0.3, 11.6 - i * 0.3); });
  tl.to(s, { bars: 1, duration: 2, ease: 'power2.out' }, 8.6);
  tl.to(s, { hop: 4, duration: 9, ease: 'none' }, 11.0);
  ctx.camTo(tl, { p: [1.2, 3.8, 16.0], t: [0, 1.5, 0] }, 9.0, 11, 'sine.inOut');

  ctx.cut(tl, 21.5, 'memHier', 'memArray', { p: [0, -0.3, 15.2], t: [-0.4, -0.3, 0] });
  [[Lcells, 22.0], [Ldec, 22.6], [Lbl, 23.0], [Lamp, 23.4], [Lwl, 25.0]].forEach(([l, at]) => ctx.showLabel(tl, l, at, 34.6 - at));
  tl.to(s, { act: 1, duration: 5, ease: 'none' }, 25.0);
  tl.to(s, { col: 1, duration: 2.6, ease: 'none' }, 30.6);
  ctx.camTo(tl, { p: [-1.8, 0.4, 14.8], t: [-0.4, -0.3, 0] }, 23.0, 11, 'sine.inOut');

  ctx.cut(tl, 35.5, 'memArray', 'memCell', { p: [1.0, 2.6, 10.6], t: [-0.6, 0.6, 0] });
  [[Lbit, 36.0], [Lgate, 36.4], [Lcap, 36.8]].forEach(([l, at]) => ctx.showLabel(tl, l, at, 49.2 - at));
  tl.to(s, { gate: 1, duration: 0.6 }, 37.0);
  tl.to(s, { fill: 1, duration: 2.0, ease: 'power1.inOut' }, 37.4);
  tl.to(s, { gate: 0, duration: 0.6 }, 39.6);
  tl.to(s, { leak: 1, duration: 5.0, ease: 'none' }, 40.4);
  ctx.showLabel(tl, Lleak, 40.8, 4.4);
  tl.to(s, { gate: 1, duration: 0.5 }, 45.6);
  tl.to(s, { leak: 0, duration: 1.4, ease: 'power1.inOut' }, 46.0);
  tl.to(s, { gate: 0, duration: 0.5 }, 47.8);
  ctx.camTo(tl, { p: [-2.4, 2.2, 10.2], t: [-0.6, 0.6, 0] }, 38.0, 11, 'sine.inOut');

  const ssdP = ctx.laptop.explodedWorldPos(ctx.laptop.parts.ssd);
  const Lssd = ctx.label({ obj: ctx.laptop.parts.ssd, text: 'SSD', sub: 'NAND flash chips + a controller', dx: -60, dy: -100, hot: true });
  ctx.cut(tl, 50.0, 'memCell', 'laptop', { p: [ssdP.x + 0.7, ssdP.y + 1.0, ssdP.z + 1.3], t: [ssdP.x, ssdP.y, ssdP.z] });
  ctx.camTo(tl, { p: [ssdP.x + 0.35, ssdP.y + 0.75, ssdP.z + 1.0], t: [ssdP.x, ssdP.y, ssdP.z] }, 50.2, 3.6, 'sine.inOut');
  ctx.showLabel(tl, Lssd, 50.6, 3.0);

  ctx.cut(tl, 54.2, 'laptop', 'memNAND', { p: [6.2, 4.6, 7.6], t: [0, 1.0, 0] });
  tl.to(s, { build: 1, duration: 4.4, ease: 'power1.inOut' }, 54.8);
  ctx.showLabel(tl, Lstack, 57.4, 7.6);
  ctx.showLabel(tl, Lchan, 59.4, 5.6);
  tl.to(s, { cellHi: 1, duration: 0.6 }, 60.8);
  ctx.showLabel(tl, Lone, 61.0, 4.0);
  ctx.camTo(tl, { p: [3.2, 2.4, 7.6], t: [0, 1.2, 0] }, 55.0, 10, 'sine.inOut');

  ctx.cut(tl, 65.5, 'memNAND', 'memFlash', { p: [2.4, 1.4, 9.0], t: [0, -0.7, 0] });
  [[Lch, 66.0], [Ltun, 66.4], [Ltrap, 66.8], [Lcg, 67.2]].forEach(([l, at]) => ctx.showLabel(tl, l, at, 78.0 - at));
  tl.to(s, { fgate: 1, duration: 0.6 }, 68.0);
  tl.to(s, { prog: 1, duration: 4, ease: 'none' }, 68.4);
  tl.to(s, { fgate: 0, duration: 0.8 }, 72.8);
  ctx.camTo(tl, { p: [-2.6, 1.2, 8.8], t: [0, -0.7, 0] }, 68.0, 10, 'sine.inOut');

  ctx.cut(tl, 78.5, 'memFlash', 'memHier', { p: [0, 5.2, 18.0], t: [0, 1.5, 0] });
  tl.to(s, { cmp: 1, duration: 0.01 }, 78.5);
  nodes.forEach((n, i) => ctx.showLabel(tl, n.L, 79.0 + i * 0.2, 6.8 - i * 0.2));
  ctx.camTo(tl, { p: [1.0, 4.4, 17.0], t: [0, 1.5, 0] }, 79.0, 7, 'sine.inOut');
  ctx.fade(tl, 1, 86.3, 0.6);
  ctx.hide(tl, 'memHier', 86.95);
  ctx.pad(tl, 87);

  const steps = [
    [0.6, 3.6, 'Memory',
      'These chips next to the CPU are the RAM: the laptop’s working memory.',
      'Modern thin laptops solder LPDDR5X chips right beside the processor, or even onto its package, to keep the wires short and fast.'],
    [4.4, 6.4, 'Near and far',
      'A computer keeps data in several places. The closer to the CPU, the faster, but the smaller.',
      'Registers and caches use SRAM (6 transistors per bit) on the CPU itself. RAM uses DRAM (1 transistor + 1 capacitor per bit). Storage uses NAND flash.'],
    [10.8, 10.2, 'How long it takes',
      'Fetching from cache takes a nanosecond. From RAM, about a hundred. From the SSD, around a hundred thousand.',
      'If an L1 cache hit took one second, a trip to RAM would take almost two minutes and a read from the SSD more than a day. That’s why programs are loaded into RAM before they run.'],
    [21.8, 3.2, 'Inside a RAM chip',
      'A RAM chip is a huge grid of tiny cells. Each cell stores one bit: charged means 1, empty means 0.',
      'A 16 Gb DRAM die holds about 17 billion cells, arranged in banks of grids with rows thousands of cells long.'],
    [25.0, 10.0, 'Reading a row',
      'To read, the chip opens a whole row at once. Every cell in it spills its charge onto its column wire, and sense amplifiers at the bottom decide 1 or 0. Then just the columns you asked for are sent out.',
      'This is ACTIVATE then READ. Reading drains the cells, so the sense amplifiers immediately write the values back. Rows stay open so the next nearby read is quicker.'],
    [35.8, 4.4, 'One DRAM cell',
      'Each cell is just a transistor and a capacitor. The transistor is a switch; the capacitor is a tiny bucket for electrons.',
      'The capacitor holds roughly 10–20 femtofarads, which is only tens of thousands of electrons. Modern capacitors are tall, thin pillars to fit in the space.'],
    [40.2, 5.4, 'It leaks',
      'The bucket leaks. Within milliseconds, a stored 1 would fade into a 0.',
      'Leakage through the transistor and the silicon drains the charge. Higher temperature means faster leakage.'],
    [45.6, 4.2, 'Refresh',
      'So the memory controller reads and rewrites every row, again and again, about every 64 milliseconds. Cut the power and everything is gone.',
      'That’s why DRAM is called “dynamic” and why RAM is volatile: no power, no refresh, no data.'],
    [50.2, 3.8, 'The SSD',
      'Storage has to remember things with the power off. The SSD does it with flash memory chips.',
      'An NVMe SSD has a controller (a small processor), some cache, and NAND flash packages, connected over four PCIe lanes.'],
    [54.6, 10.6, '3D NAND',
      'Inside a flash chip, memory cells are stacked in hundreds of layers, like a skyscraper. Vertical holes run through all of them.',
      'Each layer is a word line. Each vertical channel is a string of cells in series. Stacking vertically packs a terabit onto one die.'],
    [65.8, 2.6, 'One flash cell',
      'Each flash cell is a transistor with an extra layer: a charge trap that can hold electrons, insulated on both sides.',
      'Older flash used a conducting “floating gate”. Modern 3D NAND uses an insulating silicon nitride charge trap.'],
    [68.4, 5.0, 'Writing',
      'To write, a high voltage on the gate pulls electrons out of the channel. They tunnel through the thin oxide and get stuck in the trap layer.',
      'Programming uses about 20 V and quantum tunnelling (Fowler–Nordheim). Erasing reverses it, but only a whole block at a time.'],
    [73.4, 5.0, 'Remembering',
      'Turn the power off and the electrons stay put, for years. Their charge changes how hard it is to switch the transistor on, which is how the cell is read.',
      'Trapped electrons raise the threshold voltage. TLC flash stores 3 bits per cell using 8 threshold levels. Each write wears the oxide a little, so cells survive a few thousand rewrites.'],
    [78.8, 7.4, 'RAM vs SSD',
      'RAM: fast, needs constant power and refreshing. SSD: about a thousand times slower, but it keeps your data with the power off.',
      'RAM: ~100 ns, rewritable endlessly, volatile, ~$3/GB. SSD: ~100 µs, wears out slowly, non-volatile, ~$0.06/GB. Computers use both.'],
  ];
  const outline = [['RAM', 0], ['Speed', 4.4], ['Array', 21.5], ['DRAM cell', 35.5], ['SSD', 50.0], ['3D NAND', 54.2], ['Flash cell', 65.5], ['Compare', 78.5]];

  function update(now) {
    const V = ctx.vis;
    if (V.memHier) {
      nodes.forEach((n) => { n.bar.scale.y = Math.max(0.001, n.h * smooth(s.bars)); });
      const k = Math.min(3, Math.floor(s.hop)), f = frac(s.hop);
      const going = s.hop > 0.001 && s.hop < 3.999;
      pulse.visible = going;
      if (going) pulse.position.x = lerp(CPU_X, nodes[k].x, 1 - Math.abs(1 - 2 * f));
      if (s.cmp > 0.5) {
        ctx.readout(`<h4>RAM VS SSD</h4><table><tr><td style="text-align:left"></td><td>RAM</td><td>SSD</td></tr>
          <tr><td style="text-align:left">read time</td><td>~100 ns</td><td>~100 µs</td></tr>
          <tr><td style="text-align:left">power off</td><td>forgets</td><td>remembers</td></tr>
          <tr><td style="text-align:left">a bit is</td><td>charge</td><td>trapped e⁻</td></tr>
          <tr><td style="text-align:left">size</td><td>16 GB</td><td>1 TB</td></tr></table>`, 1);
      } else if (s.hop > 0.001) {
        ctx.readout(`<h4>IF A CACHE HIT TOOK 1 SECOND</h4><table>${NODES.map((nd, i) => `<tr class="${i === k ? 'on' : ''}"><td style="text-align:left">${nd[0]}</td><td style="text-align:right">${ANALOGY[i]}</td></tr>`).join('')}</table>`, 1);
      }
    }

    if (V.memArray) {
      const a = s.act;
      const open = a > 0.05;
      wls.forEach((w, j) => w.material.color.copy(open && j === ROW ? col.setRGB(1.6, 1.4, 1.1) : DIM));
      const flow = smooth((a - 0.25) / 0.45);
      const latched = a > 0.72;
      for (let i = 0; i < CC; i++) {
        const b = bits[ROW * CC + i];
        const ch = charges[ROW * CC + i];
        ch.visible = !!b && (a < 0.3 || latched); // the charge leaves for the bit line, then is written back
        const d = bitDots[i];
        d.visible = !!b && a > 0.25 && a < 0.72;
        d.position.y = lerp(ay(ROW) - 0.12, SA_Y + 0.25, flow);
        amps[i].material.color.copy(latched ? (b ? col.setRGB(0.5, 1.4, 1.3) : col.setRGB(0.18, 0.2, 0.22)) : DIM);
        bls[i].material.color.copy(a > 0.25 && a < 0.72 && b ? col.setRGB(0.4, 0.9, 0.85) : DIM);
      }
      const c = s.col;
      COLS.forEach((i, k) => {
        const d = outDots[k];
        d.visible = c > 0.01 && c < 0.99 && !!bits[ROW * CC + i];
        d.position.y = lerp(SA_Y, SA_Y - 1.4, smooth(c));
      });
      const word = COLS.map((i) => bits[ROW * CC + i]).join('');
      ctx.readout(`<h4>DRAM COMMANDS</h4><div class="bits">${a > 0.05 ? `ACTIVATE row <i>${ROW}</i>` : 'idle'}${latched ? '<br>row copied into sense amps' : ''}${c > 0.01 ? `<br>READ columns 4–7 → <i class="alt">${word}</i>` : ''}</div>`, 1);
    }

    if (V.memCell) {
      gateMat.emissiveIntensity = 0.9 * s.gate;
      const charge = s.fill * (1 - 0.48 * s.leak);
      const nOn = Math.round(charge * NE);
      capEls.forEach((e, i) => {
        e.m.visible = i < nOn;
        e.m.position.set(e.x + 0.03 * Math.sin(now * 2 + e.ph), e.y + 0.03 * Math.cos(now * 1.7 + e.ph), e.z);
      });
      const filling = s.gate > 0.5 && ((s.fill > 0.01 && s.fill < 0.99) || (s.leak > 0.01 && s.leak < 0.99));
      movers.forEach((m, i) => { m.visible = filling; if (filling) along(frac(now * 0.6 + i / movers.length), m.position); });
      const leaking = s.gate < 0.5 && s.leak > 0.01 && s.leak < 0.99;
      leakers.forEach((m, i) => {
        m.visible = leaking;
        if (leaking) { const u = frac(now * 0.35 + i * 0.5); m.position.set(CAP_X + 0.15 + (i ? 0.25 : -0.25), lerp(0.3, -1.2, u), 0.6); }
      });
      const ms = Math.round(s.leak * 64);
      ctx.readout(`<h4>ONE DRAM CELL</h4><div class="bits">charge <i>${Math.round(charge * 100)}%</i> → reads <i class="alt">${charge > 0.3 ? 1 : 0}</i><br>${s.gate > 0.5 ? 'switch <i>open</i>' : 'switch closed'}${s.leak > 0.01 ? `<br>time since refresh ≈ <i>${ms} ms</i>` : ''}</div>`, 1);
    }

    if (V.memNAND) {
      const b = s.build;
      layers.forEach((g, k) => {
        const u = smooth((b * 1.35 - k / NLAY) * 4);
        g.visible = u > 0.01;
        g.scale.y = Math.max(0.01, u);
      });
      const ch = smooth((b - 0.7) / 0.3);
      chans.visible = ch > 0.01;
      chans.scale.y = Math.max(0.01, ch * (STACK_H + 0.1));
      ring.visible = s.cellHi > 0.05;
      ring.scale.setScalar(0.9 + 0.12 * Math.sin(now * 3));
    }

    if (V.memFlash) {
      cgMat.emissiveIntensity = 1.2 * s.fgate;
      fEls.forEach((e, i) => {
        const trapped = i < NTRAP;
        const k = trapped ? smooth(clamp01(s.prog * 1.4 - e.d * 0.4) * 1) : 0;
        const jx = 0.04 * Math.sin(now * 3 + e.ph), jy = 0.03 * Math.cos(now * 2.6 + e.ph);
        const bx = e.x + (trapped ? 0 : 0.12 * Math.sin(now * 0.8 + e.ph));
        e.m.position.set(lerp(bx, e.tx, k) + jx * (1 - k * 0.7), lerp(e.y, e.ty, k) + jy * (1 - k * 0.7), lerp(e.z, e.tz, k));
      });
      const n = Math.round(NTRAP * clamp01(s.prog * 1.2));
      const stored = s.prog > 0.95;
      ctx.readout(`<h4>ONE FLASH CELL</h4><div class="bits">gate <i>${s.fgate > 0.5 ? '≈ 20 V (writing)' : '0 V · power off'}</i><br>trapped electrons <i>${stored ? NTRAP : n}</i>${stored ? '<br>threshold raised → reads <i class="alt">0</i> (programmed)' : ''}</div>`, 1);
    }
  }

  return { title: 'RAM vs SSD', tl, steps, outline, update };
}
