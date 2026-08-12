const { chromium } = require('playwright');

// Seletores do Google Maps: fragéis por natureza (o Google muda o HTML sem aviso).
// Se o scraper parar de encontrar dados, comece a depuração por aqui.
const SELECTORS = {
  feed: 'div[role="feed"]',
  listingLink: 'a[href*="/maps/place/"]',
  title: 'h1',
  phoneButton: 'button[data-item-id^="phone:"]',
  websiteLink: 'a[data-item-id="authority"]',
  addressButton: 'button[data-item-id="address"]',
  categoryButton: 'button.DkEaL',
  ratingContainer: 'div.F7nice',
};

const MAX_RESULTS = 120;

async function dismissConsent(page) {
  try {
    const btn = page
      .locator(
        'button:has-text("Aceitar tudo"), button:has-text("Accept all"), button:has-text("Rejeitar tudo"), button:has-text("Reject all")'
      )
      .first();
    await btn.click({ timeout: 4000 });
  } catch (err) {
    // sem tela de consentimento (ou já foi aceita antes) - segue normalmente
  }
}

// Rola os resultados até achar `targetCount` leads NOVOS (que não estão em `existingUrls`,
// leads já salvos de buscas anteriores). Isso evita revisitar e reprocessar quem já foi
// coletado antes quando a mesma região/nicho é buscada de novo.
async function collectListingLinks(page, targetCount, existingUrls = new Set()) {
  await page.waitForSelector(SELECTORS.feed, { timeout: 20000 });
  const allLinks = new Set();
  const newLinks = new Set();
  let stall = 0;
  const maxStall = 6;

  while (newLinks.size < targetCount && allLinks.size < MAX_RESULTS && stall < maxStall) {
    const hrefs = await page.$$eval(SELECTORS.listingLink, (as) => as.map((a) => a.href));
    const before = allLinks.size;
    hrefs.forEach((h) => {
      allLinks.add(h);
      if (!existingUrls.has(h)) newLinks.add(h);
    });
    stall = allLinks.size === before ? stall + 1 : 0;

    await page.evaluate((sel) => {
      const feed = document.querySelector(sel);
      if (feed) feed.scrollBy(0, feed.scrollHeight);
    }, SELECTORS.feed);

    await page.waitForTimeout(800 + Math.random() * 700);
  }

  return Array.from(newLinks).slice(0, targetCount);
}

async function extractListing(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector(SELECTORS.title, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500 + Math.random() * 500);

  return page.evaluate((sel) => {
    // O Maps embute caracteres de fonte de icone (area privada do Unicode, ex: U+E0C8) junto
    // com o texto visivel de varios botoes (ex: endereco) - removidos aqui pra nao virar "tofu" na tela.
    const PUA_START = String.fromCharCode(57344);
    const PUA_END = String.fromCharCode(63743);
    const PUA_REGEX = new RegExp('[' + PUA_START + '-' + PUA_END + ']', 'g');
    const text = (el) => {
      if (!el) return null;
      const cleaned = el.textContent.replace(PUA_REGEX, '').trim();
      return cleaned || null;
    };
    const attr = (el, name) => (el ? el.getAttribute(name) : null);

    const name = text(document.querySelector(sel.title));

    const phoneBtn = document.querySelector(sel.phoneButton);
    let phone = null;
    if (phoneBtn) {
      const raw = attr(phoneBtn, 'data-item-id') || '';
      phone = text(phoneBtn) || raw.replace('phone:tel:', '').trim();
    }

    const websiteEl = document.querySelector(sel.websiteLink);
    const website = websiteEl ? attr(websiteEl, 'href') : null;

    const addressBtn = document.querySelector(sel.addressButton);
    const address = addressBtn ? text(addressBtn) : null;

    const categoryBtn = document.querySelector(sel.categoryButton);
    const category = categoryBtn ? text(categoryBtn) : null;

    let rating = null;
    let reviewsCount = null;
    const ratingContainer = document.querySelector(sel.ratingContainer);
    if (ratingContainer) {
      const ratingSpan = ratingContainer.querySelector('span[aria-hidden="true"]');
      if (ratingSpan) {
        const v = parseFloat(ratingSpan.textContent.replace(',', '.'));
        if (!Number.isNaN(v)) rating = v;
      }
      const reviewsSpan = ratingContainer.querySelector(
        'span[aria-label*="avalia"], span[aria-label*="review"]'
      );
      if (reviewsSpan) {
        const digits = reviewsSpan.textContent.replace(/\D/g, '');
        if (digits) reviewsCount = parseInt(digits, 10);
      }
    }

    return { name, phone, website, address, category, rating, reviewsCount };
  }, SELECTORS);
}

/**
 * Busca leads no Google Maps por nicho + localidade.
 * @param {{niche:string, location:string, quantity:number, headless?:boolean, existingUrls?:Set<string>, onProgress?:(done:number,total:number)=>void}} opts
 * @returns {Promise<Array<object>>}
 */
async function searchLeads({ niche, location, quantity, headless = false, existingUrls = new Set(), onProgress }) {
  const target = Math.min(Math.max(Number(quantity) || 20, 1), MAX_RESULTS);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ locale: 'pt-BR' });
  const page = await context.newPage();
  const results = [];

  try {
    const query = encodeURIComponent(`${niche} em ${location}`);
    await page.goto(`https://www.google.com/maps/search/${query}?hl=pt-BR`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await dismissConsent(page);

    const links = await collectListingLinks(page, target, existingUrls);

    for (let i = 0; i < links.length; i++) {
      try {
        const details = await extractListing(page, links[i]);
        if (details.name) {
          results.push({ ...details, mapsUrl: links[i] });
        }
      } catch (err) {
        // ignora esse resultado específico e segue para o próximo
      }
      if (onProgress) onProgress(i + 1, links.length);
      await page.waitForTimeout(600 + Math.random() * 900);
    }
  } finally {
    await browser.close();
  }

  return results;
}

module.exports = { searchLeads };
