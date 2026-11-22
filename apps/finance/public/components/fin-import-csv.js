'use strict';
/** CSV import in a dialog (from a button in the page header): files, account, result in the same dialog. The accounts come from the app, not from the code. */
window.FinCsv = (() => {

  function open(rerender) {
    const { esc, BASE } = Fin; let account = '';
    BHModal.open({
      title: 'CSV importieren', submitLabel: 'Importieren', busyLabel: 'Importiere …',
      body: `<span class="bh-label">Dateien</span><label class="fin-drop" for="fin-file"><input id="fin-file" class="fin-file" type="file" name="file" accept=".csv,text/csv" multiple required><span class="bh-btn">Dateien auswählen</span><span data-files>oder CSV-Dateien hierher ziehen</span></label>
        <label class="bh-label" for="fin-csv-account">Konto</label><div id="fin-csv-account"></div>
        <p class="fin-hint">Exporte von comdirect, BBBank und PayPal. Doppelte Buchungen werden erkannt und übersprungen. Die Kreditkarte nutzt dasselbe Format wie das Girokonto, dafür das Konto wählen.</p>`,
      onOpen: (d) => {
        const auto = [{ value: '', label: 'Aus der Datei erkennen' }];
        const pick = BHSelectCore.create(d.querySelector('#fin-csv-account'), { options: auto, value: '', label: 'Konto', onChange: (v) => { account = v; pick.update({ value: v }); } });
        // The family's own accounts (their own names), private ones first; a new name is not offered here.
        Fin.api('GET', '/accounts').then((r) => { const own = (r.accounts || []).filter((a) => a.scope === 'haushalt').map((a) => ({ value: a.name, label: a.name })); pick.update({ options: auto.concat(own) }); }).catch(() => {});
        const input = d.querySelector('#fin-file'); const drop = d.querySelector('.fin-drop');
        const show = () => { d.querySelector('[data-files]').textContent = input.files.length ? [...input.files].map((f) => f.name).join(', ') : 'oder CSV-Dateien hierher ziehen'; };
        input.addEventListener('change', show);
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); input.files = e.dataTransfer.files; show(); });
      },
      onSubmit: async (form) => {
        const files = [...form.querySelector('#fin-file').files]; if (!files.length) throw new Error('Bitte mindestens eine CSV-Datei wählen.');
        const lines = []; let open = 0; let failed = 0;
        for (const file of files) {
          const body = new FormData(); body.set('file', file); if (account) body.set('account', account);
          try { const r = await Fin.api('POST', '/imports', body); lines.push(`<li>${esc(file.name)}: ${r.added} neu für ${esc(r.account)}, ${r.duplicates} schon vorhanden</li>`); open = Math.max(open, r.open); } catch (x) { failed += 1; lines.push(`<li class="fin-bank-error-inline">${esc(file.name)}: ${esc(x.message)}</li>`); }
        }
        rerender();
        return { next: { title: failed ? 'Import mit Fehlern' : 'Import fertig', submitLabel: 'Schließen', body: `<ul class="fin-csv-result">${lines.join('')}</ul>${open ? `<p><a class="bh-btn bh-btn-sm" href="${BASE}/all/transactions?category=OFFEN">${open} Buchungen zuordnen</a></p>` : ''}`, onSubmit: async () => {} } };
      },
    });
  }
  return { open };
})();
