"""Where each frame's CPU time goes: wraps every layer's frame function and reports mean and p95 ms per face.
Headless uses a software GPU, so GPU time is not representative, but CPU time per layer is.
Run with the server up:  python <webapp-testing>/scripts/with_server.py --server "node serve.js" --port 8787 -- python tests/perf.py"""
import datetime, json, sys
from playwright.sync_api import sync_playwright

WRAP = """() => {
  window.__prof = {};
  const wrap = (obj, key, name) => { const f = obj[key]; obj[key] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { (__prof[name] = __prof[name] || []).push(performance.now() - t); } }; };
  wrap(BG, 'frame', 'aurora'); wrap(Sky, 'frame', 'sky'); wrap(FX, 'frame', 'particles'); wrap(Faces, 'frame', 'face');
  if (window.GL3D) wrap(GL3D, 'frame', '3d');
  wrap(Listen, 'frame', 'listen');
}"""
REPORT = """() => { const o = {}; for (const k in __prof) { const a = __prof[k].slice().sort((x, y) => x - y); o[k] = [+(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2), +a[Math.floor(a.length * 0.95)].toFixed(2), a.length]; } return o; }"""
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for face in ['glass', 'flip', 'swarm', 'orbit', 'nova']:
        ctx = b.new_context(viewport={'width': 1600, 'height': 900})
        ctx.add_init_script("localStorage.setItem('still.v3', JSON.stringify(%s))" % json.dumps({'_v': 4, 'face': face, 'weather': 'snow', 'motion': 'wild'}))
        pg = ctx.new_page()
        pg.clock.install(time=datetime.datetime(2026, 9, 25, 23, 40)); pg.clock.resume()
        pg.route('https://api.open-meteo.com/**', lambda r: r.abort())
        pg.goto('http://127.0.0.1:8787/index.html'); pg.wait_for_timeout(2500)
        pg.evaluate("QUALITY.set(0); Sky.summon('plane')")
        pg.wait_for_timeout(15000)   # let the sky camera settle (about 4 s at 60 fps, much longer on a software GPU)
        pg.evaluate(WRAP); pg.wait_for_timeout(5000)
        r = pg.evaluate(REPORT)
        tot = sum(v[0] for v in r.values())
        print(f'{face:6} total {tot:6.2f} ms/frame  ' + '  '.join(f'{k} {v[0]}/{v[1]}' for k, v in sorted(r.items(), key=lambda kv: -kv[1][0])) + f'  (frames {r["sky"][2]}, tier {pg.evaluate("QUALITY.tier")})')
        ctx.close()
    b.close()
