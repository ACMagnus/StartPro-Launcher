'use strict';
/**
 * Forge / NeoForge 安装：下载官方 installer.jar 并以 --installClient 方式运行，
 * 结束后把生成目录重命名成 PCL2 风格（1.20.1-Forge 47.4.29 / 1.21.1-NeoForge 21.1.209）。
 *
 * 说明：installer 需要可用的 Java（1.12.2 用 Java 8，1.17+ 用 Java 17，1.20.5+ 用 Java 21）。
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { fetchJson, fetchText, downloadFile } = require('./net');
const { versionDir, listLocalVersions } = require('./version');
const { installVersion } = require('./install');

const FORGE_META = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
const FORGE_PROMO = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const FORGE_MIRROR_LIST = 'https://bmclapi2.bangbang93.com/forge/minecraft';
const FORGE_MIRROR_MAVEN = 'https://bmclapi2.bangbang93.com/maven/net/minecraftforge/forge';
const NEO_META = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
const NEO_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';
const NEO_MIRROR_LIST = 'https://bmclapi2.bangbang93.com/neoforge/list';
const NEO_MIRROR_MAVEN = 'https://bmclapi2.bangbang93.com/maven/net/neoforged/neoforge';

const cache = new Map();

/** 解析 maven-metadata.xml 里的 <version> 列表 */
function parseMavenVersions(xml) {
  const out = [];
  const re = /<version>([^<]+)<\/version>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

/** 按数字段比较版本号，避免 21.2.1 排在 21.1.267 前面 */
function compareVersion(a, b) {
  const pa = String(a || '').split(/[.-]/);
  const pb = String(b || '').split(/[.-]/);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = Number(pa[i] || 0);
    const y = Number(pb[i] || 0);
    if (x !== y) return x - y;
  }
  return 0;
}

function sortDesc(list, key) {
  return list.sort((a, b) => {
    if (key === 'build') {
      const d = (Number(b.build) || 0) - (Number(a.build) || 0);
      if (d) return d;
    }
    return compareVersion(b.version, a.version);
  });
}

async function forgeListFromMirror(mcVersion) {
  const data = await fetchJson(`${FORGE_MIRROR_LIST}/${encodeURIComponent(mcVersion)}`, { timeout: 15000, retries: 2 });
  if (!Array.isArray(data)) throw new Error('BMCLAPI Forge 列表格式异常');
  const byVersion = new Map();
  for (const x of data) {
    if (!x || !x.version || byVersion.has(x.version)) continue;
    byVersion.set(x.version, { version: x.version, build: Number(x.build) || 0, recommended: false, latest: false });
  }
  const list = [...byVersion.values()];
  if (!list.length) throw new Error(`BMCLAPI 没有 ${mcVersion} 的 Forge 版本`);
  return sortDesc(list, 'build');
}

async function forgeListFromOfficial(mcVersion) {
  const xml = await fetchText(FORGE_META, { timeout: 20000, retries: 2 });
  const all = parseMavenVersions(xml)
    .filter((v) => v.startsWith(`${mcVersion}-`))
    .map((v) => ({ version: v.slice(mcVersion.length + 1), recommended: false, latest: false }));
  if (!all.length) throw new Error(`官方源没有 ${mcVersion} 的 Forge 版本`);
  return sortDesc(all, 'version');
}

/** 列出某 Minecraft 版本可用的 Forge 版本（序号大的在前） */
async function listForgeVersions(mcVersion) {
  if (!mcVersion) throw new Error('缺少游戏版本');
  const key = `forge:${mcVersion}`;
  if (cache.has(key)) return cache.get(key);

  let list = null;
  let firstError = null;
  try {
    list = await forgeListFromMirror(mcVersion);
  } catch (e) {
    firstError = e;
  }
  if (!list) {
    try {
      list = await forgeListFromOfficial(mcVersion);
    } catch (e) {
      throw new Error(`Forge 列表获取失败：${firstError ? firstError.message : ''}${firstError && e ? '；' : ''}${e.message}`);
    }
  }

  // 推荐/最新标记来自官方 promotions（文件很小，且可单独失败）
  try {
    const promo = await fetchJson(FORGE_PROMO, { timeout: 10000, retries: 2 });
    const promos = promo.promos || {};
    const latest = promos[`${mcVersion}-latest`] || '';
    const recommended = promos[`${mcVersion}-recommended`] || '';
    for (const item of list) {
      item.latest = item.version === latest;
      item.recommended = item.version === recommended;
    }
  } catch {}

  cache.set(key, list);
  return list;
}

