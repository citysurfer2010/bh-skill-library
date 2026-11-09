# Business Logic: BH Netatmo

## Regeln

- Solltemperaturen lassen sich ändern, von 7 bis 30 Grad in halben Schritten und immer befristet. Quelle: Matti, 09.11.2026.
- Der aktive Heizplan wird angezeigt, aber nicht umgeschaltet.
- Zugang über den Web-Login des Familienkontos (`home.netatmo.com`), wie von Matti am 09.11.2026 vorgegeben. Zugangsdaten nur in der `.env`.
- Ein Raum liefert Isttemperatur, Sollwert, Modus, Heizbetrieb, offenes Fenster, Erreichbarkeit und schwache Batterie.
- Schwach heißt: Ein Ventil des Raums meldet `low` oder `very_low`.

## Schonung des Kontos

- Raumwerte gelten 5 Minuten, die Anmeldung 2,5 Stunden.
- Nach einer abgelehnten Anmeldung ist für 30 Minuten kein neuer Versuch möglich.
- Bei 401 oder 403 wird genau einmal neu angemeldet.

## Anzeige auf dem Beamer

- Das Startbild zeigt standardmäßig das Wohnzimmer. Quelle: Matti, 09.11.2026.
- Auf der Seite „Räume“ im Menü stehen alle Räume; OK legt den Raum für das Startbild fest.
- Offene Fenster und schwache Batterien erscheinen für die ganze Wohnung, nicht nur für den gewählten Raum.
- Die große Zahl ist der gemessene Ist-Wert. Der Soll-Wert steht in Klammern dahinter, sobald er um mindestens 0,5 Grad abweicht. Quelle: Matti, 09.11.2026.
