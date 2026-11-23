'use strict';
/**
 * 自检脚本：不启动界面，直接跑真实下载链路，验证核心可用
 * 用法： node scripts/selftest.js [版本号] [--full]
 *   --full 会连同资源文件(assets)一起下载（体积较大）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Config, MIRROR_HOSTS } = require('../core/config');
const net = require('../core/net');
const versions = require('../core/version');
const { installVersion } = require('../core/install');
const launch = require('../core/launch');
const fabric = require('../core/fabric');
const modrinth = require('../core/modrinth');

const args = process.argv.slice(2);
const versionId = args.find((a) => !a.startsWith('--')) || '1.21.4';
const full = args.includes('--full');
const gameDir = process.env.PCL2_TEST_DIR || path.join(os.tmpdir(), 'pcl2-selftest');

const log = (...a) => console.log(...a);

(async () => {
  const t0 = Date.now();
  log('========================================');
  log('StartPro 核心自检');
  log('游戏目录:', gameDir);
  log('目标版本:', versionId, full ? '(含资源文件)' : '(跳过资源文件，仅测客户端/依赖库)');
  log('========================================');

  // 1. 版本清单
  const manifest = await net.fetchJson(MIRROR_HOSTS.official.versionManifest);
  log(`[1/6] 版本清单 OK：${manifest.versions.length} 个版本，最新 ${manifest.latest.release}`);

  // 2. 安装
  let lastPct = -1;
  let lastPhase = '';
  const onProgress = (p) => {
    const pct = p.total ? Math.round((p.current / p.total) * 100) : 0;
    if (p.phase !== lastPhase || pct - lastPct >= 20 || pct === 100) {
      log(`      · ${p.title} ${p.detail} ${p.total ? `(${pct}%)` : ''}`);
      lastPct = pct;
      lastPhase = p.phase;
    }
  };
  await installVersion(versionId, {
    gameDir,
    mirror: 'official',
    manifest,
    skipAssets: !full,
    onProgress,
  });
  log(`[2/6] 安装完成：${versionId}`);

  // 3. 本地扫描
  const local = versions.listLocalVersions(gameDir);
  log(`[3/6] 本地版本扫描：${local.map((v) => `${v.id}(${v.loader || '原版'}, ${(v.size / 1048576).toFixed(1)}MB)`).join(', ') || '空'}`);

  const jar = path.join(versions.versionDir(gameDir, versionId), `${versionId}.jar`);
  const jarSize = fs.statSync(jar).size;
  log(`      客户端 jar：${(jarSize / 1048576).toFixed(1)} MB ${jarSize > 1e7 ? '✓' : '✗ 异常'}`);

  // 4. 启动参数
  const acc = { name: 'Steve', type: 'offline' };
  const built = launch.buildLaunch({
    versionId,
    gameDir,
    isolation: true,
    account: acc,
    maxMemory: 2048,
  });
  log(`[4/6] 启动参数构建 OK：mainClass=${built.mainClass}，classpath=${built.classpath.length} 项，Java 要求=${built.requiresJava || '未标注'}`);
  log(`      内存=${built.memory}MB，natives=${built.natives}`);
  const missingCp = built.classpath.filter((p) => !fs.existsSync(p));
  log(`      classpath 缺失文件：${missingCp.length} 个${missingCp.length ? ' → ' + missingCp.slice(0, 3).map((p) => path.basename(p)).join(', ') : ''}`);
  log(`      命令行片段：${built.full.slice(0, 180)}…`);

  // 5. Java
  const javas = await launch.detectJavaList([]);
  log(`[5/6] 检测到 Java ${javas.length} 个：${javas.map((j) => j.major).join(', ')}`);
  const need = built.requiresJava;
  const fit = javas.find((j) => j.major === need) || javas.find((j) => j.major >= need);
  log(`      ${need ? (fit ? `找到匹配 Java ${fit.major}：${fit.path}` : `缺少 Java ${need}`) : '版本未标注 Java 要求'}`);

  // 6. Fabric（基于已安装的原版）
  try {
    const loaders = await fabric.listLoaders();
    const loader = loaders[0].version;
    const r = await fabric.installFabric({
      gameVersion: versionId,
      loaderVersion: loader,
      gameDir,
      installBase: false,
      onProgress: () => {},
    });
    const fabBuilt = launch.buildLaunch({ versionId: r.id, gameDir, isolation: true, account: acc });
    log(`[6/6] Fabric 安装 OK：${r.id}，合并后 mainClass=${fabBuilt.mainClass}，classpath=${fabBuilt.classpath.length} 项`);
  } catch (e) {
    log(`[6/6] Fabric 安装失败：${e.message}`);
  }

  // 附加：Modrinth
  try {
    const r = await modrinth.search({ query: 'sodium', type: 'mod', gameVersion: versionId, limit: 3 });
    log(`[附加] Modrinth 搜索 OK：${r.total} 条结果，首条 ${r.hits[0] && r.hits[0].title}`);
  } catch (e) {
    log(`[附加] Modrinth 搜索失败：${e.message}`);
  }

  // 7. 用假 java 验证启动链路（参数拼装、进程创建、日志回传）
  try {
    const fakeJava = path.join(os.tmpdir(), 'pcl2-fake-java.sh');
    fs.writeFileSync(
      fakeJava,
      '#!/bin/sh\necho "[FAKE-JAVA] args=$# first=$1 last=$#"\necho "[FAKE-JAVA] mainClass=${@: -1}"\nexit 0\n',
      { mode: 0o755 }
    );
    const r = launch.launchGame(
      { versionId, gameDir, isolation: true, account: acc, javaPath: fakeJava, maxMemory: 1024 },
      { onLog: (line) => log('      launch> ' + line) }
    );
    await new Promise((resolve) => r.proc.on('close', resolve));
    log(`[7/7] 启动链路 OK：日志已写入 ${r.logFile}`);
  } catch (e) {
    log(`[7/7] 启动链路失败：${e.message}`);
  }

  log('========================================');
  log(`自检结束，用时 ${((Date.now() - t0) / 1000).toFixed(1)} s`);
})().catch((e) => {
  console.error('自检失败：', e);
  process.exit(1);
});
