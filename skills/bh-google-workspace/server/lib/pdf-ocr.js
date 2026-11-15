/**
 * PDF OCR fallback. pdftoppm rasterizes one page to PPM, tesseract reads stdin
 * and returns text. Sequential per page — on timeout/error we know
 * where it got stuck.
 */
'use strict';

const { spawn } = require('child_process');
const { PDFTOPPM, TESSERACT } = require('./config.js');

/**
 * Runs one tool with `input` on stdin and returns its stdout.
 * ⚠ HARD LIMIT FROM THE OS (19.08.2026): the setTimeout below is a NODE timer — if this process dies, the timer dies
 * with it and the child keeps running (16 orphaned Tesseract processes that day, host load 79). `timeout` from
 * coreutils is a separate process and enforces the deadline without us; -k sends SIGKILL afterwards.
 * A child that ends before it read its input (missing program, bad file) makes the write fail with EPIPE; without the
 * stdin handler that error was unhandled and took the whole server down (15.11.2026), now the call just fails.
 */
function run(bin, args, input, seconds, label) {
  return new Promise((resolve, reject) => {
    const child = spawn('timeout', ['-k', '5', String(seconds), bin, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; const errOut = [];
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${label} timeout`)); }, seconds * 1000);
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => errOut.push(c));
    child.stdin.on('error', () => { /* the exit code below explains the failure */ });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 127) reject(new Error(`${label}: ${bin} ist nicht installiert`));
      else if (code !== 0) reject(new Error(`${label} exit ${code}: ${Buffer.concat(errOut).toString('utf8').substring(0, 200)}`));
      else resolve(Buffer.concat(out));
    });
    child.stdin.end(input);
  });
}

async function ocrPdfPage(pdfBuf, pageNum, lang = 'deu+eng') {
  // Step 1: pdftoppm → PPM image for this page (stdin → stdout).
  const ppm = await run(PDFTOPPM, ['-f', String(pageNum), '-l', String(pageNum), '-r', '200', '-gray'], pdfBuf, 30, `pdftoppm p${pageNum}`);
  // Step 2: tesseract (stdin → stdout).
  return (await run(TESSERACT, ['-l', lang, '-', '-', '--psm', '6'], ppm, 60, `tesseract p${pageNum}`)).toString('utf8');
}

module.exports = { ocrPdfPage, run };
