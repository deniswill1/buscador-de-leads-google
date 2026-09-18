const supabase = require('../supabaseClient');
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

async function insertLead(searchId, lead) {
  const { error } = await supabase
    .from('leads')
    .upsert(
      {
        search_id: searchId,
        name: lead.name,
        category: lead.category || null,
        address: lead.address || null,
        phone: lead.phone || null,
        website: lead.website || null,
        has_website: !!lead.website,
        email: lead.email || null,
        instagram: lead.instagram || null,
        facebook: lead.facebook || null,
        linkedin: lead.linkedin || null,
        whatsapp: lead.whatsapp || null,
        tiktok: lead.tiktok || null,
        rating: lead.rating ?? null,
        reviews_count: lead.reviewsCount ?? null,
        maps_url: lead.mapsUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'maps_url' }
    );

  if (error) console.error('Erro ao salvar lead:', error.message);
}

async function processSearch(searchId, { niche, location, quantity }) {
  try {
    const headless = process.env.HEADLESS === 'true';
    const { data: existingRows, error: existingErr } = await supabase
      .from('leads')
      .select('maps_url')
      .not('maps_url', 'is', null);
    if (existingErr) throw existingErr;
    const existingUrls = new Set(existingRows.map((row) => row.maps_url));

    const leads = await searchLeads({
      niche,
      location,
      quantity,
      headless,
      existingUrls,
      onProgress: (done) => {
        supabase
          .from('searches')
          .update({ processed: done })
          .eq('id', searchId)
          .then(({ error }) => {
            if (error) console.error('Erro ao atualizar progresso:', error.message);
          });
      },
    });

    for (const lead of leads) {
      const { website, social } = classifyWebsite(lead.website);
      const enrichment = website
        ? await enrichSite(website)
        : { email: null, instagram: null, facebook: null, linkedin: null, tiktok: null, whatsapp: null };
      await insertLead(searchId, { ...lead, website, ...enrichment, ...social });
    }

    await supabase.from('searches').update({ status: 'done', processed: leads.length, error: null }).eq('id', searchId);
  } catch (err) {
    await supabase.from('searches').update({ status: 'error', processed: 0, error: err.message }).eq('id', searchId);
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
