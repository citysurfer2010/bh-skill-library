# Bekannte Einschränkungen: BH Netatmo

- Der Web-Login ist keine offizielle Schnittstelle und kann sich jederzeit ändern. Stabiler wäre eine App mit `BH_NETATMO_CLIENT_ID` und `BH_NETATMO_CLIENT_SECRET`.
- Im Konto sind nur Thermostatventile und Relais, keine Wetterstation. Außen-, CO2- und Luftfeuchtewerte gibt es deshalb nicht.
- Es wird nur das erste Zuhause mit Räumen gelesen.
- Das Sitzungstoken liegt auf dem Server in `/srv/mcp-gateway/family/netatmo.db`, nur für den Dienst lesbar.
- Die Beamer-App fragt alle 10 Minuten ab, auch wenn der Beamer aus ist.
- Der Heizplan wird nur angezeigt. Umschalten zwischen Arbeitswoche und Urlaub geht noch nicht.
