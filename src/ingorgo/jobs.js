// Ingorgo — runs generator / solver jobs in Web Workers, or on the main thread when workers are not
// available (old browsers, file:// in some shells). Same results either way (pure, seeded).
// job(type, args, { onProgress }) → Promise. Two lanes: puzzle generation (which can take seconds and
// runs ahead of time) never delays a hint from the solver. A busy worker sends progress messages that
// keep its queue alive: only a worker silent for 45 s is considered stuck (terminated, its jobs redone
// on the main thread).
let broken = false, seq = 0;
const STUCK_MS = 45000;
const lanes = { gen: { worker: null, pending: new Map() }, solve: { worker: null, pending: new Map() } };
function dropWorker(lane) { try { lane.worker?.terminate(); } catch {} lane.worker = null; }
function getWorker(lane) {
  if (broken || typeof Worker === 'undefined') return null;
  if (lane.worker) return lane.worker;
  try {
    const w = lane.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      for (const [, q] of lane.pending) q.arm(); // any message: the worker is alive, the queue keeps its time
      const p = lane.pending.get(e.data.id); if (!p) return;
      if (e.data.progress != null) { try { p.onProgress?.(e.data.progress); } catch {} return; }
      lane.pending.delete(e.data.id); clearTimeout(p.t); e.data.ok ? p.res(e.data.res) : p.rej(new Error(e.data.err));
    };
    w.onerror = (e) => { e.preventDefault?.(); broken = true; lane.worker = null; const all = [...lane.pending.values()]; lane.pending.clear(); for (const p of all) p.fallback(); };
  } catch { broken = true; lane.worker = null; }
  return lane.worker;
}
async function local(type, args, onProgress) { const m = await import('./worker.js'); await new Promise((r) => setTimeout(r, 30)); return m.run(type, args, onProgress); }
export function job(type, args, { onProgress } = {}) {
  const lane = lanes[type === 'solve' ? 'solve' : 'gen'];
  const w = getWorker(lane);
  if (!w) return local(type, args, onProgress);
  return new Promise((res, rej) => {
    const id = ++seq;
    const fallback = () => { clearTimeout(p.t); local(type, args, onProgress).then(res, rej); };
    const p = { res, rej, fallback, onProgress, t: 0 };
    p.arm = () => { clearTimeout(p.t); p.t = setTimeout(() => { const all = [...lane.pending.values()]; lane.pending.clear(); dropWorker(lane); for (const q of all) q.fallback(); }, STUCK_MS); };
    p.arm();
    lane.pending.set(id, p);
    w.postMessage({ id, type, args });
  });
}
// stops every job: their promises never settle, so callers drop any promise they were keeping
export function stopJobs() { for (const lane of Object.values(lanes)) { dropWorker(lane); for (const [, p] of lane.pending) clearTimeout(p.t); lane.pending.clear(); } }
