# Business Logic: BH iCloud

## Regeln

- Jeder User nutzt nur sein eigenes Konto. Es gibt keinen geteilten Familienzugang und keine Zugangsdaten in der zentralen `.env`.
- Angenommen werden nur app-spezifische Passwörter. Das normale Apple-Passwort wird schon beim Verbinden abgelehnt und nie an Apple geschickt.
- Verbinden und Trennen macht jeder User selbst im Profil. Das Passwort geht von der Profilseite direkt ans Gateway, `bh-auth` speichert es nicht.
- Vor dem Speichern prüft das Gateway die Anmeldung bei iCloud. Nach 5 Fehlversuchen ist 15 Minuten Pause, damit Apple das Konto nicht sperrt.
- Lehnt iCloud später eine Anmeldung ab, sind weitere Versuche für 1 Stunde gesperrt oder bis der User neu verbindet. Kalender/Kontakte und Mail werden getrennt gesperrt.
- Mail-Sitzungen werden bis 90 Sekunden ohne Verkehr wiederverwendet, das Adressbuch 5 Minuten zwischengespeichert.
- Zugangsdaten gehen nur per https an `icloud.com` und per TLS an `imap.mail.me.com`. Eine Weiterleitung auf eine andere Adresse wird abgebrochen.
- Mail bleibt ungelesen: Ordner werden schreibgeschützt geöffnet (`EXAMINE`), Inhalte mit `BODY.PEEK` geholt.
- Die Apple-ID ist nicht immer die Mail-Adresse. Beim Verbinden lässt sich eine eigene iCloud-Mail-Adresse angeben, sonst gilt die Apple-ID.

## Zeiten

- Tage in `from` und `to` sind Kalendertage in Europe/Berlin, `to` zählt mit.
- Bei ganztägigen Terminen ist `end` der letzte belegte Tag, nicht wie in iCalendar der Tag danach.
- Ein Zeitraum darf höchstens 366 Tage umfassen.

## Kontakte

Das Adressbuch wird je Suche in Blöcken von 100 Karten geladen und auf dem Gateway durchsucht. Fotos werden nicht angefordert, Gruppen übersprungen. Telefonnummern werden ab 4 Ziffern verglichen.

## Fotos

Für Fotos gelten eigene Regeln, weil Apple dafür keine offizielle Schnittstelle bietet.

- Neue iCloud-Fotos sollen über den VPS kommen, nicht über den Mac. Quelle: Matti, 09.11.2026. Den Altbestand holt das Mac-Skript.
- Der Foto-Abgleich braucht anders als Kalender und Mail das echte Apple-Passwort. Es wird nur auf der Anmeldeseite im Profil eingegeben und liegt nur im Arbeitsspeicher des Containers. Die Sitzung liegt in `/srv/icloud-photos/cookies`.
- Die Anmeldeseite öffnet nur der Besitzer.
- Geholt werden täglich die neuesten 500 Fotos ohne Videos, damit die Platte des VPS nicht volläuft.
- Der Mac sichert Fotos **und Videos**. Quelle: Matti, 10.11.2026. Der VPS lässt Videos wegen seines kleinen Zwischenspeichers aus.
- In iCloud wird nie etwas gelöscht.
- Der Container hat Internet, aber keinen Zugang zur Synology, zum Gateway oder zu anderen Diensten außer `bh-auth`, das seine Anmeldeseite durchreicht.
- Hochgeladen wird nur nach `/photo/iCloud-Matti`, vorhandene Dateien werden nicht überschrieben. Eine Datei alle 8 Sekunden, damit die kleine Synology nicht überlastet. `nas-pause` im Familienordner stoppt das.
- Auf dem Server bleiben die neuesten 700 Dateien liegen, damit der tägliche Download sie wiedererkennt. Ältere gehen erst nach dem Hochladen weg.
