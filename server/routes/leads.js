const express = require('express');
const db = require('../db');

const router = express.Router();

const ALLOWED_QUALIFICATION = ['nao_avaliado', 'qualificado', 'descartado'];
const ALLOWED_STATUS = ['nao_contatado', 'contatado', 'sem_resposta', 'em_negociacao', 'fechado', 'perdido'];

const LEADS_WITH_NICHE_SELECT = `
  SELECT leads.*, searches.niche AS niche, searches.location AS location
  FROM leads
  LEFT JOIN searches ON leads.search_id = searches.id
`;

const BACKUP_FIELDS = [
  'name', 'category', 'niche', 'location', 'address', 'phone', 'website',
  'email', 'instagram', 'facebook', 'linkedin', 'whatsapp', 'tiktok',
  'rating', 'reviews_count', 'qualification', 'status', 'notes', 'maps_url',
];

const findSearchStmt = db.prepare(
  'SELECT id FROM searches WHERE niche = ? AND location = ? ORDER BY id DESC LIMIT 1'
);
const insertSearchStmt = db.prepare(
  `INSERT INTO searches (niche, location, requested_count, status, processed) VALUES (?, ?, 0, 'done', 0)`
);
const checkLeadExistsStmt = db.prepare('SELECT id FROM leads WHERE maps_url = ?');

const upsertImportedLeadStmt = db.prepare(`
  INSERT INTO leads (
    search_id, name, category, address, phone, website, has_website, email,
    instagram, facebook, linkedin, whatsapp, tiktok, rating, reviews_count, maps_url,
    qualification, status, notes
  ) VALUES (
    @search_id, @name, @category, @address, @phone, @website, @has_website, @email,
    @instagram, @facebook, @linkedin, @whatsapp, @tiktok, @rating, @reviews_count, @maps_url,
    @qualification, @status, @notes
  )
  ON CONFLICT(maps_url) DO UPDATE SET
    search_id = excluded.search_id,
    name = excluded.name,
    category = excluded.category,
    address = excluded.address,
    phone = excluded.phone,
    website = excluded.website,
    has_website = excluded.has_website,
    email = excluded.email,
    instagram = excluded.instagram,
    facebook = excluded.facebook,
    linkedin = excluded.linkedin,
    whatsapp = excluded.whatsapp,
    tiktok = excluded.tiktok,
    rating = excluded.rating,
    reviews_count = excluded.reviews_count,
    qualification = excluded.qualification,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = datetime('now')
`);

function buildFilters(query) {
  const clauses = [];
  const params = {};

  if (query.search_id) {
    clauses.push('leads.search_id = @search_id');
    params.search_id = query.search_id;
  }
  if (query.has_website === 'true' || query.has_website === 'false') {
    clauses.push('leads.has_website = @has_website');
    params.has_website = query.has_website === 'true' ? 1 : 0;
  }
  if (query.qualification && ALLOWED_QUALIFICATION.includes(query.qualification)) {
    clauses.push('leads.qualification = @qualification');
    params.qualification = query.qualification;
  }
  if (query.status && ALLOWED_STATUS.includes(query.status)) {
    clauses.push('leads.status = @status');
    params.status = query.status;
  }
  if (query.niche) {
    clauses.push('searches.niche = @niche');
    params.niche = query.niche;
  }
  if (query.q) {
    clauses.push('(leads.name LIKE @q OR leads.address LIKE @q OR leads.category LIKE @q)');
    params.q = `%${query.q}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

router.get('/export', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const rows = db.prepare(`${LEADS_WITH_NICHE_SELECT} ${where} ORDER BY leads.created_at DESC`).all(params);

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
router.get('/backup', (req, res) => {
  const rows = db.prepare(`${LEADS_WITH_NICHE_SELECT} ORDER BY leads.created_at ASC`).all();
  const leads = rows.map((row) => {
    const lead = {};
    BACKUP_FIELDS.forEach((field) => { lead[field] = row[field]; });
    return lead;
  });

  const backup = { exportedAt: new Date().toISOString(), count: leads.length, leads };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-backup.json"');
  res.send(JSON.stringify(backup, null, 2));
});

router.post('/import', (req, res) => {
  const leads = Array.isArray(req.body?.leads) ? req.body.leads : null;
  if (!leads) {
    return res.status(400).json({ error: 'Envie um backup válido, no formato { "leads": [...] }.' });
  }

  const searchCache = new Map();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const getSearchId = (niche, location) => {
    const cacheKey = `${niche}|||${location}`;
    if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);
    const existing = findSearchStmt.get(niche, location);
    const id = existing ? existing.id : insertSearchStmt.run(niche, location).lastInsertRowid;
    searchCache.set(cacheKey, id);
    return id;
  };

  db.exec('BEGIN');
  try {
    for (const item of leads) {
      if (!item || !item.maps_url || !item.name) {
        skipped++;
        continue;
      }

      const searchId = getSearchId(item.niche || 'importado', item.location || '');
      const existedBefore = !!checkLeadExistsStmt.get(item.maps_url);

      upsertImportedLeadStmt.run({
        search_id: searchId,
        name: item.name,
        category: item.category || null,
        address: item.address || null,
        phone: item.phone || null,
        website: item.website || null,
        has_website: item.website ? 1 : 0,
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
      });

      if (existedBefore) updated++;
      else inserted++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Falha ao importar: ' + err.message });
  }

  res.json({ total: leads.length, inserted, updated, skipped });
});

router.get('/niches', (req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT searches.niche AS niche
       FROM leads
       JOIN searches ON leads.search_id = searches.id
       WHERE searches.niche IS NOT NULL
       ORDER BY searches.niche COLLATE NOCASE`
    )
    .all();
  res.json(rows.map((r) => r.niche));
});

router.get('/', (req, res) => {
  const { where, params } = buildFilters(req.query);
  const rows = db.prepare(`${LEADS_WITH_NICHE_SELECT} ${where} ORDER BY leads.created_at DESC`).all(params);
  res.json(rows);
});

router.patch('/:id', (req, res) => {
  const { qualification, status, notes } = req.body || {};
  const fields = [];
  const params = { id: req.params.id };

  if (qualification !== undefined) {
    if (!ALLOWED_QUALIFICATION.includes(qualification)) {
      return res.status(400).json({ error: 'Qualificação inválida.' });
    }
    fields.push('qualification = @qualification');
    params.qualification = qualification;
  }
  if (status !== undefined) {
    if (!ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }
    fields.push('status = @status');
    params.status = status;
  }
  if (notes !== undefined) {
    fields.push('notes = @notes');
    params.notes = notes;
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nada para atualizar.' });
  }

  fields.push("updated_at = datetime('now')");
  db.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = @id`).run(params);

  const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Lead não encontrado.' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
