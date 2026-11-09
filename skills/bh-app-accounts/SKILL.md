---
name: bh-app-accounts
description: Best Practices für eigene Benutzerverwaltung in öffentlichen Apps auf der BH Platform. Nutzen, wenn eine öffentliche oder externe App Registrierung, Login, Passwörter, Rollen oder Kundenkonten braucht.
---

# Skill: Benutzerverwaltung in öffentlichen Apps

## Zuerst entscheiden

| Lage | Weg |
|---|---|
| Nur Leute von der Plattform nutzen die App | Keine eigene Verwaltung. Route nicht öffentlich machen, die Plattform liefert `X-User-Email` |
| Öffentlich, aber ohne persönliche Daten | Keine Konten bauen |
| Fremde brauchen Konten | Dieser Skill |

Öffentliche Routen haben keine `X-User-*`-Angaben. `TRUST_PROXY_AUTH` dort nie setzen. Die Plattform-Anmeldung steht Fremden nicht offen.

## Plattform-Regeln

- **`.env` und Datenbank gehören nicht in den App-Ordner.** Der Wächter nimmt sonst die öffentliche Freigabe zurück. Ablage: `~/app-data/<app>/`, Start mit `--env-file ~/app-data/<app>/.env`, Pfad der Datenbank über `DATA_DIR`.
- Öffentliche Apps dürfen das LLM- und MCP-Gateway nicht nutzen.
- Direkter Mailversand über die Ports 25, 465 und 587 ist gesperrt. Mails laufen über die HTTPS-API eines Mail-Anbieters.
- Cookies nie mit `Domain` setzen. Alle Apps teilen sich dieselbe Website, ein Cookie ohne `Domain` bleibt auf dem eigenen Host.

## Anmeldung

Bevorzugt in dieser Reihenfolge: Login per Mail-Link, Google-Login mit eigenem OAuth-Client (`state` und PKCE prüfen), Passwort. Kein selbst erfundenes Verfahren.

**Passwörter**
- Nur als Hash: `crypto.scrypt` aus Node (N=2^17, r=8, p=1) mit eigenem Salt je Konto, Vergleich mit `crypto.timingSafeEqual`. Alternativ argon2id.
- Mindestens 12 Zeichen, keine Zeichenklassen-Pflicht, gängige Passwörter ablehnen.
- Nie loggen, nie per Mail schicken.

**Sitzungen**
- 32 zufällige Bytes als Token, in der Datenbank nur der SHA-256-Hash.
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path` auf die App begrenzt.
- Ablauf nach Inaktivität und mit fester Obergrenze. Beim Login neue Sitzung. Passwortwechsel beendet alle Sitzungen.

**Passwort vergessen und Bestätigung**
- Einmal-Token mit 256 Bit, nur als Hash gespeichert, höchstens 1 Stunde gültig.
- Immer dieselbe Antwort, ob das Konto existiert oder nicht. Das gilt auch für Login und Registrierung.
- Konten erst nach bestätigter Mail-Adresse aktivieren.

## Schutz

- Versuche begrenzen, je Konto und je Adresse, mit wachsender Wartezeit.
- Schreibende Anfragen: `Origin` prüfen und `SameSite` nutzen, damit CSRF ins Leere läuft.
- Rechte immer auf dem Server prüfen. Jede Abfrage nach der Nutzer-ID filtern, damit niemand fremde Datensätze per ID öffnet. Standard ist „verboten“.
- SQL nur mit Platzhaltern, Ausgaben escapen, Uploads nach echtem Typ prüfen, Größen begrenzen.
- Den ersten Admin über einen einmaligen Einladungslink anlegen, nie über ein Standardpasswort.

## Daten und Recht

- Nur erheben, was gebraucht wird. Konto löschen und Daten exportieren muss möglich sein.
- Öffentliche Seiten mit Konten brauchen Impressum und Datenschutzerklärung. Den Text prüft ein Mensch.
- Sicherungen der Datenbank einplanen, sie liegen sonst nur im Container.

## Vor dem Veröffentlichen

Tests für: falsches Passwort, fremde Datensätze, abgelaufene Sitzung, Passwort-Reset doppelt verwenden, Versuchsgrenze. Dann `bh-route public` und das Ergebnis des Wächters unter „Meine Apps“ prüfen.
