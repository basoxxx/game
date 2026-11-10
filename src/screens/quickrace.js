// Quick race ("Weekend singolo"): jump straight into a single event with any team and track.
// Presets, last-used settings (own localStorage key) and a one-click rematch.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { flagSVG, teamBadge, trackSVG } from '../ui/art.js';
import { esc, pageHead } from '../ui/dom.js';
import { carImg } from '../ui/garage3d.js';
import { CATEGORIES } from '../data/categories.js';
import { TEAMS } from '../data/teams.js';
import { TRACKS } from '../data/tracks.js';
import { createWorld, buildCalendar } from '../engine/world.js';
import { setState, S } from '../engine/state.js';
import { circuitPath, genStage, STAGE_STYLE } from '../ui/trackview.js';
import { trackStats } from '../engine/trackphys.js';
import './modes/index.js';
import { load, store } from '../engine/modes/objectives.js';

const QR_KEY = 'apexdynasty_mode_quick';
const DEF = { cat: 'formula', track: 'ita', team: 'ferrani', len: 'normal', weather: 'auto', skip: false, grid: 'quali', diff: 'normal', night: false, preset: null };
const Q = { ...DEF, ...(load(QR_KEY, {})?.last || {}) };
const GRID_N = { quali: 'Da qualifica', reverse: 'Griglia invertita', back: 'Rimonta dal fondo', random: 'Sorteggio' };
const DIFF_N = { easy: 'Rivali morbidi', normal: 'Normale', hard: 'Leggenda' };
const WX_N = { auto: 'Meteo realistico', dry: 'Asciutto', mixed: 'Variabile', rain: 'Pioggia' };
const LEN_N = { short: 'Sprint', normal: 'Standard', long: 'Lunga', full: 'Reale' };
export const QR_PRESETS = [
  { id: 'gp', name: 'Gran Premio classico', icon: 'flag', desc: 'Prove, qualifiche e gara a Monza', set: { cat: 'formula', track: 'ita', len: 'normal', weather: 'auto', skip: false, grid: 'quali', night: false } },
  { id: 'sprint', name: 'Sprint', icon: 'bolt', desc: 'Gara corta e tirata, subito in griglia', set: { cat: 'formula', track: 'aut', len: 'short', weather: 'dry', skip: true, grid: 'quali', night: false } },
  { id: 'six', name: '6 Ore', icon: 'hourglass', desc: 'Endurance a Spa: soste, cambi pilota, traffico GT', set: { cat: 'endurance', track: 'spa', len: 'normal', weather: 'auto', skip: true, grid: 'quali', night: false } },
  { id: 'night', name: 'Rally in notturna', icon: 'moon', desc: 'Prove speciali al buio nel Principato', set: { cat: 'rally', track: 'mc', len: 'normal', weather: 'auto', skip: true, grid: 'quali', night: true } },
  { id: 'wet', name: 'Gara bagnata', icon: 'rain', desc: 'Pioggia dal via a Silverstone', set: { cat: 'formula', track: 'gbr', len: 'short', weather: 'rain', skip: true, grid: 'quali', night: false } },
  { id: 'reverse', name: 'Griglia invertita', icon: 'swap', desc: 'Formula Apex 2 a Monza, i più veloci dietro', set: { cat: 'junior', track: 'ita', len: 'short', weather: 'dry', skip: true, grid: 'reverse', night: false } },
];
function saveQ(patch) { const d = load(QR_KEY, {}) || {}; Object.assign(d, patch); store(QR_KEY, d); }

