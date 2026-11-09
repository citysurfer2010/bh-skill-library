import { esc, shell, when } from "./views.js";

const action = (id, name, label, cls = "") => `<form method="post" action="/admin/users/${esc(id)}/${name}"><button class="small ${cls}">${label}</button></form>`;

function row(u, me) {
  const self = u.id === me.id;
  const status = u.disabled ? `<span class="tag off">Gesperrt</span>` : u.passwordHash || u.googleSub ? `<span class="tag on">Aktiv</span>` : `<span class="tag wait">Eingeladen</span>`;
  const actions = [
    action(u.id, "link", "Link erzeugen"),
    self ? "" : action(u.id, "admin", u.isAdmin ? "Admin entziehen" : "Zum Admin machen"),
    self ? "" : action(u.id, "disable", u.disabled ? "Entsperren" : "Sperren"),
    self ? "" : `<details class="confirm"><summary class="small danger">Löschen</summary>${action(u.id, "delete", "Endgültig löschen", "danger")}</details>`,
  ].join("");
  return `<tr><td data-label="Name">${esc(u.name)}</td><td data-label="E-Mail">${esc(u.email)}</td>
<td data-label="Rolle">${u.isAdmin ? "Admin" : "User"}</td><td data-label="Status">${status}</td>
<td data-label="Letzte Anmeldung">${when(u.lastLogin)}</td><td class="actions">${actions}</td></tr>`;
}

export function adminView({ me, users, link, error }) {
  const created = link ? `<section class="card notice"><h2>Link für ${esc(link.email)}</h2>
<p class="muted">Wird nur jetzt angezeigt. Bitte sicher weitergeben, gültig für ${link.hours} Stunden.</p><input readonly aria-label="Link" value="${esc(link.url)}"></section>` : "";
  return shell(me, "Benutzer", `<h1>Benutzer</h1>${error ? `<p class="alert error" role="alert">${esc(error)}</p>` : ""}${created}
<section class="card"><h2>Einladen</h2><form class="row" method="post" action="/admin/users">
<label>Name<input name="name" required></label><label>E-Mail<input type="email" name="email" required></label>
<label class="check"><input type="checkbox" name="isAdmin" value="1">Admin</label><button type="submit">Einladen</button></form></section>
<section class="card"><table><thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Status</th><th>Letzte Anmeldung</th><th><span class="sr">Aktionen</span></th></tr></thead>
<tbody>${users.map((u) => row(u, me)).join("")}</tbody></table></section>`);
}
