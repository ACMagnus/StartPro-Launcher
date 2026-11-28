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
    launcher_version: '1.2.2',
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
  jvmArgs.push('-Dminecraft.launcher.version=1.2.2');
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

/** 自动寻找可用 Java：环境变量 → PATH → 注册表 → 常见 JDK 目录 → 常见启动器自带 Java */
function existsFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function existsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function javaHomes(home) {
  const exe = osName() === 'windows' ? 'java.exe' : 'java';
  const raw = String(home || '').trim().replace(/^"|"$/g, '');
  if (!raw) return [];
  const out = [];
  // 直接给了 java.exe / bin 目录 / JDK 根目录 / macOS 的 Contents/Home 都兼容
  if (/^java(\.exe)?$/i.test(path.basename(raw))) out.push(raw);
  if (path.basename(raw).toLowerCase() === 'bin') out.push(path.join(raw, exe));
  out.push(path.join(raw, 'bin', exe));
  out.push(path.join(raw, 'jre', 'bin', exe));
  out.push(path.join(raw, 'Contents', 'Home', 'bin', exe));
  out.push(path.join(raw, 'Home', 'bin', exe));
  return out;
}

function looksLikeJavaDir(name) {
  return /java|jdk|jre|jvm|runtime|temurin|adoptium|corretto|zulu|semeru|graal|openjdk|liberica|sapmachine|dragonwell/i.test(String(name || ''));
}

const JAVA_SKIP_DIRS = new Set([
  'bin', 'lib', 'conf', 'legal', 'include', 'modules', 'jmods', 'man', 'demo', 'sample',
  'cache', 'caches', 'logs', 'downloads', 'node_modules', 'resources', 'locales',
]);

/** 在指定根目录下按 JDK 目录结构扫描，限制深度和目录数量，避免扫全盘 */
function scanJavaRoot(root, maxDepth, source, found, stats) {
  if (!root || stats.dirs >= 2400) return;
  const dir = path.resolve(root);
  if (!existsDir(dir)) return;
  stats.dirs += 1;
  for (const p of javaHomes(dir)) {
    if (existsFile(p) && !found.has(p)) found.set(p, source);
  }
  if (maxDepth <= 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const name = ent.name;
    if (JAVA_SKIP_DIRS.has(name.toLowerCase())) continue;
    const child = path.join(dir, name);
    // 深度由 maxDepth 控制；对明确选定的 JDK/启动器目录逐层检查，
    // 不靠目录名过滤，避免漏掉 `21.0.5-tem`、`jdk-17.0.8` 这类版本目录。
    scanJavaRoot(child, maxDepth - 1, source, found, stats);
  }
}

