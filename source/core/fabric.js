'use strict';
/**
 * Fabric 安装（meta.fabricmc.net 官方接口）
 * 安装后的版本命名与 PCL2 一致，例如 "1.21.4-Fabric 0.16.10"
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { fetchJson } = require('./net');
const { installVersion } = require('./install');
const { listLocalVersions, versionDir } = require('./version');

const FABRIC_META = 'https://meta.fabricmc.net/v2';
const FABRIC_MIRROR = 'https://bmclapi2.bangbang93.com/fabric-meta/v2';

async function fabricJson(pathname) {
  let lastErr;
  for (const base of [FABRIC_META, FABRIC_MIRROR]) {
    try {
      return await fetchJson(`${base}${pathname}`, { timeout: 15000, retries: 2 });
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Fabric 接口不可用：${lastErr && lastErr.message ? lastErr.message : lastErr}`);
}

async function listGameVersions() {
  const list = await fabricJson('/versions/game');
  return list.map((v) => ({ id: v.version, stable: v.stable }));
}

async function listLoaders() {
  const list = await fabricJson('/versions/loader');
  return list.map((v) => ({ version: v.version, stable: v.stable, build: v.build }));
}

async function installFabric(opts) {
  const { gameVersion, loaderVersion, gameDir, mirror = 'official', manifest, installBase = true, name = '', onProgress = () => {} } = opts;
  if (!gameVersion) throw new Error('缺少游戏版本');
  if (!loaderVersion) throw new Error('缺少 Fabric Loader 版本');

  const installed = listLocalVersions(gameDir).map((v) => v.id);
  if (installBase && !installed.includes(gameVersion)) {
    onProgress({ phase: 'base', title: '安装原版', detail: gameVersion, current: 0, total: 1 });
    await installVersion(gameVersion, { gameDir, mirror, manifest, onProgress });
  }
  if (!installed.includes(gameVersion) && !installBase) {
    throw new Error(`需要先安装原版 ${gameVersion}`);
  }

  onProgress({ phase: 'fabric', title: '获取 Fabric 安装配置', detail: '', current: 0, total: 2 });
  const autoName = `${gameVersion}-Fabric ${loaderVersion}`;
  const versionName = String(name || '').trim() || autoName;
  if (versionName === gameVersion) throw new Error('安装后名称不能与原版版本相同');
  if (fs.existsSync(path.join(versionDir(gameDir, versionName), `${versionName}.json`))) {
    if (versionName === autoName) return { id: versionName, reused: true };
    throw new Error(`版本「${versionName}」已存在，请先删除或换一个名称`);
  }
  const profile = await fabricJson(`/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`);

  const vdir = versionDir(gameDir, versionName);
  await fsp.mkdir(vdir, { recursive: true });
  const json = { ...profile, id: versionName, inheritsFrom: gameVersion, type: 'fabric' };
  await fsp.writeFile(path.join(vdir, `${versionName}.json`), JSON.stringify(json, null, 4), 'utf8');
  await fsp.writeFile(
    path.join(vdir, '.pcl2_install.json'),
    JSON.stringify({ installedAt: new Date().toISOString(), source: 'fabric', gameVersion, loaderVersion }, null, 2)
  );
  onProgress({ phase: 'fabric', title: 'Fabric 安装完成', detail: versionName, current: 2, total: 2 });
  return { id: versionName };
}

module.exports = { listGameVersions, listLoaders, installFabric, FABRIC_META, FABRIC_MIRROR };
