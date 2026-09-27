'use strict';
// İlk açılış sihirbazı: dil ve indirme klasörü seçilir, ana pencereden önce gösterilir.
const path = require('path');
const { BrowserWindow, ipcMain, dialog, app } = require('electron');
const en = require('../i18n/en');

// Sonuç: { lang, dir } ya da pencere kapatılırsa null.
function runSetup({ root, icon, defaultDir }) {
  return new Promise((resolve) => {
    const locale = (app.getLocale() || '').toLowerCase();
    const win = new BrowserWindow({
      width: 620,
      height: 560,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      title: 'Tubify',
      icon,
      backgroundColor: '#0b0b10',
      show: false,
      webPreferences: {
        preload: path.join(root, 'preload', 'setup.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    });
    let result = null;
    let dir = defaultDir;

    const handlers = {
      'setup:init': () => ({ lang: locale.startsWith('tr') ? 'tr' : 'en', dir, dicts: { en } }),
      'setup:choose-dir': async () => {
        const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: dir });
        if (!r.canceled && r.filePaths[0]) dir = r.filePaths[0];
        return dir;
      },
      'setup:finish': (_e, lang) => {
        result = { lang: lang === 'en' ? 'en' : 'tr', dir };
        win.close();
        return true;
      },
      'setup:close': () => { win.close(); return true; },
    };
    for (const [ch, fn] of Object.entries(handlers)) ipcMain.handle(ch, fn);

    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      for (const ch of Object.keys(handlers)) ipcMain.removeHandler(ch);
      resolve(result);
    });
    win.loadFile(path.join(root, 'setup', 'setup.html'));
  });
}

module.exports = { runSetup };
