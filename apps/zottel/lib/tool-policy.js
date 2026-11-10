'use strict';
/** Reading runs at once, anything else needs a confirmation card. Unknown tools count as writing. */
const WRITE = /(^|_)(create|update|delete|remove|send|set|add|move|trash|share|merge|close|play|power|write|upload|copy|append|clear|modify|draft|reply|forward|new|save|start|stop|run|execute|insert|rename|mark|label|batch|replace|respond|accept|decline|connect|disconnect|login|reset|revoke|publish|post|volume|key|remote|mood|radio|text)(_|$)/;
const READ = /(^|_)(list|get|search|read|find|status|info|upcoming|rooms|board|departures|stops|alerts|calendars|events|folders|day|days|radar|describe|export|query|fetch|preview|usage|shares|today|on_this_day|contacts_search)(_|$)/;

const isSafe = (name) => !WRITE.test(String(name).toLowerCase()) && READ.test(String(name).toLowerCase());

module.exports = { isSafe };
