# BH Finanzen: Bekannte Grenzen

- Konten werden noch nicht direkt abgerufen, nur per CSV-Import. Geplant ist der Abruf per PSD2 über Enable Banking.
- PayPal und die comdirect-Kreditkarte haben keine IBAN und bleiben auch mit PSD2 beim CSV-Import.
- Depotwerte (Kursstand) fehlen; ausgewertet werden nur Einzahlungen in Investments und Rücklagen.
- Liefert eine Bank denselben Umsatz mit anderem Text, erkennt die Dublettenprüfung ihn nicht.
- MCP-Werkzeuge für Zottel fehlen noch.
- Sicherungen der Datenbank laufen nicht automatisch.
