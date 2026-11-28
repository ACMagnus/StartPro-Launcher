# StartPro Launcher（SPL）

StartPro Launcher（简称 SPL）是以 Plain Craft Launcher 2（PCL2）界面为蓝本的开源 Minecraft 启动器：**布局与配色按 PCL2 实机截图逐页对齐**，底层是真实的 Mojang 下载与启动流程，而不是只有外壳的演示页。

Electron + 原生 HTML/CSS/JS，无前端框架依赖，Windows / macOS / Linux 均可运行。当前版本：**1.2.2**。

作者：**竹下一刀魂**。

## 快速开始

**Windows 用户（不需要 Node.js）**：解压后双击 `start.bat` 即可使用，不安装 Node、不装 npm、不联网拉依赖。

源码开发才需要 Node：解压源码后双击 `start.bat`，首次通过 npmmirror 安装 Electron。终端用户请用完整应用包里的 `start.bat`，源码目录的 `start.bat` 仅开发用。

命令行方式：

```bash
npm install          # 安装 electron 与 adm-zip
npm start            # 启动启动器
npm run preview      # 只想看界面：浏览器打开 http://localhost:5173
npm run selftest     # 命令行跑真实下载链路自检（不启动界面）
```

首次运行会自动创建配置：`<Electron userData>/config.json`（Windows 为 `%APPDATA%/StartPro Launcher`，macOS 为 `~/Library/Application Support/StartPro Launcher`，Linux 为 `~/.config/StartPro Launcher`）。

