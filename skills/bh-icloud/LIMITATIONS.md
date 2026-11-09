# BH iCloud: Bekannte Grenzen

## Noch zu prüfen

- Getestet ist alles nur gegen nachgebaute Server. Der erste Lauf gegen ein echtes iCloud-Konto steht aus.
- Offen ist vor allem, ob iCloud Terminserien serverseitig auflöst (`expand`). Tut es das nicht, kommen Serien mit dem Feld `recurrence` und dem ersten Termin; eigene Auflösung wäre dann nachzubauen.

## Nicht enthalten

- **iCloud Drive, Fotos, Notizen:** Apple bietet dafür keine offizielle Schnittstelle. Inoffizielle Wege brauchen das echte Apple-Passwort samt Zwei-Faktor-Sitzung und brechen ohne Vorwarnung.
- **Erinnerungen:** Neuere Erinnerungslisten sind über CalDAV nicht mehr vollständig lesbar. Darum gibt es dafür kein Werkzeug.
- **Schreiben:** Termine anlegen, Mails senden, Kontakte ändern gibt es bewusst nicht.

## Grenzen

- Mails werden bis 2 MB geladen, Text bis 64 KB ausgegeben (`truncated: true`). Anhänge erscheinen nur mit Name, Typ und Größe.
- Ordnernamen mit Umlauten erscheinen in IMAP-Schreibweise (zum Beispiel `&APw-`). Sie funktionieren, wenn man sie genau so weitergibt.
- Die Antwort von iCloud ist auf 24 MB begrenzt. Sehr große Kalender in langen Zeiträumen schlagen dann mit einer Meldung fehl.
