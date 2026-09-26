/* Still — Dance to music: listens through the microphone and moves the whole scene with whatever is
   playing out loud. The bass drives beats (a pulse through the aurora, the 3D faces and the sky), the
   overall loudness breathes into the glow. Nothing is recorded or sent anywhere: the audio only feeds an
   analyser that is never connected to the speakers. (Spotify stopped sharing beat data with new apps,
   so listening is the one way to follow any song, from any app.) */
window.Listen = (() => {
  let ac = null, an = null, stream = null, bins = null, on = false;
  let level = 0, beats = 0, gen = 0, lastT = 0, detect = BeatDetector();

  /* each start gets a number; a permission that resolves after the switch has moved on releases its own stream */
  async function start() {
    stop();
    const my = ++gen;
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      if (my !== gen) return;
      UI.toast(e && e.name === 'NotAllowedError' ? 'Microphone blocked, allow it to dance to music' : 'No microphone found', 3200);
      Store.set('musicReact', false);
      return;
    }
    if (my !== gen || !Store.get('musicReact')) { s.getTracks().forEach(t => t.stop()); return; }
    stream = s;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume().catch(() => {});   // made after an await, so it can start paused
    an = ac.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.3;
    ac.createMediaStreamSource(stream).connect(an);      // analyser only: never reaches the speakers
    bins = new Float32Array(an.frequencyBinCount);
    on = true; level = 0; lastT = 0; detect = BeatDetector();
    UI.toast('Listening · play some music', 2400);
  }
  function stop() {
    gen++; on = false; level = 0;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (ac) ac.close().catch(() => {});
    stream = ac = an = null;
  }

  /* called every frame by main.js */
  function frame(now) {
    if (!on || !an) { level *= 0.9; return; }
    /* decibels, turned back into linear power: the byte view squashes loud music flat, and a kick
       only stands out as a jump in power */
    an.getFloatFrequencyData(bins);
    const hz = ac.sampleRate / an.fftSize, gain = Store.get('reactGain'), pw = db => db > -160 ? Math.pow(10, db / 10) : 0;
    let bass = 0, all = 0;
    const b0 = Math.max(1, Math.round(35 / hz)), b1 = Math.round(160 / hz), top = Math.round(8000 / hz);
    for (let i = b0; i <= b1; i++) bass += pw(bins[i]);
    for (let i = 1; i < top; i++) all += pw(bins[i]);
    bass /= b1 - b0 + 1; all /= top - 1;
    const loud = Math.max(0, Math.min(1, (10 * Math.log10(all + 1e-12) + 75) / 50));   // about -75 dB (quiet) to -25 dB (loud)
    /* smoothing runs on real time, not frames, so a slow screen hears the same beats as a fast one */
    const dt = lastT ? Math.min(0.25, (now - lastT) / 1000) : 1 / 60; lastT = now;
    const ease = tau => 1 - Math.exp(-dt / tau);
    level += (Math.min(1, loud * gain) - level) * ease(0.08);
    const k = detect(bass, now, gain);   // js/beat.js, tested in tests/beat.test.js
    if (k > 0) {
      beats++;
      const a = Faces.anchor();
      BG.pulse(a.x, a.y, 0.35 + k * 0.4);
      window.GL3D && GL3D.pulse(0.5 + k * 0.6);
      if (k > 0.9 && beats % 8 === 0) BG.surge();          // a big drop now and then lights the aurora up
    }
  }

  Store.on((k, v) => { if (k === 'musicReact') v ? start() : stop(); });
  /* if the browser held the listener paused, the next click wakes it */
  addEventListener('pointerdown', () => { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); });
  function init() { if (Store.get('musicReact')) start(); }
  return { init, frame, get level() { return level; }, get on() { return on; }, get beats() { return beats; } };
})();
