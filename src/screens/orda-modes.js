// Orda — extra modes screen: "Sfida del giorno" (one generated level per day, one official attempt,
// practice, streak, share string, history calendar), "Infinita" (endless waves with roguelite perks
// and a local high-score table) and "Missioni" (achievements with coin rewards). The Orda menu links
// here through its modes registry; the live match runs OrdaGame from src/orda/game.js.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx } from '../ui/audio.js';
import { gfxTier } from '../ui/quality.js';
import { getSettings } from '../engine/state.js';
import { Sim, autopilot } from '../orda/sim.js';
import { starsFor as coreStars } from '../orda/meta.js';
import { useCore, GOOD, gateText } from '../orda/gen.js';
import {
  dailySpec, dailyReady, dayKey, parseDay, streakBonus, shareText, DAILY_LOADOUT,
  newRun, endlessWave, prepareWave, rollPerks, perkById, PERKS, perkUps, runScore, waveDifficulty,
  omLoad, omSave, normResult, recordMatch, recordDaily, recordEndless,
} from '../orda/modes.js';
import { dailyStatus, claimable, diffName, missionsPanel, claimMission } from '../orda/modes-entries.js';
import { wallet } from '../orda/modes-bridge.js';
import '../orda/modes.css';

useCore({ Sim, autopilot });

const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const TABS = [
  { id: 'sfida', name: 'Sfida del giorno', icon: 'calendar' },
  { id: 'infinita', name: 'Infinita', icon: 'hourglass' },
  { id: 'missioni', name: 'Missioni', icon: 'medal' },
];
// play: null | { kind: 'daily', official } | { kind: 'endless', run }
const V = { tab: 'sfida', from: 'orda', play: null, game: null, poll: 0, crowd: 0 };

