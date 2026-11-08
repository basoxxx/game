// Inbox, Standings, Calendar, Career, Settings
import { App, registerScreen, trackName } from '../app.js';
import { icon } from '../ui/icons.js';
import { flagSVG, teamBadge, carSVG, helmetSVG, trackSVG } from '../ui/art.js';
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
import { PERKS, xpForLevel, ensureProgress, buyPerk } from '../engine/progress.js';
import { legacyInfo } from '../engine/legacy.js';

// ---------------- INBOX ----------------
let selMail = null;
registerScreen({
  id: 'inbox',
  render(params) {
    const st = S();
    if (params?.mail) { selMail = params.mail; params.mail = null; }
    if (!selMail || !st.inbox.find((m) => m.id === selMail)) selMail = st.inbox[0]?.id;
    const m = st.inbox.find((x) => x.id === selMail);
    if (m && !m.read) m.read = true;
    return `<div class="screen-title"><div><div class="sub">${st.inbox.filter((x) => !x.read).length} non letti</div><h1>Posta</h1></div><button class="btn sm ghost" data-a="read-all">${icon('check')} Segna tutti come letti</button></div>
    <div style="display:grid;grid-template-columns:400px 1fr;gap:16px;height:calc(100vh - 190px)" class="anim-in">
      <div class="panel tight" style="overflow-y:auto">${st.inbox.map((x) => `<div class="mail ${x.read ? '' : 'unread'} ${x.type} ${x.id === selMail ? 'sel' : ''}" data-a="open-mail" data-id="${x.id}" ><div class="ic">${icon(x.icon || 'mail')}</div><div class="grow" style="min-width:0"><div class="subj small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.subject)}</div><div class="tiny muted">${esc(x.from)} · S${x.season} R${x.round + 1}</div></div></div>`).join('') || `<div class="empty">${icon('mail')}<b>Posta vuota</b><span>Nessun messaggio</span></div>`}</div>
      <div class="panel" style="overflow-y:auto">${m ? `<div class="row" style="gap:14px"><div class="mail ${m.type}" style="padding:0"><div class="ic" style="width:52px;height:52px">${icon(m.icon || 'mail')}</div></div><div><h2 style="font-size:30px;font-style:italic;font-weight:800">${esc(m.subject)}</h2><div class="small mt8" style="color:var(--text2)">Da <b>${esc(m.from)}</b> · Stagione ${m.season}, round ${m.round + 1}</div></div></div><div class="mt24" style="white-space:pre-line;line-height:1.75;font-size:16px;color:var(--text2);max-width:760px">${esc(m.body)}</div>` : '<div class="empty">Seleziona un messaggio</div>'}</div>
    </div>`;
  },
  actions: {
    'open-mail'(el) { selMail = el.dataset.id; App.refresh(); },
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
    <div class="panel flush anim-in" style="overflow-x:auto">${body}</div>`;
  },
  actions: { tab(el) { standTab = el.dataset.t; App.refresh(); } },
});

