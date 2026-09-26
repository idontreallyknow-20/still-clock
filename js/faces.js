/* Still v3 — the four clock faces. Each is a factory so a leaving face can finish its exit
   while the next one arrives. Contract: mount(root) set(t, first) frame(dt, now, t) beat()
   bottom() anchor() relayout() unmount() */
const baseSize = () => Math.min(innerWidth * 0.24, innerHeight * 0.46) * Store.get('size');
const TAU = Math.PI * 2, rnd = Math.random;

/* ============ GLASS — liquid digits that roll, blur and shatter into sparks ============ */
function Glass() {
  let root, wrap, row, time, sec, pane, tx = 0, ty = 0, lastT = '';
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  function put(slot, c, delay, sparks) {
    slot.dataset.c = c;
    slot.querySelectorAll('.ch:not(.out)').forEach(o => {
      o.classList.remove('in', 'beat'); o.classList.add('out');
      o.style.animationDelay = delay + 'ms';
      setTimeout(() => o.remove(), 1600 + delay);
    });
    const n = document.createElement('span');
    n.className = 'ch in';
    n.style.animationDelay = delay + 'ms';
    if (c === ':') n.innerHTML = '<i></i><i></i>'; else n.textContent = c;
    slot.appendChild(n);
    if (sparks) setTimeout(() => {
      const r = slot.getBoundingClientRect();
      FX.burst(r.left + r.width / 2, r.top + r.height * 0.5, { n: 28, power: 5.5, jitter: r.width * 0.7, gravity: 0.05 });
    }, delay + 160);
  }
  function write(box, str, first, sparks) {
    const chars = [...str], slots = [...box.children];
    if (slots.length !== chars.length) {
      box.innerHTML = '';
      chars.forEach((c, i) => {
        const s = document.createElement('span');
        s.className = 'slot' + (c === ':' ? ' colon' : '');
        box.appendChild(s);
        put(s, c, first ? 250 + i * 120 : i * 50, sparks && !first);
      });
      return;
    }
    let j = 0;
    chars.forEach((c, i) => { if (slots[i].dataset.c !== c) put(slots[i], c, j++ * 75, sparks); });
  }
  /* a single band of light across the glass whenever the time changes */
  function sweep(delay) {
    setTimeout(() => {
      [time, pane].forEach(el => { el.classList.remove('sweep'); void el.offsetWidth; el.classList.add('sweep'); });
    }, delay);
  }
  return {
    mount(r) {
      root = r;
      /* a pane of frosted glass floats behind the digits: it blurs the real sky through it, catches a
         highlight where the pointer is, and the whole slab tilts toward you in 3D */
      r.innerHTML = '<div class="glass"><div class="g-pane"><i class="g-caustic"></i><i class="g-sheen"></i><i class="g-edge"></i></div><div class="g-row"><div class="g-time"></div><div class="g-sec"></div></div></div>';
      wrap = r.firstChild; pane = r.querySelector('.g-pane'); row = r.querySelector('.g-row'); time = r.querySelector('.g-time'); sec = r.querySelector('.g-sec');
    },
    frame() {
      const m = FX.mouse, k = Store.get('motion') === 'calm' ? 0.5 : 1;
      const nx = still.matches ? 0 : (m.nx || 0) * k, ny = still.matches ? 0 : (m.ny || 0) * k;
      tx += (nx - tx) * 0.06; ty += (ny - ty) * 0.06;
      const t = `rotateX(${(-ty * 10).toFixed(2)}deg) rotateY(${(tx * 14).toFixed(2)}deg)`;
      if (t === lastT) return;
      lastT = t; wrap.style.transform = t;
      pane.style.setProperty('--mx', (50 + tx * 90).toFixed(1) + '%'); pane.style.setProperty('--my', (35 + ty * 90).toFixed(1) + '%');
    },
    set(t, first) {
      const on = Store.get('seconds');
      wrap.classList.toggle('has-sec', on);
      if (first || time.dataset.hm !== t.hm) sweep(first ? 1300 : 0);
      time.dataset.hm = t.hm;
      write(time, t.hm, first, false);
      write(sec, on ? t.ss : '', first, false);
    },
    beat() {
      const c = time.querySelector('.colon .ch:not(.out)');
      if (!c) return;
      c.classList.remove('beat'); void c.offsetWidth; c.classList.add('beat');
    },
    bottom() { const r = pane.getBoundingClientRect(); return r.bottom + 16; },
    anchor() { const r = time.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  };
}

/* ============ SWARM — thousands of particles that hold the shape of the time ============ */
/* palettes can change without their name changing (the live Sky, album art), so caches key on the colours */
const palKeyOf = p => p.a + p.b + p.c + p.t1 + p.t2;
function Swarm() {
  let cv, ctx, gcv, gctx, W, H, P = [], dying = [], str = '', box = { cx: 0, cy: 0, bottom: 0, left: 0, w: 1 }, cols = [], palName = '';
  const mouse = FX.mouse, NB = 8;
  const buckets = Array.from({ length: NB }, () => []);

  function colors() {
    const p = pal(); palName = palKeyOf(p);
    const stops = [p.t1, p.t2, p.a, p.b, p.c];
    cols = Array.from({ length: NB }, (_, i) => {
      const t = i / (NB - 1) * (stops.length - 1), j = Math.min(stops.length - 2, Math.floor(t));
      return Col.mix(stops[j], stops[j + 1], t - j);
    });
  }
  function sample(s) {
    const fs = baseSize() * (Store.get('seconds') ? 0.78 : 1.05);
    const font = `500 ${fs}px Outfit, "Segoe UI Variable Display", "Segoe UI", sans-serif`;
    const oc = document.createElement('canvas'), o = oc.getContext('2d', { willReadFrequently: true });
    o.font = font;
    const tw = Math.ceil(o.measureText(s).width + fs * 0.1), th = Math.ceil(fs * 1.1);
    if (tw < 4 || th < 4) return [];
    oc.width = tw; oc.height = th;
    o.font = font; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
    o.fillText(s, tw / 2, th / 2);
    const d = o.getImageData(0, 0, tw, th).data;
    let step = Math.max(3, Math.round(fs / 62)), pts;
    do {
      pts = [];
      for (let y = 0, row = 0; y < th; y += step, row++)
        for (let x = row % 2 ? step >> 1 : 0; x < tw; x += step)
          if (d[(y * tw + x) * 4 + 3] > 130) pts.push({ x, y });
      step++;
    } while (pts.length > (LITE() ? 1500 : 4200));
    const ox = W / 2 - tw / 2, oy = H * 0.45 - th / 2;
    let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
    for (const p of pts) {
      p.x += ox; p.y += oy;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    }
    box = { cx: W / 2, cy: (minY + maxY) / 2, bottom: maxY + fs * 0.1, left: minX, w: Math.max(1, maxX - minX) };
    glow(s, font, fs, ox + tw / 2, oy + th / 2);
    return pts;
  }
  /* the luminous core: the time's shape, blurred, on a cheap half-res canvas; the swarm streams over it */
  let glowArgs = null;
  function glow(s, font, fs, x, y, flash = true) {
    if (!gctx) return;
    glowArgs = [s, font, fs, x, y];
    const k = gcv.width / W, p = pal(), g = gctx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, gcv.width, gcv.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    const grad = g.createLinearGradient(x - box.w / 2, 0, x + box.w / 2, 0);
    grad.addColorStop(0, p.a); grad.addColorStop(0.5, p.glow); grad.addColorStop(1, p.c);
    g.fillStyle = grad; g.shadowColor = p.glow; g.shadowBlur = fs * 0.35 * k;
    g.globalAlpha = 0.55; g.fillText(s, x, y);
    g.shadowBlur = fs * 0.12 * k; g.globalAlpha = 0.35; g.fillText(s, x, y);
    if (flash) { gcv.classList.remove('lit'); void gcv.offsetWidth; gcv.classList.add('lit'); }
  }
  function retarget(s, kick) {
    str = s;
    const T = sample(s).sort((a, b) => a.x - b.x);
    const old = P.slice().sort((a, b) => a.tx - b.tx), n = old.length, used = new Uint8Array(n), next = [];
    const m = MOTION(), wild = Store.get('motion') === 'wild';
    T.forEach((t, i) => {
      const j = n ? Math.min(n - 1, Math.floor(i * n / T.length)) : -1;
      let p;
      if (j >= 0 && !used[j]) { used[j] = 1; p = old[j]; }
      else {
        const s0 = j >= 0 ? old[j] : { x: rnd() * W, y: rnd() * H };
        p = { x: s0.x, y: s0.y, vx: (rnd() - 0.5) * 8, vy: (rnd() - 0.5) * 8, h: rnd(), tx: s0.x, ty: s0.y };
      }
      const moved = Math.abs(p.tx - t.x) + Math.abs(p.ty - t.y) > 4;
      p.tx = t.x; p.ty = t.y;
      if (kick && (moved || wild)) {
        const a = rnd() * TAU, v = (moved ? 3 + rnd() * 9 : 1 + rnd() * 3) * m;
        p.vx += Math.cos(a) * v; p.vy += Math.sin(a) * v;
      }
      next.push(p);
    });
    old.forEach((p, j) => { if (!used[j]) { p.life = 1; p.vx += (rnd() - 0.5) * 10; p.vy += (rnd() - 0.5) * 10; dying.push(p); } });
    P = next;
  }
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, LITE() ? 1 : 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gcv.width = Math.round(W * 0.5); gcv.height = Math.round(H * 0.5);
  }
  return {
    mount(r) {
      gcv = document.createElement('canvas'); gcv.className = 'face-canvas swarm-glow'; r.appendChild(gcv); gctx = gcv.getContext('2d');
      cv = document.createElement('canvas'); cv.className = 'face-canvas'; r.appendChild(cv);
      ctx = cv.getContext('2d'); resize(); colors();
    },
    set(t, first) {
      const s = t.hm + (Store.get('seconds') ? ':' + t.ss : '');
      if (s !== str) retarget(s, !first);
    },
    relayout() { resize(); if (str) retarget(str, false); },
    frame(dt, now) {
      if (palName !== palKeyOf(pal())) { colors(); if (glowArgs) glow(...glowArgs, false); }
      const k = Math.min(3, dt / 16.67), calm = Store.get('motion') === 'calm';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${calm ? 0.6 : 0.3})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const spring = 0.03, damp = Math.pow(0.86, k), RR = baseSize() * 0.42, R2 = RR * RR, mx = mouse.x, my = mouse.y;
      const wob = calm ? 0.03 : 0.07, t1 = now * 0.0013, t2 = now * 0.0011;
      buckets.forEach(b => b.length = 0);
      for (const p of P) {
        let ax = (p.tx - p.x) * spring, ay = (p.ty - p.y) * spring;
        ax += Math.sin(p.ty * 0.03 + t1 + p.h * 6) * wob;
        ay += Math.cos(p.tx * 0.03 + t2 + p.h * 6) * wob;
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < R2) { const d = Math.sqrt(d2) + 0.01, f = (1 - d / RR) * 2.4; ax += dx / d * f; ay += dy / d * f; }
        p.vx = (p.vx + ax * k) * damp; p.vy = (p.vy + ay * k) * damp;
        p.x += p.vx * k; p.y += p.vy * k;
        const b = Math.max(0, Math.min(NB - 1, Math.floor((p.tx - box.left) / box.w * NB)));
        buckets[b].push(p);
      }
      const sz = Math.max(1.6, baseSize() / 150), tw = now * 0.004;
      ctx.lineCap = 'round';
      buckets.forEach((b, i) => {
        ctx.fillStyle = ctx.strokeStyle = cols[i];
        ctx.lineWidth = sz;
        ctx.beginPath();
        for (const p of b) {
          const sp = Math.abs(p.vx) + Math.abs(p.vy);
          if (sp > 1.5) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2); }
          else { const s = sz * (0.55 + 0.6 * Math.abs(Math.sin(tw + p.h * 40))); ctx.rect(p.x - s / 2, p.y - s / 2, s, s); }
        }
        ctx.fill(); ctx.stroke();
      });
      /* a few particles catch the light each frame */
      if (P.length) {
        ctx.fillStyle = '#fff';
        for (let n = 0, m = LITE() ? 2 : 7; n < m; n++) {
          const p = P[(rnd() * P.length) | 0], s = sz * (1.5 + rnd() * 2.5);
          ctx.globalAlpha = 0.5 + rnd() * 0.5;
          ctx.fillRect(p.x - s, p.y - sz * 0.2, s * 2, sz * 0.4); ctx.fillRect(p.x - sz * 0.2, p.y - s, sz * 0.4, s * 2);
        }
        ctx.globalAlpha = 1;
      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const p = dying[i];
        p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.05; p.x += p.vx * k; p.y += p.vy * k; p.life -= 0.02 * k;
        if (p.life <= 0) { dying.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; ctx.fillStyle = cols[(p.h * NB) | 0];
        ctx.fillRect(p.x, p.y, sz, sz);
      }
      ctx.globalAlpha = 1;
    },
    beat() {},
    bottom() { return box.bottom; },
    anchor() { return { x: box.cx, y: box.cy }; },
  };
}

