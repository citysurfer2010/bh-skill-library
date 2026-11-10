# Zottel: Bekannte Grenzen

- Der Live-Modus fehlt, bis `BH_GEMINI_API_KEY` in der `.env` liegt.
- Routinen und Lernen aus Korrekturen gibt es noch nicht.
- Lesen und Ändern werden über Wortlisten unterschieden. Im Zweifel erscheint eine Karte.
- `BH_ACT_AS_SECRET` steht allen Apps im Container `bh-apps` offen. Das ist vertretbar, weil dort nur Admins ausrollen, und wäre mit einem eigenen Container sauberer.
- Der Gateway-Name eines Users kommt aus dem Teil vor dem @ der E-Mail. Bei einem Namen wie `anna-2` passt das nicht.
