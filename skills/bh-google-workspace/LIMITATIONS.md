# Bekannte Einschränkungen: BH Google Workspace

- Der Gateway-User wird aus dem Teil der E-Mail vor dem @ abgeleitet. Passt er nicht zum Devbox-Namen, schlägt das Verbinden fehl.
- In der Google-Konsole müssen die genutzten APIs aktiviert sein. Solange die App im Testmodus ist, muss jedes Konto als Testnutzer eingetragen sein.
- Im Testmodus läuft die Freigabe nach 7 Tagen ab. Dauerhaft hilft nur die Veröffentlichung der App bei Google.
- Service-Konten wie die Beamer-App haben keine eigene Google-Freigabe.

## Texterkennung (15.11.2026)

- Tesseract steckt im Image des MCP-Gateways (`services/bh-mcp-gateway/Dockerfile`); fehlte es, brach der Server bei jedem Scan ab. Ein fehlendes oder abbrechendes Programm beendet jetzt nur den Aufruf (`lib/pdf-ocr.js`, Regressionstest `regression-ocr-no-crash`).
- OCR braucht 2–5 s je Seite; lange Scans seitenweise in Blöcken zu 20 Seiten abrufen.
