const express = require('express');
const supabase = require('../supabaseClient');

const router = express.Router();

const ALLOWED_QUALIFICATION = ['nao_avaliado', 'qualificado', 'descartado'];
const ALLOWED_STATUS = ['nao_contatado', 'potencial', 'contatado', 'sem_resposta', 'em_negociacao', 'fechado', 'perdido'];

const BACKUP_FIELDS = [
  'name', 'category', 'niche', 'location', 'address', 'phone', 'website',
  'email', 'instagram', 'facebook', 'linkedin', 'whatsapp', 'tiktok',
  'rating', 'reviews_count', 'qualification', 'status', 'notes', 'maps_url',
];

function flattenNiche(row) {
  const { searches, ...rest } = row;
  return { ...rest, niche: searches?.niche ?? null, location: searches?.location ?? null };
}

// searches!inner só quando filtramos por niche, senão vira INNER JOIN e some
// leads sem busca associada (que hoje aparecem com niche/location nulos).
function selectLeadsQuery(query) {
  const filterByNiche = query.niche;
  const embed = filterByNiche ? 'searches!inner(niche, location)' : 'searches(niche, location)';
  let q = supabase.from('leads').select(`*, ${embed}`);

  if (query.search_id) q = q.eq('search_id', query.search_id);
  if (query.has_website === 'true') q = q.eq('has_website', true);
  if (query.has_website === 'false') q = q.eq('has_website', false);
  if (query.qualification && ALLOWED_QUALIFICATION.includes(query.qualification)) {
    q = q.eq('qualification', query.qualification);
  }
  if (query.status && ALLOWED_STATUS.includes(query.status)) {
    q = q.eq('status', query.status);
  }
  if (filterByNiche) q = q.eq('searches.niche', query.niche);
  if (query.q) {
    const escaped = String(query.q).replace(/"/g, '\\"');
    const pattern = `%${escaped}%`;
    q = q.or(`name.ilike."${pattern}",address.ilike."${pattern}",category.ilike."${pattern}"`);
  }

  return q;
}

router.get('/export', async (req, res) => {
  const { data, error } = await selectLeadsQuery(req.query).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Falha ao exportar: ' + error.message });
  const rows = data.map(flattenNiche);

  const columns = [
    'name', 'category', 'niche', 'address', 'phone', 'email', 'website',
    'instagram', 'facebook', 'linkedin', 'whatsapp', 'tiktok',
    'rating', 'reviews_count', 'qualification', 'status', 'notes', 'maps_url',
  ];

  const escape = (value) => {
    if (value === null || value === undefined) return '';
    return `"${String(value).replace(/"/g, '""')}"`;
  };

  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((col) => escape(row[col])).join(','));
  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send('﻿' + csv);
});

// Backup completo em JSON - pra levar todos os leads pra outro dispositivo e continuar
// dali (o import faz upsert por maps_url, então leads que já existem lá são atualizados
// em vez de duplicados).
router.get('/backup', async (req, res) => {
  const { data, error } = await supabase
    .from('leads')
    .select('*, searches(niche, location)')
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: 'Falha ao gerar backup: ' + error.message });

  const leads = data.map(flattenNiche).map((row) => {
    const lead = {};
    BACKUP_FIELDS.forEach((field) => { lead[field] = row[field]; });
    return lead;
  });

  const backup = { exportedAt: new Date().toISOString(), count: leads.length, leads };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-backup.json"');
  res.send(JSON.stringify(backup, null, 2));
});

