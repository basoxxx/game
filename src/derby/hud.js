// In-race HUD, messages, pause overlay and results for "Scontro Totale". Styles: derby.css.
import './derby.css';
import { CHAMPIONSHIP, champGet } from './champ.js';
import { VENUES } from './tracks.js';

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildHud(game) {
  const h = document.createElement('div'); h.className = 'dzx'; game.c.appendChild(h);
  const arena = game.track.arena;
  h.innerHTML = `<div class="dzx-top"><div class="dzx-pos"><b id="dzx-pos">1</b><small>/${game.cars.length}</small></div>
      <div class="dzx-info"><div class="dzx-lap" id="dzx-lap"></div><div class="dzx-time" id="dzx-time">0:00.00</div><div class="dzx-laps" id="dzx-laps"></div></div></div>
    <div class="dzx-score"><span>PUNTI SCONTRO</span><b id="dzx-score">0</b></div>
    <div class="dzx-board" id="dzx-board"></div>
    <div class="dzx-msgs" id="dzx-msgs"></div>
    <div class="dzx-count" id="dzx-count"><div class="dzx-lights"><i></i><i></i><i></i></div><b></b></div>
    <div class="dzx-warn" id="dzx-warn"></div>
    <div class="dzx-dash">
      <div class="dzx-rpm"><i id="dzx-rpm"></i></div>
      <div class="dzx-sp"><b id="dzx-spd">0</b><small>km/h</small><span class="dzx-gear" id="dzx-gear">N</span></div>
      <div class="dzx-bar nitro"><span>NITRO</span><div><i id="dzx-nitro"></i></div></div>
      <div class="dzx-bar dmg"><span>TELAIO</span><div><i id="dzx-hp"></i></div></div></div>
    <canvas class="dzx-map" id="dzx-map" width="220" height="220"></canvas>
    <div class="dzx-help">W/S gas e freno · A/D sterzo · Spazio freno a mano · Shift nitro · Q guarda dietro · C camera · R riposiziona · T ricomincia · F filtro · Esc pausa · Gamepad: grilletti, stick, A nitro, B freno a mano, X camera, Y riposiziona, LB guarda dietro</div>
    <div class="dzx-slow" id="dzx-slow"></div>
    <div class="dzx-over dzx-pause" id="dzx-pause"><h2>Pausa</h2><div class="dzx-btns"><button class="btn primary lg" data-a="dz-resume">Riprendi</button><button class="btn lg" data-a="dz-restart">Ricomincia</button><button class="btn ghost lg" data-a="dz-quit">Esci</button></div></div>
    <div class="dzx-over dzx-results" id="dzx-results"></div>
    <div class="dzx-replay" id="dzx-replay"><b>REPLAY</b><span>Il botto più bello della gara</span><button class="btn sm" id="dzx-replay-x">Chiudi (Esc)</button></div>`;
  const $ = (id) => h.querySelector('#' + id);
  game.hud = { root: h, pause: $('dzx-pause'), pos: $('dzx-pos'), lap: $('dzx-lap'), time: $('dzx-time'), laps: $('dzx-laps'), board: $('dzx-board'), msgs: $('dzx-msgs'), count: $('dzx-count'), warn: $('dzx-warn'), rpm: $('dzx-rpm'), spd: $('dzx-spd'), gear: $('dzx-gear'), nitro: $('dzx-nitro'), hp: $('dzx-hp'), score: $('dzx-score'), slow: $('dzx-slow'), results: $('dzx-results'), replay: $('dzx-replay') };
  $('dzx-replay-x').addEventListener('click', () => game.stopReplay());
  if (arena) h.querySelector('.dzx-laps').style.display = 'none';
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
  if (H.warn.textContent !== warn) { H.warn.textContent = warn; H.warn.classList.toggle('on', !!warn); }
  if (game._hudT < 0.12) return; game._hudT = 0;
  const st = game.standings(); const myPos = st.indexOf(P) + 1;
  H.pos.textContent = myPos;
  H.lap.textContent = game.track.arena ? `IN GARA ${game.cars.filter((c) => !c.out).length}/${game.cars.length}` : `GIRO ${Math.min(game.laps, P.lap + 1)}/${game.laps}`;
  const t = game.state === 'countdown' ? 0 : game.time; H.time.textContent = fmt(t);
  if (!game.track.arena) H.laps.innerHTML = `${P.lastLap ? `Ultimo ${fmt(P.lastLap)}` : ''}${P.bestLap ? ` · <b>Migliore ${fmt(P.bestLap)}</b>` : ''}`;
  H.board.innerHTML = st.map((c, i) => `<div class="${c.isPlayer ? 'me' : ''} ${c.out ? 'out' : ''}"><b>${i + 1}</b><i style="background:${c.color}"></i><span>${esc(c.name)}</span>${c.ai && !c.isPlayer ? `<u class="${c.ai.pers}" title="${c.ai.pers}"></u>` : ''}<em style="width:${Math.max(0, c.hp) * 0.3}px;background:${c.hp > 50 ? '#3ddc84' : c.hp > 25 ? '#ffb020' : '#ff3b3b'}"></em></div>`).join('');
  game.mapDraw();
}

