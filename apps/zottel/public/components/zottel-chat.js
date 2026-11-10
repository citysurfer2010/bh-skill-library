'use strict';
/** One conversation: live text, tool activity, cards and steps. The server's state is the truth after every run. */
window.ZottelChat = (() => {
  const BASE = window.APP_BASE; const esc = (s) => AppShell.esc(s);

  async function api(method, url, body) {
    const r = await fetch(`${BASE}/api${url}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(data?.error || 'Das hat nicht geklappt');
    return data;
  }

  function start(host, { chatId, me, onChange }) {
    let id = chatId; let events = null; let live = null; let open = 0; let busy = false; let mode = 'do'; let happyTimer;
    const SUGGEST = ['Was steht heute an?', 'Fasse meine neuen Mails zusammen', 'Wann fährt die nächste Bahn?'];
    host.innerHTML = `<div class="zt-page"><header class="zt-head"><span class="zt-mini" data-figure></span><h1 class="zt-title">Zottel</h1><span class="zt-spacer"></span><div class="zt-seg" role="group" aria-label="Modus"><button type="button" data-mode="do" title="Zottel darf nach deiner Bestätigung etwas ändern">Machen</button><button type="button" data-mode="look" title="Zottel liest nur, nichts wird geändert">Nur schauen</button></div><button type="button" class="bh-btn" data-del hidden>Löschen</button></header><div class="zt-log" role="log" aria-label="Gespräch"></div><div class="zt-steps" hidden></div><p class="zt-look" hidden>Nur schauen: Zottel liest nur und ändert nichts.</p><div class="zt-status" role="status" aria-live="polite"></div><p class="zt-note" role="alert" hidden></p><form class="zt-composer"><textarea rows="1" aria-label="Nachricht an Zottel" placeholder="Was liegt an?"></textarea><button type="submit" class="bh-btn bh-btn-primary" data-send>Senden</button></form></div>`;
    const $ = (s) => host.querySelector(s);
    const log = $('.zt-log'); const input = $('textarea'); const note = $('.zt-note'); const send = $('[data-send]');
    const figure = (mood) => { $('[data-figure]').innerHTML = ZottelFigure.html(mood); log.querySelectorAll('[data-big-figure]').forEach((b) => { b.innerHTML = ZottelFigure.html(mood); }); };
    const toBottom = () => { log.scrollTop = log.scrollHeight; };
    let statusTimer;
    const status = (text, fade) => { clearTimeout(statusTimer); const box = $('.zt-status'); box.textContent = text || ''; if (fade) statusTimer = setTimeout(() => { box.textContent = ''; }, 2500); };
    const warn = (m) => { note.textContent = m || ''; note.hidden = !m; };
    function refreshControls() {
      send.textContent = busy ? 'Stopp' : 'Senden';
      input.disabled = open > 0;
      input.placeholder = open ? 'Erst die Karte beantworten' : 'Was liegt an?';
      $('.zt-look').hidden = mode !== 'look';
      host.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      $('[data-del]').hidden = !id;
    }
    function hello() {
      log.innerHTML = `<div class="zt-hello"><div class="zt-big" data-big-figure>${ZottelFigure.html('idle')}</div><h2>Hallo ${esc((me.name || '').split(' ')[0])}, was liegt an?</h2><div class="zt-suggest">${SUGGEST.map((s) => `<button type="button" class="bh-btn" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
    }
    const bubble = (role, content) => `<div class="zt-msg zt-msg--${role}">${role === 'assistant' ? `<span class="zt-face">${ZottelFigure.html('idle')}</span>` : ''}<div class="zt-bubble">${role === 'user' ? `<p>${esc(content).replace(/\n/g, '<br>')}</p>` : ZottelText.render(content)}</div></div>`;
    function steps(list) {
      const box = $('.zt-steps'); box.hidden = !list.length || list.every((s) => s.done);
      box.innerHTML = list.map((s) => `<div class="zt-step${s.done ? ' zt-step--done' : ''}"><span aria-hidden="true">${s.done ? '✓' : '○'}</span><span class="zt-sr">${s.done ? 'erledigt: ' : 'offen: '}</span>${esc(s.text)}</div>`).join('');
    }
    function draw(data) {
      const items = [...data.messages.filter((m) => m.role !== 'tool' && m.content).map((m) => ({ at: m.created_at, html: bubble(m.role, m.content) })), ...data.cards.map((c) => ({ at: c.created_at, html: ZottelCards.html(c) }))].sort((a, b) => a.at.localeCompare(b.at));
      log.innerHTML = items.map((i) => i.html).join('') || '';
      mode = data.chat.mode; open = data.cards.filter((c) => c.status === 'pending').length; busy = data.busy;
      $('.zt-title').textContent = data.chat.title; steps(data.steps); live = null; refreshControls(); toBottom();
    }
    const load = async () => draw(await api('GET', `/chats/${id}`));
    function activity(name, state) {
      status(state === 'start' ? `Schaut in ${ZottelCards.area(name)} nach …` : state === 'failed' ? `${ZottelCards.area(name)} hat nicht geantwortet` : 'Zottel denkt nach …');
    }
    function onEvent(e) {
      if (e.type === 'text') {
        if (!live) { log.insertAdjacentHTML('beforeend', `<div class="zt-msg zt-msg--assistant"><span class="zt-face">${ZottelFigure.html('think')}</span><div class="zt-bubble"></div></div>`); live = { el: log.lastElementChild.lastElementChild, text: '' }; status('Zottel schreibt …'); }
        live.text += e.text; live.el.innerHTML = ZottelText.render(live.text); toBottom();
      } else if (e.type === 'message_end') { live = null;
      } else if (e.type === 'tool') { activity(e.name, e.state);
      } else if (e.type === 'steps') { steps(e.steps);
      } else if (e.type === 'card') {
        const old = log.querySelector(`[data-card-id="${CSS.escape(e.card.id)}"]`);
        if (old) old.outerHTML = ZottelCards.html(e.card); else log.insertAdjacentHTML('beforeend', ZottelCards.html(e.card));
        toBottom();
        if (e.card.status === 'pending') { open += 1; refreshControls(); log.querySelector(`[data-card="${CSS.escape(e.card.id)}"]`)?.focus(); }
      } else if (e.type === 'error') { busy = false; status(''); warn(e.message); figure('error'); refreshControls();
      } else if (e.type === 'state') {
        busy = e.state === 'thinking'; if (busy) { warn(''); figure('think'); status('Zottel denkt nach …'); }
        if (e.state === 'waiting') { figure('look'); status('Wartet auf deine Antwort'); }
        if (e.state === 'done') { figure('happy'); status('Fertig', true); clearTimeout(happyTimer); happyTimer = setTimeout(() => figure('idle'), 2500); }
        if (e.state !== 'thinking') { load().catch(() => {}); onChange?.(id); }
        refreshControls();
      }
    }
    function listen() { events?.close(); events = new EventSource(`${BASE}/api/chats/${id}/events`); events.onmessage = (m) => onEvent(JSON.parse(m.data)); }
    async function submit(text) {
      const value = text.trim(); if (!value || busy || open) return;
      warn('');
      try {
        if (!id) { const chat = await api('POST', '/chats'); id = chat.id; if (mode !== 'do') await api('PATCH', `/chats/${id}`, { mode }); history.replaceState(null, '', `${BASE}/c/${id}`); log.innerHTML = ''; listen(); }
        input.value = ''; input.style.height = ''; log.insertAdjacentHTML('beforeend', bubble('user', value)); toBottom(); busy = true; figure('think'); status('Zottel hat deine Nachricht bekommen'); refreshControls();
        await api('POST', `/chats/${id}/messages`, { text: value });
      } catch (e) { busy = false; warn(e.message); refreshControls(); }
    }
    $('.zt-composer').addEventListener('submit', (e) => { e.preventDefault(); if (busy) api('POST', `/chats/${id}/stop`).catch(() => {}); else submit(input.value); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(input.value); } });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; });
    host.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.suggest) submit(b.dataset.suggest);
      if (b.dataset.card) { host.querySelectorAll(`[data-card="${CSS.escape(b.dataset.card)}"]`).forEach((x) => { x.disabled = true; }); open = Math.max(0, open - 1); refreshControls(); api('POST', `/cards/${b.dataset.card}`, { decision: b.dataset.decision }).catch((x) => warn(x.message)); }
      if (b.dataset.mode) { const before = mode; mode = b.dataset.mode; refreshControls(); if (id) api('PATCH', `/chats/${id}`, { mode }).catch((x) => { mode = before; refreshControls(); warn(x.message); }); }
      if (b.dataset.del !== undefined) {
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Wirklich löschen?'; status('Nochmal klicken löscht dieses Gespräch endgültig.'); setTimeout(() => { delete b.dataset.sure; b.textContent = 'Löschen'; status(''); }, 5000); return; }
        events?.close(); await api('DELETE', `/chats/${id}`); location.href = `${BASE}/`;
      }
    });
    figure('idle'); refreshControls();
    if (id) { listen(); load().catch((e) => { log.innerHTML = ''; warn(e.message); }); } else hello();
    input.focus();
  }

  return { start, api };
})();
