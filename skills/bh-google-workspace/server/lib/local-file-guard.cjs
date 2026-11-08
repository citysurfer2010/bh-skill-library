'use strict';
/**
 * local-file-guard — which local paths an MCP tool may READ (to upload them to
 *
 * WHY (security review 05.11.2026): every MCP server runs as the same uid as the
 * apps, so a tool that reads or writes an arbitrary path the model hands it can
 * reach every service key on the box. One prompt-injected mail is enough:
 *   - read:  drive_upload_file({localPath:'/proc/self/environ'}) puts the whole
 *            central .env into Drive; same for .jwt-secret, auth-profiles.json …
 *   - write: front_download_attachment({local_path:'…/autostart.d/x.sh'}) drops the
 *            attacker's attachment where it gets executed.
 *
 * Rules (v3, after the second review of #906):
 *   - Paths must be absolute, without '.'/'..' segments (a '..' after a symlink is
 *     resolved by the kernel AFTER following the link — path.resolve() cannot see it).
 *   - Resolution: realpath of the path, or for a new file realpath of the nearest
 *     EXISTING ancestor plus the remaining (non-existing, so link-free) segments.
 *   - read:  resolved path inside READ_ROOTS, document extension, no credential name,
 *            no hidden/blocked segment below the root; readGuarded() also refuses
 *            PEM-looking content ("-----BEGIN").
 *   - write: ONLY the temp roots (download folders) — tools never write into an app folder
 *            (v4, review round 3: create-only app folders let a tool pre-place a forged PDF under
 *            the predictable next invoice name). Apps download into a fresh mkdtemp folder and move
 *            the file in with their own fs (lib/tool-file-handoff.js in property-os,
 *            controlling-hub, comms-cockpit). Extension ALLOWLIST: documents, .json/.jsonl/.bin;
 *            no extensionless, hidden, credential-named or project/agent-config files, no hidden or
 *            blocked folders below the root, no .json under a `config` folder.
 *   - writeGuarded()/openWriteGuarded() create the file FRESH (existing file unlinked, then
 *     O_EXCL, 0644 via fchmod) with O_NOFOLLOW and re-check the opened file via /proc/self/fd —
 *     tools use these (or guard.path), never the raw input.
 *
 * Canonical copy: mcp-servers/bh-google-workspace/lib/local-file-guard.cjs. Byte-identical
 * copies live in every server that uses it (mcp-servers/<x>/lib, skills/<x>/lib);
 * bh-google-workspace/test/local-file-guard.test.js checks the copies.
 * Extra READ roots per deployment: BH_FILE_GUARD_EXTRA_ROOTS (colon-separated, absolute). There are no
 * extra write roots.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const WORK = `${require('os').homedir()}/projects`;
const TMP_ROOTS = ['/tmp', '/var/tmp'];
const READ_ONLY_ROOTS = [WORK];
const APP_OUTPUT_ROOTS = [WORK];

const DOCUMENT_EXT = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif', '.tif', '.tiff', '.bmp',
  '.doc', '.docx', '.xls', '.xlsx', '.xlsm', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf',
  '.csv', '.txt', '.md', '.html', '.htm', '.xml', '.eml', '.msg', '.zip', '.ics', '.vcf', '.p7s', '.p7m',
  '.mp3', '.wav', '.m4a', '.ogg', '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.numbers', '.pages',
]);
const TMP_DATA_EXT = new Set(['.json', '.jsonl', '.bin']);
const BLOCKED_SEGMENTS = new Set([
  'node_modules', 'hooks', 'git-hooks', 'autostart.d', 'secrets', 'agent-secrets', 'fleet-secrets', 'credentials',
]);
const SECRET_NAMES = new Set(['.env', '.jwt-secret', 'service-key', '.git-credentials', '.netrc', '.npmrc', 'id_rsa', 'id_ed25519', 'id_ecdsa']);
const SECRET_WORD = /(token|secret|credential|passw(or)?d|api[-_]?key|private[-_]?key|oauth)/i;
const PLAIN_DATA_EXT = new Set(['', '.txt', '.csv', '.md', '.xml', '.html', '.htm', '.json', '.jsonl', '.bin']);
// Project/tool config that build tools, package managers or editors pick up by name — never written by a tool.
const PROJECT_NAME = /^(package(-lock)?\.json|npm-shrinkwrap\.json|pnpm-[\w.-]*|yarn\.lock|bun\.lockb?|[tj]sconfig[\w.-]*\.json|deno\.jsonc?|composer\.json|requirements[\w.-]*\.txt|pyproject\.toml|makefile|dockerfile|docker-compose[\w.-]*\.ya?ml|settings(\.local)?\.json|launch\.json|callers\.json|manifest\.json|mcp_config\.json|(claude|agents|gemini|soul|tools|memory)\.md)$/i;

function under(p, root) { return p === root || p.startsWith(root + '/'); }
function realOr(p) { try { return fs.realpathSync.native(p); } catch { return p; } }
function norm(list) {
  return [...new Set(list.filter((r) => typeof r === 'string' && path.isAbsolute(r) && r !== '/')
    .flatMap((r) => [path.normalize(r).replace(/\/+$/, ''), realOr(r)]))];
}
const envList = (name) => String(process.env[name] || '').split(':').filter((r) => r.startsWith('/'));

function tmpRoots() { return norm([...TMP_ROOTS, os.tmpdir()]); }
function readRoots() {
  return norm([...TMP_ROOTS, os.tmpdir(), ...READ_ONLY_ROOTS, ...APP_OUTPUT_ROOTS, 
    ...envList('BH_FILE_GUARD_EXTRA_ROOTS')]);
}
function roots() { return readRoots(); } // backwards compatible export

/** The longest matching root, or null. */
function rootOf(p, list) {
  let best = null;
  for (const r of list) if (under(p, r) && (!best || r.length > best.length)) best = r;
  return best;
}

