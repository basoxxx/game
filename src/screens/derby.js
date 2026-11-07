// "Scontro Totale" mode: pick an event and a banger, then drive it yourself.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { VENUES, buildTrack } from '../derby/tracks.js';
import { BANGERS } from '../derby/cars.js';
import { CHAMPIONSHIP, champGet, champStart, champNext, champReset } from '../derby/champ.js';
import { FILTER_PRESETS, applyFilterSettings } from '../ui/gfx.js';
import { getSettings, setSettings } from '../engine/state.js';

const KEY = 'apexdynasty_derby';
const PRICES = { berlina: 0, utilitaria: 0, muscle: 20000, pickup: 35000 };
function prog() { try { return { money: 0, wins: 0, races: 0, owned: ['berlina', 'utilitaria'], best: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { money: 0, wins: 0, races: 0, owned: ['berlina', 'utilitaria'], best: {} }; } }
function saveProg(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

const D = { venue: 'cava', car: 'berlina', color: null, opponents: 7, playing: false, game: null };
const COLORS = ['#7a1f1f', '#1f3f7a', '#5b6b2b', '#c99a12', '#d9d4c5', '#2b2b2b', '#b5501c', '#6b2c7a', '#2c7a74'];
const svgCache = {};
function trackSVG(v, big = false) {
  const key = v.id + (big ? ':big' : '');
  if (svgCache[key]) return svgCache[key];
  const sw = big ? 3 : 4;
  if (v.kind === 'derby') return (svgCache[key] = `<svg viewBox="0 0 120 80" class="dz-svg"><circle cx="60" cy="40" r="32" fill="rgba(255,120,40,.08)" stroke="currentColor" stroke-width="${sw}"/><circle cx="60" cy="40" r="24" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" opacity=".6"/><g transform="translate(48 28)" fill="currentColor"><path d="M12 2l1.8 5.2L19 4.5l-2.2 5.3L22 12l-5.2 1.8L19 19.5l-5.2-2.2L12 22l-1.8-4.7L5 19.5l2.2-5.7L2 12l5.2-2.2L5 4.5l5.2 2.7z"/></g></svg>`);
  const t = buildTrack(v); const [x0, z0, x1, z1] = t.bbox; const s = Math.min(110 / (x1 - x0), 70 / (z1 - z0));
  const d = t.pts.filter((_, i) => i % 6 === 0).map((p, i) => `${i ? 'L' : 'M'}${(60 + (p.x - (x0 + x1) / 2) * s).toFixed(1)},${(40 + (p.z - (z0 + z1) / 2) * s).toFixed(1)}`).join('') + 'Z';
  return (svgCache[key] = `<svg viewBox="0 0 120 80" class="dz-svg">${big ? `<path d="${d}" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="7" stroke-linejoin="round"/>` : ''}<path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"/></svg>`);
}
const bar = (v) => `<div class="dz-stat"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div>`;

registerScreen({
  id: 'derby', full: true,
  render() {
    if (D.playing) return `<div class="dz-root" id="dz-root"><div class="dz-loading">Carico il motore fisico…</div></div>`;
    const P = prog();
    const v = VENUES.find((x) => x.id === D.venue);
    const car = BANGERS.find((b) => b.id === D.car);
    const fact = (val, l) => `<div><b>${val}</b><span>${l}</span></div>`;
    const vFacts = v.kind === 'derby' ? fact('Arena', 'Formato') + fact('1', 'Sopravvive') + fact(D.opponents, 'Avversari') : fact(v.laps, 'Giri') + fact(v.surfaceName || (v.surface === 'asphalt' ? 'Asfalto' : 'Sterrato'), 'Fondo') + fact(v.jumps?.length || 0, 'Salti');
    const right = `<div class="dz-wallet"><div class="w-k">Crediti</div><b>€ ${P.money.toLocaleString('it-IT')}</b><div class="w-s">${P.wins} vittorie · ${P.races} eventi</div></div>`;
    return `<div class="full-screen dz-menu">
      ${pageHead({ eyebrow: 'Modalità di guida · Guidi tu', title: 'Scontro Totale', sub: 'Corse a contatto, salti, lamiere che volano e il derby della distruzione.', right })}
      <div class="dz-grid anim-in">
        <div>
          <div class="dz-section">Evento</div>
          <section class="dz-hero">
            <div class="dh-info"><div class="hh-eyebrow">${v.kind === 'derby' ? 'Demolition derby' : 'Gara a contatto'}</div><div class="dh-name">${esc(v.name)}</div><div class="small mt8" style="color:var(--text2);line-height:1.5">${esc(v.desc)}</div><div class="dz-facts">${vFacts}</div>${P.best[v.id] ? `<div class="mt16"><span class="tag">${icon('trophy')} Record: ${P.best[v.id]}°</span></div>` : ''}</div>
            <div class="dh-map">${trackSVG(v, true)}</div>
          </section>
          <div class="dz-venues">${VENUES.map((x) => `<div class="dz-venue ${x.id === D.venue ? 'sel' : ''}" data-a="dz-venue" data-id="${x.id}">${trackSVG(x)}<b>${esc(x.name)}</b><div class="tiny">${x.kind === 'derby' ? 'Ultimo in piedi' : `${x.laps} giri · ${(x.surfaceName || (x.surface === 'asphalt' ? 'asfalto' : 'sterrato')).toLowerCase()}`}</div>${P.best[x.id] ? `<div class="tiny" style="color:var(--hl)">Record ${P.best[x.id]}°</div>` : ''}</div>`).join('')}</div>
          <div class="dz-section">Come si gioca</div>
          <div class="small" style="color:var(--text2);line-height:1.6;max-width:680px">Il nitro si ricarica facendo volare l’auto e colpendo gli avversari. Le lamiere si piegano e i pezzi si staccano: oltre il limite l’auto prende fuoco ed è distrutta. Vinci gare e derby per guadagnare crediti e comprare auto più potenti.</div>
          <div class="dz-keys"><span><span class="kbd">W</span><span class="kbd">S</span> gas e freno</span><span><span class="kbd">A</span><span class="kbd">D</span> sterzo</span><span><span class="kbd">Spazio</span> freno a mano</span><span><span class="kbd">Shift</span> nitro</span><span><span class="kbd">R</span> riposiziona</span><span><span class="kbd">C</span> camera</span><span>${icon('gamepad', 'ico', 'style="width:18px;height:18px"')} grilletti, stick sinistro, A nitro, B freno a mano</span></div>
        </div>
        <div>
          <div class="dz-section">La tua auto</div>
          <div class="dz-cars">${BANGERS.map((b) => { const own = P.owned.includes(b.id); return `<div class="dz-car ${b.id === D.car ? 'sel' : ''} ${own ? '' : 'locked'}" data-a="dz-car" data-id="${b.id}"><div class="row between"><span class="dc-name">${esc(b.name)}</span>${own ? '' : `<span class="dc-price">${icon('lock')} € ${PRICES[b.id].toLocaleString('it-IT')}</span>`}</div><div class="small mt8" style="color:var(--text2)">${esc(b.desc)}</div>
            <div class="dz-stats"><span>Potenza</span>${bar(b.power / 1.3)}<span>Velocità</span>${bar(b.top / 1.15)}<span>Resistenza</span>${bar(b.armor / 1.5)}<span>Tenuta</span>${bar(b.grip / 1.15)}</div></div>`; }).join('')}</div>
          <div class="dz-opts">
            <span class="lbl">Colore</span><div class="swatches">${COLORS.map((c) => `<div class="swatch ${(D.color || car.color) === c ? 'sel' : ''}" style="background:${c}" data-a="dz-color" data-c="${c}"></div>`).join('')}</div>
            <span class="lbl">Avversari</span><div class="row gap4">${[3, 5, 7].map((n) => `<button class="btn sm ${D.opponents === n ? 'active' : ''}" data-a="dz-opp" data-v="${n}">${n}</button>`).join('')}</div>
            <span class="lbl">Filtro</span><div class="row gap4 wrap">${Object.entries(FILTER_PRESETS).map(([k, f]) => `<button class="btn sm ${(getSettings().gfxFilter || 'naturale') === k ? 'active' : ''}" data-a="dz-filter" data-v="${k}" data-tip="${esc(f.desc)}">${esc(f.label)}</button>`).join('')}</div>
            <span class="lbl">Vista</span><div><button class="btn sm ${getSettings().dzMarker !== false ? 'active' : ''}" data-a="dz-marker">Freccia sopra la mia auto</button></div>
          </div>
        </div>
      </div>
      ${(() => { const c = champGet(); const nx = champNext(); const nv = nx && VENUES.find((x) => x.id === nx); const me = c ? Object.entries(c.points).sort((a, b) => b[1] - a[1]) : []; const myPts = c ? (Object.entries(c.points).find(([n]) => n === 'Tu')?.[1] || 0) : 0; return `<div class="panel mt24 dz-champ"><div class="row between"><div><div class="hh-eyebrow">${esc(CHAMPIONSHIP.name)} · ${CHAMPIONSHIP.events.length} eventi</div><div class="small" style="color:var(--text2)">${c ? (c.done ? `Campionato concluso · ${myPts} punti · ${me.findIndex(([n]) => n === 'Tu') + 1}° in classifica` : `Round ${c.round + 1}/${CHAMPIONSHIP.events.length} · prossimo: <b>${esc(nv?.name || '')}</b> · ${myPts} punti`) : 'Sei eventi di fila, punti per posizione, demolizioni e giro veloce. Si corre con la stessa auto.'}</div></div><div class="row gap6">${c && !c.done ? `<button class="btn" data-a="dz-champ-reset">Ricomincia</button><button class="btn primary" data-a="dz-champ">${icon('flag')} Corri il round ${c.round + 1}</button>` : `<button class="btn primary" data-a="dz-champ-new">${icon('trophy')} ${c ? 'Nuovo campionato' : 'Inizia il campionato'}</button>`}</div></div></div>`; })()}
      <div class="qr-go mt24"><div class="qg-sum"><b>${esc(v.name)}</b><span>${esc(car.name)} · ${D.opponents} avversari · ${v.kind === 'derby' ? 'demolition derby' : `${v.laps} giri`}</span></div><button class="btn primary xl" style="min-width:320px" data-a="dz-go">${icon('flag')} Si parte!</button></div>
      <div class="tiny mt8" style="color:var(--text2);text-align:center">W/S gas e freno · A/D sterzo · Spazio freno a mano · Shift nitro · C telecamera (4) · Q guarda dietro · R riposiziona · T ricomincia · F filtro · Esc pausa — Gamepad: grilletti, stick, A nitro, B freno a mano, LB guarda dietro, Y riposiziona</div>
      </div>`;
  },
  async mount() {
    if (!D.playing) { try { music.setMood('race'); } catch {} return; }
    const root = document.getElementById('dz-root');
    try { music.setMood?.('race'); music.stop?.(); } catch {}
    const { DerbyGame } = await import('../derby/game.js');
    const v = VENUES.find((x) => x.id === D.venue);
    const g = D.game = new DerbyGame(root, { venue: v, car: D.car, color: D.color, opponents: D.opponents, championship: !!D.champ, onEnd: (r) => {
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
    'dz-go'() { D.champ = false; D.playing = true; sfx.ok(); App.refresh(); },
    'dz-champ-new'() { const P = prog(); if (!P.owned.includes(D.car)) D.car = 'berlina'; champStart(D.car, D.color); App.refresh(); },
    'dz-champ-reset'() { App.confirm('Ricominciare il campionato?', 'I punti raccolti andranno persi.', () => { champReset(); App.refresh(); }); },
    'dz-champ'() { const c = champGet(); const nx = champNext(); if (!c || !nx) return; D.venue = nx; D.car = c.car || D.car; D.color = c.color ?? D.color; D.champ = true; D.playing = true; sfx.ok(); App.refresh(); },
    'dz-resume'() { D.game?.togglePause(); },
    'dz-restart'() { D.game?.destroy(); D.game = null; App.refresh(); },
    'dz-quit'() { D.game?.destroy(); D.game = null; D.playing = false; D.champ = false; App.refresh(); },
  },
});
