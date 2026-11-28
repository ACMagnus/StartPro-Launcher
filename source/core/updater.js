'use strict';
/**
 * 启动器更新：读取远端 JSON 清单，下载完整包、校验 SHA-256，
 * 在 Windows 上退出旧进程后自动替换文件并重新启动。
 *
 * 清单格式：
 * { "version": "1.2.3", "notes": "...", "url": "https://...zip", "sha256": "..." }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { downloadFile } = require('./net');

const DEFAULT_MANIFEST_URL = 'https://acmagnus.github.io/StartPro-Launcher/update.json';
const fsp = fs.promises;

function compareVersion(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split(/[.\-]/).map((x) => (Number(x) || 0));
  const pb = String(b || '').replace(/^v/i, '').split(/[.\-]/).map((x) => (Number(x) || 0));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(file);
    rs.on('error', reject);
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

async function check(url, currentVersion) {
  const target = String(url || '').trim() || DEFAULT_MANIFEST_URL;
  const res = await fetch(target, {
    headers: { 'User-Agent': `StartPro/${String(currentVersion || '').replace(/[^\w.-]/g, '')}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`更新清单请求失败：HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data.version) throw new Error('更新清单格式不正确');
  return {
    current: currentVersion,
    version: String(data.version),
    notes: String(data.notes || data.changelog || ''),
    url: String(data.url || ''),
    sha256: String(data.sha256 || ''),
    hasUpdate: compareVersion(data.version, currentVersion) > 0,
    checkedAt: new Date().toISOString(),
  };
}

async function downloadUpdate(info, destDir, onProgress = null) {
  if (!info || !info.url) throw new Error('更新清单没有下载地址');
  await fsp.mkdir(destDir, { recursive: true });
  const file = path.join(destDir, `StartPro-${String(info.version).replace(/[^\w.-]/g, '_')}.zip`);
  // 不信任旧缓存：每次重新下载，避免把上次残留的包当成新版本。
  await fsp.rm(file, { force: true }).catch(() => {});
  await downloadFile(info.url, file, { retries: 3, onProgress });
  if (info.sha256) {
    const h = await sha256File(file);
    if (h.toLowerCase() !== info.sha256.toLowerCase()) {
      await fsp.rm(file, { force: true }).catch(() => {});
      throw new Error('更新包 SHA-256 校验失败');
    }
  }
  return { file, size: (await fsp.stat(file)).size };
}

async function findPackageRoot(staging) {
  const candidates = [staging];
  const entries = await fsp.readdir(staging, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    if (ent.isDirectory() && ent.name !== '__MACOSX') candidates.push(path.join(staging, ent.name));
  }
  for (const dir of candidates) {
    const exe = path.join(dir, 'StartPro Launcher.exe');
    const asar = path.join(dir, 'resources', 'app.asar');
    const bat = path.join(dir, 'start.bat');
    if (await fsp.stat(exe).then((s) => s.isFile()).catch(() => false)
      && await fsp.stat(asar).then((s) => s.isFile()).catch(() => false)
      && await fsp.stat(bat).then((s) => s.isFile()).catch(() => false)) {
      return dir;
    }
  }
  throw new Error('更新包结构不完整：缺少 StartPro Launcher.exe、resources/app.asar 或 start.bat');
}

async function stageUpdate(info, destDir, onProgress = null) {
  if (!info || !info.sha256) throw new Error('更新清单缺少 SHA-256，已拒绝自动安装');
  const downloaded = await downloadUpdate(info, destDir, onProgress);
  const safeVersion = String(info.version).replace(/[^\w.-]/g, '_');
  const staging = path.join(destDir, `staging-${safeVersion}`);
  await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
  const zip = new AdmZip(downloaded.file);
  await new Promise((resolve, reject) => {
    zip.extractAllToAsync(staging, true, true, (err) => (err ? reject(err) : resolve()));
  }).catch(async (err) => {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw new Error(`更新包解压失败：${err.message || err}`);
  });
  const root = await findPackageRoot(staging);
  return { root, file: downloaded.file, size: downloaded.size, staging };
}

const APPLY_SCRIPT = String.raw`param(
  [Parameter(Mandatory=$true)][int]$ParentPid,
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][string]$Dest,
  [Parameter(Mandatory=$true)][string]$ExeName,
  [Parameter(Mandatory=$true)][string]$ZipPath
)
$ErrorActionPreference = 'Stop'
$log = Join-Path (Split-Path -Parent $PSCommandPath) 'apply.log'
function Write-Log([string]$Message) {
  Add-Content -LiteralPath $log -Value ('[{0}] {1}' -f (Get-Date).ToString('s'), $Message) -Encoding UTF8
}
Write-Log "waiting for launcher pid $ParentPid"
try { Wait-Process -Id $ParentPid -Timeout 60 -ErrorAction Stop } catch { }
Start-Sleep -Milliseconds 1500
$target = Join-Path $Dest $ExeName
if (-not (Test-Path -LiteralPath $target)) {
  Write-Log 'launcher exe missing before update'
  exit 2
}
# 等待旧进程和 Electron 子进程释放 exe 文件锁
for ($i = 0; $i -lt 20; $i++) {
  try {
    $stream = [System.IO.File]::Open($target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $stream.Close()
    break
  } catch {
    Start-Sleep -Milliseconds 500
  }
}
Write-Log "copying update from $Source to $Dest"
& robocopy $Source $Dest /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NP /LOG+:$log | Out-Null
$code = $LASTEXITCODE
Write-Log "robocopy exit $code"
if ($code -ge 8) {
  Write-Log 'update copy failed'
  if (Test-Path -LiteralPath $target) { Start-Process -FilePath $target -WorkingDirectory $Dest }
  exit $code
}
if (-not (Test-Path -LiteralPath $target)) {
  Write-Log 'updated launcher exe missing'
  exit 2
}
Remove-Item -LiteralPath $Source -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue
Write-Log 'restarting launcher'
Start-Process -FilePath $target -WorkingDirectory $Dest
exit 0
`;

async function installUpdate(info, opts = {}) {
  const { downloadDir, appDir, exePath, parentPid, isPackaged, onProgress } = opts;
  if (!isPackaged) throw new Error('自动安装只支持打包后的 Windows 完整包；开发模式请手动更新');
  if (process.platform !== 'win32') throw new Error('自动安装目前只支持 Windows 完整包');
  if (!downloadDir || !appDir || !exePath || !Number.isFinite(Number(parentPid))) throw new Error('自动更新参数不完整');
  await fsp.access(appDir, fs.constants.W_OK).catch(() => {
    throw new Error('启动器目录不可写，请把程序放到有写入权限的目录后再更新');
  });
  const staged = await stageUpdate(info, downloadDir, onProgress);
  const script = path.join(downloadDir, 'apply-update.ps1');
  await fsp.writeFile(script, APPLY_SCRIPT, 'utf8');
  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', script,
    '-ParentPid', String(parentPid),
    '-Source', staged.root,
    '-Dest', appDir,
    '-ExeName', path.basename(exePath),
    '-ZipPath', staged.file,
  ];
  const child = spawn('powershell.exe', args, {
    cwd: downloadDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return { restarting: true, file: staged.file, staging: staged.root };
}

module.exports = {
  DEFAULT_MANIFEST_URL,
  check,
  downloadUpdate,
  stageUpdate,
  installUpdate,
  compareVersion,
  sha256File,
};
