# PCL2 版本选择页移植对照

参考源码：Plain Craft Launcher 2 `2.13.1.1`，commit `2595a744eb6164b1e029e59990beffc1b5db4498`。
PCL2 版权归龙腾猫跃所有，以《PCL 分发有限许可》发布；本项目署名与许可说明见 `THIRD_PARTY_NOTICES.md`。

StartPro 是 Electron + JavaScript，PCL2 是 VB.NET + WPF。这里的“移植”是把 PCL2 的页面结构、尺寸、分组规则和交互逻辑逐项翻译到 StartPro，而不是把 `.vb` / `.xaml` 文件直接塞进 Electron 运行。

| PCL2 源码 | StartPro 对应 | 移植内容 |
| --- | --- | --- |
| `Plain Craft Launcher 2/Pages/PageSelectLeft.xaml` | `renderer/css/pcl-select.css` | 左栏 `MaxWidth=300`、`MinWidth=250`，文件夹项高度 40，右侧内容 25px 边距 |
| `PageSelectLeft.xaml.vb` | `renderer/js/pages/select.js` 文件夹区 | “文件夹列表 / 添加或导入”、文件夹项标题 + 路径、右键菜单、新建 / 添加 / 导入入口 |
| `PageSelectRight.xaml` | `renderer/css/pcl-select.css`、`renderer/js/pages/select.js` 卡片区 | 灰底、白色 5px 圆角卡片、13px 粗体标题、折叠箭头、行内图标与按钮 |
| `PageSelectRight.xaml.vb` | `renderer/js/pages/select.js` `groups` / `cardDefs` | 卡片标题“名称 + (数量)”、收藏夹不带数量、默认折叠状态、空状态 |
| `Modules/Minecraft/ModMinecraft.vb` | `renderer/js/pages/select.js` 分组函数 | Star / API / OriginalLike / Rubbish / Fool 分组；常规版本按 Drop 保留最新；仅整体最新为快照时把该快照放常规版本 |
| `Controls/MyCard.vb` | `.vsel-card` | 卡片圆角、轻阴影、标题栏高度与悬停 |
| `Controls/MyListItem.vb` | `.vsel-row` / `.vsel-folder` | 行高、选中态、悬停按钮区域 |

未移植：WPF 控件库、动画曲线、圆角窗口特效、下载器、PCL2 的赞助解锁与正版购买劝导流程。

如果后续要直接复制 PCL2 的大部分源码，必须按《PCL 分发有限许可》的“重度使用”条款调整项目名称、关于页首位署名、源码公开和正版购买劝导，不能只加鸣谢。
