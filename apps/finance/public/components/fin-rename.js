'use strict';
/** Renaming an account in a dialog (Matti: inline does not work well). Joining an existing account asks first. */
window.FinRename = (() => {
  /** save(name, merge) → Promise; done(name) after success. info: optional HTML line under the field (escaped by the caller). */
  function open({ current, info = '', save, done }) {
    const { esc } = Fin;
    BHModal.open({
      title: 'Konto umbenennen', submitLabel: 'Speichern',
      body: `<label class="bh-label" for="fin-rn">Kontoname</label><input id="fin-rn" class="bh-input" name="name" maxlength="60" value="${esc(current)}" required autofocus>
        ${info ? `<p class="fin-hint">${info}</p>` : ''}<p class="fin-hint">Alle Buchungen des Kontos tragen danach den neuen Namen.</p>`,
      onSubmit: async (form) => {
        const name = form.elements.name.value.trim();
        if (!name) throw new Error('Bitte einen Kontonamen eingeben.');
        if (name === current) return undefined;
        try { await save(name, false); } catch (x) {
          if (x.code !== 'merge') throw x;
          return { next: {
            title: 'Mit bestehendem Konto zusammenführen?', submitLabel: 'Zusammenführen', danger: true,
            body: `<p>Das Konto „${esc(name)}“ gibt es schon. „${esc(current)}“ geht darin auf: Danach gibt es nur noch „${esc(name)}“ mit den Buchungen beider Konten, die Bankverbindung zieht mit um. Das lässt sich nicht rückgängig machen.</p>`,
            onSubmit: async () => { await save(name, true); Toast.success('Zusammengeführt'); done(name); },
          } };
        }
        Toast.success('Umbenannt'); done(name);
        return undefined;
      },
    });
  }
  return { open };
})();
