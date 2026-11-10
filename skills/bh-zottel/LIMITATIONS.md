# Zottel: Bekannte Grenzen

- Der Live-Modus fehlt, bis `BH_GEMINI_API_KEY` in der `.env` liegt.
- Routinen laufen zur vollen Minute mit bis zu einer Minute Verzögerung. Fällt der Container aus, läuft eine verpasste Routine beim Start einmal nach, nicht für jeden verpassten Termin.
- Eine Uhrzeit in der Stunde der Zeitumstellung im Frühjahr gibt es nicht; die Routine läuft dann eine Stunde früher.
- Ob zwei Korrekturen dasselbe meinen, entscheidet das Sprachmodell über die Nummer der offenen Regel.
- Routinen schlägt Zottel nur im Gespräch vor; ein Muster über mehrere Tage erkennt er noch nicht selbst.
- Lesen und Ändern werden über Wortlisten unterschieden. Im Zweifel erscheint eine Karte.
- `BH_ACT_AS_SECRET` steht allen Apps im Container `bh-apps` offen. Das ist vertretbar, weil dort nur Admins ausrollen, und wäre mit einem eigenen Container sauberer.
- Der Gateway-Name eines Users kommt aus dem Teil vor dem @ der E-Mail. Bei einem Namen wie `anna-2` passt das nicht.
