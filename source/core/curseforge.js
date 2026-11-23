'use strict';
/**
 * CurseForge 支持：官方 API 需要用户在设置里填自己的 API Key。
 * 搜索 / 单文件安装 / 必需前置 / 整合包 zip 安装都在本地完成。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { fetchJson, downloadFile, pool } = require('./net');
const { installVersion } = require('./install');
const { installFabric } = require('./fabric');
const { installForge, installNeoForge } = require('./forge');
const { installQuilt } = require('./quilt');
const { versionDir } = require('./version');

const API = 'https://api.curseforge.com/v1';
const GAME_ID = 432;
const CLASS_ID = { mod: 6, modpack: 4471, resourcepack: 12 };
const LOADER_ID = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };

function requireKey(key) {
  if (!key || !String(key).trim()) throw new Error('未配置 CurseForge API Key，请到「设置 → 启动器 → CurseForge」填写');
  return String(key).trim();
}

async function cfJson(apiPath, key, params = {}) {
  const url = new URL(API + apiPath);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { 'x-api-key': requireKey(key), Accept: 'application/json', 'User-Agent': 'StartPro/1.2.1' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error('CurseForge API Key 无效或没有权限');
    throw new Error(`CurseForge 请求失败：HTTP ${res.status}`);
  }
  return res.json();
}

function pickIndex(mod, gameVersion, loader) {
  const list = Array.isArray(mod.latestFilesIndexes) ? mod.latestFilesIndexes.slice() : [];
  const loaderId = LOADER_ID[loader] || null;
  const score = (x) => {
    let n = 0;
    if (gameVersion && x.gameVersion === gameVersion) n += 10;
    if (loaderId && x.modLoaderType === loaderId) n += 5;
    return n;
  };
  return list.filter((x) => !gameVersion || x.gameVersion === gameVersion).sort((a, b) => score(b) - score(a))[0] || list[0] || null;
}

function mapHit(mod, gameVersion, loader) {
  const idx = pickIndex(mod, gameVersion, loader);
  return {
    id: String(mod.id),
    slug: mod.slug || String(mod.id),
    fileId: idx ? idx.fileId : null,
    title: mod.name || '未命名项目',
    description: mod.summary || '',
    author: (mod.authors || []).map((a) => a.name).filter(Boolean).join(', '),
    downloads: mod.downloadCount || 0,
    icon: (mod.logo && (mod.logo.thumbnailUrl || mod.logo.url)) || '',
    categories: (mod.categories || []).map((c) => c.name),
    type: idx && idx.modLoaderType === 4 ? 'fabric' : 'mod',
  };
}

async function search(opts) {
  const { key, query = '', kind = 'mod', gameVersion = '', loader = '', pageSize = 18, index = 0 } = opts || {};
  const params = {
    gameId: GAME_ID,
    classId: CLASS_ID[kind] || CLASS_ID.mod,
    searchFilter: query,
    sortField: 2,
    sortOrder: 'desc',
    pageSize,
    index,
  };
  if (gameVersion) params.gameVersion = gameVersion;
  if (kind === 'mod' && LOADER_ID[loader]) params.modLoaderType = LOADER_ID[loader];
  if (!key || !String(key).trim()) {
    return widgetSearch(query, gameVersion, loader, kind);
  }
  const data = await cfJson('/mods/search', key, params);
  return {
    total: (data.pagination && data.pagination.totalCount) || (data.data || []).length,
    hits: (data.data || []).map((m) => mapHit(m, gameVersion, loader)),
  };
}

async function getFile(projectId, fileId, key) {
  const data = await cfJson(`/mods/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`, key);
  if (!data || !data.data) throw new Error('CurseForge 文件不存在或没有权限');
  return data.data;
}

function fileUrl(file) {
  if (file.downloadUrl) return file.downloadUrl;
  const id = String(file.id || '');
  if (id.length < 5) throw new Error('该文件没有开放下载地址，作者可能禁止第三方下载');
  return `https://mediafilez.forgecdn.net/files/${id.slice(0, 4)}/${id.slice(4)}/${encodeURIComponent(file.fileName || 'file.jar')}`;
}

function sha1Of(file) {
  const h = (file.hashes || []).find((x) => x.algo === 1);
  return h ? h.value : null;
}

/* ---------------- 免 Key 模式：公开元数据 + ForgeCDN 直链 ----------------
 * 官方 API 仍优先；没有 Key 时用 CFWidget 的公开项目页读取文件名/文件 ID，
 * 再按 CurseForge 的 CDN 规则直链下载，不需要把任何 Key 放进客户端。
 */
const WIDGET_API = 'https://api.cfwidget.com/minecraft';
const WIDGET_PATH = { mod: 'mc-mods', modpack: 'modpacks', resourcepack: 'texture-packs', shader: 'shaders' };
const widgetCache = new Map();

