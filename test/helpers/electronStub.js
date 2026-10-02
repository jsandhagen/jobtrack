// A do-nothing Electron, so main.js can run under plain Node (test/main.test.js).
const handlers = new Map();
const noop = () => {};
const deep = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : deep()),
  apply: () => deep(),
  construct: () => deep(),
});
class Win {
  constructor() { this.webContents = { send: noop, on: noop, once: noop, isLoading: () => false, setWindowOpenHandler: noop, isDestroyed: () => false }; }
  loadFile() { return Promise.resolve(); } loadURL() { return Promise.resolve(); }
  on() {} once() {} show() {} hide() {} focus() {} isDestroyed() { return false; } isVisible() { return false; } isMinimized() { return false; }
  setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setBounds() {} getBounds() { return { x: 0, y: 0, width: 800, height: 600 }; } setPosition() {} close() {} destroy() {} restore() {} setSize() {} setIgnoreMouseEvents() {} showInactive() {}
}
let ready;
const app = {
  whenReady: () => new Promise((r) => (ready = r)),
  requestSingleInstanceLock: () => true,
  getPath: (n) => (n === 'userData' ? process.env.JOBTRACK_DATA_DIR : require('os').tmpdir()),
  getVersion: () => '0.1.0', isPackaged: false, on: noop, quit: noop, exit: noop, dock: { hide: noop, show: noop }, setLoginItemSettings: noop, getLoginItemSettings: () => ({}),
};
module.exports = {
  app,
  BrowserWindow: Win,
  Tray: class { setToolTip() {} setContextMenu() {} on() {} },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: noop },
  ipcMain: { handle: (c, fn) => handlers.set(c, fn), on: noop },
  dialog: deep(), clipboard: { readText: () => '', readImage: () => ({ isEmpty: () => true }) }, desktopCapturer: deep(),
  screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 }, workAreaSize: { width: 1440, height: 900 }, scaleFactor: 1 }), getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }) },
  globalShortcut: { register: () => true, unregisterAll: noop, unregister: noop },
  nativeImage: { createFromPath: () => ({ resize: () => ({}), setTemplateImage: noop, isEmpty: () => false }), createFromBitmap: () => ({}), createFromBuffer: () => ({ resize: () => ({}), isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }) }), createEmpty: () => ({}) },
  Notification: class { static isSupported() { return false; } show() {} on() {} },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
  shell: { openExternal: noop, openPath: noop, showItemInFolder: noop },
  net: { fetch: () => Promise.reject(new Error('offline')) },
  powerMonitor: { on: noop }, nativeTheme: { shouldUseDarkColors: false, on: noop, themeSource: 'light' },
  __handlers: handlers, __ready: () => ready(),
};
