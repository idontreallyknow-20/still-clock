// Installable app: service worker, the "Install app" button, and the frameless title bar.
(() => {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  const btn = document.querySelector('[data-act="install"]');
  const standalone = () => matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)').matches;
  let deferred = null;
  document.body.classList.toggle('app', standalone());

  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    if (btn && !standalone()) btn.hidden = false;
  });

  addEventListener('appinstalled', () => {
    deferred = null;
    if (btn) btn.hidden = true;
    UI.toast('Installed — find Still in your Start menu');
  });

  btn && btn.addEventListener('click', async () => {
    if (!deferred) return UI.toast('Use your browser menu › Install Still');
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') { deferred = null; btn.hidden = true; }
  });

  // Frameless window: the page fills the title bar, so keep the window draggable along the top.
  const wco = navigator.windowControlsOverlay;
  if (wco) {
    const sync = () => document.body.classList.toggle('wco', wco.visible);
    wco.addEventListener('geometrychange', sync);
    sync();
  }
})();
