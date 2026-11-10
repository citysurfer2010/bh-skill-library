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
| Mikro-Taste und Sprache | Nicht für BH Screen nutzbar, geprüft am 10.11.2026: Die Mikro-Taste fehlt in `tvinputdevice.getSupportedKeys()` und öffnet immer den Systemassistenten. `webapis.voiceinteraction` fehlt (erst ab Tizen 6.0). `tizen.voicecontrol` meldet angemeldete Begriffe, liefert aber nie ein Ergebnis. Das Fernbedienungsmikrofon erscheint als `BluetoothMicrophone`, `getUserMedia` endet mit `NotAllowedError`. YouTube darf das als Partner-App. Sprachsuche daher nur über eine Handy-Seite. |
| Text anzeigen | Als Bild per DLNA (`/screen/<token>/image.jpg`), funktioniert ohne App. |
| Webseiten | Nur über die eigene App „BH Screen“. |
| YouTube-Videos | Über DIAL: `POST http://<ip>:8080/ws/apps/YouTube` mit `Origin: https://www.youtube.com` und Body `v=<id>` → 201, Video läuft. Ohne Origin 403; Port 8001 lehnt mit 401 ab. Firewall erlaubt 8080 nur vom Gateway-Netz. |
| Radio / Musik | **Nicht per DLNA:** der Beamer lehnt Live-Streams mit Fehler 716 ab (DLF und NDR 2 getestet, auch als Video). Weg: App BH Screen spielt den Stream selbst (`beamer_play_radio`, Modus `audio`). |
| Entwickler-App im REST-Status | Eine per `sdb` installierte App meldet immer `running:false, visible:false`, auch wenn sie läuft; ein Start der bereits laufenden App bekommt keine Antwort (Timeout). `openApp` wertet darum `true` oder Timeout nach erfolgreicher Abfrage als Erfolg. |
| Ausschalten | Kurzer Klick auf `KEY_POWER` wirkt nicht; die Taste 3 s halten (Press/Release). Bestätigt 08.11. |
| Einschalten | Wake-on-LAN (UDP 9 durch den Tunnel, `BH_BEAMER_MAC`) weckt ihn, wenn am Beamer unter Allgemein → Netzwerk → Experteneinstellungen das Einschalten über Mobilgerät und der IP-Fernzugriff an sind. Im Standby antwortet er auf nichts, auch nicht auf Ping; trotzdem kommt das Weckpaket an. Getestet 08.11.: nach 30 s Standby in 9 s wieder an. Ohne diese Einstellungen: keine Reaktion. |

## App „BH Screen“

Tizen-Web-App (`app/`), Kennung `bhscreen01.BHScreen`. Sie fragt alle 3 Sekunden `BH_SCREEN_URL/content` ab und zeigt Text oder lädt eine https-Adresse im Vollbild. Nach einer Webseite steuert der Skill die App nur noch über Beenden und Neustart (`openApp(..., { restart: true })`).

## Entwicklermodus und Installation

1. Entwicklermodus: Im Apps-Bereich die Tasten 1 2 3 4 5 (per Netzwerk gesendet, die Fernbedienung hat keine Ziffern), Schalter On, Host-IP = Tunnel-Adresse des Servers (`192.168.2.201`). Danach **echter Neustart** (Power-Taste lang drücken); Standby reicht nicht, sonst bleibt Port 26101 zu.
2. Tizen Studio (Web-CLI) auf dem Server unter dem Benutzer `tizen` (der Installer verweigert root): `/home/tizen/tizen-studio`, `sdb connect <ip>:26101`.
3. Samsung-Zertifikat: Samsung stellt es nur über den **Certificate Manager** aus. Der Paketmanager scheiterte („Directory creation failed“), deshalb `Certificate-Manager` und `certificate-manager-product` direkt aus `download.tizen.org/sdk/tizenstudio/official` geladen (SHA256 geprüft) und entpackt.
4. Grafische Oberfläche ohne Monitor: Xvfb + fluxbox + x11vnc + noVNC (`platform/beamer-dev/bh-desktop`), Bedienung per SSH-Tunnel `ssh -L 6080:127.0.0.1:6080` und `http://localhost:6080/vnc.html`.
5. Die Samsung-Anmeldung öffnet der Certificate Manager im Systembrowser (`xdg-open`) und wartet höchstens 5 Minuten auf `localhost:4794`. Der Rückruf ist ein **POST-Formular** von Samsung an `http://localhost:4794/signin/callback`; ein Browser auf dem Server (Epiphany/WebKit) stellt dieses Formular von der https-Seite an die http-Adresse nicht zu, der Manager meldet dann „Login Failed: No response“. Gangbarer Weg: `xdg-open`-Wrapper (`platform/beamer-dev/xdg-open-virtual`) legt die Anmelde-Adresse nur in `/tmp/signin-url.txt` ab; der Nutzer öffnet sie in Chrome auf seinem Rechner, dessen SSH-Tunnel `-L 4794:127.0.0.1:4794` den Rückruf zum Server leitet. Reihenfolge zwingend: erst im Manager „Next“ und die Rückfrage bestätigen (dann lauscht er), dann anmelden. Die Rückfrage-Dialoge zeichnet Xvfb manchmal schwarz; Enter bestätigt sie trotzdem.
6. Profil `BH` mit Autoren- und Distributor-Zertifikat (Public, DUID des Beamers). **DUID immer per `sdb shell 0 getduid` holen** (hier `U7CI6YW6JC7II`); die `duid` der Netzwerk-Schnittstelle (`uuid:…`) ist eine andere Kennung, ein damit ausgestelltes Zertifikat ergibt beim Installieren „Signed with wrong key“. Die GUI speichert Passwörter im Schlüsselbund, die Kommandozeile meldet dann „Invalid password“; deshalb registriert `bh-screen-deploy` das Profil mit dem Passwort aus `BH_TIZEN_AUTHOR_PW` neu.
7. Vor der ersten Installation die Erlaubnis setzen: `device-profile.xml` aus dem Zertifikatsordner nach `/home/owner/share/tmp/sdk_tools/` auf den Beamer kopieren (macht sonst der Device Manager der GUI); ohne sie meldet der Beamer „Invalid format of certificate in signature“.
8. Paketieren und installieren: `tizen build-web`, `tizen package -t wgt -s BH`, Installation per `sdb push` + `sdb shell 0 vd_appinstall bhscreen01 <wgt>` (Geräte-Angabe mit `-s <ip>:26101`, nicht `-t`), Start mit `sdb shell 0 was_execute bhscreen01.BHScreen`. Die CLI signiert fest mit rsa-sha512, das akzeptiert der Beamer.
9. Ein Paket, das nicht installiert, nie mehrfach im selben Bauordner neu signieren: `.buildResult` vorher löschen.

