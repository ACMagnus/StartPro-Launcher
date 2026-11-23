/* ============================ 联机 ============================ */
(function () {
  const P = (window.PCLPages = window.PCLPages || {});
  const API = window.API;

  P.multiplayer = {
    render(state) {
      const srv = state.lanServers || [];
      const scanning = !!state.pageData.lanScanning;

      const list = srv.length
        ? srv
            .map(
              (s, i) => `<div class="server-card" data-srv="${i}">
            <div class="vicon" style="background:linear-gradient(160deg,#8ab4e8,#3f74b5);width:38px;height:38px">LAN</div>
            <div class="grow" style="min-width:0">
              <div class="motd ellipsis">${PCL.esc(s.motd)}</div>
              <div class="addr">127.0.0.1:${s.port}</div>
            </div>
            <button class="btn small" data-copy="${PCL.esc(s.motd)}:${s.port}">复制地址</button>
          </div>`
            )
            .join('')
        : `<div class="empty">${
            scanning ? '正在监听局域网广播…<br/><span class="tiny">请在游戏内按 Esc → 对局域网开放</span>' : '尚未发现局域网房间'
          }</div>`;

      return `
      <div class="lan-head">
        <div>
          <div class="dl-head" style="margin:0">
            <div>
              <div class="title">局域网联机</div>
              <div class="desc">监听 Minecraft 的 UDP 4445 广播，自动发现同一网络内「对局域网开放」的世界。</div>
            </div>
          </div>
        </div>
        <div class="flex gap-8 center">
          <span class="lan-status"><span class="dot" style="background:${scanning ? 'var(--success)' : '#c3cedb'};box-shadow:${scanning ? '0 0 0 3px rgba(47,160,96,.15)' : 'none'}"></span>${scanning ? '监听中' : '未开启'}</span>
          <button class="btn ${scanning ? '' : 'primary'}" id="btnLan">${scanning ? '停止监听' : '开始扫描'}</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">发现的房间 <span class="sub">${srv.length} 个</span></div>
        ${list}
      </div>

      <div class="card mt-12">
        <div class="card-title">手动连接</div>
        <div class="search-bar" style="margin-bottom:0">
          <input class="input" id="lanAddr" placeholder="服务器地址，例如 192.168.1.20:25565" />
          <button class="btn" id="btnCopyAddr">复制地址</button>
        </div>
        <div class="tiny muted mt-12" style="line-height:1.8">
          多人游戏 → 直接连接 → 粘贴地址即可进入。若房主勾选了「在线模式」，则需要正版账号才能进入。
        </div>
      </div>

      <div class="card mt-12">
        <div class="card-title">联机小贴士</div>
        <div class="tiny sub" style="line-height:1.9">
          1. 确保双方在同一局域网（或已通过内网穿透工具互联）。<br/>
          2. 房主在游戏内 Esc → 对局域网开放，端口随机分配，本页会自动读取。<br/>
          3. 若系统防火墙拦截 UDP，可能无法发现房间，此时请手动填写地址。
        </div>
      </div>`;
    },

    mount(root, state) {
      const btn = PCL.$('#btnLan', root);
      if (btn)
        btn.addEventListener('click', async () => {
          state.pageData.lanScanning = !state.pageData.lanScanning;
          if (state.pageData.lanScanning) {
            await API.lan.start();
            PCL.toast('已开始监听局域网广播', 'success', 1800);
          } else {
            await API.lan.stop();
            state.lanServers = [];
          }
          PCL.render();
        });

      PCL.$$('[data-copy]', root).forEach((b) =>
        b.addEventListener('click', () => copy(b.dataset.copy))
      );
      PCL.$('#btnCopyAddr', root)?.addEventListener('click', () => {
        const v = PCL.$('#lanAddr', root).value.trim();
        if (!v) return PCL.toast('请输入地址', 'error');
        copy(v);
      });

      PCL.$$('.server-card', root).forEach((c) =>
        c.addEventListener('dblclick', () => {
          const a = c.querySelector('.addr');
          if (a) copy(a.textContent);
        })
      );
    },
  };

  function copy(text) {
    navigator.clipboard.writeText(text).then(
      () => PCL.toast('已复制：' + text, 'success', 1800),
      () => PCL.toast('复制失败，请手动选择文本', 'error')
    );
  }
})();
