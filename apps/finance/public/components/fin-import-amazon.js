'use strict';
/** "Amazon" on the import page: log in once (password only passed through), answer Amazon's questions, fetch, disconnect. */
window.FinAmazon = (() => {
  const when = (iso) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  let step = null; // what Amazon asked last: { state, prompt, image }
  let wasRunning = false;
  const cancel = '<button type="button" class="bh-btn" data-amz-cancel>Abbrechen</button>';

  function form() {
    if (step?.state === 'code') return `<form class="fin-amz-form" data-amz-answer="code"><label class="bh-label" for="fin-amz-code">${Fin.esc(step.prompt || 'Code von Amazon')}</label><div class="fin-inline"><input id="fin-amz-code" class="bh-input" inputmode="numeric" autocomplete="one-time-code" required><button type="submit" class="bh-btn bh-btn-primary">Bestätigen</button>${cancel}</div></form>`;
    if (step?.state === 'captcha') return `<form class="fin-amz-form" data-amz-answer="captcha"><img class="fin-amz-captcha" src="${Fin.esc(step.image)}" alt="Zeichen zum Abtippen"><label class="bh-label" for="fin-amz-cap">Zeichen aus dem Bild</label><div class="fin-inline"><input id="fin-amz-cap" class="bh-input" autocomplete="off" required><button type="submit" class="bh-btn bh-btn-primary">Weiter</button>${cancel}</div></form>`;
    if (step?.state === 'approve') return `<form class="fin-amz-form" data-amz-answer="approve"><p class="fin-hint">${Fin.esc(step.prompt || 'Bitte die Anmeldung in der Amazon-App oder per E-Mail freigeben und dann hier weitermachen.')}</p><div class="fin-inline"><button type="submit" class="bh-btn bh-btn-primary">Freigegeben, weiter</button>${cancel}</div></form>`;
    return `<form class="fin-amz-form" data-amz-login autocomplete="off"><label class="bh-label" for="fin-amz-mail">E-Mail bei Amazon</label><input id="fin-amz-mail" class="bh-input" type="email" autocomplete="username" required>
      <label class="bh-label" for="fin-amz-pw">Passwort</label><input id="fin-amz-pw" class="bh-input" type="password" autocomplete="current-password" required>
      <p class="fin-hint">Das Passwort wird nur zur Anmeldung weitergegeben und nicht gespeichert. Gespeichert wird die Amazon-Sitzung („Angemeldet bleiben“).</p>
      <div><button type="submit" class="bh-btn bh-btn-primary">Mit Amazon verbinden</button></div></form>`;
  }

  function html(s) {
    if (!s || !s.configured) return '';
    const head = '<h2>Amazon</h2><p class="fin-hint">Liest deine Amazon-Zahlungen und die Artikel je Bestellung, nur lesend, einmal am Tag. Jede Amazon-Abbuchung zeigt dann, was gekauft wurde.</p>';
    if (s.connected === null && !step) return `<section class="card fin-upload fin-amz">${head}<p class="fin-bank-error" role="status">Der Amazon-Dienst ist gerade nicht erreichbar. Bitte später noch einmal versuchen.</p></section>`;
    const relogin = s.lastError === 'login';
    if (!s.connected || relogin || step) return `<section class="card fin-upload fin-amz">${head}${relogin && !step ? '<p class="fin-bank-error" role="status">Die Amazon-Anmeldung ist abgelaufen. Bitte neu verbinden.</p>' : ''}${form()}</section>`;
    const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    const facts = s.payments ? `${n(s.payments, 'Zahlung', 'Zahlungen')} seit ${Fin.esc(Fin.date(s.first))} · ${n(s.withItems, 'Bestellung', 'Bestellungen')} mit Artikeln · ${n(s.linked, 'Buchung', 'Buchungen')} zugeordnet` : 'Noch nichts abgerufen.';
    return `<section class="card fin-upload fin-amz">${head}<p class="fin-hint">${facts}${s.lastSync ? ` · zuletzt ${Fin.esc(when(s.lastSync))}` : ''}</p>
      ${s.running ? '<p class="fin-hint" role="status" aria-live="polite">Abruf läuft. Beim ersten Mal dauert er einige Minuten, die Seite aktualisiert sich selbst.</p>' : ''}
      ${s.lastError && !relogin ? `<p class="fin-bank-error" role="status">Letzter Abruf fehlgeschlagen: ${Fin.esc(s.lastError)}</p>` : ''}
      <div class="fin-inline" data-amz-actions><button type="button" class="bh-btn" data-amz-sync ${s.running ? 'disabled' : ''}>${s.running ? 'Abruf läuft …' : 'Jetzt abrufen'}</button><button type="button" class="bh-btn bh-btn-sm bh-btn-danger" data-amz-drop>Trennen</button></div></section>`;
  }

  async function handle(r, rerender) {
    if (r.state === 'ok') { step = null; Toast.success('Mit Amazon verbunden. Der erste Abruf läuft, er holt alles ab 2021 und dauert einige Minuten.'); await Fin.api('POST', '/amazon/sync').catch(() => {}); }
    else if (r.state === 'error') { step = null; Toast.error(r.message || 'Anmeldung bei Amazon fehlgeschlagen'); }
    else step = r;
    rerender();
  }

  function bind(host, s, rerender) {
    const box = host.querySelector('.fin-amz'); if (!box) return;
    const busy = (f) => { const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Verbinde mit Amazon … (bis zu einer Minute)'; f.setAttribute('aria-busy', 'true'); };
    box.querySelector('[data-amz-cancel]')?.addEventListener('click', () => { step = null; rerender(); });
    box.querySelector('#fin-amz-code, #fin-amz-cap')?.focus();
    if (wasRunning && !s.running) (s.lastError ? Toast.error : Toast.success)(s.lastError ? (s.lastError === 'login' ? 'Amazon-Anmeldung abgelaufen, bitte neu verbinden.' : `Amazon-Abruf fehlgeschlagen: ${s.lastError}`) : `Amazon abgerufen: ${s.payments} Zahlungen, ${s.linked} Buchungen zugeordnet.`);
    wasRunning = !!s.running;
    box.querySelector('[data-amz-login]')?.addEventListener('submit', async (e) => {
      e.preventDefault(); busy(e.target);
      try { await handle(await Fin.api('POST', '/amazon/login', { email: box.querySelector('#fin-amz-mail').value, password: box.querySelector('#fin-amz-pw').value }), rerender); } catch (x) { Toast.error(x.message); rerender(); }
    });
    box.querySelector('[data-amz-answer]')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const kind = e.target.dataset.amzAnswer; busy(e.target);
      const bodyOf = { code: () => ({ code: box.querySelector('#fin-amz-code').value }), captcha: () => ({ captcha: box.querySelector('#fin-amz-cap').value }), approve: () => ({}) };
      try { await handle(await Fin.api('POST', '/amazon/login/answer', bodyOf[kind]()), rerender); } catch (x) { Toast.error(x.message); rerender(); }
    });
    box.querySelector('[data-amz-sync]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Abruf läuft …';
      try { await Fin.api('POST', '/amazon/sync'); setTimeout(rerender, 4000); } catch (x) { Toast.error(x.message); rerender(); }
    });
    box.querySelector('[data-amz-drop]')?.addEventListener('click', () => {
      const a = box.querySelector('[data-amz-actions]');
      a.innerHTML = '<p class="fin-hint fin-bank-ask" role="status">Amazon trennen? Die Sitzung wird gelöscht, bisherige Zuordnungen bleiben.</p><button type="button" class="bh-btn bh-btn-sm bh-btn-danger" data-yes>Ja, trennen</button><button type="button" class="bh-btn bh-btn-sm" data-no>Abbrechen</button>';
      a.querySelector('[data-no]').focus(); a.querySelector('[data-no]').addEventListener('click', rerender);
      a.querySelector('[data-yes]').addEventListener('click', async () => { try { await Fin.api('POST', '/amazon/logout'); } catch (x) { Toast.error(x.message); } rerender(); });
    });
    if (s.running) setTimeout(() => { if (!box.querySelector('form')) rerender(); }, 5000);
  }

  return { html, bind };
})();
