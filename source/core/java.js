'use strict';
/**
 * Java 运行时管理：需求推断、自动下载（Adoptium Temurin）、解压与探测
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { fetchJson } = require('./net');
const { probeJava, detectJavaList } = require('./launch');

const API_BASE = 'https://api.adoptium.net/v3';

/** 当前平台对应的 Adoptium 参数 */
function platformSpec() {
  const p = process.platform;
  const osName = p === 'win32' ? 'windows' : p === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'ia32' ? 'x32' : 'x64';
  return { os: osName, arch, ext: osName === 'windows' ? 'zip' : 'tar.gz' };
}

/** 可下载的 Java 版本（Adoptium 提供的 LTS） */
async function javaCatalog() {
  const info = await fetchJson(`${API_BASE}/info/available_releases`);
  const lts = (info.available_lts_releases || []).slice().sort((a, b) => a - b);
  return lts.map((major) => ({
    major,
    recommended: major === 21,
    label: `Java ${major}${major === 8 ? '（1.16.5 及更早）' : major === 17 ? '（1.17–1.20.4）' : major === 21 ? '（1.20.5+）' : ''}`,
  }));
}

/** 查询某个 Java 大版本的最新 Temurin 包 */
async function javaPackage(major) {
  const { os, arch } = platformSpec();
  const url = `${API_BASE}/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jdk&os=${os}&vendor=eclipse`;
  const list = await fetchJson(url);
  if (!Array.isArray(list) || !list.length) throw new Error(`Adoptium 没有适用于本平台的 Java ${major}`);
  const pkg = list[0].binary.package;
  return {
    major,
    version: list[0].version && list[0].version.semver,
    releaseName: list[0].release_name,
    name: pkg.name,
    link: pkg.link,
    size: pkg.size,
    checksum: pkg.checksum,
    os,
    arch,
  };
}

function javaRoot(rootDir) {
  return path.join(rootDir || path.join(os.homedir(), '.pcl2'), 'java');
}

function findJavaExe(dir, depth = 0) {
  if (depth > 3) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  for (const e of entries) {
    if (e.isFile() && e.name === exe && path.basename(dir) === 'bin') return path.join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const r = findJavaExe(path.join(dir, e.name), depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/** 已由启动器下载安装的 Java */
async function installedJava(rootDir) {
  const root = javaRoot(rootDir);
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const dir of fs.readdirSync(root)) {
    if (dir === 'downloads') continue;
    const exe = findJavaExe(path.join(root, dir));
    if (!exe) continue;
    const info = await probeJava(exe).catch(() => null);
    if (info) out.push({ ...info, managed: true, source: '启动器安装', dir: path.join(root, dir) });
  }
  return out;
}

/** 流式下载 + sha256 校验 + 进度回调 */
async function downloadArchive(pkg, dest, onProgress) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const res = await fetch(pkg.link, { headers: { 'User-Agent': 'StartPro/1.2.1' } });
  if (!res.ok || !res.body) throw new Error(`下载失败 HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || pkg.size || 0;
  const hash = crypto.createHash('sha256');
  let received = 0;
  const file = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      hash.update(value);
      if (onProgress) onProgress(received, total);
      if (!file.write(Buffer.from(value))) await new Promise((r) => file.once('drain', r));
    }
    await new Promise((resolve, reject) => file.end((e) => (e ? reject(e) : resolve())));
  } catch (e) {
    file.destroy();
    await fsp.unlink(tmp).catch(() => {});
    throw e;
  }
  const digest = hash.digest('hex');
  if (pkg.checksum && digest !== pkg.checksum) {
    await fsp.unlink(tmp).catch(() => {});
    throw new Error('JDK 校验失败（sha256 不匹配）');
  }
  await fsp.rename(tmp, dest);
  return dest;
}

function unzip(zipFile, target) {
  return new Promise((resolve, reject) => {
    const args =
      process.platform === 'win32'
        ? ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${target}' -Force`]
        : ['-xf', zipFile, '-C', target];
    const cmd = process.platform === 'win32' ? 'powershell' : 'tar';
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`解压失败，代码 ${code}`))));
    p.on('error', reject);
  });
}

