/* ============================ 下载 ============================ */
(function () {
  const P = (window.PCLPages = window.PCLPages || {});
  const API = window.API;

  const SIDE = [
    { id: 'auto', label: '自动安装', icon: 'download', div: 'Minecraft' },
    { id: 'manual', label: '手动安装包', icon: 'wrench' },
    { id: 'mod', label: 'Mod', icon: 'mod', div: '社区资源' },
    { id: 'pack', label: '整合包', icon: 'package' },
    { id: 'datapack', label: '数据包', icon: 'folder' },
    { id: 'resource', label: '资源包', icon: 'image' },
    { id: 'shader', label: '光影包', icon: 'shader' },
  ];

  /** 从版本名反推 Modrinth 加载器过滤器 */
  function loaderOf(versionId) {
    const s = String(versionId || '');
    if (/neoforge/i.test(s)) return 'neoforge';
    if (/forge/i.test(s)) return 'forge';
    if (/fabric/i.test(s)) return 'fabric';
    if (/quilt/i.test(s)) return 'quilt';
    return '';
  }

  /** 优先使用版本扫描得到的真实 loader，整合包名里不一定带 Fabric/Forge */
  function gameVersionOfCurrent(state) {
    const v = PCL.currentVersion();
    return (v && v.gameVersion) || ((v && v.id) || state.settings.version || '').split('-')[0];
  }
  function loaderOfCurrent(state) {
    const v = PCL.currentVersion();
    const loader = (v && v.loader ? v.loader : loaderOf(v ? v.id : state.settings.version)).toLowerCase();
    if (loader.includes('neoforge')) return 'neoforge';
    if (loader.includes('forge')) return 'forge';
    if (loader.includes('quilt')) return 'quilt';
    if (loader.includes('fabric')) return 'fabric';
    return '';
  }

  P.download = {
    sidebar: true,
    render(state) {
      const pd = state.pageData;
      const tab = pd.dlTab || 'auto';
      const side = SIDE.map(
        (s) =>
          `${s.div ? `<div class="divider">${s.div}</div>` : ''}
           <div class="item ${tab === s.id ? 'active' : ''}" data-tab="${s.id}">${Icons[s.icon]}<span>${s.label}</span></div>`
      ).join('');

      return `<div class="sidebar">${side}</div>
        <div class="grow" style="overflow-y:auto;padding-right:2px">
          ${tab === 'auto' ? autoHtml(state) : ''}
          ${tab === 'manual' ? manualHtml(state) : ''}
          ${['mod', 'datapack', 'resource', 'shader'].includes(tab) ? searchHtml(state, tab) : ''}
          ${tab === 'pack' ? packHtml(state) : ''}
        </div>
        <div class="fab-power" id="fabPower" title="启动游戏">${Icons.power}</div>`;
    },

    mount(root, state) {
      const pd = state.pageData;
      PCL.$('#fabPower', root)?.addEventListener('click', () => PCL.go('home'));
      PCL.$$('.sidebar .item', root).forEach((item) =>
        item.addEventListener('click', async () => {
          pd.dlTab = item.dataset.tab;
          if ((pd.dlTab === 'auto' || pd.dlTab === 'mod') && !pd.manifest) await loadManifest(state);
          if (pd.dlTab === 'auto' && !pd.fabricLoaders) await loadFabric(state);
          PCL.render();
        })
      );

      if ((pd.dlTab || 'auto') === 'auto' || !pd.dlTab) {
        if (!pd.manifest && !pd.manifestError && !pd.manifestLoading) {
          // 只在首次进入时自动加载；失败后停在错误卡片，交给用户点“重新获取”
          loadManifest(state).then(() => PCL.render());
        }
        if (pd.manifest || pd.manifestError) mountAuto(root, state);
      } else if (['mod', 'resource', 'datapack', 'shader'].includes(pd.dlTab)) {
        mountSearch(root, state, pd.dlTab);
      } else if (pd.dlTab === 'pack') {
        mountPack(root, state);
      } else if (pd.dlTab === 'manual') {
        mountManual(root, state);
      }
    },
  };

  /* ---------------------- 数据加载 ---------------------- */
  async function loadManifest(state) {
    const pd = state.pageData;
    pd.manifestError = null;
    pd.manifestLoading = true;
    try {
      const m = await API.manifest();
      if (!m || !Array.isArray(m.versions) || !m.versions.length) throw new Error('版本清单为空');
      pd.manifest = m;
      // 保留清单里的全部版本（正式版 / 快照 / 远古版本），选择器里再分类过滤
      pd.gameVersions = m.versions;
      const latest = m.versions.find((v) => v.type === 'release');
      pd.gameVersion = pd.gameVersion || (latest ? latest.id : '');
    } catch (e) {
      const msg = String(e && e.message ? e.message : e).replace(/^获取版本列表失败：/, '');
      pd.manifest = null;
      pd.manifestError = msg;
      pd.gameVersions = [];
      PCL.toast('获取版本列表失败：' + msg, 'error', 4500);
    } finally {
      pd.manifestLoading = false;
    }
  }

  function manifestStateHtml(pd) {
    if (pd.manifestError) {
      return `<div class="card">
        <div class="card-title">版本列表</div>
        <div class="tiny" style="color:var(--danger);line-height:1.8;word-break:break-all">${PCL.esc(pd.manifestError)}</div>
        <div class="tiny muted mt-8">已自动尝试官方源与 BMCLAPI，仍失败请检查网络或代理设置。</div>
        <button class="btn small primary mt-12" id="btnRetryManifest">重新获取</button>
      </div>`;
    }
    return `<div class="card">
      <div class="card-title">版本列表</div>
      <div class="tiny muted">正在获取版本列表…</div>
    </div>`;
  }

  async function loadFabric(state) {
    try {
      const [loaders] = await Promise.all([API.fabric.loaders()]);
      state.pageData.fabricLoaders = loaders;
      state.pageData.fabricLoader = loaders[0] ? loaders[0].version : '';
    } catch (e) {
      state.pageData.fabricLoaders = [{ version: '0.16.10', stable: true }];
      state.pageData.fabricLoader = '0.16.10';
    }
  }

  /* ---------------------- 自动安装 ---------------------- */
  /** 由版本发布日期推断所需 Java（与官方 javaVersion 一致：1.20.5→21，1.17→17） */
  function javaNeeded(pd, gv) {
    const v = (pd.gameVersions || []).find((x) => x.id === gv);
    if (v && v.javaVersion && v.javaVersion.majorVersion) return v.javaVersion.majorVersion;
    const t = v && v.releaseTime ? new Date(v.releaseTime).getTime() : 0;
    if (t >= Date.UTC(2024, 3, 23)) return 21;
    if (t >= Date.UTC(2021, 5, 8)) return 17;
    return 8;
  }

  function autoHtml(state) {
    const pd = state.pageData;
    if (!pd.manifest) return manifestStateHtml(pd);
    const all = pd.gameVersions || [];
    const releases = all.filter((v) => v.type === 'release');
    const snaps = all.filter((v) => v.type === 'snapshot' && !isFool(v.id));
    const old = all.filter((v) => v.type === 'old_beta' || v.type === 'old_alpha');
    const fools = all.filter((v) => v.type === 'snapshot' && isFool(v.id));
    const latestRelease = releases[0];
    const latestSnap = snaps[0];
    const open = pd.dlOpen || {};

    const fmtDate = (t) => {
      if (!t) return '';
      const d = new Date(t);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const latestRow = (v, kind) =>
      v
        ? `<div class="latest-row" data-gv="${PCL.esc(v.id)}">
            <span class="latest-block">${PCL.blockIcon(kind === 'release' ? 'grass' : 'command')}</span>
            <div class="latest-main">
              <div class="latest-name">${PCL.esc(v.id)}</div>
              <div class="latest-sub">最新${kind === 'release' ? '正式版' : '预览版'}，发布于 ${fmtDate(v.releaseTime)}</div>
            </div>
          </div>`
        : '<div class="latest-row disabled"><div class="latest-main"><div class="latest-sub">版本清单加载中…</div></div></div>';

    const group = (key, label, list) => {
      const expanded = !!open[key];
      const rows = expanded
        ? list
            .map(
              (v) => `<div class="ver-row" data-gv="${PCL.esc(v.id)}">
                <span class="ver-id">${PCL.esc(v.id)}</span>
                <span class="ver-date">${fmtDate(v.releaseTime)}</span>
              </div>`
            )
            .join('')
        : '';
      return `<div class="ver-group ${expanded ? 'open' : ''}" data-group="${key}">
        <div class="ver-head" data-toggle="${key}">
          <span class="ver-title">${label} <span class="ver-count">(${list.length})</span></span>
          <span class="ver-chev">${Icons.chevron}</span>
        </div>
        <div class="ver-body">${rows}</div>
      </div>`;
    };

    return `
    <div class="card latest-card">
      <div class="card-title">最新版本</div>
      ${latestRow(latestRelease, 'release')}
      ${latestRow(latestSnap, 'snapshot')}
    </div>
    <div class="ver-groups">
      ${group('release', '正式版', releases)}
      ${group('snapshot', '预览版', snaps)}
      ${group('old', '远古版', old)}
      ${group('fool', '愚人节版', fools)}
    </div>`;
  }

  const FOOL_IDS = new Set([
    '15w14a', '3D Shareware v1.34', '20w14∞', '22w13oneBlockAt', '23w13a_or_b',
    '24w14potato', '25w14craftmine', '1.RV-Pre1', '23w13a_or_b_2',
  ]);
  function isFool(id) {
    return FOOL_IDS.has(id) || /craftmine|potato|oneblock|shareware|∞/i.test(id || '');
  }

  function mountAuto(root, state) {
    const pd = state.pageData;
    PCL.$('#btnRetryManifest', root)?.addEventListener('click', async () => {
      pd.manifestError = null;
      pd.manifestLoading = true;
      PCL.render();
      await loadManifest(state);
      PCL.render();
    });
    if (!pd.javaList) {
      API.java
        .detect()
        .then((list) => {
          pd.javaList = list;
        })
        .catch(() => {});
    }

    PCL.$$('[data-gv]', root).forEach((el) =>
      el.addEventListener('click', () => openInstallModal(state, el.dataset.gv))
    );

    PCL.$$('[data-toggle]', root).forEach((el) =>
      el.addEventListener('click', () => {
        pd.dlOpen = pd.dlOpen || {};
        pd.dlOpen[el.dataset.toggle] = !pd.dlOpen[el.dataset.toggle];
        PCL.render();
      })
    );
  }

  async function openInstallModal(state, gv) {
    const pd = state.pageData;
    pd.gameVersion = gv;
    const javas = pd.javaList || [];
    const need = javaNeeded(pd, gv);
    const javaReady = javas.find((j) => j.major === need) || javas.find((j) => j.major > need);

    const body = `
      <div class="set-row"><label>游戏版本</label><input class="input" value="${PCL.esc(gv)}" readonly /></div>
      <div class="set-row"><label>加载器</label>
        <select class="select" id="imLoader">
          <option value="">原版</option>
          <option value="fabric">Fabric</option>
          <option value="quilt">Quilt</option>
          <option value="forge">Forge</option>
          <option value="neo">NeoForge</option>
          <option value="optifine">OptiFine</option>
        </select>
      </div>
      <div id="imLoaderBox"></div>
      <div class="set-row"><label>安装后名称</label><input class="input" id="imName" value="${PCL.esc(gv)}" /></div>
      <div class="tiny muted mt-8">该版本需要 Java ${need} · ${
        javaReady ? `已找到 Java ${javaReady.major}` : '本机未检测到，安装后启动时会自动下载'
      }</div>`;

    PCL.modal({
      title: '安装游戏',
      width: 520,
      body,
      footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="imInstall">开始安装</button>',
      onMount: (wrap, close) => {
        const loaderSel = PCL.$('#imLoader', wrap);
        const box = PCL.$('#imLoaderBox', wrap);
        const nameInput = PCL.$('#imName', wrap);

        const refreshLoaderBox = async (loader) => {
          if (!loader) {
            box.innerHTML = '';
            nameInput.value = gv;
            return;
          }
          if (loader === 'fabric') {
            if (!pd.fabricLoaders) await loadFabric(state);
            const opts = (pd.fabricLoaders || [])
              .map((l) => `<option value="${PCL.esc(l.version)}">${PCL.esc(l.version)}${l.stable ? '（推荐）' : ''}</option>`)
              .join('');
            box.innerHTML = `<div class="set-row"><label>Fabric 版本</label><select class="select" id="imFab">${opts}</select></div>`;
            nameInput.value = `${gv}-Fabric ${pd.fabricLoader || ''}`.trim();
          } else if (loader === 'quilt') {
            box.innerHTML = '<div class="set-row"><label>Quilt 版本</label><select class="select" id="imQuilt"><option>加载中…</option></select></div>';
            const r = await API.quilt.list(gv);
            if (loaderSel.value !== 'quilt') return;
            const opts = (r.versions || [])
              .map((l) => `<option value="${PCL.esc(l.version)}">${PCL.esc(l.version)}${l.stable ? '（推荐）' : ''}</option>`)
              .join('');
            box.innerHTML = `<div class="set-row"><label>Quilt 版本</label><select class="select" id="imQuilt">${opts || '<option value="">暂无可用版本</option>'}</select></div>`;
            nameInput.value = `${gv}-Quilt ${((r.versions || [])[0] || {}).version || ''}`.trim();
          } else if (loader === 'optifine') {
            box.innerHTML = '<div class="set-row"><label>OptiFine 版本</label><select class="select" id="imOF"><option>加载中…</option></select></div>';
            const r = await API.optifine.list(gv);
            if (loaderSel.value !== 'optifine') return;
            const opts = (r.versions || [])
              .map((v) => `<option value="${PCL.esc(v.edition)}">${PCL.esc(v.edition)}</option>`)
              .join('');
            box.innerHTML = `<div class="set-row"><label>OptiFine 版本</label><select class="select" id="imOF">${
              opts || `<option value="">${PCL.esc(r.error || '暂无该版本的 OptiFine')}</option>`
            }</select></div><div class="tiny muted mt-6">从 optifine.net 官方下载并调用官方安装器，需要 Java 8+。</div>`;
            nameInput.value = `${gv}-OptiFine ${((r.versions || [])[0] || {}).edition || ''}`.trim();
          } else if (loader === 'forge') {
            box.innerHTML = '<div class="set-row"><label>Forge 版本</label><select class="select" id="imForge"><option>加载中…</option></select></div>';
            await loadForge(state);
            if (loaderSel.value !== 'forge') return;
            const opts = (pd.forgeVersions || [])
              .map((f) => `<option value="${PCL.esc(f.version)}">${PCL.esc(f.version)}${f.recommended ? '（推荐）' : ''}</option>`)
              .join('');
            box.innerHTML = `<div class="set-row"><label>Forge 版本</label><select class="select" id="imForge">${
              opts || '<option value="">暂无可用版本</option>'
            }</select></div>${
              pd.forgeError
                ? `<div class="tiny" style="color:var(--danger);line-height:1.7;word-break:break-all">${PCL.esc(pd.forgeError)}</div>
                   <button class="btn small mt-8" id="btnRetryForge">重新获取</button>`
                : ''
            }`;
            PCL.$('#btnRetryForge', wrap)?.addEventListener('click', () => refreshLoaderBox('forge'));
            nameInput.value = `${gv}-Forge ${pd.forgeVersion || ''}`.trim();
          } else {
            box.innerHTML = '<div class="set-row"><label>NeoForge 版本</label><select class="select" id="imNeo"><option>加载中…</option></select></div>';
            await loadNeo(state);
            if (loaderSel.value !== 'neo') return;
            const opts = (pd.neoVersions || [])
              .map((n) => `<option value="${PCL.esc(n.version)}">${PCL.esc(n.version)}</option>`)
              .join('');
            box.innerHTML = `<div class="set-row"><label>NeoForge 版本</label><select class="select" id="imNeo">${
              opts || '<option value="">暂无可用版本</option>'
            }</select></div>${
              pd.neoError
                ? `<div class="tiny" style="color:var(--danger);line-height:1.7;word-break:break-all">${PCL.esc(pd.neoError)}</div>
                   <button class="btn small mt-8" id="btnRetryNeo">重新获取</button>`
                : ''
            }`;
            PCL.$('#btnRetryNeo', wrap)?.addEventListener('click', () => refreshLoaderBox('neo'));
            nameInput.value = `${gv}-NeoForge ${pd.neoVersion || ''}`.trim();
          }
        };

        loaderSel.addEventListener('change', () => refreshLoaderBox(loaderSel.value));

        PCL.$('#imInstall', wrap).addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          const loader = loaderSel.value;
          btn.disabled = true;
          btn.textContent = '安装中…';
          try {
            if (loader === 'fabric') {
              const lv = PCL.$('#imFab', wrap).value;
              const r = await API.install.fabric({ gameVersion: gv, loaderVersion: lv, installBase: true, name: nameInput.value.trim() });
              await afterInstall(state, r);
            } else if (loader === 'quilt') {
              const lv = PCL.$('#imQuilt', wrap).value;
              if (!lv) throw new Error('暂无可用 Quilt 版本');
              const r = await API.quilt.install({ gameVersion: gv, loaderVersion: lv, installBase: true, name: nameInput.value.trim() });
              await afterInstall(state, r);
            } else if (loader === 'optifine') {
              const edition = PCL.$('#imOF', wrap).value;
              if (!edition) throw new Error('暂无可用 OptiFine 版本');
              const r = await API.optifine.install({ mcVersion: gv, edition, name: nameInput.value.trim() });
              await afterInstall(state, r);
            } else if (loader === 'forge') {
              const fv = PCL.$('#imForge', wrap).value;
              if (!fv) throw new Error('暂无可用 Forge 版本');
              const r = await API.forge.install({ mcVersion: gv, forgeVersion: fv, kind: 'forge', name: nameInput.value.trim() });
              await afterInstall(state, r);
            } else if (loader === 'neo') {
              const nv = PCL.$('#imNeo', wrap).value;
              if (!nv) throw new Error('暂无可用 NeoForge 版本');
              const r = await API.forge.install({ mcVersion: gv, neoVersion: nv, kind: 'neoforge', name: nameInput.value.trim() });
              await afterInstall(state, r);
            } else {
              const r = await API.install.version(gv, nameInput.value.trim());
              await afterInstall(state, r);
            }
            close();
          } catch (err) {
            PCL.toast(String(err.message || err).replace(/^Error invoking remote method .*?: /, ''), 'error', 5000);
            btn.disabled = false;
            btn.textContent = '开始安装';
          }
          PCL.render();
        });
      },
    });
  }

  async function afterInstall(state, r) {
    if (!r) return;
    if (r.ok === false) {
      PCL.toast(r.error || '安装失败', 'error', 6000);
      return;
    }
    const id = r.id || (state.pageData.loader === '' ? state.pageData.gameVersion : '');
    if (id) {
      await PCL.saveSettings({ version: id });
      state.versions = await API.versions.list();
      PCL.toast(`已安装 ${id}`, 'success', 3000);
    }
  }

  async function loadForge(state) {
    const pd = state.pageData;
    pd.forgeVersions = [];
    pd.forgeVersion = '';
    pd.forgeError = '';
    try {
      const list = await API.forge.versions(pd.gameVersion || (pd.gameVersions && pd.gameVersions[0].id));
      if (list && list.error) {
        pd.forgeError = String(list.error);
        PCL.toast('Forge 版本列表获取失败：' + pd.forgeError, 'error', 4500);
        return;
      }
      pd.forgeVersions = Array.isArray(list) ? list : [];
      if (!pd.forgeVersions.length) throw new Error('没有可用的 Forge 版本');
      const rec = pd.forgeVersions.find((f) => f.recommended) || pd.forgeVersions.find((f) => f.latest) || pd.forgeVersions[0];
      pd.forgeVersion = rec ? rec.version : '';
    } catch (e) {
      pd.forgeVersions = [];
      pd.forgeError = String(e && e.message ? e.message : e);
      PCL.toast('Forge 版本列表获取失败：' + pd.forgeError, 'error', 4500);
    }
  }

  async function loadNeo(state) {
    const pd = state.pageData;
    pd.neoVersions = [];
    pd.neoVersion = '';
    pd.neoError = '';
    try {
      const list = await API.forge.neoVersions(pd.gameVersion || (pd.gameVersions && pd.gameVersions[0].id));
      if (list && list.error) {
        pd.neoError = String(list.error);
        PCL.toast('NeoForge 版本列表获取失败：' + pd.neoError, 'error', 4500);
        return;
      }
      pd.neoVersions = Array.isArray(list) ? list : [];
      if (!pd.neoVersions.length) throw new Error('没有可用的 NeoForge 版本');
      pd.neoVersion = pd.neoVersions[0].version;
    } catch (e) {
      pd.neoVersions = [];
      pd.neoError = String(e && e.message ? e.message : e);
      PCL.toast('NeoForge 版本列表获取失败：' + pd.neoError, 'error', 4500);
    }
  }

  /* ---------------------- 手动安装 ---------------------- */
  function manualHtml() {
    return `
    <div class="dl-head">
      <div>
        <div class="title">手动安装</div>
        <div class="desc">把官方的版本文件夹（含 .json 与 .jar）放进 versions 目录，启动器会自动识别。</div>
      </div>
      <button class="btn" id="btnOpenVersions">${Icons.folder}打开 versions 目录</button>
    </div>
    <div class="card">
      <div class="card-title">目录结构</div>
      <pre style="font:12px/1.8 'Cascadia Mono',Consolas,monospace;color:var(--text-2);margin:0;white-space:pre-wrap">.minecraft/
└── versions/
    └── 1.21.4/
        ├── 1.21.4.json
        ├── 1.21.4.jar
        └── natives/</pre>
      <div class="tiny muted mt-12" style="line-height:1.8">
        支持带 inheritsFrom 的衍生版本（Fabric、Forge、OptiFine、整合包），启动器会自动合并父版本的依赖库与启动参数。
      </div>
    </div>`;
  }

  function mountManual(root) {
    PCL.$('#btnOpenVersions', root)?.addEventListener('click', () => API.versions.open(''));
  }

  /* ---------------------- Mod / 资源包搜索 ---------------------- */
  const CONTENT_META = {
    mod: { key: 'modSearch', queryKey: 'modQuery', type: 'mod', title: 'Mod 下载', desc: '进入页面默认按下载量展示热门 Mod；下载会落到当前版本的 mods 目录，请确认版本与加载器匹配。', ph: '搜索 Mod，例如 sodium、create；留空查看热门…' },
    datapack: { key: 'datapackSearch', queryKey: 'datapackQuery', type: 'datapack', title: '数据包下载', desc: '进入页面默认展示热门数据包；下载会落到当前版本的 datapacks 目录，适用于刷怪、地形、配方等原版扩展。', ph: '搜索数据包，例如 terralith、tectonic；留空查看热门…' },
    resource: { key: 'resourceSearch', queryKey: 'resourceQuery', type: 'resourcepack', title: '资源包下载', desc: '进入页面默认展示热门资源包；下载会落到当前版本的 resourcepacks 目录。', ph: '搜索资源包，例如 faithful、fresh animations；留空查看热门…' },
    shader: { key: 'shaderSearch', queryKey: 'shaderQuery', type: 'shader', title: '光影包下载', desc: '进入页面默认展示热门光影包；下载会落到当前版本的 shaderpacks 目录，需要 Iris 或 OptiFine 才能生效。', ph: '搜索光影，例如 complementary、bsl；留空查看热门…' },
  };

  function searchHtml(state, tab) {
    const pd = state.pageData;
    const meta = CONTENT_META[tab] || CONTENT_META.mod;
    const key = meta.key;
    const res = pd[key];
    const kind = meta.type;
    const query = String(pd[meta.queryKey] || '').trim();
    const source = tab === 'mod' ? (pd.modSource || 'modrinth') : 'modrinth';
    const loading = !!pd[key + 'Loading'];
    const isHot = !query;
    const curseKeyless = source === 'curseforge' && !String((state.settings && state.settings.curseForgeApiKey) || '').trim();

    const cards = res && res.hits
      ? res.hits
          .map(
            (h) => `<div class="result-card" data-project="${PCL.esc(h.id || h.slug)}" data-title="${PCL.esc(h.title)}">
            ${h.icon ? `<img class="cover" src="${PCL.esc(h.icon)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : `<div class="cover" style="display:grid;place-items:center;color:var(--accent)">${Icons.box}</div>`}
            <div class="rc-main">
              <div class="rc-title">${PCL.esc(h.title)}</div>
              <div class="rc-desc">${PCL.esc(h.description || '')}</div>
              <div class="rc-foot">
                <span class="ellipsis">${PCL.esc(h.author || '')} · ↓ ${PCL.fmtNum(h.downloads)}</span>
                <button class="btn small outline" data-install="${PCL.esc(h.id || h.slug)}" data-file="${PCL.esc(h.fileId || '')}">下载</button>
              </div>
            </div>
          </div>`
          )
          .join('')
      : '';

    const err = pd[key + 'Error'];
    const currentId = (PCL.currentVersion() && PCL.currentVersion().id) || state.settings.version || '';
    const snapshot = /snapshot|pre-release|pre\d|^w\d|rc\d/i.test(currentId);
    const emptyText = tab === 'mod' && snapshot && !isHot
      ? `没有找到支持 ${PCL.esc(gameVersionOfCurrent(state))} 的 Mod。当前版本是快照（${PCL.esc(currentId)}），${source === 'curseforge' ? 'CurseForge' : 'Modrinth'} 通常不收录快照；请切换到正式版后再搜索。`
      : isHot
        ? '暂时没有可用的热门推荐，检查网络后重试'
        : '没有找到相关项目，换个关键词试试';
    const errorBody = err
      ? `<div class="empty">${curseKeyless && isHot ? 'CurseForge 免 Key 只能按项目名或链接精确搜索，不能浏览热门。' : `搜索失败：${PCL.esc(String(err).replace(/^Error invoking remote method .*?: /, ''))}`}<div style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${curseKeyless && isHot ? '<button class="btn small primary" data-cfsrc="modrinth">查看 Modrinth 热门</button>' : ''}<button class="btn small" data-retry>重试</button></div></div>`
      : loading
        ? `<div class="empty">正在加载${isHot ? '热门推荐' : '搜索结果'}…</div>`
        : res
          ? cards
            ? `<div class="result-grid">${cards}</div>`
            : `<div class="empty">${emptyText}</div>`
          : `<div class="empty">${query ? '点击“搜索”获取结果' : '正在加载热门推荐…'}</div>`;

    const body = errorBody;

    const sourceRow = tab === 'mod'
      ? `<div class="source-row">
          <span class="tiny muted">内容源</span>
          <button class="btn small ${source === 'modrinth' ? 'primary' : 'outline'}" data-cfsrc="modrinth">Modrinth</button>
          <button class="btn small ${source === 'curseforge' ? 'primary' : 'outline'}" data-cfsrc="curseforge">CurseForge</button>
          ${source === 'curseforge' ? `<span class="tiny muted">官方 Key 可选 · 免 Key 时支持精确项目名/链接</span>` : ''}
        </div>`
      : '';
    return `
    <div class="dl-head">
      <div>
        <div class="title">${meta.title}${isHot ? '<span class="hot-chip">热门</span>' : ''}</div>
        <div class="desc">${meta.desc}</div>
      </div>
    </div>
    ${sourceRow}
    <div class="search-bar">
      <input class="input" id="searchInput" placeholder="${meta.ph}" value="${PCL.esc(query)}" />
      <button class="btn primary" id="btnSearch">${Icons.search}${isHot ? '刷新热门' : '搜索'}</button>
    </div>
    <div class="tiny muted" style="margin-bottom:10px">
      数据来源 ${source === 'curseforge' ? (pd.modSearchKeyless ? 'CurseForge 公开元数据 + ForgeCDN' : 'CurseForge 官方 API') : 'Modrinth 开放 API'} · ${isHot ? '热门推荐，按下载量排序' : '关键词搜索'} · 当前版本：<b style="color:var(--text-2)">${PCL.esc(state.settings.version || '未选择')}</b>
    </div>
    <div class="card" style="padding:${res && res.hits && res.hits.length ? '12px' : '0'};${res && res.hits && res.hits.length ? '' : 'background:transparent;border-color:transparent;box-shadow:none'}">${body}</div>`;
  }

  /** 进入页面即加载热门，不要求用户先输入关键词 */
  async function loadHotContent(state, tab) {
    const pd = state.pageData;
    const meta = CONTENT_META[tab] || CONTENT_META.mod;
    const key = meta.key;
    if (String(pd[meta.queryKey] || '').trim() || pd[key] || pd[key + 'Loading']) return;
    const source = tab === 'mod' ? (pd.modSource || 'modrinth') : 'modrinth';
    const hasCfKey = !!(state.settings && state.settings.curseForgeApiKey && String(state.settings.curseForgeApiKey).trim());
    if (source === 'curseforge' && !hasCfKey) {
      pd[key] = null;
      pd[key + 'Error'] = 'CurseForge 免 Key 不能浏览热门，只支持精确项目名或链接搜索。';
      PCL.render();
      return;
    }
    const token = (pd[key + 'Token'] || 0) + 1;
    pd[key + 'Token'] = token;
    pd[key + 'Loading'] = true;
    pd[key + 'Error'] = '';
    try {
      if (source === 'curseforge') {
        const r = await API.curseforge.search({ query: '', kind: 'mod', gameVersion: gameVersionOfCurrent(state), loader: loaderOfCurrent(state) });
        if (r && r.ok === false) throw new Error(r.error || 'CurseForge 热门加载失败');
        if (pd[key + 'Token'] !== token) return;
        pd.modSearchKeyless = !!r.keyless;
        pd[key] = { hits: r.hits || [], total: r.total || 0 };
      } else {
        const r = await API.modrinth.search({
          query: '',
          type: meta.type,
          gameVersion: gameVersionOfCurrent(state),
          loader: meta.type === 'mod' ? loaderOfCurrent(state) : '',
          limit: 18,
          sort: 'downloads',
        });
        if (pd[key + 'Token'] !== token) return;
        pd[key] = r;
      }
    } catch (e) {
      if (pd[key + 'Token'] !== token) return;
      pd[key] = { hits: [] };
      pd[key + 'Error'] = String(e.message || e).replace(/^Error invoking remote method .*?: /, '');
    } finally {
      if (pd[key + 'Token'] === token) {
        pd[key + 'Loading'] = false;
        PCL.render();
      }
    }
  }

  function mountSearch(root, state, tab) {
    const pd = state.pageData;
    const meta = CONTENT_META[tab] || CONTENT_META.mod;
    const input = PCL.$('#searchInput', root);
    const source = () => (tab === 'mod' ? (pd.modSource || 'modrinth') : 'modrinth');
    const hasCfKey = () => !!(state.settings && state.settings.curseForgeApiKey && String(state.settings.curseForgeApiKey).trim());

    const doSearch = async () => {
      const q = input.value.trim();
      pd[meta.queryKey] = q;
      const btn = PCL.$('#btnSearch', root);
      if (btn) {
        btn.disabled = true;
        btn.textContent = '搜索中…';
      }
      const token = (pd[meta.key + 'Token'] || 0) + 1;
      pd[meta.key + 'Token'] = token;
      pd[meta.key + 'Loading'] = true;
      pd[meta.key + 'Error'] = '';
      try {
        const gameVersion = gameVersionOfCurrent(state);
        const loader = loaderOfCurrent(state);
        if (source() === 'curseforge') {
          if (!q && !hasCfKey()) throw new Error('CurseForge 免 Key 不能浏览热门，请输入精确项目名或项目链接');
          const r = await API.curseforge.search({ query: q, kind: 'mod', gameVersion, loader });
          if (r && r.ok === false) throw new Error(r.error || 'CurseForge 搜索失败');
          if (pd[meta.key + 'Token'] !== token) return;
          pd.modSearchKeyless = !!r.keyless;
          pd[meta.key] = { hits: r.hits || [], total: r.total || 0 };
        } else {
          const r = await API.modrinth.search({
            query: q,
            type: meta.type,
            gameVersion,
            loader: meta.type === 'mod' ? loader : '',
            limit: 18,
            sort: q ? 'relevance' : 'downloads',
          });
          if (pd[meta.key + 'Token'] !== token) return;
          pd[meta.key] = r;
        }
        pd[meta.key + 'Error'] = '';
      } catch (e) {
        if (pd[meta.key + 'Token'] !== token) return;
        const msg = String(e.message || e).replace(/^Error invoking remote method .*?: /, '');
        PCL.toast('搜索失败：' + msg, 'error');
        pd[meta.key] = { hits: [] };
        pd[meta.key + 'Error'] = msg;
      } finally {
        if (pd[meta.key + 'Token'] === token) {
          pd[meta.key + 'Loading'] = false;
          PCL.render().then(() => {
            const i = PCL.$('#searchInput');
            if (i) i.value = q;
          });
        }
      }
    };

    PCL.$$('[data-cfsrc]', root).forEach((el) =>
      el.addEventListener('click', () => {
        pd.modSource = el.dataset.cfsrc;
        pd.modSearch = null;
        pd.modSearchLoading = false;
        pd.modSearchError = '';
        pd.modSearchAuto = !!String(pd[meta.queryKey] || '').trim() && (el.dataset.cfsrc !== 'curseforge' || hasCfKey());
        PCL.render();
      })
    );
    PCL.$('#btnSearch', root)?.addEventListener('click', doSearch);
    PCL.$('[data-retry]', root)?.addEventListener('click', doSearch);
    input?.addEventListener('keydown', (e) => e.key === 'Enter' && doSearch());

    PCL.$$('[data-install]', root).forEach((btn) =>
      btn.addEventListener('click', async () => {
        const card = btn.closest('.result-card');
        btn.disabled = true;
        btn.textContent = '下载中…';
        const kind = meta.type;
        const src = source();
        try {
          const r = src === 'curseforge'
            ? await API.curseforge.install({
                projectId: btn.dataset.install,
                fileId: btn.dataset.file,
                title: card.dataset.title,
                kind: 'mod',
                versionId: state.settings.version,
                gameVersion: gameVersionOfCurrent(state),
                loader: loaderOfCurrent(state),
              })
            : await API.modrinth.install({
                idOrSlug: btn.dataset.install,
                title: card.dataset.title,
                kind,
                versionId: state.settings.version,
                gameVersion: gameVersionOfCurrent(state),
                loader: loaderOfCurrent(state),
              });
          if (r && r.ok === false) throw new Error(r.error || '下载失败');
          const deps = Array.isArray(r && r.dependencies) ? r.dependencies.length : 0;
          PCL.toast(`已下载 ${card.dataset.title}${deps ? `，并安装 ${deps} 个必需前置` : ''}`, 'success', deps ? 3200 : 1800);
        } catch (e) {
          PCL.toast('下载失败：' + String(e.message || e).replace(/^Error invoking remote method .*?: /, ''), 'error', 4500);
        } finally {
          btn.disabled = false;
          btn.textContent = '下载';
        }
      })
    );

    if (pd[meta.key + 'Auto']) {
      pd[meta.key + 'Auto'] = false;
      setTimeout(doSearch, 0);
    } else if (!String(pd[meta.queryKey] || '').trim() && !pd[meta.key] && !pd[meta.key + 'Error'] && !pd[meta.key + 'Loading']) {
      loadHotContent(state, tab);
    }
  }

  /* ---------------------- 整合包 ---------------------- */
  function packHtml(state) {
    const pd = state.pageData;
    const res = pd.packSearch;
    const source = pd.packSource || 'modrinth';
    const query = String(pd.packQuery || '').trim();
    const loading = !!pd.packLoading;
    const isHot = !query;
    const hasCfKey = !!(state.settings && state.settings.curseForgeApiKey && String(state.settings.curseForgeApiKey).trim());
    const curseKeyless = source === 'curseforge' && !hasCfKey;
    const cards =
      res && res.hits
        ? res.hits
            .map(
              (h) => `<div class="result-card" data-project="${PCL.esc(h.id)}" data-title="${PCL.esc(h.title)}">
                ${h.icon ? `<img class="cover" src="${PCL.esc(h.icon)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : `<div class="cover" style="display:grid;place-items:center;color:var(--accent)">${Icons.package}</div>`}
                <div class="rc-main">
                  <div class="rc-title">${PCL.esc(h.title)}</div>
                  <div class="rc-desc">${PCL.esc(h.description || '')}</div>
                  <div class="rc-foot">
                    <span class="ellipsis">↓ ${PCL.fmtNum(h.downloads)}</span>
                    <button class="btn small outline" data-install="${PCL.esc(h.id)}" data-file="${PCL.esc(h.fileId || '')}">安装</button>
                  </div>
                </div>
              </div>`
            )
            .join('')
        : '';

    const errorBody = pd.packError
      ? `<div class="empty" style="color:var(--danger)">${curseKeyless && isHot ? 'CurseForge 免 Key 不能浏览热门整合包，请输入精确项目名或项目链接。' : `搜索失败：${PCL.esc(pd.packError)}`}<div style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${curseKeyless && isHot ? '<button class="btn small primary" data-pksrc="modrinth">查看 Modrinth 热门</button>' : ''}<button class="btn small" data-retry>重试</button></div></div>`
      : loading
        ? `<div class="empty">正在加载${isHot ? '热门整合包' : '搜索结果'}…</div>`
        : res
          ? cards
            ? `<div class="result-grid">${cards}</div>`
            : `<div class="empty">${isHot ? '暂时没有可用的热门整合包，检查网络后重试' : '没有找到相关整合包'}</div>`
          : `<div class="empty">${query ? '点击“搜索”获取结果' : '正在加载热门整合包…'}</div>`;

    return `
    <div class="dl-head">
      <div>
        <div class="title">整合包${isHot ? '<span class="hot-chip">热门</span>' : ''}</div>
        <div class="desc">默认按下载量展示热门整合包；支持 Modrinth (.mrpack) 与 CurseForge (.zip)，自动安装基础版本、下载全部 Mod 并写入覆盖配置。</div>
      </div>
      <button class="btn" id="btnLocalPack">${Icons.folder}安装本地整合包</button>
    </div>
    <div class="source-row">
      <span class="tiny muted">内容源</span>
      <button class="btn small ${source === 'modrinth' ? 'primary' : 'outline'}" data-pksrc="modrinth">Modrinth</button>
      <button class="btn small ${source === 'curseforge' ? 'primary' : 'outline'}" data-pksrc="curseforge">CurseForge</button>
      ${source === 'curseforge' ? `<span class="tiny muted">官方 Key 可选 · 免 Key 时输入精确项目名/链接</span>` : ''}
    </div>
    <div class="pack-banner">
      <div class="mt-icon" style="width:40px;height:40px;border-radius:8px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)">${Icons.package}</div>
      <div class="grow">
        <div class="bold">${isHot ? '热门整合包 · 按下载量排序' : `从 ${source === 'curseforge' ? 'CurseForge' : 'Modrinth'} 安装整合包`}</div>
        <div class="tiny muted" style="margin-top:3px">整合包会安装为独立版本，不会影响已有存档与 Mod。</div>
      </div>
    </div>
    <div class="search-bar">
      <input class="input" id="packInput" placeholder="搜索整合包，例如 fabulously optimized；留空查看热门…" value="${PCL.esc(query)}" />
      <button class="btn primary" id="btnPackSearch">${Icons.search}${isHot ? '刷新热门' : '搜索'}</button>
    </div>
    ${errorBody}`;
  }

  async function loadPackHot(state) {
    const pd = state.pageData;
    if (String(pd.packQuery || '').trim() || pd.packSearch || pd.packLoading) return;
    const source = pd.packSource || 'modrinth';
    const hasCfKey = !!(state.settings && state.settings.curseForgeApiKey && String(state.settings.curseForgeApiKey).trim());
    if (source === 'curseforge' && !hasCfKey) {
      pd.packSearch = null;
      pd.packError = 'CurseForge 免 Key 不能浏览热门整合包，只支持精确项目名或链接搜索。';
      PCL.render();
      return;
    }
    const token = (pd.packToken || 0) + 1;
    pd.packToken = token;
    pd.packLoading = true;
    pd.packError = '';
    try {
      if (source === 'curseforge') {
        const r = await API.curseforge.search({ query: '', kind: 'modpack', gameVersion: gameVersionOfCurrent(state), loader: loaderOfCurrent(state) });
        if (r && r.ok === false) throw new Error(r.error || 'CurseForge 热门整合包加载失败');
        if (pd.packToken !== token) return;
        pd.packSearch = { hits: r.hits || [], total: r.total || 0 };
      } else {
        const r = await API.modrinth.search({ query: '', type: 'modpack', limit: 12, sort: 'downloads' });
        if (pd.packToken !== token) return;
        pd.packSearch = r;
      }
    } catch (e) {
      if (pd.packToken !== token) return;
      pd.packSearch = null;
      pd.packError = String(e.message || e).replace(/^Error invoking remote method .*?: /, '');
    } finally {
      if (pd.packToken === token) {
        pd.packLoading = false;
        PCL.render();
      }
    }
  }

  function mountPack(root, state) {
    const pd = state.pageData;
    const source = () => (pd.packSource || 'modrinth');
    const hasCfKey = () => !!(state.settings && state.settings.curseForgeApiKey && String(state.settings.curseForgeApiKey).trim());
    const input = PCL.$('#packInput', root);
    const search = async () => {
      const q = input.value.trim();
      pd.packQuery = q;
      pd.packError = '';
      const btn = PCL.$('#btnPackSearch', root);
      if (btn) {
        btn.disabled = true;
        btn.textContent = '搜索中…';
      }
      const token = (pd.packToken || 0) + 1;
      pd.packToken = token;
      pd.packLoading = true;
      try {
        if (source() === 'curseforge') {
          if (!q && !hasCfKey()) throw new Error('CurseForge 免 Key 不能浏览热门整合包，请输入精确项目名或项目链接');
          const r = await API.curseforge.search({ query: q, kind: 'modpack', gameVersion: gameVersionOfCurrent(state), loader: loaderOfCurrent(state) });
          if (r && r.ok === false) throw new Error(r.error || 'CurseForge 搜索失败');
          if (pd.packToken !== token) return;
          pd.packSearch = { hits: r.hits || [], total: r.total || 0 };
        } else {
          pd.packSearch = await API.modrinth.search({ query: q, type: 'modpack', limit: 12, sort: q ? 'relevance' : 'downloads' });
          if (pd.packToken !== token) return;
        }
        pd.packError = '';
      } catch (e) {
        if (pd.packToken !== token) return;
        pd.packError = String(e.message || e).replace(/^Error invoking remote method .*?: /, '');
        pd.packSearch = null;
        PCL.toast('整合包搜索失败：' + pd.packError, 'error', 4500);
      } finally {
        if (pd.packToken === token) {
          pd.packLoading = false;
          PCL.render().then(() => {
            const i = PCL.$('#packInput');
            if (i) i.value = q;
          });
        }
      }
    };
    PCL.$$('[data-pksrc]', root).forEach((el) =>
      el.addEventListener('click', () => {
        pd.packSource = el.dataset.pksrc;
        pd.packSearch = null;
        pd.packLoading = false;
        pd.packError = '';
        pd.packAuto = !!String(pd.packQuery || '').trim() && (el.dataset.pksrc !== 'curseforge' || hasCfKey());
        PCL.render();
      })
    );
    PCL.$('#btnPackSearch', root)?.addEventListener('click', search);
    PCL.$('[data-retry]', root)?.addEventListener('click', search);
    input?.addEventListener('keydown', (e) => e.key === 'Enter' && search());

    PCL.$('#btnLocalPack', root)?.addEventListener('click', async () => {
      const file = await API.install.choosePack();
      if (!file) return;
      try {
        const r = await API.install.pack(file);
        if (r && r.ok === false) throw new Error(r.error || '安装失败');
        if (r && r.id) {
          state.versions = await API.versions.list();
          await PCL.saveSettings({ version: r.id });
          PCL.toast(`整合包已安装：${r.id}`, 'success', 4000);
          PCL.render();
        }
      } catch (e) {
        PCL.toast('安装整合包失败：' + String(e.message || e).replace(/^Error invoking remote method .*?: /, ''), 'error', 5000);
      }
    });

    PCL.$$('[data-install]', root).forEach((btn) =>
      btn.addEventListener('click', async () => {
        const card = btn.closest('.result-card');
        btn.disabled = true;
        btn.textContent = '安装中…';
        try {
          // 这里必须安装整个整合包，而不是把 .mrpack 当 Mod 丢进 mods 文件夹
          const r = source() === 'curseforge'
            ? await API.curseforge.installPackProject({
                projectId: btn.dataset.install,
                fileId: btn.dataset.file,
                title: card.dataset.title,
              })
            : await API.modrinth.installPackProject({
                idOrSlug: btn.dataset.install,
                title: card.dataset.title,
              });
          if (r && r.ok === false) throw new Error(r.error || '安装失败');
          if (r && r.id) {
            state.versions = await API.versions.list();
            await PCL.saveSettings({ version: r.id });
            PCL.toast(`整合包已安装：${r.id}`, 'success', 4500);
            PCL.render();
          }
        } catch (e) {
          PCL.toast('安装整合包失败：' + String(e.message || e).replace(/^Error invoking remote method .*?: /, ''), 'error', 5000);
        } finally {
          btn.disabled = false;
          btn.textContent = '安装';
        }
      })
    );

    if (pd.packAuto) {
      pd.packAuto = false;
      setTimeout(search, 0);
    } else if (!String(pd.packQuery || '').trim() && !pd.packSearch && !pd.packError && !pd.packLoading) {
      loadPackHot(state);
    }
  }

  /* ---------------------- 游戏版本选择器（全部版本） ---------------------- */
  const TYPE_LABEL = { release: '正式版', snapshot: '快照', old_beta: '远古 Beta', old_alpha: '远古 Alpha' };
  const TYPE_CLASS = { release: 'release', snapshot: 'snapshot', old_beta: 'old', old_alpha: 'old' };

  function pickGameVersion(state) {
    const pd = state.pageData;
    if (!pd.manifest) return PCL.toast('版本清单还在加载', 'error');
    const all = pd.versionsAll || pd.gameVersions || [];
    const installedIds = (state.versions || []).map((v) => v.id);

    let kw = '';
    let type = 'all';

    const m = PCL.modal({
      title: '选择游戏版本',
      width: 620,
      body: `<div class="search-bar" style="margin-bottom:10px">
          <input class="input" id="vpSearch" placeholder="搜索版本号，例如 1.21、1.7.10、23w" />
        </div>
        <div class="flex gap-8" id="vpChips" style="margin-bottom:10px">
          ${['all', 'release', 'snapshot', 'old']
            .map(
              (t) =>
                `<button class="btn small ${t === type ? 'primary' : ''}" data-type="${t}">${
                  t === 'all' ? '全部' : t === 'release' ? '正式版' : t === 'snapshot' ? '快照' : '远古版本'
                }</button>`
            )
            .join('')}
        </div>
        <div id="vpList" style="max-height:420px;overflow-y:auto;border:1px solid var(--line);border-radius:8px"></div>
        <div class="tiny muted mt-8" id="vpCount"></div>`,
      footer: `<button class="btn primary" data-close>关闭</button>`,
      onMount: (wrap, close) => {
        const list = wrap.querySelector('#vpList');
        const count = wrap.querySelector('#vpCount');
        const search = wrap.querySelector('#vpSearch');

        const draw = () => {
          const q = kw.toLowerCase();
          const rows = all.filter((v) => {
            if (q && !v.id.toLowerCase().includes(q)) return false;
            if (type !== 'all') {
              if (type === 'old') return v.type === 'old_beta' || v.type === 'old_alpha';
              return v.type === type;
            }
            return true;
          });
          count.textContent = `共 ${rows.length} 个版本 · 点击一行即可选用`;
          list.innerHTML = rows.length
            ? rows
                .map(
                  (v) => `<div class="row" data-vid="${PCL.esc(v.id)}" style="cursor:pointer;padding:8px 12px">
                  ${PCL.blockIcon(PCL.blockKind(v), 'sm')}
                  <span class="tag ${TYPE_CLASS[v.type] || 'snapshot'}" style="flex:0 0 auto">${TYPE_LABEL[v.type] || v.type}</span>
                  <div class="row-main">
                    <div class="row-title">${PCL.esc(v.id)}</div>
                    <div class="row-desc">发布于 ${PCL.fmtTime(v.releaseTime)}</div>
                  </div>
                  ${installedIds.includes(v.id) ? '<span class="tag" style="background:#eefaf3;border-color:#bfe6d2;color:#2fa060">已安装</span>' : ''}
                </div>`
                )
                .join('')
            : '<div class="empty">没有匹配的版本</div>';
          PCL.$$('#vpList [data-vid]', wrap).forEach((row) =>
            row.addEventListener('click', () => {
              pd.gameVersion = row.dataset.vid;
              pd.forgeVersions = null;
              pd.neoVersions = null;
              close();
              PCL.render();
            })
          );
        };

        search.addEventListener('input', () => {
          kw = search.value.trim();
          draw();
        });
        PCL.$$('#vpChips [data-type]', wrap).forEach((b) =>
          b.addEventListener('click', () => {
            type = b.dataset.type;
            PCL.$$('#vpChips [data-type]', wrap).forEach((x) => x.classList.toggle('primary', x.dataset.type === type));
            draw();
          })
        );
        draw();
      },
    });
    return m;
  }

  PCL.pickGameVersion = pickGameVersion;

})();
