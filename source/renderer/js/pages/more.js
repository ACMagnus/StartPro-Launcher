/* ============================ 更多 ============================ */
(function () {
  const P = (window.PCLPages = window.PCLPages || {});
  const API = window.API;

  const GUIDES = [
    {
      key: 'minecraft',
      icon: 'box',
      tone: 'grass',
      title: 'Minecraft 新手指南',
      desc: '适用于 Minecraft 新玩家，从安装到进入世界',
      body: '1. 在「下载」页选择版本并点击安装，启动器会自动补齐依赖与资源文件。\n2. 回到「启动」页，添加账号（正版或离线）后点「启动游戏」。\n3. 首次进入世界建议选择「生存模式」，并记住地图种子。',
    },
    {
      key: 'pack',
      icon: 'package',
      tone: 'pack',
      title: '整合包制作指南',
      desc: '介绍整合包的制作方法与 StartPro 相关功能',
      body: '1. 安装一个基础版本（推荐 Fabric 或 Forge）。\n2. 在「下载 → Mod」安装需要的 Mod，并在版本目录的 config 中调整配置。\n3. 在版本设置页的「导出」页导出 ZIP，即可分享给其他人。',
    },
    {
      key: 'resource',
      icon: 'image',
      tone: 'stone',
      title: '资源安装指南',
      desc: '介绍资源包、光影、数据包等的安装',
      body: '资源包放到 .minecraft/resourcepacks，光影放到 shaderpacks。\n在游戏中打开「选项 → 资源包」或安装 Iris 后选择光影即可。',
    },
  ];

  const FAQ = [
    ['游戏崩溃 / 无法启动怎么办？', '先看「更多 → 百宝箱 → 运行日志」里的最后几行；多数是 Java 版本不匹配或 Mod 冲突。'],
    ['如何更换 Java？', '设置 → 游戏 → 游戏 Java，可自动搜索或一键安装 Temurin JDK。'],
    ['下载速度慢？', '设置 → 启动器 → 下载源，切换为 BMCLAPI 镜像。'],
  ];

  P.more = {
    sidebar: true,
    render(state) {
      const pd = state.pageData;
      const tab = pd.moreTab || 'help';
      const q = (pd.helpQuery || '').trim().toLowerCase();
      const info = pd.appInfo || {};
      const logs = state.logs || [];

      const side = [
        ['help', '帮助', 'help'],
        ['about', '关于与鸣谢', 'info'],
        ['toolbox', '百宝箱', 'box'],
      ]
        .map(
          ([id, label, icon]) =>
            `<div class="item ${tab === id ? 'active' : ''}" data-mtab="${id}">${Icons[icon]}<span>${label}</span></div>`
        )
        .join('');

      const matches = (t, d) => !q || (t + ' ' + d).toLowerCase().includes(q);
      const guideRows = GUIDES.filter((g) => matches(g.title, g.desc))
        .map(
          (g) => `<div class="help-row" data-guide="${g.key}">
            <span class="help-ico ${g.tone}">${Icons[g.icon]}</span>
            <div class="help-main"><div class="help-title">${g.title}</div><div class="help-desc">${g.desc}</div></div>
            <span class="help-go">${Icons.chevron}</span>
          </div>`
        )
        .join('');
      const faqRows = FAQ.filter(([t, d]) => matches(t, d))
        .map(
          ([t, d], i) => `<div class="help-row" data-faq="${i}">
            <span class="help-ico faq">?</span>
            <div class="help-main"><div class="help-title">${PCL.esc(t)}</div><div class="help-desc">${PCL.esc(d)}</div></div>
          </div>`
        )
        .join('');

      let body = '';
      if (tab === 'help') {
        body = `
          <div class="ai-banner" data-ai-open>
            <span class="ai-banner-ico">SPL</span>
            <div class="ai-banner-main">
              <div class="ai-banner-title">SPL 小助手 <em>本地 · 不联网</em></div>
              <div class="ai-banner-sub">安装、Java、Mod、登录、报错，直接问它</div>
            </div>
            <button class="btn primary">问 SPL</button>
          </div>
          <div class="help-search"><span class="hs-ico">${Icons.search}</span>
            <input id="helpSearch" placeholder="搜索帮助" value="${PCL.esc(pd.helpQuery || '')}" />
          </div>
          <div class="card more-card">
            <div class="card-title">指南 <span class="sub" style="margin-left:7px">${GUIDES.length} 篇</span><span class="more-chev">${Icons.chevron}</span></div>
            ${guideRows || '<div class="empty" style="padding:24px 0">没有匹配的指南</div>'}
          </div>
          <div class="card more-card mt-10">
            <div class="card-title">常见问题 <span class="sub" style="margin-left:7px">${FAQ.length} 条</span></div>
            ${faqRows || '<div class="empty" style="padding:24px 0">没有匹配的条目</div>'}
          </div>
          <div class="card more-card mt-10">
            <div class="card-title">Minecraft</div>
            <div class="help-row" data-guide="minecraft">
              <span class="help-ico grass">${Icons.box}</span>
              <div class="help-main"><div class="help-title">版本与安装</div><div class="help-desc">查看已安装版本、安装新版本与导入整合包</div></div>
              <span class="help-go">${Icons.chevron}</span>
            </div>
          </div>`;
      } else if (tab === 'about') {
        body = `
          <div class="card more-card">
            <div class="card-title">关于</div>
            <div class="kv">
              <span class="k">启动器</span><span class="v">StartPro Launcher（SPL）· Minecraft 启动器 v${PCL.esc(info.version || '1.0.0')}</span>
              <span class="k">作者</span><span class="v">竹下一刀魂</span>
              <span class="k">运行环境</span><span class="v">${PCL.esc(info.platform || '')} · Electron ${PCL.esc(info.electron || '-')}</span>
              <span class="k">配置目录</span><span class="v ellipsis">${PCL.esc(info.userData || '')}</span>
              <span class="k">物理内存</span><span class="v">${info.totalMem ? (info.totalMem / 1024).toFixed(1) + ' GB' : '—'}</span>
            </div>
            <div class="tiny muted mt-12" style="line-height:1.9">
              StartPro 是对 PCL2 界面的独立复刻实现，与龙腾猫跃及 PCL2 官方无关，不含其任何代码或素材。<br/>
              感谢 PCL2 作者龙腾猫跃、Electron、Minecraft 与 Modrinth 社区。
            </div>
          </div>
          <div class="card more-card mt-10">
            <div class="card-title">鸣谢</div>
            <div class="help-row"><span class="help-ico grass">${Icons.star}</span><div class="help-main"><div class="help-title">龙腾猫跃</div><div class="help-desc">PCL2 原作者，界面与交互设计的来源</div></div></div>
            <div class="help-row"><span class="help-ico stone">${Icons.box}</span><div class="help-main"><div class="help-title">Mojang Studios</div><div class="help-desc">Minecraft 与官方版本清单</div></div></div>
          </div>`;
      } else {
        body = `
          <div class="more-grid">
            <div class="more-tile" data-act="crash"><div class="mt-icon">${Icons.alert}</div><div><div class="mt-title">崩溃分析</div><div class="mt-desc">读取 crash-report / latest.log 并给出排查建议</div></div></div>
            <div class="more-tile" data-act="update"><div class="mt-icon">${Icons.refresh || Icons.download}</div><div><div class="mt-title">检查更新</div><div class="mt-desc">从更新清单获取新版本并下载</div></div></div>
            <div class="more-tile diagnose" data-act="diagnose"><div class="mt-icon">${Icons.shield}</div><div><div class="mt-title">全面检查</div><div class="mt-desc">Java、版本文件、网络、内存、账号一次查完</div></div></div>
            <div class="more-tile" data-act="openDir"><div class="mt-icon">${Icons.folder}</div><div><div class="mt-title">打开游戏目录</div><div class="mt-desc">${PCL.esc(state.settings.gameDir || '')}</div></div></div>
            <div class="more-tile" data-act="openVersions"><div class="mt-icon">${Icons.box}</div><div><div class="mt-title">版本文件夹</div><div class="mt-desc">查看全部已安装版本</div></div></div>
            <div class="more-tile" data-act="preview"><div class="mt-icon">${Icons.cpu}</div><div><div class="mt-title">启动参数预览</div><div class="mt-desc">检查 classpath 与 JVM 参数</div></div></div>
            <div class="more-tile" data-act="log"><div class="mt-icon">${Icons.log}</div><div><div class="mt-title">运行日志</div><div class="mt-desc">最近 ${logs.length} 行输出</div></div></div>
            <div class="more-tile" data-act="config"><div class="mt-icon">${Icons.sliders}</div><div><div class="mt-title">当前配置</div><div class="mt-desc">以 JSON 查看全部设置</div></div></div>
            <div class="more-tile" data-act="links"><div class="mt-icon">${Icons.link}</div><div><div class="mt-title">相关链接</div><div class="mt-desc">PCL2 参考站、Modrinth、Minecraft</div></div></div>
          </div>`;
      }

      return `<div class="sidebar">${side}</div><div class="grow" style="overflow-y:auto">${body}</div>`;
    },

    mount(root, state) {
      const pd = state.pageData;
      PCL.$$('[data-mtab]', root).forEach((el) =>
        el.addEventListener('click', () => {
          pd.moreTab = el.dataset.mtab;
          PCL.render();
        })
      );

      if (!pd.appInfo) {
        API.appInfo().then((i) => {
          pd.appInfo = i;
          if (state.page === 'more') PCL.render();
        });
      }

      const search = PCL.$('#helpSearch', root);
      if (search) {
        let timer = null;
        search.addEventListener('input', () => {
          pd.helpQuery = search.value;
          clearTimeout(timer);
          timer = setTimeout(() => {
            PCL.render().then(() => {
              const s = PCL.$('#helpSearch');
              if (s) {
                s.focus();
                s.setSelectionRange(s.value.length, s.value.length);
              }
            });
          }, 240);
        });
      }

      PCL.$$('[data-ai-open]', root).forEach((el) =>
        el.addEventListener('click', () => PCL.assistant && PCL.assistant.open())
      );

      PCL.$$('[data-guide]', root).forEach((el) =>
        el.addEventListener('click', () => {
          const g = GUIDES.find((x) => x.key === el.dataset.guide);
          if (g)
            PCL.modal({
              title: g.title,
              width: 560,
              body: `<div style="font-size:13px;line-height:1.95;white-space:pre-wrap">${PCL.esc(g.body)}</div>`,
              footer: '<button class="btn primary" data-close>知道了</button>',
            });
        })
      );

      PCL.$$('[data-faq]', root).forEach((el) =>
        el.addEventListener('click', () => {
          const [t, d] = FAQ[Number(el.dataset.faq)];
          PCL.modal({
            title: t,
            width: 520,
            body: `<div style="font-size:13px;line-height:1.9">${PCL.esc(d)}</div>`,
            footer: '<button class="btn primary" data-close>知道了</button>',
          });
        })
      );

      PCL.$$('[data-act]', root).forEach((tile) =>
        tile.addEventListener('click', () => {
          const act = tile.dataset.act;
          if (act === 'diagnose') PCL.diagnostics.open();
          else if (act === 'update') checkUpdate();
          else if (act === 'crash') analyzeCrash();
          else if (act === 'openDir' || act === 'openVersions') API.versions.open('');
          else if (act === 'preview') preview();
          else if (act === 'log') showLog(state);
          else if (act === 'config') showConfig(state);
          else if (act === 'links') showLinks();
        })
      );
    },
  };

  async function checkUpdate(auto = false) {
    if (PCL._updateChecking) return PCL._updateChecking;
    PCL._updateChecking = (async () => {
    const r = await API.update.check();
    if (!r.ok) {
      if (auto) return r;
      PCL.modal({
        title: '检查更新',
        width: 520,
        body: `<div style="font-size:13px;line-height:1.9">${PCL.esc(r.error || '检查更新失败')}</div>
          <div class="tiny muted mt-8">默认使用官方 update.json；也可以在「设置 → 启动器 → 更新清单」填写自定义 JSON 地址。</div>`,
        footer: `<button class="btn" data-open-update>打开更新目录</button><button class="btn primary" data-close>知道了</button>`,
        onMount: (wrap) => wrap.querySelector('[data-open-update]')?.addEventListener('click', () => API.update.openDir()),
      });
      return r;
    }
    if (!r.hasUpdate) {
      if (!auto) PCL.toast(`已是最新版本 ${r.current}`, 'success', 2400);
      return r;
    }
    if (auto && PCL.state.page !== 'home') {
      PCL.toast(`发现新版本 ${r.version}：可在「更多 → 关于」查看`, 'info', 6500);
      return r;
    }
    PCL.modal({
      title: `发现新版本 ${r.version}`,
      width: 620,
      body: `<div class="tiny muted">当前版本 ${PCL.esc(r.current)} → 新版本 ${PCL.esc(r.version)}</div>
        <div style="margin-top:12px;font-size:13px;line-height:1.9;white-space:pre-wrap">${PCL.esc(r.notes || '暂无更新说明')}</div>
        <div class="tiny muted mt-12">更新包会校验 SHA-256；安装时启动器会退出，替换完成后自动重新打开，配置和存档不受影响。</div>`,
      footer: `<button class="btn" data-open-update>打开更新目录</button><button class="btn" data-dl-update>仅下载</button><button class="btn primary" data-install-update>立即更新并重启</button>`,
      onMount: (wrap, close) => {
        wrap.querySelector('[data-open-update]')?.addEventListener('click', () => API.update.openDir());
        wrap.querySelector('[data-dl-update]')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '下载中…';
          const d = await API.update.download(r);
          if (!d.ok) {
            btn.disabled = false;
            btn.textContent = '仅下载';
            PCL.toast(d.error || '下载失败', 'error', 5000);
            return;
          }
          PCL.toast(`更新包已下载：${d.file}`, 'success', 5000);
        });
        wrap.querySelector('[data-install-update]')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '下载并准备更新…';
          const d = await API.update.install(r);
          if (!d.ok) {
            btn.disabled = false;
            btn.textContent = '立即更新并重启';
            PCL.toast(d.error || '自动更新失败', 'error', 6000);
            return;
          }
          btn.textContent = '正在重启…';
          PCL.toast('更新已准备，启动器即将重启完成安装', 'success', 4000);
          close();
        });
      },
    });
    return r;
    })();
    try { return await PCL._updateChecking; }
    finally { PCL._updateChecking = null; }
  }

  async function analyzeCrash() {
    const ver = PCL.currentVersion();
    const r = await API.crash.analyze(ver ? ver.id : '');
    if (!r.ok) {
      PCL.modal({
        title: '崩溃分析',
        width: 520,
        body: `<div style="font-size:13px;line-height:1.9">${PCL.esc(r.error || '没有可分析的日志')}</div>`,
        footer: '<button class="btn primary" data-close>知道了</button>',
      });
      return;
    }
    const causes = (r.causes || []).length
      ? r.causes.map((l) => `<div class="crash-line">${PCL.esc(l)}</div>`).join('')
      : '<div class="tiny muted">日志里没有提取到明确的 Caused by 行。</div>';
    const tips = (r.tips || []).map((t) => `<li>${PCL.esc(t)}</li>`).join('');
    PCL.modal({
      title: '崩溃分析',
      width: 760,
      body: `
        <div class="crash-head">
          <span class="tag">${PCL.esc(r.kind === 'log' ? 'latest.log' : 'crash-report')}</span>
          <span class="grow ellipsis">${PCL.esc(r.name)}</span>
          <span class="tiny muted">${new Date(r.mtime).toLocaleString('zh-CN')}</span>
        </div>
        <div class="crash-summary">${PCL.esc(r.summary)}</div>
        ${r.suspected ? `<div class="crash-sub">${PCL.esc(r.suspected)}</div>` : ''}
        <div class="card-title mt-10" style="font-size:13px">关键堆栈</div>
        <div class="crash-log">${causes}</div>
        <div class="card-title mt-10" style="font-size:13px">排查建议</div>
        <ol class="crash-tips">${tips}</ol>
        <div class="tiny muted mt-8">只读取本地日志，不会上传。</div>`,
      footer: `<button class="btn" data-open-dir>${Icons.folder}打开崩溃目录</button><button class="btn primary" data-close>关闭</button>`,
      onMount: (wrap) => {
        wrap.querySelector('[data-open-dir]')?.addEventListener('click', () => API.crash.openDir(r.dir));
      },
    });
  }

  async function preview() {
    const ver = PCL.currentVersion();
    if (!ver) return PCL.toast('尚未选择版本', 'error');
    const r = await API.launch.preview(ver.id);
    PCL.modal({
      title: '启动参数预览',
      width: 720,
      body: r.ok
        ? `<div class="tiny muted" style="margin-bottom:8px">需要 Java ${r.requiresJava || '未知'} · 分配内存 ${r.memory} MB</div>
           <pre style="font:12px/1.7 'Cascadia Mono',Consolas,monospace;white-space:pre-wrap;word-break:break-all;background:#f6f9fc;border:1px solid var(--line);border-radius:6px;padding:12px;max-height:360px;overflow:auto;user-select:text">${PCL.esc(r.command)}</pre>`
        : `<div class="empty">${PCL.esc(r.error || '')}</div>`,
      footer: `<button class="btn primary" data-close>关闭</button>`,
    });
  }

  function showLog(state) {
    const text = (state.logs || []).join('\n') || '暂无日志：启动一次游戏后会在这里显示输出。';
    PCL.modal({
      title: '运行日志',
      width: 720,
      body: `<pre style="font:12px/1.7 'Cascadia Mono',Consolas,monospace;white-space:pre-wrap;word-break:break-all;background:#f6f9fc;border:1px solid var(--line);border-radius:6px;padding:12px;max-height:420px;overflow:auto;user-select:text">${PCL.esc(text)}</pre>`,
      footer: `<button class="btn primary" data-close>关闭</button>`,
    });
  }

  function showConfig(state) {
    const cfg = { ...state.settings, accounts: state.accounts, versions: state.versions.map((v) => v.id) };
    PCL.modal({
      title: '当前配置',
      width: 680,
      body: `<pre style="font:12px/1.7 'Cascadia Mono',Consolas,monospace;white-space:pre-wrap;background:#f6f9fc;border:1px solid var(--line);border-radius:6px;padding:12px;max-height:420px;overflow:auto;user-select:text">${PCL.esc(JSON.stringify(cfg, null, 2))}</pre>`,
      footer: `<button class="btn primary" data-close>关闭</button>`,
    });
  }

  // 供启动流程调用：自动检查更新（不弹“已是最新版本”的提示）
  P.more.checkUpdate = checkUpdate;

  function showLinks() {
    const links = [
      ['PCL2 官网（爱发电）', 'https://afdian.com/a/LTCat'],
      ['Modrinth', 'https://modrinth.com'],
      ['Minecraft 官网', 'https://www.minecraft.net'],
      ['Fabric Wiki', 'https://fabricmc.net/wiki/'],
      ['BMCLAPI 镜像', 'https://bmclapi2.bangbang93.com'],
    ];
    PCL.modal({
      title: '相关链接',
      width: 520,
      body: links
        .map(
          ([t, u]) => `<div class="row" data-url="${PCL.esc(u)}" style="cursor:pointer">
            <div class="row-main"><div class="row-title">${PCL.esc(t)}</div><div class="row-desc">${PCL.esc(u)}</div></div>
            <span style="color:var(--accent)">${Icons.chevron}</span>
          </div>`
        )
        .join(''),
      footer: `<button class="btn primary" data-close>关闭</button>`,
      onMount: (wrap) => {
        PCL.$$('[data-url]', wrap).forEach((r) =>
          r.addEventListener('click', () => API.openExternal(r.dataset.url))
        );
      },
    });
  }
})();
