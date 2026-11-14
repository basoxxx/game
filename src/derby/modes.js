// v5 event types for "Scontro Totale":
//   squadre      Derby a squadre: Rossi contro Blu in arena, l'ultima squadra con un'auto in moto vince
//   re           Re della collina: tieni da solo il cerchio al centro dell'arena; 45 s di corona vincono
//   ondate       Sopravvivenza: ondate sempre più grosse di demolitori arrabbiati, tutti contro di te
//   distruzione  Demolizione a tempo: pista vuota sbarrata da muri di casse; ogni oggetto distrutto toglie tempo
//   parco        Parco giochi: giro libero (nessuna fine, punti e nitro per salti, giri della morte, distruzione)
// game.js calls these hooks; everything mode-specific lives here.
import * as THREE from 'three';

export const ARENA_MODES = ['derby', 'squadre', 're', 'ondate'];
export const TEAM = [{ name: 'Rossi', color: '#d32626', css: '#ff4a4a' }, { name: 'Blu', color: '#1f5fd6', css: '#4f8dff' }];
const TEAM_SHADES = [['#c62828', '#e0512b', '#a51c30', '#ff6a3d'], ['#1e5fd1', '#2c84c9', '#283f9e', '#3a6fe0']];
export const KING_T = 45, KING_R = 9, WAVES = 6;

// per car (k = 0 is the player): team and colour
export function carSetup(game, k, nAI) {
  if (game.mode === 'squadre') { const team = k === 0 ? 0 : k <= Math.ceil(nAI / 2) ? 1 : 0; return { team, color: k === 0 ? null : TEAM_SHADES[team][k % 4] }; }
  return {};
}

