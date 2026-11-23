/**
 * Gmail payload helpers: Base64URL decoding, body extraction, message formatter,
 * RFC822 encoding for send/draft.
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
  const att = listAttachments(msg.payload);
  const attText = att.length ? `\n\nAnhänge (${att.length}):\n${att.map((x) => `- ${x.filename} (${x.mimeType}, ${x.size} Bytes) attachmentId: ${x.attachmentId}`).join('\n')}` : '';
  return `ID: ${msg.id}\nVon: ${hdrs.from || '?'}\nAn: ${hdrs.to || '?'}\nBetreff: ${hdrs.subject || '(kein Betreff)'}\nDatum: ${hdrs.date || '?'}\nSnippet: ${msg.snippet || ''}\n\n${body.substring(0, 2000)}${attText}`;
}

// Attachments of a message with their ids, so gmail.downloadAttachment can fetch them (23.11.2026: get showed none).
function listAttachments(part, out = []) {
  if (!part) return out;
  if (part.filename && part.body?.attachmentId) out.push({ filename: part.filename, mimeType: part.mimeType || '', size: part.body.size || 0, attachmentId: part.body.attachmentId });
  for (const p of part.parts || []) listAttachments(p, out);
  return out;
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

module.exports = { decodeBase64Url, extractBody, formatMessage, listAttachments, encodeEmail, encodeHeaderValue };
