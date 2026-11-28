/* ============================ 设置 ============================ */
(function () {
  const P = (window.PCLPages = window.PCLPages || {});
  const API = window.API;

  const TABS = [
    { id: 'game', label: '游戏', icon: 'leaf' },
    { id: 'personal', label: '个性化', icon: 'brush' },
    { id: 'launcher', label: '启动器', icon: 'window' },
    { id: 'network', label: '联机', icon: 'wifi' },
  ];

  const COLORS = ['#1e6fd9', '#2e9e6b', '#e07a2c', '#c94b4b', '#7a5cd6', '#2b3a4d'];

  P.settings = {
    sidebar: true,
    render(state) {
      const pd = state.pageData;
      const tab = pd.setTab || 'game';
      const s = state.settings || {};
      const side = TABS.map(
        (t) =>
          `${t.div ? `<div class="divider">${t.div}</div>` : ''}
           <div class="item ${tab === t.id ? 'active' : ''}" data-tab="${t.id}">${Icons[t.icon]}<span>${t.label}</span></div>`
      ).join('');

      let body = '';
      if (tab === 'game') body = gameHtml(state, s);
      else if (tab === 'personal') body = personalHtml(state, s);
      else if (tab === 'network') body = networkHtml(state, s);
      else body = launcherHtml(state, s);

      return `<div class="sidebar">${side}</div><div class="grow" style="overflow-y:auto">${body}</div>`;
    },

    mount(root, state) {
      PCL.$$('.sidebar .item', root).forEach((it) =>
        it.addEventListener('click', async () => {
          state.pageData.setTab = it.dataset.tab;
          if (state.pageData.setTab === 'game' && !state.pageData.javaList) await detectJava(state);
          PCL.render();
        })
      );

      const tab = state.pageData.setTab || 'game';
      if (tab === 'game' && !state.pageData.javaList) {
        detectJava(state).then(() => {
          if (state.page === 'settings') PCL.render();
        });
      }
      if (tab === 'game' && !state.pageData.javaCatalog) {
        API.java
          .catalog()
          .then((list) => {
            state.pageData.javaCatalog = list;
            if (state.page === 'settings') PCL.render();
          })
          .catch(() => {});
      }
      if (tab === 'game') mountGame(root, state);
      else if (tab === 'personal') mountPersonal(root, state);
      else if (tab === 'network') mountNetwork(root, state);
      else mountLauncher(root, state);
    },
  };

  /* ---------------------- 游戏 ---------------------- */
  function gameHtml(state, s) {
    const javas = state.pageData.javaList || [];
    const currentJava = s.javaPath || '';
    const javaOptions = javas
      .map(
        (j) =>
          `<option value="${PCL.esc(j.path)}" ${currentJava === j.path ? 'selected' : ''}>Java ${j.major} · ${PCL.esc(
            (j.path || '').split(/[\\/]/).slice(-3).join('/')
          )}</option>`
      )
      .join('');
    const autoMem = s.defaultMemory || 8192;
    const memVal = s.maxMemory || autoMem;
    const memText = s.maxMemory ? `${s.maxMemory} MB` : `自动（${autoMem} MB）`;

    const skin = [
      ['random', '随机'],
      ['steve', 'Steve'],
      ['alex', 'Alex'],
      ['msa', '正版皮肤'],
      ['custom', '自定义'],
    ]
      .map(
        ([k, label]) =>
          `<label class="skin-radio ${s.skinModel === k ? 'on' : ''}" data-skin="${k}">
             <span class="radio-dot"></span>${label}
           </label>`
      )
      .join('');

    return `
      <div class="card settings-card">
        <div class="card-title">皮肤</div>
        <div class="skin-radios">${skin}</div>
        <div class="pers-btns mt-8">
          <button class="btn small" id="setSkinPick">选择皮肤 PNG</button>
          <button class="btn small" id="setSkinClear">恢复默认</button>
          <span class="tiny muted ellipsis" id="skinFileLabel">${s.skinFile ? PCL.esc(s.skinFile) : '未选择自定义皮肤'}</span>
        </div>
        <div class="tiny muted mt-6">支持 64×64 或 128×128 的 Minecraft 皮肤 PNG；自定义皮肤会用于启动页头像。</div>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title">启动选项</div>
        <div class="set-row">
          <label>游戏窗口标题</label>
          <input class="input" id="setGameTitle" value="${PCL.esc(s.gameTitle || '')}" placeholder="默认" />
        </div>
        <div class="set-row">
          <label>自定义信息</label>
          <input class="input" id="setCustomInfo" value="${PCL.esc(s.customInfo || 'StartPro')}" />
        </div>
        <div class="set-row">
          <label>版本隔离</label>
          <select class="select" id="setIsolation">
            <option value="1" ${s.versionIsolation ? 'selected' : ''}>隔离所有版本</option>
            <option value="0" ${!s.versionIsolation ? 'selected' : ''}>关闭</option>
          </select>
        </div>
        <div class="set-row">
          <label>启动器可见性</label>
          <select class="select" id="setVisibility">
            <option value="keep" ${s.launcherVisibility !== 'minimize' && s.launcherVisibility !== 'close' ? 'selected' : ''}>游戏启动后仍保持不变</option>
            <option value="minimize" ${s.launcherVisibility === 'minimize' ? 'selected' : ''}>游戏启动后最小化</option>
            <option value="close" ${s.launcherVisibility === 'close' ? 'selected' : ''}>游戏启动后关闭启动器</option>
          </select>
        </div>
        <div class="set-row">
          <label>进程优先级</label>
          <select class="select" id="setPriority">
            <option value="low" ${s.processPriority === 'low' ? 'selected' : ''}>低</option>
            <option value="normal" ${s.processPriority !== 'high' && s.processPriority !== 'low' ? 'selected' : ''}>中（平衡）</option>
            <option value="high" ${s.processPriority === 'high' ? 'selected' : ''}>高</option>
          </select>
        </div>
        <div class="set-row">
          <label>全屏启动</label>
          <select class="select" id="setFullscreen">
            <option value="0" ${!s.fullscreen ? 'selected' : ''}>窗口模式</option>
            <option value="1" ${s.fullscreen ? 'selected' : ''}>全屏</option>
          </select>
        </div>
        <div class="set-row">
          <label>游戏窗口</label>
          <div class="set-window">
            <select class="select" id="setWindowMode">
              <option value="default" ${s.windowMode !== 'custom' ? 'selected' : ''}>默认大小</option>
              <option value="custom" ${s.windowMode === 'custom' ? 'selected' : ''}>自定义</option>
            </select>
            <input class="input" id="setW" type="number" value="${s.gameWidth || 854}" style="width:78px" />
            <span class="hint">×</span>
            <input class="input" id="setH" type="number" value="${s.gameHeight || 480}" style="width:78px" />
          </div>
        </div>
        <div class="set-row">
          <label>游戏 Java</label>
          <div class="set-java">
            <select class="select" id="setJavaSelect">
              ${javaOptions || '<option value="">未检测到 Java</option>'}
              ${!javas.length && currentJava ? `<option value="${PCL.esc(currentJava)}" selected>手动指定</option>` : ''}
            </select>
            <button class="btn small" id="btnDetectJava">${Icons.refresh}自动寻找 Java</button>
            <button class="btn small" id="btnJavaManage">${Icons.download}自动安装</button>
          </div>
        </div>
        <div class="tiny muted mt-6">启动时会自动扫描 PATH、JAVA_HOME、注册表、常见 JDK 目录和各启动器自带的 Java；也可以点“自动寻找 Java”重新扫描。</div>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title">内存</div>
        <div class="mem-head"><span>分配给游戏的内存</span><span id="memLabel" class="mem-value">${memText}</span></div>
        <input class="mem-range" id="setMemRange" type="range" min="512" max="8192" step="256" value="${memVal}" />
        <div class="mem-scale"><span>512 MB</span><span>物理内存 ${Math.round((s.totalMem || 0) / 1024)} GB</span><span>8192 MB</span></div>
      </div>`;
  }

  function mountGame(root, state) {
    PCL.$$('[data-skin]', root).forEach((el) =>
      el.addEventListener('click', async () => {
        if (el.dataset.skin === 'custom' && !state.settings.skinFile) {
          const r = await API.personal.pickSkin();
          if (!r.ok) {
            if (!r.cancelled) PCL.toast(r.error || '选择皮肤失败', 'error');
            return;
          }
          PCL.toast('已选择自定义皮肤', 'success');
          PCL.render();
          return;
        }
        await PCL.saveSettings({ skinModel: el.dataset.skin });
        PCL.render();
      })
    );
    PCL.$('#setSkinPick', root)?.addEventListener('click', async () => {
      const r = await API.personal.pickSkin();
      if (!r.ok) {
        if (!r.cancelled) PCL.toast(r.error || '选择皮肤失败', 'error');
        return;
      }
      PCL.toast('已选择自定义皮肤', 'success');
      PCL.render();
    });
    PCL.$('#setSkinClear', root)?.addEventListener('click', async () => {
      await PCL.saveSettings({ skinFile: '', skinModel: 'steve' });
      PCL.toast('已恢复默认皮肤', 'success');
      PCL.render();
    });

    PCL.$('#setGameTitle', root)?.addEventListener('change', (e) => PCL.saveSettings({ gameTitle: e.target.value.trim() }));
    PCL.$('#setCustomInfo', root)?.addEventListener('change', (e) => PCL.saveSettings({ customInfo: e.target.value.trim() }));
    PCL.$('#setIsolation', root)?.addEventListener('change', (e) => {
      PCL.saveSettings({ versionIsolation: e.target.value === '1' });
      state.settings.versionIsolation = e.target.value === '1';
    });
    PCL.$('#setVisibility', root)?.addEventListener('change', (e) => PCL.saveSettings({ launcherVisibility: e.target.value }));
    PCL.$('#setPriority', root)?.addEventListener('change', (e) => PCL.saveSettings({ processPriority: e.target.value }));
    PCL.$('#setFullscreen', root)?.addEventListener('change', (e) => PCL.saveSettings({ fullscreen: e.target.value === '1' }));
    PCL.$('#setWindowMode', root)?.addEventListener('change', (e) => {
      PCL.saveSettings({ windowMode: e.target.value });
      PCL.render();
    });
    PCL.$('#setW', root)?.addEventListener('change', (e) => PCL.saveSettings({ gameWidth: Number(e.target.value) || 854 }));
    PCL.$('#setH', root)?.addEventListener('change', (e) => PCL.saveSettings({ gameHeight: Number(e.target.value) || 480 }));

    const range = PCL.$('#setMemRange', root);
    if (range) {
      const label = PCL.$('#memLabel', root);
      range.addEventListener('input', () => {
        if (label) label.textContent = `${range.value} MB`;
      });
      range.addEventListener('change', () => PCL.saveSettings({ maxMemory: Number(range.value) || 0 }));
    }

    PCL.$('#setJavaSelect', root)?.addEventListener('change', async (e) => {
      await PCL.saveSettings({ javaPath: e.target.value });
      PCL.toast('已切换 Java', 'success', 1600);
      PCL.render();
    });
    PCL.$('#btnDetectJava', root)?.addEventListener('click', () => detectJava(state, true));
    PCL.$('#btnJavaManage', root)?.addEventListener('click', () => javaManageModal(state));
  }

  function javaManageModal(state) {
    const list = state.pageData.javaList || [];
    const rows = list.length
      ? list
          .map(
            (j) => `<div class="java-item" data-pick-java="${PCL.esc(j.path)}" style="cursor:pointer">
              <span class="tag">Java ${j.major}</span>
              ${j.managed ? '<span class="tag" style="background:#eaf6ee;border-color:#bfe3cb;color:#2c7a4b">启动器安装</span>' : ''}
              ${j.source && j.source !== 'PATH' ? `<span class="tag" style="background:#f5f7fa;border-color:#e2e6eb;color:#6b7785">${PCL.esc(j.source)}</span>` : ''}
              <span class="grow ellipsis" style="font-size:11.5px">${PCL.esc(j.path)}</span>
              <span class="tiny muted">${PCL.esc(j.output || '')}</span>
            </div>`
          )
          .join('')
      : '<div class="tiny muted">未检测到本机 Java</div>';

    PCL.modal({
      title: 'Java 管理',
      width: 600,
      body: `
        <div class="card-title" style="font-size:12px;margin-bottom:8px">已检测到的 Java</div>
        <div class="java-list">${rows}</div>
        <div class="card-title mt-12" style="font-size:12px">自动安装（Adoptium Temurin JDK）</div>
        <div class="flex gap-8 mt-8" style="flex-wrap:wrap">
          <button class="btn" data-install-java="8">Java 8</button>
          <button class="btn" data-install-java="17">Java 17</button>
          <button class="btn primary" data-install-java="21">Java 21（推荐）</button>
          <button class="btn" data-install-java="25">Java 25</button>
        </div>
        <div class="tiny muted mt-8">下载后自动解压到启动器目录并设为默认，约 100–200 MB。</div>`,
      footer: '<button class="btn primary" data-close>完成</button>',
      onMount: (wrap, close) => {
        PCL.$$('[data-pick-java]', wrap).forEach((el) =>
          el.addEventListener('click', async () => {
            await PCL.saveSettings({ javaPath: el.dataset.pickJava });
            close();
            PCL.toast('已切换 Java', 'success', 1600);
            PCL.render();
          })
        );
        PCL.$$('[data-install-java]', wrap).forEach((btn) =>
          btn.addEventListener('click', async () => {
            const major = Number(btn.dataset.installJava);
            const label = btn.textContent;
            btn.disabled = true;
            btn.textContent = `下载 Java ${major} 中…`;
            try {
              const r = await API.java.download(major);
              if (r && r.ok === false) throw new Error(r.error || '下载失败');
              state.pageData.javaList = await API.java.detect();
              await PCL.saveSettings({ javaPath: r.path });
              close();
              PCL.toast(`Java ${major} 安装完成，已设为默认`, 'success', 2600);
            } catch (err) {
              PCL.toast(String(err.message || err).replace(/^Error invoking remote method .*?: /, ''), 'error', 5000);
              btn.disabled = false;
              btn.textContent = label;
            }
            PCL.render();
          })
        );
      },
    });
  }

  async function detectJava(state, force) {
    if (state.pageData.javaList && !force) return;
    try {
      const list = force
        ? await API.java.detect()
        : PCL.javaScan
          ? await PCL.javaScan
          : await API.java.detect();
      state.pageData.javaList = Array.isArray(list) ? list : [];
    } catch (e) {
      state.pageData.javaList = [];
    }
    if (force) {
      PCL.javaScan = Promise.resolve(state.pageData.javaList);
      PCL.render();
      const n = state.pageData.javaList.length;
      PCL.toast(n ? `自动找到 ${n} 个 Java` : '没有找到已有 Java，可以点“自动安装”', n ? 'success' : 'error', 2400);
    }
  }

  /* ---------------------- 联机 ---------------------- */
  function networkHtml(state, s) {
    return `
      <div class="card settings-card">
        <div class="card-title">联机</div>
        <div class="set-row">
          <label>局域网发现</label>
          <div class="control"><div class="switch ${s.lanEnabled !== false ? 'on' : ''}" data-switch="lanEnabled"></div>
          <span class="hint">监听 UDP 4445，自动发现「对局域网开放」的房间</span></div>
        </div>
        <div class="set-row">
          <label>监听端口</label>
          <input class="input" id="setLanPort" type="number" value="${s.lanPort || 4445}" style="max-width:120px" />
        </div>
        <div class="tiny muted mt-8">联机页只负责发现与复制地址，进入游戏后仍需在「多人游戏」中粘贴连接。</div>
      </div>`;
  }

  function mountNetwork(root) {
    bindSwitch(root, 'lanEnabled', PCL.state);
    PCL.$('#setLanPort', root)?.addEventListener('change', (e) => PCL.saveSettings({ lanPort: Number(e.target.value) || 4445 }));
  }

  /* ---------------------- 个性化 ---------------------- */
  const THEMES = [
    ['龙猫蓝', '#1e6fd9'],
    ['甜柠青', '#2e9e6b'],
    ['小草绿', '#58a55c'],
    ['菠萝黄', '#d6a12b'],
    ['橡木棕', '#9a6b47'],
  ];

  function themeOption(name, color, checked, disabled, extra = '') {
    return `<span class="skin-radio ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}" ${disabled ? '' : `data-theme="${color}" data-theme-name="${name}"`} ${extra}>
      <span class="radio-dot"></span>${name}</span>`;
  }

  function personalHtml(state, s) {
    const cur = s.themeColor || '#1e6fd9';
    const opacity = s.windowOpacity || 100;
    const themeRow = THEMES.map(([n, c]) => themeOption(n, c, cur === c, false)).join('');
    const hiddenTop = Array.from({ length: 5 }, () => themeOption('???', '#ccc', false, true)).join('');
    const hiddenBottom = [
      themeOption('???', '#ccc', false, true),
      themeOption('???', '#ccc', false, true),
      themeOption('跳票红', '#c94b4b', cur === '#c94b4b', false),
      themeOption('???', '#ccc', false, true),
      themeOption('自定义', '#ccc', false, true),
    ].join('');
    return `
      <div class="card settings-card pers-card">
        <div class="card-title">启动器</div>
        <div class="pers-row">
          <label>不透明度</label>
          <div class="pers-opacity">
            <input type="range" id="persOpacity" min="50" max="100" value="${opacity}" />
          </div>
        </div>
        <div class="pers-row">
          <label>主题</label>
          <div class="pers-themes">${themeRow}</div>
        </div>
        <div class="pers-row">
          <label>隐藏主题</label>
          <div class="pers-themes pers-themes-multi">
            <div class="pers-theme-line">${hiddenTop}</div>
            <div class="pers-theme-line">${hiddenBottom}</div>
          </div>
        </div>
        <label class="check pers-check"><input type="checkbox" data-pers="showPclIcon" ${s.showPclIcon !== false ? 'checked' : ''} /> 打开启动器时显示 SPL 图标</label>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title pers-blue-title">背景图片</div>
        <label class="check pers-check"><input type="checkbox" data-pers="colorBackground" ${s.colorBackground ? 'checked' : ''} /> 使用彩色背景</label>
        <div class="pers-btns">
          <button class="btn" id="persBgPick">选择背景图片</button>
          <button class="btn" id="persBgFolder">打开背景图片文件夹</button>
          <button class="btn" id="persBgRefresh">刷新背景</button>
          <button class="btn" id="persBgClear">清除背景</button>
        </div>
        <div class="tiny muted mt-6 ellipsis">${s.backgroundImage ? PCL.esc(s.backgroundImage) : '当前未设置自定义背景'}</div>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title">背景音乐</div>
        <label class="check pers-check"><input type="checkbox" data-pers="playMusic" ${s.playMusic ? 'checked' : ''} /> 播放背景音乐</label>
        <div class="pers-btns">
          <button class="btn" id="persMusicPick">选择音乐</button>
          <button class="btn" id="persMusicClear">清除音乐</button>
        </div>
        <div class="tiny muted mt-6 ellipsis">${s.backgroundMusic ? PCL.esc(s.backgroundMusic) : '支持 mp3 / ogg / wav / m4a'}</div>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title">标题栏</div>
        <div class="pers-titlebar">
          ${[
            ['none', '无'],
            ['default', '默认'],
            ['text', '文本'],
            ['image', '图片'],
          ]
            .map(([k, n]) => `<span class="skin-radio ${(s.titleBar || 'default') === k ? 'on' : ''}" data-titlebar="${k}"><span class="radio-dot"></span>${n}</span>`)
            .join('')}
        </div>
      </div>`;
  }

  function mountPersonal(root, state) {
    const persistence = async (patch) => {
      await PCL.saveSettings(patch);
    };
    PCL.$$('[data-theme]', root).forEach((el) =>
      el.addEventListener('click', async () => {
        await persistence({ themeColor: el.dataset.theme, themeName: el.dataset.themeName });
        document.documentElement.style.setProperty('--accent', el.dataset.theme);
        PCL.render();
      })
    );
    const op = PCL.$('#persOpacity', root);
    if (op) {
      op.addEventListener('input', () => {
        const val = PCL.$('.pers-opacity-val', root);
        if (val) val.textContent = `${op.value}%`;
      });
      op.addEventListener('change', () => persistence({ windowOpacity: Number(op.value) || 100 }));
    }
    PCL.$$('[data-pers]', root).forEach((el) =>
      el.addEventListener('change', () => persistence({ [el.dataset.pers]: el.checked }))
    );
    PCL.$$('[data-titlebar]', root).forEach((el) =>
      el.addEventListener('click', async () => {
        await persistence({ titleBar: el.dataset.titlebar });
        PCL.render();
      })
    );
    PCL.$('#persBgPick', root)?.addEventListener('click', async () => {
      const r = await API.personal.pickBackground();
      if (!r.ok) {
        if (!r.cancelled) PCL.toast(r.error || '选择背景失败', 'error');
        return;
      }
      PCL.state.settings.backgroundImage = r.path;
      await PCL.applyPersonal();
      PCL.toast('背景已更新', 'success');
      PCL.render();
    });
    PCL.$('#persBgFolder', root)?.addEventListener('click', () => API.personal.openDir('background'));
    PCL.$('#persBgRefresh', root)?.addEventListener('click', async () => {
      await PCL.applyPersonal();
      PCL.toast('已刷新背景', 'success', 1600);
    });
    PCL.$('#persBgClear', root)?.addEventListener('click', async () => {
      await API.personal.clearBackground();
      PCL.state.settings.backgroundImage = '';
      await PCL.applyPersonal();
      PCL.toast('已清除背景', 'success');
      PCL.render();
    });
    PCL.$('#persMusicPick', root)?.addEventListener('click', async () => {
      const r = await API.personal.pickMusic();
      if (!r.ok) {
        if (!r.cancelled) PCL.toast(r.error || '选择音乐失败', 'error');
        return;
      }
      PCL.state.settings.backgroundMusic = r.path;
      await PCL.saveSettings({ playMusic: true });
      PCL.toast('背景音乐已更新', 'success');
      PCL.render();
    });
    PCL.$('#persMusicClear', root)?.addEventListener('click', async () => {
      await API.personal.clearMusic();
      PCL.state.settings.backgroundMusic = '';
      await PCL.saveSettings({ playMusic: false });
      PCL.toast('已清除背景音乐', 'success');
      PCL.render();
    });
  }

  /* ---------------------- 启动器 ---------------------- */
  function launcherHtml(state, s) {
    return `
      <div class="card settings-card">
        <div class="card-title">游戏目录</div>
        <div class="set-row">
          <label>游戏文件夹</label>
          <input class="input" id="setGameDir" value="${PCL.esc(s.gameDir || '')}" />
          <button class="btn small" id="btnPickDir">${Icons.folder}选择</button>
        </div>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title">下载</div>
        <div class="field">
          <label>下载源</label>
          <div class="control">
            <div class="radio-row">
              <label class="check"><input type="radio" name="mirror" value="official" ${s.mirror !== 'bmclapi' ? 'checked' : ''} /> 官方源（Mojang）</label>
              <label class="check"><input type="radio" name="mirror" value="bmclapi" ${s.mirror === 'bmclapi' ? 'checked' : ''} /> BMCLAPI 镜像</label>
            </div>
          </div>
        </div>
        <div class="tiny muted" style="line-height:1.8">
          镜像只替换资源地址，文件仍按 SHA-1 校验；切换到镜像后依赖库与资源文件都会走 bangbang93 的节点。
        </div>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title">CurseForge</div>
        <div class="field">
          <label>API Key</label>
          <div class="control">
            <input class="input" id="setCfKey" value="${PCL.esc(s.curseForgeApiKey || '')}" placeholder="CurseForge API Key" />
            <button class="btn small" id="btnCfKey">获取 Key</button>
          </div>
        </div>
        <div class="tiny muted" style="line-height:1.8">
          CurseForge 官方 API 需要个人 Key；填好后「下载 → Mod / 整合包」可切换到 CurseForge 源。Key 只保存在本机配置里。
        </div>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title">内置 AI</div>
        <div class="field">
          <label>启用在线 AI</label>
          <div class="control"><div class="switch ${s.aiEnabled !== false ? 'on' : ''}" data-switch="aiEnabled"></div><span class="hint">配置接口和模型后，小助手优先调用在线模型</span></div>
        </div>
        <div class="field">
          <label>接口预设</label>
          <div class="control">
            <select class="select" id="setAiProvider" style="max-width:220px">
              <option value="custom" ${!s.aiProvider || s.aiProvider === 'custom' ? 'selected' : ''}>自定义 / 兼容接口</option>
              <option value="deepseek" ${s.aiProvider === 'deepseek' ? 'selected' : ''}>DeepSeek</option>
              <option value="openai" ${s.aiProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
              <option value="ollama" ${s.aiProvider === 'ollama' ? 'selected' : ''}>Ollama 本地</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Base URL</label>
          <div class="control"><input class="input" id="setAiBase" value="${PCL.esc(s.aiBaseUrl || '')}" placeholder="https://api.deepseek.com/v1" /></div>
        </div>
        <div class="field">
          <label>API Key</label>
          <div class="control"><input class="input" type="password" id="setAiKey" value="${PCL.esc(s.aiApiKey || '')}" placeholder="sk-…（Ollama 本地可留空）" /></div>
        </div>
        <div class="field">
          <label>模型</label>
          <div class="control">
            <input class="input" id="setAiModel" value="${PCL.esc(s.aiModel || '')}" placeholder="deepseek-chat / gpt-4o-mini / qwen2.5:7b" list="aiModelList" />
            <datalist id="aiModelList"></datalist>
            <button class="btn small" id="btnAiModels">刷新模型</button>
            <button class="btn small" id="btnAiTest">测试连接</button>
          </div>
        </div>
        <div class="tiny muted" style="line-height:1.8">
          API Key 只保存在本机配置里，不会上传到 StartPro 服务器；问题、启动器状态和最近日志会发送到你填写的 AI 接口。使用 Ollama 时保持默认地址即可，完全本地运行。
        </div>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title">启动器</div>
        <div class="field">
          <label>版本隔离</label>
          <div class="control"><div class="switch ${s.versionIsolation ? 'on' : ''}" data-switch="versionIsolation"></div><span class="hint">与「游戏」页共用同一开关</span></div>
        </div>
        <div class="field">
          <label>日志级别</label>
          <div class="control">
            <select class="select" id="setLogLevel" style="max-width:180px">
              <option value="info" ${s.logLevel !== 'debug' ? 'selected' : ''}>一般（info）</option>
              <option value="debug" ${s.logLevel === 'debug' ? 'selected' : ''}>详细（debug）</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>更新清单</label>
          <div class="control"><input class="input" id="setUpdateUrl" value="${PCL.esc(s.updateManifestUrl || '')}" placeholder="https://…/update.json" /></div>
        </div>
        <div class="field">
          <label>自动检查更新</label>
          <div class="control"><div class="switch ${s.autoCheckUpdates !== false ? 'on' : ''}" data-switch="autoCheckUpdates"></div><span class="hint">启动后自动检查，发现新版本可一键更新并重启</span></div>
        </div>
        <div class="field">
          <label>配置文件</label>
          <div class="control"><span class="tiny muted ellipsis">${PCL.esc(s.userData || '（浏览器预览，保存在 localStorage）')}</span></div>
        </div>
      </div>

      <div class="card settings-card mt-12">
        <div class="card-title">账户</div>
        <div class="field">
          <label>微软登录 Client ID</label>
          <div class="control"><input class="input" id="setMsClientId" value="${PCL.esc(s.msClientId || '')}" placeholder="Azure 应用的 Application (client) ID" /></div>
        </div>
        <div class="tiny muted" style="line-height:1.8">
          在 Azure 门户注册「移动和桌面应用」，启用公共客户端流，把 Client ID 填到这里；主页「正版登录」会用设备码完成微软/Xbox/Minecraft 验证。
        </div>
        <div class="field">
          <label>账号数量</label>
          <div class="control"><span class="hint">${state.accounts.length} 个（可在主页管理）</span></div>
        </div>
      </div>`;
  }

  function mountLauncher(root, state) {
    const AI_PRESETS = {
      deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      ollama: { base: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' },
    };
    const aiField = (id) => PCL.$(`#${id}`, root);
    const saveAiFields = async () => {
      if (!aiField('setAiBase')) return PCL.state.settings;
      return PCL.saveSettings({
        aiProvider: aiField('setAiProvider')?.value || 'custom',
        aiBaseUrl: aiField('setAiBase')?.value.trim() || '',
        aiApiKey: aiField('setAiKey')?.value.trim() || '',
        aiModel: aiField('setAiModel')?.value.trim() || '',
      });
    };

    PCL.$('#setAiProvider', root)?.addEventListener('change', async (e) => {
      const preset = AI_PRESETS[e.target.value];
      if (preset) {
        aiField('setAiBase').value = preset.base;
        aiField('setAiModel').value = preset.model;
      }
      await saveAiFields();
      PCL.toast('AI 接口预设已切换', 'success', 1600);
    });
    ['setAiBase', 'setAiKey', 'setAiModel'].forEach((id) =>
      aiField(id)?.addEventListener('change', () => saveAiFields())
    );
    PCL.$('#btnAiModels', root)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '读取中…';
      await saveAiFields();
      const r = await API.ai.models();
      btn.disabled = false;
      btn.textContent = '刷新模型';
      if (!r.ok) {
        PCL.toast(r.error || '读取模型列表失败', 'error', 6000);
        return;
      }
      const list = PCL.$('#aiModelList', root);
      if (list) list.innerHTML = (r.models || []).map((m) => `<option value="${PCL.esc(m)}"></option>`).join('');
      if ((r.models || []).length && !aiField('setAiModel').value) {
        aiField('setAiModel').value = r.models[0];
        await saveAiFields();
      }
      PCL.toast(`已读取 ${r.models.length} 个模型`, 'success', 2200);
    });
    PCL.$('#btnAiTest', root)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '测试中…';
      await saveAiFields();
      const r = await API.ai.test();
      btn.disabled = false;
      btn.textContent = '测试连接';
      if (!r.ok) {
        PCL.toast(r.error || 'AI 连接失败', 'error', 7000);
        return;
      }
      PCL.toast(`AI 连接成功：${r.reply || 'OK'}`, 'success', 4000);
    });

    PCL.$('#btnPickDir', root)?.addEventListener('click', async () => {
      const dir = await API.dir.choose();
      if (dir) {
        await PCL.saveSettings({ gameDir: dir });
        state.settings = await API.settings.get();
        state.folders = await API.folders.list().catch(() => state.folders || []);
        state.versions = await API.versions.list();
        PCL.render();
      }
    });
    PCL.$('#setGameDir', root)?.addEventListener('change', async (e) => {
      await PCL.saveSettings({ gameDir: e.target.value.trim() });
      state.settings = await API.settings.get();
      state.folders = await API.folders.list().catch(() => state.folders || []);
      state.versions = await API.versions.list();
      PCL.toast('游戏目录已更新', 'success', 1600);
      PCL.render();
    });
    PCL.$$('input[name="mirror"]', root).forEach((r) =>
      r.addEventListener('change', async () => {
        await PCL.saveSettings({ mirror: r.value });
        PCL.toast('下载源已切换', 'success', 1600);
      })
    );
    PCL.$('#setLogLevel', root)?.addEventListener('change', (e) => PCL.saveSettings({ logLevel: e.target.value }));
    PCL.$('#setUpdateUrl', root)?.addEventListener('change', (e) => {
      PCL.saveSettings({ updateManifestUrl: e.target.value.trim() });
      PCL.toast('更新清单地址已保存', 'success', 1600);
    });
    PCL.$('#setCfKey', root)?.addEventListener('change', (e) => {
      PCL.saveSettings({ curseForgeApiKey: e.target.value.trim() });
      PCL.toast('CurseForge API Key 已保存', 'success', 1600);
    });
    PCL.$('#btnCfKey', root)?.addEventListener('click', () =>
      API.openExternal('https://console.curseforge.com/?#api-keys')
    );
    PCL.$('#setMsClientId', root)?.addEventListener('change', (e) => {
      PCL.saveSettings({ msClientId: e.target.value.trim() });
      PCL.toast('微软登录 Client ID 已保存', 'success', 1600);
    });
    bindSwitch(root, 'versionIsolation', state);
    bindSwitch(root, 'autoCheckUpdates', state);
    bindSwitch(root, 'aiEnabled', state);
  }

  function bindSwitch(root, key, state) {
    PCL.$$(`[data-switch="${key}"]`, root).forEach((el) =>
      el.addEventListener('click', async () => {
        el.classList.toggle('on');
        const on = el.classList.contains('on');
        await PCL.saveSettings({ [key]: on });
        if (key === 'autoCheckUpdates' && PCL.updateAuto) {
          clearTimeout(PCL.updateAuto.timer);
          if (!on) {
            PCL.updateAuto.timer = null;
          } else if (!PCL.updateAuto.checked && typeof PCL.autoUpdateTick === 'function') {
            PCL.updateAuto.timer = setTimeout(PCL.autoUpdateTick, 1200);
          }
        }
        if (key === 'versionIsolation') {
          state.settings.versionIsolation = el.classList.contains('on');
          PCL.$$(`[data-switch="versionIsolation"]`, root).forEach((x) => x.classList.toggle('on', el.classList.contains('on')));
        }
      })
    );
  }
})();
