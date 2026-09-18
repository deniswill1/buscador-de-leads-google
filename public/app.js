const QUALIFICATION_LABELS = {
  nao_avaliado: 'Não avaliado',
  qualificado: 'Qualificado',
  descartado: 'Descartado',
};

const STATUS_ORDER = ['nao_contatado', 'potencial', 'contatado', 'sem_resposta', 'em_negociacao', 'fechado', 'perdido'];
const STATUS_LABELS = {
  nao_contatado: 'Não contatado',
  potencial: 'Potencial',
  contatado: 'Contatado',
  sem_resposta: 'Sem resposta',
  em_negociacao: 'Em negociação',
  fechado: 'Fechado',
  perdido: 'Perdido',
};

// Cada aba guarda seu próprio nicho em foco (e filtros, no caso da aba Leads),
// separado e persistido individualmente — trocar de nicho no Funil não deve
// bagunçar o que você estava filtrando na aba Leads, e vice-versa.
const leadsState = {
  site: 'all', q: '', qualification: '', status: '',
  niche: localStorage.getItem('leadsNiche') || '',
};
const funilState = {
  niche: localStorage.getItem('funilNiche') || '',
  instagramOnly: localStorage.getItem('funilInstagramOnly') === 'true',
};

let currentTab = 'buscar';
let pollTimer = null;
let nicheCounts = []; // [{ niche, count }]
let leadsById = {}; // cache do último snapshot conhecido de cada lead, pra abrir o painel lateral sem precisar refazer a busca
let drawerLeadId = null;

const NICHE_COLORS = [
  '#2f6fed', '#c9581a', '#1a9e5c', '#a4318f', '#c98a1a',
  '#1a8fc9', '#8a3fd6', '#d64545', '#3f9e1a', '#0f766e',
];

function nicheColor(niche) {
  if (!niche) return 'var(--primary)';
  let hash = 0;
  for (let i = 0; i < niche.length; i++) hash = (hash * 31 + niche.charCodeAt(i)) >>> 0;
  return NICHE_COLORS[hash % NICHE_COLORS.length];
}

// Cada etapa do funil tem sua própria cor semântica (definida em styles.css),
// separada da cor de nicho — assim dá pra ler o estágio do lead de longe,
// tanto no select da tabela quanto no card do kanban.
const STATUS_COLOR_VARS = {
  nao_contatado: ['--neutral-status', '--neutral-status-soft'],
  potencial: ['--potential-status', '--potential-status-soft'],
  contatado: ['--info-status', '--info-status-soft'],
  sem_resposta: ['--warning-status', '--warning-status-soft'],
  em_negociacao: ['--progress-status', '--progress-status-soft'],
  fechado: ['--success-status', '--success-status-soft'],
  perdido: ['--danger-status', '--danger-status-soft'],
};

function statusStyle(status) {
  const [color, soft] = STATUS_COLOR_VARS[status] || STATUS_COLOR_VARS.nao_contatado;
  return `border-color: var(${color}); color: var(${color}); background: var(${soft});`;
}

const ICONS = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.4c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/></svg>',
};

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function shortenUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (err) {
    return url;
  }
}

