import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/500.css';
import 'katex/dist/katex.min.css';
import renderMathInElement from 'katex/contrib/auto-render';
import './style.css';
import * as C from './core.js';

const L = 1000, BASE = [90, 910];
const OFFS = [[-60, 0], [60, 0], [0, -60], [0, 60], [-42, -42], [42, 42], [-42, 42], [42, -42]];
const $ = id => document.getElementById(id);
const nf = (v, d) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
function sci(v, d) {
  if (!isFinite(v)) return '∞';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return nf(v, Math.max(0, d - e));
  const m = v / 10 ** e;
  return nf(m, d) + '×10' + String(e).split('').map(c => SUP[c]).join('');
}
const meters = v => !isFinite(v) || v > 5e4 ? '> 50 km' : v >= 100 ? nf(v, 0) + ' m' : nf(v, 1) + ' m';

// ---------- tema ----------
let T = {};
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  T = { bg: g('--bg'), surface: g('--surface'), map: g('--map'), contour: g('--contour'), contourS: g('--contour-strong'), grid: g('--grid'), ink: g('--ink'), muted: g('--muted'), line: g('--line'),
    accent: g('--accent'), accentSoft: g('--accent-soft'), signal: g('--signal'), signalSoft: g('--signal-soft'), warn: g('--warn'), good: g('--good'),
    sF: g('--s-fisher'), sG: g('--s-goto'), sR: g('--s-random'), n2: g('--n2'), n3: g('--n3'), n4: g('--n4'), n6: g('--n6'), n8: g('--n8'), heatInfo: g('--heat-info'), heatLike: g('--heat-like'), mono: g('--f-mono'), body: g('--f-body') };
  topoCache = null;
}

// ---------- canvas ----------
function fit(cv) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height, dpr };
}

