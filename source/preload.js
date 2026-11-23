'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('pcl', {
  isElectron: true,
  platform: process.platform,
  win: {
    minimize: () => invoke('win:minimize'),
    toggleMaximize: () => invoke('win:toggleMaximize'),
    close: () => invoke('win:close'),
    isMaximized: () => invoke('win:isMaximized'),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
  },
  versions: {
    list: () => invoke('versions:list'),
    del: (id) => invoke('versions:delete', id),
    open: (id) => invoke('versions:open', id),
    copy: (id, name) => invoke('versions:copy', id, name),
    detail: (id) => invoke('versions:detail', id),
    getSettings: (id) => invoke('versions:settings:get', id),
    setSettings: (id, patch) => invoke('versions:settings:set', id, patch),
    export: (id) => invoke('versions:export', id),
    exportPack: (id, name) => invoke('versions:exportPack', id, name),
  },
  diagnostics: { run: (logs) => invoke('diagnostics:run', logs) },
  personal: {
    openDir: (sub) => invoke('personal:openDir', sub),
    pickBackground: () => invoke('personal:pickBackground'),
    getBackground: () => invoke('personal:getBackground'),
    clearBackground: () => invoke('personal:clearBackground'),
    pickMusic: () => invoke('personal:pickMusic'),
    getMusic: () => invoke('personal:getMusic'),
    clearMusic: () => invoke('personal:clearMusic'),
    pickSkin: () => invoke('personal:pickSkin'),
    getSkin: () => invoke('personal:getSkin'),
    refreshSkin: () => invoke('personal:refreshSkin'),
    pickIcon: () => invoke('personal:pickIcon'),
  },
  update: {
    check: () => invoke('update:check'),
    download: (info) => invoke('update:download', info),
    install: (info) => invoke('update:install', info),
    openDir: () => invoke('update:openDir'),
  },
  ai: {
    chat: (payload) => invoke('ai:chat', payload),
    models: () => invoke('ai:models'),
    test: () => invoke('ai:test'),
    stream: (payload, onDelta) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = (data) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          ipcRenderer.removeListener('ai:stream', listener);
          resolve(data);
        };
        const listener = (_event, data) => {
          if (!data || String(data.id) !== String(id)) return;
          if (data.done) return finish(data);
          try { if (onDelta) onDelta(data); } catch {}
        };
        ipcRenderer.on('ai:stream', listener);
        timer = setTimeout(() => finish({ ok: false, done: true, error: 'AI 接口响应超时' }), 100000);
        ipcRenderer
          .invoke('ai:chatStream', { ...(payload || {}), id })
          .then((r) => { if (r && r.done) finish(r); })
          .catch((err) => finish({ ok: false, done: true, error: String(err.message || err) }));
      });
    },
  },
  optifine: {
    list: (mcVersion) => invoke('optifine:list', mcVersion),
    install: (payload) => invoke('optifine:install', payload),
  },
  quilt: {
    list: (gameVersion) => invoke('quilt:list', gameVersion),
    install: (payload) => invoke('quilt:install', payload),
  },
  curseforge: {
    search: (opts) => invoke('curseforge:search', opts),
    install: (payload) => invoke('curseforge:install', payload),
    installPack: (filePath) => invoke('curseforge:installPack', filePath),
    installPackProject: (payload) => invoke('curseforge:installPackProject', payload),
  },
  crash: {
    analyze: (id) => invoke('crash:analyze', id),
    openDir: (dir) => invoke('crash:openDir', dir),
  },
  mods: {
    list: (id) => invoke('mods:list', id),
    toggle: (id, name, enabled) => invoke('mods:toggle', { id, name, enabled }),
    remove: (id, name) => invoke('mods:remove', { id, name }),
    toggleAll: (id, enabled) => invoke('mods:toggleAll', { id, enabled }),
    open: (id) => invoke('mods:open', id),
  },
  manifest: () => invoke('manifest:get'),
  install: {
    version: (id, name) => invoke('install:version', { version: id, name }),
    fabric: (payload) => invoke('install:fabric', payload),
    pack: (filePath) => invoke('install:pack', filePath),
    choosePack: () => invoke('pack:choose'),
  },
  fabric: {
    games: () => invoke('fabric:games'),
    loaders: () => invoke('fabric:loaders'),
  },
  forge: {
    versions: (mc) => invoke('forge:versions', mc),
    neoVersions: (mc) => invoke('neoforge:versions', mc),
    install: (payload) => invoke('install:forge', payload),
  },
  java: {
    detect: () => invoke('java:detect'),
    probe: (p) => invoke('java:probe', p),
    browse: () => invoke('java:browse'),
    catalog: () => invoke('java:catalog'),
    required: (versionId) => invoke('java:required', versionId),
    download: (major) => invoke('java:download', major),
  },
  dir: { choose: () => invoke('dir:choose') },
  launch: {
    start: (id) => invoke('launch:start', id),
    stop: () => invoke('launch:stop'),
    preview: (id) => invoke('launch:preview', id),
    status: () => invoke('launch:status'),
  },
  accounts: {
    list: () => invoke('accounts:list'),
    addOffline: (name) => invoke('accounts:addOffline', name),
    authlib: (payload) => invoke('accounts:authlib', payload),
    msaStart: () => invoke('accounts:msaStart'),
    msaPoll: (deviceCode) => invoke('accounts:msaPoll', deviceCode),
    remove: (id) => invoke('accounts:remove', id),
    select: (id) => invoke('accounts:select', id),
  },
  modrinth: {
    search: (opts) => invoke('modrinth:search', opts),
    versions: (id, opts) => invoke('modrinth:versions', id, opts),
    install: (payload) => invoke('modrinth:install', payload),
    installPackProject: (payload) => invoke('modrinth:installPackProject', payload),
  },
  lan: {
    start: () => invoke('lan:start'),
    stop: () => invoke('lan:stop'),
  },
  news: () => invoke('news:get'),
  appInfo: () => invoke('app:info'),
  openExternal: (url) => invoke('open:external', url),
  on: (channel, cb) => {
    const allowed = ['task:progress', 'task:done', 'task:log', 'launch:log', 'launch:phase', 'launch:exit', 'lan:server', 'win:state'];
    if (!allowed.includes(channel)) return () => {};
    const listener = (_, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
