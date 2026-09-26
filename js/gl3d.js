/* Still — the 3D layer. One Three.js renderer with bloom, screen-blended over the sky, hosting:
   · GPU weather: crystal snowflakes with depth of field, wind-driven rain sheets (all positions are pure
     functions of time in the vertex shaders, so thousands of particles cost the CPU nothing)
   · the Orbit face: a Keplerian galaxy with the clock's rings inside it and the real sky on a 24 h dial
   · the Swarm face: volumetric digits that swoop between times, and a murmuration that follows you
   If this module fails to load, faces.js falls back to the 2D faces and sky.js paints the weather. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TAU = Math.PI * 2, R = Math.random;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

let W = innerWidth, H = innerHeight, lost = false, shown = false;
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; canvas.classList.remove('on'); });
canvas.addEventListener('webglcontextrestored', () => location.reload());

const wxScene = new THREE.Scene(), faceScene = new THREE.Scene();
const wxCam = new THREE.PerspectiveCamera(72, W / H, 0.1, 400);
const faceCam = new THREE.PerspectiveCamera(35, W / H, 0.1, 600);
faceCam.position.set(0, 0, 40);
const VH = 2 * 40 * Math.tan(17.5 * Math.PI / 180); /* world height visible at z = 0 */

const composer = new EffectComposer(renderer);
const wxPass = new RenderPass(wxScene, wxCam);
const facePass = new RenderPass(faceScene, faceCam);
facePass.clear = false; facePass.clearDepth = true;
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.95, 0.6, 0.22);
composer.addPass(wxPass); composer.addPass(facePass); composer.addPass(bloom); composer.addPass(new OutputPass());

/* ---------- quality: resolution and effects follow QUALITY.tier (main.js steps it) ---------- */
let pr = 1;
function applyQuality() {
  const t = LITE() ? 3 : QUALITY.tier, dpr = devicePixelRatio || 1;
  pr = [Math.min(dpr, 1.5), Math.min(dpr, 1), 0.8, 0.66][t];
  bloom.enabled = !LITE();
  bloom.strength = [0.95, 0.9, 0.8, 0.7][t];
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  resize();
}
function resize() {
  W = innerWidth; H = innerHeight;
  if (!W || !H) return;
  renderer.setSize(W, H, false); composer.setSize(W, H);
  wxCam.aspect = faceCam.aspect = W / H;
  wxCam.updateProjectionMatrix(); faceCam.updateProjectionMatrix();
}
QUALITY.on(applyQuality);
Store.on(k => { if (k === 'lite') applyQuality(); });
const pScale = () => LITE() ? 0.3 : [1, 0.75, 0.5, 0.35][QUALITY.tier];

/* ---------- shared bits ---------- */
const clock0 = performance.now();
const secs = now => (now - clock0) / 1000;
let T = 0;
const col = h => new THREE.Color(h);
let palKey = '', PC = null;
function palColors() {
  const p = pal(), k = p.a + p.b + p.c + p.t1 + p.t2 + p.glow;
  if (k !== palKey) { palKey = k; PC = { a: col(p.a), b: col(p.b), c: col(p.c), t1: col(p.t1), t2: col(p.t2), glow: col(p.glow) }; }
  return PC;
}
const mouse = { nx: 0, ny: 0, x: -1e4, y: -1e4, last: -1e9 };
addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; [mouse.nx, mouse.ny] = normPointer(e.clientX, e.clientY); mouse.last = performance.now(); });
const wave = { t0: -99, amp: 0 };
function pulse(strength = 1) { wave.t0 = T; wave.amp = strength; }
const toScreen = v => { const p = v.clone().project(faceCam); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }; };
const pxScale = () => H * pr / (2 * Math.tan(17.5 * Math.PI / 180));
const ease3 = x => 1 - Math.pow(1 - x, 3);

function sprite(size, draw) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dispose(obj) {
  obj.traverse(o => {
    o.geometry && o.geometry.dispose();
    if (o.material) [].concat(o.material).forEach(m => { for (const k in m.uniforms || {}) { const v = m.uniforms[k].value; v && v.isTexture && v.dispose(); } m.map && m.map.dispose(); m.dispose(); });
  });
}
const ADD = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

/* =====================================================================================
   WEATHER — camera-space particles: each lives in a normalised frustum slab at its own depth,
   so the whole field always covers the screen and turns with the sky camera for free
   ===================================================================================== */
const WX_VS_COMMON = `
uniform float uTime, uTanV, uTanH, uYaw, uPitch, uWindX, uWindAbs, uGust;
uniform vec2 uRes;
vec2 slab(vec4 seed, float d, float dx, float dy) {
  float spanX = 2.6 * uTanH, spanY = 2.6 * uTanV;
  float sx = fract(seed.x + dx / (spanX * d) - uYaw / spanX) * spanX - spanX * .5;
  float sy = fract(seed.y + dy / (spanY * d) - uPitch / spanY) * spanY - spanY * .5;
  return vec2(sx, sy) * d;
}`;

