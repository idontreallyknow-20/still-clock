/* The beat detector against synthetic music: node tests/beat.test.js
   A kick every 0.5 s (bass power spikes then decays) over a steady pad, sampled at 60 fps and at a
   choppy 10 fps, loud and quiet. One kick must be one beat, and a steady drone must give none. */
const BeatDetector = require('../js/beat.js');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

/* what the analyser reports: kick power decaying fast, a pad underneath, analyser smoothing 0.3 */
function run({ fps, secs = 6, period = 0.5, loud = 1, pad = 0.02, kicks = true, jitter = 0 }) {
  const det = BeatDetector();
  let beats = 0, smooth = 0, t = 0, seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (t < secs) {
    const tb = t % period, kick = kicks ? Math.exp(-tb * 18) ** 2 : 0;
    const raw = loud * 1e-4 * (kick + pad * (0.9 + 0.2 * rnd()));
    smooth = 0.3 * smooth + 0.7 * raw;
    if (det(smooth, t * 1000, 1)) beats++;
    t += (1 / fps) * (1 + (rnd() - 0.5) * jitter);
  }
  return beats;
}
const want = 12;
for (const [label, o] of [
  ['60 fps', { fps: 60 }],
  ['60 fps, quiet (-30 dB)', { fps: 60, loud: 1e-3 }],
  ['60 fps, loud (+20 dB)', { fps: 60, loud: 100 }],
  ['30 fps, jittery frames', { fps: 30, jitter: 0.6 }],
  ['144 fps', { fps: 144 }],
]) { const n = run(o); check(n >= want - 1 && n <= want, `${label}: ${n} beats for ${want} kicks`); }
const slow = run({ fps: 10, jitter: 0.5 });
/* at 10 fps a frame lands every 100 ms and this kick is only ~90 ms long, so some are simply never seen:
   at least half, and never a phantom extra */
check(slow >= want / 2 && slow <= want, `10 fps, jittery (a struggling screen): ${slow} beats for ${want} kicks, never more`);
check(run({ fps: 60, kicks: false }) === 0, 'a steady drone with no kicks: no beats');
const fast = run({ fps: 60, period: 60 / 175 });
check(Math.abs(fast - Math.round(6 / (60 / 175))) <= 1, `175 BPM: ${fast} beats for ${Math.round(6 / (60 / 175))} kicks`);
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
