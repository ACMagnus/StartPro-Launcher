'use strict';
const fs = require('fs');
const path = require('path');
const { fetchJson } = require('./net');
const { installVersion } = require('./install');
const { versionDir, listLocalVersions } = require('./version');

const QUILT_META = 'https://meta.quiltmc.org/v3';

async function listLoaders(gameVersion) {
  const data = await fetchJson(`${QUILT_META}/versions/loader/${encodeURIComponent(gameVersion)}`, { timeout: 20000 });
  return (data || []).map((x) => x.loader).filter(Boolean).map((x) => ({ version: x.version, stable: !/beta|alpha|rc|pre/i.test(x.version) }));
}

async function installQuilt(opts) {
  const { gameVersion, loaderVersion, gameDir, mirror = 'official', manifest, installBase = true, name = '', onProgress = () => {} } = opts;
  if (!gameVersion || !loaderVersion) throw new Error('缺少 Quilt 版本信息');
  const installed = listLocalVersions(gameDir).map((v) => v.id);
  if (installBase && !installed.includes(gameVersion)) {
    onProgress({ phase: 'base', title: '安装原版', detail: gameVersion, current: 0, total: 1 });
    await installVersion(gameVersion, { gameDir, mirror, manifest, onProgress });
  }
  const autoName = `${gameVersion}-Quilt ${loaderVersion}`;
  const versionName = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '') || autoName;
  if (versionName === gameVersion) throw new Error('安装后名称不能与原版版本相同');
  const vdir = versionDir(gameDir, versionName);
  if (fs.existsSync(path.join(vdir, `${versionName}.json`))) {
    if (versionName === autoName) return { id: versionName, reused: true };
    throw new Error(`版本「${versionName}」已存在，请先删除或换一个名称`);
  }
  onProgress({ phase: 'quilt', title: '获取 Quilt 安装配置', detail: loaderVersion, current: 0, total: 2 });
  const profile = await fetchJson(`${QUILT_META}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`);
  await fs.promises.mkdir(vdir, { recursive: true });
  await fs.promises.writeFile(
    path.join(vdir, `${versionName}.json`),
    JSON.stringify({ ...profile, id: versionName, inheritsFrom: gameVersion, type: 'quilt' }, null, 4),
    'utf8'
  );
  await fs.promises.writeFile(
    path.join(vdir, '.pcl2_install.json'),
    JSON.stringify({ installedAt: new Date().toISOString(), source: 'quilt', gameVersion, loaderVersion }, null, 2)
  );
  onProgress({ phase: 'quilt', title: 'Quilt 安装完成', detail: versionName, current: 2, total: 2 });
  return { id: versionName };
}

module.exports = { listLoaders, installQuilt };
