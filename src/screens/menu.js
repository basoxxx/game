import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { logoMark, carSVG, teamBadge } from '../ui/art.js';
import { esc } from '../ui/dom.js';
import { listSaves, loadGame, deleteSave, importSave, saveGame, SLOTS } from '../engine/state.js';
import { CATEGORIES } from '../data/categories.js';
import { circuitPath, arcFrac, TrackView } from '../ui/trackview.js';
import { TRACKS } from '../data/tracks.js';
import { sfx } from '../ui/audio.js';
import { openLessons } from './engineer.js';
import { Garage3D } from '../ui/garage3d.js';
import { webglAvailable } from '../ui/race3d.js';
import { TEAMS } from '../data/teams.js';
let garage = null;
import { migrateSave } from '../engine/migrate.js';

let anim = null, view = null;
const DEMO_COLORS = [['#d40000', '#ffdd00'], ['#00d2be', '#c0c0c0'], ['#1b2a6b', '#e3002b'], ['#ff8000', '#101820'], ['#00594f', '#cedc00'], ['#005aff', '#fff'], ['#0090ff', '#ff87bc'], ['#f0f0f0', '#d00f1f'], ['#1634cc', '#fff'], ['#1a1a1a', '#ff2d2d']];

registerScreen({
  id: 'menu', full: true,
  render() {
    const saves = listSaves();
    const hasSave = saves.some((s) => !s.empty);
    const last = saves.filter((x) => !x.empty).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    const item = (a, ic, label, desc, extra = '', cls = '') => `<div class="menu-item ${cls}" ${a} data-desc="${esc(desc)}">${icon(ic)}<span>${label}</span>${extra}</div>`;
    return `<div class="menu-screen">
      <div class="menu-bg"><canvas id="menu-cv"></canvas></div>
      <div id="menu-3d" class="menu-car"></div>
      ${webglAvailable() ? '' : `<div class="menu-car-fallback">${carSVG('formula', { primary: '#e5141b', secondary: '#fff', accent: '#111', pattern: 1 }, { number: 1, sponsor: 'Apex Dynasty' })}</div>`}
      <div class="menu-feature" id="menu-feature"><div class="mf-k">In pista</div><div class="mf-v" id="menu-track"></div><div class="mf-t" id="menu-car-name"></div></div>
      <div class="menu-left">
        <div class="menu-logo">${logoMark(64)}<div><div class="logo-big">Apex<span>Dynasty</span></div><div class="logo-sub">Formula · Rally · Endurance</div></div></div>
        <div>
          <nav class="menu-list" aria-label="Menu principale">
            ${hasSave ? item('data-a="continue-last"', 'play', 'Continua', last ? `${last.team} · Stagione ${last.season} · Round ${Math.min(last.round + 1, last.total)}/${last.total}` : 'Riprendi l’ultima partita salvata') : ''}
            ${item('data-a="nav" data-to="newgame"', 'flag', 'Nuova Carriera', 'Diventa Team Principal: Formula, Rally o Endurance. Scegli una squadra o fondane una tua.')}
            ${item('data-a="nav" data-to="quickrace"', 'speed', 'Gara Rapida', 'Un weekend singolo con qualsiasi squadra, su qualsiasi pista.')}
            ${item('data-a="nav" data-to="derby"', 'steering', 'Scontro Totale', 'Prendi il volante: corse a contatto, salti e derby della distruzione.', '<span class="tag">Guida tu</span>')}
            ${item('data-a="nav" data-to="challenges"', 'target', 'Sfide', 'Scenari con un obiettivo e medaglie da conquistare.')}
            <div class="menu-sep"></div>
            ${item('data-a="load"', 'save', 'Carica Partita', 'Apri uno degli slot di salvataggio o importa un file.', '', `sm ${hasSave ? '' : 'disabled'}`)}
            ${item('data-a="nav" data-to="settings" data-back="menu"', 'settings', 'Impostazioni', 'Audio, grafica 3D, filtri, realismo e accessibilità.', '', 'sm')}
            ${item('data-a="nav" data-to="howto" data-back="menu"', 'book', 'Come si gioca', 'Guida illustrata: la settimana tipo, il weekend, le decisioni in gara, i comandi.', '', 'sm')}
            ${item('data-a="lessons"', 'sim', 'Accademia Ingegneri', 'Lezioni interattive su gomme, strategia e assetto.', '', 'sm')}
            ${window.apex?.quit ? item('data-a="quit"', 'logout', 'Esci', 'Chiudi il gioco.', '', 'sm') : ''}
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
    const cv = document.getElementById('menu-cv');
    const demo = TRACKS.formula[Math.floor(Math.random() * TRACKS.formula.length)];
    view = new TrackView(cv, circuitPath(demo.cid), { pad: 70, glow: 'rgba(0,0,0,0)', clear: true, width: 12 });
    view.demoName = demo.circuit;
    const tl = document.getElementById('menu-track'); if (tl) tl.textContent = demo.name;
    const desc = document.getElementById('menu-desc');
    const list = document.querySelector('.menu-list');
    list?.addEventListener('focusin', (e) => { const it = e.target.closest('.menu-item'); if (it && desc) desc.textContent = it.dataset.desc || ''; });
    list?.addEventListener('mouseleave', () => { const f = document.activeElement; if (f?.classList?.contains('menu-item') && desc) desc.textContent = f.dataset.desc || ''; });
    // console-style: the first entry is selected as soon as the menu opens
    const first = document.querySelector('.menu-list .menu-item:not(.disabled)');
    first?.focus({ preventScroll: true });
    const m3 = document.getElementById('menu-3d');
    if (m3 && webglAvailable()) {
      try {
        const cats = ['formula', 'formula', 'endurance', 'rally'];
        const c = cats[Math.floor(Math.random() * cats.length)];
        const t = TEAMS[c][Math.floor(Math.random() * TEAMS[c].length)];
        garage = new Garage3D(m3, c, { primary: t.colors[0], secondary: t.colors[1], accent: t.colors[2] }, { accent: t.colors[0] === '#f0f0f0' ? t.colors[1] : t.colors[0], number: Math.floor(1 + Math.random() * 63), sponsor: t.short, dist: 13 });
        const cn = document.getElementById('menu-car-name'); if (cn) cn.textContent = `${t.name} · ${CATEGORIES[c]?.name || ''}`;
      } catch (e) { console.warn(e); }
    }
    const cars = DEMO_COLORS.map((c, i) => ({ p: -i * 0.012, v: 0.06 + Math.random() * 0.002, c }));
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      for (const car of cars) { car.p += car.v * dt * (0.95 + Math.sin(t / 1000 + car.v * 100) * 0.08); }
      view.frame((c, v) => { for (const car of cars) { const q = v.pointAt(arcFrac('formula', demo.cid, car.p)); v.drawCar(q.x, q.y, q.ang, car.c[0], car.c[1], { glow: car.c[0] }); } });
      anim = requestAnimationFrame(loop);
    };
    anim = requestAnimationFrame(loop);
  },
  unmount() { cancelAnimationFrame(anim); view?.destroy(); garage?.destroy(); garage = null; },
  actions: {
    'continue-last'() {
      const s = listSaves().filter((x) => !x.empty).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
      if (s && loadGame(s.slot)) { migrateSave(window.__apex.S()); sfx.ok(); App.go('hub'); }
    },
    load() { openLoad(); },
    quit() { window.apex?.quit?.(); },
    lessons() { openLessons(); },
    mixer() { App.audioMixer(); },
    credits() {
      App.modal(`<h2>Come si gioca</h2>
      <div class="col small" style="gap:12px;line-height:1.55">
        <p><b>Sei il Team Principal.</b> Scegli Formula, Rally o Endurance e una squadra (o fondane una tua). In alternativa lanciati in una <b>Gara Rapida</b>.</p>
        <p><b>Circuiti reali e fisica:</b> i 24 tracciati della Formula usano la geometria reale. La velocità in ogni curva deriva da raggio, carico aerodinamico, grip e potenza: per questo Monza premia il motore e Monaco il carico.</p>
        <p><b>Centro Tecnico:</b> concetto della vettura, livrea (con garage 3D) e progetti R&D con rischi e rendimenti decrescenti.</p>
        <p><b>Weekend:</b> trova l’assetto ascoltando il pilota, qualificati, poi scegli la strategia con il pianificatore (curve di degrado, soste ottimali). In gara gestisci ritmo, gomme, temperature, DRS, safety car e meteo. Segui la gara in <b>3D</b> (TV, camera car, onboard, elicottero) o sulla mappa 2D, con telemetria e analisi del giro.</p>
        <p><b>Rally:</b> gomme e ritmo per ogni prova, decisioni live del copilota, parco assistenza a tempo.</p>
        <p><b>Carriera:</b> guadagni XP e livelli manager, sblocchi abilità, completi obiettivi stagionali, ricevi offerte anche da altre categorie. Attento alla fiducia del consiglio!</p>
        <p class="muted">Scorciatoie in gara: <span class="kbd">Spazio</span> pausa · <span class="kbd">1-5</span> velocità · clic su un pilota in classifica per seguirlo · <span class="kbd">F11</span> schermo intero (desktop).</p>
      </div><div class="row mt24" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Ho capito</button></div>`);
    },
  },
});

// "Continue" card: the most recent save, one click away
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
    <div class="mc-meta"><span>Stagione <b>${s.season}</b></span><span>Round <b>${Math.min(s.round + 1, s.total)}/${s.total}</b></span></div>
    <div class="mc-bar"><i style="width:${pct}%"></i></div>
  </div>`;
}
// News ticker: parody paddock headlines, with a few lines about the player's own save
const NEWS = [
  'Mercato piloti: voci di uno scambio clamoroso tra due top team a fine stagione',
  'Nuove regole aerodinamiche in arrivo: i reparti tecnici già al lavoro sulle simulazioni',
  'Rally di Monte Carlo: attese neve e ghiaccio sul Col de Turini',
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
      ${s.empty ? `<div class="grow muted">Slot vuoto</div>` : `<div class="grow"><div style="font-weight:700">${esc(s.team)} <span class="chip" style="margin-left:6px">${CATEGORIES[s.category]?.name}</span></div><div class="small muted">${esc(s.player)} · Stagione ${s.season} · Round ${Math.min(s.round + 1, s.total)}/${s.total} · ${s.savedAt ? new Date(s.savedAt).toLocaleString('it-IT') : ''}</div></div>`}
      ${saveMode ? `<button class="btn sm primary" data-a="save-slot" data-slot="${s.slot}">Salva qui</button>` : !s.empty ? `<button class="btn sm primary" data-a="load-slot" data-slot="${s.slot}">Carica</button>` : ''}
      ${!s.empty ? `<button class="btn sm ghost icon-btn" data-a="del-slot" data-slot="${s.slot}" title="Elimina">${icon('trash')}</button>` : ''}
    </div>`).join('')}</div>
    <div class="row mt16 between"><div class="row"><label class="btn sm ghost">${icon('upload')} Importa file<input type="file" accept=".json,application/json" data-change="import" hidden></label></div><button class="btn ghost" data-a="close-modal">Chiudi</button></div>`;
  };
  const actions = {
    'load-slot'(el) { if (loadGame(+el.dataset.slot)) { migrateSave(window.__apex.S()); App.closeModal(); sfx.ok(); App.go('hub'); } },
    'save-slot'(el) { saveGame(+el.dataset.slot); App.toast('Partita salvata', `Slot ${el.dataset.slot}`, 'good'); App.closeModal(); },
    'del-slot'(el) { deleteSave(+el.dataset.slot); document.querySelector('.modal').innerHTML = render(); },
    import(el) {
      const f = el.files?.[0]; if (!f) return;
      f.text().then((t) => { try { const s = migrateSave(importSave(t)); s.slot = s.slot || 1; saveGame(s.slot); App.closeModal(); App.go('hub'); } catch (e) { App.toast('Import fallito', e.message, 'bad'); } });
    },
  };
  App.modal(render(), actions);
}
