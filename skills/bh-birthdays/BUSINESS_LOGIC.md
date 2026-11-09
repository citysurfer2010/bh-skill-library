# Business Logic: BH Birthdays

## Regeln

- Vorschau nur in den 7 Tagen vor dem Geburtstag, am nächsten Termin zuerst. Quelle: Matti, 09.11.2026.
- Am Tag selbst ersetzt ein eigener Screen den Stundenplan-Bereich; der Stundenplan bleibt mit Pfeil rechts erreichbar.
- Der Screen zeigt, was sonst an dem Datum war, und zwar „eher positiv“. Quelle: Matti, 09.11.2026.
- Alter = Jahr des nächsten Geburtstags minus Geburtsjahr. Stichtag ist das Datum in Europe/Berlin.
- Geburtsdaten sind Familiendaten: nur auf dem Server, nie im öffentlichen Repo. Zum Beamer gehen nur Vorname, Alter und Abstand.

## Auswahl „An diesem Tag“

1. Quelle ist die deutschsprachige Wikipedia, zuerst die redaktionell ausgewählten Ereignisse, dann alle Ereignisse des Datums.
2. Ein Ereignis zählt nur mit positivem Bezug (Erfindung, Premiere, Spiel, Sport, Forschung) und ohne Tod, Krieg, Unglück oder Politik.
3. Es bleiben höchstens drei Ereignisse von höchstens 125 Zeichen, nach Jahr aufsteigend.
4. Dazu kommt eine bekannte Person ab Jahrgang 1900 aus Kunst, Sport oder Forschung.

## Abrufe

- Die Beamer-App fragt einmal pro Stunde `birthdays_upcoming` ab und schickt nur Änderungen an den Beamer.
- Wikipedia wird nur an einem Geburtstag und höchstens einmal am Tag gefragt.
