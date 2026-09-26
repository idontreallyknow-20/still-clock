/* Still — astronomy for Richmond Hill, Ontario. The sun, a Meeus-grade moon (about 0.05° with
   parallax and refraction), and the naked-eye planets from JPL's Keplerian elements. Shared by the
   sky and the Orbit face so both show the same sky at the same instant. */
window.Astro = (() => {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const LOC = { lat: 43.8828, lon: -79.4403, name: 'Richmond Hill' };
  const norm = d => ((d % 360) + 360) % 360;
  const jd = ms => ms / 86400000 + 2440587.5;
  const cent = ms => (jd(ms) - 2451545) / 36525;
  const obl = T => (23.439291 - 0.0130042 * T) * D2R;
  const lst = ms => norm(280.46061837 + 360.98564736629 * (jd(ms) - 2451545) + LOC.lon);

  function ecl2eq(lam, bet, T) {
    const e = obl(T), sl = Math.sin(lam), cb = Math.cos(bet), sb = Math.sin(bet);
    return {
      ra: norm(Math.atan2(sl * Math.cos(e) - Math.tan(bet) * Math.sin(e), Math.cos(lam)) * R2D),
      dec: Math.asin(sb * Math.cos(e) + cb * Math.sin(e) * sl) * R2D,
    };
  }

  function sun(ms) {
    const n = jd(ms) - 2451545, g = (357.528 + 0.9856003 * n) * D2R;
    const lam = (280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
    return { ...ecl2eq(lam, 0, cent(ms)), lon: norm(lam * R2D) };
  }

  /* Meeus ch. 47, the terms above ~0.004° in longitude and latitude */
  const LR = [ // D M M' F  sinL(deg)  cosR(km)
    [0, 0, 1, 0, 6.288774, -20905.355], [2, 0, -1, 0, 1.274027, -3699.111], [2, 0, 0, 0, 0.658314, -2955.968],
    [0, 0, 2, 0, 0.213618, -569.925], [0, 1, 0, 0, -0.185116, 48.888], [0, 0, 0, 2, -0.114332, -3.149],
    [2, 0, -2, 0, 0.058793, 246.158], [2, -1, -1, 0, 0.057066, -152.138], [2, 0, 1, 0, 0.053322, -170.733],
    [2, -1, 0, 0, 0.045758, -204.586], [0, 1, -1, 0, -0.040923, -129.620], [1, 0, 0, 0, -0.034720, 108.743],
    [0, 1, 1, 0, -0.030383, 104.755], [2, 0, 0, -2, 0.015327, 10.321], [0, 0, 1, 2, -0.012528, 0],
    [0, 0, 1, -2, 0.010980, 79.661], [4, 0, -1, 0, 0.010675, -34.782], [0, 0, 3, 0, 0.010034, -23.210],
    [4, 0, -2, 0, 0.008548, -21.636], [2, 1, -1, 0, -0.007888, 24.208], [2, 1, 0, 0, -0.006766, 30.824],
    [1, 0, -1, 0, -0.005163, -8.379], [1, 1, 0, 0, 0.004987, -16.675], [2, -1, 1, 0, 0.004036, -12.831],
    [2, 0, 2, 0, 0.003994, -10.445], [4, 0, 0, 0, 0.003861, -11.650], [2, 0, -3, 0, 0.003665, 14.403],
  ];
  const BT = [
    [0, 0, 0, 1, 5.128122], [0, 0, 1, 1, 0.280602], [0, 0, 1, -1, 0.277693], [2, 0, 0, -1, 0.173237],
    [2, 0, -1, 1, 0.055413], [2, 0, -1, -1, 0.046271], [2, 0, 0, 1, 0.032573], [0, 0, 2, 1, 0.017198],
    [2, 0, 1, -1, 0.009266], [0, 0, 2, -1, 0.008822], [2, -1, 0, -1, 0.008216], [2, 0, -2, -1, 0.004324],
    [2, 0, 1, 1, 0.004200], [2, 1, 0, -1, -0.003359],
  ];
  function moon(ms) {
    const T = cent(ms);
    const Lp = norm(218.3164477 + 481267.88123421 * T) * D2R, D = norm(297.8501921 + 445267.1114034 * T) * D2R;
    const M = norm(357.5291092 + 35999.0502909 * T) * D2R, Mp = norm(134.9633964 + 477198.8675055 * T) * D2R;
    const F = norm(93.2720950 + 483202.0175233 * T) * D2R, E = 1 - 0.002516 * T;
    const A1 = (119.75 + 131.849 * T) * D2R, A2 = (53.09 + 479264.29 * T) * D2R, A3 = (313.45 + 481266.484 * T) * D2R;
    let sl = 0, sr = 0, sb = 0;
    for (const [d, m, mp, f, l, r] of LR) {
      const arg = d * D + m * M + mp * Mp + f * F, e = m ? E : 1;
      sl += l * e * Math.sin(arg); sr += r * e * Math.cos(arg);
    }
    for (const [d, m, mp, f, b] of BT) sb += b * (m ? E : 1) * Math.sin(d * D + m * M + mp * Mp + f * F);
    sl += 0.003958 * Math.sin(A1) + 0.001962 * Math.sin(Lp - F) + 0.000318 * Math.sin(A2);
    sb += -0.002235 * Math.sin(Lp) + 0.000382 * Math.sin(A3) + 0.000175 * Math.sin(A1 - F) + 0.000175 * Math.sin(A1 + F)
      + 0.000127 * Math.sin(Lp - Mp) - 0.000115 * Math.sin(Lp + Mp);
    const lam = Lp + sl * D2R, bet = sb * D2R, dist = 385000.56 + sr;
    return { ...ecl2eq(lam, bet, T), lon: norm(lam * R2D), dist, par: Math.asin(6378.14 / dist) * R2D };
  }

  /* planets: JPL approximate elements, valid 1800-2050. [a, e, I, L, peri, node] and rates per century */
  const EL = {
    Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], -0.2, [1, 0.9, 0.8]],
    Venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418], -4.2, [1, 0.97, 0.88]],
    Earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
    Mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], 0.6, [1, 0.62, 0.42]],
    Jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], -2.3, [1, 0.94, 0.84]],
    Saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], 0.6, [1, 0.9, 0.7]],
  };
  function helio(name, T) {
    const [b, r] = EL[name], [a, e, I, L, w, N] = b.map((v, i) => v + r[i] * T);
    let M = norm(L - w); if (M > 180) M -= 360; M *= D2R;
    let Ea = M + e * Math.sin(M);
    for (let i = 0; i < 6; i++) Ea -= (Ea - e * Math.sin(Ea) - M) / (1 - e * Math.cos(Ea));
    const xp = a * (Math.cos(Ea) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(Ea);
    const om = (w - N) * D2R, Om = N * D2R, i = I * D2R;
    const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(i), si = Math.sin(i);
    return [
      (co * cO - so * sO * ci) * xp + (-so * cO - co * sO * ci) * yp,
      (co * sO + so * cO * ci) * xp + (-so * sO + co * cO * ci) * yp,
      (so * si) * xp + (co * si) * yp,
    ];
  }
  function planets(ms) {
    const T = cent(ms), E = helio('Earth', T), out = [];
    for (const n of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) {
      const P = helio(n, T), x = P[0] - E[0], y = P[1] - E[1], z = P[2] - E[2];
      const lam = Math.atan2(y, x), bet = Math.atan2(z, Math.hypot(x, y));
      out.push({ name: n, ...ecl2eq(lam, bet, T), mag: EL[n][2], col: EL[n][3] });
    }
    return out;
  }

  /* equatorial -> [alt, az] radians, az from north through east; topocentric parallax and refraction when asked */
  function altaz(ra, dec, lstDeg, par = 0) {
    const H = (lstDeg - ra) * D2R, d = dec * D2R, p = LOC.lat * D2R;
    let alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H) * Math.cos(d), Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(H));
    if (par) alt -= par * D2R * Math.cos(alt);
    const h = alt * R2D;
    if (h > -1.5) alt += (1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R)) / 60 * D2R;
    return [alt, az];
  }
  /* half the arc a body spends above the horizon, as an hour angle in degrees (0: never up, 180: never sets) */
  function semiArc(dec, h0 = -0.833) {
    const p = LOC.lat * D2R, d = dec * D2R;
    const c = (Math.sin(h0 * D2R) - Math.sin(p) * Math.sin(d)) / (Math.cos(p) * Math.cos(d));
    return c >= 1 ? 0 : c <= -1 ? 180 : Math.acos(c) * R2D;
  }
  /* phase: illuminated fraction, phase angle (radians) and whether it is waxing */
  function phase(s, m) {
    const e = Math.acos(Math.max(-1, Math.min(1, Math.sin(s.dec * D2R) * Math.sin(m.dec * D2R) +
      Math.cos(s.dec * D2R) * Math.cos(m.dec * D2R) * Math.cos((s.ra - m.ra) * D2R))));
    const i = Math.atan2(149598000 * Math.sin(e), m.dist - 149598000 * Math.cos(e));
    return { illum: (1 + Math.cos(i)) / 2, angle: i, waxing: norm(m.lon - s.lon) < 180, age: norm(m.lon - s.lon) / 360 * 29.530589 };
  }
  return { LOC, D2R, R2D, jd, lst, sun, moon, planets, altaz, semiArc, phase, norm };
})();