const diffPips = (d) => `<span class="om-pips" title="Difficoltà">${[0.3, 0.5, 0.7, 0.85].map((t) => `<i class="${d >= t - 0.001 ? 'on' : ''}"></i>`).join('')}</span>`;
const starRow = (n, max = 3) => `<span class="om-stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;

// ---------------------------------------------------------------- level sketch
// top-down sketch of a level: cannon at the bottom, gates, obstacles, towers and the base on top
export function levelSketch(L, { w = 150, h = 240 } = {}) {
  const top = L.len + 7, sx = (x) => ((x + L.w / 2) / L.w) * w, sy = (y) => h - 6 - (y / top) * (h - 10), sw = (v) => (v / L.w) * w;
  const f = (v) => v.toFixed(1);
  const gates = L.gates.map((g) => {
    const x0 = sx(g.x - g.w / 2), gw = sw(g.w), y = sy(g.y), a = g.move ? Math.min(7, sw(g.move.amp)) : 0;
    return `<g class="${GOOD[g.type] ? 'g-good' : 'g-bad'}${g.toggle ? ' g-tog' : ''}"><rect x="${f(x0)}" y="${f(y - 6)}" width="${f(gw)}" height="11" rx="3"/><text x="${f(x0 + gw / 2)}" y="${f(y + 2.6)}">${esc(gateText(g))}</text>${a ? `<path class="g-mv" d="M${f(x0 - 2)} ${f(y)}h-${f(a)}M${f(x0 + gw + 2)} ${f(y)}h${f(a)}"/>` : ''}</g>`;
  }).join('');
  const obs = (L.obstacles || []).map((o) => {
    const y = sy(o.y);
    if (o.type === 'saw') return `<g class="o-saw"><line x1="${f(sx(-o.amp))}" x2="${f(sx(o.amp))}" y1="${f(y)}" y2="${f(y)}"/><circle cx="${f(sx(o.x))}" cy="${f(y)}" r="${f(sw(o.r))}"/></g>`;
    if (o.type === 'spin') return `<g class="o-spin"><circle cx="${f(sx(o.x))}" cy="${f(y)}" r="${f(sw(o.len))}"/><line x1="${f(sx(o.x - o.len))}" x2="${f(sx(o.x + o.len))}" y1="${f(y)}" y2="${f(y)}"/></g>`;
    const hh = Math.max(2.5, sw(o.d || 1));
    return `<rect class="${o.type === 'pit' ? 'o-pit' : 'o-wall'}" x="${f(sx(o.x - o.w / 2))}" y="${f(y - hh / 2)}" width="${f(sw(o.w))}" height="${f(hh)}" rx="1.5"/>${o.type === 'barrier' ? `<path class="o-arrow" d="M${f(sx(o.x - o.w / 2) - 2)} ${f(y)}h-4M${f(sx(o.x + o.w / 2) + 2)} ${f(y)}h4"/>` : ''}`;
  }).join('');
  const towers = L.base.towers.map((t) => `<rect class="o-tower" x="${f(sx(t.x) - 4)}" y="${f(sy(t.y) - 4)}" width="8" height="8" rx="2"/>`).join('');
  const bw = sw(L.base.w || 9);
  return `<svg class="om-sketch" viewBox="0 0 ${w} ${h}" role="img" aria-label="Schema del livello"><rect class="a-bg" width="${w}" height="${h}" rx="10"/>
    <rect class="a-base" x="${f(w / 2 - bw / 2)}" y="4" width="${f(bw)}" height="${f(sy(L.len) - 4)}" rx="6"/>${towers}${gates}${obs}
    <path class="a-cannon" d="M${w / 2 - 8} ${h - 3} l8 -13 l8 13z"/></svg>`;
}

// ---------------------------------------------------------------- tab: Sfida del giorno
function calendar(s) {
  const today = dayKey(), t = parseDay(today);
  const months = [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 1)];
  return `<div class="om-cal">${months.map((m) => {
    const first = (m.getDay() + 6) % 7, days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<i class="pad"></i>');
    for (let d = 1; d <= days; d++) {
      const k = dayKey(new Date(m.getFullYear(), m.getMonth(), d)), r = s.daily[k];
      const cls = r?.official ? (r.won ? `won s${r.stars || 1}` : 'lost') : k > today ? 'future' : '';
      const tip = r?.official ? `Sfida #${r.num}: ${r.won ? `${'★'.repeat(r.stars || 1)} · ${fmt(r.figures)} omini` : 'base non distrutta'}` : k === today ? 'Oggi' : '';
      cells.push(`<i class="${cls}${k === today ? ' is-today' : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${d}</i>`);
    }
    return `<div class="om-cal-m"><b>${m.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</b><div class="om-cal-g">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((x) => `<u>${x}</u>`).join('')}${cells.join('')}</div></div>`;
  }).join('')}<div class="om-cal-key"><span><i class="won s3"></i>3 stelle</span><span><i class="won s1"></i>vinta</span><span><i class="lost"></i>persa</span></div></div>`;
}
function tabDaily(s) {
  const { info, rec, streak } = dailyStatus(s);
  const ready = dailyReady();
  const L = ready ? dailySpec().level : null;
  const dt = parseDay(info.key).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const done = rec?.official;
  const nextBonus = info.reward + streakBonus(streak + 1);
  return `<div class="om-daily">
    <section class="om-card om-daily-hero om-w${L ? L.world : 0}">
      <div class="om-daily-txt">
        <div class="om-k">${icon('calendar')} Sfida #${info.num} · ${esc(dt)}</div>
        <h2>${L ? esc(L.name) : 'Preparazione della sfida…'}</h2>
        <div class="om-tags"><span>${diffPips(info.difficulty)} ${diffName(info.difficulty)}</span>${L ? `<span>${icon('hourglass')} ${L.time} s</span><span>${icon('flag')} Base ${fmt(L.base.hp)}</span>${L.base.towers.length ? `<span>${icon('target')} ${L.base.towers.length} torr${L.base.towers.length === 1 ? 'e' : 'i'}</span>` : ''}${L.base.boss ? `<span>${icon('trophy')} ${esc(L.base.name || 'Cittadella')}</span>` : ''}` : ''}</div>
        <p>Stesso livello e stesso cannone per tutti, oggi. Il <b>primo tentativo è quello ufficiale</b>: vale per la serie e per il calendario. Dopo puoi allenarti quanto vuoi.</p>
        ${done ? `<div class="om-daily-res ${rec.won ? 'won' : 'lost'}"><div>${rec.won ? starRow(rec.stars) : '<b class="om-lost">Base in piedi</b>'}</div><div><b>${fmt(rec.figures)}</b> omini · folla max <b>${fmt(rec.maxCrowd)}</b>${rec.won ? ` · ${rec.time} s` : ''}</div>${rec.practice ? `<small>${rec.practice} allenament${rec.practice === 1 ? 'o' : 'i'} · meglio ${fmt(rec.bestPractice)} omini</small>` : ''}</div>
          <pre class="om-share" id="om-share">${esc(shareText(info, { ...rec, streak }))}</pre>` : ''}
        <div class="om-btns">
          ${done ? `<button class="btn primary" data-a="om-share">${icon('upload')} Copia risultato</button><button class="btn" data-a="om-daily" data-practice="1" ${L ? '' : 'disabled'}>${icon('replay')} Allenati</button>`
            : `<button class="btn primary big" data-a="om-daily" ${L ? '' : 'disabled'}>${icon('play')} Tentativo ufficiale</button><span class="om-bonus">${icon('coin')} +${nextBonus} monete se vinci</span>`}
        </div>
      </div>
      <div class="om-daily-map">${L ? levelSketch(L) : '<div class="om-spin" aria-label="Caricamento"></div>'}</div>
    </section>
    <section class="om-card om-streak">
      <div class="om-streak-n ${streak ? 'hot' : ''}">${icon('flame')}<b>${streak}</b><span>giorn${streak === 1 ? 'o' : 'i'} di fila</span></div>
      <div class="om-streak-s"><span>Record serie <b>${s.bestStreak}</b></span><span>Sfide giocate <b>${s.dailyDone}</b></span><span>Bonus serie <b>+${streakBonus(Math.max(1, streak))}</b></span></div>
      <p class="om-note">Ogni giorno di fila aggiunge 10 monete al premio (fino a +100). Saltare un giorno azzera la serie.</p>
      ${calendar(s)}
    </section>
  </div>`;
}

// ---------------------------------------------------------------- tab: Infinita
function perkChips(ids) {
  const c = {}; ids.forEach((id) => { c[id] = (c[id] || 0) + 1; });
  return `<span class="om-chips">${Object.entries(c).map(([id, n]) => { const p = perkById(id); return p ? `<i title="${esc(p.name)}">${icon(p.icon)}${n > 1 ? `<b>${n}</b>` : ''}</i>` : ''; }).join('')}</span>`;
}
function tabEndless(s) {
  const run = s.run;
  return `<div class="om-endless">
    <section class="om-card om-endless-hero">
      <div class="om-k">${icon('hourglass')} Infinita</div>
      <h2>Ondate senza fine</h2>
      <p>Abbatti la base rossa: ne arriva subito una più forte, con le porte rimescolate. Tra un’ondata e l’altra scegli <b>1 potenziamento su 3</b>. Il cannone non si ripara da solo: la corsa finisce quando i rossi lo travolgono.</p>
      <div class="om-tags"><span>${icon('trophy')} Record ${fmt(s.endless[0]?.score || 0)} punti</span><span>${icon('flag')} Ondata massima ${s.bestWave}</span><span>Punti = ondate × 1.000 + omini</span></div>
      <div class="om-btns">
        ${run ? `<button class="btn primary big" data-a="om-endless" data-resume="1">${icon('play')} Riprendi · ondata ${run.wave}</button><button class="btn" data-a="om-endless">${icon('replay')} Nuova corsa</button>`
          : `<button class="btn primary big" data-a="om-endless">${icon('play')} Nuova corsa</button>`}
      </div>
      ${run ? `<div class="om-runbar"><span>${icon('shield')} Cannone ${fmt(run.line)}/${fmt(run.lineMax)}</span><span>${run.perks.length} potenziament${run.perks.length === 1 ? 'o' : 'i'}</span>${perkChips(run.perks)}</div>` : ''}
    </section>
    <div class="om-endless-cols">
      <section class="om-card"><h3>Classifica locale</h3>
        ${s.endless.length ? `<ol class="om-hs">${s.endless.map((e, i) => `<li><span>${i + 1}</span><b>${fmt(e.score)}</b><em>ondata ${e.waves} · ${fmt(e.figures)} omini · ${e.perks} pot.</em><small>${esc(parseDay(e.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }))}</small></li>`).join('')}</ol>` : '<p class="om-note">Nessuna corsa ancora: la prima entra dritta in classifica.</p>'}
      </section>
      <section class="om-card"><h3>Potenziamenti</h3><ul class="om-perks">${PERKS.map((p) => `<li>${icon(p.icon)}<div><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div><em>max ${p.max > 20 ? '∞' : p.max}</em></li>`).join('')}</ul></section>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- menu
