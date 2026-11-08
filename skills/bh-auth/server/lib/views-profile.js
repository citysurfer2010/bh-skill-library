import { avatarInner, esc, shell, when, googleIcon } from "./views.js";

const svg = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const KEY = svg(`<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>`);
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

export function profileView({ user, notice, error, passwordError, openPassword, googleEnabled, min }) {
  const open = !!(openPassword || passwordError);
  return shell(user, "Profil", `<div class="p-wrap"><header class="p-head"><span class="p-avatar" aria-hidden="true">${avatarInner(user)}</span><div class="p-who"><h1>${esc(user.name)}</h1><div class="p-mail">${esc(user.email)}</div><div class="p-meta"><span class="p-role">${user.isAdmin ? "Admin" : "Benutzer"}</span><span>Letzte Anmeldung: ${when(user.lastLogin)}</span></div></div></header>
${notice ? `<p class="alert ok" role="status">${esc(notice)}</p>` : ""}${error ? `<p class="alert error" role="alert">${esc(error)}</p>` : ""}
<section class="p-card"><div class="p-card-head"><h2>Persönliche Daten</h2><p>So erscheinst du in allen Apps.</p></div><form class="p-name" method="post" action="/profile"><label>Anzeigename<input name="name" value="${esc(user.name)}" maxlength="80" required></label><button type="submit">Speichern</button></form></section>
<section class="p-card"><div class="p-card-head"><h2>Anmeldung</h2><p>Wege, mit denen du dich bei der BH Platform anmeldest.</p></div><div class="p-list">${passwordRow(user, min, open, passwordError)}${googleRow(user, googleEnabled)}</div></section>
<section class="p-card"><div class="p-card-head"><h2>Sicherheit</h2></div><div class="p-list">${row({ icon: SHIELD, title: "Andere Geräte", sub: "Beendet deine Anmeldung überall außer auf diesem Gerät.", action: `<form method="post" action="/profile/sessions"><button type="submit" class="p-btn">Abmelden</button></form>` })}</div></section></div>`, { css: ["/profile.css"], js: ["/profile.js"] });
}