registerScreen({
  id: 'quickrace', full: true,
  render() {
    const tracks = TRACKS[Q.cat];
    if (!tracks.find((t) => t.id === Q.track)) Q.track = tracks[0].id;
    if (!TEAMS[Q.cat].find((t) => t.id === Q.team)) Q.team = TEAMS[Q.cat][0].id;
    const tr = tracks.find((t) => t.id === Q.track);
    const path = Q.cat === 'rally' ? genStage(tr.seed, STAGE_STYLE[tr.id]) : circuitPath(tr.cid);
    const stats = Q.cat !== 'rally' ? trackStats(Q.cat, tr) : null;
    const C = CATEGORIES[Q.cat];
    const opt = (k, v, label) => `<button class="btn sm ${Q[k] === v ? 'active' : ''}" data-a="opt" data-k="${k}" data-v="${v}">${label}</button>`;
    const fact = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
    const team = TEAMS[Q.cat].find((t) => t.id === Q.team);
    const rematch = (load(QR_KEY, {}) || {}).lastRun || null;
    const st0 = S();
    const justDone = st0?.quick && st0.quickDone && !st0.challenge && (!st0.modeRun || st0.modeRun.kind === 'quick') ? (TRACKS[st0.category]?.find((t) => t.id === st0.calendar?.[0]?.trackId)?.name || '') : '';
    const preset = QR_PRESETS.find((p) => p.id === Q.preset);
    return `<div class="full-screen md-screen" style="--pc:${C.color}">
      ${pageHead({ eyebrow: 'Modalità · Weekend singolo', title: 'Gara Rapida', right: `<div class="row" style="gap:16px">${rematch && !justDone ? `<button class="btn lg" data-a="rematch" data-tip="Stesse impostazioni dell’ultima gara">${icon('replay')} Rivincita</button>` : ''}<div class="tabs">${Object.values(CATEGORIES).map((c) => `<div class="tab ${Q.cat === c.id ? 'active' : ''}" data-a="cat" data-c="${c.id}">${c.name}</div>`).join('')}</div></div>` })}
      ${justDone && rematch ? `<div class="md-rematch anim-in">${icon('chequered')}<div class="grow"><b>Gara conclusa · ${esc(justDone)}</b><span class="small muted">Vuoi rigiocarla subito con le stesse impostazioni?</span></div><button class="btn primary lg" data-a="rematch">${icon('replay')} Rivincita</button></div>` : ''}
      <div class="lbl mb8">Preset</div>
      <div class="md-presets anim-in" role="group" aria-label="Preset">${QR_PRESETS.map((p) => `<button class="md-preset ${Q.preset === p.id ? 'active' : ''}" data-a="preset" data-id="${p.id}" style="--cc:${CATEGORIES[p.set.cat].color}">${icon(p.icon)}<b>${esc(p.name)}</b><span>${esc(p.desc)}</span></button>`).join('')}</div>
      <div class="qr-grid anim-in">
        <div><div class="row between mb8"><span class="tiny upper muted">${Q.cat === 'rally' ? 'Rally' : 'Circuiti'}</span><span class="small muted">${tracks.length} disponibili</span></div>
          <div class="qr-list">${tracks.map((t) => `<div class="qr-track ${t.id === Q.track ? 'sel' : ''}" data-a="track" data-id="${t.id}">${flagSVG(t.nat, 27, 18)}<div class="grow" style="min-width:0"><b>${esc(t.name)}</b><div class="tiny" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.circuit || `${t.surfaces?.length || 6} prove speciali`)}</div></div>${t.night ? `<span class="tag dark">${icon('moon')} Notte</span>` : ''}</div>`).join('')}</div></div>
        <div class="col" style="gap:20px">
          <section class="qr-hero">
            <div class="qh-info">
              <div class="hh-eyebrow">${esc(C.name)}${tr.night || (Q.cat === 'rally' && Q.night) ? ` · <span class="tag dark">${icon('moon')} Notturna</span>` : ''}</div>
              <div class="qh-name">${flagSVG(tr.nat, 44, 29)}<span>${esc(tr.name)}</span></div>
              <div class="hh-circ">${esc(tr.circuit || 'Rally')}</div>
              <div class="hh-facts">${stats ? fact(`${(stats.len / 1000).toFixed(3)}<small>km</small>`, 'Lunghezza') + fact(stats.corners, 'Curve') + fact(`${Math.round(stats.vmax)}<small>km/h</small>`, 'Velocità max') : fact(tr.surfaces?.length || 6, 'Prove speciali')}</div>
            </div>
            <div class="qh-map">${trackSVG(path, { w: 520, h: 300, glow: null, color: '#fff', width: 5, under: 'rgba(0,0,0,.4)' })}</div>
            <div class="qh-car">${carImg(Q.cat, { primary: team.colors[0], secondary: team.colors[1], accent: team.colors[2], pattern: 1 }, { number: '', sponsor: team.short }, 760, 330)}</div>
          </section>
          <div class="panel"><div class="panel-head"><h3>Squadra</h3><span class="row" style="gap:10px">${teamBadge(team, 26)}<b style="font-family:var(--display);font-size:18px;text-transform:uppercase">${esc(team.name)}</b></span></div>
            <div class="team-pick">${TEAMS[Q.cat].map((t) => `<button class="btn sm ${Q.team === t.id ? 'active' : ''}" data-a="team" data-id="${t.id}">${teamBadge(t, 24)} ${esc(t.name)}</button>`).join('')}</div>
          </div>
          <div class="grid2 md-optgrid">
            <div class="panel"><div class="panel-head"><h3>Formato</h3>${preset ? `<span class="chip">${icon('star')} ${esc(preset.name)}</span>` : '<span class="small muted">Personalizzato</span>'}</div>
              <div class="qr-opts">
                <span class="lbl">Durata</span><div class="row wrap gap4">${Object.entries(LEN_N).map(([k, n]) => opt('len', k, n)).join('')}</div>
                <span class="lbl">Weekend</span><div class="row wrap gap4">${opt('skip', false, Q.cat === 'rally' ? 'Con shakedown' : 'Prove + qualifica')}${opt('skip', true, Q.cat === 'rally' ? 'Solo prove speciali' : 'Solo gara')}</div>
              </div></div>
            <div class="panel"><div class="panel-head"><h3>Condizioni e rivali</h3></div>
              <div class="qr-opts">
                <span class="lbl">Meteo</span><div class="row wrap gap4">${opt('weather', 'auto', 'Realistico')}${opt('weather', 'dry', 'Asciutto')}${opt('weather', 'mixed', 'Variabile')}${opt('weather', 'rain', 'Pioggia')}</div>
                ${Q.cat === 'rally' ? `<span class="lbl">Notte</span><div class="row wrap gap4">${opt('night', false, 'Da programma')}${opt('night', true, 'Seconda metà al buio')}</div>` : `<span class="lbl">Griglia</span><div class="row wrap gap4">${Object.entries(GRID_N).map(([k, n]) => opt('grid', k, n)).join('')}</div>`}
                <span class="lbl">Avversari</span><div class="row wrap gap4">${Object.entries(DIFF_N).map(([k, n]) => opt('diff', k, n)).join('')}</div>
              </div></div>
          </div>
          <div class="qr-go"><div class="qg-sum"><b>${esc(team.name)}</b><span>${esc(tr.name)} · ${LEN_N[Q.len]} · ${WX_N[Q.weather]} · ${Q.skip ? 'Solo gara' : 'Weekend completo'}${Q.cat !== 'rally' && Q.grid !== 'quali' ? ' · ' + GRID_N[Q.grid] : ''}${Q.cat === 'rally' && Q.night ? ' · Notturna' : ''}${Q.diff !== 'normal' ? ' · ' + DIFF_N[Q.diff] : ''}</span></div><button class="btn primary xl" style="min-width:300px" data-a="go">${icon('flag')} Vai in pista</button>
          </div>
        </div>
      </div></div>`;
  },
  actions: {
    cat(el) { Q.cat = el.dataset.c; Q.preset = null; App.refresh(); },
    track(el) { Q.track = el.dataset.id; Q.preset = null; App.refresh(); },
    team(el) { Q.team = el.dataset.id; App.refresh(); },
    opt(el) { const v = el.dataset.v; Q[el.dataset.k] = v === 'true' ? true : v === 'false' ? false : v; Q.preset = null; App.refresh(); },
    preset(el) {
      const p = QR_PRESETS.find((x) => x.id === el.dataset.id); if (!p) return;
      Object.assign(Q, p.set, { preset: p.id });
      if (!TEAMS[Q.cat].find((t) => t.id === Q.team)) Q.team = TEAMS[Q.cat][Math.min(3, TEAMS[Q.cat].length - 1)].id;
      App.refresh();
    },
    rematch() { const r = (load(QR_KEY, {}) || {}).lastRun; if (!r) return; Object.assign(Q, r); startQuick(); },
    go() { startQuick(); },
  },
});

function startQuick() {
  saveQ({ last: { ...Q }, lastRun: { ...Q } });
  const st = createWorld({ playerName: 'Ospite', category: Q.cat, teamId: Q.team, difficulty: Q.diff, seasonLength: 'short', raceLength: Q.len });
  st.quick = true; st.slot = null; st.tutorialSeen = true;
  st.forceRain = Q.weather === 'auto' ? undefined : Q.weather === 'mixed' ? 'mixed' : Q.weather === 'rain';
  st.quickGrid = Q.cat === 'rally' ? 'quali' : Q.grid;
  const all = buildCalendar(Q.cat, 'full');
  const ev = all.find((e) => e.trackId === Q.track) || all[0];
  ev.round = 1; st.calendar = [ev];
  setState(st);
  st.quickSkip = Q.skip;
  if (Q.cat === 'rally' && Q.night) st.modeRun = { kind: 'quick', nightRally: true };
  App.go(Q.cat === 'rally' ? 'rally' : 'weekend');
}
