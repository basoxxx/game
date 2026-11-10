// Challenge scenarios: single events with a goal and medals
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { flagSVG, teamBadge } from '../ui/art.js';
import { esc, pageHead } from '../ui/dom.js';
import { CATEGORIES } from '../data/categories.js';
import { TEAMS } from '../data/teams.js';
import { createWorld, buildCalendar, getTrack } from '../engine/world.js';
import { setState, S } from '../engine/state.js';
import { SCENARIOS } from '../data/modes/scenarios.js';
import { installRouter, scenarioProgress, totalStars } from './modes/router.js';
import { briefing, launchScenario, isUnlocked } from './modes/debrief.js';
import { explainer, stars } from './modes/ui.js';
import { MEDAL as MD } from '../engine/modes/objectives.js';
import './modes/index.js';

installRouter();
let tab = 'scenari';

export const CHALLENGES = [
  { id: 'monza_slip', cat: 'formula', team: 'williamson', track: 'ita', title: 'Scia a Monza', desc: 'Con la Williamson, sfrutta potenza, scia e Override nel Tempio della Velocità.', goal: 'pos', medals: [6, 9, 12], weather: 'dry' },
  { id: 'monaco_rain', cat: 'formula', team: 'haasen', track: 'mon', title: 'Diluvio a Monte Carlo', desc: 'Una Haasen sotto il diluvio monegasco. Indovina il momento giusto per le gomme.', goal: 'pos', medals: [3, 6, 10], weather: 'rain' },
  { id: 'spa_strategy', cat: 'formula', team: 'ferrani', track: 'bel', title: 'Strategia a Spa', desc: 'Ferrani contro tutti nelle Ardenne, dove il meteo cambia in un giro. Vinci!', goal: 'pos', medals: [1, 2, 4], weather: 'auto' },
  { id: 'cadillon_points', cat: 'formula', team: 'cadillon', track: 'sgp', title: 'Primi punti per Cadillon', desc: 'Il team esordiente cerca i primi punti nella notte di Singapore.', goal: 'pos', medals: [6, 8, 10], weather: 'auto' },
  { id: 'rally_finland', cat: 'rally', team: 'skodar', track: 'fin', title: 'Il Gran Premio di Finlandia', desc: 'Salti e sterrato velocissimo con la Skodar. Rischiare o no?', goal: 'pos', medals: [1, 3, 5], weather: 'dry' },
  { id: 'rally_monte', cat: 'rally', team: 'lancisa', track: 'mc', title: 'Ghiaccio nel Principato', desc: 'Lancisa torna al Monte: neve, asfalto e gomme da indovinare.', goal: 'pos', medals: [2, 4, 7], weather: 'auto' },
  { id: 'lemans_night', cat: 'endurance', team: 'peugot', track: 'lem', title: 'La notte della Sarthe', desc: 'Peugot alla 24 Ore: carburante, traffico GT, notte e cambi pilota.', goal: 'pos', medals: [1, 3, 6], weather: 'auto' },
  { id: 'spa_wec', cat: 'endurance', team: 'astonmarvin', track: 'spa', title: 'Valkyrie a Spa', desc: 'L’Aston Marvin cerca il primo podio nell’endurance.', goal: 'pos', medals: [3, 5, 8], weather: 'rain' },
];
const MEDALS = [['Oro', '#ffcc33'], ['Argento', '#c9d1dc'], ['Bronzo', '#d98c4a']];

function getMedals() { try { return JSON.parse(localStorage.getItem('apexdynasty_medals') || '{}'); } catch { return {}; } }
export function recordChallenge(st, results) {
  const ch = CHALLENGES.find((c) => c.id === st.challenge); if (!ch) return null;
  const mine = results.classification.filter((r) => r.teamId === st.playerTeam && r.status !== 'dnf').map((r) => r.pos);
  const best = mine.length ? Math.min(...mine) : 99;
  const m = ch.medals.findIndex((p) => best <= p);
  const medals = getMedals();
  if (m >= 0 && (medals[ch.id] == null || m < medals[ch.id])) { medals[ch.id] = m; try { localStorage.setItem('apexdynasty_medals', JSON.stringify(medals)); } catch {} }
  return { best, medal: m };
}

