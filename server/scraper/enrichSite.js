const cheerio = require('cheerio');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const EMAIL_BLOCKLIST = [
  /wixpress\.com$/i,
  /sentry\.io$/i,
  /example\.com$/i,
  /godaddy\.com$/i,
  /\.(png|jpg|jpeg|gif|svg|webp)$/i,
];

const SOCIAL_PATTERNS = {
  instagram: /instagram\.com\/[a-zA-Z0-9._-]+/i,
  facebook: /facebook\.com\/[a-zA-Z0-9._-]+/i,
  linkedin: /linkedin\.com\/(company|in)\/[a-zA-Z0-9._-]+/i,
  tiktok: /tiktok\.com\/@[a-zA-Z0-9._-]+/i,
  whatsapp: /(wa\.me\/\d+|api\.whatsapp\.com\/send\?[^"'\s<>]*)/i,
};

const CONTACT_PATH_HINTS = ['contato', 'contact', 'fale-conosco', 'fale_conosco'];

async function fetchHtml(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadFinderBot/1.0)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractEmails(html) {
  const matches = html.match(EMAIL_REGEX) || [];
  const unique = [...new Set(matches.map((m) => m.toLowerCase()))];
  return unique.filter((email) => !EMAIL_BLOCKLIST.some((re) => re.test(email)));
}

function extractSocials(html) {
  const socials = {};
  for (const [key, pattern] of Object.entries(SOCIAL_PATTERNS)) {
    const match = html.match(pattern);
    if (match) {
      socials[key] = `https://${match[0].replace(/^https?:\/\//i, '')}`;
    }
  }
  return socials;
}

function findContactLink(baseUrl, $) {
  let contactHref = null;
  $('a[href]').each((_, el) => {
    if (contactHref) return;
    const href = $(el).attr('href') || '';
    const lower = href.toLowerCase();
    if (CONTACT_PATH_HINTS.some((hint) => lower.includes(hint))) {
      try {
        contactHref = new URL(href, baseUrl).toString();
      } catch (err) {
        // href inválido (ex: "javascript:void(0)") - ignora
      }
    }
  });
  return contactHref;
}

/**
 * Visita o site de um lead e tenta extrair email e redes sociais.
 * Falha graciosamente (retorna campos nulos) se o site estiver fora do ar,
 * bloquear o acesso ou não publicar essas informações.
 */
async function enrichSite(website) {
  const empty = {
    email: null,
    instagram: null,
    facebook: null,
    linkedin: null,
    tiktok: null,
    whatsapp: null,
  };
  if (!website) return empty;

  let url = website;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const html = await fetchHtml(url);
  if (!html) return empty;

  const $ = cheerio.load(html);
  let emails = extractEmails(html);
  let socials = extractSocials(html);

  if (emails.length === 0 || Object.keys(socials).length === 0) {
    const contactUrl = findContactLink(url, $);
    if (contactUrl) {
      const contactHtml = await fetchHtml(contactUrl);
      if (contactHtml) {
        if (emails.length === 0) emails = extractEmails(contactHtml);
        socials = { ...extractSocials(contactHtml), ...socials };
      }
    }
  }

  return {
    email: emails[0] || null,
    instagram: socials.instagram || null,
    facebook: socials.facebook || null,
    linkedin: socials.linkedin || null,
    tiktok: socials.tiktok || null,
    whatsapp: socials.whatsapp || null,
  };
}

module.exports = { enrichSite, extractEmails, extractSocials };
