// Ingorgo — runs generator / solver jobs in a Web Worker, or on the main thread when workers are not
// available (old browsers, file:// in some shells). Same results either way (pure, seeded).
let worker = null, broken = false, seq = 0;
const pending = new Map();
function getWorker() {
  if (broken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); clearTimeout(p.t); e.data.ok ? p.res(e.data.res) : p.rej(new Error(e.data.err)); };
    worker.onerror = (e) => { e.preventDefault?.(); broken = true; worker = null; for (const [, p] of pending) p.fallback(); pending.clear(); };
  } catch { broken = true; worker = null; }
  return worker;
}
async function local(type, args) { const m = await import('./worker.js'); await new Promise((r) => setTimeout(r, 30)); return m.run(type, args); }
export function job(type, args) {
  const w = getWorker();
  if (!w) return local(type, args);
  return new Promise((res, rej) => {
    const id = ++seq;
    const fallback = () => { clearTimeout(p.t); local(type, args).then(res, rej); };
    const p = { res, rej, fallback, t: setTimeout(() => { pending.delete(id); fallback(); }, 20000) };
    pending.set(id, p);
    w.postMessage({ id, type, args });
  });
}
export function stopJobs() { try { worker?.terminate(); } catch {} worker = null; for (const [, p] of pending) clearTimeout(p.t); pending.clear(); }
