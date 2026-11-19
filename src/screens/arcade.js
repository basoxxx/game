// Arcade Baso — collection screen (four games, daily challenge, shop, hall of fame), per-game setup,
// the live game (src/arcade/host.js), pause and results.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { arLoad, arSave, addScore, best } from '../arcade/store.js';
import { GAMES, GAME_IDS, SKINS, TRAILS, dailySpec } from '../arcade/meta.js';
import { SECTORS } from '../arcade/astro.js';
import { LEVEL_COUNT } from '../arcade/rimbalzo.js';
import { newMission, missionText, missionValue } from '../arcade/corri.js';
import { rng } from '../arcade/rng.js';
import { ART } from '../arcade/art.js';
import '../arcade/arcade.css';

const V = { page: 'home', game: 'astro', playing: false, host: null, from: 'launcher', daily: null, players: 1, tab: 'skin', board: 'astro', opt: { sector: 0, level: 1, endless: false, lab: 1 }, quickDone: false };
const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const touchUI = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const missionMul = (p) => 1 + Math.min(9, Math.floor((p.missionsDone || 0) / 3));
function ensureMissions(p) {
  if (Array.isArray(p.missions) && p.missions.length === 3) return p.missions;
  const r = rng((Date.now() & 0xffff) + 3), lv = Math.floor((p.missionsDone || 0) / 3), ms = [];
  for (let i = 0; i < 3; i++) ms.push(newMission(r, ms.map((m) => m.id), lv));
  p.missions = ms; return ms;
}

const CONTROLS = {
  astro: ['<span class="kbd">WASD</span> / <span class="kbd">Frecce</span> muovi · sparo automatico', '<span class="kbd">Maiusc</span> / <span class="kbd">B</span> / <span class="kbd">X</span> bomba', '<span class="kbd">Mouse</span> tieni premuto e la nave segue il puntatore', '<span class="kbd">Stick</span> muovi · <span class="kbd">B</span> / <span class="kbd">X</span> bomba', '<span class="kbd">Touch</span> trascina ovunque (la nave segue il dito a distanza) · tasto Bomba o doppio tocco', '<b>2 giocatori in cooperativa:</b> G1 <span class="kbd">WASD</span> + <span class="kbd">Maiusc sx</span>, G2 <span class="kbd">Frecce</span> + <span class="kbd">Maiusc dx</span>, oppure due controller'],
  rimbalzo: ['<span class="kbd">Mouse</span> muovi la racchetta · <span class="kbd">clic</span> lancia', '<span class="kbd">A D</span> / <span class="kbd">Frecce</span> muovi · <span class="kbd">Spazio</span> lancia', '<span class="kbd">Stick</span> muovi · <span class="kbd">A</span> lancia', '<span class="kbd">Touch</span> trascina il dito, tocca per lanciare', '<b>2 giocatori a turno:</b> stesso quadro, chi fa più punti'],
  corri: ['<span class="kbd">← →</span> / <span class="kbd">A D</span> cambia corsia', '<span class="kbd">↑</span> / <span class="kbd">W</span> / <span class="kbd">Spazio</span> salta · <span class="kbd">↓</span> / <span class="kbd">S</span> scivola (in aria: scendi subito)', '<span class="kbd">Croce</span> / <span class="kbd">Stick</span> · <span class="kbd">A</span> salta · <span class="kbd">B</span> scivola', '<span class="kbd">Touch</span> scorri a sinistra, destra, su, giù · tocca per saltare', '<b>2 giocatori a turno:</b> stesso percorso'],
  labirinto: ['<span class="kbd">WASD</span> / <span class="kbd">Frecce</span> direzione (puoi prenotare la svolta)', '<span class="kbd">Croce</span> / <span class="kbd">Stick</span> direzione', '<span class="kbd">Touch</span> scorri nella direzione, oppure croce direzionale', '<b>Le vespe:</b> <em style="color:#ff3b4f">Pungiglione</em> segue le tue impronte, <em style="color:#ff7ad9">Ronzella</em> pattuglia e carica se ti vede, <em style="color:#ff9f1c">Golosa</em> sorveglia i confetti verso cui vai, <em style="color:#33e1ff">Specchietta</em> ti rispecchia e balza vicino', '<b>Peperoncino:</b> le vespe scappano e puoi abbrustolirle · <b>Sciame!</b> ogni tanto ti puntano tutte', '<b>2 giocatori a turno:</b> stesso labirinto'],
};

