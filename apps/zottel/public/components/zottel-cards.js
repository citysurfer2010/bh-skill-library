'use strict';
/** Confirmation cards and tool labels. A change only runs after the person has said yes. */
window.ZottelCards = (() => {
  const esc = (s) => AppShell.esc(s);
  const AREAS = { google: 'Google', icloud: 'iCloud', github: 'GitHub', nas: 'NAS', bvg: 'BVG', beamer: 'Beamer', webuntis: 'Stundenplan', birthdays: 'Geburtstage', netatmo: 'Heizung', familycal: 'Familienkalender', workcal: 'Arbeitskalender', photos: 'Fotos', faces: 'Fotos' };
  const area = (tool) => AREAS[String(tool).split('_')[0]] || 'Werkzeug';
  const VERBS = [[/gmail.*(send|reply)|mail.*send/, 'eine E-Mail senden'], [/draft/, 'einen E-Mail-Entwurf anlegen'], [/calendar.*(create|new|add)|event.*(create|new)|cal_new|familycal_new/, 'einen Termin anlegen'], [/(event|calendar).*(update|modify)/, 'einen Termin ändern'], [/(event|calendar).*(delete|remove)/, 'einen Termin löschen'], [/task.*(create|add)/, 'eine Aufgabe anlegen'], [/(doc|sheet|slide|file|drive).*(create|new)/, 'eine Datei anlegen'], [/(doc|sheet|slide|file|drive).*(update|write|append|modify)/, 'eine Datei ändern'], [/(delete|trash|remove)/, 'etwas löschen'], [/share/, 'etwas teilen'], [/pr_create/, 'einen Änderungsvorschlag anlegen'], [/merge/, 'einen Änderungsvorschlag übernehmen'], [/power/, 'den Beamer schalten'], [/play|radio|mood/, 'etwas auf dem Beamer abspielen'], [/set_?room|netatmo/, 'die Heizung einstellen'], [/birthdays_set/, 'einen Geburtstag eintragen']];
  const FIELDS = { to: 'An', cc: 'Kopie', bcc: 'Blindkopie', subject: 'Betreff', body: 'Nachricht', message: 'Nachricht', text: 'Text', title: 'Titel', summary: 'Titel', name: 'Name', date: 'Datum', start: 'Beginn', end: 'Ende', from: 'Von', location: 'Ort', description: 'Beschreibung', room: 'Raum', temp: 'Temperatur', minutes: 'Minuten', repo: 'Projekt', calendarId: 'Kalender', path: 'Ort' };
  const verb = (tool) => { const name = String(tool).toLowerCase(); return VERBS.find(([re]) => re.test(name))?.[1] || 'etwas ändern'; };
  const STATE = { running: ['…', 'Wird ausgeführt'], done: ['✓', 'Erledigt'], failed: ['✕', 'Hat nicht geklappt'], rejected: ['✕', 'Abgelehnt'] };

  function value(v) {
    const text = typeof v === 'string' ? v : JSON.stringify(v);
    return esc(text.length > 400 ? `${text.slice(0, 400)} …` : text);
  }

  function html(card) {
    const rows = Object.entries(card.args || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<div class="zt-arg"><dt>${esc(FIELDS[k] || k)}</dt><dd>${value(v)}</dd></div>`).join('');
    const open = card.status === 'pending';
    const [mark, label] = STATE[card.status] || ['', card.status];
    const foot = open
      ? `<div class="zt-card-actions"><button type="button" class="bh-btn bh-btn-primary" data-card="${esc(card.id)}" data-decision="once">Ausführen</button><button type="button" class="bh-btn" data-card="${esc(card.id)}" data-decision="reject">Ablehnen</button><button type="button" class="bh-btn zt-always" data-card="${esc(card.id)}" data-decision="always">Immer erlauben</button></div><p class="zt-card-hint">„Immer erlauben“ gilt künftig ohne Rückfrage für genau diese Aktion.</p>`
      : `<div class="zt-card-state zt-card-state--${esc(card.status)}" role="status"><span aria-hidden="true">${mark}</span> ${esc(label)}</div>`;
    return `<section class="zt-card${open ? ' zt-card--open' : ''}" data-card-id="${esc(card.id)}" aria-label="Bestätigung"><div class="zt-card-title">Zottel möchte ${esc(verb(card.tool))}</div><div class="zt-card-tool">über ${esc(area(card.tool))}</div>${rows ? `<dl class="zt-args">${rows}</dl>` : ''}${foot}</section>`;
  }

  return { html, area };
})();
