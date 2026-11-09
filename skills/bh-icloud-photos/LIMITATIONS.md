# BH iCloud Photos: Bekannte Grenzen

- Die Beamer-App verliert beim Neu-Ausrollen die Verbindung zur Anmeldeseite, der Abgleich `reconcile` stellt sie innerhalb von Sekunden wieder her.
- Das Hochladen schreibt mit Mattis Synology-Konto. Auf einen Ordner begrenzt ist es durch den Code, nicht durch die Rechte des Kontos.
- Ob Apple Anmeldungen aus dem Rechenzentrum dauerhaft akzeptiert, ist noch nicht erprobt.
- Etwa alle zwei Monate läuft die Apple-Sitzung ab, und nach einem Neustart des Containers ist die Anmeldung nötig. Benachrichtigt wird darüber noch nicht.
- Die Anmeldeseite stammt von icloudpd und folgt nicht dem Plattform-Design.
- Mehr als 500 neue Fotos zwischen zwei Läufen würden nicht vollständig erfasst.
