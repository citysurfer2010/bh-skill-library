# BH NAS: Bekannte Grenzen

## Grenzen

- Die Verbindung vertraut dem hinterlegten Werkszertifikat und prüft seinen Fingerabdruck. Der zugehörige Schlüssel ist bei Synology-Geräten nicht einzigartig, deshalb läuft der Zugriff ausschließlich durch den WireGuard-Tunnel. Ein eigenes Zertifikat wäre sauberer.
- Nur lesend. Schreiben, Verschieben und Löschen gibt es bewusst nicht.
- Jeder User braucht ein eigenes Konto auf der Synology.
- Lesen ist auf Textdateien bis 256 KB begrenzt.
- `nas_read_text` ist noch nicht gegen die echte Synology geprüft, nur mit Testdaten.
