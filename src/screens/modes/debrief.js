// Launch of a scenario / daily challenge and the medal screen after it (mode-debrief)
import { App, registerScreen } from '../../app.js';
import { icon } from '../../ui/icons.js';
import { flagSVG, teamBadge } from '../../ui/art.js';
import { esc, pageHead } from '../../ui/dom.js';
import { S } from '../../engine/state.js';
import { CATEGORIES } from '../../data/categories.js';
import { TEAMS } from '../../data/teams.js';
import { getTrack } from '../../engine/world.js';
import { SCENARIOS } from '../../data/modes/scenarios.js';
import { makeEventWorld, launchScreen } from '../../engine/modes/launch.js';
import { MEDAL } from '../../engine/modes/objectives.js';
import { dailyFor, dailyHistory, shareText, fmtDay, streak } from '../../engine/modes/daily.js';
import { tierList, medalSVG, stars, WX_LABEL } from './ui.js';
import { scenarioProgress, totalStars } from './router.js';
import { celebrate } from '../results.js';

export function scenarioById(id) {
  if (id?.startsWith('daily:')) return dailyFor(id.slice(6));
  return SCENARIOS.find((s) => s.id === id) || null;
}
export function isUnlocked(sc, starsHave = totalStars()) { return starsHave >= (sc.unlock || 0); }

export function launchScenario(sc, kind = 'scenario') {
  const modeRun = { kind, id: sc.id, day: sc.day || null, tiers: sc.tiers, setup: sc.setup || {}, nightRally: !!sc.night || !!sc.setup?.night, title: sc.title, cat: sc.cat };
  makeEventWorld({ cat: sc.cat, team: sc.team, track: sc.track, weather: sc.weather, len: 'short', skip: true, grid: sc.setup?.gridPos === 'last' ? 'back' : 'quali', modeRun, diff: sc.diff || 'normal', player: kind === 'daily' ? 'Sfidante del giorno' : 'Sfidante' });
  App.go(launchScreen(sc.cat));
}

// briefing card shown before the start (scenarios and daily)
export function briefing(sc, { kind = 'scenario', extra = '' } = {}) {
  const tr = getTrack(sc.cat, sc.track); const t = TEAMS[sc.cat].find((x) => x.id === sc.team); const C = CATEGORIES[sc.cat];
  const s = sc.setup || {};
  const facts = [
    sc.cat !== 'rally' && s.gridPos != null ? `${icon('flag')} Partenza ${s.gridPos === 'last' ? 'dal fondo' : `P${s.gridPos}`}` : '',
    s.rally?.rallyGap != null ? `${icon('hourglass')} ${s.rally.rallyGap} s dal leader` : '',
    s.rally?.stagesKeep ? `${icon('map')} ${s.rally.stagesKeep === 1 ? 'Ultima prova' : `Ultime ${s.rally.stagesKeep} prove`}` : '',
    s.rally?.spares != null ? `${icon('tyre')} ${s.rally.spares} ruote di scorta` : '',
    s.laps ? `${icon('chequered')} ${s.laps} giri` : '',
    s.myTyre ? `${icon('tyre')} Gomme ${s.myTyre === 'inter' ? 'intermedie' : s.myTyre}` : '',
    s.myWear ? `${icon('tyre')} Gomme usurate al ${Math.round(s.myWear * 100)}%` : '',
    s.myDamage || s.rally?.rallyDamage ? `${icon('wrench')} Vettura danneggiata` : '',
    s.scLap != null ? `${icon('alert')} Safety car in arrivo` : '',
    s.rainFrom != null ? `${icon('rain')} Pioggia dal giro ${s.rainFrom}` : '',
    sc.night || s.night ? `${icon('moon')} Notturna` : '',
    `${icon(sc.weather === 'rain' ? 'rain' : 'cloud')} ${WX_LABEL[sc.weather] || 'Meteo realistico'}`,
  ].filter(Boolean);
  return `<div class="md-brief" style="--cc:${C.color}">
    <div class="tiny upper" style="color:${C.color}">${kind === 'daily' ? `Sfida del giorno · ${esc(fmtDay(sc.day))}` : `Scenario${sc.year ? ' · ' + sc.year : ''}`} · ${esc(C.name)}</div>
    <h2 class="mt8">${esc(sc.title)}</h2>
    <div class="row gap16 mt8 wrap">${flagSVG(tr.nat, 30, 20)}<b>${esc(tr.name)}</b><span class="row gap6">${teamBadge(t, 24)}<span class="small">${esc(t.name)}</span></span></div>
    <p class="md-story">${esc(sc.story)}</p>
    <div class="row wrap gap6">${facts.map((f) => `<span class="chip">${f}</span>`).join('')}</div>
    <div class="lbl mt16 mb8">Obiettivi</div>${tierList(sc.tiers, sc.cat)}
    ${extra}
  </div>`;
}

