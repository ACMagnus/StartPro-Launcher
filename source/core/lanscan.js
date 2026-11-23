'use strict';
/**
 * 局域网联机扫描：监听 Minecraft 局域网广播（UDP 4445，组播 224.0.2.60）
 * 游戏内「对局域网开放」后会把 "[MOTD]世界名[/MOTD][AD]端口[/AD]" 广播出来
 */
const dgram = require('dgram');

function parseAnnounce(text) {
  const motd = /\[MOTD\](.*?)\[\/MOTD\]/s.exec(text);
  const port = /\[AD\](.*?)\[\/AD\]/s.exec(text);
  if (!motd || !port) return null;
  return { motd: motd[1].replace(/§[0-9a-fk-or]/g, '').trim(), port: Number(port[1]), raw: text };
}

function startLanScan(onServer) {
  const sockets = [];

  const listen = (port) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('error', () => {});
    socket.on('message', (msg) => {
      const info = parseAnnounce(msg.toString('utf8'));
      if (info) onServer({ ...info, key: `${port}:${msg.toString('utf8')}` });
    });
    socket.bind(port, () => {
      try {
        socket.addMembership('224.0.2.60');
      } catch {}
    });
    sockets.push(socket);
  };

  listen(4445);
  listen(4446);

  return {
    close: () => sockets.forEach((s) => { try { s.close(); } catch {} }),
  };
}

module.exports = { startLanScan, parseAnnounce };
