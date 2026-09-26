/* Still v3 — settings that survive reloads, and the palettes */
window.PALETTES = {
  /* Sky is alive: its colours are recomputed from the real sun and the weather (see skyPalette below) */
  sky:    { name: 'Sky', live: true, bg: '#02040a', a: '#1de9b6', b: '#7c4dff', c: '#ff4fa3', t1: '#ffffff', t2: '#9fe8ff', glow: '#4dd9ff' },
  aurora: { name: 'Aurora', bg: '#02040a', a: '#1de9b6', b: '#7c4dff', c: '#ff4fa3', t1: '#ffffff', t2: '#9fe8ff', glow: '#4dd9ff' },
  ember:  { name: 'Ember',  bg: '#070302', a: '#ff5a1f', b: '#ffb13b', c: '#c2185b', t1: '#fff6ea', t2: '#ffb56b', glow: '#ff7a2e' },
  abyss:  { name: 'Abyss',  bg: '#010409', a: '#0091ff', b: '#00e5c8', c: '#3a2cff', t1: '#f2fbff', t2: '#6fd3ff', glow: '#1aa3ff' },
  sakura: { name: 'Sakura', bg: '#08040a', a: '#ff7eb9', b: '#b69cff', c: '#ffd0e6', t1: '#fff5fa', t2: '#ffb0d4', glow: '#ff8fc6' },
  acid:   { name: 'Acid',   bg: '#020502', a: '#a6ff00', b: '#00ff9d', c: '#e1ff3d', t1: '#f7ffe8', t2: '#b8ff5a', glow: '#8cff2e' },
  glacier: { name: 'Glacier', bg: '#02060b', a: '#8fe3ff', b: '#6c8cff', c: '#e6f7ff', t1: '#ffffff', t2: '#cfefff', glow: '#a8e8ff' },
  nebula: { name: 'Nebula', bg: '#05020a', a: '#ff3ea5', b: '#6a3cff', c: '#00d4ff', t1: '#fff4fd', t2: '#e2b8ff', glow: '#b05cff' },
  mono:   { name: 'Mono',   bg: '#030303', a: '#8a8a8a', b: '#3e3e3e', c: '#dcdcdc', t1: '#ffffff', t2: '#b5b5b5', glow: '#ffffff' },
};
window.FACES = [['glass', 'Glass'], ['swarm', 'Swarm'], ['flip', 'Flip'], ['orbit', 'Orbit'], ['nova', 'Nova']];

window.Store = (() => {
  const KEY = 'still.v3';
  /* bump when the defaults change: saved settings from an older set are replaced once, so everyone sees the new look */
  const VERSION = 4;
  const hc = (() => { try { return new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hourCycle; } catch (e) { return 'h12'; } })();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEFAULTS = {
    face: 'orbit', palette: 'sky',
    seconds: false, h24: hc === 'h23' || hc === 'h24', date: true, size: 1,
    /* out of the box it goes all in: wild motion and every effect on (reduced-motion users still get calm) */
    motion: reduce ? 'calm' : 'wild',
    sound: true, chimeEvery: '5', ambient: true, volume: 0.6,
    skyMode: 'real', weather: 'live', lines: true,
    lite: false, lockfs: false,
    brightness: 1, autoDim: false,
    alarmOn: false, alarmTime: '07:00',
  };
  const VALID = {
    face: v => FACES.some(f => f[0] === v),
    palette: v => v in PALETTES,
    motion: v => ['calm', 'normal', 'wild'].includes(v),
    size: v => v >= 0.5 && v <= 1.5,
    brightness: v => v >= 0.1 && v <= 1,
    alarmTime: v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
    volume: v => v >= 0 && v <= 1,
    skyMode: v => ['real', 'timelapse'].includes(v),
    weather: v => ['live', 'clear', 'rain', 'snow', 'blizzard', 'storm', 'fog'].includes(v),
    chimeEvery: v => ['off', '1', '5', '15', '60'].includes(v),
  };
  const S = { ...DEFAULTS };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (o._v === VERSION) for (const k in DEFAULTS)
      if (typeof o[k] === typeof DEFAULTS[k] && (!VALID[k] || VALID[k](o[k]))) S[k] = o[k];
  } catch (e) {}

  const subs = [];
  let timer;
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...S, _v: VERSION })); } catch (e) {} };
  addEventListener('pagehide', write);

  return {
    DEFAULTS,
    get: k => S[k],
    set(k, v) {
      if (S[k] === v) return;
      S[k] = v;
      clearTimeout(timer); timer = setTimeout(write, 120);
      subs.forEach(f => f(k, v));
    },
    reset() { for (const k in DEFAULTS) this.set(k, DEFAULTS[k]); },
    on(f) { subs.push(f); },
  };
})();

