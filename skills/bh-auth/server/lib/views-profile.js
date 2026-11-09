import { avatarInner, esc, shell, when, googleIcon } from "./views.js";

const svg = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const KEY = svg(`<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>`);
const CLOUD = svg(`<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>`);
const SHIELD = svg(`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`);
const tag = (on, yes, no) => `<span class="p-tag ${on ? "on" : "off"}">${on ? yes : no}</span>`;

function row({ icon, title, status = "", sub, action = "", panel = "" }) {
  return `<div class="p-row"><span class="p-icon">${icon}</span><div class="p-text"><div class="p-title">${title}${status}</div><div class="p-sub">${sub}</div></div><div class="p-action">${action}</div>${panel}</div>`;
}

function passwordRow(user, min, open, error) {
  const has = !!user.passwordHash;
  const current = has ? `<label>Aktuelles Passwort<input type="password" name="current" autocomplete="current-password" required></label>` : "";
  const panel = `<form id="pwForm" class="p-panel" method="post" action="/change-password"${open ? "" : " hidden"}>${error ? `<p class="alert error" role="alert">${esc(error)}</p>` : ""}${current}
<label>Neues Passwort<input type="password" name="password" minlength="${min}" autocomplete="new-password" required></label>
<label>Wiederholen<input type="password" name="confirm" minlength="${min}" autocomplete="new-password" required></label>
<p class="p-hint">Mindestens ${min} Zeichen.</p><div class="p-buttons"><button type="submit">Passwort speichern</button><button type="button" class="p-btn" data-cancel="pwForm">Abbrechen</button></div></form>`;
  return row({ icon: KEY, title: "Passwort", status: tag(has, "Festgelegt", "Nicht festgelegt"), sub: has ? "Anmeldung mit E-Mail und Passwort" : "Lege ein Passwort als zweiten Anmeldeweg fest",
    action: `<button type="button" class="p-btn" data-toggle="pwForm" aria-expanded="${open}" aria-controls="pwForm">${has ? "Ändern" : "Festlegen"}</button>`, panel });
}

function googleRow(user, enabled) {
  const linked = !!user.googleSub;
  let action = "";
  let panel = "";
  if (linked && user.passwordHash) {
    action = `<button type="button" class="p-btn" data-toggle="unlinkConfirm" aria-expanded="false" aria-controls="unlinkConfirm">Trennen</button>`;
    panel = `<form id="unlinkConfirm" class="p-panel p-confirm" method="post" action="/profile/google/unlink" hidden><p>Möchtest du die Anmeldung mit Google wirklich trennen?</p><div class="p-buttons"><button type="submit" class="p-btn p-danger">Ja, trennen</button><button type="button" class="p-btn" data-cancel="unlinkConfirm">Abbrechen</button></div></form>`;
  } else if (!linked && enabled) {
    action = `<a class="p-btn p-primary" href="/oauth/google/link">Verknüpfen</a>`;
  }
  const sub = linked ? (user.googleEmail ? esc(user.googleEmail) : "Anmeldung mit Google ist aktiv") + (user.passwordHash ? "" : " · Zum Trennen zuerst ein Passwort festlegen") : "Melde dich mit deinem Google-Konto an, auch mit privater Adresse";
  return row({ icon: googleIcon, title: "Google", status: tag(linked, "Verknüpft", "Nicht verknüpft"), sub, action, panel });
}

function icloudAddressForm(state, error, form) {
  const mail = esc(form.mailUser ?? "");
  return `<form id="icloudForm" class="p-panel" method="post" action="/profile/icloud"${error ? "" : " hidden"}>${error ? `<p id="icloudError" class="alert error" role="alert">${esc(error)}</p>` : ""}
<p>Deine Anmeldung bleibt bestehen. Trage nur deine iCloud-Mail-Adresse ein (@icloud.com, @me.com oder @mac.com).</p>
<input type="hidden" name="appleId" value="${esc(state.appleId)}">
<label>iCloud-Mail-Adresse<input type="email" name="mailUser" value="${mail}" placeholder="name@icloud.com" autocomplete="off" required data-autofocus aria-describedby="icloudMailHint"></label>
<p id="icloudMailHint" class="p-hint">Apple verlangt für E-Mail diese Adresse, nicht die Apple-ID. Hast du keine, kannst du abbrechen: Kalender und Kontakte bleiben nutzbar.</p>
<div class="p-buttons"><button type="submit">Speichern</button><button type="button" class="p-btn" data-cancel="icloudForm">Abbrechen</button></div></form>`;
}