## 已实现的能力

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 界面复刻 | ✅ | 无边框窗口、深蓝标题栏、居中五个导航页、浅蓝渐变背景、白色圆角卡片、左栏子导航；主页 / 下载 / 联机 / 设置 / 更多 / 版本管理全部可切换 |
| 版本方块图案 | ✅ | 所有版本名前绘制等距像素方块：草方块=正式版、命令方块=快照、石头=远古版、熔炉=Forge、白羊毛=Fabric、紫珀=NeoForge、钻石=OptiFine、工作台=整合包；纯内联 SVG，无外部图片 |
| 原版安装 | ✅ | 从 Mojang 版本清单拉取，下载客户端 jar、70+ 依赖库、资源文件与资源索引，全程 SHA-1 校验、16~32 并发、失败重试 |
| 版本覆盖 | ✅ | 清单里的**全部 925 个版本**：103 正式版 / 761 快照 / 26 远古 Beta / 35 远古 Alpha；旧版本自动建立 `assets/virtual/*` 与 `resources` 目录 |
| 版本选择器 | ✅ | 下载页弹窗内可搜索版本号、按正式版/快照/远古筛选，已安装版本会打标 |
| 版本选择页 | ✅ | 直接对照 PCL2 2.13.1.1：蓝色独立标题栏 + 返回箭头、左侧文件夹列表、右侧可安装 Mod / 收藏夹 / 常规版本 / 不常用版本 / 愚人节版本 / 整合包分组；卡片标题带数量，旧版自动折叠，按发布时间排序，支持选用、收藏、版本设置和删除 |
| 版本文件夹 | ✅ | 左侧文件夹列表支持新建 .minecraft、添加已有文件夹、切换和右键移出列表；移出只删记录不删文件，切换后自动刷新版本并重新选择可用版本；默认目录显示“官方启动器文件夹”，自定义目录显示父文件夹名 |
| 启动游戏 | ✅ | 按官方格式构建 JVM 参数与 classpath，处理 `inheritsFrom` 合并、natives 解压、参数规则（rules）、离线 UUID（与官方 MD5 算法一致），日志实时回传 |
| Fabric 安装 | ✅ | 通过 meta.fabricmc.net 安装，自动装好原版底座，版本命名同 PCL2（`1.21.4-Fabric 0.16.10`） |
| Mod / 数据包 / 资源包 / 光影 | ✅ | Modrinth 全量搜索 + CurseForge 官方 Key/免 Key 精确项目名双模式；自动落到当前版本的 `mods` / `datapacks` / `resourcepacks` / `shaderpacks`；官方 Key 模式自动递归安装必需前置 |
| 整合包 | ✅ | 支持 Modrinth `.mrpack` 与 CurseForge `.zip`：自动识别格式、安装基础版本与加载器、下载全部文件、写入 overrides；版本设置可导出 `.mrpack` |
| 版本管理 | ✅ | 扫描 `versions/`，版本隔离、复制、删除、打开目录、查看主类 / Java 要求 / Mod 列表 |
| 资源文件下载 | ✅ 容错 | 单个资源下载失败会自动换镜像重试，仍失败只记录不阻断（缺音效不影响启动） |
| 账号 | ✅ 部分 | 离线登录（官方 UUID 算法）、外置登录（authlib-injector 兼容认证服务器）；微软正版登录需自备 Azure Client ID，默认未内置 |
| 联机 | ✅ 部分 | 顶栏「联机」入口；监听 UDP 4445 组播广播，自动发现「对局域网开放」的房间，一键复制地址；在线大厅/穿透仍需服务端 |
| 设置 | ✅ | 游戏目录、Java、内存、窗口、下载源、版本隔离、主题色、透明度、标题栏、背景图片/音乐、SPL 图标、CurseForge Key（可选）、更新清单 |
| 启动加载页 | ✅ | 贴近 PCL2 的启动状态：镐子图标、正在启动游戏、版本名、进度条、当前步骤 / 登录方式 / 启动进度、你知道吗、取消按钮；接收主进程真实 launch:phase 进度 |
| 崩溃分析 | ✅ | 读取 `crash-reports` / `logs/latest.log`，提取 Description、Suspected Mods、Caused by 并给出排查建议 |
| 自动更新 | ✅ Windows | 启动 5 秒后自动检查官方 `update.json`；发现新版本可一键下载、SHA-256 校验，退出旧进程后自动替换并重启。配置与存档在 `%APPDATA%`，不会被覆盖；也在「更多 → 检查更新」手动触发 |
| 全面检查 | ✅ | 一键检查运行环境、游戏目录读写、磁盘余量、版本 JSON/jar/依赖库/资源索引、Java 匹配、内存、账号、Mojang/BMCLAPI/Modrinth 连通性、最近日志异常；分通过/警告/失败三级，并给出可点击修复动作 |
| SPL 小助手 | ✅ | 内置离线知识库 + 可配置在线 AI（DeepSeek / OpenAI / Ollama / 任意 OpenAI 兼容接口）。配置后结合版本、Java、镜像、设置和最近日志回答任意问题，回复流式逐字显示；可刷新模型、测试连接，失败保留已生成内容并回退本地知识库；Key 只存本机 |
| 热门推荐 | ✅ | 下载页的 Mod / 整合包 / 数据包 / 资源包 / 光影包进入即按下载量展示热门内容，不需要先输入关键词；搜索框仍可按关键词筛选。 |
| Java 自动查找 | ✅ | 启动时后台扫描，设置页可手动重扫：PATH、`JAVA_HOME` / `JDK_HOME` / `JRE_HOME`、Windows 注册表（JavaSoft / Adoptium / Microsoft / Zulu / Corretto / Semeru）、常见 JDK 目录、微软商店官方启动器 runtime，以及 PCL / HMCL / Prism / MultiMC / ATLauncher 等启动器自带 Java；自动选最高版本，结果为空时再走 Temurin 自动安装 |
| Java 自动安装 | ✅ | 按版本所需 Java（8 / 17 / 21 / 25）从 Adoptium 拉取 Temurin JDK 最新版，自动解压、校验、探测并设为默认；下载页显示所需 Java 与「已就绪 / 自动安装」，启动时缺 Java 会弹窗询问后补装 |
| Mod 管理 | ✅ | 版本设置内启用/禁用、删除、全部启用/禁用、打开 mods 目录；支持 `.jar.disabled` / `.zip.disabled` |
| Forge / NeoForge | ✅ | 优先从 BMCLAPI 镜像下载 installer（失败回退官方）并以 `--installClient` 运行，跑完把目录重命名为 PCL2 风格（`1.20.1-Forge 47.4.29`）；版本列表优先走 BMCLAPI，失败时自动回退官方 maven-metadata，并读取 promos 标记推荐版。需要本机 Java 与网络 |
| OptiFine / Quilt | ✅ | OptiFine 从 optifine.net 自动拿令牌下载官方安装器，headless 调用 `optifine.Installer` 完成补丁；Quilt 通过 meta.quiltmc.org 安装 |
| 皮肤 | ✅ | Steve / Alex / 随机像素头像；支持自定义 64×64、128×128 皮肤 PNG；微软账号自动读取 Mojang profile 皮肤 |