function menu() {
  const s = omLoad(), n = claimable(s);
  const body = V.tab === 'infinita' ? tabEndless(s) : V.tab === 'missioni' ? missionsPanel(s) : tabDaily(s);
  return `<div class="full-screen om-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Orda', title: 'Orda · Sfide', sub: 'Un livello nuovo ogni giorno, ondate infinite e missioni da completare.', right: `<div class="om-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(wallet.coins())}</b></div>` })}
    <nav class="om-tabs" role="tablist" aria-label="Modalità">${TABS.map((t) => `<button role="tab" aria-selected="${V.tab === t.id}" class="${V.tab === t.id ? 'on' : ''}" data-a="om-tab" data-id="${t.id}">${icon(t.icon)} <span>${t.name}</span>${t.id === 'missioni' && n ? `<em>${n}</em>` : ''}</button>`).join('')}</nav>
    <div class="om-body">${body}</div>
  </div>`;
}

// ---------------------------------------------------------------- live match
function stopGame() { clearInterval(V.poll); V.poll = 0; try { V.game?.destroy?.(); } catch (e) { console.warn(e); } V.game = null; window.__ordaModes = null; }
const overEl = () => document.getElementById('om-over');
function setOver(html, focus = '.btn.primary, .om-perk') {
  const ov = overEl(); if (!ov) return;
  ov.innerHTML = html;
  if (html) requestAnimationFrame(() => ov.querySelector(focus)?.focus({ preventScroll: true }));
}
function hudTag() {
  const P = V.play; if (!P) return '';
  if (P.kind === 'daily') return `${icon('calendar')} Sfida #${dailyStatus().info.num} · ${P.official ? 'ufficiale' : 'allenamento'}`;
  const r = P.run; return `${icon('hourglass')} Ondata ${r.wave} · ${fmt(runScore(r))} pt ${perkChips(r.perks)}`;
}
const tick = () => new Promise((res) => setTimeout(res, 30));

