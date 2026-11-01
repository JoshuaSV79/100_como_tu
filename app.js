/* 100 como tú · lógica de la SPA. JavaScript vanilla, sin dependencias, compatible con CSP estricta. */
'use strict';
(() => {
  const D = window.CCPC_DATA;
  if (!D) return;

  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nf = new Intl.NumberFormat('es-MX');
  const pf = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt = n => nf.format(n);
  const pct = r => pf.format(r * 100);
  const pc = r => Math.round(r * 100);
  const UMBRAL = D.meta.umbralMin || 0;
  const LAST = D.elecciones[D.elecciones.length - 1];

  // Mapa de cuadros: clave INEGI -> [código ISO 3166-2:MX, columna, fila]
  const TILE = {
    '02': ['BCN', 0, 0], '26': ['SON', 1, 0], '08': ['CHH', 2, 0], '05': ['COA', 3, 0], '19': ['NLE', 4, 0], '28': ['TAM', 5, 0],
    '03': ['BCS', 0, 1], '25': ['SIN', 1, 1], '10': ['DUR', 2, 1], '32': ['ZAC', 3, 1], '24': ['SLP', 4, 1],
    '18': ['NAY', 1, 2], '14': ['JAL', 2, 2], '01': ['AGU', 3, 2], '11': ['GUA', 4, 2], '22': ['QUE', 5, 2], '13': ['HID', 6, 2],
    '30': ['VER', 7, 2], '31': ['YUC', 9, 2], '23': ['ROO', 10, 2],
    '06': ['COL', 1, 3], '16': ['MIC', 2, 3], '15': ['MEX', 4, 3], '09': ['CMX', 5, 3], '29': ['TLA', 6, 3],
    '21': ['PUE', 7, 3], '27': ['TAB', 8, 3], '04': ['CAM', 9, 3],
    '12': ['GRO', 4, 4], '17': ['MOR', 5, 4], '20': ['OAX', 6, 4], '07': ['CHP', 7, 4]
  };
  const PERSON_PATH = 'M5 15h14a3 3 0 0 1 3 3v9h-3.5v11H14v-9h-4v9H5.5V27H2v-9a3 3 0 0 1 3-3z';

  const SUJ = { T: 'personas', M: 'mujeres', H: 'hombres' };
  const entNombre = new Map(D.entidades.map(e => [e.clave, e.nombre]));
  const porAnio = new Map(D.elecciones.map(a => [a, []]));
  D.registros.forEach(r => { const l = porAnio.get(r.a); if (l) l.push(r); });
  const esPres = a => !!(D.tipos && D.tipos[a] === 'P');
  const tipoTxt = a => (esPres(a) ? 'presidencial' : 'intermedia');

  const state = {
    anio: LAST,
    edad: D.edades.includes('20-24') ? '20-24' : D.edades[0],
    sexo: 'T',
    ent: '00',
    reveal: false,   // false = el resultado está oculto y se pide una apuesta
    guess: 50,
    bet: null        // { guess, key } de la última apuesta revelada
  };
  let pin = null;
  let timer = null;

  const el = {
    app: $('#explora'), stage: $('#stage'), grid: $('#grid'), grid2: $('#grid2'), frase: $('#frase'), big: $('#big'),
    bigTag: $('#big-tag'), detalle: $('#detalle'), verdict: $('#verdict'), badge: $('#badge'),
    comp: $('#comparar'), frase2: $('#frase2'), brecha: $('#brecha'),
    chipsEdad: $('#chips-edad'), chipsSexo: $('#chips-sexo'), selEnt: $('#sel-ent'),
    tiles: $('#tiles'), anios: $('#anios'), play: $('#btn-play'), pin: $('#btn-pin'),
    unpin: $('#btn-unpin'), card: $('#btn-card'), rebet: $('#btn-rebet'), grupo: $('#grupo-label'), trend: $('#trend'),
    tbody: $('#tabla-body'), estado: $('#estado'), lmin: $('#leg-min'), lmax: $('#leg-max'),
    banner: $('#banner-ejemplo'), guess: $('#guess'), guessOut: $('#guess-out'), reveal: $('#btn-reveal'), skip: $('#btn-skip'),
    dock: $('#dock'), dockN: $('#dock-n'), dockT: $('#dock-t'), dockGo: $('#dock-go'), tray: $('#tray'), stories: $('#stories')
  };

  /* ---------- Cálculo ---------- */
  function agg(a, g, s, e) {
    let ln = 0, v = 0;
    for (const r of porAnio.get(a) || []) {
      if (g !== 'ALL' && r.g !== g) continue;
      if (s !== 'T' && r.s !== s) continue;
      if (e !== '00' && r.e !== e) continue;
      ln += r.ln; v += r.v;
    }
    return { ln, v, rate: ln ? v / ln : null };
  }
  const valido = r => r.rate !== null && r.ln >= UMBRAL;
  const rate = (a, g, s, e) => { const r = agg(a, g, s, e); return valido(r) ? r.rate : null; };
  const entidad = e => (e === '00' ? 'México' : entNombre.get(e));
  const edadTxt = g => (g === 'ALL' ? ' de todas las edades' : g.endsWith('+') ? ` de ${g.slice(0, -1)} años o más` : ` de ${g.replace('-', ' a ')} años`);
  const edadLbl = g => (g === 'ALL' ? 'todas las edades' : g.endsWith('+') ? `${g.slice(0, -1)} años o más` : `${g.replace('-', ' a ')} años`);
  const grupoTxt = sel => `de cada 100 ${SUJ[sel.s]}${edadTxt(sel.g)}`;
  const fraseTxt = (sel, anio, n) => `En ${entidad(sel.e)}, ${grupoTxt(sel)}, ${n} participaron en ${anio}.`;
  const fraseQ = (sel, anio) => `En ${entidad(sel.e)}, ${grupoTxt(sel)}, ¿cuántas crees que participaron en ${anio}?`;
  const etiqueta = sel => {
    const suj = SUJ[sel.s][0].toUpperCase() + SUJ[sel.s].slice(1);
    const ed = sel.g === 'ALL' ? 'todas las edades' : sel.g.endsWith('+') ? `${sel.g.slice(0, -1)} años o más` : `${sel.g.replace('-', '–')} años`;
    return `${suj} · ${ed} · ${entidad(sel.e)}`;
  };
  const aviso = msg => { el.estado.textContent = ''; setTimeout(() => { el.estado.textContent = msg; }, 30); };
  const goTo = node => node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });

  /* ---------- Construcción de la interfaz ---------- */
  function mkChip(parent, kind, value, text) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = text;
    b.dataset.drop = kind; b.dataset.value = value;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => set(kind, value));
    parent.appendChild(b);
  }
  function buildGrid(node) {
    node.textContent = '';
    for (let i = 0; i < 100; i++) {
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 24 40'); s.setAttribute('class', 'fig off');
      const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#person');
      s.appendChild(u); node.appendChild(s);
    }
  }
  // kind: 'on' (dato) o 'guess' (apuesta). flip reinicia la animación aunque las figuras ya estuvieran encendidas.
  function paintGrid(node, n, kind, flip) {
    if (flip) node.dataset.flip = node.dataset.flip === '1' ? '0' : '1';
    Array.from(node.children).forEach((f, i) => {
      const lit = n !== null && i < n;
      f.style.animationDelay = reduce || !flip ? '0ms' : `${i * 6}ms`;
      f.classList.toggle('on', lit && kind === 'on');
      f.classList.toggle('guess', lit && kind === 'guess');
      f.classList.toggle('off', !lit);
    });
  }

  mkChip(el.chipsEdad, 'edad', 'ALL', 'Todas');
  D.edades.forEach(g => mkChip(el.chipsEdad, 'edad', g, g.replace('-', '–')));
  mkChip(el.chipsSexo, 'sexo', 'T', 'Todos');
  mkChip(el.chipsSexo, 'sexo', 'M', 'Mujeres');
  mkChip(el.chipsSexo, 'sexo', 'H', 'Hombres');

  const opt0 = document.createElement('option'); opt0.value = '00'; opt0.textContent = 'Todo México';
  el.selEnt.appendChild(opt0);
  D.entidades.forEach(e => { const o = document.createElement('option'); o.value = e.clave; o.textContent = e.nombre; el.selEnt.appendChild(o); });
  el.selEnt.addEventListener('change', () => set('ent', el.selEnt.value));

  const tileEls = new Map();
  D.entidades.forEach(e => {
    const t = TILE[e.clave]; if (!t) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tile'; b.textContent = t[0];
    b.dataset.drop = 'ent'; b.dataset.value = e.clave; b.dataset.step = 'none';
    b.style.gridColumn = String(t[1] + 1); b.style.gridRow = String(t[2] + 1);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => set('ent', e.clave));
    el.tiles.appendChild(b); tileEls.set(e.clave, b);
  });

  D.elecciones.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = String(a); b.dataset.anio = String(a);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => { stop(); state.anio = a; render(); });
    el.anios.appendChild(b);
  });

  buildGrid(el.grid); buildGrid(el.grid2);
  $('#m-fuente').textContent = D.meta.fuente;
  $('#m-corte').textContent = D.meta.corte;
  $('#m-metrica').textContent = D.meta.metrica;
  if (D.meta.esEjemplo) el.banner.hidden = false;

  /* ---------- Hero: la cifra nacional recorre las elecciones y se detiene en la última ---------- */
  (function hero() {
    const hg = $('#hero-grid'); if (!hg) return;
    buildGrid(hg);
    const yearsEl = $('#hero-years');
    const nat = D.elecciones.map(a => { const r = agg(a, 'ALL', 'T', '00'); return valido(r) ? pc(r.rate) : null; });
    D.elecciones.forEach(a => { const s = document.createElement('span'); s.textContent = String(a); s.dataset.y = String(a); yearsEl.appendChild(s); });
    const show = i => {
      const a = D.elecciones[i];
      paintGrid(hg, nat[i], 'on', true);
      $('#hero-n').textContent = nat[i] === null ? '–' : String(nat[i]);
      $('#hero-year').textContent = String(a);
      $('#hero-tipo').textContent = tipoTxt(a);
      yearsEl.querySelectorAll('span').forEach(s => s.classList.toggle('now', s.dataset.y === String(a)));
    };
    let i = reduce ? D.elecciones.length - 1 : 0;
    show(i);
    if (!reduce) {
      const t = setInterval(() => { i++; show(i); if (i >= D.elecciones.length - 1) clearInterval(t); }, 1900);
    }
  })();

  /* ---------- Estado ---------- */
  function set(kind, value) { stop(); state[kind] = value; render(); }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    el.play.textContent = '▶ Reproducir el tiempo';
    el.frase.setAttribute('aria-live', 'polite');
  }
  function startPlay() {
    let i = 0;
    state.reveal = true;
    state.anio = D.elecciones[0]; render();
    el.play.textContent = '⏸ Pausar';
    el.frase.setAttribute('aria-live', 'off');
    timer = setInterval(() => {
      i++;
      if (i >= D.elecciones.length) { stop(); return; }
      state.anio = D.elecciones[i]; render();
    }, 1700);
  }
  el.play.addEventListener('click', () => { if (timer) stop(); else startPlay(); });
  el.pin.addEventListener('click', () => {
    pin = { g: state.edad, s: state.sexo, e: state.ent };
    aviso(`Grupo fijado: ${etiqueta(pin)}. Cambia las opciones para compararlo.`);
    render();
  });
  el.unpin.addEventListener('click', () => { pin = null; aviso('Comparación quitada.'); render(); });
  el.card.addEventListener('click', tarjeta);

  const keyOf = (sel, a) => `${sel.g}|${sel.s}|${sel.e}|${a}`;
  el.guess.addEventListener('input', () => {
    state.guess = Number(el.guess.value);
    paintGrid(el.grid, state.guess, 'guess', false);
    el.big.textContent = String(state.guess); shown = state.guess;
    el.guessOut.textContent = `${state.guess} de 100`;
  });
  el.reveal.addEventListener('click', () => {
    const sel = { g: state.edad, s: state.sexo, e: state.ent };
    state.bet = { guess: state.guess, key: keyOf(sel, state.anio) };
    state.reveal = true; render();
    aviso(el.frase.textContent);
  });
  el.skip.addEventListener('click', () => { state.bet = null; state.reveal = true; render(); });
  el.rebet.addEventListener('click', () => { stop(); state.bet = null; state.reveal = false; render(); goTo(el.stage); });
  el.dockGo.addEventListener('click', () => goTo(el.stage));

  /* ---------- Render ---------- */
  function syncPressed(container, kind) {
    container.querySelectorAll('[data-drop]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === state[kind])));
  }
  function serie(sel) {
    return D.elecciones.map(a => rate(a, sel.g, sel.s, sel.e));
  }

  // Contador animado del número grande
  let shown = null, cu = 0;
  function setBig(n) {
    cancelAnimationFrame(cu);
    if (n === null) { el.big.textContent = '–'; shown = null; return; }
    if (reduce || shown === null) { el.big.textContent = String(n); shown = n; return; }
    const from = shown, t0 = performance.now(), dur = 600;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur);
      shown = Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3)));
      el.big.textContent = String(shown);
      if (k < 1) cu = requestAnimationFrame(step); else { shown = n; el.big.textContent = String(n); }
    };
    cu = requestAnimationFrame(step);
  }

  function render() {
    const sel = { g: state.edad, s: state.sexo, e: state.ent };
    const r = agg(state.anio, sel.g, sel.s, sel.e);
    const ok = valido(r);
    const n = ok ? Math.round(r.rate * 100) : null;
    const mode = state.reveal || !ok ? 'reveal' : 'bet';
    el.stage.dataset.mode = mode;
    el.badge.textContent = `Elección ${tipoTxt(state.anio)} · ${state.anio}`;
    el.grupo.textContent = etiqueta(sel);

    if (mode === 'bet') {
      el.frase.textContent = fraseQ(sel, state.anio);
      paintGrid(el.grid, state.guess, 'guess', false);
      setBig(null); el.big.textContent = String(state.guess); shown = state.guess;
      el.bigTag.textContent = 'tu apuesta';
      el.guess.value = String(state.guess);
      el.guessOut.textContent = `${state.guess} de 100`;
      el.verdict.hidden = true;
      el.detalle.textContent = '';
    } else {
      el.frase.textContent = ok ? fraseTxt(sel, state.anio, n) : 'Este grupo es demasiado pequeño para mostrarlo con rigor. Prueba con una combinación más amplia.';
      paintGrid(el.grid, n, 'on', true);
      setBig(n); el.bigTag.textContent = '';
      el.detalle.textContent = ok ? `Dato exacto: ${pct(r.rate)} % (${fmt(r.v)} de ${fmt(r.ln)} ${D.meta.denominador}). Para dibujar, se redondea a ${n} de 100.` : '';
      if (ok && state.bet && state.bet.key === keyOf(sel, state.anio)) {
        const d = Math.abs(state.bet.guess - n);
        el.verdict.textContent = d === 0 ? `Tu apuesta fue ${state.bet.guess} y el dato es ${n}: acertaste.`
          : `Tu apuesta fue ${state.bet.guess}; el dato es ${n}. Estuviste a ${d} ${d === 1 ? 'punto' : 'puntos'}.`;
        el.verdict.hidden = false;
      } else el.verdict.hidden = true;
    }

    syncPressed(el.chipsEdad, 'edad'); syncPressed(el.chipsSexo, 'sexo'); syncPressed(el.tiles, 'ent');
    el.selEnt.value = state.ent;
    el.anios.querySelectorAll('[data-anio]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.anio) === state.anio)));

    // Barra fija para celular
    el.dockN.textContent = mode === 'reveal' && ok ? String(n) : '?';
    el.dockT.textContent = `${etiqueta(sel)} · ${state.anio}`;

    renderTiles();
    renderPin(r, ok);
    renderTrend(sel);
  }

  function renderTiles() {
    const vals = D.entidades.map(e => ({ c: e.clave, r: agg(state.anio, state.edad, state.sexo, e.clave) }));
    const rates = vals.filter(x => valido(x.r)).map(x => x.r.rate);
    const min = Math.min(...rates), max = Math.max(...rates);
    const oculto = !state.reveal;   // mientras se apuesta no se delata el dato en el mapa
    vals.forEach(({ c, r }) => {
      const b = tileEls.get(c); if (!b) return;
      if (oculto) { b.dataset.step = 'none'; b.setAttribute('aria-label', entNombre.get(c)); b.removeAttribute('title'); return; }
      if (!valido(r)) { b.dataset.step = 'none'; b.setAttribute('aria-label', `${entNombre.get(c)}, sin datos suficientes`); return; }
      const step = Math.min(4, Math.floor(((r.rate - min) / (max - min || 1)) * 5));
      b.dataset.step = String(step);
      b.setAttribute('aria-label', `${entNombre.get(c)}, ${pct(r.rate)} %`);
      b.title = `${entNombre.get(c)}: ${pct(r.rate)} %`;
    });
    el.lmin.textContent = !oculto && rates.length ? `${pct(min)} %` : '';
    el.lmax.textContent = !oculto && rates.length ? `${pct(max)} %` : '';
  }

  function renderPin(r, ok) {
    const show = !!pin && state.reveal;
    el.unpin.hidden = !pin;
    el.pin.hidden = !!pin;
    el.comp.hidden = !show;
    if (!show) return;
    const rp = agg(state.anio, pin.g, pin.s, pin.e);
    const okp = valido(rp);
    const np = okp ? Math.round(rp.rate * 100) : null;
    paintGrid(el.grid2, np, 'on', true);
    el.frase2.textContent = okp ? fraseTxt(pin, state.anio, np) : 'El grupo fijado no tiene datos suficientes en esta elección.';
    if (ok && okp) {
      const d = Math.abs(r.rate - rp.rate) * 100;
      el.brecha.textContent = d < 0.05
        ? 'Los dos grupos tienen la misma participación en esta elección.'
        : `Diferencia entre ambos grupos en ${state.anio}: ${pf.format(d)} puntos porcentuales. Es una diferencia entre grupos, no una explicación de sus causas.`;
    } else { el.brecha.textContent = ''; }
  }

  function renderTrend(sel) {
    const W = 360, H = 230, L = 38, R = 16, T = 16, B = 44;
    const n = D.elecciones.length;
    const xs = i => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
    const ys = v => T + (1 - v) * (H - T - B);
    const svg = el.trend; svg.textContent = '';
    const add = (tag, attrs, text) => {
      const node = document.createElementNS(NS, tag);
      for (const k in attrs) node.setAttribute(k, attrs[k]);
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node); return node;
    };
    const path = vals => {
      let d = '', pen = false;
      vals.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${xs(i).toFixed(1)} ${ys(v).toFixed(1)} `; pen = true; });
      return d.trim();
    };
    const bw = n > 1 ? (W - L - R) / (n - 1) * 0.7 : 40;
    D.elecciones.forEach((a, i) => { if (esPres(a)) add('rect', { x: xs(i) - bw / 2, y: T - 6, width: bw, height: H - T - B + 6, class: 'band' }); });

    [0, 0.25, 0.5, 0.75, 1].forEach(v => {
      add('line', { x1: L, x2: W - R, y1: ys(v), y2: ys(v), class: 'gl' });
      add('text', { x: L - 6, y: ys(v) + 3.5, 'text-anchor': 'end', class: 'lbl' }, `${v * 100} %`);
    });
    D.elecciones.forEach((a, i) => {
      add('text', { x: xs(i), y: H - 22, 'text-anchor': 'middle', class: 'lbl' }, String(a));
      add('text', { x: xs(i), y: H - 9, 'text-anchor': 'middle', class: 'lbl' }, esPres(a) ? 'Pres.' : 'Interm.');
    });

    const main = serie(sel);
    const pinS = pin ? serie(pin) : null;
    if (pinS) {
      add('path', { d: path(pinS), class: 'line-pin' });
      pinS.forEach((v, i) => { if (v !== null) add('circle', { cx: xs(i), cy: ys(v), r: 3, class: 'dot-pin' }); });
    }
    const hide = !state.reveal;
    if (!hide) {
      add('path', { d: path(main), class: 'line-main' });
      main.forEach((v, i) => { if (v !== null) add('circle', { cx: xs(i), cy: ys(v), r: 3.5, class: 'dot-main' }); });
      const idx = D.elecciones.indexOf(state.anio);
      if (main[idx] !== null) {
        add('circle', { cx: xs(idx), cy: ys(main[idx]), r: 6.5, class: 'dot-now' });
        const lx = Math.min(W - R - 16, Math.max(L + 16, xs(idx)));
        add('text', { x: lx, y: ys(main[idx]) - 12, 'text-anchor': 'middle', class: 'val' }, `${pct(main[idx])} %`);
      }
    } else {
      add('text', { x: (L + W - R) / 2, y: ys(0.5), 'text-anchor': 'middle', class: 'val' }, 'Haz tu apuesta para ver la línea');
    }

    svg.setAttribute('aria-label', hide ? 'Gráfica de participación por elección; se muestra después de apostar.'
      : 'Participación por elección. ' + D.elecciones.map((a, i) => `${a}: ${main[i] === null ? 'sin datos' : pct(main[i]) + ' %'}`).join('; ') + '.');

    el.tbody.textContent = '';
    D.elecciones.forEach((a, i) => {
      const tr = document.createElement('tr');
      [String(a), hide ? '—' : (main[i] === null ? '—' : `${pct(main[i])} %`), pinS ? (pinS[i] === null ? '—' : `${pct(pinS[i])} %`) : '—']
        .forEach(t => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      el.tbody.appendChild(tr);
    });
  }

  /* ---------- Historias calculadas con los datos (nada tecleado a mano) ---------- */
  function go(o) {
    stop();
    state.edad = o.edad ?? state.edad; state.sexo = o.sexo ?? state.sexo; state.ent = o.ent ?? state.ent;
    state.anio = o.anio ?? LAST; state.bet = null; state.reveal = true;
    pin = o.pin || null;
    render();
    goTo(el.stage);
    if (o.play) setTimeout(startPlay, reduce ? 0 : 700);
  }
  function buildStories() {
    const cards = [];
    // 1. Por edad (elección más reciente, todo el país)
    const porEdad = D.edades.map(g => ({ g, r: rate(LAST, g, 'T', '00') })).filter(x => x.r !== null);
    if (porEdad.length > 1) {
      const lo = porEdad.reduce((a, b) => (b.r < a.r ? b : a)), hi = porEdad.reduce((a, b) => (b.r > a.r ? b : a));
      cards.push({
        k: 'Por edad', stat: `${pc(lo.r)} vs ${pc(hi.r)}`,
        txt: `En ${LAST}, de cada 100 personas de ${edadLbl(lo.g)}, ${pc(lo.r)} participaron. Entre las de ${edadLbl(hi.g)}, ${pc(hi.r)}: ${pf.format((hi.r - lo.r) * 100)} puntos de diferencia.`,
        btn: `Ver a las de ${edadLbl(lo.g)}`,
        act: () => go({ edad: lo.g, sexo: 'T', ent: '00', pin: { g: hi.g, s: 'T', e: '00' } })
      });
    }
    // 2. Un grupo joven a lo largo de las presidenciales
    const P = D.elecciones.filter(esPres);
    if (D.edades.includes('20-24') && P.length > 1) {
      const a0 = P[0], a1 = P[P.length - 1];
      const r0 = rate(a0, '20-24', 'T', '00'), r1 = rate(a1, '20-24', 'T', '00');
      if (r0 !== null && r1 !== null) cards.push({
        k: '20 a 24 años, en el tiempo', stat: `${pc(r0)} → ${pc(r1)}`,
        txt: `Entre las personas de 20 a 24 años, la participación en elecciones presidenciales pasó de ${pc(r0)} de cada 100 en ${a0} a ${pc(r1)} en ${a1}.`,
        btn: 'Reproducir el tiempo',
        act: () => go({ edad: '20-24', sexo: 'T', ent: '00', anio: a0, play: true })
      });
    }
    // 3. Mujeres y hombres
    const m = rate(LAST, 'ALL', 'M', '00'), h = rate(LAST, 'ALL', 'H', '00');
    if (m !== null && h !== null) cards.push({
      k: 'Mujeres y hombres', stat: `${pc(m)} vs ${pc(h)}`,
      txt: `En ${LAST}, de cada 100 mujeres, ${pc(m)} participaron; de cada 100 hombres, ${pc(h)}. Es la diferencia entre dos promedios, no una explicación de sus causas.`,
      btn: 'Compararlos en la cuadrícula',
      act: () => go({ edad: 'ALL', sexo: 'M', ent: '00', pin: { g: 'ALL', s: 'H', e: '00' } })
    });
    // 4. Entre entidades
    const porEnt = D.entidades.map(e => ({ c: e.clave, n: e.nombre, r: rate(LAST, 'ALL', 'T', e.clave) })).filter(x => x.r !== null);
    if (porEnt.length > 1) {
      const lo = porEnt.reduce((a, b) => (b.r < a.r ? b : a)), hi = porEnt.reduce((a, b) => (b.r > a.r ? b : a));
      cards.push({
        k: 'Entre entidades', stat: `${pc(lo.r)} vs ${pc(hi.r)}`,
        txt: `En ${LAST}, la participación va de ${pc(lo.r)} de cada 100 en ${lo.n} a ${pc(hi.r)} en ${hi.n}. Son contextos distintos, no una calificación.`,
        btn: `Ver ${hi.n} frente a ${lo.n}`,
        act: () => go({ edad: 'ALL', sexo: 'T', ent: hi.c, pin: { g: 'ALL', s: 'T', e: lo.c } })
      });
    }
    // 5. Presidenciales e intermedias
    const I = D.elecciones.filter(a => !esPres(a));
    const nat = a => rate(a, 'ALL', 'T', '00');
    const lst = arr => arr.map(a => pc(nat(a)));
    if (P.length && I.length && [...P, ...I].every(a => nat(a) !== null)) cards.push({
      k: 'Presidenciales e intermedias', stat: `${Math.min(...lst(I))}–${Math.max(...lst(I))} vs ${Math.min(...lst(P))}–${Math.max(...lst(P))}`,
      txt: `De cada 100 personas, en las elecciones intermedias (${I.join(', ')}) participaron entre ${Math.min(...lst(I))} y ${Math.max(...lst(I))}; en las presidenciales (${P.join(', ')}), entre ${Math.min(...lst(P))} y ${Math.max(...lst(P))}. Por eso se comparan por separado.`,
      btn: 'Reproducir el tiempo',
      act: () => go({ edad: 'ALL', sexo: 'T', ent: '00', anio: D.elecciones[0], play: true })
    });

    el.stories.textContent = '';
    cards.forEach(c => {
      const a = document.createElement('article'); a.className = 'story';
      const k = document.createElement('p'); k.className = 'story-k'; k.textContent = c.k;
      const s = document.createElement('p'); s.className = 'story-stat'; s.textContent = c.stat;
      const t = document.createElement('p'); t.className = 'story-t'; t.textContent = c.txt;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sec'; b.textContent = c.btn;
      b.addEventListener('click', c.act);
      a.append(k, s, t, b); el.stories.appendChild(a);
    });
  }

  /* ---------- Arrastrar el monito (mejora progresiva: los botones siempre funcionan) ---------- */
  const av = $('#avatar');
  let drag = null;
  let raf = 0;
  const dropAt = (x, y) => {
    for (const n of document.elementsFromPoint(x, y)) { const d = n.closest && n.closest('[data-drop]'); if (d) return d; }
    return null;
  };
  av.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    av.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, sy: window.scrollY, over: null };
    av.classList.add('dragging');
    el.tray.classList.add('touched');
    if (!raf) raf = requestAnimationFrame(tick);
  });
  // El monito sigue al dedo aunque la página se desplace: en celular el mapa queda lejos del avatar.
  function follow() {
    av.style.transform = `translate(${drag.px - drag.x}px, ${drag.py - drag.y + (window.scrollY - drag.sy)}px) scale(1.15)`;
    const t = dropAt(drag.px, drag.py);
    if (t !== drag.over) {
      if (drag.over) drag.over.classList.remove('drop-hover');
      if (t) t.classList.add('drop-hover');
      drag.over = t;
    }
  }
  function tick() {
    if (!drag) { raf = 0; return; }
    const edge = 90, h = window.innerHeight;
    let dy = 0;
    if (drag.py > h - edge) dy = Math.ceil((drag.py - (h - edge)) / 5);
    else if (drag.py < edge) dy = -Math.ceil((edge - drag.py) / 5);
    if (dy) { window.scrollBy({ top: dy, behavior: 'instant' }); follow(); }
    raf = requestAnimationFrame(tick);
  }
  av.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.px = e.clientX; drag.py = e.clientY;
    follow();
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const t = drag.over;
    if (t) t.classList.remove('drop-hover');
    drag = null;
    av.classList.remove('dragging');
    av.style.transform = '';
    if (e.type === 'pointerup' && t) {
      set(t.dataset.drop, t.dataset.value);
      t.classList.add('picked'); setTimeout(() => t.classList.remove('picked'), 800);
    }
  };
  av.addEventListener('pointerup', endDrag);
  av.addEventListener('pointercancel', endDrag);

  /* ---------- Barra fija (solo celular): aparece si el explorador está en pantalla y el resultado no ---------- */
  if ('IntersectionObserver' in window) {
    const vis = { app: false, stage: false };
    const upd = () => { const on = vis.app && !vis.stage; el.dock.classList.toggle('show', on); el.dock.setAttribute('aria-hidden', String(!on)); el.dockGo.tabIndex = on ? 0 : -1; };
    new IntersectionObserver(es => { es.forEach(e => { vis.app = e.isIntersecting; }); upd(); }, { threshold: 0.05 }).observe(el.app);
    new IntersectionObserver(es => { es.forEach(e => { vis.stage = e.isIntersecting; }); upd(); }, { threshold: 0.4 }).observe(el.stage);
  }

  /* ---------- Tarjeta compartible (se genera en el navegador, no se sube nada) · 1080×1920 ---------- */
  function wrap(ctx, text, x, y, maxW, lh) {
    let line = '';
    for (const w of text.split(' ')) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = t;
    }
    if (line) { ctx.fillText(line, x, y); y += lh; }
    return y;
  }
  function persona(ctx, path, cx, top, s, on) {
    ctx.save();
    ctx.translate(cx - 12 * s, top); ctx.scale(s, s);
    ctx.lineWidth = 1.7; ctx.lineJoin = 'round';
    ctx.strokeStyle = on ? '#EDE6DA' : '#7D838C'; ctx.fillStyle = '#EDE6DA';
    ctx.beginPath(); ctx.arc(12, 7, 5, 0, Math.PI * 2);
    if (on) ctx.fill(); ctx.stroke();
    if (on) ctx.fill(path); ctx.stroke(path);
    ctx.restore();
  }
  async function tarjeta() {
    const sel = { g: state.edad, s: state.sexo, e: state.ent };
    const r = agg(state.anio, sel.g, sel.s, sel.e);
    if (!valido(r)) { aviso('No hay datos suficientes para generar la tarjeta de este grupo.'); return; }
    const n = Math.round(r.rate * 100);
    const W = 1080, H = 1920, F = 'system-ui, Arial, sans-serif';
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#2B2F36'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#34393F'; x.fillRect(0, 0, W, 12);
    x.textBaseline = 'top';
    x.fillStyle = '#EDE6DA'; x.font = `800 60px ${F}`; x.fillText('100 como tú', 80, 80);
    x.fillStyle = '#B9BEC5'; x.font = `500 28px ${F}`; x.fillText(`Elección ${tipoTxt(state.anio)} ${state.anio} · INE`, 80, 156);
    x.fillStyle = '#FFFFFF'; x.font = `700 46px ${F}`;
    const yEnd = wrap(x, fraseTxt(sel, state.anio, n), 80, 240, W - 160, 60);
    x.fillStyle = '#EDE6DA'; x.font = `900 330px ${F}`; x.fillText(String(n), 70, Math.max(yEnd + 10, 440));
    const wN = x.measureText(String(n)).width;
    x.fillStyle = '#FFFFFF'; x.font = `800 84px ${F}`; x.fillText('de 100', 70 + wN + 24, Math.max(yEnd + 10, 440) + 215);
    const cell = 88, gx = (W - cell * 10) / 2, gy = 840, s = 1.75, path = new Path2D(PERSON_PATH);
    for (let i = 0; i < 100; i++) persona(x, path, gx + (i % 10) * cell + cell / 2, gy + Math.floor(i / 10) * cell + 4, s, i < n);
    x.fillStyle = '#D5D8DC'; x.font = `400 27px ${F}`;
    x.fillText(`Fuente: INE, Plataforma CCPC. Dato exacto: ${pct(r.rate)} %.`, 80, 1812);
    x.fillText('Promedio de grupo; no predice conductas individuales.', 80, 1848);
    if (D.meta.esEjemplo) {
      x.fillStyle = '#7A5200'; x.fillRect(0, 1880, W, 40);
      x.fillStyle = '#FFFFFF'; x.font = `700 24px ${F}`;
      x.fillText('DATOS DE EJEMPLO · NO SON CIFRAS DEL INE', 80, 1888);
    }
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    if (!blob) { aviso('No se pudo generar la tarjeta.'); return; }
    const prev = $('#tarjeta-prev'), img = $('#tarjeta-img');
    if (prev && img) { img.src = c.toDataURL('image/png'); img.alt = fraseTxt(sel, state.anio, n); prev.hidden = false; }
    const file = new File([blob], '100-como-tu.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '100 como tú', text: fraseTxt(sel, state.anio, n) }); aviso('Tarjeta lista para compartir.'); return; }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '100-como-tu.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    aviso('Tarjeta lista. Si no se descargó, mantén presionada la imagen para guardarla.');
  }

  buildStories();
  render();
})();
