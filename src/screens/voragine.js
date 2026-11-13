// Voragine — setup screen (mode, city, difficulty, hole skin), the live game, pause and results.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { vgLoad, vgSave } from '../voragine/store.js';
import { CITIES } from '../voragine/city.js';
import '../voragine/voragine.css';

// MODES/DIFFS/SKINS live in game.js, which pulls in three.js: mirror the light data here
const MODES = {
  classica: { name: 'Classica', sub: '2 minuti contro 7 voragini rivali. Vince la più grande.', icon: 'trophy' },
  battaglia: { name: 'Battaglia', sub: 'Chi viene inghiottito è fuori. Resta l’ultima voragine.', icon: 'burst' },
  solitaria: { name: 'Solitaria', sub: 'Solo tu e la città: inghiottisci più che puoi in 2 minuti.', icon: 'target' },
};
const DIFFS = { facile: 'Facile', normale: 'Normale', difficile: 'Difficile' };
const SKINS = [
  { id: 'notte', name: 'Notte Viola', color: '#8b5cff', cost: 0 },
  { id: 'menta', name: 'Menta', color: '#2ee6a6', cost: 80 },
  { id: 'lava', name: 'Lava', color: '#ff5a1f', cost: 160 },
  { id: 'abisso', name: 'Abisso', color: '#1e90ff', cost: 260 },
  { id: 'oro', name: 'Oro Zecchino', color: '#ffc928', cost: 400 },
  { id: 'arcobaleno', name: 'Arcobaleno', color: 'conic-gradient(#ff3d7f,#ffc928,#2ee6a6,#1e90ff,#8b5cff,#ff3d7f)', cost: 700 },
];
const V = { playing: false, game: null, from: 'launcher', result: null };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');

function setup(p) {
  const key = `${p.mode}:${p.city}`;
  return `<div class="full-screen vg-menu">
    ${pageHead({ back: V.from, eyebrow: 'Sala Giochi · Arcade', title: 'Voragine', sub: 'Sei una voragine che si apre in città. Inghiotti ciò che è più piccolo di te, cresci, divora le rivali.', right: `<div class="vg-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">${p.games} partite · ${p.wins} vittorie · ${fmt(p.eaten)} oggetti inghiottiti</div></div>` })}
    <div class="vg-setup">
      <section><h3>Modalità</h3><div class="vg-opts">${Object.entries(MODES).map(([id, m]) => `<div class="vg-opt ${p.mode === id ? 'on' : ''}" data-a="vg-mode" data-id="${id}">${icon(m.icon)}<b>${m.name}</b><span>${m.sub}</span>${p.best[`${id}:${p.city}`] ? `<em>Record ${fmt(p.best[`${id}:${p.city}`])}</em>` : ''}</div>`).join('')}</div></section>
      <section><h3>Città</h3><div class="vg-opts">${Object.entries(CITIES).map(([id, c]) => `<div class="vg-opt vg-city ${p.city === id ? 'on' : ''}" data-a="vg-city" data-id="${id}" style="--sky:${c.sky};--fog:${c.fog}"><i class="vg-sky"></i><b>${c.name}</b><span>${c.sub}</span></div>`).join('')}</div></section>
      <section class="vg-row2">
        <div><h3>Difficoltà rivali</h3><div class="vg-seg">${Object.entries(DIFFS).map(([id, n]) => `<button class="${p.diff === id ? 'on' : ''}" data-a="vg-diff" data-id="${id}">${n}</button>`).join('')}</div>
          <h3 class="mt16">Comandi</h3><div class="vg-keys"><span><span class="kbd">Mouse</span> la voragine segue il puntatore</span><span><span class="kbd">W A S D</span> / <span class="kbd">Frecce</span> muovi</span><span><span class="kbd">Touch</span> trascina per muovere</span><span><span class="kbd">Stick</span> controller</span><span><span class="kbd">Esc</span> / <span class="kbd">P</span> pausa</span></div></div>
        <div><h3>Voragine</h3><div class="vg-skins">${SKINS.map((s) => { const own = p.owned.includes(s.id); return `<div class="vg-skin ${p.skin === s.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="vg-skin" data-id="${s.id}" title="${esc(s.name)}"><i style="background:${s.color}"></i><b>${esc(s.name)}</b><span>${own ? (p.skin === s.id ? 'In uso' : 'Tua') : `${icon('coin')} ${s.cost}`}</span></div>`; }).join('')}</div></div>
      </section>
      <div class="vg-go"><div class="vg-rec">${p.best[key] ? `${icon('star')} Record ${MODES[p.mode].name} · ${esc(CITIES[p.city].name)}: <b>${fmt(p.best[key])}</b>` : 'Nessun record qui: stabiliscine uno!'}</div><button class="btn primary big" data-a="vg-play">${icon('play')} Gioca</button></div>
    </div>
  </div>`;
}

function results(r, p) {
  const key = `${r.mode}:${r.city}`;
  const title = r.mode === 'solitaria' ? (r.stars >= 3 ? 'Città divorata!' : 'Tempo scaduto') : r.pos === 1 ? 'La voragine più grande!' : r.why === 'eaten' ? 'Inghiottito!' : `${r.pos}° posto`;
  return `<div class="vg-res" role="dialog" aria-label="Risultati">
    <div class="vg-res-card">
      <div class="vg-res-k">${esc(MODES[r.mode].name)} · ${esc(CITIES[r.city].name)}</div>
      <h2>${title}</h2>
      <div class="vg-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? 'on' : ''}">★</i>`).join('')}</div>
      <div class="vg-res-score"><span>${fmt(r.score)}</span> punti ${r.record ? '<em>Nuovo record!</em>' : `<small>record ${fmt(p.best[key] || 0)}</small>`}</div>
      <div class="vg-res-stats">
        <div><b>${r.mode === 'solitaria' ? r.pct.toFixed(1) + '%' : `${r.pos}/${r.of}`}</b><span>${r.mode === 'solitaria' ? 'della città' : 'posizione'}</span></div>
        <div><b>${fmt(r.eaten)}</b><span>oggetti</span></div>
        <div><b>${r.holes}</b><span>voragini</span></div>
        <div><b>+${r.coins}</b><span>monete</span></div>
      </div>
      ${r.big ? `<div class="vg-res-big">Boccone più grande: <b>${esc(r.big)}</b></div>` : ''}
      ${r.ranking.length > 1 ? `<ol class="vg-res-rank">${r.ranking.map((h, i) => `<li class="${h.player ? 'me' : ''}" style="--c:${h.color}"><span>${i + 1}</span><i></i><b>${esc(h.name)}</b><em>${h.out && r.mode === 'battaglia' ? 'fuori' : fmt(h.score)}</em></li>`).join('')}</ol>` : ''}
      <div class="vg-res-btns"><button class="btn primary" data-a="vg-again">${icon('replay')} Rivincita</button><button class="btn" data-a="vg-back">${icon('left')} Menu Voragine</button><button class="btn ghost" data-a="vg-hall">${icon('gamepad')} Sala Giochi</button></div>
    </div>
  </div>`;
}

