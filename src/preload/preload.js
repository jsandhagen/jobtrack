const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

function on(channel, cb) {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('sprout', {
  getState: () => call('state:get'),
  updateSettings: (patch) => call('settings:update', patch),
  updateProfile: (patch) => call('profile:update', patch),
  setApiKey: (key) => call('apikey:set', key),

  pickDocuments: () => call('docs:pick'),
  importFiles: (files) => call('docs:importPaths', Array.from(files).map((f) => webUtils.getPathForFile(f))),
  addTextDocument: (doc) => call('docs:addText', doc),
  getDocument: (id) => call('docs:get', id),
  updateDocument: (id, patch) => call('docs:update', id, patch),
  removeDocument: (id) => call('docs:remove', id),

  analyzeJob: (posting) => call('job:analyze', posting),
  scanScreen: () => call('job:scanScreen'),
  getApplication: (id) => call('app:get', id),
  rescoreAts: (id, html) => call('ats:rescore', id, html),
  analyzeApplication: (id) => call('app:analyze', id),
  rescoreLocal: (id) => call('app:rescoreLocal', id),
  markApplied: (id, info) => call('app:markApplied', id, info),
  exportCsv: () => call('apps:exportCsv'),
  openExternal: (url) => call('shell:openExternal', url),
  updateApplication: (id, patch) => call('app:update', id, patch),
  removeApplication: (id) => call('app:remove', id),
  generateResume: (id) => call('app:resume', id),
  generateCoverLetter: (id) => call('app:coverLetter', id),
  exportDoc: (id, which, format, editedHtml) => call('app:export', id, which, format, editedHtml),

  overlayAction: (action, appId, extra = {}) => call('overlay:action', { action, appId, ...extra }),
  bridgeStatus: () => call('bridge:status'),
  getBank: () => call('bank:get'),
  importBullets: () => call('bank:import'),
  updateBank: (patch) => call('bank:update', patch),
  addBullet: (b) => call('bank:addBullet', b),
  updateBullet: (id, patch) => call('bank:updateBullet', id, patch),
  deleteBullet: (id) => call('bank:deleteBullet', id),
  saveRole: (role) => call('bank:saveRole', role),
  deleteRole: (id) => call('bank:deleteRole', id),
  suggestBullets: () => call('bank:suggest'),
  getBuilder: (appId) => call('builder:get', appId),
  saveBuilder: (appId, roles) => call('builder:save', appId, roles),
  autoBuilder: (appId) => call('builder:auto', appId),
  buildResume: (appId) => call('builder:build', appId),
  polishBullets: (appId) => call('builder:polish', appId),
  bridgeRevoke: (origin) => call('bridge:revoke', origin),
  showExtensionFolder: () => call('bridge:showFolder'),
  overlayResize: (h) => call('overlay:resize', h),

  onStateChanged: (cb) => on('state-changed', cb),
  onAppUpdated: (cb) => on('app-updated', cb),
  onToast: (cb) => on('toast', cb),
  onNavigate: (cb) => on('navigate', cb),
  onOverlayShow: (cb) => on('overlay:show', cb),
});
