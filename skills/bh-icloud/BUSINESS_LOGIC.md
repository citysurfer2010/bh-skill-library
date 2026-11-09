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
