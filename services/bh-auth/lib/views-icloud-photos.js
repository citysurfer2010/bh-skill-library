import { esc, shell } from "./views.js";

const STEPS = ["Apple-Passwort", "Code vom iPhone", "Fertig"];

function progress(at) {
  return `<ol class="ip-steps" aria-label="Fortschritt">${STEPS.map((s, i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}"${i === at ? ' aria-current="step"' : ""}><span>${i + 1}</span>${s}</li>`).join("")}</ol>`;
}

const buttons = (label) => `<div class="p-buttons"><button type="submit" data-busy-label="Wird geprüft …">${label}</button><a class="p-btn" href="/profile">Abbrechen</a></div>`;

function body(state, error) {
  const alert = error ? `<p class="alert error" role="alert">${esc(error)}</p>` : "";
  const invalid = error ? ' aria-invalid="true"' : "";
  if (state.step === "password") {
    return `${progress(0)}${alert}<form class="p-panel ip-form" method="post" action="/profile/icloud-photos/password">
<p>Gib dein normales Apple-Passwort ein. Danach schickt Apple eine Bestätigung an dein iPhone.</p>
<div class="p-field"><label for="ipPassword">Apple-Passwort für ${esc(state.account || "deine Apple-ID")}</label><div class="p-secret"><input id="ipPassword" type="password" name="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus aria-describedby="ipPasswordHint"${invalid}><button type="button" class="p-btn" data-reveal="ipPassword">Anzeigen</button></div></div>
<p id="ipPasswordHint" class="p-hint">Dein Passwort geht direkt an den Foto-Abgleich auf deinem eigenen Server und wird nicht gespeichert. Gespeichert wird nur die Apple-Anmeldung, sie hält etwa zwei Monate. Ein app-spezifisches Passwort reicht hier nicht, weil Apple für Fotos keine offizielle Schnittstelle anbietet.</p>
${buttons("Weiter")}</form>`;
  }
  if (state.step === "code") {
    return `${progress(1)}${alert}<form class="p-panel ip-form" method="post" action="/profile/icloud-photos/code">
<p>Tippe auf deinem iPhone oder Mac auf „Erlauben“. Dann erscheint ein 6-stelliger Code, den du hier eingibst.</p>
<div class="p-field"><label for="ipCode">Bestätigungscode</label><input id="ipCode" class="ip-code" type="text" name="code" inputmode="numeric" pattern="[\\d\\s]{6,8}" maxlength="8" autocomplete="one-time-code" title="6 Ziffern" required autofocus aria-describedby="ipCodeHint"${invalid}>
<p id="ipCodeHint" class="p-hint">6 Ziffern, Leerzeichen sind egal. Kein Code gekommen? Auf dem iPhone unter Einstellungen › dein Name › Anmelden &amp; Sicherheit › Bestätigungscode erhalten.</p></div>
${buttons("Bestätigen")}</form>`;
  }
  if (state.step === "ok") {
    return `${progress(3)}${alert}<div class="p-panel ip-done"><p><span class="p-tag on">Verbunden</span></p>
<p>Neue Fotos und Videos aus deiner iCloud kommen einmal am Tag auf die Synology. Du musst hier nichts tun.</p>
<p class="p-hint">Etwa alle zwei Monate verlangt Apple eine neue Anmeldung. Dann steht an dieser Stelle wieder das Formular.</p>
<div class="p-buttons"><a class="p-btn" href="/profile">Zurück zum Profil</a></div></div>`;
  }
  if (state.step === "busy") {
    return `${progress(state.after === "code" ? 2 : state.after === "password" ? 1 : 0)}<div class="p-panel ip-busy" data-poll="/profile/icloud-photos/state" data-after="${esc(state.after || "")}">
<p role="status"><span class="ip-spinner" aria-hidden="true"></span>Apple prüft die Anmeldung …</p>
<p class="p-hint">Die Seite geht von selbst weiter.</p>
<p class="p-hint ip-slow" hidden>Das dauert ungewöhnlich lange. Du kannst abbrechen und es später noch einmal versuchen.</p>
<div class="p-buttons"><a class="p-btn" href="/profile">Abbrechen</a></div></div>`;
  }
  return `<div class="p-panel" role="alert"><p><span class="p-tag warn">Nicht erreichbar</span></p><p>Der Foto-Abgleich läuft auf dem Server gerade nicht. Versuche es in ein paar Minuten noch einmal.</p><div class="p-buttons"><a class="p-btn" href="/profile/icloud-photos/">Erneut prüfen</a></div></div>`;
}

export function icloudPhotosView({ user, state, error }) {
  return shell(user, "iCloud-Fotos", `<div class="p-wrap"><a class="ip-back" href="/profile">← Profil</a>
<section class="p-card"><div class="p-card-head"><h2>iCloud-Fotos</h2><p>Anmeldung für den täglichen Abgleich deiner iCloud-Fotos und -Videos mit der Synology.</p></div>${body(state, state.step === "down" ? "" : error)}</section></div>`, { css: ["/profile.css", "/icloud-photos.css"], js: ["/profile.js", "/icloud-photos.js"] });
}
