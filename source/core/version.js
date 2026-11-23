'use strict';
/**
 * 本地版本扫描 / inheritsFrom 合并（用于 Fabric、Forge、OptiFine 等衍生版本）
 */
const fs = require('fs');
const path = require('path');

function versionsDir(gameDir) {
  return path.join(gameDir, 'versions');
}

function versionDir(gameDir, id) {
  // 版本名来自 UI / 配置，必须挡住路径穿越，避免删除或写入 versions 目录之外
  if (typeof id !== 'string' || !id.trim() || id === '.' || id === '..' || /[\\/]/.test(id)) {
    throw new Error(`非法的版本名：${id || '(空)'}`);
  }
  return path.join(versionsDir(gameDir), id);
}

function listLocalVersions(gameDir) {
  const dir = versionsDir(gameDir);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const vd = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(vd);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const jsonPath = path.join(vd, `${name}.json`);
    if (!fs.existsSync(jsonPath)) continue;
    let json = null;
    try {
      json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      continue;
    }
    const jarPath = path.join(vd, `${name}.jar`);
    const jarExists = fs.existsSync(jarPath);
    let size = 0;
    let mtime = st.mtime;
    try {
      if (jarExists) {
        const js = fs.statSync(jarPath);
        size = js.size;
        mtime = js.mtime;
      }
    } catch {}
    out.push({
      id: name,
      type: json.type || (json.inheritsFrom ? 'modified' : 'release'),
      inheritsFrom: json.inheritsFrom || '',
      releaseTime: json.releaseTime || mtime.toISOString(),
      lastUsed: mtime.toISOString(),
      jar: jarExists,
      size,
      loader: detectLoader(json, name) || (json.inheritsFrom ? detectLoader(null, json.inheritsFrom) : ''),
    });
  }
  return out.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
}

function detectLoader(json, id) {
  const name = id.toLowerCase();
  const lower = JSON.stringify((json && json.mainClass) || '') + JSON.stringify((json && json.id) || '');
  if (/fabric/i.test(name) || /fabric/i.test(lower)) return 'Fabric';
  if (/quilt/i.test(name)) return 'Quilt';
  if (/neoforge/i.test(name)) return 'NeoForge';
  if (/forge/i.test(name) || /forge/i.test(lower)) return 'Forge';
  if (/optifine|opti/i.test(name)) return 'OptiFine';
  return '';
}

/** 沿 inheritsFrom 追到真正的 Minecraft 原版版本（整合包 / 加载器 / 自定义名称都能正确归位） */
function baseVersionId(id, gameDir, depth = 0) {
  if (!id || depth > 8) return id;
  try {
    const json = readVersionJson(id, gameDir);
    if (!json.inheritsFrom) return id;
    return baseVersionId(json.inheritsFrom, gameDir, depth + 1);
  } catch {
    return id;
  }
}

function readVersionJson(id, gameDir) {
  const p = path.join(versionDir(gameDir, id), `${id}.json`);
  if (!fs.existsSync(p)) throw new Error(`未找到版本 ${id}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 递归合并 inheritsFrom，返回可供启动的完整版本对象 */
function mergeVersionJson(id, gameDir, depth = 0) {
  if (depth > 4) throw new Error('inheritsFrom 层级过深');
  const child = readVersionJson(id, gameDir);
  let merged = { ...child };
  if (child.inheritsFrom) {
    const parent = mergeVersionJson(child.inheritsFrom, gameDir, depth + 1);
    merged = {
      ...parent,
      ...child,
      id: child.id || id,
      inheritsFrom: child.inheritsFrom,
      libraries: mergeLibraries(parent.libraries || [], child.libraries || []),
      arguments: mergeArguments(parent.arguments, child.arguments),
      mainClass: child.mainClass || parent.mainClass,
      assets: child.assets || parent.assets,
      assetIndex: child.assetIndex || parent.assetIndex,
      downloads: { ...(parent.downloads || {}), ...(child.downloads || {}) },
      javaVersion: child.javaVersion || parent.javaVersion,
      minecraftArguments: child.minecraftArguments || parent.minecraftArguments,
    };
  }
  return merged;
}

function libKey(lib) {
  return `${lib.name}`;
}

function mergeLibraries(parentLibs, childLibs) {
  const map = new Map();
  for (const l of parentLibs) map.set(libKey(l), l);
  for (const l of childLibs) map.set(libKey(l), l); // 子版本覆盖同名库
  return Array.from(map.values());
}

function mergeArguments(parentArgs, childArgs) {
  if (!parentArgs && !childArgs) return undefined;
  const norm = (a) => (Array.isArray(a) ? { game: a, jvm: [] } : a || { game: [], jvm: [] });
  const p = norm(parentArgs);
  const c = norm(childArgs);
  return {
    game: [...(p.game || []), ...(c.game || [])],
    jvm: [...(p.jvm || []), ...(c.jvm || [])],
  };
}

/** 版本根目录（版本隔离时会话目录，非隔离时游戏根目录） */
function versionGameDir(gameDir, id, isolated) {
  return isolated ? versionDir(gameDir, id) : gameDir;
}

module.exports = {
  versionsDir,
  versionDir,
  listLocalVersions,
  readVersionJson,
  mergeVersionJson,
  versionGameDir,
  detectLoader,
  baseVersionId,
};
