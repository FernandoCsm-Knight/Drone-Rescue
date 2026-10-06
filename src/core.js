// ===== Núcleo matemático: modelo RSSI, Fisher, otimização =====
// Coordenadas em metros. Área de busca: [0, L] x [0, L].
const LN10 = Math.log(10);
const CHI2_95 = 5.991; // quantil 95% da qui-quadrado com 2 g.l.

function makeModel(o) {
  // o: {eta, sigma, h, P0, sigma0, L}
  const m = Object.assign({ eta: 2.5, sigma: 4, h: 100, P0: -40, sigma0: 1000, L: 1000 }, o || {});
  m.c = 10 * m.eta / LN10;               // dμ/d(ln D)
  m.k = (m.c / m.sigma) ** 2;            // escala da informação (1/m^2 por medição, já com 1/σ^2)
  m.prior = 1 / (m.sigma0 * m.sigma0);   // informação a priori (regularização)
  return m;
}

// Potência média recebida (dBm) de um alvo em p, medida por um drone em q (horizontal) a altitude h
function meanRSSI(M, p, q) {
  const dx = p[0] - q[0], dy = p[1] - q[1];
  const D = dx * dx + dy * dy + M.h * M.h;
  return M.P0 - 10 * M.eta * Math.log10(Math.sqrt(D));
}

// Matriz de Fisher 2x2 [a, b, c] = [[a,b],[b,c]] para posição p, dados drones em qs com nº de medições ns
function fisher(M, p, qs, ns, base) {
  let a = 0, b = 0, c = 0;
  if (base) { a = base[0]; b = base[1]; c = base[2]; }
  for (let i = 0; i < qs.length; i++) {
    const vx = p[0] - qs[i][0], vy = p[1] - qs[i][1];
    const D = vx * vx + vy * vy + M.h * M.h;
    const w = M.k * (ns ? ns[i] : 1) / (D * D);
    a += w * vx * vx; b += w * vx * vy; c += w * vy * vy;
  }
  return [a, b, c];
}
function withPrior(M, F) { return [F[0] + M.prior, F[1], F[2] + M.prior]; }
function det2(F) { return F[0] * F[2] - F[1] * F[1]; }
function inv2(F) { const d = det2(F); return [F[2] / d, -F[1] / d, F[0] / d]; }
function logdet(F) { const d = det2(F); return d > 0 ? Math.log(d) : -Infinity; }

// Autovalores/vetores de matriz simétrica 2x2 -> elipse
function eig2(S) {
  const [a, b, c] = S;
  const tr = a + c, dt = a * c - b * b;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - dt));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  const ang = Math.abs(b) < 1e-300 ? (a >= c ? 0 : Math.PI / 2) : Math.atan2(l1 - a, b);
  return { l1, l2, ang };
}
// Elipse de confiança 95% da covariância C = F^{-1}
function ellipse95(F) {
  const C = inv2(F);
  const e = eig2(C);
  return { rx: Math.sqrt(CHI2_95 * Math.max(e.l1, 0)), ry: Math.sqrt(CHI2_95 * Math.max(e.l2, 0)), ang: e.ang, C };
}
function rmsBound(F) { const C = inv2(F); return Math.sqrt(C[0] + C[2]); }

// Gradiente de log det F em relação à posição de cada drone (F = base + Σ n_i F_i(q_i))
function gradLogdet(M, p, qs, ns, Ftot) {
  const A = inv2(Ftot);
  const g = [];
  for (let i = 0; i < qs.length; i++) {
    const vx = p[0] - qs[i][0], vy = p[1] - qs[i][1];
    const D = vx * vx + vy * vy + M.h * M.h;
    const Avx = A[0] * vx + A[1] * vy, Avy = A[1] * vx + A[2] * vy;
    const vAv = vx * Avx + vy * Avy;
    const s = M.k * (ns ? ns[i] : 1);
    // ∇_v φ = 2Av/D² − 4(vᵀAv)v/D³ ; ∇_q = −s ∇_v φ
    const gx = 2 * Avx / (D * D) - 4 * vAv * vx / (D * D * D);
    const gy = 2 * Avy / (D * D) - 4 * vAv * vy / (D * D * D);
    g.push([-s * gx, -s * gy]);
  }
  return g;
}

