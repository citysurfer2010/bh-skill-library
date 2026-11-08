'use strict';
/**
 * Structured calendar event for programmatic callers (format: "json" on calendar.getEvent / calendar.listEvents) —
 */
function eventJson(e) {
  return {
    id: e.id, status: e.status || null, summary: e.summary || '', start: e.start?.dateTime || e.start?.date || null, end: e.end?.dateTime || e.end?.date || null,
    all_day: !!(e.start && e.start.date && !e.start.dateTime), location: e.location || '', description: e.description || '',
    attendees: (e.attendees || []).map((a) => ({ email: String(a.email || '').toLowerCase(), status: a.responseStatus || null })),
    organizer: e.organizer?.email || null, color_id: e.colorId || null, html_link: e.htmlLink || null, updated: e.updated || null,
    private: (e.extendedProperties && e.extendedProperties.private) || {},
  };
}

/** { a: "1" } → extendedProperties body; values stringified, null removes a key (Google: null value deletes on PATCH). */
function privateBody(props) {
  if (!props || typeof props !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(props)) out[k] = v === null ? null : String(v);
  return { private: out };
}

module.exports = { eventJson, privateBody };
