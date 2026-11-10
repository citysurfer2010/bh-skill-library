'use strict';
/** Reading runs at once, anything else needs a confirmation card. Unknown tools count as writing. */
const WRITE = /(^|_)(create|update|delete|remove|send|set|add|move|trash|share|merge|close|play|power|write|upload|copy|append|clear|modify|draft|reply|forward|new|save|start|stop|run|execute|insert|rename|mark|label|batch|replace|respond|accept|decline|connect|disconnect|login|reset|revoke|publish|post|volume|key|remote|mood|radio|press|open|home|show|style|duplicate|mirror|refresh|answer|layout|keep|highlights)(_|$)/;
const READ = /(^|_)(list|get|search|read|find|status|info|upcoming|rooms|board|departures|stops|alerts|calendars|events|folders|day|days|radar|describe|export|query|fetch|preview|usage|shares|today|lookup|download|extract|metadata|health|state|requests|manifest|tabs|range|cells|text|me|profile|on_this_day|contacts_search)(_|$)/;

// Google writes listEvents, others list_events: both become list_events.
const words = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const isSafe = (name) => !WRITE.test(words(name)) && READ.test(words(name));

module.exports = { isSafe, words };
