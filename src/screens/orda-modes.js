// Orda — extra modes screen: "Sfida del giorno" (one generated level per day, one official attempt,
// practice, streak, share string, history calendar), "Infinita" (endless waves with roguelite perks
// and a local high-score table) and "Missioni" (achievements with coin rewards). The Orda menu links
// here through its modes registry; the live match runs OrdaGame from src/orda/game.js.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx } from '../ui/audio.js';
import { gfxTier } from '../ui/quality.js';
import {
  dailySpec, dayKey, addDays, parseDay, liveStreak, streakBonus, shareText, starsFor, gateLabel, GATE_TYPES,
  newRun, endlessWave, rollPerks, perkById, PERKS, upgradesFor, runScore, waveDifficulty,
  omLoad, omSave, recordMatch, recordDaily, recordEndless, achState, ACHIEVEMENTS,
} from '../orda/modes.js';
import { wallet } from '../orda/modes-bridge.js';
import '../orda/modes.css';

const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const TABS = [
  { id: 'sfida', name: 'Sfida del giorno', icon: 'calendar' },
  { id: 'infinita', name: 'Infinita', icon: 'hourglass' },
  { id: 'missioni', name: 'Missioni', icon: 'medal' },
];
// play: null | { kind: 'daily', official } | { kind: 'endless', run }
const V = { tab: 'sfida', from: 'orda', play: null, game: null, over: null, busy: false };

