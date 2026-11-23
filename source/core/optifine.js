'use strict';
/**
 * OptiFine 官方安装器自动化。
 * 官方下载需要先访问 adloadx 拿一次性 downloadx token；安装器本身是 GUI，
 * 但 optifine.Installer 在 headless 下可以完成安装（PCL2 也走这条路）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { installVersion } = require('./install');
const { versionDir } = require('./version');

const DOWNLOADS = 'https://optifine.net/downloads';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

async function listVersions(mcVersion = '') {
  const res = await fetch(DOWNLOADS, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`OptiFine 版本页请求失败：HTTP ${res.status}`);
  const html = await res.text();
  const names = Array.from(new Set((html.match(/OptiFine_[0-9][^"'<>\s]+\.jar/g) || []).map((x) => x.replace(/&amp;/g, '&'))));
  const rows = names
    .map((file) => {
      const m = /^OptiFine_(.+?)_(.+)\.jar$/.exec(file);
      if (!m) return null;
      return { file, mcVersion: m[1], edition: m[2] };
    })
    .filter(Boolean);
  return mcVersion ? rows.filter((r) => r.mcVersion === mcVersion) : rows;
}

async function fetchBuffer(url, referer) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer || DOWNLOADS }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`下载 OptiFine 失败：HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadInstaller(mcVersion, edition, dest) {
  const file = `OptiFine_${mcVersion}_${edition}.jar`;
  const adUrl = `https://optifine.net/adloadx?f=${encodeURIComponent(file)}`;
  const html = (await fetchBuffer(adUrl, DOWNLOADS)).toString('utf8');
  const m = /downloadx\?f=([^"'&]+)&(?:amp;)?x=([^"']+)/.exec(html);
  if (!m) throw new Error('OptiFine 下载页没有返回下载令牌，可能被官网拦截');
  const url = `https://optifine.net/downloadx?f=${m[1]}&x=${m[2]}`;
  const buf = await fetchBuffer(url.replace(/&amp;/g, '&'), DOWNLOADS);
  if (buf.length < 100000) throw new Error('OptiFine 安装器下载不完整');
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.writeFile(dest, buf);
  return dest;
}

function runJava(javaPath, args, cwd, onLog) {
  return new Promise((resolve, reject) => {
    const proc = spawn(javaPath, args, { cwd, windowsHide: true });
    let out = '';
    proc.stdout.on('data', (d) => {
      const s = d.toString('utf8');
      out += s;
      onLog && s.split(/\r?\n/).filter(Boolean).forEach(onLog);
    });
    proc.stderr.on('data', (d) => {
      const s = d.toString('utf8');
      out += s;
      onLog && s.split(/\r?\n/).filter(Boolean).forEach(onLog);
    });
    proc.on('close', (code) => resolve({ code, out }));
    proc.on('error', reject);
  });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function installOptiFine(opts) {
  const {
    mcVersion,
    edition,
    gameDir,
    javaPath = 'java',
    mirror = 'official',
    name = '',
    manifest,
    onProgress = () => {},
    onLog = () => {},
  } = opts;
  if (!mcVersion || !edition) throw new Error('缺少 OptiFine 版本信息');

  const baseDir = versionDir(gameDir, mcVersion);
  const baseJar = path.join(baseDir, `${mcVersion}.jar`);
  if (!fs.existsSync(baseJar)) {
    onProgress({ phase: 'base', title: '安装原版', detail: mcVersion, current: 0, total: 1 });
    await installVersion(mcVersion, { gameDir, mirror, manifest, onProgress });
  }

  onProgress({ phase: 'download', title: '下载 OptiFine 安装器', detail: edition, current: 0, total: 1 });
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'startpro-of-'));
  const installer = path.join(tmp, `OptiFine_${mcVersion}_${edition}.jar`);
  try {
    await downloadInstaller(mcVersion, edition, installer);
    onProgress({ phase: 'download', title: '下载 OptiFine 安装器', detail: edition, current: 1, total: 1 });

    // 在临时 home 里跑安装器，避免依赖用户真实 .minecraft 的目录名
    const home = path.join(tmp, 'home');
    const mcDir = path.join(home, '.minecraft');
    const verDir = path.join(mcDir, 'versions', mcVersion);
    await fs.promises.mkdir(verDir, { recursive: true });
    await fs.promises.copyFile(baseJar, path.join(verDir, `${mcVersion}.jar`));
    const baseJson = path.join(baseDir, `${mcVersion}.json`);
    if (!fs.existsSync(baseJson)) throw new Error('原版版本 JSON 缺失，请先安装原版');
    await fs.promises.copyFile(baseJson, path.join(verDir, `${mcVersion}.json`));
    await fs.promises.writeFile(path.join(mcDir, 'launcher_profiles.json'), JSON.stringify({ profiles: {} }), 'utf8');

    onProgress({ phase: 'installer', title: '运行 OptiFine 安装器', detail: '正在打补丁…', current: 0, total: 0 });
    const javaArgs = [];
    const javaMajor = Number((String(opts.javaMajor || '').match(/\d+/) || ['8'])[0]);
    if (javaMajor >= 9) javaArgs.push('--add-exports', 'cpw.mods.bootstraplauncher/cpw.mods.bootstraplauncher=ALL-UNNAMED');
    javaArgs.push(`-Djava.awt.headless=true`, `-Duser.home=${home}`, '-cp', installer, 'optifine.Installer');
    const run = await runJava(javaPath, javaArgs, home, onLog);
    if (run.code !== 0) throw new Error(`OptiFine 安装器退出代码 ${run.code}：${run.out.slice(-500)}`);

    const versionsDir = path.join(mcDir, 'versions');
    const created = fs.readdirSync(versionsDir).filter((d) => d !== mcVersion && /OptiFine/i.test(d)).sort((a, b) => fs.statSync(path.join(versionsDir, b)).mtimeMs - fs.statSync(path.join(versionsDir, a)).mtimeMs)[0];
    if (!created) throw new Error('OptiFine 安装器没有生成版本目录');
    const targetId = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '') || created;
    if (targetId !== created && fs.existsSync(versionDir(gameDir, targetId))) throw new Error(`版本「${targetId}」已存在`);

    // 把临时安装结果搬回真实游戏目录
    const createdDir = path.join(versionsDir, created);
    const targetDir = versionDir(gameDir, targetId);
    await fs.promises.mkdir(targetDir, { recursive: true });
    for (const f of fs.readdirSync(createdDir)) {
      const from = path.join(createdDir, f);
      let to = path.join(targetDir, f);
      if (f === `${created}.json`) to = path.join(targetDir, `${targetId}.json`);
      if (f === `${created}.jar`) to = path.join(targetDir, `${targetId}.jar`);
      await fs.promises.copyFile(from, to);
    }
    const jsonFile = path.join(targetDir, `${targetId}.json`);
    if (fs.existsSync(jsonFile)) {
      const json = JSON.parse(await fs.promises.readFile(jsonFile, 'utf8'));
      json.id = targetId;
      await fs.promises.writeFile(jsonFile, JSON.stringify(json, null, 4), 'utf8');
    }
    copyDir(path.join(mcDir, 'libraries', 'optifine'), path.join(gameDir, 'libraries', 'optifine'));
    await fs.promises.writeFile(
      path.join(targetDir, '.pcl2_install.json'),
      JSON.stringify({ installedAt: new Date().toISOString(), source: 'optifine', baseVersion: mcVersion, edition }, null, 2)
    );
    onProgress({ phase: 'finish', title: 'OptiFine 安装完成', detail: targetId, current: 1, total: 1 });
    return { id: targetId, baseVersion: mcVersion, edition };
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { listVersions, installOptiFine, downloadInstaller };