function qualificationOptions(current) {
  return Object.entries(QUALIFICATION_LABELS)
    .map(([value, label]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function statusOptions(current) {
  return STATUS_ORDER
    .map((value) => `<option value="${value}" ${value === current ? 'selected' : ''}>${STATUS_LABELS[value]}</option>`)
    .join('');
}

async function patchLead(id, body) {
  const res = await fetch(`/api/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Falha ao atualizar lead');
  return res.json();
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
  if (tab === 'leads') {
    loadNicheOptions();
    fetchLeads();
  }
  if (tab === 'funil') {
    loadNicheOptions();
    fetchKanban();
  }
}

function buildQuery() {
  const params = new URLSearchParams();
  if (leadsState.site === 'com') params.set('has_website', 'true');
  if (leadsState.site === 'sem') params.set('has_website', 'false');
  if (leadsState.qualification) params.set('qualification', leadsState.qualification);
  if (leadsState.status) params.set('status', leadsState.status);
  if (leadsState.niche) params.set('niche', leadsState.niche);
  if (leadsState.q) params.set('q', leadsState.q);
  return params;
}

function nichePillsHtml(activeNiche) {
  const total = nicheCounts.reduce((sum, n) => sum + n.count, 0);
  const allPill = `
    <button type="button" class="niche-pill ${!activeNiche ? 'active' : ''}" data-niche="" style="--pill-color: var(--primary)">
      Todos <span class="pill-count">${total}</span>
    </button>`;
  const pills = nicheCounts.map(({ niche, count }) => `
    <button type="button" class="niche-pill ${niche === activeNiche ? 'active' : ''}" data-niche="${esc(niche)}" style="--pill-color: ${nicheColor(niche)}">
      <span class="pill-dot"></span>${esc(niche)} <span class="pill-count">${count}</span>
    </button>`).join('');
  return allPill + pills;
}

function renderNichePills() {
  document.getElementById('leads-niche-pills').innerHTML = nichePillsHtml(leadsState.niche);
  document.getElementById('funil-niche-pills').innerHTML = nichePillsHtml(funilState.niche);
}

async function loadNicheOptions() {
  const res = await fetch('/api/leads/niches');
  nicheCounts = await res.json();
  const names = nicheCounts.map((n) => n.niche);
  if (leadsState.niche && !names.includes(leadsState.niche)) leadsState.niche = '';
  if (funilState.niche && !names.includes(funilState.niche)) funilState.niche = '';
  renderNichePills();
}

function leadRow(lead) {
  const social = [];
  if (lead.instagram) social.push(`<a class="badge" href="${esc(lead.instagram)}" target="_blank" rel="noopener">IG</a>`);
  if (lead.facebook) social.push(`<a class="badge" href="${esc(lead.facebook)}" target="_blank" rel="noopener">FB</a>`);
  if (lead.linkedin) social.push(`<a class="badge" href="${esc(lead.linkedin)}" target="_blank" rel="noopener">in</a>`);
  if (lead.tiktok) social.push(`<a class="badge" href="${esc(lead.tiktok)}" target="_blank" rel="noopener">TT</a>`);
  if (lead.whatsapp) social.push(`<a class="badge" href="${esc(lead.whatsapp)}" target="_blank" rel="noopener">WA</a>`);

  // Se não tem site próprio mas tem alguma rede social, mostra só os links das redes
  // (sem repetir "Sem site" — os badges abaixo já deixam isso implícito).
  const siteLine = lead.website
    ? `<a href="${esc(lead.website)}" target="_blank" rel="noopener">${esc(shortenUrl(lead.website))}</a>`
    : social.length > 0
      ? ''
      : '<span class="muted">Sem site</span>';

  const color = nicheColor(lead.niche);

  return `
    <article class="lead-card" data-id="${lead.id}" style="--pill-color: ${color}">
      <div class="lead-card-head">
        <div>
          <div class="lead-name">
            ${lead.niche ? `<span class="niche-dot" style="--pill-color: ${color}" title="${esc(lead.niche)}"></span>` : ''}
            ${esc(lead.name)}
          </div>
          <div class="lead-address">${esc(lead.address || '')}</div>
          <div class="lead-via">${esc(lead.category || '-')}${lead.niche ? ` · via "${esc(lead.niche)}"` : ''}</div>
        </div>
        <button class="delete-btn" data-action="delete" aria-label="Excluir lead" title="Excluir lead">${ICONS.trash}</button>
      </div>

      <div class="lead-fields">
        <div>
          <span class="lead-field-label">Contato</span>
          ${lead.phone
            ? `<span class="contact-line"><a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a></span>`
            : '<span class="contact-line muted">Sem telefone</span>'}
          ${lead.email
            ? `<span class="contact-line"><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></span>`
            : ''}
        </div>
        <div>
          <span class="lead-field-label">Site / Redes</span>
          ${siteLine}
          <div class="social-badges">${social.join('')}</div>
        </div>
        <div>
          <span class="lead-field-label">Avaliação</span>
          ${lead.rating ? `${lead.rating} ★ (${lead.reviews_count || 0})` : '<span class="muted">-</span>'}
        </div>
      </div>

      <div class="lead-card-controls">
        <select class="qualification-select ${lead.qualification}" data-field="qualification">
          ${qualificationOptions(lead.qualification)}
        </select>
        <select class="status-select" data-field="status" style="${statusStyle(lead.status)}">
          ${statusOptions(lead.status)}
        </select>
      </div>

      <textarea class="notes-input" data-field="notes" placeholder="Notas...">${esc(lead.notes || '')}</textarea>
    </article>
  `;
}

function renderLeads(leads) {
  leads.forEach((lead) => { leadsById[lead.id] = lead; });
  const tbody = document.getElementById('leads-tbody');
  const empty = document.getElementById('leads-empty');
  if (leads.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = leads.map(leadRow).join('');
  document.getElementById('leads-summary').textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'} nesta visão`;
}

async function fetchLeads() {
  const params = buildQuery();
  const res = await fetch(`/api/leads?${params.toString()}`);
  const leads = await res.json();
  renderLeads(leads);
  document.getElementById('export-csv').href = `/api/leads/export?${params.toString()}`;
}

function kanbanCard(lead) {
  const color = nicheColor(lead.niche);
  return `
    <div class="kanban-card" draggable="true" data-id="${lead.id}" style="--pill-color: ${color}">
      <div class="card-name">${esc(lead.name)}</div>
      <div class="card-meta">
        ${!funilState.niche && lead.niche ? `<span class="niche-dot" style="--pill-color: ${color}" title="${esc(lead.niche)}"></span>` : ''}
        ${esc(lead.category || '')}${lead.phone ? ' · ' + esc(lead.phone) : ''}
      </div>
      <select data-field="status" style="${statusStyle(lead.status)}">${statusOptions(lead.status)}</select>
    </div>
  `;
}

function renderKanban(leads) {
  leads.forEach((lead) => { leadsById[lead.id] = lead; });
  const kanban = document.getElementById('kanban');
  let activeLeads = funilState.niche ? leads.filter((lead) => lead.niche === funilState.niche) : leads;
  if (funilState.instagramOnly) activeLeads = activeLeads.filter((lead) => !!lead.instagram);
  const qualified = activeLeads.filter((lead) => lead.qualification === 'qualificado').length;
  document.getElementById('funnel-summary').textContent = `${activeLeads.length} leads · ${qualified} qualificado${qualified === 1 ? '' : 's'}`;
  kanban.innerHTML = STATUS_ORDER.map((status) => {
    const items = activeLeads.filter((l) => l.status === status);
    const [colorVar] = STATUS_COLOR_VARS[status];
    return `
      <div class="kanban-column" data-status="${status}" style="--status-color: var(${colorVar})">
        <h3>${STATUS_LABELS[status]} <span>${items.length}</span></h3>
        <div class="kanban-dropzone">${items.map(kanbanCard).join('')}</div>
      </div>
    `;
  }).join('');
}

async function fetchKanban() {
  const params = new URLSearchParams();
  if (funilState.niche) params.set('niche', funilState.niche);
  const res = await fetch(`/api/leads?${params.toString()}`);
  const leads = await res.json();
  renderKanban(leads);
}

// Painel lateral do negócio: aberto ao clicar num card do funil, pra ver e
// editar tudo sobre aquele lead (contato, redes, qualificação, status,
// notas) sem sair da visão do quadro.
function drawerContentHtml(lead) {
  const social = [];
  if (lead.instagram) social.push(`<a class="badge" href="${esc(lead.instagram)}" target="_blank" rel="noopener">IG</a>`);
  if (lead.facebook) social.push(`<a class="badge" href="${esc(lead.facebook)}" target="_blank" rel="noopener">FB</a>`);
  if (lead.linkedin) social.push(`<a class="badge" href="${esc(lead.linkedin)}" target="_blank" rel="noopener">in</a>`);
  if (lead.tiktok) social.push(`<a class="badge" href="${esc(lead.tiktok)}" target="_blank" rel="noopener">TT</a>`);
  if (lead.whatsapp) social.push(`<a class="badge" href="${esc(lead.whatsapp)}" target="_blank" rel="noopener">WA</a>`);

  const color = nicheColor(lead.niche);

  const actions = [];
  if (lead.phone) actions.push(`<a class="drawer-action" href="tel:${esc(lead.phone)}">${ICONS.phone} Ligar</a>`);
  if (lead.whatsapp) actions.push(`<a class="drawer-action" href="${esc(lead.whatsapp)}" target="_blank" rel="noopener">${ICONS.chat} WhatsApp</a>`);
  if (lead.email) actions.push(`<a class="drawer-action" href="mailto:${esc(lead.email)}">${ICONS.mail} E-mail</a>`);
  if (lead.website) actions.push(`<a class="drawer-action" href="${esc(lead.website)}" target="_blank" rel="noopener">${ICONS.globe} Site</a>`);

  return `
    <div class="drawer-head">
      <div>
        <div class="lead-name">
          ${lead.niche ? `<span class="niche-dot" style="--pill-color: ${color}" title="${esc(lead.niche)}"></span>` : ''}
          ${esc(lead.name)}
        </div>
        <div class="lead-address">${esc(lead.address || '')}</div>
        <div class="lead-via">${esc(lead.category || '-')}${lead.niche ? ` · via "${esc(lead.niche)}"` : ''}</div>
      </div>
      <button type="button" class="drawer-close" id="lead-drawer-close" aria-label="Fechar">${ICONS.close}</button>
    </div>

    <div class="drawer-body">
      ${actions.length ? `<div class="drawer-actions">${actions.join('')}</div>` : ''}

      <div class="drawer-section">
        <span class="lead-field-label">Contato</span>
        ${lead.phone
          ? `<span class="contact-line"><a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a></span>`
          : '<span class="contact-line muted">Sem telefone</span>'}
        ${lead.email
          ? `<span class="contact-line"><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></span>`
          : ''}
      </div>

      <div class="drawer-section">
        <span class="lead-field-label">Site / Redes</span>
        ${lead.website
          ? `<a href="${esc(lead.website)}" target="_blank" rel="noopener">${esc(shortenUrl(lead.website))}</a>`
          : '<span class="muted">Sem site</span>'}
        ${social.length ? `<div class="social-badges">${social.join('')}</div>` : ''}
      </div>

      <div class="drawer-section">
        <span class="lead-field-label">Avaliação</span>
        ${lead.rating ? `${lead.rating} ★ (${lead.reviews_count || 0} avaliações)` : '<span class="muted">Sem avaliações</span>'}
      </div>

      <div class="drawer-section">
        <span class="lead-field-label">Qualificação e status</span>
        <div class="drawer-controls">
          <select class="qualification-select ${lead.qualification}" data-field="qualification">
            ${qualificationOptions(lead.qualification)}
          </select>
          <select class="status-select" data-field="status" style="${statusStyle(lead.status)}">
            ${statusOptions(lead.status)}
          </select>
        </div>
      </div>

      <div class="drawer-section">
        <span class="lead-field-label">Notas</span>
        <textarea class="notes-input" data-field="notes" placeholder="Notas...">${esc(lead.notes || '')}</textarea>
      </div>

      <div class="drawer-footer">
        <button type="button" class="delete-btn" data-action="delete">${ICONS.trash} Excluir lead</button>
      </div>
    </div>
  `;
}

function openLeadDrawer(lead) {
  drawerLeadId = lead.id;
  document.getElementById('lead-drawer-content').innerHTML = drawerContentHtml(lead);
  document.getElementById('lead-drawer').classList.add('open');
  document.getElementById('lead-drawer').setAttribute('aria-hidden', 'false');
  document.getElementById('lead-drawer-backdrop').classList.add('open');
}

function closeLeadDrawer() {
  drawerLeadId = null;
  document.getElementById('lead-drawer').classList.remove('open');
  document.getElementById('lead-drawer').setAttribute('aria-hidden', 'true');
  document.getElementById('lead-drawer-backdrop').classList.remove('open');
}

function pollStatus(searchId, submitBtn, progressFill, progressText) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const res = await fetch(`/api/search/${searchId}/status`);
    const data = await res.json();
    const pct = data.total ? Math.min(100, Math.round((data.processed / data.total) * 100)) : 0;
    progressFill.style.width = `${pct}%`;

    if (data.status === 'running') {
      progressText.textContent = `Buscando "${data.niche}" em "${data.location}"... ${data.processed}/${data.total} processados`;
    } else if (data.status === 'done') {
      progressText.textContent = `Concluído! ${data.processed} leads novos encontrados (leads já coletados antes são pulados automaticamente).`;
      clearInterval(pollTimer);
      submitBtn.disabled = false;
      if (currentTab === 'leads') {
        loadNicheOptions();
        fetchLeads();
      }
    } else if (data.status === 'error') {
      progressText.textContent = `Erro na busca: ${data.error || 'desconhecido'}`;
      clearInterval(pollTimer);
      submitBtn.disabled = false;
    }
  }, 1500);
}

// Tema claro/escuro: respeita a preferência do sistema por padrão, mas o
// usuário pode fixar uma escolha manual (persistida) que sobrepõe o sistema.
function effectiveTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit) return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function renderThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = effectiveTheme() === 'dark';
  btn.innerHTML = isDark ? ICONS.sun : ICONS.moon;
  btn.setAttribute('aria-label', isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro');
  btn.title = btn.getAttribute('aria-label');
}

