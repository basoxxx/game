import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { logoMark, carSVG, teamBadge } from '../ui/art.js';
import { esc } from '../ui/dom.js';
import { listSaves, loadGame, deleteSave, importSave, saveGame, SLOTS } from '../engine/state.js';
import { CATEGORIES, DIFFICULTY } from '../data/categories.js';
import { circuitPath, arcFrac, TrackView } from '../ui/trackview.js';
import { TRACKS } from '../data/tracks.js';
import { sfx } from '../ui/audio.js';
import { mountStage, liveBackdrop } from '../ui/stage3d.js';
import { ensureQuality } from '../ui/quality.js';
import { TEAMS } from '../data/teams.js';
import { loadWithBackup, restoreBackup, hasBackup } from '../ui/savesafe.js';
let garage = null, showcase = null, menuGen = 0;

// Main menu entries, in order. Other modes: append one object (rendered generically).
//   to: screen id (data-a="nav") · a: action name · icon · label · desc (string or fn(ctx))
//   tag: small pill · sm: secondary style · sep: divider · when(ctx): show only if true · disabled(ctx)
export const MENU_ITEMS = [
  { a: 'continue-last', icon: 'play', label: 'Continua', when: (c) => c.hasSave, desc: (c) => (c.last ? `${c.last.team} · Stagione ${c.last.season} · Round ${Math.min(c.last.round + 1, c.last.total)}/${c.last.total}` : 'Riprendi l’ultima partita salvata') },
  { to: 'newgame', icon: 'flag', label: 'Nuova Carriera', desc: 'Diventa Team Principal: Formula, Rally o Endurance. Scegli una squadra o fondane una tua.' },
  { to: 'quickrace', icon: 'speed', label: 'Gara Rapida', desc: 'Un weekend singolo con qualsiasi squadra, su qualsiasi pista.' },
  { to: 'derby', icon: 'steering', label: 'Scontro Totale', desc: 'Prendi il volante: corse a contatto, salti e derby della distruzione.', tag: 'Guida tu' },
  { to: 'challenges', icon: 'target', label: 'Sfide', desc: 'Scenari con un obiettivo e medaglie da conquistare.' },
  { to: 'mode-champ', icon: 'trophy', label: 'Campionato personalizzato', desc: 'Crea il tuo campionato: piste, punteggi, sprint, meteo e griglia. Poi giocalo gara dopo gara.' },
  { to: 'mode-daily', icon: 'calendar', label: 'Sfida del giorno', desc: 'Ogni giorno una sfida nuova, uguale per tutti: un tentativo ufficiale, serie e risultato da condividere.' },
  { to: 'mode-tp', icon: 'hourglass', label: 'Team Principal a tempo', desc: 'Mini-stagione di 3 gare con un budget fisso di gettoni sviluppo.' },
  { sep: true },
  { to: 'launcher', icon: 'gamepad', label: 'Baso Hub', desc: 'Torna al Baso Hub: Manager, Flatout e Voragine.', sm: true },
  { a: 'load', icon: 'save', label: 'Carica Partita', desc: 'Apri uno degli slot di salvataggio o importa un file.', sm: true, disabled: (c) => !c.hasSave },
  { to: 'settings', back: 'menu', icon: 'settings', label: 'Impostazioni', desc: 'Audio, qualità grafica, filtri, testo e accessibilità.', sm: true },
  { to: 'howto', back: 'menu', icon: 'book', label: 'Come si gioca', desc: 'Guida illustrata: la settimana tipo, il weekend, le decisioni in gara, i comandi.', sm: true },
  { a: 'lessons', icon: 'sim', label: 'Accademia Ingegneri', desc: 'Lezioni interattive su gomme, strategia e assetto.', sm: true },
  { a: 'quit', icon: 'logout', label: 'Esci', desc: 'Chiudi il gioco.', sm: true, when: () => !!window.apex?.quit },
];
function menuItem(it, ctx) {
  if (it.when && !it.when(ctx)) return '';
  if (it.sep) return '<div class="menu-sep" role="separator"></div>';
  const desc = typeof it.desc === 'function' ? it.desc(ctx) : it.desc || '';
  const act = it.to ? `data-a="nav" data-to="${esc(it.to)}"${it.back ? ` data-back="${esc(it.back)}"` : ''}` : `data-a="${esc(it.a)}"`;
  const dis = it.disabled?.(ctx);
  return `<div class="menu-item ${it.sm ? 'sm' : ''} ${dis ? 'disabled' : ''}" ${act} data-desc="${esc(desc)}"${dis ? ' aria-disabled="true"' : ''}>${icon(it.icon || 'right')}<span>${esc(it.label)}</span>${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ''}</div>`;
}

