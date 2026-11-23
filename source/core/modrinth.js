'use strict';
/**
 * Modrinth 开放 API：搜索 Mod / 整合包，下载文件，安装 .mrpack 整合包
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { fetchJson, downloadFile, pool } = require('./net');
const { installVersion } = require('./install');
const { installQuilt } = require('./quilt');
const { versionDir, listLocalVersions, versionGameDir } = require('./version');
const { installFabric } = require('./fabric');
const { installForge, installNeoForge } = require('./forge');

const API = 'https://api.modrinth.com/v2';
const UA = 'StartPro/1.2.1';

async function api(pathname) {
  const res = await fetch(`${API}${pathname}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Modrinth HTTP ${res.status}`);
  return res.json();
}

/** 防止整合包里的 ../ 路径写出版本目录 */
function safeJoin(base, rel) {
  const root = path.resolve(base) + path.sep;
  const dest = path.resolve(base, rel);
  if (!dest.startsWith(root)) throw new Error(`整合包包含非法路径：${rel}`);
  return dest;
}

function newestFirst(list) {
  return list.slice().sort((a, b) => {
    const ta = Date.parse(a.date_published || a.date_modified || 0) || 0;
    const tb = Date.parse(b.date_published || b.date_modified || 0) || 0;
    return tb - ta;
  });
}

/**
 * 搜索项目
 * @param {object} opts { query, type: 'mod'|'modpack'|'resourcepack'|'shader', gameVersion, loader, limit, offset, sort }
 */
async function search({ query = '', type = 'mod', gameVersion = '', loader = '', limit = 12, offset = 0, sort = 'relevance' } = {}) {
  const facets = [[`project_type:${type}`]];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader) facets.push([`categories:${loader}`]);
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    offset: String(offset),
    index: sort,
    facets: JSON.stringify(facets),
  });
  const data = await api(`/search?${params}`);
  return {
    total: data.total_hits,
    hits: (data.hits || []).map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads,
      follows: h.follows,
      icon: h.icon_url,
      categories: h.categories,
      versions: h.versions,
      type: h.project_type,
      updated: h.date_modified,
    })),
  };
}

async function getProject(idOrSlug) {
  return api(`/project/${idOrSlug}`);
}

/**
 * 取项目的文件版本
 */
async function getVersions(idOrSlug, { gameVersion = '', loader = '' } = {}) {
  const list = await api(`/project/${idOrSlug}/version`);
  return newestFirst((list || []).filter((v) => {
    if (gameVersion && !(v.game_versions || []).includes(gameVersion)) return false;
    if (loader && !(v.loaders || []).map((l) => l.toLowerCase()).includes(loader.toLowerCase())) return false;
    return true;
  }));
}

function pickPrimaryFile(version) {
  if (!version || !version.files) return null;
  return version.files.find((f) => f.primary) || version.files[0];
}

/** 优先正式版，避免默认选中 beta/alpha */
function preferredVersion(list) {
  return list.find((v) => v.version_type === 'release') || list[0];
}

/** 递归安装 Mod 的必需前置（Modrinth dependencies.required） */
async function installRequiredDependencies(version, ctx) {
  if (!version || ctx.depth >= 4) return [];
  const required = (version.dependencies || []).filter((d) => d.dependency_type === 'required');
  const installed = [];
  for (const dep of required) {
    const key = dep.version_id || dep.project_id;
    if (!key || ctx.visited.has(key)) continue;
    ctx.visited.add(key);
    try {
      let depVersion = null;
      if (dep.version_id) depVersion = await api(`/version/${dep.version_id}`);
      if (!depVersion && dep.project_id) {
        const compatible = await getVersions(dep.project_id, { gameVersion: ctx.gameVersion, loader: ctx.loader });
        depVersion = preferredVersion(compatible);
        if (!depVersion) depVersion = preferredVersion(await getVersions(dep.project_id, {}));
      }
      if (!depVersion) continue;
      const file = pickPrimaryFile(depVersion);
      if (!file) continue;
      const dest = safeJoin(ctx.dir, file.filename || 'dependency.jar');
      if (!fs.existsSync(dest)) {
        ctx.onProgress({
          phase: 'dependency',
          title: '安装 Mod 前置',
          detail: `${depVersion.name || depVersion.version_number || '前置'} · ${file.filename}`,
          current: 0,
          total: 1,
        });
        await downloadFile(file.url, dest, {
          sha1: (file.hashes && file.hashes.sha1) || null,
          size: file.size,
        });
      }
      installed.push({
        project_id: dep.project_id || depVersion.project_id || '',
        version_id: depVersion.id,
        name: depVersion.name || depVersion.version_number || file.filename,
        file: file.filename,
      });
      installed.push(...(await installRequiredDependencies(depVersion, { ...ctx, depth: ctx.depth + 1 })));
    } catch (e) {
      throw new Error(`安装前置失败：${e.message || e}`);
    }
  }
  return installed;
}

