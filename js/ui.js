/* Still v3 — the settings panel: few controls, each one alive */
window.UI = (() => {
  const panel = document.getElementById('panel'), rowsEl = document.getElementById('rows');
  const gear = document.getElementById('gear'), toastEl = document.getElementById('toast');

  const SCHEMA = [
    ['Face', [{ key: 'face', type: 'seg', opts: FACES }]],
    ['Palette', [{ key: 'palette', type: 'swatch' }]],
    ['Time', [
      { key: 'seconds', label: 'Seconds', type: 'toggle' },
      { key: 'h24', label: '24-hour', type: 'toggle' },
      { key: 'date', label: 'Date', type: 'toggle' },
      { key: 'size', label: 'Size', type: 'range', min: 0.5, max: 1.5, step: 0.01 },
    ]],
    ['Display', [
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0.1, max: 1, step: 0.01 },
      { key: 'autoDim', label: 'Dim at night', type: 'toggle' },
    ]],
    ['Alarm', [
      { key: 'alarmOn', label: 'Alarm', type: 'toggle' },
      { key: 'alarmTime', label: 'Wake at', type: 'time' },
    ]],
    ['Sky · Richmond Hill', [
      { key: 'skyMode', type: 'seg', opts: [['real', 'Real time'], ['timelapse', 'Timelapse']] },
      { key: 'weather', type: 'seg', opts: [['live', 'Live'], ['clear', 'Clear'], ['rain', 'Rain'], ['storm', 'Storm']] },
      { key: 'weather', type: 'seg', opts: [['snow', 'Snow'], ['blizzard', 'Blizzard'], ['fog', 'Fog']] },
      { key: 'lines', label: 'Constellations', type: 'toggle' },
    ]],
    ['Music · Spotify', [
      { key: 'showMusic', label: 'Now playing', type: 'toggle' },
      { key: 'musicColors', label: 'Colours from album art', type: 'toggle' },
      { type: 'custom', make: () => Spotify.row() },
    ]],
    ['Motion', [{ key: 'motion', type: 'seg', opts: [['calm', 'Calm'], ['normal', 'Normal'], ['wild', 'Wild']] }]],
    ['Sound', [
      { key: 'sound', label: 'Effects', type: 'toggle' },
      { key: 'chimeEvery', label: 'Chime', type: 'seg', opts: [['off', 'Off'], ['1', '1 min'], ['5', '5 min'], ['15', '15 min'], ['60', 'Hourly']] },
      { key: 'ambient', label: 'Ambient drone', type: 'toggle' },
      { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.01 },
    ]],
  ];

  /* several controls can drive one setting (the weather picker is two rows), so each key keeps a list */
  const syncs = {}, sync = new Proxy({}, { set(o, k, f) { (syncs[k] = syncs[k] || []).push(f); return true; }, get(o, k) { return syncs[k] && (v => syncs[k].forEach(f => f(v))); } });
  let i = 0;
  for (const [title, rows] of SCHEMA) {
    const sec = document.createElement('section');
    sec.style.setProperty('--i', i++);
    sec.innerHTML = `<h3>${title}</h3>`;
    for (const r of rows) sec.appendChild(build(r));
    rowsEl.appendChild(sec);
  }

  const foot = document.createElement('div');
  foot.className = 'foot-rows';
  [{ key: 'lite', label: 'Lite mode', type: 'toggle' }, { key: 'lockfs', label: 'Lock fullscreen', type: 'toggle' }].forEach(r => foot.appendChild(build(r)));
  panel.querySelector('footer').prepend(foot);

  function build(r) {
    if (r.type === 'custom') return r.make();
    const row = document.createElement('div');
    row.className = 'row row-' + r.type;
    if (r.type === 'seg') {
      row.innerHTML = (r.label ? `<span class="lbl">${r.label}</span>` : '') + `<div class="seg">${r.opts.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}<span class="ind"></span></div>`;
      if (r.label) row.classList.add('row-seg-l');
      const seg = row.querySelector('.seg'), ind = seg.querySelector('.ind');
      seg.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        Store.set(r.key, b.dataset.v); Sound.ui('click');
      });
      sync[r.key] = v => {
        seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
        const b = seg.querySelector(`[data-v="${v}"]`);
        ind.style.opacity = b ? 1 : 0;
        if (b && b.offsetWidth) { ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft}px)`; }
      };
      if (window.ResizeObserver) new ResizeObserver(() => sync[r.key](Store.get(r.key))).observe(seg);
    } else if (r.type === 'swatch') {
      row.innerHTML = `<div class="swatches">${Object.entries(PALETTES).map(([k, p]) =>
        `<button data-v="${k}" title="${p.name}" style="--s1:${p.a};--s2:${p.b};--s3:${p.c}"><span></span></button>`).join('')}</div><span class="sw-name"></span>`;
      const name = row.querySelector('.sw-name');
      row.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        Store.set('palette', b.dataset.v); Sound.ui('click');
      });
      sync.palette = v => {
        row.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
        name.textContent = PALETTES[v].name;
      };
    } else if (r.type === 'time') {
      row.innerHTML = `<span class="lbl">${r.label}</span><input type="time" class="time" aria-label="${r.label}">`;
      const inp = row.querySelector('input');
      inp.addEventListener('change', () => { if (/^\d\d:\d\d$/.test(inp.value)) { Store.set(r.key, inp.value); Sound.ui('click'); } });
      inp.addEventListener('keydown', e => e.stopPropagation());
      sync[r.key] = v => { if (document.activeElement !== inp) inp.value = v; };
    } else if (r.type === 'toggle') {
      row.innerHTML = `<span class="lbl">${r.label}</span><button class="tog" role="switch"><i></i></button>`;
      const t = row.querySelector('.tog');
      row.addEventListener('click', () => { const v = !Store.get(r.key); Store.set(r.key, v); Sound.ui(v ? 'on' : 'off'); });
      sync[r.key] = v => { t.classList.toggle('on', v); t.setAttribute('aria-checked', v); };
    } else if (r.type === 'range') {
      row.innerHTML = `<span class="lbl">${r.label}</span><input type="range" min="${r.min}" max="${r.max}" step="${r.step}" aria-label="${r.label}"><span class="val"></span>`;
      const inp = row.querySelector('input'), val = row.querySelector('.val');
      let last = 0;
      inp.addEventListener('input', () => {
        Store.set(r.key, +inp.value);
        const n = performance.now(); if (n - last > 40) { last = n; Sound.ui('hover'); }
      });
      sync[r.key] = v => {
        inp.value = v;
        inp.style.setProperty('--p', ((v - r.min) / (r.max - r.min) * 100) + '%');
        val.textContent = Math.round(v * 100) + '%';
        inp.setAttribute('aria-valuetext', val.textContent);
      };
    }
    row.addEventListener('pointerenter', () => Sound.ui('hover'));
    return row;
  }

  panel.addEventListener('pointerover', e => { if (e.target.closest('button')) Sound.ui('hover'); });
  panel.querySelector('footer').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    Sound.ui('click');
    if (b.dataset.act === 'fullscreen') fullscreen();
    if (b.dataset.act === 'reset') { Store.reset(); toast('Settings reset'); }
  });

  function syncAll() { for (const k in syncs) sync[k](Store.get(k)); }
  Store.on((k, v) => sync[k] && sync[k](v));

  let open = false;
  function toggle(force) {
    open = force ?? !open;
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', !open);
    document.body.classList.toggle('panel-open', open);
    Sound.ui(open ? 'open' : 'close');
    if (open) setTimeout(syncAll, 0);
  }
  gear.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  panel.querySelector('.close').addEventListener('click', () => toggle(false));
  panel.addEventListener('pointerdown', e => e.stopPropagation());

  async function enterFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (Store.get('lockfs') && navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock(['Escape']);
    } catch (e) {}
  }
  function fullscreen() {
    if (!document.fullscreenElement) return enterFullscreen();
    if (Store.get('lockfs')) return toast('Fullscreen locked');
    document.exitFullscreen();
  }

  let tt;
  function toast(msg, ms = 1600) {
    toastEl.textContent = msg;
    toastEl.style.animationDuration = ms + 'ms';
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  /* the brightness control that lives beside the gear, always one move away */
  const qb = document.getElementById('qb'), qbv = document.getElementById('qbv');
  qb.addEventListener('input', () => Store.set('brightness', +qb.value));
  document.getElementById('quick').addEventListener('pointerdown', e => e.stopPropagation());
  qb.addEventListener('keydown', e => e.stopPropagation());
  sync.brightness = v => { qb.value = v; qb.style.setProperty('--p', ((v - 0.1) / 0.9 * 100) + '%'); qbv.textContent = Math.round(v * 100) + '%'; };

  syncAll();
  document.fonts && document.fonts.ready.then(syncAll);
  return { toggle, get open() { return open; }, fullscreen, enterFullscreen, toast, syncAll };
})();