// relevo procedural para o fundo topográfico
function height(x, y) {
  const B = [[300, 260, 230, 1.0], [760, 640, 270, 0.95], [660, 190, 150, 0.6], [200, 720, 190, 0.55], [930, 960, 210, 0.45], [480, 520, 120, 0.35]];
  let z = 0; for (const b of B) { const dx = x - b[0], dy = y - b[1]; z += b[3] * Math.exp(-(dx * dx + dy * dy) / (2 * b[2] * b[2])); }
  return z + 0.12 * Math.sin(x / 120 + 1) * Math.cos(y / 160);
}
let topoCache = null;
function topo(w, dpr) {
  const key = w + '|' + dpr + '|' + T.map + T.contour;
  if (topoCache && topoCache.key === key) return topoCache.cv;
  const cv = document.createElement('canvas'); cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = T.map; ctx.fillRect(0, 0, w, w);
  const G = 110, s = w / G, cell = L / G;
  const Z = []; for (let i = 0; i <= G; i++) { Z.push([]); for (let j = 0; j <= G; j++) Z[i].push(height(i * cell, j * cell)); }
  for (let lv = 1; lv <= 22; lv++) {
    const lev = -0.1 + lv * 0.07;
    ctx.strokeStyle = lv % 5 === 0 ? T.contourS : T.contour; ctx.lineWidth = lv % 5 === 0 ? 1.1 : 0.7;
    ctx.beginPath();
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const c = [[i, j, Z[i][j]], [i + 1, j, Z[i + 1][j]], [i + 1, j + 1, Z[i + 1][j + 1]], [i, j + 1, Z[i][j + 1]]];
      const pts = [];
      for (let e = 0; e < 4; e++) {
        const a = c[e], b = c[(e + 1) % 4];
        if ((a[2] - lev) * (b[2] - lev) < 0) { const t = (lev - a[2]) / (b[2] - a[2]); pts.push([(a[0] + t * (b[0] - a[0])) * s, (a[1] + t * (b[1] - a[1])) * s]); }
      }
      for (let k = 0; k + 1 < pts.length; k += 2) { ctx.moveTo(pts[k][0], pts[k][1]); ctx.lineTo(pts[k + 1][0], pts[k + 1][1]); }
    }
    ctx.stroke();
  }
  topoCache = { key, cv };
  return cv;
}
function drawBase(ctx, s, w) {
  ctx.drawImage(topo(w, window.devicePixelRatio || 1), 0, 0, w, w);
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let k = 100; k < L; k += 100) { ctx.moveTo(k * s, 0); ctx.lineTo(k * s, w); ctx.moveTo(0, k * s); ctx.lineTo(w, k * s); }
  ctx.stroke();
  // escala
  const x0 = w - 14 - 200 * s, y0 = w - 16;
  ctx.fillStyle = T.surface; ctx.globalAlpha = .8; ctx.fillRect(x0 - 6, y0 - 16, 200 * s + 12, 24); ctx.globalAlpha = 1;
  ctx.strokeStyle = T.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 200 * s, y0); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0 + 2); ctx.moveTo(x0 + 200 * s, y0 - 4); ctx.lineTo(x0 + 200 * s, y0 + 2); ctx.stroke();
  ctx.fillStyle = T.ink; ctx.font = '500 11px ' + T.mono; ctx.textAlign = 'center'; ctx.fillText('200 m', x0 + 100 * s, y0 - 5);
  // base (heliponto)
  const bx = BASE[0] * s, by = BASE[1] * s;
  ctx.fillStyle = T.surface; ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(bx, by, 13, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = T.ink; ctx.font = '700 13px ' + T.mono; ctx.textBaseline = 'middle'; ctx.fillText('H', bx, by + 1); ctx.textBaseline = 'alphabetic';
  ctx.font = '500 11px ' + T.body; ctx.fillStyle = T.muted; ctx.fillText('Base', bx, by + 26);
}
function drawPerson(ctx, x, y, label, left) {
  ctx.fillStyle = T.accent; ctx.strokeStyle = T.surface; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = T.surface; ctx.beginPath(); ctx.arc(x, y - 2.2, 2.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + 5.2, 4, Math.PI, 0); ctx.fill();
  if (label) { ctx.font = '600 11px ' + T.body; ctx.fillStyle = T.ink; ctx.textAlign = left ? 'right' : 'left'; ctx.fillText(label, left ? x - 12 : x + 12, y - 9); }
}
function drawDrone(ctx, x, y, i, col) {
  ctx.strokeStyle = T.surface; ctx.lineWidth = 2;
  for (const [dx, dy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 3.6, 0, 7); ctx.fillStyle = col; ctx.globalAlpha = .55; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
  ctx.fillStyle = col; ctx.strokeStyle = T.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4.6, 0, 7); ctx.fill(); ctx.stroke();
  ctx.font = '600 10.5px ' + T.mono; ctx.fillStyle = T.ink; ctx.textAlign = 'left'; ctx.fillText(String(i + 1), x + 10, y - 7);
}
function drawEllipse(ctx, cx, cy, E, s, fill, stroke, lw) {
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(E.rx * s, 0.5), Math.max(E.ry * s, 0.5), E.ang, 0, 2 * Math.PI);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
}
function heatImage(G, fn, rgb, gamma, maxA) {
  const cv = document.createElement('canvas'); cv.width = G; cv.height = G;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(G, G);
  const vals = new Float64Array(G * G); let mx = -Infinity, mn = Infinity;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const v = fn(i, j); vals[j * G + i] = v; if (v > mx) mx = v; if (v < mn) mn = v; }
  const [r, g, b] = rgb.split(',').map(Number);
  for (let k = 0; k < G * G; k++) {
    const t = mx > 0 ? Math.max(0, vals[k]) / mx : 0;
    img.data[4 * k] = r; img.data[4 * k + 1] = g; img.data[4 * k + 2] = b; img.data[4 * k + 3] = Math.round(255 * maxA * Math.pow(t, gamma));
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------- gráfico de linhas com hover ----------
function niceStep(range, n) { const raw = range / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
function lineChart(cv, cfg) {
  cv._cfg = cfg;
  const { ctx, w, h } = fit(cv);
  ctx.clearRect(0, 0, w, h);
  const series = cfg.series.filter(s => s.values.some(v => v != null && isFinite(v)));
  const n = cfg.x.length;
  const labelsRight = w >= 520 && series.length <= 4 && cfg.directLabels !== false;
  const pl = w < 390 ? 42 : 50, pr = labelsRight ? 112 : 10, pt = 10, pb = 30;
  const W = w - pl - pr, H = h - pt - pb;
  if (W < 40 || n === 0) return;
  let lo = Infinity, hi = -Infinity;
  for (const s of series) for (const v of s.values) if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (cfg.ref) { lo = Math.min(lo, cfg.ref.v); hi = Math.max(hi, cfg.ref.v); }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  let ticks = [], Y;
  if (cfg.yLog) {
    lo = Math.max(lo, 1e-3); const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi * 1.02));
    const la = Math.log10(lo) - 0.05, lb = Math.max(Math.log10(hi) + 0.05, la + 0.5);
    Y = v => pt + H - (Math.log10(Math.max(v, 1e-3)) - la) / (lb - la) * H;
    for (let e = a; e <= b; e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (Math.log10(v) >= la && Math.log10(v) <= lb) ticks.push(v); }
  } else {
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const st = niceStep(hi - lo, 4); const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
    Y = v => pt + H - (v - a) / (b - a) * H;
    for (let v = a; v <= b + st / 2; v += st) ticks.push(v);
  }
  const X = i => pl + (n <= 1 ? W / 2 : i / (n - 1) * W);
  // grade e eixos
  ctx.font = '11px ' + T.mono; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of ticks) { const y = Y(v); ctx.strokeStyle = T.line; ctx.globalAlpha = .7; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pl + W, y); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = T.muted; ctx.fillText(cfg.fmtY ? cfg.fmtY(v) : nf(v, Math.abs(v) < 10 && v % 1 ? 1 : 0), pl - 6, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const xst = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 46))));
  for (let i = 0; i < n; i += xst) ctx.fillText(String(cfg.x[i]), X(i), pt + H + 6);
  ctx.fillText(cfg.xLabel || '', pl + W / 2, pt + H + 18 > h - 12 ? h - 12 : pt + H + 18);
  ctx.textBaseline = 'alphabetic';
  if (cfg.ref) {
    const y = Y(cfg.ref.v); ctx.setLineDash([5, 4]); ctx.strokeStyle = T.muted; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(pl + W, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = T.muted; ctx.textAlign = 'left'; ctx.font = '11px ' + T.body; const below = y - pt < 16; ctx.fillText(cfg.ref.label, pl + 6, below ? y + 13 : y - 5);
  }
  const ends = [];
  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.setLineDash(s.dash || []);
    ctx.beginPath(); let started = false, last = null;
    s.values.forEach((v, i) => { if (v == null || !isFinite(v)) { started = false; return; } const x = X(i), y = Y(v); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); last = [x, y, v]; });
    ctx.stroke(); ctx.setLineDash([]);
    if (last) { ctx.fillStyle = s.color; ctx.strokeStyle = T.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(last[0], last[1], 4.5, 0, 7); ctx.fill(); ctx.stroke(); ends.push({ y: last[1], s }); }
  }
  if (labelsRight) {
    ends.sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
    ctx.font = '600 11.5px ' + T.body; ctx.textAlign = 'left';
    for (const e of ends) { ctx.fillStyle = e.s.color; ctx.fillRect(pl + W + 6, e.y - 1, 8, 2); ctx.fillStyle = T.ink; ctx.fillText(e.s.short || e.s.name, pl + W + 18, e.y + 4); }
  }
  // hover
  if (cfg.hover != null && cfg.hover >= 0 && cfg.hover < n) {
    const i = cfg.hover, x = X(i);
    ctx.strokeStyle = T.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + H); ctx.stroke();
    for (const s of series) { const v = s.values[i]; if (v == null || !isFinite(v)) continue; ctx.fillStyle = s.color; ctx.strokeStyle = T.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, Y(v), 4.5, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  cv._geom = { pl, W, n, X };
}
function attachHover(cv) {
  const box = cv.parentElement; const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; box.appendChild(tip);
  cv.addEventListener('pointermove', e => {
    const g = cv._geom, cfg = cv._cfg; if (!g || !cfg) return;
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left;
    const i = Math.max(0, Math.min(g.n - 1, Math.round((mx - g.pl) / (g.W || 1) * (g.n - 1))));
    cfg.hover = i; lineChart(cv, cfg);
    const rows = cfg.series.filter(s => s.values[i] != null && isFinite(s.values[i])).map(s => `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:6px"></span>${s.name}: ${cfg.fmtTip ? cfg.fmtTip(s.values[i]) : nf(s.values[i], 2)}</div>`).join('');
    tip.innerHTML = `<b>${cfg.xName || ''} ${cfg.x[i]}</b>${rows}`; tip.hidden = false;
    const tx = g.X(i) + 12; tip.style.left = Math.min(tx, r.width - tip.offsetWidth - 4) + 'px'; tip.style.top = '8px';
  });
  cv.addEventListener('pointerleave', () => { tip.hidden = true; if (cv._cfg) { cv._cfg.hover = null; lineChart(cv, cv._cfg); } });
}

// =========================================================
// ABA 1 — POSICIONAMENTO
// =========================================================
const A = { scaling: 'perDrone', N: 4, h: 100, sigma: 4, m: 10, dmin: 40, rob: 30, msTried: false, trans: null, bat: false, R: 560, method: 'armijo', tExp: 4.3, gain: false,
  target: [640, 360], qs: [], trails: [], hist: [], it: 0, running: false, st: {}, still: 0, status: 'idle',
  auto: true, dragDrone: false, prevQs: null, lastT: 0 };