// ---------------- CALENDAR ----------------
registerScreen({
  id: 'calendar',
  render() {
    const st = S();
    const pt = playerTeam(st);
    const done = st.calendar.filter((e) => e.results).length;
    return `<div class="screen-title"><div><div class="sub">Stagione ${st.season} · ${done}/${st.calendar.length} eventi disputati</div><h1>Calendario</h1></div></div>
    <div class="cal-prog mb16"><i style="width:${(done / Math.max(1, st.calendar.length)) * 100}%"></i></div>
    <div class="cal-list anim-in">${st.calendar.map((ev, i) => {
      const tr = getTrack(st.category, ev.trackId);
      const res = ev.results;
      const win = res?.classification[0];
      const mine = res?.classification.filter((c) => c.teamId === pt.id) || [];
      const cur = i === st.round;
      let map = '';
      try { map = st.category === 'rally' ? '' : trackSVG(circuitPath(tr.cid), { w: 90, h: 54, glow: null, color: cur ? '#fff' : 'rgba(255,255,255,.55)', width: 3, start: false }); } catch {}
      const tags = `${ev.sprint ? `<span class="tag">${icon('bolt')} Sprint</span>` : ''}${tr.night ? `<span class="tag dark">${icon('moon')} Notte</span>` : ''}${tr.double ? '<span class="tag">Punti doppi</span>' : ''}`;
      return `<div class="cal-row ${cur ? 'cur' : ''} ${res ? 'done' : ''}">
        <div class="cal-rd">${String(ev.round).padStart(2, '0')}</div>
        <div class="cal-ev">${flagSVG(tr.nat, 34, 23)}<div style="min-width:0"><div class="cal-name">${esc(tr.name)}</div><div class="cal-circ">${esc(tr.circuit || (ev.stages ? `${ev.stages.length} PS · ${ev.stages.reduce((a, b) => a + b.km, 0)} km` : ''))}</div></div></div>
        <div class="cal-map">${map}</div>
        <div class="cal-info">${win ? `<div class="cal-win"><span class="tiny upper muted">Vincitore</span>${driverChip(st, st.drivers[win.driverIds[0]], { helmet: false })}</div>` : cur ? '<span class="tag red">Prossimo evento</span>' : `<span class="small muted">Pioggia ${Math.round(tr.rain * 100)}%</span>`}<div class="row gap4">${tags}</div></div>
        <div class="cal-mine">${mine.map((m) => `<div class="cal-res"><span class="small muted">${esc((st.drivers[m.driverIds[0]]?.name || '').split(' ').slice(-1)[0])}</span><b class="${m.status === 'dnf' ? 'bad' : m.pos <= 3 ? 'good' : ''}">${m.status === 'dnf' ? 'RIT' : 'P' + m.pos}</b></div>`).join('')}</div>
      </div>`;
    }).join('')}</div>`;
  },
});

