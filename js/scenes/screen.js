import * as THREE from 'three';
import { M, rbox, glow, makeFloor, rng, clamp01, smooth, lerp, canvasTexture, arrowSet } from '../common.js';
import { flyIn } from './laptop.js';

// Light source colours are drawn without tone mapping so the colours on screen are the colours you'd see.
const lit = (hex, k = 1, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, ...extra });

// Two small pictures the pixel field shows: a sunset, and the same hills at night (the "next frame").
function picture(night) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 40);
  if (night) { sky.addColorStop(0, '#05081a'); sky.addColorStop(1, '#1d2d5a'); }
  else { sky.addColorStop(0, '#2f6fd6'); sky.addColorStop(0.65, '#f2a65a'); sky.addColorStop(1, '#ff6a3c'); }
  g.fillStyle = sky; g.fillRect(0, 0, 64, 40);
  g.fillStyle = night ? '#f4f1e6' : '#ffe27a';
  g.beginPath(); g.arc(night ? 46 : 22, night ? 10 : 24, night ? 4.5 : 6.5, 0, 7); g.fill();
  if (night) { g.fillStyle = '#05081a'; g.beginPath(); g.arc(48, 8.5, 4, 0, 7); g.fill(); }
  if (night) { g.fillStyle = '#ffffff'; for (const [x, y] of [[8, 5], [17, 12], [30, 4], [57, 16], [37, 14], [4, 18], [24, 8]]) g.fillRect(x, y, 1, 1); }
  g.fillStyle = night ? '#0b1a14' : '#2c4a2a';
  g.beginPath(); g.moveTo(0, 30); g.quadraticCurveTo(16, 21, 34, 29); g.quadraticCurveTo(50, 35, 64, 26); g.lineTo(64, 40); g.lineTo(0, 40); g.fill();
  g.fillStyle = night ? '#06100c' : '#1a3020';
  g.beginPath(); g.moveTo(0, 36); g.quadraticCurveTo(28, 29, 64, 35); g.lineTo(64, 40); g.lineTo(0, 40); g.fill();
  const d = g.getImageData(0, 0, 64, 40).data;
  const out = new Float32Array(64 * 40 * 3);
  for (let i = 0; i < 64 * 40; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.pow(d[i * 4 + k] / 255, 2.2);
  return { canvas: c, data: out };
}

