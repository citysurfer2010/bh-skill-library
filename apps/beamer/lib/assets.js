'use strict';
/**
 * Bündel für die Auslieferung: eine CSS-Datei je Schicht, ein JS-Bündel aller Komponenten (1 Request statt N).
 * /bh-styles.css = Design-System, /app.css = App-eigene Stile. Die Quellen bleiben kleine Dateien.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const DESIGN_MODULES = ['tokens', 'bh-controls', 'bh-shell', 'bh-table', 'bh-user-menu'];
const CSS_MODULES = ['base', 'layout', 'forms', 'components', 'bh-select', 'utilities', 'beamer'];

const css = (names) => names.map((name) => `\n/* ─── ${name}.css ─── */\n${fs.readFileSync(path.join(PUBLIC, 'css', `${name}.css`), 'utf8')}`).join('\n');

// Nicht pages/*: Seiten-Orchestratoren laufen nur auf ihrer eigenen Seite.
const COMPONENTS = path.join(PUBLIC, 'components');
const APP_JS = fs.readdirSync(COMPONENTS)
  .filter((f) => f.endsWith('.js'))
  .sort()
  .map((f) => `\n/* ═══ ${f} ═══ */\n${fs.readFileSync(path.join(COMPONENTS, f), 'utf8')}`)
  .join('\n');

module.exports = { DESIGN_CSS: css(DESIGN_MODULES), APP_CSS: css(CSS_MODULES), APP_JS, DESIGN_MODULES, CSS_MODULES };
