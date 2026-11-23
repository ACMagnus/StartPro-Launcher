'use strict';
/**
 * 原版版本安装：客户端 jar + 依赖库 + 资源文件(assets) + 版本 JSON
 */
const fs = require('fs');
const path = require('path');
const fsp = fs.promises;
const { fetchJson, downloadFile, pool, applyMirror } = require('./net');
const { versionsDir, versionDir } = require('./version');

function osName() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'osx';
  return 'linux';
}

function archName() {
  return process.arch === 'x64' ? 'x86_64' : 'x86';
}

/** 解析库的 rules，判断当前平台是否需要该库 */
function rulesAllow(lib, features = {}) {
  if (!lib.rules) return true;
  let allowed = false;
  for (const rule of lib.rules) {
    let match = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== osName()) match = false;
      if (rule.os.arch && rule.os.arch !== archName() && rule.os.arch !== 'x86') match = false;
      if (rule.os.version) {
        try {
          if (!new RegExp(rule.os.version).test(require('os').release())) match = false;
        } catch {}
      }
    }
    if (rule.features) {
      for (const [k, v] of Object.entries(rule.features)) {
        if (Boolean(features[k]) !== Boolean(v)) match = false;
      }
    }
    if (match) allowed = rule.action === 'allow';
  }
  return allowed;
}

/** 版本 JSON 里某个库需要下载的实际文件 */
function libraryArtifact(lib) {
  if (!rulesAllow(lib)) return null;
  if (lib.downloads && lib.downloads.artifact) return lib.downloads.artifact;
  // 老版本写法：只有 name + url
  if (lib.name && lib.url) {
    const parts = lib.name.split(':');
    const [group, artifact, version] = parts;
    const file = `${artifact}-${version}${parts[3] ? '-' + parts[3] : ''}.jar`;
    const rel = `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`;
    return { path: rel, url: lib.url.replace(/\/$/, '') + '/' + rel, size: 0 };
  }
  return null;
}

/**
 * @param {string} versionId
 * @param {object} ctx { gameDir, mirror, onProgress }
 */
