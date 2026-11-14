// Inbox, Standings, Calendar, Career, Settings
import { App, registerScreen, trackName } from '../app.js';
import { icon } from '../ui/icons.js';
import { flagSVG, teamBadge, carSVG, helmetSVG, trackSVG, weatherIcon } from '../ui/art.js';
import { trackArt } from '../ui/trackart.js';
import { progressChart } from '../ui/charts.js';
import { trackStats, partSensitivity } from '../engine/trackphys.js';
import { partName } from '../engine/season.js';
import { teamColor } from '../app.js';
import { SURFACES } from '../data/categories.js';
import { circuitPath } from '../ui/trackview.js';
import { esc, bar, fmtGap, fmtLong } from '../ui/dom.js';
import { S, getSettings, setSettings, saveGame, exportSave } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, standings, fmtM } from '../engine/season.js';
import { CATEGORIES } from '../data/categories.js';
import { driverChip, teamStripe, ratingBox, ovr } from './common.js';
import { openLoad } from './menu.js';
import { applyVolumes, sfx } from '../ui/audio.js';
import { applyFilterSettings, FILTER_PRESETS, COLORBLIND_MODES } from '../ui/gfx.js';
import { PERKS, xpForLevel, ensureProgress, buyPerk, seasonStats } from '../engine/progress.js';
import { legacyInfo } from '../engine/legacy.js';
import { STATUS, MANDATES, ensureDynasty, statusInfo, relColor } from '../engine/dynasty.js';
import { statusEmblem, statusLadder, portraitSVG, objectiveRow, trophySVG } from './career-ui.js';
import { hasReel } from '../engine/highlights.js';
import { openSavedHighlights } from './highlights.js';