/**
 * 安装单个项目（Mod / 数据包 / 资源包 / 光影）
 */
async function installProject(opts) {
  const { idOrSlug, gameDir, versionId, gameVersion, loader, kind = 'mod', isolation = true, onProgress = () => {}, visited = new Set() } = opts;
  if (kind === 'modpack') throw new Error('整合包请使用 installPackProject');
  let versions = await getVersions(idOrSlug, { gameVersion, loader });
  // 指定了游戏版本或加载器时，不能悄悄装一个不兼容的文件
  if (!versions.length && (gameVersion || loader)) {
    throw new Error(`没有找到兼容 ${gameVersion || '当前版本'}${loader ? ' / ' + loader : ''} 的文件`);
  }
  if (!versions.length) versions = await getVersions(idOrSlug, {});
  if (!versions.length) throw new Error('该项目没有可用文件');
  const chosen = preferredVersion(versions);
  const file = pickPrimaryFile(chosen);
  if (!file) throw new Error('找不到下载文件');

  // 资源包 / 光影 / 数据包同样跟随版本隔离目录，否则开启隔离后游戏读不到
  const runDir = versionId ? versionGameDir(gameDir, versionId, isolation) : gameDir;
  let dir;
  if (kind === 'resourcepack') dir = path.join(runDir, 'resourcepacks');
  else if (kind === 'shader') dir = path.join(runDir, 'shaderpacks');
  else if (kind === 'datapack') dir = path.join(runDir, 'datapacks');
  else dir = path.join(runDir, 'mods');

  onProgress({ phase: 'download', title: '下载文件', detail: file.filename, current: 0, total: 1 });
  const dest = safeJoin(dir, file.filename || 'download.bin');
  await downloadFile(file.url, dest, {
    sha1: (file.hashes && file.hashes.sha1) || null,
    size: file.size,
  });
  onProgress({ phase: 'download', title: '下载完成', detail: file.filename, current: 1, total: 1 });
  let dependencies = [];
  if (kind === 'mod') {
    visited.add(chosen.id);
    if (chosen.project_id) visited.add(chosen.project_id);
    dependencies = await installRequiredDependencies(chosen, {
      dir,
      gameVersion,
      loader,
      onProgress,
      visited,
      depth: 0,
    });
  }
  return { file: dest, version: chosen.version_number, dependencies };
}

/** 读取 zip 内文件（优先 adm-zip，退回系统 unzip） */
function readZipEntries(zipPath) {
  const AdmZip = tryRequire('adm-zip');
  if (AdmZip) {
    const zip = new AdmZip(zipPath);
    return zip.getEntries().filter((e) => !e.isDirectory).map((e) => ({ name: e.entryName, data: e.getData() }));
  }
  throw new Error('安装整合包需要 adm-zip 依赖，请先执行 npm install');
}

function tryRequire(n) {
  try {
    return require(n);
  } catch {
    return null;
  }
}

/**
 * 安装 Modrinth 整合包 (.mrpack)
 */