/* ============ FLIP — split-flap cards with real hinges and clacks ============ */
function Flip() {
  let root, wrap, groups;
  const DUR = () => ({ calm: 720, normal: 560, wild: 420 })[Store.get('motion')];
  function card() {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = '<div class="h t"><b></b></div><div class="h b"><b></b></div><div class="leaf"><div class="h f"><b></b></div><div class="h k"><b></b></div></div><span class="hinge"></span>';
    c._b = c.querySelectorAll('b'); c._v = ''; c._q = [];
    return c;
  }
  function flipOnce(c, v, d, spark, done) {
    const from = c._v; c._v = v;
    const [T, B, LF, LB] = c._b;
    T.textContent = v; B.textContent = from; LF.textContent = from; LB.textContent = v;
    c.style.setProperty('--fd', d + 'ms');
    c.classList.remove('flipping'); void c.offsetWidth; c.classList.add('flipping');
    Sound.flap();
    setTimeout(() => {
      B.textContent = v; c.classList.remove('flipping');
      Sound.flap();
      if (spark) { const r = c.getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 12, power: 4, spread: Math.PI * 0.8, angle: Math.PI / 2, jitter: r.width * 0.8 }); }
      done();
    }, d);
  }
  function run(c) {
    if (c._busy) return;
    const v = c._q.shift();
    if (v === undefined) return;
    if (v === c._v) return run(c);
    c._busy = true;
    const fast = c._q.length > 0;
    flipOnce(c, v, fast ? DUR() * 0.45 : DUR(), !fast && c._spark, () => { c._busy = false; run(c); });
  }
  function queue(c, v, delay, spark) {
    if (c._target === v) return;
    c._target = v; c._spark = spark;
    const wild = Store.get('motion') === 'wild' && c._v !== '';
    const digits = '0123456789';
    c._q = wild ? [digits[rnd() * 10 | 0], digits[rnd() * 10 | 0], v] : [v];
    clearTimeout(c._timer);
    c._timer = setTimeout(() => run(c), delay);
  }
  function group(g, s, first, offset) {
    const el = groups[g];
    while (el.children.length < s.length) el.appendChild(card());
    while (el.children.length > s.length) el.lastChild.remove();
    [...s].forEach((ch, i) => {
      const p = offset + i;
      queue(el.children[i], ch, first ? 300 + p * 140 : g === 's' ? 0 : (4 - p) * 110, false);
    });
  }
  return {
    mount(r) {
      root = r;
      r.innerHTML = '<div class="flip"><div class="f-g" data-g="h"></div><div class="f-colon"><i></i><i></i></div><div class="f-g" data-g="m"></div><div class="f-g f-s" data-g="s"></div></div>';
      wrap = r.firstChild;
      groups = {}; r.querySelectorAll('.f-g').forEach(g => groups[g.dataset.g] = g);
    },
    set(t, first) {
      const on = Store.get('seconds');
      wrap.classList.toggle('has-sec', on);
      group('h', t.hh, first, 0);
      group('m', t.mm, first, 2);
      group('s', on ? t.ss : '', first, 4);
    },
    beat() {
      const c = wrap.querySelector('.f-colon');
      c.classList.remove('beat'); void c.offsetWidth; c.classList.add('beat');
    },
    bottom() { const r = wrap.getBoundingClientRect(); return r.bottom + r.height * 0.12; },
    anchor() { const r = wrap.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  };
}

