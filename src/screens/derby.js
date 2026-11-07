// "Scontro Totale" mode: pick an event and a banger, then drive it yourself.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { VENUES, buildTrack } from '../derby/tracks.js';
import { BANGERS } from '../derby/cars.js';
import { FILTER_PRESETS, applyFilterSettings } from '../ui/gfx.js';
import { getSettings, setSettings } from '../engine/state.js';

const KEY = 'apexdynasty_derby';
const PRICES = { berlina: 0, utilitaria: 0, muscle: 20000, pickup: 35000 };
function prog() { try { return { money: 0, wins: 0, races: 0, owned: ['berlina', 'utilitaria'], best: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { money: 0, wins: 0, races: 0, owned: ['berlina', 'utilitaria'], best: {} }; } }
function saveProg(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

const D = { venue: 'cava', car: 'berlina', color: null, opponents: 7, playing: false, game: null };
const COLORS = ['#7a1f1f', '#1f3f7a', '#5b6b2b', '#c99a12', '#d9d4c5', '#2b2b2b', '#b5501c', '#6b2c7a', '#2c7a74'];
const svgCache = {};
function trackSVG(v) {
  if (svgCache[v.id]) return svgCache[v.id];
  if (v.kind === 'derby') return (svgCache[v.id] = `<svg viewBox="0 0 120 80" class="dz-svg"><circle cx="60" cy="40" r="32" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="60" cy="40" r="32" fill="rgba(255,120,40,.08)"/><text x="60" y="45" text-anchor="middle" font-size="14" fill="currentColor" font-weight="900">💥</text></svg>`);
  const t = buildTrack(v); const [x0, z0, x1, z1] = t.bbox; const s = Math.min(110 / (x1 - x0), 70 / (z1 - z0));
  const d = t.pts.filter((_, i) => i % 6 === 0).map((p, i) => `${i ? 'L' : 'M'}${(60 + (p.x - (x0 + x1) / 2) * s).toFixed(1)},${(40 + (p.z - (z0 + z1) / 2) * s).toFixed(1)}`).join('') + 'Z';
  return (svgCache[v.id] = `<svg viewBox="0 0 120 80" class="dz-svg"><path d="${d}" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`);
}
const bar = (v) => `<div class="dz-stat"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div>`;

registerScreen({
  id: 'derby', full: true,
  render() {
    if (D.playing) return `<div class="dz-root" id="dz-root"><div class="dz-loading">Carico il motore fisico…</div></div>`;
    const P = prog();
    const v = VENUES.find((x) => x.id === D.venue);
    const car = BANGERS.find((b) => b.id === D.car);
    return `<div class="dz-menu">
      <div class="row between mb16"><div class="row" style="gap:16px"><button class="btn ghost icon-btn" data-a="nav" data-to="menu">${icon('left')}</button>
        <div><div class="tiny upper muted" style="letter-spacing:.3em">Modalità di guida</div><h1 style="font-size:40px;font-style:italic">Scontro Totale</h1><div class="small muted">Prendi il volante: corse a contatto, salti, lamiere che volano e il derby della distruzione.</div></div></div>
        <div class="dz-wallet"><span class="tiny upper muted">Crediti</span><b>€ ${P.money.toLocaleString('it-IT')}</b><span class="tiny muted">${P.wins} vittorie · ${P.races} eventi</span></div></div>
      <div class="dz-grid">
        <div class="panel"><div class="panel-head"><h3>Evento</h3></div>
          <div class="dz-venues">${VENUES.map((x) => `<div class="card click dz-venue ${x.id === D.venue ? 'sel' : ''}" data-a="dz-venue" data-id="${x.id}">${trackSVG(x)}<div><b>${esc(x.name)}</b><div class="tiny muted">${x.kind === 'derby' ? 'Demolition derby · ultimo in piedi' : `${x.laps} giri · ${x.surface === 'asphalt' ? 'asfalto' : 'sterrato'}${x.jumps?.length ? ` · ${x.jumps.length} salti` : ''}`}</div><div class="tiny mt8">${esc(x.desc)}</div>${P.best[x.id] ? `<div class="tiny gold mt8">Miglior risultato: ${P.best[x.id]}°</div>` : ''}</div></div>`).join('')}</div></div>
        <div class="col gap16">
          <div class="panel"><div class="panel-head"><h3>La tua auto</h3></div>
            <div class="dz-cars">${BANGERS.map((b) => { const own = P.owned.includes(b.id); return `<div class="card click dz-car ${b.id === D.car ? 'sel' : ''} ${own ? '' : 'locked'}" data-a="dz-car" data-id="${b.id}"><div class="row between"><b>${esc(b.name)}</b>${own ? '' : `<span class="chip warn">€ ${PRICES[b.id].toLocaleString('it-IT')}</span>`}</div><div class="tiny muted">${esc(b.desc)}</div>
              <div class="dz-stats"><span>Potenza</span>${bar(b.power / 1.3)}<span>Velocità</span>${bar(b.top / 1.15)}<span>Resistenza</span>${bar(b.armor / 1.5)}<span>Tenuta</span>${bar(b.grip / 1.15)}</div></div>`; }).join('')}</div>
            <div class="row gap6 mt16" style="flex-wrap:wrap"><span class="small muted" style="width:70px">Colore</span>${COLORS.map((c) => `<div class="swatch ${(D.color || car.color) === c ? 'sel' : ''}" style="background:${c}" data-a="dz-color" data-c="${c}"></div>`).join('')}</div>
            <div class="row gap6 mt8"><span class="small muted" style="width:70px">Avversari</span>${[3, 5, 7].map((n) => `<button class="btn sm ${D.opponents === n ? 'active' : ''}" data-a="dz-opp" data-v="${n}">${n}</button>`).join('')}</div>
            <div class="row gap6 mt8" style="flex-wrap:wrap"><span class="small muted" style="width:70px">Filtro</span>${Object.entries(FILTER_PRESETS).map(([k, f]) => `<button class="btn sm ${(getSettings().gfxFilter || 'naturale') === k ? 'active' : ''}" data-a="dz-filter" data-v="${k}" data-tip="${esc(f.desc)}">${esc(f.label)}</button>`).join('')}</div>
            <div class="row gap6 mt8"><span class="small muted" style="width:70px">Vista</span><button class="btn sm ${getSettings().dzMarker !== false ? 'active' : ''}" data-a="dz-marker">Freccia sopra la mia auto</button></div>
            <button class="btn primary xl mt24 pulse" style="width:100%" data-a="dz-go">${icon('flag')} Si parte!</button>
            <div class="tiny muted mt8">Tastiera: W/S gas e freno · A/D sterzo · Spazio freno a mano · Shift nitro · R riposiziona · C cambia camera. Gamepad: grilletti, stick sinistro, A nitro, B freno a mano.</div></div>
          <div class="panel small"><b>Come si gioca</b><div class="muted mt8">Il nitro si ricarica facendo volare l’auto e colpendo gli avversari. Le lamiere si piegano e i pezzi si staccano: oltre il limite l’auto prende fuoco ed è distrutta. Vinci gare e derby per guadagnare crediti e comprare auto più potenti.</div></div>
        </div>
      </div></div>`;
  },
  async mount() {
    if (!D.playing) { try { music.setMood('race'); } catch {} return; }
    const root = document.getElementById('dz-root');
    try { music.setMood?.('race'); music.stop?.(); } catch {}
    const { DerbyGame } = await import('../derby/game.js');
    const v = VENUES.find((x) => x.id === D.venue);
    const g = D.game = new DerbyGame(root, { venue: v, car: D.car, color: D.color, opponents: D.opponents, onEnd: (r) => {
      const P = prog(); P.money += r.prize; P.races++; if (r.pos === 1) P.wins++; P.best[r.venue] = Math.min(P.best[r.venue] || 99, r.pos); saveProg(P);
      try { r.pos === 1 ? sfx.win() : sfx.ok(); } catch {}
    } });
    window.__derby = g;
    try { await g.start(); root.querySelector('.dz-loading')?.remove(); } catch (e) { console.error(e); root.innerHTML = `<div class="dz-loading">Impossibile avviare la modalità: ${esc(e.message || String(e))}</div>`; }
  },
  unmount() { D.game?.destroy(); D.game = null; window.__derby = null; },
  actions: {
    'dz-venue'(el) { D.venue = el.dataset.id; sfx.click(); App.refresh(); },
    'dz-car'(el) {
      const P = prog(); const id = el.dataset.id;
      if (!P.owned.includes(id)) {
        const price = PRICES[id];
        if (P.money < price) { App.toast?.('Crediti insufficienti', `Servono € ${price.toLocaleString('it-IT')}: vinci qualche evento!`); sfx.bad?.(); return; }
        App.confirm(`Comprare ${BANGERS.find((b) => b.id === id).name}?`, `Costa € ${price.toLocaleString('it-IT')}.`, () => { const Q = prog(); Q.money -= price; Q.owned.push(id); saveProg(Q); D.car = id; D.color = null; App.refresh(); });
        return;
      }
      D.car = id; D.color = null; sfx.click(); App.refresh();
    },
    'dz-color'(el) { D.color = el.dataset.c; App.refresh(); },
    'dz-filter'(el) { setSettings({ gfxFilter: el.dataset.v }); applyFilterSettings(); App.refresh(); },
    'dz-marker'() { setSettings({ dzMarker: getSettings().dzMarker === false }); App.refresh(); },
    'dz-opp'(el) { D.opponents = +el.dataset.v; App.refresh(); },
    'dz-go'() { D.playing = true; sfx.ok(); App.refresh(); },
    'dz-resume'() { D.game?.togglePause(); },
    'dz-restart'() { D.game?.destroy(); D.game = null; App.refresh(); },
    'dz-quit'() { D.game?.destroy(); D.game = null; D.playing = false; App.refresh(); },
  },
});