async function installModpack(opts) {
  const {
    filePath,
    gameDir,
    onProgress = () => {},
    onLog = () => {},
    mirror = 'official',
    javaPath = 'java',
    manifest,
  } = opts;
  const AdmZip = tryRequire('adm-zip');
  if (!AdmZip) throw new Error('缺少 adm-zip 依赖（npm install）');

  let zip;
  let index;
  try {
    zip = new AdmZip(filePath);
    const idxEntry = zip.getEntry('modrinth.index.json');
    if (!idxEntry) throw new Error('不是有效的 .mrpack 整合包');
    index = JSON.parse(idxEntry.getData().toString('utf8'));
  } catch (e) {
    throw new Error(`读取整合包失败：${e.message || e}`);
  }

  const rawName = (index.name || path.basename(filePath, path.extname(filePath)))
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '')
    .trim()
    .replace(/[. ]+$/g, '');
  const name = rawName || 'Modrinth Pack';
  const deps = index.dependencies || {};
  const baseVersion = deps.minecraft;
  if (!baseVersion) throw new Error('整合包没有声明 Minecraft 版本');
  const fabricLoader = deps['fabric-loader'];
  const forgeVersion = deps.forge;
  const neoForgeVersion = deps.neoforge || deps['neo-forge'];
  const quiltLoader = deps['quilt-loader'];

  onProgress({ phase: 'base', title: '准备基础版本', detail: baseVersion, current: 0, total: 1 });
  const installed = listLocalVersions(gameDir).map((v) => v.id);
  if (!installed.includes(baseVersion)) {
    await installVersion(baseVersion, { gameDir, mirror, manifest, onProgress });
  }

  // 先安装加载器，再让整合包版本继承它，否则 Forge/NeoForge 的 Mod 不会被加载
  let parentId = baseVersion;
  let loaderName = '';
  if (fabricLoader) {
    const r = await installFabric({
      gameVersion: baseVersion,
      loaderVersion: fabricLoader,
      gameDir,
      mirror,
      installBase: false,
      onProgress,
    });
    parentId = r.id;
    loaderName = `Fabric ${fabricLoader}`;
  } else if (forgeVersion) {
    const r = await installForge({
      mcVersion: baseVersion,
      forgeVersion,
      gameDir,
      mirror,
      manifest,
      javaPath,
      installBase: false,
      onProgress,
      onLog,
    });
    parentId = r.id;
    loaderName = `Forge ${forgeVersion}`;
  } else if (neoForgeVersion) {
    const r = await installNeoForge({
      mcVersion: baseVersion,
      neoVersion: neoForgeVersion,
      gameDir,
      mirror,
      manifest,
      javaPath,
      installBase: false,
      onProgress,
      onLog,
    });
    parentId = r.id;
    loaderName = `NeoForge ${neoForgeVersion}`;
  } else if (quiltLoader) {
    const r = await installQuilt({
      gameVersion: baseVersion,
      loaderVersion: quiltLoader,
      gameDir,
      mirror,
      manifest,
      installBase: false,
      onProgress,
    });
    parentId = r.id;
    loaderName = `Quilt ${quiltLoader}`;
  }

  let packVersionId = name;
  if (!packVersionId || packVersionId === '.' || packVersionId === '..') packVersionId = 'Modrinth Pack';
  if (packVersionId === baseVersion || packVersionId === parentId) packVersionId = `${packVersionId} (整合包)`;
  const vdir = versionDir(gameDir, packVersionId);
  if (fs.existsSync(vdir)) throw new Error(`整合包版本已存在：${packVersionId}，请先改名或删除旧版本`);
  const parentJsonPath = path.join(versionDir(gameDir, parentId), `${parentId}.json`);
  if (!fs.existsSync(parentJsonPath)) throw new Error(`加载器版本信息缺失：${parentId}`);
  // 只写差异字段：完整复制父 JSON 会让 mergeVersionJson 把 arguments / libraries 再拼一遍
  const packJson = {
    id: packVersionId,
    inheritsFrom: parentId,
    type: 'modpack',
  };
  await fsp.mkdir(vdir, { recursive: true });
  try {
  await fsp.writeFile(path.join(vdir, `${packVersionId}.json`), JSON.stringify(packJson, null, 4), 'utf8');

  // 复制客户端 jar，供版本列表与离线检查使用；启动时也会沿 inheritsFrom 回溯
  const jarCandidates = [
    path.join(versionDir(gameDir, parentId), `${parentId}.jar`),
    path.join(versionDir(gameDir, baseVersion), `${baseVersion}.jar`),
  ];
  for (const jar of jarCandidates) {
    if (fs.existsSync(jar)) {
      await fsp.copyFile(jar, path.join(vdir, `${packVersionId}.jar`));
      break;
    }
  }

  // 下载 files 列表
  const files = (index.files || []).filter((f) => !(f.env && f.env.client === 'unsupported'));
  onProgress({ phase: 'mods', title: '下载整合包内容', detail: `0/${files.length}`, current: 0, total: files.length });
  await pool(
    files,
    12,
    async (f) => {
      if (!f.path) throw new Error('整合包文件缺少路径');
      const url = f.downloads && f.downloads[0];
      if (!url) throw new Error(`整合包文件没有下载地址：${f.path}`);
      const dest = safeJoin(vdir, f.path);
      await downloadFile(url, dest, { sha1: (f.hashes && f.hashes.sha1) || null });
    },
    (done, total) =>
      onProgress({ phase: 'mods', title: '下载整合包内容', detail: `${done}/${total}`, current: done, total })
  );

  // 覆盖文件（配置、默认资源包等）
  const overrides = zip.getEntries().filter((e) => !e.isDirectory && /^(overrides|client-overrides)\//.test(e.entryName));
  onProgress({ phase: 'overrides', title: '写入整合包配置', detail: `${overrides.length} 个文件`, current: 0, total: overrides.length });
  for (const e of overrides) {
    const rel = e.entryName.replace(/^(overrides|client-overrides)\//, '');
    if (!rel) continue;
    // 不允许覆盖版本元数据本身
    if (rel === `${packVersionId}.json` || rel === `${packVersionId}.jar` || rel === '.pcl2_install.json') {
      throw new Error(`整合包包含非法覆盖路径：${rel}`);
    }
    const dest = safeJoin(vdir, rel);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(dest, e.getData());
  }

  await fsp.writeFile(
    path.join(vdir, '.pcl2_install.json'),
    JSON.stringify(
      { installedAt: new Date().toISOString(), source: 'modrinth-pack', baseVersion, parentId, loader: loaderName },
      null,
      2
    )
  );

  onProgress({ phase: 'finish', title: '整合包安装完成', detail: name, current: 1, total: 1 });
  return { id: packVersionId, name, baseVersion, fabricLoader: fabricLoader || '', forge: forgeVersion || '', neoForge: neoForgeVersion || '', parentId };
  } catch (e) {
    await fsp.rm(vdir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

/** 从 Modrinth 项目直接安装一个整合包 */
async function installPackProject(opts) {
  const { idOrSlug, gameDir, mirror = 'official', javaPath = 'java', manifest, onProgress = () => {}, onLog = () => {} } = opts;
  const versions = await getVersions(idOrSlug, {});
  if (!versions.length) throw new Error('该项目没有可用整合包文件');
  const chosen = preferredVersion(versions);
  const file = pickPrimaryFile(chosen);
  if (!file || !file.url) throw new Error('找不到整合包下载文件');
  if (!/\.(mrpack|zip)$/i.test(file.filename || '')) throw new Error('该项目的主文件不是 .mrpack 整合包');

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'startpro-pack-'));
  const tmpFile = path.join(tmpDir, file.filename.replace(/[\\/]/g, '_'));
  try {
    await downloadFile(file.url, tmpFile, {
      sha1: (file.hashes && file.hashes.sha1) || null,
      size: file.size || 0,
    });
    return await installModpack({
      filePath: tmpFile,
      gameDir,
      mirror,
      javaPath,
      manifest,
      onProgress,
      onLog,
    });
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { search, getProject, getVersions, installProject, installModpack, installPackProject, pickPrimaryFile };