registerScreen({
  id: 'challenges', full: true,
  render() {
    const medals = getMedals();
    const got = Object.keys(medals).length;
    const prog = scenarioProgress(); const have = totalStars(); const max = SCENARIOS.length * 3;
    const tabs = `<div class="tabs"><div class="tab ${tab === 'scenari' ? 'active' : ''}" data-a="tab" data-t="scenari">Scenari storici</div><div class="tab ${tab === 'classiche' ? 'active' : ''}" data-a="tab" data-t="classiche">Sfide classiche</div></div>`;
    const kpi = tab === 'scenari'
      ? `<div class="kpi" style="text-align:right"><b>${have}<span style="font-size:20px;color:var(--muted);letter-spacing:0">/${max}</span></b><span>Stelle · ${Object.values(prog).filter((p) => p.medal === 2).length} ori</span></div>`
      : `<div class="kpi" style="text-align:right"><b>${got}<span style="font-size:20px;color:var(--muted);letter-spacing:0">/${CHALLENGES.length}</span></b><span>Completate · ${Object.values(medals).filter((m) => m === 0).length} ori</span></div>`;
    return `<div class="full-screen md-screen">
      ${pageHead({ eyebrow: 'Modalità · Scenari', title: 'Sfide', right: `<div class="row" style="gap:28px">${tabs}${kpi}</div>` })}
      ${tab === 'scenari' ? `${explainer('Come funzionano gli scenari', [
        'Ogni scenario è una situazione d’invenzione con una breve storia e condizioni di partenza particolari: posizione in griglia, gomme, danni, meteo, safety car.',
        'Tre obiettivi: <b>bronzo</b>, <b>argento</b> e <b>oro</b>, che valgono 1, 2 e 3 stelle. Conta il miglior risultato di sempre.',
        'Le stelle sbloccano gli scenari successivi. Puoi riprovare subito quante volte vuoi.',
      ], have === 0)}
      <div class="grid4 anim-in mt16">${SCENARIOS.map((c) => {
        const t = TEAMS[c.cat].find((x) => x.id === c.team); const tr = getTrack(c.cat, c.track); const p = prog[c.id]; const open = isUnlocked(c, have);
        return `<div class="ch-card md-sc ${open ? '' : 'locked'}" data-a="sc" data-id="${c.id}" style="--cc:${CATEGORIES[c.cat].color}" aria-label="${esc(c.title)}${open ? '' : ' (bloccato)'}">
          <div class="row between"><span class="tiny upper" style="color:${CATEGORIES[c.cat].color}">${CATEGORIES[c.cat].name} · ${c.year}</span>${open ? stars(Math.max(0, (p?.medal ?? -1) + 1)) : `<span class="chip tiny">${icon('lock')} ${c.unlock} ★</span>`}</div>
          <div class="ch-t">${esc(c.title)}</div>
          <div class="row mt8">${flagSVG(tr.nat)}<span class="small">${esc(tr.name)}</span></div>
          <div class="row mt8">${teamBadge(t, 22)}<span class="small muted">${esc(t.name)}</span></div>
          <div class="small muted mt8 grow md-sc-story">${open ? esc(c.story) : `Servono ${c.unlock} stelle per sbloccare questo scenario (ne hai ${have}).`}</div>
          <div class="row mt16" style="gap:14px">${c.tiers.map((o, i) => `<span class="medal" style="--mc:${MD[i].col}">${p?.medal >= i ? '✓ ' : ''}${MD[i].name}</span>`).join('')}</div>
        </div>`;
      }).join('')}</div>` : `
      <div class="grid4 anim-in">${CHALLENGES.map((c) => {
        const t = TEAMS[c.cat].find((x) => x.id === c.team); const tr = getTrack(c.cat, c.track); const m = medals[c.id];
        return `<div class="ch-card" data-a="go" data-id="${c.id}" style="--cc:${CATEGORIES[c.cat].color}">
          <div class="row between"><span class="tiny upper" style="color:${CATEGORIES[c.cat].color}">${CATEGORIES[c.cat].name}</span>${m != null ? `<span class="tag" style="background:${MEDALS[m][1]}">${icon('medal')} ${MEDALS[m][0]}</span>` : ''}</div>
          <div class="ch-t">${esc(c.title)}</div>
          <div class="row mt8">${flagSVG(tr.nat)}<span class="small">${esc(tr.name)}</span></div>
          <div class="row mt8">${teamBadge(t, 22)}<span class="small muted">${esc(t.name)}</span></div>
          <div class="small muted mt8 grow">${esc(c.desc)}</div>
          <div class="row mt16" style="gap:14px">${c.medals.map((p, i) => `<span class="medal" style="--mc:${MEDALS[i][1]}">P${p}</span>`).join('')}</div>
        </div>`;
      }).join('')}</div>`}</div>`;
  },
  actions: {
    tab(el) { tab = el.dataset.t; App.refresh(); },
    sc(el) {
      const sc = SCENARIOS.find((s) => s.id === el.dataset.id); if (!sc) return;
      if (!isUnlocked(sc)) { App.toast('Scenario bloccato', `Servono ${sc.unlock} stelle: ne hai ${totalStars()}.`, 'bad'); return; }
      const p = scenarioProgress()[sc.id];
      App.modal(briefing(sc, { extra: p ? `<div class="small muted mt16">Record: ${p.medal >= 0 ? MD[p.medal].name : 'nessuna medaglia'} · ${p.tries} tentativi</div>` : '' }) + `<div class="row mt24" style="justify-content:flex-end;gap:8px"><button class="btn ghost" data-a="close-modal">Annulla</button><button class="btn primary lg" data-a="start">${icon('flag')} Inizia</button></div>`,
        { start() { App.closeModal(); launchScenario(sc, 'scenario'); } }, 'wide');
    },
    go(el) {
      const ch = CHALLENGES.find((c) => c.id === el.dataset.id);
      const st = createWorld({ playerName: 'Sfidante', category: ch.cat, teamId: ch.team, difficulty: 'normal', seasonLength: 'short', raceLength: ch.cat === 'endurance' ? 'short' : 'normal' });
      st.quick = true; st.challenge = ch.id; st.slot = null; st.tutorialSeen = true;
      st.forceRain = ch.weather === 'auto' ? undefined : ch.weather === 'rain';
      const ev = buildCalendar(ch.cat, 'full').find((e) => e.trackId === ch.track);
      ev.round = 1; st.calendar = [ev];
      setState(st);
      App.modal(`<div class="tiny upper" style="color:var(--team)">Sfida</div><h2 class="mt8">${esc(ch.title)}</h2><p>${esc(ch.desc)}</p><div class="row" style="gap:18px">${ch.medals.map((p, i) => `<span class="medal" style="--mc:${MEDALS[i][1]}">${MEDALS[i][0]} · P${p} o meglio</span>`).join('')}</div><div class="row mt24" style="justify-content:flex-end"><button class="btn primary lg" data-a="start">${icon('flag')} Inizia</button></div>`, { start() { App.closeModal(); App.go(ch.cat === 'rally' ? 'rally' : 'weekend'); } });
    },
  },
});
