'use strict';
/** Verbindet das Menü auf dem Beamer mit der App: Menü hinschieben, Auswahl der Fernbedienung abholen und ausführen. */
const gateway = require('./gateway');
const { beamerMenu } = require('./catalog');

const POLL_MS = 800; const IDLE_MS = 5000; const MENU_MS = 300_000;

const pushMenu = () => gateway.call('beamer_menu_set', { menu: beamerMenu() });

async function tick(commands) {
  const list = JSON.parse(await gateway.call('beamer_menu_requests') || '[]');
  for (const { kind, id } of list) {
    if (commands[kind]) await commands[kind](id);
  }
}

function start(commands) {
  const loop = async () => {
    let wait = POLL_MS;
    try { await tick(commands); } catch (e) { wait = IDLE_MS; console.error(`[menu] ${e.message}`); }
    setTimeout(loop, wait);
  };
  const menu = () => pushMenu().catch((e) => console.error(`[menu] ${e.message}`));
  menu(); setInterval(menu, MENU_MS);
  loop();
}

module.exports = { start, tick, pushMenu };
