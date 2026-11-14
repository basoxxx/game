// Voragine — setup screen (daily challenge, mode, city, difficulty, progression track, skins and
// trails), the live game, pause and results.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { getSettings } from '../engine/state.js';
import { gfxTier } from '../ui/quality.js';
import { vgLoad, vgSave } from '../voragine/store.js';
import { CITIES } from '../voragine/city.js';
import { MODES, DIFFS, SKINS, TRAILS, TRACK_MAX, trackLevel, trackReward, matchXp, dailySpec } from '../voragine/meta.js';
import '../voragine/voragine.css';

const V = { playing: false, game: null, from: 'launcher', result: null, daily: null };
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const skinCss = (s) => s.css || s.color;

function rewardChip(rw) {
  if (rw.type === 'skin') return `<i class="rw-skin" style="background:${skinCss(SKINS.find((s) => s.id === rw.id))}"></i>`;
  if (rw.type === 'trail') return `<i class="rw-trail" style="--c:${rw.color}"></i>`;
  return `<i class="rw-coin">${icon('coin')}</i>`;
}
function track(p) {
  const T = trackLevel(p.xp);
  const nodes = [];
  for (let l = 2; l <= TRACK_MAX; l++) { const rw = trackReward(l); nodes.push(`<li class="${l <= T.lvl ? 'got' : ''} ${l === T.lvl + 1 ? 'next' : ''}" title="Livello ${l}: ${esc(rw.name)}"><b>${l}</b>${rewardChip(rw)}<span>${esc(rw.name)}</span></li>`); }
  return `<section class="vg-track"><div class="vg-track-h"><h3>Percorso Voragine</h3><div class="vg-track-l"><b>Livello ${T.lvl}</b>${T.need ? `<span>${fmt(T.into)} / ${fmt(T.need)} XP</span>` : '<span>Percorso completato!</span>'}</div></div>
    <div class="vg-bar vg-track-bar"><i style="width:${T.need ? (T.into / T.need) * 100 : 100}%"></i></div>
    <ol class="vg-track-nodes">${nodes.join('')}</ol></section>`;
}
function dailyCard(p) {
  const d = dailySpec(), st = p.daily?.key === d.key ? p.daily : null;
  const dt = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<section class="vg-daily" style="--sky:${CITIES[d.city].sky};--fog:${CITIES[d.city].fog}">
    <div class="vg-daily-t"><div class="vg-daily-k">${icon('calendar')} Sfida del giorno · ${esc(dt)}</div><b>${esc(MODES[d.mode].name)} a ${esc(CITIES[d.city].name)}</b>
    <span>Stessa città, stesse rivali e stesse missioni per tutti, oggi. ${st?.done ? `Il tuo record di oggi: <em>${fmt(st.best)}</em>` : `Prima partita: <em>+${d.reward} monete</em> bonus`}</span></div>
    <button class="btn primary" data-a="vg-daily">${icon('play')} ${st?.done ? 'Riprova' : 'Gioca la sfida'}</button></section>`;
}

function setup(p) {
  const key = `${p.mode}:${p.city}`;
  const T = trackLevel(p.xp);
  return `<div class="full-screen vg-menu">
    ${pageHead({ back: V.from, eyebrow: 'Baso Hub · Arcade', title: 'Voragine', sub: 'Sei una voragine che si apre in città. Inghiotti ciò che è più piccolo di te, cresci, divora le rivali.', right: `<div class="vg-wallet"><div class="w-k">Monete</div><b>${icon('coin')} ${fmt(p.coins)}</b><div class="w-s">${p.games} partite · ${p.wins} vittorie · ${fmt(p.eaten)} oggetti inghiottiti</div></div>` })}
    <div class="vg-setup">
      ${dailyCard(p)}
      <section><h3>Modalità</h3><div class="vg-opts">${Object.entries(MODES).map(([id, m]) => `<div class="vg-opt ${p.mode === id ? 'on' : ''}" data-a="vg-mode" data-id="${id}" tabindex="0">${icon(m.icon)}<b>${m.name}</b><span>${m.sub}</span>${p.best[`${id}:${p.city}`] ? `<em>Record ${fmt(p.best[`${id}:${p.city}`])}</em>` : ''}</div>`).join('')}</div></section>
      <section><h3>Città</h3><div class="vg-opts vg-cities">${Object.entries(CITIES).map(([id, c]) => `<div class="vg-opt vg-city ${p.city === id ? 'on' : ''}" data-a="vg-city" data-id="${id}" tabindex="0" style="--sky:${c.sky};--fog:${c.fog}"><i class="vg-sky"></i>${id === 'porto' || id === 'neve' ? '<em class="vg-new">Nuova</em>' : ''}<b>${c.name}</b><span>${c.sub}</span></div>`).join('')}</div></section>
      <section class="vg-row2">
        <div><h3>Difficoltà rivali</h3><div class="vg-seg">${Object.entries(DIFFS).map(([id, d]) => `<button class="${p.diff === id ? 'on' : ''}" data-a="vg-diff" data-id="${id}">${d.name}</button>`).join('')}</div>
          <h3 class="mt16">Comandi</h3><div class="vg-keys"><span><span class="kbd">Mouse</span> la voragine segue il puntatore</span><span><span class="kbd">W A S D</span> / <span class="kbd">Frecce</span> muovi</span><span><span class="kbd">Touch</span> trascina per muovere</span><span><span class="kbd">Stick</span> controller</span><span><span class="kbd">Esc</span> / <span class="kbd">P</span> pausa</span></div>
          <h3 class="mt16">Potenziamenti</h3><div class="vg-keys"><span><b class="pw" style="--c:#ff4d6d">🧲</b> Calamita: attira gli oggetti</span><span><b class="pw" style="--c:#2ee6a6">⚡</b> Turbo: più veloce</span><span><b class="pw" style="--c:#ffc928">⬤</b> Mega: più grande per qualche secondo</span></div></div>
        <div><h3>Voragine</h3><div class="vg-skins">${SKINS.map((s) => { const own = p.owned.includes(s.id); const lock = s.track ? `Livello ${s.track}` : `${icon('coin')} ${s.cost}`; return `<div class="vg-skin ${p.skin === s.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="vg-skin" data-id="${s.id}" tabindex="0" title="${esc(s.name)}"><i style="background:${skinCss(s)}"></i><b>${esc(s.name)}</b><span>${own ? (p.skin === s.id ? 'In uso' : 'Tua') : lock}</span></div>`; }).join('')}</div>
          <h3 class="mt16">Scia</h3><div class="vg-trails">${TRAILS.map((t) => { const own = p.trails.includes(t.id); return `<button class="vg-trail ${p.trail === t.id ? 'on' : ''} ${own ? '' : 'locked'}" data-a="vg-trail" data-id="${t.id}" title="${own ? esc(t.name) : `Si sblocca al livello ${t.track} del Percorso`}"><i style="background:${t.colors.length ? `linear-gradient(90deg,${t.colors.join(',')})` : 'transparent'}"></i>${esc(t.name)}${own ? '' : ` <small>Liv. ${t.track}</small>`}</button>`; }).join('')}</div></div>
      </section>
      ${track(p)}
      <div class="vg-go"><div class="vg-rec">${p.best[key] ? `${icon('star')} Record ${MODES[p.mode].name} · ${esc(CITIES[p.city].name)}: <b>${fmt(p.best[key])}</b>` : 'Nessun record qui: stabiliscine uno!'} <span class="vg-rec-t">· Percorso liv. ${T.lvl}</span></div><button class="btn primary big" data-a="vg-play">${icon('play')} Gioca</button></div>
    </div>
  </div>`;
}

function results(r, p) {
  const key = r.daily ? `daily:${r.daily}` : `${r.mode}:${r.city}`;
  const title = r.mode === 'solitaria' ? (r.stars >= 3 ? 'Città divorata!' : 'Tempo scaduto') : r.pos === 1 ? 'La voragine più grande!' : r.why === 'eaten' ? 'Inghiottito!' : `${r.pos}° posto`;
  const T = trackLevel(p.xp);
  return `<div class="vg-res" role="dialog" aria-label="Risultati">
    <div class="vg-res-card">
      <div class="vg-res-k">${r.daily ? 'Sfida del giorno · ' : ''}${esc(MODES[r.mode].name)} · ${esc(CITIES[r.city].name)}</div>
      <h2>${title}</h2>
      <div class="vg-stars">${[1, 2, 3].map((i) => `<i class="${i <= r.stars ? 'on' : ''}">★</i>`).join('')}</div>
      <div class="vg-res-score"><span>${fmt(r.score)}</span> punti ${r.record ? '<em>Nuovo record!</em>' : `<small>record ${fmt(p.best[key] || 0)}</small>`}</div>
      <div class="vg-res-stats">
        <div><b>${r.mode === 'solitaria' ? r.pct.toFixed(1) + '%' : `${r.pos}/${r.of}`}</b><span>${r.mode === 'solitaria' ? 'della città' : 'posizione'}</span></div>
        <div><b>${fmt(r.eaten)}</b><span>oggetti</span></div>
        <div><b>${r.holes}</b><span>voragini</span></div>
        <div><b>x${r.combo || 0}</b><span>combo max</span></div>
        <div><b>+${r.coins + (r.dailyBonus || 0)}</b><span>monete</span></div>
      </div>
      ${r.missions?.length ? `<ul class="vg-res-miss">${r.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : '✗'}</i><span>${esc(m.text)}</span><em>${m.done ? `+${m.coins}` : `${m.type === 'pct' ? Math.floor(m.have) + '%' : m.type === 'eat' || m.type === 'rival' || m.type === 'power' ? `${Math.floor(m.have)}/${m.n}` : ''}`}</em></li>`).join('')}</ul>` : ''}
      ${r.dailyBonus ? `<div class="vg-res-big">Bonus sfida del giorno: <b>+${r.dailyBonus} monete</b></div>` : ''}
      <div class="vg-res-xp"><div><b>+${r.xp} XP</b> · Percorso livello ${T.lvl}${T.need ? ` · ${fmt(T.into)}/${fmt(T.need)}` : ''}</div><div class="vg-bar"><i style="width:${T.need ? (T.into / T.need) * 100 : 100}%"></i></div>
        ${r.unlocks?.length ? `<div class="vg-res-unl">${r.unlocks.map((u) => `<span>${rewardChip(u)} Livello ${u.lvl}: <b>${esc(u.name)}</b></span>`).join('')}</div>` : ''}</div>
      ${r.big ? `<div class="vg-res-big">Boccone più grande: <b>${esc(r.big)}</b></div>` : ''}
      ${r.ranking.length > 1 ? `<ol class="vg-res-rank">${r.ranking.map((h, i) => `<li class="${h.player ? 'me' : ''}" style="--c:${h.color}"><span>${i + 1}</span><i></i><b>${esc(h.name)}</b><em>${h.out && r.mode === 'battaglia' ? 'fuori' : fmt(h.score)}</em></li>`).join('')}</ol>` : ''}
      <div class="vg-res-btns"><button class="btn primary" data-a="vg-again">${icon('replay')} Rivincita</button><button class="btn" data-a="vg-back">${icon('left')} Menu Voragine</button><button class="btn ghost" data-a="vg-hall">${icon('gamepad')} Baso Hub</button></div>
    </div>
  </div>`;
}

