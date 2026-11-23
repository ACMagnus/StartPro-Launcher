'use strict';
/**
 * 启动参数构建与游戏进程管理
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { mergeVersionJson, versionGameDir, versionDir } = require('./version');
const { rulesAllow, libraryArtifact, osName } = require('./install');

/** 离线账号 UUID：与官方一致（MD5("OfflinePlayer:"+name) 带连字符） */
function offlineUuid(name) {
  const hex = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 选择默认最大内存：物理内存 1/4，限制在 512~8192 */
function defaultMemory() {
  const gb = Math.floor(os.totalmem() / 1024 / 1024 / 1024);
  const quarter = Math.floor(gb / 4);
  return Math.max(512, Math.min(8192, (quarter || 1) * 1024));
}

function fillPlaceholders(str, vars) {
  return str.replace(/\$\{([^}]+)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : ''));
}

/** 处理 arguments 数组里的 rules 对象 */
function collectArgs(list, features, vars) {
  const out = [];
  for (const item of list || []) {
    if (typeof item === 'string') {
      out.push(fillPlaceholders(item, vars));
      continue;
    }
    if (item && typeof item === 'object' && item.value) {
      if (!item.rules || rulesAllow({ rules: item.rules }, features)) {
        const vals = Array.isArray(item.value) ? item.value : [item.value];
        for (const v of vals) out.push(fillPlaceholders(v, vars));
      }
    }
  }
  return out;
}

/**
 * 生成启动命令
 * @param {object} opts { versionId, gameDir, isolation, account, javaPath, maxMemory, extraJvmArgs, windowWidth/Height, fullscreen }
 */
