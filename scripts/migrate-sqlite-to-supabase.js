require('dotenv').config();
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const supabase = require('../server/supabaseClient');

async function main() {
  const dbPath = path.join(__dirname, '..', 'data', 'leads.db');
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const searches = db.prepare('SELECT * FROM searches ORDER BY id').all();
  const searchIdMap = new Map();

  for (const s of searches) {
    const { data, error } = await supabase
      .from('searches')
      .insert({
        niche: s.niche,
        location: s.location,
        requested_count: s.requested_count,
        status: s.status,
        processed: s.processed,
        error: s.error,
        created_at: s.created_at,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Falha ao migrar search ${s.id}: ${error.message}`);
    searchIdMap.set(s.id, data.id);
  }
  console.log(`Migradas ${searches.length} buscas.`);

  const leads = db.prepare('SELECT * FROM leads ORDER BY id').all();
  const rows = leads.map((l) => ({
    search_id: l.search_id ? searchIdMap.get(l.search_id) ?? null : null,
    name: l.name,
    category: l.category,
    address: l.address,
    phone: l.phone,
    website: l.website,
    has_website: !!l.has_website,
    email: l.email,
    instagram: l.instagram,
    facebook: l.facebook,
    linkedin: l.linkedin,
    whatsapp: l.whatsapp,
    tiktok: l.tiktok,
    rating: l.rating,
    reviews_count: l.reviews_count,
    maps_url: l.maps_url,
    qualification: l.qualification,
    status: l.status,
    notes: l.notes,
    created_at: l.created_at,
    updated_at: l.updated_at,
  }));

  const { error: upsertErr } = await supabase.from('leads').upsert(rows, { onConflict: 'maps_url' });
  if (upsertErr) throw new Error(`Falha ao migrar leads: ${upsertErr.message}`);

  console.log(`Migrados ${rows.length} leads.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