function parseCurseSlug(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  let slug = raw;
  try {
    if (/^https?:/i.test(raw)) {
      const u = new URL(raw);
      const m = u.pathname.match(/\/mc-mods\/([^/]+)/i);
      if (m) slug = decodeURIComponent(m[1]);
    }
  } catch {}
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) return '';
  return slug;
}

async function widgetProject(idOrSlug, kind = 'mod') {
  const key = String(idOrSlug || '').trim().toLowerCase();
  if (!key) throw new Error('缺少 CurseForge 项目名或 ID');
  const section = WIDGET_PATH[kind] || WIDGET_PATH.mod;
  const cacheKey = `${section}:${key}`;
  const cached = widgetCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  const res = await fetch(`${WIDGET_API}/${section}/${encodeURIComponent(key)}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'StartPro/1.2.1 (+https://github.com)' },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`CurseForge 免 Key 元数据请求失败：HTTP ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`CurseForge 项目数据解析失败：${e.message}`);
  }
  if (!data || !data.id) throw new Error('CurseForge 项目不存在或未公开');
  widgetCache.set(cacheKey, { data, expires: Date.now() + 10 * 60 * 1000 });
  return data;
}

function widgetFileShape(project, f) {
  return {
    id: f.id,
    fileName: f.name,
    fileLength: f.filesize || 0,
    downloadUrl: null,
    hashes: [],
    dependencies: [],
    _widgetProject: project,
  };
}

async function widgetFile(projectId, fileId, kind = 'mod') {
  const project = await widgetProject(projectId, kind);
  const f = (project.files || []).find((x) => String(x.id) === String(fileId));
  if (!f) throw new Error(`CurseForge 项目中找不到文件 ${fileId}`);
  return widgetFileShape(project, f);
}

function widgetMatches(f, gameVersion, loader, kind) {
  const name = String(f.name || '');
  if (kind === 'mod' && !/\.jar$/i.test(name)) return false;
  if (kind !== 'mod' && !/\.zip$/i.test(name)) return false;
  if (/sources|javadoc|dev|api\.jar$/i.test(name)) return false;
  const versions = (f.versions || []).map((v) => String(v).toLowerCase());
  if (/server/i.test(name)) return false;
  if (gameVersion && !versions.includes(String(gameVersion).toLowerCase())) return false;
  if (loader) {
    const want = String(loader).toLowerCase();
    const loaderTokens = { forge: ['forge'], neoforge: ['neoforge'], fabric: ['fabric'], quilt: ['quilt'] };
    const tokens = loaderTokens[want] || [want];
    if (!versions.some((v) => tokens.includes(v))) return false;
  }
  return true;
}

async function widgetLatest(projectId, gameVersion = '', loader = '', kind = 'mod') {
  const project = await widgetProject(projectId, kind);
  const files = (project.files || []).slice().sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
  let f = files.find((x) => widgetMatches(x, gameVersion, loader, kind));
  if (!f && loader) f = files.find((x) => widgetMatches(x, gameVersion, '', kind));
  if (!f) f = files.find((x) => widgetMatches(x, '', '', kind));
  if (!f) throw new Error('该项目没有匹配当前版本/加载器的可下载文件');
  return widgetFileShape(project, f);
}

async function getFileSmart(projectId, fileId, key, gameVersion = '', loader = '', kind = 'mod') {
  if (key && String(key).trim()) return getFile(projectId, fileId, key);
  if (fileId) return widgetFile(projectId, fileId, kind);
  return widgetLatest(projectId, gameVersion, loader, kind);
}

async function widgetSearch(query, gameVersion, loader, kind = 'mod') {
  const slug = parseCurseSlug(query);
  if (!slug) throw new Error('免 Key 模式只支持精确项目名或 CurseForge 项目链接，例如 jei');
  const project = await widgetProject(slug, kind === 'modpack' ? 'modpack' : 'mod');
  let file = null;
  try { file = await widgetLatest(project.id, gameVersion, loader, kind === 'modpack' ? 'modpack' : 'mod'); } catch {}
  return {
    total: 1,
    keyless: true,
    hits: [{
      id: String(project.id),
      slug,
      fileId: file ? String(file.id) : null,
      title: project.title || slug,
      description: project.summary || '',
      author: '',
      downloads: (project.downloads && project.downloads.total) || 0,
      icon: project.thumbnail || '',
      categories: project.categories || [],
      type: kind === 'modpack' ? 'modpack' : loader === 'fabric' ? 'fabric' : 'mod',
      keyless: true,
    }],
  };
}

function safeJoin(root, rel) {
  const dest = path.resolve(root, rel);
  const base = path.resolve(root) + path.sep;
  if (dest !== path.resolve(root) && !dest.startsWith(base)) throw new Error(`整合包包含非法路径：${rel}`);
  return dest;
}

