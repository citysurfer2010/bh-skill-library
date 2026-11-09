---
name: bh-webapp-skeleton
description: Angebot für klassische Web-Apps der BH Platform, Spiele und freie Anwendungen dürfen abweichen. Erzeugt per Skript eine App mit Express, SQLite, blauem BH-Design, Rollen, drei Pflicht-Dokus, fünf Pflicht-Test-Suiten und Pre-Commit-Gate. Nutzen, sobald eine neue App oder ein Tool mit Weboberfläche entstehen soll.
---

# BH Web-App-Skeleton

Der empfohlene Weg für klassische Web-Apps. Spiele und andere freie Anwendungen dürfen ohne dieses Gerüst entstehen und eine eigene Oberfläche und Menüführung haben. Wer eine App später zur Plattform-App promoten will, braucht mindestens `server.js`, `package.json`, `const APP_BASE = '/<slug>'` und ein grünes `npm test`.

## Zweck

Die Regeln für Web-Apps (fünf Pflicht-Suiten, drei Pflicht-Dokus, Coverage-Schwelle, Commit-Gate) greifen nur, wenn sie von Minute 1 da sind. Dieser Skill sorgt dafür: Eine neue App erfüllt sie durch den Standard, nicht durch Disziplin.

## Verwendung

### Neue App anlegen

```bash
bash /etc/devbox/skills/bh-webapp-skeleton/setup/init.sh <slug> "<Titel>" \
  [--port 3000] [--base /pfad] [--label "Kurztext"] [--description "Beschreibung"] [--dest PFAD]
```

Beispiel:

```bash
bash /etc/devbox/skills/bh-webapp-skeleton/setup/init.sh ideen-board "Ideen-Board" --port 3050
cd ~/projects/ideen-board
npm install
npm test
DEV_USER_EMAIL=ich@beispiel.de DEV_USER_ROLE=admin npm start
```

Ziel ist `~/projects/<slug>`. Das Skript prüft den Slug, überschreibt nichts, legt ein Git-Repository an und installiert das Commit-Gate. Es läuft ohne sudo, ohne globale Installationen und mit read-only Root-Dateisystem.

Vom Laptop ansehen: `ssh -L 3000:localhost:3000 -p <port> dev@<server>`, dann `http://localhost:3000`.

`--base` nur setzen, wenn die App hinter einem Proxy unter einem Pfad-Präfix läuft, der das Präfix vor der App entfernt.

Danach:

1. `PRODUCT_CONTEXT.md` ausfüllen (10 Abschnitte).
2. Feature bauen. Jeder neue geschützte Endpoint bekommt im selben Commit einen Eintrag in `test/rbac.test.js`.
3. `npm test` muss vor jedem Commit grün sein.
4. Dauerhaft starten: `bash scripts/app.sh start` (auch `stop`, `restart`, `status`). Der Start ist idempotent.

### Bestehende App prüfen

```bash
bash /etc/devbox/skills/bh-webapp-skeleton/setup/audit.sh ~/projects/<slug>
```

Listet jedes Pflicht-Artefakt mit `ok` oder `FEHLT`, Exit-Code 1 bei Lücken.

## Was entsteht

```
~/projects/<slug>/
├── server.js                  Express-Kern: öffentliche Routen, Anmeldung, Seiten, Fehlerseiten
├── routes/                    api-keys.js, external.js (Bearer-API), je Modul eine Datei
├── lib/                       auth.js, db.js (node:sqlite), llm.js, error-page.js, assets.js, api-keys.js, config.js
├── public/
│   ├── index.html, admin.html Nur <link> und <script>, kein Inline-Code außer Theme-Start und APP_BASE
│   ├── css/                   tokens.css (alle Farben) + kleine Module, ausgeliefert als /bh-styles.css und /app.css
│   ├── components/            BHAppShell, BHListPage, BHDataTable, BHSideDrawer, BHSelect, gebündelt als /app.js
│   │   └── pages/             Seiten-Orchestratoren
│   └── branding/              App-Icons aus dem Logo, erzeugt von scripts/make-app-icons.mjs
├── scripts/                   app.sh (Start/Stopp), make-app-icons.mjs
├── PRODUCT_CONTEXT.md         Warum: Vision, Regeln, Lessons Learned
├── DEVELOPMENT.md             Wie: Aufbau, Tests, Regeln
├── LIMITATIONS.md             Was fehlt
├── docs/limitations/          Details je Modul
└── test/                      run-all.sh, Pflicht-Suiten und Ratchets
```

