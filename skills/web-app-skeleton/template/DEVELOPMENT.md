# {{TITLE}}: Entwicklung

## Start

    npm install
    npm test
    DEV_USER_EMAIL=ich@beispiel.de DEV_USER_ROLE=admin npm start

## Aufbau

`server.js` baut die App, `routes/` enthaelt die Endpunkte, `lib/` Anmeldung und Datenbank,
`public/` die Oberflaeche. Tabellen entstehen nur ueber neue Eintraege in `MIGRATIONS` (`lib/db.js`).

## Betrieb

Die App lauscht nur lokal und laeuft hinter dem BH-Auth-Proxy mit `TRUST_PROXY_AUTH=1`.
Ohne Proxy darf dieser Wert nie gesetzt sein, sonst koennte jeder die Kopfzeilen faelschen.