async function downloadCfFile(file, destDir) {
  const dest = safeJoin(destDir, path.basename(file.fileName || `curseforge-${file.id}.jar`));
  await downloadFile(fileUrl(file), dest, { sha1: sha1Of(file), size: file.fileLength || 0 });
  return dest;
}

async function installDependencies(file, destDir, key, ctx, depth = 0, visited = new Set()) {
  if (!key || !String(key).trim()) {
    ctx.onLog('[CurseForge] 免 Key 模式无法自动读取前置依赖；如启动报缺前置，请手动安装对应前置 Mod');
    return [];
  }
  if (depth >= 4) return [];
  const deps = (file.dependencies || []).filter((d) => d.relationType === 3);
  const out = [];
  for (const d of deps) {
    const tag = `${d.modId}:${d.fileId}`;
    if (visited.has(tag)) continue;
    visited.add(tag);
    let dep;
    try {
      dep = await getFile(d.modId, d.fileId, key);
    } catch (e) {
      ctx.onLog(`[CurseForge] 跳过前置 ${tag}：${e.message}`);
      continue;
    }
    try {
      await downloadCfFile(dep, destDir);
      out.push(dep.fileName || `curseforge-${dep.id}.jar`);
      out.push(...(await installDependencies(dep, destDir, key, ctx, depth + 1, visited)));
    } catch (e) {
      throw new Error(`安装前置失败：${dep.fileName || tag}（${e.message}）`);
    }
  }
  return out;
}

async function installProject(opts) {
  const { key, projectId, fileId, kind = 'mod', gameDir, versionId, isolation = true, gameVersion = '', loader = '', title = '', onProgress = () => {}, onLog = () => {} } = opts;
  if (!projectId) throw new Error('缺少 CurseForge 项目 ID');
  const file = await getFileSmart(projectId, fileId, key, gameVersion, loader, kind);

  const base = versionId && isolation ? versionDir(gameDir, versionId) : gameDir;
  const folder = kind === 'resourcepack' ? 'resourcepacks' : kind === 'shader' ? 'shaderpacks' : kind === 'datapack' ? 'datapacks' : 'mods';
  const destDir = path.join(base, folder);
  await fs.promises.mkdir(destDir, { recursive: true });

  onProgress({ phase: 'download', title: '下载 CurseForge 文件', detail: file.fileName || title, current: 0, total: 1 });
  await downloadCfFile(file, destDir);
  onProgress({ phase: 'download', title: '下载 CurseForge 文件', detail: file.fileName || title, current: 1, total: 1 });

  const deps = kind === 'mod' ? await installDependencies(file, destDir, key, { onLog }, 0, new Set()) : [];
  return { file: file.fileName, dependencies: deps, id: projectId, fileId };
}

function loaderSpec(manifest) {
  const list = (manifest.minecraft && manifest.minecraft.modLoaders) || [];
  const primary = list.find((x) => x.primary) || list[0];
  if (!primary) return null;
  const raw = String(primary.id || '');
  const type = raw.split('-')[0].toLowerCase();
  const version = raw.slice(type.length + 1);
  return { type, version, raw };
}

