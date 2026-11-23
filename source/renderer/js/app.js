/* ============================================================
   应用框架：状态、路由、通用组件
   ============================================================ */
(function () {
  const PCL = (window.PCL = {});
  const API = window.API;

  PCL.state = {
    page: 'home',
    params: {},
    settings: {},
    accounts: [],
    versions: [],
    manifest: null,
    news: [],
    tasks: {},
    running: false,
    runningVersion: '',
    runStarted: false,
    runProgress: 0,
    runPhase: '',
    runDetail: '',
    runTip: '',
    logs: [],
    lanServers: [],
    pageData: {}
  };

  /* ------------------------------ 工具函数 ------------------------------ */
  PCL.$ = (sel, root = document) => root.querySelector(sel);
  PCL.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  PCL.esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  PCL.fmtNum = (n) => {
    if (!n) return '0';
    if (n >= 1e8) return (n / 1e8).toFixed(1) + ' 亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
    return String(n);
  };

  PCL.fmtSize = (bytes) => {
    if (!bytes) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
  };

  PCL.fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
    if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
    if (diff < 30 * 86400e3) return `${Math.floor(diff / 86400e3)} 天前`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /* ------------------------------ Toast ------------------------------ */
  PCL.toast = (msg, type = 'info', ms = 2600) => {
    const layer = PCL.$('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    layer.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s ease, transform .25s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateX(16px)';
      setTimeout(() => el.remove(), 260);
    }, ms);
  };

  /* ------------------------------ Modal ------------------------------ */
  PCL.modal = ({ title, body, footer, width = 520, onMount }) => {
    const host = PCL.$('#modals');
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `
      <div class="modal" style="width:${width}px">
        <div class="modal-head">
          <span>${PCL.esc(title)}</span>
          <button class="modal-close" data-close>✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    host.appendChild(wrap);
    const close = () => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) close();
    });
    PCL.$$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
    if (onMount) onMount(wrap, close);
    return { el: wrap, close };
  };

  PCL.confirm = (title, text, onOk, okText = '确定') =>
    PCL.modal({
      title,
      width: 420,
      body: `<div style="line-height:1.8;font-size:13px">${PCL.esc(text)}</div>`,
      footer: `<button class="btn" data-close>取消</button><button class="btn primary" data-ok>${PCL.esc(okText)}</button>`,
      onMount: (wrap, close) => {
        wrap.querySelector('[data-ok]').addEventListener('click', async () => {
          close();
          await onOk();
        });
      },
    });

  PCL.prompt = (title, label, value, onOk, placeholder = '') =>
    PCL.modal({
      title,
      width: 440,
      body: `<label class="tiny muted">${PCL.esc(label)}</label>
             <input class="input mt-8" id="promptInput" value="${PCL.esc(value || '')}" placeholder="${PCL.esc(placeholder)}" />`,
      footer: `<button class="btn" data-close>取消</button><button class="btn primary" data-ok>确定</button>`,
      onMount: (wrap, close) => {
        const input = wrap.querySelector('#promptInput');
        setTimeout(() => input.focus(), 30);
        const submit = async () => {
          const v = input.value.trim();
          close();
          await onOk(v);
        };
        wrap.querySelector('[data-ok]').addEventListener('click', submit);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
      },
    });

  /* ------------------------------ 皮肤头像 ------------------------------ */
  // 8x8 像素的 Steve 风格头像，按用户名哈希微调色相
  const HEAD = [
    'HHHHHHHH',
    'HHHHHHHH',
    'HHHHLLHH',
    'HHHLLLLH',
    'LWBLLBWL',
    'LLLLLLLL',
    'LLLMMLLL',
    'LLLLLLLL',
  ];
  PCL.drawHead = (canvas, name = 'Steve') => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 8;
    canvas.width = 48;
    canvas.height = 48;
    const cell = canvas.width / size;
    const settings = (PCL.state && PCL.state.settings) || {};
    const model = settings.skinModel || 'random';
    const custom = (model === 'custom' || model === 'msa') && PCL.skinImage;
    if (custom && PCL.skinImage.complete && PCL.skinImage.naturalWidth) {
      // 64x64 皮肤：脸部在 (8,8)，帽子层在 (40,8)，按皮肤实际分辨率缩放
      const img = PCL.skinImage;
      const scale = (img.naturalWidth || 64) / 64;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 8 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, 48, 48);
      ctx.globalAlpha = 1;
      try {
        ctx.drawImage(img, 40 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, 48, 48);
      } catch {}
      ctx.globalAlpha = 1;
      return;
    }
    // 离线头像：Steve / Alex 两套配色，random 按用户名稳定选择
    const useAlex = model === 'alex' || (model === 'random' && (String(name).length + String(name).charCodeAt(0)) % 2 === 1);
    const palette = useAlex
      ? { skin: '#f6d7b9', light: '#fbe4cb', shade: '#ecc7a6', hair: '#e28b2f', hairDark: '#c97521' }
      : { skin: '#f4e0c4', light: '#f8e6cd', shade: '#ead2b8', hair: '#e39950', hairDark: '#d88e45' };
    const skin = palette.skin;
    const light = palette.light;
    const shade = palette.shade;
    const hair = palette.hair;
    const hairDark = palette.hairDark;
    const eyeW = '#f9fdf8';
    const eyeB = '#225d23';
    const mouth = '#e5b3a4';
    const hairTones = useAlex ? [hair, '#e2943e', '#df8e3d', '#e89a50'] : [hair, '#dd934a', '#df8e3d', '#e89a50'];
    const skinTones = [skin, light, palette.skin === '#f6d7b9' ? '#f2d0ac' : '#f0dcc2'];
    const map = { H: hair, J: hairDark, S: skin, L: light, D: shade, W: eyeW, B: eyeB, M: mouth };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const ch = HEAD[y][x];
        let color = map[ch] || skin;
        if (ch === 'H') color = hairTones[(x * 5 + y * 3) % hairTones.length];
        if (ch === 'L') color = skinTones[(x * 3 + y * 2) % skinTones.length];
        if (ch === 'W' && x > 4) color = skin;
        ctx.fillStyle = color;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

  };

  /* 版本前的方块图案：等距像素方块（草方块 / 命令方块 / 石头 / 熔炉 / 羊毛 …） */
  const BLOCK_PALETTES = {
    grass: { top: '#79c34c', top2: '#5aa832', left: '#8a5a33', right: '#6b4426', fringe: '#4f9a2c', fringe2: '#3f7d22' },
    command: { top: '#e0a154', top2: '#c4813a', left: '#bd7128', right: '#96541c', fringe: '#8a4a16', fringe2: '#743d11' },
    stone: { top: '#a7adb3', top2: '#8b9299', left: '#858c93', right: '#666d73', fringe: '#5c6369', fringe2: '#4c5257' },
    forge: { top: '#8f969c', top2: '#757c82', left: '#6f767c', right: '#565d63', fringe: '#4a5055', fringe2: '#3b4044' },
    neoforge: { top: '#b98ad8', top2: '#9a66bd', left: '#8d5cab', right: '#6d4288', fringe: '#5f3a76', fringe2: '#4c2d5f' },
    fabric: { top: '#ececdf', top2: '#d3d3c2', left: '#c9c9b8', right: '#a7a795', fringe: '#8f8f7c', fringe2: '#7a7a68' },
    modpack: { top: '#b98a5c', top2: '#9a6d42', left: '#8d6039', right: '#6c472a', fringe: '#5a3a22', fringe2: '#492e1b' },
    optifine: { top: '#8fe6e2', top2: '#5fc9c6', left: '#4fb5b3', right: '#378b8a', fringe: '#2f7877', fringe2: '#256261' },
  };

  PCL.blockIcon = (kind, cls) => {
    const p = BLOCK_PALETTES[kind] || BLOCK_PALETTES.grass;
    const dot = 'rgba(0,0,0,.16)';
    const hi = 'rgba(255,255,255,.18)';
    const edge = 'rgba(18,28,38,.24)';
    const deco = {
      forge: `<rect x="5.5" y="15.2" width="7.5" height="7.5" fill="#33302b"/><rect x="6.8" y="16.6" width="5" height="4.8" fill="#f08a2c"/><rect x="7.6" y="18" width="3.4" height="2.2" fill="#ffce7a"/><rect x="20" y="17" width="2" height="2" fill="${dot}"/>`,
      command: `<rect x="4" y="10.8" width="1.4" height="1.4" fill="${dot}"/><rect x="9" y="13.6" width="1.4" height="1.4" fill="${dot}"/><rect x="14" y="16.4" width="1.4" height="1.4" fill="${dot}"/><rect x="20" y="13" width="1.4" height="1.4" fill="${dot}"/><rect x="24" y="15" width="1.4" height="1.4" fill="${dot}"/>`,
      fabric: `<rect x="6" y="14" width="3" height="3" fill="rgba(0,0,0,.16)"/><rect x="11" y="20" width="3" height="3" fill="rgba(0,0,0,.18)"/><rect x="8" y="24" width="2" height="2" fill="rgba(0,0,0,.14)"/><rect x="19" y="17" width="2" height="2" fill="rgba(0,0,0,.16)"/><rect x="23" y="21" width="3" height="3" fill="rgba(0,0,0,.18)"/><rect x="20" y="25" width="2" height="2" fill="rgba(0,0,0,.12)"/><rect x="6.5" y="17.5" width="2.6" height="2.6" fill="#e59fc4"/><rect x="22.5" y="19" width="2.6" height="2.6" fill="#8fc0e4"/><rect x="13" y="7" width="2" height="2" fill="#e59fc4"/>`,
      optifine: `<rect x="8" y="12" width="2" height="2" fill="#eaffff"/><rect x="6" y="14" width="2" height="2" fill="#d8fbfa"/><rect x="21" y="18" width="2" height="2" fill="#eaffff"/><rect x="23" y="20" width="2" height="2" fill="#d8fbfa"/>`,
      modpack: `<rect x="4" y="10" width="12" height="1.2" fill="rgba(60,35,15,.35)"/><rect x="16" y="16.6" width="12" height="1.2" fill="rgba(60,35,15,.35)"/><rect x="14" y="4" width="1.2" height="12" fill="rgba(60,35,15,.30)"/>`,
      stone: `<path d="M7 13 L11 17 L9 18 L5 14 Z" fill="rgba(40,45,50,.22)"/><path d="M20 20 L24 24 L23 25 L19 21 Z" fill="rgba(40,45,50,.18)"/>`,
      grass: `<rect x="5" y="12" width="2" height="2" fill="#6cb23e"/><rect x="9" y="14.5" width="2" height="2" fill="#84cc55"/><rect x="19" y="14" width="2" height="2" fill="#4f9a2c"/><rect x="24" y="17" width="2" height="2" fill="#437f24"/>`,
    };
    return `<span class="block-icon ${cls || ''}" aria-hidden="true"><svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <polygon points="16,2 30,9.4 16,16.8 2,9.4" fill="${p.top}" stroke="${edge}" stroke-width=".6"/>
      <polygon points="16,2 30,9.4 16,16.8 2,9.4" fill="${p.top2}" opacity=".28"/>
      <polygon points="2,9.4 16,16.8 16,30 2,22.6" fill="${p.left}" stroke="${edge}" stroke-width=".6"/>
      <polygon points="16,16.8 30,9.4 30,22.6 16,30" fill="${p.right}" stroke="${edge}" stroke-width=".6"/>
      <polygon points="2,10.2 16,17.6 16,19.6 2,12.2" fill="${p.fringe}"/>
      <polygon points="16,17.6 30,10.2 30,12.2 16,19.6" fill="${p.fringe2}"/>
      <polygon points="2,9.4 16,2 16,3.6 2,11" fill="${hi}"/>
      <rect x="7" y="15" width="2" height="2" fill="${dot}"/><rect x="11" y="19" width="2" height="2" fill="${hi}"/>
      <rect x="5" y="20" width="2" height="2" fill="${hi}"/><rect x="20" y="16" width="2" height="2" fill="${dot}"/>
      <rect x="24" y="19" width="2" height="2" fill="${hi}"/><rect x="19" y="23" width="2" height="2" fill="${dot}"/>
      <rect x="12" y="6" width="2" height="2" fill="${hi}"/><rect x="17" y="10" width="2" height="2" fill="${dot}"/>
      ${deco[kind] || ''}
    </svg></span>`;
  };

  PCL.blockKind = (v) => {
    if ((v && v.type) === 'modpack') return 'modpack';
    const loader = ((v && v.loader) || '').toLowerCase();
    if (loader.includes('neoforge')) return 'neoforge';
    if (loader.includes('forge')) return 'forge';
    if (loader.includes('fabric')) return 'fabric';
    if (loader.includes('opti')) return 'optifine';
    if ((v && v.type) === 'modpack') return 'modpack';
    if ((v && v.type) === 'snapshot') return 'command';
    if (v && (v.type === 'old_beta' || v.type === 'old_alpha')) return 'stone';
    return 'grass';
  };

  /* 版本图标文字：与原版 PCL2 的草方块角标风格一致 */
  PCL.verIconText = (v) => {
    if (!v) return '?';
    if (v.type === 'modpack') return 'MP';
    const loader = (v.loader || '').toLowerCase();
    if (loader.includes('fabric')) return 'FB';
    if (loader.includes('quilt')) return 'QT';
    if (loader.includes('neoforge')) return 'NF';
    if (loader.includes('forge')) return 'FG';
    if (loader.includes('opti')) return 'OF';
    if (v.type === 'modpack') return 'MP';
    return 'MC';
  };

  /* 按版本号推断建议的 Java 版本（与原版要求一致） */
  PCL.suggestJava = (id) => {
    const v = String(id || '');
    const m = /^(\d+)\.(\d+)/.exec(v);
    if (!m) return 21;
    const major = Number(m[1]);
    const minor = Number(m[2]);
    if (major > 1) return 21; // 26.x 等新版本号体系
    if (minor >= 21) return 21;
    if (minor === 20) return /^1\.20\.[0-4]/.test(v) ? 17 : 21;
    if (minor >= 17) return 17;
    return 8;
  };

  /* ------------------------------ 导航 ------------------------------ */
  const NAV = [
    { id: 'home', label: '启动', icon: 'power' },
    { id: 'download', label: '下载', icon: 'download' },
    { id: 'multiplayer', label: '联机', icon: 'globe' },
    { id: 'settings', label: '设置', icon: 'gear' },
    { id: 'more', label: '更多', icon: 'grid' },
  ];

  function buildNav() {
    const nav = PCL.$('#topnav');
    PCL.$('#vdBack')?.addEventListener('click', () => PCL.go('versions'));
    nav.innerHTML = NAV.map(
      (n) =>
        `<button class="tab" data-page="${n.id}">${Icons[n.icon] || ''}<span>${n.label}</span></button>`
    ).join('');
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (btn) PCL.go(btn.dataset.page);
    });
  }

  function syncNav() {
    const isVD = PCL.state.page === 'version';
    document.body.classList.toggle('version-mode', isVD);
    document.body.dataset.page = PCL.state.page;
    const bar = PCL.$('#vdBar');
    if (bar) {
      bar.hidden = !isVD;
      if (isVD) PCL.$('#vdTitle').textContent = `版本设置 - ${PCL.state.params.id || (PCL.state.settings && PCL.state.settings.version) || ''}`;
    }
    PCL.$$('#topnav .tab').forEach((t) => t.classList.toggle('active', t.dataset.page === PCL.state.page));
  }

  /* ------------------------------ 路由 ------------------------------ */
  let renderSeq = 0;

  PCL.go = async (page, params = {}) => {
    PCL.state.page = page;
    PCL.state.params = params;
    syncNav();
    await PCL.render();
  };

  PCL.render = async () => {
    const seq = ++renderSeq;
    const main = PCL.$('#main');
    const page = window.PCLPages[PCL.state.page] || window.PCLPages.home;
    let html;
    try {
      html = await page.render(PCL.state);
    } catch (e) {
      if (seq !== renderSeq) return;
      console.error('[StartPro] 页面渲染失败', e);
      main.innerHTML = `<div class="view ${page.sidebar ? 'with-sidebar' : ''}"><div class="card"><div class="card-title">页面加载失败</div><div class="tiny" style="color:var(--danger);word-break:break-all">${PCL.esc(
        String(e && e.message ? e.message : e)
      )}</div><button class="btn small primary mt-12" id="btnRenderRetry">重试</button></div></div>`;
      PCL.$('#btnRenderRetry')?.addEventListener('click', () => PCL.render());
      return;
    }
    // 页面切换或重复刷新时，丢弃已经过期的异步渲染结果，避免旧页面覆盖新页面
    if (seq !== renderSeq) return;
    main.innerHTML = `<div class="view ${page.sidebar ? 'with-sidebar' : ''}">${html}</div>`;
    main.scrollTop = 0;
    if (seq !== renderSeq) return;
    if (page.mount) {
      try {
        await page.mount(main, PCL.state);
      } catch (e) {
        console.error('[StartPro] 页面挂载失败', e);
        PCL.toast('页面交互初始化失败：' + String(e && e.message ? e.message : e), 'error', 4000);
      }
    }
  };

  /* 局部刷新：不带整页重绘，避免滚动跳动 */
  PCL.refresh = async () => PCL.render();

  /* ------------------------------ 个性化应用 ------------------------------ */
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [30, 111, 217];
  }
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  PCL.applyMusic = async () => {
    const s = (PCL.state && PCL.state.settings) || {};
    if (!PCL.bgAudio) {
      PCL.bgAudio = new Audio();
      PCL.bgAudio.loop = true;
      PCL.bgAudio.volume = 0.35;
      PCL.bgAudio.addEventListener('error', () => {});
    }
    if (!s.playMusic) {
      try { PCL.bgAudio.pause(); } catch {}
      return;
    }
    if (PCL.bgAudio.dataset.path !== String(s.backgroundMusic || '')) {
      const r = await API.personal.getMusic();
      if (!r.ok) return;
      PCL.bgAudio.src = r.dataUrl;
      PCL.bgAudio.dataset.path = String(s.backgroundMusic || '');
    }
    try { await PCL.bgAudio.play(); } catch {}
  };

  PCL.applyPersonal = async () => {
    // 设置可能在异步读取背景/皮肤期间被再次修改；用序号丢弃旧的完成回调
    const seq = (PCL.personalSeq = (PCL.personalSeq || 0) + 1);
    const s = (PCL.state && PCL.state.settings) || {};
    const root = document.documentElement;
    root.style.setProperty('--accent', s.themeColor || '#1e6fd9');
    root.style.setProperty('--accent-soft', rgba(s.themeColor || '#1e6fd9', 0.12));
    root.style.setProperty('--accent-border', rgba(s.themeColor || '#1e6fd9', 0.35));
    const tb = document.getElementById('titlebar');
    if (tb) {
      tb.classList.toggle('tb-none', (s.titleBar || 'default') === 'none');
      tb.classList.toggle('tb-text', (s.titleBar || 'default') === 'text');
      tb.classList.toggle('tb-image', (s.titleBar || 'default') === 'image');
      tb.classList.toggle('hide-brand', s.showPclIcon === false);
    }
    document.body.classList.toggle('color-bg', !!s.colorBackground);
    const applySkin = (skin) => {
      if (seq !== PCL.personalSeq || !skin || !skin.ok) return;
      const img = new Image();
      img.onload = () => {
        if (seq !== PCL.personalSeq) return;
        PCL.skinImage = img;
        if (PCL.state && (PCL.state.page === 'home' || PCL.state.page === 'settings')) PCL.render();
      };
      img.src = skin.dataUrl || skin.url;
    };
    const [bg, skin] = await Promise.all([
      API.personal.getBackground().catch(() => ({ ok: false })),
      API.personal.getSkin().catch(() => ({ ok: false })),
    ]);
    if (seq !== PCL.personalSeq) return;
    PCL.bgDataUrl = bg && bg.ok ? bg.dataUrl : '';
    if (PCL.bgDataUrl && !s.colorBackground) {
      document.body.classList.add('has-bg');
      document.body.style.backgroundImage = `url("${PCL.bgDataUrl}")`;
    } else {
      document.body.classList.remove('has-bg');
      document.body.style.backgroundImage = '';
    }
    if (tb) tb.style.backgroundImage = (s.titleBar || 'default') === 'image' && PCL.bgDataUrl ? `url("${PCL.bgDataUrl}")` : '';
    if (skin && skin.ok) {
      applySkin(skin);
    } else {
      PCL.skinImage = null;
    }
    // 正版皮肤只走后台刷新，不阻塞首屏；刷新完成后再重绘一次
    if (skin && skin.pending && !PCL.skinRefreshStarted) {
      PCL.skinRefreshStarted = true;
      API.personal.refreshSkin()
        .then((fresh) => {
          if (seq === PCL.personalSeq && fresh && fresh.ok) applySkin(fresh);
        })
        .catch(() => {})
        .finally(() => { PCL.skinRefreshStarted = false; });
    }
    await PCL.applyMusic();
  };

  /* ------------------------------ 设置读写 ------------------------------ */
  const PERSONAL_SETTING_KEYS = ['themeColor', 'colorBackground', 'backgroundImage', 'backgroundMusic', 'titleBar', 'showPclIcon', 'skinFile', 'skinModel'];
  PCL.saveSettings = async (patch, silent = true) => {
    PCL.state.settings = await API.settings.set(patch);
    // 只改动 AI、Java、内存等设置时不必重新读取背景、皮肤和音乐，避免设置页输入被媒体 I/O 拖慢
    if (Object.keys(patch || {}).some((k) => PERSONAL_SETTING_KEYS.includes(k))) {
      await PCL.applyPersonal();
    }
    if (!silent) PCL.toast('已保存', 'success', 1500);
    return PCL.state.settings;
  };

  /* ------------------------------ 当前账号/版本 ------------------------------ */
  PCL.currentAccount = () => {
    const s = PCL.state;
    return s.accounts.find((a) => a.id === s.settings.account) || s.accounts[0] || null;
  };
  PCL.currentVersion = () => {
    const s = PCL.state;
    return s.versions.find((v) => v.id === s.settings.version) || s.versions[0] || null;
  };

  /* ------------------------------ 任务浮窗 ------------------------------ */
  const panel = () => PCL.$('#taskPanel');
  PCL.showTask = (p) => {
    const el = panel();
    el.classList.add('on');
    PCL.$('#tpTitle').textContent = p.title || '正在处理';
    PCL.$('#tpDetail').textContent = p.detail || '';
    const pct = p.total ? Math.min(100, Math.round((p.current / p.total) * 100)) : 0;
    PCL.$('#tpPercent').textContent = p.total ? `${pct}%` : '';
    PCL.$('#tpCount').textContent = p.total ? `${p.current}/${p.total}` : '';
    const bar = PCL.$('#tpBar');
    bar.classList.toggle('indeterminate', !p.total);
    bar.firstElementChild.style.width = `${pct}%`;
    el.dataset.taskId = p.taskId || '';
  };
  PCL.hideTask = () => panel().classList.remove('on');

  /* ------------------------------ 启动状态 ------------------------------ */
  PCL.launchLog = (line) => {
    const s = PCL.state;
    s.logs.push(line);
    if (s.logs.length > 400) s.logs.shift();
    const box = PCL.$('#launchLog');
    if (box) {
      box.textContent = s.logs.slice(-120).join('\n');
      box.scrollTop = box.scrollHeight;
    }
  };

  /* ------------------------------ 初始化 ------------------------------ */
  PCL.init = async () => {
    const API = window.API;
    const [settings, accounts, versions, news, appInfo] = await Promise.all([
      API.settings.get().catch(() => ({})),
      API.accounts.list().catch(() => []),
      API.versions.list().catch(() => []),
      API.news().catch(() => []),
      API.appInfo().catch(() => ({})),
    ]);
    const st = settings || {};
    const vs = Array.isArray(versions) ? versions : [];
    PCL.state.settings = st;
    PCL.state.accounts = accounts || [];
    PCL.state.versions = vs;
    PCL.state.news = news || [];
    PCL.state.pageData.appInfo = appInfo || {};
    // 首屏不要等背景图/音乐解码：主题色已经同步应用，媒体在后台继续加载
    PCL.applyPersonal().catch(() => {});
    // 配置里记录的版本可能已被删除/改名；自动落到第一个可用版本并写回配置
    if (vs.length && !vs.some((v) => v.id === st.version)) {
      PCL.state.settings.version = vs[0].id;
      await API.settings.set({ version: vs[0].id }).catch(() => {});
    } else if (!vs.length && st.version) {
      PCL.state.settings.version = '';
      await API.settings.set({ version: '' }).catch(() => {});
    }

    buildNav();

    // 窗口控制
    const btnMin = PCL.$('#btnMin');
    const btnMax = PCL.$('#btnMax');
    const btnClose = PCL.$('#btnClose');
    btnMin.addEventListener('click', () => API.win.minimize());
    btnMax.addEventListener('click', () => API.win.toggleMaximize());
    btnClose.addEventListener('click', () => API.win.close());

    // 任务进度
    API.on('task:progress', (p) => PCL.showTask(p));
    API.on('task:done', (p) => {
      PCL.$('#tpPercent').textContent = '完成';
      PCL.$('#tpBar').firstElementChild.style.width = '100%';
      setTimeout(() => PCL.hideTask(), 1400);
      if (p.success) {
        PCL.toast(`${p.title} 完成`, 'success');
        API.versions.list().then((vs) => {
          PCL.state.versions = vs;
          if (PCL.state.page === 'versions' || PCL.state.page === 'home') PCL.render();
        });
      } else {
        PCL.toast(`${p.title} 失败：${p.error || '未知错误'}`, 'error', 5000);
      }
    });

    API.on('task:log', (p) => {
      const lines = Array.isArray(p.lines) ? p.lines : p.line ? [p.line] : [];
      for (const line of lines) PCL.launchLog('[安装器] ' + line);
    });

    API.on('launch:phase', (p) => {
      PCL.state.runPhase = p.phase || PCL.state.runPhase;
      if (p.detail) PCL.state.runDetail = p.detail;
      if (Number.isFinite(Number(p.progress))) PCL.state.runProgress = Math.max(0, Math.min(99, Number(p.progress)));
      if (PCL.state.page === 'home' && PCL.state.running) PCL.render();
    });

    // 游戏日志
    API.on('launch:log', (p) => {
      const lines = Array.isArray(p.lines) ? p.lines : p.line ? [p.line] : [];
      for (const line of lines) PCL.launchLog(line);
    });
    API.on('launch:exit', (p) => {
      PCL.state.running = false;
      PCL.state.runStarted = false;
      PCL.state.runProgress = 0;
      PCL.state.runPhase = '已退出';
      PCL.toast(`游戏已退出（代码 ${p.code}）`, p.code === 0 ? 'info' : 'error', 3500);
      if (PCL.state.page === 'home') PCL.render();
    });

    // 局域网
    API.on('lan:server', (srv) => {
      const s = PCL.state;
      if (!s.lanServers.find((x) => x.key === srv.key)) {
        s.lanServers.push(srv);
        if (PCL.state.page === 'multiplayer') PCL.render();
      }
    });

    await PCL.go('home');

    // 自动更新：不占启动关键路径。弹窗/游戏中自动延后，避免因为用户当时不在首页而永久跳过。
    PCL.updateAuto = { checked: false, running: false, timer: null };
    const autoUpdateTick = async () => {
      if (!PCL.state.settings || PCL.state.settings.autoCheckUpdates === false) return;
      if (PCL.updateAuto.checked || PCL.updateAuto.running) return;
      if (PCL.state.running) {
        PCL.updateAuto.timer = setTimeout(autoUpdateTick, 15000);
        return;
      }
      if (document.querySelector('#modals .overlay')) {
        PCL.updateAuto.timer = setTimeout(autoUpdateTick, 2500);
        return;
      }
      const more = window.PCLPages && window.PCLPages.more;
      if (!more || typeof more.checkUpdate !== 'function') {
        PCL.updateAuto.timer = setTimeout(autoUpdateTick, 1500);
        return;
      }
      PCL.updateAuto.running = true;
      try {
        await more.checkUpdate(true);
        PCL.updateAuto.checked = true;
      } catch {
        PCL.updateAuto.checked = true;
      } finally {
        PCL.updateAuto.running = false;
      }
    };
    PCL.autoUpdateTick = autoUpdateTick;
    if (PCL.state.settings.autoCheckUpdates !== false) {
      PCL.updateAuto.timer = setTimeout(autoUpdateTick, 4000);
    }
  };

  window.addEventListener('DOMContentLoaded', () => PCL.init());
})();
