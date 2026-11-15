'use strict';
/** Amazon on the import page: one row in the connections table and a dialog for status, login (with Amazon's questions), fetch and disconnect. */
window.FinAmazon = (() => {
  const when = (iso) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  let wasRunning = false;

  function rows(s) {
    if (!s || !s.configured) return [];
    const { esc } = Fin;
    const state = s.connected === null ? '<span class="fin-badge fin-badge-warn">Dienst nicht erreichbar</span>' : s.lastError === 'login' || !s.connected ? '<span class="fin-badge fin-badge-warn">nicht angemeldet</span>' : '<span class="fin-badge">angemeldet</span>';
    const status = s.running ? '<span class="fin-hint" role="status">Abruf läuft …</span>' : s.lastError && s.lastError !== 'login' ? `<span class="fin-bank-error-inline" role="status">${esc(s.lastError)}</span>`
      : s.orders ? `<span class="fin-badge fin-badge-ok">OK</span> <span class="fin-hint">${n(s.orders, 'Bestellung', 'Bestellungen')}, ${n(s.linked, 'Buchung', 'Buchungen')} zugeordnet</span>` : '<span class="fin-hint">noch nicht abgerufen</span>';
    return [{ kind: 'amazon', name: 'Amazon', synced: s.lastSync, from: s.first, sortAccess: s.connected ? '9' : '',
      nameHtml: '<strong>Amazon</strong>', sourceHtml: '<span class="fin-acc-bank">amazon.de</span><div class="fin-hint">Bestellungen und Zahlungen</div>',
      accessHtml: state, statusHtml: status, actionsHtml: '<button type="button" class="bh-btn bh-btn-sm" data-amazon-open>Details</button>' }];
  }

  /** The login conversation as dialog steps: Amazon may ask for a code, a captcha or an approval. */
  function step(r, rerender) {
    if (r.state === 'ok') {
      Fin.api('POST', '/amazon/sync').catch(() => {}); Toast.success('Mit Amazon verbunden. Der Abruf läuft, beim ersten Mal einige Minuten.'); rerender();
      return undefined;
    }
    if (r.state === 'error') throw new Error(r.message || 'Anmeldung bei Amazon fehlgeschlagen');
    const answer = (body) => Fin.api('POST', '/amazon/login/answer', body).then((x) => step(x, rerender));
    if (r.state === 'code') return { next: { title: 'Code von Amazon', submitLabel: 'Bestätigen', busyLabel: 'Prüfe …',
      body: `<p class="fin-hint">${Fin.esc(r.prompt || 'Amazon hat dir einen Code geschickt.')}</p><label class="bh-label" for="fin-amz-code">Code</label><input id="fin-amz-code" class="bh-input" name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus>`,
      onSubmit: (f) => answer({ code: f.elements.code.value }) } };
    if (r.state === 'captcha') return { next: { title: 'Sicherheitsabfrage', submitLabel: 'Weiter', busyLabel: 'Prüfe …',
      body: `<img class="fin-amz-captcha" src="${Fin.esc(r.image)}" alt="Zeichen zum Abtippen"><label class="bh-label" for="fin-amz-cap">Zeichen aus dem Bild</label><input id="fin-amz-cap" class="bh-input" name="captcha" autocomplete="off" required autofocus>`,
      onSubmit: (f) => answer({ captcha: f.elements.captcha.value }) } };
    return { next: { title: 'Anmeldung freigeben', submitLabel: 'Freigegeben, weiter', busyLabel: 'Prüfe …',
      body: `<p>${Fin.esc(r.prompt || 'Bitte die Anmeldung in der Amazon-App oder per E-Mail freigeben und dann hier weitermachen.')}</p>`, onSubmit: () => answer({}) } };
  }

  function dialog(s, rerender) {
    const { esc } = Fin;
    const login = (body) => Fin.api('POST', '/amazon/login', body).then((r) => step(r, rerender));
    if (s.connected && s.lastError !== 'login') {
      BHModal.open({ title: 'Amazon', submitLabel: s.running ? 'Abruf läuft …' : 'Jetzt abrufen', busyLabel: 'Starte …',
        body: `<p>${s.orders ? `${n(s.orders, 'Bestellung', 'Bestellungen')} seit ${esc(Fin.date(s.first))}, davon ${Math.min(s.withItems, s.orders)} mit Artikeln; ${n(s.linked, 'Abbuchung', 'Abbuchungen')} zugeordnet.` : 'Noch keine Bestellungen abgerufen.'}${s.lastSync ? ` Zuletzt ${esc(when(s.lastSync))}.` : ''}</p>
          <p class="fin-hint">Liest Bestellungen, Artikel und Zahlungen, nur lesend, einmal am Tag. Jede Amazon-Abbuchung zeigt dann, was gekauft wurde.</p>
          <p><button type="button" class="bh-btn bh-btn-sm bh-btn-danger" data-amz-drop>Amazon trennen</button></p>`,
        onOpen: (d) => d.querySelector('[data-amz-drop]').addEventListener('click', () => { d.close(); BHModal.open({ title: 'Amazon trennen?', submitLabel: 'Trennen', danger: true,
          body: '<p>Die Amazon-Sitzung wird gelöscht. Bisherige Bestellungen und Zuordnungen bleiben.</p>', onSubmit: async () => { await Fin.api('POST', '/amazon/logout'); Toast.success('Amazon getrennt'); rerender(); } }); }),
        onSubmit: async () => { if (s.running) return; await Fin.api('POST', '/amazon/sync'); Toast.success('Amazon-Abruf läuft.'); rerender(); } });
      return;
    }
    if (s.connected === null) { BHModal.open({ title: 'Amazon', submitLabel: 'Schließen', body: '<p>Der Amazon-Dienst ist gerade nicht erreichbar. Bitte später noch einmal versuchen.</p>', onSubmit: async () => {} }); return; }
    BHModal.open(s.stored
      ? { title: 'Mit Amazon anmelden', submitLabel: 'Mit hinterlegtem Zugang anmelden', busyLabel: 'Verbinde mit Amazon … (bis zu einer Minute)',
        body: '<p class="fin-hint">Der Zugang ist auf dem Server hinterlegt. Fragt Amazon nach einem Code oder einer Freigabe, erscheint das hier.</p>', onSubmit: () => login({}) }
      : { title: 'Mit Amazon anmelden', submitLabel: 'Anmelden', busyLabel: 'Verbinde mit Amazon … (bis zu einer Minute)',
        body: `<label class="bh-label" for="fin-amz-mail">E-Mail bei Amazon</label><input id="fin-amz-mail" class="bh-input" name="email" type="email" autocomplete="username" required autofocus>
          <label class="bh-label" for="fin-amz-pw">Passwort</label><input id="fin-amz-pw" class="bh-input" name="password" type="password" autocomplete="current-password" required>
          <p class="fin-hint">Das Passwort wird nur zur Anmeldung weitergegeben und nicht gespeichert.</p>`,
        onSubmit: (f) => login({ email: f.elements.email.value, password: f.elements.password.value }) });
  }

  function bind(host, s, rerender) {
    host.querySelector('[data-amazon-open]')?.addEventListener('click', () => dialog(s, rerender));
    if (wasRunning && s && !s.running) (s.lastError ? Toast.error : Toast.success)(s.lastError ? (s.lastError === 'login' ? 'Amazon-Anmeldung abgelaufen, bitte neu anmelden.' : `Amazon-Abruf: ${s.lastError}`) : `Amazon abgerufen: ${n(s.orders, 'Bestellung', 'Bestellungen')}, ${n(s.linked, 'Buchung', 'Buchungen')} zugeordnet.`);
    wasRunning = !!(s && s.running);
    if (s && s.running) setTimeout(function again() { if (document.querySelector('dialog.bh-modal[open]')) setTimeout(again, 5000); else rerender(); }, 5000);
  }

  return { rows, dialog, bind };
})();
