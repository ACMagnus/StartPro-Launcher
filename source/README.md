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
- 热门推荐：下载页的 Mod / 整合包 / 数据包 / 资源包 / 光影包进入即按下载量展示热门内容。
- Java 自动查找：`core/launch.js` 的 `detectJavaList` 扫描 PATH、JAVA_HOME、注册表、官方启动器 runtime 与各启动器自带 Java；`renderer/js/boot.js` 启动时后台探测。

界面参考 PCL2 公开源码，PCL2 版权归龙腾猫跃；第三方许可说明见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

MIT License © 2026 竹下一刀魂
