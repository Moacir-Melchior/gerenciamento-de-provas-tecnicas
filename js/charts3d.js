/* Gráficos 3D simples em canvas (sem dependências) — projeção oblíqua. */
(function (global) {
  'use strict';

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return n * p;
  }

  function shortLabel(s, max) {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  // desenha eixos/grade; devolve geometria
  function frame(ctx, w, h, labels, yMax, yFmt, depth) {
    const compact = w < 560;
    const padL = 44, padR = 14 + depth, padT = 16 + depth, padB = compact ? 74 : 56;
    const x0 = padL, x1 = w - padR, yB = h - padB, yT = padT;
    ctx.font = '12px Roboto, sans-serif';
    ctx.fillStyle = '#555';
    ctx.strokeStyle = '#e1e1e1';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = yMax * i / ticks;
      const y = yB - (yB - yT) * i / ticks;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1 + depth, y - depth);
      ctx.stroke();
      ctx.fillText(yFmt(v), x0 - 6, y);
    }
    // piso 3D
    ctx.fillStyle = '#efefef';
    ctx.beginPath();
    ctx.moveTo(x0, yB); ctx.lineTo(x1, yB);
    ctx.lineTo(x1 + depth, yB - depth); ctx.lineTo(x0 + depth, yB - depth);
    ctx.closePath(); ctx.fill();
    // rótulos
    const n = labels.length;
    const slot = (x1 - x0) / n;
    ctx.fillStyle = '#333';
    ctx.textBaseline = 'top';
    labels.forEach(function (lb, i) {
      const cx = x0 + slot * (i + 0.5);
      ctx.save();
      ctx.translate(cx, yB + 10);
      if (compact) { ctx.rotate(-Math.PI / 4); ctx.textAlign = 'right'; }
      else ctx.textAlign = 'center';
      const txt = shortLabel(lb, compact ? 22 : 16);
      if (!compact && lb.indexOf(' ') > 0) {
        const parts = lb.split(' ');
        const last = parts.pop();
        ctx.fillText(parts.join(' '), 0, 0);
        ctx.fillText(last, 0, 14);
      } else ctx.fillText(txt, 0, 0);
      ctx.restore();
    });
    return { x0: x0, x1: x1, yB: yB, yT: yT, slot: slot };
  }

  function empty(ctx, w, h, msg) {
    ctx.fillStyle = '#777';
    ctx.font = '15px Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, w / 2, h / 2);
  }

  /* ---------- COLUNAS 3D ---------- */
  function columns3d(canvas, items, opts) {
    opts = opts || {};
    const s = setup(canvas), ctx = s.ctx;
    const depth = Math.min(22, Math.max(12, s.w / 40));
    const max = niceMax(Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1])));
    const g = frame(ctx, s.w, s.h, items.map(function (i) { return i.label; }), max,
      function (v) { return String(Math.round(v)); }, depth);
    const bw = Math.min(54, g.slot * 0.58);
    const hits = [];
    items.forEach(function (it, i) {
      const cx = g.x0 + g.slot * (i + 0.5);
      const xL = cx - bw / 2, xR = cx + bw / 2;
      const hgt = (g.yB - g.yT) * it.value / max;
      const yTop = g.yB - hgt;
      const col = it.color;
      if (it.value > 0) {
        // frente
        ctx.fillStyle = col; ctx.fillRect(xL, yTop, bw, hgt);
        // lateral
        ctx.fillStyle = shade(col, 0.68);
        ctx.beginPath();
        ctx.moveTo(xR, yTop); ctx.lineTo(xR + depth, yTop - depth);
        ctx.lineTo(xR + depth, g.yB - depth); ctx.lineTo(xR, g.yB);
        ctx.closePath(); ctx.fill();
        // topo
        ctx.fillStyle = shade(col, 1.18);
        ctx.beginPath();
        ctx.moveTo(xL, yTop); ctx.lineTo(xR, yTop);
        ctx.lineTo(xR + depth, yTop - depth); ctx.lineTo(xL + depth, yTop - depth);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#222';
      ctx.font = 'bold 13px Roboto, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(String(it.value), cx + depth / 2, yTop - depth - 3);
      hits.push({ x: xL, y: yTop - depth, w: bw + depth, h: hgt + depth, text: it.label + ': ' + it.value + (it.value === 1 ? ' prova' : ' provas') });
    });
    attachTip(canvas, hits);
  }

  /* ---------- ÁREA 3D ---------- */
  function area3d(canvas, items, opts) {
    opts = opts || {};
    const s = setup(canvas), ctx = s.ctx;
    const depth = Math.min(26, Math.max(14, s.w / 36));
    const max = 10;
    const g = frame(ctx, s.w, s.h, items.map(function (i) { return i.label; }), max,
      function (v) { return v.toFixed(0); }, depth);
    const base = '#96c957', dark = '#286c46';
    const pts = items.map(function (it, i) {
      const x = g.x0 + g.slot * (i + 0.5);
      const v = it.value == null ? 0 : it.value;
      return { x: x, y: g.yB - (g.yB - g.yT) * v / max, v: it.value, label: it.label, n: it.n };
    });
    if (pts.length < 2) { empty(ctx, s.w, s.h, 'Sem dados'); return; }

    // faces superiores (inclinadas) de cada segmento
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      ctx.fillStyle = shade(base, 0.8 + 0.3 * (i % 2 ? 0.5 : 1));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x + depth, b.y - depth); ctx.lineTo(a.x + depth, a.y - depth);
      ctx.closePath(); ctx.fill();
    }
    // parede de fundo
    ctx.fillStyle = shade(base, 0.55);
    ctx.beginPath();
    ctx.moveTo(pts[0].x + depth, g.yB - depth);
    pts.forEach(function (p) { ctx.lineTo(p.x + depth, p.y - depth); });
    ctx.lineTo(pts[pts.length - 1].x + depth, g.yB - depth);
    ctx.closePath(); ctx.fill();
    // lateral direita
    const L = pts[pts.length - 1];
    ctx.fillStyle = shade(base, 0.62);
    ctx.beginPath();
    ctx.moveTo(L.x, L.y); ctx.lineTo(L.x + depth, L.y - depth);
    ctx.lineTo(L.x + depth, g.yB - depth); ctx.lineTo(L.x, g.yB);
    ctx.closePath(); ctx.fill();
    // frente
    const grad = ctx.createLinearGradient(0, g.yT, 0, g.yB);
    grad.addColorStop(0, base); grad.addColorStop(1, shade(base, 0.82));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, g.yB);
    pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(L.x, g.yB);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.stroke();

    const hits = [];
    pts.forEach(function (p) {
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      if (p.v != null) {
        ctx.fillStyle = '#222';
        ctx.font = 'bold 12px Roboto, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(p.v.toFixed(1).replace('.', ','), p.x, p.y - 8);
      }
      hits.push({ x: p.x - 14, y: p.y - 14, w: 28, h: 28,
        text: p.label + ': ' + (p.v == null ? 'sem provas' : 'média ' + p.v.toFixed(1).replace('.', ',') + ' (' + p.n + ')') });
    });
    attachTip(canvas, hits);
  }

  /* ---------- dica ao passar o mouse ---------- */
  function attachTip(canvas, hits) {
    canvas._hits = hits;
    if (canvas._tipBound) return;
    canvas._tipBound = true;
    const wrap = canvas.parentElement;
    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;pointer-events:none;background:#111;color:#fff;font:12px Roboto,sans-serif;padding:5px 9px;border-radius:7px;display:none;white-space:nowrap;z-index:5';
    wrap.appendChild(tip);
    function move(e) {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      const x = t.clientX - r.left, y = t.clientY - r.top;
      const h = (canvas._hits || []).find(function (k) { return x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h; });
      if (h) {
        tip.textContent = h.text;
        tip.style.display = 'block';
        tip.style.left = Math.min(x + 12, r.width - tip.offsetWidth - 4) + 'px';
        tip.style.top = Math.max(4, y - 30) + 'px';
      } else tip.style.display = 'none';
    }
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('touchstart', move, { passive: true });
    canvas.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
  }

  function emptyChart(canvas, msg) {
    const s = setup(canvas);
    empty(s.ctx, s.w, s.h, msg);
    canvas._hits = [];
  }

  global.Charts3D = { columns3d: columns3d, area3d: area3d, empty: emptyChart };
})(window);
