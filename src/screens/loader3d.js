// "Loading track" overlay for the live 3D views (practice, qualifying, race, rally stages).
// Building the 3D scene and compiling its shaders blocks the main thread for seconds (~15 s in software
// WebGL), so: the overlay is painted first, the heavy build runs a couple of frames later, and the overlay
// stays until race3d reports `_ready` (shaders compiled). The progress bar is a compositor transition,
// so it keeps moving while the main thread is busy; the stage label updates whenever the thread is free.
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';

const TIPS = {
  circuit: [
    '<b>Spazio</b> mette in pausa, i tasti <b>1-6</b> cambiano la velocità del gioco.',
    'Clicca un pilota nella <b>classifica</b> per seguirlo con la telecamera.',
    'Entro <b>1 secondo</b> da chi precede usa <b>Override</b>: è lì che si sorpassa.',
    'Con la <b>safety car</b> un pit stop costa circa la metà del tempo.',
    'Premi <b>R</b> per rivedere l’ultimo incidente, <b>A</b> per l’analisi della gara.',
    'Un <b>long run</b> da 6+ giri in prova misura il degrado reale delle gomme.',
    'In qualifica la pista migliora verso la fine, ma negli ultimi minuti c’è <b>traffico</b>.',
    'La <b>Regia</b> sceglie da sola le inquadrature migliori: battaglie, soste, incidenti.',
    'Le decisioni hanno un <b>conto alla rovescia</b>: se scade sceglie l’ingegnere.',
  ],
  rally: [
    'Il <b>copilota</b> chiama i pericoli: rispondi con <b>A/B</b> o <b>1/2</b>.',
    'A ogni intermedio puoi cambiare il <b>ritmo</b> dalla card rapida.',
    'Sul bagnato e sul ghiaccio un ritmo prudente vale più di qualche decimo.',
    'Al <b>parco assistenza</b> si riparano i danni: il tempo dei meccanici è limitato.',
    '<b>Spazio</b> mette in pausa, <b>+</b> e <b>−</b> cambiano la velocità.',
  ],
};
const STAGES = ['Costruzione del tracciato', 'Compilazione degli shader', 'Accensione delle telecamere'];

// host: the .race-view element · build(): creates the Race3D (or returns null) · o: { title, sub, svg, kind, skip, alive(), onReady(r3d) }
export function load3D(host, build, o = {}) {
  if (!host) { const r = build(); o.onReady?.(r); return null; }
  host.querySelector('.r3d-load')?.remove();
  const tips = TIPS[o.kind] || TIPS.circuit;
  const tip = tips[Math.floor(Math.random() * tips.length)];
  host.insertAdjacentHTML('beforeend', `<div class="r3d-load" role="status" aria-live="polite">
    <div class="rl-card">
      ${o.svg ? `<div class="rl-track">${o.svg}</div>` : ''}
      <div class="rl-eyebrow">${icon('flag', 'ico')} Caricamento pista</div>
      ${o.title ? `<div class="rl-title">${esc(o.title)}</div>` : ''}${o.sub ? `<div class="rl-sub">${esc(o.sub)}</div>` : ''}
      <div class="rl-bar"><i></i></div>
      <div class="rl-row"><span class="rl-stage">${STAGES[0]}…</span><span class="rl-pct">${o.kind === 'rally' ? 'Prova speciale' : 'Vista 3D'}</span></div>
      <div class="rl-tip">${icon('bulb', 'ico')}<span>${tip}</span></div>
      ${o.skip ? `<button class="btn sm ghost rl-skip" data-a="${o.skip}">${icon('map', 'ico')} Usa la mappa 2D</button>` : ''}
    </div></div>`);
  const el = host.lastElementChild;
  const stage = (i) => { const s = el.querySelector('.rl-stage'); if (s) s.textContent = `${STAGES[i]}…`; };
  const h = { el, r3d: null, done: false, iv: 0, to: 0, cancel() { finish(false); } };
  const finish = (ok) => {
    if (h.done) return; h.done = true; clearInterval(h.iv); clearTimeout(h.to);
    if (ok) { stage(2); el.classList.add('full'); }
    el.classList.add('out'); setTimeout(() => el.remove(), ok ? 520 : 0);
    o.onReady?.(ok ? h.r3d : null);
  };
  // two frames so the overlay is on screen (and its bar transition started) before the main thread blocks
  requestAnimationFrame(() => {
    el.classList.add('go');
    requestAnimationFrame(() => setTimeout(() => {
      if (h.done) return;
      if (o.alive && !o.alive()) { finish(false); return; }
      let r = null;
      try { r = build(); } catch (e) { console.warn('3D', e); }
      h.r3d = r;
      if (!r) { finish(false); return; }
      stage(1);
      const t0 = performance.now();
      h.iv = setInterval(() => {
        if (o.alive && !o.alive()) { finish(false); return; }
        if (r._ready !== false || r.destroyed || performance.now() - t0 > 30000) finish(true);
      }, 120);
    }, 0));
  });
  return h;
}
