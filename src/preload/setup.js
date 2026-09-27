'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  init: () => ipcRenderer.invoke('setup:init'),
  chooseDir: () => ipcRenderer.invoke('setup:choose-dir'),
  finish: (lang) => ipcRenderer.invoke('setup:finish', lang),
  close: () => ipcRenderer.invoke('setup:close'),
});