function stopGame() { V.game?.destroy(); V.game = null; window.__voragine = null; }

registerScreen({
  id: 'voragine', full: true,
  render(params) {
    if (params?.from) V.from = params.from; else if (params?.to === 'voragine') V.from = 'launcher';
    if (V.playing) return `<div class="vg-stage"><div class="vg-root" id="vg-root"><div class="vg-loading">Si apre la terra…</div></div><div class="vg-over" id="vg-over"></div></div>`;
    return setup(vgLoad());
  },
  async mount() {
    if (!V.playing) { requestAnimationFrame(() => document.querySelector('.vg-go .btn')?.focus({ preventScroll: true })); return; }
    const root = document.getElementById('vg-root');
    const p = vgLoad();
    try { music.setMood?.('derby'); } catch {}
    const { VoragineGame } = await import('../voragine/game.js');
    if (!V.playing || !root.isConnected) return;
    const s = getSettings();
    const g = V.game = new VoragineGame(root, {
      mode: p.mode, city: p.city, diff: p.diff, skin: p.skin, tier: gfxTier(), volume: s.sound === false ? 0 : 0.6 * (s.volume ?? 0.5) / 0.5,
      onPause: (on) => {
        const ov = document.getElementById('vg-over'); if (!ov) return;
        ov.innerHTML = on ? `<div class="vg-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2><button class="btn primary" data-a="vg-resume">${icon('play')} Riprendi</button><button class="btn" data-a="vg-restart">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="vg-quit">${icon('left')} Esci</button></div>` : '';
        if (on) requestAnimationFrame(() => ov.querySelector('.btn')?.focus());
      },
      onEnd: (r) => {
        const st = vgLoad();
        const key = `${r.mode}:${r.city}`;
        r.record = r.score > (st.best[key] || 0);
        if (r.record) st.best[key] = r.score;
        st.games++; if (r.mode !== 'solitaria' && r.pos === 1) st.wins++;
        st.coins += r.coins; st.eaten += r.eaten; st.bestRadius = Math.max(st.bestRadius || 0, r.radius);
        vgSave(st);
        V.result = r;
        setTimeout(() => {
          const ov = document.getElementById('vg-over'); if (!ov || !V.playing) return;
          ov.innerHTML = results(r, st);
          try { r.pos === 1 || r.stars >= 2 ? sfx.win() : sfx.ok(); } catch {}
          requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus());
        }, 700);
      },
    });
    window.__voragine = g;
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="vg-loading">Impossibile avviare il gioco: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="vg-back">Indietro</button></div>`; }
  },
  unmount() { stopGame(); V.playing = false; },
  actions: {
    'vg-mode'(el) { const p = vgLoad(); p.mode = el.dataset.id; vgSave(p); App.refresh(); },
    'vg-city'(el) { const p = vgLoad(); p.city = el.dataset.id; vgSave(p); App.refresh(); },
    'vg-diff'(el) { const p = vgLoad(); p.diff = el.dataset.id; vgSave(p); App.refresh(); },
    'vg-skin'(el) {
      const p = vgLoad(), s = SKINS.find((x) => x.id === el.dataset.id); if (!s) return;
      if (p.owned.includes(s.id)) { p.skin = s.id; vgSave(p); App.refresh(); return; }
      if (p.coins < s.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${s.cost - p.coins} monete per «${s.name}». Le guadagni giocando.`, 'bad'); return; }
      App.confirm(`Sbloccare «${s.name}»?`, `Costa ${s.cost} monete (ne hai ${p.coins}).`, () => { const q = vgLoad(); q.coins -= s.cost; q.owned.push(s.id); q.skin = s.id; vgSave(q); sfx.coin?.(); App.refresh(); });
    },
    'vg-play'() { V.playing = true; App.refresh(); },
    'vg-resume'() { V.game?.togglePause(false); },
    'vg-restart'() { stopGame(); App.refresh(); },
    'vg-again'() { stopGame(); App.refresh(); },
    'vg-quit'() { stopGame(); V.playing = false; App.refresh(); },
    'vg-back'() { stopGame(); V.playing = false; App.refresh(); },
    'vg-hall'() { stopGame(); V.playing = false; App.go('launcher'); },
  },
});
