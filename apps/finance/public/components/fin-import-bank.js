'use strict';
/** Bank connections on the import page: rows for the connections table and the dialogs (connect, rename, disconnect). */
window.FinBank = (() => {
  const BANK_NAMES = { Comdirect: 'comdirect', BBBank: 'BBBank', DKB: 'DKB', PayPal: 'PayPal' };
  const WARN_DAYS = 14;
  const PEN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const REASONS = { access_denied: 'Du hast die Freigabe bei der Bank abgebrochen. Es wurde nichts geändert.' };
  let wasRunning = false;
  const soon = (a) => a.valid_until && Date.parse(a.valid_until) - Date.now() < WARN_DAYS * 86_400_000;

  function access(a) {
    const { esc, date } = Fin;
    if (a.status !== 'active') return '<span class="fin-badge fin-badge-warn">abgelaufen</span>';
    if (!a.valid_until) return '–';
    return `<span class="fin-badge${soon(a) ? ' fin-badge-warn' : ''}">bis ${esc(date(a.valid_until.slice(0, 10)))}</span>`;
  }

  /** Status as a badge in plain words; the bank's raw message stays in the tooltip. */
  function status(a) {
    const { esc } = Fin; const synced = a.last_sync_at ? ` <span class="fin-hint fin-conn-synced">· abgerufen ${esc(new Date(a.last_sync_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</span>` : '';
    if (a.last_error && a.status === 'active') {
      const down = /\b5\d\d\b|nicht erreichbar|timeout|zu lange/i.test(a.last_error);
      return `<span class="fin-badge fin-badge-danger" title="${esc(`${down ? 'Der nächste tägliche Abruf versucht es wieder. ' : ''}Meldung der Bank: ${a.last_error}`)}">${down ? 'Bank nicht erreichbar' : 'Abruf fehlgeschlagen'}</span>${synced}`;
    }
    if (a.status !== 'active') return '<span class="fin-badge fin-badge-warn">bitte neu verbinden</span>';
    return a.last_sync_at ? `<span class="fin-badge fin-badge-ok">OK</span>${synced}` : '<span class="fin-hint">noch nicht abgerufen</span>';
  }

  /** One row per bank account for AppShell.list (the connections table). */
  function rows(s) {
    const { esc } = Fin;
    return (s.accounts || []).map((a) => ({
      kind: 'bank', name: a.label, uid: a.uid, aspsp: a.aspsp, synced: a.last_sync_at, from: a.first_booked_on, sortAccess: a.status === 'active' ? a.valid_until || '' : '',
      nameHtml: `<div class="fin-acc-name" data-uid="${esc(a.uid)}" data-name="${esc(a.label)}"><strong>${esc(a.label)}</strong><button type="button" class="fin-acc-rename" data-bank-rename aria-label="${esc(a.label)} umbenennen">${PEN}</button></div>`,
      sourceHtml: `<span class="fin-acc-bank">${esc(BANK_NAMES[a.aspsp] || a.aspsp)}</span>${a.iban ? `<div class="fin-hint fin-num">${esc(a.iban)}</div>` : ''}${a.name ? `<div class="fin-hint">${esc(a.name)}</div>` : ''}`,
      accessHtml: access(a),
      statusHtml: status(a),
      actionsHtml: `${a.status !== 'active' || soon(a) ? `<button type="button" class="bh-btn bh-btn-sm bh-btn-primary" data-renew="${esc(a.aspsp)}" title="${a.status !== 'active' ? 'Zugriff abgelaufen' : 'Zugriff endet bald'}">Neu verbinden</button>` : ''}<button type="button" class="bh-btn bh-btn-sm bh-btn-danger" data-bank-drop="${esc(a.uid)}" data-name="${esc(a.label)}">Trennen</button>`,
    }));
  }

  async function connect(aspsp) {
    const { url } = await Fin.api('POST', '/bank/connect', { aspsp });
    location.href = url; // the bank sends the browser back to /finance/import?bank=ok
  }

  function connectDialog(s) {
    let bank = s.banks[0];
    BHModal.open({
      title: 'Bank verbinden', submitLabel: 'Weiter zur Bank', busyLabel: 'Weiter zur Bank …',
      body: `<label class="bh-label" for="fin-bank-pick">Bank</label><div id="fin-bank-pick"></div>
        <p class="fin-hint">Du meldest dich bei deiner Bank an, gibst den Zugriff frei (nur lesend, 180 Tage) und landest danach wieder hier. Der erste Abruf startet dann von selbst.</p>`,
      onOpen: (d) => { const pick = BHSelectCore.create(d.querySelector('#fin-bank-pick'), { options: s.banks.map((b) => ({ value: b, label: BANK_NAMES[b] || b })), value: bank, label: 'Bank', onChange: (v) => { bank = v; pick.update({ value: v }); } }); },
      onSubmit: () => connect(bank).then(() => new Promise(() => {})), // stays open until the page leaves for the bank
    });
  }

  function dropDialog(uid, name, rerender) {
    BHModal.open({
      title: `„${Fin.esc(name)}“ trennen?`, submitLabel: 'Trennen', danger: true,
      body: '<p>Neue Umsätze dieses Kontos werden dann nicht mehr abgerufen. Die bisherigen Buchungen bleiben erhalten. Später lässt es sich wieder verbinden.</p>',
      onSubmit: async () => { await Fin.api('DELETE', `/bank/accounts/${encodeURIComponent(uid)}`); Toast.success('Getrennt'); rerender(); },
    });
  }

  function bind(host, s, rerender) {
    host.querySelectorAll('[data-bank-rename]').forEach((b) => b.addEventListener('click', () => {
      const box = b.closest('[data-uid]');
      FinRename.open({ current: box.dataset.name,
        save: ({ name: label }, merge) => Fin.api('PATCH', `/bank/accounts/${encodeURIComponent(box.dataset.uid)}`, merge ? { label, merge: true } : { label }),
        done: () => rerender() });
    }));
    host.querySelectorAll('[data-renew]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; b.textContent = 'Weiter zur Bank …'; try { await connect(b.dataset.renew); } catch (x) { Toast.error(x.message); rerender(); } }));
    host.querySelectorAll('[data-bank-drop]').forEach((b) => b.addEventListener('click', () => dropDialog(b.dataset.bankDrop, b.dataset.name, rerender)));
  }

  function summary(results) {
    const bad = results.filter((r) => r.error);
    const added = results.reduce((n, r) => n + (r.added || 0), 0);
    const errors = bad.length ? `, ${bad.length === 1 ? '1 Konto' : `${bad.length} Konten`} mit Fehler (siehe Tabelle)` : '';
    return { text: `${added} neue ${added === 1 ? 'Buchung' : 'Buchungen'}${errors}`, ok: !bad.length };
  }

  /** Message after coming back from the bank; while a fetch runs the page refreshes itself and reports the end. */
  function afterReturn(s, rerender) {
    const q = new URLSearchParams(location.search);
    if (q.get('bank') === 'ok') Toast.success('Bank verbunden. Der erste Abruf läuft.');
    if (q.get('bank') === 'error') { const r = q.get('reason') || ''; Toast.error(REASONS[r] || (r && !/^[a-z_]+$/.test(r) ? r : 'Die Bank hat die Verbindung abgelehnt. Bitte später noch einmal versuchen.')); }
    if (q.has('bank')) history.replaceState(null, '', location.pathname);
    if (wasRunning && !s.running) {
      const bad = (s.accounts || []).filter((a) => a.last_error && a.status === 'active').length;
      (bad ? Toast.error : Toast.success)(bad ? `Abruf fertig, ${bad === 1 ? '1 Konto' : `${bad} Konten`} mit Fehler (siehe Tabelle)` : 'Abruf fertig.');
    }
    wasRunning = s.running;
    if (s.running) setTimeout(function again() { if (document.querySelector('dialog.bh-modal[open]')) setTimeout(again, 4000); else rerender(); }, 4000);
  }

  return { rows, bind, connectDialog, summary, afterReturn };
})();
