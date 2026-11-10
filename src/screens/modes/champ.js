// "Campionato personalizzato" (mode-champ, mode-champ-new) and "Team Principal a tempo" (mode-tp)
import { App, registerScreen, teamColor } from '../../app.js';
import { icon } from '../../ui/icons.js';
import { flagSVG, teamBadge } from '../../ui/art.js';
import { esc, pageHead } from '../../ui/dom.js';
import { S, setState } from '../../engine/state.js';
import { CATEGORIES, DIFFICULTY } from '../../data/categories.js';
import { TEAMS } from '../../data/teams.js';
import { TRACKS } from '../../data/tracks.js';
import { getTrack } from '../../engine/world.js';
import { driverChip, teamStripe } from '../common.js';
import { celebrate } from '../results.js';
import {
  POINT_SYSTEMS, REALISM, WEATHER, REVERSE, SPRINT, TP_TOKENS, TP_UPGRADES, defaultCfg, sprintAllowed, createChampionship,
  loadChamp, deleteChamp, saveChamp, prepareRound, roundSummary, champTable, buyUpgrade, teamOverall,
} from '../../engine/modes/champ.js';
import { launchScreen } from '../../engine/modes/launch.js';
import { explainer, medalTag, medalSVG, stars, WX_LABEL } from './ui.js';
import { MEDAL } from '../../engine/modes/objectives.js';

const LEN_N = { short: 'Sprint (25%)', normal: 'Standard (40%)', long: 'Lunga (66%)' };
let D = null; // draft config of the setup screen
let tpCat = 'formula', tpTeam = null;

function current(kind) {
  const st = S();
  if (st?.modeRun?.kind === kind && st.quick) return st;
  return null;
}
function trackOf(cat, id) { return getTrack(cat, id) || { name: id, nat: 'ITA' }; }

// ------------------------------------------------------------------ hub (both kinds)
function hub(kind) {
  const st = current(kind);
  const saved = !st ? loadChamp(kind) : null;
  const isTP = kind === 'tp';
  const title = isTP ? 'Team Principal a tempo' : 'Campionato personalizzato';
  const eyebrow = `Modalità · ${isTP ? 'Mini-stagione' : 'Campionato su misura'}`;
  if (!st) {
    const sv = saved ? summaryOfSaved(saved) : '';
    return `<div class="full-screen md-screen">
      ${pageHead({ eyebrow, title })}
      ${isTP ? explainer('Come funziona', [
        'Scegli una categoria e una squadra: affronterai una <b>mini-stagione di 3 gare</b>.',
        `Hai <b>${TP_TOKENS} gettoni sviluppo</b> per tutta la stagione: spendili tra una gara e l’altra su motore, aerodinamica, meccanica, affidabilità o piloti.`,
        'Niente finanze né mercato: solo scelte tecniche e muretto box.',
        'Alla fine conta la classifica costruttori rispetto alla forza iniziale della squadra: oro, argento o bronzo.',
      ]) : explainer('Come funziona', [
        'Costruisci il tuo campionato: categoria, da 3 a 24 gare nell’ordine che preferisci, sistema di punteggio, sprint, meteo e realismo.',
        'Scegli la squadra da guidare (e se vuoi il pilota di punta), quante squadre in griglia e se correre con <b>auto tutte uguali</b> (monomarca).',
        'Poi gioca weekend dopo weekend: classifiche piloti e costruttori, riepilogo tra una gara e l’altra e premiazione finale.',
        'Niente finanze né sviluppo: è pura gestione di gara. Il campionato è salvato a parte e non tocca le carriere.',
      ])}
      ${sv || `<div class="empty mt16">${icon(isTP ? 'hourglass' : 'trophy')}<b>${isTP ? 'Nessuna mini-stagione in corso' : 'Nessun campionato in corso'}</b><span>${isTP ? 'Scegli categoria e squadra qui sotto e parti.' : 'Crea il tuo primo campionato su misura.'}</span>${isTP ? '' : `<button class="btn primary lg mt8" data-a="new">${icon('plus')} Crea campionato</button>`}</div>`}
      ${isTP ? tpStart() : ''}
    </div>`;
  }
  const m = st.modeRun; const cfg = m.cfg;
  const done = st.round >= st.calendar.length;
  const C = CATEGORIES[st.category];
  const pt = st.teams[st.playerTeam];
  return `<div class="full-screen md-screen" style="--pc:${C.color}">
    ${pageHead({ eyebrow: `${eyebrow} · ${esc(C.name)}`, title: esc(cfg.name || title), backAction: 'leave',
      right: `<div class="row gap6"><button class="btn ghost" data-a="rules">${icon('rules')} Regole</button><button class="btn ghost" data-a="abandon">${icon('trash')} ${done ? 'Archivia' : 'Abbandona'}</button></div>` })}
    ${done ? ceremony(st) : `<div class="md-hub anim-in">
      <div class="col gap16">
        ${nextRound(st)}
        ${isTP ? tpShop(st) : ''}
        ${st.round > 0 ? lastRound(st) : ''}
        ${calendarPanel(st)}
      </div>
      <div class="col gap16">${standingsPanels(st, pt)}</div>
    </div>`}
  </div>`;
}

