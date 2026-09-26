"""Planes and their easter eggs, stars through cloud, the Glow setting, and Dance to music (a fake microphone
playing a kick-drum loop). Writes screenshots next to this file's parent in tests/out/.
Run with the server up:  python <webapp-testing>/scripts/with_server.py --server "node serve.js" --port 8787 -- python tests/sky_extras.py [kick.wav]"""
import datetime, os, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8787/index.html'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'); os.makedirs(OUT, exist_ok=True)
WAV = sys.argv[1] if len(sys.argv) > 1 else None
fails = []
def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)

def page(b, when, face='glass', weather='clear', extra=None):
    ctx = b.new_context(viewport={'width': 1280, 'height': 760})
    s = {'_v': 4, 'face': face, 'weather': weather, 'motion': 'normal'}; s.update(extra or {})
    ctx.add_init_script("localStorage.setItem('still.v3', JSON.stringify(%s))" % __import__('json').dumps(s))
    pg = ctx.new_page()
    pg.clock.install(time=when); pg.clock.resume()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('https://api.open-meteo.com/**', lambda r: r.abort())
    pg.goto(URL); pg.wait_for_timeout(3000)
    return ctx, pg, errs

NIGHT, DAY = datetime.datetime(2026, 9, 25, 23, 40), datetime.datetime(2026, 9, 26, 14, 10)
with sync_playwright() as p:
    args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    b = p.chromium.launch(headless=True, args=args)

    # 1. every kind of aircraft, mid-flight, on screen and clickable
    for when, tag in [(NIGHT, 'night'), (DAY, 'day')]:
        ctx, pg, errs = page(b, when)
        kinds = ['plane', 'banner', 'ufo', 'sleigh'] if tag == 'night' else ['plane', 'banner']
        for k in kinds:
            pg.evaluate("k => Sky.summon(k)", k)
            pg.evaluate("() => { const c = Sky.craft; c.t = c.dur * (c.kind === 'ufo' ? 0.5 : 0.45); c.trail = []; }")
            pg.wait_for_timeout(2600 if tag == 'day' and k == 'plane' else 500)   # let a contrail grow
            c = pg.evaluate("(() => { const c = Sky.craft; return c && { kind: c.kind, x: c.sx, y: c.sy }; })()")
            onscreen = bool(c) and c['x'] is not None and 0 < c['x'] < 1280 and 0 < c['y'] < 760
            check(onscreen, f'{tag} {k}: on screen at {c}')
            if onscreen:
                x, y = int(c['x']), int(c['y'])
                pg.screenshot(path=os.path.join(OUT, f'{tag}_{k}.png'), clip={'x': max(0, x - 260), 'y': max(0, y - 90), 'width': 520, 'height': 180})
                mark = {'plane': '✈', 'banner': '✈', 'ufo': '👽', 'sleigh': '🎅'}[k]
                for attempt in range(3):   # the sky pans a touch as the pointer moves, so re-aim like a person would
                    c = pg.evaluate("[Sky.craft.sx, Sky.craft.sy]")
                    pg.mouse.click(c[0], c[1]); pg.wait_for_timeout(150)
                    toast = pg.inner_text('#toast')
                    if mark in toast: break
                check(mark in toast, f'{tag} {k}: click says "{toast}" (attempts {attempt + 1})')
        check(not errs, f'{tag}: no page errors {errs[:2]}')
        ctx.close()

    # 2. Konami code calls the saucer
    ctx, pg, errs = page(b, NIGHT)
    for key in ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']: pg.keyboard.press(key)
    pg.wait_for_timeout(300)
    check(pg.evaluate("Sky.craft && Sky.craft.kind") == 'ufo', 'Konami code summons the UFO')
    pg.evaluate("Store.set('planes', false)"); pg.wait_for_timeout(300)
    check(pg.evaluate("Sky.craft") is None, 'turning Planes off clears the sky')
    ctx.close()

    # 3. stars through cloud: count star pixels in the upper sky on a rainy night, with and without the setting
    counts = {}
    for on in [True, False]:
        ctx, pg, errs = page(b, NIGHT, weather='rain', extra={'starsAlways': on, 'planes': False})
        pg.wait_for_timeout(2500)
        counts[on] = pg.evaluate("""(() => { const c = document.getElementById('sky'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height * 0.4).data;
          let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 420) n++; return n; })()""")
        pg.screenshot(path=os.path.join(OUT, f'stars_{"on" if on else "off"}.png'), clip={'x': 0, 'y': 0, 'width': 1280, 'height': 300})
        ctx.close()
    print(f"info stars: compare tests/out/stars_on.png and stars_off.png by eye (a pixel count cannot tell stars from moonlit cloud)")

    # 4. the Glow setting drives the bloom and the time's shine
    ctx, pg, errs = page(b, NIGHT, face='orbit', extra={'planes': False})
    shots = {}
    for g in [0, 0.85, 1.3]:
        pg.evaluate("g => Store.set('glow', g)", g); pg.wait_for_timeout(700)
        pg.screenshot(path=os.path.join(OUT, f'glow_{g}.png'), clip={'x': 390, 'y': 200, 'width': 500, 'height': 330})
        shots[g] = pg.evaluate("[getComputedStyle(document.documentElement).getPropertyValue('--gk1')]")
    check(shots[0] == ['0%'] and shots[0.85] == ['68%'] and shots[1.3] == ['100%'], f'CSS glow follows the setting {shots}')
    check(not errs, f'glow: no page errors {errs[:2]}')
    ctx.close()
    b.close()

    # 5. Dance to music: a fake microphone playing a kick drum makes beats and lifts the level
    if WAV:
        b = p.chromium.launch(headless=True, args=args + ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={WAV}'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 760}, permissions=['microphone'])
        ctx.add_init_script("localStorage.setItem('still.v3', JSON.stringify({ _v: 4, face: 'orbit', weather: 'clear', planes: false }))")
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route('https://api.open-meteo.com/**', lambda r: r.abort())
        pg.goto(URL); pg.wait_for_timeout(2500)
        pg.evaluate("Store.set('musicReact', true)"); pg.wait_for_timeout(6000)
        st = pg.evaluate("[Listen.on, Listen.beats, Listen.level]")
        check(st[0] and st[1] >= 6 and st[2] > 0.05, f'dance to music: listening={st[0]} beats={st[1]} in 6 s (kick every 0.5 s) level={st[2]:.2f}')
        pg.evaluate("Store.set('musicReact', false)"); pg.wait_for_timeout(300)
        check(not pg.evaluate("Listen.on"), 'turning it off stops listening')
        check(not errs, f'listen: no page errors {errs[:2]}')
        b.close()
print('\nALL GREEN' if not fails else f'\n{len(fails)} FAILED')
sys.exit(1 if fails else 0)
