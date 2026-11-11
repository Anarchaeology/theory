// Crit page: loads data/crit.json and draws every result against the hit formula, on the measured formula's line for
// each Critical Increase, with Critical Increase alone beside each, a readout at any point of the hit formula, a
// calculator and the tables. The results all come from that one file.
(() => {
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';

  // The Critical Increases the results were taken at, each with one fixed color (theory.css, --s-*). One with no color
  // here still draws, in gray.
  const COLORS = { '2': 'cyan', '7': 'pink' };

  // The hit formula: the hit chance before it's held at 100%, from AR, defense and the defender's slider.
  const hitFormula = (ar, def, slider) => 0.5 + (ar - def) / (def + Math.abs(ar - def)) + (slider + 100) / 500;
  const clamp = v => Math.max(0, Math.min(1, v));
  // Measured: 3% + Critical Increase, and past 100% a sixth of how far the hit formula runs past, held to 0..100%.
  const BASE = 0.03, PAST = 1 / 6;
  const measured = (f, ci) => clamp(BASE + ci / 100 + Math.max(0, f - 1) * PAST);
  // Critical Increase alone, the figure in common use: the whole crit chance, wherever the hit formula is.
  const alone = ci => clamp(ci / 100);

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const nf = n => Math.round(n).toLocaleString('en');
  const pc = v => `${(Math.round(v * 1000 + 1e-6) / 10).toFixed(1)}%`;
  const whole = v => `${Math.round(v * 100)}%`;
  const signed = (d, digits = 1) => { const f = 10 ** digits, r = Math.round(d * f) / f; return r === 0 ? (0).toFixed(digits) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}`; };
  const points = d => signed(d);
  const ciText = ci => String(ci);
  const sliderName = v => (v === -100 ? 'full defensive' : v === 100 ? 'full aggressive' : v === 0 ? 'neutral' : `${v > 0 ? '+' : '−'}${Math.abs(v)}`);
  const el = (name, attrs = {}, text) => {
    const node = document.createElementNS(SVG, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  };
  const html = (name, cls, text) => {
    const node = document.createElement(name);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const keyCell = (tag, color, text) => { const c = html(tag); const k = html('span', 'k'); k.style.setProperty('--c', color); c.append(k); if (text) c.append(text); return c; };

  // The 95% range of a share (crits of landed), by the Wilson score: it behaves where every hit crit or none did.
  function range95(crits, landed) {
    const z = 1.96, p = crits / landed, d = 1 + z * z / landed;
    const mid = (p + z * z / (2 * landed)) / d, half = z * Math.sqrt(p * (1 - p) / landed + z * z / (4 * landed * landed)) / d;
    return [Math.max(0, mid - half), Math.min(1, mid + half)];
  }

  let series = [], results = [], xMax = 1.5, geom = null;
  const state = { picked: new Set(), preview: null, view: 'crit', other: true, hover: null };

  // What the chart shows: the Critical Increases picked, plus the one whose button is pointed at, so pointing shows
  // what picking it would. With none picked and none pointed at, that is every one.
  const isShown = s => state.picked.has(s.id) || s.id === state.preview || (!state.picked.size && !state.preview);

  fetch('data/crit.json')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch(() => {
      $('plot').textContent = location.protocol === 'file:'
        ? 'The results could not be loaded: this page needs to be opened through a web server, not as a file.'
        : 'The results could not be loaded.';
      $('plot').classList.add('caption');
    });

  function init(data) {
    results = data.results.map(r => {
      const f = hitFormula(r.ar, r.def, r.slider), share = r.crits / r.landed, [lo, hi] = range95(r.crits, r.landed);
      return { ...r, f, share, lo, hi, fit: measured(f, r.critIncrease), other: alone(r.critIncrease) };
    });
    // One series per Critical Increase in the data, the lowest first: the order the lines sit in, bottom to top.
    series = [...new Set(results.map(r => r.critIncrease))].sort((a, b) => a - b).map(ci => ({
      ci, id: String(ci), name: `Critical Increase ${ciText(ci)}`,
      color: COLORS[ci] ? `var(--s-${COLORS[ci]})` : 'var(--muted)',
      results: results.filter(r => r.critIncrease === ci),
    }));
    xMax = Math.ceil((Math.max(1, ...results.map(r => r.f)) + 0.1) * 10) / 10;

    buildChips();
    buildControls();
    buildCalculator();
    buildTables();
    showFit();
    $('counts').textContent = `${nf(results.length)} results from ${nf(results.reduce((a, r) => a + r.crits, 0))} crits in ${nf(results.reduce((a, r) => a + r.landed, 0))} landed hits.`;
    if (data.updated) {
      const d = data.updated;
      $('updated').textContent = `Updated ${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}.`;
    }
    const plot = $('plot');
    plot.setAttribute('aria-valuemin', 0); plot.setAttribute('aria-valuemax', xMax);
    plot.onkeydown = onKey;
    plot.onblur = () => { if (getComputedStyle($('tip')).position !== 'static') { state.hover = null; showTip(); } };
    draw();
    showTip();
    new ResizeObserver(() => { draw(); showTip(); }).observe(plot);
  }

  // ---- Controls ----------------------------------------------------------------------------------------------------

  // The Critical Increase buttons. Clicking picks: the first click leaves that one as the only one shown, each click
  // after that adds one or takes one off, and taking the last one off brings every one back. Pointing at a button shows
  // the chart as it would be with that one picked too: alone while none is picked, beside the picked ones otherwise.
  function buildChips() {
    const box = $('chips');
    // The button pointed at lights up with its color while its line is on the chart because of it.
    const mark = id => { for (const c of box.children) c.classList.toggle('previewing', id != null && c.dataset.id === id); };
    const preview = id => { if (state.preview !== id) { state.preview = id; mark(id); draw(); showTip(); } };
    // Leaving a button ends its pointing a moment later, not at once: crossing the gap to the next button would
    // otherwise draw the chart without either in between, and it would flash. Pointing at the next one takes its place.
    let leaving = 0;
    const leave = id => { clearTimeout(leaving); leaving = setTimeout(() => { if (state.preview === id) preview(null); }, 150); };
    for (const s of series) {
      const b = html('button', 'chip');
      b.type = 'button';
      b.style.setProperty('--c', s.color);
      b.dataset.id = s.id;
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', s.name);
      b.append(html('span', 'key'), html('span', '', ciText(s.ci)));
      b.onclick = () => {
        state.picked.has(s.id) ? state.picked.delete(s.id) : state.picked.add(s.id);
        b.setAttribute('aria-pressed', String(state.picked.has(s.id)));
        box.classList.toggle('has-picks', state.picked.size > 0);
        // What the click did shows at once: the pointer is still on the button, and it would otherwise keep a
        // line on the chart that the click has just taken off. Pointing counts again from the next button.
        state.preview = null; mark(null);
        draw(); showTip();
      };
      // A touch has no pointing before the tap, and a click moves focus without the keyboard having asked for it.
      b.onpointerenter = e => { if (e.pointerType === 'mouse') { clearTimeout(leaving); preview(s.id); } };
      // Leaving, or losing focus, only ends the pointing if this button's is the one in force: pressing the mouse on
      // another button takes focus from the one clicked before, and that must not blank what is being pointed at.
      b.onpointerleave = () => { if (state.preview === s.id) leave(s.id); };
      b.onfocus = () => { if (b.matches(':focus-visible')) preview(s.id); };
      b.onblur = () => { if (state.preview === s.id && !b.matches(':hover')) preview(null); };
      box.append(b);
    }
  }

  function buildControls() {
    for (const b of document.querySelectorAll('#view button')) {
      b.onclick = () => {
        state.view = b.dataset.view;
        for (const o of document.querySelectorAll('#view button')) o.setAttribute('aria-pressed', String(o === b));
        $('chart-name').textContent = state.view === 'crit' ? 'Crit chance by the hit formula' : 'Gap between each result and the measured formula';
        $('key-formula').hidden = state.view !== 'crit';
        $('key-zero').hidden = state.view === 'crit';
        draw(); showTip();
      };
    }
    $('opt-other').onchange = e => { state.other = e.target.checked; draw(); showTip(); };
  }

  // ---- The chart ---------------------------------------------------------------------------------------------------

  function draw() {
    const plot = $('plot');
    const W = Math.max(280, plot.clientWidth - 10), narrow = W < 560;
    const H = Math.round(Math.max(290, Math.min(470, W * 0.54)));
    const m = { t: 24, r: narrow ? 14 : 22, b: 42, l: 46 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const vis = series.filter(isShown);
    const crit = state.view === 'crit';
    // The scale follows the Critical Increases picked (and the one pointed at with them), or all of them while none is
    // picked: pointing alone doesn't move it.
    const basis = state.picked.size ? vis : series;

    // Y: from 0 to far enough to hold every result's range and every line to the chart's right edge; for the gap, far
    // enough either way to hold every result and its range.
    let lo = 0, hi, step;
    if (crit) {
      const top = Math.max(10, ...basis.flatMap(s => [measured(xMax, s.ci) * 100, ...s.results.map(r => r.hi * 100)]));
      step = top > 30 ? 5 : top > 12 ? 2.5 : 2;
      hi = Math.ceil(top / step) * step;
    } else {
      const reach = Math.max(4, ...basis.flatMap(s => s.results.map(r => Math.max(r.hi - r.fit, r.fit - r.lo) * 100)));
      step = reach > 16 ? 5 : reach > 8 ? 4 : 2;
      hi = Math.ceil(reach / step) * step; lo = -hi;
    }
    const x = f => m.l + f / xMax * pw;
    const y = v => m.t + (hi - v) / (hi - lo) * ph;
    geom = { W, H, m, pw, ph, x, y, narrow };

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': describe(vis) });
    const defs = el('defs'), clip = el('clipPath', { id: 'plot-area' });
    clip.append(el('rect', { x: m.l, y: m.t, width: pw, height: ph }));
    defs.append(clip); svg.append(defs);

    const grid = el('g');
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5, base = Math.abs(v) < 1e-9;
      grid.append(el('line', { x1: m.l, x2: m.l + pw, y1: yy, y2: yy, class: base ? 'axisline' : 'gridline' }));
      const label = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(1);
      grid.append(el('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'tick' }, crit ? `${label}%` : `${v > 0 ? '+' : v < 0 ? '−' : ''}${label}`));
    }
    const xStep = pw >= 520 ? 0.25 : 0.5;
    for (let f = 0; f <= xMax + 1e-9; f += xStep) {
      grid.append(el('line', { x1: x(f), x2: x(f), y1: m.t + ph, y2: m.t + ph + 5, class: 'axisline' }));
      grid.append(el('text', { x: x(f), y: m.t + ph + 19, 'text-anchor': f === 0 ? 'start' : 'middle', class: 'tick' }, whole(f)));
    }
    // Where the hit chance stops: past it every swing lands, and the hit formula goes on counting.
    const full = Math.round(x(1)) + 0.5;
    grid.append(el('line', { x1: full, x2: full, y1: m.t, y2: m.t + ph, class: 'full' }));
    // On a phone the room past 100% is too narrow for it on one line.
    (narrow ? ['every swing', 'lands'] : ['every swing lands']).forEach((t, i) => grid.append(el('text', { x: full + 6, y: m.t + 11 + i * 13, class: 'tick' }, t)));
    grid.append(el('text', { x: m.l - 38, y: 14, class: 'axis-title' }, crit ? 'Crit chance' : 'Result, against the formula, in points'));
    grid.append(el('text', { x: m.l + pw, y: H - 5, 'text-anchor': 'end', class: 'axis-title' }, 'Hit formula'));
    svg.append(grid);

    // A line along the axis: the measured formula, Critical Increase alone, or the gap between them. Both are straight
    // but for the one bend at 100%.
    const path = fn => [0, 1, xMax].map((f, i) => `${i ? 'L' : 'M'}${x(f).toFixed(1)},${y(fn(f)).toFixed(1)}`).join('');

    // Critical Increase alone goes under everything else.
    if (state.other) {
      for (const s of vis) {
        const g = el('g', { class: 'series', 'data-id': s.id, style: `--c:${s.color}`, 'clip-path': 'url(#plot-area)' });
        g.append(el('path', { d: path(f => (crit ? alone(s.ci) : alone(s.ci) - measured(f, s.ci)) * 100), class: 'other' }));
        svg.append(g);
      }
    }
    for (const s of vis) {
      const g = el('g', { class: 'series', 'data-id': s.id, style: `--c:${s.color}`, 'clip-path': 'url(#plot-area)' });
      if (crit) g.append(el('path', { d: path(f => measured(f, s.ci) * 100), class: 'measured' }));
      // Each result: its 95% range as a thin bar, the share of landed hits that crit as a dot.
      for (const r of s.results) {
        const cx = x(r.f).toFixed(1), off = crit ? 0 : r.fit;
        g.append(el('line', { x1: cx, x2: cx, y1: y((r.lo - off) * 100).toFixed(1), y2: y((r.hi - off) * 100).toFixed(1), class: 'whisker' }));
      }
      for (const r of s.results) {
        g.append(el('circle', { cx: x(r.f).toFixed(1), cy: y((r.share - (crit ? 0 : r.fit)) * 100).toFixed(1), r: narrow ? 2.2 : 3, class: narrow ? 'reading small' : 'reading' }));
      }
      svg.append(g);
    }
    // Each line's name sits above its right end, where the lines are furthest apart.
    if (crit && !narrow) {
      for (const s of vis) {
        const g = el('g', { class: 'series', 'data-id': s.id });
        g.append(el('text', { x: (m.l + pw - 2).toFixed(1), y: (y(measured(xMax, s.ci) * 100) - 9).toFixed(1), 'text-anchor': 'end', class: 'label' }, s.name));
        svg.append(g);
      }
    }

    svg.append(el('g', { id: 'hover' }));
    const area = el('rect', { x: m.l, y: m.t - 6, width: pw, height: ph + 12, class: 'hit' });
    svg.append(area);

    const previous = plot.querySelector('svg');
    previous ? previous.replaceWith(svg) : plot.prepend(svg);

    const formulaAt = e => {
      const box = svg.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(xMax, (e.clientX - box.left - m.l) / pw * xMax)) * 100) / 100;
    };
    area.onpointermove = e => { state.hover = formulaAt(e); showTip(); };
    area.onpointerdown = e => { state.hover = formulaAt(e); showTip(); };
    area.onpointerleave = e => { if (e.pointerType === 'mouse') { state.hover = null; showTip(); } };
    drawHover();
  }

  const describe = vis => `${state.view === 'crit' ? 'Crit chance' : 'Gap between each result and the measured formula'} against the hit formula from 0 to ${whole(xMax)}, at Critical Increase ${
    vis.map(s => ciText(s.ci)).join(', ')}. The tables below the chart give the same numbers.`;

  function drawHover() {
    const g = document.getElementById('hover');
    if (!g || !geom) return;
    g.replaceChildren();
    if (state.hover == null) return;
    const { x, y, m, ph } = geom, hx = Math.round(x(state.hover)) + 0.5;
    g.append(el('line', { x1: hx, x2: hx, y1: m.t, y2: m.t + ph, class: 'cross' }));
    if (state.view !== 'crit') return;
    for (const s of series) {
      if (isShown(s)) g.append(el('circle', { cx: x(state.hover), cy: y(measured(state.hover, s.ci) * 100), r: 4.5, class: 'end', style: `--c:${s.color}` }));
    }
  }

  // The readout at the hit formula under the pointer (or, on a phone, the last one touched): the measured formula's
  // crit chance at each Critical Increase shown, with Critical Increase alone and how far the two are apart.
  function showTip() {
    const tip = $('tip'), plot = $('plot');
    drawHover();
    const docked = getComputedStyle(tip).position === 'static';
    const f = state.hover;
    plot.setAttribute('aria-valuenow', f ?? 1);
    if (f == null) {
      plot.removeAttribute('aria-valuetext');
      tip.hidden = !docked;
      tip.replaceChildren(html('p', 'hint', 'Touch or drag across the chart to read the crit chance at any point of the hit formula.'));
      return;
    }
    const table = html('table'), spoken = [];
    for (const s of series) {
      if (!isShown(s)) continue;
      const c = measured(f, s.ci), o = alone(s.ci);
      const tr = html('tr');
      tr.append(keyCell('td', s.color), html('td', 'v', pc(c)), html('td', 'n', s.name), html('td', 's', `alone ${pc(o)}`), html('td', 's', points((o - c) * 100)));
      table.append(tr);
      spoken.push(`${s.name} ${pc(c)}, by Critical Increase alone ${pc(o)}`);
    }
    tip.replaceChildren(html('h3', '', `Hit formula at ${whole(f)}${f > 1 ? ', past 100%' : ''}`), table);
    tip.hidden = false;
    plot.setAttribute('aria-valuetext', `Hit formula at ${whole(f)}: ${spoken.join('; ')}`);
    if (!docked && geom) {
      // Parked in the plot's top left corner, which the lines leave empty. While the crosshair is under that corner
      // it moves to the crosshair's right.
      const hx = geom.x(f) + 5, w = tip.offsetWidth, corner = geom.m.l + 16;
      const left = hx < corner + w + 24 ? hx + 14 : corner;
      tip.style.transform = `translate(${Math.round(left)}px, ${geom.m.t + 4}px)`;
    } else tip.style.transform = '';
  }

  // Arrow keys read along the chart, as the pointer does, starting at 100%.
  function onKey(e) {
    const move = { ArrowLeft: -0.01, ArrowRight: 0.01, PageDown: -0.1, PageUp: 0.1 }[e.key];
    if (move) state.hover = Math.round(Math.max(0, Math.min(xMax, (state.hover ?? 1) + move * (e.shiftKey ? 10 : 1))) * 100) / 100;
    else if (e.key === 'Home') state.hover = 0;
    else if (e.key === 'End') state.hover = xMax;
    else if (e.key === 'Escape') state.hover = null;
    else return;
    e.preventDefault();
    showTip();
  }

  // ---- How well the formula fits -----------------------------------------------------------------------------------

  // As the hit lab works it out: each result weighed by how sure it is (landed hits over the formula's own spread).
  // Up to 100%, the weighted mean gap from 3% + Critical Increase; past it, the weighted slope through 0 of the rise
  // over that base against how far past the hit formula runs. Each with its standard error, in points.
  function showFit() {
    let uw = 0, uy = 0, sxx = 0, sxy = 0, under = 0, past = 0;
    for (const r of results) {
      if (r.fit <= 0 || r.fit >= 1) continue;
      const w = r.landed / (r.fit * (1 - r.fit)), lift = r.share - (BASE + r.critIncrease / 100);
      if (r.f <= 1) { uw += w; uy += w * lift; under++; } else { const d = r.f - 1; sxx += w * d * d; sxy += w * d * lift; past++; }
    }
    const parts = [];
    if (under) parts.push(`Up to 100%, the ${nf(under)} results sit ${signed(100 * uy / uw)} ± ${(100 / Math.sqrt(uw)).toFixed(1)} points from the measured formula, on average.`);
    if (past) parts.push(`Past 100%, over ${nf(past)} results, crit rose ${(100 * sxy / sxx).toFixed(1)} ± ${(100 / Math.sqrt(sxx)).toFixed(1)} points for every 100 points the hit formula ran past it. A sixth is ${(100 * PAST).toFixed(1)}.`);
    $('fit').textContent = parts.join(' ');
  }

  // ---- Work out a crit chance ---------------------------------------------------------------------------------------

  function buildCalculator() {
    for (const id of ['calc-ar', 'calc-def', 'calc-ci', 'calc-slider']) $(id).oninput = showCalculator;
    showCalculator();
  }

  function showCalculator() {
    const ar = +$('calc-ar').value, def = +$('calc-def').value, ci = +$('calc-ci').value, slider = +$('calc-slider').value;
    $('calc-slider-name').textContent = sliderName(slider);
    const out = $('calc-out');
    out.replaceChildren();
    if (!(ar > 0) || !(def > 0)) { out.textContent = 'Enter an AR and a defense above 0.'; return; }
    if (!(ci >= 0)) { out.textContent = 'Enter a Critical Increase of 0 or more.'; return; }
    const f = hitFormula(ar, def, slider), c = measured(f, ci), o = alone(ci);
    out.append(html('b', 'big', pc(c)), ' of landed hits crit.');
    const where = f > 1
      ? `The hit formula comes to ${pc(f)}: every swing lands, and the ${pc(f - 1)} past 100% adds ${points((c - BASE - ci / 100) * 100)} points.`
      : `The hit formula comes to ${pc(f)}, so ${pc(clamp(f))} of swings land, and the crit chance is 3% + Critical Increase.`;
    out.append(html('span', 'sub', `${where} By Critical Increase alone it would be ${pc(o)}${Math.abs(o - c) < 0.0005 ? ', the same' : `, ${points((o - c) * 100)} points`}.`));
  }

  // ---- Tables ------------------------------------------------------------------------------------------------------

  function buildTables() {
    // The measured formula's crit chance up to 100% and at steps past it, for each Critical Increase, with Critical
    // Increase alone in the last row.
    const head = $('by-formula-head'), body = $('by-formula');
    head.append(html('th', '', 'Hit formula'), html('th', '', 'Past 100% adds'));
    for (const s of series) head.append(keyCell('th', s.color, s.name));
    for (let f = 1; f <= 1.9 + 1e-9; f += 0.1) {
      const tr = html('tr');
      tr.append(html('th', 'num', f < 1 + 1e-9 ? 'Up to 100%' : whole(f)), html('td', '', points(Math.max(0, f - 1) * PAST * 100)));
      for (const s of series) tr.append(html('td', '', pc(measured(f, s.ci))));
      body.append(tr);
    }
    const tr = html('tr');
    tr.append(html('th', '', 'Critical Increase alone'), html('td', 'none', ''));
    for (const s of series) tr.append(html('td', '', pc(alone(s.ci))));
    body.append(tr);

    // Every result, in order along the chart.
    const rows = $('results');
    for (const r of [...results].sort((a, b) => a.f - b.f || a.critIncrease - b.critIncrease)) {
      const s = series.find(q => q.ci === r.critIncrease);
      const tr = html('tr');
      tr.append(keyCell('th', s.color, ciText(r.critIncrease)), html('td', '', nf(r.ar)), html('td', '', nf(r.def)), html('td', '', sliderName(r.slider)),
        html('td', '', pc(r.f)), html('td', '', nf(r.landed)), html('td', '', nf(r.crits)), html('td', '', pc(r.share)),
        html('td', '', `${pc(r.lo)} to ${pc(r.hi)}`), html('td', '', pc(r.fit)), html('td', '', points((r.share - r.fit) * 100)));
      rows.append(tr);
    }
  }
})();
