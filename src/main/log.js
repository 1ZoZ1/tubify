'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const MAX = 2 * 1024 * 1024;
let file = null;

function target() {
  if (file) return file;
  const dir = path.join(app.getPath('userData'), 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* yoksay */ }
  file = path.join(dir, 'main.log');
  try {
    if (fs.statSync(file).size > MAX) fs.renameSync(file, file + '.old');
  } catch { /* dosya yok */ }
  return file;
}

function write(level, args) {
  const line = `[${new Date().toISOString()}] ${level} ` + args.map((a) =>
    a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  if (!app.isPackaged) console.log(line);
  try { fs.appendFileSync(target(), line + '\n'); } catch { /* yoksay */ }
}

module.exports = {
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a),
  dir: () => path.dirname(target()),
};