## 目录结构

```
StartPro/
├── main.js              Electron 主进程：无边框窗口 + 全部 IPC
├── preload.js           contextBridge 暴露 window.pcl（渲染层无 Node 权限）
├── core/
│   ├── config.js        配置与镜像源定义
│   ├── net.js           fetch / 并发池 / 重试 / SHA-1 校验
│   ├── version.js       本地版本扫描、inheritsFrom 合并
│   ├── install.js       原版安装（客户端 / 依赖库 / natives / assets）
│   ├── launch.js        启动参数构建、Java 探测、进程与日志
│   └── assistant.js     小助手：离线知识库 + 在线 AI + 上下文动作
│   ├── java.js          Java 需求推断、Temurin 下载/解压/安装
│   ├── fabric.js        Fabric 安装
│   ├── modrinth.js      搜索、下载、.mrpack 整合包
│   ├── accounts.js      离线 / 外置登录
│   └── lanscan.js       局域网广播监听
├── renderer/
│   ├── index.html       壳：标题栏、导航、页面容器
│   ├── css/             base.css（控件与标题栏）+ pages.css（各页布局）
│   └── js/
│       ├── api.js       与 Electron 通信；浏览器下自动切到 Mock
│       ├── app.js       状态、路由、弹窗、Toast、任务浮窗
│       └── pages/       home / versions / download / multiplayer / settings / more
└── scripts/
    ├── selftest.js      真实下载链路自检
    └── preview-server.js 纯浏览器预览
```

## 自检结果（真实网络）

```
版本清单 OK：900+ 个版本
安装 1.21.4：客户端 27.0 MB，依赖库 70/70，classpath 缺失 0
启动参数：mainClass=net.minecraft.client.main.Main，Java 要求=21
Fabric：安装 1.21.4-Fabric 0.16.10，合并后 classpath 70 项
Modrinth：搜索 sodium 返回 37 条结果
Java 自动安装：1.21.4 需要 Java 21 → Adoptium 下载 198 MB → 解压得到 temurin-21（21.0.13.1 LTS）
Java 自动安装：1.7.10 需要 Java 8 → 同样流程安装 jdk8u514（1.8.0_514）
真实启动：用自动装好的 Java 21 运行 1.21.4，在 xvfb 软件渲染下完成 LWJGL 初始化与资源图集加载
```

运行时需要 Java：1.20.5+ 用 Java 21，1.17–1.20.4 用 Java 17，更早版本用 Java 8。启动器会先探测本机 Java；若缺少所需版本，可在 设置 → 游戏 → Java 一键下载，或直接在启动时让启动器补装。

## 已知限制

- Java 自动安装需要访问 `api.adoptium.net` 与 GitHub Releases（Temurin 托管在 GitHub）；网络不通时会返回明确错误，可改用本机已装 JDK。
- `assets` 资源文件体积较大（数百 MB），安装过程会按 32 并发下载，请留意磁盘占用。
- 联机页只负责「发现」，进入游戏仍需在多人游戏里粘贴地址。
- 界面为静态复刻，没有 PCL2 的动画曲线与圆角窗口特效库。

## 声明

StartPro 是第三方独立实现，不是 PCL2 官方版本，与龙腾猫跃及 PCL2 官方无隶属关系。界面布局、分组规则与交互逻辑参考自 Plain Craft Launcher 2 的公开源码；PCL2 版权归龙腾猫跃所有，按《PCL 分发有限许可》发布，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [PCL2-PORTING.md](PCL2-PORTING.md)。Minecraft 是 Mojang Studios 的商标，本项目与 Mojang 无关联，请使用正版游戏。

## 鸣谢与第三方许可