async function startMatch() {
  const root = document.getElementById('om-root'); if (!root) return;
  stopGame(); setOver('');
  const P = V.play;
  root.innerHTML = `<div class="om-loading">${P.kind === 'daily' ? 'L’orda si prepara…' : `Ondata ${P.run.wave}: la base nemica si ricostruisce…`}</div>`;
  await tick(); // let the placeholder paint: generating a level plays a few headless matches
  let level;
  if (P.kind === 'daily') level = JSON.parse(JSON.stringify(dailySpec().level));
  else level = endlessWave(P.run);
  const tag = document.getElementById('om-tag'); if (tag) tag.innerHTML = hudTag();
  let OrdaGame;
  try { ({ OrdaGame } = await import('../orda/game.js')); } catch (e) { console.error(e); root.innerHTML = `<div class="om-loading">Impossibile caricare Orda.<br><button class="btn mt16" data-a="om-quit">Indietro</button></div>`; return; }
  if (V.play !== P || !root.isConnected) return;
  root.innerHTML = '';
  const prof = wallet.profile();
  // the daily is played with the same cannon by everybody; Infinita with your own + the run's perks
  const lo = P.kind === 'daily' ? DAILY_LOADOUT : { up: perkUps(P.run.perks, prof.up), champ: prof.champ, champLvl: prof.champLvl };
  V.crowd = 0;
  let frames = 0;
  const g = V.game = new OrdaGame(root, {
    level, mode: P.kind === 'daily' ? 'daily' : 'endless', label: P.kind === 'daily' ? `Sfida #${dailyStatus().info.num}` : `Ondata ${P.run.wave}`,
    seed: (level.gen?.seed ?? 1) + (P.kind === 'endless' ? P.run.wave : 0), players: 1,
    upgrades: lo.up, champion: lo.champ, champLvl: lo.champLvl,
    skin: prof.skin, cannon: prof.cannon, tier: gfxTier(), volume: getSettings().sound === false ? 0 : 0.6 * (getSettings().volume ?? 0.5) / 0.5, autofire: prof.autofire, shake: prof.shake, numbers: prof.numbers,
    onPause: (on) => setOver(on ? pauseHtml() : ''),
    onEnd: (r) => { if (V.game === g) onEnd(r, level); },
    // biggest crowd on the field (missions "Moltiplica la tua orda…")
    hooks: { onFrame: (G) => { if (++frames % 8) return; const u = G.sim?.blueUnits?.() || 0; if (u > V.crowd) V.crowd = u; } },
  });
  window.__ordaModes = { game: g, level, play: P };
  try { await g.start?.(); } catch (e) { console.error(e); root.innerHTML = `<div class="om-loading">Impossibile avviare la partita: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="om-quit">Indietro</button></div>`; }
}
function pauseHtml() {
  const off = V.play?.kind === 'daily' && V.play.official;
  return `<div class="om-dlg" role="dialog" aria-label="Pausa"><h2>Pausa</h2><p class="om-k">${hudTag()}</p>
    <div class="om-btns col"><button class="btn primary" data-a="om-resume">${icon('play')} Riprendi</button>${off ? '' : `<button class="btn" data-a="om-restart">${icon('replay')} Ricomincia</button>`}<button class="btn ghost" data-a="om-quit">${icon('left')} Esci</button></div>
    ${off ? '<p class="om-note">È il tentativo ufficiale: se esci ora conta come base non distrutta.</p>' : V.play?.kind === 'endless' ? '<p class="om-note">Se esci, la corsa resta salvata all’inizio di questa ondata.</p>' : ''}</div>`;
}

