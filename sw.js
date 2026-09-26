// Still service worker: network-first so updates show up right away,
// with a cached copy so the installed app still opens offline.
const CACHE = 'still-v9';
const CORE = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/store.js', 'js/astro.js', 'js/moon.js', 'js/audio.js', 'js/bg.js', 'js/fx.js', 'js/sky.js', 'js/faces.js', 'js/spotify.js', 'js/music.js', 'js/beat.js', 'js/listen.js', 'js/ui.js', 'js/gl3d.js', 'js/main.js', 'js/app.js',
  'js/vendor/three.module.min.js', 'js/vendor/addons/postprocessing/EffectComposer.js', 'js/vendor/addons/postprocessing/RenderPass.js',
  'js/vendor/addons/postprocessing/UnrealBloomPass.js', 'js/vendor/addons/postprocessing/OutputPass.js', 'js/vendor/addons/postprocessing/ShaderPass.js',
  'js/vendor/addons/postprocessing/Pass.js', 'js/vendor/addons/postprocessing/MaskPass.js', 'js/vendor/addons/shaders/CopyShader.js',
  'js/vendor/addons/shaders/LuminosityHighPassShader.js', 'js/vendor/addons/shaders/OutputShader.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !font) return; // weather API etc. go straight to the network
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