const quad = (across = [-1, 1], along = [0, 1]) => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([across[0], along[0], 0, across[1], along[0], 0, across[0], along[1], 0, across[1], along[1], 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
};
function seeds(n, k = 4) { const a = new Float32Array(n * k); for (let i = 0; i < a.length; i++) a[i] = R(); return new THREE.InstancedBufferAttribute(a, k); }

const wxU = {
  uTime: { value: 0 }, uTanV: { value: Math.tan(36 * Math.PI / 180) }, uTanH: { value: 1 }, uYaw: { value: 0 }, uPitch: { value: 0 },
  uWindX: { value: 0 }, uWindAbs: { value: 0 }, uGust: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
  uLight: { value: new THREE.Color(0.5, 0.6, 0.8) }, uAmb: { value: new THREE.Color(0.2, 0.25, 0.35) }, uFlash: { value: 0 }, uDark: { value: 1 },
  uSnowSize: { value: 1 },
};

/* ---- snow: crystals up close, bokeh right at the lens, fine powder far away ---- */
const SNOW_MAX = 16000;
const snowGeo = quad([-1, 1], [-1, 1]);
snowGeo.setAttribute('aSeed', seeds(SNOW_MAX)); snowGeo.setAttribute('aSeed2', seeds(SNOW_MAX));
snowGeo.instanceCount = 0;
const snowMat = new THREE.ShaderMaterial({
  ...ADD, side: THREE.DoubleSide, uniforms: wxU,
  vertexShader: WX_VS_COMMON + `
uniform vec3 uLight, uAmb; uniform float uFlash, uDark, uSnowSize;
attribute vec4 aSeed, aSeed2;
varying vec2 vUv; varying float vA, vDetail, vCoc, vSpark; varying vec3 vCol;
void main() {
  float d = aSeed2.w > .993 ? mix(.5, 1.7, aSeed.z) : mix(2.2, 36., pow(aSeed.z, 1.2));
  float t = uTime;
  float fall = (.5 + aSeed.w * .7) * (1. + uWindAbs * .5);
  float gust = 1. + uGust * (.7 * sin(t * .55 + d * .13 + aSeed.x) + .4 * sin(t * 1.9 + aSeed.y * 6.));
  float wx = uWindX * gust;
  vec2 fl = vec2(sin(t * (.5 + aSeed2.x) + aSeed2.y * 40.), cos(t * (.4 + aSeed2.z) + aSeed2.w * 30.)) * (.2 + .4 * aSeed2.x);
  /* eddies: flakes curl around in gusts rather than just sliding sideways */
  fl += uGust * .6 * vec2(sin(aSeed.y * 9. + t * 1.3), cos(aSeed.x * 7. + t * 1.1));
  vec2 xy = slab(aSeed, d, wx * t + fl.x, -fall * t + fl.y);
  vec4 clip = projectionMatrix * vec4(xy, -d, 1.);
  float size = (.012 + aSeed2.y * .026) * uSnowSize;
  float px = size / d * uRes.y / (2. * uTanV);
  float blur = max(0., 1.8 - d) * 40.;
  float span = max(1.2, px * 1.3 + blur);
  /* fast flakes (blizzard) streak along their motion; slow ones tumble */
  /* motion blur: how far the flake moves in one frame, in pixels, against its own size */
  vec2 vel = vec2(wx, -fall) / d;
  float sp = length(vel) * uRes.y / (2. * uTanV) / 60.;
  float stretch = 1. + clamp((sp - 1.5) / max(px, 2.), 0., 5.) * (1. - clamp(blur / 20., 0., 1.));
  float ang = stretch > 1.2 ? atan(vel.y, vel.x) : t * (.3 + aSeed2.z * 1.4) * (aSeed2.x > .5 ? 1. : -1.) + aSeed2.w * 6.;
  vec2 c2 = vec2(position.x * stretch, position.y);
  float ca = cos(ang), sa = sin(ang);
  vec2 off = vec2(ca * c2.x - sa * c2.y, sa * c2.x + ca * c2.y) * span;
  clip.xy += off / uRes * clip.w;
  gl_Position = clip;
  vUv = position.xy;
  vDetail = smoothstep(5., 14., px) * (stretch > 1.2 ? 0. : 1.);
  vCoc = clamp(blur / (blur + px + .001), 0., 1.);
  vDetail *= smoothstep(.3, .0, vCoc);
  vSpark = pow(max(0., sin(t * (1.4 + aSeed2.z * 3.) + aSeed.w * 90.)), 36.) * (1. - vCoc);
  float lit = .42 + .58 * (1. - uDark);
  vCol = mix(vec3(.82, .88, 1.), uLight * 1.4 + uAmb * .6, .35) * lit + uFlash * 1.5;
  vA = mix(.85, .13, vCoc) * smoothstep(36., 18., d) * mix(1., .6, smoothstep(1., 5., stretch)) * mix(.55, 1., smoothstep(14., 3., d));
}`,
  fragmentShader: `
varying vec2 vUv; varying float vA, vDetail, vCoc, vSpark; varying vec3 vCol;
float crystal(vec2 p) {
  float r = length(p), a = atan(p.y, p.x);
  float s = 1.0471976, aa = mod(a + s * .5, s) - s * .5;
  vec2 q = vec2(cos(aa), abs(sin(aa))) * r;
  float arm = smoothstep(.09, .0, q.y) * step(q.x, .92);
  float br = 0.;
  for (int k = 0; k < 3; k++) {
    float bx = .28 + .2 * float(k), bl = .3 - .07 * float(k);
    vec2 b = q - vec2(bx, 0.);
    float al = dot(b, vec2(.5, .866)), ac = abs(dot(b, vec2(-.866, .5)));
    br = max(br, smoothstep(.06, .0, ac) * step(0., al) * step(al, bl));
  }
  float hex = smoothstep(.05, .0, abs(q.x - .16)) * step(q.y, .1);
  return max(max(arm, br), max(hex, smoothstep(.14, .0, r)));
}
void main() {
  float r = length(vUv);
  if (r > 1.) discard;
  float soft = exp(-r * r * 5.);
  float cry = crystal(vUv * 1.05);
  float shape = mix(soft, max(cry, exp(-r * r * 30.)), vDetail);
  float bokeh = smoothstep(1., .86, r) * (.45 + .55 * smoothstep(.5, .96, r));
  shape = mix(shape, bokeh * .4, vCoc);
  gl_FragColor = vec4(vCol * shape * vA * (1. + vSpark * 4.), 1.);
}`,
});
const snow = new THREE.Mesh(snowGeo, snowMat); snow.frustumCulled = false; wxScene.add(snow);

/* ---- rain: motion-blurred streaks, drifting in sheets with the wind ---- */
const RAIN_MAX = 15000;
const rainGeo = quad([-1, 1], [0, 1]);
rainGeo.setAttribute('aSeed', seeds(RAIN_MAX)); rainGeo.instanceCount = 0;
const rainMat = new THREE.ShaderMaterial({
  ...ADD, side: THREE.DoubleSide, uniforms: wxU, /* the streak runs tail to head, which flips its winding */
  vertexShader: WX_VS_COMMON + `
uniform vec3 uLight, uAmb; uniform float uFlash, uDark;
attribute vec4 aSeed;
varying float vA, vAlong, vAcross; varying vec3 vCol;
void main() {
  float d = mix(1.1, 48., pow(aSeed.z, 1.25));
  float fall = 15. + aSeed.w * 8.;
  float gust = 1. + uGust * .7 * sin(uTime * .8 + d * .09 + aSeed.x * 2.);
  float wx = uWindX * 1.5 * gust;
  vec2 xy = slab(aSeed, d, wx * uTime, -fall * uTime);
  vec3 head = vec3(xy, -d), tail = head - vec3(wx, -fall, 0.) * .05;
  vec4 ch = projectionMatrix * vec4(head, 1.), ct = projectionMatrix * vec4(tail, 1.);
  vec2 nh = ch.xy / ch.w, nt = ct.xy / ct.w;
  vec2 dir = (nh - nt) * uRes; float len = length(dir);
  dir = len > .001 ? dir / len : vec2(0., 1.);
  vec2 perp = vec2(-dir.y, dir.x);
  float w = max(1.1, .035 / d * uRes.y / (2. * uTanV));
  vec2 n = mix(nt, nh, position.y) + perp * position.x * w / uRes;
  gl_Position = vec4(n, 0., 1.);
  /* sheets: the density swells and fades in bands that sweep across with the wind */
  float s1 = sin(head.x * .11 + uTime * (.8 + uWindAbs * 1.5)), s2 = sin(head.x * .045 - uTime * .33 + 1.3);
  float sheet = .4 + 1.1 * smoothstep(-.2, .9, s1 * s2 + .25 * sin(uTime * .21));
  vA = sheet * (.1 + .42 * exp(-d * .045)) * smoothstep(1.1, 2.6, d) / (1. + max(0., w - 3.) * .3);
  vAlong = position.y; vAcross = position.x;
  float lit = .5 + .5 * (1. - uDark);
  vCol = (vec3(.7, .78, .92) * lit + uLight * .45 + uAmb * .35) + uFlash * 2.;
}`,
  fragmentShader: `
varying float vA, vAlong, vAcross; varying vec3 vCol;
void main() {
  float a = vA * (1. - abs(vAcross)) * smoothstep(0., .6, vAlong) * (.6 + .4 * vAlong);
  gl_FragColor = vec4(vCol * a, 1.);
}`,
});
const rain = new THREE.Mesh(rainGeo, rainMat); rain.frustumCulled = false; wxScene.add(rain);

let snowAmt = 0, rainAmt = 0;
function weatherFrame() {
  const s = window.Sky && Sky.state;
  if (!s || !s.ready) { snowGeo.instanceCount = rainGeo.instanceCount = 0; return false; }
  const U = wxU;
  U.uTime.value = T;
  U.uTanH.value = U.uTanV.value * W / H;
  U.uYaw.value = s.yaw; U.uPitch.value = s.pitch;
  const to = (s.wdir + 180) * Math.PI / 180, right = s.yaw + Math.PI / 2;
  const windMs = s.wind * 7;
  U.uWindX.value = windMs * Math.cos(to - right);
  U.uWindAbs.value = s.wind; U.uGust.value = s.gust;
  U.uRes.value.set(W * pr, H * pr);
  U.uLight.value.setRGB(s.light[0], s.light[1], s.light[2]);
  U.uAmb.value.setRGB(s.hor[0], s.hor[1], s.hor[2]);
  U.uFlash.value = s.flash; U.uDark.value = s.dark;
  const blizz = s.snow > 0.9 && s.wind > 0.7;
  U.uSnowSize.value = blizz ? 0.75 : 1;
  snowAmt = s.snow; rainAmt = s.rain;
  snowGeo.instanceCount = Math.round(Math.min(1, s.snow * (blizz ? 1 : 0.8)) * SNOW_MAX * pScale());
  rainGeo.instanceCount = Math.round(Math.min(1, s.rain) * RAIN_MAX * pScale());
  return snowGeo.instanceCount + rainGeo.instanceCount > 0;
}

/* =====================================================================================
   FACE HELPERS
   ===================================================================================== */
const faces = new Set();
function base(face) {
  face.fade = { value: 0 }; face.fadeT = 1;
  face.group = new THREE.Group(); faceScene.add(face.group);
  faces.add(face);
  face.leave = () => { face.fadeT = 0; };
  face.unmount = () => { faces.delete(face); faceScene.remove(face.group); dispose(face.group); face.root && face.root.classList.remove('gl-face'); };
  return face;
}
function stepFade(face, dt) { face.fade.value += (face.fadeT - face.fade.value) * Math.min(1, dt / (face.fadeT ? 700 : 220)); }

/* an arc of light around the disc centre: faint track, filled progress, and a comet head with a tail */
const ARC_VS = `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const ARC_FS = `
uniform float uR, uW, uHead, uTail, uFill, uSegs, uBase, uFillA, uHeadA, uGlow, uFade;
uniform vec3 uCA, uCB, uCH;
varying vec2 vP;
const float TAU = 6.2831853;
void main() {
  float r = length(vP), th = atan(vP.x, vP.y);
  if (th < 0.) th += TAU;
  float x = (r - uR) / uW, prof = exp(-x * x * 3.), core = exp(-x * x * 16.);
  float seg = 1.;
  if (uSegs > 0.) { float f = fract(th / TAU * uSegs); seg = smoothstep(0., .025, f) * smoothstep(1., .975, f); }
  vec3 c = mix(uCA, uCB, .5) * uBase * prof;
  c += mix(uCA, uCB, th / TAU) * step(th, uFill) * uFillA * (prof * .6 + core);
  float dh = mod(uHead - th, TAU);
  float tail = uTail > 0. ? pow(max(0., 1. - dh / uTail), 2.4) : 0.;
  c += uCH * tail * (core * 1.8 + prof * .35) * uHeadA;
  gl_FragColor = vec4(c * seg * (1. + uGlow) * uFade, 1.);
}`;
function arc(face, r, w, o = {}) {
  const mat = new THREE.ShaderMaterial({
    ...ADD, side: THREE.DoubleSide, vertexShader: ARC_VS, fragmentShader: ARC_FS,
    uniforms: {
      uR: { value: r }, uW: { value: w }, uHead: { value: 0 }, uTail: { value: o.tail || 0 }, uFill: { value: 0 }, uSegs: { value: o.segs || 0 },
      uBase: { value: o.base ?? 0.05 }, uFillA: { value: o.fillA ?? 0 }, uHeadA: { value: o.headA ?? 1 }, uGlow: { value: 0 }, uFade: face.fade,
      uCA: { value: new THREE.Color() }, uCB: { value: new THREE.Color() }, uCH: { value: new THREE.Color() },
    },
  });
  return new THREE.Mesh(new THREE.RingGeometry(r - w * 1.6, r + w * 1.6, 320, 1), mat);
}
const glowMat = (face, color) => new THREE.MeshBasicMaterial({ ...ADD, color, toneMapped: false, opacity: 1 });

/* the time, drawn into a texture so it lives in the scene and blooms with it */
function timeLabel(face, w = 1024, h = 360) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ ...ADD, map: tex, toneMapped: false, depthTest: false });
  mat.color.setScalar(1.45);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, h / w), mat);
  mesh.renderOrder = 10;
  let last = '';
  mesh.draw = (main, sub) => {
    const key = main + '|' + sub + '|' + palKey;
    if (key === last) return; last = key;
    const g = c.getContext('2d'), p = pal();
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = h * (sub ? 0.56 : 0.66), y = h * (sub ? 0.4 : 0.5);
    g.font = `200 ${fs}px Outfit, "Segoe UI Variable Display", "Segoe UI", sans-serif`;
    const gr = g.createLinearGradient(0, y - fs / 2, 0, y + fs / 2);
    gr.addColorStop(0, p.t1); gr.addColorStop(1, p.t2);
    /* three passes: a wide bloom, a tight halo, then the crisp glyphs on top */
    g.fillStyle = gr; g.shadowColor = p.glow;
    g.globalAlpha = 0.55; g.shadowBlur = fs * 0.34; g.fillText(main, w / 2, y);
    g.globalAlpha = 0.9; g.shadowBlur = fs * 0.11; g.fillText(main, w / 2, y);
    g.globalAlpha = 1; g.shadowBlur = 0; g.fillText(main, w / 2, y);
    if (sub) { g.font = `300 ${h * 0.14}px "JetBrains Mono", Consolas, monospace`; g.fillStyle = p.t2; g.globalAlpha = 0.8; g.fillText(sub, w / 2, h * 0.82); g.globalAlpha = 1; }
    tex.needsUpdate = true;
  };
  return mesh;
}

/* =====================================================================================
   ORBIT — a galaxy clock: the hours, minutes and seconds ride rings inside a Keplerian disc
   whose spiral arms are a density wave; around it a 24 h dial carries the real sun, the moon
   with its true phase, and the planets, all at their real hour angles over Richmond Hill
   ===================================================================================== */
function moonTexture() {
  const t = new THREE.CanvasTexture(MoonMap.equirect); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const qMoonFace = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), qTmp = new THREE.Quaternion();

function Orbit(opts = {}) {
  const F = base({ name: 'orbit' }), withLabel = opts.label !== false;
  /* disc: tilted plane, unscaled (the galaxy shaders scale by uR); unit: everything measured in hour-ring radii */
  const g = F.group, disc = new THREE.Group(), unit = new THREE.Group(); g.add(disc); disc.add(unit);
  let Rw = 7, born = T, lastMin = -1;

  /* ---- the galaxy ---- */
  const N = Math.round(90000 * pScale());
  const aR = new Float32Array(N), aA = new Float32Array(N), aH = new Float32Array(N), aK = new Float32Array(N), aS = new Float32Array(N * 4);
  const gauss = () => (R() + R() + R() + R() - 2) / 2;
  const RINGS = [0.64, 0.8, 1, 1.32];
  for (let i = 0; i < N; i++) {
    const u = R();
    let r, h, k;
    if (u < 0.62) { r = 0.42 + Math.pow(R(), 0.85) * 4.4; h = gauss() * 0.025 * r; k = 0; }
    else if (u < 0.86) { r = RINGS[(R() * 4) | 0] + gauss() * 0.018; h = gauss() * 0.006; k = 1; }
    else { r = 0.5 + Math.pow(R(), 1.4) * 0.3; h = gauss() * 0.02; k = 2; }
    aR[i] = r; aA[i] = R() * TAU; aH[i] = h; aK[i] = k;
    for (let j = 0; j < 4; j++) aS[i * 4 + j] = R();
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  gg.setAttribute('aR', new THREE.BufferAttribute(aR, 1)); gg.setAttribute('aA', new THREE.BufferAttribute(aA, 1));
  gg.setAttribute('aH', new THREE.BufferAttribute(aH, 1)); gg.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
  gg.setAttribute('aSeed', new THREE.BufferAttribute(aS, 4));
  const GU = {
    uTime: { value: 0 }, uR: { value: 7 }, uSpin: { value: 0.05 }, uPattern: { value: 0.012 }, uExpand: { value: 0 }, uBreath: { value: 0 },
    uWave: { value: 9 }, uWaveAmp: { value: 0 }, uPx: { value: 800 }, uFade: F.fade,
    uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() }, uC4: { value: new THREE.Color() },
  };
  const galaxy = new THREE.Points(gg, new THREE.ShaderMaterial({
    ...ADD, uniforms: GU,
    vertexShader: `
uniform float uTime, uR, uSpin, uPattern, uExpand, uBreath, uWave, uWaveAmp, uPx;
uniform vec3 uC0, uC1, uC2, uC3, uC4;
attribute float aR, aA, aH, aK; attribute vec4 aSeed;
varying vec3 vCol; varying float vA;
void main() {
  float e = clamp(uExpand * 1.3 - aSeed.x * .3, 0., 1.); e = 1. - pow(1. - e, 3.);
  float rr = aR * (.08 + .92 * e) * (1. - uBreath * .18 * exp(-aR * .6));
  float ang = aA + uTime * uSpin * pow(max(aR, .22), -1.5) + (1. - e) * 5.;
  float wd = aR - uWave * 1.25;
  float wv = exp(-wd * wd * 14.) * uWaveAmp;
  vec3 p = vec3(sin(ang) * rr, cos(ang) * rr, aH + wv * .06 * sin(ang * 3. + aR * 5.)) * uR;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float arm = .5 + .5 * cos(2. * (ang - uTime * uPattern) - 4.4 * log(max(aR, .2)));
  arm = aK < .5 ? .18 + 1.25 * pow(arm, 2.6) : (aK < 1.5 ? .85 : 1.3);
  float tr = clamp((aR - .25) / 4.3, 0., 1.);
  vec3 c = mix(uC0, uC1, smoothstep(0., .07, tr));
  c = mix(c, uC2, smoothstep(.05, .3, tr));
  c = mix(c, uC3, smoothstep(.28, .62, tr));
  c = mix(c, uC4, smoothstep(.55, 1., tr) * (.4 + .6 * aSeed.y));
  float tw = .7 + .3 * sin(uTime * (.8 + aSeed.z * 2.5) + aSeed.w * 40.);
  vCol = c * arm * tw * (1. + wv * 3.) * (aK > 1.5 ? 1.1 : 1.);
  vA = e * (1. - smoothstep(3.9, 4.8, aR)) * smoothstep(.42, .72, rr);
  gl_PointSize = clamp((.018 + aSeed.w * .05) * uR * .14 * uPx / -mv.z * (1. + wv * .8), 1., 22.);
}`,
    fragmentShader: `
uniform float uFade; varying vec3 vCol; varying float vA;
void main() { vec2 d = gl_PointCoord - .5; float a = exp(-dot(d, d) * 20.); gl_FragColor = vec4(vCol * a * vA * uFade * .8, 1.); }`,
  }));
  galaxy.frustumCulled = false; disc.add(galaxy);

  /* ---- nebula glow drifting in the arms ---- */
  const NB = 70, nbPos = new Float32Array(NB * 3), nbS = new Float32Array(NB * 4);
  for (let i = 0; i < NB; i++) {
    const r = 0.9 + R() * 3.4, a = R() * TAU;
    nbPos.set([Math.sin(a) * r, Math.cos(a) * r, (R() - 0.5) * 0.1], i * 3);
    for (let j = 0; j < 4; j++) nbS[i * 4 + j] = R();
  }
  const nbg = new THREE.BufferGeometry();
  nbg.setAttribute('position', new THREE.BufferAttribute(nbPos, 3)); nbg.setAttribute('aSeed', new THREE.BufferAttribute(nbS, 4));
  const nebula = new THREE.Points(nbg, new THREE.ShaderMaterial({
    ...ADD, uniforms: GU,
    vertexShader: `
uniform float uTime, uR, uSpin, uExpand, uPx; uniform vec3 uC2, uC3, uC4;
attribute vec4 aSeed; varying vec3 vCol;
void main() {
  float r = length(position.xy), a = atan(position.x, position.y) + uTime * uSpin * .35 * pow(r, -1.5);
  float e = 1. - pow(1. - clamp(uExpand, 0., 1.), 3.);
  vec3 p = vec3(sin(a) * r, cos(a) * r, position.z) * uR * e;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  vCol = mix(mix(uC2, uC3, aSeed.x), uC4, aSeed.y * aSeed.y) * (.5 + .5 * sin(uTime * .2 + aSeed.z * 9.));
  gl_PointSize = clamp((.5 + aSeed.w * 1.1) * uR * uPx / -mv.z, 8., 380.);
}`,
    fragmentShader: `
uniform float uFade; varying vec3 vCol;
void main() { vec2 d = gl_PointCoord - .5; float r2 = dot(d, d); float a = exp(-r2 * 10.) * smoothstep(.25, .12, r2); gl_FragColor = vec4(vCol * a * .06 * uFade, 1.); }`,
  }));
  nebula.frustumCulled = false; disc.add(nebula);

  /* ---- the clock rings ---- */
  const hourArc = arc(F, 1, 0.022, { segs: 12, base: 0.1, fillA: 0.9, tail: 0.9, headA: 1.2 });
  const minArc = arc(F, 0.8, 0.012, { base: 0.06, tail: 1.5, headA: 1.4 });
  const secArc = arc(F, 0.64, 0.008, { base: 0.05, tail: 2.2, headA: 1.2 });
  const sats = [0, 1, 2].map(() => arc(F, 0.64, 0.007, { base: 0, tail: 0.7, headA: 1 }));
  [hourArc, minArc, secArc, ...sats].forEach(m => unit.add(m));
  /* 60 minute ticks */
  const ticks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ ...ADD, toneMapped: false }), 60);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * TAU, five = i % 5 === 0, l = five ? 0.07 : 0.035;
    dummy.position.set(Math.sin(a) * (0.745 - l / 2), Math.cos(a) * (0.745 - l / 2), 0);
    dummy.rotation.set(0, 0, -a); dummy.scale.set(five ? 0.009 : 0.005, l, 1); dummy.updateMatrix();
    ticks.setMatrixAt(i, dummy.matrix); ticks.setColorAt(i, new THREE.Color(0, 0, 0));
  }
  unit.add(ticks);
  /* the hour world, with a ring and a moonlet; the minute star */
  const planetMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color() }, uLight: { value: new THREE.Vector3() }, uFade: F.fade },
    vertexShader: `varying vec3 vN, vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); vV = mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uCol, uLight; uniform float uFade; varying vec3 vN, vV;
