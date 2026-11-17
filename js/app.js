/* Carmak · Painel de Provas
 * Dados oficiais: data/provas.json (versionado no GitHub).
 * Registros novos ficam no navegador (localStorage) até serem publicados. */
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
  const state = { repo: [], local: [], removed: [] };

  /* ---------- utilidades ---------- */
  function fmtNota(n) { return n.toFixed(1).replace('.', ','); }
  function fmtData(iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function norm(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b.nota; }, 0) / arr.length : null; }
  function tipoCor(id) { const t = TIPOS.find(function (x) { return x.id === id; }); return t ? t.cor : '#96c957'; }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function parseData(str) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str.trim());
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return m[3] + '-' + m[2] + '-' + m[1];
  }
  function parseNota(str) {
    const m = /^(\d{1,2})(?:,(\d))?$/.exec(str.trim());
    if (!m) return null;
    const n = parseFloat(m[1] + '.' + (m[2] || '0'));
    return n >= 0 && n <= 10 ? n : null;
  }

  /* ---------- dados ---------- */
  function all() {
    const gone = new Set(state.removed);
    const map = new Map();
    state.repo.concat(state.local).forEach(function (p) { if (!gone.has(p.id)) map.set(p.id, p); });
    return Array.from(map.values());
  }
  function loadLocal() {
    try {
      const o = JSON.parse(localStorage.getItem(LS_LOCAL) || '{}');
      state.local = o.add || []; state.removed = o.del || [];
    } catch (e) { state.local = []; state.removed = []; }
  }
  function saveLocal() {
    try { localStorage.setItem(LS_LOCAL, JSON.stringify({ add: state.local, del: state.removed })); } catch (e) { /* ignore */ }
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
    const r = (location.hash || '#inicio').slice(1);
    const name = ['inicio', 'graficos', 'administracao'].indexOf(r) >= 0 ? r : 'inicio';
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + name; });
    document.querySelectorAll('.sidebar a').forEach(function (a) { a.classList.toggle('active', a.dataset.route === name); });
    toggleMenu(false);
    window.scrollTo(0, 0);
    if (name === 'inicio') renderInicio();
    if (name === 'graficos') renderGraficos();
    if (name === 'administracao') renderAdmin();
  }
  window.addEventListener('hashchange', route);

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
  function drawList() {
    const q = norm($('#lstBusca').value), tipo = $('#lstTipo').value;
    let d = filtraPeriodo(all(), $('#lstAno').value, $('#lstMes').value);
    if (tipo) d = d.filter(function (p) { return p.tipo === tipo; });
    if (q) d = d.filter(function (p) { return norm(p.nome).indexOf(q) >= 0; });
    d.sort(function (a, b) { return b.data.localeCompare(a.data) || a.nome.localeCompare(b.nome); });
    $('#lstBody').innerHTML = d.length ? d.map(function (p) {
      return '<tr><td>' + esc(p.nome) + '</td><td>' + esc(p.tipo) + '</td><td>' + fmtData(p.data) + '</td>' +
        '<td class="num">' + fmtNota(p.nota) + ' <span class="pill ' + (p.nota >= NOTA_MINIMA ? 'ok' : 'bad') + '">' + (p.nota >= NOTA_MINIMA ? 'Aprovado' : 'Reprovado') + '</span></td></tr>';
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
    fillSelect($('#fTipo'), [['', 'Selecione o tipo de prova…']].concat(TIPOS.map(function (t) { return [t.id, t.id]; })));
    $('#nomesList').innerHTML = nomesUnicos().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    renderColabs();
    renderSync();
    const g = ghCfg(); $('#ghRepo').value = g.repo || ''; $('#ghBranch').value = g.branch || 'main';
  }
  function nomesUnicos() {
    const m = new Map();
    all().forEach(function (p) { const k = norm(p.nome); if (!m.has(k)) m.set(k, p.nome); });
    return Array.from(m.values()).sort(function (a, b) { return a.localeCompare(b); });
  }

  // máscaras
  $('#fData').addEventListener('input', function () {
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

  function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function slug(s) { return norm(s).replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''); }

  $('#provaForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const msg = $('#formMsg'); msg.hidden = true;
    const nome = $('#fNome').value.trim().replace(/\s+/g, ' ');
    const tipo = $('#fTipo').value;
    const data = parseData($('#fData').value);
    const nota = parseNota($('#fNota').value);
    const file = $('#fPdf').files[0];
    function fail(t) { msg.textContent = t; msg.hidden = false; }
    if (!nome) return fail('Informe o nome do colaborador.');
    if (!tipo) return fail('Selecione o tipo de prova.');
    if (!data) return fail('Data inválida. Use o formato dd/mm/aaaa.');
    if (nota == null) return fail('Nota inválida. Use o formato XX,X (de 0 a 10).');
    if (file && file.type !== 'application/pdf') return fail('O arquivo precisa ser um PDF.');

    // reaproveita a grafia já cadastrada do nome
    const ex = nomesUnicos().find(function (n) { return norm(n) === norm(nome); });
    const rec = { id: newId(), nome: ex || nome, tipo: tipo, data: data, nota: nota, pdf: null };
    if (file) {
      rec.pdf = 'pdfs/' + rec.id + '-' + slug(file.name.replace(/\.pdf$/i, '')) + '.pdf';
      const g = ghCfg();
      if (g.repo && g.token) {
        try { await ghPutFile(rec.pdf, await fileToBase64(file), 'Adiciona PDF da prova ' + rec.id); toast('PDF enviado ao GitHub.'); }
        catch (x) { toast('Falha ao enviar o PDF (' + x.message + '). Coloque o arquivo manualmente em ' + rec.pdf); }
      } else {
        toast('Registrado. Salve o PDF em ' + rec.pdf + ' no repositório.');
      }
    }
    state.local.push(rec); saveLocal();
    this.reset();
    toast('Prova registrada!');
    renderAdmin();
  });

  function renderColabs() {
    const q = norm($('#colabBusca').value);
    const d = all();
    const groups = new Map();
    d.forEach(function (p) { const k = norm(p.nome); if (!groups.has(k)) groups.set(k, { nome: p.nome, provas: [] }); groups.get(k).provas.push(p); });
    let list = Array.from(groups.values()).filter(function (g) { return !q || norm(g.nome).indexOf(q) >= 0; });
    list.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    $('#colabList').innerHTML = list.length ? list.map(function (g) {
      g.provas.sort(function (a, b) { return b.data.localeCompare(a.data); });
      const m = avg(g.provas);
      return '<details class="colab"><summary><span>' + esc(g.nome) + '</span><small>' + g.provas.length +
        (g.provas.length === 1 ? ' tentativa' : ' tentativas') + ' · média ' + fmtNota(m) + '</small></summary>' +
        '<div class="hist"><table><thead><tr><th>Data</th><th>Prova</th><th class="num">Nota</th><th>PDF</th><th></th></tr></thead><tbody>' +
        g.provas.map(function (p) {
          return '<tr><td>' + fmtData(p.data) + '</td><td>' + esc(p.tipo) + '</td><td class="num">' + fmtNota(p.nota) + '</td>' +
            '<td>' + (p.pdf ? '<a href="' + esc(p.pdf) + '" target="_blank" rel="noopener">abrir</a>' : '–') + '</td>' +
            '<td><button class="link-del" data-del="' + esc(p.id) + '">remover</button></td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }).join('') : '<p class="muted">Nenhum colaborador encontrado.</p>';
  }
  $('#colabBusca').addEventListener('input', renderColabs);
  $('#colabList').addEventListener('click', function (e) {
    const id = e.target.dataset && e.target.dataset.del;
    if (!id || !confirm('Remover este registro?')) return;
    const i = state.local.findIndex(function (p) { return p.id === id; });
    if (i >= 0) state.local.splice(i, 1); else state.removed.push(id);
    saveLocal(); renderAdmin();
  });

  /* ---------- sincronização com GitHub ---------- */
  function ghCfg() { try { return JSON.parse(localStorage.getItem(LS_GH) || '{}'); } catch (e) { return {}; } }
  function renderSync() {
    const n = state.local.length + state.removed.length;
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
    return JSON.stringify(all().sort(function (a, b) { return a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome); }), null, 2) + '\n';
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
      state.repo = JSON.parse(json); state.local = []; state.removed = []; saveLocal();
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
  window.__carmak = { parseData: parseData, parseNota: parseNota, avg: avg };
})();
