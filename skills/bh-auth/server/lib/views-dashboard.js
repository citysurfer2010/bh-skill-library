import { esc, shell, when } from "./views.js";

const initial = (name) => esc(String(name || "?").trim().charAt(0).toUpperCase());

const SEARCH_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const CLEAR_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const ADMIN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const GRID_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;

function appTile(a) {
  const badge = a.adminOnly ? `<span class="tile-badge">Admin</span>` : "";
  return `<a href="${esc(a.url)}" class="app-tile"${a.url.startsWith("/") ? "" : ` target="_blank" rel="noopener noreferrer"`}>${badge}<div class="tile-icon">${initial(a.name)}</div>
<div class="tile-label">${esc(a.name)}</div><div class="tile-desc">${esc(a.description)}</div></a>`;
}

const adminTile = (href, icon, label, desc) => `<a href="${href}" class="app-tile"><div class="tile-icon admin-icon">${icon}</div><div class="tile-label">${label}</div><div class="tile-desc">${desc}</div></a>`;
const section = (title, tiles) => `<div class="app-section"><div class="section-header"><h2>${title}</h2><div class="section-line"></div></div><div class="grid">${tiles}</div></div>`;

// Eingebettet statt nachgeladen: Kacheln und Suche stehen sofort. "<" maskiert, damit Namen den Block nicht beenden.
function searchData(apps, user) {
  const entries = [...apps.map((a) => ({ id: a.id, label: a.name, description: a.description, url: a.url }))];
  if (user.isAdmin) entries.push({ id: "users", label: "Benutzerverwaltung", description: "Benutzer und Berechtigungen", url: "/admin" }, { id: "manage", label: "Apps verwalten", description: "Apps der Übersicht pflegen", url: "/admin/apps" });
  return JSON.stringify({ apps: entries, modules: [] }).replace(/</g, "\\u003c");
}

export function dashboardView(user, apps) {
  const first = String(user.name || "").trim().split(/\s+/)[0];
  const appsSection = apps.length ? section("Anwendungen", apps.map(appTile).join("")) : `<div class="app-section-none"><div class="grid"><div class="no-apps">Für dein Konto sind noch keine Apps freigegeben.</div></div></div>`;
  const admin = user.isAdmin ? section("Verwaltung", adminTile("/admin", ADMIN_ICON, "Benutzerverwaltung", "Benutzer und Berechtigungen") + adminTile("/admin/apps", GRID_ICON, "Apps verwalten", "Apps der Übersicht pflegen")) : "";
  return shell(user, "Apps", `<main><div class="hero"><h1>Hallo ${esc(first)}</h1><p>Ihre Anwendungen</p></div>
<div class="app-search-wrap"><label class="app-search">${SEARCH_ICON}<input type="text" id="appSearch" placeholder="App oder Modul suchen…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="appSearchResults" aria-label="App oder Modul suchen">
<span class="app-search-kbd" id="appSearchKbd">/</span><button type="button" id="appSearchClear" class="app-search-clear" hidden aria-label="Suche leeren">${CLEAR_ICON}</button></label>
<div class="app-search-results" id="appSearchResults" role="listbox" aria-label="Module" hidden></div></div>
<div id="tiles">${appsSection}${admin}<div class="grid"><div class="no-apps" id="searchEmpty" hidden>Keine App gefunden für „<span id="searchEmptyQuery"></span>“.</div></div></div></main>
<script type="application/json" id="dashData">${searchData(apps, user)}</script>`, { bare: true, css: ["/dashboard.css"], js: ["/dashboard-modules.js", "/dashboard-search.js"] });
}

function googleAction(user, enabled) {
  if (user.googleSub) return `<form class="inline" method="post" action="/profile/google/unlink"><button class="link">Trennen</button></form>`;
  return enabled ? `<a href="/oauth/google/link">Mit Google verknüpfen</a>` : "";
}

export function profileView({ user, saved, error, googleEnabled }) {
  const status = (on, yes, no) => `<span class="tag ${on ? "on" : "wait"}">${on ? yes : no}</span>`;
  return shell(user, "Profil", `<h1>Profil</h1>
${saved ? `<p class="alert ok" role="status">Gespeichert.</p>` : ""}${error ? `<p class="alert error" role="alert">${esc(error)}</p>` : ""}
<section class="card profile-head"><span class="avatar" aria-hidden="true">${initial(user.name)}</span>
<div><strong>${esc(user.name)}</strong><div class="muted-line">${esc(user.email)}</div><div class="muted-line">${user.isAdmin ? "Admin" : "User"}</div></div></section>
<section class="card"><h2>Name</h2><form class="row" method="post" action="/profile">
<label>Anzeigename<input name="name" value="${esc(user.name)}" maxlength="80" required></label><button type="submit">Speichern</button></form></section>
<section class="card"><h2>Anmeldung</h2><dl class="facts">
<dt>E-Mail</dt><dd>${esc(user.email)}</dd>
<dt>Passwort</dt><dd>${status(user.passwordHash, "Festgelegt", "Nicht festgelegt")} <a href="/change-password">${user.passwordHash ? "Ändern" : "Festlegen"}</a></dd>
<dt>Google</dt><dd>${status(user.googleSub, "Verknüpft", "Nicht verknüpft")} ${googleAction(user, googleEnabled)}</dd>
<dt>Letzte Anmeldung</dt><dd>${when(user.lastLogin)}</dd></dl></section>
<section class="card"><h2>Sicherheit</h2><p class="muted-line">Beendet deine Anmeldung auf allen anderen Geräten.</p>
<form class="inline-form" method="post" action="/profile/sessions"><button class="small" type="submit">Auf allen anderen Geräten abmelden</button></form></section>`);
}

export function adminAppsView({ me, apps, error }) {
  const rows = apps.map((a) => `<tr><td data-label="Name">${esc(a.name)}</td><td data-label="Beschreibung">${esc(a.description)}</td><td data-label="Adresse">${esc(a.url)}</td>
<td data-label="Sichtbar für">${a.adminOnly ? "Nur Admins" : "Alle"}</td><td class="actions"><details class="confirm"><summary class="small danger">Löschen</summary>
<form method="post" action="/admin/apps/${esc(a.id)}/delete"><button class="small danger">Endgültig löschen</button></form></details></td></tr>`).join("");
  return shell(me, "Apps verwalten", `<h1>Apps verwalten</h1>${error ? `<p class="alert error" role="alert">${esc(error)}</p>` : ""}
<section class="card"><h2>App hinzufügen</h2><form class="row" method="post" action="/admin/apps">
<label>Name<input name="name" maxlength="60" required></label><label>Beschreibung<input name="description" maxlength="120"></label>
<label>Adresse<input name="url" placeholder="https://…" required></label><label class="check"><input type="checkbox" name="adminOnly" value="1">Nur Admins</label><button type="submit">Hinzufügen</button></form></section>
<section class="card">${apps.length ? `<table><thead><tr><th>Name</th><th>Beschreibung</th><th>Adresse</th><th>Sichtbar für</th><th><span class="sr">Aktionen</span></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted-line">Noch keine Apps angelegt.</p>`}</section>`);
}
