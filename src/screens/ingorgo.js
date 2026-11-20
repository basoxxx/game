// Ingorgo — menus (home, levels and generated packs, daily puzzle, zen, garage), the live puzzle,
// pause and results. One screen with views; the 3D game lives in src/ingorgo/game.js.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { igLoad, igSave, nextLevel, totalStars } from '../ingorgo/store.js';
import { WORLDS, PER_WORLD, TOTAL, campaignLevel, levelName, MECH_NAME, MECH_RULE, SHOP, PAINTS, MODELS, HORN_LIST, THEMES, rewardFor } from '../ingorgo/meta.js';
import { PACKS, MECH_IDS, dailyInfo, dayKey } from '../ingorgo/gen.js';
import { starLimits } from '../ingorgo/core.js';
import { job, stopJobs } from '../ingorgo/jobs.js';
import { snd, HORNS, setVolume, followVolume } from '../ingorgo/sound.js';
import '../ingorgo/ingorgo.css';

const G = { view: 'home', from: 'launcher', play: null, game: null, world: null, pack: 'facile', zenNext: null, daily: null, packNext: null, packCache: new Map() };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const starsHtml = (n, cls = '') => `<span class="ig-stars-s ${cls}">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;
// horns and car sounds run on their own audio context: general volume × effects volume, like the hub's sfx bus
const volume = () => { const s = getSettings(); return s.sound === false ? 0 : 0.7 * ((s.volume ?? 0.5) / 0.5) * ((s.sfxVol ?? 0.8) / 0.8); };
followVolume(volume);
const ZEN_D = { rilassato: [0.05, 0.3], medio: [0.3, 0.6], impegnativo: [0.6, 0.9] };

// ---------------------------------------------------------------- little CSS-drawn car (menus)
const miniCar = (color, cls = '') => `<i class="ig-mcar ${cls}" style="--c:${color}"><b></b></i>`;
function heroArt() {
  return `<div class="ig-art" aria-hidden="true"><div class="ig-art-lot">
    ${['#3aa0ff', '#ffc928', '#3fe0b0', '#9b5cff', '#ff8a3d'].map((c, i) => `<i class="ig-art-car v${i}" style="--c:${c}"></i>`).join('')}
    <i class="ig-art-car hero" style="--c:#ff3b3b"></i><i class="ig-art-exit"></i></div></div>`;
}
function wallet(p) {
  return `<div class="ig-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">${p.solved} puzzle risolti · ★ ${totalStars(p)}/${TOTAL * 3}</div></div>`;
}
const TABS = [['home', 'play', 'Gioca'], ['livelli', 'map', 'Livelli'], ['daily', 'calendar', 'Del giorno'], ['zen', 'sun', 'Zen'], ['garage', 'wrench', 'Garage']];

function homeView(p) {
  const n = nextLevel(p, TOTAL), done = n > TOTAL, nn = Math.min(n, TOTAL), w = WORLDS[Math.floor((nn - 1) / PER_WORLD)];
  const info = dailyInfo(), dd = p.daily?.key === info.key && p.daily.done;
  return `<section class="ig-hero" style="--acc:${w.color}">
      ${heroArt()}
      <div class="ig-hero-b">
        <div class="ig-k">${done ? 'Campagna completata' : `Livello ${levelName(nn)} · ${esc(w.name)}`}</div>
        <h2>${done ? 'Tutti i parcheggi liberati!' : esc(w.short)}</h2>
        <p>${done ? 'Rigioca i livelli per le tre stelle, prova le sfide generate o rilassati in modalità Zen.' : esc(w.rule)}</p>
        <div class="ig-hero-row">${starsHtml(Math.min(3, Math.round(totalStars(p) / Math.max(1, p.solved || 1))))}<span>★ ${totalStars(p)}/${TOTAL * 3}</span><span>${Object.keys(p.stars).filter((k) => /^c\d+$/.test(k)).length}/${TOTAL} livelli</span></div>
        <button class="btn primary big" data-a="ig-next">${icon('play')} ${done ? 'Scegli un livello' : n === 1 ? 'Inizia' : 'Continua'}</button>
      </div>
    </section>
    <div class="ig-cards">
      <div class="ig-card" data-a="ig-tab" data-v="daily" tabindex="0">${icon('calendar')}<b>Puzzle del giorno #${info.num}</b><span>${esc(MECH_NAME[info.mech])} · uguale per tutti${dd ? ' · <em>fatto!</em>' : ` · +${info.reward} monete`}</span>${p.streak > 1 ? `<small>${icon('flame')} serie di ${p.streak} giorni</small>` : ''}</div>
      <div class="ig-card" data-a="ig-tab" data-v="zen" tabindex="0">${icon('sun')}<b>Zen</b><span>Puzzle infiniti, senza fretta né cronometro.</span>${p.zen.solved ? `<small>${p.zen.solved} risolti</small>` : ''}</div>
      <div class="ig-card" data-a="ig-tab" data-v="livelli" data-pack="1" tabindex="0">${icon('target')}<b>Sfide generate</b><span>${PACKS.length * 100} livelli in 4 difficoltà, tutti con soluzione garantita.</span></div>
      <div class="ig-card" data-a="ig-tab" data-v="garage" tabindex="0">${icon('wrench')}<b>Garage</b><span>Vernici, modelli, clacson e città: si sbloccano con le monete.</span></div>
    </div>
    <section class="ig-how"><h3>Come si gioca</h3><div class="ig-how-g">
      <div>${icon('car')}<b>Trascina</b><span>Ogni veicolo scorre solo avanti e indietro. Un tocco lo fa partire.</span></div>
      <div>${icon('star')}<b>Tre stelle</b><span>Risolvi con il numero minimo di mosse (o quasi). Ogni spostamento conta una mossa.</span></div>
      <div>${icon('bulb')}<b>Aiuto</b><span>Il risolutore suggerisce la mossa migliore; con l’aiuto le stelle sono al massimo due.</span></div>
      <div>${icon('keyboard')}<b>Tastiera</b><span><span class="kbd">Tab</span> scegli, <span class="kbd">←↑↓→</span> sposta, <span class="kbd">Z</span> annulla, <span class="kbd">H</span> aiuto.</span></div>
    </div></section>`;
}

function levelsView(p) {
  const n = nextLevel(p, TOTAL);
  const wsel = G.world ?? Math.min(WORLDS.length - 1, Math.floor((Math.min(n, TOTAL) - 1) / PER_WORLD));
  const W = WORLDS[wsel];
  const wStars = (w) => { let s = 0; for (let k = 1; k <= PER_WORLD; k++) s += p.stars[`c${w * PER_WORLD + k}`] || 0; return s; };
  const tiles = [];
  for (let k = 1; k <= PER_WORLD; k++) {
    const id = wsel * PER_WORLD + k, st = p.stars[`c${id}`] || 0, open = id <= n;
    const L = campaignLevel(id);
    tiles.push(`<button class="ig-lv ${st ? 'done' : ''} ${open ? '' : 'locked'} ${id === n ? 'next' : ''}" data-a="ig-level" data-n="${id}" ${open ? '' : 'aria-disabled="true"'} aria-label="Livello ${levelName(id)}"><b>${k}</b>${open ? starsHtml(st) : icon('lock')}<small>${open ? `${L.opt} mosse${L.time ? ` · ${fmtT(L.time)}` : ''}` : ''}</small></button>`);
  }
  const P = PACKS.find((x) => x.id === G.pack) || PACKS[0], pdone = p.packs[P.id] || 0;
  const ptiles = [];
  for (let k = 1; k <= P.n; k++) { const st = p.stars[`${P.id}-${k}`] || 0, open = k <= pdone + 1; ptiles.push(`<button class="ig-pv ${st ? 'done' : ''} ${open ? '' : 'locked'} ${k === pdone + 1 ? 'next' : ''}" data-a="ig-pack-lv" data-n="${k}" aria-label="${esc(P.name)} ${k}">${k}${st ? `<i>${'★'.repeat(st)}</i>` : ''}</button>`); }
  return `<nav class="ig-worlds" aria-label="Mondi">${WORLDS.map((w, i) => { const open = i * PER_WORLD + 1 <= n; return `<button class="ig-wt ${i === wsel ? 'on' : ''} ${open ? '' : 'locked'}" data-a="ig-world" data-w="${i}" style="--wc:${w.color}">${icon(open ? w.icon : 'lock')}<b>${i + 1}. ${esc(w.name)}</b><small>★ ${wStars(i)}/${PER_WORLD * 3}</small></button>`; }).join('')}</nav>
    <section class="ig-world" style="--wc:${W.color}"><div class="ig-world-h"><div><div class="ig-k">Mondo ${wsel + 1} · ${esc(W.short)}</div><h3>${esc(W.name)}</h3><p>${esc(W.rule)}</p></div></div>
      <div class="ig-lvs">${tiles.join('')}</div></section>
    <section class="ig-packs" id="ig-packs"><h3 class="ig-h">Sfide generate · ${PACKS.length * 100} livelli</h3>
      <p class="ig-note">Puzzle creati dal generatore e verificati dal risolutore: ognuno ha una soluzione e il numero minimo di mosse è garantito. Tutte le meccaniche, a rotazione.</p>
      <div class="ig-pack-tabs">${PACKS.map((x) => `<button class="${x.id === P.id ? 'on' : ''}" data-a="ig-pack" data-id="${x.id}" style="--pc:${x.color}"><b>${esc(x.name)}</b><small>${p.packs[x.id] || 0}/${x.n}</small></button>`).join('')}</div>
      <div class="ig-pvs">${ptiles.join('')}</div></section>`;
}

function shareText(info, d) {
  const sq = Math.max(1, Math.min(10, Math.round((d.opt / Math.max(d.moves, d.opt)) * 10)));
  return [`Ingorgo #${info.num} 🚗 ${'⭐'.repeat(d.stars)}${'☆'.repeat(3 - d.stars)}`,
    `${'🟩'.repeat(sq)}${'🟥'.repeat(10 - sq)} ${d.moves} mosse (minimo ${d.opt})`,
    `⏱ ${fmtT(d.time)}${d.hints ? ` · 💡 ${d.hints}` : ''}${G.streak > 1 ? ` · 🔥 ${G.streak}` : ''}`].join('\n');
}
function dailyView(p) {
  const info = dailyInfo(), d = p.daily?.key === info.key ? p.daily : null;
  const dt = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  G.streak = p.streak;
  return `<section class="ig-daily">
    <div class="ig-daily-art">${heroArt()}</div>
    <div class="ig-daily-b">
      <div class="ig-k">${icon('calendar')} ${esc(dt)}</div>
      <h2>Puzzle del giorno #${info.num}</h2>
      <p>Oggi: <b>${esc(MECH_NAME[info.mech])}</b>. ${esc(MECH_RULE[info.mech])} Lo stesso puzzle per tutti: confronta le mosse con gli amici.</p>
      ${d?.done ? `<div class="ig-daily-res">${starsHtml(d.stars)}<span><b>${d.moves}</b> mosse (minimo ${d.opt}) · ${fmtT(d.time)}${d.hints ? ` · ${d.hints} aiuti` : ''}</span></div>
        <pre class="ig-share" id="ig-share">${esc(shareText(info, d))}</pre>
        <div class="ig-btns"><button class="btn primary" data-a="ig-share">${icon('upload')} Copia risultato</button><button class="btn" data-a="ig-daily">${icon('replay')} Rigioca (allenamento)</button></div>`
      : `<div class="ig-btns"><button class="btn primary big" data-a="ig-daily">${icon('play')} Gioca il puzzle</button><span class="ig-note">Prima soluzione: <b>+${info.reward} monete</b>${p.streak ? ` · serie attuale ${p.streak}` : ''}</span></div>`}
      <div class="ig-streak">${icon('flame')} Serie: <b>${p.streak || 0}</b> giorni · un nuovo puzzle ogni mezzanotte</div>
    </div></section>`;
}
function zenView(p) {
  const z = p.zen;
  return `<section class="ig-zen">
    <div class="ig-zen-b"><div class="ig-k">${icon('sun')} Modalità Zen</div><h2>Respira. Sposta. Esci.</h2>
      <p>Puzzle generati all’infinito, senza cronometro né stelle da inseguire: solo il piacere di sciogliere un ingorgo. Ogni puzzle risolto vale ${rewardFor('zen')} monete.</p>
      <h3 class="ig-h">Meccanica</h3>
      <div class="ig-seg">${['misto', ...MECH_IDS].map((m) => `<button class="${z.mech === m ? 'on' : ''}" data-a="ig-zmech" data-id="${m}">${m === 'misto' ? 'Tutte' : esc(MECH_NAME[m])}</button>`).join('')}</div>
      <h3 class="ig-h">Impegno</h3>
      <div class="ig-seg">${Object.keys(ZEN_D).map((d) => `<button class="${z.diff === d ? 'on' : ''}" data-a="ig-zdiff" data-id="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
      <div class="ig-btns mt16"><button class="btn primary big" data-a="ig-zen">${icon('play')} Inizia</button>${z.solved ? `<span class="ig-note">${z.solved} puzzle risolti in Zen</span>` : ''}</div>
    </div></section>`;
}
function garageView(p) {
  const sec = (kind, title, list, chip) => `<section class="ig-shop"><h3 class="ig-h">${title}</h3><div class="ig-items">${list.map((it) => {
    const own = p.owned[kind].includes(it.id), on = p[kind] === it.id;
    return `<button class="ig-item ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-a="ig-buy" data-k="${kind}" data-id="${it.id}">${chip(it)}<b>${esc(it.name)}</b><small>${on ? 'In uso' : own ? 'Usa' : `${icon('coin')} ${it.cost}`}</small></button>`;
  }).join('')}</div></section>`;
  const paint = PAINTS.find((x) => x.id === p.paint)?.color || '#ff3b3b';
  return `<p class="ig-note">Tutto si sblocca con le monete guadagnate risolvendo puzzle. Niente pubblicità, niente acquisti.</p>
    ${sec('paint', 'Vernice dell’auto protagonista', PAINTS, (it) => miniCar(it.color, it.metal ? 'metal' : ''))}
    ${sec('model', 'Modello', MODELS, (it) => `<i class="ig-model m-${it.id}" style="--c:${paint}"></i>`)}
    ${sec('horn', 'Clacson', HORN_LIST, () => `<i class="ig-horn">${icon('volume')}</i>`)}
    ${sec('theme', 'Città', THEMES, (it) => `<i class="ig-theme" style="background:${it.css}"></i>`)}`;
}

function menu(p) {
  const views = { home: homeView, livelli: levelsView, daily: dailyView, zen: zenView, garage: garageView };
  return `<div class="full-screen ig-menu">
    ${pageHead({ back: G.from, eyebrow: 'Baso Hub · Puzzle', title: 'Ingorgo', sub: 'Sblocca il traffico: sposta auto, furgoni e autobus nell’ordine giusto e fai uscire tutti dal parcheggio.', right: wallet(p) })}
    <nav class="ig-tabs" role="tablist">${TABS.map(([id, ic, name]) => `<button role="tab" aria-selected="${G.view === id}" class="${G.view === id ? 'on' : ''}" data-a="ig-tab" data-v="${id}">${icon(ic)}<span>${name}</span></button>`).join('')}</nav>
    <div class="ig-body">${(views[G.view] || homeView)(p)}</div>
  </div>`;
}

// ---------------------------------------------------------------- results
function results(r, x) {
  const P = G.play, L = P.level;
  const title = r.fail ? 'Tempo scaduto!' : L.goal === 'all' ? 'Tutti fuori!' : 'Uscita libera!';
  const [s3, s2] = starLimits(L.opt);
  let next = '';
  if (r.win && P.kind === 'campaign' && P.n < TOTAL) next = `<button class="btn primary" data-a="ig-go-next">${icon('play')} Livello ${levelName(P.n + 1)}</button>`;
  if (r.win && P.kind === 'pack' && P.n < 100) next = `<button class="btn primary" data-a="ig-go-next">${icon('play')} Prossimo</button>`;
  if (P.kind === 'zen') next = `<button class="btn primary" data-a="ig-go-next">${icon('play')} Nuovo puzzle</button>`;
  const head = P.kind === 'campaign' ? `Livello ${levelName(P.n)} · ${esc(WORLDS[L.world].name)}` : P.kind === 'pack' ? `Sfida ${esc(PACKS.find((q) => q.id === P.pack)?.name)} ${P.n}` : P.kind === 'daily' ? `Puzzle del giorno #${P.info.num}${x.practice ? ' · allenamento' : ''}` : `Zen · ${esc(MECH_NAME[L.mech] || '')}`;
  return `<div class="ig-res" role="dialog" aria-label="Risultati"><div class="ig-res-card ${r.fail ? 'fail' : ''}">
    <div class="ig-k">${head}</div>
    <h2>${title}</h2>
    ${P.kind !== 'zen' && !r.fail ? `<div class="ig-res-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? 'on' : ''}" style="--d:${i * 0.18}s">★</i>`).join('')}</div>` : ''}
    <div class="ig-res-stats">
      <div><b>${r.moves}</b><span>mosse</span></div>
      <div><b>${L.opt}</b><span>minimo</span></div>
      <div><b>${fmtT(r.time)}</b><span>tempo</span></div>
      ${x.coins ? `<div class="gold"><b>+${x.coins}</b><span>monete</span></div>` : ''}
    </div>
    ${r.fail ? '<p class="ig-note">Il traffico non aspetta: riprova, ormai conosci la strada.</p>' : P.kind !== 'zen' ? `<p class="ig-note">★★★ entro ${s3} mosse · ★★ entro ${s2}${L.time ? ' · e in fretta' : ''}${r.hinted ? ' · con l’aiuto massimo ★★' : ''}${x.record ? ' · <b>nuovo record!</b>' : ''}</p>` : ''}
    ${x.share ? `<pre class="ig-share" id="ig-share">${esc(x.share)}</pre>` : ''}
    <div class="ig-btns">${next}${x.share ? `<button class="btn ${next ? '' : 'primary'}" data-a="ig-share">${icon('upload')} Copia risultato</button>` : ''}
      <button class="btn ${next || x.share ? '' : 'primary'}" data-a="ig-again">${icon('replay')} Rigioca</button>
      <button class="btn ghost" data-a="ig-quit">${icon('left')} Menu</button>
      <button class="btn ghost" data-a="ig-hall">${icon('gamepad')} Baso Hub</button></div>
  </div></div>`;
}

// ---------------------------------------------------------------- playing
// stopped jobs never settle: forget the prepared puzzles that were waiting on them
function dropJobs() { stopJobs(); G.zenNext = null; G.packNext = null; }
function stopGame() { G.game?.destroy(); G.game = null; window.__ingorgo = null; }
function startPlay(play) { stopGame(); G.play = play; App.refresh(); }
async function loadLevel(P) {
  if (P.level) return P.level;
  if (P.kind === 'daily') {
    const info = dailyInfo();
    if (G.daily?.info.key === info.key) return (P.info = G.daily.info, G.daily.L);
    let cached = null; try { cached = JSON.parse(localStorage.getItem('sala_ingorgo_daily') || 'null'); } catch {}
    if (cached?.info?.key === info.key && cached.L) { G.daily = cached; P.info = cached.info; return cached.L; }
    const res = await job('daily', { date: Date.now() });
    G.daily = res; P.info = res.info; try { localStorage.setItem('sala_ingorgo_daily', JSON.stringify(res)); } catch {}
    return res.L;
  }
  if (P.kind === 'pack') {
    const key = `${P.pack}-${P.n}`;
    if (G.packCache.has(key)) return G.packCache.get(key);
    const L = await (G.packNext?.key === key ? G.packNext.p : packJob(P.pack, P.n));
    if (G.packNext?.key === key) G.packNext = null;
    return L;
  }
  if (P.kind === 'zen') {
    if (G.zenNext) { const z = await G.zenNext; G.zenNext = null; return z; }
    return zenJob();
  }
  throw new Error('livello sconosciuto');
}
// Hard puzzles take a few seconds to generate (the solver maps every reachable state): the work runs in
// the worker, the next puzzle is prepared ahead (results screen, Zen tab, pack list) and the loading
// screen shows the progress.
function showProg(f) {
  const bar = document.querySelector('#ig-root .ig-lbar'); if (!bar) return;
  bar.hidden = false; bar.firstElementChild.style.width = `${Math.round(Math.max(0.04, f) * 100)}%`;
}
const progOpt = { onProgress: showProg };
function packJob(pack, n) {
  const key = `${pack}-${n}`;
  return job('pack', { pack, n }, progOpt).then((L) => { G.packCache.set(key, L); if (G.packCache.size > 12) G.packCache.delete(G.packCache.keys().next().value); return L; });
}
function prefetchPack(pack, n) {
  const P = PACKS.find((x) => x.id === pack); if (!P || n > P.n) return;
  const key = `${pack}-${n}`; if (G.packCache.has(key) || G.packNext?.key === key) return;
  const p = packJob(pack, n); p.catch(() => {}); G.packNext = { key, p };
}
const idle = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 400));
function zenJob() {
  const z = igLoad().zen, mech = z.mech === 'misto' ? MECH_IDS[Math.floor(Math.random() * MECH_IDS.length)] : z.mech;
  const [a, b] = ZEN_D[z.diff] || ZEN_D.rilassato;
  return job('gen', { seed: (Math.random() * 2 ** 31) | 0, mech, d: a + Math.random() * (b - a) }, progOpt).then((L) => { delete L.time; L.id = 'zen'; return L; });
}
function playTitle(P, L) {
  if (P.kind === 'campaign') return [`Livello ${levelName(P.n)}`, WORLDS[L.world].name];
  if (P.kind === 'pack') return [`${PACKS.find((q) => q.id === P.pack)?.name} ${P.n}`, MECH_NAME[L.mech] || ''];
  if (P.kind === 'daily') return [`Del giorno #${P.info?.num ?? ''}`, MECH_NAME[L.mech] || ''];
  return ['Zen', MECH_NAME[L.mech] || ''];
}

