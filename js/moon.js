/* Still — the Moon's face, painted once from a real map: the maria at their selenographic positions
   (Procellarum, Imbrium, Serenitatis, Tranquillitatis, Crisium...), a cratered highland crust, and the
   bright ray craters Tycho, Copernicus, Kepler and Aristarchus. One equirectangular map feeds both the
   3D moon in the Orbit face and the flat disc in the sky, so they are the same Moon. */
window.MoonMap = (() => {
  const W = 1024, H = 512, TAU = Math.PI * 2;
  let seed = 20260925;
  const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const X = lon => (lon + 180) / 360 * W, Y = lat => (90 - lat) / 180 * H, S = deg => deg / 360 * W;

  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#cfcac0'; g.fillRect(0, 0, W, H);
  /* crust: soft mottling at several scales */
  for (const [n, size, a] of [[260, 60, 0.06], [900, 18, 0.07], [5000, 3, 0.09]]) {
    for (let i = 0; i < n; i++) {
      const x = rr() * W, y = rr() * H, r = size * (0.4 + rr());
      const gr = g.createRadialGradient(x, y, 0, x, y, r), light = rr() < 0.5;
      gr.addColorStop(0, light ? `rgba(235,232,225,${a})` : `rgba(90,88,92,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  /* the maria: [lon, lat, radius deg, tint] */
  const MARIA = [
    [-57, 18, 20, 0], [-50, 4, 14, 0], [-63, 31, 13, 0], [-44, -4, 10, 0], [-66, 5, 12, 0], [-38, 22, 10, 0], /* Oceanus Procellarum */
    [-16, 33, 15, 1], [-26, 39, 9, 1], [-5, 30, 7, 1],                                                        /* Imbrium */
    [17, 28, 9, 2],                                                                                              /* Serenitatis */
    [31, 8, 10, 3], [24, 4, 6, 3], [38, 14, 6, 3],                                                              /* Tranquillitatis */
    [59, 17, 7, 1], [51, -7, 8, 2], [47, -15, 5, 2], [35, -15, 5, 1],                                           /* Crisium, Fecunditatis, Nectaris */
    [-17, -21, 9, 0], [-23, -10, 5, 0], [-39, -24, 5, 1], [-31, 7, 5, 0], [4, 13, 4, 1],                        /* Nubium, Cognitum, Humorum, Insularum, Vaporum */
    [-40, 57, 4, 1], [-25, 57, 4, 1], [-10, 58, 4, 1], [5, 57, 4, 1], [20, 56, 4, 1],                           /* Frigoris, a thin band */
    [86, -2, 5, 2], [86, 13, 4, 2], [80, -42, 6, 2], [147, 27, 4, 1],                                           /* limb seas and Moscoviense */
  ];
  const TINT = ['92,90,96', '86,85,92', '98,92,88', '80,86,100'];
  /* the seas are painted on their own layer from many overlapping lobes, then laid down blurred, so they
     merge into the broad connected dark plains the real near side has instead of reading as spots */
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
  const m = mc.getContext('2d');
  for (const [lon, lat, rd, t] of MARIA) {
    for (let k = 0; k < 14; k++) {
      const ox = (rr() - 0.5) * rd * 1.2, oy = (rr() - 0.5) * rd * 1.0, r = S(rd * (0.85 + rr() * 0.6)) / Math.max(0.35, Math.cos((lat + oy) * Math.PI / 180));
      const x = X(lon + ox), y = Y(lat + oy);
      const gr = m.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${TINT[t]},.22)`); gr.addColorStop(0.55, `rgba(${TINT[t]},.17)`); gr.addColorStop(1, `rgba(${TINT[t]},0)`);
      m.fillStyle = gr; m.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  g.filter = 'blur(9px)'; g.drawImage(mc, 0, 0); g.globalAlpha = 0.45; g.drawImage(mc, 0, 0); g.globalAlpha = 1; g.filter = 'none';
  /* craters: a power law of sizes, each a shadowed rim and a lit floor */
  /* under a high sun (which is how we mostly see it) craters show as faint rings, not holes */
  for (let i = 0; i < 1500; i++) {
    const x = rr() * W, y = H * (0.06 + rr() * 0.88), r = 0.6 + Math.pow(rr(), 6) * 11;
    g.fillStyle = `rgba(70,68,74,${0.05 + rr() * 0.06})`; g.beginPath(); g.arc(x + r * 0.12, y + r * 0.12, r, 0, TAU); g.fill();
    g.fillStyle = `rgba(250,247,240,${0.06 + rr() * 0.07})`; g.beginPath(); g.arc(x - r * 0.1, y - r * 0.1, r * 0.8, 0, TAU); g.fill();
  }
  /* young bright ray craters */
  g.globalCompositeOperation = 'lighter';
  for (const [lon, lat, len, n, a] of [[-11, -43, 55, 22, 0.08], [-20, 10, 28, 16, 0.06], [-38, 8, 18, 12, 0.05], [-47, 24, 12, 10, 0.07], [40, -18, 14, 10, 0.04]]) {
    const x = X(lon), y = Y(lat);
    for (let i = 0; i < n; i++) {
      const ang = rr() * TAU, L = S(len * (0.4 + rr() * 0.6));
      const gr = g.createLinearGradient(x, y, x + Math.cos(ang) * L, y + Math.sin(ang) * L * 0.9);
      gr.addColorStop(0, `rgba(255,252,245,${a})`); gr.addColorStop(1, 'rgba(255,252,245,0)');
      g.strokeStyle = gr; g.lineWidth = 1 + rr() * 2.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L * 0.9); g.stroke();
    }
    const gr = g.createRadialGradient(x, y, 0, x, y, 6); gr.addColorStop(0, 'rgba(255,255,250,.5)'); gr.addColorStop(1, 'rgba(255,255,250,0)');
    g.fillStyle = gr; g.fillRect(x - 6, y - 6, 12, 12);
  }
  g.globalCompositeOperation = 'source-over';

  const px = g.getImageData(0, 0, W, H).data;
  /* the near side as a lit disc (orthographic), with a hint of limb darkening and a soft anti-aliased edge */
  function disk(size) {
    const d = document.createElement('canvas'); d.width = d.height = size;
    const o = d.getContext('2d'), img = o.createImageData(size, size), out = img.data;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const nx = (i + 0.5) / size * 2 - 1, ny = 1 - (j + 0.5) / size * 2, r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2), lat = Math.asin(ny), lon = Math.atan2(nx, z);
      const u = Math.min(W - 1, ((lon / Math.PI + 1) / 2 * W) | 0), v = Math.min(H - 1, ((0.5 - lat / Math.PI) * H) | 0);
      const s = (v * W + u) * 4, k = (j * size + i) * 4, dark = 0.82 + 0.18 * Math.sqrt(z);
      out[k] = px[s] * dark; out[k + 1] = px[s + 1] * dark; out[k + 2] = px[s + 2] * dark;
      out[k + 3] = Math.max(0, Math.min(1, (1 - Math.sqrt(r2)) * size * 0.5)) * 255;
    }
    o.putImageData(img, 0, 0);
    return d;
  }
  return { equirect: c, disk };
})();
