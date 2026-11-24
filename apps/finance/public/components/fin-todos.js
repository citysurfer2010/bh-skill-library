'use strict';
/**
 * Unterlagen (24.11.2026): documents still to get or scan for the tax return, per year, shown on the year page of
 * the module Einkommensteuer. Open first, done below with the day ticked off; a tick toggles at once.
 */
window.FinTodos = (() => {
  const { esc, date } = Fin;

  function dialog(kinds, year, item, onSaved) {
    let kind = item?.kind || 'Besorgen';
    BHModal.open({
      title: item ? 'Unterlage bearbeiten' : 'Unterlage hinzufügen', submitLabel: 'Speichern', busyLabel: 'Speichern …',
      body: `<label class="bh-label" for="fin-td-title">Was fehlt?</label><input id="fin-td-title" class="bh-input" name="title" required maxlength="200" value="${esc(item?.title || '')}" placeholder="z. B. Hausgeldabrechnung 2025">
        <label class="bh-label" for="fin-td-unit">Wohnung / Bereich</label><input id="fin-td-unit" class="bh-input" name="unit" maxlength="100" value="${esc(item?.unit || '')}" placeholder="z. B. WE 22 oder Privat">
        <span class="bh-label">Was ist zu tun?</span><div id="fin-td-kind"></div>
        <label class="bh-label" for="fin-td-year">Steuerjahr</label><input id="fin-td-year" class="bh-input" name="year" type="number" min="2000" max="2100" required value="${esc(String(item?.year || year))}">
        <label class="bh-label" for="fin-td-note">Notiz</label><input id="fin-td-note" class="bh-input" name="note" maxlength="500" value="${esc(item?.note || '')}" placeholder="z. B. Verwalter, Portal, Ablageort">`,
      onOpen: (dlg) => { const pick = BHSelectCore.create(dlg.querySelector('#fin-td-kind'), { options: kinds.map((k) => ({ value: k, label: k })), value: kind, label: 'Was ist zu tun?', searchable: false, onChange: (v) => { kind = v; pick.update({ value: v }); } }); },
      onSubmit: async (form) => {
        const body = { title: form.elements.title.value.trim(), unit: form.elements.unit.value.trim(), kind, year: Number(form.elements.year.value), note: form.elements.note.value.trim() };
        if (item) await Fin.api('PATCH', `/todos/${item.id}`, body); else await Fin.api('POST', '/todos', body);
        Toast.success('Gespeichert'); onSaved(body.year);
      },
    });
  }

  function table(rows, title, empty) {
    return AppShell.list({ title, className: 'fin-todos', columns: [
      { key: 'done', label: 'Erledigt', sortable: false, html: (t) => `<button type="button" class="fin-todo-tick${t.done_at ? ' is-done' : ''}" data-tick="${t.id}" aria-pressed="${t.done_at ? 'true' : 'false'}" aria-label="${esc(t.title)} ${t.done_at ? 'wieder öffnen' : 'abhaken'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></button>` },
      { key: 'title', label: 'Unterlage', html: (t) => `<strong>${esc(t.title)}</strong>${t.note ? `<div class="fin-hint">${esc(t.note)}</div>` : ''}` },
      { key: 'unit', label: 'Wohnung / Bereich', html: (t) => esc(t.unit || '–') },
      { key: 'kind', label: 'Zu tun', html: (t) => esc(t.kind) },
      { key: 'done_at', label: 'Erledigt am', html: (t) => (t.done_at ? `<span class="fin-num">${esc(date(t.done_at))}</span>` : '–') },
      { key: 'act', label: 'Aktion', srOnly: true, sortable: false, html: (t) => `<button type="button" class="fin-link-btn" data-edit="${t.id}">Bearbeiten</button> · <button type="button" class="fin-link-btn" data-del="${t.id}">Löschen</button>` },
    ], rows, empty });
  }

  /** Ticks, edit and delete for the lists in `host`; `reload` redraws the page. */
  function bind(host, d, year, reload) {
    host.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', async () => {
      const item = d.items.find((t) => t.id === Number(b.dataset.tick));
      b.classList.toggle('is-done'); // instant feedback, the list follows
      try { await Fin.api('PATCH', `/todos/${item.id}`, { done: !item.done_at }); reload(); } catch (e) { b.classList.toggle('is-done'); Toast.error(e.message); }
    }));
    host.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => dialog(d.kinds, year, d.items.find((t) => t.id === Number(b.dataset.edit)), reload)));
    host.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const item = d.items.find((t) => t.id === Number(b.dataset.del));
      if (!window.confirm(`„${item.title}“ löschen?`)) return;
      try { await Fin.api('DELETE', `/todos/${item.id}`); Toast.success('Gelöscht'); reload(); } catch (e) { Toast.error(e.message); }
    }));
  }

  return { dialog, table, bind };
})();
