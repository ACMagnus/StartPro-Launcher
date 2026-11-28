/* ============================ 版本选择（PCL2 移植） ============================
 * 页面结构、文件夹列表、版本分组与右键菜单按 PCL2 2.13.1.1 的
 * PageSelectLeft / PageSelectRight / ModMinecraft 逻辑移植。
 * PCL2 版权归龙腾猫跃所有，以《PCL 分发有限许可》发布；本项目为 Electron/JS
 * 独立实现，不直接运行其 VB.NET/WPF 源码。许可与署名见 THIRD_PARTY_NOTICES.md。
 * ============================================================================ */
(function () {
  const P = (window.PCLPages = window.PCLPages || {});
  const API = window.API;

  const FOOL_IDS = new Set([
    '15w14a', '3D Shareware v1.34', '20w14infinite', '20w14∞', '22w13oneBlockAt',
    '23w13a_or_b', '24w14potato', '25w14craftmine', '1.RV-Pre1', '23w13a_or_b_2',
  ]);

  const isFool = (id) => FOOL_IDS.has(id) || /craftmine|potato|oneblock|shareware|infinite|∞/i.test(String(id || ''));

  /** 1.0 ~ 1.5.2 归入远古版，和 PCL2 的“不常用版本”观感一致 */
  function isOldRelease(id) {
    const m = /^1\.(\d+)(?:\.|$)/.exec(String(id || ''));
    return !!m && Number(m[1]) <= 5;
  }

  function sortByRelease(items) {
    return items.slice().sort((a, b) => {
      const ta = Date.parse(a.releaseTime) || 0;
      const tb = Date.parse(b.releaseTime) || 0;
      if (tb !== ta) return tb - ta;
      return String(b.id).localeCompare(String(a.id), 'zh-CN', { numeric: true });
    });
  }

  /** 1.21.10 / 1.21.1 归为同一 drop，只把最新的放进“常规版本” */
  function dropOf(v) {
    const gv = String(v.gameVersion || v.inheritsFrom || v.id || '');
    const m1 = /^1\.(\d+)/.exec(gv);
    if (m1) return `1.${m1[1]}`;
    const m2 = /^(\d+\.\d+)/.exec(gv);
    return m2 ? m2[1] : gv;
  }

  function moddedLabel(items) {
    const loaders = [...new Set(items.map((v) => String(v.loader || '').trim()).filter(Boolean))];
    if (loaders.length > 1) return '可安装 Mod';
    return `${loaders[0] || 'Mod'} 版本`;
  }

  function groupVersions(versions, starredIds) {
    const starred = versions.filter((v) => starredIds.has(v.id));
    const rest = versions.filter((v) => !starredIds.has(v.id));
    const buckets = { modded: [], release: [], snap: [], old: [], fool: [], pack: [], other: [] };

    for (const v of rest) {
      if (isFool(v.id)) buckets.fool.push(v);
      else if (v.type === 'modpack') buckets.pack.push(v);
      else if (v.loader) buckets.modded.push(v);
      else if (v.type === 'old_beta' || v.type === 'old_alpha' || isOldRelease(v.id)) buckets.old.push(v);
      else if (v.type === 'snapshot') buckets.snap.push(v);
      else if (v.type === 'modified') buckets.other.push(v);
      else buckets.release.push(v);
    }

    const releases = sortByRelease(buckets.release);
    const latestByDrop = new Map();
    for (const v of releases) {
      const drop = dropOf(v);
      if (!latestByDrop.has(drop)) latestByDrop.set(drop, v);
    }

    // PCL2 只把“整体最新版本”是快照时的那一个快照放进常规版本；其余快照进不常用
    const latestOverall = sortByRelease([...buckets.release, ...buckets.snap])[0] || null;
    const latestSnap = latestOverall && latestOverall.type === 'snapshot' ? latestOverall : null;
    const useful = sortByRelease([...latestByDrop.values(), latestSnap].filter(Boolean));
    const usefulIds = new Set(useful.map((v) => v.id));
    const rubbish = sortByRelease([
      ...buckets.old,
      ...buckets.snap.filter((v) => v !== latestSnap),
      ...releases.filter((v) => !usefulIds.has(v.id)),
    ]);

    const groups = [];
    if (starred.length) groups.push({ key: 'star', label: '收藏夹', items: sortByRelease(starred), noCount: true });
    const modded = sortByRelease(buckets.modded);
    if (modded.length) groups.push({ key: 'modded', label: moddedLabel(modded), items: modded });
    if (useful.length) groups.push({ key: 'vanilla', label: '常规版本', items: useful });
    if (rubbish.length) groups.push({ key: 'rubbish', label: '不常用版本', items: rubbish });
    if (buckets.fool.length) groups.push({ key: 'fool', label: '愚人节版本', items: sortByRelease(buckets.fool) });
    if (buckets.pack.length) groups.push({ key: 'pack', label: '整合包', items: sortByRelease(buckets.pack) });
    if (buckets.other.length) groups.push({ key: 'other', label: '其他版本', items: sortByRelease(buckets.other) });
    return groups;
  }

  function folderName(dir) {
    const parts = String(dir || '').split(/[\\/]/).filter(Boolean);
    if (!parts.length) return '.minecraft';
    const base = parts[parts.length - 1];
    if (base === '.minecraft') {
      const parent = parts[parts.length - 2] || '';
      const grand = parts[parts.length - 3] || '';
      if (!parent || /roaming/i.test(parent) || /^(home|users)$/i.test(grand)) return '官方启动器文件夹';
      return parent;
    }
    return base;
  }

  /** PCL2 的版本条目只显示“加载器/类型 + 基础版本”，不显示发布时间 */
  function rowInfo(v) {
    const id = String(v.id || '');
    const base = v.gameVersion || v.inheritsFrom || id;
    const tail = id.startsWith(base)
      ? id
          .slice(base.length)
          .replace(/^[\s_-]+/, '')
          .replace(/[-_]/g, ' · ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';

    if (v.type === 'modpack') return base && base !== id ? `整合包 · ${base}` : '整合包';
    if (v.type === 'old_beta') return `远古 Beta · ${base}`;
    if (v.type === 'old_alpha') return `远古 Alpha · ${base}`;
    if (v.type === 'snapshot') return `快照 · ${base}`;
    if (v.loader) return tail ? `${base} · ${tail}` : `${base} · ${v.loader}`;
    if (v.type === 'modified') return base && base !== id ? `自定义 · ${base}` : '自定义';
    return `原版 · ${base}`;
  }

  function rowHtml(v, starred) {
    const id = PCL.esc(v.id);
    return `<div class="vsel-row" data-id="${id}" role="button" tabindex="0" title="选用 ${id}">
      <span class="vsel-icon">${PCL.blockIcon(isOldRelease(v.id) ? 'stone' : PCL.blockKind(v), 'sm')}</span>
      <div class="vsel-row-main">
        <div class="vsel-row-name">${id}</div>
        <div class="vsel-row-sub">${PCL.esc(rowInfo(v))}</div>
      </div>
      <div class="vsel-row-actions">
        <button class="vsel-act star ${starred ? 'starred' : ''}" data-act="star" title="${starred ? '取消收藏' : '收藏'}">${Icons.star}</button>
        <button class="vsel-act danger" data-act="del" title="删除版本">${Icons.trash}</button>
        <button class="vsel-act" data-act="settings" title="版本设置">${Icons.gear}</button>
      </div>
    </div>`;
  }

  P.select = {
    sidebar: true,

    render(state) {
      const pd = state.pageData;
      const versions = state.versions || [];
      const starredIds = new Set(
        Array.isArray(state.settings.starredVersions) ? state.settings.starredVersions.map(String) : []
      );
      const groups = groupVersions(versions, starredIds);
      const gameDir = state.settings.gameDir || '';
      const folders = Array.isArray(state.folders) && state.folders.length
        ? state.folders
        : [{ path: gameDir, name: folderName(gameDir), active: true, exists: true }];
      const activeFolder = folders.find((f) => f.active || f.path === gameDir) || folders[0];
      const open = pd.vselOpen || {};

      const cards = groups.length
        ? groups
            .map((g) => {
              const expanded = open[g.key] !== undefined ? !!open[g.key] : !['rubbish', 'fool', 'other'].includes(g.key);
              const title = g.noCount ? g.label : `${g.label} (${g.items.length})`;
              return `<section class="vsel-card" data-card="${g.key}">
                <button class="vsel-card-head" data-group="${g.key}" aria-expanded="${expanded}">
                  <span class="vsel-card-title">${PCL.esc(title)}</span>
                  <span class="vsel-card-chev ${expanded ? 'open' : ''}">${Icons.chevron}</span>
                </button>
                ${expanded ? `<div class="vsel-rows">${g.items.map((v) => rowHtml(v, starredIds.has(v.id))).join('')}</div>` : ''}
              </section>`;
            })
            .join('')
        : `<div class="vsel-empty">
             <div class="vsel-empty-title">无可用版本</div>
             <div class="vsel-empty-line"></div>
             <div class="vsel-empty-sub">未找到任何版本的游戏，请先下载任意版本的游戏。<br>若有已存在的游戏，请在左侧列表中选择“添加已有文件夹”，选择 .minecraft 文件夹将其导入。</div>
             <button class="btn primary" id="vselEmptyInstall">下载游戏</button>
           </div>`;

      const folderRows = folders
        .map((f) => {
          const active = f === activeFolder || f.path === (activeFolder && activeFolder.path);
          const name = f.name || folderName(f.path);
          return `<div class="vsel-folder ${active ? 'active' : ''}" data-folder="${PCL.esc(f.path)}" role="button" tabindex="0" title="${PCL.esc(f.path)} · 点击切换，双击打开">
            <span class="vsel-folder-main"><b>${PCL.esc(name)}</b><i>${PCL.esc(f.path)}</i></span>
            <button class="vsel-folder-more" data-folder-menu="${PCL.esc(f.path)}" title="文件夹操作">${Icons.gear}</button>
          </div>`;
        })
        .join('');

      return `<aside class="vsel-side">
        <div class="vsel-side-label">文件夹列表</div>
        <div class="vsel-folder-list">${folderRows}</div>

        <div class="vsel-side-label">添加或导入</div>
        <button class="vsel-side-item" data-side="create">${Icons.plus}新建 .minecraft 文件夹</button>
        <button class="vsel-side-item" data-side="add">${Icons.plus}添加已有文件夹</button>
        <button class="vsel-side-item" data-side="pack">${Icons.package}导入整合包</button>
      </aside>

      <div class="grow vsel-grow">
        <div class="vsel-list">${cards}</div>
      </div>`;
    },

    mount(root, state) {
      const pd = state.pageData;
      const refreshData = async () => {
        const [folders, versions, settings] = await Promise.all([
          API.folders.list().catch(() => state.folders || []),
          API.versions.list().catch(() => []),
          API.settings.get().catch(() => state.settings),
        ]);
        state.folders = Array.isArray(folders) && folders.length ? folders : state.folders;
        state.versions = Array.isArray(versions) ? versions : [];
        state.settings = { ...state.settings, ...(settings || {}) };
        const hasCurrent = state.versions.some((v) => v.id === state.settings.version);
        if (state.versions.length && !hasCurrent) {
          state.settings.version = state.versions[0].id;
          await API.settings.set({ version: state.settings.version }).catch(() => {});
        } else if (!state.versions.length && state.settings.version) {
          state.settings.version = '';
          await API.settings.set({ version: '' }).catch(() => {});
        }
        PCL.render();
      };

      const folders = Array.isArray(state.folders) && state.folders.length
        ? state.folders
        : [{ path: state.settings.gameDir || '', name: folderName(state.settings.gameDir), active: true, exists: true }];

      const activateFolder = async (path, open = false) => {
        if (!path) return;
        if (path === state.settings.gameDir) {
          if (open) API.versions.open('');
          return;
        }
        try {
          const r = await API.folders.switch(path);
          if (r && r.ok === false) throw new Error(r.error || '切换失败');
          await refreshData();
          PCL.toast(`已切换到 ${folderName(path)}`, 'success', 1400);
          if (open) API.versions.open('');
        } catch (e) {
          PCL.toast('切换文件夹失败：' + String(e.message || e), 'error');
        }
      };

      // PCL2 的文件夹操作是右键菜单，不是常驻按钮
      let menu = null;
      let menuOutside = null;
      const closeMenu = () => {
        if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
        menu = null;
        if (menuOutside) {
          document.removeEventListener('mousedown', menuOutside, true);
          menuOutside = null;
        }
      };
      const openFolderMenu = (path, x, y) => {
        closeMenu();
        const only = folders.length <= 1;
        menu = document.createElement('div');
        menu.className = 'vsel-menu';
        menu.innerHTML = `
          <button data-menu="open">${Icons.folder}<span>打开文件夹</span></button>
          <button data-menu="refresh">${Icons.refresh}<span>刷新版本列表</span></button>
          <div class="vsel-menu-sep"></div>
          <button data-menu="remove" class="danger" ${only ? 'disabled' : ''}>${Icons.trash}<span>移出列表</span></button>`;
        document.body.appendChild(menu);
        const mw = menu.offsetWidth || 168;
        const mh = menu.offsetHeight || 112;
        menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - mw - 8))}px`;
        menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - mh - 8))}px`;

        menu.querySelectorAll('[data-menu]').forEach((btn) =>
          btn.addEventListener('click', async () => {
            const action = btn.dataset.menu;
            closeMenu();
            if (action === 'open') return activateFolder(path, true);
            if (action === 'refresh') return refreshData();
            if (action === 'remove') {
              if (folders.length <= 1) return PCL.toast('至少要保留一个游戏文件夹', 'error');
              PCL.confirm(
                '从列表移除文件夹',
                `只会把「${path}」从启动器列表移除，不会删除磁盘上的任何文件。确定继续吗？`,
                async () => {
                  try {
                    const r = await API.folders.remove(path);
                    if (r && r.ok === false) throw new Error(r.error || '移除失败');
                    await refreshData();
                    PCL.toast('已从列表移除', 'success');
                  } catch (e) {
                    PCL.toast('移除失败：' + String(e.message || e), 'error');
                  }
                },
                '移除'
              );
            }
          })
        );

        setTimeout(() => {
          menuOutside = (e) => {
            if (!menu) return closeMenu();
            if (menu.contains(e.target)) return;
            closeMenu();
          };
          document.addEventListener('mousedown', menuOutside, true);
        }, 0);
      };

      PCL.$('#vselEmptyInstall', root)?.addEventListener('click', () => {
        pd.dlTab = 'auto';
        PCL.go('download');
      });

      PCL.$$('[data-folder]', root).forEach((folder) => {
        const path = folder.dataset.folder;
        folder.addEventListener('click', (e) => {
          if (e.target.closest('[data-folder-menu]')) return;
          activateFolder(path);
        });
        folder.addEventListener('dblclick', (e) => {
          if (e.target.closest('[data-folder-menu]')) return;
          activateFolder(path, true);
        });
        folder.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateFolder(path);
          }
        });
        folder.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          openFolderMenu(path, e.clientX, e.clientY);
        });
      });

      PCL.$$('[data-folder-menu]', root).forEach((btn) =>
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rect = btn.getBoundingClientRect();
          openFolderMenu(btn.dataset.folderMenu, rect.left, rect.bottom + 4);
        })
      );

      PCL.$$('[data-side]', root).forEach((btn) =>
        btn.addEventListener('click', async () => {
          const side = btn.dataset.side;
          if (side === 'pack') {
            pd.dlTab = 'pack';
            PCL.go('download');
            return;
          }
          if (side === 'add' || side === 'create') {
            try {
              const r = await API.folders[side]();
              if (!r || r.canceled) return;
              if (r.ok === false) throw new Error(r.error || '操作失败');
              await refreshData();
              PCL.toast(side === 'create' ? '已创建并切换文件夹' : '已添加并切换文件夹', 'success', 1600);
            } catch (e) {
              PCL.toast('操作失败：' + String(e.message || e), 'error');
            }
          }
        })
      );

      const choose = async (id) => {
        if (id === state.settings.version) return PCL.go('home');
        await PCL.saveSettings({ version: id });
        PCL.toast(`已选用 ${id}`, 'success', 1600);
        PCL.go('home');
      };

      PCL.$$('.vsel-row', root).forEach((row) => {
        const id = row.dataset.id;
        row.addEventListener('click', async (e) => {
          const act = e.target.closest('[data-act]');
          if (act) {
            e.stopPropagation();
            if (act.dataset.act === 'star') {
              const set = new Set(
                Array.isArray(state.settings.starredVersions) ? state.settings.starredVersions.map(String) : []
              );
              if (set.has(id)) set.delete(id);
              else set.add(id);
              await PCL.saveSettings({ starredVersions: [...set] });
              PCL.render();
            } else if (act.dataset.act === 'settings') {
              pd.vTab = 'launch';
              PCL.go('version', { id });
            } else if (act.dataset.act === 'del') {
              PCL.confirm(
                '删除版本',
                `确定删除「${id}」吗？该版本的 jar、Mod 与存档都会被移除，且不可恢复。`,
                async () => {
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
                },
                '删除'
              );
            }
            return;
          }
          choose(id);
        });
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose(id);
          }
        });
      });

      PCL.$$('[data-group]', root).forEach((head) =>
        head.addEventListener('click', () => {
          const key = head.dataset.group;
          pd.vselOpen = pd.vselOpen || {};
          const currentlyOpen = head.getAttribute('aria-expanded') === 'true';
          pd.vselOpen[key] = !currentlyOpen;
          PCL.render();
        })
      );

      closeMenu();
    },
  };
})();