const STEP_MS = 90; // intervalo entre iterações na animação (≈ 11 iterações por segundo)
function autoKick() { A.msTried = false; A.trans = null; if (!A.auto || A.dragDrone) return; A.running = true; A.status = 'run'; A.still = 0; if (A.it >= 1500) A.it = 0; requestA(); }
// posições exibidas: interpolação suave entre a iteração anterior e a atual
function shownQs(now) { if (!A.prevQs || A.prevQs.length !== A.qs.length) return A.qs; const a = Math.min(1, Math.max(0, (now - A.lastT) / STEP_MS)); const e = a * a * (3 - 2 * a); return A.qs.map((q, i) => [A.prevQs[i][0] + (q[0] - A.prevQs[i][0]) * e, A.prevQs[i][1] + (q[1] - A.prevQs[i][1]) * e]); }
const modelA = () => C.makeModel({ sigma: A.sigma, h: A.h });
const optsA = () => ({ dmin: A.dmin, rho: 0.01, maxMove: 30, scaling: A.scaling, cloud: C.ringCloud(A.rob), method: A.method, fixedStep: 10 ** A.tExp, cons: { L, battery: A.bat ? { c: BASE, r: A.R } : null } });
const nsA = () => A.qs.map(() => A.m);
function resetA() {
  A.qs = OFFS.slice(0, A.N).map(o => [BASE[0] + o[0], BASE[1] + o[1]]);
  A.trails = A.qs.map(q => [q.slice()]); A.it = 0; A.st = {}; A.still = 0; A.running = false; A.status = 'idle'; A.prevQs = null;
  A.hist = [];
  pushHistA(); requestA(); autoKick();
}
function pushHistA() { const M = modelA(); A.hist.push(C.objective(M, A.target, A.qs, nsA(), null, optsA()).J); if (A.hist.length > 2000) A.hist.shift(); }
function paramsChangedA() { A.st = {}; A.still = 0; if (A.status === 'conv' || A.status === 'cap') A.status = 'idle'; A.qs = A.qs.map((q, i) => C.project(q, optsA().cons, i)); A.prevQs = null; requestA(); autoKick(); }
function stepA() {
  const M = modelA(), o = optsA();
  const r = C.pgStep(M, A.target, A.qs, nsA(), null, o, A.st);
  let mv = 0; r.qs.forEach((q, i) => { mv = Math.max(mv, Math.hypot(q[0] - A.qs[i][0], q[1] - A.qs[i][1])); });
  A.qs = r.qs; A.it++;
  A.qs.forEach((q, i) => { const tr = A.trails[i]; tr.push(q.slice()); if (tr.length > 600) tr.shift(); });
  pushHistA();
  A.still = mv < 0.05 ? A.still + 1 : 0;
  if (A.still >= 3) {
    if (!A.msTried) { A.msTried = true; if (multistartA()) return; }
    A.running = false; A.status = 'conv';
  }
  else if (A.running && A.it >= 1500) { A.running = false; A.status = 'cap'; }
}
// Multistart: o gradiente parte de vários arranjos iniciais e fica com o melhor ótimo encontrado
function permutations(n) { const out = []; const a = [...Array(n).keys()]; const go = k => { if (k === n) { out.push(a.slice()); return; } for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; go(k + 1); [a[k], a[i]] = [a[i], a[k]]; } }; go(0); return out; }
function multistartA() {
  if (A.N < 2) return false;
  const M = modelA(), o = optsA(), ns = nsA(), oFast = Object.assign({}, o, { maxMove: 0 });
  const cur = C.objective(M, A.target, A.qs, ns, null, o).J;
  const R = C.rng(4242), cands = [];
  for (let k = 0; k < 12; k++) {
    const rot = k / 12 * 2 * Math.PI / A.N;
    const start = Array.from({ length: A.N }, (_, i) => C.project([A.target[0] + A.h * Math.cos(rot + 2 * Math.PI * i / A.N), A.target[1] + A.h * Math.sin(rot + 2 * Math.PI * i / A.N)], o.cons, i));
    cands.push(start);
  }
  for (let k = 0; k < 4; k++) cands.push(Array.from({ length: A.N }, (_, i) => C.project([A.target[0] + (R.u() - .5) * 600, A.target[1] + (R.u() - .5) * 600], o.cons, i)));
  const perms = permutations(A.N);
  const res = cands.map(st => {
    const q = C.optimizePlacement(M, A.target, st, ns, null, oFast, 400);
    let best = null, bd = Infinity;
    for (const p of perms) { let d = 0; for (let i = 0; i < A.N; i++) d += Math.hypot(q[p[i]][0] - A.qs[i][0], q[p[i]][1] - A.qs[i][1]); if (d < bd) { bd = d; best = p; } }
    return { q: best.map(j => q[j]), J: C.objective(M, A.target, q, ns, null, o).J, travel: bd };
  });
  const bestJ = Math.max(...res.map(r => r.J));
  A.msInfo = { from: cur, to: bestJ, starts: cands.length };
  if (bestJ < cur + 1e-3) return false;
  const pick = res.filter(r => r.J > bestJ - 1e-4).sort((a, b) => a.travel - b.travel)[0];
  A.trans = { from: A.qs.map(q => q.slice()), to: pick.q, t0: performance.now(), dur: 2600 };
  A.status = 'ms';
  return true;
}
let pendA = false;
function requestA() { if (!pendA) { pendA = true; requestAnimationFrame(frameA); } }
function frameA(now) {
  pendA = false;
  now = now || performance.now();
  if (A.trans && !A.dragDrone) {
    const t = Math.min(1, (now - A.trans.t0) / A.trans.dur), e = t * t * (3 - 2 * t);
    A.qs = A.trans.from.map((f, i) => [f[0] + (A.trans.to[i][0] - f[0]) * e, f[1] + (A.trans.to[i][1] - f[1]) * e]);
    A.prevQs = null;
    A.qs.forEach((q, i) => { const tr = A.trails[i]; tr.push(q.slice()); if (tr.length > 600) tr.shift(); });
    if (t >= 1) { A.trans = null; pushHistA(); A.status = 'run'; A.still = 0; A.st = {}; A.lastT = now; }
  } else if (A.running && !A.dragDrone && now - A.lastT >= STEP_MS) { A.prevQs = A.qs.map(q => q.slice()); stepA(); A.lastT = now; }
  const tweening = A.prevQs && now - A.lastT < STEP_MS;
  drawA(now); teleA();
  if (A.running || tweening || A.trans) requestA();
}
function drawA(now) {
  const Q = shownQs(now || performance.now());
  const cv = $('mapA'); if (!cv.offsetParent) return;
  const { ctx, w } = fit(cv), s = w / L, M = modelA(), o = optsA();
  drawBase(ctx, s, w);
  const F = C.withPrior(M, C.fisher(M, A.target, A.qs, nsA()));
  if (A.gain) {
    const G = 70, ld0 = C.logdet(F);
    const im = heatImage(G, (i, j) => { const q = [(i + .5) * L / G, (j + .5) * L / G]; return C.logdet(C.fisher(M, A.target, [q], [A.m], F)) - ld0; }, T.heatInfo, 1, .6);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(im, 0, 0, w, w);
  }
  if (A.bat) {
    ctx.setLineDash([7, 5]); ctx.strokeStyle = T.warn; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(BASE[0] * s, BASE[1] * s, A.R * s, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  const tx = A.target[0] * s, ty = A.target[1] * s;
  ctx.setLineDash([2, 4]); ctx.strokeStyle = T.muted; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(tx, ty, A.h * s, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  // trilhas
  A.trails.forEach((tr0, i) => { const tr = tr0.slice(0, -1).concat([Q[i] || tr0[tr0.length - 1]]); if (tr.length < 2) return; ctx.strokeStyle = T.signal; ctx.globalAlpha = .45; ctx.lineWidth = 1.5; ctx.beginPath(); tr.forEach((p, k) => k ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s)); ctx.stroke(); ctx.globalAlpha = 1; });
  // linhas de visada
  ctx.strokeStyle = T.signal; ctx.globalAlpha = .3; ctx.lineWidth = 1; ctx.beginPath();
  Q.forEach(q => { ctx.moveTo(q[0] * s, q[1] * s); ctx.lineTo(tx, ty); }); ctx.stroke(); ctx.globalAlpha = 1;
  const E = C.ellipse95(F);
  if (E.rx * s > 3) drawEllipse(ctx, tx, ty, E, s, T.accentSoft, T.accent, 1.8);
  if (A.rob) { ctx.fillStyle = T.accent; ctx.globalAlpha = .55; for (const c of C.ringCloud(A.rob)) { ctx.beginPath(); ctx.arc(tx + c.d[0] * s, ty + c.d[1] * s, 2, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
  drawPerson(ctx, tx, ty, 'pessoa');
  Q.forEach((q, i) => drawDrone(ctx, q[0] * s, q[1] * s, i, T.signal));
  drawInsetA(F, E);
  const th = C.theoreticalOptimum(M, A.N, A.m);
  $('chartATitle').textContent = A.rob ? 'Convergência: média de log det F sobre a nuvem de posições' : 'Convergência: log det F por iteração';
  lineChart($('chartA'), { x: A.hist.map((_, i) => i), xName: 'Iteração', xLabel: 'iteração', series: [{ name: A.rob ? 'Critério robusto' : 'log det F', short: A.rob ? 'critério' : 'log det F', color: T.signal, values: A.hist }],
    ref: th && !A.rob ? { v: th.ld, label: 'ótimo sem restrições' } : null, fmtY: v => nf(v, 0), fmtTip: v => nf(v, 3), hover: $('chartA')._cfg ? $('chartA')._cfg.hover : null });
}
function drawInsetA(F, E) {
  const cv = $('insetA'); const { ctx, w } = fit(cv);
  ctx.fillStyle = T.map; ctx.fillRect(0, 0, w, w);
  const half = Math.min(Math.max(E.rx, E.ry, 3) * 1.5, 3000), s = w / 2 / half, c = w / 2;
  const st = niceStep(half, 3);
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let v = -Math.ceil(half / st) * st; v <= half; v += st) { ctx.moveTo(c + v * s, 0); ctx.lineTo(c + v * s, w); ctx.moveTo(0, c + v * s); ctx.lineTo(w, c + v * s); }
  ctx.stroke();
  // direções dos drones
  ctx.strokeStyle = T.signal; ctx.globalAlpha = .5; ctx.lineWidth = 1.2; ctx.beginPath();
  A.qs.forEach(q => { const dx = q[0] - A.target[0], dy = q[1] - A.target[1], d = Math.hypot(dx, dy) || 1; ctx.moveTo(c, c); ctx.lineTo(c + dx / d * w * .48, c + dy / d * w * .48); });
  ctx.stroke(); ctx.globalAlpha = 1;
  drawEllipse(ctx, c, c, E, s, T.accentSoft, T.accent, 2);
  ctx.fillStyle = T.accent; ctx.beginPath(); ctx.arc(c, c, 3, 0, 7); ctx.fill();
  // barra de escala
  ctx.strokeStyle = T.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, w - 14); ctx.lineTo(12 + st * s, w - 14); ctx.stroke();
  ctx.fillStyle = T.ink; ctx.font = '500 11px ' + T.mono; ctx.textAlign = 'left'; ctx.fillText(meters(st).replace(',0', ''), 12, w - 20);
  ctx.fillStyle = T.muted; ctx.textAlign = 'right'; ctx.fillText('zoom ×' + nf(L / (2 * half), L / (2 * half) >= 10 ? 0 : 1), w - 10, 16);
  ctx.textAlign = 'left'; ctx.fillText('semieixos ' + meters(E.rx) + ' · ' + meters(E.ry), 10, 16);
}
function teleA() {
  const M = modelA(), o = optsA();
  const ob = C.objectiveGrad(M, A.target, A.qs, nsA(), null, o);
  const E = C.ellipse95(ob.F);
  $('tLd').textContent = nf(ob.ld, 3);
  $('tIt').textContent = A.it;
  $('tRms').textContent = meters(C.rmsBound(ob.F));
  const area = Math.PI * E.rx * E.ry;
  $('tArea').innerHTML = area > 1e6 ? nf(area / 1e6, 2) + ' <small>km²</small>' : nf(area, 0) + ' <small>m²</small>';
  const th = C.theoreticalOptimum(M, A.N, A.m);
  let anyActive = false;
  const rows = A.qs.map((q, i) => {
    const g = ob.g[i];
    const dT = Math.hypot(q[0] - A.target[0], q[1] - A.target[1]);
    let n = null, why = '';
    if (A.bat && Math.hypot(q[0] - BASE[0], q[1] - BASE[1]) >= A.R - 0.5) { const dx = q[0] - BASE[0], dy = q[1] - BASE[1], d = Math.hypot(dx, dy); n = [dx / d, dy / d]; why = 'bateria'; }
    else if (q[0] <= 0.5 || q[0] >= L - 0.5 || q[1] <= 0.5 || q[1] >= L - 0.5) { n = [q[0] <= 0.5 ? -1 : q[0] >= L - 0.5 ? 1 : 0, q[1] <= 0.5 ? -1 : q[1] >= L - 0.5 ? 1 : 0]; const d = Math.hypot(n[0], n[1]); n = [n[0] / d, n[1] / d]; why = 'borda do mapa'; }
    if (n) {
      anyActive = true;
      const lam = g[0] * n[0] + g[1] * n[1], tg = Math.hypot(g[0] - lam * n[0], g[1] - lam * n[1]);
      return `<tr><td class="num">${i + 1}</td><td><span class="pill act">${why}</span></td><td class="num">λ = ${sci(lam, 1)}<br>tang. ${sci(tg, 1)}</td></tr>`;
    }
    return `<tr><td class="num">${i + 1}</td><td><span class="pill ok">livre</span> <span style="font-family:var(--f-mono);font-size:11.5px;color:var(--muted)">r = ${nf(dT, 0)} m</span></td><td class="num">‖∇J‖ = ${sci(Math.hypot(g[0], g[1]), 1)}</td></tr>`;
  });
  $('kktBody').innerHTML = rows.join('');
  if (th) {
    const eff = Math.exp((ob.ld - th.ld) / 2);
    $('tEff').textContent = nf(Math.min(eff, 9.99) * 100, 1) + '%'; $('mEff').style.width = Math.min(100, eff * 100) + '%';
    const ms = A.msInfo && A.status === 'conv' && A.msInfo.to > A.msInfo.from + 1e-3 ? ' O multistart encontrou e aplicou um ótimo melhor que o do primeiro gradiente.' : '';
    $('tEffNote').textContent = A.status === 'ms' ? `O gradiente parou num ótimo local. O multistart (${A.msInfo.starts} pontos de partida) achou um arranjo melhor, e os drones estão voando até ele.`
      : (A.rob && !anyActive && !A.running && A.status === 'conv') ? `Critério robusto: média de log det F sobre posições a até ${A.rob} m da pessoa. No ponto exato a eficiência fica um pouco abaixo de 100%, em troca de não depender de saber a posição exata. Drones a ≈ ${nf(A.qs.reduce((a, q) => a + Math.hypot(q[0] - A.target[0], q[1] - A.target[1]), 0) / A.N, 0)} m.` + ms
      : eff > 0.999 ? 'Atingiu o ótimo analítico: drones a distância r = h da pessoa, em direções balanceadas.' + ms
      : anyActive ? 'Há restrições ativas: o ótimo restrito fica abaixo do ótimo sem restrições, como previsto por KKT.'
      : A.running ? 'Otimizando. O ótimo teórico tem N drones a r = h, em direções balanceadas.'
      : (A.status === 'conv' && ob.pen.P > 1e-6) ? 'Ótimo local: dois drones ficaram na mesma direção e a separação mínima os mantém assim. Arraste um deles para o outro lado da pessoa e otimize de novo.'
      : A.status === 'conv' ? 'Convergiu para um ótimo local. O problema não é convexo, então o ponto de partida importa.' : 'O ótimo teórico tem N drones a r = h, em direções balanceadas.';
  } else {
    $('tEff').textContent = '–'; $('mEff').style.width = '0';
    $('tEffNote').textContent = 'Com um drone só, F tem posto 1: mede-se a distância e não a direção. A elipse vira uma faixa estreita e longa.';
  }
  const st = $('stA');
  const map = { ms: ['act', 'multistart'], idle: ['idle', 'parado'], run: ['run', 'otimizando'], conv: ['ok', 'convergiu'], cap: ['act', 'limite de iterações'] };
  const k = A.status === 'ms' ? 'ms' : A.running ? 'run' : A.status; st.className = 'pill ' + map[k][0]; st.textContent = map[k][1];
  $('bRun').textContent = A.running ? 'Pausar' : 'Otimizar';
  $('bRun').disabled = A.auto; $('bStep').disabled = A.auto;
}
function bindA() {
  const bindRange = (id, out, key, fmt, after) => { const el = $(id); const upd = () => { A[key] = Number(el.value); $(out).textContent = fmt(A[key]); }; el.addEventListener('input', () => { upd(); after ? after() : paramsChangedA(); }); upd(); };
  bindRange('iN', 'oN', 'N', v => v, () => {
    while (A.qs.length < A.N) { const o = OFFS[A.qs.length]; A.qs.push([BASE[0] + o[0], BASE[1] + o[1]]); A.trails.push([A.qs[A.qs.length - 1].slice()]); }
    A.qs.length = A.N; A.trails.length = A.N; A.hist = []; pushHistA(); paramsChangedA(); setPreset(null);
  });
  bindRange('iH', 'oH', 'h', v => v + ' m');
  bindRange('iS', 'oS', 'sigma', v => nf(v, v % 1 ? 1 : 0) + ' dB');
  bindRange('iM', 'oM', 'm', v => v);
  bindRange('iD', 'oD', 'dmin', v => v + ' m');
  bindRange('iRob', 'oRob', 'rob', v => v ? v + ' m' : 'desligada');
  bindRange('iR', 'oR', 'R', v => v + ' m');
  bindRange('iT', 'oT', 'tExp', v => sci(10 ** v, 0));
  $('iBat').addEventListener('change', e => { A.bat = e.target.checked; $('batCtrl').hidden = !A.bat; paramsChangedA(); });
  $('batCtrl').hidden = !A.bat;
  $('iScale').addEventListener('change', e => { A.scaling = e.target.value; paramsChangedA(); });
  $('iMeth').addEventListener('change', e => { A.method = e.target.value; $('stepCtrl').hidden = A.method !== 'fixed'; paramsChangedA(); });
  $('stepCtrl').hidden = true;
  $('iGain').addEventListener('change', e => { A.gain = e.target.checked; requestA(); });
  $('bRun').addEventListener('click', () => { A.running = !A.running; A.trans = null; if (A.running) { A.msTried = false; A.still = 0; A.status = 'run'; if (A.it >= 1500) A.it = 0; } requestA(); });
  $('bStep').addEventListener('click', () => { A.running = false; A.prevQs = A.qs.map(q => q.slice()); stepA(); A.lastT = performance.now(); requestA(); });
  $('iAuto').addEventListener('change', e => { A.auto = e.target.checked; if (A.auto) autoKick(); else { A.running = false; if (A.status === 'run') A.status = 'idle'; requestA(); } });
  $('bReset').addEventListener('click', resetA);
  document.querySelectorAll('#presets .chip').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
  // arrastar
  const cv = $('mapA'); let drag = null;
  const toW = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * L, (e.clientY - r.top) / r.height * L]; };
  cv.addEventListener('pointerdown', e => {
    const p = toW(e), r = cv.getBoundingClientRect(), tol = 16 / r.width * L;
    let best = null, bd = tol;
    A.qs.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } });
    if (best === null && Math.hypot(A.target[0] - p[0], A.target[1] - p[1]) < tol * 1.2) best = 'T';
    if (best === null) return;
    drag = best; if (best !== 'T') { A.dragDrone = true; A.prevQs = null; } cv.setPointerCapture(e.pointerId); e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    const p = toW(e);
    if (drag === null) { const r = cv.getBoundingClientRect(), tol = 16 / r.width * L; const near = A.qs.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol) || Math.hypot(A.target[0] - p[0], A.target[1] - p[1]) < tol * 1.2; cv.style.cursor = near ? 'grab' : 'default'; return; }
    const c = [Math.min(L, Math.max(0, p[0])), Math.min(L, Math.max(0, p[1]))];
    if (drag === 'T') { A.target = c; } else { A.qs[drag] = C.project(c, optsA().cons, drag); A.trails[drag] = [A.qs[drag].slice()]; A.prevQs = null; }
    A.st = {}; A.still = 0; if (!A.running) A.status = 'idle';
    if (!A.running) pushHistA();
    if (drag === 'T') autoKick();
    requestA();
  });
  const end = () => { const was = drag; drag = null; if (was !== null && was !== 'T') { A.dragDrone = false; autoKick(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}
function setPreset(name) { document.querySelectorAll('#presets .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === name))); }
function applyPreset(name) {
  const set = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('input')); };
  A.running = false;
  const cfg = { livre: [4, false], bateria: [4, true], dois: [2, false], seis: [6, false] }[name];
  $('iN').value = cfg[0]; A.N = cfg[0]; $('oN').textContent = cfg[0];
  $('iBat').checked = cfg[1]; A.bat = cfg[1]; $('batCtrl').hidden = !A.bat;
  if (name === 'bateria') set('iR', 560);
  A.target = [640, 360];
  setPreset(name); resetA();
}

// =========================================================
// ABA 2 — MISSÃO
// =========================================================
const B = { N: 4, sigma: 4, h: 100, m: 5, V: 150, dmin: 40, strat: 'fisher', seed: 0, maxR: 15,
  target: null, qs: [], trails: [], obs: [], est: null, F: null, hist: [], round: 0, reveal: false, like: true, auto: false, anim: null, gn: null, gd: null, p0: null, likeImg: null, phase: null };
const modelB = () => C.makeModel({ sigma: B.sigma, h: B.h });
const formB = () => OFFS.slice(0, B.N);
function newMission(keepSeed) {
  if (!keepSeed) B.seed++;
  const R = C.rng(B.seed * 9973 + 11);
  B.target = [300 + 650 * R.u(), 60 + 640 * R.u()];
  B.rMeas = C.rng(B.seed * 31 + 7); B.rMove = C.rng(B.seed * 17 + 3);
  B.qs = formB().map(o => [BASE[0] + o[0], BASE[1] + o[1]]);
  B.trails = B.qs.map(q => [q.slice()]); B.obs = []; B.est = null; B.F = null; B.hist = []; B.round = 0; B.gn = B.gd = B.p0 = null; B.likeImg = null; B.anim = null; B.phase = null;
  doRound(false);
}
function setPhase(p) { B.phase = p; document.querySelectorAll('#cycle span').forEach(s => s.classList.toggle('on', s.dataset.ph === p)); }
function doRound(animate) {
  if (B.round >= B.maxR || B.anim) return;
  const M = modelB();
  setPhase('medir');
  C.measure(M, B.rMeas, B.target, B.qs, B.m, B.obs);
  setPhase('estimar');
  B.p0 = C.gridSearch(M, B.obs, 60);
  B.gn = C.gaussNewton(M, B.obs, B.p0, 40);
  B.gd = C.gradientDescent(M, B.obs, B.p0, 0.01, 5000, B.gn.p);
  B.gnIt = B.gn.path.findIndex(p => Math.hypot(p[0] - B.gn.p[0], p[1] - B.gn.p[1]) < 0.01);
  B.est = B.gn.p;
  B.F = C.withPrior(M, C.pastFisher(M, B.est, B.obs));
  B.round++;
  B.hist.push({ rms: C.rmsBound(B.F), err: Math.hypot(B.est[0] - B.target[0], B.est[1] - B.target[1]) });
  buildLike(M);
  setPhase('planejar');
  const next = C.planNext(M, B.strat, B.est, B.qs, B.obs, { stepMax: B.V, m: B.m, dmin: B.dmin, iters: 50, robust: true }, B.rMove, formB());
  if (animate) {
    B.anim = { from: B.qs.map(q => q.slice()), to: next, t0: performance.now(), dur: 750 };
    setPhase('voar'); requestB();
  } else { B.qs = next; B.qs.forEach((q, i) => B.trails[i].push(q.slice())); setPhase(null); drawB(); teleB(); }
}
function buildLike(M) {
  const G = 90, sig2 = B.sigma * B.sigma; let mn = Infinity; const v = new Float64Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const s = C.sse(M, [(i + .5) * L / G, (j + .5) * L / G], B.obs); v[j * G + i] = s; if (s < mn) mn = s; }
  B.likeImg = heatImage(G, (i, j) => Math.exp(-(v[j * G + i] - mn) / (2 * sig2)), T.heatLike, 0.35, .62);
}
let pendB = false;
function requestB() { if (!pendB) { pendB = true; requestAnimationFrame(frameB); } }
function frameB(now) {
  pendB = false;
  if (B.anim) {
    const a = B.anim, t = Math.min(1, (performance.now() - a.t0) / a.dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    B.qs = a.from.map((f, i) => [f[0] + (a.to[i][0] - f[0]) * e, f[1] + (a.to[i][1] - f[1]) * e]);
    if (t >= 1) { B.qs = a.to.map(q => q.slice()); B.qs.forEach((q, i) => B.trails[i].push(q.slice())); B.anim = null; setPhase(null); if (B.auto) setTimeout(() => { if (B.auto) { if (B.round < B.maxR) doRound(true); else stopAuto(); } }, 350); }
  }
  drawB(); teleB();
  if (B.anim) requestB();
}
function stopAuto() { B.auto = false; $('bAuto').textContent = 'Automático'; }
function drawB() {
  const cv = $('mapB'); if (!cv.offsetParent) return;
  const { ctx, w } = fit(cv), s = w / L;
  drawBase(ctx, s, w);
  if (B.like && B.likeImg) { ctx.imageSmoothingEnabled = true; ctx.drawImage(B.likeImg, 0, 0, w, w); }
  // pontos de medição
  ctx.fillStyle = T.signal; ctx.globalAlpha = .55;
  for (const o of B.obs) { ctx.beginPath(); ctx.arc(o.q[0] * s, o.q[1] * s, 2.2, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  B.trails.forEach((tr, i) => { const pts = tr.concat(B.anim ? [B.qs[i]] : []); if (pts.length < 2) return; ctx.strokeStyle = T.signal; ctx.globalAlpha = .55; ctx.lineWidth = 1.6; ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s)); ctx.stroke(); ctx.globalAlpha = 1; });
  if (B.est) {
    const ex = B.est[0] * s, ey = B.est[1] * s, E = C.ellipse95(B.F);
    drawEllipse(ctx, ex, ey, E, s, T.accentSoft, T.accent, 2);
    ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - 9, ey); ctx.lineTo(ex - 3, ey); ctx.moveTo(ex + 3, ey); ctx.lineTo(ex + 9, ey); ctx.moveTo(ex, ey - 9); ctx.lineTo(ex, ey - 3); ctx.moveTo(ex, ey + 3); ctx.lineTo(ex, ey + 9); ctx.stroke();
    ctx.font = '600 11px ' + T.body; ctx.fillStyle = T.ink; ctx.textAlign = 'left'; ctx.fillText('estimativa', ex + 12, ey + 14);
  }
  if (B.reveal && B.target) {
    if (B.est) { ctx.setLineDash([3, 3]); ctx.strokeStyle = T.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(B.est[0] * s, B.est[1] * s); ctx.lineTo(B.target[0] * s, B.target[1] * s); ctx.stroke(); ctx.setLineDash([]); }
    drawPerson(ctx, B.target[0] * s, B.target[1] * s, 'pessoa', true);
  }
  if (B.anim) { ctx.strokeStyle = T.signal; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); B.anim.to.forEach(q => { ctx.beginPath(); ctx.arc(q[0] * s, q[1] * s, 7, 0, 7); ctx.stroke(); }); ctx.setLineDash([]); }
  B.qs.forEach((q, i) => drawDrone(ctx, q[0] * s, q[1] * s, i, T.signal));
  drawInsetB();
  const x = B.hist.map((_, i) => i + 1);
  const series = [{ name: 'Incerteza (Cramér-Rao, RMS)', short: 'Cramér-Rao', color: T.sG, values: B.hist.map(h => h.rms) }];
  if (B.reveal) series.push({ name: 'Erro real', short: 'Erro real', color: T.sF, values: B.hist.map(h => h.err) });
  lineChart($('chartB'), { x, xName: 'Rodada', xLabel: 'rodada', yLog: true, series, fmtY: v => nf(v, v < 10 ? (v % 1 ? 1 : 0) : 0), fmtTip: v => meters(v), hover: $('chartB')._cfg ? $('chartB')._cfg.hover : null });
}
function drawInsetB() {
  const cv = $('insetB'); const { ctx, w } = fit(cv);
  ctx.fillStyle = T.map; ctx.fillRect(0, 0, w, w);
  if (!B.est) return;
  const M = modelB(), E = C.ellipse95(B.F);
  let ext = Math.max(E.rx, E.ry) * 1.6;
  for (const p of B.gn.path.concat(B.gd.path)) ext = Math.max(ext, Math.hypot(p[0] - B.est[0], p[1] - B.est[1]) * 1.25);
  const half = Math.min(Math.max(ext, 15), 600), s = w / 2 / half, c = w / 2;
  const cx = B.est[0], cy = B.est[1];
  const G = 64, sig2 = B.sigma * B.sigma; const vals = []; let mn = Infinity;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const v = C.sse(M, [cx - half + (i + .5) * 2 * half / G, cy - half + (j + .5) * 2 * half / G], B.obs); vals.push(v); if (v < mn) mn = v; }
  const im = heatImage(G, (i, j) => Math.exp(-(vals[j * G + i] - mn) / (2 * sig2)), T.heatLike, 0.5, .7);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(im, 0, 0, w, w);
  const P = p => [c + (p[0] - cx) * s, c + (p[1] - cy) * s];
  drawEllipse(ctx, c, c, E, s, null, T.accent, 1.5);
  // gradiente
  ctx.strokeStyle = T.sG; ctx.lineWidth = 1.8; ctx.setLineDash([4, 3]); ctx.beginPath();
  B.gd.path.forEach((p, k) => { const q = P(p); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]);
  // Gauss-Newton
  ctx.strokeStyle = T.ink; ctx.lineWidth = 2; ctx.beginPath();
  B.gn.path.forEach((p, k) => { const q = P(p); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke();
  B.gn.path.forEach((p, k) => { const q = P(p); ctx.fillStyle = k ? T.ink : T.surface; ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q[0], q[1], k ? 3.2 : 4.5, 0, 7); ctx.fill(); ctx.stroke(); });
  const q0 = P(B.p0); ctx.fillStyle = T.ink; ctx.font = '600 10.5px ' + T.body; ctx.textAlign = 'left'; ctx.fillText('início (grade)', q0[0] + 7, q0[1] - 7);
  if (B.reveal) { const t = P(B.target); if (t[0] > -10 && t[0] < w + 10 && t[1] > -10 && t[1] < w + 10) drawPerson(ctx, t[0], t[1], ''); }
  ctx.fillStyle = T.surface; ctx.globalAlpha = .85; ctx.fillRect(6, 6, 170, 40); ctx.globalAlpha = 1;
  ctx.font = '500 11px ' + T.mono; ctx.textAlign = 'left';
  ctx.fillStyle = T.ink; ctx.fillRect(12, 17, 14, 2); ctx.fillText('Gauss-Newton: ' + B.gnIt, 32, 21);
  ctx.strokeStyle = T.sG; ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, 35); ctx.lineTo(26, 35); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillText('Gradiente: ' + (B.gd.iters >= 5000 ? '≥ 5000' : B.gd.iters), 32, 39);
  const st = niceStep(half, 3);
  ctx.strokeStyle = T.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, w - 14); ctx.lineTo(12 + st * s, w - 14); ctx.stroke();
  ctx.fillStyle = T.ink; ctx.fillText(meters(st).replace(',0', ''), 12, w - 20);
  $('estNote').textContent = `Partindo do melhor ponto da grade, Gauss-Newton (Fisher scoring) chegou a menos de 1 cm do ótimo em ${B.gnIt} iterações; a descida pelo gradiente com Armijo precisou de ${B.gd.iters >= 5000 ? 'mais de 5000' : B.gd.iters}.`;
}
function teleB() {
  $('uR').textContent = B.round + ' / ' + B.maxR;
  $('uM').textContent = B.obs.reduce((a, o) => a + o.n, 0);
  const h = B.hist[B.hist.length - 1];
  $('uRms').textContent = h ? '± ' + meters(h.rms) : '–';
  $('uErr').textContent = B.reveal ? (h ? meters(h.err) : '–') : 'oculto';
  $('hintB').textContent = B.reveal ? 'Pessoa revelada' : 'Posição da pessoa desconhecida';
  $('bNext').disabled = B.round >= B.maxR || !!B.anim;
}
function bindB() {
  const rng = (id, out, key, fmt) => { const el = $(id); const upd = () => { B[key] = Number(el.value); $(out).textContent = fmt(B[key]); }; el.addEventListener('input', () => { upd(); stopAuto(); newMission(true); }); upd(); };
  rng('iN2', 'oN2', 'N', v => v);
  rng('iS2', 'oS2', 'sigma', v => nf(v, v % 1 ? 1 : 0) + ' dB');
  $('iStrat').addEventListener('change', e => { B.strat = e.target.value; stopAuto(); newMission(true); });
  $('bNext').addEventListener('click', () => doRound(true));
  $('bNew').addEventListener('click', () => { stopAuto(); newMission(false); });
  $('bAuto').addEventListener('click', () => {
    if (B.auto) { stopAuto(); return; }
    if (B.round >= B.maxR) newMission(true);
    B.auto = true; $('bAuto').textContent = 'Pausar'; if (!B.anim) doRound(true);
  });
  $('iReveal').addEventListener('change', e => { B.reveal = e.target.checked; drawB(); teleB(); });
  $('iLike').addEventListener('change', e => { B.like = e.target.checked; drawB(); });
}