function buildLaunch(opts) {
  const {
    versionId,
    gameDir,
    isolation = true,
    account = { name: 'Player', type: 'offline' },
    javaPath,
    maxMemory,
    extraJvmArgs = [],
    authlibJar = '',
    windowWidth,
    windowHeight,
    fullscreen = false,
    serverAddress = '',
  } = opts;

  const version = mergeVersionJson(versionId, gameDir);
  const vdir = versionDir(gameDir, versionId);
  const natives = path.join(vdir, 'natives');
  fs.mkdirSync(natives, { recursive: true });

  // 组装 classpath
  const cp = [];
  for (const lib of version.libraries || []) {
    if (!rulesAllow(lib)) continue;
    const art = libraryArtifact(lib);
    if (!art || !art.path) continue;
    const abs = path.join(gameDir, 'libraries', art.path);
    if (fs.existsSync(abs)) cp.push(abs);
  }
  // 客户端 jar：衍生版本（Fabric/Forge/整合包）没有独立 jar 时沿 inheritsFrom 链回溯
  const clientJar = resolveClientJar(versionId, gameDir);
  if (clientJar) cp.push(clientJar);

  const runDir = versionGameDir(gameDir, versionId, isolation);
  fs.mkdirSync(runDir, { recursive: true });

  const assetIndexId = version.assetIndex ? version.assetIndex.id : version.assets || 'legacy';
  const vars = {
    auth_player_name: account.name || 'Player',
    version_name: versionId,
    game_directory: runDir,
    assets_root: path.join(gameDir, 'assets'),
    game_assets: path.join(gameDir, 'assets', 'virtual', assetIndexId),
    assets_index_name: assetIndexId,
    auth_uuid: account.uuid || offlineUuid(account.name || 'Player'),
    auth_access_token: account.accessToken || '0',
    auth_session: account.accessToken ? `token:${account.accessToken}` : '-',
    user_type: account.type === 'msa' ? 'msa' : account.type === 'authlib' ? 'mojang' : 'legacy',
    version_type: version.type || 'release',
    user_properties: account.properties ? JSON.stringify(account.properties) : '{}',
    natives_directory: natives,
    launcher_name: 'StartPro Launcher',
    launcher_version: '1.2.1',
    classpath: cp.join(path.delimiter),
    classpath_separator: path.delimiter,
    library_directory: path.join(gameDir, 'libraries'),
    resolution_width: String(windowWidth || 854),
    resolution_height: String(windowHeight || 480),
    clientid: '',
    auth_xuid: account.xuid || '',
  };

  const features = { is_demo_user: false, has_custom_resolution: true, has_quick_plays_support: false };
  const jvmArgs = [];
  jvmArgs.push(`-Djava.library.path=${natives}`);
  jvmArgs.push(`-Dminecraft.launcher.brand=${opts.launcherBrand || 'StartPro'}`);
  jvmArgs.push('-Dminecraft.launcher.version=1.2.1');
  if (opts.gameTitle) jvmArgs.push(`-Dminecraft.window.title=${opts.gameTitle}`);
  jvmArgs.push('-Dfile.encoding=UTF-8');
  if (version.arguments) {
    const cleaned = collectArgs(version.arguments.jvm || [], features, vars).filter(
      (a) => !a.startsWith('-cp') && !a.startsWith('-classpath') && a !== vars.classpath
    );
    // -cp / -classpath 由我们统一追加，跳过其后的 classpath 值
    for (const a of cleaned) if (a !== vars.classpath && a !== '-cp') jvmArgs.push(a);
  }
  const mem = Math.max(512, Number(maxMemory) || defaultMemory());
  jvmArgs.push(`-Xmn${Math.max(256, Math.floor(mem / 8))}M`, `-Xmx${mem}M`);
  if (opts.optimizeMem) {
    // PCL 的“优化内存”常用 G1 参数：低停顿、并行处理引用、控制新生代占比
    jvmArgs.push(
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20',
      '-XX:G1HeapWastePercent=5',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=15',
      '-XX:G1MixedGCLiveThresholdPercent=90',
      '-XX:G1RSetUpdatingPauseTimePercent=5',
      '-XX:SurvivorRatio=32',
      '-XX:+PerfDisableSharedMem',
      '-XX:MaxTenuringThreshold=1'
    );
  }
  // 外置登录必须把 authlib-injector 作为 javaagent 注入，且要带认证服务器地址
  if (account.type === 'authlib' && account.server) {
    if (!authlibJar) throw new Error('外置登录缺少 authlib-injector，请重新登录或检查网络');
    jvmArgs.push(`-javaagent:${authlibJar}=${account.server}`);
  }
  jvmArgs.push(...extraJvmArgs.filter(Boolean));
  jvmArgs.push('-cp', vars.classpath);

  const gameArgs = [];
  if (version.arguments && version.arguments.game) {
    gameArgs.push(...collectArgs(version.arguments.game, features, vars));
  } else if (version.minecraftArguments) {
    gameArgs.push(...version.minecraftArguments.split(/\s+/).filter(Boolean).map((a) => fillPlaceholders(a, vars)));
  }

  if (fullscreen) gameArgs.push('--fullscreen');
  // 窗口标题：Minecraft 会读取 -Dminecraft.launcher... 但不支持自定义标题，保留参数入口避免静默忽略
  if (serverAddress) {
    const raw = String(serverAddress).trim();
    const m = raw.match(/^([^:]+)(?::(\d+))?$/);
    if (m) {
      const host = m[1];
      const port = m[2] || '25565';
      const modern = String(version.releaseTime || '') >= '2023-06-01';
      if (modern) gameArgs.push('--quickPlayMultiplayer', `${host}:${port}`);
      else gameArgs.push('--server', host, '--port', port);
    }
  }

  const java = javaPath || 'java';
  const cmd = [java, ...jvmArgs, version.mainClass, ...gameArgs];
  return {
    command: java,
    args: [...jvmArgs, version.mainClass, ...gameArgs],
    full: cmd.join(' '),
    cwd: runDir,
    mainClass: version.mainClass,
    requiresJava: version.javaVersion ? version.javaVersion.majorVersion : null,
    memory: mem,
    natives,
    classpath: cp,
  };
}

