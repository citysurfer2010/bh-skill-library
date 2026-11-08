# BH Beamer: Business Logic

Was wir über den Samsung-Beamer (The Premiere SP-LSP7TFAX, Tizen 5.5) gelernt haben und wie die Anbindung entstanden ist. Stand 08.11.2026.

## Zugriff

- Der Beamer steht im Heimnetz; der Server erreicht ihn nur durch den WireGuard-Tunnel (`platform/home-link`), und zwar ausschließlich seine Adresse. Nur das MCP-Gateway darf hindurch, die User-Container nicht.
- Schnittstellen: Status unverschlüsselt auf 8001, Fernbedienung und App-Start verschlüsselt auf 8002 (eigenes Zertifikat, fest hinterlegt in `BH_BEAMER_CA_B64`/`BH_BEAMER_FP`), Medien per DLNA auf 9197, Entwickler-Verbindung (sdb) auf 26101.
- Beim ersten Tastendruck erscheint am Beamer eine Abfrage; das Token liegt danach je User auf dem Gateway.

## Was funktioniert und was nicht

| Thema | Erkenntnis |
|---|---|
| Tasten senden | Funktioniert. Schnelle Folgen verlieren Zeichen; bei Texteingaben 1,5 s Pause je Zeichen. |
| Tastatur-Ereignisse | Der Beamer meldet keine offene Tastatur (`ms.remote.imeStart` kommt nie), `SendInputString` kommt nicht an. Text nur per Nummerntasten. |
| Apps starten | Über die REST-Schnittstelle mit der App-Kennung. Kennungen vorher am Gerät prüfen: `3201907018807` war dort Netflix, nicht der Browser. |
| Browser „Internet“ (`3201907018784`) | Startet, lädt aber keine übergebene Adresse (`metaTag`, `DEEP_LINK`, `NATIVE_LAUNCH`, REST-Parameter alle wirkungslos; Nachweis: kein Treffer im eigenen Server-Log). |
| Bildschirminhalt | Kein Screenshot über das Netzwerk möglich. |
| Text anzeigen | Als Bild per DLNA (`/screen/<token>/image.jpg`), funktioniert ohne App. |
| Webseiten | Nur über die eigene App „BH Screen“. |
| Einschalten | Aus dem Standby über das Netzwerk nicht verlässlich. |

## App „BH Screen“

Tizen-Web-App (`app/`), Kennung `bhscreen01.BHScreen`. Sie fragt alle 3 Sekunden `BH_SCREEN_URL/content` ab und zeigt Text oder lädt eine https-Adresse im Vollbild. Nach einer Webseite steuert der Skill die App nur noch über Beenden und Neustart (`openApp(..., { restart: true })`).

## Entwicklermodus und Installation

1. Entwicklermodus: Im Apps-Bereich die Tasten 1 2 3 4 5 (per Netzwerk gesendet, die Fernbedienung hat keine Ziffern), Schalter On, Host-IP = Tunnel-Adresse des Servers (`192.168.2.201`). Danach **echter Neustart** (Power-Taste lang drücken); Standby reicht nicht, sonst bleibt Port 26101 zu.
2. Tizen Studio (Web-CLI) auf dem Server unter dem Benutzer `tizen` (der Installer verweigert root): `/home/tizen/tizen-studio`, `sdb connect <ip>:26101`.
3. Samsung-Zertifikat: Samsung stellt es nur über den **Certificate Manager** aus. Der Paketmanager scheiterte („Directory creation failed“), deshalb `Certificate-Manager` und `certificate-manager-product` direkt aus `download.tizen.org/sdk/tizenstudio/official` geladen (SHA256 geprüft) und entpackt.
4. Grafische Oberfläche ohne Monitor: Xvfb + fluxbox + x11vnc + noVNC (`platform/beamer-dev/bh-desktop`), Bedienung per SSH-Tunnel `ssh -L 6080:127.0.0.1:6080` und `http://localhost:6080/vnc.html`.
5. Die Samsung-Anmeldung öffnet der Certificate Manager im Systembrowser (`xdg-open`) und wartet auf `localhost:4794`. Auf dem Server: Epiphany mit eigenem `xdg-open`-Wrapper (`platform/beamer-dev/xdg-open-virtual`), der D-Bus-Sitzung, `XDG_RUNTIME_DIR` des Benutzers und Software-Rendering setzt. Ohne das stürzt der Browser ab oder bleibt weiß.
6. Profil `BH` mit Autoren- und Distributor-Zertifikat (Public, DUID des Beamers). **DUID immer per `sdb shell 0 getduid` holen** (hier `U7CI6YW6JC7II`); die `duid` der Netzwerk-Schnittstelle (`uuid:…`) ist eine andere Kennung, ein damit ausgestelltes Zertifikat ergibt beim Installieren „Signed with wrong key“. Die GUI speichert Passwörter im Schlüsselbund, die Kommandozeile meldet dann „Invalid password“; deshalb registriert `bh-screen-deploy` das Profil mit dem Passwort aus `BH_TIZEN_AUTHOR_PW` neu.
7. Vor der ersten Installation die Erlaubnis setzen: `device-profile.xml` aus dem Zertifikatsordner nach `/home/owner/share/tmp/sdk_tools/` auf den Beamer kopieren (macht sonst der Device Manager der GUI); ohne sie meldet der Beamer „Invalid format of certificate in signature“.
8. Paketieren und installieren: `tizen build-web`, `tizen package -t wgt -s BH`, Installation per `sdb push` + `sdb shell 0 vd_appinstall bhscreen01 <wgt>` (Geräte-Angabe mit `-s <ip>:26101`, nicht `-t`), Start mit `sdb shell 0 was_execute bhscreen01.BHScreen`. Die CLI signiert fest mit rsa-sha512, das akzeptiert der Beamer.
9. Ein Paket, das nicht installiert, nie mehrfach im selben Bauordner neu signieren: `.buildResult` vorher löschen.

## Nicht tun

- Samsungs Anmeldeablauf (Code-Tausch gegen Token) nicht nachbauen; das ist Samsungs interner Weg und wurde hier bewusst abgebrochen.
- Keine Tastenfolgen blind an den Beamer schicken, ohne dass jemand das Bild sieht: Enter öffnet sonst zufällige Kacheln.
- Nach der Einrichtung bleiben nur Tizen Studio, die Zertifikate unter `/home/tizen/SamsungCertificate/BH` und das Profil; virtueller Bildschirm, Browser und Installer werden wieder entfernt.
