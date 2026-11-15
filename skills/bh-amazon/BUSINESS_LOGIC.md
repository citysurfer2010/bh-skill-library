# Business Logic: BH Amazon

- Nur lesen. Der Dienst bestellt nichts, ändert nichts und speichert kein Passwort.
- Matti meldet sich einmal in der Finanz-App an (keine Zwei-Faktor-Anmeldung eingerichtet). Fragt Amazon trotzdem nach Code, Captcha oder Freigabe, reicht die App das durch.
- Quelle für die Zuordnung ist „Ihre Zahlungen → Transaktionen“: Amazon bucht je Lieferung ab, diese Seite zeigt jede einzelne Belastung mit Bestellnummer. 94 % der Amazon-Abbuchungen auf dem Konto tragen die Bestellnummer im Verwendungszweck.
- Schonend: eine Seite nach der anderen mit Pause, höchstens 60 Bestelldetails je Abruf, täglich nur neue Zahlungen.
- Läuft die Sitzung ab, meldet der Dienst 409 `login`; die App zeigt „Amazon neu verbinden“.
