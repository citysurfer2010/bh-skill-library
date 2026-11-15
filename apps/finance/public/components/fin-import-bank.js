'use strict';
/** "Bankkonten" on the import page: connect a bank, see each account's last fetch, fetch now, rename or disconnect. */
window.FinBank = (() => {
  const when = (iso) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const BANK_NAMES = { Comdirect: 'comdirect', BBBank: 'BBBank', DKB: 'DKB', PayPal: 'PayPal' };
  const WARN_DAYS = 14;
  const REASONS = { access_denied: 'Du hast die Freigabe bei der Bank abgebrochen. Es wurde nichts geändert.' };
  let wasRunning = false; let focusHead = false;

  function badge(a) {
    const { esc, date } = Fin;
    if (a.status !== 'active') return '<span class="fin-badge fin-badge-warn">Zugriff abgelaufen</span>';
    if (!a.valid_until) return '';
    const day = esc(date(a.valid_until.slice(0, 10)));
    const soon = Date.parse(a.valid_until) - Date.now() < WARN_DAYS * 86_400_000;
    return soon ? `<span class="fin-badge fin-badge-warn">Zugriff endet am ${day}</span>` : `<span class="fin-badge">Zugriff erlaubt bis ${day}</span>`;
  }

  function account(a) {
    const { esc, date } = Fin;
    const renew = a.status !== 'active' || (a.valid_until && Date.parse(a.valid_until) - Date.now() < WARN_DAYS * 86_400_000);
    const facts = [BANK_NAMES[a.aspsp] || a.aspsp, a.name, a.iban].filter(Boolean).map(esc).join(' · ');
    const fetched = a.last_sync_at ? `Zuletzt abgerufen ${esc(when(a.last_sync_at))}${a.first_booked_on ? ` · Buchungen ab ${esc(date(a.first_booked_on))}` : ''}` : 'Noch nicht abgerufen';
    const l = esc(a.label);
    return `<li class="fin-bank-item" data-uid="${esc(a.uid)}" data-name="${l}">
      <div class="fin-bank-main"><div class="fin-bank-head"><strong>${l}</strong>${badge(a)}</div><div class="fin-hint">${facts}</div><div class="fin-hint">${fetched}</div>
        ${a.last_error && a.status === 'active' ? `<div class="fin-bank-error" role="status">Letzter Abruf fehlgeschlagen: ${esc(a.last_error)}</div>` : ''}</div>
      <div class="fin-bank-actions">${renew ? `<button type="button" class="bh-btn bh-btn-sm bh-btn-primary" data-renew="${esc(a.aspsp)}" aria-label="${l} neu verbinden">Neu verbinden</button>` : ''}
        <button type="button" class="bh-btn bh-btn-sm" data-rename aria-label="${l} umbenennen">Umbenennen</button><button type="button" class="bh-btn bh-btn-sm bh-btn-danger" data-drop aria-label="${l} trennen">Trennen</button></div></li>`;
  }

  function html(s) {
    if (!s.configured) return '<section class="card fin-upload"><h2>Bankkonten</h2><p class="fin-hint">Die Bankanbindung ist auf diesem Server nicht eingerichtet. CSV-Import geht weiter.</p></section>';
    return `<section class="card fin-upload fin-bank"><h2 tabindex="-1" data-bank-head>Bankkonten</h2>
      <p class="fin-hint">Umsätze kommen einmal am Tag direkt von der Bank, nur lesend. Der Zugriff gilt 180 Tage, danach einmal neu verbinden.</p>
      ${s.accounts.length ? `<ul class="fin-bank-list">${s.accounts.map(account).join('')}</ul>` : '<p class="fin-hint">Noch keine Bank verbunden.</p>'}
      <div class="fin-bank-footer"><div class="fin-inline"><div id="fin-bank-pick"></div><button type="button" class="bh-btn bh-btn-primary" data-connect>Bank verbinden</button>
        ${s.accounts.length ? `<button type="button" class="bh-btn" data-sync ${s.running ? 'disabled' : ''}>${s.running ? 'Abruf läuft …' : 'Jetzt abrufen'}</button>` : ''}</div>
        <p class="fin-hint">Du meldest dich bei deiner Bank an und landest danach wieder hier.</p></div></section>`;
  }

  function summary(results) {
    const bad = results.filter((r) => r.error);
    const added = results.reduce((n, r) => n + (r.added || 0), 0);
    const errors = bad.length ? `, ${bad.length === 1 ? '1 Konto' : `${bad.length} Konten`} mit Fehler (siehe unten)` : '';
    return { text: `${added} neue ${added === 1 ? 'Buchung' : 'Buchungen'}${errors}`, ok: !bad.length };
  }

  async function connect(aspsp, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Weiter zur Bank …'; }
    try { const { url } = await Fin.api('POST', '/bank/connect', { aspsp }); location.href = url; } catch (x) {
      Toast.error(x.message); if (btn) { btn.disabled = false; btn.textContent = btn.dataset.text || 'Bank verbinden'; }
    }
  }

  function renameForm(li, rerender) {
    FinRename.open({ current: li.dataset.name,
      save: (label, merge) => Fin.api('PATCH', `/bank/accounts/${encodeURIComponent(li.dataset.uid)}`, merge ? { label, merge: true } : { label }),
      done: () => { focusHead = true; rerender(); } });
  }

  function askDrop(li, rerender) {
    const actions = li.querySelector('.fin-bank-actions'); const keep = actions.innerHTML;
    actions.innerHTML = `<p class="fin-hint fin-bank-ask" role="status">„${Fin.esc(li.dataset.name)}“ trennen? Neue Umsätze kommen dann nicht mehr, die bisherigen Buchungen bleiben.</p>
      <button type="button" class="bh-btn bh-btn-sm bh-btn-danger" data-drop-yes>Ja, trennen</button><button type="button" class="bh-btn bh-btn-sm" data-drop-no>Abbrechen</button>`;
    actions.querySelector('[data-drop-no]').focus();
    actions.querySelector('[data-drop-no]').addEventListener('click', () => rerender());
    actions.querySelector('[data-drop-yes]').addEventListener('click', async () => {
      try { await Fin.api('DELETE', `/bank/accounts/${encodeURIComponent(li.dataset.uid)}`); focusHead = true; rerender(); } catch (x) { Toast.error(x.message); actions.innerHTML = keep; }
    });
  }

  function bind(host, s, rerender) {
    if (focusHead) { host.querySelector('[data-bank-head]')?.focus(); focusHead = false; }
    if (!s.configured) return;
    let bank = s.banks[0];
    // The select only shows a new choice when told so (update); without it the button keeps the first bank.
    const pick = BHSelectCore.create(host.querySelector('#fin-bank-pick'), { options: s.banks.map((b) => ({ value: b, label: BANK_NAMES[b] || b })), value: bank, label: 'Bank', onChange: (v) => { bank = v; pick.update({ value: v }); } });
    host.querySelector('[data-connect]').addEventListener('click', (e) => connect(bank, e.currentTarget));
    host.querySelector('[data-sync]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Abruf läuft …';
      try { const { results } = await Fin.api('POST', '/bank/sync'); const m = summary(results); (m.ok ? Toast.success : Toast.error)(m.text); } catch (x) { Toast.error(x.message); }
      rerender();
    });
    host.querySelectorAll('.fin-bank-item').forEach((li) => {
      li.querySelector('[data-renew]')?.addEventListener('click', (e) => connect(e.currentTarget.dataset.renew, e.currentTarget));
      li.querySelector('[data-rename]').addEventListener('click', () => renameForm(li, rerender));
      li.querySelector('[data-drop]').addEventListener('click', () => askDrop(li, rerender));
    });
  }

  /** Message after coming back from the bank; while the first fetch runs, the page refreshes itself and reports the end. */
  function afterReturn(host, s, rerender) {
    const q = new URLSearchParams(location.search);
    if (q.get('bank') === 'ok') Toast.success('Bank verbunden. Der erste Abruf läuft.');
    if (q.get('bank') === 'error') { const r = q.get('reason') || ''; Toast.error(REASONS[r] || (r && !/^[a-z_]+$/.test(r) ? r : 'Die Bank hat die Verbindung abgelehnt. Bitte später noch einmal versuchen.')); }
    if (q.has('bank')) history.replaceState(null, '', location.pathname);
    if (wasRunning && !s.running) {
      const bad = s.accounts.filter((a) => a.last_error && a.status === 'active').length;
      (bad ? Toast.error : Toast.success)(bad ? `Abruf fertig, ${bad === 1 ? '1 Konto' : `${bad} Konten`} mit Fehler (siehe unten)` : 'Abruf fertig.');
    }
    wasRunning = s.running;
    if (s.running) setTimeout(function again() { if (document.querySelector('dialog.bh-modal[open]')) setTimeout(again, 4000); else rerender(); }, 4000);
  }

  return { html, bind, afterReturn, summary };
})();
