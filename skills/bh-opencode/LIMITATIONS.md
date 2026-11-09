# BH OpenCode: Bekannte Grenzen

- Die Hooks gelten nur für OpenCode. Wer selbst im Terminal `git` aufruft, wird nicht geprüft.
- Befehle werden per Textmuster erkannt. Verschachtelte Aufrufe oder Commit-Nachrichten aus Dateien und Heredocs prüft der Hook nicht.
- Die Geheimnis-Prüfung beim Pushen kennt nur bekannte Muster und ersetzt keine Sicherheitsprüfung.
- Automatisch gepusht wird nur in Repos, die OpenCode in dieser Sitzung berührt hat, und im Startordner.
- Die Plugin-Schnittstelle ist an OpenCode 1.19.5 geprüft. Nach einem Versions-Update die Hooks erneut testen.
