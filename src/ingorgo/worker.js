// Ingorgo — generator and solver off the main thread (a hard puzzle can take a second or two to map).
import { generate, dailyLevel, packLevel } from './gen.js';
import { compile, solve } from './core.js';

export function run(type, a) {
  if (type === 'gen') return generate(a.seed, a.mech, a.d, a.extra || {});
  if (type === 'daily') return dailyLevel(a.date ? new Date(a.date) : new Date());
  if (type === 'pack') return packLevel(a.pack, a.n);
  if (type === 'solve') { const B = compile(a.level); const r = solve(B, Int8Array.from(a.state), 300000); return r ? { moves: r.moves, n: r.n } : null; }
  throw new Error('unknown job ' + type);
}
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = (e) => {
    const { id, type, args } = e.data;
    try { self.postMessage({ id, ok: true, res: run(type, args) }); } catch (err) { self.postMessage({ id, ok: false, err: String(err?.message || err) }); }
  };
}
