# Business Logic: BH Netatmo

## Regeln

- Solltemperaturen lassen sich ändern, von 7 bis 30 Grad in halben Schritten und immer befristet. Quelle: Matti, 09.11.2026.
- Der aktive Heizplan wird angezeigt, aber nicht umgeschaltet.
- Zugang über den Web-Login des Familienkontos (`home.netatmo.com`), wie von Matti am 09.11.2026 vorgegeben. Zugangsdaten nur in der `.env`.
- Ein Raum liefert Isttemperatur, Sollwert, Modus, Heizbetrieb, offenes Fenster, Erreichbarkeit und schwache Batterie.
- Schwach heißt: Ein Ventil des Raums meldet `low` oder `very_low`.

## Schonung des Kontos

- Raumwerte gelten 5 Minuten. Die Anmeldung bleibt bestehen und wird weitergeführt; neu angemeldet wird nur, wenn das nicht mehr geht. Quelle: Matti, 09.11.2026.
- Nach einer abgelehnten Anmeldung ist für 30 Minuten kein neuer Versuch möglich.
- Bei 401 oder 403 wird genau einmal neu angemeldet.

## Anzeige auf dem Beamer

- Das Startbild zeigt standardmäßig das Wohnzimmer. Quelle: Matti, 09.11.2026.
- Auf der Seite „Räume“ im Menü stehen alle Räume; OK legt den Raum für das Startbild fest.
- Offene Fenster und schwache Batterien erscheinen für die ganze Wohnung, nicht nur für den gewählten Raum.
- Die große Zahl ist der gemessene Ist-Wert. Der Soll-Wert steht in Klammern dahinter, sobald er um mindestens 0,5 Grad abweicht. Quelle: Matti, 09.11.2026.

## Raumsteuerung auf dem Beamer

- Die Seite „Räume“ zeigt neben der Überschrift den aktiven Plan, etwa Arbeitswoche, oder einen Sondermodus wie Abwesend. Quelle: Matti, 09.11.2026.
- OK öffnet die Einstellung: ▲▼ ändert das Soll um halbe Grad, OK speichert, Zurück bricht ab.
- ▶ legt den Raum aufs Startbild, ◀ gibt einen manuell gesetzten Raum an den Plan zurück.
- Eine Änderung gilt nur befristet, danach übernimmt wieder der Plan.
