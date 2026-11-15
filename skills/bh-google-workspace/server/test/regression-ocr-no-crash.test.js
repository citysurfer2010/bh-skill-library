'use strict';
/**
 * Regression 15.11.2026: tesseract was missing in the gateway image; the child ended before reading its input, the
 * stdin write failed with EPIPE, nobody handled it and the whole Google server restarted ("Werkzeug-Prozess beendet").
 * A failing tool must reject the call and leave the server running.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../lib/pdf-ocr.js');

test('a missing program rejects with a plain message instead of crashing on EPIPE', async () => {
  await assert.rejects(run('/nonexistent/tesseract', ['-'], Buffer.alloc(8 * 1024 * 1024, 1), 10, 'tesseract p1'), /nicht installiert/);
});

test('a program that exits early without reading its input rejects with its exit code', async () => {
  await assert.rejects(run('false', [], Buffer.alloc(8 * 1024 * 1024, 1), 10, 'probe'), /probe exit 1/);
});

test('a working program returns its output', async () => {
  assert.equal((await run('cat', [], Buffer.from('hallo'), 10, 'cat')).toString(), 'hallo');
});
