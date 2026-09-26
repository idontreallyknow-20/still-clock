/* Still — the beat detector, on its own so it can be tested without a browser (tests/beat.test.js).
   Feed it the bass power (linear, not dB) once a frame with the time in ms. It keeps a running average
   on real time rather than frames, so a slow screen hears the same beats as a fast one. The average
   rises slowly and falls fast, so it sits on the quiet floor between hits and every kick stands out
   against it. It re-arms only once the bass has fallen back, so one kick is one beat.
   Returns the beat's strength, or 0. */
(function (g) {
  function BeatDetector() {
    let avg = -1, armed = true, last = 0, lastT = 0;
    return function step(bass, now, gain = 1) {
      const dt = lastT ? Math.min(0.25, (now - lastT) / 1000) : 1 / 60; lastT = now;
      if (avg < 0) avg = bass;
      /* a jump to x(1.5 + 1.5/gain) the average: about +4.8 dB at normal sensitivity */
      const base = Math.max(avg, 1e-9);   // a floor near -90 dB: after silence, a faint sound is not a huge jump
      const rising = bass > base * (1.5 + 1.5 / gain);
      if (!armed && bass < avg * 1.5) armed = true;
      avg += (bass - avg) * (1 - Math.exp(-dt / (bass > avg ? 0.5 : 0.15)));
      if (armed && rising && now - last > 250) {
        last = now; armed = false;
        /* strength from the jump, scaled by how loud the bass really is (a soft curve from -70 dB to full at -40 dB),
           so a faint sound after silence pulses gently; a beat always counts, however soft */
        const db = 10 * Math.log10(bass + 1e-15), loud = Math.max(0, Math.min(1, (db + 70) / 30)) ** 2;
        return Math.max(0.05, Math.min(1.4, Math.log10(bass / base) * 0.8 * gain) * loud);
      }
      return 0;
    };
  }
  g.BeatDetector = BeatDetector;
  if (typeof module === 'object' && module.exports) module.exports = BeatDetector;
})(typeof window !== 'undefined' ? window : globalThis);