void main() { vec3 N = normalize(vN), L = normalize(uLight - vV), V = normalize(-vV);
  float d = max(dot(N, L), 0.), fr = pow(1. - max(dot(N, V), 0.), 2.2);
  vec3 c = uCol * (.05 + d * 1.5) + uCol * fr * 2.2 * (.3 + d);
  gl_FragColor = vec4(c * uFade, 1.); }`,
    ...ADD,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(0.05, 32, 16), planetMat);
  const pRing = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.11, 64), glowMat(F, new THREE.Color()));
  pRing.rotation.x = 1.2; planet.add(pRing);
  const moonlet = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), glowMat(F, new THREE.Color()));
  planet.add(moonlet);
  const minStar = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 8), glowMat(F, new THREE.Color()));
  unit.add(planet, minStar);

  /* ---- elliptical orbits with Kepler bodies ---- */
  const ORB = [[1.7, 0.1, 0.16, 0.3], [2.25, 0.22, -0.3, 2.1], [2.9, 0.13, 0.42, 4.2], [3.7, 0.3, -0.2, 5.4]].map(([a, e, inc, node], i) => {
    const n = 256, pos = new Float32Array(n * 3), am = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const E = k / n * TAU;
      pos.set([a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), 0], k * 3);
      am[k] = E - e * Math.sin(E);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aM', new THREE.BufferAttribute(am, 1));
    const mat = new THREE.ShaderMaterial({
      ...ADD, uniforms: { uM: { value: 0 }, uTail: { value: 1.6 }, uCol: { value: new THREE.Color() }, uFade: F.fade, uExpand: GU.uExpand },
      vertexShader: `attribute float aM; uniform float uM, uTail, uExpand; varying float vA;
