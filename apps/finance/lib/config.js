'use strict';
/** App paths. Everything mutable lives under DATA_DIR so that tests get their own copy. */
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(APP_ROOT, process.env.DATA_DIR || 'data');

module.exports = {
  APP_ROOT,
  DATA_DIR,
  DB_PATH: path.join(DATA_DIR, 'app.db'),
  UPLOADS_DIR: path.join(DATA_DIR, 'uploads'),
};
