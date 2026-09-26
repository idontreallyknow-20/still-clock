"""The clock is the player: the song line under the time, the ring and glow, keys, seek, volume, the chime hush,
new songs landing like the hour, and waking with Spotify.
Run with the server up:  python <webapp-testing>/scripts/with_server.py --server "node serve.js" --port 8787 -- python tests/music_clock.py"""
import json, sys, struct, zlib, os
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8787/index.html'
SHOTS = os.environ.get('SHOTS')
fails = []
def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)

def png(w, h, f):
    raw = b''.join(b'\x00' + b''.join(bytes(f(x, y)) for x in range(w)) for y in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
ART = png(32, 32, lambda x, y: (240, 70, 30) if x < 16 else (30, 90, 250))
CORS = {'Access-Control-Allow-Origin': '*'}
TOKEN = "localStorage.setItem('still.spotify', JSON.stringify({ access: 'x', refresh: 'y', exp: Date.now() + 3.6e6 }));"
# spies: how often the sky surged, and what the chimes were told
SPY = """addEventListener('DOMContentLoaded', () => {
  window.__surge = 0; const s = BG.surge; BG.surge = (...a) => { __surge++; return s(...a); };
  window.__duck = null; const d = Sound.duck; Sound.duck = on => { __duck = on; return d(on); };
});"""

def item(i, name):
    return {'id': i, 'name': name, 'duration_ms': 200000, 'artists': [{'name': 'Artist'}], 'album': {'images': [{'url': 'https://i.scdn.co/image/' + i}]}}

def page(b, face='orbit', extra=''):
    ctx = b.new_context(viewport={'width': 1100, 'height': 760})
    ctx.add_init_script("localStorage.setItem('still.v3', JSON.stringify({ _v: 4, face: '%s', weather: 'clear', spClient: '0123456789abcdef0123456789abcdef'%s }));" % (face, extra) + TOKEN + SPY)
    pg = ctx.new_page()
    errs, calls = [], []
    player = {'is_playing': True, 'progress_ms': 60000, 'device': {'volume_percent': 50}, 'item': item('t1', 'Song One')}
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('https://api.open-meteo.com/**', lambda r: r.abort())
    pg.route('https://i.scdn.co/**', lambda r: r.fulfill(status=200, content_type='image/png', body=ART, headers=CORS))
    def api(r):
        m, path = r.request.method, r.request.url.split('/v1')[1]
        if m == 'GET': return r.fulfill(status=200, content_type='application/json', body=json.dumps(player), headers=CORS)
        calls.append(m + ' ' + path)
        if path.startswith('/me/player/pause'): player['is_playing'] = False
        if path.startswith('/me/player/play'): player['is_playing'] = True
        if path.startswith('/me/player/volume'): player['device']['volume_percent'] = int(path.split('=')[1])
        r.fulfill(status=204, headers=CORS)
    pg.route('https://api.spotify.com/**', api)
    return ctx, pg, errs, calls, player

def until(pg, js, ms=6000):
    """wait for a condition on a timer (rAF can stall in a headless window); False if it never came"""
    try: pg.wait_for_function(js, polling=200, timeout=ms); return True
    except Exception: return False

UIST = """() => ({ song: document.getElementById('song').classList.contains('on'), card: document.getElementById('music').classList.contains('on'),
  on: document.body.classList.contains('music-on'), playing: document.body.classList.contains('music-playing'),
  title: document.getElementById('s-title').textContent, end: document.getElementById('s-end').textContent,
  glow: document.getElementById('m-glow').classList.contains('on'), doc: document.title, state: !!Music.state(),
  bar: parseFloat((document.querySelector('#song .m-pbar').style.transform.match(/[\\d.]+/) || [0])[0]) })"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])

    # 1. a song playing lives inside the clock, not in the corner card
    ctx, pg, errs, calls, player = page(b)
    pg.goto(URL); pg.wait_for_timeout(3500)
    pg.wait_for_function("document.getElementById('s-title').textContent === 'Song One'", polling=200, timeout=8000)
    s = pg.evaluate(UIST)
    check(s['song'] and s['on'] and s['playing'] and not s['card'], f'song line under the clock, corner card hidden {s}')
    check(s['title'] == 'Song One', f'title decoded in: {s["title"]!r}')
    check(s['end'].startswith('ends '), f'shows when the song ends in clock time: {s["end"]!r}')
    check(0.3 < s['bar'] < 0.4, f'progress bar tracks the song ({s["bar"]:.3f} ~ 0.31+)')
    check(s['glow'], 'album art glows behind the clock')
    check('♪ Song One' in s['doc'], f'window title carries the song: {s["doc"]!r}')
    check(pg.evaluate("__duck") is True, 'Still\'s chimes hush while the song plays')
    meta = until(pg, "document.getElementById('meta').getBoundingClientRect().bottom <= innerHeight")
    check(meta, 'the whole meta block, song included, stays on screen')
    if SHOTS: pg.screenshot(path=SHOTS + '/orbit.png')

    # 2. keys J K L
    for k, want in [('l', 'POST /me/player/next'), ('j', 'POST /me/player/previous'), ('k', 'PUT /me/player/pause')]:
        pg.keyboard.press(k); pg.wait_for_timeout(400)
        check(want in calls, f'key {k.upper()} -> {want}')
    until(pg, "document.getElementById('s-end').textContent === 'paused'")
    s = pg.evaluate(UIST)
    check(not s['playing'] and s['end'] == 'paused' and s['song'], f'paused: the song stays, marked paused {s["end"]!r}')
    check(pg.evaluate("__duck") is False, 'paused: chimes come back')
    pg.keyboard.press('k'); until(pg, "document.body.classList.contains('music-playing')")
    check('PUT /me/player/play' in calls and pg.evaluate(UIST)['playing'], 'K again resumes')

    # 3. click the seek bar halfway, scroll over the clock for volume
    box = pg.locator('#song .s-bar').bounding_box()
    pg.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); pg.wait_for_timeout(500)
    seek = [c for c in calls if 'seek' in c]
    check(seek and abs(int(seek[-1].split('=')[1]) - 100000) < 3000, f'seek bar: {seek}')
    a = pg.evaluate("Faces.anchor()")
    pg.mouse.move(a['x'], a['y']); pg.mouse.wheel(0, -100); pg.wait_for_timeout(60); pg.mouse.wheel(0, -100)
    for _ in range(40):  # the call goes out once scrolling settles; wait for it on a slow machine
        pg.wait_for_timeout(100)
        if 'PUT /me/player/volume?volume_percent=60' in calls: break
    pg.wait_for_timeout(500)
    vol = [c for c in calls if 'volume' in c]
    check(vol and vol[-1] == 'PUT /me/player/volume?volume_percent=60', f'two scroll steps over the clock -> volume 60%: {vol}')
    pg.mouse.move(40, 40); pg.mouse.wheel(0, -100); pg.wait_for_timeout(900)
    check(len([c for c in calls if 'volume' in c]) == len(vol), 'scrolling out in the sky leaves the volume alone')

    # 4. a new song lands like the hour: the sky surges and the title changes
    before = pg.evaluate("__surge")
    player['item'] = item('t2', 'Song Two'); player['progress_ms'] = 1000
    until(pg, "document.getElementById('s-title').textContent === 'Song Two'", 12000)
    s = pg.evaluate(UIST)
    s['spotify'] = pg.evaluate("Spotify.state() && Spotify.state().id")
    check(s['title'] == 'Song Two' and pg.evaluate("__surge") > before, f'new song: title {s["title"]!r} (spotify {s["spotify"]}), sky surged {pg.evaluate("__surge") - before}x')

    # 5. the corner card comes back when the clock isn't the player
    pg.evaluate("Store.set('musicClock', false)"); pg.wait_for_timeout(600)
    s = pg.evaluate(UIST)
    check(s['card'] and not s['song'] and not s['state'] and not s['on'], f'built-in off: corner card instead {s}')
    pg.evaluate("Store.set('musicClock', true)"); pg.wait_for_timeout(600)
    check(pg.evaluate(UIST)['song'], 'built-in back on')

    # 6. wake with Spotify: the alarm plays the music; snooze pauses it
    calls.clear()
    pg.evaluate("Store.set('alarmSpotify', true)"); pg.evaluate("Store.set('musicReact', false)")
    pg.evaluate("Alarm.start()"); pg.wait_for_timeout(800)
    check('PUT /me/player/play' in calls, f'alarm starts Spotify {calls}')
    pg.evaluate("Alarm.stop(true)"); pg.wait_for_timeout(500)
    check('PUT /me/player/pause' in calls, f'snooze pauses Spotify {calls}')
    check(not errs, 'no page errors on Orbit ' + repr(errs[:3]))
    ctx.close()

    # 7. Glass carries the art inside its pane; 2D faces draw the ring without WebGL
    ctx, pg, errs, calls, player = page(b, face='glass')
    pg.goto(URL); pg.wait_for_timeout(3500)
    until(pg, "+getComputedStyle(document.querySelector('.g-art')).opacity > 0.3")
    g = pg.evaluate("""() => { const a = document.querySelector('.g-art'), s = document.querySelector('.g-song');
      return { art: getComputedStyle(a).backgroundImage.includes('scdn'), op: +getComputedStyle(a).opacity, bar: s.style.transform }; }""")
    check(g['art'] and g['op'] > 0.2 and 'scaleX(0.3' in g['bar'], f'Glass: art in the pane, progress thread along it {g}')
    if SHOTS: pg.screenshot(path=SHOTS + '/glass.png')
    for f in ['flip', 'swarm', 'nova']:
        pg.evaluate("f => Store.set('face', f)", f); pg.wait_for_timeout(1500)
        if SHOTS: pg.screenshot(path=SHOTS + f'/{f}.png')
    check(pg.evaluate(UIST)['song'], 'the song line follows every face')
    check(not errs, 'no page errors across faces ' + repr(errs[:3]))
    ctx.close()

    NOGL = "HTMLCanvasElement.prototype.getContext = (o => function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); })(HTMLCanvasElement.prototype.getContext);"
    ctx, pg, errs, calls, player = page(b, face='orbit')
    pg.add_init_script(NOGL)
    pg.goto(URL); pg.wait_for_timeout(3500)
    check(not pg.evaluate("document.getElementById('gl').classList.contains('on')") and pg.evaluate(UIST)['song'], '2D Orbit runs with the song')
    errs = [e for e in errs if 'WebGL context' not in e]  # three.js reports the missing WebGL we forced; the 2D faces take over
    check(not errs, 'no page errors on the 2D Orbit ' + repr(errs[:3]))
    if SHOTS: pg.screenshot(path=SHOTS + '/orbit2d.png')
    ctx.close()
    b.close()

print('\nALL GREEN' if not fails else f'\n{len(fails)} FAILED')
sys.exit(1 if fails else 0)
