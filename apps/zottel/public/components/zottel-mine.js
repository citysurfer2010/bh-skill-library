'use strict';
/** "Mein Zottel": routines, what he learned, and what he remembers. Everything can be paused or deleted. */
window.ZottelMine = (() => {
  const BASE = window.APP_BASE; const esc = (s) => AppShell.esc(s);
  const DAYS = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const when = (r) => `${r.days.length === 7 ? 'Täglich' : r.days.map((d) => DAYS[d]).join(', ')} um ${r.time}`;
  const next = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
  const STATUS = { active: ['Aktiv', 'on'], candidate: ['Vorschlag', 'idea'], paused: ['Pausiert', 'off'] };
  const btn = (attrs, label, cls = '') => `<button type="button" class="bh-btn bh-btn-sm ${cls}" ${attrs} data-label="${label}">${label}</button>`;
  const said = (n) => (n > 1 ? `Das hast du Zottel ${n}-mal so gesagt` : 'Zottel hat das einmal bemerkt');
  const empty = (text) => `<p class="zt-muted">${text}</p>`;

  function routinesHtml(list) {
    if (!list.length) return empty('Noch keine. Sag Zottel zum Beispiel: „Schick mir jeden Morgen um 7 eine Übersicht über meinen Tag“ oder „Frag mich montags, mittwochs und freitags um 18 Uhr Vokabeln ab“.');
    return `<ul class="zt-facts">${list.map((r) => { const name = esc(r.title); return `<li class="${r.active ? '' : 'zt-fact--off'}"><div class="zt-fact"><span>${r.active ? '' : '<span class="zt-pill zt-pill--off">Pausiert</span> '}${name}</span><span class="zt-muted">${esc(when(r))}${r.active ? ` · nächster Lauf ${esc(next(r.next_run))}` : ''}</span></div><div class="zt-fact-actions">${btn(`data-run="${esc(r.id)}" data-name="${name}" aria-label="${name} jetzt ausführen"`, 'Jetzt ausführen', r.active ? 'bh-btn-primary' : '')}${r.chat_id ? `<a class="bh-btn bh-btn-sm" href="${BASE}/c/${esc(r.chat_id)}" aria-label="Ergebnisse von ${name}">Ergebnisse</a>` : ''}${btn(`data-active="${esc(r.id)}" data-on="${r.active ? '0' : '1'}" aria-label="${name} ${r.active ? 'pausieren' : 'fortsetzen'}"`, r.active ? 'Pausieren' : 'Fortsetzen', r.active ? '' : 'bh-btn-primary')}${btn(`data-del-routine="${esc(r.id)}" data-name="${name}" aria-label="${name} löschen"`, 'Löschen', 'zt-del')}</div></li>`; }).join('')}</ul>`;
  }

  function lessonsHtml(list, full) {
    if (!list.length) return empty('Noch nichts. Sag Zottel zum Beispiel: „Nenn bei Terminen immer auch den Ort“, dann merkt er sich das als Regel.');
    return `<ul class="zt-facts">${list.map((l) => {
      const [label, tone] = STATUS[l.status] || [l.status, 'off']; const name = esc(l.text);
      const where = l.area !== 'general' ? ` · ${esc(ZottelCards.area(l.area))}` : '';
      const turnOn = l.status !== 'active' ? btn(`data-lesson="${l.id}" data-status="active" aria-label="Regel übernehmen: ${name}"${full ? ' disabled title="Es wirken schon 5 Regeln. Pausiere zuerst eine."' : ''}`, l.status === 'candidate' ? 'Übernehmen' : 'Wieder aktivieren', 'bh-btn-primary') : btn(`data-lesson="${l.id}" data-status="paused" aria-label="Regel pausieren: ${name}"`, 'Pausieren');
      return `<li class="${l.status === 'paused' ? 'zt-fact--off' : ''}"><div class="zt-fact"><span><span class="zt-pill zt-pill--${tone}">${label}</span> ${name}</span><span class="zt-muted">${said(l.signals)}${where}</span></div><div class="zt-fact-actions">${turnOn}${btn(`data-del-lesson="${l.id}" data-name="Diese Regel" aria-label="Regel löschen: ${name}"`, 'Löschen', 'zt-del')}</div></li>`;
    }).join('')}</ul>`;
  }

  function memoriesHtml(list) {
    if (!list.length) return empty('Noch nichts. Sag einfach: „Merk dir, dass …“');
    return `<ul class="zt-facts">${list.map((m) => `<li><div class="zt-fact"><span>${esc(m.text)}</span></div><div class="zt-fact-actions">${btn(`data-forget="${m.id}" data-name="Dieser Eintrag" aria-label="Vergessen: ${esc(m.text)}"`, 'Vergessen', 'zt-del')}</div></li>`).join('')}</ul>`;
  }

  async function start(host) {
    const api = ZottelChat.api;
    host.innerHTML = '<div class="zt-memory"><p class="zt-note" role="alert" hidden></p><div class="zt-status" role="status" aria-live="polite"></div><div data-body></div></div>';
    const note = host.querySelector('.zt-note'); const status = host.querySelector('.zt-status'); const body = host.querySelector('[data-body]');
    const fail = (m) => { note.textContent = m ? `Das hat nicht geklappt: ${m}` : ''; note.hidden = !m; };
    async function draw() {
      try {
        const [{ routines }, { lessons }, { memories }] = await Promise.all([api('GET', '/routines'), api('GET', '/lessons'), api('GET', '/memories')]);
        const active = lessons.filter((l) => l.status === 'active').length;
        body.innerHTML = `<div class="zt-mine-head"><div class="zt-big" data-big-figure>${ZottelFigure.html('look')}</div><div><h1>Mein Zottel</h1><p class="zt-muted">Was er regelmäßig für dich tut, was er gelernt hat und was er sich merkt.</p></div></div>
          <section class="zt-mine"><h2>Routinen</h2>${routinesHtml(routines)}</section>
          <section class="zt-mine"><h2>Gelernt</h2><p class="zt-muted">${active} von 5 Regeln aktiv. Ein Vorschlag gilt, wenn du ihn übernimmst oder er ein zweites Mal vorkommt.</p>${lessonsHtml(lessons, active >= 5)}</section>
          <section class="zt-mine"><h2>Gedächtnis</h2><p class="zt-muted">Was du vergessen lässt, ist danach ganz weg.</p>${memoriesHtml(memories)}</section>
          <section class="zt-mine zt-restart"><p class="zt-muted">Zottel stellt sich noch einmal vor und fragt dich neu ab. Dein Gedächtnis bleibt.</p><div>${btn('data-setup', 'Einrichtung neu starten')}</div></section>`;
      } catch (x) {
        body.innerHTML = '<p class="zt-muted">Zottel konnte deine Sachen nicht laden.</p><button type="button" class="bh-btn" data-reload>Nochmal versuchen</button>';
      }
    }
    async function watch(id, name, before) {
      status.textContent = `${name} läuft …`;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = (await api('GET', '/routines')).routines.find((x) => x.id === id);
        if (!r?.chat_id || r.last_run === before) continue;
        const { busy } = await api('GET', `/chats/${r.chat_id}`);
        if (!busy) { status.innerHTML = `Fertig. <a href="${BASE}/c/${esc(r.chat_id)}">Ergebnis von ${name} ansehen</a>`; await draw(); return; }
      }
      status.textContent = `${name} braucht länger. Das Ergebnis erscheint in der Seitenleiste.`;
    }
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const d = b.dataset; fail('');
      const reset = () => { b.disabled = false; b.textContent = d.label || b.textContent; };
      try {
        if (d.reload !== undefined) { await draw(); return; }
        if (d.setup !== undefined) {
          if (!d.sure) { d.sure = '1'; b.textContent = 'Ja, neu einrichten'; status.textContent = 'Nochmal klicken startet die Einrichtung neu.'; setTimeout(() => { delete d.sure; reset(); }, 5000); return; }
          const { chatId } = await api('POST', '/setup', { restart: true }); location.href = `${BASE}/c/${chatId}`; return;
        }
        if (d.run) {
          const before = (await api('GET', '/routines')).routines.find((x) => x.id === d.run)?.last_run || null;
          b.disabled = true; b.textContent = 'Läuft …'; await api('POST', `/routines/${d.run}/run`); watch(d.run, d.name, before).catch(() => { status.textContent = ''; reset(); }); return;
        }
        if (d.active) await api('PATCH', `/routines/${d.active}`, { active: d.on === '1' });
        if (d.lesson) await api('PATCH', `/lessons/${d.lesson}`, { status: d.status });
        const del = d.delRoutine ? `/routines/${d.delRoutine}` : d.delLesson ? `/lessons/${d.delLesson}` : d.forget ? `/memories/${d.forget}` : null;
        if (del) {
          if (!d.sure) { d.sure = '1'; b.textContent = 'Ja, löschen'; status.textContent = `${d.name || 'Eintrag'}: Nochmal klicken löscht endgültig.`; setTimeout(() => { delete d.sure; reset(); }, 5000); return; }
          await api('DELETE', del); status.textContent = 'Gelöscht.';
        }
        await draw();
      } catch (x) { reset(); fail(x.message); }
    });
    await draw();
  }

  return { start };
})();
