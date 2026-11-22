# BH Finanzen: Bekannte Grenzen

- Bankabruf für comdirect, BBBank, DKB und PayPal. Die Enable-Banking-Anwendung ist eingeschränkt: nur Konten, die Matti im Kontrollzentrum verknüpft hat, sind abrufbar (neues Konto → dort zuerst verknüpfen). Ob comdirect die Kreditkarte über PSD2 liefert, ist offen; sonst bleibt sie beim CSV-Import.
- Wie weit zurück eine Bank liefert, legt sie fest; ältere Monate per CSV nachtragen.
- Der Bankschlüssel liegt im gemeinsamen Geheimnis-Ordner des App-Containers; alle Apps dort laufen als derselbe Benutzer und könnten ihn lesen.
- Der Abgleich CSV ↔ Bank nutzt Betrag und Datum; zwei gleich hohe Buchungen in derselben Woche können vertauscht verknüpft werden (Summen bleiben richtig).
- Beim PayPal-Abruf über Enable Banking ist noch offen, wie Aufladungen aussehen; erkennt der CSV-Filter sie dort nicht, nach dem ersten Abruf als TRANS zuordnen oder den Filter nachziehen.
- Die Tabellen 2017 und die Haushaltspläne 2007–2014 sind nur Monatssummen ohne Einzelbuchungen und nicht übernommen.
- Immobilien- und Treuhandkonten werden noch nicht eigens ausgewertet (z. B. Ergebnis je Wohnung); sie sind nur sichtbar und aus dem Haushalt herausgenommen.
- Amazon: Bei Abbuchungen ohne Bestellnummer im Text und bei Bestellungen ohne Datum fehlt manchmal die Zuordnung zu den Artikeln.
- Depotwerte (Kursstand) fehlen; ausgewertet werden nur Einzahlungen in Investments und Rücklagen.
- Liefert eine Bank denselben Umsatz mit anderem Text, erkennt die Dublettenprüfung ihn nicht.
- Die MCP-Werkzeuge lesen nur. Wer sie bekommt, steht doppelt: in `servers.json` (`users`) und in der Liste „Wer die Finanzen sieht“; neue Personen in beiden eintragen.
- Sicherungen der Datenbank laufen nicht automatisch.
- Darlehenskonten kommen nicht über die Banking-API: Enable Banking beruht auf PSD2, und das umfasst nur Zahlungskonten. Bei der BBBank liefert die Verbindung nur das Girokonto (geprüft 15.11.2026). Restschuld und Zinssatz kommen deshalb aus den Darlehensauszügen in Drive (`scripts/import-loan-statements.js`) und werden mit den Raten fortgeschrieben.
- FinTS/HBCI für Darlehen und Depots braucht eine Produktregistrierung bei der Deutschen Kreditwirtschaft (hbci-zka.de). Das Formular muss per E-Mail geschickt werden, die Anmeldung dauert etwa 14 Tage. Ohne registrierte Produkt-ID lehnen die Banken den Zugriff ab; fremde IDs sind nicht zulässig. Bis dahin gibt es keinen FinTS-Abruf. Danach: `BH_FINTS_PRODUCT_ID` sowie Kennung und PIN je Bank in die `.env`.
- PayPal und Kreditkarte sind Geldbörsen: Die Abbuchung bei der Bank zählt nur als Geldtransfer, solange das PayPal- bzw. Kreditkartenkonto für diesen Zeitraum selbst importiert ist (7 Tage Spielraum, `lib/wallets.js`). Sonst ist sie die Ausgabe selbst: PayPal mit dem Händler aus dem Text (sichere gelernte Regel bucht, sonst Vorschlag), die Kreditkarten-Monatsabrechnung bleibt offen, weil die Einzelumsätze fehlen. Stand 22.11.2026: PayPal ist nicht über die Banking-API angebunden (letzte Daten 12/2025 aus der alten Tabelle), das Kreditkartenkonto endet 09/2024. Für vollständige Ausgaben beide wieder anbinden oder als CSV importieren.
- Geldtransfers gelten nur innerhalb eines Bereichs. Zwischen Privat- und Immobilienkonto bucht die Privatseite „Überschuss aus Immobilien“ (Eingang) bzw. „Ausgaben für Immobilien“ (Ausgang).

