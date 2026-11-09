# Bekannte Einschränkungen: BH Workspace

- Der Server hat wenig Arbeitsspeicher und einen Kern. Jeder Container darf bis 2,5 GB nutzen, viele gleichzeitig aktive User reichen ihn aus.
- Der Wächter findet bekannte Muster, er ersetzt keine Sicherheitsprüfung des Codes. Eigene Logikfehler einer App erkennt er nicht.
- Zwischen zwei Prüfungen können bis zu 5 Minuten liegen.
- Alle angemeldeten User können die Apps der anderen öffnen, sofern sie die Adresse kennen.
- Wird ein User deaktiviert, bleibt sein Container bestehen, und er kommt nicht mehr hinein.
- Der Name in der Google-Verbindung wird aus der E-Mail abgeleitet. Bei einem Namen wie `anna-2` passt das nicht.
- Eine App kann Cookies auf die ganze Domain setzen. Das stört höchstens, verschafft aber keinen Zugriff.
- Ein Einbruch in `bh-terminal` würde alle Container betreffen, deshalb läuft er getrennt von den übrigen Apps.