function onEnd(raw, L) {
  const P = V.play; if (!P) return;
  clearInterval(V.poll); V.poll = 0;
  try { const u = V.game?.sim?.blueUnits?.(); if (u > V.crowd) V.crowd = u; } catch {}
  const r = normResult({ ...raw, maxCrowd: Math.max(raw?.maxCrowd || 0, V.crowd) }, L);
  if (!raw?.stars && !L.endless) r.stars = coreStars(L, { win: r.won, time: r.time, left: r.left });
  const s = omLoad();
  recordMatch(s, r, L);
  if (P.kind === 'daily') {
    const info = dailyStatus(s).info;
    const official = P.official && !s.daily[info.key]?.official;
    const res = recordDaily(s, info, r);
    const coins = (r.won ? 10 : 3) + res.bonus;
    omSave(s); wallet.add(coins);
    const streak = dailyStatus(s).streak;
    const text = shareText(info, { ...r, streak });
    later(() => { setOver(dailyResult(info, r, { official, coins, bonus: res.bonus, streak, text })); try { r.won ? sfx.win() : sfx.bad?.(); } catch {} });
    return;
  }
  // Infinita: carry the cannon's damage, the totals; a win opens the perk pick
  const run = P.run;
  run.figures += r.figures; run.maxCrowd = Math.max(run.maxCrowd || 0, r.maxCrowd); run.kills = (run.kills || 0) + r.kills;
  run.line = Math.max(0, Math.round(r.cannonHp ?? run.line));
  if (r.won && run.line > 0) {
    run.cleared = run.wave;
    run.offer = rollPerks(run.seed, run.wave, run.perks, wallet.profile().up);
    s.run = { ...run };
    s.bestWave = Math.max(s.bestWave, run.cleared);
    omSave(s);
    later(() => { setOver(perkPick(run)); try { sfx.win(); } catch {} });
    return;
  }
  const res = recordEndless(s, run);
  s.run = null;
  omSave(s); wallet.add(res.coins);
  later(() => { setOver(endlessOver(run, res)); try { sfx.bad?.(); } catch {} });
}
// results come up after the win / lose moment has played out on screen
function later(fn) { const P = V.play; setTimeout(() => { if (V.play === P && overEl()) fn(); }, 1100); }

