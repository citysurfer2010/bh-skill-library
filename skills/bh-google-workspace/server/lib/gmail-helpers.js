/**
 * Gmail-Payload-Helpers: Base64URL-Decoding, Body-Extraktion, Message-Formatter,
 * RFC822-Encoding für Send/Draft.
 */
'use strict';

function decodeBase64Url(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const p of payload.parts) {
      const t = extractBody(p);
      if (t) return t;
    }
  }
  return '';
}

function formatMessage(msg) {
  const hdrs = {};
  for (const h of (msg.payload?.headers || [])) hdrs[h.name.toLowerCase()] = h.value;
  const body = extractBody(msg.payload);
  return `ID: ${msg.id}\nVon: ${hdrs.from || '?'}\nAn: ${hdrs.to || '?'}\nBetreff: ${hdrs.subject || '(kein Betreff)'}\nDatum: ${hdrs.date || '?'}\nSnippet: ${msg.snippet || ''}\n\n${body.substring(0, 2000)}`;
}

// RFC 2047: a raw non-ASCII header is read as Latin-1 by Gmail ("„getrennt“" became mojibake in the subject,
// Matti 30.09.2026). Encode such header values as UTF-8 base64 encoded-words; the body already declares charset=utf-8.
// Address headers are left alone (display names would need per-address encoding; ours are plain addresses).
const ADDRESS_HEADERS = new Set(['to', 'cc', 'bcc', 'reply-to', 'from']);
function encodeHeaderValue(name, value) {
  const v = String(value ?? '');
  if (ADDRESS_HEADERS.has(String(name).toLowerCase()) || /^[\x20-\x7e]*$/.test(v)) return v;
  // encoded-words must stay short (RFC 2047: max 75 chars) — split on whole characters
  const words = [];
  let chunk = '';
  for (const ch of v) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) { words.push(chunk); chunk = ''; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

function encodeEmail(headers, body) {
  const lines = [];
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${encodeHeaderValue(k, v)}`);
  lines.push('', body || '');
  return Buffer.from(lines.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

module.exports = { decodeBase64Url, extractBody, formatMessage, encodeEmail, encodeHeaderValue };
