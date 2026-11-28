/* ============================================================
   API 桥接层
   - Electron 中：直接透传 preload 暴露的 window.pcl
   - 浏览器中（preview / 无 Electron）：使用下方的 Mock 实现，
     界面与交互完全可用，下载/启动为模拟流程
   ============================================================ */
(function () {
  if (window.pcl) {
    window.API = window.pcl;
    window.IS_PREVIEW = false;
    return;
  }

  window.IS_PREVIEW = true;

  const LS_KEY = 'startpro-settings';
  const LEGACY_LS_KEY = 'pro-start-settings';
  const listeners = {};
  const emit = (ch, payload) => (listeners[ch] || []).forEach((cb) => cb(payload));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = () => Math.random().toString(36).slice(2);

  const DEFAULT_SETTINGS = {
    gameDir: '/home/user/.minecraft',
    gameFolders: ['/home/user/.minecraft'],
    starredVersions: [],
    javaPath: '/usr/lib/jvm/java-17-openjdk/bin/java',
    maxMemory: 4096,
    defaultMemory: 8192,
      totalMem: 16 * 1024,
    versionIsolation: true,
    version: '1.21.4-Fabric 0.16.10',
    account: 'steve-uuid',
    mirror: 'bmclapi',
    themeColor: '#1e6fd9',
    gameWidth: 854,
    gameHeight: 480,
    launcherWidth: 1024,
    launcherHeight: 640,
    autoSelectVersion: true,
    closeLauncherAfterGameStart: false,
    demo: true
  };

  function loadSettings() {
    try {
      let raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        raw = localStorage.getItem(LEGACY_LS_KEY);
        if (raw) localStorage.setItem(LS_KEY, raw);
      }
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {}
    return { ...DEFAULT_SETTINGS };
  }

  let settings = loadSettings();
  let accounts = [
    { id: 'steve-uuid', name: 'Steve', type: 'offline' },
    { id: 'alex-uuid', name: 'Alex', type: 'authlib' }
  ];

  const VERSIONS = [
    {
      id: '1.21.4-Fabric 0.16.10',
      type: 'modified',
      inheritsFrom: '1.21.4',
      loader: 'Fabric',
      releaseTime: '2025-07-02T10:20:00Z',
      lastUsed: '2026-11-20T18:22:00Z',
      jar: true,
      size: 2684354,
      mods: 12
    },
    {
      id: '1.21.4',
      type: 'release',
      loader: '',
      releaseTime: '2024-12-03T10:12:00Z',
      lastUsed: '2026-11-12T21:05:00Z',
      jar: true,
      size: 2712340,
      mods: 0
    },
    {
      id: '1.20.1-Forge 47.2.0',
      type: 'modified',
      inheritsFrom: '1.20.1',
      loader: 'Forge',
      releaseTime: '2023-06-12T00:00:00Z',
      lastUsed: '2026-10-28T19:40:00Z',
      jar: true,
      size: 2411000,
      mods: 37
    },
    {
      id: '1.19.2',
      type: 'release',
      loader: '',
      releaseTime: '2022-08-05T00:00:00Z',
      lastUsed: '2026-09-30T12:00:00Z',
      jar: true,
      size: 2210000,
      mods: 0
    },
    {
      id: '1.12.2',
      type: 'release',
      loader: '',
      releaseTime: '2017-09-18T00:00:00Z',
      lastUsed: '2026-05-02T12:00:00Z',
      jar: true,
      size: 1030000,
      mods: 5
    }
  ];

  const FALLBACK_MANIFEST = {"latest":{"release":"26.3","snapshot":"26.4-snapshot-10"},"versions":[{"id":"26.4-snapshot-10","type":"snapshot","releaseTime":"2026-11-17T16:02:02+00:00","url":""},{"id":"26.4-snapshot-9","type":"snapshot","releaseTime":"2026-11-17T12:58:45+00:00","url":""},{"id":"26.4-snapshot-8","type":"snapshot","releaseTime":"2026-11-10T14:20:05+00:00","url":""},{"id":"26.4-snapshot-7","type":"snapshot","releaseTime":"2026-11-03T13:08:56+00:00","url":""},{"id":"26.4-snapshot-6","type":"snapshot","releaseTime":"2026-10-27T13:40:29+00:00","url":""},{"id":"26.4-snapshot-5","type":"snapshot","releaseTime":"2026-10-20T12:15:06+00:00","url":""},{"id":"26.4-snapshot-4","type":"snapshot","releaseTime":"2026-10-13T12:05:46+00:00","url":""},{"id":"26.4-snapshot-3","type":"snapshot","releaseTime":"2026-10-06T12:54:26+00:00","url":""},{"id":"26.4-snapshot-2","type":"snapshot","releaseTime":"2026-09-29T11:32:57+00:00","url":""},{"id":"26.4-snapshot-1","type":"snapshot","releaseTime":"2026-09-22T13:38:53+00:00","url":""},{"id":"26.3","type":"release","releaseTime":"2026-09-15T11:23:02+00:00","url":""},{"id":"26.3-rc-3","type":"snapshot","releaseTime":"2026-09-14T12:58:38+00:00","url":""},{"id":"26.3-rc-2","type":"snapshot","releaseTime":"2026-09-11T10:34:40+00:00","url":""},{"id":"26.3-rc-1","type":"snapshot","releaseTime":"2026-09-10T11:28:25+00:00","url":""},{"id":"26.3-pre-3","type":"snapshot","releaseTime":"2026-09-08T13:04:44+00:00","url":""},{"id":"26.3-pre-2","type":"snapshot","releaseTime":"2026-09-04T11:54:52+00:00","url":""},{"id":"26.3-pre-1","type":"snapshot","releaseTime":"2026-09-01T11:29:01+00:00","url":""},{"id":"26.3-snapshot-10","type":"snapshot","releaseTime":"2026-08-25T12:53:43+00:00","url":""},{"id":"26.3-snapshot-9","type":"snapshot","releaseTime":"2026-08-17T11:46:16+00:00","url":""},{"id":"26.3-snapshot-8","type":"snapshot","releaseTime":"2026-08-12T09:39:37+00:00","url":""},{"id":"26.3-snapshot-7","type":"snapshot","releaseTime":"2026-08-04T11:49:07+00:00","url":""},{"id":"26.3-snapshot-6","type":"snapshot","releaseTime":"2026-07-28T12:25:51+00:00","url":""},{"id":"26.3-snapshot-5","type":"snapshot","releaseTime":"2026-07-21T11:45:42+00:00","url":""},{"id":"26.3-snapshot-4","type":"snapshot","releaseTime":"2026-07-16T13:59:30+00:00","url":""},{"id":"26.3-snapshot-3","type":"snapshot","releaseTime":"2026-07-07T12:03:01+00:00","url":""},{"id":"26.3-snapshot-2","type":"snapshot","releaseTime":"2026-06-30T12:45:43+00:00","url":""},{"id":"26.3-snapshot-1","type":"snapshot","releaseTime":"2026-06-23T11:57:02+00:00","url":""},{"id":"26.2","type":"release","releaseTime":"2026-06-16T12:03:33+00:00","url":""},{"id":"26.2-rc-2","type":"snapshot","releaseTime":"2026-06-12T11:32:28+00:00","url":""},{"id":"26.2-rc-1","type":"snapshot","releaseTime":"2026-06-11T11:57:50+00:00","url":""},{"id":"26.2-pre-6","type":"snapshot","releaseTime":"2026-06-10T12:20:24+00:00","url":""},{"id":"26.2-pre-5","type":"snapshot","releaseTime":"2026-06-08T13:04:25+00:00","url":""},{"id":"26.2-pre-4","type":"snapshot","releaseTime":"2026-06-04T12:38:47+00:00","url":""},{"id":"26.2-pre-3","type":"snapshot","releaseTime":"2026-06-02T11:48:29+00:00","url":""},{"id":"26.2-pre-2","type":"snapshot","releaseTime":"2026-05-28T12:45:31+00:00","url":""},{"id":"26.2-pre-1","type":"snapshot","releaseTime":"2026-05-26T13:48:31+00:00","url":""},{"id":"26.2-snapshot-8","type":"snapshot","releaseTime":"2026-05-19T15:19:20+00:00","url":""},{"id":"26.2-snapshot-7","type":"snapshot","releaseTime":"2026-05-12T12:24:28+00:00","url":""},{"id":"26.2-snapshot-6","type":"snapshot","releaseTime":"2026-05-05T12:50:56+00:00","url":""},{"id":"26.2-snapshot-5","type":"snapshot","releaseTime":"2026-04-28T12:41:41+00:00","url":""},{"id":"26.2-snapshot-4","type":"snapshot","releaseTime":"2026-04-21T12:05:40+00:00","url":""},{"id":"26.2-snapshot-3","type":"snapshot","releaseTime":"2026-04-14T11:30:34+00:00","url":""},{"id":"26.2-snapshot-2","type":"snapshot","releaseTime":"2026-04-09T12:26:35+00:00","url":""},{"id":"26.1.2","type":"release","releaseTime":"2026-04-09T10:12:23+00:00","url":""},{"id":"26.1.2-rc-1","type":"snapshot","releaseTime":"2026-04-08T12:47:45+00:00","url":""},{"id":"26.2-snapshot-1","type":"snapshot","releaseTime":"2026-04-07T11:52:43+00:00","url":""},{"id":"26w14a","type":"snapshot","releaseTime":"2026-04-01T12:13:30+00:00","url":""},{"id":"26.1.1","type":"release","releaseTime":"2026-04-01T09:06:36+00:00","url":""},{"id":"26.1.1-rc-1","type":"snapshot","releaseTime":"2026-03-31T10:07:21+00:00","url":""},{"id":"26.1","type":"release","releaseTime":"2026-03-24T12:11:04+00:00","url":""},{"id":"26.1-rc-3","type":"snapshot","releaseTime":"2026-03-23T11:11:54+00:00","url":""},{"id":"26.1-rc-2","type":"snapshot","releaseTime":"2026-03-20T10:21:13+00:00","url":""},{"id":"26.1-rc-1","type":"snapshot","releaseTime":"2026-03-19T14:48:47+00:00","url":""},{"id":"26.1-pre-3","type":"snapshot","releaseTime":"2026-03-17T13:37:33+00:00","url":""},{"id":"26.1-pre-2","type":"snapshot","releaseTime":"2026-03-13T12:55:35+00:00","url":""},{"id":"26.1-pre-1","type":"snapshot","releaseTime":"2026-03-10T13:00:38+00:00","url":""},{"id":"26.1-snapshot-11","type":"snapshot","releaseTime":"2026-03-03T13:01:51+00:00","url":""},{"id":"26.1-snapshot-10","type":"snapshot","releaseTime":"2026-02-24T13:03:38+00:00","url":""},{"id":"26.1-snapshot-9","type":"snapshot","releaseTime":"2026-02-18T10:13:30+00:00","url":""},{"id":"26.1-snapshot-8","type":"snapshot","releaseTime":"2026-02-17T12:42:24+00:00","url":""},{"id":"26.1-snapshot-7","type":"snapshot","releaseTime":"2026-02-11T09:25:36+00:00","url":""},{"id":"26.1-snapshot-6","type":"snapshot","releaseTime":"2026-02-03T12:46:52+00:00","url":""},{"id":"26.1-snapshot-5","type":"snapshot","releaseTime":"2026-01-27T13:01:17+00:00","url":""},{"id":"26.1-snapshot-4","type":"snapshot","releaseTime":"2026-01-20T14:15:37+00:00","url":""},{"id":"26.1-snapshot-3","type":"snapshot","releaseTime":"2026-01-13T12:47:34+00:00","url":""},{"id":"26.1-snapshot-2","type":"snapshot","releaseTime":"2026-01-07T12:38:03+00:00","url":""},{"id":"26.1-snapshot-1","type":"snapshot","releaseTime":"2025-12-16T12:42:29+00:00","url":""},{"id":"1.21.11","type":"release","releaseTime":"2025-12-09T12:23:30+00:00","url":""},{"id":"1.21.11-rc3","type":"snapshot","releaseTime":"2025-12-08T13:17:37+00:00","url":""},{"id":"1.21.11-rc2","type":"snapshot","releaseTime":"2025-12-05T11:14:20+00:00","url":""},{"id":"1.21.11-rc1","type":"snapshot","releaseTime":"2025-12-04T15:20:43+00:00","url":""},{"id":"1.21.11-pre5","type":"snapshot","releaseTime":"2025-12-03T13:14:25+00:00","url":""},{"id":"1.21.11-pre4","type":"snapshot","releaseTime":"2025-12-01T13:17:32+00:00","url":""},{"id":"1.21.11-pre3","type":"snapshot","releaseTime":"2025-11-25T13:56:50+00:00","url":""},{"id":"1.21.11-pre2","type":"snapshot","releaseTime":"2025-11-21T11:44:15+00:00","url":""},{"id":"1.21.11-pre1","type":"snapshot","releaseTime":"2025-11-19T08:06:45+00:00","url":""},{"id":"25w46a","type":"snapshot","releaseTime":"2025-11-11T13:05:00+00:00","url":""},{"id":"25w45a","type":"snapshot","releaseTime":"2025-11-04T13:51:04+00:00","url":""},{"id":"25w44a","type":"snapshot","releaseTime":"2025-10-28T14:02:28+00:00","url":""},{"id":"25w43a","type":"snapshot","releaseTime":"2025-10-21T11:38:51+00:00","url":""},{"id":"25w42a","type":"snapshot","releaseTime":"2025-10-14T12:48:10+00:00","url":""},{"id":"25w41a","type":"snapshot","releaseTime":"2025-10-09T13:41:35+00:00","url":""},{"id":"1.21.10","type":"release","releaseTime":"2025-10-07T09:17:23+00:00","url":""},{"id":"1.21.10-rc1","type":"snapshot","releaseTime":"2025-10-02T12:09:16+00:00","url":""},{"id":"1.21.9","type":"release","releaseTime":"2025-09-30T11:58:43+00:00","url":""},{"id":"1.21.9-rc1","type":"snapshot","releaseTime":"2025-09-25T13:01:28+00:00","url":""},{"id":"1.21.9-pre4","type":"snapshot","releaseTime":"2025-09-23T14:58:08+00:00","url":""},{"id":"1.21.9-pre3","type":"snapshot","releaseTime":"2025-09-22T12:57:35+00:00","url":""},{"id":"1.21.9-pre2","type":"snapshot","releaseTime":"2025-09-19T09:48:58+00:00","url":""},{"id":"1.21.9-pre1","type":"snapshot","releaseTime":"2025-09-16T12:10:12+00:00","url":""},{"id":"25w37a","type":"snapshot","releaseTime":"2025-09-09T13:24:21+00:00","url":""},{"id":"25w36b","type":"snapshot","releaseTime":"2025-09-02T15:47:32+00:00","url":""},{"id":"25w36a","type":"snapshot","releaseTime":"2025-09-02T11:48:30+00:00","url":""},{"id":"25w35a","type":"snapshot","releaseTime":"2025-08-26T11:51:22+00:00","url":""},{"id":"25w34b","type":"snapshot","releaseTime":"2025-08-19T15:02:29+00:00","url":""},{"id":"25w34a","type":"snapshot","releaseTime":"2025-08-19T12:09:50+00:00","url":""},{"id":"25w33a","type":"snapshot","releaseTime":"2025-08-12T11:45:24+00:00","url":""},{"id":"25w32a","type":"snapshot","releaseTime":"2025-08-05T12:21:45+00:00","url":""},{"id":"25w31a","type":"snapshot","releaseTime":"2025-07-29T11:29:33+00:00","url":""},{"id":"1.21.8","type":"release","releaseTime":"2025-07-17T12:04:02+00:00","url":""},{"id":"1.21.8-rc1","type":"snapshot","releaseTime":"2025-07-15T13:42:50+00:00","url":""},{"id":"1.21.7","type":"release","releaseTime":"2025-06-30T09:32:16+00:00","url":""},{"id":"1.21.7-rc2","type":"snapshot","releaseTime":"2025-06-26T13:59:20+00:00","url":""},{"id":"1.21.7-rc1","type":"snapshot","releaseTime":"2025-06-25T12:41:59+00:00","url":""},{"id":"1.21.6","type":"release","releaseTime":"2025-06-17T11:10:28+00:00","url":""},{"id":"1.21.6-rc1","type":"snapshot","releaseTime":"2025-06-12T12:04:37+00:00","url":""},{"id":"1.21.6-pre4","type":"snapshot","releaseTime":"2025-06-10T12:22:36+00:00","url":""},{"id":"1.21.6-pre3","type":"snapshot","releaseTime":"2025-06-04T13:33:25+00:00","url":""},{"id":"1.21.6-pre2","type":"snapshot","releaseTime":"2025-06-02T13:40:47+00:00","url":""},{"id":"1.21.6-pre1","type":"snapshot","releaseTime":"2025-05-28T09:34:04+00:00","url":""},{"id":"25w21a","type":"snapshot","releaseTime":"2025-05-20T12:09:09+00:00","url":""},{"id":"25w20a","type":"snapshot","releaseTime":"2025-05-13T11:46:28+00:00","url":""},{"id":"25w19a","type":"snapshot","releaseTime":"2025-05-06T12:57:57+00:00","url":""},{"id":"25w18a","type":"snapshot","releaseTime":"2025-04-29T12:21:01+00:00","url":""},{"id":"25w17a","type":"snapshot","releaseTime":"2025-04-22T12:51:30+00:00","url":""},{"id":"25w16a","type":"snapshot","releaseTime":"2025-04-15T12:01:58+00:00","url":""},{"id":"25w15a","type":"snapshot","releaseTime":"2025-04-08T12:16:59+00:00","url":""},{"id":"25w14craftmine","type":"snapshot","releaseTime":"2025-04-01T15:50:09+00:00","url":""},{"id":"1.21.5","type":"release","releaseTime":"2025-03-25T12:14:58+00:00","url":""},{"id":"1.21.5-rc2","type":"snapshot","releaseTime":"2025-03-24T13:07:03+00:00","url":""},{"id":"1.21.5-rc1","type":"snapshot","releaseTime":"2025-03-20T13:45:48+00:00","url":""},{"id":"1.21.5-pre3","type":"snapshot","releaseTime":"2025-03-18T13:58:30+00:00","url":""},{"id":"1.21.5-pre2","type":"snapshot","releaseTime":"2025-03-12T12:36:02+00:00","url":""},{"id":"1.21.5-pre1","type":"snapshot","releaseTime":"2025-03-11T12:49:44+00:00","url":""},{"id":"25w10a","type":"snapshot","releaseTime":"2025-03-05T13:11:13+00:00","url":""},{"id":"25w09b","type":"snapshot","releaseTime":"2025-02-27T11:07:08+00:00","url":""},{"id":"25w09a","type":"snapshot","releaseTime":"2025-02-26T15:16:02+00:00","url":""},{"id":"25w08a","type":"snapshot","releaseTime":"2025-02-19T13:41:43+00:00","url":""},{"id":"25w07a","type":"snapshot","releaseTime":"2025-02-13T12:55:37+00:00","url":""},{"id":"25w06a","type":"snapshot","releaseTime":"2025-02-05T12:41:17+00:00","url":""},{"id":"25w05a","type":"snapshot","releaseTime":"2025-01-29T14:03:54+00:00","url":""},{"id":"25w04a","type":"snapshot","releaseTime":"2025-01-22T13:14:44+00:00","url":""},{"id":"25w03a","type":"snapshot","releaseTime":"2025-01-15T14:28:04+00:00","url":""},{"id":"25w02a","type":"snapshot","releaseTime":"2025-01-08T13:42:18+00:00","url":""},{"id":"1.21.4","type":"release","releaseTime":"2024-12-03T10:12:57+00:00","url":""},{"id":"1.21.4-rc3","type":"snapshot","releaseTime":"2024-11-29T17:02:53+00:00","url":""},{"id":"1.21.4-rc2","type":"snapshot","releaseTime":"2024-11-29T10:33:13+00:00","url":""},{"id":"1.21.4-rc1","type":"snapshot","releaseTime":"2024-11-28T10:19:01+00:00","url":""},{"id":"1.21.4-pre3","type":"snapshot","releaseTime":"2024-11-26T15:07:29+00:00","url":""},{"id":"1.21.4-pre2","type":"snapshot","releaseTime":"2024-11-25T13:18:35+00:00","url":""},{"id":"1.21.4-pre1","type":"snapshot","releaseTime":"2024-11-20T13:45:00+00:00","url":""},{"id":"24w46a","type":"snapshot","releaseTime":"2024-11-13T13:12:38+00:00","url":""},{"id":"24w45a","type":"snapshot","releaseTime":"2024-11-06T13:31:58+00:00","url":""},{"id":"24w44a","type":"snapshot","releaseTime":"2024-10-30T12:53:55+00:00","url":""},{"id":"1.21.3","type":"release","releaseTime":"2024-10-23T12:28:15+00:00","url":""},{"id":"1.21.2","type":"release","releaseTime":"2024-10-22T09:58:55+00:00","url":""},{"id":"1.21.2-rc2","type":"snapshot","releaseTime":"2024-10-21T15:53:05+00:00","url":""},{"id":"1.21.2-rc1","type":"snapshot","releaseTime":"2024-10-17T12:43:18+00:00","url":""},{"id":"1.21.2-pre5","type":"snapshot","releaseTime":"2024-10-16T13:30:35+00:00","url":""},{"id":"1.21.2-pre4","type":"snapshot","releaseTime":"2024-10-15T11:59:11+00:00","url":""},{"id":"1.21.2-pre3","type":"snapshot","releaseTime":"2024-10-11T12:32:27+00:00","url":""},{"id":"1.21.2-pre2","type":"snapshot","releaseTime":"2024-10-10T12:59:14+00:00","url":""},{"id":"1.21.2-pre1","type":"snapshot","releaseTime":"2024-10-08T13:22:12+00:00","url":""},{"id":"24w40a","type":"snapshot","releaseTime":"2024-10-02T13:15:42+00:00","url":""},{"id":"24w39a","type":"snapshot","releaseTime":"2024-09-25T13:08:41+00:00","url":""},{"id":"24w38a","type":"snapshot","releaseTime":"2024-09-18T12:32:07+00:00","url":""},{"id":"24w37a","type":"snapshot","releaseTime":"2024-09-11T13:01:31+00:00","url":""},{"id":"24w36a","type":"snapshot","releaseTime":"2024-09-04T12:44:12+00:00","url":""},{"id":"24w35a","type":"snapshot","releaseTime":"2024-08-28T12:25:10+00:00","url":""},{"id":"24w34a","type":"snapshot","releaseTime":"2024-08-21T14:14:13+00:00","url":""},{"id":"24w33a","type":"snapshot","releaseTime":"2024-08-15T12:39:34+00:00","url":""},{"id":"1.21.1","type":"release","releaseTime":"2024-08-08T12:24:45+00:00","url":""},{"id":"1.21.1-rc1","type":"snapshot","releaseTime":"2024-08-07T14:29:18+00:00","url":""},{"id":"1.21","type":"release","releaseTime":"2024-06-13T08:24:03+00:00","url":""},{"id":"1.21-rc1","type":"snapshot","releaseTime":"2024-06-10T12:24:08+00:00","url":""},{"id":"1.21-pre4","type":"snapshot","releaseTime":"2024-06-07T12:00:15+00:00","url":""},{"id":"1.21-pre3","type":"snapshot","releaseTime":"2024-06-05T08:51:44+00:00","url":""},{"id":"1.21-pre2","type":"snapshot","releaseTime":"2024-05-31T12:44:56+00:00","url":""},{"id":"1.21-pre1","type":"snapshot","releaseTime":"2024-05-29T12:04:43+00:00","url":""},{"id":"24w21b","type":"snapshot","releaseTime":"2024-05-22T16:25:41+00:00","url":""},{"id":"24w21a","type":"snapshot","releaseTime":"2024-05-22T14:18:26+00:00","url":""},{"id":"24w20a","type":"snapshot","releaseTime":"2024-05-15T12:00:35+00:00","url":""},{"id":"24w19b","type":"snapshot","releaseTime":"2024-05-10T14:32:42+00:00","url":""},{"id":"24w19a","type":"snapshot","releaseTime":"2024-05-10T12:15:31+00:00","url":""},{"id":"24w18a","type":"snapshot","releaseTime":"2024-05-03T12:08:27+00:00","url":""},{"id":"1.20.6","type":"release","releaseTime":"2024-04-29T12:40:45+00:00","url":""},{"id":"1.20.6-rc1","type":"snapshot","releaseTime":"2024-04-26T10:12:17+00:00","url":""},{"id":"1.20.5","type":"release","releaseTime":"2024-04-23T11:54:12+00:00","url":""},{"id":"1.20.5-rc3","type":"snapshot","releaseTime":"2024-04-22T13:42:34+00:00","url":""},{"id":"1.20.5-rc2","type":"snapshot","releaseTime":"2024-04-19T13:13:15+00:00","url":""},{"id":"1.20.5-rc1","type":"snapshot","releaseTime":"2024-04-18T11:45:40+00:00","url":""},{"id":"1.20.5-pre4","type":"snapshot","releaseTime":"2024-04-17T11:56:02+00:00","url":""},{"id":"1.20.5-pre3","type":"snapshot","releaseTime":"2024-04-16T11:57:30+00:00","url":""},{"id":"1.20.5-pre2","type":"snapshot","releaseTime":"2024-04-15T12:36:05+00:00","url":""},{"id":"1.20.5-pre1","type":"snapshot","releaseTime":"2024-04-10T12:44:25+00:00","url":""},{"id":"24w14a","type":"snapshot","releaseTime":"2024-04-03T11:49:39+00:00","url":""},{"id":"24w14potato","type":"snapshot","releaseTime":"2024-04-01T11:07:19+00:00","url":""},{"id":"24w13a","type":"snapshot","releaseTime":"2024-03-27T14:30:20+00:00","url":""},{"id":"24w12a","type":"snapshot","releaseTime":"2024-03-20T14:38:37+00:00","url":""},{"id":"24w11a","type":"snapshot","releaseTime":"2024-03-14T14:21:33+00:00","url":""},{"id":"24w10a","type":"snapshot","releaseTime":"2024-03-06T10:37:35+00:00","url":""},{"id":"24w09a","type":"snapshot","releaseTime":"2024-02-28T12:38:12+00:00","url":""},{"id":"24w07a","type":"snapshot","releaseTime":"2024-02-14T12:51:01+00:00","url":""},{"id":"24w06a","type":"snapshot","releaseTime":"2024-02-07T14:47:18+00:00","url":""},{"id":"24w05b","type":"snapshot","releaseTime":"2024-02-01T12:55:14+00:00","url":""},{"id":"24w05a","type":"snapshot","releaseTime":"2024-01-31T13:05:26+00:00","url":""},{"id":"24w04a","type":"snapshot","releaseTime":"2024-01-24T13:42:45+00:00","url":""},{"id":"24w03b","type":"snapshot","releaseTime":"2024-01-18T12:42:37+00:00","url":""},{"id":"24w03a","type":"snapshot","releaseTime":"2024-01-17T13:19:20+00:00","url":""},{"id":"23w51b","type":"snapshot","releaseTime":"2023-12-18T15:39:14+00:00","url":""},{"id":"23w51a","type":"snapshot","releaseTime":"2023-12-18T13:36:46+00:00","url":""},{"id":"1.20.4","type":"release","releaseTime":"2023-12-07T12:56:20+00:00","url":""},{"id":"1.20.4-rc1","type":"snapshot","releaseTime":"2023-12-06T14:38:01+00:00","url":""},{"id":"1.20.3","type":"release","releaseTime":"2023-12-04T12:10:32+00:00","url":""},{"id":"1.20.3-rc1","type":"snapshot","releaseTime":"2023-11-30T13:41:45+00:00","url":""},{"id":"1.20.3-pre4","type":"snapshot","releaseTime":"2023-11-28T13:47:32+00:00","url":""},{"id":"1.20.3-pre3","type":"snapshot","releaseTime":"2023-11-27T14:24:36+00:00","url":""},{"id":"1.20.3-pre2","type":"snapshot","releaseTime":"2023-11-22T12:21:26+00:00","url":""},{"id":"1.20.3-pre1","type":"snapshot","releaseTime":"2023-11-20T15:40:14+00:00","url":""},{"id":"23w46a","type":"snapshot","releaseTime":"2023-11-16T14:11:33+00:00","url":""},{"id":"23w45a","type":"snapshot","releaseTime":"2023-11-08T13:59:58+00:00","url":""},{"id":"23w44a","type":"snapshot","releaseTime":"2023-11-01T12:30:52+00:00","url":""},{"id":"23w43b","type":"snapshot","releaseTime":"2023-10-26T13:46:16+00:00","url":""},{"id":"23w43a","type":"snapshot","releaseTime":"2023-10-25T13:34:37+00:00","url":""},{"id":"23w42a","type":"snapshot","releaseTime":"2023-10-18T11:37:28+00:00","url":""},{"id":"23w41a","type":"snapshot","releaseTime":"2023-10-11T12:32:46+00:00","url":""},{"id":"23w40a","type":"snapshot","releaseTime":"2023-10-04T12:48:53+00:00","url":""},{"id":"1.20.2","type":"release","releaseTime":"2023-09-20T09:02:57+00:00","url":""},{"id":"1.20.2-rc2","type":"snapshot","releaseTime":"2023-09-18T12:34:57+00:00","url":""},{"id":"1.20.2-rc1","type":"snapshot","releaseTime":"2023-09-15T13:10:30+00:00","url":""},{"id":"1.20.2-pre4","type":"snapshot","releaseTime":"2023-09-13T15:06:51+00:00","url":""},{"id":"1.20.2-pre3","type":"snapshot","releaseTime":"2023-09-12T12:15:08+00:00","url":""},{"id":"1.20.2-pre2","type":"snapshot","releaseTime":"2023-09-07T12:42:32+00:00","url":""},{"id":"1.20.2-pre1","type":"snapshot","releaseTime":"2023-09-05T12:06:20+00:00","url":""},{"id":"23w35a","type":"snapshot","releaseTime":"2023-08-30T11:24:35+00:00","url":""},{"id":"23w33a","type":"snapshot","releaseTime":"2023-08-17T11:39:08+00:00","url":""},{"id":"23w32a","type":"snapshot","releaseTime":"2023-08-09T12:14:25+00:00","url":""},{"id":"23w31a","type":"snapshot","releaseTime":"2023-08-01T10:03:13+00:00","url":""},{"id":"1.20.1","type":"release","releaseTime":"2023-06-12T13:25:51+00:00","url":""},{"id":"1.20.1-rc1","type":"snapshot","releaseTime":"2023-06-09T14:15:49+00:00","url":""},{"id":"1.20","type":"release","releaseTime":"2023-06-02T08:36:17+00:00","url":""},{"id":"1.20-rc1","type":"snapshot","releaseTime":"2023-05-31T12:33:33+00:00","url":""},{"id":"1.20-pre7","type":"snapshot","releaseTime":"2023-05-29T13:44:34+00:00","url":""},{"id":"1.20-pre6","type":"snapshot","releaseTime":"2023-05-25T12:22:00+00:00","url":""},{"id":"1.20-pre5","type":"snapshot","releaseTime":"2023-05-23T12:22:52+00:00","url":""},{"id":"1.20-pre4","type":"snapshot","releaseTime":"2023-05-19T13:13:45+00:00","url":""},{"id":"1.20-pre3","type":"snapshot","releaseTime":"2023-05-19T11:39:46+00:00","url":""},{"id":"1.20-pre2","type":"snapshot","releaseTime":"2023-05-16T11:34:54+00:00","url":""},{"id":"1.20-pre1","type":"snapshot","releaseTime":"2023-05-10T12:19:34+00:00","url":""},{"id":"23w18a","type":"snapshot","releaseTime":"2023-05-03T11:29:26+00:00","url":""},{"id":"23w17a","type":"snapshot","releaseTime":"2023-04-26T12:09:48+00:00","url":""},{"id":"23w16a","type":"snapshot","releaseTime":"2023-04-20T11:55:19+00:00","url":""},{"id":"23w14a","type":"snapshot","releaseTime":"2023-04-05T12:05:17+00:00","url":""},{"id":"23w13a_or_b","type":"snapshot","releaseTime":"2023-04-01T12:52:18+00:00","url":""},{"id":"23w13a","type":"snapshot","releaseTime":"2023-03-29T13:54:16+00:00","url":""},{"id":"23w12a","type":"snapshot","releaseTime":"2023-03-22T13:28:42+00:00","url":""},{"id":"1.19.4","type":"release","releaseTime":"2023-03-14T12:56:18+00:00","url":""},{"id":"1.19.4-rc3","type":"snapshot","releaseTime":"2023-03-13T10:03:11+00:00","url":""},{"id":"1.19.4-rc2","type":"snapshot","releaseTime":"2023-03-10T12:42:54+00:00","url":""},{"id":"1.19.4-rc1","type":"snapshot","releaseTime":"2023-03-09T14:35:50+00:00","url":""},{"id":"1.19.4-pre4","type":"snapshot","releaseTime":"2023-03-08T13:08:22+00:00","url":""},{"id":"1.19.4-pre3","type":"snapshot","releaseTime":"2023-03-01T14:11:05+00:00","url":""},{"id":"1.19.4-pre2","type":"snapshot","releaseTime":"2023-02-27T13:38:53+00:00","url":""},{"id":"1.19.4-pre1","type":"snapshot","releaseTime":"2023-02-22T16:00:34+00:00","url":""},{"id":"23w07a","type":"snapshot","releaseTime":"2023-02-15T14:32:29+00:00","url":""},{"id":"23w06a","type":"snapshot","releaseTime":"2023-02-08T15:00:04+00:00","url":""},{"id":"23w05a","type":"snapshot","releaseTime":"2023-02-01T14:20:33+00:00","url":""},{"id":"23w04a","type":"snapshot","releaseTime":"2023-01-24T15:19:06+00:00","url":""},{"id":"23w03a","type":"snapshot","releaseTime":"2023-01-18T13:10:31+00:00","url":""},{"id":"1.19.3","type":"release","releaseTime":"2022-12-07T08:17:18+00:00","url":""},{"id":"1.19.3-rc3","type":"snapshot","releaseTime":"2022-12-06T10:24:01+00:00","url":""},{"id":"1.19.3-rc2","type":"snapshot","releaseTime":"2022-12-05T13:21:34+00:00","url":""},{"id":"1.19.3-rc1","type":"snapshot","releaseTime":"2022-12-01T13:45:18+00:00","url":""},{"id":"1.19.3-pre3","type":"snapshot","releaseTime":"2022-11-29T14:28:08+00:00","url":""},{"id":"1.19.3-pre2","type":"snapshot","releaseTime":"2022-11-23T16:12:25+00:00","url":""},{"id":"1.19.3-pre1","type":"snapshot","releaseTime":"2022-11-22T13:59:37+00:00","url":""},{"id":"22w46a","type":"snapshot","releaseTime":"2022-11-16T13:32:50+00:00","url":""},{"id":"22w45a","type":"snapshot","releaseTime":"2022-11-09T14:30:16+00:00","url":""},{"id":"22w44a","type":"snapshot","releaseTime":"2022-11-02T13:15:43+00:00","url":""},{"id":"22w43a","type":"snapshot","releaseTime":"2022-10-26T11:55:59+00:00","url":""},{"id":"22w42a","type":"snapshot","releaseTime":"2022-10-19T09:34:22+00:00","url":""},{"id":"1.19.2","type":"release","releaseTime":"2022-08-05T11:57:05+00:00","url":""},{"id":"1.19.2-rc2","type":"snapshot","releaseTime":"2022-08-04T15:19:44+00:00","url":""},{"id":"1.19.2-rc1","type":"snapshot","releaseTime":"2022-08-04T10:07:26+00:00","url":""},{"id":"1.19.1","type":"release","releaseTime":"2022-07-27T09:25:33+00:00","url":""},{"id":"1.19.1-rc3","type":"snapshot","releaseTime":"2022-07-26T15:34:35+00:00","url":""},{"id":"1.19.1-rc2","type":"snapshot","releaseTime":"2022-07-21T16:25:50+00:00","url":""},{"id":"1.19.1-pre6","type":"snapshot","releaseTime":"2022-07-20T15:49:31+00:00","url":""},{"id":"1.19.1-pre5","type":"snapshot","releaseTime":"2022-07-15T11:51:44+00:00","url":""},{"id":"1.19.1-pre4","type":"snapshot","releaseTime":"2022-07-08T11:41:59+00:00","url":""},{"id":"1.19.1-pre3","type":"snapshot","releaseTime":"2022-07-06T14:50:46+00:00","url":""},{"id":"1.19.1-pre2","type":"snapshot","releaseTime":"2022-06-30T15:57:20+00:00","url":""},{"id":"1.19.1-rc1","type":"snapshot","releaseTime":"2022-06-23T16:32:41+00:00","url":""},{"id":"1.19.1-pre1","type":"snapshot","releaseTime":"2022-06-21T17:13:59+00:00","url":""},{"id":"22w24a","type":"snapshot","releaseTime":"2022-06-15T16:21:49+00:00","url":""},{"id":"1.19","type":"release","releaseTime":"2022-06-07T09:42:18+00:00","url":""},{"id":"1.19-rc2","type":"snapshot","releaseTime":"2022-06-03T11:47:25+00:00","url":""},{"id":"1.19-rc1","type":"snapshot","releaseTime":"2022-06-02T12:12:52+00:00","url":""},{"id":"1.19-pre5","type":"snapshot","releaseTime":"2022-06-01T10:56:23+00:00","url":""},{"id":"1.19-pre4","type":"snapshot","releaseTime":"2022-05-30T14:43:01+00:00","url":""},{"id":"1.19-pre3","type":"snapshot","releaseTime":"2022-05-25T09:56:47+00:00","url":""},{"id":"1.19-pre2","type":"snapshot","releaseTime":"2022-05-23T14:54:00+00:00","url":""},{"id":"1.19-pre1","type":"snapshot","releaseTime":"2022-05-18T13:51:54+00:00","url":""},{"id":"22w19a","type":"snapshot","releaseTime":"2022-05-12T15:36:11+00:00","url":""},{"id":"22w18a","type":"snapshot","releaseTime":"2022-05-04T14:41:35+00:00","url":""},{"id":"22w17a","type":"snapshot","releaseTime":"2022-04-27T15:54:15+00:00","url":""},{"id":"22w16b","type":"snapshot","releaseTime":"2022-04-20T17:25:32+00:00","url":""},{"id":"22w16a","type":"snapshot","releaseTime":"2022-04-20T14:37:07+00:00","url":""},{"id":"22w15a","type":"snapshot","releaseTime":"2022-04-13T15:41:17+00:00","url":""},{"id":"22w14a","type":"snapshot","releaseTime":"2022-04-06T13:37:12+00:00","url":""},{"id":"22w13oneblockatatime","type":"snapshot","releaseTime":"2022-04-01T11:56:58+00:00","url":""},{"id":"22w13a","type":"snapshot","releaseTime":"2022-03-31T14:53:25+00:00","url":""},{"id":"22w12a","type":"snapshot","releaseTime":"2022-03-24T16:15:02+00:00","url":""},{"id":"22w11a","type":"snapshot","releaseTime":"2022-03-16T15:55:38+00:00","url":""},{"id":"1.18.2","type":"release","releaseTime":"2022-02-28T10:42:45+00:00","url":""},{"id":"1.18.2-rc1","type":"snapshot","releaseTime":"2022-02-25T13:25:40+00:00","url":""},{"id":"1.18.2-pre3","type":"snapshot","releaseTime":"2022-02-23T15:23:12+00:00","url":""},{"id":"1.18.2-pre2","type":"snapshot","releaseTime":"2022-02-21T15:26:19+00:00","url":""},{"id":"1.18.2-pre1","type":"snapshot","releaseTime":"2022-02-18T16:00:32+00:00","url":""},{"id":"22w07a","type":"snapshot","releaseTime":"2022-02-16T16:13:58+00:00","url":""},{"id":"22w06a","type":"snapshot","releaseTime":"2022-02-09T16:47:48+00:00","url":""},{"id":"22w05a","type":"snapshot","releaseTime":"2022-02-02T16:08:39+00:00","url":""},{"id":"22w03a","type":"snapshot","releaseTime":"2022-01-19T16:04:59+00:00","url":""},{"id":"1.18.1","type":"release","releaseTime":"2021-12-10T08:23:00+00:00","url":""},{"id":"1.18.1-rc3","type":"snapshot","releaseTime":"2021-12-10T03:36:38+00:00","url":""},{"id":"1.18.1-rc2","type":"snapshot","releaseTime":"2021-12-08T12:29:36+00:00","url":""},{"id":"1.18.1-rc1","type":"snapshot","releaseTime":"2021-12-07T15:52:47+00:00","url":""},{"id":"1.18.1-pre1","type":"snapshot","releaseTime":"2021-12-03T13:45:38+00:00","url":""},{"id":"1.18","type":"release","releaseTime":"2021-11-30T09:16:29+00:00","url":""},{"id":"1.18-rc4","type":"snapshot","releaseTime":"2021-11-29T13:43:42+00:00","url":""},{"id":"1.18-rc3","type":"snapshot","releaseTime":"2021-11-26T15:51:56+00:00","url":""},{"id":"1.18-rc2","type":"snapshot","releaseTime":"2021-11-26T10:02:04+00:00","url":""},{"id":"1.18-rc1","type":"snapshot","releaseTime":"2021-11-25T14:28:49+00:00","url":""},{"id":"1.18-pre8","type":"snapshot","releaseTime":"2021-11-24T14:57:32+00:00","url":""},{"id":"1.18-pre7","type":"snapshot","releaseTime":"2021-11-23T16:37:41+00:00","url":""},{"id":"1.18-pre6","type":"snapshot","releaseTime":"2021-11-22T17:09:05+00:00","url":""},{"id":"1.18-pre5","type":"snapshot","releaseTime":"2021-11-19T15:47:09+00:00","url":""},{"id":"1.18-pre4","type":"snapshot","releaseTime":"2021-11-17T18:07:56+00:00","url":""},{"id":"1.18-pre3","type":"snapshot","releaseTime":"2021-11-17T16:04:25+00:00","url":""},{"id":"1.18-pre2","type":"snapshot","releaseTime":"2021-11-16T17:04:48+00:00","url":""},{"id":"1.18-pre1","type":"snapshot","releaseTime":"2021-11-11T16:14:06+00:00","url":""},{"id":"21w44a","type":"snapshot","releaseTime":"2021-11-03T16:14:34+00:00","url":""},{"id":"21w43a","type":"snapshot","releaseTime":"2021-10-27T14:38:55+00:00","url":""},{"id":"21w42a","type":"snapshot","releaseTime":"2021-10-20T12:41:25+00:00","url":""},{"id":"21w41a","type":"snapshot","releaseTime":"2021-10-13T15:23:23+00:00","url":""},{"id":"21w40a","type":"snapshot","releaseTime":"2021-10-07T11:17:50+00:00","url":""},{"id":"21w39a","type":"snapshot","releaseTime":"2021-09-29T16:27:05+00:00","url":""},{"id":"21w38a","type":"snapshot","releaseTime":"2021-09-23T14:36:06+00:00","url":""},{"id":"21w37a","type":"snapshot","releaseTime":"2021-09-15T16:04:30+00:00","url":""},{"id":"1.17.1","type":"release","releaseTime":"2021-07-06T12:01:34+00:00","url":""},{"id":"1.17.1-rc2","type":"snapshot","releaseTime":"2021-07-05T12:58:01+00:00","url":""},{"id":"1.17.1-rc1","type":"snapshot","releaseTime":"2021-07-01T15:23:37+00:00","url":""},{"id":"1.17.1-pre3","type":"snapshot","releaseTime":"2021-06-30T15:43:16+00:00","url":""},{"id":"1.17.1-pre2","type":"snapshot","releaseTime":"2021-06-29T15:14:12+00:00","url":""},{"id":"1.17.1-pre1","type":"snapshot","releaseTime":"2021-06-18T12:24:40+00:00","url":""},{"id":"1.17","type":"release","releaseTime":"2021-06-08T11:00:40+00:00","url":""},{"id":"1.17-rc2","type":"snapshot","releaseTime":"2021-06-07T11:46:28+00:00","url":""},{"id":"1.17-rc1","type":"snapshot","releaseTime":"2021-06-04T13:24:48+00:00","url":""},{"id":"1.17-pre5","type":"snapshot","releaseTime":"2021-06-03T17:01:28+00:00","url":""},{"id":"1.17-pre4","type":"snapshot","releaseTime":"2021-06-02T16:15:43+00:00","url":""},{"id":"1.17-pre3","type":"snapshot","releaseTime":"2021-06-01T15:43:46+00:00","url":""},{"id":"1.17-pre2","type":"snapshot","releaseTime":"2021-05-31T15:54:05+00:00","url":""},{"id":"1.17-pre1","type":"snapshot","releaseTime":"2021-05-27T09:39:21+00:00","url":""},{"id":"21w20a","type":"snapshot","releaseTime":"2021-05-19T15:22:02+00:00","url":""},{"id":"21w19a","type":"snapshot","releaseTime":"2021-05-12T11:19:15+00:00","url":""},{"id":"21w18a","type":"snapshot","releaseTime":"2021-05-05T15:24:35+00:00","url":""},{"id":"21w17a","type":"snapshot","releaseTime":"2021-04-28T13:54:05+00:00","url":""},{"id":"21w16a","type":"snapshot","releaseTime":"2021-04-21T16:41:14+00:00","url":""},{"id":"21w15a","type":"snapshot","releaseTime":"2021-04-14T13:41:34+00:00","url":""},{"id":"21w14a","type":"snapshot","releaseTime":"2021-04-07T14:04:09+00:00","url":""},{"id":"21w13a","type":"snapshot","releaseTime":"2021-03-31T16:17:46+00:00","url":""},{"id":"21w11a","type":"snapshot","releaseTime":"2021-03-17T15:05:50+00:00","url":""},{"id":"21w10a","type":"snapshot","releaseTime":"2021-03-10T15:24:38+00:00","url":""},{"id":"21w08b","type":"snapshot","releaseTime":"2021-02-25T11:46:34+00:00","url":""},{"id":"21w08a","type":"snapshot","releaseTime":"2021-02-24T14:38:51+00:00","url":""},{"id":"21w07a","type":"snapshot","releaseTime":"2021-02-17T16:35:40+00:00","url":""},{"id":"21w06a","type":"snapshot","releaseTime":"2021-02-10T17:13:54+00:00","url":""},{"id":"21w05b","type":"snapshot","releaseTime":"2021-02-04T15:09:29+00:00","url":""},{"id":"21w05a","type":"snapshot","releaseTime":"2021-02-03T15:56:54+00:00","url":""},{"id":"21w03a","type":"snapshot","releaseTime":"2021-01-20T14:56:29+00:00","url":""},{"id":"1.16.5","type":"release","releaseTime":"2021-01-14T16:05:32+00:00","url":""},{"id":"1.16.5-rc1","type":"snapshot","releaseTime":"2021-01-13T15:58:55+00:00","url":""},{"id":"20w51a","type":"snapshot","releaseTime":"2020-12-16T16:27:57+00:00","url":""},{"id":"20w49a","type":"snapshot","releaseTime":"2020-12-02T16:47:20+00:00","url":""},{"id":"20w48a","type":"snapshot","releaseTime":"2020-11-25T15:42:24+00:00","url":""},{"id":"20w46a","type":"snapshot","releaseTime":"2020-11-11T15:30:32+00:00","url":""},{"id":"20w45a","type":"snapshot","releaseTime":"2020-11-04T16:42:00+00:00","url":""},{"id":"1.16.4","type":"release","releaseTime":"2020-10-29T15:49:37+00:00","url":""},{"id":"1.16.4-rc1","type":"snapshot","releaseTime":"2020-10-27T16:31:08+00:00","url":""},{"id":"1.16.4-pre2","type":"snapshot","releaseTime":"2020-10-22T15:32:17+00:00","url":""},{"id":"1.16.4-pre1","type":"snapshot","releaseTime":"2020-10-13T14:36:07+00:00","url":""},{"id":"1.16.3","type":"release","releaseTime":"2020-09-10T13:42:37+00:00","url":""},{"id":"1.16.3-rc1","type":"snapshot","releaseTime":"2020-09-07T12:34:06+00:00","url":""},{"id":"1.16.2","type":"release","releaseTime":"2020-08-11T10:13:46+00:00","url":""},{"id":"1.16.2-rc2","type":"snapshot","releaseTime":"2020-08-10T11:43:36+00:00","url":""},{"id":"1.16.2-rc1","type":"snapshot","releaseTime":"2020-08-07T14:35:39+00:00","url":""},{"id":"1.16.2-pre3","type":"snapshot","releaseTime":"2020-08-06T16:44:52+00:00","url":""},{"id":"1.16.2-pre2","type":"snapshot","releaseTime":"2020-08-05T15:30:50+00:00","url":""},{"id":"1.16.2-pre1","type":"snapshot","releaseTime":"2020-07-29T13:19:05+00:00","url":""},{"id":"20w30a","type":"snapshot","releaseTime":"2020-07-22T15:05:15+00:00","url":""},{"id":"20w29a","type":"snapshot","releaseTime":"2020-07-15T14:13:47+00:00","url":""},{"id":"20w28a","type":"snapshot","releaseTime":"2020-07-08T15:10:40+00:00","url":""},{"id":"20w27a","type":"snapshot","releaseTime":"2020-07-01T15:07:35+00:00","url":""},{"id":"1.16.1","type":"release","releaseTime":"2020-06-24T10:31:40+00:00","url":""},{"id":"1.16","type":"release","releaseTime":"2020-06-23T16:20:52+00:00","url":""},{"id":"1.16-rc1","type":"snapshot","releaseTime":"2020-06-18T12:49:28+00:00","url":""},{"id":"1.16-pre8","type":"snapshot","releaseTime":"2020-06-17T14:45:23+00:00","url":""},{"id":"1.16-pre7","type":"snapshot","releaseTime":"2020-06-16T15:31:35+00:00","url":""},{"id":"1.16-pre6","type":"snapshot","releaseTime":"2020-06-15T16:57:57+00:00","url":""},{"id":"1.16-pre5","type":"snapshot","releaseTime":"2020-06-12T14:33:59+00:00","url":""},{"id":"1.16-pre4","type":"snapshot","releaseTime":"2020-06-11T15:45:55+00:00","url":""},{"id":"1.16-pre3","type":"snapshot","releaseTime":"2020-06-10T14:57:43+00:00","url":""},{"id":"1.16-pre2","type":"snapshot","releaseTime":"2020-06-05T10:47:59+00:00","url":""},{"id":"1.16-pre1","type":"snapshot","releaseTime":"2020-06-04T18:17:51+00:00","url":""},{"id":"20w22a","type":"snapshot","releaseTime":"2020-05-29T11:25:02+00:00","url":""},{"id":"20w21a","type":"snapshot","releaseTime":"2020-05-20T12:07:18+00:00","url":""},{"id":"20w20b","type":"snapshot","releaseTime":"2020-05-14T08:16:26+00:00","url":""},{"id":"20w20a","type":"snapshot","releaseTime":"2020-05-13T15:11:43+00:00","url":""},{"id":"20w19a","type":"snapshot","releaseTime":"2020-05-06T16:23:24+00:00","url":""},{"id":"20w18a","type":"snapshot","releaseTime":"2020-04-29T15:16:34+00:00","url":""},{"id":"20w17a","type":"snapshot","releaseTime":"2020-04-22T13:47:50+00:00","url":""},{"id":"20w16a","type":"snapshot","releaseTime":"2020-04-15T14:13:01+00:00","url":""},{"id":"20w15a","type":"snapshot","releaseTime":"2020-04-08T12:29:24+00:00","url":""},{"id":"20w14a","type":"snapshot","releaseTime":"2020-04-02T14:28:06+00:00","url":""},{"id":"20w14infinite","type":"snapshot","releaseTime":"2020-04-01T12:47:08+00:00","url":""},{"id":"20w13b","type":"snapshot","releaseTime":"2020-03-26T13:00:34+00:00","url":""},{"id":"20w13a","type":"snapshot","releaseTime":"2020-03-25T17:05:33+00:00","url":""},{"id":"20w12a","type":"snapshot","releaseTime":"2020-03-18T16:42:06+00:00","url":""},{"id":"20w11a","type":"snapshot","releaseTime":"2020-03-11T16:28:27+00:00","url":""},{"id":"20w10a","type":"snapshot","releaseTime":"2020-03-04T16:21:41+00:00","url":""},{"id":"20w09a","type":"snapshot","releaseTime":"2020-02-26T16:43:08+00:00","url":""},{"id":"20w08a","type":"snapshot","releaseTime":"2020-02-19T13:30:09+00:00","url":""},{"id":"20w07a","type":"snapshot","releaseTime":"2020-02-14T13:20:49+00:00","url":""},{"id":"20w06a","type":"snapshot","releaseTime":"2020-02-05T16:05:22+00:00","url":""},{"id":"1.15.2","type":"release","releaseTime":"2020-01-17T10:03:52+00:00","url":""},{"id":"1.15.2-pre2","type":"snapshot","releaseTime":"2020-01-16T12:35:57+00:00","url":""},{"id":"1.15.2-pre1","type":"snapshot","releaseTime":"2020-01-14T16:19:31+00:00","url":""},{"id":"1.15.1","type":"release","releaseTime":"2019-12-16T10:29:47+00:00","url":""},{"id":"1.15.1-pre1","type":"snapshot","releaseTime":"2019-12-12T14:02:30+00:00","url":""},{"id":"1.15","type":"release","releaseTime":"2019-12-09T13:13:38+00:00","url":""},{"id":"1.15-pre7","type":"snapshot","releaseTime":"2019-12-09T12:14:11+00:00","url":""},{"id":"1.15-pre6","type":"snapshot","releaseTime":"2019-12-06T12:04:30+00:00","url":""},{"id":"1.15-pre5","type":"snapshot","releaseTime":"2019-12-05T13:20:00+00:00","url":""},{"id":"1.15-pre4","type":"snapshot","releaseTime":"2019-12-03T12:24:24+00:00","url":""},{"id":"1.15-pre3","type":"snapshot","releaseTime":"2019-11-28T17:17:50+00:00","url":""},{"id":"1.15-pre2","type":"snapshot","releaseTime":"2019-11-25T18:09:38+00:00","url":""},{"id":"1.15-pre1","type":"snapshot","releaseTime":"2019-11-21T17:01:17+00:00","url":""},{"id":"19w46b","type":"snapshot","releaseTime":"2019-11-14T13:29:24+00:00","url":""},{"id":"19w46a","type":"snapshot","releaseTime":"2019-11-13T16:37:46+00:00","url":""},{"id":"19w45b","type":"snapshot","releaseTime":"2019-11-08T12:42:44+00:00","url":""},{"id":"19w45a","type":"snapshot","releaseTime":"2019-11-07T16:19:20+00:00","url":""},{"id":"19w44a","type":"snapshot","releaseTime":"2019-10-30T15:31:44+00:00","url":""},{"id":"19w42a","type":"snapshot","releaseTime":"2019-10-16T15:30:39+00:00","url":""},{"id":"19w41a","type":"snapshot","releaseTime":"2019-10-09T15:21:35+00:00","url":""},{"id":"19w40a","type":"snapshot","releaseTime":"2019-10-02T13:40:26+00:00","url":""},{"id":"19w39a","type":"snapshot","releaseTime":"2019-09-27T10:13:33+00:00","url":""},{"id":"19w38b","type":"snapshot","releaseTime":"2019-09-18T14:59:13+00:00","url":""},{"id":"19w38a","type":"snapshot","releaseTime":"2019-09-18T10:03:22+00:00","url":""},{"id":"19w37a","type":"snapshot","releaseTime":"2019-09-11T11:46:44+00:00","url":""},{"id":"19w36a","type":"snapshot","releaseTime":"2019-09-04T11:19:34+00:00","url":""},{"id":"19w35a","type":"snapshot","releaseTime":"2019-08-28T15:01:44+00:00","url":""},{"id":"19w34a","type":"snapshot","releaseTime":"2019-08-22T12:06:21+00:00","url":""},{"id":"1.14.4","type":"release","releaseTime":"2019-07-19T09:25:47+00:00","url":""},{"id":"1.14.4-pre7","type":"snapshot","releaseTime":"2019-07-18T11:32:36+00:00","url":""},{"id":"1.14.4-pre6","type":"snapshot","releaseTime":"2019-07-15T12:39:49+00:00","url":""},{"id":"1.14.4-pre5","type":"snapshot","releaseTime":"2019-07-11T10:52:33+00:00","url":""},{"id":"1.14.4-pre4","type":"snapshot","releaseTime":"2019-07-10T12:53:29+00:00","url":""},{"id":"1.14.4-pre3","type":"snapshot","releaseTime":"2019-07-08T11:21:42+00:00","url":""},{"id":"1.14.4-pre2","type":"snapshot","releaseTime":"2019-07-04T14:41:05+00:00","url":""},{"id":"1.14.4-pre1","type":"snapshot","releaseTime":"2019-07-03T13:01:01+00:00","url":""},{"id":"1.14.3","type":"release","releaseTime":"2019-06-24T12:52:52+00:00","url":""},{"id":"1.14.3-pre4","type":"snapshot","releaseTime":"2019-06-19T11:44:29+00:00","url":""},{"id":"1.14.3-pre3","type":"snapshot","releaseTime":"2019-06-14T08:03:33+00:00","url":""},{"id":"1.14.3-pre2","type":"snapshot","releaseTime":"2019-06-07T09:11:29+00:00","url":""},{"id":"1.14.3-pre1","type":"snapshot","releaseTime":"2019-06-03T14:34:20+00:00","url":""},{"id":"1.14.2","type":"release","releaseTime":"2019-05-27T11:48:25+00:00","url":""},{"id":"1.14.2 Pre-Release 4","type":"snapshot","releaseTime":"2019-05-27T07:21:11+00:00","url":""},{"id":"1.14.2 Pre-Release 3","type":"snapshot","releaseTime":"2019-05-22T13:12:51+00:00","url":""},{"id":"1.14.2 Pre-Release 2","type":"snapshot","releaseTime":"2019-05-17T12:21:03+00:00","url":""},{"id":"1.14.2 Pre-Release 1","type":"snapshot","releaseTime":"2019-05-16T15:40:25+00:00","url":""},{"id":"1.14.1","type":"release","releaseTime":"2019-05-13T11:10:12+00:00","url":""},{"id":"1.14.1 Pre-Release 2","type":"snapshot","releaseTime":"2019-05-09T14:01:04+00:00","url":""},{"id":"1.14.1 Pre-Release 1","type":"snapshot","releaseTime":"2019-05-07T14:44:42+00:00","url":""},{"id":"1.14","type":"release","releaseTime":"2019-04-23T14:52:44+00:00","url":""},{"id":"1.14 Pre-Release 5","type":"snapshot","releaseTime":"2019-04-18T11:05:19+00:00","url":""},{"id":"1.14 Pre-Release 4","type":"snapshot","releaseTime":"2019-04-17T15:31:12+00:00","url":""},{"id":"1.14 Pre-Release 3","type":"snapshot","releaseTime":"2019-04-16T13:57:10+00:00","url":""},{"id":"1.14 Pre-Release 2","type":"snapshot","releaseTime":"2019-04-12T11:38:53+00:00","url":""},{"id":"1.14 Pre-Release 1","type":"snapshot","releaseTime":"2019-04-10T14:24:16+00:00","url":""},{"id":"19w14b","type":"snapshot","releaseTime":"2019-04-05T10:33:58+00:00","url":""},{"id":"19w14a","type":"snapshot","releaseTime":"2019-04-03T13:45:00+00:00","url":""},{"id":"3D Shareware v1.34","type":"snapshot","releaseTime":"2019-04-01T11:18:08+00:00","url":""},{"id":"19w13b","type":"snapshot","releaseTime":"2019-03-29T16:53:22+00:00","url":""},{"id":"19w13a","type":"snapshot","releaseTime":"2019-03-27T15:15:31+00:00","url":""},{"id":"19w12b","type":"snapshot","releaseTime":"2019-03-21T15:20:01+00:00","url":""},{"id":"19w12a","type":"snapshot","releaseTime":"2019-03-20T16:47:34+00:00","url":""},{"id":"19w11b","type":"snapshot","releaseTime":"2019-03-14T14:26:23+00:00","url":""},{"id":"19w11a","type":"snapshot","releaseTime":"2019-03-13T13:59:29+00:00","url":""},{"id":"19w09a","type":"snapshot","releaseTime":"2019-02-27T14:44:30+00:00","url":""},{"id":"19w08b","type":"snapshot","releaseTime":"2019-02-21T13:38:09+00:00","url":""},{"id":"19w08a","type":"snapshot","releaseTime":"2019-02-20T14:56:58+00:00","url":""},{"id":"19w07a","type":"snapshot","releaseTime":"2019-02-13T16:12:08+00:00","url":""},{"id":"19w06a","type":"snapshot","releaseTime":"2019-02-06T16:24:13+00:00","url":""},{"id":"19w05a","type":"snapshot","releaseTime":"2019-01-30T15:16:49+00:00","url":""},{"id":"19w04b","type":"snapshot","releaseTime":"2019-01-25T12:20:15+00:00","url":""},{"id":"19w04a","type":"snapshot","releaseTime":"2019-01-24T15:31:52+00:00","url":""},{"id":"19w03c","type":"snapshot","releaseTime":"2019-01-18T11:27:13+00:00","url":""},{"id":"19w03b","type":"snapshot","releaseTime":"2019-01-17T16:43:27+00:00","url":""},{"id":"19w03a","type":"snapshot","releaseTime":"2019-01-16T16:45:02+00:00","url":""},{"id":"19w02a","type":"snapshot","releaseTime":"2019-01-09T15:52:07+00:00","url":""},{"id":"18w50a","type":"snapshot","releaseTime":"2018-12-12T14:58:13+00:00","url":""},{"id":"18w49a","type":"snapshot","releaseTime":"2018-12-05T12:24:30+00:00","url":""},{"id":"18w48b","type":"snapshot","releaseTime":"2018-11-30T10:37:31+00:00","url":""},{"id":"18w48a","type":"snapshot","releaseTime":"2018-11-29T13:11:38+00:00","url":""},{"id":"18w47b","type":"snapshot","releaseTime":"2018-11-23T10:46:41+00:00","url":""},{"id":"18w47a","type":"snapshot","releaseTime":"2018-11-21T15:45:22+00:00","url":""},{"id":"18w46a","type":"snapshot","releaseTime":"2018-11-15T13:43:14+00:00","url":""},{"id":"18w45a","type":"snapshot","releaseTime":"2018-11-07T14:40:06+00:00","url":""},{"id":"18w44a","type":"snapshot","releaseTime":"2018-10-31T15:29:16+00:00","url":""},{"id":"18w43c","type":"snapshot","releaseTime":"2018-10-26T08:40:46+00:00","url":""},{"id":"18w43b","type":"snapshot","releaseTime":"2018-10-24T15:02:30+00:00","url":""},{"id":"18w43a","type":"snapshot","releaseTime":"2018-10-24T10:52:16+00:00","url":""},{"id":"1.13.2","type":"release","releaseTime":"2018-10-22T11:41:07+00:00","url":""},{"id":"1.13.2-pre2","type":"snapshot","releaseTime":"2018-10-18T14:46:12+00:00","url":""},{"id":"1.13.2-pre1","type":"snapshot","releaseTime":"2018-10-16T13:40:58+00:00","url":""},{"id":"1.13.1","type":"release","releaseTime":"2018-08-22T14:03:42+00:00","url":""},{"id":"1.13.1-pre2","type":"snapshot","releaseTime":"2018-08-20T13:52:09+00:00","url":""},{"id":"1.13.1-pre1","type":"snapshot","releaseTime":"2018-08-16T13:08:44+00:00","url":""},{"id":"18w33a","type":"snapshot","releaseTime":"2018-08-15T14:28:56+00:00","url":""},{"id":"18w32a","type":"snapshot","releaseTime":"2018-08-08T13:16:57+00:00","url":""},{"id":"18w31a","type":"snapshot","releaseTime":"2018-08-01T12:54:44+00:00","url":""},{"id":"18w30b","type":"snapshot","releaseTime":"2018-07-26T16:06:57+00:00","url":""},{"id":"18w30a","type":"snapshot","releaseTime":"2018-07-25T14:29:31+00:00","url":""},{"id":"1.13","type":"release","releaseTime":"2018-07-18T15:11:46+00:00","url":""},{"id":"1.13-pre10","type":"snapshot","releaseTime":"2018-07-17T14:48:06+00:00","url":""},{"id":"1.13-pre9","type":"snapshot","releaseTime":"2018-07-16T14:17:42+00:00","url":""},{"id":"1.13-pre8","type":"snapshot","releaseTime":"2018-07-13T11:45:00+00:00","url":""},{"id":"1.13-pre7","type":"snapshot","releaseTime":"2018-07-10T14:21:42+00:00","url":""},{"id":"1.13-pre6","type":"snapshot","releaseTime":"2018-07-04T12:36:00+00:00","url":""},{"id":"1.13-pre5","type":"snapshot","releaseTime":"2018-06-28T13:58:53+00:00","url":""},{"id":"1.13-pre4","type":"snapshot","releaseTime":"2018-06-26T13:00:55+00:00","url":""},{"id":"1.13-pre3","type":"snapshot","releaseTime":"2018-06-21T12:57:11+00:00","url":""},{"id":"1.13-pre2","type":"snapshot","releaseTime":"2018-06-15T09:20:00+00:00","url":""},{"id":"1.13-pre1","type":"snapshot","releaseTime":"2018-06-04T15:17:34+00:00","url":""},{"id":"18w22c","type":"snapshot","releaseTime":"2018-05-31T13:53:15+00:00","url":""},{"id":"18w22b","type":"snapshot","releaseTime":"2018-05-30T13:48:58+00:00","url":""},{"id":"18w22a","type":"snapshot","releaseTime":"2018-05-29T13:23:55+00:00","url":""},{"id":"18w21b","type":"snapshot","releaseTime":"2018-05-25T10:09:09+00:00","url":""},{"id":"18w21a","type":"snapshot","releaseTime":"2018-05-23T13:11:49+00:00","url":""},{"id":"18w20c","type":"snapshot","releaseTime":"2018-05-17T14:06:56+00:00","url":""},{"id":"18w20b","type":"snapshot","releaseTime":"2018-05-16T14:35:35+00:00","url":""},{"id":"18w20a","type":"snapshot","releaseTime":"2018-05-15T14:02:25+00:00","url":""},{"id":"18w19b","type":"snapshot","releaseTime":"2018-05-09T10:00:51+00:00","url":""},{"id":"18w19a","type":"snapshot","releaseTime":"2018-05-08T13:05:19+00:00","url":""},{"id":"18w16a","type":"snapshot","releaseTime":"2018-04-19T14:46:35+00:00","url":""},{"id":"18w15a","type":"snapshot","releaseTime":"2018-04-11T14:54:22+00:00","url":""},{"id":"18w14b","type":"snapshot","releaseTime":"2018-04-05T14:44:02+00:00","url":""},{"id":"18w14a","type":"snapshot","releaseTime":"2018-04-04T14:36:14+00:00","url":""},{"id":"18w11a","type":"snapshot","releaseTime":"2018-03-13T15:10:59+00:00","url":""},{"id":"18w10d","type":"snapshot","releaseTime":"2018-03-09T15:19:12+00:00","url":""},{"id":"18w10c","type":"snapshot","releaseTime":"2018-03-08T15:29:23+00:00","url":""},{"id":"18w10b","type":"snapshot","releaseTime":"2018-03-07T15:56:01+00:00","url":""},{"id":"18w10a","type":"snapshot","releaseTime":"2018-03-06T15:54:24+00:00","url":""},{"id":"18w09a","type":"snapshot","releaseTime":"2018-03-01T14:15:10+00:00","url":""},{"id":"18w08b","type":"snapshot","releaseTime":"2018-02-22T15:44:49+00:00","url":""},{"id":"18w08a","type":"snapshot","releaseTime":"2018-02-21T14:59:00+00:00","url":""},{"id":"18w07c","type":"snapshot","releaseTime":"2018-02-16T13:23:32+00:00","url":""},{"id":"18w07b","type":"snapshot","releaseTime":"2018-02-15T14:28:42+00:00","url":""},{"id":"18w07a","type":"snapshot","releaseTime":"2018-02-14T17:34:13+00:00","url":""},{"id":"18w06a","type":"snapshot","releaseTime":"2018-02-09T12:09:55+00:00","url":""},{"id":"18w05a","type":"snapshot","releaseTime":"2018-01-31T13:32:09+00:00","url":""},{"id":"18w03b","type":"snapshot","releaseTime":"2018-01-17T15:09:14+00:00","url":""},{"id":"18w03a","type":"snapshot","releaseTime":"2018-01-17T14:25:24+00:00","url":""},{"id":"18w02a","type":"snapshot","releaseTime":"2018-01-10T11:54:55+00:00","url":""},{"id":"18w01a","type":"snapshot","releaseTime":"2018-01-03T13:29:30+00:00","url":""},{"id":"17w50a","type":"snapshot","releaseTime":"2017-12-11T15:28:08+00:00","url":""},{"id":"17w49b","type":"snapshot","releaseTime":"2017-12-07T15:29:54+00:00","url":""},{"id":"17w49a","type":"snapshot","releaseTime":"2017-12-06T14:24:30+00:00","url":""},{"id":"17w48a","type":"snapshot","releaseTime":"2017-11-27T15:36:33+00:00","url":""},{"id":"17w47b","type":"snapshot","releaseTime":"2017-11-23T15:30:12+00:00","url":""},{"id":"17w47a","type":"snapshot","releaseTime":"2017-11-22T12:40:05+00:00","url":""},{"id":"17w46a","type":"snapshot","releaseTime":"2017-11-15T15:21:55+00:00","url":""},{"id":"17w45b","type":"snapshot","releaseTime":"2017-11-10T10:07:02+00:00","url":""},{"id":"17w45a","type":"snapshot","releaseTime":"2017-11-08T15:48:00+00:00","url":""},{"id":"17w43b","type":"snapshot","releaseTime":"2017-10-26T13:36:22+00:00","url":""},{"id":"17w43a","type":"snapshot","releaseTime":"2017-10-25T14:43:50+00:00","url":""},{"id":"1.12.2","type":"release","releaseTime":"2017-09-18T08:39:46+00:00","url":""},{"id":"1.12.2-pre2","type":"snapshot","releaseTime":"2017-09-15T08:21:17+00:00","url":""},{"id":"1.12.2-pre1","type":"snapshot","releaseTime":"2017-09-13T13:33:31+00:00","url":""},{"id":"1.12.1","type":"release","releaseTime":"2017-08-03T12:40:39+00:00","url":""},{"id":"1.12.1-pre1","type":"snapshot","releaseTime":"2017-08-02T10:53:55+00:00","url":""},{"id":"17w31a","type":"snapshot","releaseTime":"2017-08-01T09:41:23+00:00","url":""},{"id":"1.12","type":"release","releaseTime":"2017-06-02T13:50:27+00:00","url":""},{"id":"1.12-pre7","type":"snapshot","releaseTime":"2017-05-31T10:56:41+00:00","url":""},{"id":"1.12-pre6","type":"snapshot","releaseTime":"2017-05-29T11:45:12+00:00","url":""},{"id":"1.12-pre5","type":"snapshot","releaseTime":"2017-05-19T07:43:28+00:00","url":""},{"id":"1.12-pre4","type":"snapshot","releaseTime":"2017-05-18T12:28:16+00:00","url":""},{"id":"1.12-pre3","type":"snapshot","releaseTime":"2017-05-17T14:09:18+00:00","url":""},{"id":"1.12-pre2","type":"snapshot","releaseTime":"2017-05-11T12:11:12+00:00","url":""},{"id":"1.12-pre1","type":"snapshot","releaseTime":"2017-05-10T11:37:17+00:00","url":""},{"id":"17w18b","type":"snapshot","releaseTime":"2017-05-04T13:40:22+00:00","url":""},{"id":"17w18a","type":"snapshot","releaseTime":"2017-05-03T14:50:23+00:00","url":""},{"id":"17w17b","type":"snapshot","releaseTime":"2017-04-27T13:24:23+00:00","url":""},{"id":"17w17a","type":"snapshot","releaseTime":"2017-04-26T13:48:23+00:00","url":""},{"id":"17w16b","type":"snapshot","releaseTime":"2017-04-21T12:02:59+00:00","url":""},{"id":"17w16a","type":"snapshot","releaseTime":"2017-04-20T13:58:35+00:00","url":""},{"id":"17w15a","type":"snapshot","releaseTime":"2017-04-12T09:30:50+00:00","url":""},{"id":"17w14a","type":"snapshot","releaseTime":"2017-04-05T13:58:01+00:00","url":""},{"id":"17w13b","type":"snapshot","releaseTime":"2017-03-31T11:06:35+00:00","url":""},{"id":"17w13a","type":"snapshot","releaseTime":"2017-03-30T09:32:19+00:00","url":""},{"id":"17w06a","type":"snapshot","releaseTime":"2017-02-08T13:16:29+00:00","url":""},{"id":"1.11.2","type":"release","releaseTime":"2016-12-21T09:29:12+00:00","url":""},{"id":"1.11.1","type":"release","releaseTime":"2016-12-20T14:05:34+00:00","url":""},{"id":"16w50a","type":"snapshot","releaseTime":"2016-12-15T14:38:52+00:00","url":""},{"id":"1.11","type":"release","releaseTime":"2016-11-14T14:34:40+00:00","url":""},{"id":"1.11-pre1","type":"snapshot","releaseTime":"2016-11-08T13:42:50+00:00","url":""},{"id":"16w44a","type":"snapshot","releaseTime":"2016-11-03T14:17:11+00:00","url":""},{"id":"16w43a","type":"snapshot","releaseTime":"2016-10-27T09:00:51+00:00","url":""},{"id":"16w42a","type":"snapshot","releaseTime":"2016-10-19T11:17:47+00:00","url":""},{"id":"16w41a","type":"snapshot","releaseTime":"2016-10-13T14:28:35+00:00","url":""},{"id":"16w40a","type":"snapshot","releaseTime":"2016-10-06T13:57:59+00:00","url":""},{"id":"16w39c","type":"snapshot","releaseTime":"2016-09-30T14:11:48+00:00","url":""},{"id":"16w39b","type":"snapshot","releaseTime":"2016-09-29T14:39:39+00:00","url":""},{"id":"16w39a","type":"snapshot","releaseTime":"2016-09-28T13:32:06+00:00","url":""},{"id":"16w38a","type":"snapshot","releaseTime":"2016-09-20T12:40:49+00:00","url":""},{"id":"16w36a","type":"snapshot","releaseTime":"2016-09-08T14:55:10+00:00","url":""},{"id":"16w35a","type":"snapshot","releaseTime":"2016-09-01T13:13:38+00:00","url":""},{"id":"16w33a","type":"snapshot","releaseTime":"2016-08-17T12:48:57+00:00","url":""},{"id":"16w32b","type":"snapshot","releaseTime":"2016-08-11T14:34:29+00:00","url":""},{"id":"16w32a","type":"snapshot","releaseTime":"2016-08-10T12:30:10+00:00","url":""},{"id":"1.10.2","type":"release","releaseTime":"2016-06-23T09:17:32+00:00","url":""},{"id":"1.10.1","type":"release","releaseTime":"2016-06-22T10:13:22+00:00","url":""},{"id":"1.10","type":"release","releaseTime":"2016-06-08T13:06:18+00:00","url":""},{"id":"1.10-pre2","type":"snapshot","releaseTime":"2016-06-07T14:56:34+00:00","url":""},{"id":"1.10-pre1","type":"snapshot","releaseTime":"2016-06-02T14:45:16+00:00","url":""},{"id":"16w21b","type":"snapshot","releaseTime":"2016-05-26T12:47:22+00:00","url":""},{"id":"16w21a","type":"snapshot","releaseTime":"2016-05-25T13:12:09+00:00","url":""},{"id":"16w20a","type":"snapshot","releaseTime":"2016-05-18T12:45:14+00:00","url":""},{"id":"1.9.4","type":"release","releaseTime":"2016-05-10T10:17:16+00:00","url":""},{"id":"1.9.3","type":"release","releaseTime":"2016-05-10T08:33:35+00:00","url":""},{"id":"1.9.3-pre3","type":"snapshot","releaseTime":"2016-05-03T09:28:11+00:00","url":""},{"id":"1.9.3-pre2","type":"snapshot","releaseTime":"2016-04-27T13:33:20+00:00","url":""},{"id":"1.9.3-pre1","type":"snapshot","releaseTime":"2016-04-21T12:41:42+00:00","url":""},{"id":"16w15b","type":"snapshot","releaseTime":"2016-04-13T13:56:41+00:00","url":""},{"id":"16w15a","type":"snapshot","releaseTime":"2016-04-11T14:38:28+00:00","url":""},{"id":"16w14a","type":"snapshot","releaseTime":"2016-04-07T12:47:51+00:00","url":""},{"id":"1.RV-Pre1","type":"snapshot","releaseTime":"2016-03-31T16:18:53+00:00","url":""},{"id":"1.9.2","type":"release","releaseTime":"2016-03-30T15:23:55+00:00","url":""},{"id":"1.9.1","type":"release","releaseTime":"2016-03-30T13:43:07+00:00","url":""},{"id":"1.9.1-pre3","type":"snapshot","releaseTime":"2016-03-11T09:20:36+00:00","url":""},{"id":"1.9.1-pre2","type":"snapshot","releaseTime":"2016-03-10T15:06:03+00:00","url":""},{"id":"1.9.1-pre1","type":"snapshot","releaseTime":"2016-03-09T16:27:29+00:00","url":""},{"id":"1.9","type":"release","releaseTime":"2016-02-29T13:49:54+00:00","url":""},{"id":"1.9-pre4","type":"snapshot","releaseTime":"2016-02-26T15:21:11+00:00","url":""},{"id":"1.9-pre3","type":"snapshot","releaseTime":"2016-02-24T15:52:36+00:00","url":""},{"id":"1.9-pre2","type":"snapshot","releaseTime":"2016-02-18T17:41:00+00:00","url":""},{"id":"1.9-pre1","type":"snapshot","releaseTime":"2016-02-17T15:23:19+00:00","url":""},{"id":"16w07b","type":"snapshot","releaseTime":"2016-02-16T15:22:39+00:00","url":""},{"id":"16w07a","type":"snapshot","releaseTime":"2016-02-15T15:48:46+00:00","url":""},{"id":"16w06a","type":"snapshot","releaseTime":"2016-02-10T15:06:41+00:00","url":""},{"id":"16w05b","type":"snapshot","releaseTime":"2016-02-04T15:28:02+00:00","url":""},{"id":"16w05a","type":"snapshot","releaseTime":"2016-02-03T15:48:38+00:00","url":""},{"id":"16w04a","type":"snapshot","releaseTime":"2016-01-28T15:37:24+00:00","url":""},{"id":"16w03a","type":"snapshot","releaseTime":"2016-01-20T14:29:24+00:00","url":""},{"id":"16w02a","type":"snapshot","releaseTime":"2016-01-13T15:15:16+00:00","url":""},{"id":"15w51b","type":"snapshot","releaseTime":"2015-12-17T15:30:41+00:00","url":""},{"id":"15w51a","type":"snapshot","releaseTime":"2015-12-17T14:02:37+00:00","url":""},{"id":"15w50a","type":"snapshot","releaseTime":"2015-12-09T15:35:57+00:00","url":""},{"id":"15w49b","type":"snapshot","releaseTime":"2015-12-03T15:23:22+00:00","url":""},{"id":"1.8.9","type":"release","releaseTime":"2015-12-03T09:24:39+00:00","url":""},{"id":"15w49a","type":"snapshot","releaseTime":"2015-12-02T15:09:37+00:00","url":""},{"id":"15w47c","type":"snapshot","releaseTime":"2015-11-20T12:46:56+00:00","url":""},{"id":"15w47b","type":"snapshot","releaseTime":"2015-11-19T14:48:03+00:00","url":""},{"id":"15w47a","type":"snapshot","releaseTime":"2015-11-18T15:53:41+00:00","url":""},{"id":"15w46a","type":"snapshot","releaseTime":"2015-11-12T12:11:47+00:00","url":""},{"id":"15w45a","type":"snapshot","releaseTime":"2015-11-05T13:04:07+00:00","url":""},{"id":"15w44b","type":"snapshot","releaseTime":"2015-10-30T11:23:17+00:00","url":""},{"id":"15w44a","type":"snapshot","releaseTime":"2015-10-28T15:09:36+00:00","url":""},{"id":"15w43c","type":"snapshot","releaseTime":"2015-10-23T15:35:55+00:00","url":""},{"id":"15w43b","type":"snapshot","releaseTime":"2015-10-22T14:11:58+00:00","url":""},{"id":"15w43a","type":"snapshot","releaseTime":"2015-10-21T15:28:52+00:00","url":""},{"id":"15w42a","type":"snapshot","releaseTime":"2015-10-14T13:25:14+00:00","url":""},{"id":"15w41b","type":"snapshot","releaseTime":"2015-10-07T14:07:26+00:00","url":""},{"id":"15w41a","type":"snapshot","releaseTime":"2015-10-07T13:19:53+00:00","url":""},{"id":"15w40b","type":"snapshot","releaseTime":"2015-09-30T14:13:54+00:00","url":""},{"id":"15w40a","type":"snapshot","releaseTime":"2015-09-30T13:13:54+00:00","url":""},{"id":"15w39c","type":"snapshot","releaseTime":"2015-09-23T13:13:54+00:00","url":""},{"id":"15w39b","type":"snapshot","releaseTime":"2015-09-21T15:09:52+00:00","url":""},{"id":"15w39a","type":"snapshot","releaseTime":"2015-09-21T13:16:32+00:00","url":""},{"id":"15w38b","type":"snapshot","releaseTime":"2015-09-17T14:22:31+00:00","url":""},{"id":"15w38a","type":"snapshot","releaseTime":"2015-09-16T14:22:31+00:00","url":""},{"id":"15w37a","type":"snapshot","releaseTime":"2015-09-10T14:22:31+00:00","url":""},{"id":"15w36d","type":"snapshot","releaseTime":"2015-09-04T14:22:31+00:00","url":""},{"id":"15w36c","type":"snapshot","releaseTime":"2015-09-02T16:07:22+00:00","url":""},{"id":"15w36b","type":"snapshot","releaseTime":"2015-09-02T15:36:25+00:00","url":""},{"id":"15w36a","type":"snapshot","releaseTime":"2015-09-02T14:46:40+00:00","url":""},{"id":"15w35e","type":"snapshot","releaseTime":"2015-08-28T18:14:02+00:00","url":""},{"id":"15w35d","type":"snapshot","releaseTime":"2015-08-28T16:25:35+00:00","url":""},{"id":"15w35c","type":"snapshot","releaseTime":"2015-08-28T11:21:00+00:00","url":""},{"id":"15w35b","type":"snapshot","releaseTime":"2015-08-24T15:39:18+00:00","url":""},{"id":"15w35a","type":"snapshot","releaseTime":"2015-08-24T14:19:31+00:00","url":""},{"id":"15w34d","type":"snapshot","releaseTime":"2015-08-21T15:27:55+00:00","url":""},{"id":"15w34c","type":"snapshot","releaseTime":"2015-08-21T12:45:20+00:00","url":""},{"id":"15w34b","type":"snapshot","releaseTime":"2015-08-20T14:00:03+00:00","url":""},{"id":"15w34a","type":"snapshot","releaseTime":"2015-08-19T12:56:01+00:00","url":""},{"id":"15w33c","type":"snapshot","releaseTime":"2015-08-14T13:10:46+00:00","url":""},{"id":"15w33b","type":"snapshot","releaseTime":"2015-08-12T15:29:11+00:00","url":""},{"id":"15w33a","type":"snapshot","releaseTime":"2015-08-12T14:05:07+00:00","url":""},{"id":"15w32c","type":"snapshot","releaseTime":"2015-08-07T14:08:17+00:00","url":""},{"id":"15w32b","type":"snapshot","releaseTime":"2015-08-06T13:51:47+00:00","url":""},{"id":"15w32a","type":"snapshot","releaseTime":"2015-08-05T12:22:42+00:00","url":""},{"id":"15w31c","type":"snapshot","releaseTime":"2015-07-31T13:45:08+00:00","url":""},{"id":"15w31b","type":"snapshot","releaseTime":"2015-07-30T13:38:32+00:00","url":""},{"id":"15w31a","type":"snapshot","releaseTime":"2015-07-29T13:24:33+00:00","url":""},{"id":"1.8.8","type":"release","releaseTime":"2015-07-27T10:31:28+00:00","url":""},{"id":"1.8.7","type":"release","releaseTime":"2015-06-05T10:10:44+00:00","url":""},{"id":"1.8.6","type":"release","releaseTime":"2015-05-25T10:31:19+00:00","url":""},{"id":"1.8.5","type":"release","releaseTime":"2015-05-22T11:15:28+00:00","url":""},{"id":"1.8.4","type":"release","releaseTime":"2015-04-17T11:37:50+00:00","url":""},{"id":"15w14a","type":"snapshot","releaseTime":"2015-04-01T07:08:00+00:00","url":""},{"id":"1.8.3","type":"release","releaseTime":"2015-02-20T14:00:09+00:00","url":""},{"id":"1.8.2","type":"release","releaseTime":"2015-02-19T15:47:29+00:00","url":""},{"id":"1.8.2-pre7","type":"snapshot","releaseTime":"2015-02-16T13:01:35+00:00","url":""},{"id":"1.8.2-pre6","type":"snapshot","releaseTime":"2015-01-30T11:58:24+00:00","url":""},{"id":"1.8.2-pre5","type":"snapshot","releaseTime":"2015-01-26T15:03:24+00:00","url":""},{"id":"1.8.2-pre4","type":"snapshot","releaseTime":"2015-01-16T14:19:59+00:00","url":""},{"id":"1.8.2-pre3","type":"snapshot","releaseTime":"2015-01-15T16:44:33+00:00","url":""},{"id":"1.8.2-pre2","type":"snapshot","releaseTime":"2015-01-15T15:07:31+00:00","url":""},{"id":"1.8.2-pre1","type":"snapshot","releaseTime":"2014-12-18T11:29:41+00:00","url":""},{"id":"1.8.1","type":"release","releaseTime":"2014-11-24T14:13:31+00:00","url":""},{"id":"1.8.1-pre5","type":"snapshot","releaseTime":"2014-11-19T14:30:48+00:00","url":""},{"id":"1.8.1-pre4","type":"snapshot","releaseTime":"2014-11-06T14:10:50+00:00","url":""},{"id":"1.8.1-pre3","type":"snapshot","releaseTime":"2014-10-23T12:59:42+00:00","url":""},{"id":"1.8.1-pre2","type":"snapshot","releaseTime":"2014-10-16T14:19:27+00:00","url":""},{"id":"1.8.1-pre1","type":"snapshot","releaseTime":"2014-10-15T13:25:11+00:00","url":""},{"id":"1.8","type":"release","releaseTime":"2014-09-02T08:24:35+00:00","url":""},{"id":"1.8-pre3","type":"snapshot","releaseTime":"2014-08-28T09:40:54+00:00","url":""},{"id":"1.8-pre2","type":"snapshot","releaseTime":"2014-08-25T14:52:18+00:00","url":""},{"id":"1.8-pre1","type":"snapshot","releaseTime":"2014-08-21T13:56:26+00:00","url":""},{"id":"14w34d","type":"snapshot","releaseTime":"2014-08-20T12:46:59+00:00","url":""},{"id":"14w34c","type":"snapshot","releaseTime":"2014-08-19T15:31:24+00:00","url":""},{"id":"14w34b","type":"snapshot","releaseTime":"2014-08-18T15:14:28+00:00","url":""},{"id":"14w34a","type":"snapshot","releaseTime":"2014-08-18T14:14:11+00:00","url":""},{"id":"14w33c","type":"snapshot","releaseTime":"2014-08-15T18:00:26+00:00","url":""},{"id":"14w33b","type":"snapshot","releaseTime":"2014-08-15T16:23:51+00:00","url":""},{"id":"14w33a","type":"snapshot","releaseTime":"2014-08-13T15:08:14+00:00","url":""},{"id":"14w32d","type":"snapshot","releaseTime":"2014-08-08T15:13:41+00:00","url":""},{"id":"14w32c","type":"snapshot","releaseTime":"2014-08-08T14:11:20+00:00","url":""},{"id":"14w32b","type":"snapshot","releaseTime":"2014-08-07T14:45:17+00:00","url":""},{"id":"14w32a","type":"snapshot","releaseTime":"2014-08-06T14:01:16+00:00","url":""},{"id":"14w31a","type":"snapshot","releaseTime":"2014-07-30T15:38:05+00:00","url":""},{"id":"14w30c","type":"snapshot","releaseTime":"2014-07-24T14:39:09+00:00","url":""},{"id":"14w30b","type":"snapshot","releaseTime":"2014-07-23T15:03:03+00:00","url":""},{"id":"14w30a","type":"snapshot","releaseTime":"2014-07-23T13:15:42+00:00","url":""},{"id":"14w29b","type":"snapshot","releaseTime":"2014-07-16T17:27:40+00:00","url":""},{"id":"14w29a","type":"snapshot","releaseTime":"2014-07-16T15:18:17+00:00","url":""},{"id":"14w28b","type":"snapshot","releaseTime":"2014-07-10T14:28:48+00:00","url":""},{"id":"14w28a","type":"snapshot","releaseTime":"2014-07-09T15:42:36+00:00","url":""},{"id":"14w27b","type":"snapshot","releaseTime":"2014-07-02T18:34:56+00:00","url":""},{"id":"14w27a","type":"snapshot","releaseTime":"2014-07-02T16:07:20+00:00","url":""},{"id":"14w26c","type":"snapshot","releaseTime":"2014-06-26T15:05:03+00:00","url":""},{"id":"14w26b","type":"snapshot","releaseTime":"2014-06-25T15:08:39+00:00","url":""},{"id":"14w26a","type":"snapshot","releaseTime":"2014-06-25T13:59:27+00:00","url":""},{"id":"14w25b","type":"snapshot","releaseTime":"2014-06-19T12:29:48+00:00","url":""},{"id":"14w25a","type":"snapshot","releaseTime":"2014-06-18T15:52:28+00:00","url":""},{"id":"14w21b","type":"snapshot","releaseTime":"2014-05-22T15:17:55+00:00","url":""},{"id":"14w21a","type":"snapshot","releaseTime":"2014-05-22T14:44:33+00:00","url":""},{"id":"14w20b","type":"snapshot","releaseTime":"2014-05-15T16:47:21+00:00","url":""},{"id":"14w20a","type":"snapshot","releaseTime":"2014-05-15T14:01:20+00:00","url":""},{"id":"1.7.10","type":"release","releaseTime":"2014-05-14T17:29:23+00:00","url":""},{"id":"1.7.10-pre4","type":"snapshot","releaseTime":"2014-05-14T16:29:23+00:00","url":""},{"id":"1.7.10-pre3","type":"snapshot","releaseTime":"2014-05-14T15:29:23+00:00","url":""},{"id":"1.7.10-pre2","type":"snapshot","releaseTime":"2014-05-14T14:29:23+00:00","url":""},{"id":"1.7.10-pre1","type":"snapshot","releaseTime":"2014-05-14T13:29:23+00:00","url":""},{"id":"14w19a","type":"snapshot","releaseTime":"2014-05-08T14:24:19+00:00","url":""},{"id":"14w18b","type":"snapshot","releaseTime":"2014-05-02T11:38:17+00:00","url":""},{"id":"14w18a","type":"snapshot","releaseTime":"2014-04-30T10:25:35+00:00","url":""},{"id":"14w17a","type":"snapshot","releaseTime":"2014-04-24T15:44:49+00:00","url":""},{"id":"14w11b","type":"snapshot","releaseTime":"2014-04-14T14:36:19+00:00","url":""},{"id":"1.7.9","type":"release","releaseTime":"2014-04-14T13:29:23+00:00","url":""},{"id":"1.7.8","type":"release","releaseTime":"2014-04-09T07:58:16+00:00","url":""},{"id":"1.7.7","type":"release","releaseTime":"2014-04-09T07:52:16+00:00","url":""},{"id":"1.7.6","type":"release","releaseTime":"2014-04-09T07:52:06+00:00","url":""},{"id":"14w11a","type":"snapshot","releaseTime":"2014-03-13T14:02:50+00:00","url":""},{"id":"1.7.6-pre2","type":"snapshot","releaseTime":"2014-03-08T11:00:01+00:00","url":""},{"id":"1.7.6-pre1","type":"snapshot","releaseTime":"2014-03-08T11:00:00+00:00","url":""},{"id":"14w10c","type":"snapshot","releaseTime":"2014-03-07T13:49:55+00:00","url":""},{"id":"14w10b","type":"snapshot","releaseTime":"2014-03-06T16:25:39+00:00","url":""},{"id":"14w10a","type":"snapshot","releaseTime":"2014-03-06T14:23:04+00:00","url":""},{"id":"14w08a","type":"snapshot","releaseTime":"2014-02-26T17:00:00+00:00","url":""},{"id":"1.7.5","type":"release","releaseTime":"2014-02-26T09:22:17+00:00","url":""},{"id":"14w07a","type":"snapshot","releaseTime":"2014-02-14T11:05:07+00:00","url":""},{"id":"14w06b","type":"snapshot","releaseTime":"2014-02-06T17:30:42+00:00","url":""},{"id":"14w06a","type":"snapshot","releaseTime":"2014-02-06T14:30:17+00:00","url":""},{"id":"14w05b","type":"snapshot","releaseTime":"2014-01-31T14:05:50+00:00","url":""},{"id":"14w05a","type":"snapshot","releaseTime":"2014-01-30T15:32:41+00:00","url":""},{"id":"14w04b","type":"snapshot","releaseTime":"2014-01-24T15:48:46+00:00","url":""},{"id":"14w04a","type":"snapshot","releaseTime":"2014-01-23T15:26:13+00:00","url":""},{"id":"14w03b","type":"snapshot","releaseTime":"2014-01-16T16:36:19+00:00","url":""},{"id":"14w03a","type":"snapshot","releaseTime":"2014-01-16T14:45:13+00:00","url":""},{"id":"14w02c","type":"snapshot","releaseTime":"2014-01-10T15:42:36+00:00","url":""},{"id":"14w02b","type":"snapshot","releaseTime":"2014-01-09T15:45:55+00:00","url":""},{"id":"14w02a","type":"snapshot","releaseTime":"2014-01-09T14:44:41+00:00","url":""},{"id":"1.7.4","type":"release","releaseTime":"2013-12-09T12:28:10+00:00","url":""},{"id":"1.7.3","type":"release","releaseTime":"2013-12-06T13:55:34+00:00","url":""},{"id":"13w49a","type":"snapshot","releaseTime":"2013-12-05T14:34:41+00:00","url":""},{"id":"13w48b","type":"snapshot","releaseTime":"2013-11-26T18:36:08+00:00","url":""},{"id":"13w48a","type":"snapshot","releaseTime":"2013-11-25T16:53:39+00:00","url":""},{"id":"13w47e","type":"snapshot","releaseTime":"2013-11-22T15:16:38+00:00","url":""},{"id":"13w47d","type":"snapshot","releaseTime":"2013-11-22T13:51:15+00:00","url":""},{"id":"13w47c","type":"snapshot","releaseTime":"2013-11-21T17:10:33+00:00","url":""},{"id":"13w47b","type":"snapshot","releaseTime":"2013-11-21T16:57:41+00:00","url":""},{"id":"13w47a","type":"snapshot","releaseTime":"2013-11-21T15:59:58+00:00","url":""},{"id":"1.7.2","type":"release","releaseTime":"2013-10-25T13:00:00+00:00","url":""},{"id":"1.7.1","type":"snapshot","releaseTime":"2013-10-23T12:01:07+00:00","url":""},{"id":"1.7","type":"snapshot","releaseTime":"2013-10-22T15:04:05+00:00","url":""},{"id":"13w43a","type":"snapshot","releaseTime":"2013-10-21T16:34:47+00:00","url":""},{"id":"13w42b","type":"snapshot","releaseTime":"2013-10-18T16:34:08+00:00","url":""},{"id":"13w42a","type":"snapshot","releaseTime":"2013-10-17T18:33:05+00:00","url":""},{"id":"13w41b","type":"snapshot","releaseTime":"2013-10-11T15:09:17+00:00","url":""},{"id":"13w41a","type":"snapshot","releaseTime":"2013-10-10T14:21:43+00:00","url":""},{"id":"13w39b","type":"snapshot","releaseTime":"2013-09-27T12:15:58+00:00","url":""},{"id":"13w39a","type":"snapshot","releaseTime":"2013-09-26T15:11:19+00:00","url":""},{"id":"13w38c","type":"snapshot","releaseTime":"2013-09-20T15:11:34+00:00","url":""},{"id":"13w38b","type":"snapshot","releaseTime":"2013-09-20T13:45:40+00:00","url":""},{"id":"13w38a","type":"snapshot","releaseTime":"2013-09-19T16:34:21+00:00","url":""},{"id":"1.6.4","type":"release","releaseTime":"2013-09-19T15:52:37+00:00","url":""},{"id":"1.6.3","type":"snapshot","releaseTime":"2013-09-13T10:54:41+00:00","url":""},{"id":"13w37b","type":"snapshot","releaseTime":"2013-09-13T10:54:41+00:00","url":""},{"id":"13w37a","type":"snapshot","releaseTime":"2013-09-12T14:23:14+00:00","url":""},{"id":"13w36b","type":"snapshot","releaseTime":"2013-09-06T12:31:58+00:00","url":""},{"id":"13w36a","type":"snapshot","releaseTime":"2013-09-05T13:05:40+00:00","url":""},{"id":"1.6.2","type":"release","releaseTime":"2013-07-05T13:09:02+00:00","url":""},{"id":"1.6.1","type":"release","releaseTime":"2013-06-28T14:48:41+00:00","url":""},{"id":"1.6","type":"snapshot","releaseTime":"2013-06-25T13:08:56+00:00","url":""},{"id":"13w26a","type":"snapshot","releaseTime":"2013-06-24T16:06:06+00:00","url":""},{"id":"13w25c","type":"snapshot","releaseTime":"2013-06-20T15:23:37+00:00","url":""},{"id":"13w25b","type":"snapshot","releaseTime":"2013-06-18T15:13:27+00:00","url":""},{"id":"13w25a","type":"snapshot","releaseTime":"2013-06-17T14:08:06+00:00","url":""},{"id":"13w24b","type":"snapshot","releaseTime":"2013-06-14T12:19:13+00:00","url":""},{"id":"13w24a","type":"snapshot","releaseTime":"2013-06-13T15:32:23+00:00","url":""},{"id":"13w23b","type":"snapshot","releaseTime":"2013-06-08T00:32:01+00:00","url":""},{"id":"13w23a","type":"snapshot","releaseTime":"2013-06-07T16:04:20+00:00","url":""},{"id":"13w22a","type":"snapshot","releaseTime":"2013-05-30T14:38:40+00:00","url":""},{"id":"13w21b","type":"snapshot","releaseTime":"2013-05-27T08:50:42+00:00","url":""},{"id":"13w21a","type":"snapshot","releaseTime":"2013-05-23T15:38:28+00:00","url":""},{"id":"13w19a","type":"snapshot","releaseTime":"2013-05-10T14:48:02+00:00","url":""},{"id":"13w18c","type":"snapshot","releaseTime":"2013-05-03T09:19:35+00:00","url":""},{"id":"13w18b","type":"snapshot","releaseTime":"2013-05-02T17:12:25+00:00","url":""},{"id":"13w18a","type":"snapshot","releaseTime":"2013-05-02T15:45:59+00:00","url":""},{"id":"13w17a","type":"snapshot","releaseTime":"2013-04-25T15:50:00+00:00","url":""},{"id":"1.5.2","type":"release","releaseTime":"2013-04-25T15:45:00+00:00","url":""},{"id":"13w16b","type":"snapshot","releaseTime":"2013-04-23T21:51:22+00:00","url":""},{"id":"13w16a","type":"snapshot","releaseTime":"2013-04-21T12:49:30+00:00","url":""},{"id":"1.5.1","type":"release","releaseTime":"2013-03-20T10:00:00+00:00","url":""},{"id":"1.5","type":"snapshot","releaseTime":"2013-03-06T22:00:00+00:00","url":""},{"id":"1.4.7","type":"release","releaseTime":"2012-12-27T22:00:00+00:00","url":""},{"id":"1.4.6","type":"release","releaseTime":"2012-12-19T22:00:00+00:00","url":""},{"id":"1.4.5","type":"release","releaseTime":"2012-12-19T22:00:00+00:00","url":""},{"id":"1.4.4","type":"release","releaseTime":"2012-12-13T22:00:00+00:00","url":""},{"id":"1.4.3","type":"snapshot","releaseTime":"2012-11-30T22:00:00+00:00","url":""},{"id":"1.4.2","type":"release","releaseTime":"2012-11-24T22:00:00+00:00","url":""},{"id":"1.4.1","type":"snapshot","releaseTime":"2012-11-22T22:00:00+00:00","url":""},{"id":"1.4","type":"snapshot","releaseTime":"2012-11-18T22:00:00+00:00","url":""},{"id":"1.3.2","type":"release","releaseTime":"2012-08-15T22:00:00+00:00","url":""},{"id":"1.3.1","type":"release","releaseTime":"2012-07-31T22:00:00+00:00","url":""},{"id":"1.3","type":"snapshot","releaseTime":"2012-07-25T22:00:00+00:00","url":""},{"id":"1.2.5","type":"release","releaseTime":"2012-03-29T22:00:00+00:00","url":""},{"id":"1.2.4","type":"release","releaseTime":"2012-03-21T22:00:00+00:00","url":""},{"id":"1.2.3","type":"release","releaseTime":"2012-03-01T22:00:00+00:00","url":""},{"id":"1.2.2","type":"release","releaseTime":"2012-02-29T22:00:01+00:00","url":""},{"id":"1.2.1","type":"release","releaseTime":"2012-02-29T22:00:00+00:00","url":""},{"id":"1.1","type":"release","releaseTime":"2012-01-11T22:00:00+00:00","url":""},{"id":"1.0","type":"release","releaseTime":"2011-11-17T22:00:00+00:00","url":""},{"id":"b1.8.1","type":"old_beta","releaseTime":"2011-09-18T22:00:00+00:00","url":""},{"id":"b1.8","type":"old_beta","releaseTime":"2011-09-14T22:00:00+00:00","url":""},{"id":"b1.7.3","type":"old_beta","releaseTime":"2011-07-07T22:00:00+00:00","url":""},{"id":"b1.7.2","type":"old_beta","releaseTime":"2011-06-30T22:00:00+00:00","url":""},{"id":"b1.7","type":"old_beta","releaseTime":"2011-06-29T22:00:00+00:00","url":""},{"id":"b1.6.6","type":"old_beta","releaseTime":"2011-05-30T22:00:00+00:00","url":""},{"id":"b1.6.5","type":"old_beta","releaseTime":"2011-05-27T22:00:00+00:00","url":""},{"id":"b1.6.4","type":"old_beta","releaseTime":"2011-05-25T22:00:04+00:00","url":""},{"id":"b1.6.3","type":"old_beta","releaseTime":"2011-05-25T22:00:03+00:00","url":""},{"id":"b1.6.2","type":"old_beta","releaseTime":"2011-05-25T22:00:02+00:00","url":""},{"id":"b1.6.1","type":"old_beta","releaseTime":"2011-05-25T22:00:01+00:00","url":""},{"id":"b1.6","type":"old_beta","releaseTime":"2011-05-25T22:00:00+00:00","url":""},{"id":"b1.5_01","type":"old_beta","releaseTime":"2011-04-19T22:00:00+00:00","url":""},{"id":"b1.5","type":"old_beta","releaseTime":"2011-04-18T22:00:00+00:00","url":""},{"id":"b1.4_01","type":"old_beta","releaseTime":"2011-04-04T22:00:00+00:00","url":""},{"id":"b1.4","type":"old_beta","releaseTime":"2011-03-30T22:00:00+00:00","url":""},{"id":"b1.3_01","type":"old_beta","releaseTime":"2011-02-22T22:00:00+00:00","url":""},{"id":"b1.3b","type":"old_beta","releaseTime":"2011-02-21T22:00:00+00:00","url":""},{"id":"b1.2_02","type":"old_beta","releaseTime":"2011-01-20T22:00:00+00:00","url":""},{"id":"b1.2_01","type":"old_beta","releaseTime":"2011-01-13T22:00:00+00:00","url":""},{"id":"b1.2","type":"old_beta","releaseTime":"2011-01-12T22:00:00+00:00","url":""},{"id":"b1.1_02","type":"old_beta","releaseTime":"2010-12-21T22:00:01+00:00","url":""},{"id":"b1.1_01","type":"old_beta","releaseTime":"2010-12-21T22:00:00+00:00","url":""},{"id":"b1.0.2","type":"old_beta","releaseTime":"2010-12-20T22:00:00+00:00","url":""},{"id":"b1.0_01","type":"old_beta","releaseTime":"2010-12-19T22:00:01+00:00","url":""},{"id":"b1.0","type":"old_beta","releaseTime":"2010-12-19T22:00:00+00:00","url":""},{"id":"a1.2.6","type":"old_alpha","releaseTime":"2010-12-02T22:00:00+00:00","url":""},{"id":"a1.2.5","type":"old_alpha","releaseTime":"2010-11-30T22:00:00+00:00","url":""},{"id":"a1.2.4_01","type":"old_alpha","releaseTime":"2010-11-29T22:00:00+00:00","url":""},{"id":"a1.2.3_04","type":"old_alpha","releaseTime":"2010-11-25T22:00:00+00:00","url":""},{"id":"a1.2.3_02","type":"old_alpha","releaseTime":"2010-11-24T22:00:00+00:00","url":""},{"id":"a1.2.3_01","type":"old_alpha","releaseTime":"2010-11-23T22:00:01+00:00","url":""},{"id":"a1.2.3","type":"old_alpha","releaseTime":"2010-11-23T22:00:00+00:00","url":""},{"id":"a1.2.2b","type":"old_alpha","releaseTime":"2010-11-09T22:00:01+00:00","url":""},{"id":"a1.2.2a","type":"old_alpha","releaseTime":"2010-11-09T22:00:00+00:00","url":""},{"id":"a1.2.1_01","type":"old_alpha","releaseTime":"2010-11-04T22:00:01+00:00","url":""},{"id":"a1.2.1","type":"old_alpha","releaseTime":"2010-11-04T22:00:00+00:00","url":""},{"id":"a1.2.0_02","type":"old_alpha","releaseTime":"2010-11-03T22:00:00+00:00","url":""},{"id":"a1.2.0_01","type":"old_alpha","releaseTime":"2010-10-30T22:00:00+00:00","url":""},{"id":"a1.2.0","type":"old_alpha","releaseTime":"2010-10-29T22:00:00+00:00","url":""},{"id":"a1.1.2_01","type":"old_alpha","releaseTime":"2010-09-22T22:00:00+00:00","url":""},{"id":"a1.1.2","type":"old_alpha","releaseTime":"2010-09-19T22:00:00+00:00","url":""},{"id":"a1.1.0","type":"old_alpha","releaseTime":"2010-09-12T22:00:00+00:00","url":""},{"id":"a1.0.17_04","type":"old_alpha","releaseTime":"2010-08-22T22:00:00+00:00","url":""},{"id":"a1.0.17_02","type":"old_alpha","releaseTime":"2010-08-19T22:00:00+00:00","url":""},{"id":"a1.0.16","type":"old_alpha","releaseTime":"2010-08-11T22:00:00+00:00","url":""},{"id":"a1.0.15","type":"old_alpha","releaseTime":"2010-08-03T22:00:00+00:00","url":""},{"id":"a1.0.14","type":"old_alpha","releaseTime":"2010-07-29T22:00:00+00:00","url":""},{"id":"a1.0.11","type":"old_alpha","releaseTime":"2010-07-22T22:00:00+00:00","url":""},{"id":"a1.0.5_01","type":"old_alpha","releaseTime":"2010-07-12T22:00:00+00:00","url":""},{"id":"a1.0.4","type":"old_alpha","releaseTime":"2010-07-08T22:00:00+00:00","url":""},{"id":"inf-20100618","type":"old_alpha","releaseTime":"2010-06-15T22:00:00+00:00","url":""},{"id":"c0.30_01c","type":"old_alpha","releaseTime":"2009-12-21T22:00:00+00:00","url":""},{"id":"c0.0.13a","type":"old_alpha","releaseTime":"2009-05-30T22:00:00+00:00","url":""},{"id":"c0.0.13a_03","type":"old_alpha","releaseTime":"2009-05-21T22:00:00+00:00","url":""},{"id":"c0.0.11a","type":"old_alpha","releaseTime":"2009-05-16T22:00:00+00:00","url":""},{"id":"rd-161348","type":"old_alpha","releaseTime":"2009-05-16T11:48:00+00:00","url":""},{"id":"rd-160052","type":"old_alpha","releaseTime":"2009-05-15T22:52:00+00:00","url":""},{"id":"rd-20090515","type":"old_alpha","releaseTime":"2009-05-14T22:00:00+00:00","url":""},{"id":"rd-132328","type":"old_alpha","releaseTime":"2009-05-13T21:28:00+00:00","url":""},{"id":"rd-132211","type":"old_alpha","releaseTime":"2009-05-13T20:11:00+00:00","url":""}]};

  const NEWS = [
    {
      id: 'n1',
      title: '内测提示',
      tag: '公告',
      date: '2026-11-21',
      body: '这是 Plain Craft Launcher 2 的第三方独立实现：界面与版本选择逻辑参考 PCL2（作者龙腾猫跃），底层为真实的 Mojang 下载与启动流程，支持原版、Fabric、Modrinth Mod 与 .mrpack 整合包。'
    },
    {
      id: 'n2',
      title: '下载源可在设置中切换',
      tag: '提示',
      date: '2026-11-21',
      body: '若官方源速度较慢，可在 设置 → 启动器 → 下载源 切换为 BMCLAPI 镜像，依赖库与资源文件都会自动走镜像。'
    },
    {
      id: 'n3',
      title: '联机页支持局域网自动发现',
      tag: '功能',
      date: '2026-11-21',
      body: '在游戏中对局域网开放后，本启动器的「联机」页会自动监听到房间广播，双击即可复制地址进入。'
    }
  ];

  /** 模拟一个下载任务：分阶段推进度，最后 onDone */
  async function simulateTask(kind, title, steps, onDone) {
    const taskId = `${kind}-${uid()}`;
    let idx = 0;
    for (const step of steps) {
      const total = step.total || 100;
      for (let i = 0; i <= total; i += Math.max(1, Math.round(total / 14))) {
        emit('task:progress', {
          taskId, kind, title,
          phase: step.phase || 'download',
          title: step.title,
          detail: step.detail || '',
          current: Math.min(i, total),
          total
        });
        await wait(step.delay || 90);
      }
      idx++;
    }
    emit('task:done', { taskId, kind, title, success: true });
    if (onDone) onDone();
    return { ok: true, taskId };
  }

  const folderName = (p) => {
    const parts = String(p || '').split(/[\\/]/).filter(Boolean);
    if (!parts.length) return String(p || '');
    const base = parts[parts.length - 1];
    if (base === '.minecraft') {
      const parent = parts[parts.length - 2] || '';
      const grand = parts[parts.length - 3] || '';
      if (!parent || /roaming/i.test(parent) || /^(home|users)$/i.test(grand)) return '官方启动器文件夹';
      return parent;
    }
    return base;
  };

  function mockFolders() {
    const paths = Array.isArray(settings.gameFolders) && settings.gameFolders.length
      ? settings.gameFolders
      : [settings.gameDir].filter(Boolean);
    return paths.map((p) => ({ path: p, name: folderName(p), active: p === settings.gameDir, exists: true }));
  }

  function saveMockSettings(patch) {
    settings = { ...settings, ...(patch || {}) };
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
    return settings;
  }

  window.API = {
    isElectron: false,
    platform: 'linux',
    win: {
      minimize: async () => {},
      toggleMaximize: async () => false,
      close: async () => toastPreview('浏览器预览中无法关闭窗口'),
      isMaximized: async () => false
    },
    settings: {
      get: async () => ({ ...settings, accounts }),
      set: async (patch) => {
        const p = { ...(patch || {}) };
        if (p.gameDir) {
          const list = Array.isArray(settings.gameFolders) ? settings.gameFolders : [];
          p.gameFolders = [...new Set([p.gameDir, ...list])];
        }
        settings = { ...settings, ...p };
        try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
        return settings;
      }
    },
    folders: {
      list: async () => mockFolders(),
      add: async () => ({ ok: false, error: '浏览器预览不能访问本地文件夹' }),
      create: async () => ({ ok: false, error: '浏览器预览不能创建文件夹' }),
      switch: async (p) => {
        const paths = Array.isArray(settings.gameFolders) && settings.gameFolders.length
          ? settings.gameFolders
          : [settings.gameDir].filter(Boolean);
        if (!paths.includes(p)) throw new Error('该文件夹不在列表中');
        saveMockSettings({ gameDir: p, version: '' });
        return { ok: true, path: p, folders: mockFolders() };
      },
      remove: async (p) => {
        const paths = (settings.gameFolders || []).filter((x) => x !== p);
        if (paths.length < 1) throw new Error('至少要保留一个游戏文件夹');
        const switched = settings.gameDir === p;
        saveMockSettings({ gameFolders: paths, gameDir: switched ? paths[0] : settings.gameDir, version: switched ? '' : settings.version });
        return { ok: true, switched, active: settings.gameDir, folders: mockFolders() };
      }
    },
    diagnostics: {
      run: async (logs) => {
        const checks = [];
        const add = (group, id, title, status, detail, fix = null) => checks.push({ group, id, title, status, detail, fix });
        add('runtime', 'runtime', '运行环境', 'pass', 'StartPro 网页版 · 浏览器预览 · 不占用 GPU');
        add('files', 'gameDir', '游戏目录', 'warn', `网页版无法直接读写本地目录：${settings.gameDir}`, { label: '去设置', act: 'settings', tab: 'game' });
        add('version', 'count', '已安装版本', 'pass', `演示版本 ${VERSIONS.length} 个。`);
        add('version', 'selected', '当前版本', 'pass', `当前选中「${settings.version}」。`);
        add('java', 'detect', 'Java 运行环境', 'pass', '网页预览使用模拟 Java 21；桌面版会做真实检测。');
        add('settings', 'memory', '内存分配', 'pass', `当前分配 ${settings.maxMemory} MB。`);
        add('account', 'count', '账号', 'pass', accounts.length ? `当前 ${accounts.length} 个演示账号。` : '还没有账号。');
        add('network', 'manifest', '网络连通性', 'info', '网页预览不请求 Mojang，真实下载请用桌面版。');
        const lines = (Array.isArray(logs) ? logs : []).slice(-200).join('\n');
        const bad = /OutOfMemoryError|UnsupportedClassVersionError|NoClassDefFoundError/i.test(lines);
        add('log', 'errors', '最近日志', bad ? 'warn' : 'pass', bad ? '演示日志里有异常关键词。' : '演示日志未发现明显异常。');
        add('app', 'assistant', 'SPL 小助手', 'pass', '本地离线知识库可用，不联网、不占 GPU。');
        const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
        for (const c of checks) counts[c.status] = (counts[c.status] || 0) + 1;
        return { ok: !counts.fail, score: Math.max(0, Math.min(100, 100 - counts.fail * 20 - counts.warn * 8)), counts, checks, generatedAt: new Date().toISOString(), version: settings.version };
      }
    },
    versions: {
      getSettings: async (id) => {
        try { return (JSON.parse(localStorage.getItem('pcl-vset') || '{}') || {})[id] || {}; } catch { return {}; }
      },
      setSettings: async (id, patch) => {
        let map = {};
        try { map = JSON.parse(localStorage.getItem('pcl-vset') || '{}') || {}; } catch {}
        map[id] = { ...(map[id] || {}), ...(patch || {}) };
        localStorage.setItem('pcl-vset', JSON.stringify(map));
        return map[id];
      },
      export: async (id) => ({ ok: true, path: `${settings.gameDir}/exports/${id}.zip` }),
      exportPack: async (id) => ({ ok: true, path: `${settings.gameDir}/exports/${id}.mrpack` }),
      list: async () => VERSIONS.map((v) => ({ ...v, dir: `${settings.gameDir}/versions/${v.id}` })),
      del: async (id) => {
        const i = VERSIONS.findIndex((v) => v.id === id);
        if (i >= 0) VERSIONS.splice(i, 1);
        return { ok: true };
      },
      open: async () => '',
      copy: async (id, name) => {
        const src = VERSIONS.find((v) => v.id === id);
        if (src) VERSIONS.unshift({ ...src, id: name });
        return { ok: true, id: name };
      },
      detail: async (id) => {
        const v = VERSIONS.find((x) => x.id === id) || { id };
        return {
          id,
          raw: { id, type: v.type, inheritsFrom: v.inheritsFrom, mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient' },
          mainClass: v.loader === 'Fabric' ? 'net.fabricmc.loader.impl.launch.knot.KnotClient' : 'net.minecraft.client.main.Main',
          javaVersion: { majorVersion: 21, component: 'java-runtime-delta' },
          assets: '17',
          mods: ['sodium-0.5.8.jar', 'iris-1.7.6.jar', 'lithium-0.14.jar', 'fabric-api-0.110.0.jar'],
          dir: `${settings.gameDir}/versions/${id}`
        };
      }
    },
    manifest: async () => {
      // file:// 预览直接使用内置清单，避免无意义的 CORS 报错
      if (!/^https?:/i.test(location.protocol)) return FALLBACK_MANIFEST;
      try {
        const res = await fetch('https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json', { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('bad');
        return await res.json();
      } catch (e) {
        return FALLBACK_MANIFEST;
      }
    },
    install: {
      version: async (id) => {
        const res = await simulateTask('install', `安装 ${id}`, [
          { phase: 'meta', title: '获取版本信息', detail: id, total: 4 },
          { phase: 'client', title: '下载客户端', detail: `${id}.jar`, total: 100, delay: 70 },
          { phase: 'libraries', title: '下载依赖库', detail: '62/62', total: 62, delay: 60 },
          { phase: 'assets', title: '下载资源文件', detail: '2148/2148', total: 2148, delay: 12 },
          { phase: 'finish', title: '安装完成', detail: id, total: 1 }
        ], () => {
          if (!VERSIONS.find((v) => v.id === id))
            VERSIONS.unshift({ id, type: 'release', loader: '', releaseTime: new Date().toISOString(), lastUsed: new Date().toISOString(), jar: true, size: 2712340, mods: 0 });
          settings.version = id;
        });
        return { ok: true, id, taskId: res.taskId };
      },
      fabric: async ({ gameVersion, loaderVersion }) => {
        const id = `${gameVersion}-Fabric ${loaderVersion}`;
        const res = await simulateTask('fabric', `安装 Fabric ${loaderVersion}`, [
          { phase: 'fabric', title: '获取 Fabric 安装配置', total: 3 },
          { phase: 'finish', title: 'Fabric 安装完成', detail: id, total: 1 }
        ], () => {
          if (!VERSIONS.find((v) => v.id === id))
            VERSIONS.unshift({ id, type: 'modified', loader: 'Fabric', inheritsFrom: gameVersion, releaseTime: new Date().toISOString(), lastUsed: new Date().toISOString(), jar: true, size: 2712340, mods: 0 });
          settings.version = id;
        });
        return { ok: true, id, taskId: res.taskId };
      },
      choosePack: async () => '',
      pack: async () =>
        simulateTask('modpack', '安装整合包', [
          { phase: 'base', title: '准备基础版本', detail: '1.20.1', total: 3 },
          { phase: 'mods', title: '下载整合包内容', detail: '128/128', total: 128, delay: 25 },
          { phase: 'overrides', title: '写入整合包配置', total: 40, delay: 30 },
          { phase: 'finish', title: '整合包安装完成', detail: '冒险整合包', total: 1 }
        ])
    },
    fabric: {
      games: async () => FALLBACK_MANIFEST.versions.map((v) => ({ id: v.id, stable: true })),
      loaders: async () => [
        { version: '0.16.10', stable: true },
        { version: '0.16.9', stable: true },
        { version: '0.15.11', stable: true },
        { version: '0.14.24', stable: true }
      ]
    },
    forge: {
      versions: async () => [
        { version: '47.4.29', recommended: true },
        { version: '47.4.28', latest: true },
        { version: '47.3.0' },
        { version: '47.4.27' },
        { version: '47.2.0' }
      ],
      neoVersions: async () => [{ version: '21.1.209' }, { version: '21.1.208' }, { version: '21.0.167' }],
      install: async ({ mcVersion, forgeVersion, neoVersion, kind }) => {
        const id = `${mcVersion}-${kind === 'neoforge' ? 'NeoForge' : 'Forge'} ${kind === 'neoforge' ? neoVersion : forgeVersion}`;
        const res = await simulateTask('forge', `安装 ${kind === 'neoforge' ? 'NeoForge' : 'Forge'} ${kind === 'neoforge' ? neoVersion : forgeVersion}`, [
          { phase: 'download', title: '下载安装器', total: 60, delay: 60 },
          { phase: 'installer', title: '运行安装器', detail: '正在下载依赖库…', total: 0, delay: 120 },
          { phase: 'finish', title: '安装完成', detail: `${mcVersion}-${kind === 'neoforge' ? 'NeoForge' : 'Forge'} ${kind === 'neoforge' ? neoVersion : forgeVersion}`, total: 1 }
        ], () => {
          const id = `${mcVersion}-${kind === 'neoforge' ? 'NeoForge' : 'Forge'} ${kind === 'neoforge' ? neoVersion : forgeVersion}`;
          if (!VERSIONS.find((v) => v.id === id))
            VERSIONS.unshift({ id, type: 'modified', loader: kind === 'neoforge' ? 'NeoForge' : 'Forge', inheritsFrom: mcVersion, releaseTime: new Date().toISOString(), lastUsed: new Date().toISOString(), jar: true, size: 2411000, mods: 0 });
          settings.version = id;
        });
        return { ok: true, id, taskId: res.taskId };
      }
    },
    java: {
      detect: async () => [
        { path: '/usr/lib/jvm/java-21-openjdk/bin/java', version: '21.0.5', major: 21, output: 'openjdk version "21.0.5" 2024-10-15' },
        { path: '/usr/lib/jvm/java-17-openjdk/bin/java', version: '17.0.13', major: 17, output: 'openjdk version "17.0.13" 2024-10-15' },
        { path: '/usr/lib/jvm/java-8-openjdk/bin/java', version: '1.8.0_442', major: 8, output: 'java version "1.8.0_442"' }
      ],
      probe: async (p) => ({ path: p, version: '21.0.5', major: 21, output: 'openjdk version "21.0.5"' }),
      browse: async () => '',
      catalog: async () => [
        { major: 8, label: 'Java 8（1.16.5 及更早）' },
        { major: 17, label: 'Java 17（1.17–1.20.4）' },
        { major: 21, label: 'Java 21（1.20.5+）', recommended: true },
        { major: 25, label: 'Java 25' },
      ],
      required: async (versionId) => ({ major: /^1\\.(?:[0-9]|1[0-6])(\\.|$)/.test(versionId || '') ? 8 : 21, source: 'mock' }),
      download: async (major) => {
        const taskId = `java-${major}`;
        for (let i = 0; i <= 100; i += 10) {
          emit('task:progress', { taskId, kind: 'java', title: `下载 Java ${major}`, phase: 'download', detail: `${i}%`, current: i, total: 100 });
          await new Promise((r) => setTimeout(r, 120));
        }
        emit('task:done', { taskId, kind: 'java', title: `下载 Java ${major}`, success: true });
        return { ok: true, path: `/home/user/.pcl2/java/temurin-${major}/bin/java`, major, version: `${major}.0.0`, cached: false };
      },
    },
    dir: { choose: async () => '' },
    launch: {
      start: async (id) => {
        const versionId = id || settings.version;
        const logs = [
          '[StartPro] 正在校验 Java…',
          `[StartPro] 使用 Java: ${settings.javaPath}`,
          '[StartPro] 正在构建启动参数…',
          `[PCL2] 版本: ${versionId}，内存: ${settings.maxMemory}MB`,
          '[LWJGL] Version: 3.3.3+5',
          '[LWJGL] Loaded native library DLL/SO from jar',
          '[Minecraft] Backend library: LWJGL version 3.3.3',
          '[Minecraft] Setting user: ' + (accounts.find((a) => a.id === settings.account) || accounts[0]).name,
          '[SoundEngine] Sound engine started',
          '[Render thread] OpenGL 4.6 · 游戏窗口已创建'
        ];
        let i = 0;
        const timer = setInterval(() => {
          if (i < logs.length) emit('launch:log', { versionId, line: logs[i++] });
          else clearInterval(timer);
        }, 420);
        return { ok: true, pid: 4242, logFile: `${settings.gameDir}/versions/${versionId}/logs/pcl2-preview.log`, command: 'java -cp ... net.minecraft.client.main.Main' };
      },
      stop: async () => {
        emit('launch:exit', { versionId: settings.version, code: 0 });
        return { ok: true };
      },
      preview: async (id) => ({
        ok: true,
        command: `java -Xmx${settings.maxMemory}M -cp libraries/*:${id}.jar net.minecraft.client.main.Main --username ${(accounts[0] || {}).name}`,
        memory: settings.maxMemory,
        requiresJava: 21
      }),
      status: async () => ({ running: false })
    },
    accounts: {
      list: async () => accounts,
      addOffline: async (name) => {
        const acc = { id: 'offline-' + uid(), name, type: 'offline' };
        accounts.push(acc);
        settings.account = acc.id;
        return acc;
      },
      authlib: async ({ server, username }) => {
        const acc = { id: 'authlib-' + uid(), name: username, type: 'authlib', server };
        accounts.push(acc);
        settings.account = acc.id;
        return acc;
      },
      msaStart: async () => ({ device_code: 'mock-device', user_code: 'MOCK-CODE', verification_uri: 'https://microsoft.com/devicelogin', interval: 5, expires_in: 900 }),
      msaPoll: async () => ({ pending: true }),
      remove: async (id) => {
        accounts = accounts.filter((a) => a.id !== id);
        return accounts;
      },
      select: async (id) => {
        settings.account = id;
        return id;
      }
    },
    mods: (() => {
      const map = {};
      return {
        list: async (id) => {
          if (!map[id]) map[id] = (VERSIONS.find((v) => v.id === id)?.modsList || ['sodium-0.5.8.jar', 'iris-1.7.6.jar', 'lithium-0.14.jar']).slice();
          return map[id];
        },
        toggle: async (id, name, enabled) => {
          const list = map[id] || [];
          const next = (enabled ? name.replace(/\.disabled$/i, '') : name.replace(/\.(jar|zip)$/i, (m) => m + '.disabled'));
          map[id] = list.map((x) => (x === name ? next : x));
          return { ok: true, name: next, enabled };
        },
        remove: async (id, name) => {
          map[id] = (map[id] || []).filter((x) => x !== name);
          return { ok: true };
        },
        toggleAll: async (id, enabled) => {
          map[id] = (map[id] || []).map((n) => (enabled ? n.replace(/\.disabled$/i, '') : n.replace(/\.(jar|zip)$/i, (m) => m + '.disabled')));
          return { ok: true, files: map[id] };
        },
        open: async () => '',
      };
    })(),
    update: {
      check: async () => ({ ok: false, error: '网页版没有更新清单，请使用桌面版。' }),
      download: async () => ({ ok: false }),
      install: async () => ({ ok: false, error: '网页版不能自动安装更新。' }),
      openDir: async () => '',
    },
    ai: {
      chat: async () => ({ ok: false, error: '网页版不能调用内置 AI，请使用桌面版。' }),
      models: async () => ({ ok: false, error: '网页版不能调用内置 AI，请使用桌面版。' }),
      test: async () => ({ ok: false, error: '网页版不能调用内置 AI，请使用桌面版。' }),
      stream: async () => ({ ok: false, done: true, error: '网页版不能调用内置 AI，请使用桌面版。' }),
    },
    optifine: {
      list: async () => ({ ok: true, versions: [{ file: 'OptiFine_1.20.1_HD_U_I6.jar', mcVersion: '1.20.1', edition: 'HD_U_I6' }] }),
      install: async () => ({ ok: false, error: '网页版不能运行 OptiFine 安装器，请在桌面版使用。' }),
    },
    quilt: {
      list: async () => ({ ok: true, versions: [{ version: '0.26.0', stable: true }] }),
      install: async () => ({ ok: false, error: '网页版不能安装 Quilt，请在桌面版使用。' }),
    },
    curseforge: {
      search: async () => ({ ok: false, error: '网页版不支持 CurseForge 搜索，请在桌面版配置 API Key。', hits: [] }),
      install: async () => ({ ok: false, error: '网页版不支持 CurseForge 下载' }),
      installPack: async () => ({ ok: false, error: '网页版不支持 CurseForge 整合包' }),
      installPackProject: async () => ({ ok: false, error: '网页版不支持 CurseForge 整合包' }),
    },
    crash: {
      analyze: async () => ({ ok: false, error: '网页版不能读取本地崩溃报告，请在桌面版使用。' }),
      openDir: async () => '',
    },
    personal: {
      openDir: async () => '',
      pickBackground: async () => { toastPreview('网页版不能选择本地图片'); return { ok: false, cancelled: true }; },
      getBackground: async () => ({ ok: false }),
      clearBackground: async () => ({ ok: true }),
      pickMusic: async () => { toastPreview('网页版不能选择本地音乐'); return { ok: false, cancelled: true }; },
      getMusic: async () => ({ ok: false }),
      clearMusic: async () => ({ ok: true }),
      pickSkin: async () => { toastPreview('网页版不能选择本地皮肤'); return { ok: false, cancelled: true }; },
      getSkin: async () => ({ ok: false }),
      pickIcon: async () => ({ ok: false, cancelled: true }),
    },
    modrinth: {
      search: async ({ query, type, gameVersion, loader, limit = 12 }) => {
        try {
          const facets = [[`project_type:${type || 'mod'}`]];
          if (gameVersion) facets.push([`versions:${gameVersion}`]);
          if (loader) facets.push([`categories:${loader}`]);
          const params = new URLSearchParams({ query: query || '', limit, index: 'relevance', facets: JSON.stringify(facets) });
          const res = await fetch(`https://api.modrinth.com/v2/search?${params}`, { signal: AbortSignal.timeout(9000) });
          if (!res.ok) throw new Error('bad');
          const data = await res.json();
          return {
            total: data.total_hits,
            hits: (data.hits || []).map((h) => ({
              id: h.project_id, slug: h.slug, title: h.title, description: h.description,
              author: h.author, downloads: h.downloads, icon: h.icon_url, categories: h.categories, type: h.project_type
            }))
          };
        } catch (e) {
          return { total: SAMPLE_MODS.length, hits: SAMPLE_MODS };
        }
      },
      versions: async () => [{ id: 'v1', version_number: '1.0.0', files: [{ url: 'https://example.com/mod.jar', filename: 'mod.jar', primary: true }] }],
      install: async (payload) =>
        simulateTask('mod', `下载 ${payload.title || 'Mod'}`, [
          { phase: 'download', title: '下载文件', detail: (payload.title || 'mod') + '.jar', total: 100, delay: 60 },
          { phase: 'download', title: '下载完成', detail: '已保存到 mods 文件夹', total: 1 }
        ]),
      installPackProject: async (payload) =>
        simulateTask('modpack', `安装整合包 ${payload.title || ''}`, [
          { phase: 'base', title: '准备基础版本', detail: '1.21.1', total: 1, delay: 40 },
          { phase: 'mods', title: '下载整合包内容', detail: '18/18', total: 18, delay: 50 },
          { phase: 'finish', title: '整合包安装完成', detail: payload.title || '整合包', total: 1 }
        ])
    },
    lan: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
    news: async () => NEWS,
    appInfo: async () => ({
      version: '1.0.0-preview',
      platform: 'linux (浏览器预览)',
      electron: '-', node: '-', chrome: navigator.userAgent.match(/Chrome\/(\S+)/) ? navigator.userAgent.match(/Chrome\/(\S+)/)[1] : '-',
      home: '/home/user', userData: '/home/user/.pcl2', totalMem: 8192
    }),
    openExternal: async (url) => window.open(url, '_blank'),
    on: (channel, cb) => {
      (listeners[channel] = listeners[channel] || []).push(cb);
      return () => {
        listeners[channel] = (listeners[channel] || []).filter((x) => x !== cb);
      };
    }
  };

  const SAMPLE_MODS = [
    { id: 'sodium', slug: 'sodium', title: 'Sodium', author: 'CaffeineMC', downloads: 48200000, description: '现代化的渲染优化 Mod，大幅提升帧率并修复显卡兼容性问题。', icon: '', categories: ['optimization'], type: 'mod' },
    { id: 'iris', slug: 'iris', title: 'Iris Shaders', author: 'IrisShaders', downloads: 21300000, description: '兼容 OptiFine 光影包的高性能光影加载器。', icon: '', categories: ['decoration'], type: 'mod' },
    { id: 'fabric-api', slug: 'fabric-api', title: 'Fabric API', author: 'FabricMC', downloads: 156000000, description: '绝大多数 Fabric Mod 的前置依赖。', icon: '', categories: ['library'], type: 'mod' },
    { id: 'lithium', slug: 'lithium', title: 'Lithium', author: 'CaffeineMC', downloads: 20100000, description: '不改变原版行为的前提下优化游戏逻辑性能。', icon: '', categories: ['optimization'], type: 'mod' },
    { id: 'jei', slug: 'jei', title: 'Just Enough Items', author: 'mezz', downloads: 31000000, description: '物品与合成配方查询，模组整合包必备。', icon: '', categories: ['utility'], type: 'mod' },
    { id: 'create', slug: 'create', title: 'Create', author: 'simibubi', downloads: 26400000, description: '以机械动力为核心的建筑与自动化模组。', icon: '', categories: ['technology'], type: 'mod' }
  ];

  function toastPreview(msg) {
    if (window.PCL && window.PCL.toast) window.PCL.toast(msg);
  }
})();