// ---------------------------------------------------------------- shared bits
export function dailyStatus(s = omLoad()) {
  const spec = dailySpec(), rec = s.daily[spec.key];
  return { spec, rec, streak: liveStreak(s) };
}
export function claimable(s = omLoad()) { return achState(s).filter((a) => a.done && !a.claimed).length; }
const diffPips = (d) => `<span class="om-pips" title="Difficoltà">${[0.3, 0.5, 0.7, 0.85].map((t) => `<i class="${d >= t - 0.001 ? 'on' : ''}"></i>`).join('')}</span>`;
const diffName = (d) => (d < 0.4 ? 'Tranquilla' : d < 0.55 ? 'Media' : d < 0.7 ? 'Tosta' : d < 0.8 ? 'Dura' : 'Durissima');
const starRow = (n, max = 3) => `<span class="om-stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;

// top-down sketch of a level: cannon at the bottom, gates, rocks, saws, walls and the base on top
export function levelSketch(L, { w = 150, h = 240 } = {}) {
  const sx = (x) => ((x + L.arena.w / 2) / L.arena.w) * w, sy = (y) => h - (y / L.arena.h) * h;
  const gates = L.gates.map((g) => {
    const good = GATE_TYPES[g.type].good, x0 = sx(g.x - g.w / 2), gw = (g.w / L.arena.w) * w;
    return `<g class="${good ? 'g-good' : 'g-bad'}${g.move ? ' g-move' : ''}"><rect x="${x0.toFixed(1)}" y="${(sy(g.y) - 7).toFixed(1)}" width="${gw.toFixed(1)}" height="12" rx="3"/><text x="${(x0 + gw / 2).toFixed(1)}" y="${(sy(g.y) + 2.5).toFixed(1)}">${esc(gateLabel(g))}</text>${g.move ? `<path d="M${(x0 - 4).toFixed(1)} ${sy(g.y).toFixed(1)}h-3m${(gw + 14).toFixed(1)} 0h-3"/>` : ''}</g>`;
  }).join('');
  const obs = (L.obstacles || []).map((o) => o.type === 'saw'
    ? `<g class="o-saw"><line x1="${sx(-L.arena.w / 2 + 1).toFixed(1)}" x2="${sx(L.arena.w / 2 - 1).toFixed(1)}" y1="${sy(o.y).toFixed(1)}" y2="${sy(o.y).toFixed(1)}"/><circle cx="${sx(o.x).toFixed(1)}" cy="${sy(o.y).toFixed(1)}" r="4"/></g>`
    : `<circle class="o-rock" cx="${sx(o.x).toFixed(1)}" cy="${sy(o.y).toFixed(1)}" r="${((o.r / L.arena.w) * w).toFixed(1)}"/>`).join('');
  const walls = L.base.walls.map((x) => `<rect class="o-wall" x="${sx(x.x - x.w / 2).toFixed(1)}" y="${(sy(x.y) - 2).toFixed(1)}" width="${((x.w / L.arena.w) * w).toFixed(1)}" height="4" rx="1"/>`).join('');
  const towers = L.base.towers.map((t) => `<rect class="o-tower" x="${(sx(t.x) - 4).toFixed(1)}" y="${(sy(t.y) - 4).toFixed(1)}" width="8" height="8" rx="2"/>`).join('');
  return `<svg class="om-sketch" viewBox="0 0 ${w} ${h}" role="img" aria-label="Schema del livello"><rect class="a-bg" width="${w}" height="${h}" rx="10"/>
    <rect class="a-base" x="${w * 0.25}" y="4" width="${w * 0.5}" height="${h - sy(L.base.y) + 10}" rx="6"/>${towers}${walls}${gates}${obs}
    <path class="a-cannon" d="M${w / 2 - 9} ${h - 4} l9 -14 l9 14z"/></svg>`;
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
      const cls = r?.official ? (r.won ? `won s${r.stars}` : 'lost') : k === today ? 'today' : k > today ? 'future' : '';
      const tip = r?.official ? `Sfida #${r.num}: ${r.won ? `${'★'.repeat(r.stars)} · ${fmt(r.figures)} omini` : 'base non distrutta'}` : k === today ? 'Oggi' : '';
      cells.push(`<i class="${cls}${k === today ? ' is-today' : ''}" title="${esc(tip)}">${d}</i>`);
    }
    return `<div class="om-cal-m"><b>${m.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</b><div class="om-cal-g">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((x) => `<u>${x}</u>`).join('')}${cells.join('')}</div></div>`;
  }).join('')}<div class="om-cal-key"><span><i class="won s3"></i>3 stelle</span><span><i class="won s1"></i>vinta</span><span><i class="lost"></i>persa</span></div></div>`;
}
function tabDaily(s) {
  const { spec, rec, streak } = dailyStatus(s), L = spec.level;
  const dt = parseDay(spec.key).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const nextBonus = spec.reward + streakBonus(streak + (rec?.official ? 0 : 1));
  const done = rec?.official;
  return `<div class="om-daily">
    <section class="om-card om-daily-hero om-th-${L.arena.theme}">
      <div class="om-daily-txt">
        <div class="om-k">${icon('calendar')} Sfida #${spec.num} · ${esc(dt)}</div>
        <h2>${esc(L.name.replace(/^Sfida #\d+ · /, ''))}</h2>
        <div class="om-tags"><span>${diffPips(spec.difficulty)} ${diffName(spec.difficulty)}</span><span>${icon('hourglass')} ${L.timer} s</span><span>${icon('flag')} Base ${fmt(L.base.hp)}</span>${L.base.towers.length ? `<span>${icon('target')} ${L.base.towers.length} torri</span>` : ''}</div>
        <p>Stesso livello per tutti, oggi. Il <b>primo tentativo è quello ufficiale</b>: vale per la serie e per il calendario. Dopo puoi allenarti quanto vuoi.</p>
        ${done ? `<div class="om-daily-res ${rec.won ? 'won' : 'lost'}"><div>${rec.won ? starRow(rec.stars) : '<b class="om-lost">Base in piedi</b>'}</div><div><b>${fmt(rec.figures)}</b> omini · colpo max <b>${fmt(rec.maxShot)}</b>${rec.won ? ` · ${rec.time} s` : ''}</div>${rec.practice ? `<small>${rec.practice} allenament${rec.practice === 1 ? 'o' : 'i'} · meglio ${fmt(rec.bestPractice)} omini</small>` : ''}</div>
          <pre class="om-share" id="om-share">${esc(shareText(spec, { ...rec, streak }))}</pre>` : ''}
        <div class="om-btns">
          ${done ? `<button class="btn primary" data-a="om-share">${icon('upload')} Copia risultato</button><button class="btn" data-a="om-daily" data-practice="1">${icon('replay')} Allenati</button>`
            : `<button class="btn primary big" data-a="om-daily">${icon('play')} Tentativo ufficiale</button><span class="om-bonus">${icon('coin')} +${nextBonus} monete se vinci</span>`}
        </div>
      </div>
      <div class="om-daily-map">${levelSketch(L)}</div>
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
function tabEndless(s) {
  const run = s.run;
  return `<div class="om-endless">
    <section class="om-card om-endless-hero">
      <div class="om-k">${icon('hourglass')} Infinita</div>
      <h2>Ondate senza fine</h2>
      <p>Abbatti la base rossa: ne arriva subito una più forte, con le porte rimescolate. Tra un’ondata e l’altra scegli <b>1 potenziamento su 3</b>. La corsa finisce quando i rossi sfondano la tua linea.</p>
      <div class="om-tags"><span>${icon('trophy')} Record ${fmt(s.endless[0]?.score || 0)} punti</span><span>${icon('flag')} Ondata massima ${s.bestWave}</span><span>Punti = ondate × 1.000 + omini lanciati</span></div>
      <div class="om-btns">
        ${run ? `<button class="btn primary big" data-a="om-endless" data-resume="1">${icon('play')} Riprendi · ondata ${run.wave}</button><button class="btn" data-a="om-endless">${icon('replay')} Nuova corsa</button>`
          : `<button class="btn primary big" data-a="om-endless">${icon('play')} Nuova corsa</button>`}
      </div>
      ${run ? `<div class="om-runbar"><span>Linea ${fmt(run.line)}/${fmt(run.lineMax)}</span><span>${run.perks.length} potenziamenti</span>${perkChips(run.perks)}</div>` : ''}
    </section>
    <div class="om-endless-cols">
      <section class="om-card"><h3>Classifica locale</h3>
        ${s.endless.length ? `<ol class="om-hs">${s.endless.map((e, i) => `<li><span>${i + 1}</span><b>${fmt(e.score)}</b><em>ondata ${e.waves} · ${fmt(e.figures)} omini · ${e.perks} pot.</em><small>${esc(parseDay(e.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }))}</small></li>`).join('')}</ol>` : '<p class="om-note">Nessuna corsa ancora: la prima entra dritta in classifica.</p>'}
      </section>
      <section class="om-card"><h3>Potenziamenti</h3><ul class="om-perks">${PERKS.map((p) => `<li>${icon(p.icon)}<div><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div><em>max ${p.max > 20 ? '∞' : p.max}</em></li>`).join('')}</ul></section>
    </div>
  </div>`;
}
function perkChips(ids) {
  const c = {}; ids.forEach((id) => { c[id] = (c[id] || 0) + 1; });
  return `<span class="om-chips">${Object.entries(c).map(([id, n]) => { const p = perkById(id); return p ? `<i title="${esc(p.name)}">${icon(p.icon)}${n > 1 ? `<b>${n}</b>` : ''}</i>` : ''; }).join('')}</span>`;
}

// ---------------------------------------------------------------- tab: Missioni (also embeddable in the Orda menu)
export function missionsPanel(s = omLoad(), { compact = false } = {}) {
  const list = achState(s).sort((a, b) => (b.done && !b.claimed) - (a.done && !a.claimed) || a.claimed - b.claimed || b.pct - a.pct);
  const shown = compact ? list.slice(0, 4) : list;
  const got = list.filter((a) => a.claimed).length;
  return `<section class="om-card om-miss ${compact ? 'compact' : ''}"><div class="om-miss-h"><h3>Missioni Orda</h3><span>${got}/${ACHIEVEMENTS.length} completate</span>${compact ? `<button class="btn ghost sm" data-a="om-open" data-tab="missioni">Tutte ${icon('right')}</button>` : ''}</div>
    <ul>${shown.map((a) => `<li class="${a.claimed ? 'claimed' : a.done ? 'ready' : ''}">${icon(a.icon)}<div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>${a.goal > 1 && !a.done ? `<div class="om-bar"><i style="width:${(a.pct * 100).toFixed(1)}%"></i></div><small>${fmt(a.have)} / ${fmt(a.goal)}</small>` : ''}</div>
      ${a.claimed ? `<em class="om-ok">${icon('check')}</em>` : a.done ? `<button class="btn primary sm" data-a="om-claim" data-id="${a.id}">${icon('coin')} +${a.coins}</button>` : `<em>${icon('coin')} ${a.coins}</em>`}</li>`).join('')}</ul></section>`;
}

// ---------------------------------------------------------------- menu
function menu() {
  const s = omLoad(), n = claimable(s);
  const body = V.tab === 'infinita' ? tabEndless(s) : V.tab === 'missioni' ? missionsPanel(s) : tabDaily(s);
  return `<div class="full-screen om-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Orda', title: 'Orda · Sfide', sub: 'Un livello nuovo ogni giorno, ondate infinite e missioni da completare.', right: `<div class="om-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(wallet.coins())}</b></div>` })}
    <nav class="om-tabs" role="tablist">${TABS.map((t) => `<button role="tab" aria-selected="${V.tab === t.id}" class="${V.tab === t.id ? 'on' : ''}" data-a="om-tab" data-id="${t.id}">${icon(t.icon)} ${t.name}${t.id === 'missioni' && n ? `<em>${n}</em>` : ''}</button>`).join('')}</nav>
    <div class="om-body">${body}</div>
  </div>`;
}

// ---------------------------------------------------------------- live match
function stopGame() { try { V.game?.destroy?.(); } catch (e) { console.warn(e); } V.game = null; window.__ordaModes = null; }
const overEl = () => document.getElementById('om-over');
function setOver(html, focus = '.btn.primary') {
  const ov = overEl(); if (!ov) return;
  ov.innerHTML = html;
  if (html) requestAnimationFrame(() => ov.querySelector(focus)?.focus({ preventScroll: true }));
}
function hudTag() {
  const P = V.play; if (!P) return '';
  if (P.kind === 'daily') { const sp = dailySpec(); return `${icon('calendar')} Sfida #${sp.num}${P.official ? ' · ufficiale' : ' · allenamento'}`; }
  const r = P.run; return `${icon('hourglass')} Ondata ${r.wave} · ${fmt(runScore(r))} punti ${perkChips(r.perks)}`;
}

async function startMatch() {
  const root = document.getElementById('om-root'); if (!root) return;
  stopGame(); setOver('');
  const P = V.play;
  const level = P.kind === 'daily' ? JSON.parse(JSON.stringify(dailySpec().level)) : endlessWave(P.run);
  const tag = document.getElementById('om-tag'); if (tag) tag.innerHTML = hudTag();
  let OrdaGame;
  try { ({ OrdaGame } = await import('../orda/game.js')); } catch (e) { console.error(e); root.innerHTML = `<div class="om-loading">Impossibile caricare Orda.<br><button class="btn mt16" data-a="om-quit">Indietro</button></div>`; return; }
  if (!V.play || !root.isConnected) return;
  root.innerHTML = '';
  const prof = wallet.profile();
  const ups = P.kind === 'endless' ? upgradesFor(P.run) : {};
  const g = V.game = new OrdaGame(root, {
    level, mode: P.kind === 'daily' ? 'daily' : 'endless', seed: level.seed, players: 1,
    upgrades: { ...(prof.upgrades || {}), ...mergeUps(prof.upgrades, ups) },
    skin: prof.skin, champions: (prof.champions ?? 1) + (ups.champions || 0), tier: gfxTier(),
    onPause: (on) => setOver(on ? pauseHtml() : ''),
    onEnd: (r) => { if (V.game === g) onEnd(r, level); },
    hooks: {},
  });
  window.__ordaModes = { game: g, level, play: P };
  try { await g.start?.(); } catch (e) { console.error(e); root.innerHTML = `<div class="om-loading">Impossibile avviare la partita: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="om-quit">Indietro</button></div>`; }
}
// perks stack on top of the player's own upgrades (rates multiply, counts add)
function mergeUps(base = {}, ups = {}) {
  const o = {};
  for (const [k, v] of Object.entries(ups)) {
    if (typeof v === 'boolean') o[k] = v || !!base[k];
    else if (k === 'fireRate' || k === 'speed') o[k] = (base[k] || 1) * v;
    else o[k] = (base[k] || 0) + v;
  }
  return o;
}
function pauseHtml() {
  return `<div class="om-dlg" role="dialog" aria-label="Pausa"><h2>Pausa</h2><p>${hudTag()}</p>
    <div class="om-btns col"><button class="btn primary" data-a="om-resume">${icon('play')} Riprendi</button>${V.play?.kind === 'daily' && V.play.official ? '' : `<button class="btn" data-a="om-restart">${icon('replay')} Ricomincia</button>`}<button class="btn ghost" data-a="om-quit">${icon('left')} Esci</button></div>
    ${V.play?.kind === 'daily' && V.play.official ? '<p class="om-note">Uscire ora conta come tentativo ufficiale perso.</p>' : ''}</div>`;
}

// normalise what the core hands back (field names are agreed, but be forgiving)
function norm(r = {}, L) {
  const won = !!(r.won ?? r.win);
  const time = r.time ?? r.elapsed ?? 0;
  const timeLeft = r.timeLeft ?? (L.timer ? Math.max(0, L.timer - time) : 0);
  const baseHp = r.baseHp ?? r.baseHpLeft ?? (won ? 0 : L.base.hp);
  return {
    won, time, timeLeft,
    stars: r.stars ?? starsFor(L, won, timeLeft),
    figures: r.figures ?? r.sent ?? r.total ?? 0,
    maxShot: r.maxShot ?? r.bestShot ?? r.maxGroup ?? 0,
    championsUsed: r.championsUsed ?? r.champions ?? 0,
    lineDamage: r.lineDamage ?? 0,
    lineHp: r.lineHp ?? r.line,
    badGates: r.badGates ?? 0,
    baseHpPct: Math.max(0, Math.min(1, baseHp / L.base.hp)),
    coins: r.coins || 0,
    quit: !!r.quit,
  };
}

function onEnd(raw, L) {
  const P = V.play; if (!P) return;
  const r = norm(raw, L);
  const s = omLoad();
  recordMatch(s, r, L);
  if (P.kind === 'daily') {
    const spec = dailySpec();
    const off = P.official && !s.daily[spec.key]?.official;
    const res = recordDaily(s, spec, r);
    const coins = r.coins + res.bonus;
    if (coins) wallet.add(coins);
    omSave(s);
    const streak = liveStreak(s);
    const text = shareText(spec, { ...r, streak });
    setTimeout(() => {
      if (V.play !== P) return;
      setOver(dailyResult(spec, r, { official: off, coins, bonus: res.bonus, streak, text }));
      try { r.won ? sfx.win() : sfx.bad?.(); } catch {}
    }, 700);
    return;
  }
  // endless
  const run = P.run;
  run.figures += r.figures; run.maxShot = Math.max(run.maxShot, r.maxShot);
  if (r.lineHp != null) run.line = Math.max(0, Math.round(r.lineHp));
  else run.line = Math.max(0, run.line - r.lineDamage);
  if (r.won && run.line > 0 && !r.quit) {
    run.cleared = run.wave;
    run.offer = rollPerks(run.seed, run.wave, run.perks);
    s.run = { ...run };
    s.bestWave = Math.max(s.bestWave, run.cleared);
    omSave(s);
    setTimeout(() => { if (V.play === P) { setOver(perkPick(run)); try { sfx.win(); } catch {} } }, 700);
    return;
  }
  const res = recordEndless(s, run);
  s.run = null;
  omSave(s);
  if (res.coins) wallet.add(res.coins + r.coins);
  setTimeout(() => { if (V.play === P) { setOver(endlessOver(run, res)); try { sfx.bad?.(); } catch {} } }, 700);
}

function dailyResult(spec, r, x) {
  return `<div class="om-dlg om-res" role="dialog" aria-label="Risultato">
    <div class="om-k">Sfida #${spec.num} · ${x.official ? 'tentativo ufficiale' : 'allenamento'}</div>
    <h2>${r.won ? 'Base distrutta!' : 'La base resiste'}</h2>
    ${r.won ? starRow(r.stars) : ''}
    <div class="om-res-stats"><div><b>${fmt(r.figures)}</b><span>omini</span></div><div><b>${fmt(r.maxShot)}</b><span>colpo max</span></div><div><b>${r.won ? `${Math.round(r.time)} s` : `${Math.round((1 - r.baseHpPct) * 100)}%`}</b><span>${r.won ? 'tempo' : 'base abbattuta'}</span></div><div><b>+${fmt(x.coins)}</b><span>monete</span></div></div>
    ${x.official ? `<div class="om-res-streak">${icon('flame')} Serie: <b>${x.streak}</b> giorn${x.streak === 1 ? 'o' : 'i'}${x.bonus ? ` · bonus sfida <b>+${x.bonus}</b>` : ''}</div><pre class="om-share" id="om-share">${esc(x.text)}</pre>` : '<p class="om-note">Allenamento: non cambia il risultato ufficiale né la serie.</p>'}
    <div class="om-btns">${x.official ? `<button class="btn primary" data-a="om-share">${icon('upload')} Copia risultato</button>` : ''}<button class="btn ${x.official ? '' : 'primary'}" data-a="om-daily" data-practice="1">${icon('replay')} Allenati</button><button class="btn ghost" data-a="om-quit">${icon('left')} Menu sfide</button></div>
  </div>`;
}
function perkPick(run) {
  return `<div class="om-dlg om-pick" role="dialog" aria-label="Scegli un potenziamento">
    <div class="om-k">Ondata ${run.wave} superata · linea ${fmt(run.line)}/${fmt(run.lineMax)}</div>
    <h2>Scegli un potenziamento</h2>
    <div class="om-pick-row">${run.offer.map((id, i) => { const p = perkById(id), n = run.perks.filter((x) => x === id).length; return `<button class="om-perk" data-a="om-perk" data-id="${id}"><span class="kbd">${i + 1}</span>${icon(p.icon)}<b>${esc(p.name)}</b><span>${esc(p.desc)}</span>${n ? `<em>già ${n}</em>` : ''}</button>`; }).join('')}</div>
    <p class="om-note">Prossima: ondata ${run.wave + 1} · base più forte (${Math.round(waveDifficulty(run.wave + 1) * 100)}% minaccia)</p>
  </div>`;
}
function endlessOver(run, res) {
  return `<div class="om-dlg om-res" role="dialog" aria-label="Fine corsa">
    <div class="om-k">Infinita · fine corsa</div><h2>La linea è caduta</h2>
    <div class="om-res-big">${fmt(res.score)} <small>punti</small>${res.rank === 1 ? '<em>Nuovo record!</em>' : res.rank ? `<em>${res.rank}° in classifica</em>` : ''}</div>
    <div class="om-res-stats"><div><b>${run.cleared}</b><span>ondate</span></div><div><b>${fmt(run.figures)}</b><span>omini</span></div><div><b>${fmt(run.maxShot)}</b><span>colpo max</span></div><div><b>+${fmt(res.coins)}</b><span>monete</span></div></div>
    ${run.perks.length ? `<div class="om-runbar">${perkChips(run.perks)}</div>` : ''}
    <div class="om-btns"><button class="btn primary" data-a="om-endless">${icon('replay')} Nuova corsa</button><button class="btn ghost" data-a="om-quit">${icon('left')} Menu sfide</button></div>
  </div>`;
}

async function copyShare() {
  const t = document.getElementById('om-share')?.textContent || '';
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch {}
  if (!ok) { try { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); ok = document.execCommand('copy'); a.remove(); } catch {} }
  App.toast(ok ? 'Risultato copiato' : 'Copia non riuscita', ok ? 'Incollalo dove vuoi per sfidare gli amici.' : 'Selezionalo e copialo a mano.', ok ? 'good' : 'bad');
}

let keyH = null;
registerScreen({
  id: 'orda-modes', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.tab && TABS.some((t) => t.id === params.tab)) { V.tab = params.tab; delete params.tab; }
    if (params?.play && !V.play) { const k = params.play; delete params.play; if (k === 'daily') V.play = { kind: 'daily', official: !omLoad().daily[dayKey()]?.official }; else if (k === 'endless') V.play = { kind: 'endless', run: omLoad().run || newRun() }; }
    if (V.play) return `<div class="om-stage"><div class="om-root" id="om-root"><div class="om-loading">L’orda si prepara…</div></div><div class="om-tag" id="om-tag">${hudTag()}</div><div class="om-over" id="om-over"></div></div>`;
    return menu();
  },
  mount() {
    if (keyH) window.removeEventListener('keydown', keyH, true);
    keyH = (e) => {
      if (App.cur !== 'orda-modes') return;
      const pick = overEl()?.querySelector('.om-pick');
      if (pick && /^Digit[1-3]$/.test(e.code)) { const b = pick.querySelectorAll('.om-perk')[+e.code.slice(5) - 1]; if (b) { e.preventDefault(); b.click(); } }
    };
    window.addEventListener('keydown', keyH, true);
    if (V.play) { startMatch(); return; }
    requestAnimationFrame(() => document.querySelector('.om-body .btn.primary')?.focus({ preventScroll: true }));
  },
  unmount() { stopGame(); V.play = null; window.removeEventListener('keydown', keyH, true); keyH = null; },
  actions: {
    'om-tab'(el) { V.tab = el.dataset.id; App.refresh(); },
    'om-open'(el) { V.tab = el.dataset.tab || 'sfida'; if (App.cur !== 'orda-modes') App.go('orda-modes', { from: App.cur }); else App.refresh(); },
    'om-daily'(el) {
      const s = omLoad(), off = !s.daily[dayKey()]?.official && !el.dataset.practice;
      stopGame(); V.play = { kind: 'daily', official: off }; App.refresh();
    },
    'om-endless'(el) {
      const s = omLoad();
      if (!el.dataset.resume && s.run) { s.run = null; omSave(s); }
      stopGame(); V.play = { kind: 'endless', run: el.dataset.resume && s.run ? { ...s.run, offer: null } : newRun() }; App.refresh();
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
      const s = omLoad(), a = achState(s).find((x) => x.id === el.dataset.id);
      if (!a?.done || a.claimed) return;
      s.claimed[a.id] = Date.now(); s.coinsEarned += a.coins; omSave(s); wallet.add(a.coins);
      try { sfx.coin?.(); } catch {}
      App.toast(`Missione: ${a.name}`, `+${a.coins} monete`, 'good');
      App.refresh();
    },
    'om-share'() { copyShare(); },
    'om-resume'() { V.game?.togglePause?.(false); setOver(''); },
    'om-restart'() { startMatch(); },
    'om-quit'() {
      const P = V.play;
      // leaving an official daily mid-match spends the attempt
      if (P?.kind === 'daily' && P.official && V.game && !V.game.ended) { const s = omLoad(); if (!s.daily[dayKey()]?.official) { recordDaily(s, dailySpec(), { won: false, figures: V.game.stats?.figures || 0 }); omSave(s); } }
      if (P?.kind === 'endless' && V.game && !V.game.ended && !P.run.offer) { /* mid-wave: the run stays saved at the start of this wave */ }
      stopGame(); V.play = null; App.refresh();
    },
  },
});

