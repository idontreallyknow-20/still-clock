# Regression: an installed-app window reports 0x0 while it opens. The pointer used to be normalised by that
# cached size (x / 0 = Infinity), which drove the sky camera to NaN and threw "createLinearGradient ... non-finite".
# Run with the app served on :8787 (node serve.js), then: python tests/zero_size_boot.py
"""Hypothesis loop: the window is 0x0 at boot (installed-app windows do this), then grows. Red on the gradient error."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    ctx.add_init_script("""
      window.__zero = true;
      const iw = Object.getOwnPropertyDescriptor(window, 'innerWidth') || { get() { return document.documentElement.clientWidth; } };
      const ih = Object.getOwnPropertyDescriptor(window, 'innerHeight') || { get() { return document.documentElement.clientHeight; } };
      Object.defineProperty(window, 'innerWidth', { configurable: true, get() { return window.__zero ? 0 : iw.get.call(window); } });
      Object.defineProperty(window, 'innerHeight', { configurable: true, get() { return window.__zero ? 0 : ih.get.call(window); } });
      localStorage.setItem('still.v3', JSON.stringify({ _v: 4, face: 'glass', weather: 'clear' }));
    """)
    pg = ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8787/index.html')
    pg.mouse.move(600, 300)            # the pointer moves while the window still reads 0x0
    pg.wait_for_timeout(800)
    pg.evaluate("window.__zero = false; dispatchEvent(new Event('resize'))")
    pg.wait_for_timeout(3000)
    err = pg.evaluate("document.getElementById('err').textContent")
    print(('FAIL ' if err else 'PASS ') + repr(err))
    for e in errs[:2]: print('   ', e[:500])
    b.close()
    raise SystemExit(1 if err else 0)
