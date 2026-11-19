// Minigolf Baso — menu (Gioca, Percorsi, Multigiocatore, Buca del giorno, Armadietto), the live round
// and the scorecard. The editor lives in minigolf-editor.js.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { mgLoad, mgSave, holeStars, totalStars } from '../minigolf/store.js';
import { COURSES, THEMES, courseById, coursePar } from '../minigolf/courses.js';
import { BALLS, HATS, TRAILS, SHOP, PLAYER_COLORS, PLAYER_BALLS, holeCoins, scoreName, COURSE_BONUS, DAILY_BONUS, dailyHole, dayKey, courseUnlocked } from '../minigolf/meta.js';
import { decode } from '../minigolf/code.js';
import '../minigolf/minigolf.css';

const V = { tab: 'gioca', from: 'launcher', playing: null, game: null, result: null, course: null, np: 2 };
const fmtPar = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);
const stars = (n, of = 3) => `<span class="mg-st">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
const TABS = [['gioca', 'play', 'Gioca'], ['percorsi', 'map', 'Percorsi'], ['multi', 'users', 'Multigiocatore'], ['daily', 'calendar', 'Buca del giorno'], ['armadietto', 'palette', 'Armadietto']];

function nextCourse(p) {
  const i = COURSES.findIndex((c, k) => courseUnlocked(p, k) && !p.courses[c.id]?.done);
  return COURSES[i >= 0 ? i : COURSES.findIndex((c) => c.id === p.course) || 0] || COURSES[0];
}
function miniMap(h, th) {
  const W = Math.max(...h.rows.map((r) => r.length)), H = h.rows.length, s = Math.min(10, 120 / Math.max(W, H));
  const C = { '.': null, w: th.water, l: '#ff6a1f', s: '#f1d48a', i: '#cfefff', X: '#555', H: '#111', S: '#fff', B: '#ff3fa4', M: '#f7efe2', O: '#ffd23f', T: '#ff8a1f', U: '#ff8a1f', t: '#5ff2ff', u: '#5ff2ff', g: '#8e6cff', Z: '#ff8a1f' };
  let r = '';
  h.rows.forEach((row, y) => [...row].forEach((ch, x) => { const c = ch in C ? C[ch] : /[2468]/.test(ch) ? '#2b2f3a' : /[\^<>v]/.test(ch) ? th.felt2 : th.felt; if (c) r += `<rect x="${x * s}" y="${y * s}" width="${s + 0.3}" height="${s + 0.3}" fill="${c}"/>`; }));
  return `<svg class="mg-mini" viewBox="0 0 ${W * s} ${H * s}" aria-hidden="true">${r}</svg>`;
}
const ballChip = (b) => `<i class="mg-ballchip" style="background:${b.css}"></i>`;

function wallet(p) { return `<div class="mg-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${p.coins}</b><div class="w-s">★ ${totalStars(p, COURSES.flatMap((c) => c.holes))} / ${COURSES.length * 27}</div></div>`; }

