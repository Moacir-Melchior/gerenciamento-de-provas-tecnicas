/* Carmak · Painel de Provas
 * Dados oficiais: data/provas.json (versionado no GitHub).
 * Registros novos (manuais ou importados de JSON) ficam no navegador (localStorage)
 * até serem publicados.
 * Perfis: cada colaborador tem UM perfil, identificado pelo nome normalizado
 * (sem acento, sem diferença de maiúsculas/minúsculas, espaços colapsados). */
(function () {
  'use strict';

  const NOTA_MINIMA = 7;
  const TIPOS = [
    { id: 'Técnico Elétrica 1', grupo: 'eletrica', cor: '#f2b705' },
    { id: 'Técnico Elétrica 2', grupo: 'eletrica', cor: '#d99a00' },
    { id: 'Técnico Elétrica 3', grupo: 'eletrica', cor: '#b87f00' },
    { id: 'Técnico Combustão 1', grupo: 'combustao', cor: '#f08a3c' },
    { id: 'Técnico Combustão 2', grupo: 'combustao', cor: '#e8731c' },
    { id: 'Técnico Combustão 3', grupo: 'combustao', cor: '#c85d10' },
    { id: 'Auxiliar Mecânico 2', grupo: 'mecanico', cor: '#96c957' },
    { id: 'Auxiliar Mecânico 3', grupo: 'mecanico', cor: '#5fa043' }
  ];
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  // SHA-256 de "usuário(minúsculo):senha"
  const ADMIN_HASH = '489b0e5a8a2f058df131a1cdf7531ba2f638f17552bedca8c6b82a42a05e546f';

  const LS_LOCAL = 'carmak_provas_locais';
  const LS_GH = 'carmak_github_cfg';
  const SS_AUTH = 'carmak_admin_ok';

  const $ = function (s) { return document.querySelector(s); };
  const state = { repo: [], local: [], removed: [], mod: {} };
  let pendingImport = null;

  /* ---------- utilidades ---------- */
  function fmtNota(n) { return n.toFixed(1).replace('.', ','); }
  function fmtData(iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function cleanNome(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b.nota; }, 0) / arr.length : null; }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 3600);
  }
  function parseData(str) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str.trim());
    if (!m) return null;
    return validaData(+m[3], +m[2], +m[1]);
  }
  function validaData(y, mo, d) {
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return String(y) + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function parseNota(str) {
    const m = /^(\d{1,2})(?:,(\d))?$/.exec(str.trim());
    if (!m) return null;
    const n = parseFloat(m[1] + '.' + (m[2] || '0'));
    return n >= 0 && n <= 10 ? n : null;
  }
  function keyOf(p) { return slug(p.nome) + '|' + p.tipo + '|' + p.data; }
  function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* PDFs: pdfs/<perfil>/<tipo>/<aaaa-mm-dd>.pdf */
  function pdfPath(p) { return 'pdfs/' + slug(p.nome) + '/' + slug(p.tipo) + '/' + p.data + '.pdf'; }

  /* ---------- dados ---------- */
  function all() {
    const gone = new Set(state.removed);
    const map = new Map();
    state.repo.concat(state.local).forEach(function (p) { if (!gone.has(p.id)) map.set(p.id, p); });
    const canon = new Map();
    const list = [];
    map.forEach(function (p) {
      const q = Object.assign({}, p, state.mod[p.id] || {});
      q.perfil = slug(q.nome);
      if (!q.perfil) return;
      if (!canon.has(q.perfil)) canon.set(q.perfil, cleanNome(q.nome));
      list.push(q);
    });
    list.forEach(function (q) { q.nome = canon.get(q.perfil); });
    return list;
  }
  // um perfil por pessoa, com todas as provas
  function perfis() {
    const m = new Map();
    all().forEach(function (p) {
      if (!m.has(p.perfil)) m.set(p.perfil, { id: p.perfil, nome: p.nome, provas: [] });
      m.get(p.perfil).provas.push(p);
    });
    const list = Array.from(m.values());
    list.forEach(function (g) { g.provas.sort(function (a, b) { return b.data.localeCompare(a.data); }); });
    list.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    return list;
  }
  function loadLocal() {
    try {
      const o = JSON.parse(localStorage.getItem(LS_LOCAL) || '{}');
      state.local = o.add || []; state.removed = o.del || []; state.mod = o.mod || {};
    } catch (e) { state.local = []; state.removed = []; state.mod = {}; }
  }
  function saveLocal() {
    try { localStorage.setItem(LS_LOCAL, JSON.stringify({ add: state.local, del: state.removed, mod: state.mod })); } catch (e) { /* ignore */ }
  }
  async function loadRepo() {
    try {
      const r = await fetch('data/provas.json?v=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      state.repo = Array.isArray(j) ? j : [];
    } catch (e) { state.repo = []; }
  }

  /* ---------- navegação ---------- */
  const sidebar = $('#sidebar'), overlay = $('#overlay'), menuBtn = $('#menuBtn');
  function toggleMenu(open) {
    const o = open === undefined ? !sidebar.classList.contains('open') : open;
    sidebar.classList.toggle('open', o); overlay.classList.toggle('show', o);
    menuBtn.setAttribute('aria-expanded', String(o));
  }
  menuBtn.addEventListener('click', function () { toggleMenu(); });
  overlay.addEventListener('click', function () { toggleMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleMenu(false); });

  function route() {
    const raw = (location.hash || '#inicio').slice(1);
    let name = raw, perfilId = null;
    if (raw.indexOf('perfil/') === 0) { name = 'perfis'; perfilId = decodeURIComponent(raw.slice(7)); }
    if (['inicio', 'graficos', 'perfis', 'administracao'].indexOf(name) < 0) name = 'inicio';
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + name; });
    document.querySelectorAll('.sidebar a').forEach(function (a) { a.classList.toggle('active', a.dataset.route === name); });
    toggleMenu(false);
    window.scrollTo(0, 0);
    if (name === 'inicio') renderInicio();
    if (name === 'graficos') renderGraficos();
    if (name === 'perfis') renderPerfis(perfilId);
    if (name === 'administracao') renderAdmin();
  }
  window.addEventListener('hashchange', route);
  function rerender() { route(); }

  /* ---------- INÍCIO ---------- */
  function renderInicio() {
    const d = all();
    const total = d.length;
    const aprov = d.filter(function (p) { return p.nota >= NOTA_MINIMA; }).length;
    const reprov = total - aprov;
    const m = avg(d);
    $('#kpiMedia').textContent = m == null ? '–' : fmtNota(m);
    $('#kpiTotal').textContent = total + (total === 1 ? ' prova corrigida' : ' provas corrigidas');
    $('#kpiAprov').textContent = aprov;
    $('#kpiReprov').textContent = reprov;
    $('#kpiAprovPct').textContent = total ? Math.round(aprov / total * 100) + '% do total' : '';
    $('#kpiReprovPct').textContent = total ? Math.round(reprov / total * 100) + '% do total' : '';

    $('#tipoCards').innerHTML = TIPOS.map(function (t) {
      const arr = d.filter(function (p) { return p.tipo === t.id; });
      const mm = avg(arr);
      return '<div class="tipo-card ' + t.grupo + '"><h4>' + esc(t.id) + '</h4>' +
        '<div class="media">' + (mm == null ? '–' : fmtNota(mm)) + '</div>' +
        '<div class="meta">' + (arr.length ? 'Média de ' + arr.length + (arr.length === 1 ? ' prova' : ' provas') : 'Nenhuma prova registrada') + '</div></div>';
    }).join('');
  }

  /* ---------- GRÁFICOS ---------- */
  function fillSelect(sel, opts, keep) {
    const cur = keep ? sel.value : null;
    sel.innerHTML = opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('');
    if (cur && opts.some(function (o) { return o[0] === cur; })) sel.value = cur;
  }
  function anosDisponiveis() {
    const set = new Set(all().map(function (p) { return p.data.slice(0, 4); }));
    set.add(String(new Date().getFullYear()));
    return Array.from(set).sort().reverse();
  }
  function mesesOpts() {
    return [['', 'Todos os meses']].concat(MESES.map(function (m, i) { return [String(i + 1).padStart(2, '0'), m]; }));
  }
  function anosOpts() { return [['', 'Todos os anos']].concat(anosDisponiveis().map(function (a) { return [a, a]; })); }
  function filtraPeriodo(d, ano, mes) {
    return d.filter(function (p) { return (!ano || p.data.slice(0, 4) === ano) && (!mes || p.data.slice(5, 7) === mes); });
  }

  function drawArea() {
    const d = all();
    const items = TIPOS.map(function (t) {
      const arr = d.filter(function (p) { return p.tipo === t.id; });
      return { label: t.id, value: avg(arr), n: arr.length };
    });
    if (!d.length) Charts3D.empty($('#areaChart'), 'Sem provas registradas ainda');
    else Charts3D.area3d($('#areaChart'), items);
  }
  function drawCols() {
    const d = filtraPeriodo(all(), $('#colAno').value, $('#colMes').value);
    const items = TIPOS.map(function (t) {
      return { label: t.id, value: d.filter(function (p) { return p.tipo === t.id; }).length, color: t.cor };
    });
    if (!d.length) Charts3D.empty($('#colChart'), 'Nenhuma prova neste período');
    else Charts3D.columns3d($('#colChart'), items);
  }
  function pill(nota) {
    return '<span class="pill ' + (nota >= NOTA_MINIMA ? 'ok' : 'bad') + '">' + (nota >= NOTA_MINIMA ? 'Aprovado' : 'Reprovado') + '</span>';
  }
  function drawList() {
    const q = norm($('#lstBusca').value), tipo = $('#lstTipo').value;
    let d = filtraPeriodo(all(), $('#lstAno').value, $('#lstMes').value);
    if (tipo) d = d.filter(function (p) { return p.tipo === tipo; });
    if (q) d = d.filter(function (p) { return norm(p.nome).indexOf(q) >= 0; });
    d.sort(function (a, b) { return b.data.localeCompare(a.data) || a.nome.localeCompare(b.nome); });
    $('#lstBody').innerHTML = d.length ? d.map(function (p) {
      return '<tr><td><a class="plink" href="#perfil/' + esc(p.perfil) + '">' + esc(p.nome) + '</a></td><td>' + esc(p.tipo) + '</td><td>' + fmtData(p.data) + '</td>' +
        '<td class="num">' + fmtNota(p.nota) + ' ' + pill(p.nota) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="muted">Nenhum resultado encontrado.</td></tr>';
    $('#lstCount').textContent = d.length + (d.length === 1 ? ' resultado' : ' resultados');
  }
  function renderGraficos() {
    fillSelect($('#colAno'), anosOpts(), true);
    fillSelect($('#colMes'), mesesOpts(), true);
    fillSelect($('#lstAno'), anosOpts(), true);
    fillSelect($('#lstMes'), mesesOpts(), true);
    fillSelect($('#lstTipo'), [['', 'Todos os tipos']].concat(TIPOS.map(function (t) { return [t.id, t.id]; })), true);
    requestAnimationFrame(function () { drawArea(); drawCols(); drawList(); });
  }
  ['#colAno', '#colMes'].forEach(function (s) { $(s).addEventListener('change', drawCols); });
  ['#lstAno', '#lstMes', '#lstTipo'].forEach(function (s) { $(s).addEventListener('change', drawList); });
  $('#lstBusca').addEventListener('input', drawList);
  let rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { if (!$('#view-graficos').hidden) { drawArea(); drawCols(); } }, 150);
  });

  /* ---------- PERFIS ---------- */
  function drawPerfisLista() {
    const q = norm($('#pfBusca').value);
    const list = perfis().filter(function (g) { return !q || norm(g.nome).indexOf(q) >= 0; });
    $('#pfGrid').innerHTML = list.length ? list.map(function (g) {
      const tipos = TIPOS.filter(function (t) { return g.provas.some(function (p) { return p.tipo === t.id; }); });
      return '<a class="perfil-card" href="#perfil/' + esc(g.id) + '"><strong>' + esc(g.nome) + '</strong>' +
        '<span>' + g.provas.length + (g.provas.length === 1 ? ' prova' : ' provas') + ' · média ' + fmtNota(avg(g.provas)) + '</span>' +
        '<span class="chips">' + tipos.map(function (t) { return '<i style="background:' + t.cor + '" title="' + esc(t.id) + '"></i>'; }).join('') + '</span></a>';
    }).join('') : '<p class="muted">Nenhum perfil encontrado.</p>';
    $('#pfCount').textContent = list.length + (list.length === 1 ? ' perfil' : ' perfis');
  }
  function renderPerfis(id) {
    const lista = $('#perfisLista'), det = $('#perfilDetalhe');
    if (!id) { lista.hidden = false; det.hidden = true; drawPerfisLista(); return; }
    lista.hidden = true; det.hidden = false;
    const g = perfis().find(function (x) { return x.id === id; });
    if (!g) {
      det.innerHTML = '<a class="back-link" href="#perfis">← Todos os perfis</a><div class="card"><div class="card-body"><p>Perfil não encontrado.</p></div></div>';
      return;
    }
    const aprov = g.provas.filter(function (p) { return p.nota >= NOTA_MINIMA; }).length;
    const admin = isAuth();
    const blocos = TIPOS.map(function (t) {
      const arr = g.provas.filter(function (p) { return p.tipo === t.id; });
      const mm = avg(arr);
      let body;
      if (!arr.length) body = '<p class="muted">Nenhuma prova registrada.</p>';
      else body = '<div class="table-wrap small"><table><thead><tr><th>Data</th><th class="num">Nota</th><th>PDF</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
        arr.map(function (p) {
          return '<tr><td>' + fmtData(p.data) + '</td><td class="num">' + fmtNota(p.nota) + ' ' + pill(p.nota) + '</td>' +
            '<td>' + (p.pdf ? '<a href="' + esc(p.pdf) + '" target="_blank" rel="noopener">abrir</a>' :
              (admin ? '<button class="link-del" data-attach="' + esc(p.id) + '">anexar PDF</button>' : '–')) + '</td>' +
            (admin ? '<td><button class="link-del" data-del="' + esc(p.id) + '">remover</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
      return '<div class="tipo-card ' + t.grupo + (arr.length ? '' : ' vazio') + '"><h4>' + esc(t.id) + '</h4>' +
        '<div class="media">' + (mm == null ? '–' : fmtNota(mm)) + '</div>' +
        '<div class="meta">' + (arr.length ? arr.length + (arr.length === 1 ? ' prova' : ' provas') + ' · média' : 'Sem provas') + '</div>' + body + '</div>';
    }).join('');
    det.innerHTML = '<a class="back-link" href="#perfis">← Todos os perfis</a>' +
      '<div class="card"><div class="card-head"><h1>' + esc(g.nome) + '</h1></div><div class="card-body"><div class="kpis">' +
      '<div class="kpi"><span class="kpi-label">Média geral</span><strong>' + fmtNota(avg(g.provas)) + '</strong><small>' + g.provas.length + (g.provas.length === 1 ? ' prova' : ' provas') + '</small></div>' +
      '<div class="kpi ok"><span class="kpi-label">Aprovadas</span><strong>' + aprov + '</strong><small></small></div>' +
      '<div class="kpi bad"><span class="kpi-label">Reprovadas</span><strong>' + (g.provas.length - aprov) + '</strong><small></small></div>' +
      '</div></div></div><h2 class="section-title">Provas por categoria</h2><div class="tipo-grid">' + blocos + '</div>';
  }
  $('#pfBusca').addEventListener('input', drawPerfisLista);

  /* ---------- ADMINISTRAÇÃO ---------- */
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function isAuth() { return sessionStorage.getItem(SS_AUTH) === '1'; }

  $('#loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const err = $('#loginErr'); err.hidden = true;
    try {
      const h = await sha256($('#loginUser').value.trim().toLowerCase() + ':' + $('#loginPass').value);
      if (h === ADMIN_HASH) {
        sessionStorage.setItem(SS_AUTH, '1');
        $('#loginPass').value = '';
        renderAdmin();
      } else { err.textContent = 'Usuário ou senha incorretos.'; err.hidden = false; }
    } catch (x) { err.textContent = 'Não foi possível validar o login neste navegador (use https).'; err.hidden = false; }
  });
  $('#logoutBtn').addEventListener('click', function () { sessionStorage.removeItem(SS_AUTH); renderAdmin(); });

  function renderAdmin() {
    const ok = isAuth();
    $('#loginBox').hidden = ok; $('#adminBox').hidden = !ok;
    if (!ok) return;
    const tipoOpts = [['', 'Selecione o tipo de prova…']].concat(TIPOS.map(function (t) { return [t.id, t.id]; }));
    fillSelect($('#fTipo'), tipoOpts, true);
    fillSelect($('#impTipo'), [['', 'Detectar pelo arquivo']].concat(TIPOS.map(function (t) { return [t.id, t.id]; })), true);
    $('#nomesList').innerHTML = perfis().map(function (g) { return '<option value="' + esc(g.nome) + '">'; }).join('');
    renderColabs();
    renderSync();
    const g = ghCfg(); $('#ghRepo').value = g.repo || ''; $('#ghBranch').value = g.branch || 'main';
  }

  // máscaras
  $('#fData').addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    this.value = v;
  });
  $('#impData').addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    this.value = v;
  });
  $('#fNota').addEventListener('input', function () {
    let v = this.value.replace(/[^\d,.]/g, '').replace('.', ',');
    const parts = v.split(',');
    if (parts.length > 2) v = parts[0] + ',' + parts.slice(1).join('');
    this.value = v;
  });

  /* registro manual */
  $('#provaForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const msg = $('#formMsg'); msg.hidden = true;
    const nome = cleanNome($('#fNome').value);
    const tipo = $('#fTipo').value;
    const data = parseData($('#fData').value);
    const nota = parseNota($('#fNota').value);
    const file = $('#fPdf').files[0];
    function fail(t) { msg.textContent = t; msg.hidden = false; }
    if (!nome || !slug(nome)) return fail('Informe o nome do colaborador.');
    if (!tipo) return fail('Selecione o tipo de prova.');
    if (!data) return fail('Data inválida. Use o formato dd/mm/aaaa.');
    if (nota == null) return fail('Nota inválida. Use o formato XX,X (de 0 a 10).');
    if (file && file.type !== 'application/pdf') return fail('O arquivo precisa ser um PDF.');

    // um perfil por pessoa: reaproveita a grafia já cadastrada
    const ex = perfis().find(function (g) { return g.id === slug(nome); });
    const rec = { id: newId(), nome: ex ? ex.nome : nome, tipo: tipo, data: data, nota: nota, pdf: null };
    if (all().some(function (p) { return keyOf(p) === keyOf(rec); })) return fail('Já existe uma prova de ' + rec.nome + ' em ' + tipo + ' nesta data.');
    state.local.push(rec); saveLocal();
    if (file) await attachPdf(rec.id, file, true);
    this.reset();
    toast(ex ? 'Prova registrada no perfil existente de ' + rec.nome + '.' : 'Prova registrada! Novo perfil criado.');
    rerender();
  });

  /* anexar / enviar PDF para pdfs/<perfil>/<tipo>/<data>.pdf */
  async function attachPdf(id, file, silent) {
    const rec = all().find(function (p) { return p.id === id; });
    if (!rec) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return toast('O arquivo precisa ser um PDF.');
    const path = pdfPath(rec);
    const g = ghCfg();
    if (g.repo && g.token) {
      try {
        await ghPutFile(path, await fileToBase64(file), 'Adiciona PDF: ' + rec.nome + ' · ' + rec.tipo + ' · ' + rec.data);
        toast('PDF enviado para ' + path);
      } catch (x) { toast('Falha ao enviar o PDF (' + x.message + '). Salve o arquivo em ' + path); }
    } else {
      toast('Salve o PDF em ' + path + ' no repositório (ou configure o GitHub para enviar direto).');
    }
    const i = state.local.findIndex(function (p) { return p.id === id; });
    if (i >= 0) state.local[i].pdf = path; else state.mod[id] = Object.assign({}, state.mod[id], { pdf: path });
    saveLocal();
    if (!silent) rerender();
  }
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('[data-attach]');
    if (a) {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/pdf';
      inp.addEventListener('change', function () { if (inp.files[0]) attachPdf(a.dataset.attach, inp.files[0]); });
      inp.click();
      return;
    }
    const d = e.target.closest && e.target.closest('[data-del]');
    if (d) {
      const id = d.dataset.del;
      if (!confirm('Remover este registro?')) return;
      const i = state.local.findIndex(function (p) { return p.id === id; });
      if (i >= 0) state.local.splice(i, 1); else state.removed.push(id);
      delete state.mod[id];
      saveLocal(); rerender();
    }
  });

  function renderColabs() {
    const q = norm($('#colabBusca').value);
    const list = perfis().filter(function (g) { return !q || norm(g.nome).indexOf(q) >= 0; });
    $('#colabList').innerHTML = list.length ? list.map(function (g) {
      return '<details class="colab"><summary><span>' + esc(g.nome) + '</span><small>' + g.provas.length +
        (g.provas.length === 1 ? ' tentativa' : ' tentativas') + ' · média ' + fmtNota(avg(g.provas)) + '</small></summary>' +
        '<div class="hist"><p><a class="plink" href="#perfil/' + esc(g.id) + '">Abrir perfil completo →</a></p>' +
        '<table><thead><tr><th>Data</th><th>Prova</th><th class="num">Nota</th><th>PDF</th><th></th></tr></thead><tbody>' +
        g.provas.map(function (p) {
          return '<tr><td>' + fmtData(p.data) + '</td><td>' + esc(p.tipo) + '</td><td class="num">' + fmtNota(p.nota) + '</td>' +
            '<td>' + (p.pdf ? '<a href="' + esc(p.pdf) + '" target="_blank" rel="noopener">abrir</a>' : '<button class="link-del" data-attach="' + esc(p.id) + '">anexar PDF</button>') + '</td>' +
            '<td><button class="link-del" data-del="' + esc(p.id) + '">remover</button></td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }).join('') : '<p class="muted">Nenhum colaborador encontrado.</p>';
  }
  $('#colabBusca').addEventListener('input', renderColabs);

  /* ---------- IMPORTAÇÃO DE JSON ---------- */
  const KEYS = {
    nome: ['nome', 'nomecompleto', 'name', 'colaborador', 'aluno', 'participante', 'funcionario', 'avaliado', 'candidato', 'pessoa'],
    nota: ['nota', 'notafinal', 'grade', 'score', 'pontuacao', 'media', 'resultado', 'notas'],
    data: ['data', 'dataprova', 'datadaprova', 'dataavaliacao', 'datarealizacao', 'date', 'realizadoem'],
    tipo: ['tipo', 'tipoprova', 'tipodeprova', 'prova', 'categoria', 'avaliacao', 'atividade', 'curso']
  };
  function nk(k) { return norm(k).replace(/[^a-z0-9]/g, ''); }
  function pick(o, names) {
    if (!o || typeof o !== 'object') return undefined;
    const ks = Object.keys(o);
    for (let i = 0; i < names.length; i++) {
      const k = ks.find(function (x) { return nk(x) === names[i]; });
      if (k !== undefined && o[k] !== null && o[k] !== '') return o[k];
    }
    return undefined;
  }
  function isCtxKey(k) {
    const n = nk(k);
    return KEYS.tipo.indexOf(n) >= 0 || KEYS.data.indexOf(n) >= 0 || ['titulo', 'arquivo', 'versao', 'total', 'media'].indexOf(n) >= 0;
  }
  function hasObjArray(v) { return Array.isArray(v) && v.some(function (x) { return x && typeof x === 'object'; }); }

  // devolve { ctx:{tipo,data}, rows:[] } aceitando vários formatos de JSON
  function extractRows(j, ctx) {
    ctx = Object.assign({}, ctx || {});
    let rows = [];
    if (Array.isArray(j)) return { ctx: ctx, rows: j };
    if (!j || typeof j !== 'object') return { ctx: ctx, rows: rows };
    const t = pick(j, KEYS.tipo), d = pick(j, KEYS.data);
    if (typeof t === 'string') ctx.tipo = t;
    if (typeof d === 'string') ctx.data = d;
    const keys = Object.keys(j);
    const arrKey = keys.find(function (k) { return hasObjArray(j[k]); });
    if (arrKey) return { ctx: ctx, rows: j[arrKey] };
    const nestKey = keys.find(function (k) {
      const v = j[k];
      return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).some(function (kk) { return hasObjArray(v[kk]); });
    });
    if (nestKey) return extractRows(j[nestKey], ctx);
    // mapa  "Nome": nota   ou   "Nome": { ... }
    keys.forEach(function (k) {
      if (isCtxKey(k)) return;
      const v = j[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) rows.push(Object.assign({ nome: k }, v));
      else if (typeof v === 'number' || (typeof v === 'string' && /^\s*\d+([.,]\d+)?\s*$/.test(v))) rows.push({ nome: k, nota: v });
    });
    return { ctx: ctx, rows: rows };
  }

  function parseNotaAny(v) {
    let n;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string') { const m = /-?\d+(?:[.,]\d+)?/.exec(v); n = m ? parseFloat(m[0].replace(',', '.')) : NaN; }
    else return null;
    if (!isFinite(n)) return null;
    let scaled = false;
    if (n > 10 && n <= 100) { n = n / 10; scaled = true; }
    if (n < 0 || n > 10) return null;
    return { n: Math.round(n * 10) / 10, scaled: scaled };
  }
  function parseDataAny(v) {
    if (typeof v !== 'string') return null;
    let m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
    if (m) return validaData(+m[1], +m[2], +m[3]);
    m = /^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(v);
    if (m) return validaData(+m[3], +m[2], +m[1]);
    return null;
  }
  function dataDoNome(name) {
    const m = /(\d{4}-\d{2}-\d{2})|(\d{2}[-_.]\d{2}[-_.]\d{4})/.exec(name);
    return m ? parseDataAny(m[0].replace(/[_.]/g, '-')) : null;
  }
  // "AM2", "Auxiliar Mecânico 2", "Técnico Elétrica 1", "TC3"... -> id oficial
  function resolveTipo(v) {
    if (typeof v !== 'string') return null;
    const s = norm(v).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!s) return null;
    const exact = TIPOS.find(function (t) { return norm(t.id).replace(/[^a-z0-9]+/g, ' ') === s; });
    if (exact) return exact.id;
    let m = /auxiliar\s*mecanico\s*([23])/.exec(s); if (m) return 'Auxiliar Mecânico ' + m[1];
    m = /tecnico\s*eletrica\s*([123])/.exec(s); if (m) return 'Técnico Elétrica ' + m[1];
    m = /tecnico\s*combustao\s*([123])/.exec(s); if (m) return 'Técnico Combustão ' + m[1];
    m = /(?:^| )(am|te|tc)\s*([123])(?: |$)/.exec(s);
    if (m) {
      const id = { am: 'Auxiliar Mecânico ', te: 'Técnico Elétrica ', tc: 'Técnico Combustão ' }[m[1]] + m[2];
      if (TIPOS.some(function (t) { return t.id === id; })) return id;
    }
    return null;
  }

  async function analisarArquivos(files) {
    const exist = all();
    const keys = new Set(exist.map(keyOf));
    const perfisExist = new Map(perfis().map(function (g) { return [g.id, g.nome]; }));
    const novosPerfis = new Map();
    const defTipo = $('#impTipo').value || null;
    const defData = $('#impData').value ? parseData($('#impData').value) : null;
    const res = { arquivos: [], novas: [], dup: 0, err: 0 };

    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      const info = { nome: file.name, lidas: 0, novas: 0, dup: 0, erros: [], avisos: [] };
      res.arquivos.push(info);
      let j;
      try { j = JSON.parse((await file.text()).replace(/^﻿/, '')); }
      catch (x) { info.erros.push('JSON inválido: ' + x.message); res.err++; continue; }
      const ex = extractRows(j);
      const tipoArq = resolveTipo(file.name);
      const dataArq = dataDoNome(file.name);
      if (!ex.rows.length) { info.erros.push('Nenhum registro encontrado no arquivo.'); res.err++; continue; }
      let escalas = 0;

      ex.rows.forEach(function (row, idx) {
        info.lidas++;
        const lbl = 'registro ' + (idx + 1);
        if (!row || typeof row !== 'object') { info.erros.push(lbl + ': formato inesperado'); res.err++; return; }
        const nome = pick(row, KEYS.nome);
        if (typeof nome !== 'string' || !slug(nome)) { info.erros.push(lbl + ': sem nome'); res.err++; return; }
        const nota = parseNotaAny(pick(row, KEYS.nota));
        if (!nota) { info.erros.push(lbl + ' (' + nome + '): nota ausente ou inválida'); res.err++; return; }
        const tipo = resolveTipo(pick(row, KEYS.tipo)) || resolveTipo(ex.ctx.tipo) || defTipo || tipoArq;
        if (!tipo) { info.erros.push(lbl + ' (' + nome + '): tipo de prova não identificado — escolha o tipo acima'); res.err++; return; }
        const data = parseDataAny(pick(row, KEYS.data)) || parseDataAny(ex.ctx.data) || defData || dataArq;
        if (!data) { info.erros.push(lbl + ' (' + nome + '): data não encontrada — informe a data acima'); res.err++; return; }
        if (nota.scaled) escalas++;

        const id = slug(nome);
        const display = perfisExist.get(id) || (novosPerfis.get(id)) || cleanNome(nome);
        const rec = { id: newId(), nome: display, tipo: tipo, data: data, nota: nota.n, pdf: null };
        const k = keyOf(rec);
        if (keys.has(k)) { info.dup++; res.dup++; return; }
        keys.add(k);
        if (!perfisExist.has(id) && !novosPerfis.has(id)) novosPerfis.set(id, display);
        info.novas++;
        res.novas.push(rec);
      });
      if (escalas) info.avisos.push(escalas + ' nota(s) estavam na escala 0–100 e foram divididas por 10.');
    }
    res.novosPerfis = Array.from(novosPerfis.values());
    return res;
  }

  function renderImportPreview(res) {
    const box = $('#impResumo');
    box.hidden = false;
    box.innerHTML = '<p><strong>' + res.novas.length + '</strong> prova(s) nova(s) · <strong>' + res.novosPerfis.length + '</strong> perfil(is) novo(s) · ' +
      res.dup + ' já existente(s) ignorada(s) · ' + res.err + ' com problema</p>' +
      res.arquivos.map(function (a) {
        return '<div class="imp-file"><b>' + esc(a.nome) + '</b> — ' + a.lidas + ' lida(s), ' + a.novas + ' nova(s), ' + a.dup + ' duplicada(s)' +
          a.avisos.map(function (w) { return '<div class="muted">' + esc(w) + '</div>'; }).join('') +
          (a.erros.length ? '<ul class="imp-err">' + a.erros.slice(0, 8).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
            (a.erros.length > 8 ? '<li>… e mais ' + (a.erros.length - 8) + '</li>' : '') + '</ul>' : '') + '</div>';
      }).join('') +
      (res.novosPerfis.length ? '<p class="muted">Novos perfis: ' + esc(res.novosPerfis.slice(0, 12).join(', ')) + (res.novosPerfis.length > 12 ? '…' : '') + '</p>' : '');
    $('#impConfirm').hidden = !res.novas.length;
  }
  async function lerImport() {
    const files = Array.from($('#impFiles').files);
    pendingImport = null;
    if (!files.length) { $('#impResumo').hidden = true; $('#impConfirm').hidden = true; return; }
    pendingImport = await analisarArquivos(files);
    renderImportPreview(pendingImport);
  }
  $('#impFiles').addEventListener('change', lerImport);
  $('#impTipo').addEventListener('change', lerImport);
  $('#impData').addEventListener('change', lerImport);
  $('#impConfirm').addEventListener('click', function () {
    if (!pendingImport || !pendingImport.novas.length) return;
    const n = pendingImport.novas.length, p = pendingImport.novosPerfis.length;
    pendingImport.novas.forEach(function (r) { state.local.push(r); });
    saveLocal();
    pendingImport = null;
    $('#impFiles').value = ''; $('#impResumo').hidden = true; $('#impConfirm').hidden = true;
    toast(n + ' prova(s) importada(s), ' + p + ' perfil(is) novo(s). Clique em "Publicar no GitHub" para todos verem.');
    renderAdmin();
  });

  /* ---------- sincronização com GitHub ---------- */
  function ghCfg() { try { return JSON.parse(localStorage.getItem(LS_GH) || '{}'); } catch (e) { return {}; } }
  function renderSync() {
    const n = state.local.length + state.removed.length + Object.keys(state.mod).length;
    $('#syncStatus').textContent = n
      ? n + ' alteração(ões) ainda não publicada(s). Elas só aparecem neste navegador até você publicar.'
      : 'Tudo sincronizado com data/provas.json.';
  }
  $('#ghConfigBtn').addEventListener('click', function () { const b = $('#ghConfig'); b.hidden = !b.hidden; });
  $('#ghSave').addEventListener('click', function () {
    const cfg = { repo: $('#ghRepo').value.trim(), branch: $('#ghBranch').value.trim() || 'main' };
    const tk = $('#ghToken').value.trim();
    cfg.token = tk || ghCfg().token || '';
    localStorage.setItem(LS_GH, JSON.stringify(cfg));
    $('#ghToken').value = '';
    toast('Configuração salva neste navegador.');
  });

  function mergedJSON() {
    const out = all().map(function (p) {
      return { id: p.id, nome: p.nome, perfil: p.perfil, tipo: p.tipo, data: p.data, nota: p.nota, pdf: p.pdf || null };
    });
    out.sort(function (a, b) { return a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome); });
    return JSON.stringify(out, null, 2) + '\n';
  }
  $('#exportBtn').addEventListener('click', function () {
    const url = URL.createObjectURL(new Blob([mergedJSON()], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'provas.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Substitua data/provas.json no repositório por este arquivo.');
  });

  function b64(str) { const b = new TextEncoder().encode(str); let s = ''; b.forEach(function (c) { s += String.fromCharCode(c); }); return btoa(s); }
  function fileToBase64(file) {
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = function () { rej(new Error('leitura do arquivo')); };
      r.readAsDataURL(file);
    });
  }
  async function ghPutFile(path, contentB64, message) {
    const g = ghCfg();
    if (!g.repo || !g.token) throw new Error('GitHub não configurado');
    const base = 'https://api.github.com/repos/' + g.repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
    const headers = { 'Authorization': 'Bearer ' + g.token, 'Accept': 'application/vnd.github+json' };
    let sha;
    const cur = await fetch(base + '?ref=' + encodeURIComponent(g.branch || 'main'), { headers: headers });
    if (cur.ok) sha = (await cur.json()).sha; else if (cur.status !== 404) throw new Error('HTTP ' + cur.status);
    const body = { message: message, content: contentB64, branch: g.branch || 'main' };
    if (sha) body.sha = sha;
    const put = await fetch(base, { method: 'PUT', headers: headers, body: JSON.stringify(body) });
    if (!put.ok) throw new Error('HTTP ' + put.status);
  }
  $('#publishBtn').addEventListener('click', async function () {
    const g = ghCfg();
    if (!g.repo || !g.token) { $('#ghConfig').hidden = false; return toast('Configure o repositório e o token primeiro.'); }
    this.disabled = true;
    try {
      const json = mergedJSON();
      await ghPutFile('data/provas.json', b64(json), 'Atualiza provas (' + new Date().toLocaleDateString('pt-BR') + ')');
      state.repo = JSON.parse(json); state.local = []; state.removed = []; state.mod = {}; saveLocal();
      toast('Publicado! O site atualiza em ~1 minuto.');
      renderAdmin();
    } catch (x) { toast('Falha ao publicar: ' + x.message); }
    this.disabled = false;
  });

  /* ---------- início ---------- */
  (async function init() {
    loadLocal();
    await loadRepo();
    route();
  })();

  // exposto para testes
  window.__carmak = { parseData: parseData, parseNota: parseNota, avg: avg, resolveTipo: resolveTipo, extractRows: extractRows, slug: slug, pdfPath: pdfPath };
})();