function wallet(p) { return `<div class="ar-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">${p.games} partite</div></div>`; }
function dailyCard(p) {
  const d = dailySpec(), st = p.daily?.key === d.key ? p.daily : null, G = GAMES[d.game];
  const dt = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<section class="ar-daily" style="--g:${G.accent}"><div class="ar-daily-art">${ART[d.game]}</div><div class="ar-daily-t"><div class="ar-k">${icon('calendar')} Sfida del giorno · ${esc(dt)}</div><b>${esc(G.name)}</b>
    <span>Variante: <em>${esc(d.twist.name)}</em> (${esc(d.twist.desc)}). Stesso seme per tutti, oggi. ${st?.done ? `Il tuo record di oggi: <em>${fmt(st.best)}</em>` : `Prima partita: <em>+${d.reward} monete</em>`}</span></div>
    <button class="btn primary" data-a="ar-daily">${icon('play')} ${st?.done ? 'Riprova' : 'Gioca'}</button></section>`;
}
const SHOP = { skin: { list: SKINS, label: 'Colori' }, trail: { list: TRAILS, label: 'Scie' } };
function shop(p) {
  const T = SHOP[V.tab] ? V.tab : 'skin', S = SHOP[T];
  return `<div class="ar-shop"><div class="ar-tabs" role="tablist">${Object.entries(SHOP).map(([k, s]) => `<button role="tab" class="${k === T ? 'on' : ''}" data-a="ar-tab" data-id="${k}">${s.label}</button>`).join('')}</div>
    <div class="ar-items">${S.list.map((it) => {
      const own = p.owned[T].includes(it.id), on = p[T] === it.id;
      const sw = T === 'skin' ? `<i class="sw" style="background:${it.rainbow ? `linear-gradient(90deg,${it.c.join(',')})` : `linear-gradient(135deg,${it.c[0]} 55%,${it.c[1]} 55%)`};box-shadow:0 0 14px ${it.c[2]}"></i>` : `<i class="sw trail t-${it.id}"></i>`;
      return `<div class="ar-item ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-a="ar-buy" data-k="${T}" data-id="${it.id}" tabindex="0" title="${esc(it.desc || it.name)}">${sw}<b>${esc(it.name)}</b><span>${own ? (on ? 'In uso' : 'Tuo') : `${icon('coin')} ${it.cost}`}</span></div>`;
    }).join('')}</div>
    ${T === 'skin' ? `<div class="ar-p2"><span>Colore del giocatore 2</span>${SKINS.filter((s) => p.owned.skin.includes(s.id)).map((s) => `<button class="${p.skin2 === s.id ? 'on' : ''}" data-a="ar-p2" data-id="${s.id}" title="${esc(s.name)}" style="background:linear-gradient(135deg,${s.c[0]} 55%,${s.c[1]} 55%)"></button>`).join('')}</div>` : ''}</div>`;
}
function board(p, g, n = 10) {
  const list = p.scores[g] || [];
  return `<ol class="ar-board">${Array.from({ length: n }, (_, i) => { const e = list[i]; return `<li class="${e ? '' : 'empty'}"><span>${i + 1}</span><b>${e ? fmt(e.s) : '—'}</b><em>${e ? `${esc(e.n)} · ${new Date(e.d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}` : ''}</em></li>`; }).join('')}</ol>`;
}

function home(p) {
  return `<div class="full-screen ar-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Arcade', title: 'Arcade Baso', sub: 'Quattro classici da sala giochi rifatti al neon: sparatutto, spaccamattoni, corsa infinita e labirinto. Record, sfida del giorno, monete e colori da sbloccare.', right: wallet(p) })}
    <div class="ar-setup">
      ${dailyCard(p)}
      <section><h3>Giochi</h3><div class="ar-games">${GAME_IDS.map((id) => { const G = GAMES[id]; return `<div class="ar-card" style="--g:${G.accent}" data-a="ar-open" data-id="${id}" tabindex="0"><div class="ar-art">${ART[id]}</div><div class="ar-card-t"><small>${esc(G.genre)}</small><b>${esc(G.name)}</b><span>${esc(G.sub)}</span><em>${best(p, id) ? `Record ${fmt(best(p, id))} · ${p.plays[id]} partite` : 'Nessun record: stabiliscine uno!'}</em></div></div>`; }).join('')}</div></section>
      <section class="ar-row2">
        <div><h3>Il tuo stile</h3><p class="ar-note">Colori e scie valgono in tutti e quattro i giochi: nave, racchetta, corridore e Gnam.</p>${shop(p)}</div>
        <div><h3>Albo d’oro</h3><div class="ar-tabs">${GAME_IDS.map((id) => `<button class="${V.board === id ? 'on' : ''}" data-a="ar-board" data-id="${id}">${esc(GAMES[id].name)}</button>`).join('')}</div>${board(p, V.board, 5)}</div>
      </section>
    </div></div>`;
}

function gameOptions(p, g) {
  if (g === 'astro') {
    const max = Math.min(2, p.unlock.astro || 0);
    return `<h3>Settore di partenza</h3><div class="ar-seg">${SECTORS.map((s, i) => `<button class="${V.opt.sector === i ? 'on' : ''} ${i > max ? 'dis' : ''}" data-a="ar-opt" data-k="sector" data-v="${i}" ${i > max ? 'disabled' : ''}>${i + 1} · ${esc(s.name)}</button>`).join('')}</div><p class="ar-note">Batti il boss di un settore per poter ripartire da quello successivo.</p>`;
  }
  if (g === 'rimbalzo') {
    const un = Math.max(1, Math.min(LEVEL_COUNT, p.unlock.rimbalzo || 1));
    return `<h3>Modalità</h3><div class="ar-seg"><button class="${!V.opt.endless ? 'on' : ''}" data-a="ar-opt" data-k="endless" data-v="0">Campagna · ${LEVEL_COUNT} quadri</button><button class="${V.opt.endless ? 'on' : ''}" data-a="ar-opt" data-k="endless" data-v="1">Infinito · generatore</button></div>
      ${V.opt.endless ? '<p class="ar-note">Quadri sempre nuovi dal generatore, sempre più duri: fin dove arrivi?</p>' : `<h3 class="mt16">Quadro di partenza</h3><div class="ar-levels">${Array.from({ length: LEVEL_COUNT }, (_, i) => `<button class="${V.opt.level === i + 1 ? 'on' : ''}" data-a="ar-opt" data-k="level" data-v="${i + 1}" ${i + 1 > un ? 'disabled' : ''}>${i + 1}</button>`).join('')}</div>`}`;
  }
  if (g === 'corri') {
    const ms = ensureMissions(p);
    return `<h3>Missioni · moltiplicatore x${missionMul(p)}</h3><ul class="ar-miss">${ms.map((m) => `<li><i>${icon('target')}</i><span>${esc(missionText(m))}</span><em>+${m.coins}</em></li>`).join('')}</ul><p class="ar-note">Ogni 3 missioni completate il moltiplicatore di punti sale di uno (fino a x10).</p>`;
  }
  const un = Math.max(1, p.unlock.labirinto || 1);
  return `<h3>Livello di partenza</h3><div class="ar-levels">${Array.from({ length: Math.min(20, Math.max(un, 5)) }, (_, i) => `<button class="${V.opt.lab === i + 1 ? 'on' : ''}" data-a="ar-opt" data-k="lab" data-v="${i + 1}" ${i + 1 > un ? 'disabled' : ''}>${i + 1}</button>`).join('')}</div>
    <h3 class="mt16">Comandi touch</h3><div class="ar-seg"><button class="${p.touch.labirinto !== 'dpad' ? 'on' : ''}" data-a="ar-touch" data-v="swipe">Scorri</button><button class="${p.touch.labirinto === 'dpad' ? 'on' : ''}" data-a="ar-touch" data-v="dpad">Croce direzionale</button></div>`;
}
function gamePage(p) {
  const g = V.game, G = GAMES[g];
  return `<div class="full-screen ar-menu" style="--g:${G.accent}">
    ${pageHead({ backAction: 'ar-home', eyebrow: 'Arcade Baso', title: G.name, sub: G.sub, right: wallet(p) })}
    <div class="ar-setup">
      <section class="ar-row2">
        <div class="ar-col">
          <div class="ar-hero">${ART[g]}</div>
          <h3>Giocatori</h3><div class="ar-seg"><button class="${V.players === 1 ? 'on' : ''}" data-a="ar-players" data-v="1">1 giocatore</button><button class="${V.players === 2 ? 'on' : ''}" data-a="ar-players" data-v="2">2 giocatori · ${G.two === 'coop' ? 'cooperativa' : 'a turno'}</button></div>
          ${gameOptions(p, g)}
          <h3 class="mt16">Comandi</h3><div class="ar-keys">${CONTROLS[g].map((c) => `<span>${c}</span>`).join('')}<span><span class="kbd">Esc</span> / <span class="kbd">P</span> / <span class="kbd">Start</span> pausa</span></div>
        </div>
        <div class="ar-col"><h3>Migliori 10</h3>${board(p, g)}</div>
      </section>
      <div class="ar-go"><div class="ar-rec">${best(p, g) ? `${icon('star')} Record: <b>${fmt(best(p, g))}</b>` : 'Nessun record: stabiliscine uno!'}</div><button class="btn primary big" data-a="ar-play">${icon('play')} Gioca</button></div>
    </div></div>`;
}

function resultsHTML(r, p, extra) {
  const G = GAMES[r.game], main = r.results[0];
  const two = r.results.length > 1;
  const win = two ? (r.results[0].score === r.results[1].score ? 'Pareggio!' : r.results[0].score > r.results[1].score ? 'Vince il Giocatore 1!' : 'Vince il Giocatore 2!') : null;
  const title = win || (main.win ? (r.game === 'astro' ? 'Galassia salvata!' : 'Hai finito tutto!') : r.game === 'corri' ? 'Che corsa!' : 'Partita finita');
  const stats = {
    astro: (q) => [[`${q.sector + 1}·${Math.max(1, q.wave)}`, 'settore·ondata'], [q.kills, 'nemici'], [q.bosses, 'boss'], [`x${q.maxMult}`, 'combo max']],
    rimbalzo: (q) => [[q.level, 'quadro'], [q.cleared, 'completati'], [q.bricks, 'mattoni'], [q.maxCombo, 'combo max']],
    corri: (q) => [[`${fmt(q.dist)} m`, 'distanza'], [q.coins, 'monete raccolte'], [q.jumps, 'salti'], [q.slides, 'scivolate']],
    labirinto: (q) => [[q.level, 'livello'], [q.cleared, 'labirinti'], [q.toasted, 'vespe'], [q.bonuses, 'dolci']],
  }[r.game];
  return `<div class="ar-res" role="dialog" aria-label="Risultati"><div class="ar-res-card" style="--g:${G.accent}">
    <div class="ar-k">${r.daily ? 'Sfida del giorno · ' : ''}${esc(G.name)}${two ? ` · 2 giocatori ${r.mode2 === 'coop' ? 'in cooperativa' : 'a turno'}` : ''}</div>
    <h2>${title}</h2>
    ${two && r.mode2 === 'alt' ? `<div class="ar-res-duo">${r.results.map((q, i) => `<div class="${q.score >= Math.max(...r.results.map((x) => x.score)) ? 'win' : ''}"><small>Giocatore ${i + 1}</small><b>${fmt(q.score)}</b></div>`).join('')}</div>` : `<div class="ar-res-score">${fmt(r.score)}</div>`}
    ${extra.rank ? `<div class="ar-res-big">${extra.rank === 1 ? 'Nuovo record!' : `${extra.rank}° nella classifica`}</div>` : ''}
    <div class="ar-res-stats">${stats(main).map(([v, l]) => `<div><b>${esc(String(v))}</b><span>${l}</span></div>`).join('')}<div><b>+${fmt(extra.coins)}</b><span>monete</span></div></div>
    ${extra.missions?.length ? `<ul class="ar-miss">${extra.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : '·'}</i><span>${esc(missionText(m))}</span><em>${m.done ? `+${m.coins}` : `${fmt(m.have)}/${fmt(m.goal)}`}</em></li>`).join('')}</ul>` : ''}
    ${extra.unlock ? `<div class="ar-res-big">${esc(extra.unlock)}</div>` : ''}
    ${extra.daily ? `<div class="ar-res-big">Bonus sfida del giorno: <b>+${extra.daily} monete</b></div>` : ''}
    <div class="ar-res-btns"><button class="btn primary" data-a="ar-again">${icon('replay')} Rivincita</button><button class="btn" data-a="ar-back">${icon('left')} ${esc(G.name)}</button><button class="btn ghost" data-a="ar-home">${icon('gamepad')} Arcade Baso</button></div>
    <div class="ar-wallet-s">${icon('coin')} ${fmt(p.coins)} monete: spendile in colori e scie.</div>
  </div></div>`;
}

