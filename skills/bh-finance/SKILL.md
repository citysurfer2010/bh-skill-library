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
| `lib/loan-statements.js` | Darlehensauszüge (BBBank, PSD, NordLB, Sparkasse, Signal Iduna; Scans per Texterkennung): Kontostände und Zinssatz; Restschuld heute = letzter Auszug minus Tilgung seitdem; ein Auszug zu einem Konto, das im Sheet fehlt, geht an das einzige Darlehen derselben Bank ohne Konto derselben Wohnung (Wohnungsordner, sonst Ort aus dem Pfad wie „BESTAND_<Adresse>“ im Steuer-Ordner, sonst Adresse im Auszugskopf); bei mehreren Kandidaten entscheidet der Ursprungsbetrag im Auszug, sonst wird nichts zugeordnet. Ein Darlehenskonto für mehrere Wohnungen wird nach deren Restschuld laut Sheet aufgeteilt. Widerspricht der bewilligte Betrag im Auszug dem Darlehen, bei dem das Sheet das Konto nennt, und passt er eindeutig zu einem anderen Darlehen derselben Bank derselben Wohnungen, wandert das Konto dorthin; leere Darlehensplätze im Sheet zählen nicht. Nennt der Auszugskopf mehrere Wohnungen („WE30,31“), gilt das Darlehen als gemeinsames (`loan_shares`): Die Kredite-Seite zeigt „gemeinsam für …“, die Wohnungsliste teilt Restschuld und Beleihung nach Marktwert auf. |
| `lib/estate-links.js` | Drive-Ordner je Wohnung (Straße + WE-Nummer) und deren `02_Finanzierung`-Ordner |
| `lib/loans.js` | Wohnungen und Darlehen aus der Portfolioübersicht; Zins und Tilgung aus Bankbuchungen (IBAN oder Darlehensnummer im Text) |
| `lib/categories.js` | Kategorien anlegen und ändern (Prüfung, Kürzel, Dubletten) |
| `lib/wallets.js` | PayPal und Kreditkarte: Abbuchung nur Transfer, solange das Geldbörsen-Konto selbst importiert ist; sonst Ausgabe (Händler aus dem Text) |
| `lib/text-rules.js` | Feste Regeln am Verwendungszweck (Wertpapierkäufe → Aktien, Gebühren → Bankkosten) |
| `lib/transfers.js` | Erkennt Geldtransfers zwischen eigenen Konten (eigene IBAN, eindeutiges Paar mit Kontoinhaber) |
| `scripts/relabel-bank-accounts.js` | Einmal nach einem Update: Produkt/Beschreibung von der Bank holen, Bereich raten, automatisch vergebene Namen nach den aktuellen Regeln umbenennen (`--dry` zeigt nur) |
| `scripts/import-sheet.js` | Einmalige Übernahme der alten Tabelle als JSON |

## Zugang

Die Daten sind privat. Admins sehen sie immer, alle anderen erst nach Freigabe unter „Importieren“.

## Konten

