# BH iCloud: Bekannte Grenzen

## Noch zu prüfen

- Getestet ist alles nur gegen nachgebaute Server. Der erste Lauf gegen ein echtes iCloud-Konto steht aus.
- Offen ist vor allem, ob iCloud Terminserien serverseitig auflöst (`expand`). Tut es das nicht, kommen Serien mit dem Feld `recurrence` und dem ersten Termin; eigene Auflösung wäre dann nachzubauen.

## Nicht enthalten

- **iCloud Drive, Notizen:** Apple bietet dafür keine offizielle Schnittstelle. Fotos laufen deshalb über das eigene Werkzeug icloudpd (siehe unten).
- **Erinnerungen:** Neuere Erinnerungslisten sind über CalDAV nicht mehr vollständig lesbar. Darum gibt es dafür kein Werkzeug.
- **Schreiben:** Termine anlegen, Mails senden, Kontakte ändern gibt es bewusst nicht.

## Grenzen

- Mails werden bis 2 MB geladen, Text bis 64 KB ausgegeben (`truncated: true`). Anhänge erscheinen nur mit Name, Typ und Größe.
- Ordnernamen mit Umlauten erscheinen in IMAP-Schreibweise (zum Beispiel `&APw-`). Sie funktionieren, wenn man sie genau so weitergibt.
- Die Antwort von iCloud ist auf 24 MB begrenzt. Sehr große Kalender in langen Zeiträumen schlagen dann mit einer Meldung fehl.

## Fotos

- Das Hochladen vom VPS braucht mindestens DSM 7.1.1. Unter DSM 7.0.1 antwortete `SYNO.FileStation.Upload` auf der DS215j mit Fehler 102; seit dem Update am 10.11.2026 funktioniert es.
- Ob Apple Anmeldungen aus dem Rechenzentrum dauerhaft akzeptiert, ist noch nicht erprobt. Die erste Anmeldung am 09.11.2026 hat geklappt.
- Etwa alle zwei Monate läuft die Apple-Sitzung ab, nach einem Neustart des Containers ist die Anmeldung nötig. Benachrichtigt wird darüber noch nicht.
- Die Anmeldeseite stammt von icloudpd und folgt nicht dem Plattform-Design.
- Mehr als 500 neue Fotos zwischen zwei Läufen würden nicht vollständig erfasst.
- Das Hochladen würde mit Mattis Synology-Konto schreiben. Auf einen Ordner begrenzt ist es durch den Code, nicht durch die Rechte des Kontos.
- `bh-faces` und die Slideshow nehmen die iCloud-Fotos noch nicht auf (HEIC).
