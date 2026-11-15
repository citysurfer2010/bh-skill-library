---
name: bh-finance
description: Private Haushaltsfinanzen der Familie auf der BH Platform, App apps/finance mit Kontoauszug-Import, gelernten Kategorien, Monatsauswertung und Investments. Nutzen, wenn es um Ausgaben, Einnahmen, Budgets, Sparquote, Investments oder Kontoauszüge geht.
---

# Skill: BH Finanzen

## Zweck

Die App `apps/finance` ersetzt die alte Tabelle „Finanzreport“: Kontoauszüge importieren, Buchungen Kategorien zuordnen, Monat für Monat auswerten, Investments und Rücklagen verfolgen.

## Aufbau

| Baustein | Aufgabe |
|---|---|
| `lib/importers.js` | Erkennt CSV-Exporte von comdirect (auch Kreditkarte), BBBank und PayPal am Inhalt |
| `lib/ledger.js` | Import mit Dublettenprüfung, Korrekturen |
| `lib/categorize.js` | Lernt Gegenpartei → Kategorie aus Entscheidungen |
| `lib/report.js` | Übersicht je Art und Kategorie, Investments und Rücklagen |
| `scripts/import-sheet.js` | Einmalige Übernahme der alten Tabelle als JSON |

## Zugang

Die Daten sind privat. Admins sehen sie immer, alle anderen erst nach Freigabe unter „Importieren“.

## Monatsroutine

1. Bei der Bank die Umsätze als CSV exportieren.
2. Unter „Importieren“ hochladen, bei der Kreditkarte das Konto wählen.
3. Unter „Buchungen“ die Arbeitsliste „Zu prüfen“ abarbeiten.
4. „Übersicht“ und „Investments und Rücklagen“ ansehen.
