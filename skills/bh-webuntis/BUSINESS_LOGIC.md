# Business Logic: BH WebUntis

## Regeln

- Nur lesen, mit dem Eltern-Konto der Familie. Zugangsdaten nur in der `.env`.
- Gelesen werden Stundenplan, Ausfälle, Vertretungen, Klausuren und Hausaufgaben aller Kinder des Kontos.
- Der Vertretungsplan muss bis 7 Uhr eingestellt sein. Die Beamer-App fragt um 06:30, 06:45, 07:00, 10:00, 13:00 und 16:05 ab.
- Beim Öffnen der Seite wird frisch geholt, aber höchstens alle 2 Minuten angemeldet.
