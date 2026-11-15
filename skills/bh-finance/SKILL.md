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
| `lib/loan-statements.js` | Darlehensauszüge (BBBank, PSD, NordLB): Kontostände und Zinssatz; Restschuld heute = letzter Auszug minus Tilgung seitdem; ein Auszug zu einem Konto, das im Sheet fehlt, geht an das einzige Darlehen derselben Bank ohne Konto derselben Wohnung (Wohnungsordner, sonst Ort aus dem Pfad wie „BESTAND_<Adresse>“ im Steuer-Ordner, sonst Adresse im Auszugskopf) |
| `lib/estate-links.js` | Drive-Ordner je Wohnung (Straße + WE-Nummer) und deren `02_Finanzierung`-Ordner |
| `lib/loans.js` | Wohnungen und Darlehen aus der Portfolioübersicht; Zins und Tilgung aus Bankbuchungen (IBAN oder Darlehensnummer im Text) |
| `lib/categories.js` | Kategorien anlegen und ändern (Prüfung, Kürzel, Dubletten) |
| `lib/text-rules.js` | Feste Regeln am Verwendungszweck (Wertpapierkäufe → Aktien, Gebühren → Bankkosten) |
| `lib/transfers.js` | Erkennt Geldtransfers zwischen eigenen Konten (eigene IBAN, eindeutiges Paar mit Kontoinhaber) |
| `scripts/relabel-bank-accounts.js` | Einmal nach einem Update: Produkt/Beschreibung von der Bank holen, Bereich raten, automatisch vergebene Namen nach den aktuellen Regeln umbenennen (`--dry` zeigt nur) |
| `scripts/import-sheet.js` | Einmalige Übernahme der alten Tabelle als JSON |

## Zugang

Die Daten sind privat. Admins sehen sie immer, alle anderen erst nach Freigabe unter „Importieren“.

## Konten

Seite „Konten und Import“ (`/finance/import`): Verbindungen (Bankkonten, Amazon) und Importe als Tabellen; Bank verbinden, Amazon, CSV importieren und Jetzt abrufen über Knöpfe im Kopfbereich mit Dialogen. „Wer die Finanzen sieht“ unter Einstellungen (`/finance/admin`). Seite „Konten“ (`/finance/accounts`): alle Konten in Abschnitten je Bereich (Haushalt, Immobilien, Treuhand) mit Bank, Produkt, letztem Abruf, Buchungen, Zeitraum und offenen Buchungen; umbenennen (Stift) und Bereich wählen direkt in der Liste, auf dem Handy als Karten. „Offen“ führt zu allen offenen Buchungen des Kontos über alle Jahre (`?account=…&category=OFFEN&year=all`). Die Buchungsliste filtert nach Jahr, Konto und Kategorie (Auswahlfelder zum Tippen in einer Reihe rechts neben der Trefferzahl, auf dem Handy als Raster darunter); jeder Filter steht in der Adresse und lässt sich teilen: `?category=`, `?account=`, `?scope=all`, Kachel `?show=open|in|out`, Suche `?q=`. Ein gesetzter Filter ist blau hervorgehoben, „Filter zurücksetzen“ erscheint, sobald einer gesetzt ist. Seite „Kredite“ (`/finance/loans`): Darlehen je Wohnung mit Restschuld, Rate, Laufzeit (Hinweis bei Ende in 18 Monaten), Zins und Tilgung je Jahr aus den Bankbuchungen und Link auf die Buchungen; Vollnummern der Darlehenskonten verlassen den Server nicht. Modul „Immobilien“ (eigener Tab in der Navbar, `/finance/estate`): Wohnungen mit Fläche, Marktwert, Kaltmiete, Rendite, Restschuld und Beleihung. Jede Wohnung verlinkt ihren Drive-Ordner im Immobilien-Drive („Ordner“), die Kredite ihren `02_Finanzierung`-Ordner („Unterlagen“); `scripts/import-estate-links.js` (JSON mit Ordnernamen und IDs) ordnet sie über Straße und WE-Nummer zu, die Links überstehen einen neuen Sheet-Import. Liegen Darlehensauszüge vor (`scripts/import-loan-statements.js`, JSON mit den PDF-Texten aus Drive), zeigt die Seite die Restschuld laut Bank, den Sollzins, den Verlauf zum Jahresende und einen Link auf den Unterlagen-Ordner. Beide Seiten speisen sich aus `scripts/import-portfolio.js` (JSON aus dem Sheet „Portfolioübersicht – Bankübersicht Finanzierung“, Daten nur auf dem Server). Seite „Kategorien“ (`/finance/categories`): „Kategorie hinzufügen“ im Kopfbereich und der Stift je Zeile öffnen denselben Dialog (Name, Kürzel, Art, Wofür, Budget je Monat); das Kürzel wird aus dem Namen vorgeschlagen und ist danach fest. Das Jahr steht im Pfad: `/finance/2026`, `/finance/2026/transactions`, `/finance/2026/investments`, alle Jahre `/finance/all/transactions`; alte Links mit `?year=` werden umgeschrieben. Jede Buchung hat ihre eigene Adresse `/finance/transactions/<id>`. Steht eine Amazon-Bestellnummer im Verwendungszweck, verlinkt das Detail direkt auf die Bestellung bei amazon.de.

## Bankabruf

Unter „Importieren“ → „Bankkonten“ eine Bank verbinden (comdirect, BBBank, DKB, PayPal). Die App ruft danach einmal am Tag ab. Die Zustimmung gilt 180 Tage, dann „Neu verbinden“. Zugang bei Enable Banking: App-ID und privater Schlüssel liegen nur auf dem Server (`ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_KEY_FILE` in `/srv/bh-platform/.env`); `platform/apps/setup-apps.sh` legt sie für die Apps ab. Registrierte Rückleitung: `https://apps.familiebiskup.de/finance/api/bank/callback`.

## Monatsroutine

1. Für nicht verbundene Konten die Umsätze als CSV exportieren und unter „Importieren“ hochladen.
2. Unter „Buchungen“ die Arbeitsliste „Zu prüfen“ abarbeiten.
3. „Übersicht“ und „Investments und Rücklagen“ ansehen.
