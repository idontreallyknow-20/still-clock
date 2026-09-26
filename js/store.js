/* Still v3 — settings that survive reloads, and the palettes */
window.PALETTES = {
  aurora: { name: 'Aurora', bg: '#02040a', a: '#1de9b6', b: '#7c4dff', c: '#ff4fa3', t1: '#ffffff', t2: '#9fe8ff', glow: '#4dd9ff' },
  ember:  { name: 'Ember',  bg: '#070302', a: '#ff5a1f', b: '#ffb13b', c: '#c2185b', t1: '#fff6ea', t2: '#ffb56b', glow: '#ff7a2e' },
  abyss:  { name: 'Abyss',  bg: '#010409', a: '#0091ff', b: '#00e5c8', c: '#3a2cff', t1: '#f2fbff', t2: '#6fd3ff', glow: '#1aa3ff' },
  sakura: { name: 'Sakura', bg: '#08040a', a: '#ff7eb9', b: '#b69cff', c: '#ffd0e6', t1: '#fff5fa', t2: '#ffb0d4', glow: '#ff8fc6' },
  acid:   { name: 'Acid',   bg: '#020502', a: '#a6ff00', b: '#00ff9d', c: '#e1ff3d', t1: '#f7ffe8', t2: '#b8ff5a', glow: '#8cff2e' },
  mono:   { name: 'Mono',   bg: '#030303', a: '#8a8a8a', b: '#3e3e3e', c: '#dcdcdc', t1: '#ffffff', t2: '#b5b5b5', glow: '#ffffff' },
};
window.FACES = [['glass', 'Glass'], ['swarm', 'Swarm'], ['flip', 'Flip'], ['orbit', 'Orbit']];

window.Store = (() => {
  const KEY = 'still.v3';
  const hc = (() => { try { return new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hourCycle; } catch (e) { return 'h12'; } })();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEFAULTS = {
    face: 'glass', palette: 'aurora',
    seconds: false, h24: hc === 'h23' || hc === 'h24', date: true, size: 1,
    motion: reduce ? 'calm' : 'normal',
    sound: true, chime: true, ambient: false, volume: 0.6,
    skyMode: 'real', weather: 'live', lines: true,
    lite: false, lockfs: false,
  };
  const VALID = {
    face: v => FACES.some(f => f[0] === v),
    palette: v => v in PALETTES,
    motion: v => ['calm', 'normal', 'wild'].includes(v),
    size: v => v >= 0.5 && v <= 1.5,
    volume: v => v >= 0 && v <= 1,
    skyMode: v => ['real', 'timelapse'].includes(v),
    weather: v => ['live', 'clear', 'rain', 'snow', 'storm'].includes(v),
  };
  const S = { ...DEFAULTS };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k in DEFAULTS)
      if (typeof o[k] === typeof DEFAULTS[k] && (!VALID[k] || VALID[k](o[k]))) S[k] = o[k];
  } catch (e) {}

  const subs = [];
  let timer;
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
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
window.pal = () => PALETTES[Store.get('palette')] || PALETTES.aurora;
window.LITE = () => Store.get('lite');
window.MOTION = () => ({ calm: 0.35, normal: 1, wild: 2.2 })[Store.get('motion')] || 1;
