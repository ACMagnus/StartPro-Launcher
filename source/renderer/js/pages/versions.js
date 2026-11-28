/* ============================ 版本管理 ============================ */
(function () {
  const P = (window.PCLPages = window.PCLPages || {});
  const API = window.API;

  P.versions = {
    render(state) {
      const versions = state.versions || [];
      const kw = (state.pageData.versionKeyword || '').toLowerCase();
      const filtered = kw ? versions.filter((v) => v.id.toLowerCase().includes(kw)) : versions;

      const rows = filtered.length
        ? filtered
            .map(
              (v) => `<div class="version-row" data-id="${PCL.esc(v.id)}">
          <div class="ver-block">${PCL.blockIcon(PCL.blockKind(v))}</div>
          <div class="row-main">
            <div class="version-name">
              ${PCL.esc(v.id)}
              ${v.id === state.settings.version ? '<span class="tag">当前</span>' : ''}
            </div>
            <div class="version-sub">
              <span>${v.loader || '原版'}</span>
              <span>${PCL.fmtSize(v.size)}</span>
              <span>${v.mods ? v.mods + ' 个 Mod' : '无 Mod'}</span>
              <span>最近使用 ${PCL.fmtTime(v.lastUsed)}</span>
            </div>
          </div>
          <div class="actions">
            <button class="btn small" data-act="use">选用</button>
            <button class="btn small" data-act="detail">设置</button>
            <button class="btn small" data-act="folder">${Icons.folder}</button>
            <button class="btn small" data-act="copy">${Icons.copy}</button>
            <button class="btn small danger" data-act="del">${Icons.trash}</button>
          </div>
        </div>`
            )
            .join('')
        : `<div class="empty">${versions.length ? '没有匹配的版本' : '还没有安装任何版本，去「下载」页安装一个吧'}</div>`;

      return `
      <div class="version-toolbar">
        <input class="input" id="verSearch" placeholder="搜索版本…" value="${PCL.esc(state.pageData.versionKeyword || '')}" />
        <button class="btn" id="btnReload">${Icons.refresh}刷新</button>
        <button class="btn" id="btnOpenDir">${Icons.folder}打开游戏目录</button>
        <button class="btn primary" style="margin-left:auto" id="btnGoDownload">${Icons.plus}安装新版本</button>
      </div>
      <div class="card" style="padding:6px 10px">${rows}</div>
      <div class="tiny muted mt-12">共 ${filtered.length} 个版本 · 游戏目录：${PCL.esc(state.settings.gameDir || '')}</div>`;
    },

    mount(root, state) {
      const search = PCL.$('#verSearch', root);
      if (search) {
        let timer = null;
        search.addEventListener('input', () => {
          state.pageData.versionKeyword = search.value;
          clearTimeout(timer);
          timer = setTimeout(() => {
            PCL.render().then(() => {
              const s = PCL.$('#verSearch');
              if (s) {
                s.focus();
                s.setSelectionRange(s.value.length, s.value.length);
              }
            });
          }, 260);
        });
      }

      PCL.$('#btnReload', root)?.addEventListener('click', async () => {
        state.versions = await API.versions.list();
        PCL.render();
      });
      PCL.$('#btnOpenDir', root)?.addEventListener('click', () => API.versions.open(''));
      PCL.$('#btnGoDownload', root)?.addEventListener('click', () => PCL.go('download'));

      PCL.$$('.version-row', root).forEach((row) => {
        const id = row.dataset.id;
        row.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-act]');
          if (!btn) return;
          e.stopPropagation();
          const act = btn.dataset.act;
          if (act === 'use') {
            PCL.saveSettings({ version: id }).then(() => {
              PCL.toast(`已选用 ${id}`, 'success', 1600);
              PCL.render();
            });
          } else if (act === 'folder') {
            API.versions.open(id);
          } else if (act === 'copy') {
            PCL.prompt('复制版本', '新版本名称', `${id}-副本`, async (name) => {
              if (!name) return;
              try {
                await API.versions.copy(id, name);
                state.versions = await API.versions.list();
                PCL.toast('复制完成', 'success');
                PCL.render();
              } catch (e) {
                PCL.toast('复制失败：' + (e.message || e), 'error');
              }
            });
          } else if (act === 'del') {
            PCL.confirm('删除版本', `确定删除「${id}」吗？该版本的 jar、Mod 与存档都会被移除，且不可恢复。`, async () => {
              try {
                const r = await API.versions.del(id);
                if (r && r.ok === false) throw new Error(r.error || '版本不存在');
                state.versions = await API.versions.list();
                if (state.settings.version === id) {
                  state.settings.version = state.versions[0] ? state.versions[0].id : '';
                  await PCL.saveSettings({ version: state.settings.version });
                }
                PCL.toast('已删除', 'success');
                PCL.render();
              } catch (e) {
                PCL.toast('删除失败：' + String(e.message || e).replace(/^Error invoking remote method .*?: /, ''), 'error');
              }
            }, '删除');
          } else if (act === 'detail') {
            PCL.state.pageData.vTab = 'launch';
            PCL.go('version', { id });
          }
        });
        row.addEventListener('dblclick', () => {
          PCL.state.pageData.vTab = 'overview';
          PCL.go('version', { id });
        });
      });
    },
  };

  /* ---------------------- 给已有原版安装 Mod 加载器 ---------------------- */
  const LOADER_LABEL = { fabric: 'Fabric', forge: 'Forge', neo: 'NeoForge', quilt: 'Quilt' };

  async function loaderVersionsFor(loader, gameVersion) {
    if (loader === 'fabric') {
      const list = await API.fabric.loaders();
      return (list || []).map((x) => ({ version: x.version, stable: !!x.stable }));
    }
    if (loader === 'forge' || loader === 'neo') {
      const r = loader === 'neo' ? await API.forge.neoVersions(gameVersion) : await API.forge.versions(gameVersion);
      if (r && r.error) throw new Error(r.error);
      return (Array.isArray(r) ? r : []).map((x) => ({ version: x.version, stable: !!x.recommended || !!x.latest }));
    }
    if (loader === 'quilt') {
      const r = await API.quilt.list(gameVersion);
      if (r && r.error) throw new Error(r.error);
      return (((r || {}).versions) || []).map((x) => ({ version: x.version, stable: !!x.stable }));
    }
    return [];
  }

  function openLoaderInstall(id, v) {
    const base = (v && (v.gameVersion || v.inheritsFrom)) || id;
    const body = `
      <div class="set-row"><label>当前版本</label><input class="input" value="${PCL.esc(id)}" readonly /></div>
      <div class="set-row"><label>基础版本</label><input class="input" value="${PCL.esc(base)}" readonly /></div>
      <div class="set-row"><label>加载器</label>
        <select class="select" id="liLoader">
          <option value="fabric">Fabric</option>
          <option value="forge">Forge</option>
          <option value="neo">NeoForge</option>
          <option value="quilt">Quilt</option>
        </select>
      </div>
      <div id="liVerBox"><div class="tiny muted mt-8">正在读取加载器版本…</div></div>
      <div class="set-row"><label>安装后名称</label><input class="input" id="liName" value="${PCL.esc(base + '-Fabric')}" /></div>
      <div class="tiny muted mt-8" id="liHint">安装会新建一个带加载器的版本，原版保留。Fabric 会按 PCL 的习惯自动安装 Fabric API。</div>`;
    PCL.modal({
      title: `安装 Mod 加载器 · ${id}`,
      width: 560,
      body,
      footer: '<button class="btn" data-close>取消</button><button class="btn primary" id="liInstall">开始安装</button>',
      onMount: (wrap, close) => {
        const loaderSel = PCL.$('#liLoader', wrap);
        const box = PCL.$('#liVerBox', wrap);
        const nameInput = PCL.$('#liName', wrap);
        const hint = PCL.$('#liHint', wrap);
        const installBtn = PCL.$('#liInstall', wrap);
        let versions = [];

        const refresh = async (loader) => {
          versions = [];
          installBtn.disabled = true;
          box.innerHTML = '<div class="tiny muted mt-8">正在读取加载器版本…</div>';
          try {
            versions = await loaderVersionsFor(loader, base);
            if (!versions.length) throw new Error(`没有找到适用于 ${base} 的 ${LOADER_LABEL[loader]} 版本`);
            const opts = versions
              .map((x) => `<option value="${PCL.esc(x.version)}">${PCL.esc(x.version)}${x.stable ? '（推荐）' : ''}</option>`)
              .join('');
            box.innerHTML = `<div class="set-row"><label>${LOADER_LABEL[loader]} 版本</label><select class="select" id="liVer">${opts}</select></div>`;
            const verSel = PCL.$('#liVer', wrap);
            const syncName = () => {
              nameInput.value = `${base}-${LOADER_LABEL[loader]} ${verSel.value}`.trim();
            };
            verSel.addEventListener('change', syncName);
            syncName();
            hint.textContent = loader === 'fabric'
              ? '安装会新建一个带 Fabric 的版本，原版保留；Fabric API 会一起安装（PCL 默认行为）。'
              : '安装会新建一个带加载器的版本，原版保留；不会改动原来的版本。';
            installBtn.disabled = false;
          } catch (e) {
            box.innerHTML = `<div class="tiny" style="color:var(--danger);line-height:1.7">${PCL.esc(String(e.message || e))}</div>`;
            hint.textContent = '读取版本失败，可以重新选择加载器或稍后再试。';
            installBtn.disabled = true;
          }
        };

        loaderSel.addEventListener('change', () => refresh(loaderSel.value));
        refresh('fabric');

        installBtn.addEventListener('click', async () => {
          const loader = loaderSel.value;
          const verSel = PCL.$('#liVer', wrap);
          if (!verSel || !verSel.value) return PCL.toast('请先选择加载器版本', 'error');
          installBtn.disabled = true;
          installBtn.textContent = '安装中…';
          try {
            const r = await API.versions.installLoader({
              gameVersion: base,
              loader,
              loaderVersion: verSel.value,
              name: nameInput.value.trim(),
            });
            if (!r || r.ok === false) throw new Error((r && r.error) || '安装失败');
            await PCL.saveSettings({ version: r.id });
            PCL.state.versions = await API.versions.list();
            close();
            PCL.toast(`已安装 ${r.id}${r.fabricApi ? '，Fabric API 已就绪' : ''}`, 'success', 4500);
            if (r.fabricApiError) PCL.toast('Fabric API 下载失败：' + r.fabricApiError, 'error', 5000);
            PCL.state.pageData.versionDetail = null;
            PCL.state.pageData.vSettings = null;
            PCL.state.pageData.vTab = 'mods';
            if (PCL.state.page === 'version') PCL.go('version', { id: r.id });
            else PCL.render();
          } catch (e) {
            PCL.toast('安装加载器失败：' + String(e.message || e).replace(/^Error invoking remote method .*?: /, ''), 'error', 5000);
            installBtn.disabled = false;
            installBtn.textContent = '开始安装';
          }
        });
      },
    });
  }

  P.openLoaderInstall = openLoaderInstall;

  /* ---------------------- 版本设置弹窗 ---------------------- */
  async function versionDetailModal(id) {
    let detail = null;
    let stored = {};
    try {
      [detail, stored] = await Promise.all([API.versions.detail(id), API.versions.getSettings(id)]);
    } catch (e) {
      PCL.toast('读取版本信息失败：' + (e.message || e), 'error');
      return;
    }
    const globals = PCL.state.settings || {};
    const v = PCL.state.versions.find((x) => x.id === id) || { id };
    let iso = stored.isolation === 'on' || (stored.isolation !== 'off' && globals.versionIsolation);
    const winW = stored.windowMode === 'custom' && Number(stored.windowWidth) ? Number(stored.windowWidth) : globals.gameWidth;
    const winH = stored.windowMode === 'custom' && Number(stored.windowHeight) ? Number(stored.windowHeight) : globals.gameHeight;
    const mem = stored.memoryMode === 'custom' && Number(stored.maxMemory) > 0 ? Number(stored.maxMemory) : 0;

    const tabHtml = (tab) => {
      if (tab === 'overview') {
        return `<div class="kv">
          <span class="k">版本名称</span><span class="v">${PCL.esc(id)}</span>
          <span class="k">基础版本</span><span class="v">${PCL.esc(v.inheritsFrom || '（无）')}</span>
          <span class="k">加载器</span><span class="v">${PCL.esc(v.loader || '原版')}</span>
          <span class="k">主类</span><span class="v">${PCL.esc(detail.mainClass || '')}</span>
          <span class="k">Java 要求</span><span class="v">${detail.javaVersion ? 'Java ' + detail.javaVersion.majorVersion : '未标注'}</span>
          <span class="k">资源索引</span><span class="v">${PCL.esc(detail.assets || '—')}</span>
          <span class="k">版本目录</span><span class="v">${PCL.esc(detail.dir || '')}</span>
        </div>
        <div class="mt-16 tiny muted" style="line-height:1.8">
          版本隔离：${iso ? '已开启（Mod、存档、配置都在该版本目录内）' : '已关闭（与其他版本共用 .minecraft 根目录）'}
        </div>`;
      }
      if (tab === 'mods') {
        const mods = detail.mods || [];
        return mods.length
          ? `<div style="max-height:340px">${mods
              .map(
                (m) => `<div class="row" style="padding:7px 4px">
                  <div class="vicon" style="width:26px;height:26px;font-size:9px">MOD</div>
                  <div class="row-main"><div class="row-title" style="font-weight:400">${PCL.esc(m)}</div></div>
                </div>`
              )
              .join('')}</div>`
          : `<div class="empty">该版本 mods 目录为空<br/><span class="tiny">可以在「下载 → Mod」里搜索安装</span></div>`;
      }
      return `<div class="field"><label>窗口宽度</label><div class="control"><input class="input" id="vW" type="number" value="${winW}" /></div></div>
        <div class="field"><label>窗口高度</label><div class="control"><input class="input" id="vH" type="number" value="${winH}" /></div></div>
        <div class="field"><label>最大内存</label><div class="control"><input class="input" id="vMem" type="number" value="${mem}" placeholder="0 = 自动" /><span class="hint">MB</span></div></div>
        <div class="field"><label>JVM 参数</label><div class="control"><input class="input" id="vJvm" value="${PCL.esc(stored.jvmArgs || '')}" placeholder="-XX:+UseG1GC" /></div></div>
        <div class="field"><label>版本隔离</label><div class="control"><div class="switch ${iso ? 'on' : ''}" id="vIso"></div><span class="hint">开启后该版本的 Mod、存档独立存放</span></div></div>
        <div class="tiny muted mt-12">这些设置只对「${PCL.esc(id)}」生效；0 内存表示跟随全局自动分配。</div>`;
    };

    PCL.modal({
      title: `版本设置 · ${id}`,
      width: 600,
      body: `<div class="flex gap-8" style="margin-bottom:14px">
          <button class="btn small outline" data-tab="overview">概览</button>
          <button class="btn small outline" data-tab="mods">Mod 管理</button>
          <button class="btn small outline" data-tab="launch">启动设置</button>
        </div>
        <div id="verTabBody"></div>`,
      footer: `<button class="btn" data-close>关闭</button><button class="btn primary" id="verSave">保存</button>`,
      onMount: (wrap, close) => {
        let tab = 'overview';
        const body = wrap.querySelector('#verTabBody');
        const draw = () => {
          body.innerHTML = tabHtml(tab);
          PCL.$$('[data-tab]', wrap).forEach((b) => b.classList.toggle('primary', b.dataset.tab === tab));
          PCL.$('#vIso', wrap)?.addEventListener('click', (e) => {
            iso = e.currentTarget.classList.toggle('on');
          });
        };
        PCL.$$('[data-tab]', wrap).forEach((b) =>
          b.addEventListener('click', () => {
            tab = b.dataset.tab;
            draw();
          })
        );
        draw();

        wrap.querySelector('#verSave').addEventListener('click', async () => {
          if (tab !== 'launch') {
            close();
            return;
          }
          const patch = {
            windowMode: 'custom',
            windowWidth: Number(wrap.querySelector('#vW').value) || 854,
            windowHeight: Number(wrap.querySelector('#vH').value) || 480,
            memoryMode: Number(wrap.querySelector('#vMem').value) > 0 ? 'custom' : 'auto',
            maxMemory: Number(wrap.querySelector('#vMem').value) || 0,
            jvmArgs: wrap.querySelector('#vJvm').value.trim(),
            isolation: iso ? 'on' : 'off',
          };
          try {
            await API.versions.setSettings(id, patch);
            PCL.state.versions = await API.versions.list();
            PCL.toast('版本设置已保存', 'success');
            close();
            PCL.render();
          } catch (e) {
            PCL.toast('保存版本设置失败：' + (e.message || e), 'error');
          }
        });
      },
    });
  }

  PCL.versionDetailModal = versionDetailModal;

  /* ---------------------- 版本设置页（PCL2 侧栏详情） ---------------------- */
  P.version = {
    sidebar: true,
    async render(state) {
      const id = state.params.id || state.settings.version;
      if (!id) return '<div class="empty">未选择版本</div>';
      const pd = state.pageData;
      if (!pd.versionDetail || pd.versionDetail.id !== id) {
        try {
          pd.versionDetail = { ...(await API.versions.detail(id)), id };
        } catch (e) {
          return `<div class="card" style="margin:18px">读取版本信息失败：${PCL.esc(e.message || e)}</div>`;
        }
      }
      if (!pd.vSettings || pd.vSettings.id !== id) {
        pd.vSettings = { id, ...(await API.versions.getSettings(id)) };
      }
      const detail = pd.versionDetail;
      const v = (state.versions || []).find((x) => x.id === id) || { id };
      const vc = pd.vSettings;
      const tab = pd.vTab || 'launch';
      const s = state.settings || {};
      const info = pd.appInfo || {};
      const javas = pd.javaList || [];

      const sideItem = (key, label, icon) =>
        `<div class="vside-item ${tab === key ? 'active' : ''}" data-vtab="${key}">
           <span class="vside-icon">${Icons[icon] || ''}</span><span>${label}</span>
         </div>`;

      const banner = `<div class="vd-banner" id="vdBanner">
        <span class="vd-info">!</span>
        <span>这些设置只对该游戏版本生效，不影响其他版本。</span>
        <button class="vd-x" id="vdBannerX">×</button>
      </div>`;

      let body = '';
      if (tab === 'overview') {
        body = `
          <div class="card vd-card vd-overview">
            <div class="vd-over-head">
              <div class="vd-over-block">${PCL.blockIcon(PCL.blockKind(v))}</div>
              <div>
                <div class="vd-over-name">${PCL.esc(id)} ${id === s.version ? '<span class="tag">当前使用</span>' : ''}</div>
                <div class="vd-over-sub">${PCL.esc(v.loader || '原版')} · ${PCL.fmtSize(v.size)} · ${v.mods ? v.mods + ' 个 Mod' : '无 Mod'}</div>
              </div>
              <button class="btn small" id="vdOpenDir2">${Icons.folder}打开版本目录</button>
            </div>
            <div class="kv vd-kv">
              <span class="k">基础版本</span><span class="v">${PCL.esc(v.inheritsFrom || '（无）')}</span>
              <span class="k">加载器</span><span class="v">${PCL.esc(v.loader || '原版')}</span>
              <span class="k">主类</span><span class="v ellipsis">${PCL.esc(detail.mainClass || '')}</span>
              <span class="k">Java 要求</span><span class="v">${detail.javaVersion ? 'Java ' + detail.javaVersion.majorVersion : '未标注'}</span>
              <span class="k">资源索引</span><span class="v">${PCL.esc(detail.assets || '—')}</span>
              <span class="k">版本目录</span><span class="v ellipsis">${PCL.esc(detail.dir || '')}</span>
            </div>
          </div>`;
      } else if (tab === 'mods') {
        const mods = detail.mods || [];
        const mainLoader = /fabric/i.test(detail.mainClass || '')
          ? 'Fabric'
          : /neoforge/i.test(detail.mainClass || '')
            ? 'NeoForge'
            : /quilt/i.test(detail.mainClass || '')
              ? 'Quilt'
              : /forge/i.test(detail.mainClass || '')
                ? 'Forge'
                : '';
        const loaderName = String(v.loader || mainLoader || '').trim();
        body = `
          <div class="card vd-card">
            <div class="card-title">Mod 加载器
              <span class="tag" style="margin-left:8px;${loaderName ? 'background:#eefaf3;border-color:#bfe6d2;color:#2fa060' : ''}">${PCL.esc(loaderName || '原版')}</span>
              ${loaderName ? '' : '<button class="btn small primary" style="margin-left:auto" id="vdInstallLoader">安装 Mod 加载器</button>'}
            </div>
            <div class="tiny muted" style="line-height:1.8">
              ${loaderName
                ? `当前是 ${PCL.esc(loaderName)} 版本，可以直接在「下载 → Mod」里安装模组。`
                : '当前是原版版本。原版不能加载 Mod；安装一个带 Fabric / Forge / NeoForge / Quilt 的新版本后，再去「下载 → Mod」装模组。'}
            </div>
          </div>
          <div class="card vd-card mt-12">
            <div class="card-title">Mod 管理 <span class="sub" style="margin-left:7px">${mods.length} 个文件</span>
              <div style="margin-left:auto;display:flex;gap:6px">
                <button class="btn small" id="vdModsEnableAll">全部启用</button>
                <button class="btn small" id="vdModsDisableAll">全部禁用</button>
                <button class="btn small" id="vdOpenMods">${Icons.folder}打开目录</button>
              </div>
            </div>
            <div class="vd-mod-list">
              ${
                mods.length
                  ? mods
                      .map((m) => {
                        const disabled = m.endsWith('.disabled');
                        return `<div class="vd-mod">
                          <span class="vd-mod-ico">${Icons.mod}</span>
                          <span class="grow ellipsis">${PCL.esc(m)}</span>
                          <span class="tag">${disabled ? '已禁用' : '已启用'}</span>
                          <button class="btn small" data-mod-toggle="${PCL.esc(m)}" data-enabled="${disabled ? '1' : '0'}">${disabled ? '启用' : '禁用'}</button>
                          <button class="btn small danger" data-mod-del="${PCL.esc(m)}" title="删除">${Icons.trash}</button>
                        </div>`;
                      })
                      .join('')
                  : '<div class="empty" style="padding:26px 0">该版本的 Mods 目录为空</div>'
              }
            </div>
            <div class="tiny muted mt-8">可直接在这里启用、禁用、删除；.jar.disabled 是 PCL 兼容的禁用文件。</div>
          </div>`;
      } else if (tab === 'export') {
        body = `
          <div class="card vd-card">
            <div class="card-title">导出</div>
            <div class="set-row"><label>版本目录</label><input class="input" value="${PCL.esc(detail.dir || '')}" readonly /></div>
            <div class="set-row"><label>导出内容</label><span class="tiny muted">版本 JSON、客户端 jar、Mods 与配置（不含存档与日志）</span></div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button class="btn primary" id="vdExport">${Icons.package}导出为 ZIP 压缩包</button>
              <button class="btn" id="vdExportPack">${Icons.package}导出整合包 (.mrpack)</button>
            </div>
            <div class="tiny muted mt-8">ZIP 用于备份/手动安装；.mrpack 会把 Mod、资源包、光影与配置放进 overrides，可在「下载 → 整合包」重新导入。</div>
          </div>`;
      } else {
        const isoVal = vc.isolation || '';
        const memMode = vc.memoryMode || 'global';
        const totalMB = info.totalMem || s.totalMem || 4096;
        const freeMB = info.freeMem || Math.round(totalMB * 0.55);
        const usedMB = Math.max(0, totalMB - freeMB);
        const allocMB = memMode === 'custom' && Number(vc.maxMemory) ? Number(vc.maxMemory) : s.maxMemory || s.defaultMemory || totalMB;
        const fmtGB = (mb) => (mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB');
        const usedPct = Math.min(100, (usedMB / totalMB) * 100);
        const allocPct = Math.min(100, (allocMB / totalMB) * 100);
        const javaVal = vc.javaPath || '';
        const javaOpts = javas
          .map((j) => `<option value="${PCL.esc(j.path)}" ${javaVal === j.path ? 'selected' : ''}>Java ${j.major} · ${PCL.esc((j.path || '').split(/[\\/]/).slice(-2).join('/'))}</option>`)
          .join('');
        body = `
          ${banner}
          <div class="card vd-card">
            <div class="card-title">启动选项</div>
            <div class="set-row vd-row"><label>版本隔离</label>
              <select class="select" id="vdIso">
                <option value="on" ${isoVal !== 'off' ? 'selected' : ''}>开启</option>
                <option value="off" ${isoVal === 'off' ? 'selected' : ''}>关闭</option>
              </select>
            </div>
            <div class="set-row vd-row"><label>游戏窗口标题</label>
              <input class="input" id="vdTitleInput" value="${PCL.esc(vc.gameTitle || '')}" placeholder="跟随全局设置" />
            </div>
            <div class="set-row vd-row"><label>自定义信息</label>
              <input class="input" id="vdCustomInfo" value="${PCL.esc(vc.customInfo || '')}" placeholder="跟随全局设置" />
            </div>
            <div class="set-row vd-row"><label>游戏 Java</label>
              <select class="select" id="vdJava">
                <option value="" ${!javaVal ? 'selected' : ''}>跟随全局设置</option>
                ${javaOpts}
              </select>
            </div>
          </div>

          <div class="card vd-card mt-12">
            <div class="card-title">游戏内存</div>
            <div class="vd-mem-modes">
              <label class="skin-radio ${memMode === 'global' ? 'on' : ''}" data-memmode="global"><span class="radio-dot"></span>跟随全局设置</label>
              <label class="skin-radio ${memMode === 'auto' ? 'on' : ''}" data-memmode="auto"><span class="radio-dot"></span>自动配置</label>
              <label class="skin-radio ${memMode === 'custom' ? 'on' : ''}" data-memmode="custom"><span class="radio-dot"></span>自定义</label>
            </div>
            <div class="vd-mem-slider ${memMode === 'custom' ? '' : 'hidden'}">
              <input class="mem-range" id="vdMemRange" type="range" min="512" max="8192" step="256" value="${allocMB}" />
              <span class="vd-mem-val" id="vdMemVal">${fmtGB(allocMB)}</span>
            </div>
            <div class="set-row vd-row mt-8"><label>启动游戏前进行内存优化</label>
              <select class="select" id="vdOptimize">
                <option value="" selected>跟随全局设置</option>
                <option value="on" ${vc.optimizeMem === 'on' ? 'selected' : ''}>开启</option>
                <option value="off" ${vc.optimizeMem === 'off' ? 'selected' : ''}>关闭</option>
              </select>
            </div>
            <div class="vd-bars">
              <div class="vd-bar-col">
                <div class="vd-bar-head"><span>已使用内存</span><span></span></div>
                <div class="vd-bar"><i style="width:${usedPct}%"></i></div>
                <div class="vd-bar-num">${fmtGB(usedMB)} / ${fmtGB(totalMB)}</div>
              </div>
              <div class="vd-bar-col">
                <div class="vd-bar-head"><span>游戏分配</span><span></span></div>
                <div class="vd-bar"><i style="width:${allocPct}%"></i></div>
                <div class="vd-bar-num">${fmtGB(allocMB)}</div>
              </div>
            </div>
          </div>

          <div class="card vd-card mt-12">
            <div class="card-title">服务器</div>
            <div class="set-row vd-row"><label>登录方式</label>
              <select class="select" id="vdLoginMode">
                <option value="" ${!vc.loginMode ? 'selected' : ''}>正版登录或离线登录</option>
                <option value="online" ${vc.loginMode === 'online' ? 'selected' : ''}>仅正版登录</option>
                <option value="offline" ${vc.loginMode === 'offline' ? 'selected' : ''}>仅离线登录</option>
              </select>
            </div>
            <div class="set-row vd-row"><label>服务器地址</label>
              <input class="input" id="vdServer" value="${PCL.esc(vc.serverAddress || '')}" placeholder="留空则直接进入游戏主菜单" />
            </div>
          </div>`;
      }

      return `
        <div class="vside">
          ${sideItem('overview', '概览', 'box')}
          ${sideItem('launch', '设置', 'wrench')}
          ${sideItem('mods', 'Mod 管理', 'mod')}
          ${sideItem('export', '导出', 'package')}
        </div>
        <div class="grow vd-grow">${body}</div>`;
    },

    async mount(root, state) {
      const id = state.params.id || state.settings.version;
      PCL.$$('[data-vtab]', root).forEach((el) =>
        el.addEventListener('click', () => {
          state.pageData.vTab = el.dataset.vtab;
          PCL.render();
        })
      );

      PCL.$('#vdBannerX', root)?.addEventListener('click', () => {
        const b = PCL.$('#vdBanner', root);
        if (b) b.remove();
      });
      PCL.$('#vdOpenDir2', root)?.addEventListener('click', () => API.versions.open(id));
      PCL.$('#vdOpenMods', root)?.addEventListener('click', () => API.mods.open(id));
      PCL.$('#vdInstallLoader', root)?.addEventListener('click', () => {
        const v = (state.versions || []).find((x) => x.id === id) || { id };
        openLoaderInstall(id, v);
      });

      const refreshMods = async () => {
        state.pageData.versionDetail = null;
        await PCL.render();
      };
      PCL.$$('[data-mod-toggle]', root).forEach((btn) =>
        btn.addEventListener('click', async () => {
          const enabled = btn.dataset.enabled === '1';
          btn.disabled = true;
          try {
            await API.mods.toggle(id, btn.dataset.modToggle, enabled);
            await refreshMods();
          } catch (e) {
            PCL.toast('Mod 状态切换失败：' + String(e.message || e), 'error');
            btn.disabled = false;
          }
        })
      );
      PCL.$$('[data-mod-del]', root).forEach((btn) =>
        btn.addEventListener('click', () =>
          PCL.confirm('删除 Mod', `确定删除「${btn.dataset.modDel}」？此操作不可撤销。`, async () => {
            await API.mods.remove(id, btn.dataset.modDel);
            await refreshMods();
          }, '删除')
        )
      );
      PCL.$('#vdModsEnableAll', root)?.addEventListener('click', async () => {
        await API.mods.toggleAll(id, true);
        await refreshMods();
      });
      PCL.$('#vdModsDisableAll', root)?.addEventListener('click', async () => {
        await API.mods.toggleAll(id, false);
        await refreshMods();
      });

      if (!state.pageData.javaList) {
        API.java.detect()
          .then((list) => {
            state.pageData.javaList = list;
            if (state.page === 'version') PCL.render();
          })
          .catch(() => {});
      }

      const save = async (patch, rerender = false) => {
        const v = await API.versions.setSettings(id, patch);
        state.pageData.vSettings = { id, ...v };
        if (rerender) PCL.render();
        else PCL.toast('已保存', 'success', 1200);
      };

      PCL.$('#vdIso', root)?.addEventListener('change', (e) => save({ isolation: e.target.value }));
      PCL.$('#vdTitleInput', root)?.addEventListener('change', (e) => save({ gameTitle: e.target.value.trim() }));
      PCL.$('#vdCustomInfo', root)?.addEventListener('change', (e) => save({ customInfo: e.target.value.trim() }));
      PCL.$('#vdJava', root)?.addEventListener('change', (e) => save({ javaPath: e.target.value }));
      PCL.$('#vdOptimize', root)?.addEventListener('change', (e) => save({ optimizeMem: e.target.value }));
      PCL.$('#vdLoginMode', root)?.addEventListener('change', (e) => save({ loginMode: e.target.value }));
      PCL.$('#vdServer', root)?.addEventListener('change', (e) => save({ serverAddress: e.target.value.trim() }));

      PCL.$$('[data-memmode]', root).forEach((el) =>
        el.addEventListener('click', () => save({ memoryMode: el.dataset.memmode }, true))
      );
      const range = PCL.$('#vdMemRange', root);
      if (range) {
        const label = PCL.$('#vdMemVal', root);
        const fmt = (mb) => (mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB');
        range.addEventListener('input', () => {
          if (label) label.textContent = fmt(Number(range.value));
        });
        range.addEventListener('change', () => save({ memoryMode: 'custom', maxMemory: Number(range.value) }, true));
      }

      PCL.$('#vdExport', root)?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const r = await API.versions.export(id);
          if (r && r.ok === false) throw new Error(r.error || '导出失败');
          if (r && r.path) PCL.toast('已导出到 ' + r.path, 'success', 4000);
        } catch (err) {
          PCL.toast(String(err.message || err), 'error', 4000);
        }
        btn.disabled = false;
      });

      PCL.$('#vdExportPack', root)?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '导出中…';
        try {
          const r = await API.versions.exportPack(id, '');
          if (r && r.ok === false) throw new Error(r.error || '导出失败');
          if (r && r.path) PCL.toast('已导出整合包：' + r.path, 'success', 5000);
        } catch (err) {
          PCL.toast('导出整合包失败：' + String(err.message || err).replace(/^Error invoking remote method .*?: /, ''), 'error', 5000);
        } finally {
          btn.disabled = false;
          btn.textContent = '导出整合包 (.mrpack)';
        }
      });
    },
  };

})();
