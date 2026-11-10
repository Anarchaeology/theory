// AR multiplier page: loads data/ar-multiplier.json and draws every measured profession's curve on one chart, with
// the old number's straight line for each, a readout at any AR, a two-profession comparison and the tables.
// Everything on the page comes from that one file: a new profession or more readings is a data change only.
(() => {
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';

  // One fixed color per profession (theory.css, --s-*). A profession keeps its color whatever else is switched on.
  // A newly measured profession needs a line here; until it has one it draws in gray.
  const COLOR = { keeper: 'purple', fixer: 'pink', doctor: 'cyan', trader: 'green', bureaucrat: 'gold' };
  const colorOf = p => (COLOR[p.id] ? `var(--s-${COLOR[p.id]})` : 'var(--muted)');

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const nf = n => Math.round(n).toLocaleString('en');
  // Three decimals, with an exact half rounded up (3.9875 is 3.988, though the binary number sits just under it).
  const f3 = v => (Math.round(v * 1000 + 1e-6) / 1000).toFixed(3);
  // The old numbers as they are usually written: 0.30, 0.1544.
  const oldNumber = p => (String(p.old).length < 4 ? p.old.toFixed(2) : String(p.old));
  const pct = v => { const r = Math.round(v * 10) / 10; return r === 0 ? '0.0%' : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}%`; };
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

  let cap, measured = [], unmeasured = [], xMin = 1000, xMax = 3000, geom = null;
  const state = { picked: new Set(), preview: null, view: 'mult', old: true, hover: null, cmp: { a: null, b: null, ar: 2075 } };

  // What the chart shows: the professions picked, plus the one whose button is pointed at, so pointing shows what
  // picking it would. With none picked and none pointed at, that is every profession.
  const isShown = p => state.picked.has(p.id) || p.id === state.preview || (!state.picked.size && !state.preview);

  // The old number's straight line, the measured curve (null outside what was measured) and the gap between them in percent.
  const oldAt = (p, ar) => ar <= cap.ar ? ar / cap.arPerPoint + 1 : cap.multiplier + (ar - cap.ar) / cap.arPerPoint * p.old;
  function measuredAt(p, ar) {
    if (ar < cap.ar || ar > p.last) return null;
    const pts = p.pts;
    for (let i = 1; i < pts.length; i++) {
      if (ar <= pts[i][0]) {
        const [a0, m0] = pts[i - 1], [a1, m1] = pts[i];
        return m0 + (m1 - m0) * (ar - a0) / (a1 - a0);
      }
    }
    return null;
  }
  const gapAt = (p, ar) => { const m = measuredAt(p, ar); return m == null ? null : (m / oldAt(p, ar) - 1) * 100; };
  const valueAt = (p, ar) => state.view === 'mult' ? measuredAt(p, ar) : gapAt(p, ar);

  fetch('data/ar-multiplier.json')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch(() => {
      $('plot').textContent = location.protocol === 'file:'
        ? 'The curves could not be loaded: this page needs to be opened through a web server, not as a file.'
        : 'The curves could not be loaded.';
      $('plot').classList.add('caption');
    });

  function init(data) {
    cap = data.softCap;
    for (const p of data.professions) {
      if (!p.points.length) { unmeasured.push(p); continue; }
      // Every curve starts from the soft cap, where all professions share one multiplier.
      p.pts = [[cap.ar, cap.multiplier], ...p.points];
      p.last = p.points[p.points.length - 1][0];
      p.color = colorOf(p);
      measured.push(p);
    }
    xMin = cap.ar;
    xMax = Math.ceil(Math.max(...measured.map(p => p.last)) / 100) * 100;
    const has = id => measured.some(p => p.id === id);
    state.cmp.a = has('doctor') ? 'doctor' : measured[0].id;
    state.cmp.b = has('bureaucrat') ? 'bureaucrat' : measured[Math.min(1, measured.length - 1)].id;

    buildChips();
    buildControls();
    buildCompare();
    buildTables();
    if (data.updated) {
      const d = data.updated;
      $('updated').textContent = `Curves updated ${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}.`;
    }
    draw();
    showTip();
    new ResizeObserver(() => { draw(); showTip(); }).observe($('plot'));
  }

  // ---- Controls ----------------------------------------------------------------------------------------------------

  // The profession buttons. Clicking picks: the first click leaves that profession as the only one shown, each click
  // after that adds a profession or takes one off, and taking the last one off brings every profession back.
  // Pointing at a button shows the chart as it would be with that profession picked too: alone while none is
  // picked, beside the picked ones otherwise.
  function buildChips() {
    const box = $('chips');
    // The button pointed at lights up with its color while its curve is on the chart because of it.
    const mark = id => { for (const c of box.children) c.classList.toggle('previewing', id != null && c.dataset.id === id); };
    const preview = id => { if (state.preview !== id) { state.preview = id; mark(id); draw(); showTip(); } };
    for (const p of measured) {
      const b = html('button', 'chip');
      b.type = 'button';
      b.style.setProperty('--c', p.color);
      b.dataset.id = p.id;
      b.setAttribute('aria-pressed', 'false');
      b.append(html('span', 'key'), html('span', '', p.name));
      b.onclick = () => {
        state.picked.has(p.id) ? state.picked.delete(p.id) : state.picked.add(p.id);
        b.setAttribute('aria-pressed', String(state.picked.has(p.id)));
        box.classList.toggle('has-picks', state.picked.size > 0);
        // What the click did shows at once: the pointer is still on the button, and it would otherwise keep a
        // profession on the chart that the click has just taken off. Pointing counts again from the next button.
        state.preview = null; mark(null);
        draw(); showTip();
      };
      // A touch has no pointing before the tap, and a click moves focus without the keyboard having asked for it.
      b.onpointerenter = e => { if (e.pointerType === 'mouse') preview(p.id); };
      // Leaving, or losing focus, only ends the pointing if this button's is the one in force: pressing the mouse on
      // another button takes focus from the one clicked before, and that must not blank what is being pointed at.
      b.onpointerleave = () => { if (state.preview === p.id) preview(null); };
      b.onfocus = () => { if (b.matches(':focus-visible')) preview(p.id); };
      b.onblur = () => { if (state.preview === p.id && !b.matches(':hover')) preview(null); };
      box.append(b);
    }
  }

  function buildControls() {
    for (const b of document.querySelectorAll('#view button')) {
      b.onclick = () => {
        state.view = b.dataset.view;
        for (const o of document.querySelectorAll('#view button')) o.setAttribute('aria-pressed', String(o === b));
        $('opt-old').disabled = state.view !== 'mult';
        $('chart-name').textContent = state.view === 'mult' ? 'Damage multiplier by attack rating' : 'Gap between each measured curve and its old line';
        $('key-old').hidden = state.view !== 'mult';
        $('key-zero').hidden = state.view === 'mult';
        draw(); showTip();
      };
    }
    $('opt-old').onchange = e => { state.old = e.target.checked; draw(); showTip(); };
  }

  // ---- The chart ---------------------------------------------------------------------------------------------------

  // Round steps for an axis: the smallest of the candidates that leaves no more than `most` gridlines.
  const stepFor = (span, most, steps) => steps.find(s => span / s <= most) || steps[steps.length - 1];

  function draw() {
    const plot = $('plot');
    const W = Math.max(280, plot.clientWidth - 10), narrow = W < 560;
    const H = Math.round(Math.max(290, Math.min(470, W * 0.54)));
    const m = { t: 24, r: narrow ? 14 : 82, b: 42, l: 46 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const vis = measured.filter(isShown);
    const mult = state.view === 'mult';

    // Y fits the professions picked, and the one pointed at with them, so the lower curves can be looked at closely
    // with the upper ones off. With none picked it fits them all, and stays put as the pointer moves along the
    // buttons, so each profession is seen at the same scale.
    const forFit = state.picked.size ? measured.filter(p => state.picked.has(p.id) || p.id === state.preview) : measured;
    let lo, hi, step;
    if (mult) {
      lo = cap.multiplier;
      hi = Math.max(...forFit.map(p => Math.max(p.pts[p.pts.length - 1][1], state.old ? oldAt(p, xMax) : 0)));
      step = stepFor(Math.max(hi - lo, 0.2), ph < 200 ? 5 : 8, [0.05, 0.1, 0.2, 0.25, 0.5, 1]);
      hi = lo + Math.max(2, Math.ceil((hi - lo) / step - 1e-9)) * step;
    } else {
      const gaps = forFit.flatMap(p => p.points.map(([ar]) => gapAt(p, ar)));
      // A little room past the largest gaps either way, then out to the next round step.
      lo = Math.min(0, ...gaps) - 0.3; hi = Math.max(0, ...gaps) + 0.3;
      step = stepFor(hi - lo, ph < 200 ? 5 : 8, [0.5, 1, 2, 2.5, 5, 10]);
      lo = Math.floor(lo / step) * step;
      hi = Math.ceil(hi / step) * step;
    }
    const x = ar => m.l + (ar - xMin) / (xMax - xMin) * pw;
    const y = v => m.t + (hi - v) / (hi - lo) * ph;
    geom = { W, H, m, pw, ph, x, y, narrow };

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': describe(vis) });

    // Gridlines and the y axis' numbers.
    const grid = el('g');
    for (let i = 0; lo + i * step <= hi + 1e-9; i++) {
      const v = lo + i * step, yy = Math.round(y(v)) + 0.5;
      const zero = mult ? i === 0 : Math.abs(v) < 1e-9;
      grid.append(el('line', { x1: m.l, x2: m.l + pw, y1: yy, y2: yy, class: zero ? 'axisline' : 'gridline' }));
      grid.append(el('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'tick' },
        mult ? v.toFixed(step < 0.1 ? 2 : (step * 10) % 1 ? 2 : 1) : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(step % 1 ? 1 : 0)}%`));
    }
    if (!mult) {
      grid.append(el('line', { x1: m.l, x2: m.l + pw, y1: Math.round(y(lo)) + 0.5, y2: Math.round(y(lo)) + 0.5, class: 'gridline' }));
    }
    const xStep = pw >= 520 ? 250 : 500;
    for (let ar = xMin; ar <= xMax; ar += xStep) {
      grid.append(el('line', { x1: x(ar), x2: x(ar), y1: m.t + ph, y2: m.t + ph + 5, class: 'axisline' }));
      grid.append(el('text', { x: x(ar), y: m.t + ph + 19, 'text-anchor': ar === xMin ? 'start' : 'middle', class: 'tick' }, nf(ar)));
    }
    grid.append(el('text', { x: m.l - 38, y: 14, class: 'axis-title' }, mult ? 'Damage multiplier' : 'Measured, against the old line'));
    grid.append(el('text', { x: m.l + pw, y: H - 5, 'text-anchor': 'end', class: 'axis-title' }, 'Attack rating'));
    svg.append(grid);

    // The old lines go under the measured ones.
    if (mult && state.old) {
      for (const p of vis) {
        const g = el('g', { class: 'series', 'data-id': p.id, style: `--c:${p.color}` });
        g.append(el('line', { x1: x(xMin), y1: y(cap.multiplier), x2: x(xMax), y2: y(oldAt(p, xMax)), class: 'old' }));
        svg.append(g);
      }
    }
    const labels = [];
    for (const p of vis) {
      const g = el('g', { class: 'series', 'data-id': p.id, style: `--c:${p.color}` });
      const pts = p.pts.map(([ar, v]) => [x(ar), y(mult ? v : (v / oldAt(p, ar) - 1) * 100)]);
      g.append(el('path', { d: 'M' + pts.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('L'), class: 'measured' }));
      // A dot at every reading, so it shows where the curve was measured and where it is only joined up. The first
      // point is the soft cap, which every profession shares and which isn't a reading.
      for (const q of pts.slice(1)) {
        g.append(el('circle', { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: narrow ? 2.2 : 3, class: narrow ? 'reading small' : 'reading' }));
      }
      const end = pts[pts.length - 1];
      svg.append(g);
      labels.push({ p, x: end[0] + 9, y: end[1] + 4, w: p.name.length * 7.2 });
    }
    // Names at the line ends, where there is room for them. Two that would overlap are moved apart.
    if (!narrow) {
      labels.sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) {
        for (let j = 0; j < i; j++) {
          const a = labels[j], b = labels[i];
          if (b.x < a.x + a.w + 6 && a.x < b.x + b.w + 6 && b.y - a.y < 15) b.y = a.y + 15;
        }
      }
      for (const l of labels) {
        const g = el('g', { class: 'series', 'data-id': l.p.id });
        g.append(el('text', { x: l.x.toFixed(1), y: l.y.toFixed(1), class: 'label' }, l.p.name));
        svg.append(g);
      }
    }

    svg.append(el('g', { id: 'hover' }));
    const hit = el('rect', { x: m.l, y: m.t - 6, width: pw, height: ph + 12, class: 'hit' });
    svg.append(hit);

    const old = plot.querySelector('svg');
    old ? old.replaceWith(svg) : plot.prepend(svg);

    const arAt = e => {
      const box = svg.getBoundingClientRect();
      const ar = xMin + (e.clientX - box.left - m.l) / pw * (xMax - xMin);
      return Math.round(Math.max(xMin, Math.min(xMax, ar)));
    };
    hit.onpointermove = e => { state.hover = arAt(e); showTip(); };
    hit.onpointerdown = e => { state.hover = arAt(e); showTip(); };
    hit.onpointerleave = e => { if (e.pointerType === 'mouse') { state.hover = null; showTip(); } };
    drawHover();
  }

  const describe = vis => `${state.view === 'mult' ? 'Damage multiplier' : 'Gap from the old line'} against attack rating from ${nf(xMin)} to ${nf(xMax)} for ${
    vis.length ? vis.map(p => p.name).join(', ') : 'no professions'}. The tables below the chart give the same numbers.`;

  function drawHover() {
    const g = document.getElementById('hover');
    if (!g || !geom) return;
    g.replaceChildren();
    if (state.hover == null) return;
    const { x, y, m, ph } = geom, hx = Math.round(x(state.hover)) + 0.5;
    g.append(el('line', { x1: hx, x2: hx, y1: m.t, y2: m.t + ph, class: 'cross' }));
    for (const p of measured) {
      if (!isShown(p)) continue;
      const v = valueAt(p, state.hover);
      if (v != null) g.append(el('circle', { cx: x(state.hover), cy: y(v), r: 4.5, class: 'end', style: `--c:${p.color}` }));
    }
  }

  // The readout at the AR under the pointer (or, on a phone, the last one touched): every profession switched on,
  // highest first, with the old figure and the gap.
  function showTip() {
    const tip = $('tip'), plot = $('plot');
    drawHover();
    const docked = getComputedStyle(tip).position === 'static';
    const ar = state.hover;
    plot.setAttribute('aria-valuenow', ar ?? middleAr());
    if (ar == null) {
      plot.removeAttribute('aria-valuetext');
      tip.hidden = !docked;
      tip.replaceChildren(html('p', 'hint', 'Touch or drag across the chart to read each curve at an AR.'));
      return;
    }
    const rows = measured.filter(isShown)
      .map(p => ({ p, m: measuredAt(p, ar), s: oldAt(p, ar) }))
      .sort((a, b) => (b.m == null ? -1 : state.view === 'mult' ? b.m : b.m / b.s) - (a.m == null ? -1 : state.view === 'mult' ? a.m : a.m / a.s));
    const table = html('table');
    const spoken = [];
    for (const { p, m, s } of rows) {
      const tr = html('tr');
      const key = html('td'); const k = html('span', 'k'); k.style.setProperty('--c', p.color); key.append(k);
      const gap = m == null ? null : (m / s - 1) * 100;
      if (m == null) {
        tr.append(key, html('td', 'v', '—'), html('td', 'n', p.name), html('td', 's', `measured to ${nf(p.last)}`));
        spoken.push(`${p.name} not measured here`);
      } else if (state.view === 'mult') {
        tr.append(key, html('td', 'v', f3(m)), html('td', 'n', p.name), html('td', 's', `old ${f3(s)}`), html('td', 's', pct(gap)));
        spoken.push(`${p.name} ${f3(m)}, old ${f3(s)}`);
      } else {
        tr.append(key, html('td', 'v', pct(gap)), html('td', 'n', p.name), html('td', 's', `${f3(m)} against ${f3(s)}`));
        spoken.push(`${p.name} ${pct(gap)}`);
      }
      if (m == null && state.view === 'mult') tr.lastChild.colSpan = 2;
      table.append(tr);
    }
    tip.replaceChildren(html('h3', '', `AR ${nf(ar)}`), table);
    tip.hidden = false;
    plot.setAttribute('aria-valuetext', `AR ${nf(ar)}: ${spoken.join('; ')}`);
    if (!docked && geom) {
      // Parked in the plot's top left corner, which the curves leave empty, so it never covers the lines around the
      // crosshair. While the crosshair is under that corner it moves to the crosshair's right.
      const hx = geom.x(ar) + 5, w = tip.offsetWidth, corner = geom.m.l + 16;
      const left = hx < corner + w + 24 ? hx + 14 : corner;
      tip.style.transform = `translate(${Math.round(left)}px, ${geom.m.t + 4}px)`;
    } else tip.style.transform = '';
  }

  // Arrow keys read along the chart, as the pointer does, starting from the middle of it.
  const middleAr = () => Math.round((xMin + xMax) / 100) * 50;
  function onKey(e) {
    const move = { ArrowLeft: -10, ArrowRight: 10, PageDown: -100, PageUp: 100 }[e.key];
    if (move) state.hover = Math.max(xMin, Math.min(xMax, (state.hover ?? middleAr()) + move * (e.shiftKey ? 10 : 1)));
    else if (e.key === 'Home') state.hover = xMin;
    else if (e.key === 'End') state.hover = xMax;
    else if (e.key === 'Escape') state.hover = null;
    else return;
    e.preventDefault();
    showTip();
  }

  // ---- Compare two professions --------------------------------------------------------------------------------------

  function buildCompare() {
    const plot = $('plot');
    plot.setAttribute('aria-valuemin', xMin); plot.setAttribute('aria-valuemax', xMax);
    plot.onkeydown = onKey;
    plot.onblur = () => { if (getComputedStyle($('tip')).position !== 'static') { state.hover = null; showTip(); } };
    for (const [id, key] of [['cmp-a', 'a'], ['cmp-b', 'b']]) {
      const sel = $(id);
      for (const p of measured) sel.append(new Option(p.name, p.id));
      sel.value = state.cmp[key];
      sel.onchange = () => { state.cmp[key] = sel.value; showCompare(); };
    }
    for (const id of ['cmp-ar', 'cmp-slider']) {
      const input = $(id);
      input.min = xMin; input.max = xMax;
      input.oninput = () => { if (input.value !== '') setCompareAr(+input.value, input); };
    }
    $('cmp-ar').onchange = () => setCompareAr(+$('cmp-ar').value || state.cmp.ar);
    setCompareAr(state.cmp.ar);
  }

  function setCompareAr(ar, from) {
    state.cmp.ar = Math.round(Math.max(xMin, Math.min(xMax, ar)));
    for (const id of ['cmp-ar', 'cmp-slider']) if ($(id) !== from) $(id).value = state.cmp.ar;
    showCompare();
  }

  function showCompare() {
    const a = measured.find(p => p.id === state.cmp.a), b = measured.find(p => p.id === state.cmp.b), ar = state.cmp.ar;
    const ma = measuredAt(a, ar), mb = measuredAt(b, ar), sa = oldAt(a, ar), sb = oldAt(b, ar);
    const cell = (v, cls) => html('td', cls, v == null ? '—' : f3(v));
    const versus = (va, vb) => html('td', '', va == null || vb == null ? '—' : pct((va / vb - 1) * 100));
    $('cmp-head').replaceChildren(html('th', '', `At AR ${nf(ar)}`), html('th', '', a.name), html('th', '', b.name), html('th', '', `${a.name} against ${b.name}`));
    const row = (label, va, vb) => { const tr = html('tr'); tr.append(html('th', '', label), cell(va), cell(vb), versus(va, vb)); return tr; };
    $('cmp-body').replaceChildren(row('Measured in game', ma, mb), row('The old numbers', sa, sb));

    const out = $('cmp-verdict');
    out.replaceChildren();
    if (a === b) { out.textContent = 'Pick two different professions.'; return; }
    const oldGap = (sa / sb - 1) * 100;
    // "4.2% higher than the Bureaucrat's", or just "4.2% higher" where the other profession has just been named.
    const amount = g => Math.abs(g) < 0.05 ? 'the same' : `${Math.abs(g).toFixed(1)}% ${g > 0 ? 'higher' : 'lower'}`;
    const word = g => Math.abs(g) < 0.05 ? 'the same as' : `${amount(g)} than`;
    if (ma == null || mb == null) {
      const short = [a, b].filter(p => ar > p.last).map(p => `the ${p.name} to AR ${nf(p.last)}`).join(' and ');
      out.append(`Not measured for both at AR ${nf(ar)}: the readings take ${short}.`);
      out.append(html('span', 'sub', `By the old numbers, the ${a.name}’s multiplier would be ${word(oldGap)} the ${b.name}’s.`));
      return;
    }
    const gap = (ma / mb - 1) * 100;
    out.append('Measured, the ', html('b', '', a.name), '’s multiplier is ', html('b', '', word(gap)), ' the ', html('b', '', b.name), '’s at this AR.');
    const flipped = Math.abs(gap) >= 0.05 && Math.abs(oldGap) >= 0.05 && Math.sign(gap) !== Math.sign(oldGap);
    out.append(html('span', 'sub', `By the old numbers it would be ${amount(oldGap)}${flipped ? ', the other way round' : ''}.`));
  }

  // ---- Tables ------------------------------------------------------------------------------------------------------

  function buildTables() {
    // One row per measured profession: what the old number says, what the readings average, and where the two stand at
    // the last reading.
    const body = $('by-prof');
    for (const p of measured) {
      const lastM = p.pts[p.pts.length - 1][1], lastS = oldAt(p, p.last);
      const average = (lastM - cap.multiplier) / (p.last - cap.ar) * cap.arPerPoint;
      const tr = html('tr');
      const name = html('th'); const k = html('span', 'k'); k.style.setProperty('--c', p.color); name.append(k, p.name);
      const gap = html('td', '', pct((lastM / lastS - 1) * 100));
      tr.append(name, html('td', '', oldNumber(p)), html('td', '', average.toFixed(3)), html('td', '', nf(p.last)),
        html('td', '', f3(lastM)), html('td', '', f3(lastS)), gap);
      body.append(tr);
    }
    $('unmeasured').textContent = unmeasured.length
      ? `Not measured yet, with the old number for each: ${unmeasured.map(p => `${p.name} ${oldNumber(p)}`).join(', ')}.`
      : '';

    // The measured multiplier every 100 AR, with its gap from the old line.
    const head = $('by-ar-head'), rows = $('by-ar');
    head.append(html('th', '', 'AR'));
    for (const p of measured) { const th = html('th'); const k = html('span', 'k'); k.style.setProperty('--c', p.color); th.append(k, p.name); head.append(th); }
    const lastRead = Math.max(...measured.map(p => p.last));
    for (let ar = xMin; ar <= lastRead; ar += 100) {
      const tr = html('tr');
      tr.append(html('th', 'num', nf(ar)));
      for (const p of measured) {
        const m = measuredAt(p, ar);
        const td = html('td', m == null ? 'none' : '', m == null ? '—' : f3(m));
        if (m != null && ar > xMin) td.append(html('span', 'gap', pct(gapAt(p, ar))));
        tr.append(td);
      }
      rows.append(tr);
    }
  }
})();
