import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { lineMats } from './common.js';
import { Labels } from './labels.js';
import { createLaptop, introChapter, outroChapter, idleLoop, IDLE_VIEW } from './scenes/laptop.js';
import { wifiChapter } from './scenes/wifi.js';
import { cpuChapter } from './scenes/cpu.js';
import { batteryChapter } from './scenes/battery.js';
import { screenChapter } from './scenes/screen.js';
import { memoryChapter } from './scenes/memory.js';
import { coolingChapter } from './scenes/cooling.js';

const gsap = window.gsap;
let hdriReady = false, booted = false, frames = 0;
// Canvas textures (screen, labels, legends) need the web fonts before they are drawn.
await Promise.race([
  Promise.all(['300 40px Inter', '400 20px Inter', '500 20px Inter', '600 20px Inter', '500 20px "JetBrains Mono"'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 2500)),
]);
const IDLE = new URLSearchParams(location.search).has('idle');
const $ = (s) => document.querySelector(s);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, powerPreference: 'high-performance' });
const MAX_DPR = Math.min(devicePixelRatio, 1.5);
let dpr = MAX_DPR;
renderer.setPixelRatio(dpr);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8;
// A real photographed studio (Poly Haven, CC0) for believable reflections on metal and glass.
new RGBELoader().load('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.75;
  scene.environmentRotation.set(0, 0.6, 0);
  hdr.dispose();
  hdriReady = true;
}, undefined, () => { hdriReady = true; });

const backdrop = new THREE.Mesh(
  new THREE.SphereGeometry(300, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x0d0d0d) }, bottom: { value: new THREE.Color(0x000000) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = smoothstep(-0.5, 0.6, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
  })
);
backdrop.renderOrder = -1;
scene.add(backdrop);


scene.add(new THREE.HemisphereLight(0xc4d8ff, 0x1a1e26, 0.35));
const key = new THREE.DirectionalLight(0xfff6ec, 1.2);
key.position.set(5, 9, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.01;
key.shadow.radius = 3;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fb2ff, 0.8);
rim.position.set(-6, 4, -6);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 800);

// Rendered straight to the screen: no post-processing passes, so every frame is a single draw of the scene.
const renderFrame = () => renderer.render(scene, camera);

// ---------- shared context for the chapters ----------
const cam = { px: 4, py: 2.5, pz: 5, tx: 0, ty: 0, tz: 0, fov: 38 };
const vis = {};
const groups = {};
const labels = new Labels(camera);
let readoutHTML = '', readoutOp = 0;

