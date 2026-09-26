/* Still v3 — every sound is synthesized live with WebAudio; no files */
window.Sound = (() => {
  let ctx = null, master, comp, verbIn, analyser, data, noiseBuf, muted = false, ducked = false;
  const curve = v => v * v;
  /* while a Spotify song plays (music.js) Still's own sound steps back under it */
  const gainNow = () => muted ? 0 : curve(Store.get('volume')) * (ducked ? 0.18 : 1);
  const live = () => ctx && ctx.state === 'running';
  const fx = () => live() && Store.get('sound');
  const R = Math.random;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = gainNow();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.3;
    master.connect(comp); comp.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; data = new Uint8Array(512);
    comp.connect(analyser);

    const verb = ctx.createConvolver(); verb.buffer = impulse(4.5, 2.6);
    verbIn = ctx.createGain(); verbIn.connect(verb);
    const vg = ctx.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = R() * 2 - 1;

    ctx.resume().then(() => {
      if (Store.get('ambient')) pad.start();
      boot();
    });
  }

  function impulse(sec, decay) {
    const n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  /* an output strip: gain -> pan -> master (+ reverb send) */
  function out(wet = 0.3, pan = 0, life = 6) {
    const g = ctx.createGain();
    let node = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
    node.connect(master);
    let s;
    if (wet > 0) { s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(verbIn); }
    setTimeout(() => { g.disconnect(); node.disconnect(); s && s.disconnect(); }, life * 1000);
    return g;
  }

  function tone(f, when = 0, g = 0.1, dur = 0.2, type = 'sine', wet = 0.2, pan = 0, glide = 0) {
    const t = ctx.currentTime + when, o = out(wet, pan, when + dur + 5);
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + dur);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + Math.min(0.01, dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env); env.connect(o);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function bell(f, when = 0, g = 0.15, dur = 2.5, wet = 0.45, pan = 0) {
    const t = ctx.currentTime + when, o = out(wet, pan, when + dur + 5);
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), env = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 2.4, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.04, t + dur * 0.5);
    mod.connect(mg); mg.connect(car.frequency); car.connect(env); env.connect(o);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const h = ctx.createOscillator(), hg = ctx.createGain();
    h.frequency.value = f * 2.005;
    hg.gain.setValueAtTime(g * 0.35, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.45);
    h.connect(hg); hg.connect(o);
    [car, mod, h].forEach(n => { n.start(t); n.stop(t + dur + 0.1); });
  }

  function noise(when, dur, g, type, f0, f1, Q = 1, wet = 0.2, pan = 0) {
    const t = ctx.currentTime + when, o = out(wet, pan, when + dur + 5);
    const src = ctx.createBufferSource(), filt = ctx.createBiquadFilter(), env = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    filt.type = type; filt.Q.value = Q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + dur * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(env); env.connect(o);
    src.start(t, R() * 1.5); src.stop(t + dur + 0.05);
  }

  /* ---------- the sound palette ---------- */
  let lastHover = 0;
  function ui(kind) {
    if (!fx()) return;
    switch (kind) {
      case 'hover': {
        const n = performance.now(); if (n - lastHover < 45) return; lastHover = n;
        tone(3800 + R() * 600, 0, 0.018, 0.035, 'sine', 0.05); break;
      }
      case 'click': tone(1500, 0, 0.06, 0.08, 'triangle', 0.15, 0, 700); break;
      case 'on': tone(880, 0, 0.06, 0.14, 'sine', 0.3); tone(1318.5, 0.06, 0.06, 0.25, 'sine', 0.35); break;
      case 'off': tone(1318.5, 0, 0.05, 0.12, 'sine', 0.3); tone(880, 0.06, 0.05, 0.2, 'sine', 0.3); break;
      case 'open': noise(0, 0.5, 0.09, 'bandpass', 300, 4200, 1.4, 0.5); tone(220, 0, 0.04, 0.45, 'sine', 0.4, 0, 440); break;
      case 'close': noise(0, 0.4, 0.07, 'bandpass', 3800, 260, 1.4, 0.5); tone(440, 0, 0.035, 0.35, 'sine', 0.4, 0, 220); break;
      case 'switch': noise(0, 0.7, 0.1, 'bandpass', 180, 6000, 2, 0.6); bell(659.25, 0.18, 0.05, 1.8, 0.7); bell(987.77, 0.26, 0.04, 1.8, 0.7); break;
    }
  }

  function flap(i = 0) {
    if (!fx()) return;
    const w = i * 0.001;
    noise(w, 0.035, 0.3, 'bandpass', 1400 + R() * 900, 900, 1.6, 0.05, (R() - 0.5) * 0.6);
    tone(140 + R() * 40, w, 0.09, 0.03, 'sine', 0);
  }

  const PENTA = [0, 2, 4, 7, 9];
  function pluck(x, y) {
    if (!fx()) return;
    const i = Math.max(0, Math.min(14, Math.floor(x * 15)));
    const f = 261.63 * Math.pow(2, (12 * Math.floor(i / 5) + PENTA[i % 5]) / 12);
    bell(f * (y < 0.33 ? 2 : 1), 0, 0.11, 2.6, 0.55, x * 2 - 1);
  }

  function shimmer() {
    if (!fx()) return;
    const notes = [1318.5, 1567.98, 1760, 1975.53, 2349.32, 2637.02];
    let k = (R() * 3) | 0;
    for (let j = 0; j < 4; j++) { bell(notes[k], j * 0.085, 0.032, 2.4, 0.8, (R() - 0.5) * 1.4); k = Math.min(notes.length - 1, k + 1 + (R() * 2 | 0)); }
  }

  /* a cast church bell: additive partials at the ratios real bells ring at (hum, prime, minor-third tierce,
     quint, nominal and above), each fading at its own rate, the low ones longest */
  const PARTIALS = [[0.5, 0.55, 1], [1, 0.8, 0.7], [1.183, 0.45, 0.5], [1.506, 0.3, 0.38], [2, 0.5, 0.32], [2.514, 0.18, 0.2], [2.662, 0.12, 0.16], [3.011, 0.14, 0.12], [4.166, 0.06, 0.08]];
  function tower(f, when = 0, g = 0.12, dur = 5, pan = 0) {
    const t = ctx.currentTime + when, o = out(0.55, pan, when + dur + 5);
    PARTIALS.forEach(([r, a, life]) => {
      const osc = ctx.createOscillator(), env = ctx.createGain();
      osc.frequency.value = f * r * (1 + (R() - 0.5) * 0.002);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(g * a, t + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur * life);
      osc.connect(env); env.connect(o); osc.start(t); osc.stop(t + dur * life + 0.05);
    });
    noise(when, 0.06, g * 0.5, 'bandpass', f * 6, f * 3, 2, 0.3, pan); /* the clapper's strike */
  }

  /* the Westminster Quarters, in E major, exactly as Big Ben rings them */
  const GS = 415.3, FS = 369.99, E4 = 329.63, B3 = 246.94;
  const PHRASE = [null, [GS, FS, E4, B3], [E4, GS, FS, B3], [E4, FS, GS, E4], [GS, E4, FS, B3], [B3, FS, GS, E4]];
  function phrases(list, start) {
    let t = start;
    list.forEach(n => { PHRASE[n].forEach((f, i) => tower(f, t + i * 0.62, 0.1, i === 3 ? 6 : 4.2, [-0.35, 0.1, 0.35, -0.1][i])); t += 0.62 * 3 + 1.25; });
    return t;
  }
  /* called every minute with the new time: rings what the chosen interval allows */
  function chimeAt(H, M) {
    const every = Store.get('chimeEvery');
    if (!live() || every === 'off' || ducked) return;
    const n = +every;
    if (M === 0) {
      const end = phrases([2, 3, 4, 5], 0), strikes = H % 12 || 12;
      for (let i = 0; i < strikes; i++) tower(164.81, end + 1 + i * 2.1, 0.16, 7, 0);
    } else if (M % 15 === 0) { if (n <= 15) phrases({ 15: [1], 30: [2, 3], 45: [4, 5, 1] }[M], 0); }
    else if (M % 5 === 0) { if (n <= 5) [E4 * 2, GS * 2, B3 * 4].forEach((f, i) => bell(f, i * 0.16, 0.05, 3.2, 0.75, (i - 1) * 0.5)); }
    else if (n === 1) bell(B3 * 8, 0, 0.03, 2.4, 0.85, (R() - 0.5) * 0.8);
  }
  /* a preview of the chosen interval, so picking it in settings tells you what it sounds like */
  function preview(every) {
    if (!live()) return;
    if (every === '1') bell(B3 * 8, 0, 0.03, 2.4, 0.85);
    else if (every === '5') [E4 * 2, GS * 2, B3 * 4].forEach((f, i) => bell(f, i * 0.16, 0.05, 3.2, 0.75, (i - 1) * 0.5));
    else if (every === '15' || every === '60') phrases([1], 0);
  }
  /* the alarm: a sunrise of bells that keeps climbing until you answer it. It is wired past the master
     gain on purpose, so mute and a low volume setting can never silence it */
  const alarm = { on: false };
  function alarmRing(on) {
    if (!ctx) return;
    if (!on) { alarm.on = false; clearInterval(alarm.t); if (alarm.g) { alarm.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); const g = alarm.g; setTimeout(() => g.disconnect(), 3000); alarm.g = null; } return; }
    if (alarm.on) return;
    alarm.on = true;
    const g = alarm.g = ctx.createGain();
    g.gain.setValueAtTime(0.35, ctx.currentTime); g.gain.linearRampToValueAtTime(1.4, ctx.currentTime + 90);
    g.connect(comp);
    const verb = ctx.createGain(); verb.gain.value = 0.4; g.connect(verb); verb.connect(verbIn);
    let n = 0;
    const ring = () => {
      if (!alarm.on || ctx.state !== 'running') return;
      const t = ctx.currentTime, up = Math.min(1, n / 10);
      [329.63, 415.3, 493.88, 659.25, 830.61].forEach((f, i) => {
        const o = ctx.createOscillator(), e = ctx.createGain(), m = ctx.createOscillator(), mg = ctx.createGain();
        o.frequency.value = f * (n % 4 === 3 ? 1.5 : 1); m.frequency.value = o.frequency.value * 3.5; mg.gain.value = f * 1.2;
        m.connect(mg); mg.connect(o.frequency); o.connect(e); e.connect(g);
        const s = t + i * (0.2 - up * 0.07);
        e.gain.setValueAtTime(0, s); e.gain.linearRampToValueAtTime(0.09, s + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, s + 2.6);
        o.start(s); m.start(s); o.stop(s + 2.7); m.stop(s + 2.7);
      });
      n++;
    };
    ring(); alarm.t = setInterval(ring, 3500);
  }

  /* the aurora surge (Space): a slow swell, no bang */
  function surge() {
    if (!fx()) return;
    noise(0, 3.2, 0.07, 'bandpass', 120, 2400, 1.1, 0.8);
    [329.63, 493.88, 659.25, 830.61, 987.77].forEach((f, i) => bell(f * 2, 0.5 + i * 0.22, 0.03, 4.5, 0.95, (i - 2) * 0.4));
  }

  function boom() {
    if (!fx()) return;
    tone(95, 0, 0.45, 1.6, 'sine', 0.2, 0, 28);
    noise(0, 1.8, 0.16, 'lowpass', 120, 5000, 0.8, 0.7);
    [329.63, 493.88, 659.25, 987.77, 1318.5].forEach((f, i) => bell(f, 0.05 + i * 0.045, 0.06, 4, 0.9, (i - 2) * 0.35));
  }

  function boot() {
    if (!fx()) return;
    noise(0, 1.6, 0.05, 'bandpass', 90, 3200, 1.2, 0.7);
    [220, 329.63, 440, 554.37, 659.25].forEach((f, i) => bell(f * 2, 1.0 + i * 0.07, 0.035, 3.5, 0.9, (i - 2) * 0.3));
  }

  /* ---------- the ambient drone: four chords gliding into each other ---------- */
  const CHORDS = [
    [55, 110, 164.81, 246.94, 329.63, 493.88],
    [43.65, 87.31, 130.81, 220, 329.63, 440],
    [65.41, 130.81, 196, 246.94, 392, 493.88],
    [49, 98, 146.83, 246.94, 293.66, 440],
  ];
  const pad = {
    on: false,
    start() {
      if (!live() || this.on) return;
      this.on = true; this.idx = 0;
      const g = this.gain = ctx.createGain(); g.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.8;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.045; lg.gain.value = 420; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
      lp.connect(g);
      const o = out(0.7, 0, 1e6); g.connect(o);
      this.nodes = [lfo, o];
      this.voices = CHORDS[0].map((f, i) => {
        const vg = ctx.createGain(); vg.gain.value = (i === 0 ? 0.12 : 0.05) / (1 + i * 0.25); vg.connect(lp);
        const oscs = [-9, 9].map(d => {
          const osc = ctx.createOscillator();
          osc.type = i === 0 ? 'sine' : 'sawtooth';
          osc.frequency.value = f; osc.detune.value = d + (R() - 0.5) * 4;
          osc.connect(vg); osc.start(); return osc;
        });
        return oscs;
      });
      g.gain.setTargetAtTime(0.55, ctx.currentTime, 2.5);
      this.t1 = setInterval(() => this.next(), 15000);
      this.t2 = setInterval(() => {
        if (R() < 0.55) { const ch = CHORDS[this.idx]; bell(ch[2 + (R() * 4 | 0)] * 4, 0, 0.018, 5, 0.95, R() * 1.6 - 0.8); }
      }, 3200);
    },
    next() {
      this.idx = (this.idx + 1) % CHORDS.length;
      const ch = CHORDS[this.idx];
      this.voices.forEach((oscs, i) => oscs.forEach(o => o.frequency.setTargetAtTime(ch[i], ctx.currentTime, 1.8)));
    },
    stop() {
      if (!this.on) return;
      this.on = false;
      clearInterval(this.t1); clearInterval(this.t2);
      const { gain, voices, nodes } = this;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.9);
      setTimeout(() => { voices.flat().forEach(o => o.stop()); nodes[0].stop(); gain.disconnect(); nodes[1].disconnect(); }, 5000);
    },
  };

  /* ---------- weather: a rain bed that follows intensity, thunder that rolls in late ---------- */
  let rain = null;
  function weather(level, wind) {
    if (!live()) return;
    const want = Store.get('sound') ? Math.min(1, level) * 0.22 : 0;
    if (!rain) {
      if (want < 0.002) return;
      const o = out(0.25, 0, 1e7), g = ctx.createGain(); g.gain.value = 0; g.connect(o);
      const mk = (type, f, q, gain) => {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        const gg = ctx.createGain(); gg.gain.value = gain;
        src.connect(fl); fl.connect(gg); gg.connect(g); src.start(0, R() * 1.5);
        return fl;
      };
      mk('bandpass', 900, 0.6, 1); mk('highpass', 5200, 0.5, 0.5);
      const w = mk('lowpass', 300, 0.8, 0);
      rain = { g, w };
    }
    rain.g.gain.setTargetAtTime(want, ctx.currentTime, 0.8);
  }
  function thunder(delay, strength) {
    if (!fx()) return;
    if (strength > 0.7) noise(delay, 0.35, 0.3 * strength, 'highpass', 2400, 600, 0.7, 0.5);
    noise(delay + 0.05, 4.5, 0.55 * strength, 'lowpass', 500, 55, 0.8, 0.6);
    tone(48, delay + 0.1, 0.3 * strength, 3.5, 'sine', 0.3, 0, 28);
  }

  Store.on((k, v) => {
    if (!ctx) return;
    if (k === 'volume') master.gain.setTargetAtTime(gainNow(), ctx.currentTime, 0.05);
    if (k === 'ambient') v ? pad.start() : pad.stop();
    if (k === 'chimeEvery') preview(v);
  });

  return {
    init, ui, flap, pluck, shimmer, chimeAt, preview, surge, boom, weather, thunder, alarm: alarmRing,
    running: live,
    duck(on) {
      if (on === ducked) return;
      ducked = on;
      if (ctx) master.gain.setTargetAtTime(gainNow(), ctx.currentTime, 0.6);
    },
    toggleMute() {
      muted = !muted;
      if (ctx) master.gain.setTargetAtTime(gainNow(), ctx.currentTime, 0.08);
      return muted;
    },
    level() {
      if (!live()) return 0;
      analyser.getByteTimeDomainData(data);
      let s = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; s += v * v; }
      return Math.min(1, Math.sqrt(s / data.length) * 4);
    },
  };
})();