## Regeln

1. **Tests zuerst.** `npm test` startet eine Wegwerf-Instanz auf Port + 36000 mit eigener Datenbank und fährt alle Suiten plus Coverage (Zeilen 60 %, Funktionen 60 %, Branches 50 %). Rot heißt kein Commit, `--no-verify` ist keine Lösung.
2. **Pflicht-Suiten:** `validate`, `smoke`, `rbac`, `restart`, `e2e`. Dazu `unit-server` und die Oberflächen-Ratchets `no-native-select`, `no-blocking-resources`, `no-bare-table`, `branding`. Kein Browser nötig, `e2e` läuft über HTTP.
3. **Rollen-Frage vor jedem Endpoint.** Neue Route bekommt `requireRole` oder bewusst `requireUser`, dazu einen Eintrag in `test/rbac.test.js`. Oberfläche nach `user.role` filtern, nicht ausgrauen.
4. **Anmeldung nur über `lib/auth.js`.** Mit `TRUST_PROXY_AUTH=1` gelten nur `X-User-Email`, `X-User-Name` und `X-User-Role` des BH-Auth-Proxys, und die App darf ausschließlich hinter ihm erreichbar sein. Sonst gelten nur `DEV_USER_EMAIL` und `DEV_USER_ROLE`. Ohne gültige E-Mail gibt es keinen Zugang, eine unbekannte Rolle ist `user`.
5. **KI-Aufrufe nur über das Gateway:** `lib/llm.js`, also `http://llm-gateway:18790/v1` mit dem Token aus `/etc/devbox/llm/token`. Nie direkt beim Anbieter.
6. **Farben nur als `--bh-*`-Tokens** aus `public/css/tokens.css`, hell und dunkel. Nie feste Werte in `public/css/`, keine `style=`-Attribute.
7. **Dropdown ist BHSelect, Tabelle ist BHDataTable,** Listen randlos und nie in einer `.card`, kein `window.alert/confirm/prompt`.
8. **Ladestandard:** Rahmen sofort zeichnen, Platzhalter bis die Daten da sind, nichts Fremdes blockiert das erste Zeichnen.
9. **Standalone:** kein Import außerhalb des App-Ordners. Geheimnisse nur in `.env`, nie im Repo.
10. **Dateien klein halten,** Richtwert 200 Zeilen. Das Gate blockt neue oder wachsende größere Dateien.
11. **Pflichtlektüre vor jeder Änderung:** `PRODUCT_CONTEXT.md`, `DEVELOPMENT.md`, `LIMITATIONS.md`. Bei Modul-Arbeit zusätzlich `docs/limitations/<modul>.md`.
12. **Neue Fehlerlehre:** Eintrag in `LIMITATIONS.md` und `test/regression-<slug>.test.js` im selben Commit.

## Was das Template mitbringt

- Rahmen: Navbar 52 px, Breadcrumb 40 px, Sidebar 240 px (einklappbar, ziehbar 180 bis 420 px), Hell/Dunkel-Umschalter, Benutzermenü, Admin-Zahnrad nur für Admins.
- Listenseite `BHListPage` mit Suche, KPI-Filterboxen, Toolbar und `BHDataTable` (Sortieren über alle Zeilen, Spaltenbreiten, Blättern, Auswahl und Sammelaktionen).
- Detailpanel `BHSideDrawer` mit echtem Pfad (`/entries/<id>`).
- `BHSelect` mit Tastaturbedienung und Bottom-Sheet auf dem Handy.
- Bearer-API `/api/external/*` mit selbstverwalteten API-Keys (gespeichert wird nur der SHA-256-Hash), Datei-Upload mit Typ- und Größenprüfung.
- Eigene Fehlerseiten für 401, 403, 404 und 500, unter `/api/` als JSON, nie mit Stacktrace.
- Hinweis „Neue Version verfügbar“ über `/api/build-id`, Cache-Buster an jedem Asset.
- `manifest.webmanifest`, Favicon und App-Icons aus dem Logo, siehe „Icons und Favicon“.

## Icons und Favicon (Pflicht)

