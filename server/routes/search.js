const express = require('express');
const supabase = require('../supabaseClient');
const { enqueueSearch } = require('../jobs/searchJob');

const router = express.Router();

router.post('/', async (req, res) => {
  const { niche, location, quantity } = req.body || {};
  if (!niche || !location) {
    return res.status(400).json({ error: 'Informe nicho e localidade.' });
  }
  const qty = Math.min(Math.max(parseInt(quantity, 10) || 20, 1), 120);

  const { data, error } = await supabase
    .from('searches')
    .insert({ niche, location, requested_count: qty, status: 'running', processed: 0 })
    .select('id')
    .single();

  if (error) return res.status(500).json({ error: 'Falha ao criar busca: ' + error.message });

  const searchId = data.id;
  enqueueSearch(searchId, { niche, location, quantity: qty });

  res.status(201).json({ searchId });
});

router.get('/:id/status', async (req, res) => {
  const { data: search, error } = await supabase
    .from('searches')
    .select('id, niche, location, requested_count, status, processed, error')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Falha ao buscar status: ' + error.message });
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