function summaryOfSaved(sv) {
  const C = CATEGORIES[sv.category]; const t = sv.teams[sv.playerTeam];
  const done = sv.round >= sv.calendar.length;
  return `<div class="panel md-saved" style="--cc:${C.color}"><div class="row" style="gap:18px">${teamBadge(t, 54)}
    <div class="grow"><div class="tiny upper" style="color:${C.color}">${esc(C.name)} · ${done ? 'Concluso' : `Round ${sv.round + 1}/${sv.calendar.length}`}</div>
    <div class="md-saved-t">${esc(sv.modeRun.cfg.name || (sv.modeRun.kind === 'tp' ? 'Mini-stagione' : 'Campionato personalizzato'))}</div>
    <div class="small muted">${esc(t.name)} · ${sv.calendar.length} gare · ${POINT_SYSTEMS[sv.modeRun.cfg.points]?.name || ''}</div></div>
    <button class="btn primary lg" data-a="resume">${icon('play')} ${done ? 'Vedi premiazione' : 'Continua'}</button>
    ${sv.modeRun.kind === 'tp' ? '' : `<button class="btn" data-a="new">${icon('plus')} Nuovo</button>`}
    <button class="btn ghost icon-btn" data-a="del-saved" aria-label="Elimina" data-tip="Elimina">${icon('trash')}</button></div></div>`;
}

function nextRound(st) {
  const ev = st.calendar[st.round]; const tr = trackOf(st.category, ev.trackId);
  const cfg = st.modeRun.cfg;
  const wx = ev.weatherRule || cfg.weather;
  const inWk = st.weekend && st.weekend.trackId === ev.trackId;
  return `<section class="md-next" style="--cc:${CATEGORIES[st.category].color}">
    <div class="hh-eyebrow">Prossimo appuntamento · Round ${st.round + 1}/${st.calendar.length}</div>
    <div class="qh-name md-next-name">${flagSVG(tr.nat, 44, 29)}<span>${esc(tr.name)}</span></div>
    <div class="hh-circ">${esc(tr.circuit || 'Rally')}</div>
    <div class="row wrap gap6 mt16">
      <span class="chip">${icon(wx === 'rain' ? 'rain' : wx === 'dry' ? 'sun' : 'cloud')} ${WX_LABEL[wx] || 'Meteo'}</span>
      ${ev.sprint ? `<span class="chip warn">${icon('bolt')} Weekend sprint</span>` : ''}
      ${ev.reverse ? `<span class="chip info">${icon('swap')} Griglia invertita</span>` : ''}
      <span class="chip">${cfg.format === 'race' ? 'Solo gara' : 'Weekend completo'}</span>
      ${tr.night ? `<span class="chip">${icon('moon')} Notturna</span>` : ''}
    </div>
    <div class="row mt16 gap6"><button class="btn primary xl" data-a="race">${icon('flag')} ${inWk ? 'Riprendi il weekend' : 'Vai al weekend'}</button></div>
  </section>`;
}

