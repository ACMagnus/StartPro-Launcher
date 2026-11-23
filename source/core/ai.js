'use strict';
/**
 * 内置 AI：调用 OpenAI 兼容接口（DeepSeek / OpenAI / Ollama / 自定义）。
 * API Key 只从本机配置读取，不写入日志，也不回传给渲染进程。
 */

function normalizeBase(baseUrl) {
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('没有填写 AI 接口地址');
  // 允许用户直接粘贴完整的 /chat/completions 地址
  base = base.replace(/\/chat\/completions$/i, '');
  return base;
}

function authHeaders(apiKey) {
  const key = String(apiKey || '').trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function explainHttpError(status, body) {
  let detail = '';
  try {
    const data = JSON.parse(body);
    detail = (data.error && (data.error.message || data.error.code)) || data.message || '';
  } catch {
    detail = String(body || '').slice(0, 300);
  }
  if (status === 401 || status === 403) return 'AI 接口认证失败：检查 API Key 或模型权限';
  if (status === 404) return 'AI 接口路径不正确：Base URL 一般以 /v1 结尾';
  if (status === 429) return 'AI 接口限流或余额不足，请稍后重试';
  return `AI 接口返回 HTTP ${status}${detail ? `：${detail}` : ''}`;
}

function systemPrompt(context) {
  const c = context && typeof context === 'object' ? context : {};
  const versions = Array.isArray(c.versions) ? c.versions.slice(0, 40).join('、') : '';
  const javas = Array.isArray(c.java) ? c.java.join(' / ') : '';
  const logs = String(c.recentLogs || '').slice(-1800);
  return [
    '你是 StartPro Launcher（SPL）内置的 Minecraft 启动器助手，用简体中文回答。',
    '回答要具体、可操作，优先结合下面的启动器真实状态；不确定时不要编造文件路径或按钮位置。',
    '你可以回答 Minecraft 启动器使用、Java、Forge/Fabric/NeoForge、Mod/整合包、登录、崩溃排查等常见问题，也可以回答普通技术问题。',
    '不要声称你已替用户执行了安装或修改；需要操作时，告诉用户去哪个页面。',
    '',
    '当前启动器状态：',
    `- 当前页面：${c.page || '未知'}`,
    `- 启动器版本：${c.launcherVersion || '未知'}`,
    `- 当前选中版本：${c.currentVersion || '未选择'}`,
    `- 版本清单最新正式版：${c.latestRelease || '未加载'}`,
    `- 版本清单最新快照：${c.latestSnapshot || '未加载'}`,
    `- 已安装版本：${versions || '无'}`,
    `- 游戏目录：${c.gameDir || '未设置'}`,
    `- 下载源：${c.mirror || '未知'}`,
    `- 版本隔离：${c.isolation ? '开启' : '关闭'}`,
    `- 分配内存：${c.maxMemory ? `${c.maxMemory} MB` : '自动'}`,
    `- 已检测 Java：${javas || '未检测'}`,
    `- 账号数量：${Number(c.accountCount) || 0}`,
    logs ? `- 最近启动日志：\n${logs}` : '- 最近启动日志：无',
  ].join('\n');
}

async function request(config, path, payload, timeout = 60000) {
  const base = normalizeBase(config.baseUrl);
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(config.apiKey),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new Error('AI 接口超时，请检查网络或换一个接口');
    throw new Error(`连接 AI 接口失败：${e && e.message ? e.message : e}。请检查 Base URL 和网络，Ollama 需先启动服务`);
  }
  if (!res.ok) throw new Error(explainHttpError(res.status, await res.text()));
  return res.json();
}

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .slice(-10)
    .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 4000) }));
}

function extractText(data) {
  const choice = data && data.choices && data.choices[0];
  let text = choice && choice.message && choice.message.content;
  if (Array.isArray(text)) text = text.map((x) => (typeof x === 'string' ? x : x && x.text)).filter(Boolean).join('\n');
  return text ? String(text).trim() : '';
}

