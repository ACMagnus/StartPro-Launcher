'use strict';
/**
 * StartPro Launcher (SPL) —— Electron 主进程
 * 无边框窗口 + 全部业务 IPC
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const fsp = fs.promises;
const AdmZip = require('adm-zip');

app.setName('StartPro Launcher');

const { Config } = require('./core/config');
const { fetchJson } = require('./core/net');
const { MIRROR_HOSTS } = require('./core/config');
const versionMod = require('./core/version');
const { installVersion } = require('./core/install');
const fabric = require('./core/fabric');
const forge = require('./core/forge');
const modrinth = require('./core/modrinth');
const curseforge = require('./core/curseforge');
const optifine = require('./core/optifine');
const quilt = require('./core/quilt');
const updater = require('./core/updater');
const ai = require('./core/ai');
const packexport = require('./core/packexport');
const accounts = require('./core/accounts');
const authlib = require('./core/authlib');
const { buildLaunch, launchGame, detectJavaList, probeJava, defaultMemory } = require('./core/launch');
const java = require('./core/java');
const { startLanScan } = require('./core/lanscan');
const diagnostics = require('./core/diagnostics');
const crash = require('./core/crash');

let win = null;
let config = null;
let runningGame = null;
let runningVersionId = null;
let launchCancel = false;
let lanScanner = null;
let taskSeq = 0;
let manifestCache = null;
let manifestMirror = null;

// 两个启动器实例同时写 config.json 会互相覆盖，必须只允许一个
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

function versionConf(id) {
  const map = config.get('versionSettings') || {};
  return (id && map[id]) || {};
}

function versionModsDir(id) {
  const gameDir = config.get('gameDir');
  return path.join(versionMod.versionGameDir(gameDir, id, effectiveLaunch(id).isolation), 'mods');
}

function listModFiles(id) {
  const dir = versionModsDir(id);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jar|zip)(\.disabled)?$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function assertModName(name) {
  if (typeof name !== 'string' || !name || /[\\/]/.test(name) || name === '.' || name === '..') {
    throw new Error('非法的 Mod 文件名');
  }
  if (!/\.(jar|zip)(\.disabled)?$/i.test(name)) throw new Error('不是可管理的 Mod 文件');
  return name;
}

const PERSONAL_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

async function personalDataUrl(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = PERSONAL_MIME[ext] || 'application/octet-stream';
  const data = await fsp.readFile(file);
  return `data:${mime};base64,${data.toString('base64')}`;
}

async function pickPersonalFile(kind, filters, subdir, filename) {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  if (r.canceled || !r.filePaths[0]) return null;
  const src = r.filePaths[0];
  const ext = path.extname(src).toLowerCase() || '.bin';
  const dir = path.join(config.root, subdir);
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${filename}${ext}`);
  await fsp.copyFile(src, dest);
  return { path: dest, dataUrl: await personalDataUrl(dest), name: path.basename(src) };
}

function effectiveLaunch(id) {
  const vc = versionConf(id);
  let isolation = config.get('versionIsolation');
  if (vc.isolation === 'on') isolation = true;
  else if (vc.isolation === 'off') isolation = false;
  let maxMemory = config.get('maxMemory');
  if (vc.memoryMode === 'auto') maxMemory = 0;
  else if (vc.memoryMode === 'custom' && Number(vc.maxMemory) > 0) maxMemory = Number(vc.maxMemory);
  const windowWidth = vc.windowMode === 'custom' && Number(vc.windowWidth) ? Number(vc.windowWidth) : config.get('gameWidth');
  const windowHeight = vc.windowMode === 'custom' && Number(vc.windowHeight) ? Number(vc.windowHeight) : config.get('gameHeight');
  const javaPath = vc.javaPath || config.get('javaPath');
  const serverAddress = vc.serverAddress || '';
  const fullscreen = !!vc.fullscreen || !!config.get('fullscreen');
  const extraJvmArgs = String(vc.jvmArgs || '').trim() ? String(vc.jvmArgs).match(/(?:[^\s"]+|"[^"]*")+/g).map((a) => a.replace(/^"|"$/g, '')) : [];
  const optimizeMem = vc.optimizeMem !== 'off';
  const loginMode = vc.loginMode || '';
  const gameTitle = config.get('gameTitle') || '';
  return { vc, isolation, maxMemory, windowWidth, windowHeight, javaPath, serverAddress, extraJvmArgs, fullscreen, optimizeMem, loginMode, gameTitle };
}

function createWindow() {
  const c = config.get();
  win = new BrowserWindow({
    width: c.launcherWidth || 1024,
    height: c.launcherHeight || 640,
    minWidth: 880,
    minHeight: 560,
    frame: false,
    show: false,
    backgroundColor: '#eaf2fb',
    title: 'StartPro Launcher',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  try {
    const opacity = Math.max(0.5, Math.min(1, Number(c.windowOpacity || 100) / 100));
    win.setOpacity(opacity);
  } catch {}
  const pageArg = (process.argv.find((a) => a.startsWith('--page=')) || '').slice(7);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), pageArg ? { hash: pageArg } : undefined);

  // 调试/验收用：设置 PCL2_CAPTURE=/path/xx.png 时截图后自动退出（仅开发时使用）
  if (process.env.PCL2_CAPTURE) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await win.capturePage();
          fs.writeFileSync(process.env.PCL2_CAPTURE, img.toPNG());
          console.log('[capture] saved to', process.env.PCL2_CAPTURE);
        } catch (e) {
          console.error('[capture] failed', e);
        }
        app.quit();
      }, Number(process.env.PCL2_CAPTURE_DELAY || 2600));
    });
  }
  win.once('ready-to-show', () => {
    win.show();
    // 创建/修复桌面快捷方式不参与首屏关键路径，等窗口出现后再做
    setTimeout(() => ensureDesktopShortcut(), 1200);
  });
  win.on('maximize', () => win.webContents.send('win:state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('win:state', { maximized: false }));
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) console.error('[renderer]', message);
  });
  win.on('closed', () => {
    win = null;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** 统一的任务进度推送 */
function makeTask(kind, title) {
  const taskId = `${kind}-${++taskSeq}`;
  let lastEmit = 0;
  let logBuf = [];
  let logTimer = null;
  const flushLog = () => {
    if (logTimer) {
      clearTimeout(logTimer);
      logTimer = null;
    }
    if (!logBuf.length) return;
    const lines = logBuf;
    logBuf = [];
    send('task:log', { taskId, lines });
  };
  const onProgress = (p) => {
    const now = Date.now();
    const finished = p.phase === 'finish';
    if (finished || now - lastEmit > 120) {
      lastEmit = now;
      send('task:progress', { taskId, kind, title, ...p });
    }
  };
  // Forge 安装器一秒钟能刷几百行；逐行 IPC 会把渲染进程拖死，这里按 200ms / 60 行批量发送
  const log = (line) => {
    if (!line) return;
    logBuf.push(String(line));
    if (logBuf.length >= 60) flushLog();
    else if (!logTimer) logTimer = setTimeout(flushLog, 200);
  };
  return {
    taskId,
    onProgress,
    log,
    done: (extra = {}) => {
      flushLog();
      send('task:done', { taskId, kind, title, ...extra });
    },
  };
}