/* ============ ORBIT — the day as rings of light with comets for hands ============ */
function Orbit() {
  let cv, ctx, W, H, flash = 0, tilt = { x: 0, y: 0 }, geo = { cx: 0, cy: 0, R: 1 };
  const mouse = FX.mouse;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, LITE() ? 1 : 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function arc(r, a0, a1, w, style) {
    ctx.strokeStyle = style; ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke();
  }
  function comet(r, a, tail, w, color) {
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(a - tail, 0, 0);
      g.addColorStop(0, Col.rgba(color, 0)); g.addColorStop(tail / TAU, Col.rgba(color, 1)); g.addColorStop(Math.min(1, tail / TAU + 0.001), Col.rgba(color, 0));
      arc(r, a - tail, a, w, g);
    } else arc(r, a - tail * 0.3, a, w, Col.rgba(color, 0.8));
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const hg = ctx.createRadialGradient(x, y, 0, x, y, w * 5);
    hg.addColorStop(0, 'rgba(255,255,255,1)'); hg.addColorStop(0.25, Col.rgba(color, 0.9)); hg.addColorStop(1, Col.rgba(color, 0));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, w * 5, 0, TAU); ctx.fill();
  }
  return {
    mount(r) { cv = document.createElement('canvas'); cv.className = 'face-canvas'; r.appendChild(cv); ctx = cv.getContext('2d'); resize(); },
    relayout: resize,
    set(t, first) {
      if (first) return;
      flash = 1;
    },
    frame(dt, now, t) {
      const p = pal(), m = MOTION(), d = new Date();
      const s = d.getSeconds() + d.getMilliseconds() / 1000, mi = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + mi / 60;
      const R = Math.min(W * 0.3, H * 0.34) * Store.get('size'), cx = W / 2, cy = H * 0.45;
      tilt.x += ((mouse.nx || 0) - tilt.x) * 0.04; tilt.y += ((mouse.ny || 0) - tilt.y) * 0.04;
      const sy = 1 - Math.abs(tilt.y) * 0.35;
      geo = { cx, cy, R, sy };
      flash = Math.max(0, flash - dt / 1400);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(tilt.x * 0.14); ctx.scale(1, sy);
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';

      /* outer halo of dots */
      const rot = now * 0.00004 * (0.5 + m);
      const N = LITE() ? 60 : 180;
      for (let i = 0; i < N; i++) {
        const a = i / N * TAU + rot, big = i % (N / 12) === 0;
        ctx.fillStyle = Col.rgba(big ? p.t1 : p.t2, big ? 0.5 : 0.14 + flash * 0.3);
        const rr = R * 1.2, sz = big ? 2.2 : 1.1;
        ctx.fillRect(Math.cos(a) * rr - sz / 2, Math.sin(a) * rr - sz / 2, sz, sz);
      }
      /* hour ring */
      const seg = TAU / 12, gap = 0.07, hw = R * 0.045;
      for (let i = 0; i < 12; i++) {
        const a0 = -Math.PI / 2 + i * seg + gap / 2, a1 = a0 + seg - gap;
        arc(R, a0, a1, hw, Col.rgba(p.t2, 0.07));
        const f = Math.max(0, Math.min(1, hr - i));
        if (f > 0) arc(R, a0, a0 + (a1 - a0) * f, hw, Col.rgba(Col.mix(p.a, p.b, i / 11), 0.55 + flash * 0.3));
      }
      comet(R, -Math.PI / 2 + hr / 12 * TAU, 0.5, hw * 0.5, p.a);
      /* minute ticks */
      const rm = R * 0.86;
      for (let i = 0; i < 60; i++) {
        const a = -Math.PI / 2 + i / 60 * TAU, five = i % 5 === 0, lit = i <= Math.floor(mi);
        const l = R * (five ? 0.075 : 0.04);
        ctx.strokeStyle = lit ? Col.rgba(Col.mix(p.t1, p.c, i / 59), five ? 0.9 : 0.5) : Col.rgba(p.t2, five ? 0.2 : 0.08);
        ctx.lineWidth = five ? 2 : 1.2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * (rm - l), Math.sin(a) * (rm - l)); ctx.lineTo(Math.cos(a) * rm, Math.sin(a) * rm); ctx.stroke();
      }
      comet(rm + R * 0.03, -Math.PI / 2 + mi / 60 * TAU, 1.3, R * 0.018 * (1 + flash), p.c);
      /* seconds, or drifting satellites when seconds are off */
      const rs = R * 0.72;
      if (Store.get('seconds')) {
        arc(rs, -Math.PI / 2, -Math.PI / 2 + s / 60 * TAU, 1.4, Col.rgba(p.t2, 0.35));
        comet(rs, -Math.PI / 2 + s / 60 * TAU, 0.8, 1.6, p.t1);
      } else {
        arc(rs, 0, TAU, 1, Col.rgba(p.t2, 0.05 + 0.04 * Math.sin(now * 0.001)));
        for (let i = 0; i < 3; i++) {
          const a = now * 0.00012 * (i + 1) * (0.5 + m * 0.5) + i * 2.1;
          comet(rs, a, 0.45, 1.2, [p.a, p.b, p.c][i]);
        }
      }
      ctx.restore();

      /* numerals and the time, drawn flat so they stay crisp */
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `400 ${Math.max(10, R * 0.055)}px "JetBrains Mono", Consolas, monospace`;
      ctx.fillStyle = Col.rgba(p.t2, 0.45);
      [['12', 0], ['3', 1], ['6', 2], ['9', 3]].forEach(([n, q]) => {
        const a = -Math.PI / 2 + q * Math.PI / 2 + tilt.x * 0.14, rr = R * 1.09;
        ctx.fillText(n, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sy);
      });
      const fs = R * 0.44;
      ctx.font = `200 ${fs}px Outfit, "Segoe UI Variable Display", "Segoe UI", sans-serif`;
      const g = ctx.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2);
      g.addColorStop(0, p.t1); g.addColorStop(1, p.t2);
      ctx.fillStyle = g;
      ctx.shadowColor = Col.rgba(p.glow, 0.55 + flash * 0.45); ctx.shadowBlur = fs * (0.25 + flash * 0.5);
      ctx.fillText(t.hm, cx, cy + fs * 0.03);
      if (Store.get('seconds')) {
        ctx.shadowBlur = 0;
        ctx.font = `300 ${fs * 0.22}px "JetBrains Mono", Consolas, monospace`;
        ctx.fillStyle = Col.rgba(p.t2, 0.7);
        ctx.fillText(t.ss, cx, cy + fs * 0.62);
      }
      ctx.restore();
    },
    beat() {},
    bottom() { return geo.cy + geo.R * 1.2 * (geo.sy || 1) + 34; },
    anchor() { return { x: geo.cx, y: geo.cy }; },
  };
}