/** NeoForge 版本号与 MC 版本对应关系（官方兜底用） */
function neoPrefixForMc(mcVersion) {
  const [a, b, c] = String(mcVersion).split('.');
  if (Number(a) !== 1) return '';
  const minor = Number(b);
  const patch = Number(c || 0);
  if (minor === 20 && patch === 1) return '47.1.'; // NeoForge 1.20.1 沿用 Forge 47.1.x 编号
  return `${minor}.${patch}.`;
}

async function neoListFromMirror(mcVersion) {
  const data = await fetchJson(`${NEO_MIRROR_LIST}/${encodeURIComponent(mcVersion)}`, { timeout: 15000, retries: 2 });
  if (!Array.isArray(data)) throw new Error('BMCLAPI NeoForge 列表格式异常');
  const byVersion = new Map();
  for (const x of data) {
    if (!x || !x.version || !x.installerPath) continue;
    // 1.20.1 的过渡版本在镜像里叫 1.20.1-47.1.105，界面统一显示 47.1.105
    let version = String(x.version);
    if (version.startsWith(`${mcVersion}-`)) version = version.slice(mcVersion.length + 1);
    if (!/^\d+(\.\d+)+$/.test(version) || byVersion.has(version)) continue;
    byVersion.set(version, { version, installerPath: x.installerPath });
  }
  const list = [...byVersion.values()];
  if (!list.length) throw new Error(`BMCLAPI 没有 ${mcVersion} 的 NeoForge 版本`);
  return sortDesc(list, 'version');
}

async function neoListFromOfficial(mcVersion) {
  const xml = await fetchText(NEO_META, { timeout: 20000, retries: 2 });
  const prefix = neoPrefixForMc(mcVersion);
  const list = parseMavenVersions(xml)
    .filter((v) => (prefix ? v.startsWith(prefix) : true))
    .map((v) => ({ version: v }));
  if (!list.length) throw new Error(`官方源没有 ${mcVersion} 的 NeoForge 版本`);
  return sortDesc(list, 'version');
}

async function listNeoForgeVersions(mcVersion) {
  if (!mcVersion) throw new Error('缺少游戏版本');
  const key = `neo:${mcVersion}`;
  if (cache.has(key)) return cache.get(key);

  let list = null;
  let firstError = null;
  try {
    list = await neoListFromMirror(mcVersion);
  } catch (e) {
    firstError = e;
  }
  if (!list) {
    try {
      list = await neoListFromOfficial(mcVersion);
    } catch (e) {
      throw new Error(`NeoForge 列表获取失败：${firstError ? firstError.message : ''}${firstError && e ? '；' : ''}${e.message}`);
    }
  }
  cache.set(key, list);
  return list;
}

/** 依次尝试多个下载地址，直到有一个成功 */
async function downloadFirst(urls, dest, retries = 3) {
  let lastErr;
  for (const url of urls) {
    try {
      return await downloadFile(url, dest, { retries });
    } catch (e) {
      lastErr = e;
      await fsp.unlink(dest + '.tmp').catch(() => {});
    }
  }
  throw lastErr || new Error('没有可用的下载地址');
}

/** 安装器要求基础版本已存在，缺失时先装原版 */
async function ensureBase(mcVersion, gameDir, mirror, onProgress, manifest) {
  const installed = listLocalVersions(gameDir).map((v) => v.id);
  if (installed.includes(mcVersion)) return;
  onProgress({ phase: 'base', title: '安装原版', detail: mcVersion, current: 0, total: 1 });
  await installVersion(mcVersion, { gameDir, mirror, manifest, onProgress });
}

async function ensureLauncherProfiles(gameDir) {
  await fsp.mkdir(gameDir, { recursive: true });
  const p = path.join(gameDir, 'launcher_profiles.json');
  if (!fs.existsSync(p)) {
    await fsp.writeFile(
      p,
      JSON.stringify({ profiles: {}, selectedProfile: '', clientToken: '', launcherVersion: { name: 'StartPro Launcher' } }, null, 2),
      'utf8'
    );
  }
}

