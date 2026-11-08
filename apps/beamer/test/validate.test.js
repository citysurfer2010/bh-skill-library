'use strict';
/** Validate: statische Prüfungen ohne Server. Struktur, JS-Syntax, Rahmen, Listen, Standalone-Regeln. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const PAGES = ['index.html', 'admin.html'];

function walk(dir, match, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, match, out); } else if (match.test(e.name)) out.push(p);
  }
  return out;
}
const serverFiles = () => [path.join(ROOT, 'server.js'), ...walk(path.join(ROOT, 'lib'), /\.js$/), ...walk(path.join(ROOT, 'routes'), /\.js$/)];
const relToRoot = (f) => path.relative(ROOT, f);

for (const page of PAGES) {
  test(`${page}: Grundgerüst`, () => {
    const html = read(page);
    assert.ok(html.includes('bh-styles.css'), 'Design-System fehlt');
    assert.ok(html.includes('app.css'), 'App-CSS fehlt');
    assert.ok(html.includes('id="page-host"'));
    for (const id of ['app-navbar', 'app-breadcrumb', 'app-sidebar']) assert.ok(!html.includes(`id="${id}"`), `eigene #${id}: der Rahmen zeichnet das`);
    assert.ok(/window\.APP_BASE\s*=\s*"/.test(html), 'APP_BASE fehlt');
  });

  test(`${page}: lädt das Bündel und einen Orchestrator`, () => {
    const html = read(page);
    assert.ok(html.includes('/app.js'));
    assert.ok(html.includes('/components/pages/'));
    assert.ok(!/src="[^"]*\/components\/(?!pages\/)[^"/]+\.js"/.test(html), 'Komponenten gehören ins Bündel /app.js');
    assert.doesNotMatch(html, /style="/, 'keine style=-Attribute');
  });

  test(`${page}: Theme wird vor den Stylesheets gesetzt`, () => {
    const html = read(page);
    assert.ok(html.indexOf('dataset.theme') < html.indexOf('rel="stylesheet"'));
  });
}

test('CSS-Module sind vorhanden', () => {
  const { DESIGN_MODULES, CSS_MODULES } = require('../lib/assets');
  for (const f of [...DESIGN_MODULES, ...CSS_MODULES]) assert.ok(fs.existsSync(path.join(PUBLIC, 'css', `${f}.css`)), `css/${f}.css fehlt`);
});

test('Jedes Skript in public/ ist syntaktisch gültig, auch das Bündel', () => {
  for (const f of walk(PUBLIC, /\.js$/)) new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f });
  new vm.Script(require('../lib/assets').APP_JS, { filename: 'app.js' });
});

test('Serverdateien sind syntaktisch gültig und klein', () => {
  for (const f of serverFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    new vm.Script(`(function(){${src.replace(/^#!.*/, '')}\n})`, { filename: f });
    assert.ok(src.split('\n').length <= 200, `${relToRoot(f)}: über 200 Zeilen`);
  }
});

test('Oberflächen-Dateien bleiben unter 200 Zeilen', () => {
  for (const f of walk(PUBLIC, /\.(js|css|html)$/)) assert.ok(fs.readFileSync(f, 'utf8').split('\n').length <= 200, `${relToRoot(f)}: über 200 Zeilen`);
});

test('Ladestandard: AppShell.loading/links, Platzhalter-CSS, jede Seite zeigt Platzhalter', () => {
  const shell = read('components/app-shell.js');
  assert.match(shell, /function loading\(/);
  assert.match(shell, /function links\(/);
  assert.doesNotMatch(shell, /style="/);
  assert.match(read('css/layout.css'), /\.app-skel\s*\{/);
  for (const f of walk(path.join(PUBLIC, 'components', 'pages'), /\.js$/)) {
    assert.match(fs.readFileSync(f, 'utf8'), /AppShell\.loading\(/, `${relToRoot(f)}: Platzhalter fehlen`);
  }
});

test('Listen sind randlos: keine Tabelle in einer .card', () => {
  const offenders = [];
  for (const f of walk(PUBLIC, /\.(js|html)$/)) {
    const re = /class="[^"]*\bcard\b[^"]*"(?![^>]*data-table-in-card-ok)[^`]{0,600}?<table/g;
    if (re.test(fs.readFileSync(f, 'utf8'))) offenders.push(relToRoot(f));
  }
  assert.deepEqual(offenders, []);
  assert.match(read('components/app-shell.js'), /function list\(/);
  const layout = read('css/layout.css');
  assert.match(layout, /\.app-content > \.app-list \{ margin: 0 -24px; \}/);
  assert.match(layout, /\.app-list table \{ width: 100%; border-collapse: collapse; \}/);
});

