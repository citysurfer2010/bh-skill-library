'use strict';
/**
 * Bundles for delivery: one CSS file per layer, one JS bundle of all components (1 request instead of N).
 * /bh-styles.css = design system, /app.css = app-specific styles. The sources remain small files.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const DESIGN_MODULES = ['tokens', 'bh-controls', 'bh-shell', 'bh-table', 'bh-user-menu'];
const CSS_MODULES = ['base', 'layout', 'forms', 'components', 'bh-select', 'today', 'utilities', 'beamer'];

const css = (names) => names.map((name) => `\n/* ─── ${name}.css ─── */\n${fs.readFileSync(path.join(PUBLIC, 'css', `${name}.css`), 'utf8')}`).join('\n');

// Not pages/*: page orchestrators run only on their own page.
const COMPONENTS = path.join(PUBLIC, 'components');
const APP_JS = fs.readdirSync(COMPONENTS)
  .filter((f) => f.endsWith('.js'))
  .sort()
  .map((f) => `\n/* ═══ ${f} ═══ */\n${fs.readFileSync(path.join(COMPONENTS, f), 'utf8')}`)
  .join('\n');

module.exports = { DESIGN_CSS: css(DESIGN_MODULES), APP_CSS: css(CSS_MODULES), APP_JS, DESIGN_MODULES, CSS_MODULES };
