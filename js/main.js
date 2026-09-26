/* Still v3 — wiring: the clock loop, minute and hour events, input, boot */
(() => {
  const $ = id => document.getElementById(id), body = document.body, root = document.documentElement.style;

  function parts(d) {
    const H = d.getHours(), M = d.getMinutes(), S = d.getSeconds(), h24 = Store.get('h24');
    const h = h24 ? H : (H % 12 || 12), hh = h24 ? String(h).padStart(2, '0') : String(h);
    const mm = String(M).padStart(2, '0'), ss = String(S).padStart(2, '0');
    return { H, M, S, hh, mm, ss, hm: hh + ':' + mm, ampm: h24 ? '' : (H < 12 ? 'AM' : 'PM'),
      date: d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) };
  }

  /* ---------- applying settings ---------- */
  function applyPalette(instant) {
    const p = pal();
    [['--a1', p.a], ['--a2', p.b], ['--a3', p.c], ['--t1', p.t1], ['--t2', p.t2], ['--glow', p.glow], ['--bg', p.bg]].forEach(([k, v]) => root.setProperty(k, v));
    document.querySelector('meta[name=theme-color]').content = p.bg;
    BG.palette(p, instant);
  }
  function applyMotion() { body.classList.remove('m-calm', 'm-normal', 'm-wild'); body.classList.add('m-' + Store.get('motion')); }
  function applySize() { root.setProperty('--size', Store.get('size')); }

  let T = parts(new Date()), lastSec = -1, lastMin = T.M, lastHour = T.H, lastDate = '', rt;
  const relayoutSoon = (ms = 160) => { clearTimeout(rt); rt = setTimeout(() => Faces.relayout(), ms); };

  Store.on((k, v) => {
    switch (k) {
      case 'face': Faces.show(v, T, false); Sound.ui('switch'); break;
      case 'palette': applyPalette(); break;
      case 'motion': applyMotion(); break;
      case 'size': applySize(); relayoutSoon(); setTimeout(Faces.placeMeta, 850); break;
      case 'seconds': case 'h24': T = parts(new Date()); Faces.set(T, false); updateMeta(T); relayoutSoon(); setTimeout(Faces.placeMeta, 850); break;
      case 'date': body.classList.toggle('no-date', !v); break;
      case 'weather': if (v === 'live') Sky.locate(); break;
      case 'lite': body.classList.toggle('lite', v); resize(); UI.toast(v ? 'Lite mode' : 'Full effects'); break;
      case 'lockfs':
        if (v) { UI.enterFullscreen(); UI.toast('Hold Esc to leave fullscreen', 2600); }
        else if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
        fsState(); break;
    }
  });

  /* ---------- the meta line ---------- */
  const GLY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+*•·';
  function decode(el, text) {
    clearInterval(el._t);
    let f = 0;
    el._t = setInterval(() => {
      const reveal = Math.floor(++f * text.length / 20);
      el.textContent = [...text].map((c, i) => i < reveal || c === ' ' ? c : GLY[Math.random() * GLY.length | 0]).join('');
      if (reveal >= text.length) clearInterval(el._t);
    }, 38);
  }
  let lastInfo = '';
  function updateMeta(t) {
    $('ampm').textContent = t.ampm;
    if (t.date !== lastDate) { lastDate = t.date; decode($('dtext'), t.date); }
    const info = Sky.info;
    if (info !== lastInfo) { if (info.replace(/\d/g, '') !== lastInfo.replace(/\d/g, '')) decode($('wx'), info); else { clearInterval($('wx')._t); $('wx').textContent = info; } lastInfo = info; }
    document.title = `${t.hm}${t.ampm ? ' ' + t.ampm : ''} · Still`;
  }

  /* ---------- events ---------- */
  function supernova(x, y, loud) {
    const f = $('flash');
    f.style.setProperty('--fx', x / innerWidth * 100 + '%'); f.style.setProperty('--fy', y / innerHeight * 100 + '%');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    FX.burst(x, y, { n: 280, power: 17, life: 120, size: 2.6, gravity: 0.02, drag: 0.975 });
    [0, 140, 320].forEach((d, i) => setTimeout(() => FX.ring(x, y, { v: 16 - i * 4, w: 3 - i * 0.7, decay: 0.01 + i * 0.003, color: [pal().t1, pal().a, pal().c][i] }), d));
    BG.pulse(x, y, 1);
    shake();
    if (loud) Sound.boom();
  }
  function shake() {
    if (Store.get('motion') !== 'wild') return;
    body.classList.remove('shake'); void body.offsetWidth; body.classList.add('shake');
  }
  function onMinute(hourChanged) {
    const a = Faces.anchor();
    BG.pulse(a.x, a.y, 1);
    FX.ring(a.x, a.y, { v: 11 });
    FX.ring(a.x, a.y, { v: 6, color: pal().a, decay: 0.012, w: 1.4 });
    if (hourChanged) { supernova(a.x, a.y, false); Sound.chime(T.H); }
    else { Sound.shimmer(); shake(); }
  }

  /* ---------- the loop ---------- */
  const raf = /[?&]timer/.test(location.search) ? f => setTimeout(() => f(performance.now()), 16) : f => requestAnimationFrame(f);
  let prev = performance.now(), perfT = 0, perfN = 0, suggested = false;
  try { suggested = !!sessionStorage.getItem('still.liteHint'); } catch (e) {}
  const bar = $('progress').firstElementChild;
  /* one layer throwing must never freeze the clock: each runs guarded, and the first error of each is shown */
  const failed = {};
  function safe(name, fn) {
    try { fn(); }
    catch (e) {
      if (failed[name]) return;
      failed[name] = true;
      console.error('[Still] ' + name + ' layer failed', e);
      const el = $('err'); el.textContent = `${name}: ${e && e.message || e}`; el.classList.add('show');
    }
  }
  function loop(now) {
    raf(loop);
    /* high-refresh screens (120/144 Hz) would do double the work for no visible gain: cap near 60 fps */
    if (now - prev < 13) return;
    const dt = Math.min(100, now - prev); prev = now;
    if (!suggested && !LITE() && !document.hidden) {
      perfT += dt; perfN++;
      if (perfT > 5000) {
        if (perfT / perfN > 30) { suggested = true; UI.toast('Laggy? Try Lite mode in settings', 4000); try { sessionStorage.setItem('still.liteHint', 1); } catch (e) {} }
        perfT = perfN = 0;
      }
    }
    const d = new Date();
    if (d.getSeconds() !== lastSec) {
      T = parts(d);
      const first = lastSec === -1;
      lastSec = T.S;
      safe('face', () => Faces.set(T, first));
      if (!first) {
        safe('face', () => Faces.beat());
        if (T.M !== lastMin) safe('minute', () => onMinute(T.H !== lastHour));
      }
      lastMin = T.M; lastHour = T.H;
      safe('meta', () => { updateMeta(T); Faces.placeMeta(); });
    }
    bar.style.setProperty('--p', ((d.getSeconds() + d.getMilliseconds() / 1000) / 60).toFixed(4));
    safe('background', () => BG.frame(dt, now));
    safe('sky', () => Sky.frame(dt, now));
    safe('particles', () => FX.frame(dt, now));
    safe('face', () => Faces.frame(dt, now, T));
  }

  /* ---------- input ---------- */
  let woke = false, wakeLock = null;
  async function wake() {
    Sound.init();
    $('hint').classList.remove('show');
    if (!woke) { woke = true; if (Store.get('weather') === 'live') Sky.locate(); }
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && woke) { wakeLock = null; wake(); } });

  /* fullscreen lock: if fullscreen is lost, the next click or key takes it back */
  function fsState() { body.classList.toggle('fs-lost', Store.get('lockfs') && !document.fullscreenElement); }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    fsState();
  });
  $('fsunlock').addEventListener('pointerdown', e => { e.stopPropagation(); Store.set('lockfs', false); Sound.ui('off'); });

  addEventListener('pointerdown', e => {
    wake();
    if (Store.get('lockfs') && !document.fullscreenElement) { UI.enterFullscreen(); return; }
    if (e.target.closest('#panel, #gear')) return;
    if (UI.open) { UI.toggle(false); return; }
    BG.pulse(e.clientX, e.clientY, 0.7);
    FX.ring(e.clientX, e.clientY, { v: 7, w: 1.5 });
    FX.burst(e.clientX, e.clientY, { n: 26, power: 5 });
    Sound.pluck(e.clientX / innerWidth, e.clientY / innerHeight);
  });
  addEventListener('dblclick', e => { if (!e.target.closest('#panel, #gear')) UI.fullscreen(); });

  let idleT;
  function active() {
    body.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (!UI.open) body.classList.add('idle'); }, 2800);
  }
  addEventListener('pointermove', active);

  const cycle = (key, list) => { const i = list.indexOf(Store.get(key)); Store.set(key, list[(i + 1) % list.length]); };
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    wake(); active();
    if (Store.get('lockfs') && !document.fullscreenElement && e.key !== 'Escape') UI.enterFullscreen();
    const k = e.key.toLowerCase();
    if (k === 's') UI.toggle();
    else if (k === 'escape') UI.open && UI.toggle(false);
    else if (k === 'f') UI.fullscreen();
    else if (k === 'm') UI.toast(Sound.toggleMute() ? 'Muted' : 'Sound on');
    else if (k >= '1' && k <= '4') { Store.set('face', FACES[+k - 1][0]); UI.toast(FACES[+k - 1][1]); }
    else if (k === 'p') { cycle('palette', Object.keys(PALETTES)); UI.toast(pal().name); }
    else if (k === 'w') { cycle('weather', ['live', 'clear', 'rain', 'snow', 'storm']); UI.toast('Weather · ' + Store.get('weather')); }
    else if (k === 't') { cycle('skyMode', ['real', 'timelapse']); UI.toast(Store.get('skyMode') === 'timelapse' ? 'Timelapse' : 'Real time'); }
    else if (k === ' ') { e.preventDefault(); const a = Faces.anchor(); supernova(a.x, a.y, true); }
    else return;
    if (k !== ' ' && k !== 's' && k !== 'escape') Sound.ui('click');
  });

  function resize() { safe('background', BG.resize); safe('particles', FX.resize); safe('sky', Sky.resize); safe('face', Faces.relayout); }
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(resize, 120); });

  /* ---------- boot ---------- */
  applyPalette(true); applyMotion(); applySize();
  body.classList.toggle('no-date', !Store.get('date'));
  body.classList.toggle('lite', Store.get('lite'));
  fsState();
  resize();
  safe('face', () => Faces.show(Store.get('face'), T, true));
  raf(loop);
  setTimeout(() => body.classList.remove('booting'), 50);
  setTimeout(() => { const a = Faces.anchor(); FX.ring(a.x, a.y, { v: 15, w: 2.5, decay: 0.01 }); BG.pulse(a.x, a.y, 1); }, 900);
  document.fonts && document.fonts.ready.then(() => safe('face', Faces.relayout));
  if (Store.get('sound') || Store.get('ambient')) {
    setTimeout(() => { if (!Sound.running()) $('hint').classList.add('show'); }, 1800);
    setTimeout(() => $('hint').classList.remove('show'), 11000);
  }
  active();
})();