function isSecretName(base) {
  const b = base.toLowerCase();
  if (SECRET_NAMES.has(b) || /^\.env(\..+)?$/.test(b)) return true;
  return PLAIN_DATA_EXT.has(path.extname(b)) && SECRET_WORD.test(b);
}

/** Absolute, no '.'/'..' segments, no NUL — else an error string. */
function syntaxError(input) {
  if (typeof input !== 'string' || !input.trim()) return 'Pfad fehlt.';
  if (input.includes('\0')) return 'ungültiger Pfad.';
  if (!path.isAbsolute(input)) return 'Pfad muss absolut sein (z. B. /tmp/datei.pdf).';
  if (input.split('/').some((s) => s === '..' || s === '.')) return "Pfad darf keine '.'/'..'-Segmente enthalten.";
  return null;
}

/** realpath of the path, or of its nearest existing ancestor + the remaining segments. */
function resolveReal(input, deps = {}) {
  const realpath = deps.realpathSync || fs.realpathSync.native;
  const n = path.normalize(input).replace(/\/+$/, '') || '/';
  const rest = [];
  let cur = n;
  for (;;) {
    try { return path.join(realpath(cur), ...rest.reverse()); } catch (e) {
      if (e && e.code && e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e;
      if (cur === '/') return path.join('/', ...rest.reverse());
      rest.push(path.basename(cur));
      cur = path.dirname(cur);
    }
  }
}

/** Segments below the root: no hidden ones, no blocked ones, no browser profiles. */
function relSegmentReason(real, root) {
  const rel = real.slice(root.length).split('/').filter(Boolean);
  if (rel.some((s) => s.startsWith('.'))) return 'hidden file or folder';
  if (rel.slice(0, -1).some((s) => BLOCKED_SEGMENTS.has(s.toLowerCase()) || s.toLowerCase().includes('browser-profile'))) return 'code or credential folder';
  return null;
}

function readDenyReason(real) {
  const root = rootOf(real, readRoots());
  if (!root) return 'outside the allowed file folders';
  const seg = relSegmentReason(real, root);
  if (seg) return seg;
  const base = path.basename(real);
  if (isSecretName(base)) return 'credential file name';
  if (!DOCUMENT_EXT.has(path.extname(base).toLowerCase())) return 'not a document file type';
  return null;
}

/** → { reason } or {} */
function writeVerdict(real) {
  const root = rootOf(real, tmpRoots());
  if (!root) return { reason: 'outside the allowed download folders ' };
  const seg = relSegmentReason(real, root);
  if (seg) return { reason: seg };
  let base = path.basename(real);
  if (base.toLowerCase().endsWith('.part')) base = base.slice(0, -5); // streaming temp file of an allowed name
  if (isSecretName(base)) return { reason: 'credential file name' };
  if (PROJECT_NAME.test(base)) return { reason: 'project or tool config file name' };
  const ext = path.extname(base).toLowerCase();
  if (!(DOCUMENT_EXT.has(ext) || TMP_DATA_EXT.has(ext))) return { reason: `file type ${ext || '(none)'} not allowed here` };
  if (TMP_DATA_EXT.has(ext) && real.slice(root.length).split('/').some((x) => x.toLowerCase() === 'config')) return { reason: 'config folder' };
  return {};
}

function check(input, kind, deps = {}) {
  const se = syntaxError(input);
  if (se) return { ok: false, error: `Pfad gesperrt (${kind}): ${se}` };
  let real;
  try { real = resolveReal(input, deps); } catch (e) { return { ok: false, error: `Pfad gesperrt (${kind}): nicht auflösbar (${e.code || e.message}).` }; }
  const reason = kind === 'read' ? readDenyReason(real) : writeVerdict(real).reason;
  if (reason) {
    const hint = kind === 'read'
      ? 'Nur Dokumente aus den Arbeits-/Temp-Ordnern (z. B. /tmp, ~/projects) sind erlaubt.'
      : 'Dateien unter /tmp oder ~/projects speichern — nur Dokumente (JSON nur dort).';
    return { ok: false, error: `Pfad gesperrt (${reason}): ${input}. ${hint}` };
  }
  return { ok: true, path: real };
}

/** { ok:true, path:<resolved> } or { ok:false, error } — tools must use .path, never the raw input. */
function checkReadablePath(p, deps) { return check(p, 'read', deps); }
function checkWritablePath(p, deps) { return check(p, 'write', deps); }

/** Re-check what was actually opened (Linux: /proc/self/fd). */
function verifyFd(fd, kind) {
  let real;
  try { real = fs.readlinkSync(`/proc/self/fd/${fd}`); } catch { return null; } // no /proc → path checks stand
  return kind === 'read' ? readDenyReason(real) : writeVerdict(real).reason || null;
}

function guardError(msg) { const e = new Error(msg); e.code = 'BH_FILE_GUARD'; return e; }

/** Read a model-supplied path safely → Buffer. Throws (code BH_FILE_GUARD) when refused. */
function readGuarded(input, { maxBytes } = {}) {
  const g = checkReadablePath(input);
  if (!g.ok) throw guardError(g.error);
  const fd = fs.openSync(g.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const bad = verifyFd(fd, 'read');
    if (bad) throw guardError(`Pfad gesperrt (${bad}): ${input}`);
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw guardError(`keine Datei: ${input}`);
    if (maxBytes && st.size > maxBytes) throw guardError(`Datei zu groß (${st.size} > ${maxBytes} Bytes): ${input}`);
    const buf = fs.readFileSync(fd);
    if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(buf.subarray(0, 4096).toString('latin1'))) throw guardError(`Pfad gesperrt (Schlüsselmaterial): ${input}`);
    return buf;
  } finally { fs.closeSync(fd); }
}