function buildPayload({ model, messages, context, temperature, stream }) {
  return {
    model,
    messages: [{ role: 'system', content: systemPrompt(context) }, ...messages],
    temperature: Math.max(0, Math.min(1, Number(temperature) || 0.35)),
    max_tokens: 1200,
    stream: !!stream,
  };
}

async function chat({ baseUrl, apiKey, model, messages, context, temperature = 0.35 }) {
  const modelName = String(model || '').trim();
  if (!modelName) throw new Error('没有填写 AI 模型名');
  const safeMessages = normalizeMessages(messages);
  if (!safeMessages.length) throw new Error('没有可发送的对话内容');
  const data = await request(
    { baseUrl, apiKey },
    '/chat/completions',
    buildPayload({ model: modelName, messages: safeMessages, context, temperature, stream: false })
  );
  const text = extractText(data);
  if (!text) throw new Error('AI 没有返回内容');
  return { text, model: data.model || modelName };
}

/**
 * 流式对话。OpenAI 兼容接口返回 SSE；不支持 SSE 的接口会退化为一次性 JSON。
 */
async function chatStream({ baseUrl, apiKey, model, messages, context, temperature = 0.35, onDelta }) {
  const modelName = String(model || '').trim();
  if (!modelName) throw new Error('没有填写 AI 模型名');
  const safeMessages = normalizeMessages(messages);
  if (!safeMessages.length) throw new Error('没有可发送的对话内容');
  const base = normalizeBase(baseUrl);
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify(buildPayload({ model: modelName, messages: safeMessages, context, temperature, stream: true })),
      signal: AbortSignal.timeout(90000),
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new Error('AI 接口超时，请检查网络或换一个接口');
    throw new Error(`连接 AI 接口失败：${e && e.message ? e.message : e}。请检查 Base URL 和网络，Ollama 需先启动服务`);
  }
  if (!res.ok) throw new Error(explainHttpError(res.status, await res.text()));

  const type = String(res.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/event-stream') || !res.body) {
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('AI 接口没有返回可解析的内容'); }
    const text = extractText(data);
    if (!text) throw new Error('AI 没有返回内容');
    try { if (onDelta) onDelta(text); } catch {}
    return { text, model: data.model || modelName };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let outModel = modelName;
  let finished = false;

  const consume = (raw) => {
    if (!raw || raw === '[DONE]') { if (raw === '[DONE]') finished = true; return; }
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (data && data.error) throw new Error(data.error.message || data.error.code || 'AI 流式接口返回错误');
    if (data && data.model) outModel = data.model;
    const delta = data && data.choices && data.choices[0] && data.choices[0].delta;
    let piece = delta && delta.content;
    if (Array.isArray(piece)) piece = piece.map((x) => (typeof x === 'string' ? x : x && x.text)).filter(Boolean).join('');
    if (!piece) return;
    text += piece;
    try { if (onDelta) onDelta(piece); } catch {}
  };

  const consumeLines = (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) consume(trimmed.slice(5).trim());
      if (finished) break;
    }
  };

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      consumeLines(decoder.decode(value, { stream: true }));
    }
    consumeLines(decoder.decode());
    if (buffer.trim().startsWith('data:')) consume(buffer.trim().slice(5).trim());
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  if (!text) throw new Error('AI 没有返回内容');
  return { text, model: outModel };
}

async function listModels({ baseUrl, apiKey }) {
  const base = normalizeBase(baseUrl);
  const res = await fetch(`${base}/models`, {
    headers: { Accept: 'application/json', ...authHeaders(apiKey) },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(explainHttpError(res.status, await res.text()));
  const data = await res.json();
  const rows = Array.isArray(data && data.data) ? data.data : [];
  const models = rows.map((x) => x && (x.id || x.name)).filter(Boolean).map(String);
  return [...new Set(models)].sort();
}

async function test({ baseUrl, apiKey, model }) {
  const r = await chat({
    baseUrl,
    apiKey,
    model,
    messages: [{ role: 'user', content: '只回复：OK' }],
    context: {},
    temperature: 0,
  });
  return { ok: true, reply: r.text.slice(0, 80), model: r.model };
}

module.exports = { chat, chatStream, listModels, test, normalizeBase, systemPrompt };
