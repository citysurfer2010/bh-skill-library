# Business Logic: BH Faces

## Datenschutz

- Die Gesichtserkennung läuft ausschließlich lokal. Quelle: Matti, 09.11.2026. Es geht weder ein Bild noch ein Fingerabdruck an einen externen Anbieter oder ein Sprachmodell.
- Der Analyse-Container `bh-faces` hängt nur am internen Netz `bh-faces-net`, hat keinen Weg nach außen, speichert nichts und schreibt keine Dateinamen ins Log.
- Index und Gesichtsausschnitte liegen nur in `faces.db` im Familienordner des Gateways. Die Werkzeuge geben ausschließlich Zahlen zurück.
- Erfasst werden alle Gesichter auf den Fotos, also auch die von Gästen. Benannt werden nur Personen, die Matti festlegt.

## Ablauf

- Grundlage sind dieselben Alben wie bei der Slideshow: Ordner in `/Bilder`, deren Name mit einer Jahreszahl beginnt, nur JPEG von 150 KB bis 14 MB.
- Kopien (gleiche Dateigröße) werden nur einmal analysiert.
- Die Beamer-App treibt den Index von 23 bis 7 Uhr an, ein Schritt nach dem anderen. Läuft gerade die Slideshow, pausiert der Index, damit die kleine Synology nicht doppelt belastet wird.
- Der Container ist auf 0,7 CPU-Kerne und 900 MB begrenzt.
- Bilder werden für die Analyse auf höchstens 1280 Pixel verkleinert, Gesichter unter 48 Pixel zählen nicht.
- Ändert sich ein Album, wird es neu eingelesen; bereits analysierte Bilder bleiben.
