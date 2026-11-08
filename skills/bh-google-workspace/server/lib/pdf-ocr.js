/**
 * PDF-OCR-Fallback. pdftoppm rastert eine Seite zu PPM, tesseract liest stdin
 * und gibt Text zurück. Sequenziell pro Seite — bei Timeout/Fehler wissen wir
 * wo's klemmte.
 */
'use strict';

const { spawn } = require('child_process');
const { PDFTOPPM, TESSERACT } = require('./config.js');

async function ocrPdfPage(pdfBuf, pageNum, lang = 'deu+eng') {
  // Schritt 1: pdftoppm → PPM-Bild für diese Seite (Stdin → Stdout).
  const ppm = await new Promise((resolve, reject) => {
    const args = ['-f', String(pageNum), '-l', String(pageNum), '-r', '200', '-gray'];
    // ⚠ HARTE GRENZE VOM BETRIEBSSYSTEM (19.08.2026): Der setTimeout unten ist
    // ein NODE-Timer — stirbt dieser Prozess, stirbt der Timer mit und das Kind
    // laeuft weiter. Genau hier entstanden an diesem Tag 16 verwaiste
    // Tesseract-Prozesse (je ~30 Minuten, je eine CPU voll, Host-Load 79), weil
    // laufende Aufrufe hart abgebrochen wurden. `timeout` aus coreutils ist ein
    // eigener Prozess und setzt die Frist auch ohne uns durch; -k schickt
    // danach SIGKILL nach.
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

  // Schritt 2: tesseract (Stdin → Stdout).
  return new Promise((resolve, reject) => {
    // Harte Grenze wie oben — dieser Aufruf hinterliess die Waisen vom 19.08.2026.
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