async function installVersion(versionId, ctx) {
  const gameDir = ctx.gameDir;
  const targetId = String(ctx.targetName || '').trim() || versionId;
  const mirror = ctx.mirror || 'official';
  const report = ctx.onProgress || (() => {});

  report({ phase: 'meta', title: '获取版本信息', detail: versionId, current: 0, total: 1 });

  let manifest = ctx.manifest;
  if (!manifest) {
    const hosts = require('./config').MIRROR_HOSTS;
    const host = hosts[mirror] || hosts.official;
    manifest = await fetchJson(host.versionManifest, { timeout: 30000 });
  }
  if (!manifest || !Array.isArray(manifest.versions)) throw new Error('版本清单格式异常');
  const meta = manifest.versions.find((v) => v.id === versionId);
  if (!meta) throw new Error(`未找到版本 ${versionId}`);

  const versionJson = await fetchJson(applyMirror(meta.url, mirror), { timeout: 30000 });
  const vdir = versionDir(gameDir, targetId);
  if (targetId !== versionId && fs.existsSync(vdir)) throw new Error(`版本「${targetId}」已存在，请换一个名称`);
  await fsp.mkdir(vdir, { recursive: true });

  // 1) 客户端 jar
  report({ phase: 'client', title: '下载客户端', detail: `${targetId}.jar`, current: 0, total: 1 });
  const client = versionJson.downloads && versionJson.downloads.client;
  if (client) {
    await downloadFile(applyMirror(client.url, mirror), path.join(vdir, `${targetId}.jar`), {
      sha1: client.sha1,
      size: client.size,
    });
  }
  report({ phase: 'client', title: '下载客户端', detail: `${targetId}.jar`, current: 1, total: 1 });

  // 2) 依赖库
  const libs = (versionJson.libraries || []).filter((l) => rulesAllow(l));
  const nativesDir = path.join(vdir, 'natives');
  await fsp.mkdir(nativesDir, { recursive: true });
  let libDone = 0;
  report({ phase: 'libraries', title: '下载依赖库', detail: `0/${libs.length}`, current: 0, total: libs.length });
  await pool(
    libs,
    24,
    async (lib) => {
      const art = libraryArtifact(lib);
      if (art && art.url) {
        const dest = path.join(gameDir, 'libraries', art.path);
        await downloadFile(applyMirror(art.url, mirror), dest, { sha1: art.sha1 || null, size: art.size || 0 });
      }
      // 老版本 natives（分类器 jar 解压）
      if (lib.natives) {
        const key = lib.natives[osName()];
        if (key && lib.downloads && lib.downloads.classifiers) {
          const cls = lib.downloads.classifiers[key.replace('${arch}', process.arch === 'ia32' ? '32' : '64')];
          if (cls && cls.url) {
            const dest = path.join(gameDir, 'libraries', cls.path);
            await downloadFile(applyMirror(cls.url, mirror), dest, { sha1: cls.sha1, size: cls.size });
            extractNatives(dest, nativesDir);
          }
        }
      }
    },
    (done, total) => {
      libDone = done;
      report({
        phase: 'libraries',
        title: '下载依赖库',
        detail: `${done}/${total}`,
        current: done,
        total,
      });
    }
  );

  // 3) 资源文件
  const assetIndex = versionJson.assetIndex;
  if (assetIndex && assetIndex.url && !ctx.skipAssets) {
    const indexFile = path.join(gameDir, 'assets', 'indexes', `${assetIndex.id}.json`);
    await downloadFile(applyMirror(assetIndex.url, mirror), indexFile, {
      sha1: assetIndex.sha1,
      size: assetIndex.size,
    });
    const indexJson = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
    const objects = Object.values(indexJson.objects || {});
    report({
      phase: 'assets',
      title: '下载资源文件',
      detail: `0/${objects.length}`,
      current: 0,
      total: objects.length,
    });
    const assetBase = mirror === 'bmclapi' ? 'https://bmclapi2.bangbang93.com/assets' : 'https://resources.download.minecraft.net';
    const altBase = mirror === 'bmclapi' ? 'https://resources.download.minecraft.net' : 'https://bmclapi2.bangbang93.com/assets';
    const assetErrors = [];
    await pool(
      objects,
      48,
      async (obj) => {
        const hash = obj.hash;
        const sub = hash.slice(0, 2);
        const dest = path.join(gameDir, 'assets', 'objects', sub, hash);
        try {
          await downloadFile(`${assetBase}/${sub}/${hash}`, dest, { sha1: hash, size: obj.size, retries: 2 });
        } catch (e) {
          // 单个资源文件失败时换镜像再试一次；仍失败则记录，不阻断整体安装
          try {
            await downloadFile(`${altBase}/${sub}/${hash}`, dest, { sha1: hash, size: obj.size, retries: 2 });
          } catch (e2) {
            assetErrors.push(hash);
          }
        }
      },
      (done, total) => {
        if (done % 20 === 0 || done === total)
          report({
            phase: 'assets',
            title: '下载资源文件',
            detail: `${done}/${total}`,
            current: done,
            total,
          });
      }
    );
    // 旧版本资源索引需要建立 virtual / resources 目录，否则 1.6~1.7 会丢失材质与音效
    if (indexJson.virtual) {
      const virtualDir = path.join(gameDir, 'assets', 'virtual', assetIndex.id);
      const entries = Object.entries(indexJson.objects || {});
      report({ phase: 'virtual', title: '建立旧版资源目录', detail: `virtual/${assetIndex.id}`, current: 0, total: entries.length });
      await pool(
        entries,
        24,
        async ([name, obj]) => {
          const sub = obj.hash.slice(0, 2);
          const src = path.join(gameDir, 'assets', 'objects', sub, obj.hash);
          const dst = path.join(virtualDir, name);
          if (!fs.existsSync(src)) return;
          await fsp.mkdir(path.dirname(dst), { recursive: true });
          if (fs.existsSync(dst)) return;
          try {
            await fsp.link(src, dst); // 同一磁盘用硬链接，省空间
          } catch {
            await fsp.copyFile(src, dst);
          }
        },
        (done, total) => {
          if (done % 200 === 0 || done === total)
            report({ phase: 'virtual', title: '建立旧版资源目录', detail: `${done}/${total}`, current: done, total });
        }
      );
    }
    if (indexJson.map_to_resources) {
      const resDir = path.join(gameDir, 'resources');
      const entries = Object.entries(indexJson.objects || {});
      report({ phase: 'virtual', title: '建立 resources 目录', detail: `resources`, current: 0, total: entries.length });
      await pool(
        entries,
        24,
        async ([name, obj]) => {
          const sub = obj.hash.slice(0, 2);
          const src = path.join(gameDir, 'assets', 'objects', sub, obj.hash);
          const dst = path.join(resDir, name);
          if (!fs.existsSync(src)) return;
          await fsp.mkdir(path.dirname(dst), { recursive: true });
          if (fs.existsSync(dst)) return;
          try {
            await fsp.link(src, dst);
          } catch {
            await fsp.copyFile(src, dst);
          }
        }
      );
    }

    if (assetErrors.length) {
      report({
        phase: 'assets',
        title: '资源文件部分失败',
        detail: `${assetErrors.length}/${objects.length} 个文件未下载成功（缺少音效不影响启动）`,
        current: objects.length,
        total: objects.length,
      });
    }
  }

  // 4) 写版本 JSON
  report({ phase: 'finish', title: '写入版本信息', detail: targetId, current: 0, total: 1 });
  const written = targetId === versionId ? versionJson : { ...versionJson, id: targetId };
  await fsp.writeFile(path.join(vdir, `${targetId}.json`), JSON.stringify(written, null, 4), 'utf8');

  // 记录安装清单，避免重复校验
  await fsp.writeFile(
    path.join(vdir, '.pcl2_install.json'),
    JSON.stringify({ installedAt: new Date().toISOString(), source: 'mojang', mirror }, null, 2)
  );

  report({ phase: 'finish', title: '安装完成', detail: targetId, current: 1, total: 1 });
  return { id: targetId, dir: vdir };
}

/** 解压 natives jar 中的本地库文件 */
function extractNatives(jarPath, destDir) {
  try {
    const AdmZip = tryRequire('adm-zip');
    if (AdmZip) {
      const zip = new AdmZip(jarPath);
      for (const entry of zip.getEntries()) {
        const name = entry.entryName;
        if (entry.isDirectory) continue;
        if (name.startsWith('META-INF')) continue;
        if (!/\.(dll|so|dylib|jnilib)$/i.test(name)) continue;
        const out = path.join(destDir, path.basename(name));
        fs.writeFileSync(out, entry.getData());
      }
      return;
    }
    // 无依赖时退回系统 unzip
    const { execFileSync } = require('child_process');
    execFileSync('unzip', ['-o', '-j', jarPath, '*.dll', '*.so', '*.dylib', '-d', destDir], {
      stdio: 'ignore',
    });
  } catch {
    /* natives 解压失败不致命，运行时会有明确报错 */
  }
}

function tryRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

module.exports = { installVersion, rulesAllow, libraryArtifact, osName, archName, extractNatives };