function onEnd(r) {
  const P = G.play, L = P.level, p = igLoad(), x = { coins: 0 };
  if (r.win) {
    p.solved++; p.movesTotal += r.moves; p.hintsUsed += r.hints;
    if (P.kind === 'campaign' || P.kind === 'pack') {
      const id = P.kind === 'campaign' ? `c${P.n}` : `${P.pack}-${P.n}`, prev = p.stars[id] || 0;
      x.coins = rewardFor(P.kind, r.stars, prev);
      x.record = p.best[id] != null && r.moves < p.best[id];
      p.stars[id] = Math.max(prev, r.stars); p.best[id] = Math.min(p.best[id] ?? 999, r.moves);
      if (P.kind === 'pack') p.packs[P.pack] = Math.max(p.packs[P.pack] || 0, P.n);
    } else if (P.kind === 'daily') {
      const info = P.info, first = !(p.daily?.key === info.key && p.daily.done);
      if (first) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        p.streak = p.lastDaily === dayKey(y) ? (p.streak || 0) + 1 : 1; p.lastDaily = info.key;
        p.daily = { key: info.key, num: info.num, done: true, moves: r.moves, opt: L.opt, time: Math.round(r.time), hints: r.hints, stars: r.stars };
        x.coins = info.reward + Math.min(50, (p.streak - 1) * 5);
        G.streak = p.streak; x.share = shareText(info, p.daily);
      } else { x.practice = true; x.coins = 1; }
    } else { x.coins = rewardFor('zen'); p.zen.solved++; }
    p.coins += x.coins;
  }
  igSave(p);
  if (P.kind === 'zen') G.zenNext = zenJob(); // the next one is cooking while the results are up
  if (P.kind === 'pack' && r.win) prefetchPack(P.pack, P.n + 1);
  setTimeout(() => {
    const ov = document.getElementById('ig-over'); if (!ov || !G.play) return;
    ov.innerHTML = results(r, x);
    try { r.win ? (r.stars >= 3 || P.kind === 'zen' ? sfx.win() : sfx.ok()) : sfx.bad(); if (x.coins) setTimeout(() => snd.coin(), 500); } catch {}
    requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus({ preventScroll: true }));
  }, 250);
}

