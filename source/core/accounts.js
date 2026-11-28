'use strict';
/**
 * 账号：离线登录 / 外置登录（authlib-injector 兼容的认证服务器）
 */
const crypto = require('crypto');
const { offlineUuid } = require('./launch');

function dashUuid(hex) {
  const u = hex.replace(/-/g, '');
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
}

function addOffline(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('请输入用户名');
  if (n.length > 16) throw new Error('用户名最长 16 个字符');
  if (!/^[A-Za-z0-9_]+$/.test(n)) throw new Error('用户名只能包含字母、数字和下划线');
  return {
    id: offlineUuid(n),
    name: n,
    type: 'offline',
    accessToken: '0',
    createdAt: new Date().toISOString(),
  };
}

/**
 * 外置登录：向 authlib-injector 兼容服务器认证
 * @param {object} opts { server: 'https://example.com/api/yggdrasil', username, password }
 */
async function loginAuthlib({ server, username, password }) {
  const base = String(server || '').replace(/\/$/, '');
  if (!base) throw new Error('请填写认证服务器地址');
  if (!username || !password) throw new Error('请填写账号和密码');
  const clientToken = crypto.randomBytes(16).toString('hex');
  const res = await fetch(`${base}/authserver/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'StartPro/1.2.3' },
    body: JSON.stringify({
      username,
      password,
      clientToken,
      agent: { name: 'Minecraft', version: 1 },
      requestUser: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`认证失败：HTTP ${res.status}`);
  const data = await res.json();
  if (!data.accessToken || !data.selectedProfile) throw new Error('认证返回数据不完整');
  return {
    id: dashUuid(data.selectedProfile.id),
    name: data.selectedProfile.name,
    type: 'authlib',
    accessToken: data.accessToken,
    server: base,
    createdAt: new Date().toISOString(),
  };
}

/** 微软设备码登录：需要用户自己的 Azure 应用 Client ID */
async function startMicrosoft(clientId) {
  const id = String(clientId || '').trim();
  if (!id) throw new Error('请先在 设置 → 启动器 → 微软登录 中填写 Azure 应用 Client ID');
  const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, scope: 'XboxLive.signin offline_access' }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`微软登录初始化失败：${data.error_description || data.error || `HTTP ${res.status}`}`);
  if (!data.device_code || !data.user_code) throw new Error('微软登录返回数据不完整');
  return data;
}

async function postJson(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'StartPro/1.2.3',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const xerr = data.XErr;
    if (xerr === 2148916233) throw new Error('该微软账号没有 Xbox 档案，请先登录 Xbox 官网创建角色');
    if (xerr === 2148916238) throw new Error('该账号是未成年账号，需要家长在 Microsoft 家庭中允许');
    if (xerr === 2148916235) throw new Error('该账号所在地区不支持 Xbox Live');
    throw new Error(data.error_description || data.error || data.Message || `HTTP ${res.status}`);
  }
  return data;
}

/** 轮询设备码；未完成返回 {pending:true} */
async function pollMicrosoft(clientId, deviceCode) {
  const id = String(clientId || '').trim();
  if (!id) throw new Error('缺少 Azure Client ID');
  const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const token = await res.json().catch(() => ({}));
  if (token.error === 'authorization_pending') return { pending: true };
  if (token.error === 'slow_down') return { pending: true, slow: true };
  if (!res.ok || !token.access_token) throw new Error(token.error_description || token.error || '微软登录失败');
  return completeMicrosoft(token.access_token, token.refresh_token || '');
}

/** 用微软 access token 完成 Xbox / XSTS / Minecraft 认证，返回账号对象 */
async function completeMicrosoft(msAccessToken, refreshToken = '') {
  const xbl = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${msAccessToken}`,
    },
    RpsTicket: `d=${msAccessToken}`,
    RpsTicketType: 'ticket',
  });
  const xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT',
  });
  const uhs = xsts.DisplayClaims && xsts.DisplayClaims.xui && xsts.DisplayClaims.xui[0] ? xsts.DisplayClaims.xui[0].uhs : '';
  if (!uhs) throw new Error('Xbox 验证返回缺少 UHS');
  const mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`,
  });
  if (!mc.access_token) throw new Error('Minecraft 登录未返回 access_token');
  const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.access_token}`, 'User-Agent': 'StartPro/1.2.3' },
    signal: AbortSignal.timeout(20000),
  });
  if (!profileRes.ok) throw new Error('该微软账号没有 Minecraft Java 版所有权');
  const profile = await profileRes.json();
  if (!profile.id || !profile.name) throw new Error('Minecraft 档案数据不完整');
  return {
    id: dashUuid(profile.id),
    name: profile.name,
    type: 'msa',
    accessToken: mc.access_token,
    msRefreshToken: refreshToken,
    expiresAt: Date.now() + Number(mc.expires_in || 86400) * 1000,
    skins: Array.isArray(profile.skins) ? profile.skins : [],
    capes: Array.isArray(profile.capes) ? profile.capes : [],
    createdAt: new Date().toISOString(),
  };
}

/** 用 refresh token 续期，避免隔天启动时登录失效 */
async function refreshMicrosoft(clientId, refreshToken) {
  const id = String(clientId || '').trim();
  if (!id || !refreshToken) throw new Error('微软账号缺少 Client ID 或 refresh token，请重新登录');
  const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'XboxLive.signin offline_access',
    }),
    signal: AbortSignal.timeout(20000),
  });
  const token = await res.json().catch(() => ({}));
  if (!res.ok || !token.access_token) throw new Error(token.error_description || token.error || '微软登录续期失败，请重新登录');
  return completeMicrosoft(token.access_token, token.refresh_token || refreshToken);
}

// 兼容旧调用：没有 Client ID 时给出明确指引
async function loginMicrosoft(clientId) {
  return startMicrosoft(clientId);
}

module.exports = { addOffline, loginAuthlib, loginMicrosoft, startMicrosoft, pollMicrosoft, refreshMicrosoft, dashUuid };
