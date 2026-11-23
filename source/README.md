# StartPro Launcher 源码

这是 StartPro Launcher 1.2.1 的完整 Electron 源码。完整介绍、下载入口和构建说明见仓库根目录的 [README](../README.md)。

```bash
npm install
npm start
npm run dist
```

- `main.js` / `preload.js`：Electron 主进程与安全桥接
- `core/`：下载、启动、Java、加载器、Mod、更新、AI
- `renderer/`：原生 HTML/CSS/JS 界面
- `scripts/`：自检、UI 冒烟、网页版构建

MIT License © 2026 竹下一刀魂
