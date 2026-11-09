/** iCloud contacts over CardDAV. Lists the address book, then fetches cards in batches and searches locally. */
'use strict';

const { dav, homeSet, responses, all, first, has, text, escapeXml, safeUrl } = require('./dav.js');
const { parseContacts } = require('./ical.js');

const CARDDAV = 'urn:ietf:params:xml:ns:carddav';
const BATCH = 100;
const CACHE_MS = 5 * 60_000;
const PARALLEL = 4;
// PHOTO stays out: on iCloud it would make the address book many times larger.
const FIELDS = ['FN', 'N', 'ORG', 'TITLE', 'EMAIL', 'TEL', 'ADR', 'BDAY', 'X-ADDRESSBOOKSERVER-KIND'];

async function books() {
  const home = await homeSet('https://contacts.icloud.com/', 'addressbook-home-set', CARDDAV);
  const body = '<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>';
  const { url, xml } = await dav('PROPFIND', home, body, '1');
  return responses(xml).filter((r) => has(first(r.props, 'resourcetype') || '', 'addressbook')).map((r) => safeUrl(r.href, url));
}

async function cardHrefs(book) {
  const body = '<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getcontenttype/></d:prop></d:propfind>';
  const { xml } = await dav('PROPFIND', book, body, '1');
  return responses(xml).filter((r) => /vcard/i.test(first(r.props, 'getcontenttype') || 'vcard') && !r.href.endsWith('/')).map((r) => r.href);
}

const multiget = (hrefs) => `<c:addressbook-multiget xmlns:d="DAV:" xmlns:c="${CARDDAV}"><d:prop><c:address-data>${FIELDS.map((f) => `<c:prop name="${f}"/>`).join('')}</c:address-data></d:prop>`
  + `${hrefs.map((h) => `<d:href>${escapeXml(h)}</d:href>`).join('')}</c:addressbook-multiget>`;

async function fetchBatch(book, hrefs) {
  const { xml } = await dav('REPORT', book, multiget(hrefs), '1');
  return responses(xml).flatMap((r) => all(r.props, 'address-data').flatMap((d) => parseContacts(text(d))));
}

let cache = null;
const clearCache = () => { cache = null; };

// Searches often come in a row: the address book is loaded once, not per search.
async function allContacts() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.contacts;
  const out = [];
  for (const book of await books()) {
    const hrefs = await cardHrefs(book);
    const batches = [];
    for (let i = 0; i < hrefs.length; i += BATCH) batches.push(hrefs.slice(i, i + BATCH));
    for (let i = 0; i < batches.length; i += PARALLEL) {
      out.push(...(await Promise.all(batches.slice(i, i + PARALLEL).map((b) => fetchBatch(book, b)))).flat());
    }
  }
  cache = { at: Date.now(), contacts: out };
  return out;
}

function matches(contact, needle, digits) {
  const haystack = [contact.name, contact.organization, contact.job_title, ...contact.emails, ...contact.addresses].filter(Boolean).join(' ').toLowerCase();
  if (haystack.includes(needle)) return true;
  return digits.length >= 4 && contact.phones.some((p) => p.replace(/\D/g, '').includes(digits));
}

async function searchContacts({ query, limit }) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (needle.length < 2) throw new Error('query: bitte mindestens 2 Zeichen angeben');
  const digits = needle.replace(/\D/g, '');
  const found = (await allContacts()).filter((c) => matches(c, needle, digits)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { total: found.length, truncated: found.length > limit, contacts: found.slice(0, limit) };
}

module.exports = { searchContacts, clearCache };
