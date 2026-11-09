# BH NAS: Bekannte Grenzen

## Grenzen

- Die Verbindung vertraut dem eigenen Zertifikat `192.168.2.136` (2048 Bit, gültig bis 2036) und prüft seinen Fingerabdruck. Der Zugriff läuft ausschließlich durch den WireGuard-Tunnel. Nach einem Zertifikatswechsel `platform/home-link/pin-nas-cert.sh` ausführen.
- Nur lesend. Schreiben, Verschieben, Löschen, Updates und Einstellungen gibt es bewusst nicht.
- `nas_health` meldet nur auf Abruf; eine automatische Benachrichtigung gibt es noch nicht.
- Die Slideshow zeigt nur JPEG-Dateien von 150 KB bis 14 MB. HEIC und PNG bleiben draußen.
- Doppelte Bilder werden an der gleichen Dateigröße erkannt, Serienbilder an Zeit und Größe. Ähnliche Motive mit anderem Zeitstempel erkennt das nicht.
- Die Bilder laufen über den geheimen Anzeige-Link des Beamers. Wer ihn hätte, könnte das jeweils aktuelle Bild abrufen; es bleibt nur 3 Minuten im Speicher.
- Jeder User braucht ein eigenes Konto auf der Synology.
- Lesen ist auf Textdateien bis 256 KB begrenzt.
- `nas_read_text` ist noch nicht gegen die echte Synology geprüft, nur mit Testdaten.