/** 探测 Java 可执行文件版本信息 */
function probeJava(javaPath) {
  return new Promise((resolve) => {
    execFile(javaPath, ['-version'], { timeout: 8000 }, (err, stdout, stderr) => {
      const text = `${stdout || ''}${stderr || ''}`;
      const m = text.match(/version "([^"]+)"/) || text.match(/(\d+\.\d+[^\s,]*) \(/);
      if (!m) return resolve(null);
      const version = m[1];
      const major = /^1\.(\d+)/.test(version) ? Number(version.split('.')[1]) : Number(version.split('.')[0]);
      resolve({ path: javaPath, version, major, output: text.trim().split('\n')[0] });
    });
  });
}

/** 自动寻找可用 Java：设置 → PATH → 常见目录 */
async function detectJavaList(extraPaths = []) {
  const candidates = new Set();
  for (const p of extraPaths) if (p) candidates.add(p);
  const exe = osName() === 'windows' ? 'java.exe' : 'java';
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) candidates.add(p);
  }
  const common = [
    '/usr/lib/jvm',
    '/usr/local/lib/jvm',
    path.join(os.homedir(), '.jdks'),
    'C:/Program Files/Java',
    'C:/Program Files (x86)/Java',
    'C:/Program Files/Eclipse Adoptium',
    'C:/Program Files/Microsoft',
    'C:/Program Files/BellSoft',
  ];
  for (const root of common) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const p = path.join(root, dir, 'bin', exe);
      if (fs.existsSync(p)) candidates.add(p);
      const p2 = path.join(root, dir, dir, 'bin', exe);
      if (fs.existsSync(p2)) candidates.add(p2);
    }
  }
  const results = [];
  const seen = new Set();
  for (const p of candidates) {
    let real = p;
    try {
      real = fs.realpathSync(p);
    } catch {
      /* 保留原路径 */
    }
    if (seen.has(real)) continue;
    seen.add(real);
    const info = await probeJava(real);
    if (info) results.push(info);
  }
  return results.sort((a, b) => b.major - a.major);
}

/** 启动游戏，返回 { proc, logFile, done(promise) } */
function launchGame(opts, hooks = {}) {
  const built = buildLaunch(opts);
  const logsDir = path.join(versionDir(opts.gameDir, opts.versionId), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `pcl2-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const proc = spawn(built.command, built.args, {
    cwd: built.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  const onLine = (line) => {
    logStream.write(line + '\n');
    if (hooks.onLog) hooks.onLog(line);
  };
  let exited = false;
  const finish = (code, err) => {
    if (exited) return;
    exited = true;
    if (err) onLine(`[StartPro] 启动失败：${err.message}`);
    else onLine(`[StartPro] 游戏进程退出，代码 ${code}`);
    logStream.end();
    if (hooks.onExit) hooks.onExit(code, err);
  };
  proc.stdout.on('data', (d) => d.toString('utf8').split(/\r?\n/).forEach((l) => l && onLine(l)));
  proc.stderr.on('data', (d) => d.toString('utf8').split(/\r?\n/).forEach((l) => l && onLine(l)));
  proc.on('close', (code) => finish(code));
  proc.on('error', (e) => finish(-1, e));

  return { proc, logFile, built };
}

/** 沿 inheritsFrom 链寻找真实存在的客户端 jar */
function resolveClientJar(versionId, gameDir, depth = 0) {
  if (depth > 4) return null;
  const jar = path.join(versionDir(gameDir, versionId), `${versionId}.jar`);
  if (fs.existsSync(jar)) return jar;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(path.join(versionDir(gameDir, versionId), `${versionId}.json`), 'utf8'));
  } catch {
    return null;
  }
  if (json.inheritsFrom) return resolveClientJar(json.inheritsFrom, gameDir, depth + 1);
  return null;
}

module.exports = { buildLaunch, launchGame, detectJavaList, probeJava, offlineUuid, defaultMemory, resolveClientJar };