function record(r) {
  const p = arLoad(), g = r.game, extra = { coins: 0 };
  p.games++; p.plays[g] = (p.plays[g] || 0) + 1;
  const ranks = r.results.map((q, i) => { extra.coins += GAMES[g].coins(q.score); return addScore(p, g, q.score, r.results.length > 1 ? `G${i + 1}` : 'G1'); }).filter(Boolean);
  extra.rank = ranks.length ? Math.min(...ranks) : 0;
  const m = r.main;
  if (!r.daily) {
    if (g === 'astro') { const reached = m.win ? 2 : Math.min(2, m.sector); if (reached > (p.unlock.astro || 0)) { p.unlock.astro = reached; extra.unlock = `Ora puoi partire dal settore ${reached + 1}: ${SECTORS[reached].name}`; } }
    if (g === 'rimbalzo' && !V.lastOpts?.endless) { const lv = Math.min(LEVEL_COUNT, m.level); if (lv > (p.unlock.rimbalzo || 1)) { p.unlock.rimbalzo = lv; extra.unlock = `Sbloccato il quadro ${lv}`; } }
    if (g === 'labirinto') { const lv = m.level; if (lv > (p.unlock.labirinto || 1)) { p.unlock.labirinto = lv; extra.unlock = `Ora puoi partire dal livello ${lv}`; } }
  }
  if (g === 'corri') {
    const ms = ensureMissions(p), r2 = rng(Date.now() & 0xffff);
    extra.missions = ms.map((x) => ({ ...x, have: Math.max(...r.results.map((q) => missionValue(x, q))) }));
    extra.missions.forEach((x) => { x.done = x.have >= x.goal; if (x.done) { extra.coins += x.coins; p.missionsDone = (p.missionsDone || 0) + 1; } });
    const lv = Math.floor((p.missionsDone || 0) / 3);
    const next = ms.map((x, i) => (extra.missions[i].done ? null : x));
    for (let i = 0; i < next.length; i++) if (!next[i]) next[i] = newMission(r2, next.filter(Boolean).map((q) => q.id), lv);
    p.missions = next;
  }
  if (r.daily) {
    const D = dailySpec(), first = p.daily?.key !== r.daily || !p.daily.done;
    if (first) extra.daily = D.reward;
    p.daily = { key: r.daily, done: true, best: Math.max(p.daily?.key === r.daily ? p.daily.best || 0 : 0, r.score) };
  }
  p.coins += extra.coins + (extra.daily || 0);
  arSave(p);
  return { p, extra };
}

