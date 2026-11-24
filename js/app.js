/* Gestão de Provas Técnicas – CARMAK
   Site 100% estático (compatível com GitHub Pages). Sem build, sem backend.
   Dados: localStorage do navegador (administração) + data/provas.json publicado no repositório. */
(function () {
  'use strict';

  /* ===================== Constantes ===================== */
  var TIPOS = [
    { id: 'AM2', nome: 'Auxiliar Mecânico 2' },
    { id: 'AM3', nome: 'Auxiliar Mecânico 3' },
    { id: 'TC1', nome: 'Técnico Combustão 1' },
    { id: 'TC2', nome: 'Técnico Combustão 2' },
    { id: 'TC3', nome: 'Técnico Combustão 3' },
    { id: 'TE1', nome: 'Técnico Elétrica 1' },
    { id: 'TE2', nome: 'Técnico Elétrica 2' },
    { id: 'TE3', nome: 'Técnico Elétrica 3' }
  ];
  var TIPO_NOME = {};
  TIPOS.forEach(function (t) { TIPO_NOME[t.id] = t.nome; });
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var NOTA_MINIMA = 7.0;
  var LS_KEY = 'gpt_provas_v1';
  var AUTH_KEY = 'gpt_auth_v1';
  // SHA-256 (usuário em minúsculas / senha). Obs.: proteção apenas visual – ver README.
  var USER_HASH = '36f4ed4948a72abf46892f220e83243247525d681405f01b2546751cea4b63de';
  var PASS_HASH = '8a00e06bed5c4bd1b9e3838651efe3c6a0d50bf87e2b7a91ff03704047041aef';

  /* ===================== Utilidades ===================== */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function fmtNota(n) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtData(iso) {
    if (!iso) return '—';
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function toast(msg) {
    var t = el('<div class="toast" role="status">' + esc(msg) + '</div>');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  function sha256(text) {
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error('sem-crypto'));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function gradeClass(n) {
    if (n < 7) return 'red';
    if (n < 8) return 'yellow';
    if (n < 9.6) return 'green';
    return 'rainbow';
  }
  function gradeBadge(n) { return '<span class="grade ' + gradeClass(n) + '">' + fmtNota(n) + '</span>'; }
  function recKey(r) { return norm(r.nome) + '|' + r.tipo + '|' + (r.ini || r.data); }

  /* ===================== Dados ===================== */
  var DB = [];

  function saveDB() { try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch (e) { toast('Não foi possível salvar no navegador.'); } }
  function fetchPublished() {
    return fetch('data/provas.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (a) { return Array.isArray(a) ? a : []; })
      .catch(function () { return []; });
  }
  function loadDB() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) {}
    if (raw) {
      try { DB = JSON.parse(raw) || []; return Promise.resolve(); } catch (e) {}
    }
    return fetchPublished().then(function (a) { DB = a; });
  }
  function cleanRec(r) {
    if (!r || !TIPO_NOME[r.tipo] || typeof r.nome !== 'string') return null;
    var nota = Number(r.nota);
    if (!isFinite(nota) || !/^\d{4}-\d{2}-\d{2}/.test(r.data || '')) return null;
    return { id: r.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)), nome: r.nome.trim(), tipo: r.tipo, nota: nota, data: r.data, ini: r.ini || r.data };
  }
  function addRecords(list) {
    var seen = {};
    DB.forEach(function (r) { seen[recKey(r)] = 1; });
    var added = 0, dups = 0;
    list.forEach(function (raw) {
      var r = cleanRec(raw);
      if (!r) return;
      var k = recKey(r);
      if (seen[k]) { dups++; return; }
      seen[k] = 1; DB.push(r); added++;
    });
    saveDB();
    return { added: added, dups: dups };
  }

  /* ===================== Parser do HTML de notas ===================== */
  var MES_IDX = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  function parsePtDate(s) {
    var m = norm(s).match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m || !MES_IDX[m[2]]) return null;
    function p(n) { return ('0' + n).slice(-2); }
    return m[3] + '-' + p(MES_IDX[m[2]]) + '-' + p(m[1]) + 'T' + p(m[4] || 0) + ':' + p(m[5] || 0);
  }
  function detectTipo(text) {
    var t = norm(text);
    var m;
    if ((m = t.match(/auxiliar mecanico\s*(\d)/))) return TIPO_NOME['AM' + m[1]] ? 'AM' + m[1] : null;
    if ((m = t.match(/tecnico combustao\s*(\d)/))) return TIPO_NOME['TC' + m[1]] ? 'TC' + m[1] : null;
    if ((m = t.match(/tecnico eletrica\s*(\d)/))) return TIPO_NOME['TE' + m[1]] ? 'TE' + m[1] : null;
    if ((m = String(text).match(/^\s*(AM|TC|TE)\s*([123])\b/i))) {
      var id = m[1].toUpperCase() + m[2];
      return TIPO_NOME[id] ? id : null;
    }
    return null;
  }
  function parseExam(html, fileName) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var title = (doc.title || '').trim();
    var res = { title: title || fileName || 'Sem título', fileName: fileName || '', tipo: detectTipo(title) || detectTipo(fileName || ''), rows: [], skipped: 0, error: '' };
    var table = doc.querySelector('table');
    if (!table) { res.error = 'Nenhuma tabela encontrada no HTML.'; return res; }
    var trs = Array.prototype.slice.call(table.querySelectorAll('tr'));
    var headRow = trs.filter(function (tr) { return tr.querySelector('th'); })[0];
    if (!headRow) { res.error = 'Cabeçalho da tabela não encontrado.'; return res; }
    var heads = Array.prototype.map.call(headRow.children, function (c) { return norm(c.textContent); });
    function col(fn) { for (var i = 0; i < heads.length; i++) if (fn(heads[i])) return i; return -1; }
    var iSob = col(function (h) { return h === 'sobrenome'; });
    var iNome = col(function (h) { return h === 'nome'; });
    var iSit = col(function (h) { return h.indexOf('situacao') === 0; });
    var iIni = col(function (h) { return h.indexOf('iniciado') === 0; });
    var iFim = col(function (h) { return h.indexOf('completo') === 0; });
    var iNota = col(function (h) { return h.indexOf('nota') === 0; });
    if (iNome < 0 || iNota < 0) { res.error = 'Colunas "Nome" e "Nota" não encontradas.'; return res; }
    trs.forEach(function (tr) {
      if (tr === headRow || tr.querySelector('th')) return;
      var tds = Array.prototype.map.call(tr.children, function (c) { return c.textContent.trim(); });
      if (!tds.length || norm(tds[0]).indexOf('media geral') === 0) return;   // ignora a linha "Média geral"
      var nota = parseFloat((tds[iNota] || '').replace(/\./g, '').replace(',', '.'));
      var fim = iFim >= 0 ? parsePtDate(tds[iFim]) : null;
      var ini = iIni >= 0 ? parsePtDate(tds[iIni]) : null;
      var data = fim || ini;
      var nome = ((tds[iNome] || '') + ' ' + (iSob >= 0 ? tds[iSob] || '' : '')).replace(/\s+/g, ' ').trim();
      if (!isFinite(nota) || !data || !nome) { res.skipped++; return; }   // tentativa sem nota (ex.: "-")
      res.rows.push({ nome: nome, nota: nota, data: data, ini: ini || data, situacao: iSit >= 0 ? tds[iSit] : '' });
    });
    if (!res.rows.length && !res.error) res.error = 'Nenhuma prova com nota encontrada.';
    return res;
  }

  /* ===================== Filtros reutilizáveis ===================== */
  function newFilterState() { return { tipos: new Set(TIPOS.map(function (t) { return t.id; })), ano: '', mes: '' }; }
  function applyFilter(st) {
    return DB.filter(function (r) {
      return st.tipos.has(r.tipo) &&
        (!st.ano || r.data.slice(0, 4) === st.ano) &&
        (!st.mes || r.data.slice(5, 7) === st.mes);
    });
  }
  function years() {
    var s = {};
    DB.forEach(function (r) { s[r.data.slice(0, 4)] = 1; });
    return Object.keys(s).sort().reverse();
  }
  function filterBar(st, onChange) {
    var ys = years();
    var bar = el(
      '<div class="filters">' +
        '<div class="f grow"><span class="lbl">Tipo de prova</span>' +
          '<details class="ms"><summary></summary><div class="panel">' +
            '<label class="all"><input type="checkbox" data-all> Todas as provas</label>' +
            TIPOS.map(function (t) { return '<label><input type="checkbox" value="' + t.id + '"> ' + esc(t.nome) + '</label>'; }).join('') +
          '</div></details></div>' +
        '<div class="f"><label class="lbl">Ano de execução</label><select data-ano><option value="">Todos</option>' +
          ys.map(function (y) { return '<option>' + y + '</option>'; }).join('') + '</select></div>' +
        '<div class="f"><label class="lbl">Mês de execução</label><select data-mes><option value="">Todos</option>' +
          MESES.map(function (m, i) { return '<option value="' + ('0' + (i + 1)).slice(-2) + '">' + m + '</option>'; }).join('') + '</select></div>' +
      '</div>');
    var summary = $('summary', bar), boxes = bar.querySelectorAll('.panel input[value]'), all = $('[data-all]', bar);
    function sync() {
      boxes.forEach(function (b) { b.checked = st.tipos.has(b.value); });
      all.checked = st.tipos.size === TIPOS.length;
      all.indeterminate = st.tipos.size > 0 && st.tipos.size < TIPOS.length;
      summary.textContent = st.tipos.size === TIPOS.length ? 'Todas as provas'
        : st.tipos.size === 0 ? 'Nenhuma selecionada'
        : st.tipos.size === 1 ? TIPO_NOME[Array.from(st.tipos)[0]] : st.tipos.size + ' tipos selecionados';
    }
    sync();
    bar.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-all')) st.tipos = t.checked ? new Set(TIPOS.map(function (x) { return x.id; })) : new Set();
      else if (t.value && t.type === 'checkbox') { t.checked ? st.tipos.add(t.value) : st.tipos.delete(t.value); }
      else if (t.hasAttribute('data-ano')) st.ano = t.value;
      else if (t.hasAttribute('data-mes')) st.mes = t.value;
      sync(); onChange();
    });
    return bar;
  }
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.ms[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });

  /* ===================== Gráfico de área 3D (SVG) ===================== */
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(c) { return Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)))); }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }
  function niceMax(v) {
    if (v <= 5) return 5;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  /* cats: ['Nome',...]; series: [{name,color,values:[...],fmt?}]; a 1ª série fica na frente */
  function area3D(cats, series, o) {
    o = o || {};
    var W = 900, H = 450, L = 54, T = 26, R = W - 26, B = H - 112;
    var nS = series.length, n = cats.length;
    var pitch = nS === 1 ? { x: 46, y: -27 } : { x: 36, y: -21 };
    var th = { x: pitch.x * 0.72, y: pitch.y * 0.72 };
    var tox = pitch.x * nS, toy = pitch.y * nS;
    var pw = R - L - tox, ph = B - T + toy;
    var max = o.max || niceMax(Math.max.apply(null, [1].concat.apply([1], series.map(function (s) { return s.values; }))));
    var step = o.step || (max / (max <= 10 ? (max === 10 ? 5 : max) : 5));
    function Y(v) { return B - (v / max) * ph; }
    var out = [];
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title || 'Gráfico de área 3D') + '">');
    // paredes e piso
    out.push('<polygon points="' + [L, B, L + pw, B, L + pw + tox, B + toy, L + tox, B + toy].join(' ') + '" fill="#cfd6c2"/>');
    out.push('<polygon points="' + [L, B, L + tox, B + toy, L + tox, B + toy - ph, L, B - ph].join(' ') + '" fill="#e1e6d6"/>');
    out.push('<polygon points="' + [L + tox, B + toy, L + tox + pw, B + toy, L + tox + pw, B + toy - ph, L + tox, B + toy - ph].join(' ') + '" fill="#f1f4ea"/>');
    for (var v = 0; v <= max + 1e-9; v += step) {
      var y0 = Y(v);
      out.push('<line x1="' + L + '" y1="' + y0 + '" x2="' + (L + tox) + '" y2="' + (y0 + toy) + '" stroke="#b3bba3"/>');
      out.push('<line x1="' + (L + tox) + '" y1="' + (y0 + toy) + '" x2="' + (L + tox + pw) + '" y2="' + (y0 + toy) + '" stroke="#c3cab5"/>');
      out.push('<text x="' + (L - 8) + '" y="' + (y0 + 4) + '" text-anchor="end" font-size="12">' + (o.tick ? o.tick(v) : (Math.round(v * 10) / 10).toString().replace('.', ',')) + '</text>');
    }
    // posições x
    var ts = n === 1 ? [0.3, 0.7] : cats.map(function (_, i) { return 0.05 + 0.9 * i / (n - 1); });
    var lblT = n === 1 ? [0.5] : ts;
    function X(t) { return L + pw * t; }
    // faixas (de trás para frente)
    for (var k = nS - 1; k >= 0; k--) {
      var s = series[k], ox = k * pitch.x, oy = k * pitch.y;
      var vals = n === 1 ? [s.values[0], s.values[0]] : s.values;
      var P = vals.map(function (val, i) { return [X(ts[i]) + ox, Y(val) + oy]; });
      var Q = P.map(function (p) { return [p[0] + th.x, p[1] + th.y]; });
      var base = B + oy, last = P.length - 1;
      var top = '', i;
      for (i = 0; i < last; i++) top += '<polygon points="' + [P[i], P[i + 1], Q[i + 1], Q[i]].map(function (p) { return p.join(','); }).join(' ') + '" fill="' + shade(s.color, 0.28) + '" stroke="' + shade(s.color, 0.1) + '" stroke-width=".6"/>';
      out.push(top);
      out.push('<polygon points="' + [P[last], Q[last], [Q[last][0], base + th.y], [P[last][0], base]].map(function (p) { return p.join(','); }).join(' ') + '" fill="' + shade(s.color, -0.28) + '"/>');
      out.push('<polygon points="' + P.map(function (p) { return p.join(','); }).join(' ') + ' ' + P[last][0] + ',' + base + ' ' + P[0][0] + ',' + base + '" fill="' + s.color + '" fill-opacity=".93" stroke="' + shade(s.color, -0.2) + '" stroke-width="1"/>');
    }
    // rótulos de valor + tooltips
    for (k = nS - 1; k >= 0; k--) {
      s = series[k]; ox = k * pitch.x; oy = k * pitch.y;
      for (i = 0; i < n; i++) {
        var px = X(lblT[i]) + ox, py = Y(s.values[i]) + oy;
        var txt = s.values[i] === null || (o.hideZero && !s.values[i]) ? '' : (s.fmt ? s.fmt(s.values[i]) : s.values[i]);
        out.push('<circle cx="' + px + '" cy="' + py + '" r="5" fill="#fff" stroke="' + shade(s.color, -0.3) + '" stroke-width="2"><title>' + esc(cats[i] + ' — ' + s.name + ': ' + (s.fmt ? s.fmt(s.values[i]) : s.values[i])) + '</title></circle>');
        if (txt !== '') out.push('<text x="' + (px + th.x / 2) + '" y="' + (py + th.y - 7) + '" text-anchor="middle" font-size="11.5" font-weight="700" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(txt) + '</text>');
      }
    }
    // rótulos do eixo X
    cats.forEach(function (c, i) {
      var x = X(lblT[i]);
      out.push('<text transform="translate(' + (x + 4) + ',' + (B + 20) + ') rotate(-30)" text-anchor="end" font-size="12.5">' + esc(c) + '</text>');
    });
    out.push('</svg>');
    var legend = series.length > 1 || o.legend ? '<div class="legend">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>' : '';
    return '<div class="chart">' + out.join('') + '</div>' + legend;
  }

  /* ===================== Estatísticas ===================== */
  function statsByTipo(st, recs) {
    return TIPOS.filter(function (t) { return st.tipos.has(t.id); }).map(function (t) {
      var rs = recs.filter(function (r) { return r.tipo === t.id; });
      var sum = rs.reduce(function (a, r) { return a + r.nota; }, 0);
      var apr = rs.filter(function (r) { return r.nota >= NOTA_MINIMA; }).length;
      var last = rs.reduce(function (a, r) { return !a || r.data > a ? r.data : a; }, '');
      return { id: t.id, nome: t.nome, n: rs.length, media: rs.length ? sum / rs.length : null, apr: apr, rep: rs.length - apr, last: last };
    });
  }

  /* ===================== Página: Início ===================== */
  function card(title, subtitle) {
    return el('<section class="card"><div class="card-head"><h2>' + esc(title) + '</h2>' + (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div><div class="card-body"></div></section>');
  }
  function renderInicio(root) {
    root.appendChild(el('<section class="card page-title"><div class="card-head"><h1>Gestão de Provas Técnicas</h1></div></section>'));
    function panel(title, subtitle, draw) {
      var c = card(title, subtitle), body = $('.card-body', c), st = newFilterState(), out = document.createElement('div');
      body.appendChild(filterBar(st, function () { draw(st, out); }));
      body.appendChild(out);
      draw(st, out);
      root.appendChild(c);
    }
    var NO_DATA = '<div class="empty">Nenhuma prova encontrada para os filtros selecionados.</div>';

    panel('Média total', 'Gráfico de área 3D', function (st, out) {
      var stats = statsByTipo(st, applyFilter(st));
      if (!stats.length || !stats.some(function (s) { return s.n; })) { out.innerHTML = NO_DATA; return; }
      out.innerHTML = area3D(stats.map(function (s) { return s.nome; }),
        [{ name: 'Nota média', color: '#6fae3a', values: stats.map(function (s) { return s.media || 0; }), fmt: function (v) { return v ? fmtNota(v) : '—'; } }],
        { max: 10, step: 2, title: 'Média das notas por tipo de prova' });
    });

    panel('Aprovações e reprovações', 'Nota mínima para aprovação: 7,0 · Gráfico de área 3D', function (st, out) {
      var stats = statsByTipo(st, applyFilter(st));
      if (!stats.length || !stats.some(function (s) { return s.n; })) { out.innerHTML = NO_DATA; return; }
      var mx = Math.max.apply(null, stats.map(function (s) { return Math.max(s.apr, s.rep); }).concat([1]));
      var m = niceMax(Math.max(mx, 5));
      out.innerHTML = area3D(stats.map(function (s) { return s.nome; }),
        [{ name: 'Aprovados (≥ 7,0)', color: '#3f9b4f', values: stats.map(function (s) { return s.apr; }) },
         { name: 'Reprovados (< 7,0)', color: '#d9534f', values: stats.map(function (s) { return s.rep; }) }],
        { max: m, step: m / (m <= 5 ? m : 5), title: 'Aprovações e reprovações' });
    });

    panel('Resumo', 'Quantidade de provas, nota média e última prova corrigida', function (st, out) {
      var stats = statsByTipo(st, applyFilter(st));
      if (!stats.length) { out.innerHTML = NO_DATA; return; }
      var tot = stats.reduce(function (a, s) { return a + s.n; }, 0);
      out.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tipo de prova</th><th class="num">Provas feitas</th><th class="num">Nota média</th><th class="num">Aprovados</th><th class="num">Reprovados</th><th>Última prova corrigida</th></tr></thead><tbody>' +
        stats.map(function (s) {
          return '<tr><td>' + esc(s.nome) + '</td><td class="num">' + s.n + '</td><td class="num">' + (s.media === null ? '—' : gradeBadge(s.media)) + '</td><td class="num">' + s.apr + '</td><td class="num">' + s.rep + '</td><td>' + fmtData(s.last) + '</td></tr>';
        }).join('') +
        '</tbody><tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>' + tot + '</strong></td><td colspan="4"></td></tr></tfoot></table></div>';
    });
  }

  /* ===================== Página: Banco de dados ===================== */
  function renderBanco(root) {
    root.appendChild(el('<section class="card page-title"><div class="card-head"><h1>Banco de dados</h1></div></section>'));
    var sb = el('<div class="searchbar"><input type="search" id="q" placeholder="🔍  Pesquisar colaborador pelo nome…" aria-label="Pesquisar colaborador" autocomplete="off"></div>');
    root.appendChild(sb);
    var holder = document.createElement('div');
    root.appendChild(holder);
    function draw() {
      var q = norm($('#q').value);
      var html = '', shown = 0;
      TIPOS.forEach(function (t) {
        var all = DB.filter(function (r) { return r.tipo === t.id; });
        var rs = all.filter(function (r) { return !q || norm(r.nome).indexOf(q) >= 0; })
          .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
        if (q && !rs.length) return;
        shown++;
        html += '<section class="card"><div class="card-head list-head" style="justify-content:center;gap:14px"><h2>' + esc(t.nome) + '</h2><span class="badge">' + (q ? rs.length + ' de ' + all.length : all.length) + '</span></div><div class="card-body">' +
          (rs.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Colaborador</th><th>Tipo de prova</th><th>Data</th><th class="num">Nota</th></tr></thead><tbody>' +
            rs.map(function (r) { return '<tr><td>' + esc(r.nome) + '</td><td>' + esc(t.nome) + '</td><td>' + fmtData(r.data) + '</td><td class="num">' + gradeBadge(r.nota) + '</td></tr>'; }).join('') +
            '</tbody></table></div>' : '<div class="empty">Nenhuma prova registrada.</div>') +
          '</div></section>';
      });
      holder.innerHTML = shown ? html : '<section class="card page-title"><div class="card-body"><div class="empty">Nenhum colaborador encontrado.</div></div></section>';
    }
    $('#q').addEventListener('input', draw);
    draw();
  }

  /* ===================== Página: Administração ===================== */
  function isAuth() { try { return sessionStorage.getItem(AUTH_KEY) === '1'; } catch (e) { return false; } }

  function renderAdmin(root) {
    if (!isAuth()) return renderLogin(root);
    root.appendChild(el('<section class="card page-title"><div class="card-head"><h1>Administração</h1></div></section>'));
    var pending = [];

    /* --- Registro de provas --- */
    var c1 = card('Registro de provas e usuários', 'Solte aqui o HTML de notas exportado (um ou vários arquivos) ou cole o código');
    var b1 = $('.card-body', c1);
    b1.innerHTML =
      '<div class="drop" id="drop" tabindex="0" role="button" aria-label="Soltar arquivos HTML"><strong>⬇ Solte o(s) arquivo(s) HTML aqui</strong>ou clique para selecionar<input type="file" id="file" accept=".html,.htm,.txt,text/html" multiple hidden></div>' +
      '<div style="margin-top:16px"><label class="lbl" for="paste">Ou cole o código HTML:</label><textarea id="paste" placeholder="<!DOCTYPE html><html>…"></textarea>' +
      '<div class="actions"><button class="btn light" id="parse">Ler HTML colado</button></div></div>' +
      '<div id="preview"></div>';
    root.appendChild(c1);

    function drawPreview() {
      var box = $('#preview', root);
      if (!pending.length) { box.innerHTML = ''; return; }
      var seen = {}; DB.forEach(function (r) { seen[recKey(r)] = 1; });
      var ready = true, newCount = 0;
      var html = pending.map(function (p, idx) {
        var rows = '';
        if (!p.error) {
          rows = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Colaborador</th><th>Data</th><th class="num">Nota</th><th></th></tr></thead><tbody>' +
            p.rows.map(function (r) {
              var dup = p.tipo && seen[recKey({ nome: r.nome, tipo: p.tipo, ini: r.ini, data: r.data })];
              if (p.tipo && !dup) newCount++;
              return '<tr><td>' + esc(r.nome) + '</td><td>' + fmtData(r.data) + '</td><td class="num">' + gradeBadge(r.nota) + '</td><td>' + (dup ? '<span class="tag dup">já registrada</span>' : '') + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        }
        if (!p.tipo && !p.error) ready = false;
        return '<div class="preview"><h3>' + esc(p.fileName || 'HTML colado') + ' <span class="tag">' + p.rows.length + ' provas' + (p.skipped ? ' · ' + p.skipped + ' sem nota ignoradas' : '') + '</span></h3>' +
          (p.error ? '<div class="err">' + esc(p.error) + '</div>' :
            '<div class="meta"><label class="lbl" for="tp' + idx + '">Tipo de prova:</label><select id="tp' + idx + '" data-idx="' + idx + '"><option value="">Selecione…</option>' +
            TIPOS.map(function (t) { return '<option value="' + t.id + '"' + (p.tipo === t.id ? ' selected' : '') + '>' + esc(t.nome) + '</option>'; }).join('') + '</select>' +
            (p.title ? '<span class="hint">Título no HTML: ' + esc(p.title) + '</span>' : '') + '</div>' + rows) + '</div>';
      }).join('');
      html += '<div class="actions"><button class="btn" id="commit"' + (ready && newCount ? '' : ' disabled') + '>Registrar ' + newCount + ' prova(s)</button><button class="btn ghost" id="cancel">Cancelar</button></div>' +
        (!ready ? '<div class="hint">Escolha o tipo de prova nos blocos em que ele não foi identificado automaticamente.</div>' : '');
      box.innerHTML = html;
    }
    function ingest(text, name) { pending.push(parseExam(text, name)); drawPreview(); }
    function readFiles(files) {
      Array.prototype.forEach.call(files, function (f) {
        var fr = new FileReader();
        fr.onload = function () { ingest(String(fr.result), f.name); };
        fr.readAsText(f);
      });
    }
    var drop = $('#drop', root), file = $('#file', root);
    drop.addEventListener('click', function () { file.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    file.addEventListener('change', function () { readFiles(file.files); file.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { readFiles(e.dataTransfer.files); });
    $('#parse', root).addEventListener('click', function () {
      var t = $('#paste', root).value.trim();
      if (!t) { toast('Cole o código HTML primeiro.'); return; }
      ingest(t, ''); $('#paste', root).value = '';
    });
    $('#preview', root).addEventListener('change', function (e) {
      if (e.target.matches('select[data-idx]')) { pending[+e.target.dataset.idx].tipo = e.target.value; drawPreview(); }
    });
    $('#preview', root).addEventListener('click', function (e) {
      if (e.target.id === 'cancel') { pending = []; drawPreview(); }
      if (e.target.id === 'commit') {
        var list = [];
        pending.forEach(function (p) { if (!p.error && p.tipo) p.rows.forEach(function (r) { list.push({ nome: r.nome, tipo: p.tipo, nota: r.nota, data: r.data, ini: r.ini }); }); });
        var res = addRecords(list);
        pending = []; drawPreview(); drawRecords();
        toast(res.added + ' prova(s) registrada(s)' + (res.dups ? ' · ' + res.dups + ' duplicada(s) ignorada(s)' : '') + '.');
      }
    });

    /* --- Registros existentes --- */
    var c2 = card('Provas registradas', 'Gerencie, exporte e publique os dados');
    var b2 = $('.card-body', c2);
    b2.innerHTML =
      '<div class="filters"><div class="f"><label class="lbl" for="rt">Tipo de prova</label><select id="rt"><option value="">Todas</option>' + TIPOS.map(function (t) { return '<option value="' + t.id + '">' + esc(t.nome) + '</option>'; }).join('') + '</select></div>' +
      '<div class="f grow"><label class="lbl" for="rq">Colaborador</label><input type="search" id="rq" placeholder="Filtrar por nome…"></div></div>' +
      '<div id="records"></div><div class="sep"></div>' +
      '<div class="row-flex"><div class="actions" style="margin:0"><button class="btn light" id="exp">⬇ Exportar provas.json</button><button class="btn ghost" id="imp">⬆ Importar JSON</button><input type="file" id="impf" accept=".json,application/json" hidden></div>' +
      '<div class="actions" style="margin:0"><button class="btn ghost" id="reload">Recarregar dados publicados</button><button class="btn danger" id="wipe">Apagar tudo</button></div></div>' +
      '<p class="hint">Os registros ficam salvos neste navegador. Para que todos os visitantes do site vejam os dados, exporte o <b>provas.json</b> e substitua o arquivo <code>data/provas.json</code> do repositório (veja o README).</p>';
    root.appendChild(c2);

    function drawRecords() {
      var t = $('#rt', root).value, q = norm($('#rq', root).value);
      var rs = DB.filter(function (r) { return (!t || r.tipo === t) && (!q || norm(r.nome).indexOf(q) >= 0); })
        .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
      var box = $('#records', root);
      if (!rs.length) { box.innerHTML = '<div class="empty">Nenhuma prova registrada.</div>'; return; }
      var cut = rs.slice(0, 300);
      box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Colaborador</th><th>Tipo de prova</th><th>Data</th><th class="num">Nota</th><th></th></tr></thead><tbody>' +
        cut.map(function (r) { return '<tr><td>' + esc(r.nome) + '</td><td>' + esc(TIPO_NOME[r.tipo]) + '</td><td>' + fmtData(r.data) + '</td><td class="num">' + gradeBadge(r.nota) + '</td><td class="num"><button class="btn danger sm" data-del="' + esc(r.id) + '">Excluir</button></td></tr>'; }).join('') +
        '</tbody></table></div><div class="hint">' + rs.length + ' prova(s)' + (rs.length > cut.length ? ' · exibindo as 300 mais recentes' : '') + '</div>';
    }
    $('#rt', root).addEventListener('change', drawRecords);
    $('#rq', root).addEventListener('input', drawRecords);
    $('#records', root).addEventListener('click', function (e) {
      var id = e.target.dataset && e.target.dataset.del;
      if (!id) return;
      if (confirm('Excluir esta prova?')) { DB = DB.filter(function (r) { return r.id !== id; }); saveDB(); drawRecords(); }
    });
    $('#exp', root).addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' }));
      a.download = 'provas.json'; document.body.appendChild(a); a.click(); a.remove();
    });
    $('#imp', root).addEventListener('click', function () { $('#impf', root).click(); });
    $('#impf', root).addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var a = JSON.parse(fr.result); if (!Array.isArray(a)) throw 0;
          var res = addRecords(a); drawRecords();
          toast(res.added + ' prova(s) importada(s)' + (res.dups ? ' · ' + res.dups + ' já existiam' : '') + '.');
        } catch (x) { toast('Arquivo JSON inválido.'); }
      };
      fr.readAsText(f); e.target.value = '';
    });
    $('#reload', root).addEventListener('click', function () {
      if (!confirm('Substituir os dados deste navegador pelos dados publicados no site (data/provas.json)?')) return;
      fetchPublished().then(function (a) { DB = a.map(cleanRec).filter(Boolean); saveDB(); drawRecords(); toast('Dados publicados carregados (' + DB.length + ').'); });
    });
    $('#wipe', root).addEventListener('click', function () {
      if (confirm('Apagar TODAS as provas deste navegador? Esta ação não pode ser desfeita.')) { DB = []; saveDB(); drawRecords(); }
    });
    root.appendChild(el('<div style="text-align:center;margin-bottom:10px"><button class="btn ghost" id="logout">Sair da administração</button></div>'));
    $('#logout', root).addEventListener('click', function () { try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {} route(); });
    drawRecords();
  }

  function renderLogin(root) {
    var c = el('<section class="card login"><div class="card-head"><h1>Administração</h1></div><div class="card-body">' +
      '<form id="lf" autocomplete="off"><div class="row"><label class="lbl" for="u">Login: <span class="req">*</span></label><input type="text" id="u" required autocomplete="username"></div>' +
      '<div class="row"><label class="lbl" for="p">Senha: <span class="req">*</span></label><input type="password" id="p" required autocomplete="current-password"></div>' +
      '<button class="btn" type="submit" style="width:100%">Entrar</button><div class="err" id="err" role="alert"></div></form></div></section>');
    root.appendChild(c);
    $('#u', c).focus();
    $('#lf', c).addEventListener('submit', function (e) {
      e.preventDefault();
      var u = $('#u', c).value.trim().toLowerCase().replace(/\s+/g, ' '), p = $('#p', c).value;
      Promise.all([sha256(u), sha256(p)]).then(function (h) {
        if (h[0] === USER_HASH && h[1] === PASS_HASH) { try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (x) {} route(); }
        else { $('#err', c).textContent = 'Login ou senha incorretos.'; $('#p', c).value = ''; }
      }).catch(function () { $('#err', c).textContent = 'Este navegador não suporta a verificação de senha (use HTTPS).'; });
    });
  }

  /* ===================== Menu e rotas ===================== */
  var drawer = $('#drawer'), overlay = $('#overlay'), menuBtn = $('#menuBtn');
  function setMenu(open) {
    drawer.classList.toggle('open', open);
    overlay.hidden = !open;
    menuBtn.setAttribute('aria-expanded', open);
    drawer.setAttribute('aria-hidden', !open);
    menuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  }
  menuBtn.addEventListener('click', function () { setMenu(!drawer.classList.contains('open')); });
  overlay.addEventListener('click', function () { setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  drawer.addEventListener('click', function (e) { if (e.target.tagName === 'A') setMenu(false); });

  var ROUTES = { inicio: renderInicio, banco: renderBanco, admin: renderAdmin };
  var TITLES = { inicio: 'Início', banco: 'Banco de dados', admin: 'Administração' };
  function route() {
    var name = (location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0];
    if (!ROUTES[name]) name = 'inicio';
    var app = $('#app');
    app.innerHTML = '';
    ROUTES[name](app);
    document.title = TITLES[name] + ' | Gestão de Provas Técnicas – CARMAK';
    document.querySelectorAll('.drawer a').forEach(function (a) { a.classList.toggle('active', a.dataset.route === name); });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  loadDB().then(route);
})();