function icloudForm(user, state, error, form) {
  const apple = esc(form.appleId ?? state.appleId ?? user.email);
  const mail = esc(form.mailUser ?? "");
  const invalid = error ? ` aria-invalid="true" aria-describedby="icloudError"` : "";
  return `<form id="icloudForm" class="p-panel" method="post" action="/profile/icloud"${error ? "" : " hidden"}>${error ? `<p id="icloudError" class="alert error" role="alert">${esc(error)}</p>` : ""}
<div class="p-guide"><p>Du brauchst ein app-spezifisches Passwort, dein normales Apple-Passwort funktioniert hier nicht. Das dauert etwa eine Minute:</p>
<ol class="p-steps"><li><a href="https://account.apple.com/account/manage" target="_blank" rel="noopener">Apple-Konto öffnen (neuer Tab)</a></li><li>„Anmeldung und Sicherheit“, dann „App-spezifische Passwörter“</li><li>Neues Passwort erstellen, Name zum Beispiel „BH Platform“</li><li>Das angezeigte Passwort unten einfügen</li></ol>
<p class="p-hint">Dafür muss bei Apple die Zwei-Faktor-Authentifizierung aktiv sein. Das Passwort gilt nur für diesen Zugriff und lässt sich bei Apple jederzeit widerrufen.</p></div>
<label>Apple-ID<input type="email" name="appleId" value="${apple}" autocomplete="username" required></label>
<div class="p-field"><label for="icloudPassword">App-spezifisches Passwort</label><div class="p-secret"><input id="icloudPassword" type="password" name="password" placeholder="abcd-efgh-ijkl-mnop" pattern="\\s*([a-zA-Z]{4}-?){3}[a-zA-Z]{4}\\s*" title="Vier Gruppen aus je vier Buchstaben" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false"${state.connected ? "" : " required"}${invalid}><button type="button" class="p-btn" data-reveal="icloudPassword">Anzeigen</button></div>${state.connected ? `<p class="p-hint">Leer lassen behält das bisherige Passwort.</p>` : ""}</div>
<details class="p-more"${form.mailUser ? " open" : ""}><summary>Andere iCloud-Mail-Adresse angeben</summary><label>iCloud-Mail-Adresse<input type="email" name="mailUser" value="${mail}" autocomplete="off" aria-describedby="icloudMailHint"></label><p id="icloudMailHint" class="p-hint">Nur nötig, wenn deine Apple-ID keine @icloud.com-Adresse ist und du iCloud-Mail nutzt.</p></details>
<div class="p-buttons"><button type="submit">iCloud verbinden</button><button type="button" class="p-btn" data-cancel="icloudForm">Abbrechen</button></div></form>`;
}

function icloudRow(state, user, error, form = {}) {
  if (!state) return "";
  const { connected, appleId, rejected, mailRejected } = state;
  const addressOnly = connected && mailRejected && !rejected;
  const label = addressOnly ? "Adresse ergänzen" : connected ? "Neu verbinden" : "Verbinden";
  const toggle = `<button type="button" class="p-btn${!connected || rejected || mailRejected ? " p-primary" : ""}" data-toggle="icloudForm" aria-expanded="${!!error}" aria-controls="icloudForm">${label}</button>`;
  const action = connected ? `<button type="button" class="p-btn" data-toggle="icloudConfirm" aria-expanded="false" aria-controls="icloudConfirm">Trennen</button> ${toggle}` : toggle;
  const confirm = connected ? `<form id="icloudConfirm" class="p-panel p-confirm" method="post" action="/profile/icloud/disconnect" hidden><p>Deine Werkzeuge verlieren den Zugriff auf deine iCloud-Daten. Das Passwort wird hier gelöscht, bei Apple kannst du es zusätzlich widerrufen.</p><div class="p-buttons"><button type="submit" class="p-btn p-danger">Ja, trennen</button><button type="button" class="p-btn" data-cancel="icloudConfirm">Abbrechen</button></div></form>` : "";
  const sub = rejected ? "Passwort abgelaufen oder bei Apple widerrufen." : addressOnly ? "Kalender und Kontakte sind verbunden. Für E-Mail fehlt deine @icloud.com-Adresse." : connected ? `Verbunden als ${esc(appleId)}` : "Kalender, Kontakte und E-Mail, nur lesend";
  const status = rejected ? `<span class="p-tag warn">Anmeldung abgelehnt</span>` : addressOnly ? `<span class="p-tag warn">E-Mail unvollständig</span>` : tag(connected, "Verbunden", "Nicht verbunden");
  const formHtml = addressOnly ? icloudAddressForm(state, error, form) : icloudForm(user, state, error, form);
  return row({ icon: CLOUD, title: "iCloud", status, sub, action, panel: formHtml + confirm });
}

