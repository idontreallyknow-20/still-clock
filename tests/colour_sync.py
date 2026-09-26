"""Every palette reaches every layer, and the album-art palette comes and goes cleanly with the Spotify session.
Run with the server up:  python <webapp-testing>/scripts/with_server.py --server "node serve.js" --port 8787 -- python tests/colour_sync.py"""
import json, sys, struct, zlib, datetime
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8787/index.html'
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

# what every layer should agree on: CSS variables, the theme colour, the 3D scene's palette key
SYNC = """() => {
  const p = pal(), s = document.documentElement.style, g = window.GL3D && GL3D.debug.pal;
  return { css: s.getPropertyValue('--a1') === p.a && s.getPropertyValue('--a2') === p.b && s.getPropertyValue('--glow') === p.glow,
           meta: document.querySelector('meta[name=theme-color]').content === p.bg,
           gl: g === p.a + p.b + p.c + p.t1 + p.t2 + p.glow, name: p.name };
}"""

def page(b, extra='', face='orbit'):
    ctx = b.new_context(viewport={'width': 1100, 'height': 700})
    ctx.add_init_script("localStorage.setItem('still.v3', JSON.stringify({ _v: 4, face: '%s', weather: 'clear', spClient: '0123456789abcdef0123456789abcdef' }));%s" % (face, extra))
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('https://api.open-meteo.com/**', lambda r: r.abort())
    pg.route('https://i.scdn.co/**', lambda r: r.fulfill(status=200, content_type='image/png', body=ART, headers=CORS))
    return ctx, pg, errs

def spotify(pg, player, calls, token_mode):
    def api(r):
        calls.append(r.request.method + ' ' + r.request.url.split('/v1')[1])
        if r.request.method == 'GET': r.fulfill(status=200, content_type='application/json', body=json.dumps(player), headers=CORS)
        else: r.fulfill(status=204, headers=CORS)
    def tokens(r):
        calls.append('TOKEN ' + r.request.post_data.split('grant_type=')[1].split('&')[0])
        if token_mode[0] == 'offline': r.abort()
        elif token_mode[0] == 'refused': r.fulfill(status=400, content_type='application/json', body='{"error":"invalid_grant"}', headers=CORS)
        else: r.fulfill(status=200, content_type='application/json', body='{"access_token":"a2","refresh_token":"r2","expires_in":3600}', headers=CORS)
    pg.route('https://api.spotify.com/**', api)
    pg.route('https://accounts.spotify.com/api/token', tokens)

