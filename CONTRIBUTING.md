# 参与 StartPro Launcher

## 反馈 Bug

请使用仓库的 Bug 模板，附上：

- StartPro Launcher 版本（设置 → 关于）
- Windows 版本
- 游戏版本和加载器（Fabric / Forge / NeoForge）
- 复现步骤和日志末尾
- 相关截图

日志在 `%APPDATA%\StartPro Launcher\logs`。请先删除日志里的账号、API Key 等敏感信息。

## 开发

源码在 [`source/`](source/)：

```bash
cd source
npm install
npm start
```

提交前建议运行：

```bash
node scripts/selftest.js
node scripts/ui-smoke.js
```

构建 Windows 包：

```bash
npm run dist
```

## 代码约定

- 主进程代码放 `source/core/` 或 `main.js`，通过 `preload.js` 暴露给界面。
- 界面保持原生 HTML/CSS/JS，不引入前端框架。
- 新增设置项要兼容旧 `config.json`，不要让老用户配置丢失。
- 下载、更新、启动相关改动必须说明失败路径和回退行为。
- 不要在代码、日志、截图或 Issue 里提交 API Key、账号密码和 Cookie。

## 提交 PR

- 一个 PR 只做一件事，标题写清楚改了什么。
- 附上复现步骤、验证方式和截图（界面改动）。
- 不要修改 `version`、`update.json` 和 Release 资产，版本发布由维护者统一处理。

## 许可

提交代码即表示同意以仓库的 [MIT License](LICENSE) 授权。
