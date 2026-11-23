'use strict';
/**
 * 界面冒烟测试：无头 Chromium + DevTools 协议，逐页切换并点击关键按钮，
 * 捕获任何 JS 异常（用于提交前回归）。
 *   node scripts/ui-smoke.js
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 9333;
const URL = 'file://' + path.join(__dirname, '..', 'renderer', 'index.html');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl2-smoke-'));
  const chrome = spawn('chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1024,700', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${prof}`, URL,
  ], { stdio: 'ignore' });

  let targets = [];
  for (let i = 0; i < 30; i++) {
    await wait(400);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      targets = list.filter((t) => t.type === 'page');
      if (targets.length) break;
    } catch {}
  }
  if (!targets.length) throw new Error('无法连接 Chromium');

  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  const errors = [];
  const logs = [];
  let seq = 0;
  const pending = new Map();

  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(d.exception ? `${d.exception.description}` : d.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push('LOG: ' + msg.params.entry.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('CONSOLE: ' + msg.params.args.map((a) => a.value || a.description).join(' '));
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Runtime.enable');
  await send('Log.enable');
  await wait(1500);

  const ev = async (expr, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) {
      errors.push('EVAL: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    }
    return r.result && r.result.value;
  };

  const steps = [
    ['准备', `(async()=>{await new Promise(r=>setTimeout(r,600));return !!window.PCL})()`],
    ['主页', `PCL.go('home')`],
    ['下载页', `PCL.go('download')`],
    ['版本管理', `PCL.go('versions')`],
    ['设置·游戏', `(async()=>{PCL.state.pageData.setTab='game';await PCL.go('settings')})()`],
    ['设置·个性化', `(async()=>{PCL.state.pageData.setTab='personal';await PCL.go('settings')})()`],
    ['设置·启动器', `(async()=>{PCL.state.pageData.setTab='launcher';await PCL.go('settings')})()`],
    ['联机页', `PCL.go('multiplayer')`],
    ['更多页', `PCL.go('more')`],
    ['Java 管理弹窗', `(async()=>{PCL.state.pageData.setTab='game';await PCL.go('settings');await new Promise(r=>setTimeout(r,500));document.getElementById('btnJavaManage').click();await new Promise(r=>setTimeout(r,400));const has=!!document.querySelector('[data-install-java="21"]');document.querySelectorAll('[data-close]').forEach(b=>b.click());return has})()`],
    ['添加账号弹窗', `(async()=>{PCL.addAccountModal();await new Promise(r=>setTimeout(r,200));document.querySelector('#accOk')&&document.querySelector('#accOk').click();await new Promise(r=>setTimeout(r,300));document.querySelectorAll('[data-close]').forEach(b=>b.click())})()`],
    ['版本设置页', `(async()=>{await PCL.go('version',{id:PCL.state.versions[0]?PCL.state.versions[0].id:'1.21.4'});await new Promise(r=>setTimeout(r,900));const ok=!!document.querySelector('.vside-item.active')&&!!document.querySelector('#vdBanner');document.querySelector('[data-vtab="mods"]').click();await new Promise(r=>setTimeout(r,400));document.querySelector('[data-memmode]')&&document.querySelector('[data-vtab="launch"]').click();await new Promise(r=>setTimeout(r,400));await PCL.go('versions');return ok})()`],
    ['版本列表进入设置', `(async()=>{await PCL.go('versions');await new Promise(r=>setTimeout(r,500));const b=document.querySelector('[data-act="detail"]');if(b)b.click();await new Promise(r=>setTimeout(r,800));const ok=!!document.querySelector('.vside');document.getElementById('vdBack')&&document.getElementById('vdBack').click();await new Promise(r=>setTimeout(r,500));return ok})()`],
    ['下载·Mod 搜索', `(async()=>{PCL.state.pageData.dlTab='mod';await PCL.go('download');const i=document.getElementById('searchInput');if(i){i.value='sodium';document.getElementById('btnSearch').click();}await new Promise(r=>setTimeout(r,2500))})()`],
    ['下载·整合包', `(async()=>{PCL.state.pageData.dlTab='pack';await PCL.go('download');const i=document.getElementById('packInput');if(i){i.value='optimized';document.getElementById('btnPackSearch').click();}await new Promise(r=>setTimeout(r,2500))})()`],
    ['下载·自动安装', `(async()=>{PCL.state.pageData.dlTab='auto';await PCL.go('download');await new Promise(r=>setTimeout(r,1500));return !!document.querySelector('.latest-row')})()`],
    ['启动模拟', `(async()=>{await PCL.go('home');const b=document.getElementById('btnLaunch');if(b){b.click();await new Promise(r=>setTimeout(r,2500));}return PCL.state.running})()`],
    ['停止游戏', `(async()=>{document.getElementById('btnStopGame')&&document.getElementById('btnStopGame').click();await new Promise(r=>setTimeout(r,300));document.querySelector('[data-ok]')&&document.querySelector('[data-ok]').click();await new Promise(r=>setTimeout(r,300))})()`],
    ['安装游戏流程', `(async()=>{PCL.state.pageData.dlTab='auto';await PCL.go('download');await new Promise(r=>setTimeout(r,1500));document.querySelector('[data-gv]').click();await new Promise(r=>setTimeout(r,600));const b=document.getElementById('imInstall');if(b)b.click();await new Promise(r=>setTimeout(r,4200));return PCL.state.settings.version})()`],
    ['全面检查', `(async()=>{PCL.state.pageData.moreTab='toolbox';await PCL.go('more');await new Promise(r=>setTimeout(r,500));const tile=document.querySelector('[data-act="diagnose"]');if(!tile)throw new Error('缺少全面检查入口');tile.click();await new Promise(r=>setTimeout(r,900));const rows=document.querySelectorAll('.dg-row').length;const score=document.querySelector('.dg-score')&&document.querySelector('.dg-score').textContent.trim();const btn=document.querySelector('[data-dg-recheck]');if(btn){btn.click();await new Promise(r=>setTimeout(r,700));}document.querySelectorAll('.overlay [data-close]').forEach(b=>b.click());return JSON.stringify({rows,score})})()`],
    ['AI 助手问答', `(async()=>{await PCL.go('more');await new Promise(r=>setTimeout(r,500));const entry=document.querySelector('[data-ai-open]');if(!entry)return 'no-entry';entry.click();await new Promise(r=>setTimeout(r,500));const input=document.getElementById('aiInput');if(!input)return 'no-input';input.value='怎么安装 Fabric';document.getElementById('aiSend').click();await new Promise(r=>setTimeout(r,900));const bubbles=document.querySelectorAll('.ai-bubble.bot').length;const hasFab=!!document.getElementById('aiFab');document.querySelectorAll('[data-close]').forEach(b=>b.click());return JSON.stringify({bubbles,hasFab})})()`],
    ['打开版本选择', `(async()=>{await PCL.go('home');await new Promise(r=>setTimeout(r,400));document.getElementById('btnPickVersion').click();await new Promise(r=>setTimeout(r,300));document.querySelectorAll('[data-close]').forEach(b=>b.click())})()`],
  ];

  for (const [name, expr] of steps) {
    process.stdout.write(`· ${name} … `);
    const t = Date.now();
    await ev(expr);
    await wait(400);
    console.log(`ok (${Date.now() - t}ms)`);
  }

  console.log('\n页面状态：', await ev(`JSON.stringify({page:PCL.state.page, running:PCL.state.running, versions:PCL.state.versions.length, toasts:document.querySelectorAll('.toast').length})`, false));

  ws.close();
  chrome.kill();

  if (errors.length) {
    console.error(`\n发现 ${errors.length} 个 JS 错误：`);
    errors.forEach((e) => console.error(' - ' + String(e).split('\n')[0]));
    process.exit(1);
  }
  console.log('\n界面冒烟测试通过：无 JS 异常');
})().catch((e) => {
  console.error('冒烟测试失败：', e);
  process.exit(1);
});
