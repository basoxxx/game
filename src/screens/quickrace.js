// Quick race: jump straight into a single event with any team and track
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { flagSVG, teamBadge, trackSVG } from '../ui/art.js';
import { esc, pageHead } from '../ui/dom.js';
import { carImg } from '../ui/garage3d.js';
import { CATEGORIES } from '../data/categories.js';
import { TEAMS } from '../data/teams.js';
import { TRACKS } from '../data/tracks.js';
import { createWorld, buildCalendar } from '../engine/world.js';
import { setState } from '../engine/state.js';
import { circuitPath, genStage, STAGE_STYLE } from '../ui/trackview.js';
import { trackStats } from '../engine/trackphys.js';

const Q = { cat: 'formula', track: 'ita', team: 'ferrani', len: 'normal', weather: 'auto', skip: false };

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
    return `<div class="full-screen" style="--pc:${C.color}">
      ${pageHead({ eyebrow: 'Modalità · Evento singolo', title: 'Gara Rapida', right: `<div class="tabs">${Object.values(CATEGORIES).map((c) => `<div class="tab ${Q.cat === c.id ? 'active' : ''}" data-a="cat" data-c="${c.id}">${c.name}</div>`).join('')}</div>` })}
      <div class="qr-grid anim-in">
        <div><div class="row between mb8"><span class="tiny upper muted">${Q.cat === 'rally' ? 'Rally' : 'Circuiti'}</span><span class="small muted">${tracks.length} disponibili</span></div>
          <div class="qr-list">${tracks.map((t) => `<div class="qr-track ${t.id === Q.track ? 'sel' : ''}" data-a="track" data-id="${t.id}">${flagSVG(t.nat, 27, 18)}<div class="grow" style="min-width:0"><b>${esc(t.name)}</b><div class="tiny" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.circuit || `${t.surfaces?.length || 6} prove speciali`)}</div></div>${t.night ? `<span class="tag dark">${icon('moon')} Notte</span>` : ''}</div>`).join('')}</div></div>
        <div class="col" style="gap:20px">
          <section class="qr-hero">
            <div class="qh-info">
              <div class="hh-eyebrow">${esc(C.name)}${tr.night ? ` · <span class="tag dark">${icon('moon')} Notturna</span>` : ''}</div>
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
          <div class="panel"><div class="panel-head"><h3>Opzioni evento</h3></div>
            <div class="qr-opts">
              <span class="lbl">Durata</span><div class="row wrap gap4">${opt('len', 'short', 'Sprint')}${opt('len', 'normal', 'Standard')}${opt('len', 'long', 'Lunga')}${opt('len', 'full', 'Reale')}</div>
              <span class="lbl">Meteo</span><div class="row wrap gap4">${opt('weather', 'auto', 'Realistico')}${opt('weather', 'dry', 'Asciutto')}${opt('weather', 'rain', 'Pioggia')}</div>
              <span class="lbl">Weekend</span><div class="row wrap gap4">${opt('skip', false, 'Completo (prove + qualifica)')}${opt('skip', true, 'Solo gara')}</div>
            </div>
          </div>
          <div class="qr-go"><div class="qg-sum"><b>${esc(team.name)}</b><span>${esc(tr.name)} · ${{ short: 'Sprint', normal: 'Standard', long: 'Lunga', full: 'Reale' }[Q.len]} · ${{ auto: 'Meteo realistico', dry: 'Asciutto', rain: 'Pioggia' }[Q.weather]} · ${Q.skip ? 'Solo gara' : 'Weekend completo'}</span></div><button class="btn primary xl" style="min-width:300px" data-a="go">${icon('flag')} Vai in pista</button>
          </div>
        </div>
      </div></div>`;
  },
  actions: {
    cat(el) { Q.cat = el.dataset.c; App.refresh(); },
    track(el) { Q.track = el.dataset.id; App.refresh(); },
    team(el) { Q.team = el.dataset.id; App.refresh(); },
    opt(el) { const v = el.dataset.v; Q[el.dataset.k] = v === 'true' ? true : v === 'false' ? false : v; App.refresh(); },
    go() {
      const st = createWorld({ playerName: 'Ospite', category: Q.cat, teamId: Q.team, difficulty: 'normal', seasonLength: 'short', raceLength: Q.len });
      st.quick = true; st.slot = null; st.tutorialSeen = true;
      st.forceRain = Q.weather === 'auto' ? undefined : Q.weather === 'rain';
      const all = buildCalendar(Q.cat, 'full');
      const ev = all.find((e) => e.trackId === Q.track) || all[0];
      ev.round = 1; st.calendar = [ev];
      setState(st);
      st.quickSkip = Q.skip;
      App.go(Q.cat === 'rally' ? 'rally' : 'weekend');
    },
  },
});
