// Festa Baso — menus (modes, seats and devices, options, minigame picker, characters & hats shop, stats)
// and the full-screen party (src/festa/session.js owns the renderer, the board, the minigames, the podium).
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { gfxTier } from '../ui/quality.js';
import { feLoad, feSave, feLoadBoard, feClearBoard } from '../festa/store.js';
import { CHARS, HATS, charById, hatById } from '../festa/roster.js';
import { MINIGAMES, MINI } from '../festa/mini/index.js';
import { DEVICES, devById, defaultDevices, isTouchDevice } from '../festa/input.js';
import { SLOT_COLORS } from '../festa/mini/base.js';
import '../festa/festa.css';

const V = { page: 'home', mode: 'board', from: 'launcher', playing: false, session: null, cfg: null, seat: 0 };
const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const MODES = {
  board: { name: 'Tabellone', icon: 'board', desc: 'Il gioco da tavolo: dado, caselle, monete e stelle. Un minigioco a ogni turno, premi finali e podio.' },
  torneo: { name: 'Torneo', icon: 'trophy', desc: 'Scegli i minigiochi: il primo che ne vince N è il campione.' },
  train: { name: 'Allenamento', icon: 'target', desc: 'Qualsiasi minigioco, da solo contro la CPU o in compagnia.' },
  chars: { name: 'Personaggi', icon: 'palette', desc: 'Sblocca personaggi e cappelli con le monete della festa.' },
};

// a bean figure in SVG for the menus (same colours and hats as in 3D)
const HAT_SVG = {
  nessuno: '', festa: '<path d="M-9 -24 L0 -50 L9 -24 z" fill="#ffe14d" stroke="var(--a)" stroke-width="3" stroke-dasharray="4 4"/><circle cx="0" cy="-51" r="4" fill="#fff"/>',
  berretto: '<path d="M-15 -24 a15 12 0 0 1 30 0 z" fill="var(--a)"/><rect x="8" y="-26" width="14" height="4" rx="2" fill="var(--a)"/>',
  fiocco: '<path d="M0 -30 L-13 -38 L-13 -22 z M0 -30 L13 -38 L13 -22 z" fill="#ff5fa2"/><circle cx="0" cy="-30" r="4" fill="#ff5fa2"/>',
  cilindro: '<rect x="-16" y="-27" width="32" height="4" rx="2" fill="#1b1b22"/><rect x="-10" y="-48" width="20" height="22" fill="#1b1b22"/><rect x="-10" y="-31" width="20" height="4" fill="var(--a)"/>',
  elica: '<path d="M-13 -24 a13 10 0 0 1 26 0 z" fill="#2f6bff"/><rect x="-1" y="-40" width="2" height="8" fill="#ccc"/><ellipse cx="-8" cy="-41" rx="8" ry="2.5" fill="#ff3b5c"/><ellipse cx="8" cy="-41" rx="8" ry="2.5" fill="#ffd23f"/>',
  vichingo: '<path d="M-15 -22 a15 13 0 0 1 30 0 z" fill="#9aa3ad"/><path d="M-14 -28 q-10 -4 -9 -16 q3 8 11 10z M14 -28 q10 -4 9 -16 q-3 8 -11 10z" fill="#fff5dc"/>',
  aureola: '<ellipse cx="0" cy="-44" rx="13" ry="4" fill="none" stroke="#fff27a" stroke-width="3"/>',
  corona: '<path d="M-12 -24 L-12 -40 L-6 -32 L0 -43 L6 -32 L12 -40 L12 -24 z" fill="#ffcc1a" stroke="#c48a00" stroke-width="1.5"/>',
};
function bean(ch, hat, size = 64) {
  return `<svg class="fz-bean" viewBox="-30 -56 60 76" width="${size}" height="${size * 1.27}" style="--a:${ch.accent}" aria-hidden="true"><ellipse cx="0" cy="17" rx="16" ry="3.5" fill="rgba(0,0,0,.2)"/>
    <rect x="-8" y="6" width="5" height="11" rx="2.5" fill="${ch.color}" opacity=".8"/><rect x="3" y="6" width="5" height="11" rx="2.5" fill="${ch.color}" opacity=".8"/>
    <rect x="-15" y="-24" width="30" height="34" rx="15" fill="${ch.color}"/><ellipse cx="-5" cy="-12" rx="4.5" ry="5" fill="#fff"/><ellipse cx="5" cy="-12" rx="4.5" ry="5" fill="#fff"/><circle cx="-4.5" cy="-11" r="2.2" fill="#111"/><circle cx="5.5" cy="-11" r="2.2" fill="#111"/>${HAT_SVG[hat] || ''}</svg>`;
}