test('Rahmen: Adapter statt eigener Navbar/Sidebar', () => {
  assert.match(read('components/navbar.js'), /BHAppShell\.mount\(/);
  assert.match(read('components/module-sidebar.js'), /shell\.setSidebar\(/);
  assert.match(read('components/app-shell.js'), /shell\.setCrumbs\(/);
});

test('Fehler laufen über lib/error-page, nie als Inline-HTML', () => {
  const src = serverFiles().map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.match(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'), /errorPage\.errorHandler/);
  assert.doesNotMatch(src, /send\(\s*['"`]<h1>/);
});

test('Standalone: kein Import außerhalb des App-Ordners', () => {
  const offenders = [];
  for (const f of [...serverFiles(), ...walk(path.join(ROOT, 'test'), /\.js$/)]) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1];
      if (spec.startsWith('/')) offenders.push(`${relToRoot(f)}: ${spec}`);
      else if (spec.startsWith('.') && path.relative(ROOT, path.resolve(path.dirname(f), spec)).startsWith('..')) offenders.push(`${relToRoot(f)}: ${spec}`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(read('index.html'), /\/shared\//);
});

test('Farben nur als Tokens: kein fester Hex-Wert außerhalb von tokens.css', () => {
  const offenders = [];
  for (const f of walk(path.join(PUBLIC, 'css'), /\.css$/)) {
    if (path.basename(f) === 'tokens.css') continue;
    const hits = fs.readFileSync(f, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hits) offenders.push(`${relToRoot(f)}: ${hits.join(' ')}`);
  }
  assert.deepEqual(offenders, []);
});

test('Tokens gibt es hell und dunkel', () => {
  const tokens = read('css/tokens.css');
  const block = (re) => (tokens.match(re) || [''])[0].match(/--bh-[a-z-]+(?=:)/g) || [];
  assert.ok(block(/:root \{[\s\S]*?\}/).includes('--bh-primary'));
  assert.ok(block(/html\[data-theme="dark"\] \{[\s\S]*?\}/).includes('--bh-primary'));
});

test('Jede benutzte CSS-Variable ist in tokens.css definiert', () => {
  const defined = new Set(read('css/tokens.css').match(/--[a-z0-9-]+(?=:)/g));
  const missing = new Set();
  for (const f of walk(PUBLIC, /\.(css|js)$/)) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/var\((--[a-z0-9-]+)/g)) if (!defined.has(m[1])) missing.add(`${relToRoot(f)}: ${m[1]}`);
  }
  assert.deepEqual([...missing], []);
});

test('KI-Aufrufe nur über lib/llm.js, nie direkt beim Anbieter', () => {
  const hosts = /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/;
  for (const f of [...serverFiles(), ...walk(PUBLIC, /\.(js|html)$/)]) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), hosts, relToRoot(f));
  const llm = fs.readFileSync(path.join(ROOT, 'lib', 'llm.js'), 'utf8');
  assert.match(llm, /http:\/\/llm-gateway:18790\/v1/);
  assert.match(llm, /\/etc\/devbox\/llm\/token/);
});

test('favicon.svg vorhanden', () => {
  assert.ok(fs.existsSync(path.join(PUBLIC, 'favicon.svg')));
});