/** Create a model-supplied path FRESH for writing → { fd, path }. Creates missing parent folders. */
function openWriteGuarded(input) {
  const g = checkWritablePath(input);
  if (!g.ok) throw guardError(g.error);
  fs.mkdirSync(path.dirname(g.path), { recursive: true });
  // replace, never write into an existing inode (keeps no exec bit, no hard link)
  try { const st = fs.lstatSync(g.path); if (st.isDirectory()) throw guardError(`ist ein Ordner: ${input}`); fs.unlinkSync(g.path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const C = fs.constants;
  let fd;
  try { fd = fs.openSync(g.path, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o644); } catch (e) {
    if (e.code === 'EEXIST') throw guardError(`Pfad gesperrt (existiert bereits): ${input}`);
    throw e;
  }
  try { fs.fchmodSync(fd, 0o644); } catch { /* best effort against umask */ }
  const bad = verifyFd(fd, 'write');
  if (bad) { fs.closeSync(fd); throw guardError(`Pfad gesperrt (${bad}): ${input}`); }
  return { fd, path: g.path };
}

/** Write data to a model-supplied path safely → resolved path. */
function writeGuarded(input, data) {
  const { fd, path: real } = openWriteGuarded(input);
  try { fs.writeFileSync(fd, data); } finally { fs.closeSync(fd); }
  return real;
}

module.exports = { checkReadablePath, checkWritablePath, readGuarded, writeGuarded, openWriteGuarded, resolveReal, roots, readRoots, tmpRoots };
