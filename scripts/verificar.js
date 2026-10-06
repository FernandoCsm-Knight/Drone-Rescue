// Verificações numéricas do modelo: rode com `npm test`.
import * as C from '../src/core.js';

const M = C.makeModel({});
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) falhas++; };

// 1. Gradiente analítico de log det F contra diferenças finitas (com e sem critério robusto)
for (const cloud of [null, C.ringCloud(30)]) {
  const p = [640, 360], qs = [[500, 300], [700, 450], [620, 250]], ns = [10, 10, 10];
  const opt = { dmin: 0, cloud };
  const g = C.objectiveGrad(M, p, qs, ns, null, opt).g;
  let pior = 0;
  for (let i = 0; i < qs.length; i++) for (let d = 0; d < 2; d++) {
    const a = qs.map(q => q.slice()), b = qs.map(q => q.slice()); a[i][d] += 1e-3; b[i][d] -= 1e-3;
    const fd = (C.objective(M, p, a, ns, null, opt).J - C.objective(M, p, b, ns, null, opt).J) / 2e-3;
    pior = Math.max(pior, Math.abs(fd - g[i][d]) / Math.abs(fd));
  }
  ok(pior < 1e-6, `gradiente confere com diferenças finitas ${cloud ? '(critério robusto)' : '(ponto exato)'}: erro relativo ${pior.toExponential(1)}`);
}

// 2. O otimizador atinge o ótimo analítico: N drones a r = h, direções balanceadas
for (const N of [2, 4, 6]) {
  const p = [640, 360];
  let qs = Array.from({ length: N }, (_, i) => [90 + 30 * Math.cos(i), 910 + 30 * Math.sin(i)]);
  const ns = qs.map(() => 10);
  qs = C.optimizePlacement(M, p, qs, ns, null, { dmin: 0, maxMove: 30, scaling: 'perDrone', cons: { L: 1000 } }, 3000);
  const ld = C.objective(M, p, qs, ns, null, { dmin: 0 }).ld;
  const th = C.theoreticalOptimum(M, N, 10).ld;
  const r = qs.map(q => Math.hypot(q[0] - p[0], q[1] - p[1]));
  ok(Math.abs(ld - th) < 1e-4 && r.every(v => Math.abs(v - M.h) < 1),
    `N = ${N}: log det F = ${ld.toFixed(5)} (teórico ${th.toFixed(5)}), distâncias ${r.map(v => v.toFixed(1)).join(', ')} m`);
}

// 3. Gauss-Newton recupera a posição a partir de medições sem ruído
{
  const alvo = [600, 300], obs = [];
  const R = { n: () => 0 };
  C.measure(M, R, alvo, [[100, 900], [400, 900], [100, 600], [800, 100]], 5, obs);
  const p = C.gaussNewton(M, obs, C.gridSearch(M, obs, 60), 50).p;
  ok(Math.hypot(p[0] - alvo[0], p[1] - alvo[1]) < 1e-3, `Gauss-Newton recupera a posição sem ruído: (${p[0].toFixed(3)}, ${p[1].toFixed(3)})`);
}

if (falhas) { console.error(`${falhas} verificação(ões) falharam`); process.exit(1); }
console.log('Todas as verificações passaram.');