function stopGame() { V.game?.destroy(); V.game = null; window.__voragine = null; }

registerScreen({
  id: 'voragine', full: true,
  render(params) {
    if (params?.from) V.from = params.from; else if (params?.to === 'voragine') V.from = 'launcher';
    // the Baso Hub can preselect a mode/city, or start straight away
    if (params?.mode || params?.city) { const p = vgLoad(); if (params.mode) p.mode = params.mode; if (params.city) p.city = params.city; vgSave(p); }
    if (params?.quick && !V.playing && !V.quickDone) { V.quickDone = true; V.playing = true; V.daily = null; }
    if (V.playing) return `<div class="vg-stage"><div class="vg-root" id="vg-root"><div class="vg-loading">Si apre la terra…</div></div><div class="vg-over" id="vg-over"></div></div>`;
    return setup(vgLoad());
  },
  async mount() {
    if (!V.playing) { requestAnimationFrame(() => document.querySelector('.vg-go .btn')?.focus({ preventScroll: true })); return; }
    const root = document.getElementById('vg-root');
    const p = vgLoad();
    try { music.setMood?.('voragine'); } catch {}
    const { VoragineGame } = await import('../voragine/game.js');
    if (!V.playing || !root.isConnected) return;
    const s = getSettings();
    const D = V.daily;
    const g = V.game = new VoragineGame(root, {
      mode: D ? D.mode : p.mode, city: D ? D.city : p.city, diff: D ? D.diff : p.diff, daily: D, skin: p.skin, trail: p.trail, tier: gfxTier(), volume: s.sound === false ? 0 : 0.6 * (s.volume ?? 0.5) / 0.5,
      onPause: (on) => {
        const ov = document.getElementById('vg-over'); if (!ov) return;
        ov.innerHTML = on ? `<div class="vg-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2>${g.missions ? `<ul class="vg-res-miss">${g.missions.map((m) => `<li class="${m.done ? 'done' : ''}"><i>${m.done ? '✓' : ''}</i><span>${esc(m.text)}</span><em>+${m.coins}</em></li>`).join('')}</ul>` : ''}<button class="btn primary" data-a="vg-resume">${icon('play')} Riprendi</button><button class="btn" data-a="vg-restart">${icon('replay')} Ricomincia</button><button class="btn ghost" data-a="vg-quit">${icon('left')} Esci</button></div>` : '';
        if (on) requestAnimationFrame(() => ov.querySelector('.btn')?.focus());
      },
      onEnd: (r) => {
        const st = vgLoad();
        const key = r.daily ? `daily:${r.daily}` : `${r.mode}:${r.city}`;
        r.record = r.score > (st.best[key] || 0);
        if (r.record) st.best[key] = r.score;
        if (r.daily) {
          const first = st.daily?.key !== r.daily || !st.daily.done;
          if (first) r.dailyBonus = D?.reward || 0;
          st.daily = { key: r.daily, done: true, best: Math.max(st.daily?.key === r.daily ? st.daily.best || 0 : 0, r.score) };
        }
        st.games++; if (r.mode !== 'solitaria' && r.pos === 1) st.wins++;
        st.coins += r.coins + (r.dailyBonus || 0); st.eaten += r.eaten; st.bestRadius = Math.max(st.bestRadius || 0, r.radius);
        // progression track
        r.xp = matchXp(r);
        const before = trackLevel(st.xp).lvl; st.xp = (st.xp || 0) + r.xp; const after = trackLevel(st.xp).lvl;
        r.unlocks = [];
        for (let l = before + 1; l <= after; l++) {
          const rw = { ...trackReward(l), lvl: l }; r.unlocks.push(rw);
          if (rw.type === 'coins') st.coins += rw.n;
          else if (rw.type === 'skin' && !st.owned.includes(rw.id)) st.owned.push(rw.id);
          else if (rw.type === 'trail' && !st.trails.includes(rw.id)) { st.trails.push(rw.id); if (st.trail === 'nessuna') st.trail = rw.id; }
        }
        vgSave(st);
        V.result = r;
        setTimeout(() => {
          const ov = document.getElementById('vg-over'); if (!ov || !V.playing) return;
          ov.innerHTML = results(r, st);
          try { r.pos === 1 || r.stars >= 2 ? sfx.win() : sfx.ok(); if (r.unlocks.length) setTimeout(() => sfx.levelup?.(), 600); } catch {}
          requestAnimationFrame(() => ov.querySelector('.btn.primary')?.focus());
        }, 900);
      },
    });
    window.__voragine = g;
    try { await g.start(); } catch (e) { console.error(e); root.innerHTML = `<div class="vg-loading">Impossibile avviare il gioco: ${esc(e.message || String(e))}<br><button class="btn mt16" data-a="vg-back">Indietro</button></div>`; }
  },
  unmount() { stopGame(); V.playing = false; V.quickDone = false; },
  actions: {
    'vg-mode'(el) { const p = vgLoad(); p.mode = el.dataset.id; vgSave(p); App.refresh(); },
    'vg-city'(el) { const p = vgLoad(); p.city = el.dataset.id; vgSave(p); App.refresh(); },
    'vg-diff'(el) { const p = vgLoad(); p.diff = el.dataset.id; vgSave(p); App.refresh(); },
    'vg-skin'(el) {
      const p = vgLoad(), s = SKINS.find((x) => x.id === el.dataset.id); if (!s) return;
      if (p.owned.includes(s.id)) { p.skin = s.id; vgSave(p); App.refresh(); return; }
      if (s.track) { sfx.bad?.(); App.toast('Premio del Percorso', `«${s.name}» si sblocca al livello ${s.track} del Percorso Voragine: guadagni XP a ogni partita.`, 'bad'); return; }
      if (p.coins < s.cost) { sfx.bad?.(); App.toast('Monete insufficienti', `Ti servono ancora ${s.cost - p.coins} monete per «${s.name}». Le guadagni giocando.`, 'bad'); return; }
      App.confirm(`Sbloccare «${s.name}»?`, `Costa ${s.cost} monete (ne hai ${p.coins}).`, () => { const q = vgLoad(); q.coins -= s.cost; q.owned.push(s.id); q.skin = s.id; vgSave(q); sfx.coin?.(); App.refresh(); });
    },
    'vg-trail'(el) {
      const p = vgLoad(), t = TRAILS.find((x) => x.id === el.dataset.id); if (!t) return;
      if (!p.trails.includes(t.id)) { sfx.bad?.(); App.toast('Scia bloccata', `«${t.name}» si sblocca al livello ${t.track} del Percorso Voragine.`, 'bad'); return; }
      p.trail = t.id; vgSave(p); App.refresh();
    },
    'vg-play'() { V.daily = null; V.playing = true; App.refresh(); },
    'vg-daily'() { V.daily = dailySpec(); V.playing = true; App.refresh(); },
    'vg-resume'() { V.game?.togglePause(false); },
    'vg-restart'() { stopGame(); App.refresh(); },
    'vg-again'() { stopGame(); App.refresh(); },
    'vg-quit'() { stopGame(); V.playing = false; App.refresh(); },
    'vg-back'() { stopGame(); V.playing = false; App.refresh(); },
    'vg-hall'() { stopGame(); V.playing = false; App.go('launcher'); },
  },
});
