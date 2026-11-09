/**
 * Protected Shared Drives — server-side output filter.
 *
 * The gateway enforces the access rule (management only, or the person's own
 * Google access) and passes the Shared Drive IDs to block as the internal
 * argument `_blockProtectedDrives` on every Drive tool call. This
 * helper removes all hits from those drives from the result, or refuses
 * to read a file that sits in a blocked drive. Without the argument
 * (direct/internal calls bypassing the gateway) it filters nothing — the gateway is
 * the enforcement point, not this MCP (it does not know the requesting person).
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
