/* Still — Dance to music: listens through the microphone and moves the whole scene with whatever is
   playing out loud. The bass drives beats (a pulse through the aurora, the 3D faces and the sky), the
   overall loudness breathes into the glow. Nothing is recorded or sent anywhere: the audio only feeds an
   analyser that is never connected to the speakers. (Spotify stopped sharing beat data with new apps,
   so listening is the one way to follow any song, from any app.) */
window.Listen = (() => {
  let ac = null, an = null, stream = null, bins = null, on = false;
  let level = 0, bassAvg = 0, lastBeat = 0, beats = 0;

  async function start() {
    if (on) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      UI.toast(e && e.name === 'NotAllowedError' ? 'Microphone blocked, allow it to dance to music' : 'No microphone found', 3200);
      Store.set('musicReact', false);
      return;
    }
    if (!Store.get('musicReact')) { stop(); return; }   // turned off while the permission prompt was up
    ac = new (window.AudioContext || window.webkitAudioContext)();
    an = ac.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.55;
    ac.createMediaStreamSource(stream).connect(an);      // analyser only: never reaches the speakers
    bins = new Uint8Array(an.frequencyBinCount);
    on = true; bassAvg = 0; level = 0;
    UI.toast('Listening · play some music', 2400);
  }
  function stop() {
    on = false; level = 0;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (ac) ac.close().catch(() => {});
    stream = ac = an = null;
  }

  /* called every frame by main.js */
  function frame(now) {
    if (!on || !an) { level *= 0.9; return; }
    an.getByteFrequencyData(bins);
    const hz = ac.sampleRate / an.fftSize, gain = Store.get('reactGain');
    let bass = 0, all = 0;
    const b0 = Math.max(1, Math.round(35 / hz)), b1 = Math.round(160 / hz), top = Math.round(8000 / hz);
    for (let i = b0; i <= b1; i++) bass += bins[i];
    for (let i = 1; i < top; i++) all += bins[i];
    bass = bass / (b1 - b0 + 1) / 255; all = all / (top - 1) / 255;
    level += (Math.min(1, all * 2.2 * gain) - level) * 0.18;
    /* a beat is the bass jumping well above its recent average */
    const rising = bass > bassAvg * (1.1 + 0.2 / gain);
    bassAvg += (bass - bassAvg) * 0.035;
    if (bass * gain > 0.16 && rising && now - lastBeat > 230) {
      lastBeat = now; beats++;
      const k = Math.min(1.4, (bass - bassAvg) * 6 * gain), a = Faces.anchor();
      BG.pulse(a.x, a.y, 0.35 + k * 0.4);
      window.GL3D && GL3D.pulse(0.5 + k * 0.6);
      if (k > 0.9 && beats % 8 === 0) BG.surge();          // a big drop now and then lights the aurora up
    }
  }

  Store.on((k, v) => { if (k === 'musicReact') v ? start() : stop(); });
  function init() { if (Store.get('musicReact')) start(); }
  return { init, frame, get level() { return level; }, get on() { return on; }, get beats() { return beats; } };
})();
