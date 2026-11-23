'use strict';
/** 把 renderer 打成单文件网页版：StartPro-Web.html */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'renderer');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let doc = read('index.html');
const css = ['base.css', 'pages.css', 'assistant.css', 'diagnostics.css'].map((n) => read(path.join('css', n))).join('\n');
const scripts = ['icons.js', 'api.js', 'app.js', 'pages/home.js', 'pages/versions.js', 'pages/download.js', 'pages/multiplayer.js', 'pages/settings.js', 'pages/more.js', 'diagnostics.js', 'assistant.js', 'boot.js'];
const js = scripts.map((n) => read(path.join('js', n))).join('\n');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets', 'icon-web.png')).toString('base64');
doc = doc.replace(/\s*<link rel="stylesheet" href="css\/[^"]+" \/>/g, '');
doc = doc.replace('<link rel="icon" href="assets/icon.png" />', `<link rel="icon" href="${icon}" />`);
doc = doc.replace(/\s*<script src="js\/[^"]+"><\/script>/g, '');
doc = doc.replace('</head>', () => `  <style>\n${css}\n  </style>\n</head>`);
doc = doc.replace('</body>', () => `  <script>\n${js}\n  </script>\n</body>`);
doc = doc.replace('<span class="brand-ver" id="brandVer">', '<span class="brand-ver" id="brandVer">');
doc = doc.replace('<span class="brand-ver" id="brandVer">1.2.1</span>', '<span class="brand-ver" id="brandVer">1.2.1</span><span class="web-tag">WEB</span>');
doc = doc.replace('<title>StartPro Launcher (SPL) · Minecraft Launcher</title>', '<title>StartPro Web · Minecraft 启动器网页版</title>');
doc = doc.replace('</body>', '  <div class="web-note">网页版 · 真实下载/启动请用桌面版</div>\n</body>');
doc = doc.replace('</style>', `.titlebar .win-controls{display:none}
.web-tag{font:700 9px/1 "Microsoft YaHei",sans-serif;color:#fff;background:#4a9be0;border-radius:3px;padding:3px 5px;margin-left:6px;letter-spacing:.5px;vertical-align:middle}
.web-note{position:fixed;right:12px;bottom:12px;z-index:40;font:10.5px/1 "Microsoft YaHei",sans-serif;color:#7b8fa4;background:rgba(255,255,255,.92);border:1px solid #e0ebf6;border-radius:5px;padding:6px 8px;pointer-events:none;box-shadow:0 2px 8px rgba(40,80,120,.08)}
@media (max-width:700px){.web-note{display:none}.app{min-width:980px}}
body:has(.launch-power) .web-note{display:none}
</style>`);
fs.writeFileSync(path.join(__dirname, '..', 'StartPro-Web.html'), doc);
console.log('StartPro-Web.html', fs.statSync(path.join(__dirname, '..', 'StartPro-Web.html')).size, 'bytes');
