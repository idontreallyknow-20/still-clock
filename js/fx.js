/* Still v3 — the particle layer: parallax stars, sparks, shockwaves, shooting stars, cursor dust */
window.FX = (() => {
  const cv = document.getElementById('fx'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, parts = [], rings = [], shoots = [];
  let nextShoot = performance.now() + 4000, clean = false;
  const mouse = { x: -1e4, y: -1e4, lx: null, ly: null, nx: 0, ny: 0 }, par = { x: 0, y: 0 };
  const R = Math.random, TAU = Math.PI * 2;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, LITE() ? 1 : [2, 1.5, 1, 1][QUALITY.tier]);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; clean = true;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function burst(x, y, o = {}) {
    const m = MOTION(), p = pal();
    const n = Math.round((o.n || 40) * m * (LITE() ? 0.35 : 1)), colors = o.colors || [p.a, p.b, p.c, p.t1];
    for (let i = 0; i < n && parts.length < (LITE() ? 700 : 3000); i++) {
      const a = (o.angle ?? 0) + (R() - 0.5) * (o.spread ?? TAU), v = (o.power || 6) * (0.2 + R() * 0.9) * (0.6 + m * 0.4);
      const life = (o.life || 70) * (0.5 + R());
      parts.push({ x: x + (R() - 0.5) * (o.jitter || 0), y: y + (R() - 0.5) * (o.jitter || 0), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life, max: life, c: colors[(R() * colors.length) | 0], s: (o.size || 2) * (0.4 + R()), g: o.gravity ?? 0.03, drag: o.drag ?? 0.965 });
    }
  }

  function ring(x, y, o = {}) {
    rings.push({ x, y, r: o.r0 || 8, v: (o.v || 9) * (0.6 + MOTION() * 0.4), life: 1, decay: o.decay || 0.018, c: o.color || pal().glow, w: o.w || 2 });
  }

  function shooting() {
    const dir = R() < 0.5 ? 1 : -1, sp = 11 + R() * 9;
    shoots.push({ x: dir > 0 ? R() * W * 0.5 : W * 0.5 + R() * W * 0.5, y: R() * H * 0.35, vx: dir * sp, vy: sp * (0.25 + R() * 0.3), life: 1 });
  }

  function frame(dt, now) {
    const k = Math.min(3, dt / 16.67), m = MOTION(), p = pal();
    /* nothing on the layer and nothing to draw: skip the clear, so an idle frame costs nothing */
    const busy = shoots.length || rings.length || parts.length || (now > nextShoot && window.Sky && Sky.dark > 0.6);
    par.x += (mouse.nx - par.x) * 0.04; par.y += (mouse.ny - par.y) * 0.04;
    if (!busy && clean) return;
    ctx.clearRect(0, 0, W, H);
    clean = !busy;

    ctx.globalCompositeOperation = 'lighter';

    /* shooting stars */
    if (now > nextShoot && window.Sky && Sky.dark > 0.6) { shooting(); nextShoot = now + (14000 + R() * 20000) / m; }
    for (let i = shoots.length - 1; i >= 0; i--) {
      const s = shoots[i];
      s.x += s.vx * k; s.y += s.vy * k; s.life -= 0.012 * k;
      if (s.life <= 0 || s.x < -200 || s.x > W + 200 || s.y > H) { shoots.splice(i, 1); continue; }
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 9, s.y - s.vy * 9);
      g.addColorStop(0, `rgba(255,255,255,${s.life})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 9, s.y - s.vy * 9); ctx.stroke();
      if (R() < 0.4 * k) parts.push({ x: s.x, y: s.y, vx: (R() - 0.5), vy: (R() - 0.5), life: 30, max: 30, c: p.t2, s: 1.2, g: 0.01, drag: 0.95 });
    }

    /* rings */
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += r.v * k; r.v *= Math.pow(0.975, k); r.life -= r.decay * k;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      ctx.strokeStyle = Col.rgba(r.c, r.life * 0.8); ctx.lineWidth = r.w * (0.5 + r.life);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = Col.rgba(r.c, r.life * 0.18); ctx.lineWidth = r.w * 6 * r.life;
      ctx.stroke();
    }

    /* sparks */
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.vx *= Math.pow(q.drag, k); q.vy = q.vy * Math.pow(q.drag, k) + q.g * k;
      q.x += q.vx * k; q.y += q.vy * k; q.life -= k;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      const a = q.life / q.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.c;
      const sp = Math.abs(q.vx) + Math.abs(q.vy);
      if (sp > 3) {
        ctx.strokeStyle = q.c; ctx.lineWidth = q.s;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 2.2, q.y - q.vy * 2.2); ctx.stroke();
      } else ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
    }
    ctx.globalAlpha = 1;
  }

  addEventListener('pointermove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    [mouse.nx, mouse.ny] = normPointer(e.clientX, e.clientY);
    if (mouse.lx !== null && Store.get('motion') !== 'calm' && !LITE()) {
      const dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly, d = Math.hypot(dx, dy);
      const n = Math.min(4, Math.floor(d / 14)), P = pal();
      for (let i = 0; i < n; i++) {
        const t = i / n;
        parts.push({ x: mouse.lx + dx * t, y: mouse.ly + dy * t, vx: (R() - 0.5) * 0.8 + dx * 0.02, vy: (R() - 0.5) * 0.8 + dy * 0.02,
          life: 40, max: 40, c: R() < 0.5 ? P.glow : P.t2, s: 1.4, g: -0.01, drag: 0.94 });
      }
    }
    mouse.lx = mouse.x; mouse.ly = mouse.y;
  });

  return { resize, frame, burst, ring, shooting, mouse };
})();
