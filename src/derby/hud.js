// In-race HUD, messages, pause overlay and results for "Scontro Totale". Styles: derby.css.
import './derby.css';
import './v5.css';
import { CHAMPIONSHIP, champGet } from './champ.js';
import { VENUES } from './tracks.js';
import { MODES, MEDALS, MEDAL_COLORS, CUPS } from './career.js';
import { panel as panel5, TEAM } from './modes.js';
export const medalSVG = (m, size = 64) => `<svg viewBox="0 0 64 64" width="${size}" height="${size}" class="dzx-medal m${m}"><path d="M20 2h10l6 20h-10zM44 2H34l-6 20h10z" fill="${m ? '#c8102e' : '#444'}"/><circle cx="32" cy="40" r="20" fill="${MEDAL_COLORS[m]}" stroke="rgba(0,0,0,.35)" stroke-width="3"/><circle cx="32" cy="40" r="13" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2"/><text x="32" y="47" text-anchor="middle" font-size="20" font-weight="900" font-family="Exo 2, sans-serif" fill="rgba(0,0,0,.55)">${m ? '★' : '–'}</text></svg>`;

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildHud(game) {
  const h = document.createElement('div'); h.className = 'dzx'; game.c.appendChild(h);
  const arena = game.track.arena;
  h.innerHTML = `<div class="dzx-top"><div class="dzx-pos"><b id="dzx-pos">1</b><small>/${game.cars.length}</small></div>
      <div class="dzx-info"><div class="dzx-lap" id="dzx-lap"></div><div class="dzx-time" id="dzx-time">0:00.00</div><div class="dzx-laps" id="dzx-laps"></div></div></div>
    <div class="dzx-score"><span>PUNTI SCONTRO</span><b id="dzx-score">0</b></div>
    <div class="dzx-mode" id="dzx-mode"></div>
    <div class="dzx-big" id="dzx-big"></div>
    <div class="dzx-callout" id="dzx-callout"></div>
    <div class="dzx-feed" id="dzx-feed"></div>
    <div class="dzx-spec" id="dzx-spec"><b id="dzx-spec-t">ELIMINATO</b><span><s id="dzx-spec-w">Segui il leader:</s> <i id="dzx-spec-n"></i> · <em id="dzx-spec-l"></em></span><button class="btn sm" id="dzx-spec-x">Vai ai risultati · Invio / A</button></div>
    <svg class="dzx-carmap" id="dzx-carmap" viewBox="0 0 56 96"><path class="z-front" d="M12 6 Q28 -2 44 6 L46 24 H10 Z"/><path class="z-left" d="M10 26 H18 V70 H10 Z"/><path class="z-right" d="M38 26 H46 V70 H38 Z"/><rect class="z-cab" x="20" y="30" width="16" height="34" rx="3"/><path class="z-rear" d="M10 72 H46 L44 90 Q28 96 12 90 Z"/><rect class="w0" x="3" y="14" width="6" height="14" rx="2"/><rect class="w1" x="47" y="14" width="6" height="14" rx="2"/><rect class="w2" x="3" y="66" width="6" height="14" rx="2"/><rect class="w3" x="47" y="66" width="6" height="14" rx="2"/></svg>
    <div class="dzx-dmg" id="dzx-dmg"></div><div class="dzx-heat" id="dzx-heat"><span>TEMP</span><div><i></i></div></div><div class="dzx-obj" id="dzx-obj"></div><div class="dzx-pit" id="dzx-pit"></div>
    <div class="dzx-board" id="dzx-board"></div>
    <div class="dzx-msgs" id="dzx-msgs"></div>
    <div class="dzx-count" id="dzx-count"><div class="dzx-lights"><i></i><i></i><i></i></div><b></b></div>
    <div class="dzx-warn" id="dzx-warn"></div>
    <div class="dzx-dash">
      <div class="dzx-rpm"><i id="dzx-rpm"></i></div>
      <div class="dzx-sp"><b id="dzx-spd">0</b><small>km/h</small><span class="dzx-gear" id="dzx-gear">N</span></div>
      <div class="dzx-bar nitro"><span>NITRO</span><div><i id="dzx-nitro"></i><s></s></div></div>
      <div class="dzx-bar dmg"><span>TELAIO</span><div><i id="dzx-hp"></i></div></div></div>
    <canvas class="dzx-map" id="dzx-map" width="220" height="220"></canvas>
    <div class="dzx-help">W/S gas e freno · A/D sterzo · Spazio freno a mano · Shift nitro · Q guarda dietro · C camera · R riposiziona · T ricomincia · F filtro · O foto · Esc pausa · Gamepad: grilletti, stick, A nitro, B freno a mano, X camera, Y riposiziona, LB guarda dietro</div>
    <div class="dzx-slow" id="dzx-slow"></div>
    <div class="dzx-photo" id="dzx-photo"><b>${'MODALITÀ FOTO'}</b><span>Trascina: ruota · Tasto destro/Shift: sposta · Rotella o W/S: zoom · Q/E: altezza · Z/X: obiettivo · R/T: inclina · F: filtro <i id="dzx-photo-f"></i> · H: nascondi · <u>Invio: scatta</u> · O/Esc: esci</span><em id="dzx-photo-m"></em></div>
    <div class="dzx-over dzx-pause" id="dzx-pause"><h2>Pausa</h2><div class="dzx-btns"><button class="btn primary lg" data-a="dz-resume">Riprendi</button><button class="btn lg" data-a="dz-restart">Ricomincia</button>${game.mode === 'parco' ? '<button class="btn lg" id="dzx-end-btn">Termina la sessione</button>' : ''}<button class="btn lg" id="dzx-photo-btn">Modalità foto</button><button class="btn ghost lg" data-a="dz-quit">Esci</button></div></div>
    <div class="dzx-over dzx-results" id="dzx-results"></div>
    <div class="dzx-replay" id="dzx-replay"><b>REPLAY</b><span>Il botto più bello della gara</span><button class="btn sm" id="dzx-replay-x">Salta · Invio / A</button></div>`;
  const $ = (id) => h.querySelector('#' + id);
  game.hud = { mode: $('dzx-mode'), big: $('dzx-big'), root: h, pause: $('dzx-pause'), pos: $('dzx-pos'), lap: $('dzx-lap'), time: $('dzx-time'), laps: $('dzx-laps'), board: $('dzx-board'), msgs: $('dzx-msgs'), count: $('dzx-count'), warn: $('dzx-warn'), rpm: $('dzx-rpm'), spd: $('dzx-spd'), gear: $('dzx-gear'), nitro: $('dzx-nitro'), hp: $('dzx-hp'), score: $('dzx-score'), slow: $('dzx-slow'), results: $('dzx-results'), replay: $('dzx-replay'), callout: $('dzx-callout'), feed: $('dzx-feed'), spec: $('dzx-spec'), specN: $('dzx-spec-n'), specL: $('dzx-spec-l'), specT: $('dzx-spec-t'), specW: $('dzx-spec-w'), carmap: $('dzx-carmap'), dmg: $('dzx-dmg'), heat: $('dzx-heat'), obj: $('dzx-obj'), pit: $('dzx-pit') }
  $('dzx-spec-x').addEventListener('click', () => game.endSpectate());;
  $('dzx-replay-x').addEventListener('click', () => game.stopReplay());
  $('dzx-photo-btn').addEventListener('click', () => game.photoMode(true));
  $('dzx-end-btn')?.addEventListener('click', () => { game.togglePause(); game.finishOrder = game.standings(); game.finish(); });
  game.hud.photoF = $('dzx-photo-f'); game.hud.photoMsg = $('dzx-photo-m');
  if (arena) h.querySelector('.dzx-laps').style.display = 'none';
  h.classList.add('mode-' + game.mode);
  if (game.mode === 'stunt' || game.mode === 'time') h.querySelector('.dzx-pos').style.display = 'none';
  // minimap
  const tr = game.track, cv = $('dzx-map'), g = cv.getContext('2d');
  const [x0, z0, x1, z1] = tr.bbox; const s = 186 / Math.max(x1 - x0, z1 - z0);
  game.mapXY = (x, z) => [110 + (x - (x0 + x1) / 2) * s, 110 + (z - (z0 + z1) / 2) * s];
  const bg = document.createElement('canvas'); bg.width = bg.height = 220; const bgc = bg.getContext('2d');
  bgc.lineCap = bgc.lineJoin = 'round';
  const path = () => { bgc.beginPath(); if (tr.arena) bgc.arc(110, 110, tr.R * s, 0, 7); else tr.pts.forEach((p, i) => { const [x, y] = game.mapXY(p.x, p.z); i ? bgc.lineTo(x, y) : bgc.moveTo(x, y); }); bgc.closePath(); };
  bgc.lineWidth = 11; bgc.strokeStyle = 'rgba(0,0,0,0.55)'; path(); bgc.stroke();
  bgc.lineWidth = 6; bgc.strokeStyle = 'rgba(255,255,255,0.8)'; path(); bgc.stroke();
  if (!tr.arena) { const p = tr.pts[0], [x, y] = game.mapXY(p.x, p.z); bgc.fillStyle = '#ff3b3b'; bgc.fillRect(x - 3, y - 3, 6, 6); }
  game.mapDraw = () => {
    g.clearRect(0, 0, 220, 220); g.drawImage(bg, 0, 0);
    for (const c of game.cars) { if (c.out && !c.isPlayer) continue; const p = c.body.translation(); const [x, y] = game.mapXY(p.x, p.z); g.fillStyle = c.isPlayer ? '#ffd400' : c.color; g.beginPath(); g.arc(x, y, c.isPlayer ? 6 : 4.2, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = c.isPlayer ? 2 : 1; g.stroke(); }
  };
}

export function message(game, text, kind = 'info', sub = '') {
  const box = game.hud?.msgs; if (!box) return;
  const el = document.createElement('div'); el.className = 'dzx-msg ' + kind; el.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`; box.prepend(el);
  setTimeout(() => el.classList.add('out'), kind === 'big' ? 2200 : 1700); setTimeout(() => el.remove(), kind === 'big' ? 2700 : 2200);
  while (box.children.length > 4) box.lastChild.remove();
}

export function updateHud(game, dt) {
  const H = game.hud, P = game.player; game._hudT = (game._hudT || 0) + dt;
  if (game.state === 'countdown') {
    const n = Math.ceil(game.countdown - 0.6); H.count.className = 'dzx-count on'; H.count.querySelector('b').textContent = n > 0 ? n : 'VIA!';
    H.count.querySelectorAll('i').forEach((el, i) => el.classList.toggle('lit', n > 0 ? i < 4 - n : true));
    H.count.classList.toggle('go', n <= 0);
  } else if (game.time < 1 && game.state === 'race') { H.count.className = 'dzx-count on go'; H.count.querySelector('b').textContent = 'VIA!'; }
  else H.count.className = 'dzx-count';
  const sp = P.dyn?.speed || 0;
  H.spd.textContent = Math.round(sp * 3.6);
  H.gear.textContent = P.gearLabel || 'N';
  H.rpm.style.width = Math.round(Math.min(1, P.rpm || 0) * 100) + '%'; H.rpm.classList.toggle('red', (P.rpm || 0) > 0.92);
  H.nitro.style.width = P.nitro + '%'; H.nitro.parentNode.parentNode.classList.toggle('on', !!P.boost);
  H.hp.style.width = P.hp + '%'; H.hp.style.background = P.hp > 50 ? '#3ddc84' : P.hp > 25 ? '#ffb020' : '#ff3b3b';
  H.score.textContent = Math.round(P.score || 0);
  H.slow.classList.toggle('on', game.timeScale < 0.9);
  // warnings: wrong way / respawn hint
  let warn = '';
  if (game.state === 'race') {
    if (P.wrongWayT > 1.5) warn = 'CONTROMANO!';
    else if (P.hp <= 0 && !game.track.arena) warn = 'AUTO DISTRUTTA · ricambi in arrivo…';
    else if (P.flipT > 1.2 || P.stuckHintT > 2.5) warn = 'Premi R (o Y) per riposizionarti';
  }
  if (game.mode === 'stunt') { const S = game.stunt, txt = S.phase === 'air' ? `${(S.live || 0).toFixed(1).replace('.', ',')} m` : ''; if (H.big.textContent !== txt) { H.big.textContent = txt; H.big.classList.toggle('on', !!txt); } }
  if (game.mode === 'elim' && game.state === 'race' && !P.out) { const act = game.cars.filter((c) => !c.out); if (act.length > 1 && act.every((c) => c === P || (c.prog || 0) > (P.prog || 0))) warn = warn || 'SEI ULTIMO: RISCHI L’ELIMINAZIONE!'; }
  if (H.warn.textContent !== warn) { H.warn.textContent = warn; H.warn.classList.toggle('on', !!warn); }
  if (game._hudT < 0.12) return; game._hudT = 0;
  const st = game.standings(); const myPos = st.indexOf(P) + 1;
  // damage diagram: each panel goes green -> amber -> red with the hits it took; lost wheels blink
  const zd = P.zoneDmg || {}, col = (d) => { const k = Math.min(1, d / 55); return k < 0.5 ? `hsl(${130 - k * 160},75%,48%)` : `hsl(${50 - (k - 0.5) * 100},85%,${50 - (k - 0.5) * 16}%)`; };
  for (const z of ['front', 'rear', 'left', 'right']) { const el = H.carmap.querySelector('.z-' + z); const c = col(zd[z] || 0); if (el._c !== c) { el._c = c; el.style.fill = c; } }
  H.carmap.querySelector('.z-cab').style.fill = col((100 - P.hp) * 0.55);
  P.wheelLost.forEach((l, i) => H.carmap.querySelector('.w' + i).classList.toggle('lost', l));
  H.nitro.parentNode.parentNode.classList.toggle('ready', P.nitro >= 25);
  if (game.spectate) {
    const n = game.cars.filter((c) => !c.out).length, ar = game.track.arena, sp = game.spectate;
    const w = ar ? 'In camera:' : 'Segui il leader:'; if (H.specW && H.specW.textContent !== w) H.specW.textContent = w;
    H.specN.textContent = ar ? `${sp.name} · ${Math.max(0, Math.round(sp.hp))}%${sp.kills ? ` · ${sp.kills} KO` : ''}` : sp.name;
    H.specL.textContent = ar ? `${n} ancora nell’arena` : `${n} ancora in gara`;
  }
  if (H.pos.textContent !== String(myPos)) { const up = +H.pos.textContent > myPos && game.state === 'race'; H.pos.textContent = myPos; const box = H.pos.parentNode; box.classList.remove('up', 'down'); void box.offsetWidth; box.classList.add(up ? 'up' : 'down'); }
  H.lap.textContent = game.mode === 'parco' ? 'GIRO LIBERO' : game.track.arena ? `IN GARA ${game.cars.filter((c) => !c.out && !c.benched).length}/${game.cars.filter((c) => !c.benched).length}` : game.mode === 'stunt' ? `TENTATIVO ${game.stunt.att}/${game.stunt.max}` : game.mode === 'elim' ? `GIRO ${P.lap + 1} · IN GARA ${game.cars.filter((c) => !c.out).length}` : `GIRO ${Math.min(game.laps, P.lap + 1)}/${game.laps}`;
  const t = game.state === 'countdown' ? 0 : game.time; H.time.textContent = fmt(t);
  if (!game.track.arena) H.laps.innerHTML = `${P.lastLap ? `Ultimo ${fmt(P.lastLap)}` : ''}${P.bestLap ? ` · <b>Migliore ${fmt(P.bestLap)}</b>` : ''}`;
  modePanel(game, H);
  damagePanel(game, H);
  H.board.innerHTML = st.filter((c) => !c.benched).map((c, i) => `<div class="${c.isPlayer ? 'me' : ''} ${c.out ? 'out' : ''}" ${c.team != null ? `style="box-shadow:inset 3px 0 ${TEAM[c.team].css}"` : ''}><b>${i + 1}</b><i style="background:${c.color}"></i><span>${esc(c.name)}</span>${c.ai && !c.isPlayer ? `<u class="${c.ai.pers}" title="${c.ai.pers}"></u>` : ''}<em style="width:${Math.max(0, c.hp) * 0.3}px;background:${c.hp > 50 ? '#3ddc84' : c.hp > 25 ? '#ffb020' : '#ff3b3b'}"></em></div>`).join('');
  game.mapDraw();
}

function modePanel(game, H) {
  const m = game.mode; let html = '';
  const tgt = (t, i, cur) => `<span class="m${3 - i} ${cur != null && cur > t ? 'gone' : ''}"><i></i>${fmt(t)}</span>`;
  if (m === 'time' && game.targets) { const cur = game.state === 'countdown' ? 0 : game.time; html = `<div class="dzx-mh">Contro il tempo${game.ghost ? ` · fantasma <b>${fmt(game.ghost.time)}</b>` : ''}</div><div class="dzx-tg">${[2, 1, 0].map((k, i) => tgt(game.targets[k], i, cur)).join('')}</div>`; }
  else if (m === 'stunt') { const S = game.stunt, T = game.targets; html = `<div class="dzx-mh">Salto in lungo · migliore <b>${S.best ? S.best.toFixed(1).replace('.', ',') + ' m' : '—'}</b></div><div class="dzx-tg">${[2, 1, 0].map((k, i) => `<span class="m${3 - i} ${S.best >= T[k] ? 'got' : ''}"><i></i>${T[k]} m</span>`).join('')}</div><div class="dzx-att">${Array.from({ length: S.max }, (_, i) => `<u class="${i < S.dists.length ? 'done' : i === S.att - 1 ? 'cur' : ''}">${i < S.dists.length ? (S.dists[i] ? S.dists[i].toFixed(1).replace('.', ',') : 'X') : i + 1}</u>`).join('')}</div>`; }
  else if (m === 'caccia' && game.lepre) { const L = game.lepre, d = Math.min(100, Math.round(game.huntDmg || 0)); const a = L.body.translation(), b = game.player.body.translation(); const dist = Math.round(Math.hypot(a.x - b.x, a.z - b.z)); html = `<div class="dzx-mh">La Lepre · ${dist} m · danni inflitti <b>${d}%</b></div><div class="dzx-hunt"><i style="width:${d}%"></i><s style="left:15%"></s><s style="left:40%"></s></div>`; }
  else if (m === 'elim') { html = `<div class="dzx-mh">Eliminazione · l’ultimo a fine giro esce</div>`; }
  else html = panel5(game);
  if (H.mode._h !== html) { H.mode._h = html; H.mode.innerHTML = html; H.mode.classList.toggle('on', !!html); }
}

export function showResults(game, R = null) {
  const arena = game.track.arena, mode = game.mode;
  R ||= game.computeResult();
  const res = R.rows, P = game.player, myPos = R.pos;
  const ev = game.o.event || null;
  let champHtml = '';
  if (game.o.championship) {
    const ch = game.champResult || champGet();
    if (ch) {
      const rows = Object.entries(ch.points).sort((a, b) => b[1] - a[1]);
      const next = CHAMPIONSHIP.events[ch.round];
      const nv = VENUES.find((v) => v.id === next);
      champHtml = `<div class="dzx-champ"><div class="dzx-sub">${esc(CHAMPIONSHIP.name)} · dopo ${ch.round}/${CHAMPIONSHIP.events.length} eventi</div>
        <table class="tbl"><tbody>${rows.slice(0, 8).map(([n, p], i) => `<tr class="${n === P.name ? 'me' : ''}"><td>${i + 1}</td><td>${esc(n)}</td><td><b>${p}</b> pt</td></tr>`).join('')}</tbody></table>
        <div class="tiny muted">${nv ? `Prossimo evento: <b>${esc(nv.name)}</b>` : `<b>Campionato concluso!</b> ${rows[0][0] === P.name ? '🏆 Sei il campione!' : `Campione: ${esc(rows[0][0])}`}`}</div></div>`;
    }
  }
  // headline per event type
  let title, detail = '';
  const m = R.medal;
  if (mode === 'stunt') { title = R.distance ? `${R.distance.toFixed(1).replace('.', ',')} m` : 'Nessun salto valido'; detail = `<div class="dzx-att big">${R.dists.map((d, i) => `<u class="done ${d && d === R.distance ? 'best' : ''}"><small>Salto ${i + 1}</small>${d ? d.toFixed(1).replace('.', ',') + ' m' : 'nullo'}</u>`).join('')}</div><div class="dzx-tg res">${[0, 1, 2].map((k) => `<span class="m${k + 1} ${R.distance >= R.targets[k] ? 'got' : ''}"><i></i>${MEDALS[k + 1]} ${R.targets[k]} m</span>`).join('')}</div>`; }
  else if (mode === 'time') { title = R.time ? fmt(R.time) : 'Non classificato'; detail = `<div class="dzx-tg res">${[0, 1, 2].map((k) => `<span class="m${k + 1} ${R.time && R.time <= R.targets[k] ? 'got' : ''}"><i></i>${MEDALS[k + 1]} ${fmt(R.targets[k])}</span>`).join('')}</div><div class="small muted mt8" style="text-align:center">${P.bestLap ? `Giro migliore ${fmt(P.bestLap)}` : ''}${R.newGhost ? ` · <b style="color:#3ddc84">Nuovo record della pista: il tuo fantasma ti aspetta!</b>` : R.ghostPrev ? ` · Record: ${fmt(R.ghostPrev)}` : ''}</div>`; }
  else if (mode === 'caccia') { title = R.huntWreck ? 'LEPRE DEMOLITA!' : `Danni alla Lepre: ${R.huntDmg}%`; detail = `<div class="dzx-hunt res"><i style="width:${R.huntDmg}%;background:linear-gradient(90deg,#ff6a00,#ffcf3a)"></i><s style="left:15%"></s><s style="left:40%"></s></div><div class="small muted mt8">Bronzo 15% · Argento 40% · Oro: demoliscila</div>`; }
  else if (mode === 'squadre') { title = R.teamWon ? `VINCONO I ${R.winTeam.toUpperCase()}!` : `Vincono i ${esc(R.winTeam)}`; detail = `<div class="small muted mt8" style="text-align:center">${R.teamWon ? (R.alive ? 'Squadra vincente e tu ancora in moto: oro!' : 'La tua squadra ha vinto, ma tu eri già a pezzi: argento') : 'Sconfitta: bronzo se hai demolito almeno un avversario'}</div>`; }
  else if (mode === 'ondate') { title = `${R.waves} ondat${R.waves === 1 ? 'a' : 'e'} respint${R.waves === 1 ? 'a' : 'e'}`; detail = `<div class="dzx-tg res">${[2, 4, 6].map((k, i) => `<span class="m${i + 1} ${R.waves >= k ? 'got' : ''}"><i></i>${MEDALS[i + 1]} ${k} ondate</span>`).join('')}</div>`; }
  else if (mode === 'distruzione') { title = R.time ? fmt(R.time) : 'Non classificato'; detail = `<div class="dzx-tg res">${[0, 1, 2].map((k) => `<span class="m${k + 1} ${R.time && R.time <= R.targets[k] ? 'got' : ''}"><i></i>${MEDALS[k + 1]} ${fmt(R.targets[k])}</span>`).join('')}</div><div class="small muted mt8" style="text-align:center">Cronometro ${R.rawTime ? fmt(R.rawTime) : '—'} · bonus distruzione −${(R.smash || 0).toFixed(1).replace('.', ',')} s · ${R.props} oggetti</div>`; }
  else if (mode === 'parco') { title = 'Giro libero'; detail = `<div class="small muted mt8" style="text-align:center">Punti ${R.score} · salto migliore ${Math.round(game.maxJump || 0)} m · giri della morte ${game.loops || 0} · ${R.props} oggetti distrutti</div>`; }
  else if (mode === 're') title = myPos === 1 ? '♛ RE DELLA COLLINA!' : `${myPos}° · ${R.crown.toFixed(1).replace('.', ',')} s di corona`;
  else title = myPos === 1 ? '🏆 VITTORIA!' : `${myPos}° posto`;
  const showTable = !['stunt', 'time', 'distruzione', 'parco'].includes(mode);
  const table = showTable ? `<table class="tbl"><thead><tr><th>Pos</th><th>Pilota</th><th>${arena ? 'Stato' : mode === 'elim' ? 'Esito' : 'Tempo'}</th>${arena || mode === 'elim' ? '' : '<th>Giro migliore</th>'}<th>Demolizioni</th><th>Punti scontro</th></tr></thead><tbody>${res.map((c, i) => `<tr class="${c.isPlayer ? 'me' : ''} ${c.lepre ? 'lepre' : ''}"><td>${i + 1}</td><td><i class="dzx-dot" style="background:${c.color}"></i>${esc(c.name)}</td><td>${arena ? (c.out ? 'Distrutto' : 'In piedi') : mode === 'elim' ? (c.out ? `Eliminato al giro ${c.elimLap || '?'}` : 'Sopravvissuto') : c.finished ? fmt(c.time) : 'In pista'}</td>${arena || mode === 'elim' ? '' : `<td>${c.bestLap ? fmt(c.bestLap) : '—'}</td>`}<td>${c.kills || 0}</td><td>${Math.round(c.score || 0)}</td></tr>`).join('')}</tbody></table>` : '';
  // career block: medal, unlocks
  const C = R.career;
  const unlocks = C ? [...C.newCups.map((n) => `Nuova coppa sbloccata: <b>${esc(n)}</b>`), ...C.newVenues.map((v) => `Nuova arena per l’evento libero: <b>${esc(VENUES.find((x) => x.id === v)?.name || v)}</b>`), ...C.newCars.map((n) => `Ora puoi comprare: <b>${esc(n)}</b>`)] : [];
  const chHtml = (R.challenges || []).map((c) => `<div class="dzx-unlock ach">Sfida completata: <b>${esc(c.name)}</b> · +€ ${c.prize.toLocaleString('it-IT')}</div>`).join('');
  const careerHtml = ev ? `<div class="dzx-career"><div class="dzx-sub">${esc(CUPS.find((c) => c.id === ev.cup)?.name || 'Carriera')} · ${esc(ev.name)}</div>${C?.improved ? `<div class="dzx-new">NUOVO RECORD · ${MEDALS[m].toUpperCase()}</div>` : ''}<div class="small">Stelle carriera: <b>${C?.stars ?? 0}</b></div>${unlocks.map((u) => `<div class="dzx-unlock">${u}</div>`).join('')}</div>` : '';
  const el = game.hud.results;
  el.innerHTML = `<div class="dzx-card"><div class="dzx-head"><div>${(ev || ['stunt', 'time', 'caccia', 'squadre', 'ondate', 'distruzione'].includes(mode)) ? medalSVG(m, 74) : ''}</div><div><div class="dzx-sub">${esc(MODES[mode]?.name || 'Gara')} · ${esc(game.venue.name)}</div>
    <h2>${title}</h2>${(ev || ['stunt', 'time', 'caccia', 'squadre', 'ondate', 'distruzione'].includes(mode)) ? `<div class="dzx-medal-l m${m}">${m ? `Medaglia di ${MEDALS[m].toLowerCase()}` : 'Nessuna medaglia'}</div>` : ''}</div></div>
    ${detail}
    ${R.objectives?.length ? `<div class="dzx-objres">${R.objectives.map((o) => `<span class="${o.done ? 'ok' : ''}"><i>${o.done ? '✓' : '✗'}</i>${esc(o.text)}<b>${o.done ? '+€ ' + o.prize.toLocaleString('it-IT') : ''}</b></span>`).join('')}</div>` : ''}${R.rivalHtml || ''}
    <div class="dzx-res-grid"><div>${table}</div>${champHtml}${careerHtml}${!ev && chHtml ? `<div class="dzx-career">${chHtml}</div>` : ''}</div>${ev && chHtml ? `<div class="dzx-career mt8">${chHtml}</div>` : ''}
    <div class="dzx-foot"><span class="muted">Premio: <b>€ ${R.prize.toLocaleString('it-IT')}</b>${R.bonus ? ` + bonus spettacolo € ${R.bonus.toLocaleString('it-IT')}` : ''} · Crediti: <b>€ ${(R.money || 0).toLocaleString('it-IT')}</b>${P.bestCrash ? `<br>Momento migliore: ${esc(P.bestCrash)}` : ''}</span>
    <div class="dzx-btns">${game.replay?.frames?.length ? '<button class="btn lg" id="dzx-replay-btn">▶ Rivedi il botto</button>' : ''}<button class="btn lg" data-a="dz-restart">Rigioca</button><button class="btn primary lg" data-a="dz-quit">Continua</button></div></div></div>`;
  el.classList.add('on');
  el.querySelector('#dzx-replay-btn')?.addEventListener('click', () => game.startReplay());
  return { pos: myPos, medal: m, prize: R.prize + R.bonus, kills: P.kills || 0, venue: game.venue.id, score: Math.round(P.score || 0), bestLap: P.bestLap || null, time: R.time, championship: game.o.championship ? (game.champResult || null) : null, mode };
}

// damage report: what is broken and what it does to the car (steering pull, power, heat, fire, wheels)
function damagePanel(game, H) {
  const P = game.player, zd = P.zoneDmg || {}, out = [];
  const pull = (P.mesh.userData.wheels[0].userData.toe + P.mesh.userData.wheels[1].userData.toe);
  if (Math.abs(pull) > 0.025) out.push(['warn', `Sterzo storto ${pull > 0 ? '◀' : '▶'}`]);
  if (P.wobble && Math.abs(P.wobble) > 0.004) out.push(['warn', 'Ruota piegata: vibra']);
  if ((P.engDmg || 0) > 0.05) out.push([P.engDmg > 0.6 ? 'bad' : 'warn', `Motore −${Math.round(28 * P.engDmg + (P.hotT > 0 ? 50 : 0))}%`]);
  if (P.fireT > 0) out.push(['fire', 'IN FIAMME']); else if (P.hotT > 0) out.push(['bad', 'Surriscaldato!']);
  const lost = P.wheelLost.filter(Boolean).length; if (lost) out.push(['bad', `${lost} ruot${lost > 1 ? 'e' : 'a'} persa`]);
  if ((zd.rear || 0) > 45) out.push(['warn', 'Retro sfondato']);
  if ((zd.left || 0) + (zd.right || 0) > 70) out.push(['warn', 'Fiancate a pezzi']);
  if (P.surfK && game.dbgSurf) out.push(['', P.surfK]);
  const html = out.map(([k, t]) => `<span class="${k}">${t}</span>`).join('');
  if (H.dmg._h !== html) { H.dmg._h = html; H.dmg.innerHTML = html; }
  const heat = P.heat || 0; H.heat.classList.toggle('on', heat > 0.05 || P.hotT > 0); const bar = H.heat.querySelector('i'); bar.style.width = Math.round(Math.min(1, heat) * 100) + '%'; bar.style.background = heat > 0.8 ? '#ff3b3b' : heat > 0.55 ? '#ffb020' : '#4fb3ff';
  const pit = game.pit && game.pit.near ? (game.pit.inside ? `BOX · RIPARAZIONE ${Math.round(P.hp)}%` : 'BOX tra poco: sotto i 50 km/h ripari l’auto') : '';
  if (H.pit.textContent !== pit) { H.pit.textContent = pit; H.pit.classList.toggle('on', !!pit); }
}
export function showObjectivesHud(game) {
  const H = game.hud; if (!H?.obj || !game.objectives?.length) return;
  H.obj.innerHTML = `<b>OBIETTIVI BONUS</b>${game.objectives.map((o) => `<span>${esc(o.text)} <i>€ ${o.prize.toLocaleString('it-IT')}</i></span>`).join('')}`;
  H.obj.classList.add('on'); clearTimeout(game._objT); game._objT = setTimeout(() => H.obj.classList.remove('on'), 7000);
}
