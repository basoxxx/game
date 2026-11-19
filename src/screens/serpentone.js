// Serpentone — setup screen (daily arena, mode, arena, difficulty, controls, look & shop), the live game,
// pause and results.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { spLoad, spSave } from '../serpentone/store.js';
import { MODES, ARENAS, DIFFS, SKINS, PATTERNS, HATS, POWERS, dailySpec, skinColors, patternColor } from '../serpentone/meta.js';
import '../serpentone/serpentone.css';

const V = { playing: false, game: null, from: 'launcher', daily: null, tab: 'skin', quickDone: false };
const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
const touchUI = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

// ---- the snake preview (SVG): wavy body coloured with the real pattern code, eyes and hat
const hatSvg = {
  nessuno: '',
  berretto: '<path d="M-13 -9 a13 11 0 0 1 26 0 z" fill="var(--a)"/><rect x="6" y="-11" width="14" height="4" rx="2" fill="var(--a)"/><circle cx="0" cy="-21" r="3" fill="#fff"/>',
  festa: '<path d="M-9 -8 L0 -34 L9 -8 z" fill="#ffe14d" stroke="var(--a)" stroke-width="3" stroke-dasharray="4 4"/><circle cx="0" cy="-35" r="4" fill="#fff"/>',
  cilindro: '<rect x="-15" y="-11" width="30" height="4" rx="2" fill="#1b1b22"/><rect x="-9" y="-31" width="18" height="21" fill="#1b1b22"/><rect x="-9" y="-15" width="18" height="4" fill="var(--a)"/>',
  elica: '<path d="M-12 -8 a12 10 0 0 1 24 0 z" fill="#2f6bff"/><rect x="-1" y="-24" width="2" height="8" fill="#ccc"/><ellipse cx="-8" cy="-25" rx="8" ry="2.5" fill="#ff3b5c"/><ellipse cx="8" cy="-25" rx="8" ry="2.5" fill="#ffd23f"/>',
  fiocco: '<path d="M0 -14 L-13 -22 L-13 -6 z M0 -14 L13 -22 L13 -6 z" fill="#ff5fa2"/><circle cx="0" cy="-14" r="4" fill="#ff5fa2"/>',
  corona: '<path d="M-12 -8 L-12 -24 L-6 -16 L0 -27 L6 -16 L12 -24 L12 -8 z" fill="#ffcc1a" stroke="#c48a00" stroke-width="1.5"/><circle cx="0" cy="-13" r="2.5" fill="#ff2b5c"/>',
  vichingo: '<path d="M-14 -6 a14 13 0 0 1 28 0 z" fill="#9aa3ad"/><path d="M-13 -12 q-10 -4 -9 -16 q3 8 11 10z M13 -12 q10 -4 9 -16 q-3 8 -11 10z" fill="#fff5dc"/>',
  aureola: '<ellipse cx="0" cy="-27" rx="12" ry="4" fill="none" stroke="#fff27a" stroke-width="3"/>',
};
function snakeSvg(skin, pattern, hat, w = 300, h = 110) {
  const sk = skinColors(skin), c = [0, 0, 0], n = 26, segs = [];
  const hex = (v) => '#' + v.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');
  for (let i = n; i >= 0; i--) {
    const x = 34 + (n - i) * ((w - 90) / n), y = h / 2 + Math.sin(i * 0.42) * 16, r = 13 * (i > n * 0.7 ? 1 - ((i - n * 0.7) / (n * 0.3)) * 0.5 : 1);
    patternColor(sk, pattern, i * 3, n * 3, c);
    segs.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${hex(c)}"/>`);
  }
  const hx = w - 46, hy = h / 2 + Math.sin(0) * 16;
  return `<svg class="sp-prev" viewBox="0 0 ${w} ${h}" style="--a:${sk.c[1]}" aria-hidden="true"><ellipse cx="${w / 2}" cy="${h - 10}" rx="${w / 2 - 20}" ry="6" fill="rgba(0,0,0,.25)"/>${segs.join('')}
    <g transform="translate(${hx} ${hy})"><ellipse rx="19" ry="16" fill="${sk.c[0]}"/><circle cx="7" cy="-7" r="7" fill="#fff"/><circle cx="7" cy="7" r="7" fill="#fff"/><circle cx="10" cy="-7" r="3.6" fill="#111"/><circle cx="10" cy="7" r="3.6" fill="#111"/><path d="M18 0 l9 0 l3 -3 M27 0 l3 3" stroke="#ff2f5a" stroke-width="2" fill="none"/>
    <g transform="translate(-1 -6) scale(.9)">${hatSvg[hat] || ''}</g></g></svg>`;
}

