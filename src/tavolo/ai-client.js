// Tavolo Baso — main-thread side of the AI worker: promise per job, a minimum "thinking" time so the computer
// never answers instantly, cancel() (undo, leaving the game) by recycling the worker. Falls back to running
// the job on the main thread (after a frame) if module workers are unavailable.
let W = null, seq = 0;
const pending = new Map();
function worker() {
  if (W) return W;
  try {
    W = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    W.onmessage = (e) => { const { id, ok, r, err } = e.data || {}; const p = pending.get(id); if (!p) return; pending.delete(id); ok ? p.res(r) : p.rej(new Error(err)); };
    W.onerror = (e) => { e.preventDefault?.(); console.warn('[tavolo] worker non disponibile, calcolo sul thread principale'); W = false; for (const [id, p] of pending) { pending.delete(id); runLocal(p.job).then(p.res, p.rej); } };
  } catch { W = false; }
  return W;
}
async function runLocal(job) {
  await new Promise((r) => setTimeout(r, 30));
  const { solve } = await import('./worker.js');
  return solve(job);
}
export function think(job, minMs = 0) {
  const t0 = performance.now();
  const p = new Promise((res, rej) => {
    const w = worker(), id = ++seq;
    if (!w) { runLocal(job).then(res, rej); return; }
    pending.set(id, { res, rej, job });
    w.postMessage({ id, job });
  });
  return p.then((r) => { const wait = minMs - (performance.now() - t0); return wait > 0 ? new Promise((ok) => setTimeout(() => ok(r), wait)) : r; });
}
// drop every job in flight (their promises never resolve)
export function cancelThinking() {
  if (!pending.size) return;
  pending.clear();
  if (W) { try { W.terminate(); } catch {} W = null; }
}