export function showResults(game) {
  const arena = game.track.arena;
  const res = game.finishOrder.length ? [...game.finishOrder, ...game.standings().filter((c) => !game.finishOrder.includes(c))] : game.standings();
  const P = game.player, myPos = res.indexOf(P) + 1;
  const prize = [12000, 8000, 5500, 4000, 3000, 2200, 1500, 1000][myPos - 1] || 500;
  const bonus = (P.kills || 0) * 1500 + Math.round((P.score || 0) / 10) * 10;
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
  const el = game.hud.results;
  el.innerHTML = `<div class="dzx-card"><div class="dzx-sub">${arena ? 'Demolition derby' : 'Gara'} · ${esc(game.venue.name)}</div>
    <h2>${myPos === 1 ? '🏆 VITTORIA!' : `${myPos}° posto`}</h2>
    <div class="dzx-res-grid"><div><table class="tbl"><thead><tr><th>Pos</th><th>Pilota</th><th>${arena ? 'Stato' : 'Tempo'}</th>${arena ? '' : '<th>Giro migliore</th>'}<th>Demolizioni</th><th>Punti scontro</th></tr></thead><tbody>${res.map((c, i) => `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td><i class="dzx-dot" style="background:${c.color}"></i>${esc(c.name)}</td><td>${arena ? (c.out ? 'Distrutto' : 'In piedi') : c.finished ? fmt(c.time) : 'In pista'}</td>${arena ? '' : `<td>${c.bestLap ? fmt(c.bestLap) : '—'}</td>`}<td>${c.kills || 0}</td><td>${Math.round(c.score || 0)}</td></tr>`).join('')}</tbody></table></div>${champHtml}</div>
    <div class="dzx-foot"><span class="muted">Premio: <b>€ ${prize.toLocaleString('it-IT')}</b>${bonus ? ` + bonus spettacolo € ${bonus.toLocaleString('it-IT')}` : ''}${P.bestCrash ? ` · Botto migliore: ${esc(P.bestCrash)}` : ''}</span>
    <div class="dzx-btns">${game.replay?.frames?.length ? '<button class="btn lg" id="dzx-replay-btn">▶ Rivedi il botto</button>' : ''}<button class="btn lg" data-a="dz-restart">Rigioca</button><button class="btn primary lg" data-a="dz-quit">Continua</button></div></div></div>`;
  el.classList.add('on');
  el.querySelector('#dzx-replay-btn')?.addEventListener('click', () => game.startReplay());
  return { pos: myPos, prize: prize + bonus, kills: P.kills || 0, venue: game.venue.id, score: Math.round(P.score || 0), bestLap: P.bestLap || null, time: P.finished ? P.time : null, championship: game.o.championship ? (game.champResult || null) : null };
}
