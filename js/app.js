/* Отрисовка страницы: карта, паспорт квартала, бюджет, графики, матрица. */
(function () {
  var CATS = [
    { key: 'Core', color: 'var(--cds-chart-categorical-1)' },
    { key: 'Усиление', color: 'var(--cds-chart-categorical-2)' },
    { key: 'Санитарный минимум', color: 'var(--cds-chart-muted)' },
    { key: 'Кандидат на вывод', color: 'var(--color-fg-muted)' }
  ];
  var catColor = function (k) { var c = CATS.find(function (x) { return x.key === k; }); return c ? c.color : 'var(--cds-chart-muted)'; };
  var ru = d3.formatLocale({ decimal: ',', thousands: ' ', grouping: [3], currency: ['', ''] });
  var F = {
    d0: ru.format(',.0f'), d1: ru.format(',.1f'), d2: ru.format(',.2f'),
    pct: function (v) { return ru.format('.0f')(v * 100) + '%'; },
    txt: function (v) { return v == null ? '' : String(v); },
    sgn: function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + ru.format('.0f')(Math.abs(v)) + '%'; }
  };
  var fmt = function (kind, v) { return (F[kind] || F.txt)(v); };
  var plural = function (n, forms) {
    n = Math.abs(Math.round(n)); var a = n % 10, b = n % 100;
    return (a === 1 && b !== 11) ? forms[0] : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? forms[1] : forms[2];
  };
  var enc = function (v) { return String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D'); };
  var dec = function (v) { return decodeURIComponent(v); };
  var DEF = { q: '2-20', scenario: '400 га', norm: '200 руб/дерево', mode: 'decision' };
  var P = function () { var p = (window.dash && dash.params && dash.params()) || {}; return Object.assign({}, DEF, p); };
  var get = function (id) { return dash.data(id); };
  var ui = { cat: 'all', search: '', sort: { key: 'level_2027', dir: -1 } };
  var root = document.getElementById('as');

  var rowWhere = function (rows, where) {
    var parts = where.split('&').map(function (s) { var i = s.indexOf('='); return [dec(s.slice(0, i)), dec(s.slice(i + 1))]; });
    return rows.find(function (r) { return parts.every(function (p) { return String(r[p[0]]) === p[1]; }); });
  };
  var setMark = function (el, src, field, where, text) {
    el.setAttribute('data-source', src); el.setAttribute('data-field', field);
    if (where) el.setAttribute('data-where', where);
    el.textContent = text; el.classList.remove('dash-skeleton');
  };
  var failBox = function (box) { var d = document.createElement('div'); d.className = 'as-fail'; d.textContent = 'Не удалось загрузить данные'; box.replaceChildren(d); box.classList.remove('dash-skeleton'); };
  var waitBox = function (box) { box.replaceChildren(); box.classList.add('dash-skeleton'); };
  var gate = function (box, ids) {
    var st = ids.map(function (id) { return get(id).status; });
    if (st.every(function (s) { return s === 'ok'; })) { box.classList.remove('dash-skeleton'); return true; }
    if (st.some(function (s) { return s === 'error' || s === 'missing'; })) failBox(box); else waitBox(box);
    return false;
  };

  /* ---------- tooltip ---------- */
  var tip = function (box) {
    var t = box.querySelector(':scope > .as-tip');
    if (!t) { t = document.createElement('div'); t.className = 'as-tip'; t.setAttribute('role', 'status'); box.appendChild(t); }
    return t;
  };
  var showTip = function (box, evt, lines) {
    var t = tip(box);
    t.replaceChildren.apply(t, lines.map(function (l, i) { var d = document.createElement('div'); if (i === 0) d.className = 't'; d.textContent = l; return d; }));
    t.style.opacity = 1;
    var r = box.getBoundingClientRect(), tw = t.offsetWidth, th = t.offsetHeight;
    var x = evt.clientX - r.left + 14, y = evt.clientY - r.top + 14;
    if (x + tw > r.width) x = Math.max(0, evt.clientX - r.left - tw - 14);
    if (y + th > r.height) y = Math.max(0, evt.clientY - r.top - th - 14);
    t.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  };
  var hideTip = function (box) { var t = box.querySelector(':scope > .as-tip'); if (t) t.style.opacity = 0; };
  var svgIn = function (box, label) {
    var keepTip = box.querySelector(':scope > .as-tip');
    box.replaceChildren(); if (keepTip) { keepTip.style.opacity = 0; box.appendChild(keepTip); }
    var svg = d3.select(box).insert('svg', ':first-child').attr('width', '100%').attr('role', 'img').attr('aria-label', label);
    return svg;
  };
  var noAxisFont = function (g) { g.attr('font-size', null).attr('font-family', null); g.selectAll('text').style('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)'); g.selectAll('.domain').remove(); g.selectAll('line').style('stroke', 'var(--cds-chart-grid)'); };
  var topRound = function (x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  };
  var selectQuarter = function (id, scroll) {
    dash.setParams({ q: id });
    if (scroll) {
      var pass = document.getElementById('passport'), r = pass.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.6) pass.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /* ---------- static marks from summary ---------- */
  function drawStatic() {
    var S = get('summary');
    root.querySelectorAll('[data-source="summary"][data-field][data-where]').forEach(function (el) {
      if (S.status !== 'ok') { el.textContent = '—'; if (S.status !== 'error') el.classList.add('dash-skeleton'); return; }
      var r = rowWhere(S.data, el.getAttribute('data-where'));
      el.textContent = r ? fmt(el.getAttribute('data-fmt') || 'd1', r[el.getAttribute('data-field')]) : '—';
      el.classList.remove('dash-skeleton');
    });
    root.querySelectorAll('[data-plural]').forEach(function (el) {
      var p = el.getAttribute('data-plural').split('|'), D = get(p[0]);
      if (D.status !== 'ok') return;
      var r = rowWhere(D.data, p[1]);
      if (r) el.textContent = plural(r[p[2]], ['квартал', 'квартала', 'кварталов']);
    });
  }

  /* ---------- controls ---------- */
  function drawControls() {
    var p = P();
    root.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === p.mode)); });
    root.querySelectorAll('[data-scn]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-scn') === p.scenario)); });
    root.querySelectorAll('[data-norm]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-norm') === p.norm)); });
    root.querySelectorAll('[data-cat]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cat') === ui.cat)); });
    root.querySelectorAll('.js-scn').forEach(function (s) { s.textContent = p.scenario; });
    root.querySelectorAll('.js-norm-label').forEach(function (s) { s.textContent = 'норматив ' + p.norm; });
  }
  root.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { dash.setParams({ mode: b.getAttribute('data-mode') }); }); });
  root.querySelectorAll('[data-scn]').forEach(function (b) { b.addEventListener('click', function () { dash.setParams({ scenario: b.getAttribute('data-scn') }); }); });
  root.querySelectorAll('[data-norm]').forEach(function (b) { b.addEventListener('click', function () { dash.setParams({ norm: b.getAttribute('data-norm') }); }); });
  root.querySelectorAll('[data-cat]').forEach(function (b) { b.addEventListener('click', function () { ui.cat = b.getAttribute('data-cat'); drawControls(); drawTable(); }); });
  document.getElementById('q-search').addEventListener('input', function (e) { ui.search = e.target.value.trim().toLowerCase(); drawTable(); });

  /* ---------- map ---------- */
  function drawMap() {
    var box = document.getElementById('map'), leg = document.getElementById('map-legend');
    if (!gate(box, ['quarters', 'sections'])) { leg.replaceChildren(); return; }
    var Q = get('quarters').data, S = get('sections').data, p = P();
    var inKey = 'in_' + String(p.scenario).split(' ')[0];
    var W = 1000, H = d3.max(S, function (s) { return s.y + s.h; }) + 2;
    var bw = box.clientWidth || 600, k = bw / W;
    var svg = svgIn(box, 'Карта кварталов условного сада').attr('viewBox', '0 0 ' + W + ' ' + H);
    var pat = svg.append('defs').append('pattern').attr('id', 'as-hatch-map').attr('patternUnits', 'userSpaceOnUse').attr('width', 7).attr('height', 7).attr('patternTransform', 'rotate(45)');
    pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 7).style('stroke', 'var(--color-fg)').style('stroke-width', 1.6).style('stroke-opacity', 0.5);
    var fs = Math.max(11, 11 / k);
    var sec = svg.append('g');
    S.forEach(function (s) {
      sec.append('text').attr('x', s.x + 2).attr('y', s.y + 15).text(s.name + ' · ' + F.d0(s.ha) + ' га')
        .style('font-size', Math.min(15, Math.max(11, 11 / k)) + 'px').style('fill', 'var(--color-fg-muted)');
    });
    var g = svg.append('g');
    var fill = function (d) { return p.mode === 'program' ? (d[inKey] ? 'var(--cds-chart-categorical-1)' : 'var(--cds-chart-muted)') : catColor(d.category); };
    var cells = g.selectAll('g').data(Q, function (d) { return d.id; }).join('g').style('cursor', 'pointer');
    cells.append('rect').attr('class', 'cell').attr('x', function (d) { return d.mx; }).attr('y', function (d) { return d.my; })
      .attr('width', function (d) { return Math.max(1, d.mw); }).attr('height', function (d) { return Math.max(1, d.mh); }).attr('rx', 3)
      .style('fill', fill).style('fill-opacity', function (d) { return p.mode === 'program' && !d[inKey] ? 0.6 : 1; })
      .style('stroke', 'var(--color-panel)').style('stroke-width', 1);
    cells.filter(function (d) { return d.confidence === 'Нужна проверка'; }).append('rect')
      .attr('x', function (d) { return d.mx; }).attr('y', function (d) { return d.my; })
      .attr('width', function (d) { return Math.max(1, d.mw); }).attr('height', function (d) { return Math.max(1, d.mh); }).attr('rx', 3)
      .style('fill', 'url(#as-hatch-map)').style('pointer-events', 'none');
    if (bw >= 520) {
      cells.filter(function (d) { return d.mw * k >= 34 && d.mh * k >= 16; }).append('text')
        .attr('x', function (d) { return d.mx + 4 / k; }).attr('y', function (d) { return d.my + fs + 2 / k; }).text(function (d) { return d.id; })
        .style('font-size', fs + 'px').style('fill', 'var(--color-fg)').style('paint-order', 'stroke').style('stroke', 'var(--color-panel)')
        .style('stroke-width', (3 / k) + 'px').style('stroke-linejoin', 'round').style('pointer-events', 'none');
    }
    var sel = Q.find(function (d) { return d.id === p.q; });
    if (sel) g.append('rect').attr('x', sel.mx - 1).attr('y', sel.my - 1).attr('width', sel.mw + 2).attr('height', sel.mh + 2).attr('rx', 4)
      .style('fill', 'none').style('stroke', 'var(--color-fg)').style('stroke-width', Math.max(3, 2.5 / k)).style('pointer-events', 'none');
    cells.on('mousemove', function (evt, d) {
      d3.select(this).select('.cell').style('stroke', 'var(--color-fg)').style('stroke-width', Math.max(1.5, 1.5 / k));
      showTip(box, evt, [d.id + ' · ' + d.section_name, d.variety + ', ' + d.year_planted + ' · ' + F.d1(d.area_ha) + ' га',
        'Уровень 2027: ' + F.d1(d.level_2027) + ' т/га', d.category + (d.confidence === 'Нужна проверка' ? ' · нужна проверка' : '')]);
    }).on('mouseleave', function () { d3.select(this).select('.cell').style('stroke', 'var(--color-panel)').style('stroke-width', 1); hideTip(box); })
      .on('click', function (evt, d) { selectQuarter(d.id, true); });
    var items = p.mode === 'program'
      ? [['var(--cds-chart-categorical-1)', 'В программе ' + p.scenario], ['var(--cds-chart-muted)', 'Санитарный минимум']]
      : CATS.map(function (c) { return [c.color, c.key]; });
    leg.replaceChildren.apply(leg, items.map(function (it) { var s = document.createElement('span'), w = document.createElement('i'); w.className = 'as-sw'; w.style.background = it[0]; s.append(w, it[1]); return s; })
      .concat([(function () { var s = document.createElement('span'), w = document.createElement('i'); w.className = 'as-sw as-hatch'; s.append(w, 'Нужна проверка весной'); return s; })()]));
  }

  /* ---------- passport ---------- */
  function drawPassport() {
    var Qs = get('quarters'), p = P();
    var marks = root.querySelectorAll('#passport [data-pf]');
    if (Qs.status !== 'ok') { marks.forEach(function (el) { el.textContent = '—'; }); return null; }
    var d = Qs.data.find(function (r) { return r.id === p.q; }) || Qs.data[0];
    var where = 'id=' + enc(d.id);
    marks.forEach(function (el) { var f = el.getAttribute('data-field'); setMark(el, 'quarters', f, where, fmt(el.getAttribute('data-pf'), d[f])); });
    root.querySelector('.js-pass-sw').style.background = catColor(d.category);
    root.querySelector('.js-visit').hidden = !d.field_visit;
    drawYield(d); drawLoss(d);
    return d;
  }

  function drawYield(d) {
    var box = document.getElementById('yield-chart');
    if (!gate(box, ['yields', 'quarters'])) return;
    var rows = get('yields').data.filter(function (r) { return r.id === d.id; }).sort(function (a, b) { return a.year - b.year; });
    var W = box.clientWidth || 360, H = 200, m = { t: 12, r: 8, b: 24, l: 30 };
    var years = rows.map(function (r) { return String(r.year); }).concat(['2027']);
    var x = d3.scaleBand(years, [m.l, W - m.r]).padding(0.32);
    var top = Math.max(30, d3.max(rows, function (r) { return r.t_ha; }) || 0, d.ci_high) * 1.08;
    var y = d3.scaleLinear([0, top], [H - m.b, m.t]).nice();
    var svg = svgIn(box, 'Урожай по годам и уровень квартала').attr('viewBox', '0 0 ' + W + ' ' + H).attr('height', H);
    var gy = svg.append('g').attr('transform', 'translate(' + m.l + ',0)').call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickPadding(6));
    noAxisFont(gy);
    var gx = svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').call(d3.axisBottom(x).tickSize(0).tickPadding(7).tickFormat(function (t) { return t === '2027' ? '2027, оценка' : t; }));
    noAxisFont(gx);
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--cds-chart-axis)');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(25)).attr('y2', y(25)).style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '4 3');
    svg.append('g').selectAll('path').data(rows).join('path')
      .attr('d', function (r) { return topRound(x(String(r.year)), y(r.t_ha), x.bandwidth(), y(0) - y(r.t_ha), 4); })
      .style('fill', 'var(--cds-chart-muted)');
    svg.append('text').attr('x', m.l + 4).attr('y', y(25) - 5).text('цель Core 25').style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)')
      .style('paint-order', 'stroke').style('stroke', 'var(--color-panel)').style('stroke-width', '3px');
    var cx = x('2027') + x.bandwidth() / 2;
    var est = svg.append('g').style('color', catColor(d.category));
    est.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(d.ci_low)).attr('y2', y(d.ci_high)).style('stroke', 'currentColor').style('stroke-width', 2);
    [d.ci_low, d.ci_high].forEach(function (v) { est.append('line').attr('x1', cx - 6).attr('x2', cx + 6).attr('y1', y(v)).attr('y2', y(v)).style('stroke', 'currentColor').style('stroke-width', 2); });
    est.append('circle').attr('cx', cx).attr('cy', y(d.level_2027)).attr('r', 5.5).style('fill', 'currentColor').style('stroke', 'var(--color-panel)').style('stroke-width', 2);
    svg.append('text').attr('x', cx - 10).attr('y', y(d.level_2027) + 4).attr('text-anchor', 'end').text(F.d1(d.level_2027))
      .style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg)').style('font-weight', 'var(--cds-font-weight-medium)')
      .style('paint-order', 'stroke').style('stroke', 'var(--color-panel)').style('stroke-width', '3px');
    svg.append('g').selectAll('rect').data(years).join('rect')
      .attr('x', function (t) { return x(t) - x.step() * x.paddingInner() / 2; }).attr('width', x.step()).attr('y', m.t).attr('height', H - m.b - m.t)
      .style('fill', 'transparent')
      .on('mousemove', function (evt, t) {
        if (t === '2027') return showTip(box, evt, ['2027, нормальный год', 'Уровень: ' + F.d1(d.level_2027) + ' т/га', 'Интервал 90%: ' + F.d1(d.ci_low) + '-' + F.d1(d.ci_high), 'С программой: ' + F.d1(d.with_program_2027) + ' т/га']);
        var r = rows.find(function (z) { return String(z.year) === t; });
        showTip(box, evt, [t + ', факт', F.d1(r.t_ha) + ' т/га']);
      }).on('mouseleave', function () { hideTip(box); });
  }

  function drawLoss(d) {
    var box = document.getElementById('loss-chart');
    if (!gate(box, ['losses'])) return;
    var rows = get('losses').data.filter(function (r) { return r.id === d.id; }).sort(function (a, b) { return a.step - b.step; });
    var losses = rows.filter(function (r) { return r.kind === 'loss'; });
    var W = box.clientWidth || 360, narrow = W < 430;
    var rowH = narrow ? 52 : 40, H = rows.length * rowH + 4, valW = narrow ? 0 : 178;
    var xmax = d3.max(rows, function (r) { return Math.abs(r.t_ha); }) || 1;
    var x = d3.scaleLinear([0, xmax * 1.02], [0, W - valW]);
    var svg = svgIn(box, 'Карта потерь квартала').attr('viewBox', '0 0 ' + W + ' ' + H).attr('height', H);
    var run = 0, prevEnd = null;
    rows.forEach(function (r, i) {
      var y0 = i * rowH, by = y0 + 19, bh = 13, a, b, col;
      if (r.kind === 'start') { a = 0; b = r.t_ha; run = r.t_ha; col = 'var(--cds-chart-muted)'; }
      else if (r.kind === 'loss') { a = run + r.t_ha; b = run; run = a; col = 'var(--cds-chart-status-critical)'; }
      else { a = 0; b = r.t_ha; col = catColor(d.category); }
      var gRow = svg.append('g');
      gRow.append('rect').attr('x', x(a)).attr('y', by).attr('width', Math.max(2, x(b) - x(a))).attr('height', bh).attr('rx', 3).style('fill', col);
      if (prevEnd !== null) svg.append('line').attr('x1', x(prevEnd)).attr('x2', x(prevEnd)).attr('y1', by - rowH + bh).attr('y2', by).style('stroke', 'var(--cds-chart-axis)').style('stroke-dasharray', '2 2');
      prevEnd = r.kind === 'loss' ? a : (r.kind === 'start' ? b : null);
      var lab = gRow.append('text').attr('x', 0).attr('y', y0 + 13).style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg)');
      lab.append('tspan').text(r.label).style('font-weight', r.kind === 'loss' ? null : 'var(--cds-font-weight-medium)');
      if (r.status) lab.append('tspan').text(' · ' + r.status.toLowerCase()).style('fill', 'var(--color-fg-muted)');
      var val = r.kind === 'loss' ? '−' + F.d1(-r.t_ha) + ' т/га · −' + F.d0(-r.rub_ha / 1000) + ' тыс. руб/га' : F.d1(r.t_ha) + ' т/га';
      gRow.append('text').attr('x', W).attr('y', narrow ? by + bh + 14 : by + bh - 2).attr('text-anchor', 'end').text(val)
        .style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg)').style('font-variant-numeric', 'tabular-nums');
    });
    if (!losses.length) {
      var n = document.createElement('p'); n.className = 'as-note'; n.textContent = 'Квартал на уровне ориентира или выше: технологических потерь модель не видит.'; box.appendChild(n);
    }
  }

  /* ---------- budget ---------- */
  function drawBudget() {
    var S = get('scenarios'), p = P(), key = p.scenario + ' | ' + p.norm;
    var tiles = root.querySelectorAll('#budget [data-bf]');
    var tbody = document.querySelector('#scn-table tbody');
    if (S.status !== 'ok') { tiles.forEach(function (el) { el.textContent = '—'; }); tbody.replaceChildren(); return; }
    var r = S.data.find(function (z) { return z.key === key; });
    tiles.forEach(function (el) {
      var bf = el.getAttribute('data-bf').split('|');
      setMark(el, 'scenarios', bf[0], 'key=' + enc(key), r ? fmt(bf[1], r[bf[0]]) : '—');
    });
    var cols = [['scenario', 'txt'], ['area_ha', 'd1'], ['quarters', 'd0'], ['trees_k', 'd0'], ['cost_program_mln', 'd1'], ['cost_sanitary_mln', 'd1'], ['cost_total_mln', 'd1'], ['harvest_program_t', 'd0'], ['yield_program_t_ha', 'd1'], ['cost_per_kg_rub', 'd2'], ['gray_ha', 'd1']];
    var hide = { trees_k: 1, cost_sanitary_mln: 1, harvest_program_t: 1 };
    var rows = S.data.filter(function (z) { return z.norm === p.norm; }).sort(function (a, b) { return a.target_ha - b.target_ha; });
    tbody.replaceChildren.apply(tbody, rows.map(function (z) {
      var tr = document.createElement('tr'); tr.setAttribute('data-key', z.key); tr.tabIndex = 0;
      if (z.key === key) tr.className = 'sel';
      cols.forEach(function (c, i) { var td = document.createElement('td'); td.textContent = fmt(c[1], z[c[0]]); if (i) td.className = 'n' + (hide[c[0]] ? ' w' : ''); tr.appendChild(td); });
      var pick = function () { dash.setParams({ scenario: z.scenario }); };
      tr.addEventListener('click', pick); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      return tr;
    }));
  }

  /* ---------- weather ---------- */
  function drawYears() {
    var box = document.getElementById('years-chart');
    if (!gate(box, ['years'])) return;
    var rows = get('years').data.slice().sort(function (a, b) { return a.year - b.year; });
    var W = box.clientWidth || 360, H = 220, m = { t: 22, r: 8, b: 24, l: 8 };
    var x = d3.scaleBand(rows.map(function (r) { return String(r.year); }), [m.l, W - m.r]).padding(0.3);
    var lo = Math.min(0, d3.min(rows, function (r) { return r.effect_pct; })), hi = Math.max(0, d3.max(rows, function (r) { return r.effect_pct; }));
    var y = d3.scaleLinear([lo * 1.15, hi * 1.25], [H - m.b, m.t]);
    var svg = svgIn(box, 'Эффект года относительно нормального года').attr('viewBox', '0 0 ' + W + ' ' + H).attr('height', H);
    svg.append('g').selectAll('path').data(rows).join('path')
      .attr('d', function (r) {
        var bx = x(String(r.year)), w = x.bandwidth(), v = r.effect_pct, h = Math.abs(y(v) - y(0)), rr = Math.min(4, w / 2, h);
        if (v >= 0) return topRound(bx, y(v), w, h, 4);
        return 'M' + bx + ',' + y(0) + 'V' + (y(v) - rr) + 'Q' + bx + ',' + y(v) + ' ' + (bx + rr) + ',' + y(v) + 'H' + (bx + w - rr) + 'Q' + (bx + w) + ',' + y(v) + ' ' + (bx + w) + ',' + (y(v) - rr) + 'V' + y(0) + 'Z';
      })
      .style('fill', function (r) { return r.effect_pct < 0 ? 'var(--cds-chart-status-critical)' : 'var(--cds-chart-categorical-1)'; })
      .on('mousemove', function (evt, r) { showTip(box, evt, [String(r.year) + (r.label ? ' · ' + r.label : ''), F.sgn(r.effect_pct) + ' к нормальному году']); })
      .on('mouseleave', function () { hideTip(box); });
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--cds-chart-axis)');
    svg.append('g').selectAll('text').data(rows).join('text')
      .attr('x', function (r) { return x(String(r.year)) + x.bandwidth() / 2; })
      .attr('y', function (r) { return r.effect_pct >= 0 ? y(r.effect_pct) - 6 : y(r.effect_pct) + 14; })
      .attr('text-anchor', 'middle').text(function (r) { return F.sgn(r.effect_pct); })
      .style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg)').style('font-variant-numeric', 'tabular-nums').style('pointer-events', 'none');
    svg.append('g').selectAll('text').data(rows).join('text')
      .attr('x', function (r) { return x(String(r.year)) + x.bandwidth() / 2; }).attr('y', function (r) { return r.effect_pct >= 0 ? y(0) + 16 : y(0) - 8; })
      .attr('text-anchor', 'middle').text(function (r) { return String(r.year); })
      .style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)').style('pointer-events', 'none');
    var big = rows.filter(function (r) { return r.label; });
    big.forEach(function (r) {
      var bx = x(String(r.year)) + x.bandwidth() + 6, anchor = 'start';
      if (bx > W - 110) { bx = x(String(r.year)) - 6; anchor = 'end'; }
      svg.append('text').attr('x', bx).attr('y', y(r.effect_pct) + 4).attr('text-anchor', anchor).text(r.label)
        .style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
    });
  }

  /* ---------- scatter ---------- */
  function drawScatter() {
    var box = document.getElementById('scatter'), leg = document.getElementById('scatter-legend');
    if (!gate(box, ['quarters'])) { leg.replaceChildren(); return; }
    var Q = get('quarters').data, p = P();
    var W = box.clientWidth || 360, H = Math.round(Math.min(340, Math.max(240, W * 0.7))), m = { t: 10, r: 10, b: 38, l: 40 };
    var M = Math.ceil(Math.max(40, d3.max(Q, function (d) { return Math.max(d.fact_avg, d.level_2027); })) / 5) * 5;
    var x = d3.scaleLinear([0, M], [m.l, W - m.r]), y = d3.scaleLinear([0, M], [H - m.b, m.t]);
    var svg = svgIn(box, 'Средний факт против уровня квартала').attr('viewBox', '0 0 ' + W + ' ' + H).attr('height', H);
    var gy = svg.append('g').attr('transform', 'translate(' + m.l + ',0)').call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickPadding(6)); noAxisFont(gy);
    var gx = svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.t - m.b)).tickPadding(6)); noAxisFont(gx);
    svg.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(M)).attr('y2', y(M)).style('stroke', 'var(--cds-chart-axis)').style('stroke-dasharray', '2 3');
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(25)).attr('y2', y(25)).style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '4 3');
    svg.append('text').attr('x', W - m.r).attr('y', H - 4).attr('text-anchor', 'end').text('Средний факт 2021-2026, т/га').style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
    svg.append('text').attr('transform', 'translate(11,' + m.t + ') rotate(-90)').attr('text-anchor', 'end').text('Уровень квартала 2027, т/га').style('font-size', 'var(--cds-font-size-caption)').style('fill', 'var(--color-fg-muted)');
    var pts = svg.append('g');
    pts.selectAll('circle').data(Q, function (d) { return d.id; }).join('circle')
      .attr('cx', function (d) { return x(d.fact_avg); }).attr('cy', function (d) { return y(d.level_2027); }).attr('r', 4.5)
      .style('fill', function (d) { return catColor(d.category); }).style('stroke', 'var(--color-panel)').style('stroke-width', 1.5);
    var sel = Q.find(function (d) { return d.id === p.q; });
    if (sel) pts.append('circle').attr('cx', x(sel.fact_avg)).attr('cy', y(sel.level_2027)).attr('r', 8).style('fill', 'none').style('stroke', 'var(--color-fg)').style('stroke-width', 2);
    var dl = d3.Delaunay.from(Q, function (d) { return x(d.fact_avg); }, function (d) { return y(d.level_2027); });
    var hit = function (evt) { var pt = d3.pointer(evt, svg.node()), vb = svg.node().viewBox.baseVal, sc = vb.width / svg.node().getBoundingClientRect().width; var i = dl.find(pt[0], pt[1]); var d = Q[i]; var dx = x(d.fact_avg) - pt[0], dy = y(d.level_2027) - pt[1]; return Math.sqrt(dx * dx + dy * dy) < 14 * Math.max(1, sc) ? d : null; };
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).style('fill', 'transparent').style('cursor', 'pointer')
      .on('mousemove', function (evt) { var d = hit(evt); if (!d) return hideTip(box); showTip(box, evt, [d.id + ' · ' + d.variety + ', ' + d.year_planted, 'Средний факт: ' + F.d1(d.fact_avg) + ' т/га', 'Уровень 2027: ' + F.d1(d.level_2027) + ' т/га', d.category]); })
      .on('mouseleave', function () { hideTip(box); })
      .on('click', function (evt) { var d = hit(evt); if (d) selectQuarter(d.id, true); });
    leg.replaceChildren.apply(leg, CATS.map(function (c) { var s = document.createElement('span'), w = document.createElement('i'); w.className = 'as-sw'; w.style.background = c.color; w.style.borderRadius = '50%'; s.append(w, c.key); return s; }));
  }

  /* ---------- matrix table ---------- */
  var COLS = [
    { f: 'id', h: 'Квартал' }, { f: 'section', h: 'Уч.', n: 1, k: 'd0' }, { f: 'variety', h: 'Сорт' }, { f: 'year_planted', h: 'Год', n: 1 },
    { f: 'area_ha', h: 'Га', n: 1, k: 'd1' }, { f: 'fact_avg', h: 'Факт ср., т/га', n: 1, k: 'd1', w: 1 }, { f: 'level_2027', h: 'Уровень 2027, т/га', n: 1, k: 'd1' },
    { f: 'p25', h: '25+ т/га', n: 1, k: 'pct' }, { f: 'category', h: 'Решение', cat: 1 }, { f: 'confidence', h: 'Уверенность', w: 1 }, { f: 'main_reason', h: 'Главная причина', w: 1, wrap: 1 }
  ];
  var thead = document.querySelector('#q-table thead tr');
  COLS.forEach(function (c) {
    var th = document.createElement('th'); th.setAttribute('data-field', c.f); th.className = (c.n ? 'n' : '') + (c.w ? ' w' : '');
    var b = document.createElement('button'); b.type = 'button'; b.textContent = c.h;
    b.addEventListener('click', function () { ui.sort = { key: c.f, dir: ui.sort.key === c.f ? -ui.sort.dir : (c.n ? -1 : 1) }; drawTable(); });
    th.appendChild(b); thead.appendChild(th);
  });
  function drawTable() {
    var Qs = get('quarters'), tbody = document.querySelector('#q-table tbody'), cnt = document.getElementById('q-count');
    thead.querySelectorAll('th').forEach(function (th) { var f = th.getAttribute('data-field'); th.setAttribute('aria-sort', ui.sort.key === f ? (ui.sort.dir > 0 ? 'ascending' : 'descending') : 'none'); });
    if (Qs.status !== 'ok') { tbody.replaceChildren(); cnt.textContent = ''; return; }
    var p = P(), s = ui.search;
    var rows = Qs.data.filter(function (d) {
      if (ui.cat === 'gray' && d.confidence !== 'Нужна проверка') return false;
      if (ui.cat !== 'all' && ui.cat !== 'gray' && d.category !== ui.cat) return false;
      if (s && (d.id + ' ' + d.variety + ' ' + d.section_name + ' ' + d.main_reason + ' ' + d.category).toLowerCase().indexOf(s) < 0) return false;
      return true;
    });
    var key = ui.sort.key, dir = ui.sort.dir;
    rows.sort(function (a, b) { var va = a[key], vb = b[key]; return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ru')) * dir; });
    tbody.replaceChildren.apply(tbody, rows.map(function (d) {
      var tr = document.createElement('tr'); tr.tabIndex = 0; if (d.id === p.q) tr.className = 'sel';
      COLS.forEach(function (c) {
        var td = document.createElement('td'); td.className = (c.n ? 'n' : '') + (c.w ? ' w' : '') + (c.wrap ? ' wrap' : '');
        if (c.cat) { var sp = document.createElement('span'); sp.className = 'as-cat'; var sw = document.createElement('i'); sw.className = 'as-sw'; sw.style.background = catColor(d.category); sp.append(sw, d.category); td.appendChild(sp); }
        else td.textContent = fmt(c.k || 'txt', d[c.f]);
        tr.appendChild(td);
      });
      var pick = function () { selectQuarter(d.id, true); };
      tr.addEventListener('click', pick); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      return tr;
    }));
    cnt.textContent = 'Показано ' + rows.length + ' из ' + Qs.data.length;
  }

  dash.onData(function () {
    drawControls(); drawStatic(); drawMap(); drawPassport(); drawBudget(); drawYears(); drawScatter(); drawTable();
  });

  var named = location.hash && document.getElementById(location.hash.slice(1));
  if (named) setTimeout(function () { named.scrollIntoView(); }, 300);
})();
