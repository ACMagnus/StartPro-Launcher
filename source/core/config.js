'use strict';
/**
 * 配置与路径管理
 * - 在 Electron 中：数据目录 = <userData>
 * - 在纯 Node（自检脚本）中：数据目录 = ~/.pcl2
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  // 启动器设置（对应 PCL2 「设置」页）
  gameDir: path.join(os.homedir(), '.minecraft'),
  gameFolders: [], // 版本选择页左侧的 .minecraft 文件夹列表（第一项通常为 gameDir）
  starredVersions: [], // 版本选择页收藏的版本 ID（对应 PCL2 的“收藏夹”卡片）
  javaPath: '',
  autoInstallJava: true, // 启动时缺少所需 Java 可自动下载
  gameTitle: '',
  customInfo: 'StartPro',
  launcherVisibility: 'keep',
  processPriority: 'normal',
  windowMode: 'default',
  skinModel: 'random',
  versionSettings: {},
  maxMemory: 0, // 0 = 自动（物理内存的 1/4，上限 8192）
  launcherWidth: 1024,
  launcherHeight: 640,
  gameWidth: 854,
  gameHeight: 480,
  fullscreen: false,
  versionIsolation: true, // 版本隔离
  version: '', // 当前选择的版本
  account: '', // 当前账号 UUID
  mirror: 'bmclapi', // official | bmclapi（国内默认走 BMCLAPI）
  language: 'zh_cn',
  themeColor: '#1e6fd9',
  colorBackground: false,
  backgroundImage: '',
  backgroundMusic: '',
  playMusic: false,
  windowOpacity: 100,
  titleBar: 'default',
  showPclIcon: true,
  skinFile: '',
  autoSelectVersion: true,
  closeLauncherAfterGameStart: false,
  logLevel: 'info',
  msClientId: '',
  curseForgeApiKey: '',
  updateManifestUrl: 'https://acmagnus.github.io/StartPro-Launcher/update.json', // 启动器更新清单 JSON 地址
  autoCheckUpdates: true, // 启动时自动检查启动器更新
  aiEnabled: true, // 配置了接口与模型后启用在线 AI
  aiProvider: 'custom', // custom / deepseek / openai / ollama
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  aiTemperature: 0.35,
};

const MIRROR_HOSTS = {
  official: {
    versionManifest: 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',
    assetBase: 'https://resources.download.minecraft.net',
  },
  bmclapi: {
    versionManifest: 'https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json',
    assetBase: 'https://bmclapi2.bangbang93.com/assets',
  },
};

class Config {
  constructor(rootDir) {
    this.root = rootDir || process.env.PCL2_ROOT || path.join(os.homedir(), '.pcl2');
    this.file = path.join(this.root, 'config.json');
    this.isNew = !fs.existsSync(this.file);
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = { ...DEFAULTS, ...parsed };
      if (['PCL2', 'Pro Start', 'PS', 'PCL2 启动器'].includes(this.data.customInfo)) this.data.customInfo = 'StartPro';
      if (!Array.isArray(this.data.accounts)) this.data.accounts = [];
      if (!Array.isArray(this.data.versionList)) this.data.versionList = [];
      if (!Array.isArray(this.data.gameFolders)) this.data.gameFolders = [];
      if (!Array.isArray(this.data.starredVersions)) this.data.starredVersions = [];
      if (this.data.gameDir && !this.data.gameFolders.includes(this.data.gameDir)) {
        this.data.gameFolders.unshift(this.data.gameDir);
      }
    } catch (e) {
      this.data.accounts = this.data.accounts || [];
      this.data.versionList = this.data.versionList || [];
      this.data.gameFolders = this.data.gameFolders || [];
      this.data.starredVersions = this.data.starredVersions || [];
      if (this.data.gameDir && !this.data.gameFolders.includes(this.data.gameDir)) {
        this.data.gameFolders.unshift(this.data.gameDir);
      }
    }
    return this.data;
  }

  save() {
    try {
      fs.mkdirSync(this.root, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      /* 只读环境忽略 */
    }
  }

  get(key) {
    return key ? this.data[key] : this.data;
  }

  set(patch) {
    if (patch && typeof patch === 'object') {
      Object.assign(this.data, patch);
      this.save();
    }
    return this.data;
  }

  mirrorHosts(name) {
    return MIRROR_HOSTS[name] || MIRROR_HOSTS.official;
  }

  get gameDir() {
    return this.data.gameDir;
  }
}

module.exports = { Config, DEFAULTS, MIRROR_HOSTS };
