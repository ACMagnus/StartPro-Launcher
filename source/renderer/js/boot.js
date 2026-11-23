/* 启动引导：主题色、版本号、调试钩子 */
(function () {
  const origInit = PCL.init;
  PCL.init = async function () {
    await origInit.apply(this, arguments);
    // 应用主题色
    if (PCL.state.settings.themeColor) {
      document.documentElement.style.setProperty('--accent', PCL.state.settings.themeColor);
    }
    // 版本号
    try {
      const info = await API.appInfo();
      const el = PCL.$('#brandVer');
      if (el && info.version) el.textContent = 'v' + info.version;
      PCL.state.pageData.appInfo = info;
    } catch (e) {}

    // 支持 #download:mod 这样的深链接（便于截图与调试）
    const hash = (location.hash || '').replace('#', '');
    const [hp, ht] = hash.split(':');
    if (ht) {
      if (hp === 'download') PCL.state.pageData.dlTab = ht;
      if (hp === 'settings') PCL.state.pageData.setTab = ht;
      if (hp === 'version') PCL.state.pageData.vTab = ht;
      if (hp === 'more') PCL.state.pageData.moreTab = ht;
    }
    if (hp && window.PCLPages[hp]) await PCL.go(hp);
    window.addEventListener('hashchange', () => {
      const h = (location.hash || '').replace('#', '');
      const [p, t] = h.split(':');
      if (t) {
        if (p === 'download') PCL.state.pageData.dlTab = t;
        if (p === 'settings') PCL.state.pageData.setTab = t;
        if (p === 'version') PCL.state.pageData.vTab = t;
        if (p === 'more') PCL.state.pageData.moreTab = t;
      }
      if (p && window.PCLPages[p]) PCL.go(p);
    });
  };
})();

/* 调试：?debug 时把关键尺寸写进标题，便于排查布局 */
(function () {
  if (!location.search.includes('debug')) return;
  setTimeout(() => {
    const el = document.querySelector('.view');
    const main = document.getElementById('main');
    const app = document.querySelector('.app');
    document.title = JSON.stringify({
      win: [innerWidth, innerHeight],
      app: app ? app.getBoundingClientRect().height : 0,
      main: main ? main.getBoundingClientRect().height : 0,
      view: el ? el.getBoundingClientRect().height : 0,
      bodyH: document.body.scrollHeight,
      dpr: devicePixelRatio,
    });
  }, 800);
})();
