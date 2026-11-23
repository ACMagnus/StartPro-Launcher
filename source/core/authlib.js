'use strict';
/**
 * authlib-injector：外置登录启动时必须注入 -javaagent，否则服务器会拒绝验证。
 * 这里负责下载/缓存注入器并校验 SHA-256。
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { fetchJson, downloadFile } = require('./net');

const META_OFFICIAL = 'https://authlib-injector.yushi.moe/artifact/latest.json';
const META_BMCL = 'https://bmclapi2.bangbang93.com/mirrors/authlib-injector/artifact/latest.json';

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const rs = fs.createReadStream(file);
    rs.on('error', reject);
    rs.on('data', (c) => h.update(c));
    rs.on('end', () => resolve(h.digest('hex')));
  });
}

async function latestMeta(mirror = 'bmclapi') {
  const urls = mirror === 'bmclapi' ? [META_BMCL, META_OFFICIAL] : [META_OFFICIAL, META_BMCL];
  const errors = [];
  for (const url of urls) {
    try {
      const m = await fetchJson(url, { timeout: 15000, retries: 2 });
      if (!m || !m.download_url) throw new Error('authlib-injector 元数据不完整');
      return m;
    } catch (e) {
      errors.push(e.message || e);
    }
  }
  throw new Error(`获取 authlib-injector 下载信息失败：${errors.join('；')}`);
}

/**
 * 确保注入器存在。返回 jar 绝对路径。
 */
async function ensureInjector(rootDir, mirror = 'bmclapi', onProgress = () => {}) {
  const dir = path.join(rootDir, 'authlib-injector');
  const meta = await latestMeta(mirror);
  const file = path.join(dir, `authlib-injector-${meta.version || meta.build_number || 'latest'}.jar`);
  await fsp.mkdir(dir, { recursive: true });
  if (fs.existsSync(file)) {
    const h = await sha256File(file);
    if (!meta.checksums || !meta.checksums.sha256 || h === meta.checksums.sha256) return file;
    await fsp.unlink(file).catch(() => {});
  }
  onProgress({ phase: 'authlib', title: '下载外置登录组件', detail: path.basename(file), current: 0, total: 1 });
  const urls = [meta.download_url];
  if (mirror === 'bmclapi' && meta.download_url.includes('authlib-injector.yushi.moe')) {
    urls.push(meta.download_url.replace('https://authlib-injector.yushi.moe', 'https://bmclapi2.bangbang93.com/mirrors/authlib-injector'));
  }
  let lastErr = null;
  for (const url of urls) {
    try {
      await downloadFile(url, file, { retries: 2 });
      const h = await sha256File(file);
      if (meta.checksums && meta.checksums.sha256 && h !== meta.checksums.sha256) throw new Error('authlib-injector SHA-256 校验失败');
      onProgress({ phase: 'authlib', title: '外置登录组件就绪', detail: path.basename(file), current: 1, total: 1 });
      return file;
    } catch (e) {
      lastErr = e;
      await fsp.unlink(file).catch(() => {});
    }
  }
  throw new Error(`下载 authlib-injector 失败：${lastErr ? lastErr.message : '未知错误'}`);
}

module.exports = { ensureInjector, latestMeta, sha256File };
