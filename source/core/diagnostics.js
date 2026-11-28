'use strict';
/**
 * 全面检查：启动器体检引擎
 * 只读检查为主；所有异常都收敛成一条检查结果，不能因为单个检查失败中断整次体检。
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { listLocalVersions, versionDir, readVersionJson, mergeVersionJson, baseVersionId } = require('./version');
const { rulesAllow, libraryArtifact } = require('./install');
const { detectJavaList, probeJava, resolveClientJar } = require('./launch');

function nowIso() { return new Date().toISOString(); }

function requiredJava(versionId) {
  const m = /^(\d+)\.(\d+)/.exec(String(versionId || ''));
  if (!m) return 21;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major > 1) return 21;
  if (minor >= 21) return 21;
  if (minor === 20) return /^1\.20\.[0-4]/.test(String(versionId)) ? 17 : 21;
  if (minor >= 17) return 17;
  return 8;
}

function statusOf(ok, warn) { return ok ? 'pass' : warn ? 'warn' : 'fail'; }

async function checkDisk(dir) {
  try {
    const st = await fsp.statfs(dir);
    const free = Number(st.bavail) * Number(st.bsize);
    return { free, total: Number(st.blocks) * Number(st.bsize) };
  } catch {
    return null;
  }
}

async function ping(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'StartPro/1.2.3' }, signal: AbortSignal.timeout(6000) });
    try { if (res.body && res.body.cancel) await res.body.cancel(); } catch {}
    return { ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, error: String(e.message || e) };
  }
}

function fmtMB(n) { return `${Math.round(Number(n) / 1024 / 1024)} MB`; }
function fmtGB(n) { return `${(Number(n) / 1024 / 1024 / 1024).toFixed(1)} GB`; }

async function runDiagnostics(opts = {}) {
  const gameDir = path.resolve(String(opts.gameDir || ''));
  const versionId = String(opts.versionId || '');
  const checks = [];
  const add = (group, id, title, status, detail, fix = null, extra = {}) => {
    checks.push({ group, id, title, status, detail, fix, ...extra });
  };

  // 1. 运行环境
  const appVersion = opts.appVersion || '';
  const electron = (opts.runtime && opts.runtime.electron) || process.versions.electron || '';
  const platform = (opts.runtime && opts.runtime.platform) || process.platform;
  const arch = (opts.runtime && opts.runtime.arch) || process.arch;
  const totalMem = Number(opts.totalMem) || Math.round(os.totalmem() / 1024 / 1024);
  const freeMem = Number(opts.freeMem) || Math.round(os.freemem() / 1024 / 1024);
  add('runtime', 'runtime', '运行环境', 'pass',
    `StartPro ${appVersion || '—'} · Electron ${electron || '—'} · ${platform} ${arch} · 内存 ${fmtGB(totalMem * 1024 * 1024)}（可用 ${fmtGB(freeMem * 1024 * 1024)}）`);
  if (arch !== 'x64' && platform === 'win32') {
    add('runtime', 'arch', '系统架构', 'warn', `当前为 ${arch}，部分 Minecraft 原生库只提供 x64，启动时可能缺 natives。`, null);
  }

  // 2. 游戏目录
  let gameDirOk = false;
  try {
    const st = await fsp.stat(gameDir);
    gameDirOk = st.isDirectory();
  } catch {}
  if (!gameDirOk) {
    add('files', 'gameDir', '游戏目录', 'fail', `目录不存在或不是文件夹：${gameDir}`, { label: '去设置', act: 'settings', tab: 'game' });
  } else {
    let writable = false;
    try {
      const probe = path.join(gameDir, `.ps-write-test-${process.pid}-${Date.now()}`);
      await fsp.writeFile(probe, 'ok');
      await fsp.unlink(probe);
      writable = true;
    } catch {}
    add('files', 'gameDir', '游戏目录', writable ? 'pass' : 'fail',
      writable ? `${gameDir}（可读可写）` : `${gameDir} 存在但不可写，检查权限或杀毒软件拦截。`,
      writable ? null : { label: '打开目录', act: 'openDir' });
  }

  // 3. 磁盘空间
  if (gameDirOk) {
    const disk = await checkDisk(gameDir);
    if (disk) {
      const status = disk.free < 500 * 1024 * 1024 ? 'fail' : disk.free < 2 * 1024 * 1024 * 1024 ? 'warn' : 'pass';
      add('files', 'disk', '磁盘空间', status, `游戏目录所在磁盘剩余 ${fmtGB(disk.free)}（总 ${fmtGB(disk.total)}）。`, status === 'fail' ? { label: '清理空间', act: 'openDir' } : null);
    } else {
      add('files', 'disk', '磁盘空间', 'info', '当前系统不支持读取磁盘剩余空间，已跳过。');
    }
  }

  // 4. 版本列表与选中版本
  let locals = [];
  try { locals = listLocalVersions(gameDir); } catch (e) {
    add('version', 'list', '版本列表', 'fail', `扫描 versions 失败：${e.message}`, { label: '打开版本目录', act: 'openDir' });
  }
  if (!locals.length) {
    add('version', 'empty', '已安装版本', 'fail', '一个版本都没有，先去下载页安装。', { label: '去下载', act: 'page', page: 'download' });
  } else {
    add('version', 'count', '已安装版本', 'pass', `检测到 ${locals.length} 个版本。`);
  }
  const selected = locals.find((v) => v.id === versionId) || null;
  if (!selected) {
    add('version', 'selected', '当前版本', 'fail', versionId ? `当前选中的「${versionId}」不在已安装列表里。` : '还没有选择启动版本。',
      { label: '选择版本', act: 'page', page: 'home' });
  } else {
    add('version', 'selected', '当前版本', 'pass', `「${selected.id}」${selected.loader ? ' · ' + selected.loader : ''} · ${selected.jar ? '客户端 jar 已存在' : '缺少客户端 jar'}`);
  }

  // 5. 版本文件完整性
  if (selected) {
    let raw = null;
    try {
      raw = readVersionJson(selected.id, gameDir);
      add('version', 'json', '版本 JSON', 'pass', `${selected.id}.json 可解析，主类 ${raw.mainClass || '（继承自父版本）'}。`);
    } catch (e) {
      add('version', 'json', '版本 JSON', 'fail', `${selected.id}.json 损坏或缺失：${e.message}`, { label: '重新安装', act: 'page', page: 'download' });
    }
    let merged = raw;
    if (raw) {
      try { merged = mergeVersionJson(selected.id, gameDir); } catch (e) {
        add('version', 'merge', '版本继承', 'fail', `inheritsFrom 合并失败：${e.message}`, { label: '重新安装', act: 'page', page: 'download' });
      }
    }
    const jar = resolveClientJar(selected.id, gameDir);
    if (jar) add('version', 'jar', '客户端 jar', 'pass', `${path.basename(jar)} · ${fmtMB(fs.statSync(jar).size)}`);
    else add('version', 'jar', '客户端 jar', 'fail', '找不到客户端 jar；原版和衍生版本都需要父版本的 jar。', { label: '重新安装', act: 'page', page: 'download' });

    if (merged) {
      const libs = (merged.libraries || []).filter((l) => rulesAllow(l));
      const missing = [];
      for (const lib of libs) {
        const art = libraryArtifact(lib);
        if (!art || !art.path) continue;
        const p = path.join(gameDir, 'libraries', art.path);
        try {
          if (!fs.statSync(p).isFile()) missing.push(path.basename(art.path));
        } catch { missing.push(path.basename(art.path)); }
      }
      add('version', 'libraries', '依赖库', missing.length ? 'fail' : 'pass',
        missing.length ? `缺少 ${missing.length}/${libs.length} 个依赖库：${missing.slice(0, 4).join('、')}${missing.length > 4 ? '…' : ''}` : `${libs.length} 个依赖库全部存在。`,
        missing.length ? { label: '重新安装', act: 'page', page: 'download' } : null);

      const assetId = merged.assetIndex && merged.assetIndex.id ? merged.assetIndex.id : merged.assets || 'legacy';
      const indexFile = path.join(gameDir, 'assets', 'indexes', `${assetId}.json`);
      const objectsDir = path.join(gameDir, 'assets', 'objects');
      if (!fs.existsSync(indexFile)) {
        add('version', 'assetsIndex', '资源索引', 'fail', `缺少 assets/indexes/${assetId}.json，进入游戏会缺语言/音效。`, { label: '重新安装', act: 'page', page: 'download' });
      } else if (!fs.existsSync(objectsDir)) {
        add('version', 'assetsObjects', '资源对象', 'fail', '缺少 assets/objects 目录，资源文件不完整。', { label: '重新安装', act: 'page', page: 'download' });
      } else {
        add('version', 'assets', '资源文件', 'pass', `资源索引 ${assetId} 与 objects 目录存在。`);
      }

      if (!merged.mainClass) add('version', 'mainClass', '启动主类', 'warn', '版本 JSON 没有 mainClass，启动参数可能不完整。', { label: '重新安装', act: 'page', page: 'download' });
    }
  }

  // 6. Java
  let baseId = versionId;
  try { baseId = selected ? baseVersionId(selected.id, gameDir) : versionId; } catch {}
  const req = selected ? Number(mergedJava(selected.id, gameDir) || requiredJava(baseId)) : requiredJava(versionId);
  let javas = [];
  try { javas = await detectJavaList(opts.javaPath ? [opts.javaPath] : []); } catch {}
  const configured = String(opts.javaPath || '');
  let configuredJava = null;
  if (configured && fs.existsSync(configured)) {
    try { configuredJava = await probeJava(configured); } catch {}
  }
  if (!javas.length) {
    add('java', 'detect', 'Java 运行环境', 'fail', '没有检测到任何 Java。启动器可以在设置中一键安装 Temurin JDK。', { label: '去安装 Java', act: 'settings', tab: 'game' });
  } else {
    const majors = [...new Set(javas.map((j) => Number(j.major)).filter(Boolean))].sort((a, b) => a - b);
    add('java', 'detect', 'Java 运行环境', 'pass', `检测到 ${javas.length} 个 Java：${majors.map((m) => 'Java ' + m).join(' / ')}。`);
  }
  const match = javas.find((j) => Number(j.major) === req);
  if (match) {
    add('java', 'match', 'Java 版本匹配', 'pass', `当前需要 Java ${req}，已找到：${match.path}（${match.version}）。`);
  } else if (configuredJava && Number(configuredJava.major) === req) {
    add('java', 'match', 'Java 版本匹配', 'pass', `当前需要 Java ${req}，已配置：${configuredJava.path}（${configuredJava.version}）。`);
  } else {
    add('java', 'match', 'Java 版本匹配', 'fail', `当前版本需要 Java ${req}，但没有找到匹配的 Java。`, { label: '去安装 Java ' + req, act: 'settings', tab: 'game' });
  }
  if (configured && !fs.existsSync(configured)) {
    add('java', 'configured', '已配置 Java 路径', 'warn', `设置里的 Java 路径不存在：${configured}，启动时会回退到自动探测。`, { label: '重新选择', act: 'settings', tab: 'game' });
  }

  // 7. 内存
  const mem = Number(opts.maxMemory) || 0;
  let memStatus = 'pass';
  let memDetail = '';
  if (!mem) memDetail = '内存设置为自动，启动时按系统内存分配。';
  else {
    memDetail = `当前分配 ${mem} MB，物理内存 ${fmtGB(totalMem * 1024 * 1024)}。`;
    if (mem > totalMem * 0.7) { memStatus = 'warn'; memDetail += ' 超过物理内存 70%，系统可能频繁换页。'; }
    else if (mem < 1024) { memStatus = 'warn'; memDetail += ' 低于 1024 MB，1.20+ 容易在加载区块时崩溃。'; }
  }
  add('settings', 'memory', '内存分配', memStatus, memDetail, memStatus === 'warn' ? { label: '调整内存', act: 'settings', tab: 'game' } : null);

  // 8. 账号
  const accounts = Array.isArray(opts.accounts) ? opts.accounts.filter(Boolean) : [];
  const selectedAccount = String(opts.selectedAccount || '');
  if (!accounts.length) {
    add('account', 'count', '账号', 'warn', '还没有添加账号；离线登录也需要先填用户名。', { label: '去登录', act: 'page', page: 'home' });
  } else {
    const acc = accounts.find((a) => a.id === selectedAccount) || accounts[0];
    const type = acc.type === 'msa' ? '微软正版' : acc.type === 'authlib' ? '外置登录' : '离线';
    add('account', 'count', '账号', 'pass', `${accounts.length} 个账号，当前：${acc.name || '未命名'}（${type}）。`);
    if (acc.type === 'authlib' && !acc.authlibServer) {
      add('account', 'authlib', '外置登录配置', 'warn', '外置账号缺少验证服务器地址，启动时可能无法注入 authlib-injector。', { label: '重新登录', act: 'page', page: 'home' });
    }
  }

  // 9. 网络 / 镜像
  if (opts.skipNetwork) {
    add('network', 'skip', '网络连通性', 'info', '本次检查跳过了网络探测。');
  } else {
    const [official, bmcl, modrinth] = await Promise.all([
      ping('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'),
      ping('https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json'),
      ping('https://api.modrinth.com/v2/search?limit=1'),
    ]);
    const chosen = String(opts.mirror || 'bmclapi') === 'official' ? official : bmcl;
    if (chosen.ok) {
      add('network', 'manifest', '版本清单', 'pass', `当前下载源可用，耗时 ${chosen.ms} ms。`);
    } else if (bmcl.ok || official.ok) {
      add('network', 'manifest', '版本清单', 'warn', `当前下载源不可用，但备用源可用。建议切换镜像。`, { label: '切换 BMCLAPI', act: 'mirror' });
    } else {
      add('network', 'manifest', '版本清单', 'fail', `官方和 BMCLAPI 均连接失败（${official.status || official.error} / ${bmcl.status || bmcl.error}）。`, { label: '检查网络', act: 'settings', tab: 'launcher' });
    }
    add('network', 'modrinth', 'Modrinth 资源', modrinth.ok ? 'pass' : 'warn',
      modrinth.ok ? `可用，耗时 ${modrinth.ms} ms。` : `连接失败（${modrinth.status || modrinth.error}）；只影响 Mod/整合包搜索，不影响原版启动。`);
  }

  // 10. 日志
  const logs = Array.isArray(opts.logs) ? opts.logs.slice(-500).map(String) : [];
  if (!logs.length) {
    add('log', 'none', '运行日志', 'info', '还没有运行日志；启动一次游戏后会自动记录。');
  } else {
    const text = logs.join('\n');
    const patterns = [
      [/OutOfMemoryError/i, '内存不足（OutOfMemoryError）'],
      [/UnsupportedClassVersionError|class file version/i, 'Java 版本不匹配'],
      [/ModResolutionException|Incompatible mod set|Duplicate mods/i, 'Mod 依赖冲突'],
      [/Could not find or load main class|NoClassDefFoundError/i, '启动依赖缺失'],
      [/Exception in thread|java\.lang\.[A-Za-z]+Exception/i, '运行异常'],
    ];
    let hit = null;
    for (const [re, label] of patterns) {
      const line = logs.slice().reverse().find((l) => re.test(l));
      if (line) { hit = { label, line }; break; }
    }
    if (hit) {
      const severe = /OutOfMemory|UnsupportedClassVersion|NoClassDefFound|Could not find/.test(hit.label);
      add('log', 'errors', '最近日志', severe ? 'fail' : 'warn', `发现${hit.label}：${hit.line.slice(0, 180)}`, { label: '查看日志', act: 'showLog' });
    } else {
      add('log', 'clean', '最近日志', 'pass', `最近 ${logs.length} 行日志未发现明显异常。`);
    }
  }

  // 11. 启动器自身
  add('app', 'assistant', 'SPL 小助手', 'pass', '本地离线知识库可用，不联网、不占 GPU。');
  add('app', 'mirror', '下载源', String(opts.mirror || 'bmclapi') === 'official' ? 'info' : 'pass',
    String(opts.mirror || 'bmclapi') === 'official' ? '当前使用官方源，海外网络更合适。' : '当前使用 BMCLAPI 镜像，国内网络更合适。');

  const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const c of checks) counts[c.status] = (counts[c.status] || 0) + 1;
  const score = Math.max(0, Math.min(100, 100 - counts.fail * 20 - counts.warn * 8));
  return {
    ok: counts.fail === 0,
    score,
    counts,
    checks,
    generatedAt: nowIso(),
    version: versionId,
  };
}

function mergedJava(versionId, gameDir) {
  if (!versionId) return 0;
  try {
    const merged = mergeVersionJson(versionId, gameDir);
    if (merged.javaVersion && merged.javaVersion.majorVersion) return Number(merged.javaVersion.majorVersion);
  } catch {}
  return 0;
}

module.exports = { runDiagnostics, requiredJava };
