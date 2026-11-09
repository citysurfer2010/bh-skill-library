# Business Logic: BH NAS

## Zugang

- Jeder User sieht mit dem eigenen Synology-Konto genau das, was dieses Konto darf. Zugangsdaten nur in der `.env` des Users auf dem Gateway. Quelle: Matti, 09.11.2026.
- Die Slideshow läuft als eigener Server `photos`, nutzt Mattis Konto und ist nur für den Dienst `bh-apps` freigegeben. Die Bilddaten erscheinen nie in einem Werkzeug-Ergebnis und gehen nie an ein Sprachmodell.

## Slideshow

- Quelle ist `/Bilder`. Quelle: Matti, 09.11.2026.
- Album heißt: Ordner, dessen Name mit einer Jahreszahl beginnt. Ungeordnete Sammlungen (`Finn_Unsortiert`, `Annefotos`, `entwickeln_…`) und Systemordner (`#recycle`, `#Backup_Handyupload`, `.TemporaryItems`) bleiben draußen.
- Man wählt ein einzelnes Album oder „Alle Alben“. Quelle: Matti, 09.11.2026.
- Keine doppelten Bilder: Dieselbe Dateigröße zählt innerhalb eines Laufs als dasselbe Bild, auch über Alben hinweg. Serienbilder (höchstens 5 Sekunden und 3 % Größe auseinander) werden auf eines reduziert. Quelle: Matti, 09.11.2026.
- Passende Auswahl: Ein einzelnes Album zeigt höchstens 60 Bilder, gleichmäßig über das Album verteilt. „Alle Alben“ nimmt 12 Bilder je Album und geht alle Alben in zufälliger Folge durch, bevor eines wieder drankommt.
- Dateien unter 150 KB sind meist Vorschauen und bleiben draußen.
- Ein Bild steht standardmäßig 8 Sekunden, einstellbar von 4 bis 20 Sekunden. Quelle: Matti, 09.11.2026. Geholt wird immer nur das nächste, die Synology wird also geschont. Ohne laufende Slideshow gibt es keine Bildabrufe.
- Die Albenliste wird alle 6 Stunden neu gelesen.

## Zustand der Synology

- `nas_health` ist nur lesend und läuft nur auf Abruf.
- Warnungen: Status von Volume, Speicherpool oder Festplatte nicht normal, Volume ab 85 % voll, Festplatte ab 55 °C, Übertemperatur des Geräts, kein Hyper-Backup-Auftrag.
- Ein verfügbares Update ist ein Hinweis, keine Warnung. Updates und andere Änderungen passieren nur auf ausdrückliche Anweisung. Quelle: Matti, 09.11.2026.