function dailyResult(info, r, x) {
  return `<div class="om-dlg om-res" role="dialog" aria-label="Risultato">
    <div class="om-k">Sfida #${info.num} · ${x.official ? 'tentativo ufficiale' : 'allenamento'}</div>
    <h2>${r.won ? 'Base distrutta!' : 'La base resiste'}</h2>
    ${r.won ? starRow(r.stars) : ''}
    <div class="om-res-stats"><div><b>${fmt(r.figures)}</b><span>omini</span></div><div><b>${fmt(r.maxCrowd)}</b><span>folla max</span></div><div><b>${r.won ? `${Math.round(r.time)} s` : `${Math.round((1 - r.baseHpPct) * 100)}%`}</b><span>${r.won ? 'tempo' : 'base abbattuta'}</span></div><div><b>+${fmt(x.coins)}</b><span>monete</span></div></div>
    ${x.official ? `<div class="om-res-streak">${icon('flame')} Serie: <b>${x.streak}</b> giorn${x.streak === 1 ? 'o' : 'i'}${x.bonus ? ` · bonus sfida <b>+${x.bonus}</b>` : ''}</div><pre class="om-share" id="om-share">${esc(x.text)}</pre>` : '<p class="om-note">Allenamento: il risultato ufficiale e la serie non cambiano.</p>'}
    <div class="om-btns">${x.official ? `<button class="btn primary" data-a="om-share">${icon('upload')} Copia risultato</button>` : ''}<button class="btn ${x.official ? '' : 'primary'}" data-a="om-daily" data-practice="1">${icon('replay')} Allenati</button><button class="btn ghost" data-a="om-quit">${icon('left')} Menu sfide</button></div>
  </div>`;
}
function perkPick(run) {
  // build the next wave while the player reads the cards
  setTimeout(() => { if (V.play?.run === run) { try { prepareWave(run.seed, run.wave + 1); } catch (e) { console.warn(e); } } }, 120);
  return `<div class="om-dlg om-pick" role="dialog" aria-label="Scegli un potenziamento">
    <div class="om-k">Ondata ${run.wave} superata · cannone ${fmt(run.line)}/${fmt(run.lineMax)}</div>
    <h2>Scegli un potenziamento</h2>
    <div class="om-pick-row">${run.offer.map((id, i) => { const p = perkById(id), n = run.perks.filter((x) => x === id).length; return `<button class="om-perk" data-a="om-perk" data-id="${id}"><span class="kbd">${i + 1}</span>${icon(p.icon)}<b>${esc(p.name)}</b><span>${esc(p.desc)}</span>${n ? `<em>già ${n}</em>` : ''}</button>`; }).join('')}</div>
    <p class="om-note">Prossima: ondata ${run.wave + 1} · minaccia ${Math.round(waveDifficulty(run.wave + 1) * 100)}%</p>
  </div>`;
}
function endlessOver(run, res) {
  return `<div class="om-dlg om-res" role="dialog" aria-label="Fine corsa">
    <div class="om-k">Infinita · fine corsa</div><h2>Il cannone è caduto</h2>
    <div class="om-res-big">${fmt(res.score)} <small>punti</small>${res.rank === 1 ? '<em>Nuovo record!</em>' : res.rank ? `<em>${res.rank}° in classifica</em>` : ''}</div>
    <div class="om-res-stats"><div><b>${run.cleared}</b><span>ondate</span></div><div><b>${fmt(run.figures)}</b><span>omini</span></div><div><b>${fmt(run.maxCrowd)}</b><span>folla max</span></div><div><b>+${fmt(res.coins)}</b><span>monete</span></div></div>
    ${run.perks.length ? `<div class="om-runbar">${perkChips(run.perks)}</div>` : ''}
    <div class="om-btns"><button class="btn primary" data-a="om-endless">${icon('replay')} Nuova corsa</button><button class="btn ghost" data-a="om-quit">${icon('left')} Menu sfide</button></div>
  </div>`;
}

async function copyShare() {
  const t = document.getElementById('om-share')?.textContent || '';
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch {}
  if (!ok) { try { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); ok = document.execCommand('copy'); a.remove(); } catch {} }
  App.toast(ok ? 'Risultato copiato' : 'Copia non riuscita', ok ? 'Incollalo dove vuoi per sfidare gli amici.' : 'Selezionalo e copialo a mano.', ok ? 'good' : 'bad');
}