function setupThemeToggle() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  renderThemeToggle();

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    renderThemeToggle();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem('theme')) renderThemeToggle();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupThemeToggle();

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const searchForm = document.getElementById('search-form');
  const submitBtn = document.getElementById('search-submit');
  const progressWrap = document.getElementById('search-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const niche = document.getElementById('niche').value.trim();
    const location = document.getElementById('location').value.trim();
    const quantity = document.getElementById('quantity').value;

    submitBtn.disabled = true;
    progressWrap.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = 'Iniciando busca... uma janela do navegador vai abrir.';

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, location, quantity }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao iniciar busca');
      }
      const { searchId } = await res.json();
      pollStatus(searchId, submitBtn, progressFill, progressText);
    } catch (err) {
      progressText.textContent = `Erro: ${err.message}`;
      submitBtn.disabled = false;
    }
  });

  document.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      leadsState.site = btn.dataset.site;
      fetchLeads();
    });
  });

  document.getElementById('filter-qualification').addEventListener('change', (e) => {
    leadsState.qualification = e.target.value;
    fetchLeads();
  });
  document.getElementById('filter-status').addEventListener('change', (e) => {
    leadsState.status = e.target.value;
    fetchLeads();
  });

  let qDebounce;
  document.getElementById('filter-q').addEventListener('input', (e) => {
    clearTimeout(qDebounce);
    qDebounce = setTimeout(() => {
      leadsState.q = e.target.value.trim();
      fetchLeads();
    }, 350);
  });

  document.getElementById('refresh-leads').addEventListener('click', fetchLeads);

  // Os chips de nicho de cada aba são independentes: trocar o nicho em foco
  // no Funil não mexe no que está sendo filtrado na aba Leads, e vice-versa.
  document.getElementById('leads-niche-pills').addEventListener('click', (e) => {
    const pill = e.target.closest('.niche-pill');
    if (!pill) return;
    leadsState.niche = pill.dataset.niche;
    localStorage.setItem('leadsNiche', leadsState.niche);
    renderNichePills();
    fetchLeads();
  });

  document.getElementById('funil-niche-pills').addEventListener('click', (e) => {
    const pill = e.target.closest('.niche-pill');
    if (!pill) return;
    funilState.niche = pill.dataset.niche;
    localStorage.setItem('funilNiche', funilState.niche);
    renderNichePills();
    fetchKanban();
  });

  const instagramFilterBtn = document.getElementById('funil-instagram-filter');
  instagramFilterBtn.setAttribute('aria-pressed', String(funilState.instagramOnly));
  instagramFilterBtn.addEventListener('click', () => {
    funilState.instagramOnly = !funilState.instagramOnly;
    localStorage.setItem('funilInstagramOnly', String(funilState.instagramOnly));
    instagramFilterBtn.setAttribute('aria-pressed', String(funilState.instagramOnly));
    fetchKanban();
  });

  const importInput = document.getElementById('import-backup-input');
  const importStatus = document.getElementById('import-status');

  function showImportStatus(message, isError) {
    importStatus.textContent = message;
    importStatus.classList.remove('hidden');
    importStatus.style.color = isError ? 'var(--danger)' : '';
  }

  document.getElementById('import-backup-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao importar backup');
      }
      const result = await res.json();
      showImportStatus(
        `Importação concluída: ${result.inserted} novos, ${result.updated} atualizados` +
        (result.skipped ? `, ${result.skipped} ignorados (sem link do Maps ou nome)` : '') + '.',
        false
      );
      loadNicheOptions();
      fetchLeads();
    } catch (err) {
      showImportStatus(`Erro ao importar backup: ${err.message}`, true);
    } finally {
      importInput.value = '';
    }
  });

  const saveGitBtn = document.getElementById('save-git-btn');
  saveGitBtn.addEventListener('click', async () => {
    const originalHTML = saveGitBtn.innerHTML;
    saveGitBtn.disabled = true;
    saveGitBtn.textContent = 'Salvando...';
    try {
      const res = await fetch('/api/leads/save-git', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Falha ao salvar no Git');
      showImportStatus(
        result.committed
          ? `Commit feito: "${result.message}" (${result.hash}).`
          : result.message,
        false
      );
    } catch (err) {
      showImportStatus(`Erro ao salvar no Git: ${err.message}`, true);
    } finally {
      saveGitBtn.disabled = false;
      saveGitBtn.innerHTML = originalHTML;
    }
  });

  const tbody = document.getElementById('leads-tbody');
  tbody.addEventListener('change', async (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const card = e.target.closest('.lead-card');
    const id = card.dataset.id;
    const value = e.target.value;
    try {
      await patchLead(id, { [field]: value });
      if (field === 'qualification') {
        e.target.className = `qualification-select ${value}`;
      }
      if (field === 'status') {
        e.target.setAttribute('style', statusStyle(value));
      }
    } catch (err) {
      console.error('Erro ao salvar lead:', err.message);
      e.target.style.outline = '2px solid var(--danger)';
      setTimeout(() => { e.target.style.outline = ''; }, 2000);
    }
  });

  tbody.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="delete"]')) {
      const card = e.target.closest('.lead-card');
      if (confirm('Excluir este lead?')) {
        await fetch(`/api/leads/${card.dataset.id}`, { method: 'DELETE' });
        card.remove();
      }
    }
  });

  const kanban = document.getElementById('kanban');

  kanban.addEventListener('change', async (e) => {
    if (e.target.dataset.field !== 'status') return;
    const card = e.target.closest('.kanban-card');
    await patchLead(card.dataset.id, { status: e.target.value });
    fetchKanban();
  });

  // Clicar no card (fora do select de status) abre o painel lateral com
  // todas as informações do negócio.
  kanban.addEventListener('click', (e) => {
    if (e.target.closest('select')) return;
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    const lead = leadsById[card.dataset.id];
    if (lead) openLeadDrawer(lead);
  });

  let draggedId = null;

  kanban.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    draggedId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  kanban.addEventListener('dragend', (e) => {
    const card = e.target.closest('.kanban-card');
    if (card) card.classList.remove('dragging');
    kanban.querySelectorAll('.kanban-column.drag-over').forEach((col) => col.classList.remove('drag-over'));
  });

  kanban.addEventListener('dragover', (e) => {
    const column = e.target.closest('.kanban-column');
    if (!column) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    kanban.querySelectorAll('.kanban-column.drag-over').forEach((col) => col.classList.remove('drag-over'));
    column.classList.add('drag-over');
  });

  kanban.addEventListener('drop', async (e) => {
    const column = e.target.closest('.kanban-column');
    if (!column || !draggedId) return;
    e.preventDefault();
    column.classList.remove('drag-over');
    const status = column.dataset.status;
    await patchLead(draggedId, { status });
    draggedId = null;
    fetchKanban();
  });

  const drawer = document.getElementById('lead-drawer');
  const drawerBackdrop = document.getElementById('lead-drawer-backdrop');

  drawerBackdrop.addEventListener('click', closeLeadDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeLeadDrawer();
  });

  drawer.addEventListener('click', async (e) => {
    if (e.target.closest('#lead-drawer-close')) {
      closeLeadDrawer();
      return;
    }
    if (e.target.closest('[data-action="delete"]')) {
      if (!drawerLeadId) return;
      if (confirm('Excluir este lead?')) {
        await fetch(`/api/leads/${drawerLeadId}`, { method: 'DELETE' });
        delete leadsById[drawerLeadId];
        closeLeadDrawer();
        if (currentTab === 'funil') fetchKanban();
        if (currentTab === 'leads') fetchLeads();
      }
    }
  });

  drawer.addEventListener('change', async (e) => {
    const field = e.target.dataset.field;
    if (!field || !drawerLeadId) return;
    const value = e.target.value;
    try {
      await patchLead(drawerLeadId, { [field]: value });
      leadsById[drawerLeadId][field] = value;
      if (field === 'qualification') {
        e.target.className = `qualification-select ${value}`;
      }
      if (field === 'status') {
        e.target.setAttribute('style', statusStyle(value));
      }
      if (currentTab === 'funil') fetchKanban();
      if (currentTab === 'leads') fetchLeads();
    } catch (err) {
      console.error('Erro ao salvar lead:', err.message);
      e.target.style.outline = '2px solid var(--danger)';
      setTimeout(() => { e.target.style.outline = ''; }, 2000);
    }
  });

  loadNicheOptions();
});
