/* ============================ 主页（启动） ============================ */
(function () {
  const P = (window.PCLPages = window.PCLPages || {});
  const API = window.API;

  const TIPS = [
    '版本隔离开启后，每个版本的 mods 与 config 互不污染。',
    'Java 21 适用于 1.20.5 及以上版本；1.17–1.20.4 用 Java 17。',
    '国内网络下载慢时，可以在设置里切换 BMCLAPI 镜像。',
    '启动失败时，更多 → 百宝箱 → 全面检查 能定位缺库和 Java 问题。',
    '正版账号的登录令牌会自动续期，不需要每次重新登录。',
  ];

  const POWER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3v9"/>
    <path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>
  </svg>`;

  const PICKAXE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912"/>
    <path d="M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393"/>
    <path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/>
    <path d="M19.686 8.314a12.501 12.501 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.319"/>
  </svg>`;

  P.home = {
    render(state) {
      const acc = PCL.currentAccount();
      const ver = PCL.currentVersion();
      const settings = state.settings || {};
      const running = state.running;
      const accounts = state.accounts || [];

      const accountBox = acc
        ? `<select class="select home-user" id="accSelect">
             ${accounts
               .map(
                 (a) =>
                   `<option value="${PCL.esc(a.id)}" ${a.id === acc.id ? 'selected' : ''}>${PCL.esc(a.name)}（${
                     a.type === 'offline' ? '离线' : a.type === 'authlib' ? '外置' : '微软'
                   }）</option>`
               )
               .join('')}
           </select>`
        : `<div class="home-user-wrap"><input class="input home-user" id="homeUser" placeholder="游戏用户名" readonly /><span class="hu-arrow">${Icons.chevron}</span></div>`;

      const launchButton = ver
        ? `<button class="launch-big" id="btnLaunch" ${!acc ? 'disabled' : ''}>
             <span class="lb-title">启动游戏</span>
             <span class="lb-sub">${PCL.esc(ver.id)}</span>
           </button>`
        : `<button class="launch-big primary" id="btnGoDownload">
             <span class="lb-title">下载游戏</span>
             <span class="lb-sub">未找到可用的游戏版本</span>
           </button>`;

      const runningBox = running
        ? (() => {
            const pct = state.runStarted ? 100 : Math.max(0, Math.min(99, Number(state.runProgress) || 0));
            const phase = state.runStarted ? '等待游戏窗口出现' : state.runPhase || '准备启动';
            const login = acc ? (acc.type === 'offline' ? '离线登录' : acc.type === 'msa' ? '微软登录' : '外置登录') : '未登录';
            return `<div class="ll-wrap">
              <div class="ll-top">
                <div class="ll-pick">${PICKAXE}</div>
                <div class="ll-dash"></div>
                <div class="ll-title">${state.runStarted ? '已启动游戏' : '正在启动游戏'}</div>
                <div class="ll-version">${PCL.esc(ver ? ver.id : '-')}</div>
              </div>
              <div class="ll-bar"><i style="width:${pct}%"></i></div>
              <div class="ll-meta">
                <div class="ll-row"><span>当前步骤</span><b>${PCL.esc(phase)}</b></div>
                <div class="ll-row"><span>登录方式</span><b>${PCL.esc(login)}</b></div>
                <div class="ll-row"><span>启动进度</span><b>${pct.toFixed(2)} %</b></div>
              </div>
              <div class="ll-tip">
                <div class="ll-tip-title">你知道吗</div>
                <div class="ll-tip-body">${PCL.esc(state.runTip || TIPS[0])}</div>
              </div>
              <button class="btn block ll-cancel" id="btnStopGame">${state.runStarted ? '结束游戏' : '取消'}</button>
            </div>`;
          })()
        : '';
      const bottomActions = running
        ? ''
        : `<div class="home-actions">
             <button class="btn ${ver ? '' : 'primary'} home-pick" id="btnPickVersion">版本选择</button>
             <button class="btn" id="btnVersionSettings" ${ver ? '' : 'disabled'}>版本设置</button>
           </div>`;

      const news = state.news && state.news[0]
        ? `<div class="card home-notice" id="homeNotice">
             <button class="notice-close" id="btnCloseNotice" title="关闭">×</button>
             <div class="notice-title">${PCL.esc(state.news[0].title)}</div>
             <div class="notice-body">${PCL.esc(state.news[0].body)}</div>
           </div>`
        : '';

      if (running) {
        return `
        <div class="home launch-home">
          <aside class="home-side launch-side">${runningBox}</aside>
          <section class="home-main"></section>
          ${state.runStarted ? `<button class="launch-power" id="btnLaunchPower" title="结束游戏" aria-label="结束游戏">${POWER}</button>` : ''}
        </div>`;
      }

      return `
      <div class="home">
        <aside class="home-side">
          <div class="account-tabs">
            <button class="acct-tab ${acc && acc.type !== 'offline' ? 'on' : ''}" data-acct="msa">${Icons.shield || ''}正版登录</button>
            <button class="acct-tab ${!acc || acc.type === 'offline' ? 'on' : ''}" data-acct="offline">${Icons.user || ''}离线登录</button>
          </div>

          <div class="home-avatar"><canvas id="avatarCanvas"></canvas></div>
          ${accountBox}

          <div class="home-grow"></div>
          ${launchButton}
          ${bottomActions}
        </aside>

        <section class="home-main">
          ${news}
        </section>
      </div>`;
    },

    mount(root, state) {
      const fab = document.getElementById('aiFab');
      if (fab) fab.style.display = state.running ? 'none' : '';
      const canvas = PCL.$('#avatarCanvas', root);
      const acc = PCL.currentAccount();
      if (canvas) {
        PCL.drawHead(canvas, acc ? acc.name : 'Steve');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }

      PCL.$$('[data-acct]', root).forEach((b) =>
        b.addEventListener('click', () => {
          if (b.dataset.acct === 'offline') addAccountModal();
          else microsoftLoginModal();
        })
      );

      const userInput = PCL.$('#homeUser', root);
      if (userInput) userInput.addEventListener('click', () => addAccountModal());

      PCL.$('#btnGoDownload', root)?.addEventListener('click', () => PCL.go('download'));

      PCL.$('#btnCloseNotice', root)?.addEventListener('click', () => {
        const card = PCL.$('#homeNotice', root);
        if (card) card.style.display = 'none';
      });

      const sel = PCL.$('#accSelect', root);
      if (sel)
        sel.addEventListener('change', async () => {
          await API.accounts.select(sel.value);
          state.settings.account = sel.value;
          PCL.render();
        });

      const launchBtn = PCL.$('#btnLaunch', root);
      if (launchBtn)
        launchBtn.addEventListener('click', async () => {
          const ver = PCL.currentVersion();
          if (!ver) return PCL.toast('请先安装并选择一个版本', 'error');
          if (!PCL.currentAccount()) return PCL.toast('请先添加账号', 'error');
          launchBtn.disabled = true;
          launchBtn.textContent = '正在启动…';
          state.logs = [];
          try {
            state.running = true;
            state.runStarted = false;
            state.runProgress = 5;
            state.runPhase = '检查账号';
            state.runDetail = '正在验证登录状态';
            state.runTip = TIPS[Math.floor(Math.random() * TIPS.length)];
            state.runningVersion = ver.id;
            await PCL.render();
            await API.launch.start(ver.id);
            if (state.running) {
              state.runStarted = true;
              state.runProgress = 100;
              state.runPhase = '等待游戏窗口出现';
              state.runDetail = '游戏进程已创建';
              PCL.render();
            }
          } catch (e) {
            const msg = String(e.message || e).replace(/^Error invoking remote method .*?: /, '');
            state.running = false;
            state.runStarted = false;
            state.runProgress = 0;
            if (/已取消启动/.test(msg)) {
              PCL.toast('已取消启动', 'info', 2200);
              state.runPhase = '已取消';
            } else {
              PCL.toast('启动失败：' + msg, 'error', 5000);
            }
            PCL.render();
          }
        });

      const pick = PCL.$('#btnPickVersion', root);
      if (pick)
        pick.addEventListener('click', () => {
          state.pageData.versionKeyword = '';
          PCL.go('select');
        });

      const versionSettings = PCL.$('#btnVersionSettings', root);
      if (versionSettings)
        versionSettings.addEventListener('click', () => {
          if (!state.settings.version) return;
          PCL.go('version', { id: state.settings.version });
        });

      const stopGame = () =>
        PCL.confirm(
          state.runStarted ? '结束游戏' : '取消启动',
          state.runStarted
            ? '确定要结束当前游戏进程吗？未保存的世界进度会丢失。'
            : '确定取消当前启动吗？游戏还没有开始运行。',
          async () => { await API.launch.stop(); },
          state.runStarted ? '结束游戏' : '取消启动'
        );
      const stop = PCL.$('#btnStopGame', root);
      if (stop) stop.addEventListener('click', stopGame);
      const power = PCL.$('#btnLaunchPower', root);
      if (power) power.addEventListener('click', stopGame);

      const viewLog = PCL.$('#btnViewLog', root);
      if (viewLog) viewLog.addEventListener('click', () => PCL.go('more', { tab: 'log' }));

      PCL.$$('[data-quick]', root).forEach((b) =>
        b.addEventListener('click', () => PCL.go(b.dataset.quick, b.dataset.quick === 'versions' ? { id: state.settings.version } : {}))
      );

      PCL.$$('[data-news]', root).forEach((el) =>
        el.addEventListener('click', () => {
          const n = state.news[Number(el.dataset.news)];
          PCL.modal({
            title: n.title,
            width: 560,
            body: `<div class="tiny muted" style="margin-bottom:10px">${PCL.esc(n.tag)} · ${PCL.esc(n.date)}</div>
                   <div style="font-size:13px;line-height:1.9;white-space:pre-wrap">${PCL.esc(n.body)}</div>`,
            footer: `<button class="btn primary" data-close>知道了</button>`,
          });
        })
      );
    },
  };

  /* ---------------------- 微软正版登录（设备码） ---------------------- */
  async function microsoftLoginModal() {
    const clientId = String((PCL.state.settings && PCL.state.settings.msClientId) || '').trim();
    if (!clientId) {
      PCL.toast('请先在 设置 → 启动器 填写 Azure 应用 Client ID', 'info', 4000);
      PCL.state.pageData.setTab = 'launcher';
      PCL.go('settings');
      return;
    }
    let flow;
    try {
      flow = await API.accounts.msaStart();
    } catch (e) {
      PCL.toast(String(e.message || e).replace(/^Error invoking remote method .*?: /, ''), 'error', 5000);
      return;
    }
    let stopped = false;
    let timer = null;
    PCL.modal({
      title: '微软正版登录',
      width: 480,
      body: `<div class="tiny muted" style="line-height:1.8">在浏览器打开下面的地址，输入设备码完成登录：</div>
        <div class="card" style="margin-top:12px;text-align:center;padding:18px">
          <div class="tiny muted">设备码</div>
          <div style="font-size:30px;letter-spacing:4px;font-weight:700;margin:8px 0">${PCL.esc(flow.user_code)}</div>
          <button class="btn primary" id="msOpen">打开登录页</button>
        </div>
        <div class="tiny muted" id="msStatus" style="line-height:1.8">等待浏览器完成验证…</div>`,
      footer: '<button class="btn" data-close>取消</button>',
      onMount: (wrap, close) => {
        PCL.$('#msOpen', wrap)?.addEventListener('click', () => API.openExternal(flow.verification_uri));
        const status = PCL.$('#msStatus', wrap);
        const tick = async () => {
          if (stopped || !document.body.contains(wrap)) return;
          try {
            const r = await API.accounts.msaPoll(flow.device_code);
            if (r && r.pending) {
              if (status) status.textContent = '等待浏览器完成验证…';
              timer = setTimeout(tick, (r.slow ? 10 : flow.interval || 5) * 1000);
              return;
            }
            stopped = true;
            PCL.state.accounts = await API.accounts.list();
            PCL.state.settings.account = r.id;
            PCL.toast(`已登录微软账号 ${r.name}`, 'success', 3000);
            close();
            PCL.render();
          } catch (e) {
            stopped = true;
            if (status) status.style.color = 'var(--danger)';
            if (status) status.textContent = '登录失败：' + String(e.message || e).replace(/^Error invoking remote method .*?: /, '');
            PCL.toast(String(e.message || e).replace(/^Error invoking remote method .*?: /, ''), 'error', 6000);
          }
        };
        timer = setTimeout(tick, (flow.interval || 5) * 1000);
        // 弹窗关闭后停止轮询
        const watcher = setInterval(() => {
          if (!document.body.contains(wrap)) {
            stopped = true;
            clearTimeout(timer);
            clearInterval(watcher);
          }
        }, 1000);
      },
    });
  }

  /* ---------------------- 添加账号弹窗 ---------------------- */
  function addAccountModal() {
    let tab = 'offline';
    const m = PCL.modal({
      title: '添加账号',
      width: 460,
      body: `<div id="accBody"></div>`,
      footer: `<button class="btn" data-close>取消</button><button class="btn primary" id="accOk">添加</button>`,
      onMount: (wrap, close) => {
        const body = wrap.querySelector('#accBody');
        const draw = () => {
          body.innerHTML =
            tab === 'offline'
              ? `<div class="field"><label>用户名</label><div class="control"><input class="input" id="accName" placeholder="3-16 位字母、数字或下划线" maxlength="16" /></div></div>
                 <div class="tiny muted" style="margin-top:8px;line-height:1.7">离线登录仅用于单机与局域网联机，UUID 由用户名按官方算法生成，不需要联网验证。</div>`
              : `<div class="field"><label>认证服务器</label><div class="control"><input class="input" id="accServer" placeholder="https://example.com/api/yggdrasil" /></div></div>
                 <div class="field"><label>邮箱 / 用户名</label><div class="control"><input class="input" id="accName" /></div></div>
                 <div class="field"><label>密码</label><div class="control"><input class="input" id="accPass" type="password" /></div></div>
                 <div class="tiny muted" style="margin-top:8px;line-height:1.7">适用于支持 authlib-injector 的外置登录服务器（如各类皮肤站）。</div>`;
          PCL.$$('[data-tab]', wrap).forEach((b) => b.classList.toggle('primary', b.dataset.tab === tab));
          setTimeout(() => {
            const first = body.querySelector('.input');
            if (first) first.focus();
          }, 20);
        };
        wrap.querySelector('.modal-head span').innerHTML =
          `添加账号 <span class="flex gap-8" style="display:inline-flex;margin-left:12px;vertical-align:middle">
            <button class="btn small outline" data-tab="offline">离线登录</button>
            <button class="btn small outline" data-tab="authlib">外置登录</button>
          </span>`;
        PCL.$$('[data-tab]', wrap).forEach((b) =>
          b.addEventListener('click', () => {
            tab = b.dataset.tab;
            draw();
          })
        );
        draw();

        wrap.querySelector('#accOk').addEventListener('click', async () => {
          try {
            if (tab === 'offline') {
              const name = wrap.querySelector('#accName').value.trim();
              const acc = await API.accounts.addOffline(name);
              PCL.state.accounts = await API.accounts.list();
              PCL.state.settings.account = acc.id;
              PCL.toast(`已添加离线账号 ${acc.name}`, 'success');
            } else {
              const server = wrap.querySelector('#accServer').value.trim();
              const username = wrap.querySelector('#accName').value.trim();
              const password = wrap.querySelector('#accPass').value;
              if (!server || !username || !password) throw new Error('请完整填写认证信息');
              const acc = await API.accounts.authlib({ server, username, password });
              PCL.state.accounts = await API.accounts.list();
              PCL.state.settings.account = acc.id;
              PCL.toast(`已登录 ${acc.name}`, 'success');
            }
            close();
            PCL.render();
          } catch (e) {
            PCL.toast(String(e.message || e).replace('Error invoking remote method \'accounts:authlib\': Error: ', ''), 'error', 4500);
          }
        });
      },
    });
    return m;
  }

  PCL.addAccountModal = addAccountModal;
})();
