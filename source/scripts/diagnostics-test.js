'use strict';
/**
 * 全面检查引擎测试：构造完整版本 / 缺库版本，验证通过项和失败项都能正确识别。
 *   node scripts/diagnostics-test.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runDiagnostics } = require('../core/diagnostics');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-diag-'));
const gameDir = path.join(root, 'game');
const verDir = path.join(gameDir, 'versions', '1.21.4');
fs.mkdirSync(verDir, { recursive: true });
fs.mkdirSync(path.join(gameDir, 'assets', 'indexes'), { recursive: true });
fs.mkdirSync(path.join(gameDir, 'assets', 'objects'), { recursive: true });
fs.writeFileSync(path.join(gameDir, 'assets', 'indexes', 'test.json'), '{}');

const baseJson = {
  id: '1.21.4', type: 'release', mainClass: 'net.minecraft.client.main.Main',
  assetIndex: { id: 'test' }, assets: 'test', javaVersion: { majorVersion: 21 },
  libraries: [], downloads: { client: { size: 1 } },
};
fs.writeFileSync(path.join(verDir, '1.21.4.json'), JSON.stringify(baseJson));
fs.writeFileSync(path.join(verDir, '1.21.4.jar'), 'jar');

const java = path.join(root, 'java21');
fs.writeFileSync(java, '#!/bin/sh\necho \'openjdk version "21.0.1" 2023-10-17\' >&2\n');
fs.chmodSync(java, 0o755);

// 缺一个依赖库的版本
const badDir = path.join(gameDir, 'versions', '2.0');
fs.mkdirSync(badDir, { recursive: true });
fs.writeFileSync(path.join(badDir, '2.0.json'), JSON.stringify({
  id: '2.0', type: 'release', mainClass: 'x', assetIndex: { id: 'test' }, assets: 'test',
  javaVersion: { majorVersion: 21 }, downloads: { client: {} },
  libraries: [{ name: 'com.example:missing:1.0', downloads: { artifact: { path: 'com/example/missing/1.0/missing-1.0.jar', url: 'https://example.invalid/x.jar', size: 1 } } }],
}));
fs.writeFileSync(path.join(badDir, '2.0.jar'), 'jar');

(async () => {
  const common = {
    gameDir, javaPath: java, maxMemory: 2048, totalMem: 16384, freeMem: 9000,
    mirror: 'bmclapi', accounts: [{ id: 'u', name: 'Steve', type: 'offline' }],
    selectedAccount: 'u', logs: [], skipNetwork: true, appVersion: '1.0.5',
    runtime: { electron: '33.4.11', platform: 'linux', arch: 'x64' },
  };
  const good = await runDiagnostics({ ...common, versionId: '1.21.4' });
  const bad = await runDiagnostics({ ...common, versionId: '2.0' });

  const goodFail = good.checks.filter((c) => c.status === 'fail');
  const badFail = bad.checks.filter((c) => c.status === 'fail');
  console.log('完整版本：', good.ok, good.score, good.counts, goodFail.map((c) => c.id));
  console.log('缺库版本：', bad.ok, bad.score, bad.counts, badFail.map((c) => c.id));

  let failed = 0;
  if (!good.ok) { console.error('完整版本不应失败'); failed++; }
  if (goodFail.length) { console.error('完整版本存在失败项'); failed++; }
  if (!badFail.some((c) => c.id === 'libraries')) { console.error('未识别缺失依赖库'); failed++; }
  if (bad.ok) { console.error('缺库版本不应通过'); failed++; }
  fs.rmSync(root, { recursive: true, force: true });
  if (failed) process.exit(1);
  console.log('全面检查引擎测试通过');
})().catch((e) => { console.error(e); fs.rmSync(root, { recursive: true, force: true }); process.exit(1); });
