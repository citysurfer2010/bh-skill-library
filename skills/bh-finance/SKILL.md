---
name: bh-finance
description: Private Haushaltsfinanzen der Familie auf der BH Platform, App apps/finance mit täglichem Bankabruf (Enable Banking), Kontoauszug-Import, gelernten Kategorien, Monatsauswertung und Investments. Nutzen, wenn es um Ausgaben, Einnahmen, Budgets, Sparquote, Investments oder Kontoauszüge geht.
---

# Skill: BH Finanzen

## Zweck

Die App `apps/finance` ersetzt die alte Tabelle „Finanzreport“: Kontoauszüge importieren, Buchungen Kategorien zuordnen, Monat für Monat auswerten, Investments und Rücklagen verfolgen.

## Aufbau

| Baustein | Aufgabe |
|---|---|
| `lib/bank-api.js` | Enable Banking (PSD2): signierte Aufrufe, Zustimmung, Sitzung, Umsätze |
| `lib/bank-convert.js` | Bank-Umsatz → Buchung (Vorzeichen, Gegenpartei, Bank-ID) |
| `lib/bank-sync.js` | Verbinden, Kontonamen, täglicher Abruf, Abgleich mit CSV-Buchungen |
| `lib/accounts.js` | Alle Konten mit Bereich (Haushalt, Immobilien, Treuhand), Umbenennen, Filter „nur Haushalt“ |
| `lib/importers.js` | Erkennt CSV-Exporte von comdirect (auch Kreditkarte), BBBank und PayPal am Inhalt |
| `lib/ledger.js` | Import mit Dublettenprüfung, Korrekturen |
| `lib/categorize.js` | Lernt Gegenpartei → Kategorie aus Entscheidungen |
| `lib/report.js` | Übersicht je Art und Kategorie, Investments und Rücklagen |
| `lib/amazon.js`, `lib/amazon-api.js` | Amazon-Zahlungen und Artikel vom Dienst `bh-amazon` holen, Abbuchungen zuordnen (Bestellnummer im Text, sonst eindeutiger Betrag ±4 Tage) |
| `lib/transfers.js` | Erkennt Geldtransfers zwischen eigenen Konten (eigene IBAN, eindeutiges Paar mit Kontoinhaber) |
| `scripts/relabel-bank-accounts.js` | Einmal nach einem Update: Produkt/Beschreibung von der Bank holen, Bereich raten, automatisch vergebene Namen nach den aktuellen Regeln umbenennen (`--dry` zeigt nur) |
| `scripts/import-sheet.js` | Einmalige Übernahme der alten Tabelle als JSON |

## Zugang

Die Daten sind privat. Admins sehen sie immer, alle anderen erst nach Freigabe unter „Importieren“.

## Konten

Seite „Konten“ (`/finance/accounts`): alle Konten in Abschnitten je Bereich (Haushalt, Immobilien, Treuhand) mit Bank, Produkt, letztem Abruf, Buchungen, Zeitraum und offenen Buchungen; umbenennen (Stift) und Bereich wählen direkt in der Liste, auf dem Handy als Karten. „Offen“ führt zu allen offenen Buchungen des Kontos über alle Jahre (`?account=…&category=OFFEN&year=all`). Das Jahr steht im Pfad: `/finance/2026`, `/finance/2026/transactions`, `/finance/2026/investments`, alle Jahre `/finance/all/transactions`; alte Links mit `?year=` werden umgeschrieben. Jede Buchung hat ihre eigene Adresse `/finance/transactions/<id>`. Steht eine Amazon-Bestellnummer im Verwendungszweck, verlinkt das Detail direkt auf die Bestellung bei amazon.de.

## Bankabruf

Unter „Importieren“ → „Bankkonten“ eine Bank verbinden (comdirect, BBBank, DKB, PayPal). Die App ruft danach einmal am Tag ab. Die Zustimmung gilt 180 Tage, dann „Neu verbinden“. Zugang bei Enable Banking: App-ID und privater Schlüssel liegen nur auf dem Server (`ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_KEY_FILE` in `/srv/bh-platform/.env`); `platform/apps/setup-apps.sh` legt sie für die Apps ab. Registrierte Rückleitung: `https://apps.familiebiskup.de/finance/api/bank/callback`.

## Monatsroutine

1. Für nicht verbundene Konten die Umsätze als CSV exportieren und unter „Importieren“ hochladen.
2. Unter „Buchungen“ die Arbeitsliste „Zu prüfen“ abarbeiten.
3. „Übersicht“ und „Investments und Rücklagen“ ansehen.
