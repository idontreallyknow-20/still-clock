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
      case 'brightness': case 'autoDim': applyDim(); break;
      case 'alarmOn': if (v) { UI.toast('Alarm set for ' + Store.get('alarmTime'), 2200); Sound.init(); try { window.Notification && Notification.permission === 'default' && Notification.requestPermission(); } catch (e) {} } break;
      case 'alarmTime': if (Store.get('alarmOn')) UI.toast('Alarm set for ' + v, 2200); break;
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
  /* no explosions: the minute is a slow ripple through the sky and the 3D scene; the hour a deeper one */
  const gl3d = () => window.GL3D;
  function surge() {
    const a = Faces.anchor();
    BG.pulse(a.x, a.y, 0.8); BG.surge();
    gl3d() && GL3D.pulse(1.4);
    Sound.surge();
  }
  function onMinute(hourChanged) {
    const a = Faces.anchor();
    BG.pulse(a.x, a.y, hourChanged ? 1 : 0.6);
    if (hourChanged) BG.surge();
    gl3d() && GL3D.pulse(hourChanged ? 1.6 : 1);
    Sound.chimeAt(T.H, T.M);
  }

  /* ---------- brightness: a slider, an optional night dim, and the alarm always wakes it ---------- */
  function applyDim() {
    let b = Store.get('brightness');
    if (Store.get('autoDim')) b *= 1 - 0.55 * Sky.dark;
    if (Alarm.ringing) b = 1;
    $('dim').style.opacity = (1 - b).toFixed(3);
  }

  /* ---------- the alarm ---------- */
  const Alarm = (() => {
    let ringing = false, snoozeUntil = 0, firedKey = '', timer = 0;
    const el = $('alarm');
    function start() {
      if (ringing) return;
      ringing = true; body.classList.add('alarm-on'); el.setAttribute('aria-hidden', 'false');
      $('alarm-time').textContent = T.hm + (T.ampm ? ' ' + T.ampm : '');
      el.querySelector('.al-k').textContent = T.H >= 4 && T.H < 12 ? 'Good morning' : T.H < 18 ? 'Alarm' : 'Good evening';
      Sound.init(); Sound.alarm(true);
      const beat = () => { const a = Faces.anchor(); BG.pulse(a.x, a.y, 1); BG.surge(); gl3d() && GL3D.pulse(1.2); };
      beat(); timer = setInterval(beat, 4200);
      try { if (window.Notification && Notification.permission === 'granted') new Notification('Still · alarm', { body: $('alarm-time').textContent, requireInteraction: true }); } catch (e) {}
      applyDim();
    }
    function stop(snooze) {
      if (!ringing) return;
      ringing = false; clearInterval(timer); body.classList.remove('alarm-on'); el.setAttribute('aria-hidden', 'true');
      Sound.alarm(false);
      snoozeUntil = snooze ? Date.now() + 9 * 6e4 : 0;
      UI.toast(snooze ? 'Snoozed for 9 minutes' : 'Alarm off', 2200);
      applyDim();
    }
    function check(t) {
      if (ringing) return;
      if (snoozeUntil && Date.now() >= snoozeUntil) { snoozeUntil = 0; start(); return; }
      if (!Store.get('alarmOn')) return;
      const [ah, am] = Store.get('alarmTime').split(':').map(Number), key = new Date().toDateString() + Store.get('alarmTime');
      if (t.H === ah && t.M === am && firedKey !== key) { firedKey = key; start(); }
    }
    $('alarm-snooze').addEventListener('pointerdown', e => { e.stopPropagation(); stop(true); });
    $('alarm-stop').addEventListener('pointerdown', e => { e.stopPropagation(); stop(false); });
    return { check, stop, start, get ringing() { return ringing; } };
  })();
  window.Alarm = Alarm;

  /* ---------- the loop ---------- */
  /* requestAnimationFrame never fires in windows that report themselves hidden (embedded browser
     panes, some app windows) even while you are looking at them, which froze the clock with no sky.
     So a timer backs it up: a slow one while rAF is alive, a 60 fps one while it is not. Whichever
     fires first runs the frame. */
  let tick = 0, rafSeen = -1e9;
  const raf = f => {
    const id = ++tick, go = t => { if (id === tick) { tick++; f(t); } };
    requestAnimationFrame(t => { rafSeen = performance.now(); go(t); });
    setTimeout(() => go(performance.now()), performance.now() - rafSeen < 250 ? 120 : 16);
  };
  let prev = performance.now(), perfT = 0, perfN = 0, suggested = false, calmSince = 0, lastPal = 0;
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
    /* automatic quality: if frames run long, step resolution and effects down; if there is headroom
       for a good while, step back up. Measured over windows so one hiccup changes nothing */
    if (!LITE() && !document.hidden && dt < 99) {
      perfT += dt; perfN++;
      if (perfT > 2500) {
        const avg = perfT / perfN;
        if (avg > 24 && QUALITY.tier < QUALITY.max) {
          QUALITY.set(QUALITY.tier + 1); calmSince = now;
          if (!suggested) { suggested = true; UI.toast('Tuned for smoothness', 2400); try { sessionStorage.setItem('still.liteHint', 1); } catch (e) {} }
        } else if (avg < 17.5 && QUALITY.tier > 0 && now - calmSince > 40000) { QUALITY.set(QUALITY.tier - 1); calmSince = now; }
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
      safe('alarm', () => Alarm.check(T));
      if (T.S % 5 === 0) applyDim();
    }
    bar.style.setProperty('--p', ((d.getSeconds() + d.getMilliseconds() / 1000) / 60).toFixed(4));
    safe('background', () => BG.frame(dt, now));
    safe('sky', () => Sky.frame(dt, now));
    safe('particles', () => FX.frame(dt, now));
    safe('face', () => Faces.frame(dt, now, T));
    safe('3d', () => window.GL3D && GL3D.frame(dt, now));
    /* the Sky palette follows the real sky: recompute it every couple of seconds */
    if (Store.get('palette') === 'sky' && now - lastPal > 2000) { lastPal = now; refreshSkyPalette(); safe('palette', () => applyPalette()); }
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
    BG.pulse(e.clientX, e.clientY, 0.5);
    FX.ring(e.clientX, e.clientY, { v: 5, w: 1, decay: 0.03 });
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
    else if (k === 'escape') { if (Alarm.ringing) Alarm.stop(false); else UI.open && UI.toggle(false); }
    else if (k === 'arrowup' || k === 'arrowdown') {
      e.preventDefault();
      Store.set('brightness', Math.round(Math.max(0.1, Math.min(1, Store.get('brightness') + (k === 'arrowup' ? 0.05 : -0.05))) * 100) / 100);
      UI.toast('Brightness ' + Math.round(Store.get('brightness') * 100) + '%');
    }
    else if (k === 'f') UI.fullscreen();
    else if (k === 'm') UI.toast(Sound.toggleMute() ? 'Muted' : 'Sound on');
    else if (k >= '1' && k <= '4') { Store.set('face', FACES[+k - 1][0]); UI.toast(FACES[+k - 1][1]); }
    else if (k === 'p') { cycle('palette', Object.keys(PALETTES)); UI.toast(pal().name); }
    else if (k === 'w') { cycle('weather', ['live', 'clear', 'rain', 'snow', 'blizzard', 'storm', 'fog']); UI.toast('Weather · ' + Store.get('weather')); }
    else if (k === 't') { cycle('skyMode', ['real', 'timelapse']); UI.toast(Store.get('skyMode') === 'timelapse' ? 'Timelapse' : 'Real time'); }
    else if (k === ' ') { e.preventDefault(); if (Alarm.ringing) Alarm.stop(true); else surge(); }
    else return;
    if (k !== ' ' && k !== 's' && k !== 'escape' && !k.startsWith('arrow')) Sound.ui('click');
  });

  function resize() { safe('background', BG.resize); safe('particles', FX.resize); safe('sky', Sky.resize); safe('3d', () => window.GL3D && GL3D.resize()); safe('face', Faces.relayout); }
  QUALITY.on(() => { safe('particles', FX.resize); safe('sky', Sky.resize); });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(resize, 120); });

  /* ---------- boot ---------- */
  if (Store.get('palette') === 'sky') refreshSkyPalette();
  applyPalette(true); applyMotion(); applySize(); applyDim();
  body.classList.toggle('no-date', !Store.get('date'));
  body.classList.toggle('lite', Store.get('lite'));
  fsState();
  resize();
  safe('face', () => Faces.show(Store.get('face'), T, true));
  raf(loop);
  setTimeout(() => body.classList.remove('booting'), 50);
  setTimeout(() => { const a = Faces.anchor(); BG.pulse(a.x, a.y, 1); }, 900);
  document.fonts && document.fonts.ready.then(() => safe('face', Faces.relayout));
  if (Store.get('sound') || Store.get('ambient')) {
    setTimeout(() => { if (!Sound.running()) $('hint').classList.add('show'); }, 1800);
    setTimeout(() => $('hint').classList.remove('show'), 11000);
  }
  active();
})();
