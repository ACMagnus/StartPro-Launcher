/* ============================================================
   全面检查：运行环境、文件完整性、Java、网络、账号、日志
   ============================================================ */
(function () {
  const PCL = window.PCL;
  const API = window.API;

  const GROUP_NAMES = {
    runtime: '运行环境',
    files: '文件与磁盘',
    version: '版本完整性',
    java: 'Java',
    settings: '启动设置',
    account: '账号',
    network: '网络与镜像',
    log: '运行日志',
    app: '启动器',
  };
  const DOT = { pass: '✓', warn: '!', fail: '×', info: 'i' };
  let lastResult = null;
  let closeModal = null;

  function esc(s) { return PCL.esc(s); }

  function hero(result) {
    const cls = result.counts.fail ? 'fail' : result.counts.warn ? 'warn' : '';
    const title = result.counts.fail
      ? `发现 ${result.counts.fail} 个必须处理的问题`
      : result.counts.warn
        ? `发现 ${result.counts.warn} 个建议优化项`
        : '全部通过，可以放心启动';
    return `<div class="dg-hero ${cls}">
      <div class="dg-score">${result.score}<small>分</small></div>
      <div class="dg-hero-main">
        <div class="dg-hero-title">${esc(title)}</div>
        <div class="dg-hero-sub">检查了运行环境、版本文件、Java、内存、账号、网络与最近日志。</div>
      </div>
      <div class="dg-counts">
        <div class="dg-count"><b>${result.counts.pass}</b>通过</div>
        <div class="dg-count warn"><b>${result.counts.warn}</b>警告</div>
        <div class="dg-count fail"><b>${result.counts.fail}</b>失败</div>
      </div>
    </div>`;
  }

  function rows(result) {
    const groups = {};
    for (const c of result.checks) (groups[c.group] || (groups[c.group] = [])).push(c);
    return Object.entries(groups).map(([g, list]) => `
      <div class="dg-group-title">${esc(GROUP_NAMES[g] || g)}</div>
      ${list.map((c) => `<div class="dg-row">
        <span class="dg-dot ${c.status}">${DOT[c.status] || 'i'}</span>
        <div class="dg-main">
          <div class="dg-title">${esc(c.title)}</div>
          <div class="dg-detail">${esc(c.detail)}</div>
        </div>
        ${c.fix ? `<button class="dg-fix" data-dg-fix="${esc(c.id)}">${esc(c.fix.label)}</button>` : ''}
      </div>`).join('')}
    `).join('');
  }

  function setLoading(wrap) {
    lastResult = null;
    wrap.querySelector('#dgHero').innerHTML = '';
    wrap.querySelector('#dgBody').innerHTML = `<div class="dg-loading">
      <div class="dg-spinner"></div>
      <div>正在全面检查…</div>
      <div class="dg-steps">运行环境 → 游戏目录 → 版本文件 → Java → 网络 → 日志</div>
    </div>`;
    wrap.querySelector('#dgTime').textContent = '检查中';
  }

  async function run(wrap) {
    setLoading(wrap);
    try {
      if (!API.diagnostics || typeof API.diagnostics.run !== 'function') {
        throw new Error('当前版本没有接入检查引擎');
      }
      const result = await API.diagnostics.run(PCL.state.logs || []);
      lastResult = result;
      wrap.querySelector('#dgHero').innerHTML = hero(result);
      wrap.querySelector('#dgBody').innerHTML = rows(result);
      wrap.querySelector('#dgTime').textContent = '检查于 ' + new Date(result.generatedAt).toLocaleTimeString('zh-CN', { hour12: false });
    } catch (e) {
      wrap.querySelector('#dgHero').innerHTML = `<div class="dg-hero fail">
        <div class="dg-score">0<small>分</small></div>
        <div class="dg-hero-main"><div class="dg-hero-title">检查没有完成</div>
        <div class="dg-hero-sub">${esc(e.message || e)}。可以重试，或查看运行日志。</div></div>
      </div>`;
      wrap.querySelector('#dgBody').innerHTML = `<div class="dg-row">
        <span class="dg-dot fail">×</span>
        <div class="dg-main"><div class="dg-title">检查引擎异常</div>
        <div class="dg-detail">${esc(e.message || e)}</div></div>
      </div>`;
      wrap.querySelector('#dgTime').textContent = '检查失败';
    }
  }

  async function applyFix(fix, wrap) {
    if (!fix) return;
    if (fix.act === 'mirror') {
      try {
        await API.settings.set({ mirror: 'bmclapi' });
        PCL.state.settings.mirror = 'bmclapi';
        PCL.toast('已切换到 BMCLAPI 镜像', 'success', 2200);
        await run(wrap);
      } catch (e) {
        PCL.toast('切换失败：' + (e.message || e), 'error', 3000);
      }
      return;
    }
    if (fix.act === 'settings' || fix.act === 'page') {
      if (closeModal) closeModal();
      if (fix.act === 'settings') {
        if (fix.tab) PCL.state.pageData.setTab = fix.tab;
        await PCL.go('settings');
      } else {
        await PCL.go(fix.page || 'home');
      }
      return;
    }
    if (fix.act === 'openDir') {
      API.versions.open('');
      return;
    }
    if (fix.act === 'showLog') {
      if (closeModal) closeModal();
      const logs = (PCL.state.logs || []).join('\n') || '暂无日志：启动一次游戏后会在这里显示输出。';
      PCL.modal({
        title: '运行日志',
        width: 720,
        body: `<pre style="font:12px/1.7 'Cascadia Mono',Consolas,monospace;white-space:pre-wrap;word-break:break-all;background:#f6f9fc;border:1px solid var(--line);border-radius:6px;padding:12px;max-height:420px;overflow:auto;user-select:text">${esc(logs)}</pre>`,
        footer: '<button class="btn primary" data-close>关闭</button>',
      });
    }
  }

  function open() {
    let wrapRef = null;
    const modal = PCL.modal({
      title: '全面检查',
      width: 680,
      body: `<div class="dg-shell">
        <div id="dgHero"></div>
        <div class="dg-body" id="dgBody"></div>
        <div class="dg-footer">
          <span class="dg-time" id="dgTime">准备中</span>
          <button class="btn" data-dg-recheck>重新检查</button>
          <button class="btn primary" data-close>关闭</button>
        </div>
      </div>`,
      onMount: (wrap, close) => {
        wrapRef = wrap;
        closeModal = close;
        wrap.addEventListener('click', (e) => {
          const re = e.target.closest('[data-dg-recheck]');
          if (re) { run(wrap); return; }
          const btn = e.target.closest('[data-dg-fix]');
          if (!btn || !lastResult) return;
          const check = lastResult.checks.find((c) => c.id === btn.dataset.dgFix);
          applyFix(check && check.fix, wrap);
        });
        run(wrap);
      },
    });
    return { modal, wrap: wrapRef };
  }

  PCL.diagnostics = { open, run: () => run(document.querySelector('.dg-shell') || document) };
})();