/* ============ the face switcher ============ */
window.Faces = (() => {
  const host = document.getElementById('face');
  /* Orbit and Swarm run in 3D on the GPU (js/gl3d.js); the 2D versions stay as the fallback */
  const REG = {
    glass: Glass, flip: Flip,
    swarm: () => window.GL3D ? GL3D.Swarm() : Swarm(),
    orbit: () => window.GL3D ? GL3D.Orbit() : Orbit(),
    nova: () => window.GL3D ? GL3D.Nova() : Orbit(),
  };
  let cur = null, alive = [];
  function show(name, t, first) {
    if (cur) {
      const old = cur;
      old.root.classList.add('leaving');
      old.leave && old.leave();
      setTimeout(() => { old.unmount && old.unmount(); old.root.remove(); alive = alive.filter(f => f !== old); }, 900);
    }
    const root = document.createElement('div');
    root.className = 'face-root entering face-' + name;
    host.appendChild(root);
    const f = (REG[name] || Glass)();
    f.root = root; f.name = name;
    f.mount(root);
    f.set(t, true);
    cur = f; alive.push(f);
    root.getBoundingClientRect(); setTimeout(() => root.classList.remove('entering'), 30);
    placeMeta(); setTimeout(placeMeta, 900);
  }
  function placeMeta() {
    if (!cur) return;
    const y = Math.min(innerHeight - 90, cur.bottom());
    document.getElementById('meta').style.top = y + 'px';
  }
  return {
    show, placeMeta,
    get name() { return cur && cur.name; },
    set(t, first) { cur && cur.set(t, first); },
    beat() { cur && cur.beat(); },
    frame(dt, now, t) { alive.forEach(f => f.frame && f.frame(dt, now, t)); },
    anchor() { return cur ? cur.anchor() : { x: innerWidth / 2, y: innerHeight / 2 }; },
    relayout() { alive.forEach(f => f.relayout && f.relayout()); placeMeta(); },
  };
})();
