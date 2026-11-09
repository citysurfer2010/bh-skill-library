/**
 * PDF OCR fallback. pdftoppm rasterizes one page to PPM, tesseract reads stdin
 * and returns text. Sequential per page — on timeout/error we know
 * where it got stuck.
 */
'use strict';

const { spawn } = require('child_process');
const { PDFTOPPM, TESSERACT } = require('./config.js');

async function ocrPdfPage(pdfBuf, pageNum, lang = 'deu+eng') {
  // Step 1: pdftoppm → PPM image for this page (stdin → stdout).
  const ppm = await new Promise((resolve, reject) => {
    const args = ['-f', String(pageNum), '-l', String(pageNum), '-r', '200', '-gray'];
    // ⚠ HARD LIMIT FROM THE OS (19.08.2026): The setTimeout below is
    // a NODE timer — if this process dies, the timer dies with it and the child
    // keeps running. This exact spot produced 16 orphaned
    // Tesseract processes that day (~30 minutes and one full CPU each, host load 79) because
    // running calls were aborted hard. `timeout` from coreutils is a
    // separate process and enforces the deadline without us; -k sends
    // SIGKILL afterwards.
    const child  = spawn('timeout', ['-k', '5', '30', PDFTOPPM, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out    = [];
    const errOut = [];
    const timer  = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`pdftoppm p${pageNum} timeout`)); }, 30_000);
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => errOut.push(c));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`pdftoppm p${pageNum} exit ${code}: ${Buffer.concat(errOut).toString('utf8').substring(0, 200)}`));
      else resolve(Buffer.concat(out));
    });
    child.stdin.write(pdfBuf);
    child.stdin.end();
  });

  // Step 2: tesseract (stdin → stdout).
  return new Promise((resolve, reject) => {
    // Hard limit as above — this call left behind the orphans of 19.08.2026.
    const child = spawn('timeout', ['-k', '5', '60', TESSERACT, '-l', lang, '-', '-', '--psm', '6'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out   = [];
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`tesseract p${pageNum} timeout`)); }, 60_000);
    child.stdout.on('data', (c) => out.push(c));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`tesseract p${pageNum} exit ${code}`));
      else resolve(Buffer.concat(out).toString('utf8'));
    });
    child.stdin.write(ppm);
    child.stdin.end();
  });
}

module.exports = { ocrPdfPage };
