# Templates

Vorlage für neue Web-Apps. `setup/init.sh` kopiert `new-web-app/app/`, ersetzt die Platzhalter und entfernt die Endung `.tmpl`.

## Platzhalter

| Platzhalter | Beispiel | Bedeutung |
|---|---|---|
| `__SLUG__` | `ideen-board` | Ordner- und Paketname, Schlüssel für lokalen Speicher |
| `__APP_NAME__` | `Ideen-Board` | Titel in Navbar und Seitentitel |
| `__APP_BASE__` | leer oder `/ideen` | Pfad-Präfix hinter einem Proxy |
| `__PORT__` | `3050` | Standard-Port, zur Laufzeit über `PORT` änderbar |
| `__NS__` | `IdeenBoard` | Namensraum im Frontend, zum Beispiel `IdeenBoardApi` |
| `__SHORT_LABEL__` | `Ideen` | Sidebar-Titel und PWA-Kurzname |
| `__DESCRIPTION__` | `Ideen sammeln` | Paket- und PWA-Beschreibung |
| `__API_KEY_PREFIX__` | `bhide_` | Präfix der API-Keys |

## Laufzeit-Umgebung

| Variable | Bedeutung |
|---|---|
| `PORT`, `HOST` | Adresse, Standard ist nur `127.0.0.1` |
| `DATA_DIR` | Datenbank, Uploads, Log; Standard `./data` |
| `TRUST_PROXY_AUTH` | `1` = Kopfzeilen des BH-Auth-Proxys gelten |
| `DEV_USER_EMAIL`, `DEV_USER_ROLE` | Nur lokal und nur ohne `TRUST_PROXY_AUTH=1` |

## Icons neu erzeugen

`node scripts/make-app-icons.mjs --out public` zeichnet die Marke „BH“ ohne Browser in `favicon.svg` und `branding/*`. Die Testsuite `branding` prüft das Ergebnis. Wenn sich ein Icon ändert, `?v=` in `index.html`, `admin.html`, `manifest.webmanifest` und `navbar.js` hochzählen.

## Tests in der Vorlage

Neue Suiten in `test/run-all.sh` eintragen. Eine Suite muss rot werden können: Jede neue Regel braucht einen Fall, der sie verletzt.
