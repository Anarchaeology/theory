// Hit chance page: loads data/hit-chance.json and draws every result against AR over defense, on the measured
// formula's curve for each of the defender's slider settings, with the linear formula's line for each, a readout at any
// AR over defense, a calculator and the tables. The results all come from that one file.
(() => {
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';

  // The defender's slider settings the results were taken at: a name and one fixed color each (theory.css, --s-*).
  // A setting with no line here still draws, in gray, under its number.
  const SLIDERS = {
    '-100': { name: 'Full defensive', color: 'cyan' },
    '0': { name: 'Neutral', color: 'gold' },
    '100': { name: 'Full aggressive', color: 'pink' },
  };
  const sliderName = v => (SLIDERS[v] ? SLIDERS[v].name : `Slider ${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`);

  // The two formulas. Only AR over defense counts in either, so both take that ratio.
  // Measured: 50% + (AR − Def) / (Def + |AR − Def|) + (slider + 100) / 500, held to 0..1.
  const clamp = v => Math.max(0, Math.min(1, v));
  const formula = (ratio, slider) => clamp(0.5 + (ratio - 1) / (1 + Math.abs(ratio - 1)) + (slider + 100) / 500);
  // The linear formula, the one in common use: AR / (√2 · Def) + slider / 500, held to 0..1.
  const linearFormula = (ratio, slider) => clamp(ratio / Math.SQRT2 + slider / 500);

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const nf = n => Math.round(n).toLocaleString('en');
  const pc = v => `${(Math.round(v * 1000 + 1e-6) / 10).toFixed(1)}%`;
  const points = d => { const r = Math.round(d * 10) / 10; return r === 0 ? '0.0' : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}`; };
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

  // The 95% range of a share (landed of swings), by the Wilson score: it behaves where every swing landed or none did.
  function range95(landed, swings) {
    const z = 1.96, p = landed / swings, d = 1 + z * z / swings;
    const mid = (p + z * z / (2 * swings)) / d, half = z * Math.sqrt(p * (1 - p) / swings + z * z / (4 * swings * swings)) / d;
    return [Math.max(0, mid - half), Math.min(1, mid + half)];
  }

  let series = [], results = [], xMax = 2.2, geom = null;
  const state = { on: new Set(), view: 'hit', other: true, hover: null };

  fetch('data/hit-chance.json')
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
      const ratio = r.ar / r.def, share = r.landed / r.swings, [lo, hi] = range95(r.landed, r.swings);
      return { ...r, ratio, share, lo, hi, fit: formula(ratio, r.slider), other: linearFormula(ratio, r.slider) };
    });
    // One series per slider setting in the data, full aggressive first: the order the curves sit in, top to bottom.
    series = [...new Set(results.map(r => r.slider))].sort((a, b) => b - a).map(v => ({
      slider: v, id: String(v), name: sliderName(v),
      color: SLIDERS[v] ? `var(--s-${SLIDERS[v].color})` : 'var(--muted)',
      results: results.filter(r => r.slider === v),
    }));
    for (const s of series) state.on.add(s.id);
    xMax = Math.ceil((Math.max(...results.map(r => r.ratio)) + 0.15) * 10) / 10;

    buildChips();
    buildControls();
    buildCalculator();
    buildTables();
    $('counts').textContent = `${nf(results.length)} results from ${nf(results.reduce((a, r) => a + r.swings, 0))} swings.`;
    if (data.updated) {
      const d = data.updated;
      $('updated').textContent = `Results updated ${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}.`;
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

  function buildChips() {
    const box = $('chips');
    for (const s of series) {
      const b = html('button', 'chip');
      b.type = 'button';
      b.style.setProperty('--c', s.color);
      b.setAttribute('aria-pressed', 'true');
      b.append(html('span', 'key'), html('span', '', s.name));
      b.onclick = () => {
        state.on.has(s.id) ? state.on.delete(s.id) : state.on.add(s.id);
        b.setAttribute('aria-pressed', String(state.on.has(s.id)));
        draw(); showTip();
      };
      // Pointing at a setting's button picks its curve out of the rest.
      const focus = on => () => highlight(on && state.on.has(s.id) ? s.id : null);
      b.onpointerenter = focus(true); b.onpointerleave = focus(false);
      b.onfocus = focus(true); b.onblur = focus(false);
      box.append(b);
    }
  }

  function buildControls() {
    for (const b of document.querySelectorAll('#view button')) {
      b.onclick = () => {
        state.view = b.dataset.view;
        for (const o of document.querySelectorAll('#view button')) o.setAttribute('aria-pressed', String(o === b));
        $('chart-name').textContent = state.view === 'hit' ? 'Hit chance by AR over defense' : 'Gap between each result and the measured formula';
        $('key-formula').hidden = state.view !== 'hit';
        $('key-zero').hidden = state.view === 'hit';
        draw(); showTip();
      };
    }
    $('opt-other').onchange = e => { state.other = e.target.checked; draw(); showTip(); };
  }

  function highlight(id) {
    for (const g of document.querySelectorAll('#plot .series')) g.classList.toggle('dim', id != null && g.dataset.id !== id);
  }

  // ---- The chart ---------------------------------------------------------------------------------------------------

  function draw() {
    const plot = $('plot');
    const W = Math.max(280, plot.clientWidth - 10), narrow = W < 560;
    const H = Math.round(Math.max(290, Math.min(470, W * 0.54)));
    const m = { t: 24, r: narrow ? 14 : 22, b: 42, l: 46 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const vis = series.filter(s => state.on.has(s.id));
    const hit = state.view === 'hit';

    // Y: the whole 0 to 100% for hit chance; for the gap, far enough either way to hold every result and its range.
    let lo = 0, hi = 100, step = 20;
    if (!hit) {
      const reach = Math.max(4, ...(vis.length ? vis : series).flatMap(s => s.results.map(r => Math.max(r.hi - r.fit, r.fit - r.lo) * 100)));
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
      const yy = Math.round(y(v)) + 0.5, base = hit ? v === 0 : Math.abs(v) < 1e-9;
      grid.append(el('line', { x1: m.l, x2: m.l + pw, y1: yy, y2: yy, class: base ? 'axisline' : 'gridline' }));
      grid.append(el('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'tick' }, hit ? `${v}%` : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`));
    }
    const xStep = pw >= 520 ? 0.25 : 0.5;
    for (let r = 0; r <= xMax + 1e-9; r += xStep) {
      grid.append(el('line', { x1: x(r), x2: x(r), y1: m.t + ph, y2: m.t + ph + 5, class: 'axisline' }));
      grid.append(el('text', { x: x(r), y: m.t + ph + 19, 'text-anchor': r === 0 ? 'start' : 'middle', class: 'tick' }, times(r)));
    }
    grid.append(el('text', { x: m.l - 38, y: 14, class: 'axis-title' }, hit ? 'Hit chance' : 'Result, against the formula, in points'));
    grid.append(el('text', { x: m.l + pw, y: H - 5, 'text-anchor': 'end', class: 'axis-title' }, 'AR ÷ defense'));
    svg.append(grid);

    // A curve sampled along the axis: the measured formula, the linear one, or the gap between them.
    const path = fn => {
      const pts = [];
      for (let i = 0; i <= 220; i++) { const r = xMax * i / 220; pts.push(`${x(r).toFixed(1)},${y(fn(r)).toFixed(1)}`); }
      return 'M' + pts.join('L');
    };

    // The linear formula's lines go under everything else.
    if (state.other) {
      for (const s of vis) {
        const g = el('g', { class: 'series', 'data-id': s.id, style: `--c:${s.color}`, 'clip-path': 'url(#plot-area)' });
        g.append(el('path', { d: path(r => (hit ? linearFormula(r, s.slider) : linearFormula(r, s.slider) - formula(r, s.slider)) * 100), class: 'other' }));
        svg.append(g);
      }
    }
    for (const s of vis) {
      const g = el('g', { class: 'series', 'data-id': s.id, style: `--c:${s.color}` });
      if (hit) g.append(el('path', { d: path(r => formula(r, s.slider) * 100), class: 'measured' }));
      // Each result: its 95% range as a thin bar, the share that landed as a dot.
      for (const r of s.results) {
        const cx = x(r.ratio).toFixed(1), off = hit ? 0 : r.fit;
        g.append(el('line', { x1: cx, x2: cx, y1: y((r.lo - off) * 100).toFixed(1), y2: y((r.hi - off) * 100).toFixed(1), class: 'whisker' }));
      }
      for (const r of s.results) {
        g.append(el('circle', { cx: x(r.ratio).toFixed(1), cy: y((r.share - (hit ? 0 : r.fit)) * 100).toFixed(1), r: narrow ? 2.2 : 3, class: narrow ? 'reading small' : 'reading' }));
      }
      svg.append(g);
    }
    // Each curve's name sits above it on the left, where the three are furthest apart.
    if (hit && !narrow) {
      for (const s of vis) {
        const at = 0.46, g = el('g', { class: 'series', 'data-id': s.id });
        g.append(el('text', { x: (x(at) - 2).toFixed(1), y: (y(formula(at, s.slider) * 100) - 9).toFixed(1), 'text-anchor': 'end', class: 'label' }, s.name));
        svg.append(g);
      }
    }
    if (!vis.length) svg.append(el('text', { x: m.l + pw / 2, y: m.t + ph / 2, 'text-anchor': 'middle', class: 'empty' }, 'Switch a slider setting on above.'));

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

  const describe = vis => `${state.view === 'hit' ? 'Hit chance' : 'Gap between each result and the measured formula'} against AR over defense from 0 to ${times(xMax)}, with the defender’s slider at ${
    vis.length ? vis.map(s => s.name.toLowerCase()).join(', ') : 'no setting'}. The tables below the chart give the same numbers.`;

  function drawHover() {
    const g = document.getElementById('hover');
    if (!g || !geom) return;
    g.replaceChildren();
    if (state.hover == null) return;
    const { x, y, m, ph } = geom, hx = Math.round(x(state.hover)) + 0.5;
    g.append(el('line', { x1: hx, x2: hx, y1: m.t, y2: m.t + ph, class: 'cross' }));
    if (state.view !== 'hit') return;
    for (const s of series) {
      if (state.on.has(s.id)) g.append(el('circle', { cx: x(state.hover), cy: y(formula(state.hover, s.slider) * 100), r: 4.5, class: 'end', style: `--c:${s.color}` }));
    }
  }

  // The readout at the AR over defense under the pointer (or, on a phone, the last one touched): the measured
  // formula's hit chance at each slider setting switched on, with the linear formula's figure and how far the two are apart.
  function showTip() {
    const tip = $('tip'), plot = $('plot');
    drawHover();
    const docked = getComputedStyle(tip).position === 'static';
    const ratio = state.hover;
    plot.setAttribute('aria-valuenow', ratio ?? 1);
    if (ratio == null) {
      plot.removeAttribute('aria-valuetext');
      tip.hidden = !docked;
      tip.replaceChildren(html('p', 'hint', 'Touch or drag across the chart to read the hit chance at any AR over defense.'));
      return;
    }
    const table = html('table'), spoken = [];
    for (const s of series) {
      if (!state.on.has(s.id)) continue;
      const f = formula(ratio, s.slider), o = linearFormula(ratio, s.slider);
      const tr = html('tr');
      tr.append(keyCell('td', s.color), html('td', 'v', pc(f)), html('td', 'n', s.name), html('td', 's', `linear ${pc(o)}`), html('td', 's', points((o - f) * 100)));
      table.append(tr);
      spoken.push(`${s.name} ${pc(f)}, by the linear formula ${pc(o)}`);
    }
    tip.replaceChildren(html('h3', '', `AR at ${ratio.toFixed(2)} × defense`), spoken.length ? table : html('p', 'hint', 'No slider setting is switched on.'));
    tip.hidden = false;
    plot.setAttribute('aria-valuetext', `AR at ${ratio.toFixed(2)} times the defense: ${spoken.join('; ')}`);
    if (!docked && geom) {
      // Parked in the plot's top left corner, which the curves leave empty. While the crosshair is under that corner
      // it moves to the crosshair's right.
      const hx = geom.x(ratio) + 5, w = tip.offsetWidth, corner = geom.m.l + 16;
      const left = hx < corner + w + 24 ? hx + 14 : corner;
      tip.style.transform = `translate(${Math.round(left)}px, ${geom.m.t + 4}px)`;
    } else tip.style.transform = '';
  }

  // Arrow keys read along the chart, as the pointer does, starting where AR equals the defense.
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

  // ---- Work out a hit chance ----------------------------------------------------------------------------------------

  function buildCalculator() {
    for (const id of ['calc-ar', 'calc-def', 'calc-slider']) $(id).oninput = showCalculator;
    showCalculator();
  }

  function showCalculator() {
    const ar = +$('calc-ar').value, def = +$('calc-def').value, slider = +$('calc-slider').value;
    $('calc-slider-name').textContent = SLIDERS[slider] ? SLIDERS[slider].name.toLowerCase() : `${slider > 0 ? '+' : '−'}${Math.abs(slider)}`;
    const out = $('calc-out');
    out.replaceChildren();
    if (!(ar > 0) || !(def > 0)) { out.textContent = 'Enter an AR and a defense above 0.'; return; }
    const ratio = ar / def, f = formula(ratio, slider), o = linearFormula(ratio, slider);
    out.append(html('b', 'big', pc(f)), ' of swings land.');
    out.append(html('span', 'sub', `AR is ${ratio.toFixed(2)} × the defense. By the linear formula it would be ${pc(o)}${Math.abs(o - f) < 0.0005 ? ', the same' : `, ${points((o - f) * 100)} points`}.`));
  }

  // ---- Tables ------------------------------------------------------------------------------------------------------

  function buildTables() {
    // The measured formula's hit chance at round steps of AR over defense, for each slider setting, with the linear
    // formula's figure beside it.
    const order = [...series].reverse(); // full defensive first, as the slider runs
    const head = $('by-ratio-head'), body = $('by-ratio');
    head.append(html('th', '', 'AR ÷ defense'));
    for (const s of order) head.append(keyCell('th', s.color, s.name));
    for (let ratio = 0.25; ratio <= 2 + 1e-9; ratio += 0.25) {
      const tr = html('tr');
      tr.append(html('th', 'num', ratio.toFixed(2)));
      for (const s of order) {
        const td = html('td', '', pc(formula(ratio, s.slider)));
        td.append(html('span', 'gap', `linear ${pc(linearFormula(ratio, s.slider))}`));
        tr.append(td);
      }
      body.append(tr);
    }

    // Every result, in order along the chart.
    const rows = $('results');
    for (const r of [...results].sort((a, b) => a.ratio - b.ratio || a.slider - b.slider)) {
      const s = series.find(q => q.slider === r.slider);
      const tr = html('tr');
      tr.append(keyCell('th', s.color, s.name), html('td', '', sliderName(r.attackerSlider).toLowerCase()), html('td', '', nf(r.ar)), html('td', '', nf(r.def)), html('td', '', r.ratio.toFixed(2)),
        html('td', '', nf(r.swings)), html('td', '', pc(r.share)), html('td', '', `${pc(r.lo)} to ${pc(r.hi)}`), html('td', '', pc(r.fit)),
        html('td', '', points((r.share - r.fit) * 100)), html('td', '', pc(r.other)));
      rows.append(tr);
    }
  }
})();
