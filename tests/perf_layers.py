"""GPU/compositing cost by ablation: frame rate with everything on, then with one layer or effect switched off.
Headless renders on a software GPU, so absolute fps is low; the relative change per layer is the signal.
Run with the server up:  python <webapp-testing>/scripts/with_server.py --server "node serve.js" --port 8787 -- python tests/perf_layers.py [face]"""
import datetime, json, sys
from playwright.sync_api import sync_playwright

FACE = sys.argv[1] if len(sys.argv) > 1 else 'orbit'
CASES = [
    ('everything', ''),
    ('no 3D layer (#gl)', '#gl { display: none !important; }'),
    ('no screen blend on #gl', '#gl { mix-blend-mode: normal !important; }'),
    ('no aurora (#bg)', '#bg { display: none !important; }'),
    ('no sky (#sky)', '#sky { display: none !important; }'),
    ('no particles (#fx)', '#fx { display: none !important; }'),
    ('no backdrop blur', '* { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }'),
    ('no CSS filters', '* { filter: none !important; }'),
]
FPS = """() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); })"""
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    base = None
    for label, css in CASES:
        ctx = b.new_context(viewport={'width': 1440, 'height': 810})
        ctx.add_init_script("localStorage.setItem('still.v3', JSON.stringify(%s))" % json.dumps({'_v': 4, 'face': FACE, 'weather': 'snow', 'motion': 'wild'}))
        pg = ctx.new_page()
        pg.clock.install(time=datetime.datetime(2026, 9, 25, 23, 40)); pg.clock.resume()
        pg.route('https://api.open-meteo.com/**', lambda r: r.abort())
        pg.goto('http://127.0.0.1:8787/index.html'); pg.wait_for_timeout(2500)
        pg.evaluate("QUALITY.set(0); QUALITY.set = () => {}")   # hold full quality so the numbers compare
        pg.wait_for_timeout(15000)   # let the sky camera settle (about 4 s at 60 fps, much longer on a software GPU)
        if css: pg.add_style_tag(content=css)
        pg.wait_for_timeout(500)
        fps = pg.evaluate(FPS)
        base = base or fps
        print(f'{FACE:6} {label:24} {fps:5.1f} fps  ({(fps / base - 1) * 100:+.0f}%)')
        ctx.close()
    b.close()
