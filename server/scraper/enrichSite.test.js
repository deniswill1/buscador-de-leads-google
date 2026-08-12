const test = require('node:test');
const assert = require('node:assert/strict');
const { extractEmails, extractSocials } = require('./enrichSite');

test('extractEmails encontra emails válidos e filtra falsos positivos', () => {
  const html = `
    <a href="mailto:contato@empresa.com.br">Fale conosco</a>
    <p>SAC: vendas@empresa.com.br</p>
    <img src="banner@2x.png" />
    <span>noreply@sentry.io</span>
  `;
  const emails = extractEmails(html).sort();
  assert.deepEqual(emails, ['contato@empresa.com.br', 'vendas@empresa.com.br'].sort());
});

test('extractEmails deduplica e ignora maiúsculas/minúsculas repetidas', () => {
  const html = '<p>contato@empresa.com</p><p>Contato@Empresa.com</p>';
  const emails = extractEmails(html);
  assert.equal(emails.length, 1);
  assert.equal(emails[0], 'contato@empresa.com');
});

test('extractSocials encontra instagram, facebook, linkedin e whatsapp', () => {
  const html = `
    <a href="https://www.instagram.com/minhaempresa/">Instagram</a>
    <a href="https://www.facebook.com/minhaempresa">Facebook</a>
    <a href="https://www.linkedin.com/company/minhaempresa">LinkedIn</a>
    <a href="https://wa.me/5511999999999">Fale no WhatsApp</a>
  `;
  const socials = extractSocials(html);
  assert.match(socials.instagram, /instagram\.com\/minhaempresa/);
  assert.match(socials.facebook, /facebook\.com\/minhaempresa/);
  assert.match(socials.linkedin, /linkedin\.com\/company\/minhaempresa/);
  assert.match(socials.whatsapp, /wa\.me\/5511999999999/);
});

test('extractSocials retorna objeto vazio quando não há redes sociais', () => {
  const socials = extractSocials('<p>Site institucional sem links sociais.</p>');
  assert.deepEqual(socials, {});
});
