// Inbox, Standings, Calendar, Career, Settings
import { App, registerScreen, trackName } from '../app.js';
import { icon } from '../ui/icons.js';
import { flagSVG, teamBadge, carSVG, helmetSVG } from '../ui/art.js';
import { esc, bar, fmtGap, fmtLong } from '../ui/dom.js';
import { S, getSettings, setSettings, saveGame, exportSave } from '../engine/state.js';
import { getTrack } from '../engine/world.js';
import { cat, playerTeam, standings, fmtM } from '../engine/season.js';
import { CATEGORIES } from '../data/categories.js';
import { driverChip, teamStripe, ratingBox, ovr } from './common.js';
import { openLoad } from './menu.js';
import { applyVolumes } from '../ui/audio.js';

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
      <div class="panel tight" style="overflow-y:auto">${st.inbox.map((x) => `<div class="mail ${x.read ? '' : 'unread'} ${x.type} ${x.id === selMail ? 'sel' : ''}" data-a="open-mail" data-id="${x.id}" style="${x.id === selMail ? 'background:rgba(255,255,255,0.07);border-color:var(--line2)' : ''}"><div class="ic">${icon(x.icon || 'mail')}</div><div class="grow" style="min-width:0"><div class="subj small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.subject)}</div><div class="tiny muted">${esc(x.from)} · S${x.season} R${x.round + 1}</div></div></div>`).join('') || '<div class="empty">Nessun messaggio</div>'}</div>
      <div class="panel" style="overflow-y:auto">${m ? `<div class="row" style="gap:14px"><div class="mail ${m.type}" style="padding:0"><div class="ic" style="width:52px;height:52px">${icon(m.icon || 'mail')}</div></div><div><h2>${esc(m.subject)}</h2><div class="muted small">Da: <b>${esc(m.from)}</b> · Stagione ${m.season}, round ${m.round + 1}</div></div></div><div class="mt24" style="white-space:pre-line;line-height:1.7;font-size:15.5px">${esc(m.body)}</div>` : '<div class="empty">Seleziona un messaggio</div>'}</div>
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
        return `<tr class="${d.teamId === pt.id ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td>${tm ? teamStripe(tm) : ''}</td><td>${driverChip(st, d, { size: 24 })}</td><td class="small muted">${tm?.name || '-'}</td>${cells}<td class="right mono">${x.wins}</td><td class="right mono"><b style="font-size:16px">${x.pts}</b></td></tr>`;
      }).join('')}</tbody></table>`;
    } else {
      const max = Math.max(1, s.teams[0]?.pts || 1);
      body = `<table class="tbl"><thead><tr><th>Pos</th><th>Team</th>${header}<th style="width:22%"></th><th class="right">Vitt.</th><th class="right">Punti</th></tr></thead><tbody>${s.teams.map((x, i) => {
        const tm = st.teams[x.id];
        const cells = done.map((e) => { const p = e.results.classification.filter((c) => c.teamId === tm.id).reduce((a, c) => a + c.pts, 0); return `<td class="mono small" style="text-align:center">${p || '<span class="dim">0</span>'}</td>`; }).join('');
        return `<tr class="${tm.id === pt.id ? 'me' : ''}"><td class="pos p${i + 1}">${i + 1}</td><td><div class="row">${teamBadge(tm, 26)}<b>${esc(tm.name)}</b></div></td>${cells}<td><div class="bar"><i style="width:${(x.pts / max) * 100}%;background:${tm.colors[0] === '#f0f0f0' || tm.colors[0].startsWith('#f') ? tm.colors[1] : tm.colors[0]}"></i></div></td><td class="right mono">${x.wins}</td><td class="right mono"><b style="font-size:16px">${x.pts}</b></td></tr>`;
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
    return `<div class="screen-title"><div><div class="sub">Stagione ${st.season}</div><h1>Calendario</h1></div></div>
    <div class="grid3 anim-in">${st.calendar.map((ev, i) => {
      const tr = getTrack(st.category, ev.trackId);
      const res = ev.results;
      const win = res?.classification[0];
      const mine = res?.classification.filter((c) => c.teamId === pt.id) || [];
      const cur = i === st.round;
      return `<div class="card ${cur ? 'sel' : ''}" style="${res ? '' : cur ? '' : 'opacity:.85'}">
        <div class="row between"><span class="chip">R${ev.round}</span>${res ? '<span class="chip good">Completato</span>' : cur ? '<span class="chip warn pulse">Prossimo</span>' : ''}</div>
        <div class="row mt8" style="gap:10px">${flagSVG(tr.nat, 30, 20)}<div><div style="font-weight:800;font-family:var(--display);font-size:17px">${esc(tr.name)}</div><div class="tiny muted upper">${esc(tr.circuit || (ev.stages ? `${ev.stages.length} PS · ${ev.stages.reduce((a, b) => a + b.km, 0)} km` : ''))}</div></div></div>
        ${win ? `<div class="mt16 small"><div class="row between"><span class="muted">Vincitore</span><span>${driverChip(st, st.drivers[win.driverIds[0]], { helmet: false })}</span></div>${mine.map((m) => `<div class="row between mt8"><span class="muted">${esc(st.drivers[m.driverIds[0]]?.name || '')}</span><b class="${m.status === 'dnf' ? 'bad' : m.pos <= 3 ? 'good' : ''}">${m.status === 'dnf' ? 'RIT' : 'P' + m.pos}</b></div>`).join('')}</div>` : `<div class="mt16 row wrap gap6 small">${tr.night ? '<span class="chip">Notturna</span>' : ''}${tr.double ? '<span class="chip warn">Punti doppi</span>' : ''}<span class="chip">Pioggia ${Math.round(tr.rain * 100)}%</span></div>`}
      </div>`;
    }).join('')}</div>`;
  },
});

