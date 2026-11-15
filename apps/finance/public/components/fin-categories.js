'use strict';
/** Categories with their kind and monthly budget. */
window.FinCategories = (() => {
  const { esc } = Fin;

  async function render(host) {
    const { categories } = await Fin.api('GET', '/categories');
    AppShell.render(host, `<header class="app-topbar"><div><h1>Kategorien</h1><div class="sub">Die Art bestimmt, wo eine Kategorie in der Übersicht zählt. Das Budget gilt je Monat.</div></div></header>
      ${AppShell.list({ columns: [
    { key: 'name', label: 'Kategorie', html: (c) => `<strong>${esc(c.name)}</strong> <span class="fin-tag">${esc(c.code)}</span>` },
    { key: 'art', label: 'Art' }].concat(categories.some((c) => c.description) ? [{ key: 'description', label: 'Wofür' }] : []).concat([
    { key: 'budget', label: 'Budget je Monat', html: (c) => `<span class="fin-euro"><input class="bh-input fin-budget" type="number" step="1" min="0" inputmode="decimal" placeholder="kein Budget" aria-label="Budget je Monat für ${esc(c.name)} in Euro" data-code="${esc(c.code)}" value="${c.budget_cents == null ? '' : c.budget_cents / 100}"> €</span>` },
  ]), rows: categories, empty: 'Noch keine Kategorien. Sie kommen mit dem Import der alten Tabelle.' })}`);
    host.querySelectorAll('.fin-budget').forEach((input) => input.addEventListener('change', async () => {
      const v = input.value.trim();
      input.classList.remove('is-saved', 'is-error');
      try { await Fin.api('PATCH', `/categories/${encodeURIComponent(input.dataset.code)}`, { budget_cents: v === '' ? null : Math.round(Number(v) * 100) }); input.classList.add('is-saved'); setTimeout(() => input.classList.remove('is-saved'), 1500); } catch (x) { input.classList.add('is-error'); Toast.error(x.message); }
    }));
  }

  return { render };
})();