// Objetivo J(q) = log det F(q), e seu gradiente.
// A separação mínima é tratada como restrição dura pela projeção da formação.
// opt.cloud (opcional): critério robusto/bayesiano — média de log det F sobre posições plausíveis p + d_k
function cloudPts(p, opt) { return opt.cloud.map(c => ({ p: [p[0] + c.d[0], p[1] + c.d[1]], w: c.w, base: c.base })); }
function objective(M, p, qs, ns, base, opt) {
  const F = withPrior(M, fisher(M, p, qs, ns, base));
  const ld = logdet(F);
  let crit = ld;
  if (opt.cloud) { crit = 0; for (const c of cloudPts(p, opt)) crit += c.w * logdet(withPrior(M, fisher(M, c.p, qs, ns, c.base || base))); }
  return { J: crit, ld, crit, F };
}
function objectiveGrad(M, p, qs, ns, base, opt) {
  const o = objective(M, p, qs, ns, base, opt);
  let gl;
  if (opt.cloud) {
    gl = qs.map(() => [0, 0]);
    for (const c of cloudPts(p, opt)) {
      const Fk = withPrior(M, fisher(M, c.p, qs, ns, c.base || base));
      gradLogdet(M, c.p, qs, ns, Fk).forEach((v, i) => { gl[i][0] += c.w * v[0]; gl[i][1] += c.w * v[1]; });
    }
  } else gl = gradLogdet(M, p, qs, ns, o.F);
  o.g = gl;
  return o;
}
// Nuvem de posições: centro + anel de 8 pontos a distância rho
function ringCloud(rho) {
  if (!rho) return null;
  const c = [{ d: [0, 0], w: 1 / 3 }];
  for (let k = 0; k < 8; k++) c.push({ d: [rho * Math.cos(k * Math.PI / 4), rho * Math.sin(k * Math.PI / 4)], w: (2 / 3) / 8 });
  return c;
}

// Projeção no conjunto viável: caixa [0,L]^2 e, opcionalmente, discos (alcance da bateria / passo por rodada)
function project(q, cons, i) {
  let x = Math.min(cons.L, Math.max(0, q[0])), y = Math.min(cons.L, Math.max(0, q[1]));
  const disks = [];
  if (cons.battery) disks.push(cons.battery);               // {c:[x,y], r}
  if (cons.stepFrom) disks.push({ c: cons.stepFrom[i], r: cons.stepMax });
  for (const d of disks) {
    const dx = x - d.c[0], dy = y - d.c[1], r = Math.hypot(dx, dy);
    if (r > d.r) { x = d.c[0] + dx * d.r / r; y = d.c[1] + dy * d.r / r; }
  }
  return [x, y];
}

// Projeção iterativa da formação no conjunto com separação mínima.
// Para cada par violado, usa a projeção euclidiana do par no exterior da faixa
// ||q_i-q_j|| < dmin e reprojeta cada ponto nas restrições espaciais.
// A direção determinística resolve inclusive o caso q_i = q_j.
function separationStatus(qs, dmin, tol) {
  let minDistance = Infinity, maxViolation = 0;
  if (!dmin || qs.length < 2) return { feasible: true, minDistance, maxViolation };
  for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
    const d = Math.hypot(qs[i][0] - qs[j][0], qs[i][1] - qs[j][1]);
    minDistance = Math.min(minDistance, d);
    maxViolation = Math.max(maxViolation, dmin - d);
  }
  return { feasible: maxViolation <= (tol == null ? 1e-6 : tol), minDistance, maxViolation: Math.max(0, maxViolation) };
}
function projectFormation(qs, cons, dmin, maxPasses) {
  const out = qs.map((q, i) => project(q, cons, i));
  if (!dmin || out.length < 2) return { qs: out, ...separationStatus(out, dmin) };
  const passes = maxPasses || 120;
  for (let pass = 0; pass < passes; pass++) {
    let worst = 0;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      let dx = out[i][0] - out[j][0], dy = out[i][1] - out[j][1];
      let d = Math.hypot(dx, dy);
      const gap = dmin - d;
      if (gap <= 1e-7) continue;
      worst = Math.max(worst, gap);
      if (d < 1e-10) {
        const angle = ((i + 1) * 2.399963229728653 + (j + 1) * 1.618033988749895) % (2 * Math.PI);
        dx = Math.cos(angle); dy = Math.sin(angle); d = 1;
      }
      const ux = dx / d, uy = dy / d, push = (gap + 1e-7) / 2;
      out[i] = project([out[i][0] + ux * push, out[i][1] + uy * push], cons, i);
      out[j] = project([out[j][0] - ux * push, out[j][1] - uy * push], cons, j);
    }
    if (worst <= 1e-7) break;
  }
  return { qs: out, ...separationStatus(out, dmin) };
}

