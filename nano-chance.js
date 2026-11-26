// Nano land chance page: loads data/nano-chance.json and draws every result against nano skill over nano resist, on
// the measured formula's curve for each of the target's slider settings, a readout at any ratio, a calculator and the
// tables. The results all come from that one file.
(() => {
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';

  // The target's slider settings the results were taken at: a name and one fixed color each (theory.css, --s-*), as on
  // the hit chance page. A setting with no line here still draws, in gray, under its number.
  const SLIDERS = {
    '-100': { name: 'Full defensive', color: 'cyan' },
    '0': { name: 'Neutral', color: 'gold' },
    '100': { name: 'Full aggressive', color: 'pink' },
  };
  const sliderName = v => (SLIDERS[v] ? SLIDERS[v].name : `Slider ${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`);

  // The measured formula. Only nano skill over nano resist counts, so it takes that ratio: the hit chance formula with
  // nano skill for AR and nano resist for defense, plus a flat FLAT, held to 0..1:
  // 50% + (NS − NR) / (NR + |NS − NR|) + (slider + 100) / 500 + FLAT. FLAT is the one number set from the results; the
  // page states it from here wherever it says it.
  const FLAT = 0.04;
  const clamp = v => Math.max(0, Math.min(1, v));
  const hitFormula = (ratio, slider) => 0.5 + (ratio - 1) / (1 + Math.abs(ratio - 1)) + (slider + 100) / 500;
  const formula = (ratio, slider) => clamp(hitFormula(ratio, slider) + FLAT);

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const nf = n => Math.round(n).toLocaleString('en');
  const pc = v => `${(Math.round(v * 1000 + 1e-6) / 10).toFixed(1)}%`;
  const signed = (d, digits = 1) => { const f = 10 ** digits, r = Math.round(d * f) / f; return r === 0 ? (0).toFixed(digits) : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}`; };
  const points = d => signed(d);
  const times = r => String(Math.round(r * 100) / 100);
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

  // The 95% range of a share (landed of casts), by the Wilson score: it behaves where every cast landed or none did.
  function range95(landed, casts) {
    const z = 1.96, p = landed / casts, d = 1 + z * z / casts;
    const mid = (p + z * z / (2 * casts)) / d, half = z * Math.sqrt(p * (1 - p) / casts + z * z / (4 * casts * casts)) / d;
    return [Math.max(0, mid - half), Math.min(1, mid + half)];
  }

  // Where the page states the flat part, it says it from FLAT.
  for (const node of document.querySelectorAll('.flat')) node.textContent = (FLAT * 100).toFixed(1).replace(/\.0$/, '');

  let series = [], results = [], xMax = 2.2, geom = null;
  const state = { picked: new Set(), preview: null, view: 'land', hover: null };

  // What the chart shows: the slider settings picked, plus the one whose button is pointed at, so pointing shows
  // what picking it would. With none picked and none pointed at, that is every setting.
  const isShown = s => state.picked.has(s.id) || s.id === state.preview || (!state.picked.size && !state.preview);

  fetch('data/nano-chance.json')
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
      const ratio = r.skill / r.resist, share = r.landed / r.casts, [lo, hi] = range95(r.landed, r.casts);
      return { ...r, ratio, share, lo, hi, fit: formula(ratio, r.slider) };
    });
    // One series per slider setting in the data, full aggressive first: the order the curves sit in, top to bottom.
    series = [...new Set(results.map(r => r.slider))].sort((a, b) => b - a).map(v => ({
      slider: v, id: String(v), name: sliderName(v),
      color: SLIDERS[v] ? `var(--s-${SLIDERS[v].color})` : 'var(--muted)',
      results: results.filter(r => r.slider === v),
    }));
    xMax = Math.ceil((Math.max(...results.map(r => r.ratio)) + 0.15) * 10) / 10;

    buildChips();
    buildControls();
    buildCalculator();
    buildTables();
    showFit();
    $('counts').textContent = `${nf(results.length)} results from ${nf(results.reduce((a, r) => a + r.casts, 0))} casts.`;
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

  // The slider buttons. Clicking picks: the first click leaves that setting as the only one shown, each click after
  // that adds a setting or takes one off, and taking the last one off brings every setting back. Pointing at a
  // button shows the chart as it would be with that setting picked too: alone while none is picked, beside the
  // picked ones otherwise.
  function buildChips() {
    const box = $('chips');
    // The button pointed at lights up with its color while its curve is on the chart because of it.
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
      b.append(html('span', 'key'), html('span', '', `Target ${s.name.toLowerCase()}`));
      b.onclick = () => {
        state.picked.has(s.id) ? state.picked.delete(s.id) : state.picked.add(s.id);
        b.setAttribute('aria-pressed', String(state.picked.has(s.id)));
        box.classList.toggle('has-picks', state.picked.size > 0);
        // What the click did shows at once: the pointer is still on the button, and it would otherwise keep a
        // setting on the chart that the click has just taken off. Pointing counts again from the next button.
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
        $('chart-name').textContent = state.view === 'land' ? 'Nano land chance by nano skill over nano resist' : 'Gap between each result and the measured formula';
        $('key-formula').hidden = state.view !== 'land';
        $('key-zero').hidden = state.view === 'land';
        draw(); showTip();
      };
    }
  }

  // ---- The chart ---------------------------------------------------------------------------------------------------

  function draw() {
    const plot = $('plot');
    const W = Math.max(280, plot.clientWidth - 10), narrow = W < 560;
    const H = Math.round(Math.max(290, Math.min(470, W * 0.54)));
    const m = { t: 24, r: narrow ? 14 : 22, b: 42, l: 46 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const vis = series.filter(isShown);
    const land = state.view === 'land';

    // Y: the whole 0 to 100% for land chance; for the gap, far enough either way to hold every result and its range
    // among the settings picked (and the one pointed at with them), or among them all while none is picked.
    let lo = 0, hi = 100, step = 20;
    if (!land) {
      const reach = Math.max(4, ...(state.picked.size ? vis : series).flatMap(s => s.results.map(r => Math.max(r.hi - r.fit, r.fit - r.lo) * 100)));
      step = reach > 8 ? 4 : 2;
      hi = Math.ceil(reach / step) * step; lo = -hi;
    }
    const x = ratio => m.l + ratio / xMax * pw;
    const y = v => m.t + (hi - v) / (hi - lo) * ph;
    geom = { W, H, m, pw, ph, x, y, narrow };

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': describe(vis) });
    const defs = el('defs'), clip = el('clipPath', { id: 'plot-area' });
    clip.append(el('rect', { x: m.l, y: m.t, width: pw, height: ph }));
    defs.append(clip); svg.append(defs);

    const grid = el('g');
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5, base = land ? v === 0 : Math.abs(v) < 1e-9;
      grid.append(el('line', { x1: m.l, x2: m.l + pw, y1: yy, y2: yy, class: base ? 'axisline' : 'gridline' }));
      grid.append(el('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'tick' }, land ? `${v}%` : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`));
    }
    const xStep = pw >= 520 ? 0.25 : 0.5;
    for (let r = 0; r <= xMax + 1e-9; r += xStep) {
      grid.append(el('line', { x1: x(r), x2: x(r), y1: m.t + ph, y2: m.t + ph + 5, class: 'axisline' }));
      grid.append(el('text', { x: x(r), y: m.t + ph + 19, 'text-anchor': r === 0 ? 'start' : 'middle', class: 'tick' }, times(r)));
    }
    grid.append(el('text', { x: m.l - 38, y: 14, class: 'axis-title' }, land ? 'Land chance' : 'Result, against the formula, in points'));
    grid.append(el('text', { x: m.l + pw, y: H - 5, 'text-anchor': 'end', class: 'axis-title' }, 'Nano skill ÷ nano resist'));
    svg.append(grid);

    // The measured formula's curve, sampled along the axis.
    const path = fn => {
      const pts = [];
      for (let i = 0; i <= 220; i++) { const r = xMax * i / 220; pts.push(`${x(r).toFixed(1)},${y(fn(r)).toFixed(1)}`); }
      return 'M' + pts.join('L');
    };

    for (const s of vis) {
      const g = el('g', { class: 'series', 'data-id': s.id, style: `--c:${s.color}` });
      if (land) g.append(el('path', { d: path(r => formula(r, s.slider) * 100), class: 'measured' }));
      // Each result: its 95% range as a thin bar, the share that landed as a dot.
      for (const r of s.results) {
        const cx = x(r.ratio).toFixed(1), off = land ? 0 : r.fit;
        g.append(el('line', { x1: cx, x2: cx, y1: y((r.lo - off) * 100).toFixed(1), y2: y((r.hi - off) * 100).toFixed(1), class: 'whisker' }));
      }
      for (const r of s.results) {
        g.append(el('circle', { cx: x(r.ratio).toFixed(1), cy: y((r.share - (land ? 0 : r.fit)) * 100).toFixed(1), r: narrow ? 2.2 : 3, class: narrow ? 'reading small' : 'reading' }));
      }
      svg.append(g);
    }
    svg.append(el('g', { id: 'hover' }));
    const area = el('rect', { x: m.l, y: m.t - 6, width: pw, height: ph + 12, class: 'hit' });
    svg.append(area);

    const previous = plot.querySelector('svg');
    previous ? previous.replaceWith(svg) : plot.prepend(svg);

    const ratioAt = e => {
      const box = svg.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(xMax, (e.clientX - box.left - m.l) / pw * xMax)) * 100) / 100;
    };
    area.onpointermove = e => { state.hover = ratioAt(e); showTip(); };
    area.onpointerdown = e => { state.hover = ratioAt(e); showTip(); };
    area.onpointerleave = e => { if (e.pointerType === 'mouse') { state.hover = null; showTip(); } };
    drawHover();
  }

  const describe = vis => `${state.view === 'land' ? 'Nano land chance' : 'Gap between each result and the measured formula'} against nano skill over nano resist from 0 to ${times(xMax)}, with the target’s slider at ${
    vis.map(s => s.name.toLowerCase()).join(', ')}. The tables below the chart give the same numbers.`;

  function drawHover() {
    const g = document.getElementById('hover');
    if (!g || !geom) return;
    g.replaceChildren();
    if (state.hover == null) return;
    const { x, y, m, ph } = geom, hx = Math.round(x(state.hover)) + 0.5;
    g.append(el('line', { x1: hx, x2: hx, y1: m.t, y2: m.t + ph, class: 'cross' }));
    if (state.view !== 'land') return;
    for (const s of series) {
      if (isShown(s)) g.append(el('circle', { cx: x(state.hover), cy: y(formula(state.hover, s.slider) * 100), r: 4.5, class: 'end', style: `--c:${s.color}` }));
    }
  }

  // The readout at the ratio under the pointer (or, on a phone, the last one touched): the measured formula's land
  // chance at each slider setting switched on.
  function showTip() {
    const tip = $('tip'), plot = $('plot');
    drawHover();
    const docked = getComputedStyle(tip).position === 'static';
    const ratio = state.hover;
    plot.setAttribute('aria-valuenow', ratio ?? 1);
    if (ratio == null) {
      plot.removeAttribute('aria-valuetext');
      tip.hidden = !docked;
      tip.replaceChildren(html('p', 'hint', 'Touch or drag across the chart to read the land chance at any nano skill over nano resist.'));
      return;
    }
    const table = html('table'), spoken = [];
    for (const s of series) {
      if (!isShown(s)) continue;
      const f = formula(ratio, s.slider);
      const tr = html('tr');
      tr.append(keyCell('td', s.color), html('td', 'v', pc(f)), html('td', 'n', s.name));
      table.append(tr);
      spoken.push(`${s.name} ${pc(f)}`);
    }
    tip.replaceChildren(html('h3', '', `Land chance for nano skill at ${ratio.toFixed(2)} × nano resist`), table);
    tip.hidden = false;
    plot.setAttribute('aria-valuetext', `Land chance for nano skill at ${ratio.toFixed(2)} times the nano resist: ${spoken.join('; ')}`);
    if (!docked && geom) {
      // Parked in the plot's top left corner, which the curves leave empty. While the crosshair is under that corner
      // it moves to the crosshair's right.
      const hx = geom.x(ratio) + 5, w = tip.offsetWidth, corner = geom.m.l + 16;
      const left = hx < corner + w + 24 ? hx + 14 : corner;
      tip.style.transform = `translate(${Math.round(left)}px, ${geom.m.t + 4}px)`;
    } else tip.style.transform = '';
  }

  // Arrow keys read along the chart, as the pointer does, starting where nano skill equals the nano resist.
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

  // As the hit lab works it out: each result weighed by how sure it is (casts over the measured formula's own spread).
  // Where the formula is under 100%, the weighted mean gap from the hit chance formula alone, with its standard error,
  // and the chi-square against the measured formula; where it says 100%, whether every cast landed.
  function showFit() {
    let w = 0, wy = 0, chi = 0, under = 0, full = 0, held = 0;
    for (const r of results) {
      if (r.fit >= 1) { full++; if (r.landed === r.casts) held++; continue; }
      if (r.fit <= 0) continue;
      const v = r.fit * (1 - r.fit) / r.casts;
      w += 1 / v; wy += (r.share - hitFormula(r.ratio, r.slider)) / v;
      chi += (r.share - r.fit) ** 2 / v;
      under++;
    }
    const parts = [];
    if (under) parts.push(`Under 100%, the ${nf(under)} results sit ${(100 * wy / w).toFixed(1)} ± ${(100 / Math.sqrt(w)).toFixed(1)} points above the hit chance formula, on average, where the measured formula adds ${(FLAT * 100).toFixed(1).replace(/\.0$/, '')}. They scatter about it ${
      chi <= under + 2 * Math.sqrt(2 * under) ? 'as much as chance alone gives' : 'more than chance alone gives'}.`);
    if (full) parts.push(held === full ? `Where it says 100%, every cast landed, in all ${nf(full)} results.` : `Where it says 100%, every cast landed in ${nf(held)} of ${nf(full)} results.`);
    $('fit').textContent = parts.join(' ');
  }

  // ---- Work out a land chance ---------------------------------------------------------------------------------------

  function buildCalculator() {
    for (const id of ['calc-skill', 'calc-resist', 'calc-slider']) $(id).oninput = showCalculator;
    showCalculator();
  }

  function showCalculator() {
    const skill = +$('calc-skill').value, resist = +$('calc-resist').value, slider = +$('calc-slider').value;
    $('calc-slider-name').textContent = SLIDERS[slider] ? SLIDERS[slider].name.toLowerCase() : `${slider > 0 ? '+' : '−'}${Math.abs(slider)}`;
    const out = $('calc-out');
    out.replaceChildren();
    if (!(skill > 0) || !(resist > 0)) { out.textContent = 'Enter a nano skill and a nano resist above 0.'; return; }
    const ratio = skill / resist, f = formula(ratio, slider);
    out.append(html('b', 'big', pc(f)), ' of casts land.');
    out.append(html('span', 'sub', `Nano skill is ${ratio.toFixed(2)} × the nano resist.`));
  }

  // ---- Tables ------------------------------------------------------------------------------------------------------

  function buildTables() {
    // The measured formula's land chance at round steps of the ratio, for each slider setting. The first row is near
    // the floor.
    const order = [...series].reverse(); // full defensive first, as the slider runs
    const head = $('by-ratio-head'), body = $('by-ratio');
    head.append(html('th', '', 'Nano skill ÷ nano resist'));
    for (const s of order) head.append(keyCell('th', s.color, s.name));
    for (const ratio of [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
      const tr = html('tr');
      tr.append(html('th', 'num', ratio.toFixed(2)));
      for (const s of order) tr.append(html('td', '', pc(formula(ratio, s.slider))));
      body.append(tr);
    }

    // Every result, in order along the chart.
    const rows = $('results');
    for (const r of [...results].sort((a, b) => a.ratio - b.ratio || a.slider - b.slider)) {
      const s = series.find(q => q.slider === r.slider);
      const tr = html('tr');
      tr.append(keyCell('th', s.color, s.name), html('td', '', sliderName(r.casterSlider).toLowerCase()), html('td', '', nf(r.skill)), html('td', '', nf(r.resist)), html('td', '', r.ratio.toFixed(2)),
        html('td', '', nf(r.casts)), html('td', '', pc(r.share)), html('td', '', `${pc(r.lo)} to ${pc(r.hi)}`), html('td', '', pc(r.fit)),
        html('td', '', points((r.share - r.fit) * 100)));
      rows.append(tr);
    }
  }
})();