function registryQuery(key) {
  return new Promise((resolve) => {
    if (osName() !== 'windows') return resolve('');
    execFile('reg.exe', ['query', key, '/s'], { timeout: 7000, windowsHide: true }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}

/** 从 JavaSoft / Adoptium / Microsoft / Zulu 等注册表项里读 JavaHome / Path */
async function registryJavaHomes() {
  if (osName() !== 'windows') return [];
  const keys = [
    'HKLM\\SOFTWARE\\JavaSoft',
    'HKLM\\SOFTWARE\\WOW6432Node\\JavaSoft',
    'HKCU\\SOFTWARE\\JavaSoft',
    'HKLM\\SOFTWARE\\Eclipse Adoptium',
    'HKLM\\SOFTWARE\\WOW6432Node\\Eclipse Adoptium',
    'HKLM\\SOFTWARE\\Microsoft\\JDK',
    'HKLM\\SOFTWARE\\Azul Systems\\Zulu',
    'HKLM\\SOFTWARE\\Amazon Corretto',
    'HKLM\\SOFTWARE\\BellSoft',
    'HKLM\\SOFTWARE\\IBM\\Semeru',
  ];
  const outputs = await Promise.all(keys.map(registryQuery));
  const homes = [];
  const re = /\s(JavaHome|Path|InstallationPath|Installation Directory)\s+REG_[A-Z_]+\s+(.+)$/i;
  for (const text of outputs) {
    for (const line of text.split(/\r?\n/)) {
      const m = re.exec(line);
      if (!m) continue;
      const value = m[2].trim().replace(/^"|"$/g, '');
      if (value && !homes.includes(value)) homes.push(value);
    }
  }
  return homes;
}

function probeCandidates(candidates) {
  const results = [];
  const seen = new Set();
  const queue = candidates.slice(0, 90);
  const worker = async () => {
    while (queue.length) {
      const [p, source] = queue.shift();
      let real = p;
      try {
        real = fs.realpathSync(p);
      } catch {
        /* 保留原路径 */
      }
      if (seen.has(real)) continue;
      seen.add(real);
      const info = await probeJava(real);
      if (info) results.push({ ...info, source: source || '' });
    }
  };
  return Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker)).then(() => results);
}

async function detectJavaList(extraPaths = []) {
  const found = new Map();
  const stats = { dirs: 0 };
  const exe = osName() === 'windows' ? 'java.exe' : 'java';

  // 设置里手动指定的路径优先
  for (const p of extraPaths) {
    if (!p) continue;
    for (const q of javaHomes(p)) if (existsFile(q)) found.set(q, '设置中指定');
    if (existsFile(p)) found.set(p, '设置中指定');
  }

  // JAVA_HOME / JDK_HOME / JRE_HOME
  for (const key of ['JAVA_HOME', 'JDK_HOME', 'JRE_HOME', 'GRAALVM_HOME']) {
    const home = process.env[key];
    if (!home) continue;
    for (const q of javaHomes(home)) if (existsFile(q)) found.set(q, key);
  }

  // PATH 里的 java（以及常见的 bin 目录）
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, exe);
    if (existsFile(p)) found.set(p, 'PATH');
  }

  const home = os.homedir();
  const win = osName() === 'windows';
  const mac = process.platform === 'darwin';
  const roots = [];
  const addRoot = (p, source, depth = 2) => {
    if (p && existsDir(p)) roots.push([p, source, depth]);
  };

  if (win) {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    for (const base of [pf, pf86]) {
      for (const vendor of ['Java', 'Eclipse Adoptium', 'Eclipse Foundation', 'Microsoft', 'Zulu', 'BellSoft', 'Amazon Corretto', 'Semeru', 'IBM\\Semeru', 'GraalVM', 'OpenJDK', 'RedHat', 'SapMachine']) {
        addRoot(path.join(base, vendor), 'Program Files', 2);
      }
    }
    addRoot(path.join(local, 'Programs', 'Eclipse Adoptium'), '用户安装', 2);
    addRoot(path.join(local, 'Programs', 'Microsoft'), '用户安装', 2);
    addRoot(path.join(local, 'Programs', 'Zulu'), '用户安装', 2);
    addRoot(path.join(home, '.jdks'), '用户 JDK', 1);
    addRoot(path.join(home, '.gradle', 'jdks'), 'Gradle 下载', 1);
    addRoot(path.join(appData, 'StartPro Launcher', 'runtime'), '启动器自带', 2);
    addRoot(path.join(local, 'Programs', 'StartPro Launcher', 'runtime'), '启动器自带', 2);
    addRoot(path.join(appData, '.minecraft', 'runtime'), '官方启动器', 2);
    addRoot(path.join(local, 'minecraft', 'runtime'), '官方启动器', 2);
    addRoot(path.join(appData, 'PCL', 'Java'), 'PCL 自带', 2);
    addRoot(path.join(appData, 'PCL2', 'Java'), 'PCL 自带', 2);
    addRoot(path.join(appData, 'HMCL', 'java'), 'HMCL 自带', 2);
    addRoot(path.join(appData, 'PrismLauncher', 'java'), 'Prism 自带', 2);
    addRoot(path.join(appData, 'MultiMC', 'java'), 'MultiMC 自带', 2);
    addRoot(path.join(appData, 'ATLauncher', 'runtime'), 'ATLauncher 自带', 2);
    addRoot(path.join(appData, 'gdlauncher', 'runtime'), 'GDLauncher 自带', 2);
    addRoot(path.join(home, '.lunarclient', 'jre'), 'Lunar 自带', 2);
    // 微软商店版官方启动器的 runtime
    const packages = path.join(local, 'Packages');
    if (existsDir(packages)) {
      try {
        for (const name of fs.readdirSync(packages)) {
          if (/Microsoft\.4297127D64EC6/i.test(name)) {
            addRoot(path.join(packages, name, 'LocalCache', 'Local', 'runtime'), '官方商店版', 2);
          }
        }
      } catch {
        /* ignore */
      }
    }
  } else if (mac) {
    for (const p of [
      '/Library/Java/JavaVirtualMachines',
      '/System/Library/Java/JavaVirtualMachines',
      path.join(home, 'Library/Java/JavaVirtualMachines'),
      '/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home',
    ]) addRoot(p, '系统 Java', 2);
    for (const base of ['/opt/homebrew/opt', '/usr/local/opt']) {
      if (!existsDir(base)) continue;
      try {
        for (const name of fs.readdirSync(base)) {
          if (looksLikeJavaDir(name)) addRoot(path.join(base, name), 'Homebrew', 1);
        }
      } catch {
        /* ignore */
      }
    }
    addRoot('/Applications', '应用程序', 1); // 只扫一层，避免扫整个应用目录
    addRoot(path.join(home, '.sdkman/candidates/java'), 'SDKMAN', 1);
    addRoot(path.join(home, '.jdks'), '用户 JDK', 1);
    addRoot(path.join(home, 'Library/Application Support/PrismLauncher/java'), 'Prism 自带', 2);
    addRoot(path.join(home, 'Library/Application Support/ModrinthApp'), 'Modrinth 自带', 2);
  } else {
    for (const p of [
      '/usr/lib/jvm',
      '/usr/java',
      '/usr/local/lib/jvm',
      '/usr/local/java',
      '/opt/java',
      '/opt/jdk',
      '/opt/openjdk',
      path.join(home, '.jdks'),
      path.join(home, '.sdkman/candidates/java'),
      path.join(home, '.gradle/jdks'),
      path.join(home, '.local/share/PrismLauncher/java'),
      path.join(home, '.local/share/multimc/java'),
      path.join(home, '.local/share/ATLauncher/runtime'),
    ]) addRoot(p, '系统 / 启动器 Java', 2);
    // 一些 Snap 包会把 JDK 放在应用自己的 runtime 下，只扫一层
    addRoot('/snap', 'Snap', 1);
  }

  for (const [root, source, depth] of roots) scanJavaRoot(root, depth, source, found, stats);

  // PATH 里可能还有 java 的软链（Windows 上是 where.exe 返回的多个位置）
  if (win) {
    await new Promise((resolve) => {
      execFile('where.exe', ['java'], { timeout: 4000, windowsHide: true }, (err, stdout) => {
        if (!err && stdout) {
          for (const line of stdout.split(/\r?\n/)) {
            const p = line.trim();
            if (p && existsFile(p)) found.set(p, 'PATH');
          }
        }
        resolve();
      });
    });
  }

  // 注册表可能指向非标准安装目录
  for (const homePath of await registryJavaHomes()) {
    for (const p of javaHomes(homePath)) if (existsFile(p)) found.set(p, '注册表');
  }

  // 兜底：JDK 根目录本身（有些安装器会在 bin 里放 java.exe）
  for (const [p, source] of found) {
    if (!existsFile(p)) found.delete(p);
  }
  if (!found.size) {
    // 没有任何显式路径时，至少尝试 PATH 里的命令名，交给 probeJava 判定
    const p = exe;
    found.set(p, 'PATH');
  }

  const results = await probeCandidates([...found.entries()]);
  return results.sort((a, b) => b.major - a.major || String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));
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