// ---------------- CAREER ----------------
registerScreen({
  id: 'career',
  render() {
    const st = S();
    const c = st.career;
    const ach = Object.values(st.achievements);
    const ALL = [['first_podium', 'Champagne!'], ['first_win', 'Prima vittoria!'], ['one_two', 'Doppietta'], ['pole', 'Pole Position'], ['signing', 'Colpo di mercato'], ['driver_title', 'Campione del Mondo'], ['team_title', 'Dinastia'], ['switch', 'Giramondo']];
    return `<div class="screen-title"><div><div class="sub">${esc(st.playerName)}</div><h1>Carriera</h1></div></div>
    <div class="grid4 anim-in">
      <div class="panel"><div class="kpi"><b>${c.reputation.toFixed ? c.reputation.toFixed(0) : c.reputation}</b><span>Reputazione manager</span></div>${bar(c.reputation, 'gold')}</div>
      <div class="panel"><div class="kpi"><b>${c.seasonsManaged}</b><span>Stagioni completate</span></div></div>
      <div class="panel"><div class="kpi"><b>${c.trophies.length}</b><span>Titoli vinti</span></div></div>
      <div class="panel"><div class="kpi"><b>${ach.length}/${ALL.length}</b><span>Obiettivi</span></div></div>
    </div>
    <div class="grid2 mt16">
      <div class="panel"><div class="panel-head"><h3>Bacheca trofei</h3></div>${c.trophies.length ? `<div class="grid3">${c.trophies.map((t) => `<div class="card" style="text-align:center">${icon('trophy', 'ico', 'style="width:40px;height:40px;color:var(--gold)"')}<div style="font-weight:800;margin-top:6px">Titolo ${t.type}</div><div class="small muted">${CATEGORIES[t.category].name} ${t.season}</div><div class="tiny">${esc(t.name)}</div></div>`).join('')}</div>` : '<div class="empty">La bacheca ti aspetta. Vinci il tuo primo titolo!</div>'}</div>
      <div class="panel"><div class="panel-head"><h3>Obiettivi</h3></div><div class="grid2">${ALL.map(([id, n]) => { const a = st.achievements[id]; return `<div class="card row" style="${a ? '' : 'opacity:.4'}">${icon(a ? 'star' : 'shield', 'ico', `style="width:26px;height:26px;color:${a ? 'var(--gold)' : 'var(--dim)'}"`)}<div><b>${n}</b><div class="tiny muted">${a ? `Sbloccato nel ${a.season}` : 'Bloccato'}</div></div></div>`; }).join('')}</div></div>
    </div>
    <div class="panel mt16"><div class="panel-head"><h3>Storico</h3></div>${c.history.length ? `<table class="tbl"><thead><tr><th>Stagione</th><th>Categoria</th><th>Squadra</th><th class="right">Obiettivo</th><th class="right">Risultato</th></tr></thead><tbody>${c.history.map((h) => `<tr><td>${h.season}</td><td>${CATEGORIES[h.category].name}</td><td>${esc(h.team)}</td><td class="right">${h.target}°</td><td class="right"><b class="${h.pos <= h.target ? 'good' : 'bad'}">${h.pos}°</b></td></tr>`).join('')}</tbody></table>` : '<div class="muted small">Nessuna stagione completata.</div>'}</div>`;
  },
});

