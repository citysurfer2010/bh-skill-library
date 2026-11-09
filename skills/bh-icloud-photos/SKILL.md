---
name: bh-icloud-photos
description: Holt neue Fotos aus iCloud auf den Server. Nutzen, wenn es um den Abgleich der iCloud-Fotos, die Apple-Anmeldung dafür oder ausbleibende neue Bilder geht.
---

# Skill: BH iCloud Photos

## Zweck

Neue iCloud-Fotos kommen ohne laufenden Mac auf den Server. Stufe 1 ist der Download mit Anmeldung, das Hochladen auf die Synology folgt als Stufe 2.

## Anmeldung

Matti öffnet `https://apps.familiebiskup.de/beamer/icloud-login/` und gibt dort Apple-Passwort und 2FA-Code ein. Nie im Chat danach fragen. Nach einem Neustart des Containers muss die Anmeldung wiederholt werden.

## Betrieb

Einrichten mit `setup/setup.sh`, Apple-ID in der `.env` als `BH_ICLOUD_PHOTOS_USER`. Dateien liegen unter `/srv/icloud-photos/inbox`.

Regeln und Grenzen: `BUSINESS_LOGIC.md`, `LIMITATIONS.md`.