function gameFolderName(p) {
  const abs = String(p || '').replace(/[\\/]+$/, '');
  const base = path.basename(abs);
  if (base !== '.minecraft') return base || abs;
  const parentDir = path.dirname(abs);
  // PCL2：默认 .minecraft 显示为“官方启动器文件夹”，自定义目录显示父文件夹名
  if (/AppData[\\/]Roaming$/i.test(parentDir) || path.resolve(parentDir) === path.resolve(os.homedir())) {
    return '官方启动器文件夹';
  }
  return path.basename(parentDir) || '.minecraft';
}

function listGameFolders() {
  const active = config.get('gameDir');
  const folders = config.get('gameFolders') || [];
  if (active && !folders.includes(active)) folders.unshift(active);
  return folders.map((p) => ({
    path: p,
    name: gameFolderName(p),
    active: p === active,
    exists: fs.existsSync(p),
  }));
}

function saveGameFolders(paths) {
  const list = [...new Set((paths || []).filter(Boolean))];
  config.set({ gameFolders: list });
  return list;
}

/** 选择文件夹时，如果选中的是包含 .minecraft 的父目录，自动落到 .minecraft */
function normalizeSelectedFolder(p) {
  const abs = path.resolve(String(p || ''));
  if (!abs) return '';
  if (path.basename(abs) !== '.minecraft' && fs.existsSync(path.join(abs, '.minecraft'))) {
    return path.join(abs, '.minecraft');
  }
  return abs;
}

function useGameFolder(p, resetVersion = true) {
  const abs = path.resolve(String(p || ''));
  const folders = config.get('gameFolders') || [];
  if (!folders.includes(abs)) folders.push(abs);
  const patch = { gameDir: abs, gameFolders: [...new Set(folders)] };
  if (resetVersion) patch.version = '';
  config.set(patch);
  return abs;
}