// ---------------- CAREER ----------------
registerScreen({
  id: 'career',
  render() {
    const st = S();
    ensureProgress(st);
    const c = st.career;
    const ach = Object.values(st.achievements);
    const ALL = [['first_podium', 'Champagne!'], ['first_win', 'Prima vittoria!'], ['one_two', 'Doppietta'], ['pole', 'Pole Position'], ['signing', 'Colpo di mercato'], ['driver_title', 'Campione del Mondo'], ['team_title', 'Dinastia'], ['switch', 'Giramondo'], ['level5', 'Manager affermato'], ['level10', 'Stratega leggendario'], ['rd5', 'Fabbrica a pieno regime'], ['sponsor3', 'Vetrina piena'], ['rain_win', 'Re della pioggia'], ['from_back', 'Rimonta epica'], ['quick', 'Pilota della domenica']];
    const need = xpForLevel(c.level);
    return `<div class="screen-title"><div><div class="sub">${esc(st.playerName)}</div><h1>Carriera</h1></div><div class="kpi" style="text-align:right"><b style="${c.points ? 'color:var(--good)' : ''}">${c.points}</b><span>Punti abilità</span></div></div>
    <div class="grid4 anim-in">
      <div class="panel"><div class="kpi"><b>Livello ${c.level}</b><span>Manager · ${c.xp}/${need} XP</span></div>${bar((c.xp / need) * 100, 'gold')}</div>
      <div class="panel"><div class="kpi"><b>${Math.round(c.reputation)}</b><span>Reputazione</span></div>${bar(c.reputation, 'blue')}</div>
      <div class="panel"><div class="kpi"><b>${c.trophies.length}</b><span>Titoli vinti · ${c.seasonsManaged} stagioni</span></div></div>
      <div class="panel"><div class="kpi"><b>${ach.length}/${ALL.length}</b><span>Obiettivi sbloccati</span></div></div>
    </div>
    ${legacyPanel(st)}
    <div class="panel mt16"><div class="panel-head"><h3>Albero delle abilità</h3><span class="small muted">Guadagni XP con punti, podi, vittorie e obiettivi. Ogni livello = 1 punto abilità.</span></div>
      <div class="grid3">${Object.entries(PERKS).map(([k, b]) => `<div class="card" style="border-top:3px solid ${b.color}"><div class="row">${icon(b.icon, 'ico', `style="width:22px;height:22px;color:${b.color}"`)}<h3>${b.name}</h3></div>
        <div class="col gap6 mt16">${b.perks.map((p, i) => { const own = c.perks.includes(p.id); const avail = !own && (i === 0 || c.perks.includes(b.perks[i - 1].id)); return `<div class="row" style="padding:10px;border-radius:10px;border:1px solid ${own ? b.color : 'var(--line)'};background:${own ? `color-mix(in srgb, ${b.color} 14%, transparent)` : 'rgba(255,255,255,0.02)'};opacity:${own || avail ? 1 : 0.45}"><div class="grow"><b>${p.name}</b><div class="tiny muted">${p.desc}</div></div>${own ? `<span class="chip good">${icon('check')}</span>` : `<button class="btn sm ${avail && c.points >= p.cost ? 'primary' : ''}" data-a="perk" data-id="${p.id}" ${avail && c.points >= p.cost ? '' : 'disabled'}>${p.cost} pt</button>`}</div>`; }).join('')}</div></div>`).join('')}</div>
    </div>
    <div class="grid2 mt16">
      <div class="panel"><div class="panel-head"><h3>Obiettivi stagione ${st.season}</h3></div><div class="col gap6">${(st.objectives || []).map((o) => `<div class="card row">${icon(o.done ? 'check' : 'target', 'ico', `style="width:22px;height:22px;color:${o.done ? 'var(--good)' : 'var(--muted)'}"`)}<div class="grow"><b>${esc(o.text)}</b><div class="tiny muted">Premio: ${o.xp} XP · ${fmtM(o.money)}</div></div>${o.done ? '<span class="chip good">Completato</span>' : '<span class="chip">In corso</span>'}</div>`).join('')}</div></div>
      <div class="panel"><div class="panel-head"><h3>Bacheca trofei</h3></div>${c.trophies.length ? `<div class="grid3">${c.trophies.map((t) => `<div class="card" style="text-align:center">${icon('trophy', 'ico', 'style="width:40px;height:40px;color:var(--gold)"')}<div style="font-weight:800;margin-top:6px">Titolo ${t.type}</div><div class="small muted">${CATEGORIES[t.category].name} ${t.season}</div><div class="tiny">${esc(t.name)}</div></div>`).join('')}</div>` : `<div class="empty">${icon('trophy')}<b>Bacheca vuota</b><span>La bacheca ti aspetta. Vinci il tuo primo titolo!</span></div>`}</div>
    </div>
    <div class="panel mt16"><div class="panel-head"><h3>Obiettivi sbloccabili</h3></div><div class="grid4" style="grid-template-columns:repeat(5,1fr)">${ALL.map(([id, n]) => { const a = st.achievements[id]; return `<div class="card row" style="${a ? '' : 'opacity:.4'}">${icon(a ? 'star' : 'shield', 'ico', `style="width:24px;height:24px;color:${a ? 'var(--gold)' : 'var(--dim)'}"`)}<div><b class="small">${n}</b><div class="tiny muted">${a ? `Sbloccato nel ${a.season}` : 'Bloccato'}</div></div></div>`; }).join('')}</div></div>
    <div class="panel mt16"><div class="panel-head"><h3>Storico</h3></div>${c.history.length ? `<table class="tbl"><thead><tr><th>Stagione</th><th>Categoria</th><th>Squadra</th><th class="right">Obiettivo</th><th class="right">Risultato</th></tr></thead><tbody>${c.history.map((h) => `<tr><td>${h.season}</td><td>${CATEGORIES[h.category].name}</td><td>${esc(h.team)}</td><td class="right">${h.target}°</td><td class="right"><b class="${h.pos <= h.target ? 'good' : 'bad'}">${h.pos}°</b></td></tr>`).join('')}</tbody></table>` : '<div class="muted small">Nessuna stagione completata.</div>'}</div>`;
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
    ${st.category !== 'rally' ? `<div class="panel mt16"><div class="panel-head"><h3>Record della pista (giro più veloce in gara)</h3></div>${recs.length ? `<table class="tbl"><thead><tr><th>Circuito</th><th class="right">Tempo</th><th>Pilota</th><th>Team</th><th class="right">Anno</th></tr></thead><tbody>${recs.map((r) => `<tr><td>${esc(r.track)}</td><td class="right mono"><b>${fmtLapT(r.time)}</b></td><td>${esc(r.driver || '')}</td><td class="small muted">${esc(r.team || '')}</td><td class="right">${r.season}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">${icon('speed')}<b>Nessun record</b><span>Corri qualche gara per stabilire i primi giri veloci.</span></div>`}</div>` : ''}`;
  },
});
function fmtLapT(t) { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(3).padStart(6, '0')}`; }

// Impostazioni live in their own module
import './settings.js';