// ---------------- SETTINGS ----------------
registerScreen({
  id: 'settings',
  get full() { return !S() || App.params?.back === 'menu'; },
  render(params) {
    const s = getSettings();
    const back = params?.back === 'menu' || !S();
    const inner = `<div class="screen-title"><div><div class="sub">Preferenze</div><h1>Impostazioni</h1></div>${back ? `<button class="btn" data-a="nav" data-to="menu">${icon('left')} Menu</button>` : ''}</div>
    <div class="grid2 anim-in" style="max-width:1000px">
      <div class="panel"><div class="panel-head"><h3>Audio</h3></div>
        <div class="row between"><span>Effetti sonori</span><button class="btn sm ${s.sound ? 'active' : ''}" data-a="toggle" data-k="sound">${s.sound ? 'ON' : 'OFF'}</button></div>
        <div class="row between mt16"><span>Rombo motori in gara</span><button class="btn sm ${s.engineSound ? 'active' : ''}" data-a="toggle" data-k="engineSound">${s.engineSound ? 'ON' : 'OFF'}</button></div>
        <div class="row between mt16"><span>Colonna sonora</span><button class="btn sm ${s.music !== false ? 'active' : ''}" data-a="toggle" data-k="music">${s.music !== false ? 'ON' : 'OFF'}</button></div>
        <div class="mt16"><label class="lbl">Volume generale</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-change="vol" class="mt8"></div>
        <div class="mt16"><label class="lbl">Volume musica</label><input type="range" min="0" max="1" step="0.05" value="${s.musicVol ?? 0.55}" data-change="mvol" class="mt8"></div>
      </div>
      <div class="panel"><div class="panel-head"><h3>Gioco</h3></div>
        <div class="row between"><span>Velocità gara predefinita</span><div class="row gap6">${[2, 4, 8, 16, 32].map((v) => `<button class="btn sm ${s.raceSpeed === v ? 'active' : ''}" data-a="speed" data-v="${v}">${v}x</button>`).join('')}</div></div>
        <div class="row between mt16"><span>Vista 3D in gara</span><button class="btn sm ${s.view3d !== false ? 'active' : ''}" data-a="toggle" data-k="view3d">${s.view3d !== false ? 'ON' : 'OFF'}</button></div>
        ${window.apex?.toggleFullscreen ? `<div class="row between mt16"><span>Schermo intero</span><button class="btn sm" data-a="fs">${icon('fullscreen')} F11</button></div>` : ''}
      </div>
      ${S() ? `<div class="panel"><div class="panel-head"><h3>Salvataggi</h3></div><div class="row wrap gap6"><button class="btn" data-a="save-as">${icon('save')} Salva in slot…</button><button class="btn" data-a="export">${icon('download')} Esporta su file</button></div><div class="small muted mt8">Il gioco salva automaticamente dopo ogni evento.</div></div>` : ''}
      <div class="panel"><div class="panel-head"><h3>Info</h3></div><div class="small muted" style="line-height:1.6">Apex Dynasty v${__APP_VERSION__}<br>Gioco gestionale di fantasia. Tutti i nomi di squadre, piloti, sponsor e marchi sono parodie inventate e non sono affiliati a persone o aziende reali.</div></div>
    </div>`;
    return back ? `<div style="position:fixed;inset:0;padding:40px 60px;overflow-y:auto">${inner}</div>` : inner;
  },
  actions: {
    toggle(el) { const k = el.dataset.k; const cur = getSettings()[k]; setSettings({ [k]: !(cur ?? true) }); applyVolumes(); App.refresh(); },
    vol(el) { setSettings({ volume: +el.value }); applyVolumes(); },
    mvol(el) { setSettings({ musicVol: +el.value }); applyVolumes(); },
    speed(el) { setSettings({ raceSpeed: +el.dataset.v }); App.refresh(); },
    fs() { window.apex?.toggleFullscreen?.(); },
    'save-as'() { openLoad(true); },
    export() {
      const b = exportSave(); const a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = `apex-dynasty-${S().season}-r${S().round + 1}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
  },
});