## Nicht tun

- Samsungs Anmeldeablauf (Code-Tausch gegen Token) nicht nachbauen; das ist Samsungs interner Weg und wurde hier bewusst abgebrochen.
- Keine Tastenfolgen blind an den Beamer schicken, ohne dass jemand das Bild sieht: Enter öffnet sonst zufällige Kacheln.
- Nach der Einrichtung bleiben nur Tizen Studio, die Zertifikate unter `/home/tizen/SamsungCertificate/BH` und das Profil; virtueller Bildschirm, Browser und Installer werden wieder entfernt.

## Radio auf dem Startbild

- OK oder die Pause-Taste halten das Radio an und merken den Sender. Noch einmal OK spielt ihn weiter.
- Pause beendet den Stream wirklich, damit nichts im Hintergrund lädt. Laut und leise bleibt bei den Tasten der Fernbedienung.
- Zurück verwirft die Pause. Nach ▲▼ oder CH läuft der nächste Sender.

## Geburtstage

- Vorschau oben in der Mitte in den 7 Tagen davor, am Tag ein eigener Reiter „Geburtstag“ vor dem Stundenplan. Details: Skill `bh-birthdays`.

## Raumklima

- Der gewählte Raum wird auf dem Gerät gemerkt. Details: Skill `bh-netatmo`.
- Absichtlich eine eigene Menüseite und keine Tasten auf dem Startbild, denn ▲▼ und CH steuern dort schon das Radio.

## Versionsanzeige

- Unten in der Seitenleiste steht die installierte Version von BH Screen, damit man sieht, was ausgerollt ist. Quelle: Matti, 09.11.2026.

## Fotos

- Menüpunkt „Fotos“: erste Kachel „Alle Alben“, danach alle Alben, neueste zuerst. Auswahl und Bildregeln stehen in `skills/bh-nas/BUSINESS_LOGIC.md`.
- Ablauf: Die App bittet per `/request` um ein Bild, die Beamer-App ruft `photos_push_next`, das Bild geht verkleinert (1920×1080, gedreht nach EXIF) an `bh-auth` und liegt dort nur im Arbeitsspeicher, höchstens 3 Bilder für 3 Minuten. Die App holt es unter dem geheimen Anzeige-Link.
- Fernbedienung: OK pausiert, ▶ springt weiter, ▲ schneller und ▼ langsamer (4, 6, 8, 12 oder 20 Sekunden, bleibt gespeichert), CH wechselt das Radio, Zurück beendet. Radio läuft weiter.
- Ein einzelnes Album endet mit „Album zu Ende“ und führt zurück zum Menü. „Alle Alben“ läuft endlos.
- Bildschirm teilen unterbricht die Slideshow.
- Über den Alben stehen Suche, „Alle Jahre“ und die Jahre, erreichbar mit ▲ aus der ersten Reihe. Quelle: Matti, 09.11.2026. Bei gewähltem Jahr spielt die erste Kachel alle Alben dieses Jahres. Die Suche filtert die Albumnamen ohne Serverabfrage.
- Zurück hebt einen aktiven Filter auf.
- Das letzte Bild eines Albums behält seine volle Standzeit. Die Bildunterschrift blendet nach 8 Sekunden aus, in der Pause bleibt sie stehen. Die Tasten erscheinen einmal zu Beginn und bei ◀.
- Wird `platform/beamer-dev/bh-screen-deploy` geändert, muss die Kopie nach `/usr/local/sbin` neu installiert werden, sonst wirkt die Änderung nicht.