let anim = null, view = null;
const DEMO_COLORS = [['#d40000', '#ffdd00'], ['#00d2be', '#c0c0c0'], ['#1b2a6b', '#e3002b'], ['#ff8000', '#101820'], ['#00594f', '#cedc00'], ['#005aff', '#fff'], ['#0090ff', '#ff87bc'], ['#f0f0f0', '#d00f1f'], ['#1634cc', '#fff'], ['#1a1a1a', '#ff2d2d']];

registerScreen({
  id: 'menu', full: true,
  render() {
    const saves = listSaves();
    const hasSave = saves.some((s) => !s.empty);
    const last = saves.filter((x) => !x.empty).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    const ctx = { hasSave, last, saves };
    return `<div class="menu-screen">
      <div class="menu-bg"><canvas id="menu-cv"></canvas></div><div class="menu-car-fallback">${carSVG('formula', { primary: '#e5141b', secondary: '#fff', accent: '#111', pattern: 1 }, { number: 1, sponsor: 'Apex Dynasty' })}</div>
      <div class="menu-feature" id="menu-feature"><div class="mf-k" id="menu-feat-k">In pista</div><div class="mf-v" id="menu-track"></div><div class="mf-t" id="menu-car-name"></div></div>
      <div class="menu-left">
        <div class="menu-logo">${logoMark(64)}<div><div class="logo-big">Apex<span>Dynasty</span></div><div class="logo-sub">Formula · Rally · Endurance</div></div></div>
        <div>
          <nav class="menu-list" aria-label="Menu principale">
            ${MENU_ITEMS.map((it) => menuItem(it, ctx)).join('')}
          </nav>
          <div class="menu-desc" id="menu-desc" aria-live="polite"></div>
        </div>
      </div>
      ${last ? continueCard(last) : ''}
      <div class="menu-ticker" aria-hidden="true"><div class="mt-k">${icon('news')} Paddock news</div><div class="mt-track"><div class="mt-run">${ticker(last)}</div></div></div>
      <div class="menu-foot">
        <div class="version"><span class="ver-badge">v${__APP_VERSION__}</span> Gioco di fantasia: nomi e marchi sono parodie e non affiliati</div>
        <div class="menu-hint">
          <span class="hint-kb"><span class="kbd">↑</span><span class="kbd">↓</span> Naviga</span><span class="hint-kb"><span class="kbd">Invio</span> Seleziona</span>
          <span class="hint-pad"><span class="pad-btn">A</span> Seleziona</span><span class="hint-pad"><span class="pad-btn">B</span> Indietro</span>
          <span><span class="kbd">?</span> Comandi</span>
          <button class="btn icon-btn ghost mf-audio" data-a="mixer" data-tip="Audio" aria-label="Audio">${icon('volume')}</button>
        </div>
      </div>
    </div>`;
  },
  mount() {
    const desc = document.getElementById('menu-desc');
    const list = document.querySelector('.menu-list');
    list?.addEventListener('focusin', (e) => { const it = e.target.closest('.menu-item'); if (it && desc) desc.textContent = it.dataset.desc || ''; });
    list?.addEventListener('mouseleave', () => { const f = document.activeElement; if (f?.classList?.contains('menu-item') && desc) desc.textContent = f.dataset.desc || ''; });
    // console-style: the first entry is selected as soon as the menu opens
    const first = document.querySelector('.menu-list .menu-item:not(.disabled)');
    first?.focus({ preventScroll: true });
    const tl = document.getElementById('menu-track'), cn = document.getElementById('menu-car-name'), fk = document.getElementById('menu-feat-k');
    // 1) the 2D backdrop paints with the menu, no 3D code needed
    const cv = document.getElementById('menu-cv');
    if (cv) {
      const demo = TRACKS.formula[Math.floor(Math.random() * TRACKS.formula.length)];
      view = new TrackView(cv, circuitPath(demo.cid), { pad: 70, glow: 'rgba(0,0,0,0)', clear: true, width: 12 });
      if (tl) tl.textContent = demo.name;
      const cars = DEMO_COLORS.map((c, i) => ({ p: -i * 0.012, v: 0.06 + Math.random() * 0.002, c }));
      let last = performance.now();
      const loop = (t) => {
        anim = requestAnimationFrame(loop);
        if (document.hidden) return;
        const dt = Math.min(0.05, (t - last) / 1000); last = t;
        for (const car of cars) { car.p += car.v * dt * (0.95 + Math.sin(t / 1000 + car.v * 100) * 0.08); }
        view.frame((c, v) => { for (const car of cars) { const q = v.pointAt(arcFrac('formula', demo.cid, car.p)); v.drawCar(q.x, q.y, q.ang, car.c[0], car.c[1], { glow: car.c[0] }); } });
      };
      anim = requestAnimationFrame(loop);
    }
    // 2) once the quality is known, the 3D showroom loads in the background and fades in on top
    const gen = ++menuGen;
    // let the menu paint (and answer input) before any 3D work starts
    const afterPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    if (!performance.getEntriesByName('menu-painted').length) requestAnimationFrame(() => setTimeout(() => performance.mark('menu-painted')));
    ensureQuality().then(afterPaint).then(() => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 900 }) : setTimeout(r, 250)))).then(() => {
      const screen = document.querySelector('.menu-screen');
      if (gen !== menuGen || !screen || !liveBackdrop() || garage) return;
      if (!showcase) {
        const cats = ['formula', 'formula', 'endurance', 'rally', 'junior'];
        const c = cats[Math.floor(Math.random() * cats.length)];
        const t = TEAMS[c][Math.floor(Math.random() * TEAMS[c].length)];
        showcase = { c, t, n: Math.floor(1 + Math.random() * 63) };
      }
      const { c, t, n } = showcase;
      const host = document.createElement('div'); host.id = 'menu-3d'; host.className = 'menu-stage'; host.setAttribute('aria-hidden', 'true');
      const scrim = document.createElement('div'); scrim.className = 'menu-scrim';
      screen.prepend(host, scrim);
      garage = mountStage(host, { id: 'menu', mode: 'cine', shift: 0.13, category: c, livery: { primary: t.colors[0], secondary: t.colors[1], accent: t.colors[2] }, number: n, sponsor: t.short, team: t, series: CATEGORIES[c]?.full || CATEGORIES[c]?.name, box: n });
      // when the first 3D frame is up: swap the caption and stop drawing the 2D backdrop
      const mo = new MutationObserver(() => {
        if (!host.classList.contains('stage-on')) return;
        mo.disconnect(); cancelAnimationFrame(anim); anim = 0;
        screen.classList.add('has-stage');
        if (fk) fk.textContent = 'Nel box';
        if (tl) tl.textContent = t.name;
        if (cn) cn.textContent = `${CATEGORIES[c]?.full || CATEGORIES[c]?.name || ''} · ${t.hq || ''}`;
      });
      mo.observe(host, { attributes: true, attributeFilter: ['class'] });
    });
  },
  unmount() { menuGen++; cancelAnimationFrame(anim); anim = 0; view?.destroy(); view = null; garage?.destroy(); garage = null; showcase = null; },
  actions: {
    'continue-last'() {
      const s = listSaves().filter((x) => !x.empty).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
      const fail = () => App.toast('Caricamento non riuscito', 'Il file di salvataggio è illeggibile. Se esiste un backup puoi ripristinarlo dal menu Carica.', 'bad');
      if (!s) { fail(); return; }
      loadWithBackup(s.slot).then((ok) => { if (ok) { sfx.ok(); App.go('hub'); } else fail(); }, (e) => { console.warn('load', e); fail(); });
    },
    load() { openLoad(); },
    quit() { window.apex?.quit?.(); },
    lessons() { import('./engineer.js').then((m) => m.openLessons()); },
    mixer() { App.audioMixer(); },
  },
});

