'use strict';
/**
 * Names the family gives its accounts (a short name for the card, the bank's nickname) are settings in the database
 * (app_state "account_names", JSON such as {"comdirect_card": "…", "bbbank": "…"}), never in the code. Without a
 * setting the bank's plain name is used.
 */
const { getDb } = require('./db');

const DEFAULTS = { comdirect: 'comdirect', comdirect_card: 'comdirect Kreditkarte', bbbank: 'BBBank', dkb: 'DKB', paypal: 'PayPal' };

function accountNames() {
  let own = {};
  try { own = JSON.parse(getDb().prepare("SELECT value FROM app_state WHERE key = 'account_names'").get()?.value || '{}'); } catch { own = {}; }
  return { ...DEFAULTS, ...Object.fromEntries(Object.entries(own).filter(([k, v]) => k in DEFAULTS && typeof v === 'string' && v.trim())) };
}

module.exports = { accountNames, DEFAULTS };
