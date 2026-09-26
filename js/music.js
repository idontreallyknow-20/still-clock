/* Still — the clock is the player. While Spotify plays, the song lives inside the clock instead of in a
   corner: a line under the time with the title, a seek bar and the controls, a ring on Orbit and Nova that
   fills as the song plays (gl3d.js, faces.js), the album art glowing in the sky behind the clock and in the
   Glass pane, and "ends at" in clock time. A new song lands like a new hour: the sky ripples and the aurora
   surges. Still's own chimes hush while a song plays, and the alarm can wake you with Spotify (main.js).
   Keys: J previous · K play or pause · L next. Scroll over the clock for Spotify's volume. */
window.Music = (() => {
  const $ = id => document.getElementById(id), body = document.body, root = document.documentElement.style;
  const song = $('song'), glow = $('m-glow'), head = song.querySelector('.s-head'), tip = song.querySelector('.s-tip');
  const inClock = () => Store.get('showMusic') && Store.get('musicClock');
  let lastId = '', lastPlaying = null, lastArt = '', shown = false, glowSide = 0;

  /* what the faces draw: null unless the clock is showing a song */
  function state() { return inClock() ? Spotify.state() : null; }

  /* the title decodes in like the date does */
  const GLY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+*•·';
  function decode(el, text) {
    clearInterval(el._t);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
    let f = 0;
    el._t = setInterval(() => {
      const reveal = Math.floor(++f * text.length / 18);
      el.textContent = [...text].map((c, i) => i < reveal || c === ' ' ? c : GLY[Math.random() * GLY.length | 0]).join('');
      if (reveal >= text.length) clearInterval(el._t);
    }, 34);
  }
  const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function clockAt(ms) {
    const d = new Date(Date.now() + ms), H = d.getHours(), M = String(d.getMinutes()).padStart(2, '0');
    return Store.get('h24') ? String(H).padStart(2, '0') + ':' + M : (H % 12 || 12) + ':' + M + (H < 12 ? ' AM' : ' PM');
  }

  /* a new song is an event in the clock, like the hour turning */
  function landed(first) {
    if (first) return;
    const a = Faces.anchor();
    BG.pulse(a.x, a.y, 1); BG.surge();
    window.GL3D && GL3D.pulse(1.6);
    FX.burst(a.x, a.y, { n: 60, power: 7, jitter: 40, gravity: 0.03 });
  }
  function resumed() { const a = Faces.anchor(); BG.pulse(a.x, a.y, 0.6); window.GL3D && GL3D.pulse(0.9); }

  /* two layers so the art crossfades between songs */
  function setArt(url) {
    if (url === lastArt) return;
    lastArt = url;
    root.setProperty('--m-art', url ? `url("${url.replace(/"/g, '%22')}")` : 'none');
    if (!url) { glow.classList.remove('on'); return; }
    const layers = glow.children;
    glowSide ^= 1;
    layers[glowSide].style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    layers[glowSide].classList.add('on'); layers[glowSide ^ 1].classList.remove('on');
    $('s-art').src = url;
  }

  /* four times a second: the song line, the progress bars, the glow's position, the chime hush */
  function tick() {
    const any = Spotify.state();
    Sound.duck(!!(any && any.playing && Store.get('musicDuck')));
    const st = state(), show = !!st;
    if (show !== shown) {
      shown = show;
      song.classList.toggle('on', show); song.setAttribute('aria-hidden', !show);
      body.classList.toggle('music-on', show);
      /* the song line grows the meta block: place it now, and again once it has finished opening */
      setTimeout(Faces.placeMeta, 30); setTimeout(Faces.placeMeta, 850);
    }
    if (!show) {
      if (lastArt) setArt('');
      lastId = ''; lastPlaying = null; body.classList.remove('music-playing');
      return;
    }
    if (st.id !== lastId) {
      const first = !lastId;
      lastId = st.id;
      decode($('s-title'), st.title); $('s-artist').textContent = st.artist;
      song.classList.remove('swap'); void song.offsetWidth; song.classList.add('swap');
      landed(first);
    } else if (st.playing && lastPlaying === false) resumed();
    lastPlaying = st.playing;
    setArt(st.art || '');
    body.classList.toggle('music-playing', st.playing);
    song.classList.toggle('paused', !st.playing);
    document.querySelectorAll('.m-pbar').forEach(el => el.style.transform = `scaleX(${st.p.toFixed(4)})`);
    head.style.left = (st.p * 100).toFixed(2) + '%';
    $('s-pos').textContent = fmt(st.pos); $('s-dur').textContent = fmt(st.dur);
    $('s-end').textContent = st.playing ? 'ends ' + clockAt(st.dur - st.pos) : 'paused';
    /* the glow sits behind the clock and is sized to it */
    const a = Faces.anchor(), s = Math.min(innerWidth, innerHeight) * 0.78 * Store.get('size');
    glow.style.transform = `translate(${(a.x - s / 2).toFixed(0)}px, ${(a.y - s / 2).toFixed(0)}px)`;
    glow.style.width = glow.style.height = s.toFixed(0) + 'px';
    glow.classList.toggle('on', true);
  }

  /* ---------- controls: buttons, the seek bar, keys, the scroll wheel ---------- */
  function key(what) {
    if (!Spotify.connected) { UI.toast('Connect Spotify in settings first', 2400); return; }
    if (!Spotify.state() && what !== 'toggle') { UI.toast('Nothing playing on Spotify', 2000); return; }
    Spotify.control(what);
    const a = Faces.anchor();
    FX.ring(a.x, a.y, { v: 6, w: 1.2, decay: 0.03 });
  }

  let volT = 0, volTarget = null;
  function wheel(e) {
    const st = state();
    if (!st || UI.open || e.target.closest('#panel, #quick')) return;
    const a = Faces.anchor(), r = Math.min(innerWidth, innerHeight) * 0.38 * Store.get('size');
    if (!e.target.closest('#song') && Math.hypot(e.clientX - a.x, e.clientY - a.y) > r) return;
    e.preventDefault();
    if (st.vol === null) { UI.toast("This device's volume can't be changed from here", 2400); return; }
    volTarget = Math.max(0, Math.min(100, (volTarget ?? st.vol) + (e.deltaY < 0 ? 5 : -5)));
    UI.toast('Spotify volume ' + volTarget + '%');
    clearTimeout(volT);
    /* send once the scrolling settles; keep counting from our own number a while longer, since Spotify's
       player can still report the old volume for a poll or two after the change */
    volT = setTimeout(() => { Spotify.volume(volTarget); volT = setTimeout(() => { volTarget = null; }, 2500); }, 320);
  }

  function init() {
    song.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const b = e.target.closest('[data-m]');
      if (b) { key(b.dataset.m); return; }
      const bar = e.target.closest('.s-bar');
      if (bar) { const r = bar.getBoundingClientRect(); Spotify.seek((e.clientX - r.left) / r.width); Sound.ui('click'); }
    });
    addEventListener('wheel', wheel, { passive: false });
    /* hovering the seek bar shows the time you would jump to */
    const bar = song.querySelector('.s-bar');
    bar.addEventListener('pointermove', e => {
      const st = Spotify.state(); if (!st) return;
      const r = bar.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      tip.textContent = fmt(f * st.dur); tip.style.left = (f * 100).toFixed(2) + '%';
    });
    Store.on(k => { if (k === 'musicClock' || k === 'showMusic') tick(); });
    setInterval(tick, 250);
    tick();
  }
  return { init, state, key };
})();