registerScreen({
  id: 'ingorgo', full: true,
  render(params) {
    if (params?.from) G.from = params.from;
    if (params?.tab) { G.view = params.tab; if (!params.keepPlay) { stopGame(); G.play = null; } delete params.tab; }
    if (params?.quick && !G.quickDone) { G.quickDone = true; const n = nextLevel(igLoad(), TOTAL); G.play = { kind: 'campaign', n: Math.min(n, TOTAL), level: campaignLevel(Math.min(n, TOTAL)) }; }
    if (params?.daily && !G.dailyDone) { G.dailyDone = true; G.play = { kind: 'daily' }; }
    if (params?.zen && !G.zenDone) { G.zenDone = true; G.play = { kind: 'zen' }; }
    if (G.play) return `<div class="ig-stage"><div class="ig-root" id="ig-root"><div class="ig-loading"><i class="ig-spin"></i>Si forma l’ingorgo…<div class="ig-lbar" hidden><i></i></div><small class="ig-lnote">I puzzle più difficili richiedono qualche secondo: il generatore verifica ogni mossa.</small><button class="btn ghost" data-a="ig-cancel">${icon('left')} Annulla</button></div></div><div class="ig-over" id="ig-over"></div></div>`;
    return menu(igLoad());
  },
  async mount() {
    if (!G.play) {
      // idle time in the menus: prepare the puzzle the player is most likely to open next
      if (G.view === 'zen' && !G.zenNext) idle(() => { if (!G.play && G.view === 'zen' && !G.zenNext) { G.zenNext = zenJob(); G.zenNext.catch(() => {}); } });
      if (G.view === 'livelli') idle(() => { if (!G.play && G.view === 'livelli') { const p = igLoad(); prefetchPack(G.pack, (p.packs[G.pack] || 0) + 1); } });
      requestAnimationFrame(() => document.querySelector('.ig-tabs .on')?.focus({ preventScroll: true })); if (G.view === 'livelli' && G.scrollPacks) { G.scrollPacks = false; document.getElementById('ig-packs')?.scrollIntoView({ block: 'start' }); } return; }
    const P = G.play, root = document.getElementById('ig-root');
    try { music.setMood?.(P.kind === 'zen' ? 'manage' : 'manage'); } catch {}
    let L;
    try { L = P.level = await loadLevel(P); } catch (e) { console.error(e); root.innerHTML = `<div class="ig-loading">Impossibile preparare il puzzle: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="ig-quit">Indietro</button></div>`; return; }
    if (G.play !== P || !root.isConnected) return;
    const { IngorgoGame } = await import('../ingorgo/game.js');
    if (G.play !== P || !root.isConnected) return;
    const p = igLoad(), [title, sub] = playTitle(P, L);
    const g = G.game = new IngorgoGame(root, {
      level: L, mode: P.kind, title: esc(title), sub: esc(sub), paint: p.paint, model: p.model, horn: p.horn, theme: p.theme, tier: gfxTier(), volume: volume(),
      onPause: (on) => {
        const ov = document.getElementById('ig-over'); if (!ov) return;
        ov.innerHTML = on ? `<div class="ig-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2><p class="ig-note">${esc(MECH_RULE[L.mech] || '')}</p><button class="btn primary" data-a="ig-resume">${icon('play')} Riprendi</button><button class="btn" data-a="ig-again">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="ig-quit">${icon('left')} Esci</button></div>` : '';
        if (on) requestAnimationFrame(() => ov.querySelector('.btn')?.focus());
      },
      onEnd,
    });
    window.__ingorgo = g;
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="ig-loading">Impossibile avviare il gioco: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="ig-quit">Indietro</button></div>`; }
  },
  unmount() { stopGame(); dropJobs(); G.play = null; G.quickDone = G.dailyDone = G.zenDone = false; },
  actions: {
    'ig-tab'(el) { G.view = el.dataset.v; if (el.dataset.pack) G.scrollPacks = true; App.refresh(); },
    'ig-world'(el) { const w = +el.dataset.w; if (w * PER_WORLD + 1 > nextLevel(igLoad(), TOTAL)) { sfx.bad?.(); App.toast('Mondo bloccato', `Completa il mondo ${w} per aprire «${WORLDS[w].name}».`, 'bad'); return; } G.world = w; App.refresh(); },
    'ig-level'(el) { const n = +el.dataset.n; if (n > nextLevel(igLoad(), TOTAL)) { sfx.bad?.(); App.toast('Livello bloccato', 'Risolvi prima il livello precedente.', 'bad'); return; } startPlay({ kind: 'campaign', n, level: campaignLevel(n) }); },
    'ig-next'() { const n = nextLevel(igLoad(), TOTAL); if (n > TOTAL) { G.view = 'livelli'; App.refresh(); return; } startPlay({ kind: 'campaign', n, level: campaignLevel(n) }); },
    'ig-pack'(el) { G.pack = el.dataset.id; G.scrollPacks = true; App.refresh(); },
    'ig-pack-lv'(el) { const n = +el.dataset.n, p = igLoad(); if (n > (p.packs[G.pack] || 0) + 1) { sfx.bad?.(); App.toast('Livello bloccato', 'Risolvi prima il livello precedente di questa serie.', 'bad'); return; } startPlay({ kind: 'pack', pack: G.pack, n }); },
    'ig-daily'() { startPlay({ kind: 'daily' }); },
    'ig-zen'() { startPlay({ kind: 'zen' }); },
    'ig-zmech'(el) { const p = igLoad(); p.zen.mech = el.dataset.id; igSave(p); if (G.zenNext) dropJobs(); App.refresh(); },
    'ig-zdiff'(el) { const p = igLoad(); p.zen.diff = el.dataset.id; igSave(p); if (G.zenNext) dropJobs(); App.refresh(); },
    'ig-buy'(el) {
      const k = el.dataset.k, p = igLoad(), it = SHOP[k].find((x) => x.id === el.dataset.id); if (!it) return;
      if (k === 'horn') { setVolume(volume()); snd.honk(it.id); }
      if (p.owned[k].includes(it.id)) { p[k] = it.id; igSave(p); App.refresh(); return; }
      if (p.coins < it.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${it.cost - p.coins} monete per «${it.name}». Le guadagni risolvendo puzzle.`, 'bad'); return; }
      App.confirm(`Sbloccare «${it.name}»?`, `Costa ${it.cost} monete (ne hai ${p.coins}).`, () => { const q = igLoad(); q.coins -= it.cost; q.owned[k].push(it.id); q[k] = it.id; igSave(q); sfx.coin?.(); App.refresh(); });
    },
    async 'ig-share'() {
      const t = document.getElementById('ig-share')?.textContent || '';
      let ok = false;
      try { if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text: t }); ok = true; } } catch {}
      if (!ok) try { await navigator.clipboard.writeText(t); ok = true; } catch {}
      App.toast(ok ? 'Risultato copiato' : 'Copia non riuscita', ok ? 'Incollalo dove vuoi per sfidare gli amici.' : 'Seleziona il testo e copialo a mano.', ok ? 'good' : 'bad');
    },
    'ig-resume'() { G.game?.togglePause(false); },
    'ig-again'() { const P = G.play; if (!P) return; startPlay({ ...P }); },
    'ig-go-next'() {
      const P = G.play; if (!P) return;
      if (P.kind === 'campaign') startPlay({ kind: 'campaign', n: P.n + 1, level: campaignLevel(P.n + 1) });
      else if (P.kind === 'pack') startPlay({ kind: 'pack', pack: P.pack, n: P.n + 1 });
      else startPlay({ kind: 'zen' });
    },
    'ig-quit'() { const P = G.play; stopGame(); G.play = null; G.view = P?.kind === 'daily' ? 'daily' : P?.kind === 'zen' ? 'zen' : P?.kind === 'pack' || P?.kind === 'campaign' ? 'livelli' : G.view; if (P?.kind === 'pack') G.scrollPacks = true; if (P?.kind === 'campaign') G.world = P.level.world; App.refresh(); },
    'ig-hall'() { stopGame(); G.play = null; App.go('launcher'); },
    // leave the loading screen: the abandoned generation is dropped with the worker
    'ig-cancel'() { const P = G.play; if (G.game) return; dropJobs(); G.play = null; G.view = P?.kind === 'daily' ? 'daily' : P?.kind === 'zen' ? 'zen' : P?.kind === 'pack' ? 'livelli' : G.view; App.refresh(); },
  },
});