/** 运行 installer，把输出透传给前端 */
function runInstaller(java, installerJar, gameDir, onLog, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn(java, ['-jar', installerJar, '--installClient', gameDir], {
      cwd: gameDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let lines = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill(); } catch {}
      reject(new Error('安装器运行超时（15 分钟），请检查网络或 Java 版本后重试'));
    }, 15 * 60 * 1000);
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const handle = (buf) => {
      const text = buf.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        lines++;
        if (onLog) onLog(line);
        if (onProgress && (lines === 1 || lines % 50 === 0)) {
          onProgress({ phase: 'installer', title: '运行安装器', detail: line.trim().slice(0, 90), current: lines, total: 0 });
        }
      }
    };
    proc.stdout.on('data', handle);
    proc.stderr.on('data', handle);
    proc.on('error', (e) => finish(reject, new Error(`无法启动 Java：${e.message}`)));
    proc.on('close', (code) => {
      if (code === 0) finish(resolve, { code });
      else finish(reject, new Error(`安装器退出码 ${code}，请检查上方日志（通常是 Java 版本不匹配或网络问题）`));
    });
  });
}

/** 把 installer 生成的版本目录改成 PCL2 风格 */
async function renameInstalled(gameDir, fromId, toId, loaderTag) {
  const from = versionDir(gameDir, fromId);
  const to = versionDir(gameDir, toId);
  if (!fs.existsSync(from)) throw new Error(`安装器没有生成版本目录 ${fromId}`);
  await fsp.mkdir(path.dirname(to), { recursive: true });
  // 不覆盖已有版本：宁可报错，也不能把用户原来的版本目录删掉
  if (fs.existsSync(to)) throw new Error(`版本「${toId}」已存在，请先删除或换一个名称`);
  await fsp.rename(from, to);
  for (const ext of ['json', 'jar']) {
    const src = path.join(to, `${fromId}.${ext}`);
    if (fs.existsSync(src)) await fsp.rename(src, path.join(to, `${toId}.${ext}`));
  }
  const jsonPath = path.join(to, `${toId}.json`);
  if (fs.existsSync(jsonPath)) {
    const json = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
    json.id = toId;
    json.type = loaderTag;
    await fsp.writeFile(jsonPath, JSON.stringify(json, null, 4), 'utf8');
  }
  await fsp.writeFile(
    path.join(to, '.pcl2_install.json'),
    JSON.stringify({ installedAt: new Date().toISOString(), source: loaderTag, originalId: fromId }, null, 2)
  );
  return toId;
}

/**
 * 安装 Forge
 * @param {object} opts { mcVersion, forgeVersion, gameDir, javaPath, onProgress, onLog }
 */
async function installForge(opts) {
  const { mcVersion, forgeVersion, gameDir, javaPath = 'java', mirror = 'official', manifest, installBase = true, name = '', onProgress = () => {}, onLog = () => {} } = opts;
  if (!mcVersion || !forgeVersion) throw new Error('缺少 Forge 版本信息');
  if (installBase) await ensureBase(mcVersion, gameDir, mirror, onProgress, manifest);
  await ensureLauncherProfiles(gameDir);

  const autoTarget = `${mcVersion}-Forge ${forgeVersion}`;
  const targetId = String(name || '').trim() || autoTarget;
  if (targetId === mcVersion) throw new Error('安装后名称不能与原版版本相同');
  if (fs.existsSync(versionDir(gameDir, targetId))) {
    if (targetId === autoTarget) return { id: targetId, baseVersion: mcVersion, reused: true };
    throw new Error(`版本「${targetId}」已存在，请先删除或换一个名称`);
  }

  const file = `forge-${mcVersion}-${forgeVersion}-installer.jar`;
  const urls = [
    `${FORGE_MIRROR_MAVEN}/${mcVersion}-${forgeVersion}/${file}`,
    `${FORGE_MAVEN}/${mcVersion}-${forgeVersion}/${file}`,
  ];
  const tmp = path.join(os.tmpdir(), `pcl2-${file}`);

  onProgress({ phase: 'download', title: '下载 Forge 安装器', detail: file, current: 0, total: 1 });
  await downloadFirst(urls, tmp, 3);
  onProgress({ phase: 'download', title: '下载 Forge 安装器', detail: file, current: 1, total: 1 });

  onProgress({ phase: 'installer', title: '运行 Forge 安装器', detail: '正在下载依赖库…', current: 0, total: 0 });
  await runInstaller(javaPath, tmp, gameDir, onLog, onProgress);
  await fsp.unlink(tmp).catch(() => {});

  const installedId = `${mcVersion}-forge-${forgeVersion}`;
  // 1.13+ installer 可能生成 neoforge/forge 两种命名，做一次兜底探测
  const candidates = [installedId, `${mcVersion}-forge-${forgeVersion}-client`];
  let found = null;
  for (const c of candidates) {
    if (fs.existsSync(versionDir(gameDir, c))) {
      found = c;
      break;
    }
  }
  if (!found) {
    // 扫描目录里最新的 forge 版本目录
    const dir = path.join(gameDir, 'versions');
    if (fs.existsSync(dir)) {
      const hit = fs
        .readdirSync(dir)
        .filter((d) => d.startsWith(`${mcVersion}-forge-`) || d.startsWith(`forge-${mcVersion}-`))
        .sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0];
      if (hit) found = hit;
    }
  }
  if (!found) throw new Error('安装器执行完成，但没有找到生成的 Forge 版本目录');

  const id = await renameInstalled(gameDir, found, targetId, 'forge');
  onProgress({ phase: 'finish', title: 'Forge 安装完成', detail: id, current: 1, total: 1 });
  return { id, baseVersion: mcVersion };
}