// Um passo de gradiente projetado (subida) com busca de Armijo, ou passo fixo
function pgStep(M, p, qs, ns, base, opt, state) {
  const cur = objectiveGrad(M, p, qs, ns, base, opt);
  const cons = opt.cons;
  if (opt.method === 'fixed') {
    const t = opt.fixedStep;
    const cand = qs.map((q, i) => project([q[0] + t * cur.g[i][0], q[1] + t * cur.g[i][1]], cons, i));
    const repaired = projectFormation(cand, cons, opt.dmin);
    const nq = repaired.feasible ? repaired.qs : qs.map(q => q.slice());
    return { qs: nq, cur, t, tries: 1 };
  }
  let t = state.t || 1e4, tries = 0;
  const c1 = 1e-4;
  // Escala do passo (velocidade máxima de 30 m por iteração):
  //  'global'  → gradiente puro: um único t para todos, limitado pelo drone de maior gradiente
  //  'perDrone'→ gradiente pré-condicionado por blocos: o gradiente de cada drone é ampliado por
  //              w_i = min(K, ‖g‖_max/‖g_i‖), então drones distantes (gradiente pequeno) não ficam para trás.
  //              W é diagonal positiva e limitada, logo a direção continua sendo de subida.
  let dir = cur.g;
  if (opt.scaling === 'perDrone') {
    let gm = 0; for (const v of cur.g) gm = Math.max(gm, Math.hypot(v[0], v[1]));
    const K = opt.scaleK || 20;
    dir = cur.g.map(v => { const n = Math.hypot(v[0], v[1]); const w = n > 0 ? Math.min(K, gm / n) : 1; return [w * v[0], w * v[1]]; });
  }
  if (opt.maxMove) {
    let dm = 0; for (const v of dir) dm = Math.max(dm, Math.hypot(v[0], v[1]));
    if (dm > 0) t = Math.min(t, opt.maxMove / dm);
  }
  const stepOf = (i, t) => [t * dir[i][0], t * dir[i][1]];
  while (tries < 60) {
    tries++;
    const cand = qs.map((q, i) => { const d = stepOf(i, t); return project([q[0] + d[0], q[1] + d[1]], cons, i); });
    const repaired = projectFormation(cand, cons, opt.dmin);
    if (!repaired.feasible) { t /= 2; continue; }
    const nq = repaired.qs;
    let dec = 0;
    for (let i = 0; i < qs.length; i++) dec += cur.g[i][0] * (nq[i][0] - qs[i][0]) + cur.g[i][1] * (nq[i][1] - qs[i][1]);
    const nj = objective(M, p, nq, ns, base, opt).J;
    if (nj >= cur.J + c1 * dec) { state.t = Math.min(t * 2, 1e9); return { qs: nq, cur, t, tries }; }
    t /= 2;
  }
  state.t = t;
  return { qs: qs.map(q => q.slice()), cur, t, tries };
}

// Otimização completa (para missão e Monte Carlo)
function optimizePlacement(M, p, qs0, ns, base, opt, iters) {
  let qs = projectFormation(qs0, opt.cons, opt.dmin).qs;
  const st = {};
  for (let k = 0; k < (iters || 60); k++) {
    const r = pgStep(M, p, qs, ns, base, opt, st);
    let mv = 0; for (let i = 0; i < qs.length; i++) mv = Math.max(mv, Math.hypot(r.qs[i][0] - qs[i][0], r.qs[i][1] - qs[i][1]));
    qs = r.qs;
    if (mv < 1e-3) break;
  }
  return qs;
}

// Ótimo teórico sem restrições: N drones a distância horizontal r = h, direções balanceadas
function theoreticalOptimum(M, N, nPer) {
  if (N < 2) return null;
  const lam = nPer * M.k * N / (8 * M.h * M.h) + M.prior;
  return { ld: 2 * Math.log(lam), lam };
}

