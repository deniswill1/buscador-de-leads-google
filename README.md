# Buscador de Leads

Ferramenta local para prospecção B2B: busca empresas no Google Maps por nicho + localidade,
extrai telefone/site, tenta descobrir email e redes sociais no site de cada empresa, e organiza
tudo num funil (qualificação + status de contato).

## ⚠️ Aviso importante

Esta ferramenta **não usa a API oficial do Google Places** — ela abre o Google Maps de verdade
num navegador automatizado e lê os resultados na tela (scraping). Isso foi uma escolha deliberada
para não ter custo, mas significa que:

- Viola os Termos de Serviço do Google. O uso é de responsabilidade de quem executa.
- Uso pesado/repetido pode gerar captcha ou bloqueio temporário do seu IP no Google Maps.
- O Google muda o HTML do Maps de tempos em tempos, o que pode quebrar o scraper. Se isso
  acontecer, os seletores usados estão centralizados em `server/scraper/mapsScraper.js`
  (constante `SELECTORS`) para facilitar o ajuste.
- Por padrão o navegador abre visível (não headless) — isso ajuda a reduzir o risco de bloqueio
  e permite resolver um eventual captcha manualmente. Não fechar a janela até a busca terminar.

## Requisitos

- Node.js 22.5 ou superior (usa `fetch` nativo e o módulo `node:sqlite`, evitando dependências
  nativas que exigem compilador C++/Visual Studio instalado)

## Instalação

```bash
npm install
```

O `postinstall` já baixa o Chromium usado pelo Playwright. Se precisar rodar manualmente:

```bash
npx playwright install chromium
```

## Rodando

```bash
npm start
```

Abra `http://localhost:3000` no navegador.

Variáveis de ambiente (opcional, copie `.env.example` para `.env`):

- `PORT` — porta do servidor (padrão 3000)
- `HEADLESS` — `true` para rodar o navegador do scraper sem interface (padrão `false`)

## Como usar

1. **Buscar leads**: informe nicho (ex: "dentista"), localidade (ex: "Curitiba, PR") e a
   quantidade desejada (até 120 por busca — é o limite prático que o próprio Google Maps carrega).
   Uma janela do Chromium vai abrir e navegar pelos resultados sozinha; acompanhe o progresso na
   barra da tela. Apenas uma busca roda por vez. Se você repetir uma busca na mesma região, o
   sistema pula automaticamente os leads já coletados antes (comparando pelo link do Google Maps)
   e busca só os novos, até atingir a quantidade pedida.
2. **Leads**: lista todos os leads encontrados, com abas "Com site" / "Sem site", filtros por
   nicho pesquisado, qualificação e status, busca por texto, e edição inline de qualificação,
   status do funil e notas. Links diretos para ligar (`tel:`), mandar email (`mailto:`), abrir o
   site e as redes sociais/WhatsApp encontrados.
3. **Funil**: visão em colunas (Não contatado → Contatado → Sem resposta → Em negociação →
   Fechado / Perdido) para acompanhar onde cada lead está no processo comercial.
4. **Exportar CSV**: respeita os filtros ativos na tela de Leads — pra abrir em Excel/Planilhas.
5. **Exportar/Importar backup**: "Exportar backup" baixa um arquivo `.json` com todos os leads
   (incluindo qualificação, status e notas). Pra usar em outro dispositivo, copie esse arquivo
   pra lá (pen drive, e-mail, nuvem etc.) e use "Importar backup" — leads que já existirem lá são
   **atualizados** com os dados do arquivo (sem duplicar), e os que não existirem são adicionados.
   Não há sincronização automática entre dispositivos; é um processo manual de exportar num lado
   e importar no outro sempre que quiser atualizar.

## Limitações conhecidas (v1)

- Uma busca por vez (fila sequencial, sem paralelismo de navegadores).
- Email e redes sociais só são encontrados se a própria empresa os publica no site.
- Alguns sites (principalmente feitos em construtores de site) deixam um e-mail de exemplo no
  template (ex: `exemplo@meusite.com`) — vale conferir manualmente antes de usar o contato.
- Seletores do Maps podem quebrar com atualizações do Google (ver aviso acima).

## Estrutura do projeto

```
server/
  index.js            Express app (API + serve o frontend estático)
  db.js               SQLite (node:sqlite) — schema de searches e leads
  routes/              search.js, leads.js
  scraper/
    mapsScraper.js      navega o Google Maps e extrai os dados de cada lead
    enrichSite.js         visita o site do lead e extrai email/redes sociais
  jobs/
    searchJob.js           fila em memória que processa uma busca por vez
public/               frontend (HTML/CSS/JS puro, sem build step)
data/                 banco SQLite local (criado em runtime, ignorado no git)
```