Seite „Konten und Import“ (`/finance/import`): Verbindungen (Bankkonten, Amazon) und Importe als Tabellen; Bank verbinden, Amazon, CSV importieren und Jetzt abrufen über Knöpfe im Kopfbereich mit Dialogen. „Wer die Finanzen sieht“ unter Einstellungen (`/finance/admin`). Seite „Konten“ (`/finance/accounts`): alle Konten in Abschnitten je Bereich (Haushalt, Immobilien, Treuhand) mit Bank, Produkt, letztem Abruf, Buchungen, Zeitraum und offenen Buchungen; umbenennen (Stift) und Bereich wählen direkt in der Liste, auf dem Handy als Karten. „Offen“ führt zu allen offenen Buchungen des Kontos über alle Jahre (`?account=…&category=OFFEN&year=all`). Die Buchungsliste filtert nach Jahr, Konto und Kategorie (Auswahlfelder zum Tippen in einer Reihe rechts neben der Trefferzahl, auf dem Handy als Raster darunter); jeder Filter steht in der Adresse und lässt sich teilen: `?category=`, `?account=`, `?scope=all`, Kachel `?show=open|in|out`, Suche `?q=`. Ein gesetzter Filter ist blau hervorgehoben, „Filter zurücksetzen“ erscheint, sobald einer gesetzt ist. Seite „Kredite“ (`/finance/loans`): Darlehen je Wohnung mit Restschuld, Rate, Zinssatz (laut Bank, sonst laut Sheet „Übersicht“), Laufzeit (Hinweis bei Ende in 18 Monaten), Zins und Tilgung je Jahr aus den Bankbuchungen und Link auf die Buchungen; Vollnummern der Darlehenskonten verlassen den Server nicht. Modul „Immobilien“ (eigener Tab in der Navbar, `/finance/estate`): Wohnungen mit NLW (Nutzen-Lasten-Wechsel = „Besitzer seit“ aus dem Blatt „Übersicht“), Fläche (immer zwei Nachkommastellen), Eigentümer, Marktwert, Kaltmiete, Rendite, Restschuld und Beleihung; Suche (Adresse, WE, Eigentümer) und Filter nach Eigentümer, Ort und Finanzierung stehen in der Adresse (`?q=`, `?owner=`, `?city=`, `?debt=mit|ohne`), gesetzte Filter sind hervorgehoben, die Kennzahlen zählen nur die gezeigten Wohnungen. Jede Wohnung verlinkt ihren Drive-Ordner im Immobilien-Drive („Ordner“), die Kredite ihren `02_Finanzierung`-Ordner („Unterlagen“); `scripts/import-estate-links.js` (JSON mit Ordnernamen und IDs) ordnet sie über Straße und WE-Nummer zu, die Links überstehen einen neuen Sheet-Import. Liegen Darlehensauszüge vor (`scripts/import-loan-statements.js`, JSON mit den PDF-Texten aus Drive), zeigt die Seite die Restschuld laut Bank, den Sollzins, den Verlauf zum Jahresende und einen Link auf den Unterlagen-Ordner. Beide Seiten speisen sich aus `scripts/import-portfolio.js` (JSON aus dem Sheet „Portfolioübersicht – Bankübersicht Finanzierung“, Daten nur auf dem Server). Seite „Amazon“ (`/finance/amazon`, `public/components/fin-purchases.js`, Daten `lib/amazon-orders.js`): alle Bestellungen mit Artikeln, Betrag laut Abbuchung, Kategorie und Link auf die Abbuchung; Suche (Artikel, Bestellnummer) und Filter nach Jahr, Kategorie und mit/ohne Abbuchung in der Adresse (`?q=`, `?year=`, `?category=`, `?link=`). In der Buchungsliste zeigt der Filter „Nur Amazon“ (`?amazon=1`) nur Amazon-Abbuchungen. Komponenten, die `Fin` beim Laden lesen, müssen alphabetisch nach `fin-base.js` liegen (Test `regression-bundle-order`). Übersicht: Im laufenden Jahr vergleichen Spalte und Kacheln mit demselben Zeitraum des Vorjahrs, der Monatsdurchschnitt teilt durch die abgelaufenen Monate. Seite „Kategorien“ (`/finance/categories`): „Kategorie hinzufügen“ im Kopfbereich und der Stift je Zeile öffnen denselben Dialog (Name, Kürzel, Art, Wofür, Budget je Monat); das Kürzel wird aus dem Namen vorgeschlagen und ist danach fest. Das Jahr steht im Pfad: `/finance/2026`, `/finance/2026/transactions`, `/finance/2026/investments`, alle Jahre `/finance/all/transactions`; alte Links mit `?year=` werden umgeschrieben. Jede Buchung hat ihre eigene Adresse `/finance/transactions/<id>`. Steht eine Amazon-Bestellnummer im Verwendungszweck, verlinkt das Detail direkt auf die Bestellung bei amazon.de.

## Bankabruf

Unter „Importieren“ → „Bankkonten“ eine Bank verbinden (comdirect, BBBank, DKB, PayPal). Die App ruft danach einmal am Tag ab. Die Zustimmung gilt 180 Tage, dann „Neu verbinden“. Zugang bei Enable Banking: App-ID und privater Schlüssel liegen nur auf dem Server (`ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_KEY_FILE` in `/srv/bh-platform/.env`); `platform/apps/setup-apps.sh` legt sie für die Apps ab. Registrierte Rückleitung: `https://apps.familiebiskup.de/finance/api/bank/callback`.

## Monatsroutine

1. Für nicht verbundene Konten die Umsätze als CSV exportieren und unter „Importieren“ hochladen.
2. Unter „Buchungen“ die Arbeitsliste „Zu prüfen“ abarbeiten.
3. „Übersicht“ und „Investments und Rücklagen“ ansehen.

## MCP-Werkzeuge (für Zottel)

Server `skills/bh-finance/server` im MCP-Gateway (`servers.json`, Eintrag `finance`; das Gateway stellt `finance_` vor die Werkzeugnamen), nur lesend und nur für die dort genannten Personen (derzeit `matti`). Handelt Zottel für jemand anderen, z. B. ein Kind, sieht er die Werkzeuge nicht.

| Werkzeug | Zweck |
|---|---|
| `finance_get_overview` | Jahr: Einnahmen, Ausgaben, Ergebnis, Sparquote, offene Buchungen, Summen je Art und Kategorie mit Vorjahr und Budget |
| `finance_search_transactions` | Buchungen suchen (Text, Gegenpartei, Amazon-Artikel, Kategorie, Konto, Jahr); Anzahl und Summe aller Treffer |
| `finance_get_investments` | Investments und Rücklagen eines Jahres und über die Jahre |
| `finance_get_loans` | Kredite mit Restschuld laut Bank, Rate, Zins, Tilgung, Jahresendständen |
| `finance_get_estate` | Wohnungen mit Fläche, Marktwert, Miete, Restschuld, Drive-Ordner |

Beträge kommen in Euro. Dahinter liegt `/api/external/finance/*` der App mit einem API-Schlüssel im Scope `finance`: Nur wer die Finanzen sehen darf, kann ihn anlegen, und wer von der Liste „Wer die Finanzen sieht“ entfernt wird, verliert seine Finanz-Schlüssel sofort. Der Schlüssel steht als `BH_FINANCE_KEY` in `/srv/bh-platform/.env`, `platform/gateway/setup-mcp-gateway.sh` reicht ihn an das Gateway weiter; die App erreicht das Gateway intern über ihren Port aus `/srv/bh-apps/finance/app.json`, ohne den Präfix `/finance` (der gehört zum Edge).