// =========================================================
// ABA 3 — COMPARAÇÃO (Monte Carlo)
// =========================================================
const STRATS = [{ id: 'fisher', name: 'Maximizar Fisher', key: 'sF', dash: [] }, { id: 'goto', name: 'Voar até a estimativa', key: 'sG', dash: [6, 4] }, { id: 'random', name: 'Voo aleatório', key: 'sR', dash: [2, 3] }];
const NOPTS = [{ n: 2, key: 'n2', dash: [] }, { n: 3, key: 'n3', dash: [6, 4] }, { n: 4, key: 'n4', dash: [2, 3] }, { n: 6, key: 'n6', dash: [10, 3, 2, 3] }, { n: 8, key: 'n8', dash: [] }];
const SIM = { rounds: 12, res: null, running: false, done: false, mode: 'strat', N: 4, Ns: [2, 4, 6, 8] };
function simMission(strategy, i, rounds, N) {
  const M = C.makeModel({ sigma: 4, h: 100 });
  const R = C.rng(i * 9973 + 11); const tgt = [300 + 650 * R.u(), 60 + 640 * R.u()];
  const rM = C.rng(i * 31 + 7), rV = C.rng(i * 17 + 3);
  const form = OFFS.slice(0, N);
  let q = form.map(f => [BASE[0] + f[0], BASE[1] + f[1]]); const obs = [], errs = [];
  for (let k = 0; k < rounds; k++) {
    C.measure(M, rM, tgt, q, 5, obs);
    let ph = C.gridSearch(M, obs, 40); ph = C.gaussNewton(M, obs, ph).p;
    errs.push(Math.hypot(ph[0] - tgt[0], ph[1] - tgt[1]));
    q = C.planNext(M, strategy, ph, q, obs, { stepMax: 150, m: 5, dmin: 40, iters: 40, robust: true }, rV, form);
  }
  return errs;
}
function simGroups() {
  if (SIM.mode === 'strat') return STRATS.map(s => ({ id: s.id, name: s.name, short: s.name.split(' ').slice(0, 2).join(' '), key: s.key, dash: s.dash, strategy: s.id, N: SIM.N }));
  return NOPTS.filter(o => SIM.Ns.includes(o.n)).map(o => ({ id: 'n' + o.n, name: o.n + ' drones', short: o.n + ' drones', key: o.key, dash: o.dash, strategy: 'fisher', N: o.n }));
}
function runSim() {
  if (SIM.running) return;
  const S = Number($('iSim').value), groups = simGroups();
  if (!groups.length) { $('stC').className = 'pill act'; $('stC').textContent = 'escolha ao menos uma quantidade'; return; }
  SIM.running = true; $('bSim').disabled = true; $('stC').className = 'pill run'; $('stC').textContent = 'simulando';
  const all = {}; groups.forEach(g => { all[g.id] = []; }); let i = 0;
  const tick = () => {
    const t0 = performance.now();
    while (i < S && performance.now() - t0 < 40) { i++; for (const g of groups) all[g.id].push(simMission(g.strategy, 1000 + i, SIM.rounds, g.N)); }
    $('pC').style.width = (i / S * 100) + '%';
    if (i < S) { setTimeout(tick, 0); return; }
    SIM.res = { all, S, groups, mode: SIM.mode }; SIM.running = false; SIM.done = true; $('bSim').disabled = false; $('stC').className = 'pill ok'; $('stC').textContent = S + ' missões × ' + groups.length;
    drawC();
  };
  setTimeout(tick, 30);
}
const median = a => { const v = a.slice().sort((x, y) => x - y), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
function drawC() {
  const cv = $('chartC'); if (!cv.offsetParent) return;
  const x = Array.from({ length: SIM.rounds }, (_, i) => i + 1);
  if (!SIM.res) { lineChart(cv, { x, series: [], xLabel: 'rodada' }); return; }
  const G = SIM.res.groups, qty = SIM.res.mode === 'qty';
  const med = {}; G.forEach(g => { med[g.id] = x.map((_, k) => median(SIM.res.all[g.id].map(e => e[k]))); });
  $('titleC').textContent = qty ? 'Erro mediano por rodada para cada quantidade de drones (metros, escala log)' : `Erro mediano por rodada, ${SIM.res.groups[0].N} drones (metros, escala log)`;
  lineChart(cv, { x, xName: 'Rodada', xLabel: 'rodada', yLog: true, ref: { v: 25, label: '25 m' }, series: G.map(g => ({ name: g.name, short: g.short, color: T[g.key], dash: g.dash, values: med[g.id] })), fmtY: v => nf(v, 0), fmtTip: v => meters(v), hover: cv._cfg ? cv._cfg.hover : null });
  $('legC').innerHTML = G.map(g => `<span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="${T[g.key]}" stroke-width="2.5" stroke-dasharray="${g.dash.join(' ')}"/></svg>${g.name}</span>`).join('');
  $('resHead').innerHTML = `<tr><th>${qty ? 'Drones' : 'Estratégia'}</th><th>Rodada 3</th><th>Rodada 6</th><th>Rodada 12</th><th>Mediana &lt; 25 m na rodada</th><th>Missões &lt; 25 m na rodada 6</th>${qty ? '<th>Medições por rodada</th>' : ''}</tr>`;
  const rows = G.map(g => {
    const m = med[g.id]; const first = m.findIndex(v => v < 25);
    const frac = SIM.res.all[g.id].filter(e => e[5] < 25).length / SIM.res.S;
    return `<tr><td><span class="sw" style="background:${T[g.key]};width:10px;height:10px;margin-right:6px"></span>${g.name}</td><td class="num">${meters(m[2])}</td><td class="num">${meters(m[5])}</td><td class="num">${meters(m[11])}</td><td class="num">${first < 0 ? 'não atingiu' : first + 1}</td><td class="num">${nf(frac * 100, 0)}%</td>${qty ? `<td class="num">${g.N * 5}</td>` : ''}</tr>`;
  });
  $('resTable').querySelector('tbody').innerHTML = rows.join('');
  $('howC').innerHTML = qty
    ? '<p class="note">Mais drones reduzem o erro, mas com retorno decrescente. Pelo limite de Cramér-Rao, a incerteza cai com 1/√N: dobrar o número de drones reduz o erro em cerca de 30%, não pela metade. Na rodada 12, compare 2 com 8 drones: a teoria prevê erro com metade do tamanho.</p><p class="note">Nas primeiras rodadas a ordem pode se inverter, porque todos os drones saem juntos da base e a estimativa ainda é ruim. Com poucas missões a simulação tem ruído; aumente o número para resultados mais estáveis.</p>'
    : '<p class="note">No início todas as estratégias erram muito, porque os drones saem juntos da base e cada medição só informa a distância. Na mediana, a estratégia de Fisher chega antes a uma boa precisão, porque espalha os drones em direções diferentes. No fim, as estratégias razoáveis tendem a convergir.</p><p class="note">Nem toda métrica mostra vantagem: a fração de missões abaixo de 25 m pode ficar próxima entre Fisher e voar até a estimativa. Com poucas missões a simulação tem ruído; aumente o número para resultados mais estáveis.</p>';
}
function syncC() {
  $('cStrat').hidden = SIM.mode !== 'strat'; $('cQty').hidden = SIM.mode !== 'qty';
  document.querySelectorAll('#qtyChips .chip').forEach(b => b.setAttribute('aria-pressed', String(SIM.Ns.includes(Number(b.dataset.n)))));
  $('noteSim').textContent = SIM.mode === 'strat' ? 'Todas as estratégias enfrentam as mesmas pessoas perdidas e o mesmo ruído de medição em cada missão, para a comparação ser justa.' : 'Todas as quantidades usam a estratégia de Fisher e enfrentam as mesmas pessoas perdidas. Cada drone faz 5 medições por rodada, então mais drones também significa mais medições.';
}
function bindC() {
  $('iSim').addEventListener('input', e => { $('oSim').textContent = e.target.value; });
  $('iNC').addEventListener('input', e => { SIM.N = Number(e.target.value); $('oNC').textContent = SIM.N; });
  $('iModeC').addEventListener('change', e => { SIM.mode = e.target.value; syncC(); });
  document.querySelectorAll('#qtyChips .chip').forEach(b => b.addEventListener('click', () => { const n = Number(b.dataset.n); SIM.Ns = SIM.Ns.includes(n) ? SIM.Ns.filter(v => v !== n) : SIM.Ns.concat(n).sort((p, q) => p - q); syncC(); }));
  $('bSim').addEventListener('click', runSim);
  syncC();
}

// =========================================================
// abas, tema, redimensionamento
// =========================================================
function showTab(id) {
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  ['posicionamento', 'missao', 'comparacao', 'teoria'].forEach(s => { $(s).hidden = s !== id; });
  try { history.replaceState(null, '', '#' + id); } catch (e) { }
  if (id === 'posicionamento') requestA();
  if (id === 'missao') { drawB(); teleB(); }
  if (id === 'comparacao') { drawC(); if (!SIM.done && !SIM.running) runSim(); }

}
function redrawAll() { requestA(); drawB(); teleB(); drawC(); }
function bindAppearance() {
  const root = document.documentElement;
  const sync = () => {
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === root.dataset.theme)));
    document.querySelectorAll('[data-palette-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.paletteChoice === root.dataset.palette)));
  };
  document.querySelectorAll('[data-theme-choice]').forEach(b => b.addEventListener('click', () => {
    root.dataset.theme = b.dataset.themeChoice;
    try { localStorage.setItem('drone-rescue-theme', b.dataset.themeChoice); } catch (_) { }
    sync();
  }));
  document.querySelectorAll('[data-palette-choice]').forEach(b => b.addEventListener('click', () => {
    root.dataset.palette = b.dataset.paletteChoice;
    try { localStorage.setItem('drone-rescue-palette', b.dataset.paletteChoice); } catch (_) { }
    sync();
  }));
  sync();
}
function init() {
  readTheme();
  renderMathInElement($('teoria'), { delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
  bindAppearance(); bindA(); bindB(); bindC();
  [$('chartA'), $('chartB'), $('chartC')].forEach(attachHover);
  resetA(); newMission(false); doRound(false); doRound(false);
  document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  const h = (location.hash || '').slice(1);
  showTab(['posicionamento', 'missao', 'comparacao', 'teoria'].includes(h) ? h : 'posicionamento');
  // começa já otimizando para a primeira tela mostrar o método em ação
  autoKick();
  let rt = null; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(redrawAll, 60); }).observe(document.querySelector('.wrap'));
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onTheme = () => {
    readTheme();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = T.bg;
    if (B.obs.length) buildLike(modelB());
    redrawAll();
  };
  mq.addEventListener && mq.addEventListener('change', onTheme);
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  onTheme();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawAll);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