const ctx = {
  scene, camera, cam, vis, groups, labels, gsap,
  register(name, group) { groups[name] = group; vis[name] = 0; group.visible = false; scene.add(group); return group; },
  show: (tl, name, at) => tl.to(vis, { [name]: 1, duration: 0.01 }, at),
  hide: (tl, name, at) => tl.to(vis, { [name]: 0, duration: 0.01 }, at),
  camTo(tl, view, at, dur = 2, ease = 'power2.inOut') {
    const o = { px: view.p[0], py: view.p[1], pz: view.p[2], tx: view.t[0], ty: view.t[1], tz: view.t[2], duration: dur, ease };
    if (view.fov) o.fov = view.fov;
    return tl.to(cam, o, at);
  },
  camSet(tl, view, at) { return ctx.camTo(tl, { fov: 38, ...view }, at, 0.01, 'none'); },
  fade: (tl, to, at, dur = 0.6) => tl.to('#fade', { opacity: to, duration: dur, ease: 'power1.inOut' }, at),
  // Fade to black, swap one stage group for another, set the camera, fade back in.
  cut(tl, at, from, to, view) {
    ctx.fade(tl, 1, at - 0.6, 0.55);
    if (from) ctx.hide(tl, from, at);
    ctx.show(tl, to, at);
    ctx.camSet(tl, view, at);
    ctx.fade(tl, 0, at + 0.05, 0.6);
  },
  flash(tl, at) {
    tl.to('#flash', { opacity: 1, duration: 0.35, ease: 'power2.in' }, at);
    tl.to('#flash', { opacity: 0, duration: 0.6, ease: 'power2.out' }, at + 0.45);
  },
  title(tl, at, kicker, text, dur = 3, extra = '', startVisible = false) {
    const el = document.createElement('div');
    el.className = 'title-card' + (startVisible ? ' hero' : '');
    el.innerHTML = `<div class="k">${kicker}</div><div class="t">${text}</div>${extra ? `<div class="x">${extra}</div>` : ''}`;
    $('#titles').appendChild(el);
    if (startVisible) gsap.set(el, { opacity: 1, y: 0 });
    else tl.to(el, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, at);
    if (dur) tl.to(el, { opacity: 0, duration: 0.6 }, at + dur);
  },
  label: (o) => labels.add(o),
  showLabel(tl, L, at, dur) {
    tl.to(L.s, { o: 1, duration: 0.45 }, at);
    if (dur) tl.to(L.s, { o: 0, duration: 0.35 }, at + dur);
  },
  pad: (tl, end) => tl.to({}, { duration: 0.01 }, end - 0.01),
  // Any visible stage can show live numbers in the readout box (the most opaque request wins).
  readout(html, op) { if (op > readoutOp) { readoutOp = op; readoutHTML = html; } },
};

ctx.laptop = createLaptop(ctx);

// ---------- build the timeline (driven by scroll, not by playback) ----------
const chapters = [introChapter(ctx), wifiChapter(ctx), cpuChapter(ctx), batteryChapter(ctx), screenChapter(ctx), memoryChapter(ctx), coolingChapter(ctx), outroChapter(ctx)];
const master = gsap.timeline({ paused: true });
let total = 0;
for (const ch of chapters) {
  ch.start = total;
  master.add(ch.tl, total);
  total += ch.tl.duration();
  ch.end = total;
}
window.__episode = { master, chapters, scene, renderer, jump: (t) => jump(t), renderFrame: () => renderFrame() };
const steps = chapters.flatMap((ch) => ch.steps.map(([at, dur, title, s, d]) => ({ ch, a: ch.start + at, b: ch.start + at + dur, title, s, d })));

// ---------- scroll ↔ timeline ----------
const PX = 110; // scroll pixels per timeline second
const body = document.body;
let cur = 0.02;
function layout() { $('#scroll').style.height = total * PX + innerHeight + 'px'; }
const T_MIN = 0.02; // zero-length "set" tweens at t=0 only apply once the playhead has moved past them
const target = () => Math.min(total, Math.max(T_MIN, scrollY / PX));
function jump(t) {
  t = Math.min(total - 0.01, Math.max(T_MIN, t));
  scrollTo({ top: t * PX, behavior: 'instant' });
  cur = t;
  master.seek(cur);
}

// ---------- navigation: technologies + sections ----------
const tabs = $('#tabs');
const navChapters = chapters.filter((c) => c.title !== 'Up Next');
navChapters.forEach((ch) => {
  const b = document.createElement('button');
  b.textContent = ch.title;
  b.onclick = () => jump(ch.start + (ch.title === 'Overview' ? 0 : 0.75));
  tabs.appendChild(b);
  ch.tab = b;
});
const outlineEl = $('#outline');
let outlineFor = null;
function buildOutline(ch) {
  outlineFor = ch;
  outlineEl.innerHTML = '';
  ch.outline.forEach(([name, at], i) => {
    const b = document.createElement('button');
    b.title = name;
    b.setAttribute('aria-label', name);
    b.innerHTML = '<i></i>';
    b.onclick = () => jump(ch.start + at + 0.75);
    outlineEl.appendChild(b);
  });
}
function updateOutline(ch, T) {
  if (outlineFor !== ch) buildOutline(ch);
  const list = ch.outline;
  [...outlineEl.children].forEach((b, i) => {
    const a = ch.start + list[i][1];
    const z = i + 1 < list.length ? ch.start + list[i + 1][1] : ch.end;
    const p = Math.min(1, Math.max(0, (T - a) / (z - a)));
    const state = `${T >= a && T < z}|${T >= z}|${p.toFixed(3)}`;
    if (b._s === state) return;
    b._s = state;
    b.classList.toggle('on', T >= a && T < z);
    b.classList.toggle('done', T >= z);
    b.lastChild.style.transform = `scaleX(${p})`;
  });
}

