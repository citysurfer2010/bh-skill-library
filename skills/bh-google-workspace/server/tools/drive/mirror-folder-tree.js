'use strict';
const { err, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'drive_mirror_folder_tree', description: 'Mirrors the folder structure of a template folder (recursive, folders only, no files) into one or more target folders. ALWAYS reads the current live structure of the template directly from Drive so template updates are picked up automatically. Idempotent — existing subfolders (same name) are skipped and mirrored further recursively. Ideal for creating new property/project folders in a standard way.', inputSchema: { type: 'object', properties: { templateFolderId: { type: 'string', description: 'Drive ID of the template folder (source of the structure).' }, targetFolderIds: { oneOf: [ { type: 'array', items: { type: 'string' } }, { type: 'string', description: 'Comma-separated list of target folder IDs.' } ], description: 'One or more target folders to mirror the structure into.' }, skipTopLevelNames: { type: 'array', items: { type: 'string' }, description: 'Names of top-level template folders NOT to copy (e.g. placeholder folders like "[MFH], [YYMMDD]...").' }, maxDepth: { type: 'number', description: 'Maximum recursion depth (default 20).' } }, required: ['templateFolderId', 'targetFolderIds'] },
  handler: async ({ templateFolderId, targetFolderIds, skipTopLevelNames = [], maxDepth = 20 }) => {
  if (!templateFolderId) return err('templateFolderId fehlt.');
  const targets = Array.isArray(targetFolderIds) ? targetFolderIds
                : (typeof targetFolderIds === 'string' ? targetFolderIds.split(',').map(s => s.trim()).filter(Boolean) : []);
  if (!targets.length) return err('targetFolderIds fehlt (Array oder kommagetrennt).');
  const skipSet = new Set((skipTopLevelNames || []).map(s => String(s).trim()));

  async function listChildFolders(parentId) {
    const out = [];
    let pageToken;
    do {
      const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      if (pageToken) url += `&pageToken=${pageToken}`;
      const r = await gapiJSON('GET', url);
      if (r.status !== 200) throw new Error(`list(${parentId}) HTTP ${r.status}: ${JSON.stringify(r.data).slice(0,200)}`);
      out.push(...(r.data.files || []));
      pageToken = r.data.nextPageToken;
    } while (pageToken);
    return out;
  }
  async function createChildFolder(name, parentId) {
    const r = await gapiJSON('POST', 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name',
      { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] });
    if (r.status !== 200) throw new Error(`create(${name}) HTTP ${r.status}: ${JSON.stringify(r.data).slice(0,200)}`);
    return r.data;
  }
  async function buildTree(folderId, depth = 0) {
    if (depth >= maxDepth) return [];
    const kids = await listChildFolders(folderId);
    const tree = [];
    for (const k of kids) tree.push({ name: k.name, id: k.id, children: await buildTree(k.id, depth + 1) });
    return tree;
  }

  let created = 0, existed = 0;
  const perTarget = [];
  async function mirrorInto(templateChildren, targetId, isRoot) {
    const existing = await listChildFolders(targetId);
    const byName = new Map(existing.map(e => [e.name.trim(), e]));
    for (const tpl of templateChildren) {
      if (isRoot && skipSet.has(tpl.name.trim())) continue;
      let match = byName.get(tpl.name.trim());
      if (!match) { match = await createChildFolder(tpl.name, targetId); created++; }
      else existed++;
      if (tpl.children.length) await mirrorInto(tpl.children, match.id, false);
    }
  }

  let templateTree;
  try { templateTree = await buildTree(templateFolderId); }
  catch (e) { return err(`Template lesen fehlgeschlagen: ${e.message}`); }

  for (const tid of targets) {
    const before = { c: created, e: existed };
    try {
      await mirrorInto(templateTree, tid, true);
      perTarget.push(`✓ ${tid}: +${created - before.c} neu, ${existed - before.e} vorhanden`);
    } catch (e) {
      perTarget.push(`✗ ${tid}: ${e.message}`);
    }
  }
  const templateCount = (function count(nodes) { let n = 0; for (const x of nodes) n += 1 + count(x.children); return n; })(templateTree);
  return ok(
    `drive_mirror_folder_tree\nTemplate: ${templateFolderId} (${templateCount} Ordner gesamt, ${templateTree.length} top-level)\n` +
    `Ziele: ${targets.length}\nErstellt: ${created} | Bereits vorhanden: ${existed}\n\n${perTarget.join('\n')}`
  );},
};
