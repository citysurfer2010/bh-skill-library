# Beamer: Entwicklung

> Das **Wie**: Aufbau, Anmeldung, Tests. Vor jeder Änderung lesen, dazu PRODUCT_CONTEXT.md und LIMITATIONS.md.

## Aufbau

```
server.js              Kern: öffentliche Routen, Anmeldung, Seiten, Fehlerseiten
routes/<modul>.js      Express-Router je Modul, nicht inline in server.js
lib/                   auth, db (node:sqlite), llm, error-page, assets, api-keys, config
public/
  index.html           Nur <link> und <script>
  css/                 tokens.css (alle Farben), je Datei ein Thema, Bündel /bh-styles.css und /app.css
  components/          BHAppShell, BHListPage, BHDataTable, BHSideDrawer, BHSelect, AppShell, Navbar … als /app.js
  components/pages/    Seiten-Orchestratoren (Daten laden, zeichnen)
scripts/               app.sh (start/stop/restart/status), make-app-icons.mjs
test/                  run-all.sh, Pflicht-Suiten und Ratchets
```

Regel: höchstens 200 Zeilen je Datei. Das Commit-Gate blockt neue oder wachsende größere Dateien.

## Starten

```bash
DEV_USER_EMAIL=ich@beispiel.de DEV_USER_ROLE=admin npm start   # lokal
bash scripts/app.sh start                                      # im Hintergrund, Log in data/app.log
```

## Anmeldung und Rollen

Hinter dem BH-Auth-Proxy `TRUST_PROXY_AUTH=1` setzen: Es gelten `X-User-Email`, `X-User-Name`, `X-User-Role`. Die App darf dann nur über den Proxy erreichbar sein, deshalb lauscht sie standardmäßig auf 127.0.0.1. Ohne `TRUST_PROXY_AUTH=1` werden die Kopfzeilen ignoriert und nur `DEV_USER_EMAIL` und `DEV_USER_ROLE` zählen. Ohne gültige E-Mail gibt es 401, eine unbekannte Rolle ist `user`.

Neue Route: erst die Rollen-Frage, dann `requireRole('admin')` oder bewusst nur Anmeldung, dann ein Eintrag in `test/rbac.test.js`. Die Oberfläche filtert nach `user.role`, statt auszugrauen.

## KI-Aufrufe

Nur über `lib/llm.js`: Gateway `http://llm-gateway:18790/v1`, Token aus `/etc/devbox/llm/token`, Modelle `tier:fast`, `tier:balanced`, `tier:quality`. Nie direkt beim Anbieter.

## Oberfläche (Pflicht)

- **Farben:** nur `--bh-*` aus `public/css/tokens.css`, hell und dunkel.
- **Dropdown:** `BHSelectCore`: `<div data-bh-select data-options='[{"value":"a","label":"A"}]'>` + `BHSelectCore.mountAll(root)`. Kein natives `<select>`.
- **Tabellen:** nur `BHDataTable` über `BHListPage`, mit `storageKey`, nie in einer `.card`. Ausnahme ist `AppShell.list` für kleine statische Listen.
- **Rahmen:** `Navbar.render(tab, me)`, `ModuleSidebar.show(...)`, `AppShell.crumbs(...)`. Seitenknöpfe gehören in den Seitenkopf.
- **Laden:** Rahmen vor dem ersten Request zeichnen, `AppShell.loading` bis die Daten da sind, Links im Modul über `AppShell.links`.
- **Keine Browser-Popups:** kein `window.alert/confirm/prompt`.
- **Icons:** `node scripts/make-app-icons.mjs --out public`, nie von Hand. Nach einer Änderung `?v=` hochzählen.

## Tests

```bash
npm test
```

Startet eine Wegwerf-Instanz auf Port + 36000 mit eigenem `DATA_DIR` unter `.test-tmp/`, nie die laufende App. Alle Suiten und die Coverage-Schwelle müssen grün sein, bevor committet wird. Neues Feature oder neuer Endpoint: neue Testzeile im selben Commit. Neue Lesson Learned: `test/regression-<slug>.test.js`.

## Neue Version

Das Frontend pollt `/beamer/api/build-id` alle 60 s und zeigt bei einer neuen `BUILD_ID` einen Hinweis, ohne automatisch neu zu laden.

## Commit

Commit und Pull Request: Skill `bh-github`. Das Commit-Gate installiert `setup/install-precommit.sh` aus dem Skill `bh-webapp-skeleton`.
