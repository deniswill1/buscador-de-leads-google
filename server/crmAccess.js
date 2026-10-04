const crypto = require('crypto');

// O CRM do planner (hospedado fora daqui) dispara buscas direto neste servidor local.
// Ele se identifica com um token derivado da service role key, que os dois já têm
// configurada (config.php lá, .env aqui), então não há nada novo para configurar e
// um site qualquer aberto no navegador não consegue iniciar buscas nem ler o status.
const TOKEN = crypto
  .createHmac('sha256', (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim())
  .update('buscador-crm')
  .digest('hex');

function validToken(value) {
  const given = Buffer.from(String(value || ''));
  const expected = Buffer.from(TOKEN);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// CORS só para as rotas que o CRM usa. O preflight não carrega o token, por isso é
// liberado para qualquer origem; a requisição de verdade é que exige o token.
function crmCors(req, res, next) {
  const origin = req.get('Origin');
  // Mesma origem: a própria tela do buscador (o navegador manda Origin também em POST).
  if (!origin || origin === `${req.protocol}://${req.get('host')}`) return next();

  res.set({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Crm-Token',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  });
  // Chrome pede essa permissão quando um site público acessa o localhost.
  if (req.get('Access-Control-Request-Private-Network') === 'true') {
    res.set('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);

  if (!validToken(req.get('X-Crm-Token'))) {
    return res.status(401).json({ error: 'O CRM e o buscador não estão com a mesma service role key do Supabase.' });
  }
  next();
}

module.exports = { crmCors };
