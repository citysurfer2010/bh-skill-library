export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const brand = `<div class="brand"><span class="mark" aria-hidden="true">BH</span><span>BH Platform</span></div>`;

function page(title, body, cls = "") {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · BH Platform</title><link rel="stylesheet" href="/auth.css"></head><body class="${cls}">${body}</body></html>`;
}

const center = (title, inner) => page(title, `<main class="center"><section class="card narrow">${brand}${inner}</section></main>`);
const alert = (m, kind = "error") => (m ? `<p class="alert ${kind}" role="alert">${esc(m)}</p>` : "");

const googleIcon = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.2h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.4z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/></svg>`;

export function loginView({ error, next, google }) {
  const n = esc(next || "/");
  return center("Anmelden", `<h1>Anmelden</h1><p class="muted">Willkommen zurück.</p>${alert(error)}
${google ? `<a class="button secondary" href="/oauth/google?next=${encodeURIComponent(next || "/")}">${googleIcon}<span>Mit Google anmelden</span></a><div class="divider"><span>oder</span></div>` : ""}
<form method="post" action="/login"><input type="hidden" name="next" value="${n}">
<label>E-Mail<input type="email" name="email" autocomplete="username" required autofocus></label>
<label>Passwort<input type="password" name="password" autocomplete="current-password" required></label>
<button type="submit">Anmelden</button></form>
<p class="hint">Passwort vergessen? Bitte wende dich an deine Administration.</p>`);
}

export function setPasswordView({ error, token, email, min }) {
  return center("Passwort festlegen", `<h1>Passwort festlegen</h1><p class="muted">${esc(email)}</p>${alert(error)}
<form method="post" action="/set-password"><input type="hidden" name="token" value="${esc(token)}">
<label>Neues Passwort<input type="password" name="password" minlength="${min}" autocomplete="new-password" required autofocus></label>
<label>Wiederholen<input type="password" name="confirm" minlength="${min}" autocomplete="new-password" required></label>
<p class="hint">Mindestens ${min} Zeichen.</p><button type="submit">Speichern</button></form>`);
}

export function changePasswordView({ error, min }) {
  return center("Passwort ändern", `<h1>Passwort ändern</h1>${alert(error)}
<form method="post" action="/change-password">
<label>Aktuelles Passwort<input type="password" name="current" autocomplete="current-password" required autofocus></label>
<label>Neues Passwort<input type="password" name="password" minlength="${min}" autocomplete="new-password" required></label>
<label>Wiederholen<input type="password" name="confirm" minlength="${min}" autocomplete="new-password" required></label>
<button type="submit">Speichern</button></form><p class="hint"><a href="/">Zurück</a></p>`);
}

export const messageView = (title, text) => center(title, `<h1>${esc(title)}</h1><p class="muted">${esc(text)}</p><a class="button secondary" href="/login">Zur Anmeldung</a>`);

export function shell(user, title, content) {
  const nav = user.isAdmin ? `<a href="/admin">Benutzer</a>` : "";
  return page(title, `<header class="topbar">${brand}<nav>${nav}<a href="/change-password">Passwort</a>
<span class="who">${esc(user.name)}</span><form method="post" action="/logout"><button class="link">Abmelden</button></form></nav></header>
<main class="page">${content}</main>`);
}

export const homeView = (user) => shell(user, "Start", `<h1>Hallo ${esc(user.name)}</h1><section class="card"><p class="muted">Du bist angemeldet als ${esc(user.email)}.</p></section>`);