// a board party left half-way (saved between turns): resume it or throw it away
function resumeCard() {
  const S = feLoadBoard(); if (!S) return '';
  const B = S.B, who = (S.cfg.seats || []).slice(0, S.cfg.n).map((s, i) => `<i style="background:${SLOT_COLORS[i]}">${esc(charById(s.char).name.split(' ')[0])}</i>`).join('');
  const when = new Date(S.at || Date.now()).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="fz-resume"><div><b>Festa in sospeso</b><span>Tabellone · turno ${Math.min(B.round, B.rounds)} di ${B.rounds} · ${S.cfg.n} giocatori · ${esc(when)}</span><span class="who">${who}</span></div>
    <div class="fz-btns"><button class="btn primary" data-a="fz-resume">${icon('play')} Riprendi la festa</button><button class="btn" data-a="fz-discard">Abbandona</button></div></div>`;
}
function home(d) {
  const st = d.stats;
  return `<div class="full-screen fz-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Party', title: 'Festa Baso', sub: 'Il party game di tutto il Baso Hub: 15 minigiochi da 30-60 secondi per 2-4 giocatori sullo stesso schermo, con tabellone, torneo e allenamento.', right: `<div class="fz-wallet"><div class="w-k">Monete festa</div><b>${icon('coin')} ${fmt(d.coins)}</b><div class="w-s">${st.boards} feste · ${st.kings} corone · ${st.miniWins} minigiochi vinti</div></div>` })}
    ${resumeCard()}
    <div class="fz-modes">${Object.entries(MODES).map(([id, m]) => `<button class="fz-mode" data-a="fz-mode" data-id="${id}" style="--c:${{ board: '#ff4d6d', torneo: '#ffc21a', train: '#2f8cff', chars: '#2fd36b' }[id]}">${icon(m.icon)}<b>${m.name}</b><span>${m.desc}</span></button>`).join('')}</div>
    <section class="fz-sec"><h3>I minigiochi</h3><div class="fz-minis">${MINIGAMES.map((m) => { const s = st.perMini[m.id]; return `<div class="fz-mcard" style="--c:${m.color}"><b>${esc(m.name)}</b><small>${esc(m.from)} · ${m.kind === 'team' ? 'a squadre' : m.kind === 'coop' ? 'cooperativo' : 'tutti contro tutti'}</small><span>${esc(m.desc)}</span>${s ? `<em>${s.won}/${s.played} vinti</em>` : ''}</div>`; }).join('')}</div></section>
    <section class="fz-sec"><h3>Le tue statistiche</h3><div class="fz-stats">${[[st.boards, 'feste sul tabellone'], [st.kings, 'volte Re della festa'], [st.tourneys, 'tornei'], [st.champs, 'tornei vinti'], [st.minis, 'minigiochi giocati'], [st.miniWins, 'minigiochi vinti'], [st.stars, 'stelle raccolte'], [st.coinsEarned, 'monete guadagnate']].map(([v, l]) => `<div><b>${fmt(v)}</b><span>${l}</span></div>`).join('')}</div></section>
    <section class="fz-sec"><h3>Comandi</h3><div class="fz-keys">
      <span><kbd>W A S D</kbd> + <kbd>Spazio</kbd> giocatore della tastiera sinistra</span><span><kbd>Frecce</kbd> + <kbd>Invio</kbd> giocatore della tastiera destra</span>
      <span><kbd>I J K L</kbd> + <kbd>U</kbd> / <kbd>O</kbd> terzo giocatore</span><span><kbd>Tastierino 8 4 5 6</kbd> + <kbd>0</kbd> quarto giocatore</span>
      <span><kbd>Controller</kbd> stick / croce + <kbd>A</kbd>, fino a 4</span><span><kbd>Touch</kbd> lo schermo si divide in zone: levetta a sinistra, tasto a destra (anche «tablet sul tavolo»)</span><span><kbd>Esc</kbd> / <kbd>P</kbd> / <kbd>Start</kbd> pausa</span></div></section>
  </div>`;
}

function seatCard(d, k, n, train) {
  const s = d.seats[k], ch = charById(s.char), dev = devById(s.dev || 'cpu'), on = k < n;
  return `<div class="fz-seat ${on ? '' : 'off'}" style="--c:${SLOT_COLORS[k]}">
    <div class="fz-seat-h"><b>G${k + 1}</b><span>${on ? (dev.id === 'cpu' ? 'CPU' : 'Giocatore') : 'Libero'}</span></div>
    ${bean(ch, s.hat, 56)}
    <div class="fz-cyc"><button class="btn sm" data-a="fz-cyc" data-k="${k}" data-f="char" data-d="-1" aria-label="Personaggio precedente">‹</button><span>${esc(ch.name)}</span><button class="btn sm" data-a="fz-cyc" data-k="${k}" data-f="char" data-d="1" aria-label="Personaggio successivo">›</button></div>
    <div class="fz-cyc"><button class="btn sm" data-a="fz-cyc" data-k="${k}" data-f="hat" data-d="-1" aria-label="Cappello precedente">‹</button><span>${esc(hatById(s.hat).name)}</span><button class="btn sm" data-a="fz-cyc" data-k="${k}" data-f="hat" data-d="1" aria-label="Cappello successivo">›</button></div>
    <div class="fz-cyc dev"><button class="btn sm" data-a="fz-cyc" data-k="${k}" data-f="dev" data-d="-1" aria-label="Dispositivo precedente">‹</button><span>${icon(dev.id === 'cpu' ? 'sim' : dev.id === 'touch' ? 'eye' : dev.id.startsWith('pad') ? 'gamepad' : 'keyboard')} ${esc(dev.name)}</span><button class="btn sm" data-a="fz-cyc" data-k="${k}" data-f="dev" data-d="1" aria-label="Dispositivo successivo">›</button></div>
    ${on && dev.keys ? `<small>${esc(dev.keys)} · azione ${esc(dev.act)}</small>` : '<small>&nbsp;</small>'}
  </div>`;
}
function setup(d) {
  const m = V.mode, M = MODES[m], o = d.opts, n = o.n, sel = new Set(o.minis || MINIGAMES.map((x) => x.id));
  const anyTouch = d.seats.slice(0, n).some((s) => s.dev === 'touch');
  const seg = (a, val, list) => `<div class="fz-seg">${list.map(([v, l]) => `<button class="${val === v ? 'on' : ''}" data-a="${a}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="full-screen fz-menu">
    ${pageHead({ backAction: 'fz-home', eyebrow: 'Festa Baso', title: M.name, sub: M.desc, right: `<div class="fz-wallet"><div class="w-k">Monete festa</div><b>${icon('coin')} ${fmt(d.coins)}</b></div>` })}
    <section class="fz-sec"><h3>Giocatori</h3>${seg('fz-n', n, (m === 'train' ? [1, 2, 3, 4] : [2, 3, 4]).map((v) => [v, `${v}`]))}
      <p class="fz-note">Ogni posto può essere una persona (tastiera, controller o touch) o la CPU: i posti vuoti di una festa vengono presi dalla CPU.</p>
      <div class="fz-seats">${[0, 1, 2, 3].map((k) => seatCard(d, k, Math.max(n, m === 'train' ? 1 : 2), m === 'train')).join('')}</div></section>
    <section class="fz-sec fz-opts">
      ${m === 'board' ? `<div><h3>Turni</h3>${seg('fz-rounds', o.rounds, [[5, '5 · breve'], [8, '8'], [12, '12 · lunga']])}</div>` : ''}
      ${m === 'torneo' ? `<div><h3>Vittorie per il titolo</h3>${seg('fz-target', o.target, [[3, '3'], [5, '5'], [7, '7']])}</div>` : ''}
      <div><h3>CPU</h3>${seg('fz-diff', o.diff, [[0, 'Facile'], [1, 'Normale'], [2, 'Difficile']])}</div>
      <div><h3>Touch</h3>${seg('fz-flat', o.flat ? 1 : 0, [[0, 'In mano'], [1, 'Tablet sul tavolo']])}${anyTouch ? '' : '<small class="fz-note">Serve almeno un posto «Touch».</small>'}</div>
    </section>
    ${m === 'train' ? `<section class="fz-sec"><h3>Scegli il minigioco</h3><div class="fz-minis pick">${MINIGAMES.map((x) => `<button class="fz-mcard" data-a="fz-train" data-id="${x.id}" style="--c:${x.color}"><b>${esc(x.name)}</b><small>${esc(x.from)}</small><span>${esc(x.desc)}</span></button>`).join('')}</div></section>`
      : `<section class="fz-sec"><h3>Minigiochi in gioco <small>(${sel.size}/${MINIGAMES.length})</small></h3><div class="fz-chips">${MINIGAMES.map((x) => `<button class="fz-chip ${sel.has(x.id) ? 'on' : ''}" data-a="fz-mini" data-id="${x.id}" style="--c:${x.color}">${esc(x.name)}</button>`).join('')}<button class="fz-chip all" data-a="fz-mini-all">Tutti</button></div></section>
      <div class="fz-go"><button class="btn primary big" data-a="fz-start">${icon('play')} Si comincia!</button></div>`}
  </div>`;
}
function chars(d) {
  const s = d.seats[V.seat];
  return `<div class="full-screen fz-menu">
    ${pageHead({ backAction: 'fz-home', eyebrow: 'Festa Baso', title: 'Personaggi e cappelli', sub: 'Le monete della festa si guadagnano solo giocando: ogni minigioco, ogni festa e ogni torneo ne regalano qualcuna.', right: `<div class="fz-wallet"><div class="w-k">Monete festa</div><b>${icon('coin')} ${fmt(d.coins)}</b></div>` })}
    <section class="fz-sec"><h3>Per il posto</h3><div class="fz-seg">${[0, 1, 2, 3].map((k) => `<button class="${V.seat === k ? 'on' : ''}" data-a="fz-seat" data-v="${k}" style="--c:${SLOT_COLORS[k]}">G${k + 1}</button>`).join('')}</div></section>
    <section class="fz-sec"><h3>Personaggi</h3><div class="fz-shop">${CHARS.map((c) => { const own = d.owned.chars.includes(c.id); return `<button class="fz-item ${s.char === c.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="fz-buy" data-k="chars" data-id="${c.id}">${bean(c, s.hat, 54)}<b>${esc(c.name)}</b><span>${own ? (s.char === c.id ? 'In uso' : esc(c.tag)) : `${icon('coin')} ${c.cost}`}</span></button>`; }).join('')}</div></section>
    <section class="fz-sec"><h3>Cappelli</h3><div class="fz-shop">${HATS.map((h) => { const own = d.owned.hats.includes(h.id); return `<button class="fz-item ${s.hat === h.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="fz-buy" data-k="hats" data-id="${h.id}">${bean(charById(s.char), h.id, 54)}<b>${esc(h.name)}</b><span>${own ? (s.hat === h.id ? 'In uso' : 'Tuo') : `${icon('coin')} ${h.cost}`}</span></button>`; }).join('')}</div></section>
  </div>`;
}

function buildCfg(d, mini) {
  const o = d.opts, n = Math.max(V.mode === 'train' ? 1 : 2, o.n);
  const N = Math.max(2, n); // a training match always has at least one CPU rival
  const seats = d.seats.slice(0, N).map((s, k) => ({ ...s, dev: k < n ? s.dev || 'cpu' : 'cpu' }));
  return { mode: V.mode, n: N, seats, rounds: o.rounds, target: o.target, diff: o.diff, flat: o.flat, tier: gfxTier(), minis: o.minis?.length ? o.minis : MINIGAMES.map((x) => x.id), mini };
}
function stop() { V.session?.dispose(); V.session = null; }
function ensureDevices(d) {
  if (d.seats.some((s) => s.dev)) return;
  const def = defaultDevices(2); d.seats.forEach((s, k) => { s.dev = def[k]; }); feSave(d);
}

registerScreen({
  id: 'festa', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.page) { const p = params.page; delete params.page; if (p === 'chars') V.page = 'chars'; else if (MODES[p]) { V.mode = p; V.page = 'setup'; } else V.page = 'home'; V.playing = false; }
    const d = feLoad(); ensureDevices(d);
    if (V.playing) return '<div class="fz-root" id="fz-root"><div class="fz-loading">Si prepara la festa…</div></div>';
    if (V.page === 'setup') return setup(d);
    if (V.page === 'chars') return chars(d);
    return home(d);
  },
  async mount() {
    if (!V.playing) { requestAnimationFrame(() => document.querySelector('.fz-go .btn, .fz-mode')?.focus({ preventScroll: true })); return; }
    const root = document.getElementById('fz-root');
    try { music.setMood?.('voragine'); } catch {}
    const { FestaSession } = await import('../festa/session.js');
    if (!V.playing || !root?.isConnected) return;
    const s = V.session = new FestaSession(root, V.cfg, {
      onExit: (to) => {
        stop();
        if (to === 'again') { App.refresh(); return; }
        V.playing = false;
        if (to === 'hub') App.go('launcher'); else App.refresh();
      },
    });
    try { await s.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="fz-loading">Impossibile avviare la festa: ${esc(e.message || String(e))}<br><button class="btn" data-a="fz-home">Indietro</button></div>`; }
  },
  unmount() { stop(); V.playing = false; },
  actions: {
    'fz-home'() { stop(); V.playing = false; V.page = 'home'; App.refresh(); },
    'fz-mode'(el) { const id = el.dataset.id; if (id === 'chars') V.page = 'chars'; else { V.mode = id; V.page = 'setup'; const d = feLoad(); if (id === 'train' && d.opts.n > 1 && !d.seats.slice(1).some((s) => s.dev && s.dev !== 'cpu')) { d.opts.n = 1; feSave(d); } if (id !== 'train' && d.opts.n < 2) { d.opts.n = 2; feSave(d); } } App.refresh(); },
    'fz-n'(el) { const d = feLoad(); d.opts.n = +el.dataset.v; const def = defaultDevices(d.opts.n); d.seats.forEach((s, k) => { if (k < d.opts.n && (!s.dev || s.dev === 'cpu') && k > 0 && isTouchDevice()) s.dev = def[k]; }); feSave(d); App.refresh(); },
    'fz-rounds'(el) { const d = feLoad(); d.opts.rounds = +el.dataset.v; feSave(d); App.refresh(); },
    'fz-target'(el) { const d = feLoad(); d.opts.target = +el.dataset.v; feSave(d); App.refresh(); },
    'fz-diff'(el) { const d = feLoad(); d.opts.diff = +el.dataset.v; feSave(d); App.refresh(); },
    'fz-flat'(el) { const d = feLoad(); d.opts.flat = el.dataset.v === '1'; feSave(d); App.refresh(); },
    'fz-seat'(el) { V.seat = +el.dataset.v; App.refresh(); },
    'fz-cyc'(el) {
      const d = feLoad(), s = d.seats[+el.dataset.k], dir = +el.dataset.d, f = el.dataset.f;
      const list = f === 'char' ? CHARS.filter((c) => d.owned.chars.includes(c.id)).map((c) => c.id) : f === 'hat' ? HATS.filter((h) => d.owned.hats.includes(h.id)).map((h) => h.id) : DEVICES.map((x) => x.id);
      const cur = f === 'dev' ? s.dev || 'cpu' : s[f];
      const i = list.indexOf(cur); s[f] = list[(i + dir + list.length) % list.length];
      feSave(d); App.refresh();
      requestAnimationFrame(() => document.querySelector(`[data-a="fz-cyc"][data-k="${el.dataset.k}"][data-f="${f}"][data-d="${dir}"]`)?.focus({ preventScroll: true }));
    },
    'fz-mini'(el) { const d = feLoad(); const s = new Set(d.opts.minis || MINIGAMES.map((x) => x.id)); if (s.has(el.dataset.id)) { if (s.size > 2) s.delete(el.dataset.id); } else s.add(el.dataset.id); d.opts.minis = MINIGAMES.map((x) => x.id).filter((x) => s.has(x)); feSave(d); App.refresh(); },
    'fz-mini-all'() { const d = feLoad(); d.opts.minis = null; feSave(d); App.refresh(); },
    'fz-start'() {
      const go = () => { const d = feLoad(); V.cfg = buildCfg(d); V.playing = true; App.refresh(); };
      if (V.mode === 'board' && feLoadBoard()) App.confirm('Nuova festa?', 'C’è una festa sul tabellone in sospeso: iniziandone una nuova verrà sostituita.', go, 'Nuova festa');
      else go();
    },
    'fz-resume'() { const S = feLoadBoard(); if (!S) { App.refresh(); return; } V.mode = 'board'; V.cfg = { ...S.cfg, mode: 'board', target: 3, tier: gfxTier(), resume: S }; V.playing = true; App.refresh(); },
    'fz-discard'() { App.confirm('Abbandonare la festa?', 'La partita sul tabellone in sospeso verrà cancellata.', () => { feClearBoard(); App.refresh(); }, 'Abbandona', true); },
    'fz-train'(el) { if (!MINI[el.dataset.id]) return; const d = feLoad(); V.cfg = buildCfg(d, el.dataset.id); V.playing = true; App.refresh(); },
    'fz-buy'(el) {
      const k = el.dataset.k, id = el.dataset.id, d = feLoad(), it = (k === 'chars' ? CHARS : HATS).find((x) => x.id === id); if (!it) return;
      const field = k === 'chars' ? 'char' : 'hat';
      if (d.owned[k].includes(id)) { d.seats[V.seat][field] = id; feSave(d); sfx.select?.(); App.refresh(); return; }
      if (d.coins < it.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${it.cost - d.coins} monete per «${it.name}». Si guadagnano giocando alla festa.`, 'bad'); return; }
      App.confirm(`Sbloccare «${it.name}»?`, `Costa ${it.cost} monete festa (ne hai ${d.coins}).`, () => { const q = feLoad(); if (q.coins < it.cost) return; q.coins -= it.cost; q.owned[k].push(id); q.seats[V.seat][field] = id; feSave(q); try { sfx.coin?.(); } catch {} App.refresh(); });
    },
  },
});
