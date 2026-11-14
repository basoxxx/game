// Guided tours: a spotlight that walks a new player through a screen.
// startTour(id, steps, opts) — steps: [{ sel?, title, text, icon?, place? }]
//   sel    CSS selector of the element to highlight (missing elements are skipped)
//   place  'right' | 'left' | 'bottom' | 'top' (auto when omitted)
// opts.passive: the screen keeps running and stays clickable (used in races).
// Seen tours are stored in localStorage 'apexdynasty_tips' like coach tips.
import { icon } from './icons.js';
import { sfx } from './audio.js';
import { S } from '../engine/state.js';

const KEY = 'apexdynasty_tips';
function seen() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
function mark(id) { const s = seen(); s[id] = 1; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
export function tourSeen(id) { return !!seen()[id]; }
export function resetTips() { try { localStorage.removeItem(KEY); } catch {} }

let active = null;
export function tourActive() { return !!active; }
export function endTour(done = true) {
  if (!active) return;
  const a = active; active = null;
  if (done) mark(a.id);
  window.removeEventListener('resize', a.onResize); document.removeEventListener('keydown', a.onKey, true);
  clearInterval(a.watch);
  a.mask.classList.add('out'); a.card.classList.add('out');
  setTimeout(() => { a.mask.remove(); a.card.remove(); }, 260);
  a.opts.onEnd?.(done);
}

export function startTour(id, steps, opts = {}) {
  if (active) endTour(false);
  const list = steps.filter((s) => !s.sel || document.querySelector(s.sel));
  if (!list.length) return;
  const mask = document.createElement('div');
  mask.className = `tour-mask${opts.passive ? ' passive' : ''}`;
  mask.innerHTML = '<div class="tour-hole"></div>';
  const card = document.createElement('div');
  card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
  document.body.append(mask, card);
  const hole = mask.firstChild;
  let i = 0;
  const place = () => {
    const st = list[i];
    const el = st.sel ? document.querySelector(st.sel) : null;
    const W = innerWidth, H = innerHeight;
    if (el) {
      el.scrollIntoView?.({ block: 'nearest' });
      const r = el.getBoundingClientRect(), pad = st.pad ?? 8;
      Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, opacity: 1 });
      const cw = card.offsetWidth, ch = card.offsetHeight, gap = 18;
      const room = { right: W - r.right, left: r.left, bottom: H - r.bottom, top: r.top };
      let side = st.place || (room.right > cw + 40 ? 'right' : room.bottom > ch + 40 ? 'bottom' : room.left > cw + 40 ? 'left' : 'top');
      let x, y;
      if (side === 'right') { x = r.right + pad + gap; y = r.top + r.height / 2 - ch / 2; }
      else if (side === 'left') { x = r.left - pad - gap - cw; y = r.top + r.height / 2 - ch / 2; }
      else if (side === 'bottom') { x = r.left + r.width / 2 - cw / 2; y = r.bottom + pad + gap; }
      else { x = r.left + r.width / 2 - cw / 2; y = r.top - pad - gap - ch; }
      card.style.left = `${Math.round(Math.max(16, Math.min(W - cw - 16, x)))}px`;
      card.style.top = `${Math.round(Math.max(16, Math.min(H - ch - 16, y)))}px`;
      card.dataset.side = side;
    } else {
      Object.assign(hole.style, { left: `${W / 2}px`, top: `${H / 2}px`, width: '0px', height: '0px', opacity: 0 });
      card.style.left = `${Math.round(W / 2 - card.offsetWidth / 2)}px`; card.style.top = `${Math.round(H / 2 - card.offsetHeight / 2)}px`;
      card.dataset.side = 'center';
    }
  };
  const show = () => {
    const st = list[i], last = i === list.length - 1;
    card.classList.toggle('center', !st.sel);
    card.innerHTML = `<div class="tc-top"><span class="tc-k">${icon(st.icon || 'compass')} ${opts.label || 'Tour guidato'}</span><span class="tc-n">${i + 1}<small>/${list.length}</small></span></div>
      <h3 class="tc-t">${st.title}</h3><div class="tc-x">${st.text}</div>
      <div class="tc-dots">${list.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('')}</div>
      <div class="tc-btns"><button class="btn sm ghost" data-t="skip">${last ? '' : 'Salta il tour'}</button><span class="grow"></span>${i ? `<button class="btn sm" data-t="prev" aria-label="Indietro">${icon('left')}</button>` : ''}<button class="btn sm primary" data-t="next">${last ? (opts.finish || 'Ho capito') : 'Avanti'} ${icon(last ? 'check' : 'right')}</button></div>`;
    if (last) card.querySelector('[data-t="skip"]').remove();
    place();
    card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
    card.querySelector('[data-t="next"]').focus({ preventScroll: true });
  };
  const go = (d) => {
    if (d > 0 && i === list.length - 1) { sfx.ok(); endTour(true); return; }
    i = Math.max(0, Math.min(list.length - 1, i + d)); sfx.select(); show();
  };
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    e.stopPropagation();
    if (b.dataset.t === 'skip') { sfx.back(); endTour(true); } else go(b.dataset.t === 'prev' ? -1 : 1);
  });
  const onKey = (e) => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(true); }
    else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !e.target.closest?.('.tour-card'))) { e.preventDefault(); e.stopPropagation(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
    else if (!opts.passive && e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') { e.stopPropagation(); }
  };
  const onResize = () => place();
  window.addEventListener('resize', onResize); document.addEventListener('keydown', onKey, true);
  active = { id, mask, card, opts, onKey, onResize, watch: setInterval(() => { if (opts.screen && window.__apex?.App?.cur !== opts.screen) endTour(false); else place(); }, 400) };
  sfx.open();
  show();
}

// ---------------------------------------------------------------------------
// Built-in tours
// ---------------------------------------------------------------------------
export const TOURS = {
  career: () => [
    { title: 'Benvenuto al muretto', icon: 'flag', text: `Sei il <b>Team Principal</b>. Ogni round del calendario è una settimana: prima <b>prepari la squadra</b> in fabbrica, poi vai al <b>weekend di gara</b>. Ti mostro dove si trova tutto in 30 secondi.` },
    { sel: '.topbar .tb-stats', icon: 'chart', title: 'I numeri che contano', text: 'Round, <b>budget</b>, <b>fiducia del consiglio</b> e il tuo <b>livello manager</b>. Se la fiducia scende troppo rischi il posto: rispetta l’obiettivo stagionale.' },
    { sel: '.season-goals', icon: 'target', title: 'I tuoi obiettivi', text: 'Qui vedi a colpo d’occhio dove sei rispetto all’<b>obiettivo del consiglio</b>, i tre <b>obiettivi stagionali</b> (XP e premi in denaro) e quanto manca al prossimo <b>livello manager</b>.' },
    { sel: '.todo-panel', icon: 'check', title: 'Da fare', text: 'La lista delle cose che ti aspettano questa settimana, le più urgenti in alto. <b>Clicca una voce</b> per andare dritto alla schermata giusta: svuotala prima di partire per il weekend.' },
    { sel: '.sidebar', icon: 'home', title: 'Il menu della squadra', place: 'right', text: 'Le sezioni sono divise in <b>Sede</b>, <b>Squadra</b>, <b>Campionato</b> e <b>Carriera</b>. Il numerino colorato accanto a una voce segnala qualcosa da fare lì: <b>rosso</b> urgente, <b>giallo</b> da sistemare.' },
    { sel: '.sidebar .nav[data-to="car"]', icon: 'car', title: 'Centro Tecnico', text: 'Avvia i progetti di <b>R&amp;D</b> per migliorare la monoposto. Pensa ai prossimi circuiti: motore per le piste veloci, carico per quelle lente.' },
    { sel: '.sidebar .nav[data-to="finance"]', icon: 'money', title: 'Sponsor e finanze', text: 'Firma subito gli <b>sponsor</b>: pagano a ogni evento e finanziano lo sviluppo. Tieni d’occhio stipendi e costi delle strutture.' },
    { sel: '.sidebar .nav[data-to="drivers"]', icon: 'users', title: 'Piloti e mercato', text: 'Morale, forma e contratti dei tuoi piloti. Dal <b>Mercato</b> puoi ingaggiare talenti… se il budget lo permette.' },
    { sel: '.continue-btn', icon: 'right', title: 'Ogni settimana finisce qui', text: 'Quando sei pronto premi <b>Weekend di Gara</b> (o <span class="kbd">Invio</span>): prove libere per l’assetto, qualifiche, poi la gara dove decidi ritmo, gomme e pit stop.' },
    { sel: '.crumb-search', icon: 'compass', title: 'Vai dove vuoi', text: 'Premi <span class="kbd">Ctrl</span> <span class="kbd">K</span> e scrivi: «sponsor», «regolamento», «accademia»… e ci sei. <span class="kbd">Backspace</span> torna alla schermata precedente.' },
    { sel: '.tb-actions', icon: 'help', title: 'Aiuto sempre a portata', text: 'Notifiche, mixer audio, la guida <b>Come si gioca</b> (<span class="kbd">F1</span>) e l’elenco comandi. Puoi rivedere questo tour dalla guida. Buona stagione!' },
  ],
  race: () => [
    { sel: '.race-board, .lb', icon: 'chart', title: 'La classifica in diretta', text: 'Distacchi, gomme e soste di tutti. <b>Clicca un pilota</b> per seguirlo con la telecamera e la telemetria.' },
    { sel: '.race-view', icon: 'map', title: 'Mappa e telecamere', place: 'right', pad: -40, text: 'Segui la gara in <b>3D</b> (TV, camera car, onboard, elicottero) o sulla <b>mappa</b> con settori, zone DRS e corsia box. I tuoi piloti hanno l’etichetta con il nome.' },
    { sel: '.race-side, .race-ctrl, .rc-panel', icon: 'steering', title: 'Il tuo muretto box', text: 'Per ogni tuo pilota: <b>ritmo</b> (spingi, normale, risparmia), modalità ibrida, <b>pit stop</b> con mescola. Spingere consuma gomme e carburante: scegli quando.' },
    { sel: '.speed-btns, .race-speed, [data-a="speed"]', icon: 'ff', title: 'Velocità della simulazione', text: '<span class="kbd">Spazio</span> mette in pausa, <span class="kbd">1</span>…<span class="kbd">6</span> cambiano velocità. Rallenta nei momenti caldi: partenza, safety car, pioggia.' },
    { title: 'Le decisioni chiave', icon: 'radio', text: 'Durante la gara arrivano <b>messaggi radio</b> e <b>momenti decisivi</b>: rispondi in fretta (tasti <span class="kbd">1</span>-<span class="kbd">3</span>). Quando piove, passa alle intermedie al momento giusto: è lì che si vincono le gare.' },
  ],
};

// Called by the router after every screen change
export function maybeTour(screen) {
  if (active) { if (active.opts.screen && active.opts.screen !== screen) endTour(false); else return; }
  const s = seen();
  if (s.__off) return;
  if (screen === 'hub' && S() && !s.tour_career && !s.race) {
    // wait for the welcome dialog of a new career to be dismissed
    const t0 = performance.now();
    const wait = setInterval(() => {
      if (window.__apex?.App?.cur !== 'hub' || performance.now() - t0 > 120000) { clearInterval(wait); return; }
      if (document.querySelector('.modal-wrap, .coach, .tour-mask')) return;
      clearInterval(wait);
      startTour('tour_career', TOURS.career(), { screen: 'hub', label: 'Primi passi', finish: 'Iniziamo' });
    }, 500);
  }
  if (screen === 'weekend' && !s.tour_race && !s.race) {
    const t0 = performance.now();
    const wait = setInterval(() => {
      if (window.__apex?.App?.cur !== 'weekend' || performance.now() - t0 > 60000) { clearInterval(wait); return; }
      if (!document.querySelector('.race-board') || document.querySelector('.modal-wrap, .tour-mask')) return;
      clearInterval(wait);
      mark('race'); // replaces the single coach tip of the race screen
      setTimeout(() => window.__apex?.App?.cur === 'weekend' && startTour('tour_race', TOURS.race(), { screen: 'weekend', passive: true, label: 'In gara' }), 5500);
    }, 600);
  }
}