router.post('/import', async (req, res) => {
  const leads = Array.isArray(req.body?.leads) ? req.body.leads : null;
  if (!leads) {
    return res.status(400).json({ error: 'Envie um backup válido, no formato { "leads": [...] }.' });
  }

  const validItems = [];
  let skipped = 0;
  for (const item of leads) {
    if (!item || !item.maps_url || !item.name) {
      skipped++;
      continue;
    }
    validItems.push(item);
  }

  if (validItems.length === 0) {
    return res.json({ total: leads.length, inserted: 0, updated: 0, skipped });
  }

  const searchCache = new Map();
  const pairs = [...new Set(validItems.map((i) => `${i.niche || 'importado'}|||${i.location || ''}`))];

  try {
    for (const key of pairs) {
      const [niche, location] = key.split('|||');
      const { data: existing, error: findErr } = await supabase
        .from('searches')
        .select('id')
        .eq('niche', niche)
        .eq('location', location)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (findErr) throw findErr;

      let searchId = existing?.id;
      if (!searchId) {
        const { data: created, error: insertErr } = await supabase
          .from('searches')
          .insert({ niche, location, requested_count: 0, status: 'done', processed: 0 })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        searchId = created.id;
      }
      searchCache.set(key, searchId);
    }

    const mapsUrls = validItems.map((i) => i.maps_url);
    const { data: existingLeads, error: existingErr } = await supabase
      .from('leads')
      .select('maps_url')
      .in('maps_url', mapsUrls);
    if (existingErr) throw existingErr;
    const existingSet = new Set(existingLeads.map((r) => r.maps_url));

    const rows = validItems.map((item) => ({
      search_id: searchCache.get(`${item.niche || 'importado'}|||${item.location || ''}`),
      name: item.name,
      category: item.category || null,
      address: item.address || null,
      phone: item.phone || null,
      website: item.website || null,
      has_website: !!item.website,
      email: item.email || null,
      instagram: item.instagram || null,
      facebook: item.facebook || null,
      linkedin: item.linkedin || null,
      whatsapp: item.whatsapp || null,
      tiktok: item.tiktok || null,
      rating: item.rating ?? null,
      reviews_count: item.reviews_count ?? null,
      maps_url: item.maps_url,
      qualification: ALLOWED_QUALIFICATION.includes(item.qualification) ? item.qualification : 'nao_avaliado',
      status: ALLOWED_STATUS.includes(item.status) ? item.status : 'nao_contatado',
      notes: item.notes || null,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase.from('leads').upsert(rows, { onConflict: 'maps_url' });
    if (upsertErr) throw upsertErr;

    const updated = rows.filter((r) => existingSet.has(r.maps_url)).length;
    const inserted = rows.length - updated;

    res.json({ total: leads.length, inserted, updated, skipped });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao importar: ' + err.message });
  }
});

router.get('/niches', async (req, res) => {
  const { data, error } = await supabase
    .from('leads')
    .select('searches!inner(niche)')
    .not('search_id', 'is', null);
  if (error) return res.status(500).json({ error: 'Falha ao buscar nichos: ' + error.message });

  const counts = new Map();
  for (const row of data) {
    const niche = row.searches?.niche;
    if (!niche) continue;
    counts.set(niche, (counts.get(niche) || 0) + 1);
  }

  const result = [...counts.entries()]
    .map(([niche, count]) => ({ niche, count }))
    .sort((a, b) => a.niche.localeCompare(b.niche, 'pt-BR', { sensitivity: 'base' }));

  res.json(result);
});

router.get('/', async (req, res) => {
  const { data, error } = await selectLeadsQuery(req.query).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Falha ao buscar leads: ' + error.message });
  res.json(data.map(flattenNiche));
});

router.patch('/:id', async (req, res) => {
  const { qualification, status, notes } = req.body || {};
  const fields = {};

  if (qualification !== undefined) {
    if (!ALLOWED_QUALIFICATION.includes(qualification)) {
      return res.status(400).json({ error: 'Qualificação inválida.' });
    }
    fields.qualification = qualification;
  }
  if (status !== undefined) {
    if (!ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }
    fields.status = status;
  }
  if (notes !== undefined) {
    fields.notes = notes;
  }

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'Nada para atualizar.' });
  }

  fields.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('leads')
    .update(fields)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Falha ao atualizar: ' + error.message });
  if (!data) return res.status(404).json({ error: 'Lead não encontrado.' });
  res.json(data);
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('leads').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Falha ao excluir: ' + error.message });
  res.status(204).end();
});

module.exports = router;
