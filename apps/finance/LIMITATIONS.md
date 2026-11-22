# Finanzen: Bekannte Einschränkungen

## Priorität
- Kritisch: Datenverlust, Sicherheit, funktionaler Ausfall
- Wichtig: UX, Skalierung, Performance
- Später: nice-to-have

## Module

| Modul | Datei | Offene Punkte |
|-------|-------|---------------|
| Wohnkosten | `lib/housing.js` | Vermieter = häufigster Empfänger unter „Wohnung“ auf Privatkonten; Miete = Betrag, der im Jahr mindestens 3-mal gezahlt wurde, jede andere Zahlung an den Vermieter gilt als Nebenkostenabrechnung. Ändert sich die Miete im November/Dezember (unter 3 Zahlungen im Jahr), zählen diese Monate vorübergehend als Abrechnung. Energie nur bei bekannten Versorgern (Stadtwerke, Vattenfall, GASAG …). Ein Umzug (neuer Vermieter) wird noch nicht getrennt dargestellt. |

## Prozess

Neue Einschränkung erkannt: sofort hier eintragen, nicht merken. Bei Umsetzung mit Datum nach „Erledigt“ verschieben.
Details zu einem Modul: `docs/limitations/<modul>.md`.
