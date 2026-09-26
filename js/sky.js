/* Still v3 — the sky. A real-time planetarium for where you are: stars wheel with sidereal time,
   the moon shows its true phase, the sun sets the colour of the air, and live weather (Open-Meteo)
   fills it with clouds, rain, snow, fog or lightning. All drawn in 3D perspective over layered
   mountains. */
window.Sky = (() => {
  const cv = document.getElementById('sky'), ctx = cv.getContext('2d');
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = Math.PI * 2, R = Math.random;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const mixA = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const hex = h => Col.rgb(h).map(v => v / 255);
  const css = (c, a = 1) => `rgba(${c.map(v => Math.round(clamp(v, 0, 1) * 255)).join(',')},${a})`;
  let W = 0, H = 0, focal = 1, hy = 0;

  /* ================= where are we? Richmond Hill, always ================= */
  const loc = Astro.LOC;
  function locate() {}

  /* ================= astronomy (js/astro.js) ================= */
  const lstDeg = Astro.lst, sunEq = Astro.sun, moonEq = Astro.moon, altaz = Astro.altaz;

  /* ================= camera ================= */
  const cam = { yaw: Math.PI, pitch: 20 * D2R, fov: 72 * D2R };
  let cy_, sy_, cp_, sp_;
  function camPrep() { cy_ = Math.cos(cam.yaw); sy_ = Math.sin(cam.yaw); cp_ = Math.cos(cam.pitch); sp_ = Math.sin(cam.pitch); }
  const P = [0, 0, 0];
  function project(alt, az) {
    const ca = Math.cos(alt), x = ca * Math.sin(az), y = Math.sin(alt), z = ca * Math.cos(az);
    const x1 = x * cy_ - z * sy_, z1 = x * sy_ + z * cy_;
    const y2 = y * cp_ - z1 * sp_, z2 = y * sp_ + z1 * cp_;
    if (z2 < 0.05) { P[2] = -1; return P; }
    P[0] = W / 2 + x1 / z2 * focal; P[1] = H / 2 - y2 / z2 * focal; P[2] = z2;
    return P;
  }

  /* ================= the catalogue ================= */
  const NAMED = {
    Sirius: [6.752, -16.716, -1.46, 0], Canopus: [6.399, -52.696, -0.74, 1], Arcturus: [14.261, 19.182, -0.05, 2], Vega: [18.616, 38.784, 0.03, 0],
    Capella: [5.278, 45.998, 0.08, 2], Rigel: [5.242, -8.202, 0.13, 0], Procyon: [7.655, 5.225, 0.34, 1], Betelgeuse: [5.919, 7.407, 0.5, 2],
    Achernar: [1.629, -57.237, 0.46, 0], Altair: [19.846, 8.868, 0.77, 1], Aldebaran: [4.599, 16.509, 0.85, 2], Antares: [16.49, -26.432, 1.09, 2],
    Spica: [13.42, -11.161, 0.98, 0], Pollux: [7.755, 28.026, 1.14, 2], Fomalhaut: [22.961, -29.622, 1.16, 1], Deneb: [20.69, 45.28, 1.25, 0],
    Regulus: [10.139, 11.967, 1.35, 0], Castor: [7.577, 31.888, 1.58, 1], Bellatrix: [5.419, 6.35, 1.64, 0], Alnilam: [5.604, -1.202, 1.69, 0],
    Alnitak: [5.679, -1.943, 1.74, 0], Mintaka: [5.533, -0.299, 2.23, 0], Saiph: [5.796, -9.67, 2.06, 0], Meissa: [5.585, 9.934, 3.39, 0],
    Polaris: [2.53, 89.264, 1.98, 1], Dubhe: [11.062, 61.751, 1.79, 2], Merak: [11.031, 56.382, 2.37, 1], Phecda: [11.897, 53.695, 2.44, 1],
    Megrez: [12.257, 57.033, 3.31, 1], Alioth: [12.9, 55.96, 1.77, 1], Mizar: [13.399, 54.925, 2.23, 1], Alkaid: [13.792, 49.313, 1.86, 0],
    Caph: [0.153, 59.15, 2.27, 1], Schedar: [0.675, 56.537, 2.24, 2], GammaCas: [0.945, 60.717, 2.47, 0], Ruchbah: [1.43, 60.235, 2.68, 1], Segin: [1.907, 63.67, 3.37, 0],
    Sadr: [20.37, 40.257, 2.23, 1], Gienah: [20.77, 33.97, 2.48, 2], DeltaCyg: [19.75, 45.131, 2.87, 0], Albireo: [19.512, 27.96, 3.08, 2],
    Shaula: [17.56, -37.104, 1.62, 0], Sargas: [17.622, -42.998, 1.86, 1], Dschubba: [16.006, -22.622, 2.29, 0], Acrab: [16.091, -19.806, 2.62, 0],
    EpsSco: [16.836, -34.293, 2.29, 2], MuSco: [16.864, -38.047, 3.0, 0], ZetaSco: [16.909, -42.362, 3.6, 2], EtaSco: [17.203, -43.239, 3.3, 1],
    Algieba: [10.333, 19.842, 2.08, 2], Denebola: [11.818, 14.572, 2.14, 0], Zosma: [11.235, 20.524, 2.56, 0], Chertan: [11.237, 15.43, 3.3, 0],
    EtaLeo: [10.122, 16.763, 3.5, 0], Adhafera: [10.278, 23.417, 3.4, 1], Rasalas: [9.879, 26.007, 3.9, 2],
    Acrux: [12.443, -63.099, 0.77, 0], Mimosa: [12.795, -59.689, 1.25, 0], Gacrux: [12.519, -57.113, 1.63, 2], DeltaCru: [12.252, -58.749, 2.79, 0],
    Hamal: [2.12, 23.46, 2.0, 2], Mirach: [1.162, 35.62, 2.05, 2], Alpheratz: [0.14, 29.09, 2.06, 0], Almach: [2.065, 42.33, 2.1, 2],
    Markab: [23.08, 15.2, 2.49, 0], Scheat: [23.063, 28.08, 2.42, 2], Algenib: [0.22, 15.18, 2.83, 0], Alcyone: [3.79, 24.1, 2.87, 0],
  };
  const CONS = [
    ['Orion', [['Betelgeuse', 'Bellatrix'], ['Betelgeuse', 'Alnitak'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'], ['Alnitak', 'Saiph'], ['Mintaka', 'Rigel'], ['Meissa', 'Betelgeuse'], ['Meissa', 'Bellatrix']]],
    ['Big Dipper', [['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'], ['Megrez', 'Dubhe'], ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid']]],
    ['Cassiopeia', [['Caph', 'Schedar'], ['Schedar', 'GammaCas'], ['GammaCas', 'Ruchbah'], ['Ruchbah', 'Segin']]],
    ['Cygnus', [['Deneb', 'Sadr'], ['Sadr', 'Albireo'], ['Sadr', 'Gienah'], ['Sadr', 'DeltaCyg']]],
    ['Scorpius', [['Acrab', 'Dschubba'], ['Dschubba', 'Antares'], ['Antares', 'EpsSco'], ['EpsSco', 'MuSco'], ['MuSco', 'ZetaSco'], ['ZetaSco', 'EtaSco'], ['EtaSco', 'Sargas'], ['Sargas', 'Shaula']]],
    ['Leo', [['Regulus', 'EtaLeo'], ['EtaLeo', 'Algieba'], ['Algieba', 'Adhafera'], ['Adhafera', 'Rasalas'], ['Algieba', 'Zosma'], ['Zosma', 'Denebola'], ['Denebola', 'Chertan'], ['Chertan', 'Regulus']]],
    ['Crux', [['Acrux', 'Gacrux'], ['Mimosa', 'DeltaCru']]],
    ['Pegasus', [['Markab', 'Scheat'], ['Scheat', 'Alpheratz'], ['Alpheratz', 'Algenib'], ['Algenib', 'Markab']]],
    ['Summer Triangle', [['Vega', 'Deneb'], ['Deneb', 'Altair'], ['Altair', 'Vega']]],
  ];
  const STAR_COL = [[0.78, 0.86, 1], [1, 0.97, 0.9], [1, 0.78, 0.55]];
  const stars = [], idx = {};
  function addStar(raDeg, dec, mag, col, name) {
    const s = { ra: raDeg, sd: Math.sin(dec * D2R), cd: Math.cos(dec * D2R), mag, col, ph: R() * TAU, sp: 1 + R() * 3, x: 0, y: 0, a: 0 };
    stars.push(s); if (name) idx[name] = s;
  }
  for (const n in NAMED) { const [ra, dec, mag, c] = NAMED[n]; addStar(ra * 15, dec, mag, c, n); }
  for (let i = 0; i < 1700; i++) addStar(R() * 360, Math.asin(R() * 2 - 1) * R2D, 6.6 - 4 * Math.pow(R(), 4), R() < 0.2 ? 0 : R() < 0.8 ? 1 : 2);
  /* the Milky Way: stars and haze along the galactic plane */
  const GP = { ra: 192.859 * D2R, dec: 27.128 * D2R, l: 122.932 * D2R };
  function gal2eq(l, b) {
    const sd = Math.sin(b) * Math.sin(GP.dec) + Math.cos(b) * Math.cos(GP.dec) * Math.cos(GP.l - l);
    const ra = GP.ra + Math.atan2(Math.cos(b) * Math.sin(GP.l - l), Math.sin(b) * Math.cos(GP.dec) - Math.cos(b) * Math.sin(GP.dec) * Math.cos(GP.l - l));
    return [ra * R2D, Math.asin(sd) * R2D];
  }
  const gauss = () => (R() + R() + R() + R() - 2) / 2;
  for (let i = 0; i < 2600; i++) {
    const l = R() * TAU, core = Math.cos(l) * 0.5 + 0.5, b = gauss() * (4 + core * 9) * D2R;
    const [ra, dec] = gal2eq(l, b);
    addStar(ra, dec, 6.2 + R() * 0.9, R() < 0.5 ? 1 : 0);
  }
  const haze = Array.from({ length: 200 }, () => {
    const l = R() * TAU, core = Math.cos(l) * 0.5 + 0.5, b = gauss() * (3 + core * 7) * D2R;
    const [ra, dec] = gal2eq(l, b);
    return { ra, sd: Math.sin(dec * D2R), cd: Math.cos(dec * D2R), size: (5 + R() * 9 + core * 8) * D2R, a: 0.25 + core * 0.75, warm: core > 0.6 && R() < 0.6, dark: R() < 0.12 && core > 0.5 };
  });

  /* ================= sprites ================= */
  function sprite(size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  }
  const glowS = STAR_COL.map(c => sprite(64, [[0, 'rgba(255,255,255,1)'], [0.12, css(c, 0.9)], [0.35, css(c, 0.18)], [1, css(c, 0)]]));
  const hazeS = sprite(128, [[0, 'rgba(200,210,255,.5)'], [0.5, 'rgba(160,170,230,.18)'], [1, 'rgba(150,160,220,0)']]);
  const hazeW = sprite(128, [[0, 'rgba(255,225,190,.55)'], [0.5, 'rgba(240,200,170,.2)'], [1, 'rgba(230,190,160,0)']]);
  const softDot = sprite(64, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);

  /* the moon's face: the near side of the real lunar map (js/moon.js) */
  const moonTex = MoonMap.disk(320);
  const moonGlow = sprite(128, [[0, 'rgba(225,232,255,.95)'], [0.12, 'rgba(200,214,255,.42)'], [0.4, 'rgba(160,180,240,.1)'], [1, 'rgba(150,170,230,0)']]);

  /* cloud puffs: alpha masks, tinted each second to the current light */
  const moonCv = document.createElement('canvas'), clouds = [];
  const cloudMasks = Array.from({ length: 6 }, (_, k) => {
    const w = 320, h = 160, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = w * (0.15 + R() * 0.7), y = h * (0.35 + R() * 0.4) + (x - w / 2) ** 2 / w * 0.25, r = h * (0.12 + R() * 0.3);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    /* feather the edges: puffs near the border were clipped into hard rectangles */
    g.globalCompositeOperation = 'destination-in';
    g.setTransform(1, 0, 0, h / w, 0, 0);
    const fe = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    fe.addColorStop(0.45, 'rgba(0,0,0,1)'); fe.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fe; g.fillRect(0, 0, w, w);
    return c;
  });
  const cloudTint = cloudMasks.map(m => { const c = document.createElement('canvas'); c.width = m.width; c.height = m.height; return c; });
  const cloudShade = cloudMasks.map(m => { const c = document.createElement('canvas'); c.width = m.width; c.height = m.height; return c; });
  function tintClouds(top, bottom) {
    cloudMasks.forEach((m, i) => {
      [[cloudTint[i], top], [cloudShade[i], bottom]].forEach(([c, col]) => {
        const g = c.getContext('2d');
        g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, c.width, c.height); g.drawImage(m, 0, 0);
        g.globalCompositeOperation = 'source-in'; g.fillStyle = css(col); g.fillRect(0, 0, c.width, c.height);
      });
    });
  }

  /* ================= mountains: periodic ridges around the full horizon ================= */
  const RN = 8192;
  const LAYERS = [0, 1, 2, 3].map(i => {
    const terms = [];
    for (let k = 0; k < 14; k++) {
      const f = Math.round((2 + i * 2) * Math.pow(1.7, k * 0.6)) + k;
      terms.push([f, (1 / Math.pow(1.45, k)) * (0.6 + R() * 0.6), R() * TAU, R() < 0.5]);
    }
    /* the ridge is 14 sines per sample and was evaluated ~1600 times a frame: bake it once into a table */
    const lut = new Float32Array(RN + 1);
    for (let j = 0; j <= RN; j++) {
      const az = j / RN * TAU;
      let v = 0, n = 0;
      for (const [f, a, ph, sharp] of terms) { const s = Math.sin(f * az + ph); v += (sharp ? 1 - Math.abs(s) * 2 : s) * a; n += a; }
      lut[j] = v / n;
    }
    return { i, lut, base: [-0.035, 0.0, 0.045, 0.1][i], amp: [0.11, 0.085, 0.07, 0.05][i], par: [4, 10, 22, 44][i] };
  });
  function ridge(L, az) {
    let u = az / TAU; u = (u - Math.floor(u)) * RN;
    const j = u | 0, f = u - j;
    return L.lut[j] + (L.lut[j + 1] - L.lut[j]) * f;
  }
  const villages = Array.from({ length: 70 }, () => ({ az: R() * TAU, dy: 0.2 + R() * 0.8, ph: R() * TAU, warm: R() < 0.85 }));
  const hash = x => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };

  /* ================= weather ================= */
  /* wdir: where the wind blows FROM, degrees (west wind is the usual over Richmond Hill); gust 0..1 */
  const PRESET = {
    clear: { cloud: 0.06, rain: 0, snow: 0, storm: 0, fog: 0, wind: 0.15, gust: 0.1, wdir: 270, label: 'clear' },
    rain: { cloud: 0.85, rain: 0.7, snow: 0, storm: 0, fog: 0.25, wind: 0.3, gust: 0.35, wdir: 240, label: 'rain' },
    snow: { cloud: 0.75, rain: 0, snow: 0.85, storm: 0, fog: 0.2, wind: 0.15, gust: 0.25, wdir: 300, label: 'snow' },
    blizzard: { cloud: 1, rain: 0, snow: 1, storm: 0, fog: 0.65, wind: 1, gust: 1, wdir: 320, label: 'blizzard' },
    storm: { cloud: 1, rain: 1, snow: 0, storm: 1, fog: 0.3, wind: 0.75, gust: 0.8, wdir: 230, label: 'thunderstorm' },
    fog: { cloud: 0.5, rain: 0, snow: 0, storm: 0, fog: 0.95, wind: 0.05, gust: 0, wdir: 270, label: 'fog' },
  };
  let target = { ...PRESET.clear }, wx = { ...PRESET.clear }, live = null, lastFetch = 0, snowCover = 0, frozen = 0;
  function fromCode(c, cc, wind) {
    const o = { cloud: Math.min(1, (+cc || 0) / 100), rain: 0, snow: 0, storm: 0, fog: 0, wind: Math.min(1, (+wind || 0) / 45), gust: 0, wdir: 270, label: 'clear' };
    if (c === 1) o.label = 'mostly clear'; else if (c === 2) o.label = 'partly cloudy'; else if (c === 3) o.label = 'overcast';
    else if (c === 45 || c === 48) { o.fog = 0.85; o.label = 'fog'; }
    else if (c >= 51 && c <= 57) { o.rain = 0.25; o.fog = 0.2; o.label = 'drizzle'; }
    else if (c >= 61 && c <= 67) { o.rain = c <= 61 ? 0.4 : c <= 63 ? 0.65 : 0.95; o.label = c <= 61 ? 'light rain' : c <= 63 ? 'rain' : 'heavy rain'; }
    else if (c >= 71 && c <= 77) { o.snow = c <= 71 ? 0.4 : c <= 73 ? 0.7 : 1; o.label = c <= 71 ? 'light snow' : 'snow'; }
    else if (c >= 80 && c <= 82) { o.rain = 0.5 + (c - 80) * 0.2; o.label = 'showers'; }
    else if (c === 85 || c === 86) { o.snow = 0.7; o.label = 'snow showers'; }
    else if (c >= 95) { o.rain = 0.9; o.storm = 1; o.cloud = Math.max(o.cloud, 0.9); o.label = 'thunderstorm'; }
    return o;
  }
  async function fetchWeather() {
    if (Store.get('weather') !== 'live') return;
    lastFetch = Date.now();
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&timezone=America%2FToronto&forecast_days=1`
        + '&current=temperature_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
        + '&daily=temperature_2m_max,temperature_2m_min';
      const j = await (await fetch(u)).json(), c = j.current, d = j.daily || {};
      const num = v => isFinite(v) && v !== null ? Math.round(v) : undefined;
      live = {
        ...fromCode(+c.weather_code, c.cloud_cover, c.wind_speed_10m),
        wdir: isFinite(c.wind_direction_10m) ? +c.wind_direction_10m : 270,
        gust: Math.min(1, Math.max(0, ((+c.wind_gusts_10m || 0) - (+c.wind_speed_10m || 0)) / 30)),
        temp: num(c.temperature_2m), feels: num(c.apparent_temperature),
        hi: num(d.temperature_2m_max && d.temperature_2m_max[0]), lo: num(d.temperature_2m_min && d.temperature_2m_min[0]),
      };
      if (Store.get('weather') === 'live') target = live;
    } catch (e) { live = null; }
    /* snow on the ground, if any: a separate call so a bad field can never break the main one */
    try {
      const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=snow_depth&forecast_hours=1&timezone=America%2FToronto`)).json();
      const sd = j.hourly && j.hourly.snow_depth && j.hourly.snow_depth[0];
      if (live && isFinite(sd)) { live.ground = Math.min(1, sd / 0.1); snowCover = Math.max(snowCover, live.ground); }
    } catch (e) {}
  }
  function setWeather(mode) {
    if (mode === 'live') { target = live || { ...PRESET.clear, label: '' }; if (Date.now() - lastFetch > 6e4) fetchWeather(); }
    else target = PRESET[mode] || PRESET.clear;
  }

  /* particles in camera space */
  const drops = [], flakes = [], splashes = [];
  const spawnDrop = top => ({ x: (R() - 0.5) * 30, y: top ? 9 + R() * 4 : -2 + R() * 14, z: 0.8 + R() * 22, v: 0.28 + R() * 0.12 });
  const spawnFlake = top => ({ x: (R() - 0.5) * 30, y: top ? 9 + R() * 3 : -2 + R() * 13, z: 0.6 + R() * 18, v: 0.012 + R() * 0.02, ph: R() * TAU, s: 0.5 + R() });

  let bolt = null, nextBolt = 0, flash = 0;
  function makeBolt() {
    const x0 = W * (0.1 + R() * 0.8), y0 = hy - H * (0.45 + R() * 0.15), y1 = hy + H * 0.04;
    const segs = [];
    (function walk(x, y, ang, len, depth) {
      let px = x, py = y;
      while (py < y1 && len > 0) {
        const nx = px + Math.sin(ang) * 14 + (R() - 0.5) * 18, ny = py + 12 + R() * 10;
        segs.push([px, py, nx, ny, depth]);
        px = nx; py = ny; len--;
        ang += (R() - 0.5) * 0.4;
        if (depth < 2 && R() < 0.08) walk(px, py, ang + (R() - 0.5) * 1.6, 8 + R() * 14, depth + 1);
      }
    })(x0, y0, (R() - 0.5) * 0.5, 999, 0);
    return { segs, life: 1, t: 0 };
  }

  /* ================= time: real, or a timelapse that runs 720x ================= */
  let skyMs = Date.now(), lastReal = Date.now();
  function tickTime() {
    const now = Date.now(), d = now - lastReal; lastReal = now;
    if (Store.get('skyMode') === 'timelapse') skyMs += d * 720;
    else skyMs += (now - skyMs) * 0.08;
  }

  /* ================= sky colour by sun altitude ================= */
  const KEYS = [
    [-90, '#010208', '#040814'], [-18, '#02040c', '#0a1128'], [-12, '#050b20', '#1a1d44'], [-6, '#0d1742', '#51306a'],
    [-2, '#1d2d68', '#d0606a'], [1, '#2b4b8e', '#ff9a5e'], [6, '#3564a8', '#ffc98a'], [14, '#3576c6', '#a9d0f0'], [90, '#2a64d0', '#bfe0f7'],
  ].map(([a, z, h]) => [a, hex(z), hex(h)]);
  function skyAt(alt) {
    for (let i = 1; i < KEYS.length; i++) if (alt <= KEYS[i][0]) {
      const [a0, z0, h0] = KEYS[i - 1], [a1, z1, h1] = KEYS[i], t = (alt - a0) / (a1 - a0);
      return [mixA(z0, z1, t), mixA(h0, h1, t)];
    }
    return [KEYS[KEYS.length - 1][1], KEYS[KEYS.length - 1][2]];
  }

  /* ================= state shared with others ================= */
  const S = { dark: 1, sunAlt: -30, moonAlt: 0, illum: 0.5, info: '' }, G = { ready: false };
  let tintTimer = 0, satellite = null, nextSat = performance.now() + 20000;
  const mouse = FX.mouse;
  let yawT = Math.PI, pitchT = 20 * D2R;

  function drawLake(ly, ridges, now, glint, near) {
    if (ly >= H) return;
    const zenC = BGsky.zen, horC = BGsky.hor;
    const g = ctx.createLinearGradient(0, ly, 0, H);
    g.addColorStop(0, css(mixA(horC, [1, 1, 1], 0.05)));
    g.addColorStop(0.5, css(mixA(horC, zenC, 0.6)));
    g.addColorStop(1, css(mixA(zenC, near, 0.35)));
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = g; ctx.fillRect(0, ly, W, H - ly);
    /* upside-down mountains */
    ctx.save();
    ctx.beginPath(); ctx.rect(0, ly, W, H - ly); ctx.clip();
    ridges.forEach(({ pts, col }, i) => {
      ctx.beginPath(); ctx.moveTo(-10, ly);
      for (let j = 0; j < pts.length; j += 2) ctx.lineTo(pts[j], ly + (ly - pts[j + 1]) * 0.85 + Math.sin(pts[j] * 0.05 + now * 0.002) * 0.8);
      ctx.lineTo(W + 10, ly); ctx.closePath();
      ctx.globalAlpha = 0.5 + i * 0.12; ctx.fillStyle = css(mixA(col, horC, 0.15)); ctx.fill();
    });
    ctx.restore();
    /* the glitter path of the moon or sun */
    ctx.globalCompositeOperation = 'lighter';
    if (glint && glint.a > 0.02 && glint.x > -200 && glint.x < W + 200) {
      const t = now * 0.001, span = H - ly, colW = 14 + span * 0.3;
      /* the soft column: stacked bands, each fading in from the shore, so it has no hard edge */
      for (let b = 0; b < 10; b++) {
        const y0 = ly + span * b / 10, w = 8 + (colW - 8) * (b + 0.5) / 10;
        const bg = ctx.createLinearGradient(glint.x - w, 0, glint.x + w, 0);
        bg.addColorStop(0, css(glint.c, 0)); bg.addColorStop(0.5, css(glint.c, 1)); bg.addColorStop(1, css(glint.c, 0));
        ctx.globalAlpha = glint.a * 0.07 * (1 - frozen * 0.5) * (1 - b / 12); ctx.fillStyle = bg;
        ctx.fillRect(glint.x - w, y0, w * 2, span / 10 + 1);
      }
      ctx.fillStyle = css(glint.c);
      const calmWater = 1 - frozen * 0.8;
      for (let y = ly + 1; y < H; y += 2) {
        const d = (y - ly) / span, row = y | 0;
        for (let k = 0; k < 3; k++) {
          const n = hash(row * 1.7 + k * 31.3 + Math.floor(t * (3 + k * 2) + row * 0.37));
          if (n < 0.55) continue;
          const spread = 4 + d * d * 150, off = (hash(row * 3.1 + k * 7.7 + Math.floor(t * 2 + k)) - 0.5) * 2 * spread * (0.35 + d);
          const w = (2 + d * 30) * (n - 0.45);
          ctx.globalAlpha = glint.a * (n - 0.5) * 1.7 * (1 - d * 0.45) * calmWater;
          ctx.fillRect(glint.x + off - w / 2, y, w, 0.7 + d * 1.3);
        }
      }
    }
    /* raindrops ringing the water: each ring is a pure function of time, so there is nothing to track */
    const ringN = Math.round(wx.rain * (1 - frozen) * (LITE() ? 28 : 70));
    if (ringN > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 0.8;
      ctx.strokeStyle = css(mixA(horC, [1, 1, 1], 0.35));
      const t = now / 900;
      for (let i = 0; i < ringN; i++) {
        const cyc = t + hash(i * 3.7), n = Math.floor(cyc), u = cyc - n;
        const d = Math.pow(hash(i * 7.3 + n * 1.3), 0.7), y = ly + 3 + d * (H - ly - 3), x = hash(i * 5.1 + n * 2.9) * W;
        const r = (2 + d * 26) * u;
        ctx.globalAlpha = (1 - u) * (0.12 + d * 0.3);
        ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.18 + d * 0.12), 0, 0, TAU); ctx.stroke();
      }
    }
    /* ice: a pale sheen, frost at the shore and long pressure cracks */
    if (frozen > 0.02) {
      ctx.globalCompositeOperation = 'source-over';
      const ice = mixA(mixA(horC, [0.78, 0.86, 0.95], 0.45), [0, 0, 0], S.dark * 0.35);
      const ig = ctx.createLinearGradient(0, ly, 0, H);
      ig.addColorStop(0, css(ice, 0.55 * frozen)); ig.addColorStop(0.25, css(ice, 0.28 * frozen)); ig.addColorStop(1, css(ice, 0.4 * frozen));
      ctx.globalAlpha = 1; ctx.fillStyle = ig; ctx.fillRect(0, ly, W, H - ly);
      ctx.strokeStyle = css(mixA(ice, [1, 1, 1], 0.5), 0.22 * frozen); ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        let x = hash(i * 9.1) * W, y = ly + 4 + hash(i * 4.7) * (H - ly) * 0.9;
        ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (hash(i * 13 + s) - 0.3) * 90; y += (hash(i * 17 + s) - 0.5) * 8; ctx.lineTo(x, y); }
      }
      ctx.stroke();
    }
    /* ripples drifting toward the shore */
    ctx.globalAlpha = 1 - frozen * 0.85;
    for (let i = 0; i < 26; i++) {
      const y = ly + Math.pow((i * 0.618 + now * 0.00003 * (1 + wx.wind * 4)) % 1, 1.6) * (H - ly), d = (y - ly) / (H - ly);
      const x = hash(i * 13.1) * W, w = 30 + d * 180;
      ctx.fillStyle = css(horC, 0.05 + d * 0.05);
      ctx.fillRect(x - w / 2, y, w, 1);
    }
    /* shoreline haze */
    const hz = ctx.createLinearGradient(0, ly - 6, 0, ly + 14);
    hz.addColorStop(0, css(horC, 0)); hz.addColorStop(0.5, css(horC, 0.25)); hz.addColorStop(1, css(horC, 0));
    ctx.fillStyle = hz; ctx.fillRect(0, ly - 6, W, 20);
    ctx.globalCompositeOperation = 'source-over';
  }
  let BGsky = { zen: [0, 0, 0], hor: [0, 0, 0] };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, LITE() ? 1 : [2, 1.5, 1, 1][QUALITY.tier]);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    focal = (H / 2) / Math.tan(cam.fov / 2);
  }

  function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  /* the star layer: Milky Way haze, stars and constellation figures, painted at the current camera */
  const starCv = document.createElement('canvas'), starCam = { yaw: 0, pitch: 0 };
  let starAge = 1e9, starVis = -1, starW = 0, starH = 0;
  function paintStars(lst, vis, lite, p, now) {
    const ctx = starCv.getContext('2d');
    if (starCv.width !== cv.width || starCv.height !== cv.height) { starCv.width = cv.width; starCv.height = cv.height; }
    starW = cv.width; starH = cv.height;
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    const scint = Store.get('motion') === 'calm' ? 0.12 : 0.3;

    /* Milky Way haze */
    if (vis > 0.02 && !lite) {
      ctx.globalCompositeOperation = 'lighter';
      const sp = Math.sin(loc.lat * D2R), cp = Math.cos(loc.lat * D2R);
      for (const h of haze) {
        const HA = (lst - h.ra) * D2R;
        const alt = Math.asin(sp * h.sd + cp * h.cd * Math.cos(HA));
        if (alt < -0.05) continue;
        const az = Math.atan2(-Math.sin(HA) * h.cd, cp * h.sd - sp * h.cd * Math.cos(HA));
        project(alt, az); if (P[2] < 0) continue;
        const r = h.size * focal / P[2];
        ctx.globalAlpha = h.a * vis * 0.1 * sstep(-0.05, 0.3, alt);
        if (h.dark) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha *= 1.4; ctx.drawImage(hazeS, P[0] - r * 0.4, P[1] - r * 0.2, r * 0.8, r * 0.4); ctx.globalCompositeOperation = 'lighter'; continue; }
        ctx.drawImage(h.warm ? hazeW : hazeS, P[0] - r, P[1] - r, r * 2, r * 2);
      }
    }

    /* stars */
    if (vis > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const sp = Math.sin(loc.lat * D2R), cp = Math.cos(loc.lat * D2R), t = now * 0.001;
      const buckets = [[], [], []];
      for (const s of stars) {
        if (lite && s.mag > 5.4) { s.a = 0; continue; }
        const HA = (lst - s.ra) * D2R, cH = Math.cos(HA);
        const salt = sp * s.sd + cp * s.cd * cH;
        if (salt < -0.02) { s.a = 0; continue; }
        const alt = Math.asin(salt), az = Math.atan2(-Math.sin(HA) * s.cd, cp * s.sd - sp * s.cd * cH);
        project(alt, az); if (P[2] < 0) { s.a = 0; continue; }
        const ext = sstep(-0.01, 0.35, salt), tw = 1 - scint * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)) * (1.4 - ext);
        s.x = P[0]; s.y = P[1];
        s.a = Math.pow(clamp((6.9 - s.mag) / 5.2, 0.08, 1), 0.72) * vis * ext * tw;
        if (s.a > 0.01) buckets[s.col].push(s);
      }
      buckets.forEach((b, ci) => {
        ctx.fillStyle = css(STAR_COL[ci]);
        for (const s of b) {
          const r = Math.max(0.7, (4.6 - s.mag) * 0.45);
          ctx.globalAlpha = s.a;
          if (s.mag < 2.2) {
            const g = r * 7;
            ctx.drawImage(glowS[ci], s.x - g / 2, s.y - g / 2, g, g);
            if (s.mag < 0.6) {
              ctx.globalAlpha = s.a * 0.35; ctx.fillRect(s.x - r * 7, s.y - 0.4, r * 14, 0.8); ctx.fillRect(s.x - 0.4, s.y - r * 7, 0.8, r * 14);
            }
          } else ctx.fillRect(s.x - r / 2, s.y - r / 2, r, r);
        }
      });
      /* the real planets, where they actually are tonight: steady (planets do not twinkle) and labelled */
      ctx.font = '500 8px "JetBrains Mono", Consolas, monospace'; ctx.textAlign = 'left';
      for (const pl of Astro.planets(skyMs)) {
        const [alt, az] = altaz(pl.ra, pl.dec, lst);
        if (alt < -0.01) continue;
        project(alt, az); if (P[2] < 0) continue;
        const a = vis * sstep(-0.01, 0.12, alt), g = 10 + (1.5 - pl.mag) * 3.2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a; ctx.drawImage(glowS[1], P[0] - g / 2, P[1] - g / 2, g, g);
        ctx.fillStyle = css(pl.col); ctx.beginPath(); ctx.arc(P[0], P[1], Math.max(1.1, 1.9 - pl.mag * 0.25), 0, TAU); ctx.fill();
        if (Store.get('lines')) {
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.5;
          ctx.fillStyle = css(pl.col); ctx.fillText(pl.name.toUpperCase(), P[0] + 7, P[1] - 6);
        }
      }
      ctx.textAlign = 'center';
      /* constellation lines and names */
      if (Store.get('lines') && vis > 0.15) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 0.8;
        ctx.font = '500 9px "JetBrains Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        for (const [name, lines] of CONS) {
          let sx = 0, sy = 0, n = 0;
          ctx.strokeStyle = css(hex(p.t2), 0.16 * vis);
          ctx.beginPath();
          for (const [a, b] of lines) {
            const A = idx[a], B = idx[b];
            if (A.a <= 0.01 || B.a <= 0.01) continue;
            const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy); if (L < 1 || L > W) continue;
            const g = Math.min(7, L * 0.2);
            ctx.moveTo(A.x + dx / L * g, A.y + dy / L * g); ctx.lineTo(B.x - dx / L * g, B.y - dy / L * g);
            sx += A.x + B.x; sy += A.y + B.y; n += 2;
          }
          ctx.stroke();
          if (n >= 4) { ctx.fillStyle = css(hex(p.t2), 0.28 * vis); ctx.fillText(name.toUpperCase().split('').join(' '), sx / n, sy / n + 26); }
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  let acc = 0, skipF = false;
  function frame(dt, now) {
    /* a window can report 0x0 while it is still opening; wait until it has a real size */
    if (!W || !H || W !== innerWidth || H !== innerHeight) { if (!innerWidth || !innerHeight) return; resize(); }
    /* self-repair: one bad number (a broken saved location, a clock jump) would otherwise poison the camera forever */
    if (!isFinite(skyMs)) skyMs = Date.now();
    if (!isFinite(cam.yaw) || !isFinite(cam.pitch)) { cam.yaw = Math.PI; cam.pitch = 20 * D2R; }
    const lite = LITE();
    if (lite) { acc += dt; skipF = !skipF; if (skipF) { tickTime(); return; } dt = acc; acc = 0; }
    tickTime();
    const k = Math.min(3, dt / 16.67);
    for (const key of ['cloud', 'rain', 'snow', 'storm', 'fog', 'wind', 'gust']) { wx[key] += ((+target[key] || 0) - wx[key]) * Math.min(1, dt / 2500); if (!isFinite(wx[key])) wx[key] = 0; }
    wx.wdir += wrap(((+target.wdir || 270) - wx.wdir) * D2R) * R2D * Math.min(1, dt / 4000);
    if (!isFinite(wx.wdir)) wx.wdir = 270;
    if (Store.get('weather') === 'live' && Date.now() - lastFetch > 15 * 6e4) fetchWeather();
    /* snow piles up while it falls (about three minutes to a full cover) and melts slowly once it stops above freezing */
    const cold = live && live.temp !== undefined && Store.get('weather') === 'live' ? live.temp <= 0 : wx.snow > 0.3;
    if (wx.snow > 0.05) snowCover = Math.min(1, snowCover + dt / 180000 * wx.snow * 1.5);
    else snowCover = Math.max(live && live.ground ? live.ground : 0, snowCover - dt / (cold ? 1.2e6 : 240000));
    frozen += ((cold || wx.snow > 0.5 ? 1 : 0) - frozen) * Math.min(1, dt / 20000);

    /* astronomy for this instant: topocentric moon (parallax and refraction), true phase */
    const lst = lstDeg(skyMs), sun = sunEq(skyMs), moon = moonEq(skyMs);
    const [sAlt, sAz] = altaz(sun.ra, sun.dec, lst), [mAlt, mAz] = altaz(moon.ra, moon.dec, lst, moon.par);
    const ph = Astro.phase(sun, moon), illum = ph.illum, waxing = ph.waxing;
    const sunDeg = sAlt * R2D, dark = sstep(-2, -14, sunDeg), cloud = wx.cloud;
    S.dark = dark; S.sunAlt = sunDeg; S.moonAlt = mAlt * R2D; S.illum = illum; S.waxing = waxing;

    /* camera: face the equator, drift slowly, keep the moon (or sun) in frame */
    const south = loc.lat >= 0 ? Math.PI : 0;
    let focus = south;
    const body = mAlt > 0.02 && (dark > 0.3 || sAlt < 0) ? mAz : sAlt > 0.02 ? sAz : null;
    if (body !== null) focus = body + (wrap(south - body) >= 0 ? 0.62 : -0.62);
    const bodyAlt = body === mAz ? mAlt : sAlt;
    yawT = focus + Math.sin(now / 95000) * 0.1 + (mouse.nx || 0) * 0.18;
    pitchT = clamp((body !== null ? bodyAlt * R2D - 24 : 16), 10, 26) * D2R - (mouse.ny || 0) * 0.08 + Math.sin(now / 70000) * 0.02;
    cam.yaw += wrap(yawT - cam.yaw) * 0.02 * k;
    cam.pitch += (pitchT - cam.pitch) * 0.02 * k;
    camPrep();
    hy = H / 2 + Math.tan(cam.pitch) * focal;

    /* colours of the air */
    let [zen, hor] = skyAt(sunDeg);
    const p = pal(), tint = hex(p.b), grayZ = (zen[0] + zen[1] + zen[2]) / 3, grayH = (hor[0] + hor[1] + hor[2]) / 3;
    zen = mixA(zen, tint.map(v => v * 0.09), dark * 0.35);
    hor = mixA(hor, tint.map(v => v * 0.16), dark * 0.25);
    const overcast = cloud * 0.75 + wx.storm * 0.2;
    zen = mixA(zen, [grayZ * 0.85, grayZ * 0.88, grayZ * 0.95], overcast).map(v => v * (1 - wx.storm * 0.45));
    hor = mixA(hor, [grayH * 0.9, grayH * 0.92, grayH * 0.98], overcast).map(v => v * (1 - wx.storm * 0.4));
    if (flash > 0) { zen = zen.map(v => v + flash * 0.5); hor = hor.map(v => v + flash * 0.6); }

    /* the glow source for the shader: sun near the horizon, otherwise the moon */
    let glowP = [0, -2], glowC = [0, 0, 0], glowA = 0;
    if (sunDeg > -10) {
      project(sAlt, sAz);
      if (P[2] > 0) {
        glowP = [(P[0] - W / 2) / H, (H / 2 - P[1]) / H];
        glowC = mixA(hex('#ff8a4a'), hex('#fff1d0'), sstep(0, 20, sunDeg));
        glowA = sstep(-10, 1, sunDeg) * (1 - cloud * 0.65);
      }
    } else if (mAlt > -0.05) {
      project(mAlt, mAz);
      if (P[2] > 0) { glowP = [(P[0] - W / 2) / H, (H / 2 - P[1]) / H]; glowC = [0.45, 0.55, 0.8]; glowA = illum * 0.35 * (1 - cloud * 0.5); }
    }
    BGsky = { zen, hor };
    BG.sky({ zen, hor, sunP: glowP, sunC: glowC, sunA: glowA, horY: 1 - hy / H, yaw: cam.yaw, aur: (0.1 + 0.9 * dark) * (1 - cloud * (Store.get('motion') === 'wild' ? 0.35 : 0.75)) });

    ctx.clearRect(0, 0, W, H);
    const vis = dark * (1 - cloud * 0.92);

    /* the star field is the costly part (thousands of stars, each with its own trig): paint it into its
       own layer about ten times a second, and slide that layer with the camera in between */
    starAge += dt;
    if (vis > 0.01) {
      let ox = 0, oy = 0, fresh = starAge > 100 * (1 + (window.QUALITY ? QUALITY.tier : 0)) || starW !== cv.width || starH !== cv.height || Math.abs(starVis - vis) > 0.04;
      if (!fresh) {
        project(starCam.pitch, starCam.yaw);
        ox = P[0] - W / 2; oy = P[1] - H / 2;
        if (P[2] < 0 || Math.abs(ox) + Math.abs(oy) > 40) fresh = true;
      }
      if (fresh) {
        paintStars(lst, vis, lite, p, now);
        starAge = 0; starVis = vis; starCam.yaw = cam.yaw; starCam.pitch = cam.pitch; ox = oy = 0;
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.drawImage(starCv, ox, oy, W, H);
    }

    /* satellites crossing the dark sky */
    if (!satellite && now > nextSat && dark > 0.4) {
      const a0 = R() * TAU;
      satellite = { az0: a0, az1: a0 + Math.PI * (0.6 + R() * 0.4) * (R() < 0.5 ? 1 : -1), alt0: 0.1 + R() * 0.3, peak: 0.6 + R() * 0.7, t: 0, dur: 30000 + R() * 25000 };
    }
    if (satellite) {
      satellite.t += dt;
      const u = satellite.t / satellite.dur;
      if (u >= 1) { satellite = null; nextSat = now + 40000 + R() * 80000; }
      else {
        const az = lerp(satellite.az0, satellite.az1, u), alt = satellite.alt0 + Math.sin(u * Math.PI) * satellite.peak * 0.8;
        project(alt, az);
        if (P[2] > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = vis * Math.sin(u * Math.PI) * (u > 0.8 ? (1 - u) * 5 : 1);
          ctx.drawImage(glowS[1], P[0] - 5, P[1] - 5, 10, 10);
        }
      }
    }

    /* the sun */
    ctx.globalAlpha = 1;
    let glint = null;
    if (sAlt > -0.04) {
      project(sAlt, sAz);
      if (P[2] > 0) {
        const sx = P[0], sy = P[1], r = focal * 0.014, a = (1 - cloud * 0.85);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.drawImage(softDot, sx - r * 3, sy - r * 3, r * 6, r * 6);
        ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
        glint = { x: sx, c: mixA(hex('#ffb070'), hex('#fff4dc'), sstep(0, 25, sunDeg)), a: a * sstep(-2, 4, sunDeg) };
        /* lens flare ghosts along the axis through the screen centre */
        const cx = W / 2, cyy = H / 2, dx = cx - sx, dy = cyy - sy;
        [[0.3, 0.05, p.a], [0.55, 0.02, p.c], [0.8, 0.08, p.b], [1.25, 0.04, p.a], [1.6, 0.12, p.b]].forEach(([t, s, c]) => {
          ctx.globalAlpha = a * 0.09 * sstep(-2, 8, sunDeg);
          const rr = focal * s;
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx + dx * t, sy + dy * t, rr, 0, TAU); ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    }

    /* the moon, with its real phase and the bright limb facing the sun */
    if (mAlt > -0.03) {
      project(mAlt, mAz);
      if (P[2] > 0) {
        const mx = P[0], my = P[1], r = Math.max(20, focal * 0.05);
        const a = (1 - cloud * 0.75) * (0.55 + 0.45 * sstep(-2, -8, sunDeg));
        if (!glint || dark > 0.5) glint = { x: mx, c: [0.85, 0.9, 1], a: a * illum * dark };
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * (0.1 + illum * 0.4);
        ctx.drawImage(moonGlow, mx - r * 12, my - r * 12, r * 24, r * 24);
        ctx.globalAlpha = a * (0.15 + illum * 0.5);
        ctx.drawImage(moonGlow, mx - r * 3.2, my - r * 3.2, r * 6.4, r * 6.4);
        if (cloud > 0.15 && cloud < 0.7 && illum > 0.5 && dark > 0.5) {
          const hr = 22 * D2R * focal;
          ctx.globalAlpha = 0.028 * (1 - Math.abs(cloud - 0.42) * 3) * illum;
          ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = hr * 0.05;
          ctx.beginPath(); ctx.arc(mx, my, hr, 0, TAU); ctx.stroke();
        }
        /* direction to the sun on screen */
        const sDir = project(sAlt, sAz), sOk = P[2];
        let ang;
        if (sOk > 0) ang = Math.atan2(P[1] - my, P[0] - mx);
        else {
          const [a2, z2] = [sAlt, sAz], ca = Math.cos(a2);
          const x = ca * Math.sin(z2), y = Math.sin(a2), z = ca * Math.cos(z2);
          const x1 = x * cy_ - z * sy_, z1 = x * sy_ + z * cy_, y2 = y * cp_ - z1 * sp_;
          ang = Math.atan2(-y2, x1);
        }
        const ms = Math.ceil(r * 2 + 4);
        if (moonCv.width !== ms) moonCv.width = moonCv.height = ms;
        const g = moonCv.getContext('2d'), e = r * (1 - 2 * illum);
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.clearRect(0, 0, ms, ms);
        g.drawImage(moonTex, ms / 2 - r, ms / 2 - r, r * 2, r * 2);
        g.translate(ms / 2, ms / 2); g.rotate(ang);
        g.globalCompositeOperation = 'destination-out';
        g.beginPath();
        g.arc(0, 0, r + 1, Math.PI / 2, Math.PI * 1.5);
        g.ellipse(0, 0, Math.abs(e) + 0.01, r + 1, 0, -Math.PI / 2, Math.PI / 2, e < 0);
        g.closePath(); g.fill();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'destination-over'; g.globalAlpha = 0.09 * dark * (1 - illum * 0.6);
        g.drawImage(moonTex, ms / 2 - r, ms / 2 - r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        ctx.drawImage(moonCv, mx - ms / 2, my - ms / 2);
        ctx.globalAlpha = 1;
      }
    }

    /* moonlight / sunlight for everything below */
    const moonUp = sstep(-0.02, 0.2, mAlt) * illum;
    const light = sunDeg > -4 ? mixA(hex('#ff9a60'), hex('#ffffff'), sstep(0, 25, sunDeg)).map(v => v * sstep(-6, 8, sunDeg)) : [0.5, 0.6, 0.85].map(v => v * moonUp * 0.6);

    /* clouds */
    tintTimer -= dt;
    const cloudTop = mixA(mixA(hor, [1, 1, 1], 0.25 + sstep(-4, 20, sunDeg) * 0.55), light, 0.25).map(v => v * (1 - wx.storm * 0.55) * (0.22 + 0.78 * (1 - dark)) + flash * 0.6);
    const cloudBot = mixA(cloudTop, mixA(zen, [0.1, 0.11, 0.14], wx.storm * 0.5), 0.45 + wx.storm * 0.3).map((v, i) => Math.max(v, zen[i] * 1.05) + flash * 0.4);
    if (tintTimer <= 0 || flash > 0) { tintClouds(cloudTop, cloudBot); tintTimer = 800; }
    const nClouds = Math.round(cloud * (lite ? 22 : 46));
    while (clouds.length < nClouds) clouds.push({ az: cam.yaw + (R() - 0.5) * 2.6, alt: (4 + Math.pow(R(), 1.6) * 38) * D2R, size: (10 + R() * 16) * D2R, tex: R() * 6 | 0, fade: 0, flip: R() < 0.5 });
    ctx.globalCompositeOperation = 'source-over';
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.az += (0.00006 + wx.wind * 0.0004) * k;
      c.fade = Math.min(1, c.fade + 0.004 * k);
      if (i >= nClouds) { c.fade -= 0.02 * k; if (c.fade <= 0) { clouds.splice(i, 1); continue; } }
      if (Math.abs(wrap(c.az - cam.yaw)) > 1.5) c.az = cam.yaw - 1.45 * Math.sign(wrap(c.az - cam.yaw));
      project(c.alt, c.az); if (P[2] < 0) continue;
      const w = c.size * focal / P[2] * 1.8, h = w * 0.5, x = P[0] - w / 2, y = P[1] - h / 2;
      ctx.globalAlpha = c.fade * (0.55 + cloud * 0.4) * sstep(0, 0.08, c.alt);
      ctx.drawImage(cloudShade[c.tex], x, y + h * 0.12, w, h);
      ctx.drawImage(cloudTint[c.tex], x, y, w, h * 0.92);
    }
    if (cloud > 0.6) {
      const g = ctx.createLinearGradient(0, 0, 0, hy);
      const veil = Store.get('motion') === 'wild' ? 0.5 : 1; /* wild lets the aurora glow through an overcast sky */
      g.addColorStop(0, css(cloudBot, (cloud - 0.6) * 1.6 * veil)); g.addColorStop(1, css(mixA(cloudBot, cloudTop, 0.5), (cloud - 0.6) * 1.2 * veil));
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, hy);
    }

    /* lightning */
    if (wx.storm > 0.3 && now > nextBolt) {
      bolt = makeBolt(); flash = 1;
      nextBolt = now + (4000 + R() * 14000) / (0.5 + wx.storm);
      const dist = R();
      Sound.thunder(0.4 + dist * 2.8, 1 - dist * 0.6);
    }
    if (bolt) {
      bolt.t += dt;
      const on = bolt.t < 90 || (bolt.t > 160 && bolt.t < 230) || (bolt.t > 300 && bolt.t < 340);
      if (bolt.t > 500) bolt = null;
      else if (on) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; ctx.lineCap = 'round';
        [[10, 0.08], [4, 0.35], [1.4, 1]].forEach(([w, a]) => {
          ctx.strokeStyle = `rgba(220,230,255,${a})`;
          for (let d = 0; d < 3; d++) {
            ctx.lineWidth = w / (1 + d * 0.8); ctx.beginPath();
            for (const s of bolt.segs) if (s[4] === d) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
            ctx.stroke();
          }
        });
      }
    }
    flash = Math.max(0, flash - dt / 380);

    /* mountains, a lake that holds the sky, and a pine shore */
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const far = mixA(hor, zen, 0.35);
    const near = mixA(hex('#14231c'), mixA(zen, [0, 0, 0], 0.45), dark).map(v => v + flash * 0.08);
    const step = lite ? 10 : 5, snowCap = Math.max(wx.snow * 0.6, snowCover), lakeY = hy + H * 0.1;
    const snowCol = mixA([0.86, 0.9, 1], light, 0.35).map(v => v * (0.28 + 0.72 * (1 - dark)) + 0.06 + flash * 0.5);
    const ridges = [];
    for (const L of LAYERS) {
      const t = (L.i + 1) / 4, col = mixA(far, near, 0.3 + t * 0.6);
      const px = -(mouse.nx || 0) * L.par, amp = H * L.amp;
      const base = L.i === 3 ? H + amp * 0.2 : hy + H * L.base;
      if (L.i === 3) drawLake(lakeY, ridges, now, glint, near);
      ctx.beginPath(); ctx.moveTo(-10, H);
      const pts = [];
      for (let x = -10; x <= W + 10; x += step) {
        const az = cam.yaw + Math.atan((x - px - W / 2) / focal);
        let y = base - amp * (0.5 + ridge(L, az) * 0.9);
        if (L.i === 3) y -= Math.pow(Math.abs(x / W - 0.5) * 2, 3) * H * 0.12;
        pts.push(x, y); ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 10, H); ctx.closePath();
      const g = ctx.createLinearGradient(0, base - amp, 0, L.i === 3 ? H : lakeY);
      g.addColorStop(0, css(col)); g.addColorStop(1, css(mixA(col, [0, 0, 0], 0.3)));
      ctx.fillStyle = g; ctx.fill();
      if (L.i < 3) ridges.push({ pts, col });
      /* rim light from the sun or moon, and snow on the peaks */
      if (L.i < 3) {
        ctx.beginPath();
        for (let j = 0; j < pts.length; j += 2) j ? ctx.lineTo(pts[j], pts[j + 1]) : ctx.moveTo(pts[j], pts[j + 1]);
        ctx.strokeStyle = css(light, 0.35 * (1 - t * 0.5)); ctx.lineWidth = 1; ctx.stroke();
        if (snowCap > 0.03) {
          /* snow loads the ridges: a bright crest line, then a mantle that thickens as it piles up */
          ctx.strokeStyle = css(snowCol, snowCap * 0.55 * (1 - t * 0.4)); ctx.lineWidth = 1.2 + snowCap * 1.4; ctx.stroke();
          ctx.lineTo(W + 10, H); ctx.lineTo(-10, H); ctx.closePath();
          const sg = ctx.createLinearGradient(0, base - amp * 1.4, 0, base + amp * (0.2 + snowCap * 0.6));
          sg.addColorStop(0, css(snowCol, snowCap * 0.5 * (1 - t * 0.3))); sg.addColorStop(1, css(snowCol, 0));
          ctx.fillStyle = sg; ctx.fill();
        }
      }
      /* village lights on the middle slopes, doubled in the water */
      if (L.i === 2 && dark > 0.2) {
        ctx.globalCompositeOperation = 'lighter';
        for (const v of villages) {
          const rel = wrap(v.az - cam.yaw); if (Math.abs(rel) > 1.2) continue;
          const x = W / 2 + Math.tan(rel) * focal + px;
          const y = Math.min(lakeY - 3, base - amp * (0.5 + ridge(L, v.az) * 0.9) + v.dy * H * 0.05 + 4);
          const c = v.warm ? '#ffc070' : '#bfe0ff';
          ctx.globalAlpha = dark * (0.5 + 0.5 * Math.sin(now * 0.0017 + v.ph) ** 2) * 0.9;
          ctx.fillStyle = c; ctx.fillRect(x, y, 1.6, 1.6);
          ctx.globalAlpha *= 0.25; ctx.drawImage(softDot, x - 5, y - 5, 12, 12);
          ctx.globalAlpha = dark * 0.14; ctx.fillStyle = c;
          ctx.fillRect(x, lakeY + (lakeY - y) * 0.85, 1.4, 5 + v.dy * 9);
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
      /* tall pines along the foreground shore */
      if (L.i === 3) {
        ctx.fillStyle = css(mixA(col, [0, 0, 0], 0.25));
        const trees = [];
        ctx.beginPath();
        for (let j = 0; j < pts.length; j += 2) {
          const x = pts[j], az = cam.yaw + Math.atan((x - px - W / 2) / focal), hsh = hash(Math.round(az * R2D * 2));
          const edge = Math.abs(x / W - 0.5) * 2;
          if (hsh < 0.75 - edge * 0.5) continue;
          const th = (14 + hsh * 40) * (0.6 + edge * 1.2) * H / 900, tw = th * 0.26, y = pts[j + 1] + 4;
          for (let tier = 0; tier < 3; tier++) {
            const ty = y - th * tier * 0.28, tww = tw * (1 - tier * 0.22);
            ctx.moveTo(x - tww, ty); ctx.lineTo(x, ty - th * 0.55); ctx.lineTo(x + tww, ty);
          }
          if (snowCap > 0.03) trees.push(x, y, th, tw);
        }
        ctx.fill();
        /* snow resting on the upper side of every bough */
        if (trees.length) {
          ctx.fillStyle = css(snowCol, Math.min(1, snowCap * 1.2) * 0.85);
          ctx.beginPath();
          for (let j = 0; j < trees.length; j += 4) {
            const x = trees[j], y = trees[j + 1], th = trees[j + 2], tw = trees[j + 3], s = 0.25 + snowCap * 0.3;
            for (let tier = 0; tier < 3; tier++) {
              const ty = y - th * tier * 0.28, tww = tw * (1 - tier * 0.22), top = ty - th * 0.55;
              ctx.moveTo(x, top); ctx.lineTo(x + tww * s, top + th * 0.55 * s); ctx.lineTo(x, top + th * 0.55 * s * 0.55); ctx.lineTo(x - tww * s, top + th * 0.55 * s);
            }
          }
          ctx.fill();
          const gs = ctx.createLinearGradient(0, H - H * 0.05, 0, H);
          gs.addColorStop(0, css(snowCol, 0)); gs.addColorStop(1, css(snowCol, snowCap * 0.35));
          ctx.fillStyle = gs; ctx.fillRect(0, H - H * 0.05, W, H * 0.05);
        }
      }
    }

    /* fog banks */
    const fog = Math.max(wx.fog, wx.rain * 0.25, wx.snow * 0.2);
    if (fog > 0.02) {
      const fc = mixA(hor, [0.6, 0.62, 0.68], 0.3).map(v => v * (0.5 + 0.5 * (1 - dark)) + 0.04);
      for (let i = 0; i < 3; i++) {
        const y = hy + H * (0.02 + i * 0.06), off = Math.sin(now * 0.00005 * (i + 1) + i) * W * 0.2;
        const g = ctx.createRadialGradient(W / 2 + off, y, 0, W / 2 + off, y, W * 0.8);
        g.addColorStop(0, css(fc, fog * 0.35)); g.addColorStop(1, css(fc, 0));
        ctx.fillStyle = g; ctx.save(); ctx.translate(0, y); ctx.scale(1, 0.18); ctx.translate(0, -y);
        ctx.fillRect(0, y - W, W, W * 2); ctx.restore();
      }
      ctx.fillStyle = css(fc, fog * 0.18); ctx.fillRect(0, 0, W, H);
    }

    /* rain and snow: on the GPU (js/gl3d.js) when it is running, painted here only as the fallback */
    const gpuWx = !!(window.GL3D && GL3D.weather);
    if (gpuWx) { drops.length = 0; flakes.length = 0; splashes.length = 0; }
    else {
      /* rain */
      const wind = wx.wind * (Math.sin(now * 0.0003) * 0.3 + 1);
      const nDrops = Math.round(wx.rain * (lite ? 400 : 1100));
      while (drops.length < nDrops) drops.push(spawnDrop(false));
      if (drops.length > nDrops) drops.length = nDrops;
      if (drops.length) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round';
        const rc = mixA([0.75, 0.8, 0.9], light, 0.3).map(v => v * (0.45 + 0.55 * (1 - dark)) + flash);
        const bands = [[], [], []];
        for (const d of drops) {
          d.y -= d.v * k; d.x += wind * 0.12 * k;
          if (d.y < -2) {
            if (d.z < 9 && splashes.length < 200) {
              const sx = W / 2 + d.x / d.z * focal, sy = H / 2 + 3.5 / d.z * focal;
              if (sy < H) splashes.push({ x: sx, y: sy, r: 0, s: 1 / d.z, life: 1 });
            }
            Object.assign(d, spawnDrop(true));
          }
          if (d.x > 16) d.x -= 32;
          bands[d.z < 4 ? 2 : d.z < 10 ? 1 : 0].push(d);
        }
        bands.forEach((b, bi) => {
          ctx.strokeStyle = css(rc, [0.16, 0.26, 0.38][bi]); ctx.lineWidth = [0.6, 1, 1.5][bi];
          ctx.beginPath();
          for (const d of b) {
            const sx = W / 2 + d.x / d.z * focal, sy = H / 2 - (d.y - 1.5) / d.z * focal, len = d.v * 9 / d.z * focal * 0.1;
            ctx.moveTo(sx, sy); ctx.lineTo(sx - wind * 0.12 * len * 8, sy - len);
          }
          ctx.stroke();
        });
        ctx.strokeStyle = css(rc, 0.35); ctx.lineWidth = 0.8;
        for (let i = splashes.length - 1; i >= 0; i--) {
          const s = splashes[i]; s.r += 0.6 * k; s.life -= 0.07 * k;
          if (s.life <= 0) { splashes.splice(i, 1); continue; }
          ctx.globalAlpha = s.life; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * s.s * 20, s.r * s.s * 5, 0, Math.PI, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      /* snow */
      const nFlakes = Math.round(wx.snow * (lite ? 300 : 800));
      while (flakes.length < nFlakes) flakes.push(spawnFlake(false));
      if (flakes.length > nFlakes) flakes.length = nFlakes;
      if (flakes.length) {
        ctx.globalCompositeOperation = 'lighter';
        const t = now * 0.001;
        for (const f of flakes) {
          f.y -= f.v * k; f.x += (Math.sin(t * 0.8 + f.ph) * 0.01 + wind * 0.02) * k;
          if (f.y < -2) Object.assign(f, spawnFlake(true));
          if (f.x > 16) f.x -= 32;
          const sx = W / 2 + f.x / f.z * focal, sy = H / 2 - (f.y - 1.5) / f.z * focal, r = f.s * 0.05 / f.z * focal;
          ctx.globalAlpha = Math.min(0.9, 0.25 + 1.5 / f.z) * (f.z < 1.5 ? 0.35 : 1);
          ctx.drawImage(softDot, sx - r, sy - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';

    }

    /* the lightning flash lights the whole scene */
    if (flash > 0.01) { ctx.fillStyle = `rgba(210,220,255,${flash * 0.18})`; ctx.fillRect(0, 0, W, H); }

    Sound.weather(wx.rain, wx.wind);
    S.info = describe(sunDeg, illum, waxing, sAlt);
    /* everything the GPU weather and the Orbit face need to stay in sync with this sky */
    Object.assign(G, { yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov, hy, dark, flash, light, hor, zen, sunDeg,
      rain: wx.rain, snow: wx.snow, wind: wx.wind, gust: wx.gust, wdir: wx.wdir, storm: wx.storm, fog: wx.fog, cloud,
      cover: snowCover, frozen, ready: true, lst, sun, moon, mAlt, mAz, sAlt, sAz, illum, phase: ph, skyMs });
  }

  /* next sunrise / sunset, found by stepping forward in time */
  let evCache = { at: 0, text: '' };
  function nextSunEvent() {
    if (Math.abs(skyMs - evCache.at) < 5 * 6e4) return evCache.text;
    /* altaz already adds refraction, so sunrise is the upper limb (semi-diameter 0.267°) touching the horizon */
    const alt = ms => { const s = sunEq(ms); return altaz(s.ra, s.dec, lstDeg(ms))[0] * R2D + 0.267; };
    let prev = alt(skyMs), text = '';
    for (let m = 5; m <= 26 * 60; m += 5) {
      const ms = skyMs + m * 6e4, a = alt(ms);
      if ((prev < 0) !== (a < 0)) {
        /* bracketed within five minutes: bisect down to a few seconds */
        let lo = ms - 5 * 6e4, hi = ms;
        for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; if ((alt(mid) < 0) === (prev < 0)) lo = mid; else hi = mid; }
        const d = new Date(Math.round(hi / 6e4) * 6e4);
        text = (a > 0 ? 'sunrise ' : 'sunset ') + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !Store.get('h24') }).toLowerCase();
        break;
      }
      prev = a;
    }
    evCache = { at: skyMs, text };
    return text;
  }
  const PHASES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  function describe(sunDeg, illum, waxing) {
    const parts = [];
    if (Store.get('skyMode') === 'timelapse') {
      parts.push('timelapse ' + new Date(skyMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !Store.get('h24') }).toLowerCase());
    }
    const w = Store.get('weather') === 'live' ? live : target;
    if (w && Store.get('weather') === 'live' && w.temp !== undefined) {
      parts.push(`${loc.name}  ${w.temp}°C ${w.label}`);
      if (w.hi !== undefined && w.lo !== undefined) parts.push(`H ${w.hi}° L ${w.lo}°`);
    } else if (Store.get('weather') !== 'live') parts.push(`${loc.name}  ${target.label}`);
    else parts.push(loc.name);
    if (sunDeg < -6) {
      const ph = illum > 0.97 ? 4 : illum < 0.03 ? 0 : waxing ? (illum < 0.45 ? 1 : illum < 0.55 ? 2 : 3) : (illum < 0.45 ? 7 : illum < 0.55 ? 6 : 5);
      parts.push(`${PHASES[ph]} ${Math.round(illum * 100)}%`);
    }
    const ev = nextSunEvent(); if (ev) parts.push(ev);
    return parts.join('  ·  ');
  }

  Store.on((k, v) => {
    if (k === 'weather') setWeather(v);
  });
  setWeather(Store.get('weather'));
  if (Store.get('weather') === 'live') fetchWeather();

  return { resize, frame, locate, state: G, get dark() { return S.dark; }, get info() { return S.info; } };
})();