let keyH = null;
registerScreen({
  id: 'orda-modes', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.tab && TABS.some((t) => t.id === params.tab)) { V.tab = params.tab; delete params.tab; }
    if (V.play) return `<div class="om-stage"><div class="om-root" id="om-root"><div class="om-loading">L’orda si prepara…</div></div><div class="om-tag" id="om-tag">${hudTag()}</div><div class="om-over" id="om-over"></div></div>`;
    return menu();
  },
  mount() {
    if (keyH) window.removeEventListener('keydown', keyH, true);
    keyH = (e) => {
      if (App.cur !== 'orda-modes') return;
      const pick = overEl()?.querySelector('.om-pick');
      if (pick && /^Digit[1-3]$/.test(e.code)) { const b = pick.querySelectorAll('.om-perk')[+e.code.slice(5) - 1]; if (b) { e.preventDefault(); e.stopPropagation(); b.click(); } }
    };
    window.addEventListener('keydown', keyH, true);
    if (V.play) { startMatch(); return; }
    // today's level is generated on demand (a few headless matches): build it after the first paint
    if (V.tab === 'sfida' && !dailyReady()) setTimeout(() => { try { dailySpec(); } catch (e) { console.error(e); } if (App.cur === 'orda-modes' && !V.play) App.refresh(); }, 60);
    requestAnimationFrame(() => document.querySelector('.om-body .btn.primary:not([disabled])')?.focus({ preventScroll: true }));
  },
  unmount() { stopGame(); V.play = null; window.removeEventListener('keydown', keyH, true); keyH = null; },
  actions: {
    'om-tab'(el) { V.tab = el.dataset.id; App.refresh(); },
    'om-open'(el) { V.tab = el.dataset.tab || 'sfida'; if (App.cur !== 'orda-modes') App.go('orda-modes', { from: App.cur }); else App.refresh(); },
    'om-daily'(el) {
      if (!dailyReady()) return;
      const s = omLoad(), off = !s.daily[dayKey()]?.official && !el.dataset.practice;
      stopGame(); V.play = { kind: 'daily', official: off }; App.refresh();
    },
    'om-endless'(el) {
      const s = omLoad();
      const resume = el.dataset.resume && s.run;
      if (!resume && s.run) { s.run = null; omSave(s); }
      stopGame();
      V.play = { kind: 'endless', run: resume ? { ...s.run, offer: null } : newRun() };
      App.refresh();
    },
    'om-perk'(el) {
      const P = V.play; if (P?.kind !== 'endless' || !P.run.offer?.includes(el.dataset.id)) return;
      const run = P.run, p = perkById(el.dataset.id);
      run.perks.push(p.id); p.now?.(run);
      run.offer = null; run.wave++;
      const s = omLoad(); s.run = { ...run }; s.bestPerks = Math.max(s.bestPerks, run.perks.length); omSave(s);
      try { sfx.ok?.(); } catch {}
      startMatch();
    },
    'om-claim'(el) {
      const a = claimMission(el.dataset.id); if (!a) return;
      try { sfx.coin?.(); } catch {}
      App.toast(`Missione: ${a.name}`, `+${a.coins} monete`, 'good');
      App.refresh();
    },
    'om-share'() { copyShare(); },
    'om-resume'() { V.game?.togglePause?.(false); setOver(''); },
    'om-restart'() { startMatch(); },
    'om-quit'() {
      const P = V.play, g = V.game;
      const live = g && !(g.over || g.sim?.state === 'won' || g.sim?.state === 'lost');
      // leaving an official daily mid-match spends the attempt
      if (P?.kind === 'daily' && P.official && live) {
        const s = omLoad(), info = dailyStatus(s).info;
        if (!s.daily[info.key]?.official) { const r = normResult({ win: false, ...(g.sim?.result?.() || {}), quit: true }, dailySpec().level); recordDaily(s, info, r); omSave(s); }
      }
      stopGame(); V.play = null; App.refresh();
    },
  },
});