// ===== Estimação por máxima verossimilhança =====
// Medições agregadas por posição: {q, n, S1 = Σy, S2 = Σy²}
function sse(M, p, obs) {
  let s = 0;
  for (const o of obs) { const mu = meanRSSI(M, p, o.q); s += o.S2 - 2 * mu * o.S1 + o.n * mu * mu; }
  return s;
}
function gridSearch(M, obs, G) {
  let best = Infinity, bp = [M.L / 2, M.L / 2];
  const step = M.L / G;
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const p = [(i + 0.5) * step, (j + 0.5) * step];
    const v = sse(M, p, obs);
    if (v < best) { best = v; bp = p; }
  }
  return bp;
}
// Gauss-Newton (= Fisher scoring para ruído gaussiano) com busca de passo
function gaussNewton(M, obs, p0, maxIt) {
  let p = p0.slice(); const path = [p.slice()];
  let f = sse(M, p, obs);
  for (let it = 0; it < (maxIt || 30); it++) {
    let a = 0, b = 0, c = 0, gx = 0, gy = 0;
    for (const o of obs) {
      const vx = p[0] - o.q[0], vy = p[1] - o.q[1];
      const D = vx * vx + vy * vy + M.h * M.h;
      const jx = -M.c * vx / D, jy = -M.c * vy / D;     // ∂μ/∂p
      const mu = meanRSSI(M, p, o.q);
      const rs = o.S1 - o.n * mu;                        // Σ resíduos
      a += o.n * jx * jx; b += o.n * jx * jy; c += o.n * jy * jy;
      gx += jx * rs; gy += jy * rs;
    }
    const d = a * c - b * b;
    if (!(d > 0)) break;
    let dx = (c * gx - b * gy) / d, dy = (a * gy - b * gx) / d;
    let t = 1, ok = false;
    for (let ls = 0; ls < 30; ls++) {
      const np = [Math.min(M.L, Math.max(0, p[0] + t * dx)), Math.min(M.L, Math.max(0, p[1] + t * dy))];
      const nf = sse(M, np, obs);
      if (nf < f) { p = np; f = nf; ok = true; break; }
      t /= 2;
    }
    path.push(p.slice());
    if (!ok || Math.hypot(t * dx, t * dy) < 1e-3) break;
  }
  return { p, path, iters: path.length - 1 };
}
// Gradiente (descida mais íngreme) com Armijo, para comparar com Gauss-Newton
// Para parar quando chega a menos de tol metros do ótimo pstar (critério igual para os dois métodos)
function gradientDescent(M, obs, p0, tol, maxIt, pstar) {
  let p = p0.slice(); const path = [p.slice()];
  let f = sse(M, p, obs), t = 1, it = 0;
  if (pstar && Math.hypot(p[0] - pstar[0], p[1] - pstar[1]) < tol) return { p, path, iters: 0 };
  for (; it < (maxIt || 3000); it++) {
    let gx = 0, gy = 0;
    for (const o of obs) {
      const vx = p[0] - o.q[0], vy = p[1] - o.q[1];
      const D = vx * vx + vy * vy + M.h * M.h;
      const jx = -M.c * vx / D, jy = -M.c * vy / D;
      const rs = o.S1 - o.n * meanRSSI(M, p, o.q);
      gx += -2 * jx * rs; gy += -2 * jy * rs;
    }
    const gn2 = gx * gx + gy * gy;
    let ok = false;
    for (let ls = 0; ls < 60; ls++) {
      const np = [p[0] - t * gx, p[1] - t * gy];
      const nf = sse(M, np, obs);
      if (nf <= f - 1e-4 * t * gn2) { const st = Math.hypot(np[0] - p[0], np[1] - p[1]); p = np; f = nf; ok = true; t *= 2; path.push(p.slice()); const done = pstar ? Math.hypot(p[0] - pstar[0], p[1] - pstar[1]) < tol : st < tol; if (done) return { p, path, iters: it + 1 }; break; }
      t /= 2;
    }
    if (!ok) break;
  }
  return { p, path, iters: it };
}

// ===== Aleatoriedade reprodutível =====
function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
  return { u, n };
}