// entries for the Orda menu's modes registry (src/screens/orda.js) and the Baso Hub tiles
export const ORDA_EXTRA_MODES = [
  { id: 'sfida', icon: 'calendar', name: 'Sfida del giorno', desc: () => { const { spec, rec, streak } = dailyStatus(); return rec?.official ? `#${spec.num} giocata${rec.won ? ` · ${'★'.repeat(rec.stars)}` : ''}${streak ? ` · serie ${streak}` : ''}` : `#${spec.num} · ${diffName(spec.difficulty)} · stesso livello per tutti`; }, go: (from = 'orda') => App.go('orda-modes', { from, tab: 'sfida' }), tag: () => (dailyStatus().rec?.official ? '' : 'Nuova') },
  { id: 'infinita', icon: 'hourglass', name: 'Infinita', desc: () => { const s = omLoad(); return s.run ? `Corsa in pausa: ondata ${s.run.wave}` : s.endless[0] ? `Record ${fmt(s.endless[0].score)} · ondata ${s.bestWave}` : 'Ondate senza fine, 1 potenziamento su 3'; }, go: (from = 'orda') => App.go('orda-modes', { from, tab: 'infinita' }) },
  { id: 'missioni', icon: 'medal', name: 'Missioni', desc: () => { const s = omLoad(), n = claimable(s); return n ? `${n} ricompens${n === 1 ? 'a' : 'e'} da riscuotere` : `${Object.keys(s.claimed).length}/${ACHIEVEMENTS.length} completate`; }, go: (from = 'orda') => App.go('orda-modes', { from, tab: 'missioni' }) },
];
void addDays;