// "Continue" card: the most recent save, one click away
const saveTags = (s) => `${s.ironman ? `<span class="chip save-tag iron" data-tip="Carriera Ironman: un solo salvataggio">${icon('lock')} Ironman</span>` : ''}${s.difficulty && s.difficulty !== 'normal' && DIFFICULTY?.[s.difficulty] ? `<span class="chip save-tag diff-${esc(s.difficulty)}">${esc(DIFFICULTY[s.difficulty].name)}</span>` : ''}`;
function continueCard(s) {
  const C = CATEGORIES[s.category];
  const col = s.colors?.[0] || '#e5141b';
  const known = (TEAMS[s.category] || []).find((t) => t.name === s.team);
  const badge = s.colors ? teamBadge({ colors: s.colors, short: known?.short || String(s.team || '').slice(0, 3).toUpperCase() }, 52) : logoMark(44);
  const when = s.savedAt ? new Date(s.savedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '';
  const pct = s.total ? Math.min(100, Math.round((Math.min(s.round, s.total) / s.total) * 100)) : 0;
  return `<div class="menu-continue" data-a="continue-last" style="--cc:${col}" data-tip="Riprendi da dove avevi lasciato">
    <div class="mc-k">${icon('play')} Continua carriera <span>${esc(when)}</span></div>
    <div class="mc-row">${badge}<div class="mc-t"><b>${esc(s.team)}</b><span>${esc(s.player || '')} · ${esc(C?.name || '')}</span></div></div>
    <div class="mc-meta"><span>Stagione <b>${s.season}</b></span><span>Round <b>${Math.min(s.round + 1, s.total)}/${s.total}</b></span></div>${saveTags(s) ? `<div class="mc-tags">${saveTags(s)}</div>` : ''}
    <div class="mc-bar"><i style="width:${pct}%"></i></div>
  </div>`;
}
// News ticker: parody paddock headlines, with a few lines about the player's own save
const NEWS = [
  'Mercato piloti: voci di uno scambio clamoroso tra due top team a fine stagione',
  'Nuove regole aerodinamiche in arrivo: i reparti tecnici già al lavoro sulle simulazioni',
  'Rally del Principato: attese neve e ghiaccio sul Col de Turini',
  'Endurance: la 24 Ore registra il tutto esaurito nelle tribune',
  'Scontro Totale: la nuova arena della Cava apre ai piloti più coraggiosi',
  'Gomme: il fornitore unico porta una mescola più morbida per le piste cittadine',
  'Budget cap: il consiglio federale valuta controlli più severi sui bilanci',
  'Junior: un diciottenne stupisce nei test e attira gli osservatori della Formula',
  'Meteo instabile previsto a Spa: i box preparano le intermedie',
  'Il motorista storico annuncia un nuovo propulsore ibrido più leggero',
  'Pit stop record: cambio gomme sotto i due secondi nell’ultima gara',
  'Sponsor: un marchio di bibite energetiche cerca una squadra di vertice',
];
function ticker(last) {
  const mine = last ? [`${last.team}: stagione ${last.season}, si riparte dal round ${Math.min(last.round + 1, last.total)}`, `Il team principal ${last.player || ''} sotto i riflettori del paddock`] : ['Nuova stagione alle porte: le squadre cercano un nuovo team principal'];
  const pool = [...NEWS].sort(() => Math.random() - 0.5).slice(0, 7);
  const items = [...mine, ...pool].map((n) => `<span class="mt-item">${esc(n)}</span>`).join('');
  return items + items; // doubled for a seamless loop
}

export function openLoad(saveMode = false) {
  const render = () => {
    const saves = listSaves();
    return `<h2>${saveMode ? 'Salva Partita' : 'Carica Partita'}</h2>
    <div class="col">${saves.map((s) => `<div class="card row" style="gap:14px">
      <div class="rating sm">${s.slot}</div>
      ${s.empty ? `<div class="grow muted">${s.corrupt ? 'Salvataggio illeggibile' : 'Slot vuoto'}</div>` : `<div class="grow"><div style="font-weight:700">${esc(s.team)} <span class="chip" style="margin-left:6px">${CATEGORIES[s.category]?.name}</span>${saveTags(s)}</div><div class="small muted">${esc(s.player)} · Stagione ${s.season} · Round ${Math.min(s.round + 1, s.total)}/${s.total} · ${s.savedAt ? new Date(s.savedAt).toLocaleString('it-IT') : ''}</div></div>`}
      ${saveMode ? `<button class="btn sm primary" data-a="save-slot" data-slot="${s.slot}">Salva qui</button>` : !s.empty ? `<button class="btn sm primary" data-a="load-slot" data-slot="${s.slot}">Carica</button>` : ''}
      ${!saveMode && hasBackup(s.slot) ? `<button class="btn sm ghost" data-a="restore-slot" data-slot="${s.slot}" data-tip="Ripristina la copia di sicurezza creata prima dell’ultimo aggiornamento del salvataggio">${icon('upload')} Backup</button>` : ''}
      ${!s.empty ? `<button class="btn sm ghost icon-btn" data-a="del-slot" data-slot="${s.slot}" data-tip="Elimina salvataggio" aria-label="Elimina salvataggio">${icon('trash')}</button>` : ''}
    </div>`).join('')}</div>
    <div class="row mt16 between"><div class="row"><label class="btn sm ghost">${icon('upload')} Importa file<input type="file" accept=".json,application/json" data-change="import" hidden></label></div><button class="btn ghost" data-a="close-modal">Chiudi</button></div>`;
  };
  const actions = {
    'load-slot'(el) {
      const fail = () => App.toast('Caricamento non riuscito', 'Il file di salvataggio è illeggibile. Se esiste un backup puoi ripristinarlo.', 'bad');
      loadWithBackup(+el.dataset.slot).then((ok) => { if (ok) { App.closeModal(); sfx.ok(); App.go('hub'); } else fail(); }, (e) => { console.warn('load', e); fail(); });
    },
    'restore-slot'(el) { const n = +el.dataset.slot; App.confirm('Ripristinare il backup?', `Lo slot ${n} tornerà alla copia salvata prima dell’ultimo aggiornamento del gioco.`, () => { if (restoreBackup(n)) { App.toast('Backup ripristinato', `Slot ${n}`, 'good'); openLoad(saveMode); } }, 'Ripristina'); },
    'save-slot'(el) { saveGame(+el.dataset.slot); App.toast('Partita salvata', `Slot ${el.dataset.slot}`, 'good'); App.closeModal(); },
    'del-slot'(el) {
      const n = +el.dataset.slot;
      const info = listSaves().find((x) => x.slot === n);
      App.confirm('Eliminare il salvataggio?', `Lo slot ${n}${info?.team ? ` (${esc(info.team)}, stagione ${info.season})` : ''} verrà cancellato definitivamente.`, () => { deleteSave(n); if (App.cur === 'menu') App.go('menu'); openLoad(saveMode); }, 'Elimina', true);
    },
    import(el) {
      const f = el.files?.[0]; if (!f) return;
      // the migration needs the engine (code-split): fetch it along with the file text
      Promise.all([f.text(), import('../engine/migrate.js')]).then(([t, { migrateSave }]) => { try { const s = migrateSave(importSave(t)); s.slot = s.slot || 1; saveGame(s.slot); App.closeModal(); App.go('hub'); } catch (e) { App.toast('Import fallito', e.message, 'bad'); } }, (e) => App.toast('Import fallito', e.message, 'bad'));
    },
  };
  App.modal(render(), actions);
}