function lastRound(st) {
  const s = roundSummary(st, st.round - 1); if (!s) return '';
  const tr = trackOf(st.category, s.ev.trackId);
  const wd = st.drivers[s.win.driverIds[0]];
  return `<div class="panel"><div class="panel-head"><h3>${icon('chequered')} Com’è andata: ${esc(tr.name)}</h3><span class="chip ${s.pts ? 'good' : ''}">+${s.pts} punti</span></div>
    <div class="row gap16 wrap"><div class="md-mini"><span class="lbl">Vincitore</span><b>${esc(wd?.name || '')}</b><span class="small muted">${esc(st.teams[s.win.teamId]?.name || '')}</span></div>
    ${s.mine.map((r) => `<div class="md-mini"><span class="lbl">${esc(st.drivers[r.driverIds[0]]?.name || '')}</span><b>${r.status === 'dnf' ? 'Ritiro' : 'P' + r.pos}</b><span class="small muted">${r.status === 'dnf' ? esc(r.reason || '') : `partito ${r.grid || '-'}° · ${r.pts || 0} pt`}${r.fl ? ' · giro veloce' : ''}</span></div>`).join('')}
    <button class="btn sm ghost" data-a="view-res" data-i="${st.round - 1}">${icon('chart')} Classifica completa</button></div></div>`;
}

function calendarPanel(st) {
  return `<div class="panel"><div class="panel-head"><h3>${icon('calendar')} Calendario</h3><span class="small muted">${st.calendar.filter((e) => e.results).length}/${st.calendar.length} disputate</span></div>
    <div class="md-cal">${st.calendar.map((ev, i) => {
      const tr = trackOf(st.category, ev.trackId);
      const w = ev.results?.classification[0]; const mine = ev.results?.classification.filter((r) => r.teamId === st.playerTeam && r.status !== 'dnf').map((r) => r.pos);
      return `<div class="md-cal-row ${i === st.round ? 'cur' : ''} ${ev.results ? 'done' : ''}" ${ev.results ? `data-a="view-res" data-i="${i}"` : ''}>
        <span class="mono muted">${String(i + 1).padStart(2, '0')}</span>${flagSVG(tr.nat, 24, 16)}<b class="grow">${esc(tr.name)}</b>
        ${ev.sprint ? '<span class="chip tiny warn">S</span>' : ''}${ev.reverse ? '<span class="chip tiny info">INV</span>' : ''}
        <span class="small muted">${w ? esc(st.drivers[w.driverIds[0]]?.name.split(' ').slice(-1)[0] || '') : i === st.round ? 'Prossima' : ''}</span>
        <span class="mono small">${ev.results ? (mine.length ? 'P' + Math.min(...mine) : 'RIT') : ''}</span></div>`;
    }).join('')}</div></div>`;
}