function stopGame() { V.host?.destroy(); V.host = null; window.__arcade = null; }
function startOpts(p) {
  const D = V.daily, g = D ? D.game : V.game;
  const sim = { ...(D ? D.twist.opts : {}) };
  if (D) { sim.seed = D.seed; if (g === 'rimbalzo') sim.daily = true; }
  else if (g === 'astro') sim.sector = Math.min(V.opt.sector, p.unlock.astro || 0);
  else if (g === 'rimbalzo') { sim.endless = !!V.opt.endless; sim.level = V.opt.endless ? 1 : Math.min(V.opt.level, p.unlock.rimbalzo || 1); }
  else if (g === 'labirinto') sim.level = Math.min(V.opt.lab, p.unlock.labirinto || 1);
  if (g === 'corri') sim.missionMul = missionMul(p);
  V.lastOpts = sim;
  return { game: g, sim, players: D ? 1 : V.players };
}

registerScreen({
  id: 'arcade', full: true,
  render(params) {
    if (params?.from) V.from = params.from; else if (params?.to === 'arcade') V.from = 'launcher';
    if (params?.game && GAMES[params.game]) { V.game = params.game; V.page = 'game'; delete params.game; if (!params.quick) { V.playing = false; } }
    if (params?.page === 'home') { V.page = 'home'; delete params.page; }
    if (params?.daily && !V.playing) { delete params.daily; V.daily = dailySpec(); V.playing = true; }
    if (params?.quick && !V.playing && !V.quickDone) { V.quickDone = true; V.playing = true; V.daily = null; }
    if (V.playing) return `<div class="ar-stage-full"><div class="ar-root" id="ar-root"><div class="ar-loading">Accensione del cabinato…</div></div><div class="ar-over" id="ar-over"></div></div>`;
    const p = arLoad();
    return V.page === 'game' ? gamePage(p) : home(p);
  },
  async mount() {
    if (!V.playing) { requestAnimationFrame(() => document.querySelector(V.page === 'game' ? '.ar-go .btn' : '.ar-daily .btn')?.focus({ preventScroll: true })); return; }
    const root = document.getElementById('ar-root');
    const p = arLoad();
    const { ArcadeHost } = await import('../arcade/host.js');
    if (!V.playing || !root?.isConnected) return;
    const s = getSettings(), so = startOpts(p);
    const h = V.host = new ArcadeHost(root, {
      ...so, daily: V.daily, tier: gfxTier(), touchUI: touchUI(), volume: s.sound === false ? 0 : 0.6,
      skins: [p.skin, p.skin2 === p.skin ? SKINS.find((k) => k.id !== p.skin && p.owned.skin.includes(k.id))?.id || 'brace' : p.skin2], trail: p.trail,
      best: best(p, so.game), dpad: p.touch.labirinto === 'dpad',
      onPause: (on) => {
        const ov = document.getElementById('ar-over'); if (!ov) return;
        ov.innerHTML = on ? `<div class="ar-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2><p>${esc(GAMES[so.game].name)}</p><button class="btn primary" data-a="ar-resume">${icon('play')} Riprendi</button><button class="btn" data-a="ar-restart">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="ar-quit">${icon('left')} Esci</button></div>` : '';
        if (on) requestAnimationFrame(() => ov.querySelector('.btn')?.focus());
      },
      onEnd: (r) => {
        const { p: st, extra } = record(r);
        setTimeout(() => {
          const ov = document.getElementById('ar-over'); if (!ov || !V.playing) return;
          ov.innerHTML = resultsHTML(r, st, extra);
          try { extra.rank === 1 ? sfx.win() : sfx.ok(); } catch {}
          requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus({ preventScroll: true }));
        }, 1200);
      },
    });
    window.__arcade = h;
    try { await h.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="ar-loading">Impossibile avviare il gioco: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="ar-back">Indietro</button></div>`; }
  },
  unmount() { stopGame(); V.playing = false; V.quickDone = false; try { music.setMood?.('menu'); } catch {} },
  actions: {
    'ar-open'(el) { V.game = el.dataset.id; V.page = 'game'; V.players = 1; App.refresh(); },
    'ar-home'() { stopGame(); V.playing = false; V.daily = null; V.page = 'home'; App.refresh(); },
    'ar-tab'(el) { V.tab = el.dataset.id; App.refresh(); },
    'ar-board'(el) { V.board = el.dataset.id; App.refresh(); },
    'ar-players'(el) { V.players = +el.dataset.v; App.refresh(); },
    'ar-opt'(el) { const k = el.dataset.k; V.opt[k] = k === 'endless' ? el.dataset.v === '1' : +el.dataset.v; App.refresh(); },
    'ar-touch'(el) { const p = arLoad(); p.touch.labirinto = el.dataset.v; arSave(p); App.refresh(); },
    'ar-p2'(el) { const p = arLoad(); p.skin2 = el.dataset.id; arSave(p); App.refresh(); },
    'ar-buy'(el) {
      const k = el.dataset.k, p = arLoad(), it = SHOP[k]?.list.find((x) => x.id === el.dataset.id); if (!it) return;
      if (p.owned[k].includes(it.id)) { p[k] = it.id; arSave(p); try { sfx.select?.(); } catch {} App.refresh(); return; }
      if (p.coins < it.cost) { try { sfx.bad?.(); } catch {} App.toast('Monete insufficienti', `Ti servono ancora ${it.cost - p.coins} monete per «${it.name}». Le guadagni giocando: punti, missioni e sfida del giorno.`, 'bad'); return; }
      App.confirm(`Sbloccare «${it.name}»?`, `Costa ${it.cost} monete (ne hai ${p.coins}).`, () => { const q = arLoad(); if (q.coins < it.cost) return; q.coins -= it.cost; q.owned[k].push(it.id); q[k] = it.id; arSave(q); try { sfx.coin?.(); } catch {} App.refresh(); });
    },
    'ar-play'() { V.daily = null; V.playing = true; App.refresh(); },
    'ar-daily'() { V.daily = dailySpec(); V.playing = true; App.refresh(); },
    'ar-resume'() { V.host?.togglePause(false); },
    'ar-restart'() { stopGame(); App.refresh(); },
    'ar-again'() { stopGame(); App.refresh(); },
    'ar-quit'() { stopGame(); V.playing = false; if (V.daily) { V.daily = null; V.page = 'home'; } App.refresh(); },
    'ar-back'() { stopGame(); V.playing = false; if (V.daily) { V.game = V.daily.game; V.daily = null; } V.page = 'game'; App.refresh(); },
  },
});
