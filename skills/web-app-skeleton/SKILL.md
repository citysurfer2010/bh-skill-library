---
name: web-app-skeleton
description: Legt eine neue Web-App im BH-Standard an (Express, SQLite, blaues Design, Rollen, Tests, Pflicht-Dokus). Nutzen, sobald eine neue App oder ein neues Tool mit Weboberflaeche entstehen soll.
---

# Web-App-Skeleton

Neue Apps immer hiermit anlegen, nie von Hand von null beginnen.

```bash
/etc/devbox/skills/web-app-skeleton/scripts/new-app.sh <slug> "<Titel>" [port]
cd ~/projects/<slug>
npm install
npm test
DEV_USER_EMAIL=ich@beispiel.de DEV_USER_ROLE=admin npm start
```

Ansehen vom Laptop: `ssh -L 3000:localhost:3000 -p <port> dev@<server>`, dann `http://localhost:3000`.

## Was entsteht

| Datei | Zweck |
|---|---|
| `server.js`, `routes/`, `lib/` | Express-App, klein und modular |
| `lib/auth.js` | Angemeldeter User und Rollen aus den Kopfzeilen des BH-Auth-Dienstes |
| `lib/db.js` | SQLite mit Migrationen |
| `public/css/tokens.css` | Alle Farben und Abstaende an einer Stelle |
| `PRODUCT_CONTEXT.md`, `DEVELOPMENT.md`, `LIMITATIONS.md` | Pflicht-Dokus, vor jeder Aenderung lesen |
| `test/` | Fuenf Pflicht-Suiten: validate, smoke, rbac, restart, e2e |

## Regeln

1. **Tests zuerst:** `npm test` muss vor jedem Commit gruen sein.
2. **Rollen-Frage vor jedem Endpoint:** Neue Route bekommt `requireRole` oder bewusst `requireUser`,
   plus Eintrag in `test/rbac.test.js`.
3. **Oberflaeche nach Rolle filtern:** Was jemand nicht darf, wird nicht angezeigt.
4. **Farben nur als Tokens** aus `tokens.css`, nie als feste Werte im Code.
5. **KI-Aufrufe nur ueber das Gateway** (`http://llm-gateway:18790/v1`), nie direkt beim Anbieter.
6. **Geheimnisse nur in `.env`**, nie im Repo.
7. Neue Fehlerlehre: Eintrag in `LIMITATIONS.md` und ein Regressionstest im selben Commit.
8. Dateien klein halten (Richtwert 200 Zeilen).

Commit und Pull Request: Skill `github`.
