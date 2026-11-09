# Business Logic: BH iCloud Photos

- Neue iCloud-Fotos kommen über den VPS, nicht über den Mac. Quelle: Matti, 09.11.2026. Der Altbestand läuft über das Mac-Skript `platform/home-link/mac-icloud-photos.sh`.
- Geholt werden täglich nur die neuesten 500 Fotos ohne Videos, damit die Platte des VPS nicht volläuft.
- In iCloud wird nie etwas gelöscht.
- Das Apple-Passwort wird nur auf der Anmeldeseite eingegeben und liegt nur im Arbeitsspeicher des Containers, nicht in einer Datei. Die Sitzung liegt in `/srv/icloud-photos/cookies`.
- Die Anmeldeseite öffnet nur der Besitzer des Arbeitskalenders, also Matti. Fremde Herkunft wird bei Formularen abgewiesen.
- Der Container hat Internet, aber keinen Zugang zur Synology, zum Gateway oder zu anderen Diensten außer der Beamer-App, die seine Anmeldeseite durchreicht.