$('.brand').addEventListener('click', (e) => { e.preventDefault(); jump(0); });
document.querySelectorAll('.mode button').forEach((b) => {
  b.onclick = () => {
    body.dataset.mode = b.dataset.mode;
    document.querySelectorAll('.mode button').forEach((x) => x.classList.toggle('on', x === b));
  };
});
addEventListener('keydown', (e) => {
  if (e.code === 'ArrowRight') { e.preventDefault(); stepBy(1); }
  if (e.code === 'ArrowLeft') { e.preventDefault(); stepBy(-1); }
  if (e.code === 'KeyD') document.querySelector(`.mode button[data-mode="${body.dataset.mode === 'deep' ? 'simple' : 'deep'}"]`).click();
});

// ---------- explanation panel ----------
const panel = $('#panel');
let lastStep;
function updatePanel(T) {
  const st = steps.find((s) => T >= s.a && T < s.b) || null;
  if (st === lastStep) return;
  lastStep = st;
  panel.classList.toggle('empty', !st);
  if (!st) return;
  const idx = st.ch.steps.findIndex((x) => st.ch.start + x[0] === st.a);
  const n = st.ch.steps.length;
  panel.querySelector('.kicker').textContent = `${st.ch.title} — ${idx + 1} / ${n}`;
  panel.querySelector('h2').textContent = st.title;
  panel.querySelector('.s').textContent = st.s;
  panel.querySelector('.d').textContent = st.d;
  panel.classList.remove('fresh'); void panel.offsetWidth; panel.classList.add('fresh');
  const gi = steps.indexOf(st);
  prevBtn.disabled = gi <= 0;
  nextBtn.disabled = gi >= steps.length - 1;
}
const prevBtn = panel.querySelector('.prev'), nextBtn = panel.querySelector('.next');
// step navigation: jump to the start of the previous/next explanation (a little in, so it is fully shown)
function stepBy(d) {
  const i = steps.findIndex((s) => cur >= s.a && cur < s.b);
  const ref = i >= 0 ? i : steps.findIndex((s) => s.a > cur) - (d > 0 ? 1 : 0);
  const next = steps[Math.max(0, Math.min(steps.length - 1, ref + d))];
  if (next) jump(next.a + 0.4);
}
prevBtn.onclick = () => stepBy(-1);
nextBtn.onclick = () => stepBy(1);

// ---------- resize ----------
let W = 0, H = 0, shortLandscape = false;
function resize() {
  layout(); // first, so a scrollbar (if any) exists before measuring
  // the visible area (excludes a desktop scrollbar, which the fixed stage doesn't cover)
  W = document.documentElement.clientWidth || innerWidth; H = document.documentElement.clientHeight || innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // Portrait screens: the explanation text covers the bottom, so centre the 3D a little higher.
  const lift = W / H < 1 ? Math.round(H * 0.07) : 0;
  // Short landscape phones: the explanation is a column on the left, so move the 3D right and a bit down.
  shortLandscape = H < 520 && W > H;
  if (lift) camera.setViewOffset(W, H, 0, lift, W, H);
  else if (shortLandscape) camera.setViewOffset(W, H, -Math.round(W * 0.14), -Math.round(H * 0.05), W, H);
  else camera.clearViewOffset();
  for (const m of lineMats) m.resolution.set(W, H);
}
addEventListener('resize', resize);
resize();