function standingsPanels(st, pt) {
  const { drivers, teams } = champTable(st);
  const C = CATEGORIES[st.category];
  const lead = drivers[0]?.pts || 0;
  return `<div class="panel flush"><div class="panel-head" style="margin:0;padding:16px 18px 12px"><h3>${icon('trophy')} Classifica ${C.driversPerCar > 1 ? 'equipaggi' : 'piloti'}</h3></div>
    <table class="tbl small"><tbody>${drivers.map((x, i) => { const d = st.drivers[x.id]; const t = st.teams[d.teamId]; return `<tr class="${d.teamId === pt.id ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td style="width:8px;padding:0">${teamStripe(t)}</td><td>${driverChip(st, d, { helmet: false })}</td><td class="right mono"><b>${x.pts}</b></td><td class="right mono tiny muted">${i ? '-' + (lead - x.pts) : ''}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="panel flush"><div class="panel-head" style="margin:0;padding:16px 18px 12px"><h3>${icon('users')} Costruttori</h3></div>
    <table class="tbl small"><tbody>${teams.map((x, i) => { const t = st.teams[x.id]; return `<tr class="${t.isPlayer ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${teamBadge(t, 22)}</td><td>${esc(t.name)}</td><td class="right mono"><b>${x.pts}</b></td></tr>`; }).join('')}</tbody></table></div>`;
}

function tpRating(st) {
  const { teams } = champTable(st);
  const pos = teams.findIndex((t) => t.id === st.playerTeam) + 1;
  const start = st.modeRun.startRank || pos;
  const delta = start - pos;
  const medal = pos === 1 || delta >= 3 ? 2 : delta >= 1 ? 1 : delta >= 0 ? 0 : -1;
  return { pos, start, delta, medal };
}

function ceremony(st) {
  const { drivers, teams } = champTable(st);
  const champ = st.drivers[drivers[0].id]; const ct = st.teams[teams[0].id];
  const myD = drivers.findIndex((x) => st.drivers[x.id].teamId === st.playerTeam) + 1;
  const myT = teams.findIndex((x) => x.id === st.playerTeam) + 1;
  const won = st.drivers[drivers[0].id].teamId === st.playerTeam;
  const tp = st.modeRun.kind === 'tp' ? tpRating(st) : null;
  const pod = drivers.slice(0, 3).map((x, i) => { const d = st.drivers[x.id]; const t = st.teams[d.teamId]; return `<div class="md-pod p${i + 1}" style="--tc:${teamColor(t.car.livery)}"><div class="md-pod-n">${esc(d.name)}</div><div class="small muted">${esc(t.name)} · ${x.pts} pt</div><div class="md-pod-b">${i + 1}</div></div>`; });
  return `<div class="md-ceremony anim-in">
    <div class="md-cer-head"><div class="hh-eyebrow">${icon('trophy')} Premiazione finale</div>
      <div class="md-cer-champ">${esc(champ.name)}</div><div class="hh-circ">Campione ${CATEGORIES[st.category].driversPerCar > 1 ? 'equipaggi' : 'piloti'} · ${esc(st.teams[champ.teamId].name)}</div>
      <div class="small mt8">Titolo costruttori: <b>${esc(ct.name)}</b></div></div>
    <div class="md-podium">${pod[1] || ''}${pod[0]}${pod[2] || ''}</div>
    <div class="row center wrap gap16 mt24">
      <div class="md-mini"><span class="lbl">Il tuo miglior pilota</span><b>${myD}°</b></div>
      <div class="md-mini"><span class="lbl">La tua squadra</span><b>${myT}°</b></div>
      ${tp ? `<div class="md-mini"><span class="lbl">Partivi da</span><b>${tp.start}°</b></div><div class="md-mini"><span class="lbl">Valutazione</span><b>${tp.medal >= 0 ? MEDAL[tp.medal].name : 'Nessuna'}</b></div>` : ''}
      ${won ? '<span class="tag">Campione del mondo!</span>' : ''}
    </div>
    ${tp && tp.medal >= 0 ? `<div class="center">${medalSVG(MEDAL[tp.medal].col)}</div>` : ''}
    <div class="row center gap6 mt24"><button class="btn primary lg" data-a="${st.modeRun.kind === 'tp' ? 'tp-again' : 'again'}">${icon('replay')} Rigioca con le stesse regole</button>${st.modeRun.kind === 'tp' ? '' : `<button class="btn lg" data-a="new">${icon('plus')} Nuovo campionato</button>`}<button class="btn lg ghost" data-a="leave">${icon('home')} Menu</button></div>
  </div>`;
}

function tpShop(st) {
  const m = st.modeRun; const pt = st.teams[st.playerTeam];
  const { teams } = champTable(st);
  const rank = Object.values(st.teams).sort((a, b) => teamOverall(st, b) - teamOverall(st, a)).findIndex((t) => t.id === pt.id) + 1;
  return `<div class="panel"><div class="panel-head"><h3>${icon('wrench')} Officina</h3><span class="row gap6"><span class="tiny upper muted">Gettoni</span><span class="md-tokens">${Array.from({ length: TP_TOKENS }, (_, i) => `<i class="${i < m.tokens ? 'on' : ''}"></i>`).join('')}</span><b>${m.tokens}</b></span></div>
    <div class="small muted mb8">Vettura: ${rank}ª forza della griglia · Costruttori: ${teams.findIndex((t) => t.id === pt.id) + 1}°. Ogni gettone migliora subito la vettura per le gare restanti.</div>
    <div class="md-shop">${Object.entries(TP_UPGRADES).map(([k, u]) => `<button class="btn md-up" data-a="tp-buy" data-k="${k}" ${m.tokens <= 0 ? 'disabled' : ''}><b>${esc(u.name)}</b><span>${esc(u.desc)}</span>${m.upgrades[k] ? `<em>×${m.upgrades[k]}</em>` : ''}</button>`).join('')}</div></div>`;
}

function tpStart() {
  const cat = tpCat;
  if (!TEAMS[cat].find((t) => t.id === tpTeam)) tpTeam = TEAMS[cat][Math.floor(TEAMS[cat].length / 2)].id;
  return `<div class="panel mt16"><div class="panel-head"><h3>${icon('flag')} Nuova mini-stagione</h3><div class="tabs">${Object.values(CATEGORIES).map((c) => `<div class="tab ${cat === c.id ? 'active' : ''}" data-a="tp-cat" data-c="${c.id}">${c.name}</div>`).join('')}</div></div>
    <div class="team-pick">${TEAMS[cat].map((t) => `<button class="btn sm ${tpTeam === t.id ? 'active' : ''}" data-a="tp-team" data-id="${t.id}">${teamBadge(t, 24)} ${esc(t.name)}</button>`).join('')}</div>
    <div class="row mt16" style="justify-content:flex-end"><span class="small muted grow">3 gare scelte a sorte · ${TP_TOKENS} gettoni sviluppo · solo gara · punteggio moderno</span><button class="btn primary lg" data-a="tp-go">${icon('flag')} Inizia la mini-stagione</button></div></div>`;
}

function rulesModal(st) {
  const c = st.modeRun.cfg;
  const rows = [['Categoria', CATEGORIES[c.cat].name], ['Gare', st.calendar.length], ['Punteggio', `${POINT_SYSTEMS[c.points].name} (${POINT_SYSTEMS[c.points].desc})${c.fastest ? ' + 1 al giro veloce' : ''}`],
    ['Sprint', sprintAllowed(c.cat) ? SPRINT[c.sprint] : 'Non previste'], ['Meteo', WEATHER[c.weather]], ['Realismo', REALISM[c.realism].name], ['Griglia invertita', REVERSE[c.reverse]],
    ['Squadre', Object.keys(st.teams).length], ['Monomarca', c.mono ? 'Sì' : 'No'], ['Avversari', DIFFICULTY[c.diff]?.name || c.diff], ['Durata gare', LEN_N[c.len] || c.len], ['Weekend', c.format === 'race' ? 'Solo gara' : 'Completo']];
  App.modal(`<h2>Regolamento</h2><table class="tbl small mt16"><tbody>${rows.map(([a, b]) => `<tr><td class="muted">${a}</td><td><b>${esc(String(b))}</b></td></tr>`).join('')}</tbody></table><div class="row mt16" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Chiudi</button></div>`);
}

function hubActions(kind) {
  return {
    leave() { App.go('menu'); },
    new() { D = null; App.go('mode-champ-new'); },
    resume() { const sv = loadChamp(kind); if (sv) { setState(sv); App.refresh(); } },
    'del-saved'() { App.confirm('Eliminare il campionato salvato?', 'Classifiche e risultati andranno persi.', () => { deleteChamp(kind); App.refresh(); }, 'Elimina', true); },
    abandon() {
      const st = S(); const done = st.round >= st.calendar.length;
      App.confirm(done ? 'Archiviare il campionato?' : 'Abbandonare il campionato?', done ? 'Il campionato concluso verrà rimosso.' : 'Il campionato in corso verrà eliminato.', () => { deleteChamp(kind); setState(null); App.refresh(); }, done ? 'Archivia' : 'Abbandona', true);
    },
    rules() { rulesModal(S()); },
    race() {
      const st = S(); if (!prepareRound(st)) return;
      saveChamp(st);
      App.go(launchScreen(st.category));
    },
    'view-res'(el) { App.go('results', { idx: +el.dataset.i }); },
    again() { const c = S().modeRun.cfg; createChampionship(c, 'champ'); App.refresh(); },
    'tp-again'() { const st = S(); startTP(st.category, st.playerTeam); },
    'tp-buy'(el) { const st = S(); if (buyUpgrade(st, el.dataset.k)) { App.toast('Sviluppo montato', TP_UPGRADES[el.dataset.k].name, 'good'); App.refresh(); } },
    'tp-cat'(el) { tpCat = el.dataset.c; App.refresh(); },
    'tp-team'(el) { tpTeam = el.dataset.id; App.refresh(); },
    'tp-go'() { startTP(tpCat, tpTeam); },
  };
}

function startTP(cat, team) {
  const pool = TRACKS[cat].map((t) => t.id).sort(() => Math.random() - 0.5).slice(0, 3);
  const cfg = { ...defaultCfg(cat), cat, team, rounds: pool, sprint: 'off', name: 'Team Principal a tempo' };
  const st = createChampionship(cfg, 'tp');
  st.modeRun.startRank = Object.values(st.teams).sort((a, b) => teamOverall(st, b) - teamOverall(st, a)).findIndex((t) => t.isPlayer) + 1;
  saveChamp(st);
  App.go('mode-tp');
}

// results screen "back" from a past round goes to results → done → quickrace → router → hub
registerScreen({ id: 'mode-champ', full: true, render: () => hub('champ'), actions: hubActions('champ'), mount() { celebrateIfDone('champ'); } });
registerScreen({ id: 'mode-tp', full: true, render: () => hub('tp'), actions: hubActions('tp'), mount() { celebrateIfDone('tp'); } });
function celebrateIfDone(kind) {
  const st = current(kind);
  if (st && st.round >= st.calendar.length && !st.modeRun._cele) { st.modeRun._cele = true; saveChamp(st); celebrate(240); }
}

// ------------------------------------------------------------------ setup screen
function draft() {
  if (!D) D = defaultCfg('formula');
  return D;
}
function setCat(cat) {
  const keep = D ? { points: D.points, fastest: D.fastest, weather: D.weather, realism: D.realism, diff: D.diff, len: D.len, format: D.format, name: D.name } : {};
  D = { ...defaultCfg(cat), ...keep };
  if (!sprintAllowed(cat)) D.sprint = 'off';
}

registerScreen({
  id: 'mode-champ-new', full: true,
  render() {
    const c = draft(); const cat = c.cat; const C = CATEGORIES[cat];
    const opt = (k, v, label, tip = '') => `<button class="btn sm ${c[k] === v ? 'active' : ''}" data-a="opt" data-k="${k}" data-v="${v}" ${tip ? `data-tip="${esc(tip)}"` : ''}>${label}</button>`;
    const nTeams = TEAMS[cat].length;
    const drivers = TEAMS[cat].flatMap((t) => (t.d || []).map((d) => ({ name: d[0], team: t.name, ovr: d[3] })));
    const team = TEAMS[cat].find((t) => t.id === c.team);
    const ok = c.rounds.length >= 3 && c.rounds.length <= 24;
    return `<div class="full-screen md-screen" style="--pc:${C.color}">
      ${pageHead({ eyebrow: 'Campionato personalizzato · Regolamento', title: 'Crea campionato', back: 'mode-champ', right: `<div class="tabs">${Object.values(CATEGORIES).map((x) => `<div class="tab ${cat === x.id ? 'active' : ''}" data-a="cat" data-c="${x.id}">${x.name}</div>`).join('')}</div>` })}
      <div class="md-setup anim-in">
        <div class="col gap16">
          <div class="panel"><div class="panel-head"><h3>${icon('calendar')} Calendario</h3><span class="small ${ok ? 'muted' : 'bad'}">${c.rounds.length} gare · da 3 a 24</span></div>
            <div class="row wrap gap4 mb8"><button class="btn sm" data-a="cal-preset" data-v="5">5 a caso</button><button class="btn sm" data-a="cal-preset" data-v="10">10 a caso</button><button class="btn sm" data-a="cal-preset" data-v="all">Tutte in ordine</button><button class="btn sm ghost" data-a="cal-clear">${icon('trash')} Svuota</button></div>
            <div class="md-rounds">${c.rounds.length ? c.rounds.map((id, i) => { const t = trackOf(cat, id); return `<div class="md-round"><span class="mono muted">${i + 1}</span>${flagSVG(t.nat, 24, 16)}<b class="grow">${esc(t.name)}</b>
              <button class="btn sm ghost icon-btn" data-a="mv" data-i="${i}" data-d="-1" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>${icon('left', 'ico', 'style="transform:rotate(90deg)"')}</button>
              <button class="btn sm ghost icon-btn" data-a="mv" data-i="${i}" data-d="1" aria-label="Sposta giù" ${i === c.rounds.length - 1 ? 'disabled' : ''}>${icon('left', 'ico', 'style="transform:rotate(-90deg)"')}</button>
              <button class="btn sm ghost icon-btn" data-a="rm" data-i="${i}" aria-label="Rimuovi">${icon('x')}</button></div>`; }).join('') : `<div class="empty">${icon('calendar')}<b>Calendario vuoto</b><span>Aggiungi almeno 3 gare dall’elenco qui sotto.</span></div>`}</div>
            <div class="lbl mt16 mb8">Aggiungi ${cat === 'rally' ? 'rally' : 'circuiti'} (puoi ripetere una pista)</div>
            <div class="md-addlist">${TRACKS[cat].map((t) => `<button class="btn sm" data-a="add" data-id="${t.id}" ${c.rounds.length >= 24 ? 'disabled' : ''}>${flagSVG(t.nat, 20, 13)} ${esc(t.name)}${c.rounds.includes(t.id) ? ' <span class="chip tiny">×' + c.rounds.filter((x) => x === t.id).length + '</span>' : ''}</button>`).join('')}</div>
          </div>
          <div class="panel"><div class="panel-head"><h3>${icon('users')} Squadra e griglia</h3><span class="row gap6">${teamBadge(team, 24)}<b>${esc(team.name)}</b></span></div>
            <div class="team-pick">${TEAMS[cat].map((t) => `<button class="btn sm ${c.team === t.id ? 'active' : ''}" data-a="team" data-id="${t.id}">${teamBadge(t, 24)} ${esc(t.name)}</button>`).join('')}</div>
            <div class="qr-opts mt16">
              <span class="lbl">Pilota</span><div class="row gap6"><select class="md-select" data-change="driver" aria-label="Pilota di punta"><option value="">Formazione ufficiale della squadra</option>${drivers.map((d) => `<option value="${esc(d.name)}" ${c.driver === d.name ? 'selected' : ''}>${esc(d.name)} · ${esc(d.team)} (${d.ovr})</option>`).join('')}</select></div>
              <span class="lbl">Squadre</span><div class="row gap6"><button class="btn sm icon-btn" data-a="grid" data-d="-1" aria-label="Meno squadre" ${c.grid <= 3 ? 'disabled' : ''}>${icon('minus')}</button><b class="md-num">${c.grid}</b><button class="btn sm icon-btn" data-a="grid" data-d="1" aria-label="Più squadre" ${c.grid >= nTeams ? 'disabled' : ''}>${icon('plus')}</button><span class="small muted">${c.grid * C.cars} vetture in griglia (massimo ${nTeams * C.cars})</span></div>
              <span class="lbl">Vetture</span><div class="row wrap gap4">${opt('mono', false, 'Prestazioni reali')}${opt('mono', true, 'Monomarca: tutte uguali', 'Tutte le auto hanno le stesse prestazioni: contano piloti e strategia')}</div>
              <span class="lbl">Avversari</span><div class="row wrap gap4">${Object.entries(DIFFICULTY).map(([k, d]) => opt('diff', k, d.name)).join('')}</div>
            </div></div>
        </div>
        <div class="col gap16">
          <div class="panel"><div class="panel-head"><h3>${icon('rules')} Regole sportive</h3></div>
            <div class="qr-opts">
              <span class="lbl">Punti</span><div class="row wrap gap4">${Object.entries(POINT_SYSTEMS).map(([k, p]) => opt('points', k, p.name, p.desc)).join('')}</div>
              ${cat !== 'rally' ? `<span class="lbl">Giro veloce</span><div class="row wrap gap4">${opt('fastest', true, '+1 punto (nei primi 10)')}${opt('fastest', false, 'Nessun bonus')}</div>` : ''}
              ${sprintAllowed(cat) ? `<span class="lbl">Sprint</span><div class="row wrap gap4">${Object.entries(SPRINT).map(([k, n]) => opt('sprint', k, n)).join('')}</div>` : ''}
              ${cat !== 'rally' ? `<span class="lbl">Griglia inv.</span><div class="row wrap gap4">${Object.entries(REVERSE).map(([k, n]) => opt('reverse', k, n)).join('')}</div>` : ''}
              <span class="lbl">Meteo</span><div class="row wrap gap4">${Object.entries(WEATHER).map(([k, n]) => opt('weather', k, n)).join('')}</div>
              <span class="lbl">Realismo</span><div class="row wrap gap4">${Object.entries(REALISM).map(([k, r]) => opt('realism', k, r.name, r.desc)).join('')}</div>
              <span class="lbl">Weekend</span><div class="row wrap gap4">${opt('format', 'race', cat === 'rally' ? 'Solo prove speciali' : 'Solo gara')}${opt('format', 'full', cat === 'rally' ? 'Con shakedown' : 'Prove + qualifiche')}</div>
              <span class="lbl">Durata</span><div class="row wrap gap4">${Object.entries(LEN_N).map(([k, n]) => opt('len', k, n)).join('')}</div>
              <span class="lbl">Nome</span><input class="md-input" data-input="name" maxlength="40" placeholder="Es. Trofeo d’Autunno" value="${esc(c.name || '')}" aria-label="Nome del campionato">
            </div></div>
        </div>
      </div>
      <div class="qr-go md-go"><div class="qg-sum"><b>${esc(c.name || 'Campionato personalizzato')}</b><span>${esc(C.name)} · ${c.rounds.length} gare · ${POINT_SYSTEMS[c.points].name} · ${c.grid} squadre${c.mono ? ' · Monomarca' : ''} · ${REALISM[c.realism].name}</span></div>
        <button class="btn primary xl" data-a="create" ${ok ? '' : 'disabled'}>${icon('trophy')} Crea e inizia</button></div>
    </div>`;
  },
  actions: {
    cat(el) { setCat(el.dataset.c); App.refresh(); },
    opt(el) { const v = el.dataset.v; D[el.dataset.k] = v === 'true' ? true : v === 'false' ? false : v; App.refresh(); },
    team(el) { D.team = el.dataset.id; App.refresh(); },
    driver(el) { D.driver = el.value || null; },
    name(el) { D.name = el.value.slice(0, 40); },
    grid(el) { D.grid = Math.max(3, Math.min(TEAMS[D.cat].length, D.grid + +el.dataset.d)); App.refresh(); },
    add(el) { if (D.rounds.length < 24) D.rounds.push(el.dataset.id); App.refresh(); },
    rm(el) { D.rounds.splice(+el.dataset.i, 1); App.refresh(); },
    mv(el) { const i = +el.dataset.i, j = i + +el.dataset.d; if (j < 0 || j >= D.rounds.length) return; [D.rounds[i], D.rounds[j]] = [D.rounds[j], D.rounds[i]]; App.refresh(); requestAnimationFrame(() => document.querySelector(`[data-a="mv"][data-i="${j}"][data-d="${el.dataset.d}"]`)?.focus()); },
    'cal-clear'() { D.rounds = []; App.refresh(); },
    'cal-preset'(el) {
      const all = TRACKS[D.cat].map((t) => t.id);
      if (el.dataset.v === 'all') D.rounds = all.slice(0, 24);
      else { const n = +el.dataset.v; const pool = all.slice().sort(() => Math.random() - 0.5); const pick = []; while (pick.length < n) pick.push(pool[pick.length % pool.length]); D.rounds = all.filter((x) => pick.includes(x)).concat(pick.slice(all.length)).slice(0, n); }
      App.refresh();
    },
    create() {
      if (D.rounds.length < 3) return;
      const ex = loadChamp('champ');
      const go = () => { createChampionship(D, 'champ'); App.go('mode-champ'); };
      if (ex && ex.round < ex.calendar.length) App.confirm('Sostituire il campionato in corso?', 'Il campionato salvato verrà sostituito da questo nuovo.', go, 'Sostituisci', true);
      else go();
    },
  },
});
