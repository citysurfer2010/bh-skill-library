/** Reduces an email to headers, readable text and a list of attachments. */
'use strict';

const MAX_DEPTH = 10;

function decodeBytes(bytes, charset = 'utf-8') {
  try { return new TextDecoder(charset.trim()).decode(bytes); } catch { return Buffer.from(bytes).toString('latin1'); }
}

function decodeQuotedPrintable(input) {
  const out = [];
  const s = input.replace(/=\r?\n/g, '');
  for (let i = 0; i < s.length; i++) {
    const hex = s[i] === '=' ? s.slice(i + 1, i + 3) : '';
    if (/^[0-9a-f]{2}$/i.test(hex)) { out.push(parseInt(hex, 16)); i += 2; } else out.push(s.charCodeAt(i) & 0xff);
  }
  return Buffer.from(out);
}

// RFC 2047: =?charset?B|Q?text?=
function decodeWords(value = '') {
  return value.replace(/(=\?[^?\s]+\?[bq]\?[^?\s]*\?=)\s+(?==\?)/gi, '$1')
    .replace(/=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi, (_m, charset, encoding, data) => decodeBytes(
      encoding.toLowerCase() === 'b' ? Buffer.from(data, 'base64') : decodeQuotedPrintable(data.replace(/_/g, ' ')), charset));
}

function parseHeaders(text) {
  const headers = {};
  for (const line of text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) { const key = line.slice(0, i).trim().toLowerCase(); if (!(key in headers)) headers[key] = line.slice(i + 1).trim(); }
  }
  return headers;
}

function param(header = '', name) {
  const extended = new RegExp(`;\\s*${name}\\*=(?:[^']*'[^']*')?([^;]+)`, 'i').exec(header);
  if (extended) { try { return decodeURIComponent(extended[1].trim()); } catch { return extended[1].trim(); } }
  const m = new RegExp(`;\\s*${name}="?([^";]*)"?`, 'i').exec(header);
  return m ? decodeWords(m[1]) : undefined;
}

function splitPart(raw) {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) } : { head: raw, body: '' };
}

function decodeBody(body, encoding = '') {
  const e = encoding.trim().toLowerCase();
  if (e === 'base64') return Buffer.from(body.replace(/\s/g, ''), 'base64');
  if (e === 'quoted-printable') return decodeQuotedPrintable(body);
  return Buffer.from(body, 'latin1');
}

function walk(raw, result, depth) {
  const { head, body } = splitPart(raw);
  const headers = parseHeaders(head);
  const contentType = headers['content-type'] || 'text/plain';
  const type = contentType.split(';')[0].trim().toLowerCase();
  const boundary = param(contentType, 'boundary');
  if (type.startsWith('multipart/') && boundary && depth < MAX_DEPTH) {
    const parts = body.split(`--${boundary}`).slice(1);
    for (const part of parts) {
      if (part.startsWith('--')) break;
      walk(part.replace(/^\r?\n/, '').replace(/\r?\n$/, ''), result, depth + 1);
    }
    return;
  }
  const disposition = headers['content-disposition'] || '';
  const name = param(disposition, 'filename') || param(contentType, 'name');
  const bytes = decodeBody(body, headers['content-transfer-encoding']);
  if (name || /^attachment/i.test(disposition)) { result.attachments.push({ name: name || '(ohne Name)', type, size: bytes.length }); return; }
  const text = () => decodeBytes(bytes, param(contentType, 'charset'));
  if (type === 'text/plain' && result.plain === undefined) result.plain = text();
  else if (type === 'text/html' && result.html === undefined) result.html = text();
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', euro: '€' };

function htmlToText(html) {
  return html.replace(/<(style|script|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseMessage(buffer) {
  const raw = buffer.toString('latin1');
  const headers = parseHeaders(splitPart(raw).head);
  const result = { attachments: [] };
  walk(raw, result, 0);
  const text = result.plain ?? (result.html ? htmlToText(result.html) : '');
  return { headers, text: text.replace(/\r\n/g, '\n').trim(), attachments: result.attachments };
}

module.exports = { parseMessage, parseHeaders, decodeWords };
