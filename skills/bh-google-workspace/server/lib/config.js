/** Konstanten und Pfade. Jeder User hat seine Anmeldung im eigenen Home. */
'use strict';

const os   = require('os');
const path = require('path');

const HOME    = process.env.HOME || os.homedir();
const CFG_DIR = path.join(HOME, '.config', 'bh-google-workspace');
const CREDS   = path.join(CFG_DIR, 'credentials.json');
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET_FILE || path.join(CFG_DIR, 'client_secret.json');

// LLMs vergessen Zeichen aus Drive-IDs (28-44 Zeichen) bei Inline-Citation.
const ID_HINT =
  '⚠ Datei-IDs immer 1:1 kopieren — keine Zeichen weglassen, kein Leerzeichen einfügen.\n';

const PDFTOTEXT = 'pdftotext';
const PDFTOPPM  = 'pdftoppm';
const TESSERACT = 'tesseract';

module.exports = { HOME, CFG_DIR, CREDS, CLIENT_SECRET, ID_HINT, PDFTOTEXT, PDFTOPPM, TESSERACT };
