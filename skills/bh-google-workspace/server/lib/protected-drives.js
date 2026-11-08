/**
 * Geschützte Shared Drives — serverseitiger Ausgabe-Filter.
 *
 * Das Gateway erzwingt die Zugriffsregel (nur Geschäftsführung bzw. eigener
 * Google-Zugriff) und reicht die zu blockierenden Shared-Drive-IDs als internes
 * Argument `_blockProtectedDrives` an jeden Drive-Tool-Aufruf durch. Dieser
 * Helfer entfernt alle Treffer aus diesen Drives aus dem Ergebnis bzw. verweigert
 * das Lesen einer Datei, die in einem gesperrten Drive liegt. Ohne das Argument
 * (Direkt-/Interne Aufrufe am Gateway vorbei) filtert er nichts — das Gateway ist
 * der Durchsetzungspunkt, nicht dieser MCP (er kennt die anfragende Person nicht).
 */
'use strict';

const { getDriveFileMeta } = require('./drive-helpers.js');
const { err } = require('./gapi.js');

const REFUSAL =
  'Dieser Ordner ist nur für die Geschäftsführung freigegeben. Dein Account hat ' +
  'keinen eigenen Zugriff darauf — bitte bei der Geschäftsführung anfragen.';

/** Build the block Set from the gateway-injected internal arg. */
function toBlockSet(blockArg) {
  const a = Array.isArray(blockArg) ? blockArg : [];
  return new Set(a.filter(Boolean).map(String));
}

/** Drop files whose driveId is in the block set. */
function dropBlocked(files, blockSet) {
  if (!blockSet || !blockSet.size) return files || [];
  return (files || []).filter((f) => !(f && blockSet.has(String(f.driveId || ''))));
}

/** Drop whole Shared Drives whose id is in the block set (drive_list_shared_drives). */
function dropBlockedDrives(drives, blockSet) {
  if (!blockSet || !blockSet.size) return drives || [];
  return (drives || []).filter((d) => !(d && blockSet.has(String(d.id || ''))));
}

/**
 * For single-file / single-folder reads: resolve the item's driveId and return a
 * refusal MCP result if it sits in a blocked drive, else null. Fails OPEN only on a
 * metadata lookup error (then the tool's own 404/handling takes over) — the discovery
 * surfaces are already filtered, so a bare unknown fileId cannot be guessed into.
 */
async function refuseProtectedFile(fileId, blockSet) {
  if (!blockSet || !blockSet.size || !fileId) return null;
  let meta;
  try { meta = await getDriveFileMeta(fileId); } catch { return null; }
  if (meta && blockSet.has(String(meta.driveId || ''))) return err(REFUSAL);
  return null;
}

module.exports = { toBlockSet, dropBlocked, dropBlockedDrives, refuseProtectedFile, REFUSAL };