// ===== Simulação de uma missão =====
function measure(M, R, target, qs, m, obs) {
  for (const q of qs) {
    const mu = meanRSSI(M, target, q);
    let S1 = 0, S2 = 0;
    for (let j = 0; j < m; j++) { const y = mu + M.sigma * R.n(); S1 += y; S2 += y * y; }
    obs.push({ q: q.slice(), n: m, S1, S2 });
  }
}
function pastFisher(M, p, obs) { return fisher(M, p, obs.map(o => o.q), obs.map(o => o.n)); }

// Nuvem de pontos-sigma da incerteza atual (centro + ±1 desvio em cada eixo da elipse), com a Fisher passada em cada ponto
function sigmaCloud(M, pHat, obs, cap) {
  const C0 = inv2(withPrior(M, pastFisher(M, pHat, obs)));
  const e = eig2(C0);
  const s1 = Math.min(Math.sqrt(Math.max(e.l1, 0)), cap), s2 = Math.min(Math.sqrt(Math.max(e.l2, 0)), cap);
  const u = [Math.cos(e.ang), Math.sin(e.ang)], v = [-u[1], u[0]];
  const pts = [{ d: [0, 0], w: 1 / 3 }];
  for (const [a, b] of [[s1, 0], [-s1, 0], [0, s2], [0, -s2]]) pts.push({ d: [a * u[0] + b * v[0], a * u[1] + b * v[1]], w: 1 / 6 });
  for (const c of pts) c.base = pastFisher(M, [pHat[0] + c.d[0], pHat[1] + c.d[1]], obs);
  return pts;
}