function googleServicesRow(state) {
  if (!state) return "";
  const { connected, email } = state;
  const connect = `<a class="p-btn${connected ? "" : " p-primary"}" href="/oauth/google/services">${connected ? "Neu verbinden" : "Verbinden"}</a>`;
  const action = connected ? `<button type="button" class="p-btn" data-toggle="servicesConfirm" aria-expanded="false" aria-controls="servicesConfirm">Trennen</button> ${connect}` : connect;
  const panel = connected ? `<form id="servicesConfirm" class="p-panel p-confirm" method="post" action="/profile/google/services/disconnect" hidden><p>Buddy und Beamer verlieren den Zugriff auf deine Google-Daten.</p><div class="p-buttons"><button type="submit" class="p-btn p-danger">Ja, trennen</button><button type="button" class="p-btn" data-cancel="servicesConfirm">Abbrechen</button></div></form>` : "";
  const sub = connected && email ? `Verbunden als ${esc(email)}` : "Kalender, Drive, Gmail, Docs, Tabellen, Präsentationen und Aufgaben";
  return row({ icon: googleIcon, title: "Google-Dienste", status: tag(connected, "Verbunden", "Nicht verbunden"), sub, action, panel });
}

function icloudPhotosRow(show) {
  if (!show) return "";
  return row({ icon: CLOUD, title: "iCloud-Fotos", sub: "Apple-Anmeldung für den Foto-Abgleich. Nötig nach einem Neustart und etwa alle zwei Monate.", action: `<a class="p-btn" href="/profile/icloud-photos/">Anmelden</a>` });
}

function servicesCard(google, icloud, user, icloudError, icloudForm, icloudPhotos) {
  if (!google && !icloud && !icloudPhotos) return "";
  return `<section class="p-card"><div class="p-card-head"><h2>Verbundene Dienste</h2><p>Damit Buddy, Beamer und deine Werkzeuge deine Daten nutzen können. Das ist unabhängig von der Anmeldung mit Google.</p></div><div class="p-list">${googleServicesRow(google)}${icloudRow(icloud, user, icloudError, icloudForm)}${icloudPhotosRow(icloudPhotos)}</div></section>`;
}

export function profileView({ user, notice, error, passwordError, openPassword, googleEnabled, googleServices, icloud, icloudPhotos, icloudError, icloudForm, min }) {
  const open = !!(openPassword || passwordError);
  return shell(user, "Profil", `<div class="p-wrap"><header class="p-head"><span class="p-avatar" aria-hidden="true">${avatarInner(user)}</span><div class="p-who"><h1>${esc(user.name)}</h1><div class="p-mail">${esc(user.email)}</div><div class="p-meta"><span class="p-role">${user.isAdmin ? "Admin" : "Benutzer"}</span><span>Letzte Anmeldung: ${when(user.lastLogin)}</span></div></div></header>
${notice ? `<p class="alert ok" role="status">${esc(notice)}</p>` : ""}${error ? `<p class="alert error" role="alert">${esc(error)}</p>` : ""}
<section class="p-card"><div class="p-card-head"><h2>Persönliche Daten</h2><p>So erscheinst du in allen Apps.</p></div><form class="p-name" method="post" action="/profile"><label>Anzeigename<input name="name" value="${esc(user.name)}" maxlength="80" required></label><button type="submit">Speichern</button></form></section>
<section class="p-card"><div class="p-card-head"><h2>Anmeldung</h2><p>Wege, mit denen du dich bei der BH Platform anmeldest.</p></div><div class="p-list">${passwordRow(user, min, open, passwordError)}${googleRow(user, googleEnabled)}</div></section>${servicesCard(googleServices, icloud, user, icloudError, icloudForm, icloudPhotos)}
<section class="p-card"><div class="p-card-head"><h2>Sicherheit</h2></div><div class="p-list">${row({ icon: SHIELD, title: "Andere Geräte", sub: "Beendet deine Anmeldung überall außer auf diesem Gerät.", action: `<form method="post" action="/profile/sessions"><button type="submit" class="p-btn">Abmelden</button></form>` })}</div></section></div>`, { css: ["/profile.css"], js: ["/profile.js"] });
}
