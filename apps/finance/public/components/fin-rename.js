'use strict';
/**
 * Editing an account in a dialog (inline does not work well): name and, where given, the kind of account.
 * Joining an existing account by its name asks first, in the same dialog.
 */
window.FinRename = (() => {
  /** save({ name, scope }, merge) → Promise; done(name) after success. scopes: { key: label } shows the kind field. */
  function open({ current, scope, scopes, info = '', save, done }) {
    const { esc } = Fin; let kind = scope;
    const kindField = scopes ? `<label class="bh-label" for="fin-rn-kind">Kontoart</label><div id="fin-rn-kind"></div>
      <p class="fin-hint">Nur Privatkonten zählen in Übersicht, Investments und „Zu prüfen“.</p>` : '';
    BHModal.open({
      title: scopes ? 'Konto bearbeiten' : 'Konto umbenennen', submitLabel: 'Speichern',
      body: `<label class="bh-label" for="fin-rn">Kontoname</label><input id="fin-rn" class="bh-input" name="name" maxlength="60" value="${esc(current)}" required autofocus>
        ${info ? `<p class="fin-hint">${info}</p>` : ''}<p class="fin-hint">Alle Buchungen des Kontos tragen danach den neuen Namen.</p>${kindField}`,
      onOpen: (d) => {
        const host = d.querySelector('#fin-rn-kind'); if (!host) return;
        const pick = BHSelectCore.create(host, { options: Object.entries(scopes).map(([value, label]) => ({ value, label })), value: kind, label: 'Kontoart', onChange: (v) => { kind = v; pick.update({ value: v }); } });
      },
      onSubmit: async (form) => {
        const name = form.elements.name.value.trim();
        if (!name) throw new Error('Bitte einen Kontonamen eingeben.');
        if (name === current && kind === scope) return undefined;
        try { await save({ name, scope: kind }, false); } catch (x) {
          if (x.code !== 'merge') throw x;
          return { next: {
            title: 'Mit bestehendem Konto zusammenführen?', submitLabel: 'Zusammenführen', danger: true,
            body: `<p>Das Konto „${esc(name)}“ gibt es schon. „${esc(current)}“ geht darin auf: Danach gibt es nur noch „${esc(name)}“ mit den Buchungen beider Konten, die Bankverbindung zieht mit um. Das lässt sich nicht rückgängig machen.</p>`,
            onSubmit: async () => { await save({ name, scope: kind }, true); Toast.success('Zusammengeführt'); done(name); },
          } };
        }
        Toast.success('Gespeichert'); done(name);
        return undefined;
      },
    });
  }
  return { open };
})();
