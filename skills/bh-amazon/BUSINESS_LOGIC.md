# Business Logic: BH Amazon

- Nur lesen. Der Dienst bestellt nichts, ändert nichts und speichert kein Passwort.
- Zugang in der `.env` (Matti 15.11.2026, ändert die frühere Entscheidung „nur Sitzung“): `BH_AMAZON_EMAIL` und `BH_AMAZON_PASSWORD` in `/srv/bh-platform/.env`; `setup-amazon.sh` gibt sie nur dem Container `bh-amazon` (Datei 400). Läuft die Sitzung ab, meldet sich der Dienst selbst neu an. Fragt Amazon nach Code, Captcha oder Freigabe, reicht die App das durch. Ohne hinterlegten Zugang geht die Anmeldung weiter über das Formular.
- „Verbunden“ gilt nur, wenn Amazon Sitzungs-Cookies ausgegeben hat (`at-acbde`/`sess-at-acbde`/`x-acbde`); eine leere Sitzung ist nie ein Erfolg.
- Historie aus „Meine Bestellungen“ je Jahr (10 je Seite, `startIndex`): Nummer, Datum, Summe, Artikel mit Produktlink. Erster Abruf alle Jahre ab 2021, danach täglich das Vorjahr und das laufende Jahr nur bis zur neuesten bekannten Bestellung. Die Zahlungsseite zeigt nur die letzten Wochen (geprüft 15.11.2026: 18 Einträge, kein Blättern).
- Bestellnummern: physisch `302-…`, digital `D01-…`.
- Quelle für die Zuordnung ist „Ihre Zahlungen → Transaktionen“: Amazon bucht je Lieferung ab, diese Seite zeigt jede einzelne Belastung mit Bestellnummer. 94 % der Amazon-Abbuchungen auf dem Konto tragen die Bestellnummer im Verwendungszweck.
- Schonend: eine Seite nach der anderen mit Pause, höchstens 60 Bestelldetails je Abruf, täglich nur neue Zahlungen.
- Läuft die Sitzung ab, meldet der Dienst 409 `login`; die App zeigt „Amazon neu verbinden“.
