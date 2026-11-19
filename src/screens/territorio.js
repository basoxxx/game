// Territorio — menus (single player, local multiplayer, garage), the live match, pause and results.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { trLoad, trSave } from '../territorio/store.js';
import { MODES, MAPS, DIFFS, COLORS, VEHICLES, TRAILS, CONTROLS, PLAYER_COLORS, dailySpec } from '../territorio/meta.js';
import '../territorio/territorio.css';

const T = { playing: false, game: null, from: 'launcher', tab: 'gioca', daily: null, mp: false, quickDone: false };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const pctS = (x) => `${(+x || 0).toFixed(1)}%`;
const SP_MODES = ['classica', 'battaglia', 'squadre'];
const MP_MODES = ['battaglia', 'squadre', 'eliminazione', 'classica'];
const MP_PALETTE = ['#ff4d6d', '#2f9bff', '#7ad13a', '#ffd21f', '#ff8a1f', '#a77bff', '#1fd1a5', '#ff3fbf'];
const CTRL_IDS = Object.keys(CONTROLS);

// small pictures of the vehicles for the garage
function vehArt(id, c = '#ff4d6d') {
  const eye = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="#fff"/><circle cx="${x + 1.6}" cy="${y}" r="2.4" fill="#1b1b24"/>`;
  const sh = '<ellipse cx="40" cy="62" rx="24" ry="5" fill="rgba(0,0,0,.25)"/>';
  const body = {
    cubo: `<rect x="20" y="22" width="40" height="36" rx="6" fill="${c}"/><rect x="18" y="18" width="44" height="8" rx="3" fill="#fff" opacity=".45"/>${eye(46, 36)}${eye(32, 36)}`,
    ape: `<rect x="42" y="22" width="20" height="30" rx="4" fill="${c}"/><rect x="18" y="38" width="26" height="12" fill="${c}" opacity=".7"/><rect x="56" y="27" width="5" height="12" fill="#bfe8ff"/><circle cx="58" cy="54" r="6" fill="#1b1b24"/><circle cx="24" cy="54" r="6" fill="#1b1b24"/>${eye(50, 40)}`,
    ufo: `<ellipse cx="40" cy="42" rx="26" ry="9" fill="${c}"/><path d="M27 40 a13 13 0 0 1 26 0z" fill="#cfefff"/>${eye(36, 34)}${eye(45, 34)}`,
    trottola: `<path d="M18 36 L40 14 L62 36z" fill="${c}"/><path d="M18 38 L40 60 L62 38z" fill="${c}" opacity=".65"/>${eye(34, 30)}${eye(46, 30)}`,
    razzo: `<rect x="20" y="30" width="34" height="18" rx="9" fill="${c}"/><path d="M54 30 L68 39 L54 48z" fill="#fff" opacity=".8"/><path d="M20 39 L8 33 L8 45z" fill="#ffb02e"/>${eye(44, 36)}`,
    papera: `<ellipse cx="36" cy="44" rx="20" ry="13" fill="${c}"/><circle cx="52" cy="28" r="10" fill="${c}"/><path d="M60 27 L70 30 L60 33z" fill="#ff9f1c"/>${eye(54, 25)}`,
  }[id] || '';
  return `<svg viewBox="0 0 80 70" aria-hidden="true">${sh}${body}</svg>`;
}
const trailCss = (t, c) => ({ 0: c, 1: `radial-gradient(circle, ${c} 38%, transparent 42%) 0 0/14px 14px`, 2: `repeating-linear-gradient(90deg, ${c} 0 10px, #fff 10px 20px)`, 3: `linear-gradient(90deg, ${c}, #fff, ${c})`, 4: 'linear-gradient(90deg,#ff3d7f,#ffc928,#2ee6a6,#1e90ff,#8b5cff)' })[t.style];

function wallet(p) {
  return `<div class="tr-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">${p.games} partite · ${p.wins} vittorie · ${fmt(p.kills)} eliminazioni</div></div>`;
}
function tabs(cur) {
  return `<nav class="tr-tabs" role="tablist">${[['gioca', 'play', 'Gioca'], ['multi', 'users', '2–4 giocatori'], ['garage', 'palette', 'Garage']].map(([id, ic, n]) => `<button class="tr-tab ${cur === id ? 'on' : ''}" role="tab" aria-selected="${cur === id}" data-a="tr-tab" data-id="${id}">${icon(ic)} ${n}</button>`).join('')}</nav>`;
}
function dailyCard(p) {
  const d = dailySpec(), st = p.daily?.key === d.key ? p.daily : null, m = MAPS[d.map];
  const dt = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<section class="tr-daily" style="--a:${m.a};--b:${m.sky}">
    <div class="tr-daily-t"><div class="tr-daily-k">${icon('calendar')} Arena del giorno · ${esc(dt)}</div><b>${esc(MODES[d.mode].name)} · ${esc(m.name)}</b>
    <span>Stessa arena e stessi rivali per tutti, oggi. ${st?.done ? `Il tuo record di oggi: <em>${pctS(st.best)}</em>` : `Prima partita: <em>+${d.reward} monete</em>`}</span></div>
    <button class="btn primary" data-a="tr-daily">${icon('play')} ${st?.done ? 'Riprova' : 'Gioca'}</button></section>`;
}
function mapCards(sel, act) {
  return `<div class="tr-opts tr-maps">${Object.entries(MAPS).map(([id, m]) => `<div class="tr-opt tr-map ${sel === id ? 'on' : ''}" data-a="${act}" data-id="${id}" tabindex="0" style="--a:${m.a};--b:${m.b};--o:${m.obstC};--sky:${m.sky}"><i class="tr-mapart"></i><b>${esc(m.name)}</b><span>${esc(m.sub)}</span></div>`).join('')}</div>`;
}
function controlsHelp() {
  return `<div class="tr-keys"><span><span class="kbd">W A S D</span> / <span class="kbd">Frecce</span> sterza</span><span><span class="kbd">Mouse</span> il veicolo va verso il puntatore</span><span><span class="kbd">Tocco</span> trascina o scorri nella direzione</span><span><span class="kbd">Stick</span> / croce del controller</span><span><span class="kbd">Esc</span> / <span class="kbd">P</span> / <span class="kbd">Start</span> pausa</span></div>`;
}
function rulesHelp() {
  return `<div class="tr-keys"><span>Esci dal tuo terreno: lasci una <b>scia</b>.</span><span>Rientra: tutto ciò che la scia racchiude diventa tuo.</span><span>Se un rivale tocca la tua scia sei fuori, e viceversa.</span><span><b class="pw" style="--c:#2ee6a6">⚡</b> Turbo · <b class="pw" style="--c:#3aa0ff">🛡</b> Scudo · <b class="pw" style="--c:#bfefff">❄</b> Gelo sui rivali</span></div>`;
}
function looks(p) {
  const c = COLORS.find((x) => x.id === p.color)?.color || '#ff4d6d', t = TRAILS.find((x) => x.id === p.trail) || TRAILS[0];
  return `<div class="tr-look" data-a="tr-tab" data-id="garage" tabindex="0"><div class="tr-look-v">${vehArt(p.vehicle, c)}</div><div><b>${esc(VEHICLES.find((v) => v.id === p.vehicle)?.name || '')}</b><span>${esc(COLORS.find((x) => x.id === p.color)?.name || '')} · scia ${esc(t.name)}</span><i class="tr-trailbar" style="background:${trailCss(t, c)}"></i></div><em>${icon('palette')} Garage</em></div>`;
}

function setupSP(p) {
  const key = `${p.mode}:${p.map}`;
  return `<div class="tr-setup">
    ${dailyCard(p)}
    <section><h3>Modalità</h3><div class="tr-opts">${SP_MODES.map((id) => { const m = MODES[id]; return `<div class="tr-opt ${p.mode === id ? 'on' : ''}" data-a="tr-mode" data-id="${id}" tabindex="0">${icon(m.icon)}<b>${esc(m.name)}</b><span>${esc(m.sub)}</span>${p.best[`${id}:${p.map}`] ? `<em>Record ${pctS(p.best[`${id}:${p.map}`])}</em>` : ''}</div>`; }).join('')}</div></section>
    <section><h3>Arena</h3>${mapCards(p.map, 'tr-map')}</section>
    <section class="tr-row2">
      <div><h3>Rivali</h3><div class="tr-seg">${Object.entries(DIFFS).map(([id, d]) => `<button class="${p.diff === id ? 'on' : ''}" data-a="tr-diff" data-id="${id}">${d.name}</button>`).join('')}</div>
        <h3 class="mt16">Come si gioca</h3>${rulesHelp()}</div>
      <div><h3>Il tuo veicolo</h3>${looks(p)}<h3 class="mt16">Comandi</h3>${controlsHelp()}</div>
    </section>
    <div class="tr-go"><div class="tr-rec">${p.best[key] ? `${icon('star')} Record ${esc(MODES[p.mode].name)} · ${esc(MAPS[p.map].name)}: <b>${pctS(p.best[key])}</b>` : 'Nessun record qui: conquista la prima zolla!'}</div><button class="btn primary big" data-a="tr-play">${icon('play')} Gioca</button></div>
  </div>`;
}
function setupMP(p) {
  const m = p.mp, n = m.n;
  const slots = Array.from({ length: n }, (_, i) => {
    const c = m.colors[i] || PLAYER_COLORS[i], ctl = m.controls[i] || 'touch';
    return `<div class="tr-slot" style="--c:${c}"><b>Giocatore ${i + 1}</b>
      <button class="tr-swatch" data-a="tr-mpcolor" data-i="${i}" aria-label="Cambia colore del giocatore ${i + 1}" style="background:${c}"></button>
      <button class="btn sm tr-ctl" data-a="tr-mpctl" data-i="${i}">${icon(/^pad/.test(ctl) ? 'gamepad' : ctl === 'touch' ? 'target' : 'keyboard')} ${esc(CONTROLS[ctl].name)}</button></div>`;
  }).join('');
  return `<div class="tr-setup">
    <section class="tr-row3">
      <div><h3>Giocatori</h3><div class="tr-seg">${[2, 3, 4].map((k) => `<button class="${n === k ? 'on' : ''}" data-a="tr-mpn" data-id="${k}">${k}</button>`).join('')}</div></div>
      <div><h3>Schermo</h3><div class="tr-seg">${[['diviso', 'Diviso'], ['condiviso', 'Condiviso']].map(([id, nm]) => `<button class="${m.view === id ? 'on' : ''}" data-a="tr-mpview" data-id="${id}">${nm}</button>`).join('')}</div></div>
      <div><h3>Rivali del computer</h3><div class="tr-seg">${[0, 2, 3, 4, 6].map((k) => `<button class="${m.bots === k ? 'on' : ''}" data-a="tr-mpbots" data-id="${k}">${k}</button>`).join('')}</div></div>
    </section>
    <section><h3>Chi gioca</h3><div class="tr-slots">${slots}</div>
      <p class="tr-note">${m.view === 'diviso' ? 'Ognuno ha la sua metà (o il suo quarto) di schermo e, su tablet e telefono, tocca e trascina nella propria zona.' : 'Tutta l’arena su un solo schermo: ideale per un tablet sul tavolo. Al tocco ognuno usa la propria zona (metà o quarto) dello schermo.'} Più controller funzionano insieme.</p></section>
    <section><h3>Modalità</h3><div class="tr-opts tr-opts4">${MP_MODES.map((id) => { const mm = MODES[id]; return `<div class="tr-opt ${m.mode === id ? 'on' : ''}" data-a="tr-mpmode" data-id="${id}" tabindex="0">${icon(mm.icon)}<b>${esc(mm.name)}</b><span>${esc(id === 'classica' ? 'Vince chi arriva per primo al 45% dell’arena. Una vita sola.' : mm.sub)}</span></div>`; }).join('')}</div></section>
    <section><h3>Arena</h3>${mapCards(m.map, 'tr-mpmap')}</section>
    <div class="tr-go"><div class="tr-rec">${icon('users')} ${n} giocatori · ${m.bots} rivali · ${esc(MODES[m.mode].name)}</div><button class="btn primary big" data-a="tr-mpplay">${icon('play')} Via!</button></div>
  </div>`;
}
function garage(p) {
  const col = COLORS.find((x) => x.id === p.color)?.color || '#ff4d6d';
  const own = (list, id) => list.includes(id);
  return `<div class="tr-setup tr-garage">
    <section><h3>Colore</h3><div class="tr-grid">${COLORS.map((c) => `<div class="tr-item ${p.color === c.id ? 'on' : ''} ${own(p.colors, c.id) ? '' : 'locked'}" data-a="tr-buy" data-k="color" data-id="${c.id}" tabindex="0"><i class="tr-dot" style="background:${c.color}"></i><b>${esc(c.name)}</b><span>${own(p.colors, c.id) ? (p.color === c.id ? 'In uso' : 'Tuo') : `${icon('coin')} ${c.cost}`}</span></div>`).join('')}</div></section>
    <section><h3>Veicolo</h3><div class="tr-grid tr-grid-v">${VEHICLES.map((v) => `<div class="tr-item tr-veh ${p.vehicle === v.id ? 'on' : ''} ${own(p.vehicles, v.id) ? '' : 'locked'}" data-a="tr-buy" data-k="vehicle" data-id="${v.id}" tabindex="0">${vehArt(v.id, col)}<b>${esc(v.name)}</b><small>${esc(v.sub)}</small><span>${own(p.vehicles, v.id) ? (p.vehicle === v.id ? 'In uso' : 'Tuo') : `${icon('coin')} ${v.cost}`}</span></div>`).join('')}</div></section>
    <section><h3>Scia</h3><div class="tr-grid">${TRAILS.map((t) => `<div class="tr-item ${p.trail === t.id ? 'on' : ''} ${own(p.trails, t.id) ? '' : 'locked'}" data-a="tr-buy" data-k="trail" data-id="${t.id}" tabindex="0"><i class="tr-trailbar" style="background:${trailCss(t, col)}"></i><b>${esc(t.name)}</b><span>${own(p.trails, t.id) ? (p.trail === t.id ? 'In uso' : 'Tua') : `${icon('coin')} ${t.cost}`}</span></div>`).join('')}</div></section>
    <p class="tr-note">Le monete si guadagnano giocando: terreno conquistato, eliminazioni, missioni e arena del giorno. Niente pubblicità, niente acquisti.</p>
  </div>`;
}

function results(r, p) {
  if (r.mp) {
    const title = r.teams ? `Vincono i ${r.teams[0].name}!` : `Vince ${r.winner}!`;
    return `<div class="tr-res" role="dialog" aria-label="Risultati"><div class="tr-res-card">
      <div class="tr-res-k">${esc(MODES[r.mode].name)} · ${esc(MAPS[r.map].name)} · ${r.humans.length} giocatori</div>
      <h2>${esc(title)}</h2>
      ${r.teams ? `<div class="tr-res-teams">${r.teams.map((t) => `<div style="--c:${t.color}"><b>${esc(t.name)}</b><span>${pctS(t.pct)}</span></div>`).join('')}</div>` : ''}
      <ol class="tr-res-rank">${r.humans.slice().sort((a, b) => b.pct - a.pct || b.best - a.best).map((h, i) => `<li class="me" style="--c:${h.color}"><span>${i + 1}</span><i></i><b>${esc(h.name)}</b><em>${pctS(h.pct)} · record ${pctS(h.best)} · ✖${h.kills}</em></li>`).join('')}</ol>
      ${!r.teams ? `<ol class="tr-res-rank small">${r.ranking.slice(0, 8).map((h, i) => `<li class="${h.player ? 'me' : ''}" style="--c:${h.color}"><span>${i + 1}</span><i></i><b>${esc(h.name)}</b><em>${h.out ? 'fuori' : pctS(h.pct)}</em></li>`).join('')}</ol>` : ''}
      <div class="tr-res-btns"><button class="btn primary" data-a="tr-again">${icon('replay')} Rivincita</button><button class="btn" data-a="tr-back">${icon('left')} Menu Territorio</button><button class="btn ghost" data-a="tr-hall">${icon('gamepad')} Baso Hub</button></div>
    </div></div>`;
  }
  const key = r.daily ? `daily:${r.daily}` : `${r.mode}:${r.map}`;
  const title = r.win ? (r.mode === 'classica' ? 'Arena conquistata!' : r.mode === 'squadre' ? 'La tua squadra vince!' : 'Primo posto!') : r.why === 'out' ? (r.mode === 'classica' ? 'Eliminato!' : 'Fuori gioco') : r.mode === 'squadre' ? 'Ha vinto l’altra squadra' : `${r.pos}° posto`;
  return `<div class="tr-res" role="dialog" aria-label="Risultati"><div class="tr-res-card">
    <div class="tr-res-k">${r.daily ? 'Arena del giorno · ' : ''}${esc(MODES[r.mode].name)} · ${esc(MAPS[r.map].name)}</div>
    <h2>${esc(title)}</h2>
    <div class="tr-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? 'on' : ''}">★</i>`).join('')}</div>
    <div class="tr-res-score"><span>${pctS(r.bestPct)}</span> massimo conquistato ${r.record ? '<em>Nuovo record!</em>' : `<small>record ${pctS(p.best[key] || 0)}</small>`}</div>
    <div class="tr-res-stats">
      <div><b>${r.mode === 'squadre' ? pctS(r.teamPct) : `${r.pos}/${r.of}`}</b><span>${r.mode === 'squadre' ? 'squadra' : 'posizione'}</span></div>
      <div><b>${r.kills}</b><span>eliminazioni</span></div>
      <div><b>${r.loops}</b><span>giri chiusi</span></div>
      <div><b>${fmt(r.bigLoop)}</b><span>giro più grande</span></div>
      <div><b>+${r.coins + (r.dailyBonus || 0)}</b><span>monete</span></div>
    </div>
    ${r.missions?.length ? `<ul class="tr-res-miss">${r.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : '✗'}</i><span>${esc(m.text)}</span><em>${m.done ? `+${m.coins}` : `${Math.floor(m.have)}/${m.n}`}</em></li>`).join('')}</ul>` : ''}
    ${r.dailyBonus ? `<div class="tr-res-big">Bonus arena del giorno: <b>+${r.dailyBonus} monete</b></div>` : ''}
    ${r.teams ? `<div class="tr-res-teams">${r.teams.map((t) => `<div style="--c:${t.color}"><b>${esc(t.name)}</b><span>${pctS(t.pct)}</span></div>`).join('')}</div>` : `<ol class="tr-res-rank">${r.ranking.slice(0, 8).map((h, i) => `<li class="${h.player ? 'me' : ''}" style="--c:${h.color}"><span>${i + 1}</span><i></i><b>${esc(h.name)}</b><em>${h.out && r.mode === 'classica' && !h.player ? 'fuori' : pctS(h.pct)}</em></li>`).join('')}</ol>`}
    <div class="tr-res-btns"><button class="btn primary" data-a="tr-again">${icon('replay')} Rivincita</button><button class="btn" data-a="tr-back">${icon('left')} Menu Territorio</button><button class="btn ghost" data-a="tr-hall">${icon('gamepad')} Baso Hub</button></div>
  </div></div>`;
}

function stopGame() { T.game?.destroy(); T.game = null; window.__territorio = null; }

function saveResult(r) {
  const st = trLoad();
  if (r.mp) { st.games++; trSave(st); return st; }
  const key = r.daily ? `daily:${r.daily}` : `${r.mode}:${r.map}`;
  r.record = r.bestPct > (st.best[key] || 0) + 0.001;
  if (r.record) st.best[key] = +r.bestPct.toFixed(2);
  if (r.daily) {
    const first = st.daily?.key !== r.daily || !st.daily.done;
    if (first) r.dailyBonus = T.daily?.reward || 0;
    st.daily = { key: r.daily, done: true, best: Math.max(st.daily?.key === r.daily ? st.daily.best || 0 : 0, r.bestPct) };
  }
  st.games++; if (r.win) st.wins++;
  st.kills += r.kills; st.coins += r.coins + (r.dailyBonus || 0);
  trSave(st);
  return st;
}

registerScreen({
  id: 'territorio', full: true,
  render(params) {
    if (params?.from) T.from = params.from; else if (params?.to === 'territorio') T.from = 'launcher';
    // the hub can preselect a mode / tab or start straight away (once: refresh renders with the same params)
    if (params?.tab) { T.tab = params.tab; delete params.tab; }
    if (params?.mode && MODES[params.mode] && !MODES[params.mode].mpOnly) { const p = trLoad(); p.mode = params.mode; trSave(p); T.tab = 'gioca'; delete params.mode; }
    if (params?.daily && !T.playing) { delete params.daily; T.daily = dailySpec(); T.mp = false; T.playing = true; }
    if (params?.quick && !T.playing && !T.quickDone) { T.quickDone = true; T.playing = true; T.daily = null; T.mp = false; }
    if (T.playing) return `<div class="tr-stage"><div class="tr-root" id="tr-root"><div class="tr-loading">Si traccia l’arena…</div></div><div class="tr-over" id="tr-over"></div></div>`;
    const p = trLoad();
    return `<div class="full-screen tr-menu">
      ${pageHead({ back: T.from, eyebrow: 'Baso Hub · Arcade', title: 'Territorio', sub: 'Esci dal tuo terreno, disegna una scia e richiudila: tutto ciò che hai racchiuso è tuo. Ma se ti tagliano la scia sei fuori.', right: wallet(p) })}
      ${tabs(T.tab)}
      ${T.tab === 'multi' ? setupMP(p) : T.tab === 'garage' ? garage(p) : setupSP(p)}
    </div>`;
  },
  async mount() {
    if (!T.playing) { requestAnimationFrame(() => document.querySelector('.tr-go .btn, .tr-tab.on')?.focus({ preventScroll: true })); return; }
    const root = document.getElementById('tr-root');
    const p = trLoad();
    try { music.setMood?.('voragine'); } catch {}
    const { TerritorioGame } = await import('../territorio/game.js');
    if (!T.playing || !root.isConnected) return;
    const s = getSettings(), D = T.daily;
    const col = COLORS.find((c) => c.id === p.color)?.color || '#ff4d6d';
    let opts;
    if (T.mp) {
      const m = p.mp;
      opts = { mode: m.mode, map: m.map, view: m.view, bots: m.bots, humans: Array.from({ length: m.n }, (_, i) => ({ name: `G${i + 1}`, color: m.colors[i] || PLAYER_COLORS[i], vehicle: i === 0 ? p.vehicle : VEHICLES[i % VEHICLES.length].id, trail: 'liscia', control: m.controls[i] || 'touch' })) };
    } else {
      opts = { mode: D ? D.mode : p.mode, map: D ? D.map : p.map, diff: D ? D.diff : p.diff, daily: D, humans: [{ name: 'Tu', color: col, vehicle: p.vehicle, trail: p.trail, control: 'all' }] };
    }
    const g = T.game = new TerritorioGame(root, {
      ...opts, tier: gfxTier(), volume: s.sound === false ? 0 : 0.6,
      onPause: (on) => {
        const ov = document.getElementById('tr-over'); if (!ov) return;
        ov.innerHTML = on ? `<div class="tr-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2>${g.missions ? `<ul class="tr-res-miss">${g.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : ''}</i><span>${esc(m.text)}</span><em>+${m.coins}</em></li>`).join('')}</ul>` : ''}<button class="btn primary" data-a="tr-resume">${icon('play')} Riprendi</button><button class="btn" data-a="tr-restart">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="tr-quit">${icon('left')} Esci</button></div>` : '';
        if (on) requestAnimationFrame(() => ov.querySelector('.btn')?.focus());
      },
      onEnd: (r) => {
        const st = saveResult(r);
        const ov = document.getElementById('tr-over'); if (!ov || !T.playing) return;
        ov.innerHTML = results(r, st);
        try { (r.mp || r.win || r.stars >= 2) ? sfx.win() : sfx.ok(); } catch {}
        requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus({ preventScroll: true }));
      },
    });
    window.__territorio = g;
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="tr-loading">Impossibile avviare il gioco: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="tr-back">Indietro</button></div>`; }
  },
  unmount() { stopGame(); T.playing = false; T.quickDone = false; },
  actions: {
    'tr-tab'(el) { T.tab = el.dataset.id; sfx.click?.(); App.refresh(); },
    'tr-mode'(el) { const p = trLoad(); p.mode = el.dataset.id; trSave(p); App.refresh(); },
    'tr-map'(el) { const p = trLoad(); p.map = el.dataset.id; trSave(p); App.refresh(); },
    'tr-diff'(el) { const p = trLoad(); p.diff = el.dataset.id; trSave(p); App.refresh(); },
    'tr-mpn'(el) { const p = trLoad(); p.mp.n = +el.dataset.id; trSave(p); App.refresh(); },
    'tr-mpview'(el) { const p = trLoad(); p.mp.view = el.dataset.id; trSave(p); App.refresh(); },
    'tr-mpbots'(el) { const p = trLoad(); p.mp.bots = +el.dataset.id; trSave(p); App.refresh(); },
    'tr-mpmode'(el) { const p = trLoad(); p.mp.mode = el.dataset.id; trSave(p); App.refresh(); },
    'tr-mpmap'(el) { const p = trLoad(); p.mp.map = el.dataset.id; trSave(p); App.refresh(); },
    'tr-mpcolor'(el) {
      const p = trLoad(), i = +el.dataset.i, used = p.mp.colors.slice(0, p.mp.n);
      let k = MP_PALETTE.indexOf(used[i]);
      for (let t = 0; t < MP_PALETTE.length; t++) { k = (k + 1) % MP_PALETTE.length; if (!used.includes(MP_PALETTE[k])) break; }
      p.mp.colors[i] = MP_PALETTE[k]; trSave(p); App.refresh();
    },
    'tr-mpctl'(el) { const p = trLoad(), i = +el.dataset.i; p.mp.controls[i] = CTRL_IDS[(CTRL_IDS.indexOf(p.mp.controls[i] || 'touch') + 1) % CTRL_IDS.length]; trSave(p); App.refresh(); },
    'tr-buy'(el) {
      const p = trLoad(), k = el.dataset.k, id = el.dataset.id;
      const list = { color: COLORS, vehicle: VEHICLES, trail: TRAILS }[k], owned = { color: 'colors', vehicle: 'vehicles', trail: 'trails' }[k];
      const it = list?.find((x) => x.id === id); if (!it) return;
      if (p[owned].includes(id)) { p[k] = id; trSave(p); sfx.click?.(); App.refresh(); return; }
      if (p.coins < it.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${it.cost - p.coins} monete per «${it.name}». Le guadagni giocando.`, 'bad'); return; }
      App.confirm(`Sbloccare «${it.name}»?`, `Costa ${it.cost} monete (ne hai ${p.coins}).`, () => { const q = trLoad(); if (q.coins < it.cost) return; q.coins -= it.cost; q[owned].push(id); q[k] = id; trSave(q); sfx.coin?.(); App.refresh(); });
    },
    'tr-play'() { T.daily = null; T.mp = false; T.playing = true; App.refresh(); },
    'tr-mpplay'() { T.daily = null; T.mp = true; T.playing = true; App.refresh(); },
    'tr-daily'() { T.daily = dailySpec(); T.mp = false; T.playing = true; App.refresh(); },
    'tr-resume'() { T.game?.togglePause(false); },
    'tr-restart'() { stopGame(); App.refresh(); },
    'tr-again'() { stopGame(); App.refresh(); },
    'tr-quit'() { stopGame(); T.playing = false; App.refresh(); },
    'tr-back'() { stopGame(); T.playing = false; App.refresh(); },
    'tr-hall'() { stopGame(); T.playing = false; App.go('launcher'); },
  },
});