void main() { float dm = mod(uM - aM, 6.2831853); vA = .06 + 1.5 * pow(max(0., 1. - dm / uTail), 2.5);
  float e = 1. - pow(1. - clamp(uExpand * 1.2 - .2, 0., 1.), 3.);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position * e, 1.); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uFade; varying float vA; void main() { gl_FragColor = vec4(uCol * vA * uFade, 1.); }`,
    });
    const line = new THREE.LineLoop(geo, mat);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.026 + i * 0.006, 16, 8), glowMat(F, new THREE.Color()));
    const pivot = new THREE.Group(), tilt = new THREE.Group();
    pivot.rotation.z = node; tilt.rotation.x = inc; pivot.add(tilt); tilt.add(line, body); unit.add(pivot);
    return { a, e, n: 0.9 / Math.pow(a, 1.5), M0: R() * TAU, mat, body, line };
  });

  /* ---- the real sky dial ---- */
  const DIAL = 1.36;
  const dialMat = new THREE.ShaderMaterial({
    ...ADD, side: THREE.DoubleSide,
    uniforms: { uR: { value: DIAL }, uW: { value: 0.05 }, uSunH0: { value: 1.6 }, uMoonH0: { value: 1.6 }, uFade: F.fade, uDay: { value: new THREE.Color() }, uNight: { value: new THREE.Color() }, uMoonC: { value: new THREE.Color(0.75, 0.8, 1) } },
    vertexShader: ARC_VS,
    fragmentShader: `
