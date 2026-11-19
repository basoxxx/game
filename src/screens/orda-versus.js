// Orda · 2 giocatori — setup (sfida / cooperativa, arena, champion and handicap per player, rules),
// the live match, pause and the results screen with both players' stats.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { VS_ARENAS, VS_CHAMPIONS, VS_CHAMP_IDS } from '../orda/versus-data.js';
import { vsPrefs, vsSavePrefs, vsReward } from '../orda/versus-store.js';
import '../orda/versus.css';

const V = { playing: false, game: null, from: 'launcher', result: null };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const COLORS = { versus: ['#2f7bff', '#ff3d3d'], coop: ['#2f7bff', '#ffb21a'] };
const HC = ['Nessuno', '+1', '+2', '+3'];
const isTouch = () => { try { return matchMedia('(pointer: coarse)').matches || /[?&]touch\b/.test(location.search); } catch { return false; } };

function seg(a, cur, opts, extra = '') { return `<div class="ovs-seg" ${extra}>${opts.map(([v, t]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-a="${a}" data-v="${v}">${t}</button>`).join('')}</div>`; }

function playerCard(p, P) {
  const coop = P.variant === 'coop', c = COLORS[coop ? 'coop' : 'versus'][p];
  const name = coop ? `Giocatore ${p + 1}` : p ? 'Rosso' : 'Blu';
  const keys = p === 0 ? '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>Spazio</kbd> spara · <kbd>E</kbd> campione · 1° controller' : '<kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> · <kbd>Invio</kbd> spara · <kbd>0</kbd> campione · 2° controller';
  return `<div class="ovs-pl" style="--pc:${c}">
    <h4><i></i>${name}</h4>
    <div class="keys">${keys}</div>
    <div class="ovs-champs">${VS_CHAMP_IDS.map((id) => { const C = VS_CHAMPIONS[id]; return `<button class="ovs-ch ${P.champs[p] === id ? 'on' : ''}" data-a="ovs-champ" data-p="${p}" data-id="${id}"><i>${C.icon}</i><b>${esc(C.name)}</b><span>${esc(C.desc)}</span></button>`; }).join('')}</div>
    <div class="ovs-row"><span>Aiuto (handicap)</span>${seg('ovs-hc', P.hc[p], HC.map((t, i) => [i, t]), `data-p="${p}" style="--pc:${c}"`).replaceAll('data-a="ovs-hc"', `data-a="ovs-hc" data-p="${p}"`)}</div>
  </div>`;
}

function setup() {
  const P = vsPrefs(), coop = P.variant === 'coop';
  return `<div class="full-screen ovs-menu">
    ${pageHead({ back: V.from, eyebrow: 'Orda · Sullo stesso schermo', title: '2 giocatori', sub: 'Due cannoni, un solo schermo: sfidatevi al meglio dei 3 round o unite le forze contro la fortezza rossa.', right: P.played ? `<div class="ovs-keys">${P.played} partite · Blu ${P.won[0]} – Rosso ${P.won[1]}</div>` : '' })}
    <div class="ovs-setup">
      <section><h3>Modalità</h3><div class="ovs-variants">
        <button class="ovs-opt ${!coop ? 'on' : ''}" data-a="ovs-var" data-v="versus"><b>Sfida</b><span>Blu contro Rosso. Le folle si scontrano al centro: abbatti la base avversaria. Al meglio dei 3 round.</span></button>
        <button class="ovs-opt ${coop ? 'on' : ''}" data-a="ovs-var" data-v="coop"><b>Cooperativa</b><span>Fianco a fianco contro una fortezza che spara a sua volta. Difendete la base e buttatela giù.</span></button>
      </div></section>
      <section><h3>Arena</h3><div class="ovs-arenas">${VS_ARENAS.map((a) => `<button class="ovs-opt ovs-arena ${P.arena === a.id ? 'on' : ''}" data-a="ovs-arena" data-v="${a.id}" style="--g:${a.arena.side};--p:${a.arena.ground}"><i class="sw"></i><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></button>`).join('')}</div></section>
      <section><h3>Giocatori e campioni</h3><div class="ovs-players">${playerCard(0, P)}${playerCard(1, P)}</div></section>
      <section><h3>Regole</h3><div class="ovs-rules">
        ${coop ? `<div class="ovs-row"><span>Fortezza</span>${seg('ovs-diff', P.diff, [['facile', 'Facile'], ['normale', 'Normale'], ['difficile', 'Difficile']])}</div>
        <div class="ovs-row"><span>Tempo</span>${seg('ovs-ctime', P.ctime, [[120, '2:00'], [150, '2:30'], [180, '3:00']])}</div>`
        : `<div class="ovs-row"><span>Round</span>${seg('ovs-rounds', P.rounds, [[1, '1'], [3, 'Meglio di 3'], [5, 'Meglio di 5']])}</div>
        <div class="ovs-row"><span>Tempo per round</span>${seg('ovs-time', P.time, [[60, '1:00'], [90, '1:30'], [120, '2:00']])}</div>
        <div class="ovs-row"><span>Rosso guidato da</span>${seg('ovs-cpu', P.cpu ? 1 : 0, [[0, 'Giocatore'], [1, 'Computer']])}</div>
        <div class="ovs-row"><span>Tablet in piano (Rosso capovolto)</span>${seg('ovs-flat', P.flat ? 1 : 0, [[1, 'Sì'], [0, 'No']])}</div>`}
      </div>
      <p class="ovs-keys">${coop ? 'Fine del tempo: la fortezza resiste e avete perso. ' : 'Fine del tempo: vince chi ha più vita alla base; in parità si va alla <b>morte improvvisa</b> (porte raddoppiate, il primo colpo alla base vince). '}Tastiera: i tasti seguono lo schermo, le due direzioni lungo il binario muovono il cannone, quella verso l’avversario spara e quella opposta lancia il campione (con Blu in basso: A/D, W, S). Touch: ogni giocatore usa la propria metà dello schermo, trascina per spostare il cannone e tieni premuto per sparare. Il pulsante tondo lancia il campione quando l’anello è pieno.</p></section>
      <div class="ovs-go"><span class="ovs-keys"><kbd>Esc</kbd> / <kbd>P</kbd> / Start pausa</span><button class="btn primary big" data-a="ovs-play">${icon('play')} Gioca</button></div>
    </div>
  </div>`;
}

function statRows(r, p) {
  const s = r.stats[p], o = r.stats[1 - p] || {};
  const row = (k, v, ov) => `<dt>${k}</dt><dd class="${!r.coop && v > ov ? 'best' : ''}">${fmt(v)}</dd>`;
  return `<dl>${row('Figure lanciate', s.sent, o.sent)}${row('Nemici abbattuti', s.kills, o.kills)}${row('Danni alla base', s.dmg, o.dmg)}${row('Figure dalle porte', s.gates, o.gates)}${row('Campioni', s.champs, o.champs)}<dt>Figure perse</dt><dd>${fmt(s.lost)}</dd></dl>`;
}
function results(r) {
  const coop = r.variant === 'coop'; r.coop = coop;
  const w = r.winner, title = coop ? (r.outcome === 'win' ? 'Fortezza espugnata!' : 'La fortezza resiste') : w < 0 ? 'Pareggio!' : `Vince ${esc(r.names[w])}!`;
  const wc = coop ? (r.outcome === 'win' ? '#4ff08f' : '#ff6a5a') : w < 0 ? '#fff' : r.colors[w];
  const rounds = coop ? '' : `<div class="ovs-res-rounds">${r.rounds.map((x) => `<i style="--c:${x.winner >= 0 ? r.colors[x.winner] : '#888'}">R${x.round} · ${x.winner >= 0 ? esc(r.names[x.winner]) : 'pari'} · ${({ base: 'base', time: 'tempo', sudden: 'morte improvvisa', draw: 'pari' })[x.why] || ''}</i>`).join('')}</div>`;
  const card = (p) => `<div class="ovs-res-pl" style="--c:${r.colors[p]}"><h4>${esc(r.names[p])}${!coop && w === p ? '<em>Vincitore</em>' : ''}</h4><div class="ovs-keys">Campione: ${esc(VS_CHAMPIONS[r.champions[p]]?.name || '')}${r.handicap[p] ? ` · Aiuto +${r.handicap[p]}` : ''}</div>${statRows(r, p)}</div>`;
  return `<div class="ovs-res" role="dialog" aria-label="Risultati"><div class="ovs-res-card" style="--wc:${wc}">
    <div class="ovs-res-h"><small>${coop ? 'Cooperativa' : 'Sfida'} · ${esc(VS_ARENAS.find((a) => a.id === r.arena)?.name || '')} · ${Math.floor(r.time / 60)}:${String(Math.round(r.time % 60)).padStart(2, '0')}</small><h2>${title}</h2></div>
    ${coop ? '' : `<div class="ovs-score"><span style="--c:${r.colors[0]}">${r.wins[0]}</span>–<span style="--c:${r.colors[1]}">${r.wins[1]}</span></div>`}
    ${rounds}
    <div class="ovs-res-grid">${card(0)}${card(1)}</div>
    ${r.coins ? `<div class="ovs-res-coins">+${r.coins} monete Orda per la squadra</div>` : ''}
    <div class="ovs-res-btns"><button class="btn primary" data-a="ovs-again">${icon('replay')} Rivincita</button><button class="btn" data-a="ovs-back">${icon('left')} Impostazioni</button><button class="btn ghost" data-a="ovs-exit">${icon('gamepad')} Esci</button></div>
  </div></div>`;
}

function stopGame() { V.game?.destroy(); V.game = null; window.__ordaVersus = null; }

registerScreen({
  id: 'orda-versus', full: true,
  render(params) {
    if (params?.from) V.from = params.from;
    if (params?.variant === 'coop' || params?.variant === 'versus') { const P = vsPrefs(); P.variant = params.variant; vsSavePrefs(P); delete params.variant; }
    if (params?.quick && !V.playing && !V.quickDone) { V.quickDone = true; V.playing = true; }
    if (V.playing) return `<div class="ovs-stage"><div class="ovs-root" id="ovs-root"><div class="ovs-loading">Si caricano i cannoni…</div></div><div class="ovs-over" id="ovs-over"></div></div>`;
    return setup();
  },
  async mount() {
    if (!V.playing) { requestAnimationFrame(() => document.querySelector('.ovs-go .btn')?.focus({ preventScroll: true })); return; }
    const root = document.getElementById('ovs-root');
    const P = vsPrefs(), s = getSettings();
    try { music.setMood?.('orda'); } catch {}
    const { OrdaVersus } = await import('../orda/versus.js');
    if (!V.playing || !root.isConnected) return;
    const q = new URLSearchParams(location.search);
    const coop = P.variant === 'coop';
    const g = V.game = new OrdaVersus(root, {
      variant: P.variant, level: VS_ARENAS.find((a) => a.id === P.arena) || VS_ARENAS[0], champions: P.champs, handicap: P.hc,
      bots: [false, !coop && !!P.cpu], names: !coop && P.cpu ? ['Blu', 'Rosso (CPU)'] : undefined,
      rounds: P.rounds, roundTime: coop ? P.ctime : P.time, diff: P.diff, flat: P.flat && isTouch(), tier: gfxTier(),
      seed: q.has('seed') ? +q.get('seed') : undefined,
      volume: s.sound === false ? 0 : 0.6 * (s.volume ?? 0.5) / 0.5,
      onPause: (on) => {
        const ov = document.getElementById('ovs-over'); if (!ov) return;
        ov.innerHTML = on ? `<div class="ovs-pausebox" role="dialog" aria-label="Pausa"><h2>Pausa</h2><button class="btn primary" data-a="ovs-resume">${icon('play')} Riprendi</button><button class="btn" data-a="ovs-restart">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="ovs-back">${icon('left')} Esci dalla partita</button></div>` : '';
        if (on) requestAnimationFrame(() => ov.querySelector('.btn')?.focus());
      },
      onEnd: (r) => {
        r.coins = vsReward(r);
        V.result = r;
        const ov = document.getElementById('ovs-over'); if (!ov || !V.playing) return;
        ov.innerHTML = results(r);
        requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus({ preventScroll: true }));
      },
    });
    window.__ordaVersus = g;
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="ovs-loading">Impossibile avviare la partita: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="ovs-back">Indietro</button></div>`; }
  },
  unmount() { stopGame(); V.playing = false; V.quickDone = false; },
  actions: {
    'ovs-var'(el) { const P = vsPrefs(); P.variant = el.dataset.v; vsSavePrefs(P); sfx.select?.(); App.refresh(); },
    'ovs-arena'(el) { const P = vsPrefs(); P.arena = el.dataset.v; vsSavePrefs(P); sfx.select?.(); App.refresh(); },
    'ovs-champ'(el) { const P = vsPrefs(); P.champs[+el.dataset.p] = el.dataset.id; vsSavePrefs(P); sfx.select?.(); App.refresh(); },
    'ovs-hc'(el) { const P = vsPrefs(); P.hc[+el.dataset.p] = +el.dataset.v; vsSavePrefs(P); App.refresh(); },
    'ovs-rounds'(el) { const P = vsPrefs(); P.rounds = +el.dataset.v; vsSavePrefs(P); App.refresh(); },
    'ovs-time'(el) { const P = vsPrefs(); P.time = +el.dataset.v; vsSavePrefs(P); App.refresh(); },
    'ovs-ctime'(el) { const P = vsPrefs(); P.ctime = +el.dataset.v; vsSavePrefs(P); App.refresh(); },
    'ovs-diff'(el) { const P = vsPrefs(); P.diff = el.dataset.v; vsSavePrefs(P); App.refresh(); },
    'ovs-cpu'(el) { const P = vsPrefs(); P.cpu = el.dataset.v === '1'; vsSavePrefs(P); App.refresh(); },
    'ovs-flat'(el) { const P = vsPrefs(); P.flat = el.dataset.v === '1'; vsSavePrefs(P); App.refresh(); },
    'ovs-play'() { V.playing = true; sfx.ok?.(); App.refresh(); },
    'ovs-resume'() { V.game?.togglePause(false); },
    'ovs-restart'() { stopGame(); App.refresh(); },
    'ovs-again'() { stopGame(); App.refresh(); },
    'ovs-back'() { stopGame(); V.playing = false; App.refresh(); },
    'ovs-exit'() { stopGame(); V.playing = false; App.go(V.from || 'launcher'); },
  },
});
