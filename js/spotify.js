/* Still — Spotify: what's playing, play/pause/skip, and a palette pulled from the album art so the whole
   sky takes on the song's colours. Sign-in is Spotify's PKCE flow, which needs no server and no secret:
   only a Client ID from developer.spotify.com and this page's address registered as the redirect URI. */
window.Spotify = (() => {
  const KEY = 'still.spotify', VKEY = 'still.spv';
  const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
  /* Spotify only accepts http redirects on 127.0.0.1, so the address is always the served index.html */
  const redirect = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html';
  const $ = id => document.getElementById(id);
  let tok = null, now = null, lastTrack = '', pollT = 0, rowEls = null;
  try { tok = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}

  function save(t) {
    tok = t;
    try { t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY); } catch (e) {}
    renderRow();
  }
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const clientId = () => (Store.get('spClient') || '').trim();

  async function connect() {
    if (!/^[0-9a-z]{32}$/i.test(clientId())) return UI.toast('Paste your Spotify Client ID first', 2600);
    if (location.protocol === 'file:' || !crypto.subtle) return UI.toast('Open Still with start.cmd (http://127.0.0.1:8787) to sign in', 3600);
    const v = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const ch = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
    try { localStorage.setItem(VKEY, v); } catch (e) {}
    location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      client_id: clientId(), response_type: 'code', redirect_uri: redirect(), code_challenge_method: 'S256', code_challenge: ch, scope: SCOPES,
    });
  }
  function signOut() { save(null); now = null; lastTrack = ''; if (window.MUSICPAL) { window.MUSICPAL = null; window.StillPalette && StillPalette(); } renderCard(); }
  function disconnect() { signOut(); UI.toast('Spotify disconnected'); }

  async function token(params) {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId(), ...params }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error_description || j.error || 'HTTP ' + r.status), { refused: true });
    save({ access: j.access_token, refresh: j.refresh_token || (tok && tok.refresh), exp: Date.now() + (j.expires_in - 60) * 1000 });
  }

  /* back from Spotify's sign-in page with ?code=... */
  async function finishLogin() {
    const q = new URLSearchParams(location.search), code = q.get('code'), err = q.get('error');
    if (!code && !err) return;
    history.replaceState(null, '', location.pathname);
    if (err) return UI.toast('Spotify sign-in cancelled', 2400);
    let v = null; try { v = localStorage.getItem(VKEY); localStorage.removeItem(VKEY); } catch (e) {}
    try { await token({ grant_type: 'authorization_code', code, redirect_uri: redirect(), code_verifier: v }); UI.toast('Spotify connected', 2200); }
    catch (e) { UI.toast('Spotify: ' + e.message, 4000); }
  }

  async function api(path, method = 'GET') {
    if (!tok) return null;
    if (Date.now() > tok.exp) {
      try { await token({ grant_type: 'refresh_token', refresh_token: tok.refresh }); }
      catch (e) {
        if (e.refused) { signOut(); UI.toast('Spotify signed out, connect again in settings', 3000); }
        return null; /* offline for a moment: keep the sign-in and try again on the next poll */
      }
    }
    const r = await fetch('https://api.spotify.com/v1' + path, { method, headers: { Authorization: 'Bearer ' + tok.access } });
    if (r.status === 401) { tok.exp = 0; return null; }
    if (method !== 'GET') {
      if (r.status === 403) UI.toast('Controlling playback needs Spotify Premium', 2800);
      else if (r.status === 404) UI.toast('Start Spotify on a device first', 2600);
      return r.ok;
    }
    if (r.status === 204) return { idle: true };
    return r.ok ? r.json() : null;
  }

  /* ---------- polling: every 3 s while visible, and the progress bar runs smoothly in between ---------- */
  let pollId = 0;
  async function poll() {
    clearTimeout(pollT);
    const id = ++pollId;
    if (tok && !document.hidden) {
      try {
        const j = await api('/me/player?additional_types=episode');
        if (j && !j.idle && j.item) {
          const it = j.item, art = (it.album && it.album.images || it.images || [])[0];
          now = {
            id: it.id, title: it.name, artist: (it.artists || []).map(a => a.name).join(', ') || (it.show && it.show.name) || '',
            art: art && art.url, playing: j.is_playing, progress: j.progress_ms, dur: it.duration_ms, at: performance.now(),
          };
        } else if (j) now = null;
      } catch (e) {}
      if (id !== pollId) return;
      renderCard();
    }
    clearTimeout(pollT);
    pollT = setTimeout(poll, tok ? 3000 : 30000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  async function control(what) {
    if (!now && what !== 'toggle') return;
    const ok = what === 'next' ? await api('/me/player/next', 'POST')
      : what === 'prev' ? await api('/me/player/previous', 'POST')
      : await api(now && now.playing ? '/me/player/pause' : '/me/player/play', 'PUT');
    if (ok && now && what === 'toggle') { now.progress += performance.now() - now.at; now.at = performance.now(); now.playing = !now.playing; renderCard(); }
    Sound.ui('click');
    setTimeout(poll, 450);
  }

  /* ---------- colours from the album art ---------- */
  function artPalette(url) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 28;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 28, 28);
        const d = g.getImageData(0, 0, 28, 28).data, px = [];
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
          const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
          let h = 0;
          if (mx !== mn) h = mx === r ? ((gg - b) / (mx - mn)) % 6 : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4;
          px.push({ h: (h * 60 + 360) % 360, s, l });
        }
        /* the most saturated colours whose hues are well apart; grey art falls back to cool defaults */
        const cand = px.filter(p => p.s > 0.22 && p.l > 0.15 && p.l < 0.9).sort((a, b) => b.s * (1 - Math.abs(b.l - 0.5)) - a.s * (1 - Math.abs(a.l - 0.5)));
        const pick = [];
        for (const p of cand) { if (pick.every(q => Math.min(Math.abs(q.h - p.h), 360 - Math.abs(q.h - p.h)) > 35)) pick.push(p); if (pick.length === 3) break; }
        const def = [{ h: 170, s: 0.8 }, { h: 260, s: 0.8 }, { h: 330, s: 0.8 }];
        while (pick.length < 3) pick.push(def[pick.length]);
        const hex = (h, s, l) => {
          const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
          const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
          return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
        };
        const [A, B, C] = pick, sat = p => Math.min(1, Math.max(0.65, p.s * 1.2));
        window.MUSICPAL = {
          name: 'Album', live: true, bg: '#02040a', t1: '#ffffff',
          a: hex(A.h, sat(A), 0.6), b: hex(B.h, sat(B), 0.58), c: hex(C.h, sat(C), 0.66),
          t2: hex(A.h, 0.9, 0.84), glow: hex(A.h, sat(A), 0.68),
        };
        window.StillPalette && StillPalette();
      } catch (e) { /* the image host refused CORS: keep the current palette */ }
    };
    img.src = url;
  }

  /* ---------- the now-playing card ---------- */
  function fmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function renderCard() {
    const card = $('music'), show = !!(tok && now && Store.get('showMusic'));
    card.classList.toggle('on', show);
    card.setAttribute('aria-hidden', !show);
    const colours = Store.get('musicColors') && now && now.playing;
    if (!colours && window.MUSICPAL) { window.MUSICPAL = null; lastTrack = ''; window.StillPalette && StillPalette(); }
    if (!show) return;
    if (now.id !== $('music').dataset.id) {
      card.dataset.id = now.id;
      $('m-title').textContent = now.title; $('m-artist').textContent = now.artist;
      if (now.art) $('m-art').src = now.art;
      card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
    }
    card.classList.toggle('paused', !now.playing);
    if (colours && now.art && now.id !== lastTrack) { lastTrack = now.id; artPalette(now.art); }
  }
  setInterval(() => {
    if (!now || !$('music').classList.contains('on')) return;
    const p = Math.min(now.dur, now.progress + (now.playing ? performance.now() - now.at : 0));
    $('m-bar').style.transform = `scaleX(${(p / now.dur || 0).toFixed(4)})`;
    $('m-time').textContent = fmt(p) + ' / ' + fmt(now.dur);
  }, 250);

  /* ---------- the settings row ---------- */
  function row() {
    const el = document.createElement('div');
    el.className = 'sp';
    el.innerHTML = `<p class="sp-status"></p>
      <label class="sp-id"><span>Client ID</span><input type="text" spellcheck="false" autocomplete="off" placeholder="32 characters from your Spotify app"></label>
      <p class="sp-help">One-time setup: at <b>developer.spotify.com/dashboard</b> create an app, choose <b>Web API</b>, add this Redirect URI, then paste the app's Client ID above.</p>
      <div class="sp-uri"><code></code><button type="button" class="sp-copy">Copy</button></div>
      <button type="button" class="sp-go"></button>`;
    const inp = el.querySelector('input');
    inp.addEventListener('keydown', e => e.stopPropagation());
    inp.addEventListener('change', () => Store.set('spClient', inp.value.trim()));
    el.querySelector('.sp-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(redirect()); UI.toast('Redirect URI copied'); } catch (e) { UI.toast(redirect(), 4000); }
    });
    el.querySelector('.sp-go').addEventListener('click', () => { Store.set('spClient', inp.value.trim()); tok ? disconnect() : connect(); });
    rowEls = { el, inp };
    renderRow();
    return el;
  }
  function renderRow() {
    if (!rowEls) return;
    const { el, inp } = rowEls;
    if (document.activeElement !== inp) inp.value = Store.get('spClient') || '';
    el.querySelector('code').textContent = redirect();
    el.querySelector('.sp-status').textContent = tok ? 'Connected' : 'Not connected';
    el.classList.toggle('on', !!tok);
    el.querySelector('.sp-go').textContent = tok ? 'Disconnect' : 'Connect Spotify';
  }

  function init() {
    $('music').addEventListener('pointerdown', e => {
      e.stopPropagation();
      const b = e.target.closest('[data-m]'); if (b) control(b.dataset.m);
    });
    Store.on(k => { if (k === 'showMusic' || k === 'musicColors') renderCard(); });
    finishLogin().then(poll);
  }
  return { row, init, get connected() { return !!tok; } };
})();
