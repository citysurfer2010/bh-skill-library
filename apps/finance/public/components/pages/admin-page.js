'use strict';
/** Admin settings of the finance app (role check on the server): who may see the finances (Matti: belongs here, not on the import page). */
(async () => {
  const host = document.getElementById('page-host');
  const esc = (v) => AppShell.esc(v);
  const date = (iso) => new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });

  async function render(me) {
    const { users } = await Fin.api('GET', '/access');
    AppShell.render(host, `<header class="app-topbar"><div><h1>Einstellungen</h1><div class="sub">Nur für Admins. Admins sehen die Finanzen immer.</div></div>
      <div class="app-topbar-actions"><button type="button" class="bh-btn bh-btn-primary" data-grant>Person freigeben</button></div></header>
      ${AppShell.list({ title: 'Wer die Finanzen sieht', storageKey: 'finance-access', rows: users, empty: 'Bisher nur Admins. Weitere Personen oben mit „Person freigeben“.', columns: [
    { key: 'email', label: 'Anmelde-Adresse' },
    { key: 'added_at', label: 'Freigegeben am', html: (u) => esc(date(u.added_at)), sortValue: (u) => u.added_at },
    { key: 'actions', label: 'Aktionen', srOnly: true, sortable: false, html: (u) => `<div class="fin-row-actions"><button type="button" class="bh-btn bh-btn-sm bh-btn-danger" data-revoke="${esc(u.email)}">Entfernen</button></div>` },
  ] })}
      <p class="fin-hint">Angemeldet als ${esc(me.email)}.</p>`);
    host.querySelector('[data-grant]').addEventListener('click', () => BHModal.open({
      title: 'Person freigeben', submitLabel: 'Freigeben',
      body: '<label class="bh-label" for="fin-grant">Anmelde-Adresse</label><input id="fin-grant" class="bh-input" name="email" type="email" required autofocus><p class="fin-hint">Die Person sieht danach alle Finanzen: Übersicht, Buchungen, Konten und Investments.</p>',
      onSubmit: async (f) => { await Fin.api('POST', '/access', { email: f.elements.email.value }); Toast.success('Freigegeben'); render(me); },
    }));
    host.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', () => BHModal.open({
      title: `${esc(b.dataset.revoke)} entfernen?`, submitLabel: 'Entfernen', danger: true,
      body: '<p>Die Person sieht die Finanzen danach nicht mehr. Ihre bisherigen Zuordnungen bleiben.</p>',
      onSubmit: async () => { await Fin.api('DELETE', `/access/${encodeURIComponent(b.dataset.revoke)}`); render(me); },
    })));
  }

  try {
    Navbar.render('admin', null);
    AppShell.crumbs([['Finanzen', '/finance/'], ['Einstellungen']]);
    AppShell.loading(host, 'Einstellungen', 'table');
    const me = await FinanceApi.me();
    Navbar.render('admin', me);
    await render(me);
  } catch (e) {
    Toast.error(e.message || 'Fehler beim Laden');
  }
})();
