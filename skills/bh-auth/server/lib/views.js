export const when = (s) => (s ? new Date(s * 1000).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }) : "–");
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const brand = `<div class="brand"><span class="mark" aria-hidden="true">BH</span><span>BH Platform</span></div>`;

function page(title, body, { css = [], js = [] } = {}) {
  const links = ["/auth.css", ...css].map((h) => `<link rel="stylesheet" href="${h}">`).join("");
  const scripts = js.map((h) => `<script src="${h}" defer></script>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · BH Platform</title><script src="/theme.js"></script>${links}${scripts}</head><body>${body}</body></html>`;
}

const center = (title, inner) => page(title, `<main class="center"><section class="card narrow">${brand}${inner}</section></main>`);
const alert = (m, kind = "error") => (m ? `<p class="alert ${kind}" role="alert">${esc(m)}</p>` : "");

export const googleIcon = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.2h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.4z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/></svg>`;

export function loginView({ error, notice, next, google }) {
  const n = esc(next || "/");
  return center("Anmelden", `<h1>Anmelden</h1><p class="muted">Willkommen zurück.</p>${alert(notice, "ok")}${alert(error)}
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

export const messageView = (title, text) => center(title, `<h1>${esc(title)}</h1><p class="muted">${esc(text)}</p><a class="button secondary" href="/login">Zur Anmeldung</a>`);

const CHEVRON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
export const initials = (u) => esc(String(u.name || u.email || "?").split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join(""));

/** Profilbild, sonst Initialen. */
export const avatarInner = (u) => (u.avatarType ? `<img src="/avatar/me?v=${esc(u.avatarAt)}" alt="">` : initials(u));

function navTabs(user, active) {
  const tabs = [["apps", "/", "Apps"], ...(user.isAdmin ? [["users", "/admin", "Benutzer"], ["manage", "/admin/apps", "Apps verwalten"]] : [])];
  return tabs.map(([id, href, label]) => `<a class="bhs-tab${id === active ? " active" : ""}" href="${href}">${label}</a>`).join("");
}

// Standard-Benutzermenue: oben rechts, wie im Skeleton (siehe Skill bh-webapp-skeleton).
function userMenu(user) {
  const adminLinks = user.isAdmin ? `<a class="bh-um-item bh-um-mobile" role="menuitem" href="/admin">Benutzer</a><a class="bh-um-item bh-um-mobile" role="menuitem" href="/admin/apps">Apps verwalten</a>` : "";
  return `<div class="bh-um"><button type="button" class="bh-um-btn" aria-haspopup="menu" aria-expanded="false"><span class="bh-um-avatar" aria-hidden="true">${avatarInner(user)}</span><span class="bh-um-name">${esc(user.name)}</span><span class="bh-um-chevron">${CHEVRON}</span></button>
<div class="bh-um-pop" role="menu" hidden><div class="bh-um-head"><div class="bh-um-who">${esc(user.name)}</div><div class="bh-um-mail">${esc(user.email)}</div><span class="bh-um-role">${user.isAdmin ? "Admin" : "Benutzer"}</span></div>
<a class="bh-um-item" role="menuitem" href="/">App-Übersicht</a><a class="bh-um-item" role="menuitem" href="/profile">Mein Profil</a>${adminLinks}
<div class="bh-um-theme"><span>Design</span><div class="bh-um-seg"><button type="button" data-um-theme="light">Hell</button><button type="button" data-um-theme="dark">Dunkel</button></div></div>
<form method="post" action="/logout"><button class="bh-um-item bh-um-logout" role="menuitem">Abmelden</button></form></div></div>`;
}

const ACTIVE = { Apps: "apps", Benutzer: "users", "Apps verwalten": "manage" };

export function shell(user, title, content, { css = [], js = [], bare = false } = {}) {
  const main = bare ? content : `<main class="page">${content}</main>`;
  return page(title, `<header class="bhs-navbar"><a class="bhs-logo" href="/"><span class="bhs-mark" aria-hidden="true">BH</span><span>BH Platform</span></a>
<nav class="bhs-tabs" aria-label="Hauptnavigation">${navTabs(user, ACTIVE[title])}</nav><div class="bhs-right">${userMenu(user)}</div></header>${main}`, { css: ["/shell.css", ...css], js: ["/shell.js", ...js] });
}
