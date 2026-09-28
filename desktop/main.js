// Still, as a desktop app: a borderless window that covers one whole screen and stays above
// everything, the Windows taskbar included, even when the mouse and focus are somewhere else
// (another screen, or another PC through Mouse Without Borders).
// Run: double-click start-desktop.cmd in the main folder.
const { app, BrowserWindow, Menu, Tray, nativeImage, screen, shell } = require('electron');
const path = require('path'), fs = require('fs');

/* a second launch just brings the running clock forward (see 'second-instance' below) */
if (!app.requestSingleInstanceLock()) { app.exit(0); return; }

const { port } = require('../serve.js');
const URL = `http://127.0.0.1:${port}/index.html`;
const ICON = path.join(__dirname, '..', 'icons', 'icon-192.png');

/* remembered between runs: which screen, and whether to stay on top */
const cfgFile = () => path.join(app.getPath('userData'), 'still-desktop.json');
let cfg = { display: null, bounds: null, onTop: true };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch (e) {}
const save = () => { try { fs.writeFileSync(cfgFile(), JSON.stringify(cfg)); } catch (e) {} };

let win = null, tray = null, keeper = null;

/* the saved screen if it is still plugged in, else a second screen if there is one, else the main one */
function pickDisplay() {
  const all = screen.getAllDisplays(), primary = screen.getPrimaryDisplay();
  const same = b => d => cfg.bounds && d.bounds.x === b.x && d.bounds.y === b.y;
  return all.find(d => d.id === cfg.display) || all.find(same(cfg.bounds))
    || all.find(d => d.id !== primary.id) || primary;
}

function fit(d = pickDisplay()) {
  if (!win) return;
  if (win.isFullScreen()) win.setFullScreen(false);
  win.setBounds(d.bounds);
}

/* "screen-saver" is the highest level; Windows still lifts the taskbar over it now and then,
   so every time the window loses focus (and once a second anyway) it is put back on top */
function pin() {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(cfg.onTop, 'screen-saver');
  if (cfg.onTop) win.moveTop();
}

function create() {
  const d = pickDisplay();
  win = new BrowserWindow({
    ...d.bounds,
    frame: false, resizable: false, maximizable: false, fullscreenable: true,
    backgroundColor: '#02040a', icon: ICON, title: 'Still', show: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu();
  win.once('ready-to-show', () => { fit(d); pin(); win.show(); });
  win.on('blur', pin);
  win.on('show', pin);
  win.on('leave-html-full-screen', () => setTimeout(() => { fit(); pin(); }, 50));
  win.on('closed', () => { win = null; });

  /* Spotify sign-in happens in this window and comes back here; any other link goes to the normal browser */
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-fail-load', (e, code, desc, url, main) => { if (main) setTimeout(() => win && win.loadURL(URL), 1000); });
  win.loadURL(URL);

  clearInterval(keeper);
  keeper = setInterval(pin, 1000);
}

function moveTo(d) {
  cfg.display = d.id; cfg.bounds = d.bounds; save();
  fit(d); pin(); menu();
}

function menu() {
  const current = win ? screen.getDisplayMatching(win.getBounds()) : pickDisplay();
  const primary = screen.getPrimaryDisplay();
  const screens = screen.getAllDisplays().map((d, i) => ({
    label: `Screen ${i + 1}  (${d.size.width}×${d.size.height}${d.id === primary.id ? ', main' : ''})`,
    type: 'radio', checked: d.id === current.id, click: () => moveTo(d),
  }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Still', enabled: false },
    { type: 'separator' },
    ...screens,
    { type: 'separator' },
    { label: 'Keep on top of everything', type: 'checkbox', checked: cfg.onTop, click: i => { cfg.onTop = i.checked; save(); pin(); } },
    { label: 'Reload', click: () => win && win.reload() },
    { label: 'Quit Still', click: () => app.quit() },
  ]));
}

app.on('second-instance', () => { if (win) { win.show(); pin(); } });

app.whenReady().then(() => {
  create();
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Still (right-click to pick a screen or quit)');
  tray.on('click', () => { if (win) { win.show(); win.focus(); pin(); } });
  menu();
  const refit = () => { fit(); pin(); menu(); };
  screen.on('display-added', refit);
  screen.on('display-removed', refit);
  screen.on('display-metrics-changed', refit);
});

app.on('window-all-closed', () => app.quit());
