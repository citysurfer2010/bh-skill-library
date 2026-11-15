'use strict';
/**
 * BHModal — a small dialog on the native <dialog>: the browser traps the focus and closes on Esc; focus returns to the opener.
 *   BHModal.open({ title, body, submitLabel, danger, onSubmit(form) })
 * onSubmit may throw (the message shows in the dialog) or return { next: { title, body, submitLabel, danger, onSubmit } }
 * to ask a follow-up question in the same dialog (e.g. "merge with the existing account?"). title and body are HTML, escaped by the caller.
 */
window.BHModal = (() => {
  const CSS = `
.bh-modal { width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 32px); padding: 0; border: 1px solid var(--bh-border); border-radius: var(--bh-radius-lg); background: var(--bh-surface); color: var(--bh-text); box-shadow: var(--bh-shadow-md); }
.bh-modal::backdrop { background: color-mix(in srgb, var(--bh-text) 45%, transparent); }
.bh-modal-form { display: grid; gap: 12px; padding: 20px; }
.bh-modal-title { margin: 0; font-size: 18px; line-height: 1.3; }
.bh-modal-body { display: grid; gap: 8px; font-size: 14px; }
.bh-modal-body .bh-input { width: 100%; box-sizing: border-box; }
.bh-modal-error { margin: 0; padding: 8px 10px; border-radius: var(--bh-radius-sm); background: var(--bh-danger-bg); color: var(--bh-danger); font-size: 13px; }
.bh-modal-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
@media (max-width: 560px) { .bh-modal-actions .bh-btn { flex: 1 1 0; min-height: 40px; } }`;
  let styled = false;

  function open(first) {
    if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
    const opener = document.activeElement; const d = document.createElement('dialog');
    d.className = 'bh-modal'; d.setAttribute('aria-labelledby', 'bh-modal-title');
    const close = () => { d.close(); };
    d.addEventListener('close', () => { d.remove(); if (opener && opener.isConnected) opener.focus(); });

    function draw(o) {
      d.innerHTML = `<form class="bh-modal-form" novalidate><h2 id="bh-modal-title" class="bh-modal-title">${o.title}</h2><div class="bh-modal-body">${o.body || ''}</div>
        <p class="bh-modal-error" role="alert" hidden></p><div class="bh-modal-actions"><button type="button" class="bh-btn" data-cancel>${o.cancelLabel || 'Abbrechen'}</button>
        <button type="submit" class="bh-btn ${o.danger ? 'bh-btn-danger' : 'bh-btn-primary'}">${o.submitLabel || 'Speichern'}</button></div></form>`;
      const form = d.querySelector('form'); const err = d.querySelector('.bh-modal-error'); const submit = form.querySelector('[type=submit]');
      d.querySelector('[data-cancel]').addEventListener('click', close);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        submit.disabled = true; err.hidden = true;
        try {
          const r = await o.onSubmit(form);
          if (r && r.next) { draw(r.next); return; }
          close();
        } catch (x) { err.textContent = x.message || 'Das hat nicht geklappt'; err.hidden = false; submit.disabled = false; }
      });
      (d.querySelector('[autofocus]') || (o.danger ? d.querySelector('[data-cancel]') : d.querySelector('input, select, textarea')) || submit).focus();
    }

    document.body.appendChild(d); draw(first); d.showModal();
    const f = d.querySelector('[autofocus]'); if (f && f.select) f.select();
    return { close };
  }

  return { open };
})();