function registerIpc() {
  // —— 窗口控制 ——
  ipcMain.handle('win:minimize', () => win && win.minimize());
  ipcMain.handle('win:toggleMaximize', () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('win:close', () => win && win.close());
  ipcMain.handle('win:isMaximized', () => (win ? win.isMaximized() : false));

  // —— 设置 ——
  ipcMain.handle('settings:get', () => {
    // 不要直接修改 config 内部对象，派生字段会污染并写回配置文件
    return {
      ...config.get(),
      defaultMemory: defaultMemory(),
      totalMem: Math.round(require('os').totalmem() / 1024 / 1024),
      mirrorHosts: MIRROR_HOSTS,
    };
  });
  ipcMain.handle('settings:set', (e, patch) => {
    if (patch && typeof patch.gameDir === 'string' && patch.gameDir.trim()) {
      const abs = path.resolve(patch.gameDir);
      const folders = Array.isArray(patch.gameFolders) ? patch.gameFolders : config.get('gameFolders') || [];
      patch = { ...patch, gameDir: abs, gameFolders: [...new Set([abs, ...folders])] };
    }
    const data = config.set(patch);
    if (patch && patch.windowOpacity != null && win && !win.isDestroyed()) {
      try {
        win.setOpacity(Math.max(0.5, Math.min(1, Number(patch.windowOpacity || 100) / 100)));
      } catch {}
    }
    // 切换下载源后必须让旧清单缓存失效，否则安装仍会走上一个源
    if (patch && patch.mirror) {
      manifestCache = null;
      manifestMirror = null;
    }
    return data;
  });

  ipcMain.handle('diagnostics:run', async (e, logs) => {
    const gameDir = config.get('gameDir');
    const versionId = config.get('version');
    const eff = effectiveLaunch(versionId);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    return diagnostics.runDiagnostics({
      gameDir,
      versionId,
      javaPath: eff.javaPath,
      maxMemory: eff.maxMemory || defaultMemory(),
      totalMem,
      freeMem: Math.round(os.freemem() / 1024 / 1024),
      mirror: installMirror(),
      accounts: config.get('accounts') || [],
      selectedAccount: config.get('account') || '',
      logs: Array.isArray(logs) ? logs : [],
      runtime: { electron: process.versions.electron, platform: process.platform, arch: process.arch },
      appVersion: app.getVersion(),
    });
  });

  // —— 版本 ——
  ipcMain.handle('versions:list', () => {
    const gameDir = config.get('gameDir');
    const locals = versionMod.listLocalVersions(gameDir);
    const recent = new Map((config.get('versionList') || []).map((v) => [v.id, v.at]));
    return locals
      .map((v) => {
        let mods = 0;
        try {
          const runDir = versionMod.versionGameDir(gameDir, v.id, effectiveLaunch(v.id).isolation);
          const modsDir = path.join(runDir, 'mods');
          if (fs.existsSync(modsDir)) mods = fs.readdirSync(modsDir).filter((f) => /\.jar(\.disabled)?$/i.test(f)).length;
        } catch {}
        const at = Number(recent.get(v.id));
        const used = recent.has(v.id) && Number.isFinite(at) && at > 0 && at <= 8.64e15 ? new Date(at).toISOString() : v.lastUsed;
        return { ...v, mods, lastUsed: used, gameVersion: versionMod.baseVersionId(v.id, gameDir), dir: versionMod.versionDir(gameDir, v.id) };
      })
      .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
  });
  ipcMain.handle('versions:delete', async (e, id) => {
    if (runningVersionId === id) throw new Error('该版本正在运行，请先结束游戏');
    const gameDir = config.get('gameDir');
    const dir = versionMod.versionDir(gameDir, id);
    if (!fs.existsSync(dir)) return { ok: false, error: '版本不存在' };
    await fsp.rm(dir, { recursive: true, force: true });
    // 清理该版本的独立设置与最近使用记录，避免同名版本重建后继承旧配置
    const vs = { ...(config.get('versionSettings') || {}) };
    delete vs[id];
    const vl = (config.get('versionList') || []).filter((v) => v.id !== id);
    const starred = (config.get('starredVersions') || []).filter((v) => v !== id);
    const patch = { versionSettings: vs, versionList: vl, starredVersions: starred };
    if (config.get('version') === id) patch.version = '';
    config.set(patch);
    return { ok: true };
  });
  ipcMain.handle('versions:open', (e, id) => {
    const gameDir = config.get('gameDir');
    const dir = id ? versionMod.versionDir(gameDir, id) : gameDir;
    if (fs.existsSync(dir)) shell.openPath(dir);
    return dir;
  });
  ipcMain.handle('versions:copy', async (e, id, newName) => {
    const gameDir = config.get('gameDir');
    const name = String(newName || '').trim();
    if (!name) throw new Error('请输入新版本名称');
    if (name === id) throw new Error('新版本名称不能和原版本相同');
    if (/[\\/:*?"<>|]/.test(name)) throw new Error('版本名称不能包含 \\ / : * ? " < > |');
    const src = versionMod.versionDir(gameDir, id);
    const dst = versionMod.versionDir(gameDir, name);
    if (!fs.existsSync(src)) throw new Error('版本不存在');
    if (fs.existsSync(dst)) throw new Error('同名版本已存在');
    await fsp.cp(src, dst, { recursive: true });
    // 重命名 jar 与 json
    for (const ext of ['json', 'jar']) {
      const from = path.join(dst, `${id}.${ext}`);
      const to = path.join(dst, `${name}.${ext}`);
      if (fs.existsSync(from)) await fsp.rename(from, to);
    }
    const jsonPath = path.join(dst, `${name}.json`);
    if (fs.existsSync(jsonPath)) {
      const j = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
      j.id = name;
      await fsp.writeFile(jsonPath, JSON.stringify(j, null, 4));
    }
    // 复制原版本的独立设置（尤其是版本隔离），否则副本行为会与原版不一致
    const vs = config.get('versionSettings') || {};
    if (vs[id]) config.set({ versionSettings: { ...vs, [name]: { ...vs[id] } } });
    return { ok: true, id: name };
  });
  ipcMain.handle('versions:export', async (e, id) => {
    const gameDir = config.get('gameDir');
    const src = versionMod.versionDir(gameDir, id);
    if (!fs.existsSync(src)) return { ok: false, error: '版本不存在' };
    const picked = await dialog.showSaveDialog(win, {
      title: '导出整合包',
      defaultPath: path.join(app.getPath('downloads'), `${id}.zip`),
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
    });
    if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };
    const zip = new AdmZip();
    zip.addLocalFolder(src, id, (p) => !/(^|[\\/])(natives|logs)([\\/]|$)/.test(p) && !/\.log$/i.test(p));
    zip.writeZip(picked.filePath);
    return { ok: true, path: picked.filePath };
  });

  ipcMain.handle('versions:settings:get', (e, id) => versionConf(id));

  ipcMain.handle('versions:settings:set', (e, id, patch) => {
    const map = config.get('versionSettings') || {};
    map[id] = { ...(map[id] || {}), ...(patch || {}) };
    config.set({ versionSettings: map });
    return map[id];
  });

  ipcMain.handle('versions:detail', (e, id) => {
    const gameDir = config.get('gameDir');
    const raw = versionMod.readVersionJson(id, gameDir);
    let merged = raw;
    try {
      merged = versionMod.mergeVersionJson(id, gameDir);
    } catch {}
    const mods = listModFiles(id);
    return {
      id,
      raw,
      mainClass: merged.mainClass,
      javaVersion: merged.javaVersion || null,
      assets: merged.assets,
      mods,
      dir: versionMod.versionDir(gameDir, id),
   };
  });

  ipcMain.handle('personal:openDir', async (e, sub) => {
    const dir = path.join(config.root, sub === 'music' ? 'music' : sub === 'skin' ? 'skin' : 'background');
    await fsp.mkdir(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return { ok: true };
  });
  ipcMain.handle('personal:pickBackground', async () => {
    const picked = await pickPersonalFile('background', [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }], 'background', 'background');
    if (!picked) return { ok: false, cancelled: true };
    config.set({ backgroundImage: picked.path });
    return { ok: true, ...picked };
  });
  ipcMain.handle('personal:getBackground', async () => {
    let file = config.get('backgroundImage');
    if (!file || !fs.existsSync(file)) {
      const dir = path.join(config.root, 'background');
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(f)).sort();
        if (files.length) file = path.join(dir, files[files.length - 1]);
      }
    }
    if (!file || !fs.existsSync(file)) return { ok: false };
    try {
      return { ok: true, path: file, dataUrl: await personalDataUrl(file), name: path.basename(file) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('personal:clearBackground', () => {
    config.set({ backgroundImage: '' });
    return { ok: true };
  });
  ipcMain.handle('personal:pickMusic', async () => {
    const picked = await pickPersonalFile('music', [{ name: '音频', extensions: ['mp3', 'ogg', 'wav', 'm4a'] }], 'music', 'background');
    if (!picked) return { ok: false, cancelled: true };
    config.set({ backgroundMusic: picked.path });
    return { ok: true, ...picked };
  });
  ipcMain.handle('personal:getMusic', async () => {
    const file = config.get('backgroundMusic');
    if (!file || !fs.existsSync(file)) return { ok: false };
    try {
      return { ok: true, path: file, dataUrl: await personalDataUrl(file), name: path.basename(file) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('personal:clearMusic', () => {
    config.set({ backgroundMusic: '' });
    return { ok: true };
  });
  ipcMain.handle('personal:pickSkin', async () => {
    const picked = await pickPersonalFile('skin', [{ name: 'Minecraft 皮肤', extensions: ['png'] }], 'skin', 'skin');
    if (!picked) return { ok: false, cancelled: true };
    config.set({ skinFile: picked.path, skinModel: 'custom' });
    return { ok: true, ...picked };
  });
  ipcMain.handle('personal:getSkin', async () => {
    const model = config.get('skinModel') || 'random';
    if (model === 'msa') {
      const acc = (config.get('accounts') || []).find((a) => a.id === config.get('account')) || (config.get('accounts') || [])[0];
      if (acc && acc.type === 'msa') {
        const skins = acc.skins || [];
        const skin = skins.find((x) => x.state === 'ACTIVE') || skins[0];
        if (skin && skin.url) return { ok: true, url: skin.url, model: skin.variant || 'classic', name: acc.name };
        return { ok: false, pending: true, name: acc.name };
      }
    }
    const file = config.get('skinFile');
    if (!file || !fs.existsSync(file)) return { ok: false };
    try {
      return { ok: true, path: file, dataUrl: await personalDataUrl(file), name: path.basename(file) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  // 正版皮肤不在启动关键路径上请求：先返回缓存，后台再刷新
  ipcMain.handle('personal:refreshSkin', async () => {
    const acc = (config.get('accounts') || []).find((a) => a.id === config.get('account')) || (config.get('accounts') || [])[0];
    if (!acc || acc.type !== 'msa' || !acc.accessToken) return { ok: false };
    try {
      const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
        headers: { Authorization: `Bearer ${acc.accessToken}`, 'User-Agent': 'StartPro/1.2.2' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { ok: false };
      const profile = await res.json();
      const skins = profile.skins || [];
      const list = config.get('accounts') || [];
      const hit = list.find((a) => a.id === acc.id);
      if (hit) {
        hit.skins = skins;
        config.save();
      }
      const skin = skins.find((x) => x.state === 'ACTIVE') || skins[0];
      if (skin && skin.url) return { ok: true, url: skin.url, model: skin.variant || 'classic', name: acc.name };
    } catch {}
    return { ok: false };
  });
  ipcMain.handle('personal:pickIcon', async () => {
    const picked = await pickPersonalFile('icon', [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], 'icon', 'icon');
    if (!picked) return { ok: false, cancelled: true };
    config.set({ launcherIcon: picked.path });
    if (win && !win.isDestroyed()) {
      try {
        const { nativeImage } = require('electron');
        win.setIcon(nativeImage.createFromPath(picked.path));
      } catch {}
    }
    return { ok: true, ...picked };
  });

  ipcMain.handle('crash:analyze', (e, id) => {
    try {
      const versionId = id || config.get('version');
      const eff = effectiveLaunch(versionId);
      return crash.analyze({ gameDir: config.get('gameDir'), versionId, isolation: eff.isolation });
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('crash:openDir', async (e, dir) => {
    if (!dir || typeof dir !== 'string') throw new Error('目录不存在');
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return { ok: true };
  });

  ipcMain.handle('mods:list', (e, id) => listModFiles(id));

  ipcMain.handle('mods:toggle', (e, { id, name, enabled }) => {
    const dir = versionModsDir(id);
    const safe = assertModName(name);
    const src = path.join(dir, safe);
    if (!fs.existsSync(src)) throw new Error('Mod 文件不存在');
    const disabled = safe.toLowerCase().endsWith('.disabled');
    if (!!enabled === !disabled) return listModFiles(id);
    const dest = enabled ? path.join(dir, safe.replace(/\.disabled$/i, '')) : path.join(dir, safe + '.disabled');
    if (fs.existsSync(dest)) throw new Error('目标文件已存在：' + path.basename(dest));
    fs.renameSync(src, dest);
    return listModFiles(id);
  });

  ipcMain.handle('mods:remove', (e, { id, name }) => {
    const dir = versionModsDir(id);
    const safe = assertModName(name);
    const target = path.join(dir, safe);
    if (!fs.existsSync(target)) throw new Error('Mod 文件不存在');
    fs.unlinkSync(target);
    return listModFiles(id);
  });

  ipcMain.handle('mods:toggleAll', (e, { id, enabled }) => {
    const dir = versionModsDir(id);
    if (!fs.existsSync(dir)) return [];
    for (const name of listModFiles(id)) {
      const src = path.join(dir, name);
      const disabled = name.toLowerCase().endsWith('.disabled');
      if (!!enabled === !disabled) continue;
      const dest = enabled ? path.join(dir, name.replace(/\.disabled$/i, '')) : path.join(dir, name + '.disabled');
      if (!fs.existsSync(dest)) fs.renameSync(src, dest);
    }
    return listModFiles(id);
  });

  ipcMain.handle('mods:open', async (e, id) => {
    const dir = versionModsDir(id);
    await fsp.mkdir(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return { ok: true, dir };
  });

  // —— 版本清单 / 安装 ——
  async function getVersionManifest() {
    const now = Date.now();
    if (manifestCache && now - manifestCache.at < 5 * 60 * 1000) return manifestCache.data;
    const official = MIRROR_HOSTS.official.versionManifest;
    const bmcl = MIRROR_HOSTS.bmclapi.versionManifest;
    const preferred = config.mirrorHosts(config.get('mirror')).versionManifest || official;
    // 必须始终保留“另一个源”作为回退；默认源是 BMCLAPI 时不能只试 BMCLAPI
    const fallback = preferred === official ? bmcl : official;
    const urls = [preferred, fallback].filter((u, i, arr) => u && arr.indexOf(u) === i);
    const errors = [];
    for (const url of urls) {
      try {
        const data = await fetchJson(url, { timeout: 20000, retries: 2 });
        if (!data || !Array.isArray(data.versions)) throw new Error('版本清单格式异常');
        manifestMirror = url === MIRROR_HOSTS.bmclapi.versionManifest ? 'bmclapi' : 'official';
        manifestCache = { at: now, data };
        return data;
      } catch (err) {
        errors.push(`${url.includes('bangbang93') ? 'BMCLAPI' : '官方源'}：${err.message || err}`);
      }
    }
    // 网络暂时不可用时，允许 24 小时内的旧清单兜底，避免整页空白
    if (manifestCache && now - manifestCache.at < 24 * 60 * 60 * 1000) return manifestCache.data;
    throw new Error(`获取版本列表失败：${errors.join('；')}`);
  }
  // 清单走 BMCLAPI 回退成功时，后续下载也必须用 BMCLAPI，否则会出现“列表能看、安装失败”
  function installMirror() {
    const configured = config.get('mirror');
    if (configured === 'bmclapi') return 'bmclapi';
    return manifestMirror || configured;
  }

  ipcMain.handle('manifest:get', async () => {
    const data = await getVersionManifest();
    return { latest: data.latest, versions: data.versions };
  });

  ipcMain.handle('install:version', async (e, payload) => {
    const id = typeof payload === 'string' ? payload : payload && payload.version;
    const targetName = (payload && payload.name) || '';
    const task = makeTask('install', `安装 ${targetName || id}`);
    const gameDir = config.get('gameDir');
    try {
      const r = await installVersion(id, {
        gameDir,
        mirror: installMirror(),
        manifest: await getVersionManifest(),
        targetName,
        onProgress: task.onProgress,
      });
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('fabric:games', async () => fabric.listGameVersions());
  ipcMain.handle('forge:versions', async (e, mcVersion) => {
    try {
      return await forge.listForgeVersions(mcVersion);
    } catch (err) {
      return { error: String(err.message || err) };
    }
  });
  ipcMain.handle('neoforge:versions', async (e, mcVersion) => {
    try {
      return await forge.listNeoForgeVersions(mcVersion);
    } catch (err) {
      return { error: String(err.message || err) };
    }
  });
  ipcMain.handle('install:forge', async (e, { mcVersion, forgeVersion, neoVersion, kind, name = '' }) => {
    const isNeo = kind === 'neoforge';
    const task = makeTask('forge', `安装 ${isNeo ? 'NeoForge' : 'Forge'} ${isNeo ? neoVersion : forgeVersion}`);
    try {
      const java = await pickJava();
      // 基础版本已安装时不需要版本清单；有缓存就顺带传给 ensureBase，避免重复请求
      const manifest = manifestCache ? manifestCache.data : undefined;
      const r = isNeo
        ? await forge.installNeoForge({
            mcVersion,
            neoVersion,
            gameDir: config.get('gameDir'),
            mirror: installMirror(),
            manifest,
            javaPath: java,
            name,
            onProgress: task.onProgress,
            onLog: task.log,
          })
        : await forge.installForge({
            mcVersion,
            forgeVersion,
            gameDir: config.get('gameDir'),
            mirror: installMirror(),
            manifest,
            javaPath: java,
            name,
            onProgress: task.onProgress,
            onLog: task.log,
          });
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('fabric:loaders', async () => fabric.listLoaders());
  ipcMain.handle('install:fabric', async (e, { gameVersion, loaderVersion, installBase, name = '' }) => {
    const task = makeTask('fabric', `安装 Fabric ${loaderVersion}`);
    try {
      const r = await fabric.installFabric({
        gameVersion,
        loaderVersion,
        installBase: installBase !== false,
        name,
        gameDir: config.get('gameDir'),
        mirror: installMirror(),
        manifest: manifestCache ? manifestCache.data : undefined,
        onProgress: task.onProgress,
      });
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });

  // —— Java ——
  ipcMain.handle('java:detect', async () => {
    const extra = [config.get('javaPath')].filter(Boolean);
    const local = await java.installedJava(config.root);
    const managed = new Set(
      local.map((j) => {
        try {
          return fs.realpathSync(j.path);
        } catch {
          return j.path;
        }
      })
    );
    const list = await detectJavaList(extra.concat(local.map((j) => j.path)));
    const merged = new Map(list.map((j) => [j.path, j]));
    for (const j of local) if (!merged.has(j.path)) merged.set(j.path, j);
    return [...merged.values()]
      .map((j) => ({ ...j, managed: managed.has(j.path) }))
      .sort((a, b) => b.major - a.major);
  });
  ipcMain.handle('java:catalog', () => java.javaCatalog());
  ipcMain.handle('java:required', async (e, versionId) => {
    try {
      return await java.requiredJava(versionId, config.get('gameDir'));
    } catch (err) {
      return { major: 17, source: 'fallback', error: String(err.message || err) };
    }
  });
  ipcMain.handle('java:download', async (e, major) => {
    const task = makeTask('java', `安装 Java ${major}`);
    let lastBytes = 0;
    let lastAt = Date.now();
    try {
      const r = await java.installJava(major, {
        rootDir: config.root,
        onLog: task.log,
        onProgress: (got, total) => {
          const now = Date.now();
          if (got === total || now - lastAt > 500) {
            const speed = got > lastBytes ? (got - lastBytes) / ((now - lastAt) / 1000) : 0;
            lastBytes = got;
            lastAt = now;
            task.onProgress({
              phase: 'download',
              title: `下载 Java ${major}`,
              detail: `${(got / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB${
                speed ? ` · ${(speed / 1048576).toFixed(1)} MB/s` : ''
              }`,
              current: got,
              total: total || got,
            });
          }
        },
      });
      task.done({ success: true, major, path: r.path, cached: r.cached });
      return { ok: true, path: r.path, major: r.major, version: r.version, cached: r.cached };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('java:probe', async (e, p) => probeJava(p));
  ipcMain.handle('java:browse', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'] });
    return r.canceled ? '' : r.filePaths[0];
  });

  // —— 目录 ——
  ipcMain.handle('dir:choose', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? '' : r.filePaths[0];
  });

  // —— 版本文件夹列表（PCL2 风格的多 .minecraft 管理） ——
  ipcMain.handle('folders:list', () => listGameFolders());

  ipcMain.handle('folders:add', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '添加已有 .minecraft 文件夹',
      buttonLabel: '添加',
      properties: ['openDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const p = normalizeSelectedFolder(r.filePaths[0]);
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
      return { ok: false, error: '文件夹不存在' };
    }
    useGameFolder(p, true);
    return { ok: true, path: p, folders: listGameFolders() };
  });

  ipcMain.handle('folders:create', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '选择新 .minecraft 文件夹的父目录',
      buttonLabel: '在这里创建',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const p = path.join(r.filePaths[0], '.minecraft');
    try {
      fs.mkdirSync(p, { recursive: true });
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
    useGameFolder(p, true);
    return { ok: true, path: p, folders: listGameFolders() };
  });

  ipcMain.handle('folders:switch', async (e, p) => {
    const abs = path.resolve(String(p || ''));
    const folders = config.get('gameFolders') || [];
    if (!folders.includes(abs)) throw new Error('该文件夹不在列表中');
    if (!fs.existsSync(abs)) throw new Error('文件夹不存在或已被移动');
    useGameFolder(abs, true);
    return { ok: true, path: abs, folders: listGameFolders() };
  });

  ipcMain.handle('folders:remove', async (e, p) => {
    const abs = path.resolve(String(p || ''));
    const folders = config.get('gameFolders') || [];
    if (folders.length <= 1) throw new Error('至少要保留一个游戏文件夹');
    const next = folders.filter((x) => x !== abs);
    const active = config.get('gameDir');
    const switched = active === abs;
    if (switched) {
      config.set({ gameFolders: next, gameDir: next[0], version: '' });
    } else {
      saveGameFolders(next);
    }
    return { ok: true, switched, active: config.get('gameDir'), folders: listGameFolders() };
  });

  // —— 启动游戏 ——
  ipcMain.handle('launch:preview', async (e, id) => {
    try {
      const versionId = id || config.get('version');
      const eff = effectiveLaunch(versionId);
      let acc = currentAccount();
      acc = await ensureAccountToken(acc);
      let authlibJar = '';
      if (acc && acc.type === 'authlib') authlibJar = await authlib.ensureInjector(config.root, installMirror());
      const built = buildLaunch({
        versionId,
        gameDir: config.get('gameDir'),
        isolation: eff.isolation,
        account: acc,
        authlibJar,
        javaPath: eff.javaPath,
        maxMemory: eff.maxMemory,
        windowWidth: eff.windowWidth,
        windowHeight: eff.windowHeight,
        serverAddress: eff.serverAddress,
        extraJvmArgs: eff.extraJvmArgs,
      });
      return { ok: true, command: built.full, memory: built.memory, requiresJava: built.requiresJava };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('launch:start', async (e, id) => {
    const versionId = id || config.get('version');
    if (!versionId) throw new Error('还没有选择版本');
    if (runningGame) throw new Error('游戏已经在运行');
    let acc = currentAccount();
    if (!acc) throw new Error('请先添加账号');
    const launchPhase = (phase, detail, progress) => send('launch:phase', { versionId, phase, detail, progress });
    const checkCancel = () => {
      if (launchCancel) {
        const err = new Error('已取消启动');
        err.code = 'LAUNCH_CANCELLED';
        throw err;
      }
    };
    launchCancel = false;
    try {
      launchPhase('检查账号', '正在验证登录状态', 8);
      acc = await ensureAccountToken(acc);
      checkCancel();
      const eff = effectiveLaunch(versionId);
      if (eff.loginMode === 'online' && !['msa', 'authlib'].includes(acc.type)) {
        throw new Error('该版本设置为仅正版登录，请先添加微软或外置账号');
      }
      if (eff.loginMode === 'offline' && acc.type !== 'offline') {
        throw new Error('该版本设置为仅离线登录，请先切换离线账号');
      }
      let authlibJar = '';
      if (acc.type === 'authlib') {
        launchPhase('准备外置登录', '正在准备 authlib-injector', 16);
        authlibJar = await authlib.ensureInjector(config.root, installMirror());
        checkCancel();
      }
      launchPhase('检查 Java', '正在探测本机 Java', 30);
      const pick = await java.pickJavaFor(versionId, config.get('gameDir'), eff.javaPath, config.root);
      checkCancel();
      let javaPath = pick.java ? pick.java.path : '';
      if (!javaPath) {
        const major = pick.required.major;
        if (config.get('autoInstallJava') === false) {
          throw new Error(`缺少 Java ${major}，请先在 设置 → 游戏 → Java 中安装`);
        }
        const answer = await dialog.showMessageBox(win, {
          type: 'question',
          buttons: ['自动下载', '取消'],
          defaultId: 0,
          cancelId: 1,
          title: '缺少 Java',
          message: `运行「${versionId}」需要 Java ${major}`,
          detail: '当前没有检测到满足要求的 Java。可由启动器自动下载 Adoptium Temurin JDK（约 200 MB）。',
        });
        if (answer.response !== 0) throw new Error(`缺少 Java ${major}，请先在 设置 → 游戏 → Java 中安装`);
        checkCancel();
        launchPhase('安装 Java', `正在下载 Temurin JDK ${major}`, 40);
        const task = makeTask('java', `安装 Java ${major}`);
        let installed;
        let javaPct = 40;
        try {
          installed = await java.installJava(major, {
            rootDir: config.root,
            onLog: task.log,
            onProgress: (got, total) => {
              task.onProgress({
                phase: 'download',
                title: `下载 Java ${major}`,
                detail: `${(got / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`,
                current: got,
                total: total || got,
              });
              const pct = total ? 40 + Math.min(15, Math.round((got / total) * 15)) : 46;
              if (pct !== javaPct) {
                javaPct = pct;
                launchPhase('安装 Java', `正在下载 Temurin JDK ${major}`, pct);
              }
            },
          });
        } catch (e) {
          task.done({ success: false, error: String(e.message || e) });
          throw e;
        }
        task.done({ success: true, major, path: installed.path, cached: installed.cached });
        javaPath = installed.path;
        launchPhase('整理版本文件', 'Java 已就绪，正在检查游戏文件', 55);
      }
      checkCancel();
      if (javaPath && !(pick.java && pick.java.path === javaPath)) launchPhase('整理版本文件', '正在检查客户端与依赖库', 55);
      let logBuf = [];
      let logTimer = null;
      const flushGameLog = () => {
        if (logTimer) {
          clearTimeout(logTimer);
          logTimer = null;
        }
        if (!logBuf.length) return;
        const lines = logBuf;
        logBuf = [];
        send('launch:log', { versionId, lines });
      };
      const pushGameLog = (line) => {
        if (!line) return;
        logBuf.push(String(line));
        if (logBuf.length >= 80) flushGameLog();
        else if (!logTimer) logTimer = setTimeout(flushGameLog, 150);
      };
      checkCancel();
      launchPhase('构建启动参数', '正在生成 JVM 参数与 classpath', 70);
      const result = launchGame(
        {
          versionId,
          gameDir: config.get('gameDir'),
          isolation: eff.isolation,
          account: acc,
          authlibJar,
          javaPath,
          maxMemory: eff.maxMemory,
          windowWidth: eff.windowWidth,
          windowHeight: eff.windowHeight,
          fullscreen: eff.fullscreen,
          extraJvmArgs: eff.extraJvmArgs,
          serverAddress: eff.serverAddress,
          optimizeMem: eff.optimizeMem,
          launcherBrand: config.get('customInfo') || 'StartPro',
          gameTitle: eff.gameTitle,
        },
        {
          onLog: pushGameLog,
          onExit: (code) => {
            flushGameLog();
            runningGame = null;
            runningVersionId = null;
            send('launch:exit', { versionId, code });
          },
        }
      );
      runningGame = result.proc;
      runningVersionId = versionId;
      launchPhase('启动游戏进程', '正在等待游戏窗口', 92);
      config.set({ version: versionId, account: acc.id, versionList: touchVersion(versionId) });
      const priority = config.get('processPriority');
      if (priority === 'high' || priority === 'low') {
        try {
          os.setPriority(result.proc.pid, priority === 'high' ? os.constants.priority.PRIORITY_HIGH : os.constants.priority.PRIORITY_LOW);
        } catch {}
      }
      const visibility = config.get('launcherVisibility');
      if (visibility === 'minimize' && win) setTimeout(() => { try { win.minimize(); } catch {} }, 800);
      else if (visibility === 'close' && win) setTimeout(() => { try { win.close(); } catch {} }, 1200);
      return { ok: true, pid: result.proc.pid, logFile: result.logFile, command: result.built.full };
    } catch (err) {
      runningGame = null;
      runningVersionId = null;
      // 启动前失败由 IPC reject 回到渲染层处理；不要再伪造一次 launch:exit，否则会弹两次提示
      throw err;
    }
  });

  ipcMain.handle('launch:stop', () => {
    launchCancel = true;
    if (!runningGame) return { ok: true, cancelled: true };
    try {
      runningGame.kill();
    } catch {}
    return { ok: true };
  });
  ipcMain.handle('launch:status', () => ({ running: !!runningGame }));

  // —— 账号 ——
  ipcMain.handle('accounts:list', () => config.get('accounts') || []);
  ipcMain.handle('accounts:addOffline', (e, name) => {
    const acc = accounts.addOffline(name);
    const list = config.get('accounts').filter((a) => a.id !== acc.id);
    list.push(acc);
    config.set({ accounts: list, account: acc.id });
    return acc;
  });
  ipcMain.handle('accounts:authlib', async (e, payload) => {
    const acc = await accounts.loginAuthlib(payload);
    const list = config.get('accounts').filter((a) => a.id !== acc.id);
    list.push(acc);
    config.set({ accounts: list, account: acc.id });
    return acc;
  });
  ipcMain.handle('accounts:remove', (e, id) => {
    const current = config.get('account');
    const list = config.get('accounts').filter((a) => a.id !== id);
    const still = list.some((a) => a.id === current) ? current : list[0] ? list[0].id : '';
    config.set({ accounts: list, account: still });
    return list;
  });
  ipcMain.handle('accounts:msaStart', async () => accounts.startMicrosoft(config.get('msClientId')));
  ipcMain.handle('accounts:msaPoll', async (e, deviceCode) => {
    const acc = await accounts.pollMicrosoft(config.get('msClientId'), deviceCode);
    if (acc.pending) return acc;
    const list = config.get('accounts').filter((a) => a.id !== acc.id);
    list.push(acc);
    config.set({ accounts: list, account: acc.id });
    return acc;
  });
  ipcMain.handle('accounts:select', (e, id) => {
    config.set({ account: id });
    return id;
  });

  // —— Modrinth ——
  ipcMain.handle('modrinth:search', async (e, opts) => modrinth.search(opts));
  ipcMain.handle('modrinth:versions', async (e, id, opts) => modrinth.getVersions(id, opts));
  ipcMain.handle('modrinth:install', async (e, payload) => {
    const task = makeTask('mod', `下载 ${payload.title || 'Mod'}`);
    try {
      const targetVersion = payload.versionId || config.get('version');
      const r = await modrinth.installProject({
        ...payload,
        gameDir: config.get('gameDir'),
        mirror: installMirror(),
        versionId: targetVersion,
        isolation: effectiveLaunch(targetVersion).isolation,
        onProgress: task.onProgress,
      });
      task.done({ success: true, file: r.file });
      return { ok: true, file: r.file, dependencies: r.dependencies || [] };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('modrinth:installPack', async (e, filePath) => {
    const task = makeTask('modpack', '安装整合包');
    try {
      const javaPath = await pickJava();
      const r = await modrinth.installModpack({
        filePath,
        gameDir: config.get('gameDir'),
        mirror: config.get('mirror'),
        javaPath,
        manifest: manifestCache ? manifestCache.data : undefined,
        onProgress: task.onProgress,
        onLog: task.log,
      });
      markPackIsolated(r.id);
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('modrinth:installPackProject', async (e, payload) => {
    const task = makeTask('modpack', `安装整合包 ${payload.title || ''}`.trim());
    try {
      const javaPath = await pickJava();
      const r = await modrinth.installPackProject({
        ...payload,
        gameDir: config.get('gameDir'),
        mirror: config.get('mirror'),
        javaPath,
        manifest: manifestCache ? manifestCache.data : undefined,
        onProgress: task.onProgress,
        onLog: task.log,
      });
      markPackIsolated(r.id);
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('versions:exportPack', async (e, id, name) => {
    try {
      return packexport.exportPack({ gameDir: config.get('gameDir'), versionId: id || config.get('version'), name });
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('update:check', async () => {
    try {
      return {
        ok: true,
        ...(await updater.check(config.get('updateManifestUrl') || updater.DEFAULT_MANIFEST_URL, app.getVersion())),
      };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('update:download', async (e, info) => {
    const task = makeTask('update', `下载启动器 ${info && info.version ? info.version : ''}`.trim());
    try {
      const dir = path.join(config.root, 'updates');
      const r = await updater.downloadUpdate(info, dir, (current, total) =>
        task.onProgress({ current, total, detail: '正在下载启动器更新包' })
      );
      task.done({ success: true });
      return { ok: true, file: r.file, size: r.size };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('update:install', async (e, info) => {
    const task = makeTask('update', `安装启动器 ${info && info.version ? info.version : ''}`.trim());
    try {
      const r = await updater.installUpdate(info, {
        downloadDir: path.join(config.root, 'updates'),
        appDir: path.dirname(process.execPath),
        exePath: process.execPath,
        parentPid: process.pid,
        isPackaged: app.isPackaged,
        onProgress: (current, total) =>
          task.onProgress({ current, total, detail: '正在下载并准备更新包' }),
      });
      task.done({ success: true });
      // 先让 IPC 应答回到界面，再退出让 PowerShell 替换文件
      setTimeout(() => app.quit(), 900);
      return { ok: true, ...r };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('update:openDir', async () => {
    const dir = path.join(config.root, 'updates');
    await fsp.mkdir(dir, { recursive: true });
    const err = await shell.openPath(dir);
    if (err) throw new Error(err);
    return { ok: true };
  });

  ipcMain.handle('ai:chat', async (e, payload) => {
    try {
      if (config.get('aiEnabled') === false) throw new Error('在线 AI 已在设置中关闭');
      const r = await ai.chat({
        baseUrl: config.get('aiBaseUrl'),
        apiKey: config.get('aiApiKey'),
        model: config.get('aiModel'),
        messages: payload && payload.messages,
        context: payload && payload.context,
        temperature: config.get('aiTemperature'),
      });
      return { ok: true, ...r };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('ai:chatStream', async (event, payload) => {
    const id = String((payload && payload.id) || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const send = (data) => {
      try {
        if (!event.sender.isDestroyed()) event.sender.send('ai:stream', { id, ...data });
      } catch {}
    };
    try {
      if (config.get('aiEnabled') === false) throw new Error('在线 AI 已在设置中关闭');
      const r = await ai.chatStream({
        baseUrl: config.get('aiBaseUrl'),
        apiKey: config.get('aiApiKey'),
        model: config.get('aiModel'),
        messages: payload && payload.messages,
        context: payload && payload.context,
        temperature: config.get('aiTemperature'),
        onDelta: (delta) => send({ delta }),
      });
      send({ done: true, ok: true, text: r.text, model: r.model });
      return { ok: true, done: true, ...r };
    } catch (err) {
      const error = String(err.message || err);
      send({ done: true, ok: false, error });
      return { ok: false, done: true, error };
    }
  });
  ipcMain.handle('ai:models', async () => {
    try {
      const models = await ai.listModels({
        baseUrl: config.get('aiBaseUrl'),
        apiKey: config.get('aiApiKey'),
      });
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('ai:test', async () => {
    try {
      const r = await ai.test({
        baseUrl: config.get('aiBaseUrl'),
        apiKey: config.get('aiApiKey'),
        model: config.get('aiModel'),
      });
      return { ok: true, ...r };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('optifine:list', async (e, mcVersion) => {
    try {
      return { ok: true, versions: await optifine.listVersions(mcVersion || '') };
    } catch (err) {
      return { ok: false, error: String(err.message || err), versions: [] };
    }
  });
  ipcMain.handle('optifine:install', async (e, payload) => {
    const task = makeTask('game', `安装 OptiFine ${payload.edition || ''}`.trim());
    try {
      const pick = await java.pickJavaFor(payload.mcVersion, config.get('gameDir'), '', config.root);
      const javaPath = pick.java ? pick.java.path : 'java';
      const r = await optifine.installOptiFine({
        ...payload,
        gameDir: config.get('gameDir'),
        mirror: config.get('mirror'),
        manifest: manifestCache ? manifestCache.data : undefined,
        javaPath,
        javaMajor: pick.java ? pick.java.major : 8,
        onProgress: task.onProgress,
        onLog: task.log,
      });
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('quilt:list', async (e, gameVersion) => {
    try {
      return { ok: true, versions: await quilt.listLoaders(gameVersion) };
    } catch (err) {
      return { ok: false, error: String(err.message || err), versions: [] };
    }
  });
  ipcMain.handle('quilt:install', async (e, payload) => {
    const task = makeTask('game', `安装 Quilt ${payload.loaderVersion || ''}`.trim());
    try {
      const r = await quilt.installQuilt({
        ...payload,
        gameDir: config.get('gameDir'),
        mirror: config.get('mirror'),
        manifest: manifestCache ? manifestCache.data : undefined,
        onProgress: task.onProgress,
      });
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('curseforge:search', async (e, opts) => {
    try {
      return await curseforge.search({ ...(opts || {}), key: config.get('curseForgeApiKey') });
    } catch (err) {
      return { ok: false, error: String(err.message || err), hits: [] };
    }
  });
  ipcMain.handle('curseforge:install', async (e, payload) => {
    const task = makeTask('mod', `下载 ${payload.title || 'CurseForge Mod'}`);
    try {
      const targetVersion = payload.versionId || config.get('version');
      const r = await curseforge.installProject({
        ...payload,
        key: config.get('curseForgeApiKey'),
        gameDir: config.get('gameDir'),
        versionId: targetVersion,
        isolation: effectiveLaunch(targetVersion).isolation,
        onProgress: task.onProgress,
        onLog: task.log,
      });
      task.done({ success: true, file: r.file });
      return { ok: true, file: r.file, dependencies: r.dependencies || [] };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('curseforge:installPack', async (e, filePath) => {
    const task = makeTask('modpack', '安装 CurseForge 整合包');
    try {
      const javaPath = await pickJava();
      const r = await curseforge.installPack({
        key: config.get('curseForgeApiKey'),
        filePath,
        gameDir: config.get('gameDir'),
        mirror: config.get('mirror'),
        javaPath,
        manifest: manifestCache ? manifestCache.data : undefined,
        onProgress: task.onProgress,
        onLog: task.log,
      });
      markPackIsolated(r.id);
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('curseforge:installPackProject', async (e, payload) => {
    const task = makeTask('modpack', `安装 CurseForge 整合包 ${payload.title || ''}`.trim());
    try {
      const javaPath = await pickJava();
      const r = await curseforge.installPackProject({
        ...payload,
        key: config.get('curseForgeApiKey'),
        gameDir: config.get('gameDir'),
        mirror: config.get('mirror'),
        javaPath,
        manifest: manifestCache ? manifestCache.data : undefined,
        onProgress: task.onProgress,
        onLog: task.log,
      });
      markPackIsolated(r.id);
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('install:pack', async (e, filePath) => {
    const task = makeTask('modpack', '安装整合包');
    try {
      const zip = new AdmZip(filePath);
      const isCurse = !!zip.getEntry('manifest.json');
      const javaPath = await pickJava();
      const common = {
        filePath,
        gameDir: config.get('gameDir'),
        mirror: config.get('mirror'),
        javaPath,
        manifest: manifestCache ? manifestCache.data : undefined,
        onProgress: task.onProgress,
        onLog: task.log,
      };
      const r = isCurse
        ? await curseforge.installPack({ ...common, key: config.get('curseForgeApiKey') })
        : await modrinth.installModpack(common);
      markPackIsolated(r.id);
      task.done({ success: true, id: r.id });
      return { ok: true, id: r.id, source: isCurse ? 'curseforge' : 'modrinth' };
    } catch (err) {
      task.done({ success: false, error: String(err.message || err) });
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('pack:choose', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: '整合包', extensions: ['mrpack', 'zip'] }],
    });
    return r.canceled ? '' : r.filePaths[0];
  });

  // —— 联机 ——
  ipcMain.handle('lan:start', async () => {
    if (lanScanner) return { ok: true };
    lanScanner = startLanScan((server) => send('lan:server', server));
    return { ok: true };
  });
  ipcMain.handle('lan:stop', () => {
    if (lanScanner) {
      lanScanner.close();
      lanScanner = null;
    }
    return { ok: true };
  });

  // —— 其他 ——
  ipcMain.handle('open:external', (e, url) => shell.openExternal(url));
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    home: app.getPath('home'),
    userData: app.getPath('userData'),
    totalMem: Math.round(require('os').totalmem() / 1024 / 1024),
    freeMem: Math.round(require('os').freemem() / 1024 / 1024),
  }));
  ipcMain.handle('news:get', () => NEWS);
}

/** 选一个可用于运行 installer / 启动游戏的 Java */
async function pickJava() {
  const set = config.get('javaPath');
  if (set) {
    const info = await probeJava(set);
    if (info) return set;
  }
  const list = await detectJavaList([]);
  if (list.length) return list[0].path; // 已按 major 降序，优先高版本
  return 'java';
}

/** 整合包强制版本隔离，否则下载到版本目录的 Mod 不会被加载 */
function markPackIsolated(id) {
  const map = config.get('versionSettings') || {};
  map[id] = { ...(map[id] || {}), isolation: 'on' };
  config.set({ versionSettings: map });
}

async function ensureAccountToken(acc) {
  if (!acc || acc.type !== 'msa') return acc;
  const expiresAt = Number(acc.expiresAt || 0);
  if (expiresAt && Date.now() < expiresAt - 5 * 60 * 1000) return acc;
  if (!acc.msRefreshToken) {
    if (!expiresAt || Date.now() >= expiresAt) throw new Error('微软登录已过期，请重新登录正版账号');
    return acc;
  }
  const fresh = await accounts.refreshMicrosoft(config.get('msClientId'), acc.msRefreshToken);
  const list = (config.get('accounts') || []).map((a) => (a.id === acc.id ? fresh : a));
  config.set({ accounts: list, account: fresh.id });
  return fresh;
}

function currentAccount() {
  const list = config.get('accounts') || [];
  return list.find((a) => a.id === config.get('account')) || list[0] || null;
}

function touchVersion(id) {
  const list = (config.get('versionList') || []).filter((v) => v.id !== id);
  list.unshift({ id, at: Date.now() });
  return list.slice(0, 20);
}

const NEWS = [
  {
    id: 'n1',
    title: '内测提示',
    tag: '公告',
    date: '2026-11-21',
    body: '由于 StartPro 还在内测中，不少功能还没做完，所以请暂时不要发给其他人或者用于制作整合包哦！如果有什么建议，或者发现了 Bug，可以在「更多 → 反馈」中提交，也可以直接关闭右上角提示。',
  },
  {
    id: 'n2',
    title: '下载源可在设置中切换',
    tag: '提示',
    date: '2026-11-21',
    body: '若官方源速度较慢，可在 设置 → 启动器 → 下载源 切换为 BMCLAPI 镜像，依赖库与资源文件都会自动走镜像。',
  },
  {
    id: 'n3',
    title: '联机页支持局域网自动发现',
    tag: '功能',
    date: '2026-11-21',
    body: '在游戏中对局域网开放后，本启动器的「联机」页会自动监听到房间广播，双击即可复制地址进入。',
  },
];

process.on('uncaughtException', (err) => {
  console.error('[StartPro] uncaughtException', err);
});

function migrateLegacyData() {
  try {
    const target = app.getPath('userData');
    const appData = app.getPath('appData');
    const newConf = path.join(target, 'config.json');
    if (fs.existsSync(newConf)) return;
    const roots = ['Pro Start', 'pro-start', 'StartPro', 'pcl2-remake'];
    for (const name of roots) {
      const legacy = path.join(appData, name);
      if (legacy === target) continue;
      const oldConf = path.join(legacy, 'config.json');
      if (!fs.existsSync(oldConf)) continue;
      fs.mkdirSync(target, { recursive: true });
      const parsed = JSON.parse(fs.readFileSync(oldConf, 'utf8'));
      for (const k of ['backgroundImage', 'backgroundMusic', 'skinFile']) {
        if (typeof parsed[k] === 'string' && parsed[k].startsWith(legacy + path.sep)) {
          parsed[k] = path.join(target, parsed[k].slice(legacy.length + 1));
        }
      }
      if (parsed.customInfo === 'Pro Start' || parsed.customInfo === 'PS') parsed.customInfo = 'StartPro';
      fs.writeFileSync(newConf, JSON.stringify(parsed, null, 2), 'utf8');
      for (const sub of ['background', 'music', 'skin']) {
        const src = path.join(legacy, sub);
        const dst = path.join(target, sub);
        if (fs.existsSync(src) && !fs.existsSync(dst)) {
          fs.cpSync(src, dst, { recursive: true });
        }
      }
      break;
    }
  } catch (e) {
    console.error('[StartPro] 迁移旧配置失败', e);
  }
}

function ensureDesktopShortcut() {
  if (process.platform !== 'win32') return;
  try {
    const desktop = app.getPath('desktop');
    const target = app.isPackaged ? process.execPath : path.join(__dirname, 'start.bat');
    const icon = app.isPackaged ? process.execPath : path.join(__dirname, 'renderer', 'assets', 'icon.ico');
    const work = app.isPackaged ? path.dirname(process.execPath) : __dirname;
    const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
    const script = `$ErrorActionPreference = 'SilentlyContinue'
$desktop = ${q(desktop)}
$target = ${q(target)}
$icon = ${q(icon)}
$work = ${q(work)}
foreach ($name in @('Pro Start.lnk', 'StartPro.lnk')) {
  $old = Join-Path $desktop $name
  if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force }
}
$path = Join-Path $desktop 'StartPro Launcher.lnk'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($path)
$lnk.TargetPath = $target
$lnk.WorkingDirectory = $work
$lnk.Description = 'StartPro Launcher (SPL) - Minecraft Launcher'
$lnk.IconLocation = "$icon,0"
$lnk.WindowStyle = 1
$lnk.Save()
`;
    const scriptPath = path.join(app.getPath('userData'), 'create-shortcut.ps1');
    fs.writeFileSync(scriptPath, script, 'utf8');
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true }, () => {});
  } catch (e) {
    console.error('[StartPro] 创建桌面快捷方式失败', e);
  }
}

app.whenReady().then(() => {
  migrateLegacyData();
  config = new Config(app.getPath('userData'));
  // 首次启动不接管已有的 .minecraft，使用独立的空游戏目录，
  // 避免新安装的启动器一打开就显示一堆历史版本。
  // 对从旧版本升级、但还没有选择过版本的配置，也做一次同样的迁移；
  // 已经选过版本的配置保持原游戏目录，避免影响现有存档。
  const defaultDir = path.join(os.homedir(), '.minecraft');
  const needsFreshDir = config.isNew || (!config.get('freshGameDirMigrated') && !config.get('version'));
  if (needsFreshDir && path.resolve(config.get('gameDir')) === path.resolve(defaultDir)) {
    const freshDir = path.join(app.getPath('userData'), 'game');
    fs.mkdirSync(freshDir, { recursive: true });
    config.set({ gameDir: freshDir, freshGameDirMigrated: true });
  } else if (config.get('freshGameDirMigrated') === undefined) {
    config.set({ freshGameDirMigrated: true });
  }
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (lanScanner) lanScanner.close();
  if (process.platform !== 'darwin') app.quit();
});
