'use strict';
/**
 * 把当前版本导出成可再导入的整合包：
 * 采用 Modrinth .mrpack 结构，Mod/资源包/光影/配置全部放入 overrides，
 * files 留空，避免伪造远端下载地址。
 */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { versionDir, readVersionJson, baseVersionId } = require('./version');

const COPY_DIRS = ['mods', 'resourcepacks', 'shaderpacks', 'config', 'defaultconfigs', 'datapacks'];
const COPY_FILES = ['options.txt', 'optionsof.txt'];

function copyDirToZip(zip, srcDir, prefix) {
  if (!fs.existsSync(srcDir)) return;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      copyDirToZip(zip, src, path.join(prefix, name));
    } else {
      zip.addFile(path.join(prefix, name).replace(/\\/g, '/'), fs.readFileSync(src));
    }
  }
}

function exportPack({ gameDir, versionId, name }) {
  const vdir = versionDir(gameDir, versionId);
  if (!fs.existsSync(vdir)) throw new Error('版本目录不存在');
  let raw = {};
  try { raw = readVersionJson(versionId, gameDir) || {}; } catch {}
  const base = baseVersionId(versionId, gameDir) || raw.inheritsFrom || versionId;
  const packName = String(name || versionId).trim() || versionId;

  const zip = new AdmZip();
  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: packName,
    name: packName,
    summary: `由 StartPro 导出的整合包（原版本 ${versionId}）`,
    files: [],
    dependencies: { minecraft: base },
  };
  // 从版本链里找加载器 ID（例如 1.20.1-Fabric 0.15.0 / 1.20.1-forge-47.2.0）
  const ids = [versionId, raw.inheritsFrom].filter(Boolean).map(String);
  const loaderId = ids.find((x) => /fabric|quilt|forge|neoforge/i.test(x)) || '';
  if (loaderId) {
    const m = loaderId.match(/(?:fabric|quilt|forge|neoforge)[- _]*v?(\d+(?:\.\d+)+(?:[-\w.]*)?)/i);
    const ver = m ? m[1] : '';
    if (/quilt/i.test(loaderId)) index.dependencies['quilt-loader'] = ver;
    else if (/neoforge/i.test(loaderId)) index.dependencies['neo-forge'] = ver;
    else if (/forge/i.test(loaderId)) index.dependencies['forge'] = ver;
    else if (/fabric/i.test(loaderId)) index.dependencies['fabric-loader'] = ver;
  }
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2), 'utf8'));

  for (const dir of COPY_DIRS) copyDirToZip(zip, path.join(vdir, dir), path.join('overrides', dir));
  for (const file of COPY_FILES) {
    const src = path.join(vdir, file);
    if (fs.existsSync(src)) zip.addFile(`overrides/${file}`, fs.readFileSync(src));
  }

  const outDir = path.join(gameDir, 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const safeName = packName.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').replace(/\.\./g, '_') || 'pack';
  const out = path.join(outDir, `${safeName}.mrpack`);
  zip.writeZip(out);
  return { ok: true, path: out, name: packName, base };
}

module.exports = { exportPack };