function tabGioca(p) {
  const c = nextCourse(p), ci = COURSES.indexOf(c), cs = p.courses[c.id];
  const d = dailyHole(), dd = p.daily[d.daily];
  return `<div class="mg-home">
    <section class="mg-hero" style="--a:${c.accent};--k0:${c.sky[0]};--k1:${c.sky[1]}">
      <div class="mg-hero-t"><div class="mg-k">${icon(c.icon)} Percorso ${ci + 1} di ${COURSES.length}</div><h2>${esc(c.name)}</h2><p>${esc(c.sub)} · 9 buche · Par ${coursePar(c)}</p>
      <div class="mg-hero-s">${stars(Math.round(totalStars(p, c.holes) / 9), 3)} <span>★ ${totalStars(p, c.holes)}/27${cs?.best ? ` · record ${cs.best} (${fmtPar(cs.best - coursePar(c))})` : ''}</span></div>
      <button class="btn primary big" data-a="mg-round" data-c="${c.id}">${icon('play')} Gioca ${esc(c.name)}</button></div>
      ${miniMap(c.holes[0], c)}
    </section>
    <div class="mg-quick">
      <div class="mg-q" data-a="mg-tab" data-id="daily" tabindex="0">${icon('calendar')}<b>Buca del giorno</b><span>${dd?.done ? `Fatta in ${dd.best} · serie ${p.streak}` : `+${DAILY_BONUS} monete alla prima buca`}</span></div>
      <div class="mg-q" data-a="mg-tab" data-id="multi" tabindex="0">${icon('users')}<b>Multigiocatore</b><span>Da 2 a 4 giocatori sullo stesso schermo</span></div>
      <div class="mg-q" data-a="mg-editor" tabindex="0">${icon('wrench')}<b>Editor</b><span>Crea una buca e condividila con un codice</span></div>
      <div class="mg-q" data-a="mg-tab" data-id="armadietto" tabindex="0">${icon('palette')}<b>Armadietto</b><span>Palline, cappelli e scie</span></div>
    </div>
    <section class="mg-how"><h3>Come si gioca</h3><ul>
      <li><b>Trascina indietro</b> dalla pallina come una fionda: direzione e potenza, poi rilascia.</li>
      <li><b>Tastiera</b>: ← → mira, ↑ ↓ potenza, Spazio tira, Tab panoramica, Q/E ruota. <b>Controller</b>: levetta e grilletti, A tira.</li>
      <li><b>Acqua, lava e fuori percorso</b>: +1 colpo e si riparte dal punto del tiro. Massimo ${10} colpi per buca.</li>
      <li><b>Stelle</b>: ★★★ sotto il par, ★★ al par, ★ in buca. Le monete sbloccano palline, cappelli e scie.</li></ul></section>
  </div>`;
}
function tabPercorsi(p) {
  return `<div class="mg-courses">${COURSES.map((c, i) => {
    const open = courseUnlocked(p, i), cs = p.courses[c.id], st = totalStars(p, c.holes);
    return `<section class="mg-course ${open ? '' : 'locked'}" style="--a:${c.accent};--k0:${c.sky[0]};--k1:${c.sky[1]}">
      <header><div><div class="mg-k">${icon(c.icon)} Percorso ${i + 1}${c.g && c.g !== 1 ? ' · gravità bassa' : ''}</div><h3>${esc(c.name)}</h3><p>${esc(c.sub)} · Par ${coursePar(c)}${cs?.best ? ` · record <b>${cs.best}</b> (${fmtPar(cs.best - coursePar(c))})` : ''}</p></div>
      <div class="mg-course-r"><span>★ ${st}/27</span>${open ? `<button class="btn primary" data-a="mg-round" data-c="${c.id}">${icon('play')} 9 buche</button>` : `<span class="mg-lock">${icon('lock')} Completa ${esc(COURSES[i - 1].name)}</span>`}</div></header>
      <div class="mg-holes">${c.holes.map((h, k) => `<button class="mg-hole-b" data-a="mg-single" data-c="${c.id}" data-h="${k}" ${open ? '' : 'disabled'} title="Allenamento: ${esc(h.name)}">${miniMap(h, c)}<b>${k + 1}. ${esc(h.name)}</b><span>Par ${h.par}${p.best[h.id] ? ` · ${p.best[h.id]}` : ''}</span>${stars(holeStars(p.best[h.id], h.par))}</button>`).join('')}</div>
    </section>`;
  }).join('')}</div>`;
}
function tabMulti(p) {
  const n = V.np || p.np || 2;
  return `<div class="mg-multi"><section><h3>Giocatori</h3>
    <div class="mg-seg">${[2, 3, 4].map((k) => `<button class="${k === n ? 'on' : ''}" data-a="mg-np" data-n="${k}">${k} giocatori</button>`).join('')}</div>
    <div class="mg-pl">${Array.from({ length: n }, (_, i) => `<label style="--c:${PLAYER_COLORS[i]}"><i></i><input class="mg-pname" data-i="${i}" maxlength="14" value="${esc(p.players[i])}" aria-label="Nome giocatore ${i + 1}"></label>`).join('')}</div>
    <p class="muted">Si tira a turno, un colpo a testa: le altre palline sono fantasmi e non si urtano. Vince chi chiude con meno colpi.</p></section>
    <section><h3>Percorso</h3><div class="mg-mc">${COURSES.map((c) => `<button class="mg-mc-b" data-a="mg-multi-go" data-c="${c.id}" style="--a:${c.accent};--k0:${c.sky[0]};--k1:${c.sky[1]}">${icon(c.icon)}<b>${esc(c.name)}</b><span>9 buche · Par ${coursePar(c)}</span></button>`).join('')}
      <button class="mg-mc-b" data-a="mg-multi-go" data-c="mix" style="--a:#ffd23f;--k0:#222;--k1:#555">${icon('star')}<b>Misto</b><span>9 buche scelte dai 5 percorsi</span></button></div></section></div>`;
}
function tabDaily(p) {
  const d = dailyHole(), dd = p.daily[d.daily], th = THEMES[d.theme];
  const dt = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const hist = Object.entries(p.daily).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 7);
  return `<div class="mg-daily"><section class="mg-hero" style="--a:${th.accent};--k0:${th.sky[0]};--k1:${th.sky[1]}">
    <div class="mg-hero-t"><div class="mg-k">${icon('calendar')} ${esc(dt)}</div><h2>${esc(d.name)}</h2><p>${esc(th.name)} · Par ${d.par} · la stessa buca per tutti, oggi.</p>
    <div class="mg-hero-s">${dd?.done ? `Il tuo migliore oggi: <b>${dd.best}</b> (${esc(scoreName(dd.best, d.par))}) ${stars(holeStars(dd.best, d.par))}` : `Prima buca completata: <b>+${DAILY_BONUS} monete</b>`} · Serie: <b>${p.streak || 0}</b> ${p.streak === 1 ? 'giorno' : 'giorni'}</div>
    <button class="btn primary big" data-a="mg-daily">${icon('play')} ${dd?.done ? 'Riprova' : 'Gioca la buca'}</button></div>${miniMap(d, th)}</section>
    ${hist.length ? `<section><h3>Ultimi giorni</h3><ul class="mg-hist">${hist.map(([k, v]) => `<li><span>${esc(k)}</span><b>${v.best}</b><em>par ${v.par || '?'}</em></li>`).join('')}</ul></section>` : ''}</div>`;
}
function tabShop(p) {
  const row = (kind, list, label) => `<section><h3>${label}</h3><div class="mg-shop">${list.map((x) => {
    const own = p.owned[kind].includes(x.id), on = p[kind] === x.id;
    const sw = kind === 'ball' ? ballChip(x) : kind === 'hat' ? `<i class="mg-hatchip">${x.emoji}</i>` : `<i class="mg-trailchip" style="background:${x.css}"></i>`;
    return `<button class="mg-item ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-a="mg-buy" data-k="${kind}" data-id="${x.id}">${sw}<b>${esc(x.name)}</b><span>${on ? 'In uso' : own ? 'Usa' : `${icon('coin')} ${x.cost}`}</span></button>`;
  }).join('')}</div></section>`;
  return `<div class="mg-arm">${row('ball', BALLS, 'Palline')}${row('hat', HATS, 'Cappelli')}${row('trail', TRAILS, 'Scie')}<p class="muted">Le monete si guadagnano giocando: buche sotto il par, percorsi completati e buca del giorno. Niente pubblicità, niente acquisti con soldi veri.</p></div>`;
}

function menu() {
  const p = mgLoad();
  const body = { gioca: tabGioca, percorsi: tabPercorsi, multi: tabMulti, daily: tabDaily, armadietto: tabShop }[V.tab] || tabGioca;
  return `<div class="full-screen mg-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Party', title: 'Minigolf Baso', sub: '5 percorsi, 45 buche: mulini, giri della morte, lava, ghiaccio e gravità bassa.', right: wallet(p) })}
    <nav class="mg-tabs" role="tablist">${TABS.map(([id, ic, n]) => `<button role="tab" aria-selected="${V.tab === id}" class="${V.tab === id ? 'on' : ''}" data-a="mg-tab" data-id="${id}">${icon(ic)}<span>${n}</span></button>`).join('')}<button data-a="mg-editor">${icon('wrench')}<span>Editor</span></button></nav>
    ${body(p)}
  </div>`;
}

// ---------- results
function results(r) {
  const solo = r.players.length === 1;
  const holes = r.holes;
  const order = [...r.players].sort((a, b) => a.total - b.total);
  const head = `<tr><th>Buca</th>${holes.map((h, i) => `<th title="${esc(h.name)}">${i + 1}</th>`).join('')}<th>Tot</th></tr><tr class="par"><td>Par</td>${holes.map((h) => `<td>${h.par}</td>`).join('')}<td>${r.par}</td></tr>`;
  const rows = r.players.map((p) => `<tr style="--c:${p.color}"><td><i></i>${esc(p.name)}</td>${holes.map((h, i) => { const s = p.card[i]; const d = s - h.par; return `<td class="${s === 1 ? 'ace' : d < 0 ? 'under' : d > 0 ? 'over' : ''}">${s ?? '–'}</td>`; }).join('')}<td><b>${p.total}</b></td></tr>`).join('');
  const title = solo ? (r.players[0].vs <= 0 ? 'Percorso completato!' : 'Fine del giro') : `Vince ${esc(order[0].name)}!`;
  return `<div class="mg-res" role="dialog" aria-label="Risultati"><div class="mg-res-card">
    <div class="mg-card-k">${esc(r.title)}</div><h2>${title}</h2>
    ${solo ? `<div class="mg-res-big">${r.players[0].total} colpi <span>${fmtPar(r.players[0].vs)}</span></div>` : `<ol class="mg-podium">${order.map((p, i) => `<li style="--c:${p.color}"><span>${i + 1}°</span><i></i><b>${esc(p.name)}</b><em>${p.total} (${fmtPar(p.vs)})</em></li>`).join('')}</ol>`}
    ${r.stars != null ? `<div class="mg-stars big">${stars(r.stars)}</div>` : ''}
    <div class="mg-sc-wrap"><table class="mg-sc">${head}${rows}</table></div>
    ${r.coins ? `<div class="mg-card-coins">+${r.coins} monete${r.bonus ? ` (bonus percorso +${r.bonus})` : ''}${r.unlocked ? ` · <b>sbloccato ${esc(r.unlocked)}!</b>` : ''}</div>` : ''}
    <div class="mg-card-btns"><button class="btn primary" data-a="mg-again">${icon('replay')} Rigioca</button><button class="btn" data-a="mg-menu">${icon('left')} Menu minigolf</button><button class="btn ghost" data-a="mg-hub">${icon('gamepad')} Baso Hub</button></div>
  </div></div>`;
}

// ---------- starting rounds
function soloPlayer(p) { return [{ name: 'Tu', color: '#ffffff', skin: p.ball, hat: p.hat, trail: p.trail }]; }
function multiPlayers(p, n) { return Array.from({ length: n }, (_, i) => ({ name: p.players[i] || `Giocatore ${i + 1}`, color: PLAYER_COLORS[i], skin: i === 0 ? p.ball : PLAYER_BALLS[i], hat: i === 0 ? p.hat : 'nessuno', trail: i === 0 ? p.trail : 'nessuna' })); }
function mixHoles() { const k = Math.floor(Date.now() / 86400000); return Array.from({ length: 9 }, (_, i) => COURSES[i % 5].holes[(k + i * 4) % 9]); }
function startPlay(play) { V.playing = play; V.result = null; App.refresh(); }

registerScreen({
  id: 'minigolf', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.tab) { V.tab = params.tab; delete params.tab; }
    if (params?.play) { V.playing = params.play; V.result = null; delete params.play; }
    if (params?.quick) { delete params.quick; const p = mgLoad(); const c = nextCourse(p); V.playing = { kind: 'round', course: c.id, holes: c.holes, players: soloPlayer(p), title: c.name }; }
    if (V.playing) return `<div class="mg-stage"><div class="mg-root" id="mg-root"><div class="mg-loading">Si prepara il green…</div></div><div class="mg-res-host" id="mg-res"></div></div>`;
    return menu();
  },
  async mount() {
    if (!V.playing) { requestAnimationFrame(() => document.querySelector('.mg-menu .btn.primary, .mg-tabs .on')?.focus({ preventScroll: true })); return; }
    const root = document.getElementById('mg-root');
    try { music.setMood?.('voragine'); } catch {}
    const { MinigolfGame } = await import('../minigolf/game.js');
    if (!V.playing || !root?.isConnected) return;
    const s = getSettings(), play = V.playing;
    const totals = { coins: 0 };
    const g = V.game = new MinigolfGame(root, {
      holes: play.holes, players: play.players, tier: gfxTier(), sound: s.sound !== false,
      label: (i) => play.kind === 'daily' ? 'Buca del giorno' : play.kind === 'custom' ? (play.test ? 'Prova editor' : 'Buca personalizzata') : play.holes.length === 1 ? `${THEMES[play.holes[0].theme]?.name || ''} · Buca ${play.holes[0].n + 1}` : `Buca ${i + 1} di ${play.holes.length}`,
      onHole: (spec, res) => {
        if (play.players.length > 1 || play.kind === 'custom') return {};
        const st = mgLoad(), r = res[0];
        st.stats.holes++; st.stats.shots += r.strokes; if (r.strokes === 1) st.stats.aces++;
        let coins = 0, record = false;
        if (play.kind === 'daily') {
          const k = spec.daily, prev = st.daily[k];
          if (!prev?.done) {
            coins += DAILY_BONUS;
            const y = new Date(); y.setDate(y.getDate() - 1);
            st.streak = st.lastDaily === dayKey(y) ? (st.streak || 0) + 1 : 1; st.lastDaily = k;
          }
          record = !prev?.best || r.strokes < prev.best;
          st.daily[k] = { done: true, best: Math.min(prev?.best || 99, r.strokes), par: spec.par };
          coins += holeCoins(r.strokes, spec.par);
        } else {
          record = !st.best[spec.id] || r.strokes < st.best[spec.id];
          const before = st.best[spec.id];
          st.best[spec.id] = Math.min(before || 99, r.strokes);
          // coins: full reward for a better result than before, a token otherwise (no farming)
          coins += !before || r.strokes < before ? holeCoins(r.strokes, spec.par) : 1;
        }
        st.coins += coins; totals.coins += coins;
        mgSave(st);
        return { coins, record, stars: holeStars(r.strokes, spec.par) };
      },
      onEnd: (sum) => {
        const st = mgLoad();
        const r = { ...sum, title: play.title || '', coins: totals.coins };
        if (play.kind === 'round' && play.players.length === 1) {
          const c = courseById(play.course), tot = sum.players[0].total;
          const prev = st.courses[c.id];
          const wasDone = !!prev?.done;
          st.courses[c.id] = { done: true, best: Math.min(prev?.best || 999, tot) };
          if (!wasDone) { st.coins += COURSE_BONUS; r.bonus = COURSE_BONUS; r.coins += COURSE_BONUS; const ni = COURSES.indexOf(c) + 1; if (COURSES[ni]) r.unlocked = COURSES[ni].name; }
          st.course = c.id;
          r.stars = Math.max(1, Math.min(3, tot <= sum.par - 3 ? 3 : tot <= sum.par ? 2 : 1));
        }
        st.stats.rounds++;
        mgSave(st);
        if (play.test) { V.playing = null; App.go('minigolf-editor', { tested: sum.players[0].total }); return; }
        if (play.holes.length === 1) { stopGame(); V.playing = null; V.tab = play.kind === 'daily' ? 'daily' : play.kind === 'custom' ? 'gioca' : 'percorsi'; if (play.kind === 'custom') { App.go('minigolf-editor', {}); return; } App.refresh(); return; }
        V.result = r;
        const host = document.getElementById('mg-res'); if (!host) return;
        host.innerHTML = results(r);
        try { sfx.win(); } catch {}
        requestAnimationFrame(() => host.querySelector('.btn.primary')?.focus({ preventScroll: true }));
      },
      onQuit: () => { const back = play.test || play.kind === 'custom'; stopGame(); V.playing = null; if (back) App.go('minigolf-editor', {}); else App.refresh(); },
    });
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="mg-loading">Impossibile avviare il minigolf: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="mg-menu">Indietro</button></div>`; }
  },
  unmount() { stopGame(); V.playing = null; V.result = null; },
  actions: {
    'mg-tab'(el) { V.tab = el.dataset.id; App.refresh(); },
    'mg-editor'() { App.go('minigolf-editor', { from: 'minigolf' }); },
    'mg-round'(el) { const p = mgLoad(), c = courseById(el.dataset.c); if (!c) return; startPlay({ kind: 'round', course: c.id, holes: c.holes, players: soloPlayer(p), title: c.name }); },
    'mg-single'(el) { const p = mgLoad(), c = courseById(el.dataset.c), h = c?.holes[+el.dataset.h]; if (!h) return; startPlay({ kind: 'single', holes: [h], players: soloPlayer(p), title: h.name }); },
    'mg-daily'() { const p = mgLoad(); startPlay({ kind: 'daily', holes: [dailyHole()], players: soloPlayer(p), title: 'Buca del giorno' }); },
    'mg-np'(el) { V.np = +el.dataset.n; const p = mgLoad(); p.np = V.np; mgSave(p); App.refresh(); },
    'mg-multi-go'(el) {
      const p = mgLoad();
      document.querySelectorAll('.mg-pname').forEach((i) => { p.players[+i.dataset.i] = (i.value || '').trim().slice(0, 14) || `Giocatore ${+i.dataset.i + 1}`; });
      mgSave(p);
      const n = V.np || p.np || 2, c = courseById(el.dataset.c);
      startPlay({ kind: 'multi', holes: c ? c.holes : mixHoles(), players: multiPlayers(p, n), title: c ? c.name : 'Percorso misto' });
    },
    'mg-buy'(el) {
      const p = mgLoad(), k = el.dataset.k, it = SHOP[k]?.find((x) => x.id === el.dataset.id); if (!it) return;
      if (p.owned[k].includes(it.id)) { p[k] = it.id; mgSave(p); sfx.select?.(); App.refresh(); return; }
      if (p.coins < it.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${it.cost - p.coins} monete per «${esc(it.name)}». Le guadagni giocando.`, 'bad'); return; }
      App.confirm(`Sbloccare «${it.name}»?`, `Costa ${it.cost} monete (ne hai ${p.coins}).`, () => { const q = mgLoad(); if (q.coins < it.cost) return; q.coins -= it.cost; q.owned[k].push(it.id); q[k] = it.id; mgSave(q); try { sfx.coin(); } catch {} App.refresh(); });
    },
    'mg-again'() { const play = V.playing; stopGame(); V.result = null; V.playing = play; App.refresh(); },
    'mg-menu'() { stopGame(); V.playing = null; V.result = null; App.refresh(); },
    'mg-hub'() { stopGame(); V.playing = null; V.result = null; App.go('launcher'); },
  },
});
function stopGame() { V.game?.destroy(); V.game = null; }
export { decode };