uniform float uR, uW, uSunH0, uMoonH0, uFade; uniform vec3 uDay, uNight, uMoonC; varying vec2 vP;
void main() {
  float r = length(vP), th = atan(vP.x, vP.y);
  float x = (r - uR) / uW, band = exp(-x * x * 3.5);
  float day = smoothstep(.015, -.015, abs(th) - uSunH0);
  vec3 c = mix(uNight * .5, uDay * .9, day) * band * .5;
  c += uDay * smoothstep(.05, 0., abs(abs(th) - uSunH0)) * band * 2.2;
  float mr = (r - (uR - uW * 1.15)) / (uW * .16);
  c += uMoonC * smoothstep(.015, -.015, abs(th) - uMoonH0) * exp(-mr * mr) * .8;
  float f = fract(th / 6.2831853 * 24. + 1.), dt = min(f, 1. - f);
  float q = fract(th / 6.2831853 * 4. + 1.), major = step(min(q, 1. - q), .006);
  float outer = smoothstep(uR + uW * .1, uR + uW * .6, r) * smoothstep(uR + uW * 1.6, uR + uW * 1.1, r);
  c += vec3(.8, .85, 1.) * smoothstep(.022, .0, dt) * outer * (.35 + major * 1.4);
  gl_FragColor = vec4(c * uFade, 1.);
}`,
  });
  const dial = new THREE.Mesh(new THREE.RingGeometry(DIAL - 0.09, DIAL + 0.09, 360, 1), dialMat);
  unit.add(dial);
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 12), glowMat(F, new THREE.Color(3.2, 2.3, 1.2)));
  const moonTex = moonTexture();
  const moonMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: moonTex }, uL: { value: new THREE.Vector3(0, 0, 1) }, uFade: F.fade },
    vertexShader: `varying vec3 vN; varying vec2 vUv; void main() { vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uL; uniform float uFade; varying vec3 vN; varying vec2 vUv;
void main() { float l = dot(normalize(vN), normalize(uL));
  float lit = smoothstep(-.04, .1, l) * (.35 + .65 * max(l, 0.));
  vec3 t = texture2D(uMap, vUv).rgb;
  gl_FragColor = vec4(t * (lit * .85 + .03) * uFade, 1.); }`,
    ...ADD,
  });
  const moonBall = new THREE.Mesh(new THREE.SphereGeometry(0.1, 64, 32), moonMat);
  unit.add(sunBall, moonBall);
  const PLN = 5, plPos = new Float32Array(PLN * 3), plCol = new Float32Array(PLN * 3);
  const plGeo = new THREE.BufferGeometry();
  plGeo.setAttribute('position', new THREE.BufferAttribute(plPos, 3)); plGeo.setAttribute('color', new THREE.BufferAttribute(plCol, 3));
  const planetsDots = new THREE.Points(plGeo, new THREE.ShaderMaterial({
    ...ADD, vertexColors: true, uniforms: { uFade: F.fade, uPx: GU.uPx, uR: GU.uR },
    vertexShader: `uniform float uPx, uR; varying vec3 vC; void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(.03 * uR * uPx / -mv.z, 3., 14.); }`,
    fragmentShader: `uniform float uFade; varying vec3 vC; void main() { vec2 d = gl_PointCoord - .5; float a = exp(-dot(d, d) * 14.); gl_FragColor = vec4(vC * a * 2. * uFade, 1.); }`,
  }));
  planetsDots.frustumCulled = false; unit.add(planetsDots);

  /* numerals lying in the disc */
  const nums = [['12', 0], ['3', 1], ['6', 2], ['9', 3]].map(([n, q]) => {
    const tex = sprite(128, (c, s) => { c.font = `300 ${s * 0.46}px "JetBrains Mono", Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(n, s / 2, s / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), new THREE.MeshBasicMaterial({ ...ADD, map: tex, toneMapped: false }));
    const a = q * Math.PI / 2; m.position.set(Math.sin(a) * 1.13, Math.cos(a) * 1.13, 0);
    unit.add(m); return m;
  });

  /* ---- the gyroscope around the time: a photon ring, three arcs turning one way, a tick bezel the other ---- */
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    ...ADD, uniforms: { uTime: GU.uTime, uFade: F.fade, uC: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uGlow: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uTime, uFade, uGlow; uniform vec3 uC, uC2; varying vec2 vUv;
const float TAU = 6.2831853;
void main() { float r = length(vUv), a = atan(vUv.y, vUv.x);
  vec3 base = mix(uC, uC2, .5 + .5 * sin(a + uTime * .2));
  float fl = .8 + .2 * sin(a * 3. + uTime * .9) * sin(a * 5. - uTime * 1.3);
  float ring = exp(-pow((r - .8) * 46., 2.)) * fl * 1.25 + exp(-pow((r - .8) * 8., 2.)) * .16;
  float a1 = mod(a - uTime * .22, TAU / 3.);
  float arcs = smoothstep(0., .03, a1) * smoothstep(1.45, 1.4, a1) * exp(-pow((r - .9) * 110., 2.));
  float a2 = mod(-a - uTime * .31, TAU / 2.);
  float arcs2 = smoothstep(0., .03, a2) * smoothstep(.55, .5, a2) * exp(-pow((r - .945) * 160., 2.));
  float tk = fract((a + uTime * .05) / TAU * 96.);
  float ticks = smoothstep(.45, .3, tk) * exp(-pow((r - .7) * 140., 2.)) * (.35 + .65 * step(.9, fract((a + uTime * .05) / TAU * 12.)));
  float core = exp(-r * r * 3.) * .045;
  vec3 c = base * (ring + arcs * .95 + arcs2 * .7 + ticks * .6) * (1. + uGlow) + base * core;
  gl_FragColor = vec4(c * uFade * smoothstep(1., .97, r), 1.); }`,
  }));
  halo.renderOrder = 5;
  const label = timeLabel(F);
  halo.visible = label.visible = withLabel; g.add(halo, label);

  const tmpV = new THREE.Vector3(), camRight = new THREE.Vector3(1, 0, 0);
  let geo = { cx: W / 2, cy: H * 0.45, bottom: H * 0.8 };
  function layout() {
    const vw = VH * W / H;
    Rw = Math.min(vw * 0.23, VH * 0.29) * Store.get('size');
    GU.uR.value = Rw; unit.scale.setScalar(Rw);
    g.position.set(0, VH * 0.05, 0);
    halo.scale.setScalar(Rw * 1.36);
    label.scale.setScalar(Rw * 1.32);
  }
  layout();

  F.mount = root => { F.root = root; root.classList.add('gl-face'); };
  F.set = (t, first) => {
    const sub = Store.get('seconds') ? t.ss : '';
    if (withLabel) label.draw(t.hm, sub);
    if (!first && lastMin !== -1 && t.M !== lastMin && t.M === 0) F.breath = 1;
    lastMin = t.M;
  };
  F.breath = 0;
  F.relayout = layout;
  F.beat = () => {};
  F.frame = (dt, now, t) => {
    stepFade(F, dt);
    const P = palColors(), m = MOTION(), d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000, mi = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + mi / 60;
    GU.uTime.value = T;
    GU.uSpin.value = 0.035 * (0.4 + m * 0.6);
    GU.uExpand.value = Math.min(1, (T - born) / 3.2);
    GU.uPx.value = pxScale();
    const wt = T - wave.t0;
    GU.uWave.value = wt / 3.4 * 4.5; GU.uWaveAmp.value = wt < 6 ? wave.amp * (1 - wt / 6) : 0;
    F.breath = Math.max(0, F.breath - dt / 4000); GU.uBreath.value = Math.sin(F.breath * Math.PI);
    GU.uC0.value.copy(P.t1); GU.uC1.value.copy(P.glow); GU.uC2.value.copy(P.a); GU.uC3.value.copy(P.b); GU.uC4.value.copy(P.c);

    /* the disc: tilted, swaying slowly, leaning toward the pointer */
    const tt = T * (0.3 + m * 0.7);
    disc.rotation.x = -1.02 + mouse.ny * 0.22 + Math.sin(tt * 0.05) * 0.06;
    disc.rotation.y = mouse.nx * 0.3 + Math.sin(tt * 0.037) * 0.14;
    disc.rotation.z = Math.sin(tt * 0.029) * 0.03;

    /* hands */
    const ha = hr / 12 * TAU, ma = mi / 60 * TAU, sa = s / 60 * TAU, ring = 1 - wt / 2.5;
    const glow = Math.max(0, ring) * wave.amp * 0.8;
    const hu = hourArc.material.uniforms; hu.uHead.value = ha; hu.uFill.value = ha; hu.uGlow.value = glow;
    hu.uCA.value.copy(P.a); hu.uCB.value.copy(P.b); hu.uCH.value.copy(P.t1).multiplyScalar(1.4);
    const mu = minArc.material.uniforms; mu.uHead.value = ma; mu.uGlow.value = glow;
    mu.uCA.value.copy(P.t2); mu.uCB.value.copy(P.t2); mu.uCH.value.copy(P.c).multiplyScalar(2);
    const su = secArc.material.uniforms, secOn = Store.get('seconds');
    su.uHeadA.value = secOn ? 1.2 : 0; su.uHead.value = sa; su.uCA.value.copy(P.t2); su.uCB.value.copy(P.t2); su.uCH.value.copy(P.t1).multiplyScalar(1.6);
    sats.forEach((a, i) => {
      const u = a.material.uniforms; u.uHeadA.value = secOn ? 0 : 1;
      u.uHead.value = (T * 0.12 * (i + 1) * (0.5 + m * 0.5) + i * 2.1) % TAU;
      u.uCH.value.copy([P.a, P.b, P.c][i]).multiplyScalar(1.6); u.uCA.value.copy(P.t2); u.uCB.value.copy(P.t2);
    });
    const minNow = Math.floor(mi);
    if (ticks.userData.min !== minNow || ticks.userData.pk !== palKey) {
      ticks.userData.min = minNow; ticks.userData.pk = palKey;
      const cc = new THREE.Color();
      for (let i = 0; i < 60; i++) {
        const lit = i <= minNow, five = i % 5 === 0;
        if (lit) cc.copy(P.t1).lerp(P.c, i / 59).multiplyScalar(five ? 1.6 : 0.9); else cc.copy(P.t2).multiplyScalar(five ? 0.22 : 0.08);
        ticks.setColorAt(i, cc);
      }
      ticks.instanceColor.needsUpdate = true;
    }
    ticks.material.opacity = F.fade.value;
    planet.position.set(Math.sin(ha), Math.cos(ha), 0);
    planet.rotation.z = -ha;
    planetMat.uniforms.uCol.value.copy(P.a).lerp(P.b, 0.3);
    disc.updateMatrixWorld();
    tmpV.set(0, 0, 0); disc.localToWorld(tmpV); tmpV.applyMatrix4(faceCam.matrixWorldInverse);
    planetMat.uniforms.uLight.value.copy(tmpV);
    pRing.material.color.copy(P.b).multiplyScalar(0.7); pRing.material.opacity = F.fade.value;
    const mlA = T * 1.3; moonlet.position.set(Math.cos(mlA) * 0.14 / 1, 0, Math.sin(mlA) * 0.14);
    moonlet.material.color.copy(P.t1).multiplyScalar(1.5); moonlet.material.opacity = F.fade.value;
    minStar.position.set(Math.sin(ma) * 0.8, Math.cos(ma) * 0.8, 0);
    minStar.material.color.copy(P.c).multiplyScalar(3); minStar.material.opacity = F.fade.value;
    nums.forEach(n => { n.material.color.copy(P.t2).multiplyScalar(0.55); n.material.opacity = F.fade.value; });

    ORB.forEach((o, i) => {
      const M = (o.M0 + T * o.n * 0.12 * (0.5 + m * 0.5)) % TAU;
      let E = M; for (let k = 0; k < 5; k++) E -= (E - o.e * Math.sin(E) - M) / (1 - o.e * Math.cos(E));
      o.body.position.set(o.a * (Math.cos(E) - o.e), o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E), 0);
      o.mat.uniforms.uM.value = M;
      const c = [P.glow, P.b, P.c, P.a][i];
      o.mat.uniforms.uCol.value.copy(c).multiplyScalar(0.5);
      o.body.material.color.copy(c).multiplyScalar(2.4); o.body.material.opacity = F.fade.value;
      const e = ease3(Math.max(0, Math.min(1, GU.uExpand.value * 1.2 - 0.2)));
      o.body.scale.setScalar(e);
    });

    /* the real sky, from sky.js (so timelapse spins the dial too) */
    const st = window.Sky && Sky.state;
    if (st && st.ready) {
      const D = Math.PI / 180;
      const sunHA = ((st.lst - st.sun.ra) % 360 + 360) % 360 * D, moonHA = ((st.lst - st.moon.ra) % 360 + 360) % 360 * D;
      dialMat.uniforms.uSunH0.value = Astro.semiArc(st.sun.dec) * D;
      dialMat.uniforms.uMoonH0.value = Astro.semiArc(st.moon.dec, 0.125) * D;
      dialMat.uniforms.uDay.value.copy(P.c).lerp(new THREE.Color(1, 0.75, 0.4), 0.55);
      dialMat.uniforms.uNight.value.copy(P.b);
      sunBall.position.set(Math.sin(sunHA) * DIAL, Math.cos(sunHA) * DIAL, 0);
      moonBall.position.set(Math.sin(moonHA) * (DIAL + 0.02), Math.cos(moonHA) * (DIAL + 0.02), 0.03);
      unit.updateMatrixWorld(); unit.getWorldQuaternion(qTmp);
      moonBall.quaternion.copy(qTmp.invert()).multiply(qMoonFace);
      /* light the moon so the viewer sees its true phase, bright limb on the side the sun is */
      const mw = moonBall.getWorldPosition(tmpV);
      const V = new THREE.Vector3().subVectors(faceCam.position, mw).normalize();
      const Rt = camRight.clone().sub(V.clone().multiplyScalar(camRight.dot(V))).normalize();
      const i = st.phase.angle, sgn = st.phase.waxing ? 1 : -1;
      moonMat.uniforms.uL.value.copy(V.multiplyScalar(Math.cos(i))).add(Rt.multiplyScalar(Math.sin(i) * sgn));
      Astro.planets(st.skyMs).forEach((p, k) => {
        const ha = ((st.lst - p.ra) % 360 + 360) % 360 * D, rr = DIAL + 0.1;
        plPos.set([Math.sin(ha) * rr, Math.cos(ha) * rr, 0], k * 3);
        plCol.set(p.col.map(v => v * 1.2), k * 3);
      });
      plGeo.attributes.position.needsUpdate = true; plGeo.attributes.color.needsUpdate = true;
    }
    sunBall.material.opacity = F.fade.value;

    const hm = halo.material.uniforms; hm.uC.value.copy(P.glow); hm.uC2.value.copy(P.c); hm.uGlow.value = glow * 1.5;
    label.material.opacity = F.fade.value;
    if (withLabel) label.draw(t.hm, Store.get('seconds') ? t.ss : '');

    g.updateMatrixWorld();
    const c0 = toScreen(g.getWorldPosition(new THREE.Vector3()));
    const b = toScreen(unit.localToWorld(new THREE.Vector3(0, -(DIAL + 0.12), 0)));
    geo = { cx: c0.x, cy: c0.y, bottom: b.y + 22 };
  };
  F.bottom = () => geo.bottom;
  F.anchor = () => ({ x: geo.cx, y: geo.cy });
  return F;
}

/* =====================================================================================
   SWARM — the time as a volume of light. Each digit owns its particles; when a digit changes
   they swoop out toward you on curling paths and settle into the new shape
   ===================================================================================== */
const glyphs = new Map();
document.fonts && document.fonts.ready.then(() => glyphs.clear());
function glyph(ch) {
  if (glyphs.has(ch)) return glyphs.get(ch);
  const fs = 160, c = document.createElement('canvas'), o = c.getContext('2d', { willReadFrequently: true });
  const font = `500 ${fs}px Outfit, "Segoe UI Variable Display", "Segoe UI", sans-serif`;
  o.font = font;
  const adv = o.measureText(ch).width / fs, w = Math.ceil(fs * Math.max(0.5, adv) + 8), h = Math.ceil(fs * 1.1);
  c.width = w; c.height = h;
  o.font = font; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
  o.fillText(ch, w / 2, h / 2);
  const d = o.getImageData(0, 0, w, h).data, pts = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 128) pts.push((x - w / 2) / fs, -(y - h / 2) / fs);
  const gl = { pts: new Float32Array(pts), adv: ch === ':' ? adv * 1.1 : adv, step: 2 / fs };
  glyphs.set(ch, gl);
  return gl;
}

function Swarm(opts = {}) {
  const F = base({ name: 'swarm' });
  const g = F.group;
  const N = Math.round((opts.nova ? 32000 : 46000) * pScale()), NF = opts.flock === false ? 0 : Math.round(20000 * pScale());
  const from = new Float32Array(N * 3), to = new Float32Array(N * 3), t0 = new Float32Array(N), sd = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { t0[i] = -99; for (let j = 0; j < 4; j++) sd[i * 4 + j] = R(); }
  for (let i = 0; i < N * 3; i++) from[i] = to[i] = (R() - 0.5) * 60;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const A = { aFrom: new THREE.BufferAttribute(from, 3), aTo: new THREE.BufferAttribute(to, 3), aT0: new THREE.BufferAttribute(t0, 1) };
  for (const k in A) { A[k].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, A[k]); }
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const SU = {
    uTime: { value: 0 }, uDur: { value: 1.6 }, uPx: { value: 800 }, uFade: F.fade, uH: { value: 8 }, uW: { value: 30 }, uSweep: { value: -1 },
    uGain: { value: opts.nova ? 1.5 : 1 }, uMouse: { value: new THREE.Vector3(1e4, 1e4, 0) }, uMouseOn: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAttract: { value: 0 },
    uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() }, uC4: { value: new THREE.Color() },
  };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    ...ADD, uniforms: SU,
    vertexShader: `
uniform float uTime, uDur, uPx, uH, uW, uSweep, uMouseOn;
uniform vec3 uMouse, uC0, uC1, uC2, uC3, uC4;
attribute vec3 aFrom, aTo; attribute float aT0; attribute vec4 aSeed;
varying vec3 vCol;
void main() {
  float t = clamp((uTime - aT0) / uDur, 0., 1.);
  float e = t < .5 ? 4. * t * t * t : 1. - pow(-2. * t + 2., 3.) / 2.;
  float fly = sin(3.14159 * e);
  vec3 p = mix(aFrom, aTo, e);
  vec3 q = aSeed.xyz * 6.2831 + p * .12;
  vec3 sw = vec3(sin(q.y * 1.7 + uTime * 1.3), sin(q.z * 1.9 + uTime * 1.1), sin(q.x * 1.3 + uTime * .9));
  p += fly * (sw * uH * .45 + vec3(0., 0., uH * (.8 + aSeed.w * 2.4)));
  p += .01 * uH * vec3(sin(uTime * 1.3 + aSeed.x * 50.), cos(uTime * 1.1 + aSeed.y * 40.), sin(uTime * .9 + aSeed.z * 30.));
  vec2 d = p.xy - uMouse.xy; float mr = uH * .5;
  float push = exp(-dot(d, d) / (mr * mr)) * uMouseOn;
  p.xy += normalize(d + 1e-4) * push * uH * .3; p.z += push * uH * .5;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float u = clamp(p.x / uW + .5, 0., 1.);
  vec3 c = mix(uC2, uC1, smoothstep(0., .35, u)); c = mix(c, uC3, smoothstep(.35, .7, u)); c = mix(c, uC4, smoothstep(.7, 1., u));
  c = mix(c, uC0, .15 + .3 * aSeed.y);
  float sweep = exp(-pow((u - uSweep) * 6., 2.));
  float glint = pow(max(0., sin(uTime * (1.2 + aSeed.z * 2.) + aSeed.w * 80.)), 50.) * 4.;
  vCol = c * (.55 + fly * 1.4 + sweep * 1.3 + glint + push * .8);
  gl_PointSize = clamp((.7 + aSeed.w * .9) * uH * .0075 * uPx / -mv.z * (1. + fly * .5), 1., 26.);
}`,
    fragmentShader: `uniform float uFade, uGain; varying vec3 vCol;
void main() { vec2 d = gl_PointCoord - .5; float a = exp(-dot(d, d) * 16.); gl_FragColor = vec4(vCol * a * uFade * .5 * uGain, 1.); }`,
  }));
  pts.frustumCulled = false; g.add(pts);

  /* the murmuration: one body of birds whose shape stretches, folds and pours around the digits */
  const fg = new THREE.BufferGeometry(), fs = new Float32Array(NF * 4), fd = new Float32Array(NF * 3);
  for (let i = 0; i < NF; i++) {
    for (let j = 0; j < 4; j++) fs[i * 4 + j] = R();
    const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u);
    fd.set([s * Math.cos(a), u, s * Math.sin(a)], i * 3);
  }
  fg.setAttribute('position', new THREE.BufferAttribute(fd, 3)); fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 4));
  const flock = new THREE.Points(fg, new THREE.ShaderMaterial({
    ...ADD, uniforms: SU,
    vertexShader: `
uniform float uTime, uPx, uH, uW, uAttract; uniform vec3 uCenter, uC2, uC3, uC4;
attribute vec4 aSeed; varying vec3 vCol;
void main() {
  float lag = aSeed.x;
  float tt = uTime * .16 - lag * .55;
  vec3 C = vec3(sin(tt * 1.1) * uW * .62, sin(tt * 1.7 + 1.3) * uH * .8, sin(tt * .8 + .4) * uH * 1.2);
  C = mix(C, uCenter, uAttract * (1. - lag * .7));
  float s1 = 1. + .8 * sin(uTime * .29 + lag * 2.), s2 = 1. + .6 * sin(uTime * .21 + 1.7);
  vec3 o = position * pow(aSeed.y, .4) * uH * .55 * vec3(1.7 * s1, .65 * s2, 1.1);
  o.y += sin(o.x / uH * 3.2 + uTime * .9) * uH * .22;
  o.z += cos(o.y / uH * 4. + uTime * .7) * uH * .2;
  float ca = cos(uTime * .12 + lag), sa = sin(uTime * .12 + lag);
  o.xz = mat2(ca, -sa, sa, ca) * o.xz;
  vec3 p = C + o;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float dens = .6 + .4 * sin(lag * 30. + uTime * 2.);
  vCol = mix(mix(uC3, uC4, aSeed.z), uC2, aSeed.w * .4) * .42 * dens;
  gl_PointSize = clamp((.6 + aSeed.w * .8) * uH * .006 * uPx / -mv.z, 1., 12.);
}`,
    fragmentShader: `uniform float uFade; varying vec3 vCol;
void main() { vec2 d = gl_PointCoord - .5; float a = exp(-dot(d, d) * 14.); gl_FragColor = vec4(vCol * a * uFade, 1.); }`,
  }));
  flock.frustumCulled = false; if (NF) g.add(flock);

  let str = '', slots = [], textH = 8, box = { cx: 0, cy: 0, bottom: 0 }, sweepT0 = -99;
  const center = new THREE.Vector3();
  function layout(s) {
    const vw = VH * W / H, gl = [...s].map(glyph), total = gl.reduce((a, b) => a + b.adv, 0);
    textH = opts.nova
      ? Math.min(vw * 0.23, VH * 0.29) * 0.74 * Store.get('size') * (Store.get('seconds') ? 0.8 : 1)
      : Math.min(VH * 0.4, vw * 0.8 / Math.max(total, 1)) * Store.get('size') * (Store.get('seconds') ? 0.95 : 1);
    SU.uH.value = textH; SU.uW.value = total * textH;
    g.position.set(0, VH * 0.05, 0);
    let x = -total / 2;
    const weights = [...s].map(c => c === ':' ? 0.22 : 1), sum = weights.reduce((a, b) => a + b, 0);
    let start = 0;
    return [...s].map((c, i) => {
      const n = i === s.length - 1 ? N - start : Math.floor(N * weights[i] / sum);
      const sl = { ch: c, x: (x + gl[i].adv / 2) * textH, start, n };
      x += gl[i].adv; start += n;
      return sl;
    });
  }
  const cur = new Float32Array(3);
  function current(i, now) {
    const t = Math.max(0, Math.min(1, (now - t0[i]) / SU.uDur.value)), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    for (let k = 0; k < 3; k++) cur[k] = from[i * 3 + k] + (to[i * 3 + k] - from[i * 3 + k]) * e;
    return cur;
  }
  function fill(sl, now, instant) {
    const gp = glyph(sl.ch), P = gp.pts, np = P.length / 2, depth = textH * 0.09;
    for (let j = 0; j < sl.n; j++) {
      const i = sl.start + j, k = np ? ((R() * np) | 0) * 2 : 0;
      const c = instant ? null : current(i, now);
      const x = sl.x + ((np ? P[k] : 0) + (R() - 0.5) * gp.step) * textH, y = ((np ? P[k + 1] : 0) + (R() - 0.5) * gp.step) * textH;
      const z = (R() * 2 - 1) * depth * (0.3 + 0.7 * R());
      if (instant) { from[i * 3] = x; from[i * 3 + 1] = y; from[i * 3 + 2] = z; t0[i] = -99; }
      else { from.set(c, i * 3); t0[i] = now + (x / (SU.uW.value || 1) + 0.5) * 0.45 + R() * 0.25; }
      to[i * 3] = x; to[i * 3 + 1] = y; to[i * 3 + 2] = z;
    }
  }
  function retarget(s, instant) {
    const now = T, next = layout(s);
    const same = next.length === slots.length && next.every((sl, i) => sl.n === slots[i].n && Math.abs(sl.x - slots[i].x) < 1e-6);
    next.forEach((sl, i) => { if (!same || instant || slots[i].ch !== sl.ch) fill(sl, now, instant); });
    slots = next; str = s;
    A.aFrom.needsUpdate = A.aTo.needsUpdate = A.aT0.needsUpdate = true;
    if (!str || s.slice(0, -3) !== str.slice(0, -3) || !Store.get('seconds')) sweepT0 = now;
    const bottomW = new THREE.Vector3(0, -textH * 0.62, 0); g.updateMatrixWorld(); g.localToWorld(bottomW);
    box = { bottom: toScreen(bottomW).y + 26 };
  }

  F.mount = root => { F.root = root; root.classList.add('gl-face'); };
  F.set = (t, first) => {
    const s = t.hm + (Store.get('seconds') ? ':' + t.ss : '');
    if (s !== str) retarget(s, false);
  };
  F.relayout = () => { if (str) retarget(str, true); };
  F.beat = () => {};
  F.frame = (dt, now) => {
    stepFade(F, dt);
    const P = palColors(), m = MOTION();
    SU.uTime.value = T; SU.uPx.value = pxScale();
    SU.uDur.value = ({ calm: 2.2, normal: 1.7, wild: 1.35 })[Store.get('motion')] || 1.7;
    SU.uC0.value.copy(P.t1); SU.uC1.value.copy(P.glow); SU.uC2.value.copy(P.a); SU.uC3.value.copy(P.b); SU.uC4.value.copy(P.c);
    const sw = (T - sweepT0) / 2.2; SU.uSweep.value = sw < 1.4 ? sw * 1.4 - 0.2 : -9;
    /* pointer in the text's plane: parts the particles; while it moves the flock is drawn to it */
    const active = performance.now() - mouse.last < 2500 && mouse.x > -1e3;
    const mx = (mouse.x / W - 0.5) * VH * W / H, my = -(mouse.y / H - 0.5) * VH - g.position.y;
    SU.uMouse.value.set(mx, my, 0);
    SU.uMouseOn.value += ((active ? 1 : 0) - SU.uMouseOn.value) * Math.min(1, dt / 300);
    center.set(mx, my, textH * 0.3); SU.uCenter.value.lerp(center, Math.min(1, dt / 1200));
    SU.uAttract.value += ((active ? 0.65 : 0) - SU.uAttract.value) * Math.min(1, dt / 2000);
    const tt = T * (0.3 + m * 0.7);
    g.rotation.y = (mouse.nx * 0.35 + Math.sin(tt * 0.07) * 0.16) * (opts.nova ? 0.6 : 1);
    g.rotation.x = (mouse.ny * 0.25 + Math.sin(tt * 0.05) * 0.06) * (opts.nova ? 0.6 : 1);
  };
  F.bottom = () => box.bottom || H * 0.75;
  F.anchor = () => { const c = toScreen(g.getWorldPosition(new THREE.Vector3())); return { x: c.x, y: c.y }; };
  return F;
}

/* =====================================================================================
   NOVA — Orbit and Swarm as one: the galaxy, its rings and the real sky, with the time held in
   the middle by the swarm's particles, which swoop out across the disc whenever a digit changes
   ===================================================================================== */
function Nova() {
  const o = Orbit({ label: false }), s = Swarm({ flock: false, nova: true });
  const both = f => (...a) => { o[f](...a); s[f](...a); };
  return {
    name: 'nova',
    mount: both('mount'), set: both('set'), frame: both('frame'), leave: both('leave'), unmount: both('unmount'), relayout: both('relayout'),
    beat() {}, bottom: () => o.bottom(), anchor: () => o.anchor(),
  };
}

/* =====================================================================================
   the frame
   ===================================================================================== */
let vis = false;
function frame(dt, now) {
  if (lost) return;
  if (W !== innerWidth || H !== innerHeight) resize();
  T = secs(now);
  const wxOn = weatherFrame();
  const faceOn = faces.size > 0;
  wxPass.enabled = wxOn;
  facePass.clear = !wxOn;
  if (!wxOn && !faceOn) { if (vis) { vis = false; canvas.classList.remove('on'); } return; }
  if (!vis) { vis = true; canvas.classList.add('on'); }
  facePass.enabled = faceOn;
  composer.render(dt / 1000);
}

applyQuality();
window.GL3D = { get weather() { return !lost; }, frame, resize, pulse, Orbit, Swarm, Nova, get time() { return T; }, get debug() { return { rain: rainGeo.instanceCount, snow: snowGeo.instanceCount }; } };