export function setup(game) {
  const m = game.mode, T = game.terrain;
  if (m === 'squadre') { game.feed(`<i style="background:${TEAM[0].css}"></i><b>Rossi</b><u>⚔</u><i style="background:${TEAM[1].css}"></i><b>Blu</b>`); }
  if (m === 're') {
    // the crown: a glowing ring on the ground at the centre of the arena
    const ring = new THREE.Mesh(new THREE.RingGeometry(KING_R - 0.6, KING_R, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffcf3a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(KING_R - 0.6, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffcf3a, transparent: true, opacity: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const y = T.heightAt(T.cx, T.cz) + 0.06; ring.position.set(T.cx, y, T.cz); disc.position.set(T.cx, y, T.cz); game.scene.add(ring); game.scene.add(disc);
    game.king = { ring, disc, holder: null, t: 0 };
    for (const c of game.cars) c.crown = 0;
  }
  if (m === 'ondate') {
    game.wave = { n: 0, next: 2.5, cleared: 0 };
    for (const c of game.cars) if (!c.isPlayer) bench(game, c);
  }
  if (m === 'distruzione') { game.smashBonus = 0; }
}

function bench(game, c) { c.out = true; c.removed = true; c.benched = true; c.mesh.visible = false; c.body.setEnabled?.(false); }
function unbench(game, c, wave) {
  const T = game.terrain, tr = game.track, a = Math.random() * Math.PI * 2, r = tr.R * 0.82;
  c.benched = false; c.removed = false; c.out = false; c.hp = Math.min(100, 40 + wave * 10); // early waves are already battered: they fall quickly, later ones are fresh
  c.zoneDmg = null; c.heat = 0; c.hotT = 0; c.fireT = 0; c.burnT = 0; c.outT = 0;
  for (const w of c.mesh.userData.wheels) { w.userData.bent = 0; w.userData.toe = 0; w.rotation.x = 0; }
  game.repairWheels(c); c.body.setEnabled?.(true); c.mesh.visible = true;
  c.body.setTranslation({ x: T.cx + Math.cos(a) * r, y: T.heightAt(T.cx + Math.cos(a) * r, T.cz + Math.sin(a) * r) + 0.8, z: T.cz + Math.sin(a) * r }, true);
  c.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(a + Math.PI)), true); c.body.setLinvel({ x: 0, y: 0, z: 0 }, true); c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  c.nitro = 40 + wave * 8; c.paceMul = 1 + wave * 0.01;
  if (c.ai) { c.ai.pers = 'aggressivo'; c.ai.grudge = game.player; c.ai.grudgeT = 1e9; c.ai.mode = 'hunt'; c.ai.target = game.player; c.ai.P = { ...c.ai.P, ram: 1, aggr: 0.9 + wave * 0.05 }; }
  game.setGhost(c, 1.5);
}

// called every frame while racing; returns true when it handled the end condition itself
export function tick(game, dt) {
  const m = game.mode; if (game.state !== 'race') return false;
  if (m === 'squadre') {
    const alive = [0, 1].map((t) => game.cars.filter((c) => c.team === t && !c.out).length);
    if (!alive[0] || !alive[1] || game.time > 240) { game.winTeam = alive[0] === alive[1] ? (teamHp(game, 0) >= teamHp(game, 1) ? 0 : 1) : alive[0] > alive[1] ? 0 : 1; game.finishOrder = game.standings(); game.finish(); }
    else if (game.player.out && !game.spectate) { game._specAt ??= game.time + 1.8; if (game.time >= game._specAt) game.startSpectate(game.arenaFocus(), 'DISTRUTTO'); }
    return true;
  }
  if (m === 're') {
    const K = game.king, T = game.terrain;
    const inside = game.cars.filter((c) => !c.out && Math.hypot(c.body.translation().x - T.cx, c.body.translation().z - T.cz) < KING_R);
    const holder = inside.length === 1 ? inside[0] : null;
    if (holder !== K.holder) { K.holder = holder; if (holder?.isPlayer) game.message('LA CORONA È TUA!', 'bonus', 'resta nel cerchio'); else if (holder && game.time > 2) game.feed(`<i style="background:${holder.color}"></i>${holder.isPlayer ? '<b>' : ''}${String(holder.name).replace(/[<>&]/g, '')}${holder.isPlayer ? '</b>' : ''}<u>♛</u><em>ha la corona</em>`); }
    if (holder) { holder.crown += dt; if (holder.isPlayer) { holder.score += dt * 20; holder.nitro = Math.min(100, holder.nitro + dt * 3); } }
    K.ring.material.color.set(holder ? holder.color : inside.length > 1 ? '#ff3b3b' : '#ffcf3a'); K.disc.material.opacity = 0.1 + (holder ? 0.12 + 0.06 * Math.sin(game.time * 6) : 0);
    const top = game.cars.reduce((a, b) => ((b.crown || 0) > (a.crown || 0) ? b : a));
    const alive = game.cars.filter((c) => !c.out);
    if ((top.crown || 0) >= KING_T || game.time > 180 || alive.length <= 1 || (game.player.out && game.time - (game.player.outT || 0) > 6)) { game.finishOrder = game.standings(); game.finish(); }
    return true;
  }
  if (m === 'ondate') {
    const W = game.wave, foes = game.cars.filter((c) => !c.isPlayer && !c.benched);
    if (game.player.out) { if (!W.over) { W.over = true; W.overT = game.time + 2.2; game.message(`Resistito a ${W.cleared} ondat${W.cleared === 1 ? 'a' : 'e'}`, 'wreck'); } else if (game.time >= W.overT) { game.finishOrder = game.standings(); game.finish(); } return true; } // game time, not a wall-clock timer: pausing no longer ends the run
    if (W.n > 0 && W.next == null && foes.every((c) => c.out)) {
      W.cleared = W.n; game.player.hp = Math.min(100, game.player.hp + 25); game.player.nitro = Math.min(100, game.player.nitro + 40); game.player.score += 400 * W.n;
      if (W.n >= WAVES) { game.message('TUTTE LE ONDATE RESPINTE!', 'big'); game.callout('IMBATTIBILE!', 'gold'); game.finishOrder = game.standings(); game.finish(); return true; }
      game.message(`ONDATA ${W.n} RESPINTA!`, 'big', '+25% telaio · +40 nitro'); game.callout(`ONDATA ${W.n} OK`, 'gold'); W.next = 3.5;
      for (const c of foes) { bench(game, c); }
    }
    if (W.next != null) { W.next -= dt; if (W.next <= 0) { W.next = null; W.n++; const n = Math.min(game.cars.length - 1, 1 + W.n); const pool = game.cars.filter((c) => !c.isPlayer).slice(0, n); for (const c of pool) unbench(game, c, W.n); game.message(`ONDATA ${W.n}`, 'big', `${n} demolitori in arrivo`); game.snd?.horn(); } }
    if (game.time > 360) { game.finishOrder = game.standings(); game.finish(); }
    return true;
  }
  if (m === 'parco') return true; // no end: the pause menu ends the session
  return false;
}
function teamHp(game, t) { return game.cars.filter((c) => c.team === t && !c.out).reduce((s, c) => s + c.hp, 0); }

export function standings(game) {
  const m = game.mode, cars = game.cars.filter((c) => !c.benched || c.isPlayer);
  if (m === 'squadre') { const wt = game.winTeam ?? (teamHp(game, 0) >= teamHp(game, 1) ? 0 : 1); return cars.slice().sort((a, b) => ((a.team === wt ? 0 : 1) - (b.team === wt ? 0 : 1)) || (a.out - b.out) || ((b.kills || 0) - (a.kills || 0)) || b.hp - a.hp); }
  if (m === 're') return cars.slice().sort((a, b) => (b.crown || 0) - (a.crown || 0) || (a.out - b.out) || b.hp - a.hp);
  if (m === 'ondate' || m === 'parco' || m === 'distruzione') return [game.player, ...cars.filter((c) => !c.isPlayer).sort((a, b) => (a.out - b.out) || b.hp - a.hp)];
  return null;
}

export function result(game, r) {
  const m = game.mode, P = game.player;
  if (m === 'squadre') { r.teamWon = P.team === game.winTeam; r.alive = !P.out; r.winTeam = TEAM[game.winTeam ?? 0].name; r.pos = r.teamWon ? 1 : 2; }
  if (m === 're') { r.crown = Math.round((P.crown || 0) * 10) / 10; }
  if (m === 'ondate') { r.waves = game.wave.cleared; r.pos = 1; }
  if (m === 'distruzione') { r.rawTime = r.time; r.smash = game.smashBonus || 0; if (r.time) r.time = Math.max(1, Math.round((r.time - r.smash) * 100) / 100); r.pos = 1; }
  if (m === 'parco') { r.pos = 1; }
}

export function panel(game) {
  const m = game.mode, P = game.player;
  const f = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  if (m === 'squadre') { const a = [0, 1].map((t) => game.cars.filter((c) => c.team === t && !c.out).length), n = [0, 1].map((t) => game.cars.filter((c) => c.team === t).length); return `<div class="dzx-mh">Derby a squadre · sei dei <b style="color:${TEAM[P.team ?? 0].css}">${TEAM[P.team ?? 0].name}</b></div><div class="dzx-teams"><span style="--tc:${TEAM[0].css}">ROSSI ${a[0]}/${n[0]}</span><span style="--tc:${TEAM[1].css}">BLU ${a[1]}/${n[1]}</span></div>`; }
  if (m === 're') { const K = game.king, top = game.standings().slice(0, 3); return `<div class="dzx-mh">Re della collina · ${K.holder ? `corona a <b>${K.holder.isPlayer ? 'TE' : K.holder.name}</b>` : 'cerchio libero'} · servono ${KING_T} s</div><div class="dzx-crown">${top.map((c) => `<span class="${c.isPlayer ? 'me' : ''}"><i style="background:${c.color}"></i>${c.isPlayer ? 'Tu' : c.name.split(' ')[0]} <b>${(c.crown || 0).toFixed(1).replace('.', ',')}</b></span>`).join('')}</div><div class="dzx-hunt"><i style="width:${Math.min(100, (P.crown || 0) / KING_T * 100)}%"></i></div>`; }
  if (m === 'ondate') { const W = game.wave, left = game.cars.filter((c) => !c.isPlayer && !c.benched && !c.out).length; return `<div class="dzx-mh">Sopravvivenza · ondata <b>${Math.max(1, W.n)}/${WAVES}</b> · ${W.next != null ? `prossima tra ${Math.max(0, W.next).toFixed(0)} s` : `${left} demolitori rimasti`}</div><div class="dzx-tg">${[2, 4, 6].map((k, i) => `<span class="m${i + 1} ${W.cleared >= k ? 'got' : ''}"><i></i>${k} ondate</span>`).join('')}</div>`; }
  if (m === 'distruzione') { const cur = game.state === 'countdown' ? 0 : game.time; const adj = Math.max(0, cur - (game.smashBonus || 0)); return `<div class="dzx-mh">Demolizione a tempo · tempo netto <b>${f(adj)}</b> · bonus distruzione −${(game.smashBonus || 0).toFixed(1).replace('.', ',')} s</div><div class="dzx-tg">${[2, 1, 0].map((k, i) => `<span class="m${3 - i} ${adj > game.targets[k] ? 'gone' : ''}"><i></i>${f(game.targets[k])}</span>`).join('')}</div>`; }
  if (m === 'parco') return `<div class="dzx-mh">Parco giochi · giro libero · migliore salto <b>${Math.round(game.maxJump || 0)} m</b> · giri della morte <b>${game.loops || 0}</b></div>`;
  return '';
}

// AI hooks (derby arena): whom may this car attack, and where should it be?
export function canTarget(game, car, o) { return !(game.mode === 'squadre' && car.team === o.team) && !o.benched; }
export function arenaGoal(game, car) {
  if (game.mode === 're') {
    const K = game.king, T = game.terrain;
    if (K.holder && K.holder !== car) return { target: K.holder, attack: true };
    if (K.holder === car) return { x: T.cx, z: T.cz, orbit: 4, slow: true };
    return { x: T.cx, z: T.cz };
  }
  if (game.mode === 'ondate' && !game.player.out && !car.isPlayer) return { target: game.player, attack: true };
  return null;
}
