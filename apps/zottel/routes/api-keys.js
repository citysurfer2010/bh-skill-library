'use strict';
/**
 * /api/me/api-keys: Every logged-in user manages their own keys.
 * The plain text appears only in the POST response.
 */
const express = require('express');
const apiKeys = require('../lib/api-keys');

const ALLOWED_SCOPES = new Set(['submit', 'read']);

function buildRouter() {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { label, scopes } = req.body || {};
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'label required' });
    const wanted = (scopes ? String(scopes).split(',') : ['submit', 'read'])
      .map((s) => s.trim()).filter((s) => ALLOWED_SCOPES.has(s));
    if (!wanted.length) return res.status(400).json({ error: 'at least one valid scope (submit|read)' });
    return res.status(201).json(apiKeys.create({
      ownerId: req.user.email,
      label: String(label).trim().slice(0, 100),
      scopes: wanted.join(','),
    }));
  });

  router.get('/', (req, res) => res.json({ keys: apiKeys.list(req.user.email) }));

  router.delete('/:id', (req, res) => {
    const ok = apiKeys.revoke({ id: parseInt(req.params.id, 10), ownerId: req.user.email });
    if (!ok) return res.status(404).json({ error: 'Key not found or already revoked' });
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { buildRouter };
