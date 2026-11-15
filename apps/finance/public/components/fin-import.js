'use strict';
/** Import of bank exports, history of imports, and who may see the finances. */
window.FinImport = (() => {
  const { esc, date, BASE } = Fin;
  const ACCOUNTS = [['', 'Aus der Datei erkennen'], ['comdirect', 'comdirect Girokonto'], ['CD-CCM', 'comdirect Kreditkarte'], ['BBB', 'BBBank'], ['PayPal', 'PayPal']];

  async function render(host) {
    const [{ imports }, access] = await Promise.all([Fin.api('GET', '/imports'), Fin.api('GET', '/access')]);
    AppShell.render(host, `<header class="app-topbar"><div><h1>Kontoauszüge importieren</h1><div class="sub">CSV-Exporte von comdirect, BBBank und PayPal. Doppelte Buchungen werden erkannt und übersprungen.</div></div></header>
      <section class="card fin-upload"><form data-import>
        <span class="bh-label">Dateien</span><label class="fin-drop" for="fin-file"><input id="fin-file" class="fin-file" type="file" name="file" accept=".csv,text/csv" multiple required><span class="bh-btn">Dateien auswählen</span><span data-files>oder CSV-Dateien hierher ziehen</span></label>
        <label class="bh-label" for="fin-account">Konto</label><div id="fin-account"></div>
        <p class="fin-hint">Die Kreditkarte nutzt dasselbe Format wie das Girokonto. Wähle sie hier aus, damit die Buchungen beim richtigen Konto landen.</p>
        <div><button type="submit" class="bh-btn bh-btn-primary">Importieren</button></div><p class="fin-result" role="status" aria-live="polite"></p></form></section>
      ${AppShell.list({ title: 'Bisherige Importe', columns: [{ key: 'created_at', label: 'Am', html: (r) => esc(date(r.created_at.slice(0, 10))) }, { key: 'filename', label: 'Datei' }, { key: 'account', label: 'Konto' }, { key: 'range', label: 'Zeitraum', html: (r) => (r.first ? `${esc(date(r.first))} – ${esc(date(r.last))}` : '–') }, { key: 'added', label: 'Neu' }, { key: 'duplicates', label: 'Schon vorhanden' }], rows: imports, empty: 'Noch keine Importe.' })}
      ${access.admin ? `<section class="card fin-upload"><h2>Wer die Finanzen sieht</h2><p class="fin-hint">Admins sehen sie immer. Weitere Personen hier mit ihrer Anmelde-Adresse freigeben.</p>
        ${access.users.length ? `<ul class="fin-people">${access.users.map((u) => `<li>${esc(u.email)} <button type="button" class="bh-btn bh-btn-sm" data-remove="${esc(u.email)}">Entfernen</button></li>`).join('')}</ul>` : ''}
        <form data-access class="fin-inline"><label class="bh-label" for="fin-email">E-Mail</label><input id="fin-email" class="bh-input" type="email" required><button type="submit" class="bh-btn">Freigeben</button></form></section>` : ''}`);
    let account = '';
    BHSelectCore.create(host.querySelector('#fin-account'), { options: ACCOUNTS.map(([value, label]) => ({ value, label })), value: '', label: 'Konto', onChange: (v) => { account = v; } });
    const input = host.querySelector('#fin-file'); const drop = host.querySelector('.fin-drop');
    const showFiles = () => { host.querySelector('[data-files]').textContent = input.files.length ? [...input.files].map((f) => f.name).join(', ') : 'oder CSV-Dateien hierher ziehen'; };
    input.addEventListener('change', showFiles);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); input.files = e.dataTransfer.files; showFiles(); });
    host.querySelector('[data-import]').addEventListener('submit', async (e) => {
      e.preventDefault(); const out = host.querySelector('.fin-result'); const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; const lines = []; let open = 0;
      for (const file of input.files) {
        out.textContent = `${file.name} wird importiert …`;
        const body = new FormData(); body.set('file', file); if (account) body.set('account', account);
        try { const r = await Fin.api('POST', '/imports', body); lines.push(`${esc(file.name)}: ${r.added} neu für ${esc(r.account)}, ${r.duplicates} schon vorhanden`); open = r.open; } catch (x) { lines.push(`${esc(file.name)}: ${esc(x.message)}`); }
      }
      out.innerHTML = `${lines.join('<br>')}${open ? `<br><a class="bh-btn bh-btn-primary bh-btn-sm" href="${BASE}/transactions?category=OFFEN">${open} Buchungen zuordnen</a>` : ''}`;
      btn.disabled = false;
    });
    host.querySelector('[data-access]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await Fin.api('POST', '/access', { email: host.querySelector('#fin-email').value }); Toast.success('Freigegeben'); render(host); } catch (x) { Toast.error(x.message); }
    });
    host.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      try { await Fin.api('DELETE', `/access/${encodeURIComponent(b.dataset.remove)}`); render(host); } catch (x) { Toast.error(x.message); }
    }));
  }

  return { render };
})();