registerScreen({
  id: 'mode-debrief', full: true,
  render() {
    const st = S(); const m = st?.modeRun;
    if (!m || (m.kind !== 'scenario' && m.kind !== 'daily')) return `<div class="full-screen md-screen">${pageHead({ title: 'Esito', back: 'challenges' })}<div class="empty">${icon('target')}<b>Nessuna sfida in corso</b><button class="btn primary" data-a="nav" data-to="challenges">Vai agli scenari</button></div></div>`;
    const sc = scenarioById(m.id); const o = m.outcome; const C = CATEGORIES[m.cat];
    const daily = m.kind === 'daily';
    const back = daily ? 'mode-daily' : 'challenges';
    if (!o) {
      return `<div class="full-screen md-screen" style="--pc:${C.color}">${pageHead({ eyebrow: daily ? 'Sfida del giorno' : 'Scenario', title: esc(m.title), back })}
        <div class="empty">${icon('flag')}<b>Sfida interrotta</b><span>Sei uscito prima della bandiera a scacchi: il tentativo non è stato registrato.</span>
        <div class="row gap6 mt8"><button class="btn primary lg" data-a="retry">${icon('replay')} Riprova subito</button><button class="btn lg" data-a="nav" data-to="${back}">${icon('left')} Indietro</button></div></div></div>`;
    }
    const won = o.medal >= 0;
    let side = '';
    if (daily) {
      const e = dailyHistory()[m.day];
      side = `<div class="panel"><div class="panel-head"><h3>${icon('calendar')} ${esc(fmtDay(m.day))}</h3><span class="chip">${o.first ? 'Tentativo ufficiale' : 'Tentativo libero'}</span></div>
        <div class="small muted">${o.first ? 'Questo era il tuo tentativo ufficiale: conta per la serie e per la condivisione.' : (e?.official ? 'Il tentativo ufficiale era già registrato: i nuovi tentativi migliorano solo il tuo record personale.' : 'Le sfide dei giorni passati si giocano come tentativo libero: migliorano solo il tuo record personale.')}</div>
        <div class="row gap16 mt16 wrap"><div class="md-mini"><span class="lbl">Ufficiale</span><b>${e?.official ? (e.official.medal >= 0 ? MEDAL[e.official.medal].name : 'Nessuna') : '-'}</b></div><div class="md-mini"><span class="lbl">Migliore</span><b>${e?.best ? (e.best.medal >= 0 ? MEDAL[e.best.medal].name : 'Nessuna') : '-'}</b></div><div class="md-mini"><span class="lbl">Tentativi</span><b>${e?.tries || 0}</b></div><div class="md-mini"><span class="lbl">Serie</span><b>${streak(m.day)}</b></div></div>
        <pre class="md-share mt16">${esc(shareText(m.day, e, sc))}</pre><button class="btn mt8" data-a="share">${icon('upload')} Copia risultato</button></div>`;
    } else {
      const p = scenarioProgress()[m.id];
      const idx = SCENARIOS.findIndex((s) => s.id === m.id);
      const have = totalStars();
      const nextUnlocked = o.starsBefore != null ? SCENARIOS.filter((s) => s.unlock > o.starsBefore && s.unlock <= have) : [];
      side = `<div class="panel"><div class="panel-head"><h3>${icon('star')} Il tuo record</h3>${stars(Math.max(0, (p?.medal ?? -1) + 1))}</div>
        <div class="row gap16 wrap"><div class="md-mini"><span class="lbl">Medaglia migliore</span><b>${p?.medal >= 0 ? MEDAL[p.medal].name : 'Nessuna'}</b></div><div class="md-mini"><span class="lbl">Miglior posizione</span><b>${p?.best < 99 ? 'P' + p.best : '-'}</b></div><div class="md-mini"><span class="lbl">Tentativi</span><b>${p?.tries || 0}</b></div><div class="md-mini"><span class="lbl">Stelle totali</span><b>${have}</b></div></div>
        ${o.improved && won ? `<div class="chip good mt16">${icon('check')} Nuovo record personale</div>` : ''}
        ${nextUnlocked.length ? `<div class="chip info mt8">${icon('lock')} Sbloccato: ${nextUnlocked.map((s) => esc(s.title)).join(', ')}</div>` : ''}
        ${idx >= 0 && SCENARIOS[idx + 1] ? `<div class="small muted mt16">Prossimo: <b>${esc(SCENARIOS[idx + 1].title)}</b>${isUnlocked(SCENARIOS[idx + 1], have) ? '' : ` · servono ${SCENARIOS[idx + 1].unlock} stelle`}</div>` : ''}</div>`;
    }
    const idx = SCENARIOS.findIndex((s) => s.id === m.id);
    const next = !daily && idx >= 0 ? SCENARIOS.slice(idx + 1).find((s) => isUnlocked(s)) : null;
    return `<div class="full-screen md-screen" style="--pc:${C.color}">
      ${pageHead({ eyebrow: daily ? 'Sfida del giorno · Esito' : 'Scenario · Esito', title: esc(m.title), back })}
      <div class="md-debrief anim-in">
        <div class="panel md-medal-panel">
          ${won ? `${medalSVG(MEDAL[o.medal].col)}<h2 style="color:${MEDAL[o.medal].col}">Medaglia ${o.medal === 2 ? 'd’oro' : o.medal === 1 ? 'd’argento' : 'di bronzo'}</h2>` : `<div class="md-fail">${icon('x')}</div><h2>Obiettivo mancato</h2>`}
          <div class="small muted">Miglior arrivo: <b>${o.best >= 99 ? 'ritiro' : 'P' + o.best}</b>${o.gain > -99 ? ` · posizioni guadagnate: <b>${o.gain >= 0 ? '+' : ''}${o.gain}</b>` : ''}</div>
          <div class="mt16">${tierList(m.tiers, m.cat, o.met)}</div>
          <div class="row center gap6 mt24 wrap"><button class="btn primary lg" data-a="retry">${icon('replay')} Riprova</button>
            ${next ? `<button class="btn lg" data-a="next" data-id="${next.id}">${icon('right')} ${esc(next.title)}</button>` : ''}
            <button class="btn lg ghost" data-a="nav" data-to="${back}">${icon('left')} ${daily ? 'Calendario sfide' : 'Tutti gli scenari'}</button></div>
        </div>
        <div class="col gap16">${side}</div>
      </div></div>`;
  },
  mount() { const o = S()?.modeRun?.outcome; if (o?.medal === 2 && !o._cele) { o._cele = true; celebrate(200); } },
  actions: {
    retry() { const m = S().modeRun; const sc = scenarioById(m.id); if (sc) launchScenario(sc, m.kind); },
    next(el) { const sc = scenarioById(el.dataset.id); if (sc) launchScenario(sc, 'scenario'); },
    share() {
      const m = S().modeRun; const txt = shareText(m.day, dailyHistory()[m.day], scenarioById(m.id));
      const ok = () => App.toast('Copiato negli appunti', 'Incolla il risultato dove vuoi.', 'good');
      try { navigator.clipboard.writeText(txt).then(ok, () => fallbackCopy(txt) && ok()); } catch { if (fallbackCopy(txt)) ok(); }
    },
  },
});

export function fallbackCopy(txt) {
  try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const r = document.execCommand('copy'); ta.remove(); return r; } catch { return false; }
}
