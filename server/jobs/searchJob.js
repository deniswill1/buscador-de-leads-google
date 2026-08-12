const db = require('../db');
const { searchLeads } = require('../scraper/mapsScraper');
const { enrichSite } = require('../scraper/enrichSite');

const queue = [];
let isRunning = false;

// Muitos pequenos negócios colocam um link de rede social no campo "site" do Maps
// em vez de um site próprio. Nesse caso o link deve virar rede social, não site
// (evita tratar a própria página do Instagram/Facebook como "site institucional",
// o que gera lixo ao tentar extrair email/redes sociais de dentro dela).
const SOCIAL_HOSTS = [
  { test: /(^|\.)instagram\.com$/i, field: 'instagram' },
  { test: /(^|\.)facebook\.com$/i, field: 'facebook' },
  { test: /(^|\.)linkedin\.com$/i, field: 'linkedin' },
  { test: /(^|\.)tiktok\.com$/i, field: 'tiktok' },
  { test: /(^|\.)wa\.me$/i, field: 'whatsapp' },
  { test: /(^|\.)api\.whatsapp\.com$/i, field: 'whatsapp' },
];

function classifyWebsite(url) {
  if (!url) return { website: null, social: {} };
  try {
    const host = new URL(url).hostname;
    const match = SOCIAL_HOSTS.find((m) => m.test.test(host));
    if (match) return { website: null, social: { [match.field]: url } };
  } catch (err) {
    // URL inválida - mantém como site genérico, o fetch adiante vai falhar de forma graciosa
  }
  return { website: url, social: {} };
}

const upsertLeadStmt = db.prepare(`
  INSERT INTO leads (
    search_id, name, category, address, phone, website, has_website, email,
    instagram, facebook, linkedin, whatsapp, tiktok, rating, reviews_count, maps_url
  ) VALUES (
    @search_id, @name, @category, @address, @phone, @website, @has_website, @email,
    @instagram, @facebook, @linkedin, @whatsapp, @tiktok, @rating, @reviews_count, @maps_url
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
    updated_at = datetime('now')
`);

const updateProgressStmt = db.prepare(`UPDATE searches SET processed = ? WHERE id = ?`);
const updateStatusStmt = db.prepare(`UPDATE searches SET status = ?, processed = ?, error = ? WHERE id = ?`);

function insertLead(searchId, lead) {
  try {
    upsertLeadStmt.run({
      search_id: searchId,
      name: lead.name,
      category: lead.category || null,
      address: lead.address || null,
      phone: lead.phone || null,
      website: lead.website || null,
      has_website: lead.website ? 1 : 0,
      email: lead.email || null,
      instagram: lead.instagram || null,
      facebook: lead.facebook || null,
      linkedin: lead.linkedin || null,
      whatsapp: lead.whatsapp || null,
      tiktok: lead.tiktok || null,
      rating: lead.rating ?? null,
      reviews_count: lead.reviewsCount ?? null,
      maps_url: lead.mapsUrl,
    });
  } catch (err) {
    console.error('Erro ao salvar lead:', err.message);
  }
}

const getExistingMapsUrlsStmt = db.prepare(`SELECT maps_url FROM leads WHERE maps_url IS NOT NULL`);

async function processSearch(searchId, { niche, location, quantity }) {
  try {
    const headless = process.env.HEADLESS === 'true';
    const existingUrls = new Set(getExistingMapsUrlsStmt.all().map((row) => row.maps_url));
    const leads = await searchLeads({
      niche,
      location,
      quantity,
      headless,
      existingUrls,
      onProgress: (done) => updateProgressStmt.run(done, searchId),
    });

    for (const lead of leads) {
      const { website, social } = classifyWebsite(lead.website);
      const enrichment = website
        ? await enrichSite(website)
        : { email: null, instagram: null, facebook: null, linkedin: null, tiktok: null, whatsapp: null };
      insertLead(searchId, { ...lead, website, ...enrichment, ...social });
    }

    updateStatusStmt.run('done', leads.length, null, searchId);
  } catch (err) {
    updateStatusStmt.run('error', 0, err.message, searchId);
  }
}

async function runNext() {
  if (isRunning) return;
  const job = queue.shift();
  if (!job) return;

  isRunning = true;
  try {
    await processSearch(job.searchId, job.params);
  } finally {
    isRunning = false;
    runNext();
  }
}

function enqueueSearch(searchId, params) {
  queue.push({ searchId, params });
  runNext();
}

module.exports = { enqueueSearch };