// ===== Cobertura com memória e programação dinâmica =====
// O mapa é discretizado em G×G células. `explored` persiste entre rodadas;
// a DP memoriza estados (célula, máscara coberta, horizonte) durante cada plano.
function cellCenter(index, G, L) {
  const size = L / G, x = index % G, y = Math.floor(index / G);
  return [(x + 0.5) * size, (y + 0.5) * size];
}
function coverageMaskAt(p, G, L, radius) {
  let mask = 0n;
  for (let i = 0; i < G * G; i++) {
    const c = cellCenter(i, G, L);
    if (Math.hypot(c[0] - p[0], c[1] - p[1]) <= radius) mask |= 1n << BigInt(i);
  }
  return mask;
}
function exploredMask(explored) {
  let mask = 0n;
  for (let i = 0; i < explored.length; i++) if (explored[i]) mask |= 1n << BigInt(i);
  return mask;
}
function markCoverage(explored, G, q, radius, L) {
  const mask = coverageMaskAt(q, G, L, radius); let added = 0;
  for (let i = 0; i < G * G; i++) if ((mask & (1n << BigInt(i))) !== 0n && !explored[i]) { explored[i] = 1; added++; }
  return added;
}
function coverageLikelihood(M, obs, G) {
  const vals = new Float64Array(G * G); let mn = Infinity;
  for (let i = 0; i < vals.length; i++) { vals[i] = sse(M, cellCenter(i, G, M.L), obs); mn = Math.min(mn, vals[i]); }
  let sum = 0;
  for (let i = 0; i < vals.length; i++) { vals[i] = Math.exp(-(vals[i] - mn) / (2 * M.sigma * M.sigma)); sum += vals[i]; }
  if (!(sum > 0)) { vals.fill(1 / vals.length); return vals; }
  for (let i = 0; i < vals.length; i++) vals[i] /= sum;
  return vals;
}
function planCoverageRoute(weights, explored, q0, opt) {
  const G = opt.G, L = opt.L, stepMax = opt.stepMax, radius = opt.radius;
  const horizon = Math.max(1, opt.horizon || 4), travelWeight = opt.travelWeight == null ? 0.012 : opt.travelWeight;
  const coverageBonus = opt.coverageBonus == null ? 0.015 : opt.coverageBonus;
  const n = G * G, centers = Array.from({ length: n }, (_, i) => cellCenter(i, G, L));
  const cover = centers.map(p => coverageMaskAt(p, G, L, radius));
  const neighbors = centers.map((p, i) => centers.map((r, j) => ({ j, d: Math.hypot(r[0] - p[0], r[1] - p[1]) })).filter(e => e.j !== i && e.d <= stepMax + 1e-7));
  const baseMask = exploredMask(explored), memo = new Map(), massMemo = new Map();
  const mass = mask => {
    const key = mask.toString(36); if (massMemo.has(key)) return massMemo.get(key);
    let v = 0; for (let i = 0; i < n; i++) if ((mask & (1n << BigInt(i))) !== 0n) v += weights[i] || 0;
    massMemo.set(key, v); return v;
  };
  const freshValue = mask => {
    let cells = 0; for (let i = 0; i < n; i++) if ((mask & (1n << BigInt(i))) !== 0n) cells++;
    return mass(mask) + coverageBonus * cells;
  };
  const solve = (at, mask, depth) => {
    if (depth <= 0) return { value: 0, route: [] };
    const key = `${at}|${depth}|${mask.toString(36)}`;
    if (memo.has(key)) return memo.get(key);
    let best = { value: -Infinity, route: [] };
    for (const edge of neighbors[at]) {
      const fresh = cover[edge.j] & ~mask;
      const tail = solve(edge.j, mask | cover[edge.j], depth - 1);
      const value = freshValue(fresh) - travelWeight * edge.d / stepMax + tail.value;
      if (value > best.value + 1e-12) best = { value, route: [edge.j].concat(tail.route) };
    }
    if (!best.route.length) best = { value: 0, route: [] };
    memo.set(key, best); return best;
  };
  let best = { value: -Infinity, route: [], firstDistance: 0 };
  for (let j = 0; j < n; j++) {
    const d = Math.hypot(centers[j][0] - q0[0], centers[j][1] - q0[1]);
    if (d > stepMax + 1e-7) continue;
    const fresh = cover[j] & ~baseMask, tail = solve(j, baseMask | cover[j], horizon - 1);
    const value = freshValue(fresh) - travelWeight * d / stepMax + tail.value;
    if (value > best.value + 1e-12) best = { value, route: [j].concat(tail.route), firstDistance: d };
  }
  if (!best.route.length) {
    let j = 0, d = Infinity;
    centers.forEach((p, i) => { const di = Math.hypot(p[0] - q0[0], p[1] - q0[1]); if (di < d) { d = di; j = i; } });
    best = { value: 0, route: [j], firstDistance: d };
  }
  return { next: centers[best.route[0]], route: best.route.map(i => centers[i]), value: best.value, memoStates: memo.size, exploredMask: baseMask };
}
function planNext(M, strategy, pHat, qs, obs, opt, R, formation) {
  const V = opt.stepMax, L = M.L;
  if (strategy === 'fisher') {
    const base = pastFisher(M, pHat, obs);
    const ns = qs.map(() => opt.m);
    const o = { dmin: opt.dmin, cons: { L, stepFrom: qs, stepMax: V } };
    if (opt.robust) o.cloud = sigmaCloud(M, pHat, obs, opt.robustCap || 250);
    return optimizePlacement(M, pHat, qs, ns, base, o, opt.iters || 50);
  }
  if (strategy === 'goto') {
    const cons = { L, stepFrom: qs, stepMax: V };
    const cand = qs.map((q, i) => {
      const tgt = [pHat[0] + formation[i][0], pHat[1] + formation[i][1]];
      return project(tgt, cons, i);
    });
    const repaired = projectFormation(cand, cons, opt.dmin);
    return repaired.feasible ? repaired.qs : qs.map(q => q.slice());
  }
  // aleatória
  const cons = { L, stepFrom: qs, stepMax: V };
  const cand = qs.map((q, i) => { const th = 2 * Math.PI * R.u(); return project([q[0] + V * Math.cos(th), q[1] + V * Math.sin(th)], cons, i); });
  const repaired = projectFormation(cand, cons, opt.dmin);
  return repaired.feasible ? repaired.qs : qs.map(q => q.slice());
}

export { makeModel, meanRSSI, fisher, withPrior, det2, inv2, logdet, eig2, ellipse95, rmsBound, gradLogdet, cloudPts, objective, objectiveGrad, ringCloud, project, separationStatus, projectFormation, pgStep, optimizePlacement, theoreticalOptimum, sse, gridSearch, gaussNewton, gradientDescent, rng, measure, pastFisher, sigmaCloud, cellCenter, coverageMaskAt, exploredMask, markCoverage, coverageLikelihood, planCoverageRoute, planNext, CHI2_95 };
