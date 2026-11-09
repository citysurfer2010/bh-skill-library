# Business Logic: BH Family Calendar

- Auf das Startbild gehören nur nicht regelmäßige Termine. Quelle: Matti, 09.11.2026.
- Serientermine, darunter die Geburtstage, bleiben draußen; Geburtstage zeigt der Skill `bh-birthdays`.
- Ein Termin, der schon läuft, zählt ab heute und zeigt keine Uhrzeit.
- Die Beamer-App fragt alle 30 Minuten ab und sendet nur Änderungen.
- Ein laufender Termin zeigt „Jetzt“ statt der Uhrzeit, ein beendeter verschwindet vom Startbild.

## Termine anlegen

- Termine werden im Family-Kalender angelegt, Gäste aus verschiedenen Parteien per E-Mail eingeladen. Quelle: Matti, 09.11.2026.
- Der Family-Kalender ist global: Alle Nutzer dürfen lesen und anlegen. Eine spätere Einschränkung ist möglich. Quelle: Matti, 09.11.2026.
- Ohne Gäste geht keine E-Mail raus.
- Ohne Ende dauert ein Termin eine Stunde, Uhrzeiten gelten in Berliner Zeit.
- Bei mehrtägigen Terminen ist `endDate` der letzte Tag.

## A1-Termine (Matti, 09.11.2026)

- Die Seite „Heute“ zeigt dem Inhaber wichtige außerordentliche Termine aus seinem A1-Kalender in einer eigenen Leiste.
- Gezeigt werden einmalige Termine der nächsten 7 Tage. Serien, Blocker, „Frei“-Einträge, Arbeitsorte und abgelehnte Einladungen fallen weg.
- Private Termine erscheinen nur als „Privater Termin“.
- Nur der Inhaber sieht sie. Auf den Beamer und zu anderen Nutzern gelangen sie nie.
