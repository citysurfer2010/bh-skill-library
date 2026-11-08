# BH NAS: Bekannte Grenzen

## Offen: Verbindung zur Synology noch nicht nutzbar

**Was passiert:** Alle Werkzeuge melden, dass das Zertifikat der Synology noch nicht eingerichtet ist. `bh-nas-connect` kann deshalb ebenfalls noch nicht anmelden.

**Warum:** Die Synology nutzt noch ihr Werkszertifikat und schickt die zugehörige Zertifizierungsstelle nicht mit. Die Zertifikatsprüfung bleibt bewusst eingeschaltet.

**Was zu tun ist (einmalig):**

1. Auf der Synology: Systemsteuerung → Sicherheit → Zertifikat → Hinzufügen → Neues Zertifikat → Selbstsigniertes Zertifikat erstellen, als Standard festlegen.
2. Dieses Zertifikat markieren: Aktion → Zertifikat exportieren.
3. Aus dem Archiv nur `syno-ca-cert.pem` verwenden. `privkey.pem` nie weitergeben.
4. Auf dem Server die Datei hinterlegen und `platform/home-link/pin-nas-cert.sh` so erweitern, dass sie diese Stelle zusammen mit dem Serverzertifikat in `BH_NAS_CA_B64` schreibt. Danach `platform/gateway/setup-mcp-gateway.sh` ausführen und alle vier Werkzeuge testen.

## Weitere Grenzen

- Nur lesend. Schreiben, Verschieben und Löschen gibt es bewusst nicht.
- Jeder User braucht ein eigenes Konto auf der Synology.
- Lesen ist auf Textdateien bis 256 KB begrenzt.
- `nas_read_text` ist noch nicht gegen die echte Synology geprüft, nur mit Testdaten.
