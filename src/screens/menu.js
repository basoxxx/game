import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { logoMark, carSVG, teamBadge } from '../ui/art.js';
import { esc } from '../ui/dom.js';
import { listSaves, loadGame, deleteSave, importSave, saveGame, SLOTS } from '../engine/state.js';
import { CATEGORIES } from '../data/categories.js';
import { circuitPath, arcFrac, TrackView } from '../ui/trackview.js';
import { TRACKS } from '../data/tracks.js';
import { sfx } from '../ui/audio.js';

let anim = null, view = null;
const DEMO_COLORS = [['#d40000', '#ffdd00'], ['#00d2be', '#c0c0c0'], ['#1b2a6b', '#e3002b'], ['#ff8000', '#101820'], ['#00594f', '#cedc00'], ['#005aff', '#fff'], ['#0090ff', '#ff87bc'], ['#f0f0f0', '#d00f1f'], ['#1634cc', '#fff'], ['#1a1a1a', '#ff2d2d']];

registerScreen({
  id: 'menu', full: true,
  render() {
    const saves = listSaves();
    const hasSave = saves.some((s) => !s.empty);
    return `<div class="menu-screen">
      <div class="menu-left anim-in">
        <div>
          <div class="row" style="gap:14px">${logoMark(56)}<div class="tiny upper muted" style="letter-spacing:.4em">Motorsport Manager</div></div>
          <div class="logo-big mt16">Apex<span>Dynasty</span></div>
          <div class="logo-sub">Formula · Rally · Endurance</div>
        </div>
        <div class="menu-list">
          ${hasSave ? `<div class="menu-item" data-a="continue-last">${icon('play')} Continua</div>` : ''}
          <div class="menu-item" data-a="nav" data-to="newgame">${icon('flag')} Nuova Carriera</div>
          <div class="menu-item ${hasSave ? '' : 'disabled'}" data-a="load">${icon('save')} Carica Partita</div>
          <div class="menu-item" data-a="nav" data-to="settings" data-back="menu">${icon('settings')} Impostazioni</div>
          <div class="menu-item" data-a="credits">${icon('info')} Come si gioca</div>
          ${window.apex?.quit ? `<div class="menu-item" data-a="quit">${icon('logout')} Esci</div>` : ''}
        </div>
      </div>
      <div class="menu-right"><canvas id="menu-cv"></canvas>
        <div style="position:absolute;right:40px;bottom:40px;width:46%;opacity:.95;filter:drop-shadow(0 30px 30px rgba(0,0,0,.7))" class="anim-in"><div>${carSVG('formula', { primary: '#e10600', secondary: '#fff', accent: '#111', pattern: 1 }, { number: 1, sponsor: 'Apex Dynasty' })}</div></div>
      </div>
      <div class="version">v${__APP_VERSION__} · Gioco di fantasia: nomi e marchi sono parodie e non affiliati</div>
    </div>`;
  },
  mount() {
    const cv = document.getElementById('menu-cv');
    const demo = TRACKS.formula[Math.floor(Math.random() * TRACKS.formula.length)];
    view = new TrackView(cv, circuitPath(demo.cid), { pad: 80, glow: 'rgba(225,6,0,0.5)' });
    view.demoName = demo.circuit;
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
  unmount() { cancelAnimationFrame(anim); view?.destroy(); },
  actions: {
    'continue-last'() {
      const s = listSaves().filter((x) => !x.empty).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
      if (s && loadGame(s.slot)) { sfx.ok(); App.go('hub'); }
    },
    load() { openLoad(); },
    quit() { window.apex?.quit?.(); },
    credits() {
      App.modal(`<h2>Come si gioca</h2>
      <div class="col small" style="gap:12px;line-height:1.55">
        <p><b>Sei il Team Principal.</b> Scegli una categoria (Formula, Rally o Endurance) e una squadra, oppure fondane una tua.</p>
        <p><b>Centro Tecnico:</b> scegli il concetto della vettura, disegna la livrea e avvia progetti di sviluppo sui componenti. I progetti richiedono denaro e alcuni weekend di lavoro.</p>
        <p><b>Weekend:</b> nelle prove libere trova l’assetto ideale ascoltando il feedback dei piloti, poi qualifica e gara. In gara decidi ritmo, pit stop e gomme in tempo reale. Occhio al meteo!</p>
        <p><b>Rally:</b> per ogni prova speciale scegli gomme e ritmo. Durante la prova il copilota ti chiederà decisioni rapide. In assistenza ripari i danni entro 45 minuti.</p>
        <p><b>Gestione:</b> firma sponsor, ingaggia piloti e staff, potenzia le strutture. Rispetta gli obiettivi del Consiglio, o rischi il posto. A fine stagione puoi ricevere offerte anche da altre categorie.</p>
        <p class="muted">Scorciatoie in gara: <span class="kbd">Spazio</span> pausa · <span class="kbd">1-5</span> velocità · <span class="kbd">F11</span> schermo intero (app desktop).</p>
      </div><div class="row mt24" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Ho capito</button></div>`);
    },
  },
});

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
    'load-slot'(el) { if (loadGame(+el.dataset.slot)) { App.closeModal(); sfx.ok(); App.go('hub'); } },
    'save-slot'(el) { saveGame(+el.dataset.slot); App.toast('Partita salvata', `Slot ${el.dataset.slot}`, 'good'); App.closeModal(); },
    'del-slot'(el) { deleteSave(+el.dataset.slot); document.querySelector('.modal').innerHTML = render(); },
    import(el) {
      const f = el.files?.[0]; if (!f) return;
      f.text().then((t) => { try { const s = importSave(t); s.slot = s.slot || 1; saveGame(s.slot); App.closeModal(); App.go('hub'); } catch (e) { App.toast('Import fallito', e.message, 'bad'); } });
    },
  };
  App.modal(render(), actions);
}