/* color helpers shared by the canvas layers */
window.Col = {
  rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; },
  mix(a, b, t) {
    const A = Col.rgb(a), B = Col.rgb(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  },
  rgba(h, a) { const [r, g, b] = Col.rgb(h); return `rgba(${r},${g},${b},${a})`; },
};
/* the Sky palette: keyframes by sun altitude, then pulled toward the weather */
window.SKYPAL = (() => {
  const K = [
    [-90, { a: '#1de9b6', b: '#7c4dff', c: '#ff4fa3', t2: '#9fe8ff', glow: '#4dd9ff' }],  /* night: aurora */
    [-12, { a: '#1de9b6', b: '#7c4dff', c: '#ff4fa3', t2: '#9fe8ff', glow: '#4dd9ff' }],
    [-5, { a: '#5b8cff', b: '#b06cff', c: '#ff7ab8', t2: '#c9d6ff', glow: '#86a8ff' }],   /* blue hour */
    [2, { a: '#ff8a4a', b: '#ff4f8b', c: '#ffd36b', t2: '#ffd9bd', glow: '#ffa45c' }],    /* golden hour */
    [10, { a: '#40d4ff', b: '#6d7dff', c: '#ffe29a', t2: '#dff5ff', glow: '#8fe0ff' }],   /* morning / afternoon */
    [90, { a: '#39c8ff', b: '#4f6bff', c: '#a6f4ff', t2: '#e2f6ff', glow: '#7fd8ff' }],   /* high sun */
  ];
  const WX = {
    snow: { a: '#a9e8ff', b: '#7d97ff', c: '#ffffff', t2: '#e4f6ff', glow: '#c4eeff' },
    rain: { a: '#3fb6c9', b: '#4d6fa8', c: '#9fd4e6', t2: '#c3e3ee', glow: '#62c4db' },
    storm: { a: '#9b6cff', b: '#3d4bff', c: '#e0d4ff', t2: '#d8ccff', glow: '#a98bff' },
  };
  const blend = (A, B, t) => { const o = {}; for (const k in A) o[k] = Col.mix(A[k], B[k], t); return o; };
  return st => {
    const s = st && st.ready ? st.sunDeg : -30;
    let c = K[K.length - 1][1];
    for (let i = 1; i < K.length; i++) if (s <= K[i][0]) { c = blend(K[i - 1][1], K[i][1], (s - K[i - 1][0]) / (K[i][0] - K[i - 1][0])); break; }
    if (st && st.ready) {
      if (st.snow > 0.05) c = blend(c, WX.snow, Math.min(0.75, st.snow * 0.8));
      else if (st.storm > 0.2) c = blend(c, WX.storm, Math.min(0.7, st.storm * 0.7));
      else if (st.rain > 0.05) c = blend(c, WX.rain, Math.min(0.6, st.rain * 0.7));
    }
    return { name: 'Sky', live: true, bg: '#02040a', t1: '#ffffff', ...c };
  };
})();
let skyPalCache = null;
window.refreshSkyPalette = () => { skyPalCache = SKYPAL(window.Sky && Sky.state); return skyPalCache; };
window.pal = () => {
  const k = Store.get('palette');
  if (k === 'sky') return skyPalCache || refreshSkyPalette();
  return PALETTES[k] || PALETTES.aurora;
};
window.LITE = () => Store.get('lite');
/* automatic quality: main.js watches the frame time and steps this down (or back up) so the clock stays smooth.
   tier 0 is full quality; each step trims resolution and effects */
window.QUALITY = { tier: 0, max: 3, subs: [], set(t) { t = Math.max(0, Math.min(this.max, t)); if (t === this.tier) return; this.tier = t; this.subs.forEach(f => f(t)); }, on(f) { this.subs.push(f); } };
window.MOTION = () => ({ calm: 0.35, normal: 1, wild: 2.2 })[Store.get('motion')] || 1;
