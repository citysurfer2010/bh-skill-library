'use strict';
/** Pfade der App. Alles Veränderliche liegt unter DATA_DIR, damit Tests eine eigene Kopie bekommen. */
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(APP_ROOT, process.env.DATA_DIR || 'data');

module.exports = {
  APP_ROOT,
  DATA_DIR,
  DB_PATH: path.join(DATA_DIR, 'app.db'),
  UPLOADS_DIR: path.join(DATA_DIR, 'uploads'),
};
