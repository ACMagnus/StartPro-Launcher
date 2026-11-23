'use strict';
/**
 * 网络层：JSON 请求、带并发/重试/校验的文件下载
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const fsp = fs.promises;

const UA = 'StartPro/1.2.1 (Electron)';

async function fetchJson(url, { timeout = 20000, retries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error(`请求失败：${lastErr && lastErr.message ? lastErr.message : lastErr}`);
}

async function fetchText(url, { timeout = 20000, retries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error(`请求失败：${lastErr && lastErr.message ? lastErr.message : lastErr}`);
}

async function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const rs = fs.createReadStream(file);
    rs.on('error', reject);
    rs.on('data', (c) => hash.update(c));
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadSegmented(url, dest, size, { timeout = 30 * 60 * 1000, onProgress = null } = {}) {
  if (!size || size < 8 * 1024 * 1024) return downloadOnce(url, dest, { timeout, size, onProgress });
  const parts = size >= 128 * 1024 * 1024 ? 8 : size >= 64 * 1024 * 1024 ? 6 : 4;
  const chunk = Math.ceil(size / parts);
  const tmp = dest + '.tmp';
  await fsp.mkdir(path.dirname(dest), { recursive: true });

  // 直接写入目标临时文件的对应偏移，避免先写 part 再顺序拼接：
  // 少一遍完整磁盘读写，也避免大文件占用双倍临时空间。
  await fsp.writeFile(tmp, Buffer.alloc(0));
  await fsp.truncate(tmp, size);

  const writeAt = async (buf, start) => {
    const fh = await fsp.open(tmp, 'r+');
    try {
      await fh.write(buf, 0, buf.length, start);
    } finally {
      await fh.close();
    }
  };

  const segBytes = new Array(parts).fill(0);
  let lastReport = 0;
  const report = (force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastReport < 250) return;
    lastReport = now;
    onProgress(Math.min(size, segBytes.reduce((a, b) => a + b, 0)), size);
  };
  report(true);

  const tasks = [];
  for (let i = 0; i < parts; i++) {
    const start = i * chunk;
    if (start >= size) break;
    const end = Math.min(size - 1, start + chunk - 1);
    tasks.push((async () => {
      const expected = end - start + 1;
      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': UA, Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity' },
            signal: AbortSignal.timeout(timeout),
          });
          if (res.status !== 206) throw new Error('RANGE_UNSUPPORTED');
          let written = 0;
          segBytes[i] = 0;
          if (res.body) {
            const out = fs.createWriteStream(tmp, { flags: 'r+', start });
            const counter = new Transform({
              transform(chunkBuf, enc, cb) {
                written += chunkBuf.length;
                segBytes[i] = written;
                report();
                cb(null, chunkBuf);
              },
            });
            await pipeline(Readable.fromWeb(res.body), counter, out);
          } else {
            const buf = Buffer.from(await res.arrayBuffer());
            written = buf.length;
            segBytes[i] = written;
            report(true);
            await writeAt(buf, start);
          }
          if (written !== expected) throw new Error('SEGMENT_SIZE_MISMATCH');
          return;
        } catch (e) {
          lastErr = e;
          // Range 不被支持时没必要对每个分段重复重试，直接回退单连接
          if (e && e.message === 'RANGE_UNSUPPORTED') break;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 350));
        }
      }
      throw lastErr || new Error('SEGMENT_FAILED');
    })());
  }

  const settled = await Promise.allSettled(tasks);
  if (settled.some((x) => x.status === 'rejected')) {
    await fsp.unlink(tmp).catch(() => {});
    return downloadOnce(url, dest, { timeout, size, onProgress });
  }
  try {
    const st = await fsp.stat(tmp).catch(() => null);
    if (!st || st.size !== size) throw new Error('SEGMENT_TOTAL_SIZE_MISMATCH');
    await fsp.rename(tmp, dest);
    if (onProgress) onProgress(size, size);
    return (await fsp.stat(dest)).size;
  } finally {
    await fsp.unlink(tmp).catch(() => {});
  }
}

async function downloadOnce(url, dest, { timeout = 30 * 60 * 1000, size = 0, onProgress = null } = {}) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.tmp';
  let start = 0;
  try {
    start = (await fsp.stat(tmp)).size;
  } catch {}
  const headers = { 'User-Agent': UA };
  if (start > 0) headers.Range = `bytes=${start}-`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
  // 服务器不支持 Range 时必须从头覆盖，不能接着旧 tmp 追加
  const append = start > 0 && res.status === 206;
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  let received = append ? start : 0;
  const declared = Number(res.headers.get('content-length') || 0);
  const total = size || (declared ? received + declared : 0);
  let lastReport = 0;
  const report = (force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastReport < 250) return;
    lastReport = now;
    onProgress(total ? Math.min(total, received) : received, total);
  };
  report(true);
  const out = append ? fs.createWriteStream(tmp, { flags: 'a' }) : fs.createWriteStream(tmp, { flags: 'w' });
  // 流式落盘：整合包/客户端 jar 动辄上百 MB，整段读进内存会直接把启动器顶崩
  if (res.body) {
    const counter = new Transform({
      transform(chunkBuf, enc, cb) {
        received += chunkBuf.length;
        report();
        cb(null, chunkBuf);
      },
    });
    await pipeline(Readable.fromWeb(res.body), counter, out);
  } else {
    out.destroy();
    const buf = Buffer.from(await res.arrayBuffer());
    if (append) await fsp.appendFile(tmp, buf);
    else await fsp.writeFile(tmp, buf);
    received += buf.length;
  }
  await fsp.rename(tmp, dest);
  report(true);
  return (await fsp.stat(dest)).size;
}

/**
 * 下载单个文件（带重试 + 可选的 sha1 校验）
 */
