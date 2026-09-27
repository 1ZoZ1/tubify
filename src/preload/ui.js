'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, data) => cb(data);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('pt', {
  i18n: ipcRenderer.sendSync('i18n:get'),
  setLang: (lang) => ipcRenderer.invoke('ui:set-lang', lang),
  init: () => ipcRenderer.invoke('ui:init'),
  add: (opts) => ipcRenderer.invoke('ui:add', opts),
  cancel: (id) => ipcRenderer.send('ui:cancel', id),
  retry: (id) => ipcRenderer.send('ui:retry', id),
  remove: (id) => ipcRenderer.send('ui:remove', id),
  clearFinished: () => ipcRenderer.send('ui:clear'),
  openFile: (id) => ipcRenderer.send('ui:open-file', id),
  showFile: (id) => ipcRenderer.send('ui:show-file', id),
  openInApp: (url) => ipcRenderer.send('ui:open-in-app', url),
  openFolder: () => ipcRenderer.send('ui:open-folder'),
  clipboard: () => ipcRenderer.invoke('ui:clipboard'),
  setSettings: (patch) => ipcRenderer.invoke('ui:set-settings', patch),
  chooseDir: () => ipcRenderer.invoke('ui:choose-dir'),
  tools: () => ipcRenderer.invoke('ui:tools'),
  updateTools: () => ipcRenderer.invoke('ui:update-tools'),
  refreshFilters: () => ipcRenderer.invoke('ui:refresh-filters'),
  clearData: () => ipcRenderer.invoke('ui:clear-data'),
  onDownload: on('ui:download'),
  onSettings: on('ui:settings'),
  onToolsStatus: on('ui:tools-status'),
  onNavigate: on('pt:navigate'),
});
