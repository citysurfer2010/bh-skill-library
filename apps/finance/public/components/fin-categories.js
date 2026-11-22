'use strict';
/** Categories with their kind and monthly budget; add and edit in one dialog (15.11.2026). */
window.FinCategories = (() => {
  const { esc } = Fin;
  const PEN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  const HINT = {
    Ausgaben: 'Zählt bei den Ausgaben und im Budget.', Einnahmen: 'Zählt bei den Einnahmen.',
    Investment: 'Zählt unter Investments, z. B. Aktien oder Beteiligungen.', Rücklagen: 'Zählt unter Investments als Sparen.',
    Auslagen: 'Geld, das ihr vorstreckt und zurückbekommt.', Übertrag: 'Geld zwischen euren eigenen Konten; zählt nicht in den Summen.',
  };
  const codeFrom = (name) => (String(name).trim().split(/[\s&/,+]+/)[0] || '').toUpperCase().replace(/[^A-Z0-9ÄÖÜ_-]/g, '').slice(0, 12);

  async function render(host, focusCode) {
    const { categories, arts } = await Fin.api('GET', '/categories');
    AppShell.render(host, `<header class="app-topbar"><div><h1>Kategorien</h1><div class="sub">Die Art bestimmt, wo eine Kategorie in der Übersicht zählt. Das Budget gilt je Monat.</div></div>
      <div class="app-topbar-actions"><button type="button" class="bh-btn bh-btn-primary" data-cat-add>Kategorie hinzufügen</button></div></header>
      ${AppShell.list({ storageKey: 'fin-categories', columns: [
    { key: 'name', label: 'Kategorie', html: (c) => `<div class="fin-acc-name" data-code="${esc(c.code)}"><strong>${esc(c.name)}</strong> <span class="fin-tag">${esc(c.code)}</span><button type="button" class="fin-acc-rename" data-cat-edit aria-label="${esc(c.name)} bearbeiten">${PEN}</button></div>`, sortValue: (c) => c.name },
    { key: 'art', label: 'Art' }].concat(categories.some((c) => c.description) ? [{ key: 'description', label: 'Wofür' }] : []).concat([
    { key: 'budget', label: 'Budget je Monat', sortValue: (c) => c.budget_cents ?? -1, html: (c) => `<span class="fin-euro"><input class="bh-input fin-budget" type="number" step="1" min="0" inputmode="decimal" placeholder="kein Budget" aria-label="Budget je Monat für ${esc(c.name)} in Euro" data-code="${esc(c.code)}" value="${c.budget_cents == null ? '' : c.budget_cents / 100}"> €</span>` },
  ]), rows: categories, className: 'fin-cat-list', empty: 'Noch keine Kategorien. Leg die erste über „Kategorie hinzufügen“ an.' })}`);
    host.querySelectorAll('.fin-budget').forEach((input) => input.addEventListener('change', async () => {
      const v = input.value.trim();
      input.classList.remove('is-saved', 'is-error');
      try { await Fin.api('PATCH', `/categories/${encodeURIComponent(input.dataset.code)}`, { budget_cents: v === '' ? null : Math.round(Number(v) * 100) }); input.classList.add('is-saved'); setTimeout(() => input.classList.remove('is-saved'), 1500); } catch (x) { input.classList.add('is-error'); Toast.error(x.message); }
    }));
    const byCode = Object.fromEntries(categories.map((c) => [c.code, c]));
    host.querySelector('[data-cat-add]').addEventListener('click', () => dialog(host, arts, null));
    host.querySelectorAll('[data-cat-edit]').forEach((b) => b.addEventListener('click', () => dialog(host, arts, byCode[b.closest('[data-code]').dataset.code])));
    const f = focusCode && [...host.querySelectorAll('[data-cat-edit]')].find((b) => b.closest('[data-code]').dataset.code === focusCode);
    if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); }
  }

  /** One dialog for new and existing categories; the code is fixed once the category exists. */
  function dialog(host, arts, cat) {
    let art = cat ? cat.art : 'Ausgaben'; let codeTouched = !!cat;
    BHModal.open({
      title: cat ? `„${esc(cat.name)}“ bearbeiten` : 'Kategorie hinzufügen', submitLabel: cat ? 'Speichern' : 'Hinzufügen', busyLabel: 'Speichern …',
      body: `<label class="bh-label" for="fin-cat-name">Name</label><input id="fin-cat-name" class="bh-input" name="name" maxlength="60" required autofocus value="${cat ? esc(cat.name) : ''}" placeholder="z. B. Haustiere">
        <label class="bh-label" for="fin-cat-code">Kürzel</label><input id="fin-cat-code" class="bh-input" name="code" maxlength="12" value="${cat ? esc(cat.code) : ''}" ${cat ? 'disabled' : 'required'} autocapitalize="characters" spellcheck="false">
        <p class="fin-hint">${cat ? 'Das Kürzel bleibt fest, Buchungen und Regeln hängen daran.' : 'Kurz und eindeutig, z. B. TIER. Lässt sich später nicht mehr ändern.'}</p>
        <span class="bh-label" id="fin-cat-art-l">Art</span><div id="fin-cat-art"></div><p class="fin-hint" id="fin-cat-art-hint">${esc(HINT[art] || '')}</p>
        <label class="bh-label" for="fin-cat-desc">Wofür (optional)</label><input id="fin-cat-desc" class="bh-input" name="description" maxlength="200" value="${cat ? esc(cat.description || '') : ''}" placeholder="z. B. Futter, Tierarzt, Versicherung">
        <label class="bh-label" for="fin-cat-budget">Budget je Monat in € (optional)</label><input id="fin-cat-budget" class="bh-input" name="budget" type="number" min="0" step="1" inputmode="decimal" placeholder="kein Budget" value="${cat && cat.budget_cents != null ? cat.budget_cents / 100 : ''}">`,
      onOpen: (d) => {
        const hint = d.querySelector('#fin-cat-art-hint');
        const pick = BHSelectCore.create(d.querySelector('#fin-cat-art'), { options: arts.map((a) => ({ value: a, label: a })), value: art, label: 'Art', searchable: false,
          onChange: (v) => { art = v; pick.update({ value: v }); hint.textContent = HINT[v] || ''; } });
        if (cat) return;
        const name = d.querySelector('#fin-cat-name'); const code = d.querySelector('#fin-cat-code');
        code.addEventListener('input', () => { codeTouched = true; code.value = code.value.toUpperCase(); });
        name.addEventListener('input', () => { if (!codeTouched) code.value = codeFrom(name.value); });
      },
      onSubmit: async (form) => {
        const v = (k) => (form.elements[k] ? form.elements[k].value.trim() : '');
        if (!v('name')) throw new Error('Bitte einen Namen eingeben.');
        const body = { name: v('name'), art, description: v('description'), budget_cents: v('budget') === '' ? null : Math.round(Number(v('budget')) * 100) };
        if (cat) await Fin.api('PATCH', `/categories/${encodeURIComponent(cat.code)}`, body);
        else body.code = v('code');
        const code = cat ? cat.code : (await Fin.api('POST', '/categories', body)).category.code;
        Toast.success(cat ? 'Gespeichert' : 'Kategorie angelegt');
        render(host, code);
      },
    });
  }

  return { render };
})();
