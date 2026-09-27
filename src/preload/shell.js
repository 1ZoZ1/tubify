'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('shell', {
  i18n: ipcRenderer.sendSync('i18n:get'),
  init: () => ipcRenderer.invoke('shell:init'),
  setMode: (m) => ipcRenderer.send('shell:mode', m),
  nav: (a) => ipcRenderer.send('shell:nav', a),
  setSidebar: (collapsed) => ipcRenderer.send('shell:sidebar', collapsed),
  openManager: (tab) => ipcRenderer.send('shell:open-manager', tab),
  menu: () => ipcRenderer.send('shell:menu'),
  media: (kind, cmd) => ipcRenderer.send('shell:media-cmd', kind, cmd),
  musicGo: (target) => ipcRenderer.send('shell:music-go', target),
  refreshAccount: () => ipcRenderer.send('shell:library-refresh'),
  setPage: (open) => ipcRenderer.send('shell:page', open),

  lib: {
    state: () => ipcRenderer.invoke('lib:state'),
    create: (name) => ipcRenderer.invoke('lib:create', name),
    rename: (id, name) => ipcRenderer.send('lib:rename', id, name),
    remove: (id) => ipcRenderer.invoke('lib:delete', id),
    removeTrack: (listId, trackId) => ipcRenderer.send('lib:remove-track', listId, trackId),
    move: (listId, from, to) => ipcRenderer.send('lib:move', listId, from, to),
    like: (track, on) => ipcRenderer.send('lib:like', track, on),
    add: (listId, tracks) => ipcRenderer.send('lib:add', listId, tracks),
    play: (listId, index, shuffle) => ipcRenderer.send('lib:play', listId, index, shuffle),
    playTracks: (tracks, index) => ipcRenderer.send('lib:play-tracks', tracks, index),
    enqueue: (tracks, next) => ipcRenderer.send('lib:enqueue', tracks, next),
    download: (listId, preset) => ipcRenderer.invoke('lib:download', listId, preset),
    downloadTracks: (tracks, preset) => ipcRenderer.invoke('lib:download-tracks', tracks, preset),
    search: (q) => ipcRenderer.invoke('lib:search', q),
  },
  player: (cmd, arg) => ipcRenderer.send('player:cmd', cmd, arg),
  np: {
    upnext: () => ipcRenderer.invoke('np:upnext'),
    playItem: (i) => ipcRenderer.send('np:play-item', i),
    saveTracks: (name, tracks) => ipcRenderer.invoke('np:save-tracks', name, tracks),
    videoOff: (on) => ipcRenderer.send('np:video-off', on),
    showVideo: () => ipcRenderer.send('np:show-video'),
  },

  onState: on('shell:state'),
  onMedia: on('shell:media'),
  onDownloads: on('shell:downloads'),
  onAccount: on('shell:library'),
  onLocalLib: on('shell:local-lib'),
  onQueue: on('shell:queue'),
  onOpenList: on('shell:open-list'),
  onClosePage: on('shell:close-page'),
  onStripMenu: on('shell:strip-menu'),
  onNpToggle: on('shell:np-toggle'),
  onSettings: on('shell:settings'),
});