// ---------------- INBOX ----------------
let selMail = null, mailFilter = 'all';
// Mail folders: derived from sender/icon so old saves sort themselves too
const MAIL_FOLDERS = [['all', 'Tutta'], ['race', 'Gare'], ['team', 'Squadra'], ['biz', 'Affari'], ['board', 'Consiglio']];
function mailFolder(m) {
  const f = (m.from || '').toLowerCase();
  if (m.icon === 'board' || f.includes('consiglio') || f.includes('tribunale')) return 'board';
  if (m.icon === 'money' || f.includes('commerciale') || f.includes('finanza') || f.includes('sponsor')) return 'biz';
  if (m.icon === 'flag' || f.includes('stampa') || f.includes('commissari') || f.includes('federazione')) return 'race';
  return 'team';
}
const FOLDER_COL = { race: '#3aa0ff', team: '#22d37a', biz: '#ffb400', board: '#c08bff' };
function senderAvatar(m, size = 40) {
  const words = String(m.from || '?').replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean);
  const ini = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
  const col = FOLDER_COL[mailFolder(m)];
  return `<div class="mail-av" style="--mc:${col};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">${esc(ini)}${m.type === 'good' ? '<i class="ok"></i>' : m.type === 'bad' ? '<i class="ko"></i>' : ''}</div>`;
}
function mailCard(st, m) {
  const c = m.card;
  if (!c || c.kind !== 'race') return '';
  const posCol = (r) => (r.dnf ? 'var(--bad)' : r.pos === 1 ? 'var(--gold, #ffcf3a)' : r.pos <= 3 ? '#e2e6ee' : r.pts ? 'var(--good)' : 'var(--text2)');
  return `<div class="mail-race mt24">
    <div class="mr-head">${c.nat ? flagSVG(c.nat, 30, 20) : ''}<b>${esc(c.track)}</b><span class="chip ${c.cpos <= c.tgt ? 'good' : 'warn'}">Costruttori ${c.cpos}° · obiettivo ${c.tgt}°</span></div>
    <div class="mr-rows">${c.rows.map((r) => `<div class="mr-row"><div class="mr-pos" style="color:${posCol(r)}">${r.dnf ? 'RIT' : 'P' + r.pos}</div><div class="grow"><b>${esc(r.n)}</b>${r.dnf && r.why ? `<div class="tiny muted">${esc(r.why)}</div>` : ''}</div><div class="mr-pts">${r.pts ? '+' + r.pts : '0'}<span>pt</span></div></div>`).join('')}</div>
  </div>`;
}
registerScreen({
  id: 'inbox',
  render(params) {
    const st = S();
    if (params?.mail) { selMail = params.mail; params.mail = null; mailFilter = 'all'; }
    const list = st.inbox.filter((x) => mailFilter === 'all' || mailFolder(x) === mailFilter);
    if (!selMail || !list.find((m) => m.id === selMail)) selMail = list[0]?.id;
    const m = list.find((x) => x.id === selMail);
    if (m && !m.read) m.read = true;
    const unread = (f) => st.inbox.filter((x) => !x.read && (f === 'all' || mailFolder(x) === f)).length;
    const body = m ? (m.card ? m.body.split('\n\n').filter((p) => !p.startsWith('•')).join('\n\n') : m.body) : '';
    return `<div class="screen-title"><div><div class="sub">${unread('all')} non letti · ${st.inbox.length} messaggi</div><h1>Posta</h1></div><div class="row gap6"><div class="tabs">${MAIL_FOLDERS.map(([k, n]) => `<div class="tab ${mailFilter === k ? 'active' : ''}" data-a="mail-filter" data-f="${k}">${n}${unread(k) ? ` <span class="badge">${unread(k)}</span>` : ''}</div>`).join('')}</div><button class="btn sm ghost" data-a="read-all">${icon('check')} Segna tutti come letti</button></div></div>
    <div class="mail-layout anim-in">
      <div class="panel tight mail-list">${list.map((x) => `<div class="mail ${x.read ? '' : 'unread'} ${x.type} ${x.id === selMail ? 'sel' : ''}" data-a="open-mail" data-id="${x.id}">${senderAvatar(x, 38)}<div class="grow" style="min-width:0"><div class="subj small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.subject)}</div><div class="tiny muted">${esc(x.from)} · ${x.season !== st.season ? x.season + ' · ' : ''}R${x.round + 1}</div></div></div>`).join('') || `<div class="empty">${icon('mail')}<b>${mailFilter === 'all' ? 'Posta vuota' : 'Nessun messaggio in questa cartella'}</b><span>${mailFilter === 'all' ? 'I messaggi arriveranno dopo il primo evento.' : 'Quando arriverà qualcosa, lo troverai qui.'}</span></div>`}</div>
      <div class="panel mail-read">${m ? `<div class="row" style="gap:16px;align-items:flex-start">${senderAvatar(m, 56)}<div class="grow"><div class="tiny upper" style="letter-spacing:.14em;color:${FOLDER_COL[mailFolder(m)]}">${esc(MAIL_FOLDERS.find(([k]) => k === mailFolder(m))[1])}</div><h2 class="mail-subj">${esc(m.subject)}</h2><div class="small mt8" style="color:var(--text2)">Da <b>${esc(m.from)}</b> · Stagione ${m.season}, round ${m.round + 1}</div></div></div>
        ${mailCard(st, m)}<div class="mail-body mt24">${esc(body)}</div>` : `<div class="empty">${icon('mail')}<b>Nessun messaggio selezionato</b><span>Scegli un messaggio dall’elenco.</span></div>`}</div>
    </div>`;
  },
  actions: {
    'open-mail'(el) { selMail = el.dataset.id; App.refresh(); },
    'mail-filter'(el) { mailFilter = el.dataset.f; selMail = null; App.refresh(); },
    'read-all'() { S().inbox.forEach((m) => (m.read = true)); App.refresh(); },
  },
});

// ---------------- STANDINGS ----------------
let standTab = 'drivers';
registerScreen({
  id: 'standings',
  render() {
    const st = S();
    const s = standings(st);
    const pt = playerTeam(st);
    const done = st.calendar.filter((e) => e.results);
    const header = done.map((e) => `<th style="text-align:center;padding:8px 4px" title="${esc(trackName(st, e))}">${flagSVG(getTrack(st.category, e.trackId).nat, 18, 12)}</th>`).join('');
    const cell = (pos, pts, dnf) => `<td style="text-align:center;padding:6px 2px" class="mono small ${pos === 1 ? 'pos p1' : pos === 2 ? 'pos p2' : pos === 3 ? 'pos p3' : pts ? '' : 'dim'}" style="font-size:12px">${dnf ? '<span class="bad">R</span>' : pos || '-'}</td>`;
    let body;
    if (standTab === 'drivers') {
      body = `<table class="tbl"><thead><tr><th>Pos</th><th></th><th>Pilota</th><th>Team</th>${header}<th class="right">Vitt.</th><th class="right">Punti</th></tr></thead><tbody>${s.drivers.map((x, i) => {
        const d = st.drivers[x.id]; const tm = st.teams[d.teamId];
        const cells = done.map((e) => { const r = e.results.classification.find((c) => c.driverIds.includes(d.id)); return r ? cell(r.pos, r.pts, r.status === 'dnf') : '<td class="dim" style="text-align:center">·</td>'; }).join('');
        return `<tr class="${d.teamId === pt.id ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${tm ? teamStripe(tm) : ''}</td><td>${driverChip(st, d, { size: 24 })}</td><td class="small muted">${tm?.name || '-'}</td>${cells}<td class="right mono">${x.wins}</td><td class="right mono"><b style="font-size:16px">${x.pts}</b>${s.drivers[0].pts - x.pts > 0 ? `<div class="gap-lead">−${s.drivers[0].pts - x.pts}</div>` : !i && x.pts ? '<div class="gap-lead" style="color:var(--gold)">Leader</div>' : ''}</td></tr>`;
      }).join('')}</tbody></table>`;
    } else {
      const max = Math.max(1, s.teams[0]?.pts || 1);
      body = `<table class="tbl"><thead><tr><th>Pos</th><th>Team</th>${header}<th style="width:22%"></th><th class="right">Vitt.</th><th class="right">Punti</th></tr></thead><tbody>${s.teams.map((x, i) => {
        const tm = st.teams[x.id];
        const cells = done.map((e) => { const p = e.results.classification.filter((c) => c.teamId === tm.id).reduce((a, c) => a + c.pts, 0); return `<td class="mono small" style="text-align:center">${p || '<span class="dim">0</span>'}</td>`; }).join('');
        return `<tr class="${tm.id === pt.id ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td><div class="row">${teamBadge(tm, 26)}<b>${esc(tm.name)}</b></div></td>${cells}<td><div class="bar"><i style="width:${(x.pts / max) * 100}%;background:${tm.colors[0] === '#f0f0f0' || tm.colors[0].startsWith('#f') ? tm.colors[1] : tm.colors[0]}"></i></div></td><td class="right mono">${x.wins}</td><td class="right mono"><b style="font-size:16px">${x.pts}</b>${s.teams[0].pts - x.pts > 0 ? `<div class="gap-lead">−${s.teams[0].pts - x.pts}</div>` : !i && x.pts ? '<div class="gap-lead" style="color:var(--gold)">Leader</div>' : ''}</td></tr>`;
      }).join('')}</tbody></table>`;
    }
    return `<div class="screen-title"><div><div class="sub">${esc(cat(st).full)} ${st.season}</div><h1>Classifiche</h1></div><div class="tabs"><div class="tab ${standTab === 'drivers' ? 'active' : ''}" data-a="tab" data-t="drivers">Piloti</div><div class="tab ${standTab === 'teams' ? 'active' : ''}" data-a="tab" data-t="teams">Costruttori</div></div></div>
    <div class="stand-wrap anim-in"><div class="panel flush" style="overflow-x:auto">${body}</div>${standSide(st, s, pt, done)}</div>`;
  },
  actions: { tab(el) { standTab = el.dataset.t; App.refresh(); } },
});

// right-hand column of the standings: points progression + the fight around the player
function standSide(st, s, pt, done) {
  const drivers = standTab === 'drivers';
  const labels = done.map((e) => `R${e.round}`);
  const rows = drivers ? s.drivers : s.teams;
  const mineIds = drivers ? Object.values(st.drivers).filter((d) => d.teamId === pt.id).map((d) => d.id) : [pt.id];
  const keep = rows.filter((x, i) => i < 8 || mineIds.includes(x.id));
  const col = teamColor(pt.car.livery);
  const series = keep.map((x) => {
    let acc = 0;
    const values = done.map((e) => { for (const c of e.results.classification) if (drivers ? c.driverIds.includes(x.id) : c.teamId === x.id) acc += c.pts; return acc; });
    const name = drivers ? st.drivers[x.id].name : st.teams[x.id].name;
    return { id: x.id, name, short: drivers ? name.split(' ').slice(-1)[0] : st.teams[x.id].short || name, color: col, values, me: mineIds.includes(x.id), lead: x.id === rows[0].id };
  });
  const meIdx = rows.findIndex((x) => mineIds.includes(x.id));
  const me = rows[meIdx], ahead = rows[meIdx - 1], behind = rows[meIdx + 1];
  const nm = (x) => esc(drivers ? st.drivers[x.id].name : st.teams[x.id].name);
  const left = st.calendar.length - done.length;
  const duel = me ? `<div class="stand-duel">
      ${ahead ? `<div><span>Davanti · P${meIdx}</span><b>${nm(ahead)}</b><em class="bad">+${ahead.pts - me.pts} pt</em></div>` : `<div><span>In testa</span><b>${nm(me)}</b><em class="good">Leader</em></div>`}
      <div class="me"><span>${drivers ? 'Il tuo miglior pilota' : 'La tua squadra'} · P${meIdx + 1}</span><b>${nm(me)}</b><em>${me.pts} pt</em></div>
      ${behind ? `<div><span>Dietro · P${meIdx + 2}</span><b>${nm(behind)}</b><em class="good">−${me.pts - behind.pts} pt</em></div>` : '<div><span>Dietro</span><b>—</b><em></em></div>'}
    </div>` : '';
  return `<div class="col gap16 stand-side">
    <div class="panel"><div class="panel-head"><h3>Andamento punti</h3><span class="small muted">${done.length}/${st.calendar.length} eventi · ${left} da disputare</span></div>
      ${progressChart(series, labels, { empty: 'Il grafico si riempie dopo il primo evento.' })}
      <div class="chart-legend"><span><i class="me" style="background:${col}"></i>${esc(pt.name)}</span><span><i class="ref"></i>Leader</span><span><i class="avg"></i>Rivali</span></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>La tua lotta</h3><span class="small muted">${drivers ? 'Classifica piloti' : 'Classifica costruttori'}</span></div>${duel}</div>
  </div>`;
}

// ---------------- CALENDAR ----------------
let calSel = null, calSeason = null, calRound = null;
function calPreview(st, ev, i, pt) {
  const tr = getTrack(st.category, ev.trackId);
  const rally = st.category === 'rally';
  const fact = (v, l, cls = '') => `<div class="${cls}"><b>${v}</b><span>${l}</span></div>`;
  let facts = '';
  try {
    if (rally) {
      const km = ev.stages.reduce((a, b) => a + b.km, 0);
      facts = fact(ev.stages.length, 'Prove speciali') + fact(`${km}<small>km</small>`, 'Distanza') + [...new Set(ev.stages.map((x) => x.surface))].map((x) => fact(`<i class="surf" style="background:${SURFACES[x].color}"></i>${SURFACES[x].name}`, 'Fondo')).join('');
    } else {
      const ts = trackStats(st.category, tr), sens = partSensitivity(st.category, tr);
      const key = Object.entries(sens).sort((a, b) => b[1] - a[1])[0][0];
      facts = fact(`${(ts.len / 1000).toFixed(3)}<small>km</small>`, 'Lunghezza') + fact(ts.corners, 'Curve') + fact(`${Math.round(ts.vmax)}<small>km/h</small>`, 'Velocità max') + fact(`${Math.round(ts.full * 100)}<small>%</small>`, 'Gas a fondo') + fact(tr.hours ? `${tr.hours}<small>ore</small>` : tr.laps || '—', tr.hours ? 'Durata' : 'Giri (reali)') + fact(partName(st, key), 'Fattore chiave', 'key');
      if (tr.ovt != null) facts += fact(tr.ovt > 0.6 ? 'Facili' : tr.ovt > 0.3 ? 'Medi' : 'Difficili', 'Sorpassi');
      if (tr.wear != null) facts += fact(tr.wear > 1.2 ? 'Alta' : tr.wear > 0.9 ? 'Media' : 'Bassa', 'Usura gomme');
    }
  } catch {}
  const res = ev.results;
  const podium = res ? `<div class="cp-podium">${res.classification.slice(0, 3).map((c, k) => { const d = st.drivers[c.driverIds[0]]; const tm = st.teams[c.teamId]; return `<div class="p${k + 1}"><i>${k + 1}</i>${tm ? teamBadge(tm, 24) : ''}<b>${esc(d?.name || '')}</b></div>`; }).join('')}</div>` : '';
  const rainTxt = tr.rain < 0.12 ? 'Asciutto quasi certo' : tr.rain < 0.3 ? 'Variabile' : tr.rain < 0.5 ? 'Pioggia possibile' : 'Pioggia probabile';
  return `<aside class="cal-side">
    <div class="cp-head"><div class="cp-rd">Round ${ev.round} / ${st.calendar.length}${i === st.round ? ' · <em>Prossimo evento</em>' : res ? ' · Disputato' : ''}</div>
      <div class="cp-name">${flagSVG(tr.nat, 42, 28)}<span>${esc(tr.name)}</span></div>
      <div class="cp-circ">${esc(tr.circuit || '')}${ev.sprint ? ' · Weekend sprint' : ''}${tr.night ? ' · Notturna' : ''}${tr.double ? ' · Punti doppi' : ''}</div></div>
    <div class="cp-map">${trackArt(st.category, tr, { w: 640, h: 400, accent: teamColor(pt.car.livery) })}
      <div class="cp-wx" data-tip="Probabilità di pioggia stimata per l’evento">${weatherIcon(tr.rain, tr.night, 30)}<div><b>${Math.round(tr.rain * 100)}%</b><span>${rainTxt}</span></div></div></div>
    <div class="cp-facts">${facts}</div>
    ${podium}
    ${res && hasReel(st, i) ? `<button class="btn lg cp-go" data-a="cal-hl" data-i="${i}">${icon('replay')} Guarda gli highlights</button>` : ''}
    ${i === st.round ? `<button class="btn primary lg cp-go" data-a="continue">${st.weekend ? 'Riprendi il weekend' : 'Vai al weekend'} ${icon('right')}</button>` : ''}
  </aside>`;
}

registerScreen({
  id: 'calendar',
  render() {
    const st = S();
    const pt = playerTeam(st);
    const done = st.calendar.filter((e) => e.results).length;
    if (calSeason !== st.season || calRound !== st.round || calSel == null || !st.calendar[calSel]) { calSeason = st.season; calRound = st.round; calSel = Math.min(st.round, st.calendar.length - 1); }
    return `<div class="screen-title"><div><div class="sub">Stagione ${st.season} · ${done}/${st.calendar.length} eventi disputati</div><h1>Calendario</h1></div></div>
    <div class="cal-prog mb16"><i style="width:${(done / Math.max(1, st.calendar.length)) * 100}%"></i></div>
    <div class="cal-wrap anim-in"><div class="cal-list">${st.calendar.map((ev, i) => {
      const tr = getTrack(st.category, ev.trackId);
      const res = ev.results;
      const win = res?.classification[0];
      const mine = res?.classification.filter((c) => c.teamId === pt.id) || [];
      const cur = i === st.round;
      let map = '';
      try { map = st.category === 'rally' ? '' : trackSVG(circuitPath(tr.cid), { w: 72, h: 44, glow: null, color: cur || i === calSel ? '#fff' : 'rgba(255,255,255,.55)', width: 3, start: false }); } catch {}
      const tags = `${ev.sprint ? `<span class="tag">${icon('bolt')} Sprint</span>` : ''}${tr.night ? `<span class="tag dark">${icon('moon')} Notte</span>` : ''}${tr.double ? '<span class="tag">Punti doppi</span>' : ''}`;
      return `<div class="cal-row ${cur ? 'cur' : ''} ${res ? 'done' : ''} ${i === calSel ? 'sel' : ''}" data-a="cal-sel" data-i="${i}" aria-current="${i === calSel}">
        <div class="cal-rd">${String(ev.round).padStart(2, '0')}</div>
        <div class="cal-ev">${flagSVG(tr.nat, 34, 23)}<div style="min-width:0"><div class="cal-name">${esc(tr.name)}</div><div class="cal-circ">${esc(tr.circuit || (ev.stages ? `${ev.stages.length} PS · ${ev.stages.reduce((a, b) => a + b.km, 0)} km` : ''))}</div></div></div>
        <div class="cal-map">${map}</div>
        <div class="cal-info">${win ? `<div class="cal-win"><span class="tiny upper muted">Vincitore</span>${driverChip(st, st.drivers[win.driverIds[0]], { helmet: false })}</div>` : cur ? '<span class="tag red">Prossimo evento</span>' : `<span class="cal-wx">${weatherIcon(tr.rain, tr.night, 20)}<span class="small muted">Pioggia ${Math.round(tr.rain * 100)}%</span></span>`}<div class="row gap4">${tags}</div></div>
        <div class="cal-mine">${mine.map((m) => `<div class="cal-res"><span class="small muted">${esc((st.drivers[m.driverIds[0]]?.name || '').split(' ').slice(-1)[0])}</span><b class="${m.status === 'dnf' ? 'bad' : m.pos <= 3 ? 'good' : ''}">${m.status === 'dnf' ? 'RIT' : 'P' + m.pos}</b></div>`).join('')}</div>
      </div>`;
    }).join('')}</div>${calPreview(st, st.calendar[calSel], calSel, pt)}</div>`;
  },
  actions: { 'cal-sel'(el) { calSel = +el.dataset.i; App.refresh(); }, 'cal-hl'(el) { openSavedHighlights(S(), +el.dataset.i); } },
});

// ---------------- CAREER ----------------
registerScreen({
  id: 'career',
  render() {
    const st = S();
    ensureProgress(st);
    const c = st.career;
    const ach = Object.values(st.achievements);
    const ALL = [['first_podium', 'Champagne!'], ['first_win', 'Prima vittoria!'], ['one_two', 'Doppietta'], ['pole', 'Pole Position'], ['signing', 'Colpo di mercato'], ['driver_title', 'Campione del Mondo'], ['team_title', 'Dinastia'], ['switch', 'Giramondo'], ['level5', 'Manager affermato'], ['level10', 'Stratega leggendario'], ['rd5', 'Fabbrica a pieno regime'], ['sponsor3', 'Vetrina piena'], ['rain_win', 'Re della pioggia'], ['from_back', 'Rimonta epica'], ['quick', 'Pilota della domenica'],
      ['status2', 'Fuori dall’anonimato'], ['status3', 'Si fa sul serio'], ['status4', 'Nell’Olimpo'], ['status5', 'Dinastia'], ['plan_done', 'Visionario'], ['promises3', 'Uomo di parola'],
      ['sponsor_sweep', 'Cliente perfetto'], ['bet_win', 'Chi la fa l’aspetti'], ['alliance', 'Diplomatico del paddock'], ['peace', 'Calumet della pace'], ['tycoon', 'Il magnate'], ['saved', 'Salvataggio in extremis'],
      ['phoenix', 'Fenice'], ['academy_sign', 'Talent scout'], ['academy_grad', 'Fatto in casa'], ['feeder_champ', 'Vivaio d’oro']];
    const need = xpForLevel(c.level);
    return `<div class="screen-title"><div><div class="sub">${esc(st.playerName)}</div><h1>Carriera</h1></div><div class="kpi" style="text-align:right"><b style="${c.points ? 'color:var(--good)' : ''}">${c.points}</b><span>Punti abilità</span></div></div>
    <div class="grid4 anim-in career-kpis">
      <div class="panel"><div class="kpi"><b>Livello ${c.level}</b><span>Manager · ${c.xp}/${need} XP</span></div>${bar((c.xp / need) * 100, 'gold')}</div>
      <div class="panel"><div class="kpi"><b>${Math.round(c.reputation)}</b><span>Reputazione</span></div>${bar(c.reputation, 'blue')}</div>
      <div class="panel"><div class="kpi"><b>${c.trophies.length}</b><span>Titoli vinti · ${c.seasonsManaged} stagioni</span></div></div>
      <div class="panel"><div class="kpi"><b>${ach.length}/${ALL.length}</b><span>Obiettivi sbloccati</span></div></div>
    </div>
    ${dynastyPanel(st)}
    ${legacyPanel(st)}
    <div class="panel mt16"><div class="panel-head"><h3>Albero delle abilità</h3><span class="small muted">Guadagni XP con punti, podi, vittorie e obiettivi. Ogni livello = 1 punto abilità.</span></div>
      <div class="grid3">${Object.entries(PERKS).map(([k, b]) => `<div class="card" style="border-top:3px solid ${b.color}"><div class="row">${icon(b.icon, 'ico', `style="width:22px;height:22px;color:${b.color}"`)}<h3>${b.name}</h3></div>
        <div class="col gap6 mt16">${b.perks.map((p, i) => { const own = c.perks.includes(p.id); const avail = !own && (i === 0 || c.perks.includes(b.perks[i - 1].id)); return `<div class="row" style="padding:10px;border-radius:10px;border:1px solid ${own ? b.color : 'var(--line)'};background:${own ? `color-mix(in srgb, ${b.color} 14%, transparent)` : 'rgba(255,255,255,0.02)'};opacity:${own || avail ? 1 : 0.45}"><div class="grow"><b>${p.name}</b><div class="tiny muted">${p.desc}</div></div>${own ? `<span class="chip good">${icon('check')}</span>` : `<button class="btn sm ${avail && c.points >= p.cost ? 'primary' : ''}" data-a="perk" data-id="${p.id}" ${avail && c.points >= p.cost ? '' : 'disabled'}>${p.cost} pt</button>`}</div>`; }).join('')}</div></div>`).join('')}</div>
    </div>
    <div class="grid2 mt16">
      <div class="panel"><div class="panel-head"><h3>Obiettivi stagione ${st.season}</h3><span class="small muted">${(st.objectives || []).filter((o) => o.done).length}/${(st.objectives || []).length} completati</span></div><div class="col" style="gap:16px">${(st.objectives || []).map((o) => objectiveRow(o, seasonStats(st))).join('') || '<div class="muted small">Gli obiettivi arrivano con la prima stagione.</div>'}</div></div>
      <div class="panel"><div class="panel-head"><h3>Bacheca trofei</h3></div>${c.trophies.length ? `<div class="grid3">${c.trophies.map((t) => `<div class="card" style="text-align:center"><div class="trophy-mini">${trophySVG('#f5c542', 64)}</div><div style="font-weight:800;margin-top:6px">Titolo ${t.type}</div><div class="small muted">${CATEGORIES[t.category].name} ${t.season}</div><div class="tiny">${esc(t.name)}</div></div>`).join('')}</div>` : `<div class="empty trophy-empty">${trophySVG('#59606b', 92)}<b>Bacheca vuota</b><span>La bacheca ti aspetta. Vinci il tuo primo titolo!</span></div>`}</div>
    </div>
    <div class="panel mt16"><div class="panel-head"><h3>Obiettivi sbloccabili</h3></div><div class="grid4" style="grid-template-columns:repeat(5,1fr)">${ALL.map(([id, n]) => { const a = st.achievements[id]; return `<div class="card row" style="${a ? '' : 'opacity:.4'}">${icon(a ? 'star' : 'shield', 'ico', `style="width:24px;height:24px;color:${a ? 'var(--gold)' : 'var(--dim)'}"`)}<div><b class="small">${n}</b><div class="tiny muted">${a ? `Sbloccato nel ${a.season}` : 'Bloccato'}</div></div></div>`; }).join('')}</div></div>
    <div class="panel mt16"><div class="panel-head"><h3>Storico</h3></div>${c.history.length ? `<table class="tbl"><thead><tr><th>Stagione</th><th>Categoria</th><th>Squadra</th><th>Status</th><th class="right">Obiettivo</th><th class="right">Risultato</th></tr></thead><tbody>${c.history.map((h) => `<tr><td>${h.season}</td><td>${CATEGORIES[h.category].name}</td><td>${esc(h.team)}</td><td>${h.status != null ? `<span class="small" style="color:${STATUS[h.status].color};font-weight:700">${esc(STATUS[h.status].name)}</span>` : '<span class="dim">-</span>'}</td><td class="right">${h.target}°</td><td class="right"><b class="${h.pos <= h.target ? 'good' : 'bad'}">${h.pos}°</b></td></tr>`).join('')}</tbody></table>` : '<div class="muted small">Nessuna stagione completata.</div>'}</div>`;
  },
  actions: {
    perk(el) { const r = buyPerk(S(), el.dataset.id); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); return; } sfx.levelup(); App.toast('Abilità sbloccata!', '', 'good'); App.refresh(); },
  },
});

function legacyPanel(st) {
  const L = legacyInfo(st);
  const done = L.milestones.filter((m) => m.done).length;
  return `<div class="panel mt16"><div class="panel-head"><h3>${icon('trophy')} Eredità della dinastia</h3><span class="small muted">${done}/${L.milestones.length} traguardi storici</span></div>
    <div class="grid4"><div class="kpi"><b>${L.score}</b><span>Punteggio eredità</span></div><div class="kpi"><b>${esc(L.tier)}</b><span>${L.next ? `Prossimo rango: ${esc(L.next.name)} (${L.next.min})` : 'Rango massimo'}</span></div><div class="kpi"><b>${L.stats.wins}</b><span>Vittorie in carriera · ${L.stats.podiums} podi</span></div><div class="kpi"><b>${L.stats.races}</b><span>Eventi diretti · ${L.stats.poles} pole</span></div></div>
    ${bar(L.progress * 100, 'gold')}
    <div class="grid4 mt16" style="grid-template-columns:repeat(4,1fr)">${L.milestones.map((m) => `<div class="card row" style="${m.done ? '' : 'opacity:.45'}">${icon(m.done ? 'trophy' : 'target', 'ico', `style="width:22px;height:22px;color:${m.done ? 'var(--gold)' : 'var(--dim)'}"`)}<div class="grow"><b class="small">${esc(m.name)}</b><div class="tiny muted">${esc(m.desc)}</div><div class="tiny ${m.done ? 'good' : 'dim'}">${m.done ? `Ottenuto nel ${m.season}` : `+${m.pts} punti`}</div></div></div>`).join('')}</div></div>`;
}

// ---------------- HALL OF FAME ----------------
import { hallOfFame, allTimeRecords } from '../engine/depth.js';
registerScreen({
  id: 'halloffame',
  render() {
    const st = S();
    const champs = (st.champions || []).slice().reverse();
    const recs = Object.entries(st.records || {}).filter(([k]) => k.startsWith(st.category + ':')).map(([, v]) => v).sort((a, b) => a.track.localeCompare(b.track));
    const legends = Object.values(st.drivers).filter((d) => d.stats.starts > 0).sort((a, b) => b.stats.titles - a.stats.titles || b.stats.wins - a.stats.wins || b.stats.podiums - a.stats.podiums).slice(0, 15);
    return `<div class="screen-title"><div><div class="sub">${esc(cat(st).full)}</div><h1>Albo d’oro</h1></div></div>
    <div class="grid2 anim-in">
      <div class="panel"><div class="panel-head"><h3>Campioni</h3></div>${champs.length ? `<table class="tbl"><thead><tr><th>Stagione</th><th>Piloti</th><th>Costruttori</th></tr></thead><tbody>${champs.map((c) => `<tr class="${c.mine ? 'me' : ''}"><td><b>${c.season}</b> <span class="tiny muted">${CATEGORIES[c.category].name}</span></td><td>${icon('trophy', 'ico', 'style="width:14px;color:var(--gold);vertical-align:-2px"')} ${esc(c.driver)} <span class="tiny muted">${esc(c.dTeam)}</span></td><td>${esc(c.team)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${icon('trophy')}<b>Nessun campione, per ora</b><span>Completa una stagione per scrivere la storia.</span></div>`}</div>
      <div class="panel"><div class="panel-head"><h3>Leggende in attività</h3></div><table class="tbl small"><thead><tr><th>Pilota</th><th class="right">Titoli</th><th class="right">Vittorie</th><th class="right">Podi</th><th class="right">Pole</th><th class="right">GP</th></tr></thead><tbody>${legends.map((d) => `<tr class="${d.teamId === st.playerTeam ? 'me' : ''}"><td>${driverChip(st, d, { size: 22 })}</td><td class="right mono"><b>${d.stats.titles}</b></td><td class="right mono">${d.stats.wins}</td><td class="right mono">${d.stats.podiums}</td><td class="right mono">${d.stats.poles}</td><td class="right mono">${d.stats.starts}</td></tr>`).join('')}</tbody></table></div>
    </div>
    ${recordsPanel(st)}
    ${st.category !== 'rally' ? `<div class="panel mt16"><div class="panel-head"><h3>Record della pista (giro più veloce in gara)</h3></div>${recs.length ? `<table class="tbl"><thead><tr><th>Circuito</th><th class="right">Tempo</th><th>Pilota</th><th>Team</th><th class="right">Anno</th></tr></thead><tbody>${recs.map((r) => `<tr><td>${esc(r.track)}</td><td class="right mono"><b>${fmtLapT(r.time)}</b></td><td>${esc(r.driver || '')}</td><td class="small muted">${esc(r.team || '')}</td><td class="right">${r.season}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${icon('speed')}<b>Nessun record</b><span>Corri qualche gara per stabilire i primi giri veloci.</span></div>`}</div>` : ''}`;
  },
});
function recordsPanel(st) {
  if (st.quick) return '';
  const R = allTimeRecords(st); const hof = hallOfFame(st);
  const col = (title, rows, k) => `<div><div class="tiny upper muted mb8">${title}</div>${rows.length ? rows.map((r, i) => `<div class="row between small" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>${i + 1}. ${esc(r.name)}${r.active ? '' : ' <span class="tiny muted">(rit.)</span>'}</span><b class="mono">${r[k]}</b></div>`).join('') : '<div class="small muted">—</div>'}</div>`;
  return `<div class="panel mt16"><div class="panel-head"><h3>Record di tutti i tempi</h3><span class="small muted">Piloti in attività e ritirati, dall’inizio della carriera</span></div>
      <div class="grid4">${col('Titoli', R.titles, 'titles')}${col('Vittorie', R.wins, 'wins')}${col('Podi', R.podiums, 'podiums')}${col('Pole', R.poles, 'poles')}</div>
      ${R.teams.length ? `<div class="tiny upper muted mt16 mb8">Squadre più vincenti</div><div class="row wrap gap6">${R.teams.slice(0, 8).map((t) => `<span class="chip ${t.id === st.playerTeam ? 'good' : ''}">${esc(t.name)} · ${t.titles} ${t.titles === 1 ? 'titolo' : 'titoli'} · ${t.wins} vittorie</span>`).join('')}</div>` : ''}
    </div>
    <div class="panel mt16"><div class="panel-head"><h3>Hall of Fame</h3><span class="small muted">I grandi che hanno appeso il casco al chiodo</span></div>${hof.length ? `<table class="tbl small"><thead><tr><th>Pilota</th><th>Ultima squadra</th><th class="right">Ritiro</th><th class="right">Titoli</th><th class="right">Vittorie</th><th class="right">Podi</th><th class="right">Pole</th><th class="right">GP</th></tr></thead><tbody>${hof.map((h) => `<tr><td><b>${esc(h.name)}</b> <span class="tiny muted">${esc(h.nat || '')}</span></td><td class="muted">${esc(h.team || '—')}</td><td class="right">${h.season} <span class="tiny muted">(${h.age} anni)</span></td><td class="right mono"><b>${h.titles}</b></td><td class="right mono">${h.wins}</td><td class="right mono">${h.podiums}</td><td class="right mono">${h.poles}</td><td class="right mono">${h.starts}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${icon('trophy')}<b>Ancora nessuno</b><span>I campioni e i plurivincitori entrano qui il giorno del ritiro.</span></div>`}</div>`;
}
function fmtLapT(t) { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(3).padStart(6, '0')}`; }

// Impostazioni live in their own module
import './settings.js';

// ---------------- DYNASTY SUMMARY ----------------
function dynastyPanel(st) {
  if (st.quick) return '';
  const D = ensureDynasty(st); if (!D) return '';
  const si = statusInfo(st);
  const M = MANDATES[D.mandate] || MANDATES.growth;
  const ps = Object.entries(D.principals).map(([id, p]) => ({ id, p, t: st.teams[id] })).filter((x) => x.t && !x.t.isPlayer).sort((a, b) => b.p.rel - a.p.rel);
  const ally = ps[0], foe = ps[ps.length - 1];
  const who = (x, lab) => x ? `<div class="row" style="gap:10px">${portraitSVG(x.p, x.t, 44)}<div><div class="tiny upper muted">${lab}</div><b>${esc(x.p.name)}</b><div class="tiny" style="color:${relColor(x.p.rel)}">${esc(x.t.name)} · ${x.p.rel > 0 ? '+' : ''}${x.p.rel}</div></div></div>` : '';
  return `<div class="panel mt16" style="--stc:${si.color}"><div class="panel-head"><h3>${icon('star')} La tua dinastia</h3><button class="btn sm ghost" data-a="nav" data-to="paddock" data-tab="board">Paddock e consiglio ${icon('right')}</button></div>
    <div class="grid4" style="align-items:center">
      <div class="row" style="gap:14px">${statusEmblem(si.idx, 70)}<div><div class="tiny upper muted">Status</div><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:28px;line-height:1;text-transform:uppercase;color:${si.color}">${esc(si.name)}</div><div class="tiny muted">Prestigio ${si.rep}${si.next ? ` · prossimo: ${esc(si.next.name)}` : ''}</div></div></div>
      <div><div class="tiny upper muted">Mandato</div><b style="font-family:var(--display);font-size:20px;text-transform:uppercase">${esc(M.name)}</b><div class="tiny muted">${D.plan.steps.filter((x) => x.done).length}/${D.plan.steps.length} tappe del piano · promesse ${D.stats.promisesKept}/${D.stats.promisesKept + D.stats.promisesBroken}</div></div>
      ${who(ally, 'Rapporto migliore')}
      ${who(foe, 'Rapporto peggiore')}
    </div>
    <div class="mt16">${statusLadder(st)}</div>
  </div>`;
}
