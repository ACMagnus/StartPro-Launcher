/* ============================================================
   SPL 小助手：本地离线知识库 + 启动器上下文
   不联网、不调用大模型，回答安装/Java/Mod/登录/报错等问题
   ============================================================ */
(function () {
  const PCL = window.PCL;
  const API = window.API;
  const A = (text, actions = []) => ({ text, actions });
  const norm = (s) => String(s || '').toLowerCase().replace(/[，。！？、,.!?;；:：()（）\s]/g, '');

  function context() {
    const s = PCL.state;
    const ver = PCL.currentVersion ? PCL.currentVersion() : null;
    const javas = (s.pageData && s.pageData.javaList) || [];
    const req = ver && PCL.suggestJava ? PCL.suggestJava(ver.id) : 0;
    const mirror = s.settings && s.settings.mirror === 'official' ? '官方源' : 'BMCLAPI 镜像';
    const mem = (s.settings && (s.settings.maxMemory || s.settings.defaultMemory)) || 0;
    const accounts = (s.accounts || []).filter(Boolean);
    return {
      state: s,
      ver,
      javas,
      req,
      mirror,
      mem,
      accounts,
      isolation: !!(s.settings && s.settings.versionIsolation),
      versionCount: (s.versions || []).length,
      page: s.page,
    };
  }

  function aiReady() {
    if (window.IS_PREVIEW) return false;
    const s = (PCL.state && PCL.state.settings) || {};
    if (s.aiEnabled === false || !s.aiBaseUrl || !s.aiModel) return false;
    const local = /^(http:\/\/)?(127\.0\.0\.1|localhost)/i.test(String(s.aiBaseUrl).trim());
    return !!s.aiApiKey || local;
  }

  function aiContext() {
    const ctx = context();
    const s = (PCL.state && PCL.state.settings) || {};
    const manifest = PCL.state.pageData && PCL.state.pageData.manifest;
    const releases = manifest && Array.isArray(manifest.versions) ? manifest.versions.filter((v) => v.type === 'release') : [];
    const snapshots = manifest && Array.isArray(manifest.versions) ? manifest.versions.filter((v) => v.type === 'snapshot') : [];
    return {
      page: ctx.page,
      launcherVersion: (PCL.state.pageData && PCL.state.pageData.appInfo && PCL.state.pageData.appInfo.version) || '',
      currentVersion: ctx.ver ? ctx.ver.id : '',
      versions: (ctx.state.versions || []).slice(0, 40).map((v) => v.id),
      latestRelease: releases[0] ? releases[0].id : '',
      latestSnapshot: snapshots[0] ? snapshots[0].id : '',
      gameDir: s.gameDir || '',
      mirror: ctx.mirror,
      isolation: ctx.isolation,
      maxMemory: ctx.mem,
      java: (ctx.javas || []).map((j) => j.major).filter(Boolean),
      accountCount: (ctx.accounts || []).length,
      recentLogs: (PCL.state.logs || []).slice(-20).join('\n'),
    };
  }

  function javaLine(ctx) {
    if (!ctx.javas.length) return '当前还没检测到 Java。点下面的“自动检测 Java”，或在 设置 → 游戏 里手动指定。';
    const majors = [...new Set(ctx.javas.map((j) => j.major).filter(Boolean))].sort((a, b) => a - b);
    return `当前检测到 ${ctx.javas.length} 个 Java（${majors.map((m) => 'Java ' + m).join(' / ')}）。`;
  }

  function loaderName(ver) {
    const l = ((ver && ver.loader) || '').toLowerCase();
    if (l.includes('fabric')) return 'Fabric';
    if (l.includes('neoforge')) return 'NeoForge';
    if (l.includes('forge')) return 'Forge';
    if (l.includes('quilt')) return 'Quilt';
    if (l.includes('opti')) return 'OptiFine';
    return '';
  }

  const KB = [
    {
      id: 'hello',
      keys: ['你好', '您好', '嗨', 'hello', 'hi', '在吗'],
      run: () => A('你好，我是 SPL 小助手。安装、Java、Mod、登录、启动报错都可以问我；我会结合当前启动器状态回答。'),
    },
    {
      id: 'identity',
      keys: ['你是谁', '你能做什么', '能干什么', '怎么用', '帮助', '助手', '内置ai', '在线ai', 'ai设置', '模型'],
      run: () => A(
        '我是内置在启动器里的 SPL 小助手。\n\n未配置在线 AI 时，我使用离线知识库，能回答安装、Java、Mod、登录、版本列表和启动报错。\n配置在线 AI 后，我会优先调用你填写的模型，能回答更自由的问题，并结合当前版本、Java、设置和最近日志。\n\n配置入口：设置 → 启动器 → 内置 AI。支持 DeepSeek、OpenAI、Ollama 本地和任意 OpenAI 兼容接口。',
        [
          { label: '配置 AI', act: 'settings', tab: 'launcher' },
          { label: '看常见问题', act: 'more', tab: 'help' },
        ]
      ),
    },
    {
      id: 'install',
      keys: ['安装游戏', '安装版本', '怎么安装', '怎么下载', '下载游戏', '装游戏', '新版本', '安装minecraft', '下载minecraft'],
      run: (ctx) => A(
        `安装游戏按这三步走：\n1. 打开「下载」页，在版本列表里选一个版本（新手建议正式版）。\n2. 点该版本的「安装」，启动器会自动补依赖、资源和 natives。\n3. 安装完成后回「启动」页，选版本、选账号，点启动。\n\n当前已安装 ${ctx.versionCount} 个版本${ctx.ver ? `，当前选中「${ctx.ver.id}」` : '，还没有选中版本'}。`,
        [
          { label: '去下载页', act: 'page', page: 'download' },
          { label: '管理版本', act: 'page', page: 'versions' },
        ]
      ),
    },
    {
      id: 'fabric',
      keys: ['fabric', '安装fabric', 'fabric安装', 'quilt'],
      run: (ctx) => A(
        `装 Fabric：\n1. 先在「下载」页安装对应的原版版本（例如 1.21.4）。\n2. 下载页切到 Fabric，选择游戏版本和 Loader 版本，点安装。\n3. 装好后版本列表会出现一个 Fabric 版本，用它启动即可。\n\n当前加载器：${ctx.ver ? loaderName(ctx.ver) || '原版' : '未选版本'}。`,
        [{ label: '去下载 Fabric', act: 'page', page: 'download', tab: 'fabric' }]
      ),
    },
    {
      id: 'forge',
      keys: ['forge', 'neoforge', '安装forge', 'forge安装', 'neoforge安装'],
      run: () => A(
        '装 Forge / NeoForge：\n1. 在「下载」页先装好对应原版。\n2. 切到 Forge 或 NeoForge，选游戏版本和加载器版本。\n3. 点安装，启动器会调用官方安装器；首次安装可能要几分钟，别重复点。\n\n注意：Forge 1.20.1 需要 Java 17；NeoForge 1.21.x 通常需要 Java 21。',
        [{ label: '去下载加载器', act: 'page', page: 'download', tab: 'forge' }]
      ),
    },
    {
      id: 'java',
      keys: ['java', 'jdk', 'java版本', 'java怎么选', '需要java', '运行环境', 'java几'],
      run: (ctx) => {
        let text = javaLine(ctx);
        if (ctx.ver) text += `\n当前版本「${ctx.ver.id}」建议 Java ${ctx.req}。`;
        text += '\n\n版本对应：1.16.5 及更早 → Java 8；1.17–1.20.4 → Java 17；1.20.5+ → Java 21。';
        if (ctx.javas.length && ctx.req && !ctx.javas.some((j) => Number(j.major) === Number(ctx.req))) {
          text += `\n\n⚠ 当前检测到的 Java 里没有 ${ctx.req}，启动可能失败。`;
        }
        return A(text, [
          { label: '自动检测 Java', act: 'detectJava' },
          { label: '打开游戏设置', act: 'settings', tab: 'game' },
        ]);
      },
    },
    {
      id: 'javaInstall',
      keys: ['安装java', '下载java', 'java怎么装', '装jdk', 'java安装', '没有java'],
      run: () => A(
        '不用手动找安装包：\n1. 设置 → 游戏 → 游戏 Java。\n2. 点「自动安装」，选择 Java 8 / 17 / 21。\n3. 启动器会下载 Temurin JDK 并自动填好路径。\n\n如果已经装了 Java，点「自动搜索」即可。',
        [
          { label: '去安装 Java', act: 'settings', tab: 'game' },
          { label: '自动检测', act: 'detectJava' },
        ]
      ),
    },
    {
      id: 'listFail',
      keys: ['列表获取失败', '列表失败', '获取版本失败', '版本列表', '没有版本', '加载不出', '刷不出来', '下载页为空'],
      run: (ctx) => A(
        `版本列表失败通常不是完全断网，先按顺序试：\n1. 设置 → 启动器 → 下载源，切换为 BMCLAPI 镜像，再回下载页刷新。\n2. 当前下载源：${ctx.mirror}。\n3. 如果仍然失败，检查代理/VPN 是否拦截 launchermeta.mojang.com。\n4. 启动器内置 24 小时缓存，刷新失败时旧列表仍可继续用。`,
        [
          { label: '切换下载源', act: 'settings', tab: 'launcher' },
          { label: '回下载页重试', act: 'page', page: 'download' },
        ]
      ),
    },
    {
      id: 'mirror',
      keys: ['下载慢', '镜像', 'bmclapi', '下载源', '加速下载', '网络慢'],
      run: (ctx) => A(
        `当前下载源：${ctx.mirror}。\n国内建议用 BMCLAPI：设置 → 启动器 → 下载源 → BMCLAPI。\n它会镜像版本清单、Forge/NeoForge 列表、Fabric 和资源下载；官方源适合海外网络。`,
        [{ label: '打开下载源设置', act: 'settings', tab: 'launcher' }]
      ),
    },
    {
      id: 'mods',
      keys: ['mod', '模组', 'mod装哪', 'mod安装', '装mod', '模组装哪', 'mods目录', 'mod不生效'],
      run: (ctx) => A(
        `Mod 安装位置：\n· 开启版本隔离时：versions/<版本名>/mods\n· 关闭版本隔离时：.minecraft/mods\n\n当前版本隔离：${ctx.isolation ? '开启' : '关闭'}。\n优先在「下载 → Mod」里安装，启动器会按当前版本和加载器自动筛选兼容版本。\n\n装完不生效，先确认：Mod 支持当前游戏版本、加载器匹配（Fabric Mod 不能塞 Forge）、Java 版本正确。`,
        [
          { label: '去装 Mod', act: 'page', page: 'download', tab: 'mod' },
          { label: '版本设置', act: 'page', page: 'versions' },
        ]
      ),
    },
    {
      id: 'modpack',
      keys: ['整合包', 'mrpack', 'modpack', '整合包安装', '导入整合包'],
      run: () => A(
        '装整合包：\n1. 下载页 → 整合包，选 Modrinth 整合包点安装，启动器会自动装基础版本和加载器。\n2. 也可以手动导入 .mrpack / .zip：下载页 → 整合包 → 导入。\n3. 安装后不要再用原版启动，选整合包生成的版本。\n\n如果整合包和已有版本重名，启动器会拒绝覆盖，换个名字即可。',
        [{ label: '去整合包页', act: 'page', page: 'download', tab: 'pack' }]
      ),
    },
    {
      id: 'resource',
      keys: ['资源包', '光影', '材质包', 'shader', 'resourcepack', 'iris', 'optifine'],
      run: (ctx) => A(
        `资源包放 resourcepacks，光影放 shaderpacks。\n开启版本隔离时，它们会跟随当前版本的目录。\n光影需要 Iris（Fabric）或 OptiFine；只装光影文件本身不会生效。\n\n当前版本：${ctx.ver ? ctx.ver.id : '未选择'}。`,
        [{ label: '去下载资源', act: 'page', page: 'download', tab: 'resource' }]
      ),
    },
    {
      id: 'login',
      keys: ['登录', '账号', '正版', '离线登录', '微软', 'msa', '外置登录', 'authlib', '换账号'],
      run: (ctx) => A(
        `登录方式：\n· 离线登录：填用户名即可，适合单机。\n· 微软正版：主页点“正版登录”，按设备码提示在浏览器完成授权。\n· 外置登录：填验证服务器地址和用户名，启动器会自动注入 authlib-injector。\n\n当前账号数：${ctx.accounts.length}。切换账号在主页右侧的账号胶囊里。`,
        [{ label: '回主页登录', act: 'page', page: 'home' }]
      ),
    },
    {
      id: 'crash',
      keys: ['崩溃', '启动失败', '打不开', '闪退', '报错', '进不去', '启动不了', 'error', '退出代码'],
      run: (ctx) => {
        const logs = (ctx.state.logs || []).slice(-5).join('\n');
        let text = '先按这个顺序排查：\n1. 看「更多 → 百宝箱 → 运行日志」最后几行，找 Exception / Could not / Java 字样。\n2. 确认 Java 版本和游戏版本匹配。\n3. 最近装过 Mod 的话，先移除 Mod 再启动。\n4. 内存太小也会在加载世界时崩。';
        if (ctx.mem) text += `\n当前分配内存：${ctx.mem} MB。`;
        if (logs) text += `\n\n最近日志：\n${logs}`;
        return A(text, [
          { label: '查看完整日志', act: 'showLog' },
          { label: '检查 Java', act: 'detectJava' },
          { label: '打开游戏设置', act: 'settings', tab: 'game' },
        ]);
      },
    },
    {
      id: 'memory',
      keys: ['内存', '分配内存', 'ram', '内存不足', 'outofmemory', '卡顿'],
      run: (ctx) => A(
        `当前内存：${ctx.mem ? ctx.mem + ' MB' : '自动'}。\n建议：1.20+ 版本 2048–4096 MB；大型整合包 4096–8192 MB。\n不要超过物理内存的一半，也不要只给 512 MB，容易在加载区块时崩。\n\n修改：设置 → 游戏 → 内存滑块。`,
        [{ label: '调内存', act: 'settings', tab: 'game' }]
      ),
    },
    {
      id: 'isolation',
      keys: ['版本隔离', '隔离', 'mod冲突', '不同版本mod'],
      run: (ctx) => A(
        `版本隔离：每个版本使用独立的 mods、config、saves，互不污染。\n当前：${ctx.isolation ? '开启' : '关闭'}。\n建议开启，尤其是同时玩原版、Fabric 和整合包。\n修改：设置 → 游戏 → 版本隔离，或版本设置里单独覆盖。`,
        [{ label: '打开设置', act: 'settings', tab: 'game' }]
      ),
    },
    {
      id: 'versionSwitch',
      keys: ['切换版本', '换版本', '选择版本', '启动哪个版本', '当前版本'],
      run: (ctx) => A(
        `当前版本：${ctx.ver ? ctx.ver.id : '未选择'}。\n回「启动」页，点版本下拉框即可切换；最近使用的版本会排在前面。\n版本设置（齿轮）里可以单独调内存、窗口、Java、隔离和 JVM 参数。`,
        [
          { label: '回启动页', act: 'page', page: 'home' },
          { label: '版本管理', act: 'page', page: 'versions' },
        ]
      ),
    },
    {
      id: 'deleteVersion',
      keys: ['删除版本', '卸载版本', '删掉版本', '清理版本'],
      run: () => A(
        '删除版本：版本管理 → 选中版本 → 删除。\n正在运行的版本不能删；删除会同时清理该版本的设置和 Mod 统计。\n如果不确定，先复制一份版本再删。',
        [{ label: '去版本管理', act: 'page', page: 'versions' }]
      ),
    },
    {
      id: 'export',
      keys: ['导出', '备份', '迁移', '导出整合包', '分享版本'],
      run: () => A(
        '导出：版本设置 → 导出，生成 ZIP，可分享或迁移。\n整合包导出会包含 mods、config；导出前确认没有把账号令牌打进去。',
        [{ label: '打开版本设置', act: 'page', page: 'versions' }]
      ),
    },
    {
      id: 'multiplayer',
      keys: ['联机', '局域网', '服务器', '多人', '一起玩', 'lan'],
      run: () => A(
        '联机：\n· 同一个局域网：联机页会自动扫描局域网房间。\n· 外网：需要服务器地址或内网穿透，启动器不提供公网中转。\n· 正版服务器需要正版账号；离线账号只能进离线模式服务器。',
        [{ label: '去联机页', act: 'page', page: 'multiplayer' }]
      ),
    },
    {
      id: 'visibility',
      keys: ['启动器可见性', '最小化', '启动后关闭', '关闭启动器', '游戏启动后'],
      run: () => A(
        '设置 → 启动器 → 启动器可见性：\n· 保持不变：启动游戏后启动器还在。\n· 最小化：自动最小化。\n· 关闭：启动后关闭启动器（游戏继续运行）。',
        [{ label: '打开启动器设置', act: 'settings', tab: 'launcher' }]
      ),
    },
    {
      id: 'fullscreen',
      keys: ['全屏', '窗口大小', '分辨率', '窗口模式', '游戏窗口'],
      run: (ctx) => A(
        `当前游戏窗口：${ctx.state.settings.gameWidth || 854} × ${ctx.state.settings.gameHeight || 480}。\n设置 → 游戏 → 全屏启动 / 游戏窗口，可改默认大小；版本设置里可以单独覆盖。`,
        [{ label: '调窗口', act: 'settings', tab: 'game' }]
      ),
    },
    {
      id: 'logs',
      keys: ['日志', '运行日志', '看日志', 'log', '输出'],
      run: (ctx) => A(
        `最近 ${(ctx.state.logs || []).length} 行日志保存在启动器里。\n点下面的按钮直接查看；也可以去「更多 → 百宝箱 → 运行日志」。`,
        [{ label: '查看日志', act: 'showLog' }, { label: '更多工具', act: 'more', tab: 'toolbox' }]
      ),
    },
    {
      id: 'config',
      keys: ['配置', '设置在哪', '配置文件', '目录', '游戏目录', '打开目录'],
      run: (ctx) => A(
        `游戏目录：${ctx.state.settings.gameDir || '未设置'}。\n配置目录在 Electron userData 里，可以在「更多 → 关于」看到完整路径。\n打开游戏目录：更多 → 百宝箱 → 打开游戏目录。`,
        [
          { label: '打开游戏目录', act: 'openDir' },
          { label: '更多工具', act: 'more', tab: 'toolbox' },
        ]
      ),
    },
    {
      id: 'skin',
      keys: ['皮肤', '换皮肤', '离线皮肤', 'steve', 'alex'],
      run: () => A(
        '设置 → 游戏 → 离线皮肤：随机 / Steve / Alex / 正版皮肤 / 自定义。\n离线皮肤只影响启动器头像和本地显示，不会改变正版账号在服务器里的皮肤。',
        [{ label: '去换皮肤', act: 'settings', tab: 'game' }]
      ),
    },
    {
      id: 'update',
      keys: ['更新', '版本号', '升级启动器', '最新版', '自动更新'],
      run: (ctx) => A(
        `当前启动器版本：${(ctx.state.pageData.appInfo && ctx.state.pageData.appInfo.version) || '未知'}。\n启动器启动约 5 秒后会自动检查新版本；发现更新后可在「更多 → 检查更新」查看，点“立即更新并重启”会自动下载、校验、替换并重新打开。\n也可以在「设置 → 启动器」关闭自动检查。配置和存档保存在 %APPDATA%\\StartPro Launcher，不会被更新覆盖。`,
        [{ label: '查看关于', act: 'more', tab: 'about' }]
      ),
    },
    {
      id: 'thanks',
      keys: ['谢谢', '感谢', 'thanks', 'thx', '好的'],
      run: () => A('不客气。还有安装、Java、Mod、登录或报错问题，直接继续问。'),
    },
  ];

  function choose(q) {
    const nq = norm(q);
    if (!nq) return null;
    let best = null;
    let bestScore = 0;
    for (const item of KB) {
      let score = 0;
      for (const key of item.keys) {
        const k = norm(key);
        if (!k) continue;
        if (nq === k) score += 30;
        else if (nq.includes(k)) score += k.length * 2 + 2;
        else if (k.includes(nq) && nq.length >= 2) score += nq.length;
      }
      if (score > bestScore) { bestScore = score; best = item; }
    }
    return bestScore >= 4 ? best : null;
  }

  function actionsHtml(m) {
    if (!m.actions || !m.actions.length) return '';
    return `<div class="ai-actions">${m.actions.map((a, i) =>
      `<button class="ai-act" data-ai-msg="${PCL.esc(m.id)}" data-ai-act="${i}">${PCL.esc(a.label)}</button>`
    ).join('')}</div>`;
  }

  function aiFormat(text) {
    let s = PCL.esc(String(text || '').trim()).replace(/\r/g, '');
    s = s.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => `<pre class="ai-code">${code.replace(/\n+$/, '')}</pre>`);
    s = s.replace(/^#{1,3}\s+(.+)$/gm, '<div class="ai-h">$1</div>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/`([^`\n]+)`/g, '<code class="ai-inline">$1</code>');
    return s;
  }

  function messageHtml(m) {
    if (m.role === 'user') {
      return `<div class="ai-row user"><div class="ai-bubble user">${PCL.esc(m.text)}</div></div>`;
    }
    return `<div class="ai-row bot"><div class="ai-avatar">SPL</div><div class="ai-bubble bot"><div class="ai-text">${aiFormat(m.text)}</div>${actionsHtml(m)}</div></div>`;
  }

  function history() {
    if (!PCL.state.assistant) {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem('ps-assistant-v1') || 'null'); } catch {}
      PCL.state.assistant = {
        messages: Array.isArray(saved && saved.messages) ? saved.messages.slice(-40) : [],
        nextId: (saved && saved.nextId) || 1,
      };
    }
    return PCL.state.assistant;
  }

  function saveHistory() {
    try {
      localStorage.setItem('ps-assistant-v1', JSON.stringify({
        messages: history().messages.slice(-40),
        nextId: history().nextId,
      }));
    } catch {}
  }

  function addMessage(role, text, actions = []) {
    const h = history();
    const m = { id: 'a' + h.nextId++, role, text, actions, time: Date.now() };
    h.messages.push(m);
    if (h.messages.length > 40) h.messages.splice(0, h.messages.length - 40);
    saveHistory();
    return m;
  }

  function greeting(ctx) {
    const bits = [];
    bits.push(`已安装 ${ctx.versionCount} 个版本`);
    if (ctx.ver) bits.push(`当前「${ctx.ver.id}」`);
    bits.push(ctx.javas.length ? `Java ${[...new Set(ctx.javas.map((j) => j.major))].join('/')}` : 'Java 未检测');
    bits.push(ctx.mirror);
    const guide = aiReady()
      ? '在线 AI 已启用，可以直接问任何问题，我会结合当前启动器状态回答。'
      : '可以问我安装、Java、Mod、登录、版本列表、启动报错；也可以点下面的快捷问题。';
    return `我是 SPL 小助手。\n当前状态：${bits.join(' · ')}。\n\n${guide}`;
  }

  function renderChat(wrap, state) {
    const h = history();
    const chat = wrap.querySelector('#aiChat');
    if (!chat) return;
    if (!h.messages.length) {
      const ctx = context();
      addMessage('assistant', greeting(ctx), [
        { label: '怎么安装游戏', act: 'ask', text: '怎么安装游戏' },
        { label: 'Java 怎么选', act: 'ask', text: 'Java 怎么选' },
        { label: '列表获取失败', act: 'ask', text: '列表获取失败怎么办' },
      ]);
    }
    chat.innerHTML = h.messages.map(messageHtml).join('') +
      (state.assistantBusy ? `<div class="ai-row bot"><div class="ai-avatar">SPL</div><div class="ai-bubble bot ai-typing"><i></i><i></i><i></i></div></div>` : '');
    chat.scrollTop = chat.scrollHeight;
  }

  function close() {
    if (PCL.assistant._close) PCL.assistant._close();
    PCL.assistant._close = null;
  }

  async function runAction(action, msgId, index, wrap) {
    if (!action) return;
    if (action.act === 'ask') {
      const input = wrap.querySelector('#aiInput');
      if (input) { input.value = action.text; input.focus(); }
      await ask(action.text, wrap);
      return;
    }
    if (action.act === 'page' || action.act === 'settings' || action.act === 'more') {
      close();
      const page = action.act === 'settings' ? 'settings' : action.act === 'more' ? 'more' : action.page;
      if (action.tab) {
        if (page === 'settings') PCL.state.pageData.setTab = action.tab;
        else if (page === 'download') PCL.state.pageData.dlTab = action.tab;
        else if (page === 'more') PCL.state.pageData.moreTab = action.tab;
        else if (page === 'versions') PCL.state.pageData.vTab = action.tab;
      }
      await PCL.go(page);
      return;
    }
    if (action.act === 'detectJava') {
      close();
      PCL.toast('正在检测 Java…', 'info', 1800);
      try {
        PCL.state.pageData.javaList = await API.java.detect();
        const list = PCL.state.pageData.javaList || [];
        PCL.toast(list.length ? `检测到 ${list.length} 个 Java` : '没有检测到 Java', list.length ? 'success' : 'error', 3000);
        if (list.length) {
          const majors = [...new Set(list.map((j) => j.major))].join(' / ');
          PCL.toast(`Java 版本：${majors}`, 'info', 2600);
        }
      } catch (e) {
        PCL.toast('检测 Java 失败', 'error', 3000);
      }
      return;
    }
    if (action.act === 'showLog') {
      const logs = (PCL.state.logs || []).join('\n') || '暂无日志：启动一次游戏后会在这里显示输出。';
      PCL.modal({
        title: '运行日志',
        width: 720,
        body: `<pre style="font:12px/1.7 'Cascadia Mono',Consolas,monospace;white-space:pre-wrap;word-break:break-all;background:#f6f9fc;border:1px solid var(--line);border-radius:6px;padding:12px;max-height:420px;overflow:auto;user-select:text">${PCL.esc(logs)}</pre>`,
        footer: '<button class="btn primary" data-close>关闭</button>',
      });
      return;
    }
    if (action.act === 'openDir') {
      close();
      API.versions.open('');
      return;
    }
  }

  async function ask(text, wrap) {
    const q = String(text || '').trim();
    if (!q) return;
    const h = history();
    if (PCL.assistant._busy) return;
    PCL.assistant._busy = true;
    PCL.assistant._streaming = false;
    addMessage('user', q);
    PCL.assistant._render(wrap);
    const input = wrap && wrap.querySelector('#aiInput');
    if (input) { input.value = ''; input.focus(); }

    // Java 类问题先自动补一次检测，回答里就能带真实数量
    if (/java|jdk|运行环境/i.test(q) && !(PCL.state.pageData.javaList || []).length) {
      try {
        PCL.state.pageData.javaList = await API.java.detect();
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 160));

    const ctx = context();
    const item = choose(q);
    let answer = null;
    let streamMsg = null;
    let partial = '';
    let streamError = '';
    let onlineDone = false;
    let paintTimer = null;

    if (aiReady()) {
      const paint = () => {
        if (paintTimer) return;
        paintTimer = setTimeout(() => {
          paintTimer = null;
          PCL.assistant._render(wrap);
        }, 70);
      };
      const messages = h.messages.slice(-9).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.text,
      }));
      try {
        if (!API.ai || typeof API.ai.stream !== 'function') throw new Error('当前版本不支持流式 AI');
        const r = await API.ai.stream({ messages, context: aiContext() }, (ev) => {
          if (!ev || !ev.delta) return;
          if (!streamMsg) streamMsg = addMessage('assistant', '');
          PCL.assistant._streaming = true;
          streamMsg.text += ev.delta;
          partial += ev.delta;
          paint();
        });
        if (!r || !r.ok) throw new Error((r && r.error) || '在线 AI 返回失败');
        if (!streamMsg && r.text) streamMsg = addMessage('assistant', '');
        if (streamMsg) {
          if (!streamMsg.text) streamMsg.text = r.text || '';
          else if (r.text) streamMsg.text = r.text;
        }
        if (!streamMsg || !streamMsg.text) throw new Error('在线 AI 没有返回内容');
        saveHistory();
        onlineDone = true;
      } catch (e) {
        streamError = String(e.message || e);
      } finally {
        if (paintTimer) { clearTimeout(paintTimer); paintTimer = null; }
      }
    }

    if (onlineDone) {
      // 已经完整生成，文本保持原始 Markdown，渲染时统一格式化
    } else if (streamMsg) {
      // 已经收到一部分内容：保留内容，标注中断，不再用本地答案覆盖
      streamMsg.text += `\n\n（在线 AI 中断：${streamError || '未知错误'}）`;
      saveHistory();
    } else {
      if (item) {
        try { answer = item.run(ctx); } catch { answer = A('这个问题我暂时没组织好答案，可以换个说法，或去「更多 → 帮助」看指南。'); }
      } else {
        answer = A(
          `我暂时没匹配到这个问题。可以换个关键词，例如：\n· 安装 / Fabric / Forge / 整合包\n· Java / 内存 / 版本隔离\n· Mod / 资源包 / 光影\n· 登录 / 正版 / 外置\n· 崩溃 / 列表获取失败 / 日志\n\n也可以点下面的快捷问题。`,
          [
            { label: '安装游戏', act: 'ask', text: '怎么安装游戏' },
            { label: 'Java 怎么选', act: 'ask', text: 'Java 怎么选' },
            { label: '启动崩溃', act: 'ask', text: '游戏崩溃怎么办' },
          ]
        );
      }
      if (streamError) answer.text += `\n\n（在线 AI 暂时不可用：${streamError}）`;
      addMessage('assistant', answer.text, answer.actions || []);
    }
    PCL.assistant._busy = false;
    PCL.assistant._streaming = false;
    PCL.assistant._render(wrap);
  }

  function render(wrap) {
    const h = history();
    const chat = wrap.querySelector('#aiChat');
    if (!chat) return;
    chat.innerHTML = h.messages.map(messageHtml).join('') +
      (PCL.assistant._busy ? `<div class="ai-row bot"><div class="ai-avatar">SPL</div><div class="ai-bubble bot ai-typing"><i></i><i></i><i></i></div></div>` : '');
    chat.scrollTop = chat.scrollHeight;
    const send = wrap.querySelector('#aiSend');
    if (send) {
      send.disabled = !!PCL.assistant._busy;
      send.textContent = PCL.assistant._busy ? '思考中' : '发送';
    }
  }

  function open() {
    const ctx = context();
    const aiOn = aiReady();
    const model = String((PCL.state.settings && PCL.state.settings.aiModel) || '').trim();
    history();
    if (PCL.assistant._close) { PCL.assistant._close(); PCL.assistant._close = null; }
    PCL.assistant._busy = false;
    PCL.assistant._streaming = false;
    const status = `${ctx.versionCount} 个版本 · ${ctx.javas.length ? `Java ${[...new Set(ctx.javas.map((j) => j.major))].join('/')}` : 'Java 未检测'} · ${ctx.mirror}`;
    const modal = PCL.modal({
      title: 'SPL 小助手',
      width: 600,
      body: `
        <div class="ai-shell">
          <div class="ai-status"><span class="ai-pulse"></span>${aiOn ? `在线 AI · ${PCL.esc(model)}` : '本地知识库 · 不联网 · 不上传对话'}<button id="aiGear" style="margin-left:8px;border:0;background:transparent;color:var(--accent);cursor:pointer;font-size:11px;padding:0">AI 设置</button><span class="ai-status-right">${PCL.esc(status)}</span></div>
          <div class="ai-chat" id="aiChat"></div>
          <div class="ai-suggest" id="aiSuggest">
            ${[
              ['安装 Fabric', '怎么安装 Fabric'],
              ['Java 怎么选', 'Java 怎么选'],
              ['列表获取失败', '列表获取失败怎么办'],
              ['Mod 装哪里', 'Mod 装在哪里'],
              ['启动崩溃', '游戏崩溃怎么办'],
              ['内存怎么调', '内存怎么调'],
            ].map(([label, q]) => `<button class="ai-chip" data-ai-q="${PCL.esc(q)}">${PCL.esc(label)}</button>`).join('')}
          </div>
          <div class="ai-input">
            <input id="aiInput" placeholder="问安装、Java、Mod、登录、报错…" autocomplete="off" />
            <button id="aiSend" class="btn primary">发送</button>
          </div>
        </div>`,
      onMount: (wrap, closeFn) => {
        PCL.assistant._close = closeFn;
        PCL.assistant._render = (w) => render(w);
        wrap.querySelector('#aiGear')?.addEventListener('click', async () => {
          closeFn();
          PCL.state.pageData.setTab = 'launcher';
          await PCL.go('settings');
        });
        renderChat(wrap, { assistantBusy: false });
        const input = wrap.querySelector('#aiInput');
        const send = () => ask(input.value, wrap);
        wrap.querySelector('#aiSend').addEventListener('click', send);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); }
        });
        PCL.$$('[data-ai-q]', wrap).forEach((b) =>
          b.addEventListener('click', () => { input.value = b.dataset.aiQ; ask(b.dataset.aiQ, wrap); })
        );
        wrap.addEventListener('click', (e) => {
          const b = e.target.closest('[data-ai-act]');
          if (!b) return;
          const msg = history().messages.find((m) => m.id === b.dataset.aiMsg);
          const act = msg && msg.actions && msg.actions[Number(b.dataset.aiAct)];
          if (act) runAction(act, msg.id, Number(b.dataset.aiAct), wrap);
        });
        setTimeout(() => input.focus(), 40);
      },
    });
    return modal;
  }

  function mountFab() {
    if (PCL.$('#aiFab')) return;
    const btn = document.createElement('button');
    btn.id = 'aiFab';
    btn.className = 'ai-fab';
    btn.innerHTML = '<span class="ai-fab-ico">SPL</span><span>小助手</span><i></i>';
    btn.title = 'SPL 小助手 · 回答启动器问题';
    btn.addEventListener('click', open);
    document.body.appendChild(btn);
  }

  PCL.assistant = { open, close, ask: (q) => { const m = open(); const w = m.el; return ask(q, w); }, mountFab, context };
  window.addEventListener('DOMContentLoaded', () => setTimeout(mountFab, 120));
})();