export function screenChapter(ctx) {
  const { gsap } = ctx;
  const s = { zoom: 0, spread: 0, pol: 0, volt: 0, r: 1, g: 1, b: 1, scan: 0, swap: 0 };
  const tl = gsap.timeline();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const r = rng(11);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const UP = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();

  // =============== 1. the pixel field ===============
  const PW = 64, PH = 40, PP = 0.3, SUB = 0.1;
  const pix = ctx.register('scrPixels', new THREE.Group());
  add(pix, new THREE.PlaneGeometry(PW * PP + 0.4, PH * PP + 0.4), new THREE.MeshBasicMaterial({ color: 0x040404 }), 0, 0, -0.02);
  const subs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.088, 0.27, 0.02), new THREE.MeshBasicMaterial({ toneMapped: false }), PW * PH * 3);
  const px = (i) => (i - (PW - 1) / 2) * PP, py = (j) => ((PH - 1) / 2 - j) * PP;
  for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) for (let k = 0; k < 3; k++) {
    m4.makeTranslation(px(i) + (k - 1) * SUB, py(j), 0);
    subs.setMatrixAt((j * PW + i) * 3 + k, m4);
  }
  pix.add(subs);
  const picA = picture(false), picB = picture(true);
  const imgA = picA.data, imgB = picB.data;
  // From far away the eye blends the three subpixels into one colour; this layer stands in for that
  // blending and fades out as the camera gets close enough to see the subpixels.
  const blendC = document.createElement('canvas');
  blendC.width = PW; blendC.height = PH;
  const blendG = blendC.getContext('2d');
  const blendTex = new THREE.CanvasTexture(blendC);
  blendTex.colorSpace = THREE.SRGBColorSpace;
  blendTex.magFilter = blendTex.minFilter = THREE.NearestFilter;
  const blendMat = new THREE.MeshBasicMaterial({ map: blendTex, toneMapped: false, transparent: true, depthWrite: false });
  const blend = add(pix, new THREE.PlaneGeometry(PW * PP, PH * PP), blendMat, 0, 0, 0.015);
  let painted = -1;
  function paint(rowsDone) {
    if (rowsDone === painted) return;
    painted = rowsDone;
    for (let j = 0; j < PH; j++) {
      const src = j < rowsDone ? imgB : imgA;
      for (let i = 0; i < PW; i++) for (let k = 0; k < 3; k++) {
        const n = (j * PW + i) * 3 + k, val = src[n];
        subs.setColorAt(n, col.setRGB(k === 0 ? val : 0, k === 1 ? val : 0, k === 2 ? val : 0));
      }
    }
    subs.instanceColor.needsUpdate = true;
    blendG.drawImage(picA.canvas, 0, 0);
    if (rowsDone > 0) blendG.drawImage(picB.canvas, 0, 0, PW, rowsDone, 0, 0, PW, rowsDone);
    blendTex.needsUpdate = true;
  }
  paint(0);
  const scanBar = add(pix, new THREE.PlaneGeometry(PW * PP + 0.6, 0.05), lit(0xffffff, 1, { transparent: true, opacity: 0.8 }), 0, 0, 0.03);
  const PIX = [44, 27];
  const pixAt = anchor(pix, px(PIX[0]), py(PIX[1]), 0);
  const Lpic = ctx.label({ obj: anchor(pix, px(8), py(2), 0), text: 'A picture', sub: '64 × 40 pixels here; 2560 × 1600 on a real laptop', dx: -40, dy: -50 });
  const Lone = ctx.label({ obj: pixAt, at: [0, 0.16, 0], text: 'One pixel', sub: 'three subpixels: red, green, blue', dx: 70, dy: -70, hot: true });
  const Lscan = ctx.label({ obj: scanBar, at: [-PW * PP / 2 - 0.3, 0, 0], text: 'New frame, row by row', sub: '120 times a second', dx: -30, dy: 0 });

  // =============== 2. the layer stack ===============
  const stack = ctx.register('scrStack', new THREE.Group());
  stack.add(makeFloor(30, -0.4, 60));
  const SW = 4.2, SD = 2.8;
  const lines = (dir, step = 8, bg = '#1c1c1e', fg = 'rgba(255,255,255,0.22)') => canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg;
    for (let k = 0; k < w; k += step) dir === 'v' ? g.fillRect(k, 0, 2, h) : g.fillRect(0, k, w, 2);
  });
  const stripes = canvasTexture(96, 8, (g) => { ['#d42a2a', '#2ac24a', '#2a5ad4'].forEach((c, k) => { g.fillStyle = c; g.fillRect(k * 32 + 3, 0, 26, 8); }); });
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping; stripes.repeat.set(36, 24);
  const tftTex = canvasTexture(64, 64, (g) => { g.fillStyle = '#8f99a3'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4a525b'; g.fillRect(0, 0, 64, 4); g.fillRect(0, 0, 4, 64); g.fillStyle = '#2a2f36'; g.fillRect(6, 6, 10, 10); });
  tftTex.wrapS = tftTex.wrapT = THREE.RepeatWrapping; tftTex.repeat.set(40, 26);
  const dots = canvasTexture(256, 256, (g, w) => { g.fillStyle = '#d9dde2'; g.fillRect(0, 0, w, w); g.fillStyle = 'rgba(120,130,145,0.6)'; for (let k = 0; k < 400; k++) { const x = (k * 37) % w, y = Math.floor(k / 7) * 9 % w; g.beginPath(); g.arc(x, y, 1.5 + (x / w) * 2.5, 0, 7); g.fill(); } });
  const LAYERS = [
    ['Light guide + LEDs', 'LEDs at the edge, a plate spreads their light', new THREE.MeshStandardMaterial({ map: dots, roughness: 0.5, transparent: true, opacity: 0.92 }), 0.09],
    ['Diffuser films', 'make the light even', new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9, transparent: true, opacity: 0.7 }), 0.02],
    ['Rear polarizer', 'only lets one direction of light wiggle through', new THREE.MeshStandardMaterial({ map: lines('v'), roughness: 0.6, transparent: true, opacity: 0.9 }), 0.02],
    ['Transistor glass', 'one tiny switch per subpixel', new THREE.MeshStandardMaterial({ map: tftTex, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.85 }), 0.05],
    ['Liquid crystal', 'a layer about 3 µm thick', new THREE.MeshStandardMaterial({ color: 0x8fd0c8, roughness: 0.2, transparent: true, opacity: 0.55 }), 0.012],
    ['Colour filter', 'red, green and blue stripes', new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.4, transparent: true, opacity: 0.95 }), 0.05],
    ['Front polarizer', 'turned 90° to the rear one', new THREE.MeshStandardMaterial({ map: lines('h'), roughness: 0.6, transparent: true, opacity: 0.9 }), 0.02],
    ['Cover glass', 'protection', new THREE.MeshPhysicalMaterial({ color: 0xcfe1dc, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25 }), 0.05],
  ];
  const sheets = LAYERS.map(([, , mat, h], i) => {
    const g = new THREE.Group();
    stack.add(g);
    add(g, rbox(SW, h, SD, Math.min(0.02, h / 2.2)), mat);
    return g;
  });
  for (let k = 0; k < 12; k++) add(sheets[0], new THREE.BoxGeometry(0.16, 0.06, 0.05), glow(0xfff6e6, 2.5), -1.9 + k * 0.345, 0, -SD / 2 - 0.04);
  const stackLabels = LAYERS.map(([name, sub], i) => ctx.label({ obj: sheets[i], at: [SW / 2, 0, SD / 2], text: name, sub, col: 'right', dy: 0 }));

  // =============== 3. polarizers ===============
  const pol = ctx.register('scrPol', new THREE.Group());
  pol.add(makeFloor(40, -2.2, 80));
  const NPA = 61, X0 = -6.4, X1 = 6.4, P1X = -2.4, P2X = 2.4;
  const grating = (dir) => {
    const g = new THREE.Group();
    add(g, new THREE.BoxGeometry(0.04, 3.2, 3.2), new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false }));
    const slit = new THREE.MeshStandardMaterial({ color: 0xb4b4b4, roughness: 0.4, metalness: 0.4 });
    for (let k = -7; k <= 7; k++) add(g, new THREE.BoxGeometry(0.06, dir === 'v' ? 3.2 : 0.035, dir === 'v' ? 0.035 : 3.2), slit, 0, dir === 'v' ? 0 : k * 0.2, dir === 'v' ? k * 0.2 : 0);
    pol.add(g);
    return g;
  };
  // Slits along an axis let the wiggle along the *other* direction through in a real wire-grid; here the
  // drawn slats simply mark the pass axis, which is all the viewer needs.
  const P1 = grating('v'); P1.position.x = P1X;
  const P2 = grating('v'); P2.position.x = P2X;
  add(pol, new THREE.SphereGeometry(0.28, 24, 16), glow(0xfff6e6, 3), X0 - 0.5, 0, 0);
  const Earr = arrowSet(NPA, 0xe6c08f, 0.022, 1.8);
  pol.add(Earr);
  const ang = Array.from({ length: NPA }, () => r() * Math.PI);
  const eye = add(pol, new THREE.PlaneGeometry(1.4, 1.4), lit(0xfff6e6, 1, { transparent: true, side: THREE.DoubleSide }), X1 + 0.6, 0, 0);
  eye.rotation.y = Math.PI / 2;
  const Lun = ctx.label({ obj: anchor(pol, -4.6, 1.0, 0), text: 'Ordinary light', sub: 'wiggles in every direction', dx: -40, dy: -70 });
  const Lp1 = ctx.label({ obj: P1, at: [0, 1.6, 0], text: 'Polarizer', sub: 'passes only up-and-down wiggles', dx: -30, dy: -60 });
  const Lp2 = ctx.label({ obj: P2, at: [0, 1.6, 0], text: 'Second polarizer', sub: 'turn it and less light gets through', dx: 30, dy: -60, hot: true });

  // =============== 4. liquid crystal twist ===============
  const lc = ctx.register('scrLC', new THREE.Group());
  lc.add(makeFloor(30, -3.2, 60));
  const plate = (y, mat, h = 0.08) => add(lc, rbox(3.4, h, 3.4, 0.02), mat, 0, y, 0);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe8ea, roughness: 0.08, transparent: true, opacity: 0.18, depthWrite: false });
  const polMat = (dir) => new THREE.MeshStandardMaterial({ map: lines(dir, 10, '#2a2b2e', 'rgba(255,255,255,0.35)'), transparent: true, opacity: 0.75, depthWrite: false });
  const lcPolB = plate(-2.5, polMat('h'), 0.04), lcGlassB = plate(-2.0, glassMat), lcGlassT = plate(2.0, glassMat), lcPolT = plate(2.5, polMat('v'), 0.04);
  const NL = 8, GRID = [-1.05, -0.35, 0.35, 1.05];
  const rods = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.06, 0.34, 4, 10), new THREE.MeshStandardMaterial({ color: 0x8fd0c8, roughness: 0.35, metalness: 0.1 }), NL * 16);
  lc.add(rods);
  const LY = (k) => -1.6 + (3.2 * (k + 0.5)) / NL;
  const NLA = 45;
  const lcArr = arrowSet(NLA, 0xe6c08f, 0.02, 1.8);
  lc.add(lcArr);
  const lcAng = Array.from({ length: NLA }, () => r() * Math.PI);
  const pixel = add(lc, new THREE.PlaneGeometry(1.1, 1.1), lit(0xffffff, 1, { side: THREE.DoubleSide }), 0, 3.15, 0);
  pixel.rotation.x = -Math.PI / 2;
  const fieldMat = new THREE.LineBasicMaterial({ color: 0x8fb4d6, transparent: true, opacity: 0 });
  const fieldPts = [];
  for (const x of [-1.4, -0.7, 0.7, 1.4]) for (const z of [-1.4, 1.4]) fieldPts.push(x, -1.9, z, x, 1.9, z);
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fieldPts, 3));
  lc.add(new THREE.LineSegments(fg, fieldMat));
  const Lrod = ctx.label({ obj: anchor(lc, 1.05, LY(4), 1.05), text: 'Liquid-crystal molecules', sub: 'long, rod-shaped, free to turn', col: 'right', dy: 0, hot: true });
  const Lgroove = ctx.label({ obj: lcGlassB, at: [-1.7, 0, 1.7], text: 'Grooved glass', sub: 'grooves top and bottom at 90°: the rods twist', col: 'left', dy: 0 });
  const LpolB = ctx.label({ obj: lcPolB, at: [1.7, 0, 1.7], text: 'Rear polarizer', sub: '', col: 'right', dy: 0 });
  const LpolT = ctx.label({ obj: lcPolT, at: [1.7, 0, 1.7], text: 'Front polarizer', sub: 'turned 90°', col: 'right', dy: 0 });
  const Lpixel = ctx.label({ obj: pixel, text: 'Subpixel', sub: '', col: 'left', dy: 0 });

  // =============== 5. colour from three subpixels ===============
  const sub = ctx.register('scrSub', new THREE.Group());
  sub.add(makeFloor(30, -2.8, 60));
  const RGB = [0xff2a2a, 0x2aff4a, 0x3a6aff];
  const cols = RGB.map((hex, k) => {
    const x = (k - 1) * 0.95;
    add(sub, new THREE.BoxGeometry(0.7, 2.2, 0.7), lit(0xffffff, 0.55, { transparent: true, opacity: 0.35, depthWrite: false }), x, -1.5, 0);
    add(sub, new THREE.BoxGeometry(0.78, 0.08, 0.78), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.5 }), x, -0.3, 0);
    const shutter = add(sub, new THREE.BoxGeometry(0.76, 0.06, 0.76), new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.4, transparent: true }), x, -0.2, 0);
    add(sub, new THREE.BoxGeometry(0.78, 0.12, 0.78), new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, emissive: hex, emissiveIntensity: 0.25 }), x, 0.05, 0);
    const beamMat = lit(hex, 1.3, { transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = add(sub, new THREE.BoxGeometry(0.6, 2.2, 0.6), beamMat, x, 1.25, 0);
    return { shutter, beamMat, beam, hex };
  });
  const swatchMat = lit(0xffffff, 1, { side: THREE.DoubleSide });
  const swatch = add(sub, new THREE.PlaneGeometry(2.6, 0.9), swatchMat, 0, 3.0, 0);
  const Lfilter = ctx.label({ obj: anchor(sub, 1.35, 0.05, 0.4), text: 'Colour filters', sub: 'each passes only its own colour', dx: 90, dy: 0 });
  const Lshut = ctx.label({ obj: anchor(sub, -1.35, -0.2, 0.4), text: 'Liquid-crystal shutters', sub: 'set how much light passes', dx: -90, dy: 0 });
  const Lback = ctx.label({ obj: anchor(sub, -1.35, -1.8, 0.4), text: 'White backlight', sub: '', dx: -90, dy: 20 });
  const Lmix = ctx.label({ obj: swatch, at: [1.3, 0, 0], text: 'What your eye sees', sub: 'the three blend into one colour', dx: 80, dy: -20, hot: true });

  // =============== 6. the active matrix ===============
  const tft = ctx.register('scrTFT', new THREE.Group());
  const CX = 8, CY = 6, CP = 1.0;
  const cx = (i) => (i - (CX - 1) / 2) * CP, cy = (j) => ((CY - 1) / 2 - j) * CP;
  add(tft, new THREE.PlaneGeometry(CX * CP + 0.6, CY * CP + 0.6), new THREE.MeshBasicMaterial({ color: 0x08090a }), 0, 0, -0.03);
  const HEART = ['01100110', '11111111', '11111111', '01111110', '00111100', '00011000'];
  const cells = [];
  for (let j = 0; j < CY; j++) for (let i = 0; i < CX; i++) {
    const mat = lit(0xffffff, 0.012);
    add(tft, new THREE.PlaneGeometry(0.68, 0.68), mat, cx(i) + 0.06, cy(j) - 0.06, 0);
    add(tft, new THREE.BoxGeometry(0.14, 0.14, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.4, metalness: 0.3 }), cx(i) - 0.35, cy(j) + 0.35, 0.02);
    add(tft, new THREE.BoxGeometry(0.16, 0.05, 0.03), M.silver, cx(i) + 0.3, cy(j) + 0.36, 0.015);
    const on = HEART[j][i] === '1';
    cells.push({ mat, level: on ? 0.95 - 0.1 * (j / CY) : 0.02 });
  }
  const dim = new THREE.Color(0x3a3d42);
  const gates = Array.from({ length: CY }, (_, j) => add(tft, new THREE.BoxGeometry(CX * CP + 0.3, 0.035, 0.02), lit(0x3a3d42), 0, cy(j) + 0.45, 0.01));
  const datas = Array.from({ length: CX }, (_, i) => add(tft, new THREE.BoxGeometry(0.035, CY * CP + 0.3, 0.02), lit(0x3a3d42), cx(i) - 0.45, 0, 0.012));
  const Lgate = ctx.label({ obj: gates[1], at: [CX * CP / 2 + 0.15, 0, 0], text: 'Row line', sub: 'switches a whole row on', col: 'right', dy: 0 });
  const Ldata = ctx.label({ obj: datas[0], at: [0, CY * CP / 2 + 0.15, 0], text: 'Column lines', sub: 'carry each subpixel’s level', col: 'left', dy: 0 });
  const Lsw = ctx.label({ obj: anchor(tft, cx(7) - 0.35, cy(3) + 0.35, 0), text: 'Thin-film transistor', sub: 'one switch per subpixel', col: 'right', dy: 0, hot: true });
  const Lcap = ctx.label({ obj: anchor(tft, cx(7) + 0.3, cy(0) + 0.36, 0), text: 'Storage capacitor', sub: 'holds the level until next frame', col: 'right', dy: 0 });

  // =============== timeline ===============
  const lcdCentre = anchor(ctx.laptop.parts.lcd, 0, 0.003, 1.08); // middle of the panel (the part's origin is at the hinge)
  const T0 = flyIn(ctx, tl, lcdCentre, { off: [0.7, 0.35, 2.7], text: 'Display', sub: 'liquid-crystal panel', dx: -60, dy: -100 });
  const FAR = { p: [0, 0, 24], t: [0, 0, 0] };
  const NEAR = { p: [px(PIX[0]) + 0.9, py(PIX[1]) + 0.25, 2.2], t: [px(PIX[0]), py(PIX[1]), 0] };
  ctx.show(tl, 'scrPixels', T0);
  ctx.camSet(tl, FAR, T0);
  ctx.fade(tl, 0, T0 + 0.05, 0.6);
  ctx.title(tl, 4.4, 'PART 4 · LIGHT', 'How a Screen Works', 2.6);
  ctx.showLabel(tl, Lpic, 7.2, 2.6);
  ctx.camTo(tl, NEAR, 9.6, 4.6, 'power2.inOut');
  ctx.showLabel(tl, Lone, 13.6, 2.4);

  ctx.cut(tl, 16.5, 'scrPixels', 'scrStack', { p: [5.4, 3.0, 6.6], t: [0, 0.4, 0] });
  tl.to(s, { spread: 1, duration: 3.6, ease: 'power2.inOut' }, 17.4);
  ctx.camTo(tl, { p: [6.4, 3.4, 7.2], t: [0, 1.5, 0] }, 17.4, 4, 'power2.inOut');
  stackLabels.forEach((L, i) => ctx.showLabel(tl, L, 21.0 + i * 0.35, 9.0 - i * 0.35));

  ctx.cut(tl, 30.5, 'scrStack', 'scrPol', { p: [-3.2, 3.6, 11.5], t: [0, 0, 0] });
  ctx.showLabel(tl, Lun, 31.2, 4.0);
  ctx.showLabel(tl, Lp1, 32.0, 11.8);
  ctx.showLabel(tl, Lp2, 35.6, 8.2);
  ctx.camTo(tl, { p: [3.6, 3.0, 11.0], t: [0, 0, 0] }, 33.0, 6, 'sine.inOut');
  tl.to(s, { pol: 1, duration: 5, ease: 'sine.inOut' }, 36.4);

  ctx.cut(tl, 44.5, 'scrPol', 'scrLC', { p: [8.4, 4.4, 10.6], t: [0, 0.4, 0] });
  [[Lrod, 45.0], [Lgroove, 45.8], [LpolB, 46.4], [LpolT, 46.8], [Lpixel, 47.4]].forEach(([l, at]) => ctx.showLabel(tl, l, at, 59.6 - at));
  ctx.camTo(tl, { p: [7.0, 2.8, 11.2], t: [0, 0.4, 0] }, 47.0, 4, 'sine.inOut');
  tl.to(s, { volt: 1, duration: 3, ease: 'power2.inOut' }, 51.0);
  tl.to(s, { volt: 0.45, duration: 2, ease: 'power2.inOut' }, 55.4);
  ctx.camTo(tl, { p: [8.8, 4.8, 9.4], t: [0, 0.4, 0] }, 51.0, 8, 'sine.inOut');

  ctx.cut(tl, 60.5, 'scrLC', 'scrSub', { p: [4.2, 2.4, 11.0], t: [0, 0.6, 0] });
  [[Lback, 61.0], [Lshut, 61.6], [Lfilter, 62.2], [Lmix, 63.0]].forEach(([l, at]) => ctx.showLabel(tl, l, at, 73.6 - at));
  const SEQ = [[1, 0, 0], [1, 1, 0], [1, 0.45, 0], [0.15, 0.55, 1], [0.6, 0.15, 0.8], [0, 0, 0], [1, 1, 1]];
  SEQ.forEach(([R, G, B], i) => tl.to(s, { r: R, g: G, b: B, duration: 0.9, ease: 'power2.inOut' }, 63.8 + i * 1.4));
  ctx.camTo(tl, { p: [-4.0, 2.2, 11.0], t: [0, 0.6, 0] }, 64.0, 9, 'sine.inOut');

  ctx.cut(tl, 74.5, 'scrSub', 'scrTFT', { p: [0, -0.4, 12.5], t: [0, 0.2, 0] });
  [[Ldata, 75.0], [Lgate, 75.6], [Lsw, 76.2], [Lcap, 76.8]].forEach(([l, at]) => ctx.showLabel(tl, l, at, 87.6 - at));
  tl.to(s, { scan: CY, duration: 8, ease: 'none' }, 78.6);
  ctx.camTo(tl, { p: [2.2, 0.8, 12.0], t: [0, 0.2, 0] }, 77.0, 10, 'sine.inOut');

  ctx.cut(tl, 88.5, 'scrTFT', 'scrPixels', { p: [0, 0, 19], t: [0, 0, 0] });
  tl.to(s, { swap: 1, duration: 6, ease: 'none' }, 89.4);
  ctx.showLabel(tl, Lscan, 89.6, 5.6);
  ctx.camTo(tl, FAR, 95.0, 4, 'power2.inOut');
  ctx.fade(tl, 1, 100.3, 0.6);
  ctx.hide(tl, 'scrPixels', 100.95);
  ctx.pad(tl, 101);

  const steps = [
    [0.6, 3.6, 'The display',
      'The screen is where everything the laptop does turns into light.',
      'Most laptops use an LCD: a liquid-crystal panel lit from behind. Some use OLED, where every pixel makes its own light.'],
    [4.4, 5.0, 'A grid of pixels',
      'Every image on the screen is a grid of tiny coloured squares called pixels.',
      'A 14-inch laptop screen might be 2560 × 1600: about 4 million pixels, each about 0.12 mm wide.'],
    [9.6, 6.6, 'Red, green and blue',
      'Look closely and each pixel is three smaller lights: red, green and blue. Mix them and you get every colour.',
      'Each subpixel has 256 brightness levels (8 bits), giving 256³ ≈ 16.7 million colours. Wide-gamut panels use 10 bits per subpixel.'],
    [16.8, 13.4, 'The layers',
      'An LCD is a sandwich: a light at the back, then filters and a liquid crystal that decide how much light gets through each subpixel.',
      'Backlight (LEDs + light guide + diffusers) → polarizer → transistor glass → liquid crystal (~3 µm) → colour filter → polarizer → cover glass. The whole stack is a few millimetres thick.'],
    [30.8, 5.4, 'Light wiggles',
      'Light is a wave, and it wiggles sideways as it travels. Ordinary light wiggles in every direction at once.',
      'The wiggle is the electric field of the electromagnetic wave. Its direction is called polarization; sunlight and LED light are unpolarized.'],
    [36.2, 8.0, 'Polarizers',
      'A polarizer only lets one direction of wiggle through. Put a second one across it at 90° and no light gets through at all.',
      'Malus’s law: the light that passes is cos²θ of what arrives, where θ is the angle between the polarizers. 0° passes all of it, 90° none.'],
    [44.8, 6.2, 'The twist',
      'Between the polarizers sits the liquid crystal. Its rod-shaped molecules form a gentle 90° twist that carries the light’s wiggle round with it, so the light gets through.',
      'This is a “twisted nematic” cell. Grooves rubbed into the glass on each side line the molecules up, and the twist guides the polarization through 90°.'],
    [51.0, 9.4, 'Voltage untwists it',
      'Put a voltage across the layer and the molecules stand up. The twist is gone, the wiggle is no longer turned, and the front polarizer blocks it: the subpixel goes dark.',
      'The molecules have an electric dipole, so the field rotates them. Partial voltages give partial twist: that is how each subpixel gets its 256 levels of grey.'],
    [60.8, 13.4, 'Making colour',
      'Each subpixel has a colour filter on top. By letting different amounts of red, green and blue light through, the three together make any colour.',
      'Your eye has three kinds of colour cells (cones), sensitive to roughly red, green and blue. A screen only needs to stimulate those three to fake any colour.'],
    [74.8, 13.0, 'One switch per subpixel',
      'Millions of subpixels are controlled by a grid of wires. One row is switched on at a time, and the column wires set each subpixel in that row.',
      'Each subpixel has a thin-film transistor (TFT) and a tiny capacitor. When its row is selected the transistor opens and the capacitor charges to the column voltage, then holds it for the rest of the frame.'],
    [88.8, 11.6, 'Refreshing',
      'The screen redraws itself row by row, top to bottom, 60 to 120 times every second, fast enough that you only see smooth motion.',
      'At 120 Hz with 1600 rows, each row gets about 5 microseconds. Variable refresh rate lets the screen wait for the next frame from the graphics chip.'],
  ];
  const outline = [['Display', 0], ['Pixels', 4.4], ['Layers', 16.5], ['Polarizers', 30.5], ['Liquid crystal', 44.5], ['Colour', 60.5], ['Transistors', 74.5], ['Refresh', 88.5]];

  function update(now) {
    const V = ctx.vis;
    if (V.scrPixels) {
      paint(Math.floor(s.swap * PH + 1e-6));
      blendMat.opacity = 0.92 * smooth((ctx.camera.position.distanceTo(blend.getWorldPosition(v)) - 5) / 12);
      blend.visible = blendMat.opacity > 0.01;
      scanBar.visible = s.swap > 0.001 && s.swap < 0.999;
      scanBar.position.y = py(0) + PP / 2 - s.swap * PH * PP;
    }

    if (V.scrStack) {
      const e = smooth(s.spread);
      sheets.forEach((g, i) => g.position.set(0, lerp(i * 0.08, i * 0.48, e), 0));
    }

    if (V.scrPol) {
      const th = (s.pol * Math.PI) / 2;
      P2.rotation.x = th;
      const k = (Math.PI * 2) / 1.6, w = 5;
      for (let i = 0; i < NPA; i++) {
        const x = X0 + ((X1 - X0) * i) / (NPA - 1);
        const a = Math.sin(k * x - w * now);
        let ax, len;
        if (x < P1X) { ax = ang[i] + now * 0.8 * (i % 2 ? 1 : -1); len = 0.95 * a; v.set(0, Math.cos(ax), Math.sin(ax)); }
        else if (x < P2X) { v.set(0, 1, 0); len = 0.8 * a; }
        else { v.set(0, Math.cos(th), Math.sin(th)); len = 0.8 * a * Math.cos(th); }
        Earr.userData.set(i, v3.set(x, 0, 0), v, len);
      }
      Earr.userData.commit();
      const T = Math.cos(th) ** 2;
      eye.material.color.setScalar(0.04 + 1.2 * T);
      ctx.readout(`<h4>SECOND POLARIZER</h4><div class="bits">angle θ = <i>${Math.round(s.pol * 90)}°</i><br>light through = cos²θ = <i>${Math.round(T * 100)}%</i></div>`, 1);
    }

    if (V.scrLC) {
      const vt = s.volt;
      let n = 0;
      for (let k = 0; k < NL; k++) {
        const t = (k + 0.5) / NL;
        const phi = (Math.PI / 2) * t;
        const tilt = vt * 1.48 * Math.pow(Math.sin(Math.PI * t), 0.4);
        v.set(Math.cos(phi) * Math.cos(tilt), Math.sin(tilt), Math.sin(phi) * Math.cos(tilt));
        q.setFromUnitVectors(UP, v);
        for (const x of GRID) for (const z of GRID) {
          m4.compose(v3.set(x, LY(k), z), q, one);
          rods.setMatrixAt(n++, m4);
        }
      }
      rods.instanceMatrix.needsUpdate = true;
      // how far the twist still turns the light: less as the molecules stand up
      const rot = (Math.PI / 2) * (1 - smooth(vt));
      const T = Math.sin(rot) ** 2;
      const kk = (Math.PI * 2) / 1.2, w = 5;
      for (let i = 0; i < NLA; i++) {
        const y = -3.6 + (7.2 * i) / (NLA - 1);
        const a = Math.sin(kk * y - w * now);
        let len = 0.55 * a;
        if (y < -2.5) { const ax = lcAng[i] + now * 0.8; v.set(Math.cos(ax), 0, Math.sin(ax)); }
        else if (y < 2.5) { const f = clamp01((y + 1.6) / 3.2); v.set(Math.cos(rot * f), 0, Math.sin(rot * f)); }
        else { v.set(0, 0, 1); len *= Math.sin(rot); }
        lcArr.userData.set(i, v3.set(0, y, 0), v, len);
      }
      lcArr.userData.commit();
      pixel.material.color.setScalar(0.03 + 1.1 * T);
      fieldMat.opacity = 0.7 * smooth(vt * 2);
      Lpixel.setText('Subpixel', T > 0.9 ? 'light gets through' : T < 0.1 ? 'dark' : 'partly lit');
      ctx.readout(`<h4>LIQUID-CRYSTAL CELL</h4><div class="bits">voltage = <i>${(vt * 5).toFixed(1)} V</i><br>twist left = <i>${Math.round((rot * 180) / Math.PI)}°</i><br>light through = <i>${Math.round(T * 100)}%</i></div>`, 1);
    }

    if (V.scrSub) {
      const lv = [s.r, s.g, s.b];
      cols.forEach((c, k) => {
        c.shutter.material.opacity = 0.92 * (1 - lv[k]);
        c.beamMat.opacity = 0.1 + 0.8 * lv[k];
        c.beam.scale.y = 0.15 + 0.85 * lv[k];
        c.beam.position.y = 0.15 + 1.1 * (0.15 + 0.85 * lv[k]);
      });
      swatchMat.color.setRGB(s.r ** 2.2, s.g ** 2.2, s.b ** 2.2);
      const b8 = lv.map((x) => Math.round(x * 255));
      ctx.readout(`<h4>ONE PIXEL</h4><div class="bits">R <i>${b8[0]}</i> &nbsp; G <i>${b8[1]}</i> &nbsp; B <i>${b8[2]}</i></div>`, 1);
    }

    if (V.scrTFT) {
      const row = Math.min(CY - 1, Math.floor(s.scan));
      const active = s.scan > 0.001 && s.scan < CY - 0.001;
      gates.forEach((gm, j) => gm.material.color.copy(active && j === row ? col.setRGB(1.6, 1.4, 1.1) : dim));
      datas.forEach((dm, i) => {
        const lvl = cells[row * CX + i].level;
        dm.material.color.copy(active ? col.setRGB(0.25 + 1.3 * lvl, 0.25 + 1.2 * lvl, 0.25 + lvl) : dim);
      });
      cells.forEach((c, n) => {
        const j = Math.floor(n / CX);
        const done = s.scan > j + 0.5;
        c.mat.color.setScalar(done ? c.level : 0.012);
      });
      ctx.readout(`<h4>SCANNING</h4><div class="bits">row <i>${active ? row + 1 : s.scan < 1 ? '–' : CY}</i> of ${CY}<br>real screen: 1600 rows, ~5 µs each</div>`, 1);
    }
  }

  return { title: 'Screen', tl, steps, outline, update };
}
