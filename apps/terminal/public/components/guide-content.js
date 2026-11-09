'use strict';
/** Text of the guide. Only facts that were checked against this platform; update them together with the system. */
window.GUIDE_SECTIONS = (() => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cmd = (text) => `<div class="guide-code"><pre tabindex="0" aria-label="Befehl"><code>${esc(text)}</code></pre><button type="button" class="term-btn guide-copy" aria-label="Befehl kopieren">Kopieren</button></div>`;
  const c = (text) => `<code>${esc(text)}</code>`;
  const table = (head, rows) => AppShell.list({ columns: head.map((label, i) => ({ key: `c${i}`, label, html: (row) => row[`c${i}`] })), rows: rows.map((r) => Object.fromEntries(r.map((v, i) => [`c${i}`, v]))) });

  return [
    { id: 'start', title: 'Erste Schritte', html: `
      <p>Das Terminal ist deine eigene Arbeitsumgebung im Browser. Sie läuft in einem Container nur für dich, deine Dateien bleiben dort erhalten.</p>
      <ol>
        <li>Öffne den Tab <a href="${window.APP_BASE}/">Terminal</a> und klicke oben rechts auf <strong>opencode starten</strong>.</li>
        <li>Schreibe in normalen Sätzen, was du möchtest, zum Beispiel: <em>„Bau mir eine kleine Web-App für unsere Einkaufsliste.“</em></li>
        <li>OpenCode zeigt, was es tut, und fragt nach, wenn etwas unklar ist.</li>
      </ol>
      <h3>Sitzungen und Tabs</h3>
      <ul>
        <li>Mit <strong>+</strong> öffnest du eine weitere Sitzung. Jede läuft unabhängig weiter, auch wenn du das Fenster schließt.</li>
        <li>Die aktive Sitzung steht in der Adresse (${c('?session=…')}). Mit dieser Adresse öffnest du genau diese Sitzung in einem neuen Fenster.</li>
        <li>Das Kreuz am Tab beendet die Sitzung. Fünf Sekunden lang kannst du das rückgängig machen.</li>
      </ul>
      <h3>Dateien und Bilder</h3>
      <p>Bilder und Dateien kannst du einfügen, ins Terminal ziehen oder unter <strong>Dateien</strong> hochladen. Sie landen in ${c('~/uploads')}, der Pfad wird ins Terminal geschrieben. So kann OpenCode sie direkt verwenden. Ein Bild zeigst du im Terminal mit ${c('bh-show bild.png')} an.</p>
      <h3>Wörter erklärt</h3>
      ${table(['Wort', 'Bedeutung'], [
    ['Terminal', 'Das Fenster, in das du Befehle tippst'],
    ['Container', 'Dein eigener kleiner Computer auf dem Server'],
    ['Port', 'Die Nummer, unter der eine App in deinem Container erreichbar ist'],
    ['Repo', 'Ein Projektordner mit Versionsverlauf bei GitHub'],
  ])}` },

    { id: 'opencode', title: 'Was OpenCode kann', html: `
      <p>OpenCode ist ein KI-Assistent fürs Programmieren. Er liest und ändert Dateien in deinem Container, führt Befehle aus und nutzt die Werkzeuge der Plattform.</p>
      <ul>
        <li>Programme und Web-Apps bauen, ändern und testen</li>
        <li>Fehler suchen und erklären, was ein Programm tut</li>
        <li>Deinen Code bei GitHub sichern</li>
        <li>Mit deinen verbundenen Diensten arbeiten, siehe <a href="#tools">Werkzeuge</a></li>
      </ul>
      <h3>Starten</h3>
      <p>Befehle tippst du im Tab Terminal ein und bestätigst mit Enter. „Kopieren“ übernimmt einen Befehl, eingefügt wird er im Terminal mit Cmd+V (Mac) oder Strg+Umschalt+V.</p>
      ${cmd('opencode')}
      <p>In einem bestimmten Projekt, oder einmalig ohne Oberfläche:</p>
      ${cmd('opencode ~/projects/meine-app')}
      ${cmd('opencode run "Erkläre mir dieses Projekt"')}
      <h3>Bedienung</h3>
      ${table(['Eingabe', 'Wirkung'], [
    [c('Tab'), 'Wechselt zwischen Agenten, etwa „Build“ zum Ändern und „Plan“ zum Nachdenken'],
    [c('Strg+P'), 'Zeigt alle Befehle'],
    [c('/models'), 'Wählt das Sprachmodell'],
    [c('/init'), 'Lässt OpenCode Regeln für dein Projekt anlegen'],
    [c('/status'), 'Zeigt Verbindung und Werkzeuge'],
    [c('/exit'), 'Beendet OpenCode'],
  ])}
      <p>Den Hinweis ${c('/update')} kannst du ignorieren, OpenCode wird zentral aktualisiert.</p>
      <h3>Modelle</h3>
      ${table(['Stufe', 'Modell', 'Wofür'], [
    ['Schnell', 'GLM 5.3 Flash', 'Kleine Fragen und einfache Änderungen'],
    ['Standard', 'DeepSeek V4.1 Flash', 'Voreinstellung für die tägliche Arbeit'],
    ['Qualität', 'GLM 5.3', 'Schwierige Aufgaben'],
  ])}
      <p>Alle Modelle laufen über das zentrale Gateway der Plattform, du brauchst keinen eigenen Schlüssel.</p>` },

    { id: 'tools', title: 'Werkzeuge', html: `
      <p>OpenCode ist über eine zentrale Verbindung an deine Dienste angeschlossen. Du musst nur sagen, was du möchtest. Welche Daten sichtbar sind, hängt von deinem verbundenen Konto ab.</p>
      ${table(['Bereich', 'Was geht', 'Einrichtung'], [
    ['Google', 'Gmail, Kalender, Drive, Docs, Tabellen, Präsentationen, Aufgaben', 'Profil → Verbundene Dienste'],
    ['iCloud', 'Kalender, Kontakte und E-Mail, nur lesend', 'Profil → Verbundene Dienste'],
    ['GitHub', 'Code sichern und Änderungsvorschläge verwalten', 'Im Terminal, siehe <a href="#github">GitHub</a>'],
    ['Synology', 'Dateien auf der NAS lesen', 'Eigenes Konto auf der NAS'],
    ['Familie', 'Beamer, Stundenplan, Heizung, Geburtstage, Familienkalender', 'Nur für freigeschaltete Konten'],
  ])}
      <blockquote><strong>Wichtig:</strong> Was OpenCode aus Mails oder Dokumenten liest, geht an das Sprachmodell. Lass es nur lesen, was die Aufgabe braucht.</blockquote>
      <p>Passwörter und Schlüssel gibst du nie im Chat ein. Verbunden wird immer im Profil oder mit einem eigenen Befehl.</p>
      <p>Skills sind Anleitungen, mit denen OpenCode die Regeln der Plattform kennt. Sie liegen in ${c('/etc/devbox/skills')} und werden automatisch genutzt.</p>` },

    { id: 'setup', title: 'So ist OpenCode eingerichtet', html: `
      <p>OpenCode ist bei allen gleich eingerichtet. Ändert sich etwas zentral, gilt es für jeden, auch für neue User. Du musst nichts konfigurieren.</p>
      <h3>Was OpenCode weiß</h3>
      <p>Dass es in deinem Container läuft und was es dort darf, wie GitHub funktioniert, welche Werkzeuge es gibt, wie der Server aussieht und wo die Grenzen sind.</p>
      <h3>Woran es sich hält</h3>
      <ul>
        <li>Code, Commits und Pull Requests auf Englisch, Oberflächen und Anleitungen auf Deutsch</li>
        <li>Nach jeder Aufgabe ein Commit, der Branch wird danach automatisch gepusht</li>
        <li>Änderungen laufen über einen Branch und einen Pull Request, nicht direkt auf ${c('main')}</li>
        <li>Keine Geheimnisse im Code, Tests vor dem Commit</li>
      </ul>
      <h3>Was automatisch geprüft wird</h3>
      ${table(['Wann', 'Was passiert'], [
    ['Vor einem Befehl', 'Force-Push, Push auf ein bestehendes main, Befehle die Arbeit verwerfen und falsche Commit-Texte werden gestoppt'],
    ['Nach einer Änderung', 'Erinnerung an die Tests der App'],
    ['Am Ende einer Aufgabe', 'Neue Commits werden gepusht, außer auf main oder bei Verdacht auf ein Geheimnis'],
  ])}
      <p>Das gilt nur für OpenCode. Was du selbst im Terminal eintippst, wird nicht geprüft. Details stehen im Skill ${c('bh-opencode')}.</p>` },

    { id: 'limits', title: 'Grenzen und Hilfe', html: `
      <ul>
        <li>Eine App läuft nur, solange du sie gestartet hast. Nach einem Neustart deines Containers startest du sie erneut mit ${c('bash scripts/app.sh start')}.</li>
        <li>Der Server ist klein: Ein Prozessorkern für alle, dein Container darf bis zu 2,5 GB Arbeitsspeicher und 10 GB Platz nutzen.</li>
        <li>Du hast in deinem Container keine Admin-Rechte und kein Docker. Andere Container und den Server erreichst du nicht.</li>
        <li>Mit der Bildschirmtastatur auf echten Handys ist das Terminal noch nicht getestet.</li>
      </ul>
      <p>Meldet ein Werkzeug „nicht verbunden“, verbinde den Dienst im Profil oder wie oben beschrieben. Bleibt etwas hängen, sag OpenCode, was passiert ist, oder frag den Admin der Plattform.</p>` },

    { id: 'apps', title: 'Eigene Apps programmieren', group: 'Für Fortgeschrittene', html: `
      <p class="guide-note">Ab hier geht es ums Programmieren. Wenn du nur mit OpenCode sprechen willst, brauchst du die folgenden Abschnitte nicht.</p>
      <p>Du kannst bauen, was du möchtest. Für klassische Web-Apps gibt es ein fertiges Gerüst mit Design, Anmeldung, Datenbank und Tests. Es ist ein Angebot: Spiele und andere freie Anwendungen dürfen ganz anders aussehen und eine eigene Menüführung haben.</p>
      <p>Am einfachsten sagst du OpenCode, was du brauchst:</p>
      <blockquote>Bau mir ein kleines Jump-and-Run in ~/projects/hopser mit eigener Oberfläche. Es soll auf Port 3060 laufen, richte die Route /hopser ein.</blockquote>
      <blockquote>Bau mir mit dem Skill bh-webapp-skeleton eine Web-App „Ideen-Board“ in ~/projects/ideen-board auf Port 3050 unter dem Pfad /ideen.</blockquote>
      <p>Mit dem Gerüst geht es von Hand so:</p>
      <h3>1. App anlegen</h3>
      ${cmd('bash /etc/devbox/skills/bh-webapp-skeleton/setup/init.sh ideen-board "Ideen-Board" --port 3050 --base /ideen')}
      <h3>2. Lokal ausprobieren und testen</h3>
      ${cmd('cd ~/projects/ideen-board\nDEV_USER_EMAIL=ich@beispiel.de DEV_USER_ROLE=admin npm start')}
      ${cmd('npm test')}
      <h3>3. Für die Anmeldung vorbereiten und starten</h3>
      <p>Lege in der App die Datei ${c('.env')} an, damit sie die Anmeldung der Plattform übernimmt, und starte sie im Hintergrund:</p>
      ${cmd('echo "TRUST_PROXY_AUTH=1" >> .env\nbash scripts/app.sh start')}
      <p>Nach einem Neustart deines Containers startest du die App mit dem zweiten Befehl erneut.</p>
      <h3>4. Adresse festlegen</h3>
      ${cmd('bh-route add /ideen 3050')}
      <p>Der Befehl zeigt dir die vollständige Adresse, etwa <strong>dein-name.familiebiskup.de/ideen</strong>. Alle Adressen siehst du mit ${c('bh-route list')}, und OpenCode kennt sie auch. Das geht auch im Terminal unter <strong>Meine Apps</strong>. Erlaubt sind die Ports 1024 bis 65535, außer 2222 und 8088.</p>
      <h3>Daten speichern</h3>
      <p>Daten liegen immer in SQLite mit passenden Indizes, nie in JSON-Dateien: eine Datei je App, kein eigener Datenbank-Server. Der Server ist dafür zu klein. Die Daten liegen in deinem Container und werden nicht automatisch gesichert.</p>` },

    { id: 'publish', title: 'Veröffentlichen', html: `
      ${table(['Weg', 'Wer sieht es', 'Wie'], [
    ['Eigene Subdomain', 'Alle angemeldeten User, die die Adresse kennen', c('bh-route add')],
    ['Öffentlich', 'Alle im Internet, nach bestandener Prüfung', c('bh-route public')],
    ['Plattform-App', 'Alle angemeldeten User, steht in der App-Übersicht', 'Ein Admin rollt sie aus'],
  ])}
      <h3>Öffentlich machen</h3>
      ${cmd('bh-route public /ideen ~/projects/ideen-board')}
      <p>Ein Wächter prüft die App alle 5 Minuten auf Geheimnisse im Code, sensible Dateien, von außen lesbare Quellen und Zugriffe auf die KI-Gateways. Erst danach ist sie öffentlich. Findet er später etwas, nimmt er die Freigabe sofort zurück. Das Ergebnis steht unter <strong>Meine Apps</strong>. Zurücknehmen geht mit ${c('bh-route private /ideen')}.</p>
      <h3>Zur Plattform-App promoten</h3>
      <p>Eine App aus deinem Container kann in die gemeinsame App-Übersicht wechseln. <strong>Vorbereiten kann das jeder, ausrollen nur ein Admin mit Zugang zum Server.</strong> OpenCode kann das nicht selbst.</p>
      ${table(['Wer', 'Was'], [
    ['Du', 'App vorbereiten und dem Admin Name, Ordner und eine kurze Beschreibung nennen'],
    ['Admin', 'App auf dem Server ausrollen, auf Wunsch nur für Admins sichtbar'],
    ['Plattform', 'Führt alle Tests aus und rollt bei Rot nichts aus'],
  ])}
      <p>Die App braucht ${c('server.js')}, ${c('package.json')} und ${c("const APP_BASE = '/name'")} und ein grünes ${c('npm test')}. Mit dem Gerüst legst du sie dafür mit ${c('--base /name')} an. Der Admin führt aus:</p>
      ${cmd('bhapp deploy name /srv/devbox/users/dein-name/home/projects/name "Kurze Beschreibung"')}
      <p>Danach läuft sie unter <strong>apps.familiebiskup.de/name</strong> und steht in der App-Übersicht. Der Ordner ${c('data/')} wird nicht mitgenommen, die Plattform-App startet mit eigenen Daten. Für jede neue Version muss der Admin erneut ausrollen.</p>` },

    { id: 'auth', title: 'Anmeldung in deiner App', html: `
      <p>Deine App braucht keinen eigenen Login. Die Plattform prüft die Anmeldung vorab und nennt deiner App, wer angemeldet ist:</p>
      ${table(['Angabe', 'Inhalt'], [[c('X-User-Email'), 'E-Mail-Adresse'], [c('X-User-Name'), 'Anzeigename'], [c('X-User-Role'), 'Rolle, etwa admin oder user']])}
      <p>Apps aus dem Gerüst nutzen das automatisch, sobald ${c('TRUST_PROXY_AUTH=1')} gesetzt ist. Der angemeldete Mensch steht dort in ${c('req.user')}.</p>
      <ul>
        <li>Alle angemeldeten User können deine App öffnen, wenn sie die Adresse kennen. Private Daten musst du in der App selbst nach ${c('req.user.email')} trennen.</li>
        <li>Bei öffentlichen Routen gibt es keine dieser Angaben, die Besucher sind unbekannt. Braucht eine öffentliche App eigene Konten, baut OpenCode sie nach dem Skill ${c('bh-app-accounts')}: Passwörter nur als Hash, sichere Sitzungen, Schutz vor Durchprobieren.</li>
        <li>Das Sitzungs-Cookie der Plattform erreicht deine App nie.</li>
      </ul>` },

    { id: 'github', title: 'GitHub', html: `
      <p>Jeder verbindet sein eigenes GitHub-Konto. Einmalig im Terminal:</p>
      ${cmd('bh-github-connect')}
      <p>Der Befehl zeigt einen Link und einen Code. Nach der Bestätigung im Browser sind ${c('git')}, ${c('gh')} und die Werkzeuge von OpenCode mit deinem Konto verbunden. Prüfen kannst du das mit ${c('bh-github-connect --status')}.</p>
      <p>Danach reicht ein Satz wie <em>„Lege ein privates GitHub-Repo an und sichere das Projekt dort.“</em> Von Hand:</p>
      ${cmd('git add <pfade>\ngit commit -m "feat: was und warum"\ngit push -u origin HEAD')}
      <p>Für Änderungen arbeitet OpenCode auf einem eigenen Branch und legt einen Pull Request an, also einen Vorschlag für eine Änderung, den jemand prüfen kann. Gemergt wird nur, wenn du es möchtest. Geheimnisse gehören in ${c('.env')}, nie ins Repo. Solange du nichts pushst, liegt dein Code nur in deinem Container.</p>` },

  ];
})();