// ---------- camera framing for any screen shape ----------
// Every shot is composed for a 16:9 screen. On narrower screens: widen the lens a little (up to ~30%),
// then step the camera back along its line of sight, which keeps the perspective natural.
// On portrait screens the camera measures what's actually on stage and steps back only as far as needed
// to fit it, cropping empty sides instead of shrinking the subject.
const REF_ASPECT = 16 / 9;
const DEG = Math.PI / 180;
const fitBoxes = new Map(); // stage group → { box, age }
const tmpBox = new THREE.Box3(), corner = new THREE.Vector3(), nominal = new THREE.Vector3();
function stageBox(g) {
  let e = fitBoxes.get(g);
  if (e && e.age++ < 30) return e.box; // re-measure twice a second: stacks spread, parts move
  if (!e) fitBoxes.set(g, (e = { box: new THREE.Box3() }));
  e.age = 0;
  e.box.makeEmpty();
  g.updateMatrixWorld(true);
  g.traverseVisible((o) => {
    if (!o.geometry || o.type === 'GridHelper' || o.isSprite) return;
    if (o.isInstancedMesh) { o.computeBoundingBox(); tmpBox.copy(o.boundingBox); }
    else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmpBox.copy(o.geometry.boundingBox); }
    tmpBox.applyMatrix4(o.matrixWorld);
    if (tmpBox.isEmpty() || tmpBox.getSize(corner).length() > 30) return; // skip backdrops and expanding wavefronts
    e.box.union(tmpBox);
  });
  return e.box;
}
function frameCamera() {
  let fov = cam.fov, k = 1;
  const a = camera.aspect;
  const dist = Math.hypot(cam.px - cam.tx, cam.py - cam.ty, cam.pz - cam.tz);
  if (a < REF_ASPECT) {
    const tan0 = Math.tan((fov * DEG) / 2);
    const tanFull = tan0 * Math.pow(REF_ASPECT / a, 0.92); // keeps the whole 16:9 width
    const tanCrop = a < 1 ? tan0 * Math.pow(REF_ASPECT / a, 0.72) : tanFull; // portrait: allow cropping the sides
    const tanUse = Math.min(tanCrop, Math.tan((Math.min(fov * 1.3, 56) * DEG) / 2));
    fov = (2 * Math.atan(tanUse)) / DEG;
    const kFull = tanFull / tanUse, kCrop = tanCrop / tanUse;
    k = kFull;
    if (a < 1) {
      // how far back must the camera go for everything on stage to fit across the screen?
      camera.position.set(cam.px, cam.py, cam.pz);
      camera.lookAt(cam.tx, cam.ty, cam.tz);
      camera.updateMatrixWorld();
      const m = tanUse * a * 0.94;
      let need = -Infinity;
      for (const name in groups) {
        if (name === 'laptop' || !groups[name].visible) continue;
        const b = stageBox(groups[name]);
        if (b.isEmpty()) continue;
        for (let c = 0; c < 8; c++) {
          corner.set(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, c & 4 ? b.max.z : b.min.z).applyMatrix4(camera.matrixWorldInverse);
          need = Math.max(need, Math.abs(corner.x) / m + corner.z); // extra distance so this corner fits
        }
      }
      k = need === -Infinity ? kCrop : Math.min(kFull, Math.max(kCrop, 1 + need / dist));
    }
  }
  if (shortLandscape) k *= 1.12;
  nominal.set(cam.px - cam.tx, cam.py - cam.ty, cam.pz - cam.tz).multiplyScalar(k);
  camera.position.set(cam.tx + nominal.x, cam.ty + nominal.y, cam.tz + nominal.z);
  camera.lookAt(cam.tx, cam.ty, cam.tz);
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// ---------- render loop ----------
const clock = new THREE.Clock();
const readoutEl = $('#readout');
let lastReadout = '', readoutH = 0;
let chapIdx = -1;
let slow = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const now = clock.elapsedTime;

  if (!IDLE) {
    const tgt = target();
    if (Math.abs(tgt - cur) > 20) cur = tgt; // big jumps (scrollbar drag) snap instead of racing through scenes
    else cur += (tgt - cur) * (1 - Math.exp(-dt * 7)); // frame-rate independent easing toward the scroll position
    if (Math.abs(tgt - cur) < 1e-3) cur = tgt;
    if (Math.abs(master.time() - cur) > 1e-4) master.seek(cur);
  }
  const T = master.time();

  readoutOp = 0;
  ctx.laptop.update(now);
  for (const ch of chapters) ch.update?.(now, dt, T);
  for (const k in groups) groups[k].visible = vis[k] > 0.5;

  frameCamera();
  backdrop.position.copy(camera.position);

  renderFrame();
  labels.update(W, H);
  // If this machine can't hold ~50 fps, render at a lower resolution instead of stuttering.
  if (booted && dpr > 1) {
    slow = dt > 0.021 ? slow + 1 : Math.max(0, slow - 2);
    if (slow > 45) { dpr = 1; slow = 0; renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); }
  }
  if (!booted && warmed && frames++ > 4 && (hdriReady || now > 4)) { booted = true; body.classList.add('ready'); }

  readoutEl.style.opacity = readoutOp;
  if (readoutOp > 0 && readoutHTML !== lastReadout) { lastReadout = readoutHTML; readoutEl.innerHTML = readoutHTML; readoutH = readoutEl.offsetHeight; }
  // on phones the readout sits top-right, so right-hand labels start below it
  labels.topRight = readoutOp > 0.05 && W < 900 ? 96 + readoutH + 16 : 0; // 96 = the readout's top on phones (style.css)

  if (!IDLE) {
    body.classList.toggle('scrolled', scrollY > 40);
    updatePanel(T);
    let i = chapters.findIndex((c) => T >= c.start && T < c.end);
    if (i < 0) i = chapters.length - 1;
    const ch = chapters[i];
    if (i !== chapIdx) {
      chapIdx = i;
      navChapters.forEach((c) => c.tab.classList.toggle('on', c === ch));
      // on small screens the tab row scrolls sideways: keep the current topic in view
      const tab = ch.tab || navChapters[navChapters.length - 1].tab;
      if (tabs.scrollWidth > tabs.clientWidth) tabs.scrollTo({ left: tab.offsetLeft - (tabs.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' });
    }
    updateOutline(ch, T);
  }
  requestAnimationFrame(frame);
}

// Compile every shader and upload every texture up front (behind the loader), so no scene
// stutters the first time it appears. Hidden objects are briefly made visible for this.
let warmed = false;
{
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const textures = new Set();
  scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) for (const k in m) if (m[k] && m[k].isTexture) textures.add(m[k]);
  });
  textures.forEach((t) => renderer.initTexture(t));
  renderer.compileAsync(scene, camera).catch(() => {}).finally(() => {
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera); // also builds the shadow-pass shaders
    for (const o of hidden) o.visible = false;
    warmed = true;
  });
}

if (IDLE) {
  // Portfolio-card mode: the hero loops on its own (assemble → open → explode → spin → reassemble).
  body.classList.add('idle');
  vis.laptop = 1;
  Object.assign(cam, { px: IDLE_VIEW.p[0], py: IDLE_VIEW.p[1], pz: IDLE_VIEW.p[2], tx: IDLE_VIEW.t[0], ty: IDLE_VIEW.t[1], tz: IDLE_VIEW.t[2] });
  idleLoop(ctx);
} else {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const startAt = Number(new URLSearchParams(location.search).get('t'));
  cur = T_MIN;
  master.seek(T_MIN);
  if (startAt) jump(startAt);
}
frame();