async function downloadFile(url, dest, opts = {}) {
  const { sha1 = null, size = 0, retries = 3, onProgress = null } = opts;
  if (await exists(dest)) {
    if (sha1) {
      const h = await sha1File(dest);
      if (h === sha1) return { cached: true, bytes: size };
    } else {
      const st = await fsp.stat(dest).catch(() => null);
      if (!size || (st && st.size === size)) return { cached: true, bytes: size };
    }
    await fsp.unlink(dest).catch(() => {});
  }
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const bytes = size >= 8 * 1024 * 1024
        ? await downloadSegmented(url, dest, size, { onProgress })
        : await downloadOnce(url, dest, { size, onProgress });
      if (size && bytes !== size) throw new Error(`size mismatch ${bytes}/${size}`);
      if (sha1) {
        const h = await sha1File(dest);
        if (h !== sha1) throw new Error('sha1 mismatch');
      }
      if (onProgress) onProgress(bytes, size || bytes);
      return { cached: false, bytes };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw new Error(`下载失败: ${path.basename(dest)} (${lastErr && lastErr.message})`);
}

/**
 * 并发池：按 concurrency 并发执行 tasks，每完成一项回调 onItemDone
 */
async function pool(items, concurrency, worker, onItemDone) {
  let idx = 0;
  let done = 0;
  const errors = [];
  async function run() {
    while (idx < items.length) {
      const cur = idx++;
      try {
        await worker(items[cur], cur);
      } catch (e) {
        errors.push(e);
      }
      done++;
      if (onItemDone) onItemDone(done, items.length, errors.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, run));
  if (errors.length) throw errors[0];
  return done;
}

/** 把 BMCLAPI 镜像规则应用到官方 URL 上 */
function applyMirror(url, mirror) {
  if (mirror !== 'bmclapi') return url;
  return url
    .replace('https://launchermeta.mojang.com', 'https://bmclapi2.bangbang93.com')
    .replace('https://launcher.mojang.com', 'https://bmclapi2.bangbang93.com')
    .replace('https://piston-meta.mojang.com', 'https://bmclapi2.bangbang93.com')
    .replace('https://piston-data.mojang.com', 'https://bmclapi2.bangbang93.com')
    .replace('https://libraries.minecraft.net', 'https://bmclapi2.bangbang93.com/maven')
    .replace('https://resources.download.minecraft.net', 'https://bmclapi2.bangbang93.com/assets');
}

module.exports = { fetchJson, fetchText, downloadFile, pool, sha1File, exists, applyMirror, UA };
