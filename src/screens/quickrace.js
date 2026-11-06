// Quick race: jump straight into a single event with any team and track
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { flagSVG, teamBadge, trackSVG } from '../ui/art.js';
import { esc } from '../ui/dom.js';
import { CATEGORIES } from '../data/categories.js';
import { TEAMS } from '../data/teams.js';
import { TRACKS } from '../data/tracks.js';
import { createWorld, buildCalendar } from '../engine/world.js';
import { setState } from '../engine/state.js';
import { circuitPath, genStage } from '../ui/trackview.js';
import { trackStats } from '../engine/trackphys.js';

const Q = { cat: 'formula', track: 'ita', team: 'ferrani', len: 'normal', weather: 'auto', skip: false };

registerScreen({
  id: 'quickrace', full: true,
  render() {
    const tracks = TRACKS[Q.cat];
    if (!tracks.find((t) => t.id === Q.track)) Q.track = tracks[0].id;
    if (!TEAMS[Q.cat].find((t) => t.id === Q.team)) Q.team = TEAMS[Q.cat][0].id;
    const tr = tracks.find((t) => t.id === Q.track);
    const path = Q.cat === 'rally' ? genStage(tr.seed) : circuitPath(tr.cid);
    const stats = Q.cat !== 'rally' ? trackStats(Q.cat, tr) : null;
    const opt = (k, v, label) => `<button class="btn sm ${Q[k] === v ? 'active' : ''}" data-a="opt" data-k="${k}" data-v="${v}">${label}</button>`;
    return `<div style="position:fixed;inset:0;overflow-y:auto;padding:34px 50px">
      <div class="row between mb16"><div class="row" style="gap:16px"><button class="btn ghost icon-btn" data-a="nav" data-to="menu">${icon('left')}</button><div><div class="tiny upper muted" style="letter-spacing:.3em">Modalità</div><h1 style="font-size:36px">Gara Rapida</h1></div></div>
        <div class="tabs">${Object.values(CATEGORIES).map((c) => `<div class="tab ${Q.cat === c.id ? 'active' : ''}" data-a="cat" data-c="${c.id}">${c.name}</div>`).join('')}</div></div>
      <div style="display:grid;grid-template-columns:1fr 1.1fr;gap:20px" class="anim-in">
        <div class="panel" style="max-height:72vh;overflow-y:auto"><div class="panel-head"><h3>${Q.cat === 'rally' ? 'Rally' : 'Circuito'}</h3><span class="small muted">${tracks.length} disponibili</span></div>
          <div class="col gap4">${tracks.map((t) => `<div class="card click row ${t.id === Q.track ? 'sel' : ''}" data-a="track" data-id="${t.id}" style="padding:10px 12px">${flagSVG(t.nat, 26, 17)}<div class="grow"><b>${esc(t.name)}</b><div class="tiny muted">${esc(t.circuit || `${t.surfaces?.length || 6} prove speciali`)}</div></div>${t.night ? '<span class="chip tiny">Notte</span>' : ''}</div>`).join('')}</div></div>
        <div class="col gap16">
          <div class="panel"><div class="row between"><div><h2>${esc(tr.name)}</h2><div class="small muted">${esc(tr.circuit || '')}${stats ? ` · ${(stats.len / 1000).toFixed(3)} km · ${stats.corners} curve · V.max ${Math.round(stats.vmax)} km/h` : ''}</div></div>${flagSVG(tr.nat, 40, 26)}</div>
            <div style="display:flex;justify-content:center" class="mt16">${trackSVG(path, { w: 520, h: 260, glow: CATEGORIES[Q.cat].color })}</div></div>
          <div class="panel"><div class="panel-head"><h3>Squadra</h3></div><div class="row wrap gap6">${TEAMS[Q.cat].map((t) => `<button class="btn sm ${Q.team === t.id ? 'active' : ''}" data-a="team" data-id="${t.id}">${teamBadge(t, 20)} ${esc(t.name)}</button>`).join('')}</div>
            <div class="panel-head mt16"><h3>Opzioni</h3></div>
            <div class="row wrap gap6"><span class="small muted" style="width:90px">Durata</span>${opt('len', 'short', 'Sprint')}${opt('len', 'normal', 'Standard')}${opt('len', 'long', 'Lunga')}${opt('len', 'full', 'Reale')}</div>
            <div class="row wrap gap6 mt8"><span class="small muted" style="width:90px">Meteo</span>${opt('weather', 'auto', 'Realistico')}${opt('weather', 'dry', 'Asciutto')}${opt('weather', 'rain', 'Pioggia')}</div>
            <div class="row wrap gap6 mt8"><span class="small muted" style="width:90px">Weekend</span>${opt('skip', false, 'Completo (prove + qualifica)')}${opt('skip', true, 'Solo gara')}</div>
            <button class="btn primary xl mt24 pulse" style="width:100%" data-a="go">${icon('flag')} Vai in pista</button></div>
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
