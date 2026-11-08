import { esc, shell, when } from "./views.js";

const initial = (name) => esc(String(name || "?").trim().charAt(0).toUpperCase());

function appCard({ name, description, url }) {
  return `<a class="app-card" href="${esc(url)}"><span class="app-icon" aria-hidden="true">${initial(name)}</span>
<span class="app-text"><strong>${esc(name)}</strong><span class="muted-line">${esc(description)}</span></span></a>`;
}

export function dashboardView(user, apps) {
  const builtIn = user.isAdmin ? [{ name: "Benutzerverwaltung", description: "Benutzer einladen und verwalten", url: "/admin" }] : [];
  const cards = [...apps, ...builtIn].map(appCard).join("");
  const empty = `<section class="card"><p class="muted-line">Für dein Konto sind noch keine Apps freigegeben.</p></section>`;
  return shell(user, "Apps", `<h1>Apps</h1><p class="lead">Hallo ${esc(user.name)}, hier findest du alle Apps, die dir zur Verfügung stehen.</p>
${cards ? `<div class="app-grid">${cards}</div>` : empty}`);
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
