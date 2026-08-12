const express = require('express');
const db = require('../db');
const { enqueueSearch } = require('../jobs/searchJob');

const router = express.Router();

router.post('/', (req, res) => {
  const { niche, location, quantity } = req.body || {};
  if (!niche || !location) {
    return res.status(400).json({ error: 'Informe nicho e localidade.' });
  }
  const qty = Math.min(Math.max(parseInt(quantity, 10) || 20, 1), 120);

  const info = db
    .prepare(
      `INSERT INTO searches (niche, location, requested_count, status, processed) VALUES (?, ?, ?, 'running', 0)`
    )
    .run(niche, location, qty);

  const searchId = info.lastInsertRowid;
  enqueueSearch(searchId, { niche, location, quantity: qty });

  res.status(201).json({ searchId });
});

router.get('/:id/status', (req, res) => {
  const search = db
    .prepare(
      `SELECT id, niche, location, requested_count, status, processed, error FROM searches WHERE id = ?`
    )
    .get(req.params.id);

  if (!search) return res.status(404).json({ error: 'Busca não encontrada.' });

  res.json({
    status: search.status,
    processed: search.processed,
    total: search.requested_count,
    niche: search.niche,
    location: search.location,
    error: search.error,
  });
});

module.exports = router;