Jede Web-App hat diesen Satz und **ein eigenes Motiv**: gleiche blaue Verlaufskachel wie das Logo, darauf ein weißes Motiv, das zur App passt. Das „B“ bleibt der Plattform vorbehalten. Das Motiv steht in `scripts/app-icon.json` als SVG-Pfad auf einem 64er Raster, mittig um 32,32 und etwa 32 bis 38 Einheiten breit, ohne Farben. Das Gerüst bringt ein Platzhalter-Motiv mit, das vor dem ersten Ausrollen ersetzt wird. Icons nie von Hand zeichnen oder einzeln tauschen, sondern immer erzeugen:

```bash
node scripts/make-app-icons.mjs --out public
```

| Datei | Größe | Zweck |
|---|---|---|
| `public/favicon.svg` | Vektor | Browser-Tab |
| `public/branding/apple-touch-icon.png` | 180 px, randlos | iPhone-Startbildschirm |
| `public/branding/icon-192.png` | 192 px, runde Ecken | App-Icon (Manifest) |
| `public/branding/icon-512.png` | 512 px, runde Ecken | App-Icon groß (Manifest) |
| `public/branding/icon-maskable-512.png` | 512 px, randlos, Logo auf 80 % | Android schneidet es selbst zu |
| `public/branding/nav-icon.svg` | Vektor | Navbar auf Blau, 24 px |
| `public/branding/icons.stamp.json` | | Prüfsumme, welches Logo erzeugt wurde |
| `public/manifest.webmanifest` | | Name, `theme_color` und `background_color` `#1d4ed8`, alle Icons oben |

Jede HTML-Seite verlinkt im `<head>` genau einmal:

```html
<link rel="icon" type="image/svg+xml" href="__APP_BASE__/favicon.svg?v=2">
<link rel="apple-touch-icon" href="__APP_BASE__/branding/apple-touch-icon.png?v=2">
<link rel="manifest" href="__APP_BASE__/manifest.webmanifest">
<meta name="theme-color" content="#1d4ed8">
```

Regeln:

- Icons und Manifest sind ohne Anmeldung erreichbar, sonst fehlen sie auf der Login-Seite.
- Ändert sich ein Icon, `?v=` überall hochzählen, sonst zeigen Browser das alte.
- Wer eine Content-Security-Policy setzt, braucht `manifest-src 'self'`.
- Ein Dienst an der Wurzel der Domain beantwortet zusätzlich `/favicon.ico`.
- Die Suite `branding` und `scripts/validate.sh` prüfen das. Fehlt etwas, ist das Rot.

## Vorlagen ändern

Änderungen an Vorlagen passieren hier in `templates/`, nicht in einzelnen Apps. Platzhalter und Aufbau: `templates/README.md`.

Commit und Pull Request: Skill `bh-github`.

## Ausrollen

Apps laufen im Container `bh-apps` unter `apps.<domain>/<slug>/`, nur nach Anmeldung, und erscheinen automatisch in der App-Übersicht. Dafür die App mit `--base /<slug>` anlegen. Das Ausrollen erledigt ein Admin auf dem Server mit `bhapp deploy <slug> <pfad>`; rote Tests rollen nichts aus.

## Style Guide

Farben, Ecken, Schrift und Komponenten stehen im Skill `bh-styleguide`; er gilt für jede Oberfläche.

## Standard: Navbar und Benutzermenü (verbindlich)

Gilt für jede Oberfläche der BH Platform, auch den Anmeldedienst `bh-auth`. Nicht pro App neu erfinden.

| Element | Vorgabe |
|---|---|
| Navbar | 52 px hoch, volle Breite, Farbe `--bh-navbar`, links BH-Kachel und Name, daneben die Tabs |
| Aktiver Tab | Linie an der Unterkante in `--bh-navbar-accent` |
| Rechts oben | Ausschließlich das Benutzermenü, Seitenknöpfe gehören in den Seitenkopf |
| Menü-Knopf | Avatar mit Initialen, Name, Pfeil; Schmal: nur Avatar und Pfeil |
| Menü-Kopf | Name, E-Mail, Rolle |
| Einträge, in dieser Reihenfolge | App-Übersicht (`/`), Mein Profil (`/profile`), Design Hell/Dunkel, Abmelden (`POST /logout`, rot, durch Linie getrennt) |
| Rollen | Admin-Einträge nur für Admins anzeigen, nie ausgegraut |
| Bedienung | Esc und Klick daneben schließen; Design wird unter `bh-theme` gespeichert |

Quelle sind `components/bh-user-menu.js` und `css/bh-user-menu.css`. Änderungen an diesem Standard immer zugleich hier und in `bh-auth` (`lib/views.js`, `public/shell.css`) vornehmen.