TOKEN = "localStorage.setItem('still.spotify', JSON.stringify({ access: 'x', refresh: 'y', exp: Date.now() + 3.6e6 }));"
PLAYING = lambda: {'is_playing': True, 'progress_ms': 1000, 'item': {'id': 't1', 'name': 'Song', 'duration_ms': 200000,
                   'artists': [{'name': 'A'}], 'album': {'images': [{'url': 'https://i.scdn.co/image/x'}]}}}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])

    # 1. every named palette, on a 3D face, reaches the CSS, the theme colour and the 3D scene
    ctx, pg, errs = page(b)
    pg.goto(URL); pg.wait_for_timeout(2500)
    for k in pg.evaluate("Object.keys(PALETTES)"):
        pg.evaluate("k => Store.set('palette', k)", k); pg.wait_for_timeout(250)
        r = pg.evaluate(SYNC)
        check(r['css'] and r['meta'] and r['gl'], f'palette {k:8} css={r["css"]} meta={r["meta"]} gl={r["gl"]}')
    check(not errs, 'no page errors while cycling palettes ' + repr(errs[:2]))
    ctx.close()

    # 1b. the 2D Swarm (no WebGL) follows a colour change that keeps the palette's name (album art, the live Sky):
    #     both the particles and the glow behind them, mid-minute, without waiting for the next tick
    NOGL = "HTMLCanvasElement.prototype.getContext = (o => function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); })(HTMLCanvasElement.prototype.getContext);"
    ctx, pg, errs = page(b, NOGL, face='swarm')
    pg.clock.install(time=datetime.datetime(2026, 9, 25, 23, 40, 3)); pg.clock.resume()
    pg.goto(URL); pg.wait_for_timeout(3000)
    HUE = """sel => { const c = document.querySelector(sel), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
      let r = 0, gr = 0, n = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 40) { r += d[i]; gr += d[i + 1]; n++; }
      return n ? gr / Math.max(1, r) : 0; }"""
    GREEN = {'name': 'Album', 'live': True, 'bg': '#02040a', 't1': '#44ff66', 'a': '#00ff40', 'b': '#20ff60', 'c': '#10ff30', 't2': '#40ff80', 'glow': '#00ff50'}
    check(not pg.evaluate("!!window.GL3D && document.getElementById('gl').classList.contains('on')"), '2D Swarm is really running without WebGL')
    before = [pg.evaluate(HUE, '.swarm-glow'), pg.evaluate(HUE, '.face-canvas:not(.swarm-glow)')]
    pg.evaluate("p => { window.MUSICPAL = p; StillPalette(); }", GREEN); pg.wait_for_timeout(1500)
    after = [pg.evaluate(HUE, '.swarm-glow'), pg.evaluate(HUE, '.face-canvas:not(.swarm-glow)')]
    check(after[0] > 2 and after[0] > before[0] * 1.5, f'2D Swarm glow turns green mid-minute (green/red {before[0]:.2f} -> {after[0]:.2f})')
    check(after[1] > 1.6 and after[1] > before[1] * 1.5, f'2D Swarm particles turn green mid-minute (green/red {before[1]:.2f} -> {after[1]:.2f})')
    check(pg.evaluate("new Date().getSeconds()") < 55, 'no minute tick happened during the check')
    ctx.close()

    # 2. album colours: on while playing, synced everywhere, off on pause, back on resume
    ctx, pg, errs = page(b, TOKEN)
    player, calls, mode = PLAYING(), [], ['ok']
    spotify(pg, player, calls, mode)
    pg.goto(URL); pg.wait_for_timeout(3500)
    r = pg.evaluate(SYNC)
    check(r['name'] == 'Album' and r['css'] and r['gl'] and r['meta'], f'album palette applied to every layer {r}')
    player['is_playing'] = False; pg.wait_for_timeout(3600)
    r = pg.evaluate(SYNC)
    check(r['name'] == 'Sky' and r['css'] and r['gl'] and r['meta'], f'paused: back to the Sky palette everywhere {r}')
    player['is_playing'] = True; pg.wait_for_timeout(3600)
    check(pg.evaluate(SYNC)['name'] == 'Album', 'resumed: album colours return')
    pg.evaluate("Store.set('musicColors', false)"); pg.wait_for_timeout(300)
    check(pg.evaluate(SYNC)['name'] == 'Sky', 'turning album colours off restores the palette right away')
    ctx.close()

    # 3. a network blip at token refresh keeps the sign-in; a refused refresh signs out and drops the album colours
    for m, want in [('offline', True), ('refused', False)]:
        ctx, pg, errs = page(b, "localStorage.setItem('still.spotify', JSON.stringify({ access: 'x', refresh: 'y', exp: 1 }));")
        player, calls, mode = PLAYING(), [], [m]
        spotify(pg, player, calls, mode)
        pg.goto(URL); pg.wait_for_timeout(2500)
        st = pg.evaluate("[Spotify.connected, !!window.MUSICPAL, document.getElementById('music').classList.contains('on'), pal().name]")
        check(st[0] == want and not st[1] and not st[2], f'refresh {m}: connected={st[0]} album={st[1]} card={st[2]} palette={st[3]}')
        if m == 'offline':
            pg.wait_for_timeout(8000)  # ~10.5 s offline: every 3 s would be 4 refresh attempts; backing off gives 2
            n = sum(c.startswith('TOKEN') for c in calls)
            check(n <= 2 and pg.evaluate("Spotify.connected"), f'refresh offline: backs off ({n} attempts in ~10 s) and stays signed in')
        ctx.close()

    # refused while a song was already colouring everything: the colours must not stick
    ctx, pg, errs = page(b, TOKEN)
    player, calls, mode = PLAYING(), [], ['refused']
    spotify(pg, player, calls, mode)
    pg.goto(URL); pg.wait_for_timeout(3500)
    check(pg.evaluate("!!window.MUSICPAL"), 'album colours on before the sign-in dies')
    pg.evaluate("() => { const t = JSON.parse(localStorage.getItem('still.spotify')); t.exp = 1; localStorage.setItem('still.spotify', JSON.stringify(t)); }")
    pg.route('https://api.spotify.com/**', lambda r: r.fulfill(status=401, headers=CORS))  # the access token dies, forcing a refresh
    pg.wait_for_timeout(7000)
    st = pg.evaluate("[Spotify.connected, !!window.MUSICPAL, pal().name, document.documentElement.style.getPropertyValue('--a1') === pal().a]")
    check(not st[0] and not st[1] and st[2] == 'Sky' and st[3], f'refused mid-song: signed out, album colours gone {st}')
    ctx.close()

    # 4. coming back from Spotify's sign-in starts exactly one poll loop
    ctx, pg, errs = page(b, "localStorage.setItem('still.spv', 'verifier');")
    player, calls, mode = PLAYING(), [], ['ok']
    spotify(pg, player, calls, mode)
    pg.goto(URL + '?code=abc'); pg.wait_for_timeout(1500)
    gets = [c for c in calls if c.startswith('GET')]
    check(pg.evaluate("Spotify.connected") and len(gets) == 1, f'login: connected and one poll so far ({calls})')
    pg.wait_for_timeout(6200)
    gets = [c for c in calls if c.startswith('GET')]
    check(len(gets) in (3, 4), f'login: one 3 s loop, not two ({len(gets)} polls in ~7.7 s)')
    check(pg.evaluate("location.search") == '', 'the ?code is removed from the address bar')
    check(not errs, 'no page errors in the Spotify flows ' + repr(errs[:2]))
    ctx.close()
    b.close()

print('\nALL GREEN' if not fails else f'\n{len(fails)} FAILED')
sys.exit(1 if fails else 0)
