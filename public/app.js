const QUALIFICATION_LABELS = {
  nao_avaliado: 'Não avaliado',
  qualificado: 'Qualificado',
  descartado: 'Descartado',
};

const STATUS_ORDER = ['nao_contatado', 'contatado', 'sem_resposta', 'em_negociacao', 'fechado', 'perdido'];
const STATUS_LABELS = {
  nao_contatado: 'Não contatado',
  contatado: 'Contatado',
  sem_resposta: 'Sem resposta',
  em_negociacao: 'Em negociação',
  fechado: 'Fechado',
  perdido: 'Perdido',
};

const state = { site: 'all', q: '', qualification: '', status: '', niche: '' };
let currentTab = 'buscar';
let pollTimer = null;

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
  if (tab === 'funil') fetchKanban();
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.site === 'com') params.set('has_website', 'true');
  if (state.site === 'sem') params.set('has_website', 'false');
  if (state.qualification) params.set('qualification', state.qualification);
  if (state.status) params.set('status', state.status);
  if (state.niche) params.set('niche', state.niche);
  if (state.q) params.set('q', state.q);
  return params;
}

async function loadNicheOptions() {
  const select = document.getElementById('filter-niche');
  const res = await fetch('/api/leads/niches');
  const niches = await res.json();
  const current = select.value;
  select.innerHTML = '<option value="">Nicho (todos)</option>' +
    niches.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (niches.includes(current)) select.value = current;
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

  return `
    <tr data-id="${lead.id}">
      <td>
        <div class="lead-name">${esc(lead.name)}</div>
        <div class="lead-address">${esc(lead.address || '')}</div>
      </td>
      <td>
        ${esc(lead.category || '-')}
        ${lead.niche ? `<div class="lead-address">via "${esc(lead.niche)}"</div>` : ''}
      </td>
      <td>
        ${lead.phone
          ? `<span class="contact-line"><a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a></span>`
          : '<span class="contact-line muted">Sem telefone</span>'}
        ${lead.email
          ? `<span class="contact-line"><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></span>`
          : ''}
      </td>
      <td>
        ${siteLine}
        <div class="social-badges">${social.join('')}</div>
      </td>
      <td>${lead.rating ? `${lead.rating} ★ (${lead.reviews_count || 0})` : '-'}</td>
      <td>
        <select class="qualification-select ${lead.qualification}" data-field="qualification">
          ${qualificationOptions(lead.qualification)}
        </select>
      </td>
      <td>
        <select class="status-select" data-field="status">
          ${statusOptions(lead.status)}
        </select>
      </td>
      <td><textarea class="notes-input" data-field="notes" placeholder="Notas...">${esc(lead.notes || '')}</textarea></td>
      <td><button class="delete-btn" data-action="delete">Excluir</button></td>
    </tr>
  `;
}

function renderLeads(leads) {
  const tbody = document.getElementById('leads-tbody');
  const empty = document.getElementById('leads-empty');
  if (leads.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = leads.map(leadRow).join('');
}

async function fetchLeads() {
  const params = buildQuery();
  const res = await fetch(`/api/leads?${params.toString()}`);
  const leads = await res.json();
  renderLeads(leads);
  document.getElementById('export-csv').href = `/api/leads/export?${params.toString()}`;
}

function kanbanCard(lead) {
  return `
    <div class="kanban-card" data-id="${lead.id}">
      <div class="card-name">${esc(lead.name)}</div>
      <div class="card-meta">${esc(lead.category || '')}${lead.phone ? ' · ' + esc(lead.phone) : ''}</div>
      <select data-field="status">${statusOptions(lead.status)}</select>
    </div>
  `;
}

function renderKanban(leads) {
  const kanban = document.getElementById('kanban');
  kanban.innerHTML = STATUS_ORDER.map((status) => {
    const items = leads.filter((l) => l.status === status);
    return `
      <div class="kanban-column">
        <h3>${STATUS_LABELS[status]} <span>${items.length}</span></h3>
        ${items.map(kanbanCard).join('')}
      </div>
    `;
  }).join('');
}

async function fetchKanban() {
  const res = await fetch('/api/leads');
  const leads = await res.json();
  renderKanban(leads);
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

document.addEventListener('DOMContentLoaded', () => {
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
      state.site = btn.dataset.site;
      fetchLeads();
    });
  });

  document.getElementById('filter-qualification').addEventListener('change', (e) => {
    state.qualification = e.target.value;
    fetchLeads();
  });
  document.getElementById('filter-niche').addEventListener('change', (e) => {
    state.niche = e.target.value;
    fetchLeads();
  });
  document.getElementById('filter-status').addEventListener('change', (e) => {
    state.status = e.target.value;
    fetchLeads();
  });

  let qDebounce;
  document.getElementById('filter-q').addEventListener('input', (e) => {
    clearTimeout(qDebounce);
    qDebounce = setTimeout(() => {
      state.q = e.target.value.trim();
      fetchLeads();
    }, 350);
  });

  document.getElementById('refresh-leads').addEventListener('click', fetchLeads);

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

  const tbody = document.getElementById('leads-tbody');
  tbody.addEventListener('change', async (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const tr = e.target.closest('tr');
    const id = tr.dataset.id;
    const value = e.target.value;
    try {
      await patchLead(id, { [field]: value });
      if (field === 'qualification') {
        e.target.className = `qualification-select ${value}`;
      }
    } catch (err) {
      console.error('Erro ao salvar lead:', err.message);
      e.target.style.outline = '2px solid var(--danger)';
      setTimeout(() => { e.target.style.outline = ''; }, 2000);
    }
  });

  tbody.addEventListener('click', async (e) => {
    if (e.target.dataset.action === 'delete') {
      const tr = e.target.closest('tr');
      if (confirm('Excluir este lead?')) {
        await fetch(`/api/leads/${tr.dataset.id}`, { method: 'DELETE' });
        tr.remove();
      }
    }
  });

  document.getElementById('kanban').addEventListener('change', async (e) => {
    if (e.target.dataset.field !== 'status') return;
    const card = e.target.closest('.kanban-card');
    await patchLead(card.dataset.id, { status: e.target.value });
    fetchKanban();
  });
});