async function installPack(opts) {
  const {
    key,
    filePath,
    name,
    gameDir,
    mirror = 'official',
    javaPath = 'java',
    manifest,
    onProgress = () => {},
    onLog = () => {},
  } = opts;
  if (!filePath || !fs.existsSync(filePath)) throw new Error('整合包文件不存在');
  const zip = new AdmZip(filePath);
  const entry = zip.getEntry('manifest.json');
  if (!entry) throw new Error('不是 CurseForge 整合包：缺少 manifest.json');
  const packManifest = JSON.parse(entry.getData().toString('utf8'));
  const gameVersion = packManifest.minecraft && packManifest.minecraft.version;
  if (!gameVersion) throw new Error('整合包没有声明 Minecraft 版本');
  const loader = loaderSpec(packManifest);

  let parentId = gameVersion;
  if (loader && loader.type === 'fabric') {
    const r = await installFabric({ gameVersion, loaderVersion: loader.version, gameDir, mirror, manifest, installBase: true, onProgress });
    parentId = r.id;
  } else if (loader && loader.type === 'forge') {
    const r = await installForge({ mcVersion: gameVersion, forgeVersion: loader.version, gameDir, mirror, javaPath, manifest, installBase: true, onProgress, onLog });
    parentId = r.id;
  } else if (loader && (loader.type === 'neoforge' || loader.type === 'neo')) {
    const r = await installNeoForge({ mcVersion: gameVersion, neoVersion: loader.version, gameDir, mirror, javaPath, manifest, installBase: true, onProgress, onLog });
    parentId = r.id;
  } else if (loader && loader.type === 'quilt') {
    const r = await installQuilt({ gameVersion, loaderVersion: loader.version, gameDir, mirror, manifest, installBase: true, onProgress });
    parentId = r.id;
  } else {
    await installVersion(gameVersion, { gameDir, mirror, manifest, onProgress });
  }

  const packName = String(name || packManifest.name || 'CurseForge 整合包').trim();
  let packId = packName.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_').replace(/^\.+/, '').trim().replace(/[. ]+$/g, '');
  if (!packId) packId = 'CurseForge 整合包';
  if (packId === gameVersion || packId === parentId) packId = `${packId} (整合包)`;
  const vdir = versionDir(gameDir, packId);
  if (fs.existsSync(vdir)) throw new Error(`整合包版本已存在：${packId}，请先改名或删除旧版本`);
  await fs.promises.mkdir(vdir, { recursive: true });
  try {
  const parentJson = path.join(versionDir(gameDir, parentId), `${parentId}.json`);
  if (!fs.existsSync(parentJson)) throw new Error(`加载器版本信息缺失：${parentId}`);
  await fs.promises.writeFile(
    path.join(vdir, `${packId}.json`),
    JSON.stringify({ id: packId, inheritsFrom: parentId, type: 'modpack' }, null, 4),
    'utf8'
  );
  for (const jar of [path.join(versionDir(gameDir, parentId), `${parentId}.jar`), path.join(versionDir(gameDir, gameVersion), `${gameVersion}.jar`)]) {
    if (fs.existsSync(jar)) {
      await fs.promises.copyFile(jar, path.join(vdir, `${packId}.jar`));
      break;
    }
  }

  const files = (packManifest.files || []).filter((f) => f.required !== false);
  if (!key || !String(key).trim()) {
    if (files.length > 20) throw new Error('免 Key 模式不适合批量安装大型整合包（需逐个解析文件名）。请填写 CurseForge Key，或改用本地整合包/Modrinth 整合包');
  }
  onProgress({ phase: 'mods', title: '下载整合包内容', detail: `0/${files.length}`, current: 0, total: files.length });
  await pool(
    files,
    8,
    async (f) => {
      const file = await getFileSmart(f.projectID, f.fileID, key, gameVersion, '', 'mod');
      await downloadCfFile(file, path.join(vdir, 'mods'));
    },
    (done, total) => onProgress({ phase: 'mods', title: '下载整合包内容', detail: `${done}/${total}`, current: done, total })
  );

  const overrides = zip.getEntries().filter((e) => !e.isDirectory && /^overrides\//.test(e.entryName));
  onProgress({ phase: 'overrides', title: '写入整合包配置', detail: `${overrides.length} 个文件`, current: 0, total: overrides.length });
  for (const e of overrides) {
    const rel = e.entryName.replace(/^overrides\//, '');
    if (!rel) continue;
    if (rel === `${packId}.json` || rel === `${packId}.jar`) throw new Error(`整合包包含非法覆盖路径：${rel}`);
    const dest = safeJoin(vdir, rel);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, e.getData());
  }

  await fs.promises.writeFile(
    path.join(vdir, '.pcl2_install.json'),
    JSON.stringify({ installedAt: new Date().toISOString(), source: 'curseforge-pack', baseVersion: gameVersion, parentId, loader: loader ? loader.raw : '' }, null, 2)
  );
  onProgress({ phase: 'finish', title: '整合包安装完成', detail: packId, current: 1, total: 1 });
  return { id: packId, name: packName, baseVersion: gameVersion, parentId };
  } catch (e) {
    await fs.promises.rm(vdir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

async function installPackProject(opts) {
  const { key, projectId, fileId, ...rest } = opts;
  if (!projectId) throw new Error('缺少 CurseForge 整合包项目 ID');
  let file;
  if (!key || !String(key).trim()) {
    file = await widgetLatest(projectId, '', '', 'modpack');
  } else if (fileId) {
    file = await getFile(projectId, fileId, key);
  } else {
    const data = await cfJson(`/mods/${encodeURIComponent(projectId)}/files`, key, { pageSize: 20 });
    file = (data.data || []).sort((a, b) => String(b.fileDate || '').localeCompare(String(a.fileDate || '')))[0];
    if (!file) throw new Error('该项目没有可下载的整合包文件');
  }
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'startpro-cf-pack-'));
  const tmpFile = path.join(tmpDir, (file.fileName || 'pack.zip').replace(/[\\/]/g, '_'));
  try {
    await downloadFile(fileUrl(file), tmpFile, { sha1: sha1Of(file), size: file.fileLength || 0 });
    return await installPack({ key, filePath: tmpFile, ...rest });
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { search, getFile, installProject, installPack, installPackProject, fileUrl };
