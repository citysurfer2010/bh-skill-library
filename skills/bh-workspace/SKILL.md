---
name: bh-workspace
description: Baut für jeden User automatisch Arbeitsumgebung, Web-Terminal-Zugang und eigene Subdomain. Nutzen, wenn es um neue User, das Web-Terminal, opencode im Browser oder eigene Apps auf der Subdomain geht.
---

# Skill: BH Workspace

## Zweck

Jeder User bekommt nach der Registrierung ohne Zutun einen eigenen Container, einen Zugang über das Web-Terminal und eine eigene Subdomain für seine Apps.

## So entsteht die Umgebung eines neuen Users

1. Der Admin lädt die Person ein, sie nimmt die Einladung an und legt ein Passwort fest oder nutzt Google.
2. Der Abgleich auf dem Server (`bh-workspace-reconcile`, alle 15 Sekunden) findet den User über `bin/list-users.js` in bh-auth.
3. Aus der E-Mail entsteht der Name: `anna@beispiel.de` wird `anna`. Bei Doppelung oder reservierten Namen `anna-2`. Die Zuordnung steht dauerhaft in `/srv/bh-terminal/state/map.json`.
4. Status `preparing`: Das Web-Terminal zeigt „Umgebung wird vorbereitet …“.
5. `devbox add` legt Container, Netz, 10-GB-Home und LLM-Token an.
6. Der Dienst-Schlüssel kommt mit `restrict,pty` in den Container, der Hostschlüssel zum Web-Terminal, `bh-terminal` und `bh-edge` ins Netz des Users.
7. Status `ready`: Das Terminal öffnet sich von selbst. Bei `failed` startet nach 10 Minuten ein neuer Versuch.

## Web-Terminal (App `apps/terminal`, Pfad `/terminal/`)

- Mehrere Tabs. Sitzungen laufen in tmux und überstehen Neuladen und Verbindungsabbrüche.
- Knopf „opencode starten“, Suche, Schriftgröße, Links, Unicode, Kopieren über OSC 52, Tasten-Leiste am Handy.
- Bilder und Dateien einfügen oder hineinziehen: landen in `~/uploads`, der Pfad wird ins Terminal geschrieben.
- Bilder anzeigen: Vorschau in „Bilder“, im Terminal mit `bh-show bild.png`.

## Subdomain und Routen

- Adresse: `<name>.<domain>`, nur nach Anmeldung an der Plattform erreichbar.
- Eine App lauscht auf einem Port im Container, die Route legt der User fest:

```bash
bh-route add /spiel 3001
bh-route list
bh-route rm /spiel
```

- Dasselbe geht im Web-Terminal unter „Meine Apps“. `bh-router` im Container verteilt die Anfragen und entfernt den Pfad vor der Weitergabe. Das Präfix steht in `X-Forwarded-Prefix`.

## Einrichten

```bash
bash /opt/bh-skill-library/skills/bh-workspace/setup/setup.sh [email=name ...]
python3 /opt/bh-skill-library/platform/edge/setup-cloudflare.py
```

Bestehende Umgebungen werden mit `email=name` zugeordnet.
