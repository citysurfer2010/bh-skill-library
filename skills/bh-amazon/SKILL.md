---
name: bh-amazon
description: Liest die Amazon-Zahlungen (Ihre Zahlungen → Transaktionen) und die Artikel je Bestellung mit einem Browser im eigenen Container und gibt sie der Finanz-App, die sie den Abbuchungen zuordnet. Nutzen, wenn es um Amazon-Bestellungen, Amazon-Abbuchungen oder „was war das für ein Kauf“ geht.
---

# Skill: BH Amazon

## Zweck

Amazon bietet Privatkunden keine Schnittstelle zur Bestellhistorie. Am 15.11.2026 fiel die Entscheidung für den Browser-Weg: Ein Browser im Container `bh-amazon` hält die Amazon-Sitzung und liest nur.

## Aufbau

| Baustein | Aufgabe |
|---|---|
| `worker/lib/login.js` | Anmeldung als kurzer Dialog: E-Mail und Passwort, danach Code, Captcha oder Freigabe, wie Amazon fragt |
| `worker/lib/session.js` | Browser, gespeicherte Sitzung (`/srv/bh-amazon/state/session.json`, 600), nie das Passwort |
| `worker/lib/fetch.js` | Zahlungsseite zurückblättern bis zu einem Datum; Artikel je Bestellung |
| `worker/lib/parse.js` | Liest Zeilen über Text und Muster (Bestellnummer, Betrag, Datum), nicht über Seitenbausteine |
| `worker/server.js` | HTTP im Netz `bh-apps-net`, Port 3800, jeder Aufruf mit Schlüssel |
| `setup/setup-amazon.sh` | Baut und startet den Container, legt den Schlüssel an |

## Ausrollen

`bash /opt/bh-skill-library/skills/bh-amazon/setup/setup-amazon.sh` (Root auf dem BH-Server). Der Schlüssel `BH_AMAZON_TOKEN` liegt in `/srv/bh-platform/.env`, für die Apps unter `/etc/devbox/llm/amazon-token`.

## Schnittstelle

`GET /status` · `POST /login {email,password}` → `{state: ok|code|captcha|approve|error}` · `POST /login/answer {code|captcha}` · `POST /logout` · `POST /payments {since}` → `{payments:[{orderId,date,cents,method}]}` · `POST /items {orderIds}` → `{<id>: [{asin,title,url}]}`. `POST /invoice {orderId}` → `{orderId, source: invoice|summary, pdf}` (PDF base64: Rechnung des Verkäufers, sonst druckbare Bestellübersicht; 23.11.2026 für die Steuererklärung). Abgelaufene Sitzung: 409 mit `code: login`.
