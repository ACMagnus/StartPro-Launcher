'use strict';
/**
 * 本地崩溃分析：扫描 crash-reports / logs/latest.log，提取 Description、
 * Suspected Mods、Caused by 等关键行，并给出可执行的排查建议。
 */
const fs = require('fs');
const path = require('path');
const { versionGameDir } = require('./version');

function readHead(file, limit = 2 * 1024 * 1024) {
  const st = fs.statSync(file);
  const size = Math.min(st.size, limit);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, 0);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function collectCandidates(gameDir, versionId, isolation) {
  const bases = [];
  if (versionId) bases.push(versionGameDir(gameDir, versionId, isolation));
  bases.push(gameDir);
  const seen = new Set();
  const out = [];
  for (const base of bases) {
    if (!base || seen.has(base)) continue;
    seen.add(base);
    for (const sub of ['crash-reports', 'logs']) {
      const dir = path.join(base, sub);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!/\.(txt|log)$/i.test(name)) continue;
        if (sub === 'logs' && !/^latest\.log$/i.test(name) && !/crash/i.test(name)) continue;
        const file = path.join(dir, name);
        try {
          const st = fs.statSync(file);
          if (!st.isFile() || st.size < 200) continue;
          out.push({ file, name, dir, mtime: st.mtimeMs, size: st.size, kind: sub === 'logs' ? 'log' : 'crash' });
        } catch {}
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function findLine(lines, regex) {
  for (const line of lines) if (regex.test(line)) return line.trim();
  return '';
}

function analyze({ gameDir, versionId, isolation = true } = {}) {
  const candidates = collectCandidates(gameDir, versionId, isolation);
  if (!candidates.length) {
    return { ok: false, error: '没有找到 crash-reports 或 logs/latest.log。先启动一次游戏，崩溃后再来分析。' };
  }
  const latest = candidates[0];
  let raw = '';
  try {
    raw = readHead(latest.file);
  } catch (e) {
    return { ok: false, error: `读取日志失败：${e.message || e}` };
  }
  const lines = raw.split(/\r?\n/).map((l) => l.trimEnd());
  const summary =
    findLine(lines, /^Description:\s*/i) ||
    findLine(lines, /^Failure message:\s*/i) ||
    findLine(lines, /^Crash report:\s*/i) ||
    findLine(lines, /Exception in thread|java\.lang\.[A-Za-z]+Exception|OutOfMemoryError/i) ||
    '未能从日志中提取明确原因';
  const suspected = findLine(lines, /^Suspected Mods:\s*/i);
  const causes = lines
    .filter((l) => /Caused by:|OutOfMemoryError|NoClassDefFoundError|ClassNotFoundException|AccessDeniedException|OpenGL|LWJGL|GLFW|Mixin|Mod .* (failed|requires)|Fabric|Forge|NeoForge/i.test(l))
    .slice(0, 24);
  const excerpt = lines.filter((l) => l.trim()).slice(0, 80).join('\n');

  const tips = [];
  const hay = raw.slice(0, 200000);
  if (/OutOfMemoryError|Java heap space|GC overhead/i.test(hay)) tips.push('内存不足：在设置里提高最大内存，或减少 Mod / 降低渲染距离。');
  if (/NoClassDefFoundError|ClassNotFoundException|UnsupportedClassVersionError/i.test(hay)) tips.push('缺库或 Java 版本不匹配：先运行「全面检查」，再确认该版本要求的 Java。');
  if (/AccessDeniedException|Permission denied|另一个程序正在使用/i.test(hay)) tips.push('文件被占用或权限不足：关闭游戏/杀毒软件后重试，或把游戏目录放到非系统盘。');
  if (/OpenGL|LWJGL|GLFW|graphics|显卡/i.test(hay)) tips.push('图形/驱动问题：更新显卡驱动，或尝试关闭光影/降低画质。');
  if (/Mixin|mod|fabric|forge|neoforge/i.test(hay)) tips.push('Mod 或加载器冲突：先禁用最近安装的 Mod，再用二分法排查；缺少前置时到「下载 → Mod」补装。');
  if (!tips.length) tips.push('先把 crash-reports 里的完整报告发出来，或点「打开崩溃目录」查看堆栈顶部。');

  return {
    ok: true,
    file: latest.file,
    name: latest.name,
    dir: latest.dir,
    kind: latest.kind,
    mtime: latest.mtime,
    size: latest.size,
    summary,
    suspected,
    causes,
    excerpt,
    tips,
  };
}

module.exports = { analyze, collectCandidates };
