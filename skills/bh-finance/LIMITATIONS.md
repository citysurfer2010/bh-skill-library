# BH Finanzen: Bekannte Grenzen

- Bankabruf für comdirect, BBBank, DKB und PayPal. Die Enable-Banking-Anwendung ist eingeschränkt: nur Konten, die Matti im Kontrollzentrum verknüpft hat, sind abrufbar (neues Konto → dort zuerst verknüpfen). Ob comdirect die Kreditkarte über PSD2 liefert, ist offen; sonst bleibt sie beim CSV-Import.
- Wie weit zurück eine Bank liefert, legt sie fest; ältere Monate per CSV nachtragen.
- Der Bankschlüssel liegt im gemeinsamen Geheimnis-Ordner des App-Containers; alle Apps dort laufen als derselbe Benutzer und könnten ihn lesen.
- Der Abgleich CSV ↔ Bank nutzt Betrag und Datum; zwei gleich hohe Buchungen in derselben Woche können vertauscht verknüpft werden (Summen bleiben richtig).
- Beim PayPal-Abruf über Enable Banking ist noch offen, wie Aufladungen aussehen; erkennt der CSV-Filter sie dort nicht, nach dem ersten Abruf als TRANS zuordnen oder den Filter nachziehen.
- Die Tabellen 2017 und die Haushaltspläne 2007–2014 sind nur Monatssummen ohne Einzelbuchungen und nicht übernommen.
- Amazon-Bestellungen (welches Produkt hinter einer Abbuchung steckt) fehlen noch.
- Depotwerte (Kursstand) fehlen; ausgewertet werden nur Einzahlungen in Investments und Rücklagen.
- Liefert eine Bank denselben Umsatz mit anderem Text, erkennt die Dublettenprüfung ihn nicht.
- MCP-Werkzeuge für Zottel fehlen noch.
- Sicherungen der Datenbank laufen nicht automatisch.