/**
 * 安装 NeoForge
 */
async function installNeoForge(opts) {
  const { mcVersion, neoVersion, gameDir, javaPath = 'java', mirror = 'official', manifest, installBase = true, name = '', onProgress = () => {}, onLog = () => {} } = opts;
  if (!mcVersion || !neoVersion) throw new Error('缺少 NeoForge 版本信息');
  if (installBase) await ensureBase(mcVersion, gameDir, mirror, onProgress, manifest);
  await ensureLauncherProfiles(gameDir);

  const autoTarget = `${mcVersion}-NeoForge ${neoVersion}`;
  const targetId = String(name || '').trim() || autoTarget;
  if (targetId === mcVersion) throw new Error('安装后名称不能与原版版本相同');
  if (fs.existsSync(versionDir(gameDir, targetId))) {
    if (targetId === autoTarget) return { id: targetId, baseVersion: mcVersion, reused: true };
    throw new Error(`版本「${targetId}」已存在，请先删除或换一个名称`);
  }

  const file = `neoforge-${neoVersion}-installer.jar`;
  const urls = [];
  // 1.20.1 等过渡版本的真实安装器路径由 BMCLAPI 列表给出
  try {
    const list = await listNeoForgeVersions(mcVersion);
    const item = list.find((v) => v.version === neoVersion);
    if (item && item.installerPath) urls.push(`https://bmclapi2.bangbang93.com${item.installerPath}`);
  } catch {}
  urls.push(`${NEO_MIRROR_MAVEN}/${neoVersion}/${file}`, `${NEO_MAVEN}/${neoVersion}/${file}`);
  const tmp = path.join(os.tmpdir(), `pcl2-${file}`);
  onProgress({ phase: 'download', title: '下载 NeoForge 安装器', detail: file, current: 0, total: 1 });
  await downloadFirst(urls, tmp, 3);
  onProgress({ phase: 'download', title: '下载 NeoForge 安装器', detail: file, current: 1, total: 1 });

  onProgress({ phase: 'installer', title: '运行 NeoForge 安装器', detail: '正在下载依赖库…', current: 0, total: 0 });
  await runInstaller(javaPath, tmp, gameDir, onLog, onProgress);
  await fsp.unlink(tmp).catch(() => {});

  let generated = `neoforge-${neoVersion}`;
  if (!fs.existsSync(versionDir(gameDir, generated))) {
    // 1.20.1 的 NeoForge 安装器会沿用 Forge 命名
    const dir = path.join(gameDir, 'versions');
    const candidates = [];
    if (fs.existsSync(dir)) {
      for (const d of fs.readdirSync(dir)) {
        if (d.startsWith(`${mcVersion}-forge-`) || d.startsWith(`forge-${mcVersion}-`)) {
          candidates.push({ d, mtime: fs.statSync(path.join(dir, d)).mtimeMs });
        }
      }
    }
    candidates.sort((a, b) => b.mtime - a.mtime);
    if (candidates.length) generated = candidates[0].d;
  }
  if (!fs.existsSync(versionDir(gameDir, generated))) {
    throw new Error(`安装器没有生成 NeoForge 版本目录`);
  }
  const id = await renameInstalled(gameDir, generated, targetId, 'neoforge');
  onProgress({ phase: 'finish', title: 'NeoForge 安装完成', detail: id, current: 1, total: 1 });
  return { id, baseVersion: mcVersion };
}

module.exports = { listForgeVersions, listNeoForgeVersions, installForge, installNeoForge };