function dailyCard(p) {
  const d = dailySpec(), st = p.daily?.key === d.key ? p.daily : null, A = ARENAS[d.arena];
  const dt = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<section class="sp-daily" style="--sky:${A.sky};--g:${A.a};--c:${A.c}">
    <div class="sp-daily-t"><div class="sp-k">${icon('calendar')} Arena del giorno · ${esc(dt)}</div><b>${esc(MODES[d.mode].name)} · ${esc(A.name)}</b>
    <span>Variante: <em>${esc(d.twist.name)}</em> (${esc(d.twist.desc)}). Stessa arena e stesse rivali per tutti, oggi. ${st?.done ? `Il tuo record di oggi: <em>${fmt(st.best)}</em>` : `Prima partita: <em>+${d.reward} monete</em>`}</span></div>
    <button class="btn primary" data-a="sp-daily">${icon('play')} ${st?.done ? 'Riprova' : 'Gioca'}</button></section>`;
}
const SHOP = { skin: { list: SKINS, label: 'Colori' }, pattern: { list: PATTERNS, label: 'Motivi' }, hat: { list: HATS, label: 'Cappelli' } };
function shop(p) {
  const T = SHOP[V.tab] ? V.tab : 'skin', S = SHOP[T];
  return `<div class="sp-shop"><div class="sp-tabs" role="tablist">${Object.entries(SHOP).map(([k, s]) => `<button role="tab" class="${k === T ? 'on' : ''}" data-a="sp-tab" data-id="${k}">${s.label}</button>`).join('')}</div>
    <div class="sp-items">${S.list.map((it) => {
      const own = p.owned[T].includes(it.id), on = p[T] === it.id;
      const sw = T === 'skin' ? `<i class="sw" style="background:${it.rainbow ? `linear-gradient(90deg,${it.c.join(',')},${it.c[0]})` : `linear-gradient(90deg,${it.c[0]} 50%,${it.c[1]} 50%)`}"></i>`
        : T === 'pattern' ? `<i class="sw">${snakeSvg(p.skin, it.id, 'nessuno', 120, 44)}</i>` : `<i class="sw hat"><svg viewBox="-20 -38 40 42">${(hatSvg[it.id] || '<circle r="4" fill="var(--line3)"/>').replace(/var\(--a\)/g, skinColors(p.skin).c[1])}</svg></i>`;
      return `<div class="sp-item ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-a="sp-buy" data-k="${T}" data-id="${it.id}" tabindex="0" title="${esc(it.name)}">${sw}<b>${esc(it.name)}</b><span>${own ? (on ? 'In uso' : 'Tuo') : `${icon('coin')} ${it.cost}`}</span></div>`;
    }).join('')}</div></div>`;
}

function setup(p) {
  const key = `${p.mode}:${p.arena}`;
  const best = p.best[key];
  const duo = p.mode === 'duo';
  return `<div class="full-screen sp-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Arcade', title: 'Serpentone', sub: 'Mangia le palline luminose, allungati, taglia la strada alle rivali: chi sbatte la testa contro un corpo diventa un buffet.', right: `<div class="sp-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">${p.games} partite · ${p.wins} vittorie · record ${fmt(p.bestLen)}</div></div>` })}
    <div class="sp-setup">
      ${dailyCard(p)}
      <section><h3>Modalità</h3><div class="sp-opts">${Object.entries(MODES).map(([id, m]) => `<div class="sp-opt ${p.mode === id ? 'on' : ''}" data-a="sp-mode" data-id="${id}" tabindex="0">${icon(m.icon)}<b>${esc(m.name)}</b><span>${esc(m.sub)}</span>${p.best[`${id}:${p.arena}`] ? `<em>Record ${fmt(p.best[`${id}:${p.arena}`])}</em>` : ''}</div>`).join('')}</div></section>
      <section><h3>Arena</h3><div class="sp-opts sp-arenas">${Object.entries(ARENAS).map(([id, a]) => `<div class="sp-opt sp-arena ${p.arena === id ? 'on' : ''}" data-a="sp-arena" data-id="${id}" tabindex="0" style="--sky:${a.sky};--g:${a.a};--g2:${a.b};--c:${a.c};--rim:${a.rim}"><i class="sp-pic sp-pic-${a.ground}"></i><b>${esc(a.name)}</b><span>${esc(a.sub)}</span></div>`).join('')}</div></section>
      <section class="sp-row2">
        <div>
          <h3>Rivali</h3><div class="sp-seg">${Object.entries(DIFFS).map(([id, d]) => `<button class="${p.diff === id ? 'on' : ''}" data-a="sp-diff" data-id="${id}">${d.name}</button>`).join('')}</div>
          <h3 class="mt16">Comandi touch</h3><div class="sp-seg"><button class="${p.touch !== 'steer' ? 'on' : ''}" data-a="sp-touch" data-id="joy">Joystick</button><button class="${p.touch === 'steer' ? 'on' : ''}" data-a="sp-touch" data-id="steer">Sterzo ‹ ›</button></div>
          <h3 class="mt16">Comandi</h3><div class="sp-keys">
            <span><span class="kbd">Mouse</span> la testa insegue il puntatore · <span class="kbd">clic</span> scatto</span>
            <span><span class="kbd">W A S D</span> / <span class="kbd">Frecce</span> direzione · <span class="kbd">Spazio</span> / <span class="kbd">Maiusc</span> scatto</span>
            <span><span class="kbd">Stick</span> direzione · <span class="kbd">A</span> / <span class="kbd">RT</span> scatto</span>
            <span><span class="kbd">Touch</span> joystick ovunque + tasto Scatto, oppure sterzo ‹ ›</span>
            ${duo ? '<span><b>2 giocatori:</b> G1 <span class="kbd">WASD</span> + <span class="kbd">Spazio</span>, G2 <span class="kbd">Frecce</span> + <span class="kbd">Invio</span>; due controller; su tablet ognuno usa la sua metà (stick spinto a fondo = scatto)</span>' : ''}
            <span><span class="kbd">Esc</span> / <span class="kbd">P</span> pausa</span></div>
          <h3 class="mt16">Potenziamenti</h3><div class="sp-keys">${Object.values(POWERS).map((w) => `<span><b class="pw" style="--c:${w.color}"></b> ${esc(w.name)}: ${esc(w.desc)}</span>`).join('')}</div>
        </div>
        <div class="sp-look">
          <h3>Il tuo serpente</h3>
          <div class="sp-stage">${snakeSvg(p.skin, p.pattern, p.hat)}</div>
          ${shop(p)}
          ${duo ? `<h3 class="mt16">Colore del giocatore 2</h3><div class="sp-p2">${SKINS.filter((s) => p.owned.skin.includes(s.id)).map((s) => `<button class="${p.skin2 === s.id ? 'on' : ''}" data-a="sp-p2" data-id="${s.id}" title="${esc(s.name)}" style="background:linear-gradient(90deg,${s.c[0]} 50%,${s.c[1]} 50%)"></button>`).join('')}</div>` : ''}
        </div>
      </section>
      <div class="sp-go"><div class="sp-rec">${best ? `${icon('star')} Record ${esc(MODES[p.mode].name)} · ${esc(ARENAS[p.arena].name)}: <b>${fmt(best)}</b>` : 'Nessun record qui: stabiliscine uno!'}</div><button class="btn primary big" data-a="sp-play">${icon('play')} Gioca</button></div>
    </div>
  </div>`;
}

function results(r, p) {
  const surv = r.mode === 'sopravvivenza', duo = r.mode === 'duo';
  const title = duo ? (r.players[0].pos < r.players[1].pos ? 'Vince il Giocatore 1!' : 'Vince il Giocatore 2!')
    : surv ? (r.stars >= 2 ? 'Che resistenza!' : 'Fine della corsa')
    : r.pos === 1 ? (r.mode === 'battaglia' ? 'Ultimo serpente in piedi!' : 'Primo in classifica!') : r.why === 'dead' ? 'Schiantato!' : `${r.pos}° posto`;
  const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `<div class="sp-res" role="dialog" aria-label="Risultati"><div class="sp-res-card">
    <div class="sp-k">${r.daily ? 'Arena del giorno · ' : ''}${esc(MODES[r.mode].name)} · ${esc(ARENAS[r.arena].name)}</div>
    <h2>${title}</h2>
    ${duo ? '' : `<div class="sp-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? 'on' : ''}">★</i>`).join('')}</div>`}
    ${duo ? `<div class="sp-res-duo">${r.players.map((q, i) => `<div><small>Giocatore ${i + 1}</small><b>${q.pos}°</b><span>lunghezza max ${fmt(q.best)} · ${q.kills} K.O. · ${q.deaths} schianti</span></div>`).join('')}</div>` : ''}
    <div class="sp-res-stats">
      <div><b>${surv ? mm(r.time) : `${r.pos}/${r.of}`}</b><span>${surv ? 'sopravvissuto' : 'posizione'}</span></div>
      <div><b>${fmt(r.best)}</b><span>lunghezza max</span></div>
      <div><b>${r.kills}</b><span>K.O.</span></div>
      <div><b>${fmt(r.eaten)}</b><span>bocconi</span></div>
      <div><b>+${r.coins + (r.dailyBonus || 0)}</b><span>monete</span></div>
    </div>
    ${r.record ? '<div class="sp-res-big">Nuovo record!</div>' : ''}
    ${r.missions?.length ? `<ul class="sp-res-miss">${r.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : '✗'}</i><span>${esc(m.text)}</span><em>${m.done ? `+${m.coins}` : ''}</em></li>`).join('')}</ul>` : ''}
    ${r.dailyBonus ? `<div class="sp-res-big">Bonus arena del giorno: <b>+${r.dailyBonus} monete</b></div>` : ''}
    <ol class="sp-res-rank">${r.ranking.slice(0, 8).map((h, i) => `<li class="${h.player >= 0 ? 'me' : ''}" style="--c:${h.color}"><span>${i + 1}</span><i></i><b>${esc(h.name)}</b><em>${h.alive ? fmt(h.len) : r.mode === 'battaglia' ? 'fuori' : '—'}</em></li>`).join('')}</ol>
    <div class="sp-res-btns"><button class="btn primary" data-a="sp-again">${icon('replay')} Rivincita</button><button class="btn" data-a="sp-back">${icon('left')} Menu Serpentone</button><button class="btn ghost" data-a="sp-hall">${icon('gamepad')} Baso Hub</button></div>
    <div class="sp-wallet-s">${icon('coin')} ${fmt(p.coins)} monete: spendile in colori, motivi e cappelli.</div>
  </div></div>`;
}

function stopGame() { V.game?.destroy(); V.game = null; window.__serpentone = null; }

registerScreen({
  id: 'serpentone', full: true,
  render(params) {
    if (params?.from) V.from = params.from; else if (params?.to === 'serpentone') V.from = 'launcher';
    if (params?.mode && MODES[params.mode]) { const p = spLoad(); p.mode = params.mode; spSave(p); delete params.mode; }
    if (params?.tab) { V.tab = params.tab; delete params.tab; V.scrollLook = true; }
    if (params?.daily && !V.playing) { delete params.daily; V.daily = dailySpec(); V.playing = true; }
    if (params?.quick && !V.playing && !V.quickDone) { V.quickDone = true; V.playing = true; V.daily = null; }
    if (V.playing) return `<div class="sp-stage-full"><div class="sp-root" id="sp-root"><div class="sp-loading">I serpenti escono dalla tana…</div></div><div class="sp-over" id="sp-over"></div></div>`;
    return setup(spLoad());
  },
  async mount() {
    if (!V.playing) {
      requestAnimationFrame(() => {
        if (V.scrollLook) { V.scrollLook = false; document.querySelector('.sp-look')?.scrollIntoView({ block: 'center' }); }
        document.querySelector('.sp-go .btn')?.focus({ preventScroll: true });
      });
      return;
    }
    const root = document.getElementById('sp-root');
    const p = spLoad();
    try { music.setMood?.('voragine'); } catch {}
    const { SerpentoneGame } = await import('../serpentone/game.js');
    if (!V.playing || !root.isConnected) return;
    const s = getSettings(), D = V.daily;
    const mode = D ? D.mode : p.mode;
    const g = V.game = new SerpentoneGame(root, {
      mode, arena: D ? D.arena : p.arena, diff: D ? D.diff : p.diff, daily: D, tier: gfxTier(), touch: p.touch, touchUI: touchUI(),
      volume: s.sound === false ? 0 : 0.6,
      looks: [{ skin: p.skin, pattern: p.pattern, hat: p.hat }, { skin: p.skin2 === p.skin ? SKINS.find((k) => k.id !== p.skin && p.owned.skin.includes(k.id))?.id || 'fragola' : p.skin2, pattern: p.pattern, hat: 'nessuno' }],
      onPause: (on) => {
        const ov = document.getElementById('sp-over'); if (!ov) return;
        ov.innerHTML = on ? `<div class="sp-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2>${g.sim?.missions?.length ? `<ul class="sp-res-miss">${g.sim.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : ''}</i><span>${esc(m.text)}</span><em>+${m.coins}</em></li>`).join('')}</ul>` : ''}<button class="btn primary" data-a="sp-resume">${icon('play')} Riprendi</button><button class="btn" data-a="sp-restart">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="sp-quit">${icon('left')} Esci</button></div>` : '';
        if (on) requestAnimationFrame(() => ov.querySelector('.btn')?.focus());
      },
      onEnd: (r) => {
        const st = spLoad();
        const key = r.daily ? `daily:${r.daily}` : `${r.mode}:${r.arena}`;
        const score = r.mode === 'sopravvivenza' ? r.time : r.best;
        r.record = score > (st.best[key] || 0);
        if (r.record) st.best[key] = score;
        if (r.daily) {
          const first = st.daily?.key !== r.daily || !st.daily.done;
          if (first) r.dailyBonus = D?.reward || 0;
          st.daily = { key: r.daily, done: true, best: Math.max(st.daily?.key === r.daily ? st.daily.best || 0 : 0, score) };
        }
        st.games++; if (r.mode !== 'sopravvivenza' && r.mode !== 'duo' && r.pos === 1) st.wins++;
        st.coins += r.coins + (r.dailyBonus || 0); st.kills += r.kills; st.eaten += r.eaten;
        st.bestLen = Math.max(st.bestLen || 0, r.best); if (r.mode === 'sopravvivenza') st.bestSurvive = Math.max(st.bestSurvive || 0, r.time);
        spSave(st);
        setTimeout(() => {
          const ov = document.getElementById('sp-over'); if (!ov || !V.playing) return;
          ov.innerHTML = results(r, st);
          try { r.pos === 1 || r.stars >= 2 ? sfx.win() : sfx.ok(); } catch {}
          requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus({ preventScroll: true }));
        }, 1100);
      },
    });
    window.__serpentone = g;
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="sp-loading">Impossibile avviare il gioco: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="sp-back">Indietro</button></div>`; }
  },
  unmount() { stopGame(); V.playing = false; V.quickDone = false; },
  actions: {
    'sp-mode'(el) { const p = spLoad(); p.mode = el.dataset.id; spSave(p); App.refresh(); },
    'sp-arena'(el) { const p = spLoad(); p.arena = el.dataset.id; spSave(p); App.refresh(); },
    'sp-diff'(el) { const p = spLoad(); p.diff = el.dataset.id; spSave(p); App.refresh(); },
    'sp-touch'(el) { const p = spLoad(); p.touch = el.dataset.id; spSave(p); App.refresh(); },
    'sp-p2'(el) { const p = spLoad(); p.skin2 = el.dataset.id; spSave(p); App.refresh(); },
    'sp-tab'(el) { V.tab = el.dataset.id; App.refresh(); },
    'sp-buy'(el) {
      const k = el.dataset.k, p = spLoad(), it = SHOP[k]?.list.find((x) => x.id === el.dataset.id); if (!it) return;
      if (p.owned[k].includes(it.id)) { p[k] = it.id; spSave(p); sfx.select?.(); App.refresh(); return; }
      if (p.coins < it.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${it.cost - p.coins} monete per «${it.name}». Le guadagni giocando: lunghezza, K.O., missioni.`, 'bad'); return; }
      App.confirm(`Sbloccare «${it.name}»?`, `Costa ${it.cost} monete (ne hai ${p.coins}).`, () => { const q = spLoad(); if (q.coins < it.cost) return; q.coins -= it.cost; q.owned[k].push(it.id); q[k] = it.id; spSave(q); try { sfx.coin?.(); } catch {} App.refresh(); });
    },
    'sp-play'() { V.daily = null; V.playing = true; App.refresh(); },
    'sp-daily'() { V.daily = dailySpec(); V.playing = true; App.refresh(); },
    'sp-resume'() { V.game?.togglePause(false); },
    'sp-restart'() { stopGame(); App.refresh(); },
    'sp-again'() { stopGame(); App.refresh(); },
    'sp-quit'() { stopGame(); V.playing = false; App.refresh(); },
    'sp-back'() { stopGame(); V.playing = false; App.refresh(); },
    'sp-hall'() { stopGame(); V.playing = false; App.go('launcher'); },
  },
});
