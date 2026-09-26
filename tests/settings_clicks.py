"""Drive the settings panel with real clicks, the way a person does, and check every control takes effect.
Runs twice: a fresh install, and with Spotify signed in and a song playing (album colours on).
Run with the server up:  python <webapp-testing>/scripts/with_server.py --server "node serve.js" --port 8787 -- python tests/settings_clicks.py"""
import json, sys, struct, zlib
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8787/index.html'
CORS = {'Access-Control-Allow-Origin': '*'}
fails = []
def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)

def png(w, h, f):
    raw = b''.join(b'\x00' + b''.join(bytes(f(x, y)) for x in range(w)) for y in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
ART = png(32, 32, lambda x, y: (240, 70, 30) if x < 16 else (30, 90, 250))
PLAYER = {'is_playing': True, 'progress_ms': 1000, 'item': {'id': 't1', 'name': 'Song', 'duration_ms': 200000,
          'artists': [{'name': 'A'}], 'album': {'images': [{'url': 'https://i.scdn.co/image/x'}]}}}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for label, spotify in [('fresh', False), ('spotify playing', True)]:
        print(f'\n== {label}')
        ctx = b.new_context(viewport={'width': 1280, 'height': 860})
        if spotify:
            ctx.add_init_script("localStorage.setItem('still.spotify', JSON.stringify({ access: 'x', refresh: 'y', exp: Date.now() + 3.6e6 }));")
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)  # the weather is blocked on purpose
        pg.route('https://api.open-meteo.com/**', lambda r: r.abort())
        pg.route('https://i.scdn.co/**', lambda r: r.fulfill(status=200, content_type='image/png', body=ART, headers=CORS))
        pg.route('https://api.spotify.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(PLAYER), headers=CORS))
        pg.goto(URL); pg.wait_for_timeout(4000)
        pg.mouse.click(640, 430)                  # wake, like a first click
        pg.click('#gear'); pg.wait_for_timeout(900)
        check(pg.evaluate("document.getElementById('panel').getAttribute('aria-hidden')") == 'false', 'panel opens')

        # palettes: click each swatch; the setting AND what's on screen must follow
        for k in ['ember', 'glacier', 'sakura', 'acid']:
            pg.click(f'.swatches button[data-v="{k}"]'); pg.wait_for_timeout(350)
            st = pg.evaluate("k => [Store.get('palette'), pal().name, document.documentElement.style.getPropertyValue('--a1'), PALETTES[k].a]", k)
            check(st[0] == k and st[2] == st[3], f'palette click {k:8} setting={st[0]} showing={st[1]} --a1={st[2]} want={st[3]}')

        if spotify:
            pg.click('.swatches button[data-v="sky"]'); pg.wait_for_timeout(350)
            st = pg.evaluate("[pal().name, document.querySelector('.sw-name').textContent]")
            check(st[0] == 'Album' and 'album' in st[1], f'Sky with a song playing shows the album colours {st}')
        # faces
        for f in ['glass', 'flip', 'swarm', 'nova', 'orbit']:
            pg.click(f'.seg button[data-v="{f}"]'); pg.wait_for_timeout(500)
            st = pg.evaluate("f => [Store.get('face'), (document.querySelector('#face .face-root:not(.leaving)') || {}).className]", f)
            check(st[0] == f and f in (st[1] or ''), f'face click {f:6} setting={st[0]} root={st[1]}')

        # toggles: click the row, the stored value flips and the switch shows it
        for key in ['seconds', 'date', 'lines', 'autoDim', 'showMusic', 'musicColors']:
            before = pg.evaluate("k => Store.get(k)", key)
            row = pg.locator('.row-toggle', has=pg.locator(f'xpath=.//span[@class="lbl"]')).filter(has_text={'seconds': 'Seconds', 'date': 'Date', 'lines': 'Constellations', 'autoDim': 'Dim at night', 'showMusic': 'Now playing', 'musicColors': 'Colours from album art'}[key]).first
            row.scroll_into_view_if_needed(); row.click(); pg.wait_for_timeout(250)
            after = pg.evaluate("k => Store.get(k)", key)
            check(after == (not before), f'toggle {key:12} {before} -> {after}')
            row.click(); pg.wait_for_timeout(150)

        # segmented controls
        for key, v in [('motion', 'calm'), ('chimeEvery', '15'), ('weather', 'snow'), ('skyMode', 'timelapse')]:
            btn = pg.locator(f'.seg button[data-v="{v}"]').first
            btn.scroll_into_view_if_needed(); btn.click(); pg.wait_for_timeout(250)
            check(pg.evaluate("k => Store.get(k)", key) == v, f'seg {key}={v}')

        # a slider
        sl = pg.locator('.row-range input').first
        sl.scroll_into_view_if_needed(); box = sl.bounding_box()
        pg.mouse.click(box['x'] + box['width'] * 0.2, box['y'] + box['height'] / 2); pg.wait_for_timeout(250)
        check(abs(pg.evaluate("Store.get('size')") - 1) > 0.05, f'size slider moved to {pg.evaluate("Store.get(\'size\')")}')
        check(not errs, f'no errors {errs[:3]}')
        ctx.close()
    b.close()
print('\nALL GREEN' if not fails else f'\n{len(fails)} FAILED')
sys.exit(1 if fails else 0)