function untar(file, target) {
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['-xzf', file, '-C', target], { stdio: 'ignore' });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`解压失败，代码 ${code}`))));
    p.on('error', reject);
  });
}

/**
 * 下载并安装一个 Java 大版本
 * @returns {path, major, version, dir, cached}
 */
async function installJava(major, opts = {}) {
  const { rootDir, onProgress, onLog } = opts;
  const root = javaRoot(rootDir);
  const dir = path.join(root, `temurin-${major}`);
  const log = onLog || (() => {});

  const existing = findJavaExe(dir);
  if (existing) {
    const info = await probeJava(existing);
    if (info && info.major === Number(major)) return { ...info, dir, cached: true };
  }

  log(`解析 Java ${major} 下载地址…`);
  const pkg = await javaPackage(major);
  log(`下载 ${pkg.name}（${(pkg.size / 1024 / 1024).toFixed(0)} MB）`);
  const archive = path.join(root, 'downloads', pkg.name);
  await downloadArchive(pkg, archive, onProgress);

  log('解压到 ' + dir);
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
  if (pkg.name.endsWith('.zip')) await unzip(archive, dir);
  else await untar(archive, dir);

  const exe = findJavaExe(dir);
  if (!exe) throw new Error('解压完成但未找到 java 可执行文件');
  if (process.platform !== 'win32') await fsp.chmod(exe, 0o755).catch(() => {});
  const info = await probeJava(exe);
  if (!info) throw new Error('安装的 Java 无法运行');
  await fsp.unlink(archive).catch(() => {}); // 解压成功后不再保留安装包
  log(`安装完成：${info.output}`);
  return { ...info, dir, cached: false };
}

/** 根据版本 JSON 判断所需 Java 大版本 */
async function requiredJava(versionId, gameDir) {
  const { mergeVersionJson } = require('./version');
  let json = null;
  try {
    json = mergeVersionJson(versionId, gameDir);
  } catch {
    json = null;
  }
  if (json && json.javaVersion && json.javaVersion.majorVersion) {
    return { major: json.javaVersion.majorVersion, source: 'version-json', component: json.javaVersion.component || '' };
  }
  // 回退：按发布日期推断
  let releaseTime = json && json.releaseTime;
  if (!releaseTime) {
    try {
      const manifest = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
      const v = (manifest.versions || []).find((x) => x.id === versionId);
      releaseTime = v && v.releaseTime;
    } catch {
      /* ignore */
    }
  }
  let major = 8;
  if (releaseTime) {
    const t = new Date(releaseTime).getTime();
    if (t >= Date.UTC(2024, 3, 23)) major = 21; // 1.20.5
    else if (t >= Date.UTC(2021, 5, 8)) major = 17; // 1.17
  }
  return { major, source: 'release-time' };
}

/** 挑选满足要求的 Java：优先精确匹配，其次更高版本 */
async function pickJavaFor(versionId, gameDir, settingsJava, rootDir) {
  const req = await requiredJava(versionId, gameDir);
  const all = [];
  if (settingsJava) {
    const info = await probeJava(settingsJava).catch(() => null);
    if (info) all.push(info);
  }
  all.push(...(await installedJava(rootDir)), ...(await detectJavaList([])));
  const uniq = [];
  const seen = new Set();
  for (const j of all) {
    if (!j || seen.has(j.path)) continue;
    seen.add(j.path);
    uniq.push(j);
  }
  const exact = uniq.find((j) => j.major === req.major);
  // 只对 Java 17 放宽到 21：1.17–1.20.4 用 Java 21 通常还能跑；
  // Java 8 必须精确匹配，Java 21+ 也不拿 Java 25 这类过新的运行库硬顶，否则容易直接崩。
  const higher = req.major === 17 ? uniq.find((j) => j.major === 21) : null;
  return { required: req, java: exact || higher || null, list: uniq };
}

module.exports = { platformSpec, javaCatalog, javaPackage, installJava, installedJava, requiredJava, pickJavaFor, javaRoot };