- **龙腾猫跃（LTCat）／ Plain Craft Launcher 2**：版本选择页的页面结构、版本分组规则、文件夹菜单与交互细节参考自 PCL2 公开源码。项目：<https://github.com/Meloong-Git/PCL>；赞助：<https://meloong.com/afd/a/LTCat>。
- PCL2 以《PCL 分发有限许可》发布。本项目保留其署名与许可说明；如果后续直接复制 PCL 的大部分源码，必须按该许可的“重度使用”条款处理项目名称、关于页首位署名、源码公开与正版购买劝导等要求，不能只加一行鸣谢。
- Electron、Minecraft、Modrinth 与 Mojang Studios 的版权归各自权利人所有。

## 界面截图

`screenshots/` 目录下是实际运行截图：主页、下载、Mod 搜索、版本管理、设置、联机、更多、SPL 小助手、启动加载页，「全部版本选择器」（09/10 浏览器、11 Electron 内 925 个版本），以及 Java 自动安装（12 设置页列表与安装按钮、13 下载页所需 Java 已就绪），14 为自动装好 Java 21 后真实启动的 Minecraft 1.21.4 窗口。22 为按 PCL2 2.13.1.1 直接重做的「版本选择」整页（蓝色标题栏、文件夹列表、带数量的分组卡片），25 为文件夹右键菜单，26 为空文件夹的“无可用版本”状态，27 为「关于与鸣谢」中的 PCL2 署名与赞助链接，28–30 为最终 Windows 包内的版本选择、文件夹右键菜单与关于鸣谢页。24 为主页底部并排的「版本选择 / 版本设置」按钮。

主页、下载页与设置页按 PCL2 实机截图逐项对齐：主页为左侧全高白色面板（登录方式胶囊 / 64px 头像 / 用户名下拉 / 底部启动与版本按钮），下载页为「最新版本」卡片 + 正式版 / 预览版 / 远古版 / 愚人节版四条折叠栏，设置页为左侧「游戏 / 个性化 / 启动器 / 联机」白色侧栏与行式启动选项、内存滑条。

完整版本清单另见项目外层的 `Minecraft-全部版本清单.csv`（925 行，含类型与发布时间）。

## 打包安装包

```bash
npm i -D electron-builder
npm run dist          # 当前系统出安装包；--win / --mac / --linux 可指定目标
```

`package.json` 里已写好 `build` 配置（Windows NSIS、macOS dmg、Linux AppImage）。

## 回归测试

```bash
node scripts/selftest.js          # 核心：真实下载 + 参数构建 + 启动链路
node scripts/ui-smoke.js          # 界面：无头 Chromium 逐页点击，捕获 JS 异常
node scripts/diagnostics-test.js   # 全面检查：完整版本应通过，缺库版本应报失败
```

## 版本设置 / 更多页（PCL2 对齐）

- 版本设置页为独立全屏页面：164px 横排侧栏（概览/设置/Mod 管理/导出）、自绘标题栏、蓝色提示条、启动选项四行、内存三档单选与双进度条、服务器卡。
- 每版本设置持久化到 `versionSettings`，并覆盖隔离、内存、Java、窗口尺寸与服务器地址；支持自动连服。
- 更多页按 PCL2 帮助页重排：帮助/关于与鸣谢/百宝箱、搜索框、指南与常见问题折叠卡。
- 下载页最新版本卡显示发布时间，版本分组标题采用「正式版 (数量)」并带下拉箭头。


## v1.0.3 极致优化

- 外置登录：自动下载并校验 authlib-injector，启动时注入 `-javaagent`。
- 微软正版：设备码登录、Xbox/XSTS/Minecraft 资料交换、启动前 refresh token 自动续期。
- 安装/游戏日志：批量 IPC（安装每 200ms 或 60 行、游戏每 150ms 或 80 行），大幅降低 Forge 安装时 UI 卡顿。
- 启动选项：全屏启动、启动器最小化/关闭、进程优先级已真正生效。
- Mod 搜索：快照版本无结果时给出明确提示；搜索失败显示错误与重试。
- Forge 1.20.1 已用 Java 17 完整实装验证；authlib-injector 注入参数已实测生成。
