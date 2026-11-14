// Muretto box (pit wall): the second screen of a live Apex Dynasty session. Runs in another window of the
// same app (second monitor) or on another device (tablet / phone / PC) and shows what an F1 team sees in
// its operations room: timing tower with sectors, strategy, telemetry, a live map and the race in 3D.
// It also answers the calls, boxes the cars and changes the pace: commands go back to the game, which
// applies them through its own buttons.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, fmtTime } from '../ui/dom.js';
import { flagSVG, trackSVG } from '../ui/art.js';
import { COMPOUNDS } from '../data/categories.js';
import { circuitPath, arcFrac, speedAtTimeFrac, TrackView } from '../ui/trackview.js';
import { trackGeometry } from '../engine/trackphys.js';
import { createViewer, normCode } from '../pitwall/link.js';
import { disposeStage } from '../ui/stage3d.js';
import { gfxTier } from '../ui/quality.js';
import '../styles/pitwall.css';

const TABS = [['timing', 'Timing', 'board'], ['strat', 'Strategia', 'tyre'], ['tele', 'Telemetria', 'chart'], ['map', 'Mappa live', 'map'], ['live', 'Diretta', 'play']];
const SPEEDS = [1, 2, 4, 8, 16, 32];
const FLAGS = { green: ['green', 'Bandiera verde'], sc: ['sc', 'Safety car'], vsc: ['sc', 'Virtual SC'], fcy: ['sc', 'Full course yellow'], red: ['red', 'Bandiera rossa'], end: ['end', 'Bandiera a scacchi'], yellow: ['yellow', 'Bandiera gialla'] };
const KIND = { race: 'Gara', practice: 'Prove libere', quali: 'Qualifica', rally: 'Prova speciale' };
const MODES = [['save', 'Gestione'], ['normal', 'Normale'], ['push', 'Attacco']];
const ERS = [['harvest', 'Ricarica'], ['balanced', 'Bilanciato'], ['deploy', 'Override']];
const ENG = [['low', 'Risparmio'], ['std', 'Standard'], ['high', 'Spinta']];
const CAMS = [['auto', 'Regia'], ['tv', 'TV'], ['chase', 'Camera car'], ['onboard', 'Onboard'], ['heli', 'Elicottero']];

const V = { link: null, code: null, meta: null, s: null, at: 0, tab: 'timing', sel: null, focus: null, feed: [], status: { state: 'searching' }, map: null, r3d: null, load: null, raf: 0,
  disp: {}, off: {}, trace: {}, holding: false, gap: 'int', bodyKey: '', decSig: '', cam: 'auto', mode2d: false, sent: {}, lastT: 0, uiT: 0 };
const TAB_KEY = 'apex_pitwall_tab';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };
document.addEventListener('pointerdown', (e) => { if (e.target.closest?.('.pw-tower, .pw-mini')) V.holding = true; });
document.addEventListener('pointerup', () => { setTimeout(() => { V.holding = false; }, 40); });

const carM = (k) => V.meta?.cars?.find((c) => c.k === k) || null;
const nm = (k) => carM(k)?.name || k;
const code3 = (k) => carM(k)?.code || '';
const lastName = (n) => { const p = String(n || '').split(' '); return p.slice(1).join(' ') || n; };
const tyre = (id, age) => { const c = COMPOUNDS[id]; if (!c) return id ? `<span class="pw-ty" style="--tc:#888">${esc(String(id).slice(0, 2).toUpperCase())}</span>` : ''; return `<span class="pw-ty" style="--tc:${c.color}" title="${esc(c.name)}">${c.short}</span>${age != null ? `<small class="pw-age">${Math.floor(age)}</small>` : ''}`; };
const sec = (t) => (t == null ? '' : t.toFixed(3));
const gapTxt = (g) => (g == null ? '' : typeof g === 'string' ? g : g >= 60 ? `+${Math.floor(g / 60)}:${(g % 60).toFixed(1).padStart(4, '0')}` : `+${g.toFixed(g < 10 ? 3 : 1)}`);
const mmss = (s) => { s = Math.max(0, Math.ceil(s || 0)); const h = Math.floor(s / 3600); return `${h ? h + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`; };
const myCars = () => (V.s?.cars || []).filter((c) => c.me);
const can3D = () => { try { const c = document.createElement('canvas'); const ok = !!(c.getContext('webgl2') || c.getContext('webgl')); return ok && gfxTier() !== 'low'; } catch { return false; } };

// ================= SCREEN =================
registerScreen({
  id: 'pitwall', full: true,
  render(p = {}) {
    const q = new URLSearchParams(location.search).get('pitwall');
    const code = p.code ?? (q != null ? q : null);
    if (code == null) return connectHTML();
    V.code = /^local$/i.test(code) || code === '' ? null : normCode(code);
    V.tab = TABS.some((t) => t[0] === lsGet(TAB_KEY)) ? lsGet(TAB_KEY) : V.tab;
    return `<div class="pw-screen" data-tab="${V.tab}">
      <header class="pw-top">
        <button class="btn ghost icon-btn" data-a="pw-exit" aria-label="Chiudi il muretto box" data-tip="Chiudi il muretto box">${icon('left')}</button>
        <div class="pw-brand"><span class="pw-mark">${icon('display')}</span><div><b>Muretto box</b><small>Apex Dynasty</small></div></div>
        <div class="pw-sess" id="pw-sess"></div>
        <div class="pw-flag" id="pw-flag"></div>
        <div class="pw-wx" id="pw-wx"></div>
        <div class="grow"></div>
        <div class="pw-speed" id="pw-speed"></div>
        <div class="pw-conn" id="pw-conn"></div>
      </header>
      <nav class="pw-tabs" role="tablist">${TABS.map(([id, n, ic]) => `<button class="pw-tab ${V.tab === id ? 'on' : ''}" role="tab" aria-selected="${V.tab === id}" data-a="pw-tab" data-t="${id}">${icon(ic, 'ico')}<span>${n}</span></button>`).join('')}</nav>
      <div class="pw-prog"><i id="pw-prog"></i></div>
      <main class="pw-body" id="pw-body"></main>
      <div class="pw-dec" id="pw-dec" aria-live="polite"></div>
      <footer class="pw-ticker" id="pw-ticker"></footer>
      <div class="pw-wait" id="pw-wait"></div>
    </div>`;
  },
  mount(root, p = {}) {
    try { disposeStage(); } catch { /* */ }
    if (!document.querySelector('.pw-screen')) { document.getElementById('pw-code')?.focus(); return; }
    teardown(false);
    // the address carries the room: a reload or a bookmark reconnects by itself
    try { const u = new URL(location.href); if (u.searchParams.get('pitwall') !== (V.code || 'local')) { u.searchParams.set('pitwall', V.code || 'local'); history.replaceState(null, '', u.href); } } catch { /* */ }
    V.meta = null; V.s = null; V.feed = []; V.bodyKey = ''; V.decSig = ''; V.disp = {}; V.off = {}; V.trace = {};
    V.link = createViewer(V.code, { onMessage, onStatus: (s) => { V.status = s; paintConn(); paintWait(); }, live: () => !!V.s?.live });
    V.status = V.link.status;
    paintConn(); paintWait(); paintBody(true);
    V.lastT = performance.now();
    const loop = (t) => { const dt = Math.min(0.1, (t - V.lastT) / 1000); V.lastT = t; frame(dt); V.raf = requestAnimationFrame(loop); };
    V.raf = requestAnimationFrame(loop);
    window.addEventListener('resize', onResize);
  },
  unmount() { teardown(true); window.removeEventListener('resize', onResize); },
  onKey(e) {
    if (!document.querySelector('.pw-screen')) return;
    const i = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 }[e.code];
    if (i != null && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setTab(TABS[i][0]); }
    if (e.code === 'Space') { e.preventDefault(); cmd('pause'); }
  },
  actions: {
    'pw-exit'() { App.confirm('Chiudere il muretto box?', 'Il gioco sul computer continua normalmente.', () => { teardown(true); if (window.opener && new URLSearchParams(location.search).has('pitwall')) { try { window.close(); } catch { /* */ } } try { const u = new URL(location.href); u.searchParams.delete('pitwall'); history.replaceState(null, '', u.href); } catch { /* */ } App.go('launcher'); }); },
    'pw-tab'(el) { setTab(el.dataset.t); },
    'pw-join'() { const v = normCode(document.getElementById('pw-code')?.value); if (v.length < 6) { App.toast('Codice incompleto', 'Il codice ha 6 caratteri: lo trovi nel pannello Muretto box del gioco.', 'bad'); return; } App.go('pitwall', { code: v }); },
    'pw-local'() { App.go('pitwall', { code: 'local' }); },
    'pw-retry'() { V.link?.retry(); },
    'pw-gap'() { V.gap = V.gap === 'int' ? 'lead' : 'int'; paintBody(true); },
    'pw-sel'(el) { V.sel = el.dataset.key; V.focus = el.dataset.key; paintBody(true); },
    'pw-focus'(el) { V.focus = el.dataset.key; if (V.r3d) { V.r3d.director = false; V.r3d.camMode = V.cam === 'auto' || V.cam === 'tv' ? 'chase' : V.cam; V.r3d._cut = true; if (V.cam === 'auto') V.cam = 'chase'; paintLiveBtns(); } paintBody(true); },
    'pw-cam'(el) { V.cam = el.dataset.c; if (V.r3d) { V.r3d.director = V.cam === 'auto'; V.r3d.camMode = V.cam === 'auto' ? 'tv' : V.cam; V.r3d.dirT = 0; V.r3d._cut = true; } paintLiveBtns(); },
    'pw-2d'() { V.mode2d = !V.mode2d; V.bodyKey = ''; paintBody(true); },
    'pw-cmd'(el) {
      const { cmd: c, ...d } = el.dataset; delete d.a;
      if (d.i != null) d.i = +d.i;
      cmd(c, d, el);
    },
    'pw-dec'(el) { cmd('dec', { id: el.dataset.id, i: +el.dataset.i }, el); const card = el.closest('.pw-dcard'); card?.classList.add('answered'); },
  },
});

function connectHTML() {
  return `<div class="pw-connect">
    <div class="pw-cbox">
      <div class="pw-brand big"><span class="pw-mark">${icon('display')}</span><div><b>Muretto box</b><small>Secondo schermo per Apex Dynasty</small></div></div>
      <p class="muted">Sul computer dove giochi apri una sessione dal vivo (prove, qualifica, gara o prova speciale) e premi <b>Muretto box</b> nella barra in alto: compare un codice di 6 caratteri.</p>
      <label class="tiny upper muted" for="pw-code">Codice del muretto box</label>
      <div class="pw-codein"><input id="pw-code" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" inputmode="text"><button class="btn primary" data-a="pw-join">${icon('right')} Collega</button></div>
      <div class="pw-or"><span>oppure</span></div>
      <button class="btn" data-a="pw-local">${icon('display')} Gioco aperto su questo computer (altra finestra)</button>
      <p class="tiny muted mt16">Su un altro dispositivo l’abbinamento passa da un server pubblico di segnalazione (PeerJS): i dati della gara viaggiano poi direttamente tra i due dispositivi.</p>
      <button class="btn ghost sm mt8" data-a="nav" data-to="launcher">${icon('left')} Torna a Baso Hub</button>
    </div>
  </div>`;
}

function teardown(closeLink) {
  cancelAnimationFrame(V.raf); V.raf = 0;
  stop3D(); V.map?.destroy(); V.map = null;
  if (closeLink) { V.link?.close(); V.link = null; }
  else { V.link?.close(); V.link = null; }
}
function onResize() { V.map?.resize(); }
function setTab(t) {
  if (!TABS.some((x) => x[0] === t) || t === V.tab) return;
  V.tab = t; lsSet(TAB_KEY, t);
  const sc = document.querySelector('.pw-screen'); if (sc) sc.dataset.tab = t;
  document.querySelectorAll('.pw-tab').forEach((b) => { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  paintBody(true);
}
function cmd(a, d = {}, el = null) {
  if (!V.link || V.status.state !== 'live') { App.toast('Non collegato', 'Il muretto box non è collegato al gioco.', 'bad'); return; }
  const n = V.link.send({ a, d });
  V.sent[n] = { a, el, at: Date.now() };
  if (el) { el.classList.add('pw-sent'); setTimeout(() => el.classList?.remove('pw-sent'), 900); }
}

// ================= INCOMING =================
function onMessage(m) {
  if (m.t === 'meta') { const changed = m.meta?.sid !== V.meta?.sid; V.meta = m.meta; if (changed) { V.disp = {}; V.off = {}; V.trace = {}; V.feed = []; V.bodyKey = ''; V.sel = null; stop3D(); V.map?.destroy(); V.map = null; } paintBody(true); return; }
  if (m.t === 'state') {
    const s = m.s; const was = V.s;
    // keep the slow fields (sent once a second) between full updates
    if (s?.live && was?.live && was.sid === s.sid) {
      for (const k of ['wx', 'gh', 'stints', 'stops']) if (s[k] === undefined) s[k] = was[k];
      const prev = Object.fromEntries((was.cars || []).map((c) => [c.k, c]));
      for (const c of s.cars || []) { const p = prev[c.k]; if (!p) continue; for (const k of ['hist', 'riv', 'oc', 'rest']) if (c[k] === undefined && p[k] !== undefined) c[k] = p[k]; }
    }
    const now = performance.now();
    if (s?.live) predictReset(s, now);
    V.s = s; V.at = now;
    if (!V.sel || !s?.cars?.some((c) => c.k === V.sel)) V.sel = s?.cars?.find((c) => c.me)?.k || s?.cars?.[0]?.k || null;
    if (!V.focus) V.focus = V.sel;
    paintTop(); paintWait(); paintDec(); paintBody(false);
    return;
  }
  if (m.t === 'evt') { for (const e of m.list || []) { if (!V.feed.some((x) => x.t === e.t && x.text === e.text)) V.feed.push(e); } if (V.feed.length > 160) V.feed.splice(0, V.feed.length - 160); paintTicker(); if (V.tab === 'timing') paintFeed(); return; }
  if (m.t === 'ack') { const s = V.sent[m.n]; delete V.sent[m.n]; if (!m.ok) App.toast('Comando non eseguito', esc(m.msg || 'Il gioco non ha accettato il comando.'), 'bad'); else if (s?.el) { s.el.classList.add('pw-ok'); setTimeout(() => s.el?.classList?.remove('pw-ok'), 900); } return; }
  if (m.t === 'tab') { setTab(m.tab === 'live' ? 'live' : 'timing'); App.toast(m.tab === 'live' ? 'Diretta su questo schermo' : 'Dati su questo schermo', 'Richiesto dal computer di gioco.', 'good'); }
}

// ---- motion between snapshots: cars advance at their lap pace, corrections are blended away
function rate(c, s) { if (!s.live || s.paused || s.fin || c.st !== 'run' || !(c.lt > 0)) return 0; return (s.speed || 1) / c.lt; }
function predicted(c, s, now) { return (c.d ?? 0) + rate(c, s) * Math.max(0, now - V.at) / 1000; }
function predictReset(s, now) {
  for (const c of s.cars || []) {
    const cur = V.disp[c.k];
    const fresh = (c.d ?? 0);
    if (cur == null || s.kind === 'rally') { V.disp[c.k] = fresh; V.off[c.k] = 0; continue; }
    const o = cur - fresh;
    V.off[c.k] = Math.abs(o) < 0.06 ? o : 0;
  }
}
function frame(dt) {
  const s = V.s; if (!s?.live) return;
  const now = performance.now();
  for (const c of s.cars || []) {
    const o = (V.off[c.k] || 0) * Math.exp(-dt * 4);
    V.off[c.k] = Math.abs(o) < 1e-5 ? 0 : o;
    V.disp[c.k] = predicted(c, s, now) + V.off[c.k];
  }
  if (V.tab === 'map') drawMap();
  if (V.tab === 'live') { if (V.r3d) update3D(dt); else drawMap(); }
  V.uiT += dt;
  if (V.uiT > 0.25) { V.uiT = 0; tickTimers(); if (V.tab === 'tele') sampleTrace(); }
}
function tickTimers() {
  // decision countdowns between snapshots
  const s = V.s; if (!s) return;
  const dtReal = (performance.now() - V.at) / 1000;
  for (const d of s.dec || []) {
    const el = document.querySelector(`[data-pwcd="${d.id}"]`); if (!el) continue;
    if (d.real == null) { el.innerHTML = icon('pause', 'ico'); continue; }
    const n = Math.max(0, Math.ceil(d.real - dtReal)); el.innerHTML = `<b>${n}</b><small>s</small>`; el.classList.toggle('hurry', n <= 5);
    const bar = document.querySelector(`[data-pwbar="${d.id}"]`); if (bar && d.left != null && d.span) bar.style.width = `${Math.max(0, Math.min(100, (d.left - dtReal * (s.paused ? 0 : s.speed)) / d.span * 100)).toFixed(1)}%`;
  }
}

// ================= TOP BAR =================
function paintConn() {
  const el = document.getElementById('pw-conn'); if (!el) return;
  const st = V.status.state; const via = V.code ? 'WebRTC' : 'Stessa macchina';
  const [cls, txt] = st === 'live' ? ['ok', `Collegato · ${via}`] : st === 'connecting' ? ['wait', 'Collegamento…'] : st === 'lost' ? ['wait', 'Riconnessione…'] : st === 'error' ? ['bad', 'Non collegato'] : ['wait', 'In attesa del gioco'];
  el.innerHTML = `<span class="pw-dot ${cls}"></span><span class="pw-ctxt">${txt}${V.code ? ` <b>${esc(V.code)}</b>` : ''}</span>`;
  el.title = V.status.error || txt;
}
function paintWait() {
  const el = document.getElementById('pw-wait'); if (!el) return;
  const st = V.status.state; const s = V.s;
  let html = '';
  if (st !== 'live') {
    const err = V.status.error;
    html = `<div class="pw-wcard">${icon(st === 'error' ? 'alert' : 'radio')}<h2>${st === 'error' ? 'Collegamento non riuscito' : st === 'lost' ? 'Collegamento perso' : V.code ? 'Collegamento al gioco…' : 'In attesa del gioco'}</h2>
      <p class="muted">${esc(err || (V.code ? `Codice ${V.code}: il computer deve avere il pannello Muretto box aperto almeno una volta in questa sessione di gioco.` : 'Apri una sessione dal vivo nella finestra principale di Apex Dynasty: i dati arrivano da soli.'))}</p>
      ${st === 'error' && V.code ? '<p class="tiny muted">Senza Internet il server di abbinamento non è raggiungibile: sullo stesso computer usa «Apri in una nuova finestra».</p>' : ''}
      <div class="row gap6 mt16" style="justify-content:center"><button class="btn" data-a="pw-retry">${icon('reset')} Riprova</button><button class="btn ghost" data-a="pw-exit">Chiudi</button></div><div class="pw-spin"></div></div>`;
  } else if (!s?.live) {
    html = `<div class="pw-wcard">${icon('flag')}<h2>Nessuna sessione in pista</h2><p class="muted">Il gioco è collegato. Quando parte una sessione dal vivo (prove, qualifica, gara o prova speciale) il muretto box si accende.</p><div class="pw-spin"></div></div>`;
  }
  el.classList.toggle('on', !!html);
  if (el.dataset.sig !== html) { el.dataset.sig = html; el.innerHTML = html; }
}
function paintTop() {
  const s = V.s, m = V.meta; if (!s?.live || !m) return;
  const sess = document.getElementById('pw-sess');
  if (sess) {
    const right = s.kind === 'race' ? `<div class="pw-stat ${s.lap >= s.laps && !s.fin ? 'final' : ''}"><b>${s.lap}<small>/${s.laps}</small></b><span>${s.lap >= s.laps && !s.fin ? 'Ultimo giro' : 'Giro'}</span></div><div class="pw-stat"><b>${mmss(s.t)}</b><span>Tempo</span></div>`
      : s.kind === 'rally' ? `<div class="pw-stat"><b>PS ${s.stage}<small>/${s.stages}</small></b><span>${(+s.km || 0).toFixed(1)} km</span></div>`
      : `<div class="pw-stat"><b class="${s.clock < 120 && !s.fin ? 'bad' : ''}">${mmss(s.clock)}</b><span>Tempo rimasto</span></div>`;
    const h = `${m.track?.nat ? flagSVG(m.track.nat, 30, 20) : ''}<div class="pw-sname"><b>${esc(m.track?.name || '')}</b><span>${esc(m.name || KIND[m.kind] || '')}${m.track?.circuit ? ` · ${esc(m.track.circuit)}` : ''}</span></div>${right}`;
    if (sess.dataset.sig !== h) { sess.dataset.sig = h; sess.innerHTML = h; }
  }
  const fl = document.getElementById('pw-flag');
  if (fl && !s.flag) fl.innerHTML = '';
  else if (fl) { const [c, n] = FLAGS[s.flag] || FLAGS.green; const h = `<span class="pw-flagplate ${c}"><i></i>${n}${s.flag === 'yellow' && s.yk != null ? ` S${s.yk + 1}` : ''}</span>`; if (fl.innerHTML !== h) fl.innerHTML = h; }
  const wx = document.getElementById('pw-wx');
  if (wx) { const r = s.rain || 0; const h = `${icon(r > 0.2 ? 'rain' : s.night ? 'moon' : 'sun', 'ico')}<div><b>${r < 0.05 ? 'Asciutto' : r < 0.3 ? 'Umido' : r < 0.6 ? 'Pioggia' : 'Diluvio'}</b><span>${s.temp != null ? `Asfalto ${s.temp}°C` : 'Meteo'}${s.rubber != null ? ` · gomma ${Math.round(s.rubber * 100)}%` : ''}</span></div>`; if (wx.innerHTML !== h) wx.innerHTML = h; }
  const sp = document.getElementById('pw-speed');
  if (sp) { const h = `<button class="btn sm icon-btn ${s.paused ? 'active' : ''}" data-a="pw-cmd" data-cmd="pause" aria-label="Pausa" data-tip="Pausa / riprendi il gioco (Spazio)">${icon(s.paused ? 'play' : 'pause')}</button>${SPEEDS.map((v) => `<button class="btn sm ${!s.paused && s.speed === v ? 'active' : ''}" data-a="pw-cmd" data-cmd="speed" data-v="${v}">${v}x</button>`).join('')}`; if (sp.dataset.sig !== h) { sp.dataset.sig = h; sp.innerHTML = h; } }
  const pg = document.getElementById('pw-prog'); if (pg) pg.style.width = `${Math.min(100, (s.prog || 0) * 100).toFixed(2)}%`;
}
function paintTicker() {
  const el = document.getElementById('pw-ticker'); if (!el) return;
  const list = V.feed.filter((e) => e.imp || /pit|sc|crash|finish|radio|fast|red|pen/.test(e.type)).slice(-3).reverse();
  el.innerHTML = list.map((e) => `<div class="pw-tk ${esc(e.type)}">${e.lap ? `<b>G${e.lap}</b>` : e.t != null ? `<b>${mmss(e.t)}</b>` : ''}<span>${esc(e.text)}</span></div>`).join('');
}

// ================= DECISIONS =================
function paintDec() {
  const el = document.getElementById('pw-dec'); if (!el) return;
  const list = V.s?.live ? V.s.dec || [] : [];
  const sig = list.map((d) => `${d.id}:${d.modal ? 1 : 0}`).join('|');
  if (sig === V.decSig) return;
  V.decSig = sig;
  el.innerHTML = list.slice(0, 3).map((d) => {
    const col = d.color || (d.prio >= 3 ? '#ff3b5c' : d.prio === 2 ? '#ffb020' : '#3aa0ff');
    return `<div class="pw-dcard p${d.prio}${d.modal ? ' modal' : ''}" style="--dc:${col}">
      <div class="pw-dh"><div class="grow"><div class="pw-eyebrow">${esc(d.eyebrow || (d.prio >= 3 ? 'Chiamata urgente' : d.prio === 2 ? 'Strategia' : 'Radio'))}${d.who ? ` · ${esc(d.who)}` : ''}${d.modal ? ' · gioco fermo' : ''}</div><b>${esc(d.title)}</b></div><div class="pw-cd" data-pwcd="${d.id}">${d.real == null ? icon('pause', 'ico') : `<b>${d.real}</b><small>s</small>`}</div></div>
      ${d.text ? `<p>${esc(d.text)}</p>` : ''}
      <div class="pw-dopts n${d.options.length}">${d.options.map((o, i) => `<button class="pw-opt ${i === d.def ? 'rec' : ''}" data-a="pw-dec" data-id="${esc(d.id)}" data-i="${i}"><b>${esc(o.label)}</b>${o.desc ? `<span>${esc(o.desc)}</span>` : ''}${i === d.def ? '<em>Consiglio</em>' : ''}</button>`).join('')}</div>
      ${d.left != null ? `<div class="pw-dbar"><i data-pwbar="${d.id}" style="width:${d.span ? Math.min(100, d.left / d.span * 100).toFixed(1) : 100}%"></i></div>` : ''}
    </div>`;
  }).join('') + (list.length > 3 ? `<div class="tiny muted">+${list.length - 3} in coda</div>` : '');
}

// ================= BODY =================
function paintBody(force) {
  const body = document.getElementById('pw-body'); if (!body) return;
  const s = V.s, m = V.meta;
  if (!s?.live || !m) { if (V.bodyKey !== 'empty') { V.bodyKey = 'empty'; stop3D(); V.map?.destroy(); V.map = null; body.innerHTML = ''; } return; }
  const key = `${V.tab}|${m.sid}|${V.tab === 'live' ? (V.mode2d ? '2d' : '3d') : ''}`;
  const persistent = V.tab === 'map' || V.tab === 'live';
  if (key !== V.bodyKey) {
    V.bodyKey = key;
    stop3D(); V.map?.destroy(); V.map = null;
    if (persistent) { body.innerHTML = viewHTML(); mountView(); }
    else body.innerHTML = '<div class="pw-pane" id="pw-pane"></div>';
    force = true;
  }
  if (persistent) { paintMini(); if (V.tab === 'live') paintHud(); return; }
  const pane = document.getElementById('pw-pane'); if (!pane) return;
  if (!force && V.holding) return;
  let h = '';
  try {
    if (V.tab === 'timing') h = m.kind === 'race' ? timingRace(s, m) : m.kind === 'rally' ? timingRally(s, m) : timingSess(s, m);
    else if (V.tab === 'strat') h = m.kind === 'race' ? stratRace(s, m) : m.kind === 'rally' ? stratRally(s, m) : stratSess(s, m);
    else if (V.tab === 'tele') h = m.kind === 'rally' ? stratRally(s, m) : teleHTML(s, m);
  } catch (e) { console.warn('pitwall', e); h = '<div class="pw-empty">Dati non disponibili</div>'; }
  // keep the scroll of the panes while they refresh
  const sc = [...pane.querySelectorAll('[data-scroll]')].map((x) => [x.dataset.scroll, x.scrollTop]);
  pane.innerHTML = h;
  for (const [k, v] of sc) { const x = pane.querySelector(`[data-scroll="${k}"]`); if (x) x.scrollTop = v; }
  if (V.tab === 'timing') paintFeed();
  if (V.tab === 'tele') drawTrace();
}

// ---------------- TIMING ----------------
function rowStyle(c) { const cm = carM(c.k); return `style="--tc:${cm?.c1 || '#888'};--tc2:${cm?.c2 || '#222'}"`; }
function driverCell(c) { const cm = carM(c.k); return `<span class="pw-drv"><i class="pw-tcol"></i><span class="pw-num">${esc(cm?.n ?? '')}</span><b class="pw-code">${esc(cm?.code || '')}</b><span class="pw-name">${esc(lastName(cm?.name))}</span><span class="pw-team">${esc(cm?.ts || '')}</span></span>`; }
function secCells(c, s) {
  // completed sectors of the lap in progress, the previous lap's (dimmed) for the ones still to run
  const cells = [0, 1, 2].map((k) => {
    const live = c.si != null && k < c.si && c.s?.[k] != null;
    const t = live ? c.s[k] : c.ls?.[k] ?? (c.si == null ? c.s?.[k] : null);
    const cls = live ? c.sc?.[k] : c.si == null ? c.sc?.[k] : c.lsc?.[k];
    return `<td class="pw-sec ${cls ? 't-' + ({ p: 'purple', g: 'green', y: 'yellow' }[cls] || '') : ''} ${live || c.si == null ? '' : 'old'}">${sec(t)}</td>`;
  });
  return cells.join('');
}
function miniSec(c) {
  const segs = [0, 1, 2].map((k) => { const done = c.si != null && k < c.si; const cls = done ? c.sc?.[k] : ''; const cur = c.si === k && c.st === 'run'; return `<i class="${cls ? 'm' + cls : ''}${cur ? ' cur' : ''}"></i>`; });
  return `<span class="pw-ms">${segs.join('')}</span>`;
}
function statusCell(c) {
  if (c.st === 'dnf') return `<span class="pw-tag bad">${esc(c.why ? 'RIT' : 'RIT')}</span>`;
  if (c.st === 'fin') return '<span class="pw-tag end">FIN</span>';
  if (c.st === 'pit') return '<span class="pw-tag warn">PIT</span>';
  const t = [];
  if (c.box) t.push('<span class="pw-tag warn">BOX</span>');
  if (c.pen) t.push(`<span class="pw-tag bad">+${c.pen}s</span>`);
  if (c.iss) t.push(`<span class="pw-tag bad" title="${esc(c.iss)}">!</span>`);
  else if (c.dmg > 0.2) t.push('<span class="pw-tag bad">DAN</span>');
  if (c.drs) t.push('<span class="pw-tag drs">DRS</span>');
  return t.slice(0, 2).join('');
}
function timingRace(s, m) {
  const lead = V.gap !== 'int';
  const fk = s.fast?.k;
  const rows = s.cars.map((c) => {
    const dp = c.g - c.p;
    const g = c.p === 1 ? (c.st === 'fin' ? 'Arrivo' : 'Leader') : c.st === 'dnf' ? '' : gapTxt(lead ? c.gap : c.int ?? c.gap);
    const close = !lead && typeof c.int === 'number' && c.p > 1 && c.st === 'run' && c.int < 1;
    const lc = c.last == null ? '' : fk === c.k && Math.abs((s.fast?.t ?? 0) - c.last) < 0.0015 ? 't-purple' : c.best != null && c.last <= c.best + 0.0005 ? 't-green' : 't-yellow';
    return `<tr class="${c.me ? 'me' : ''} ${c.st} ${c.k === V.focus ? 'focus' : ''}" ${rowStyle(c)} data-a="pw-sel" data-key="${esc(c.k)}">
      <td class="pw-pos p${c.p}">${c.p}</td><td class="pw-dp">${dp > 0 ? `<span class="up">▲${dp}</span>` : dp < 0 ? `<span class="dn">▼${-dp}</span>` : ''}</td>
      <td>${driverCell(c)}</td>
      <td class="pw-gap ${close ? 'close' : ''}">${c.st === 'dnf' ? `<span class="bad tiny">${esc(c.why || 'Ritirato')}</span>` : g}</td>
      <td class="pw-t pw-last ${lc}">${c.last != null ? fmtTime(c.last) : ''}</td><td class="pw-t ${fk === c.k ? 't-purple' : ''}">${c.best != null ? fmtTime(c.best) : ''}</td>
      ${secCells(c, s)}<td class="pw-mscell">${c.st === 'run' ? miniSec(c) : ''}</td>
      <td class="pw-trap ${c.trapB && c.trapB === maxTrap(s) ? 't-purple' : ''}">${c.trap || ''}</td>
      <td class="pw-tyc">${c.st === 'dnf' ? '' : tyre(c.ty, c.age)}</td><td class="pw-wear">${c.st === 'dnf' ? '' : wearBar(c.w)}</td><td class="pw-stops">${c.stops || ''}</td><td class="pw-stat-c">${statusCell(c)}</td></tr>`;
  }).join('');
  return `<div class="pw-timing">
    <div class="pw-tower" data-scroll="tower"><table class="pw-tbl"><thead><tr><th>P</th><th class="pw-dp"></th><th>Pilota</th><th class="pw-gap" data-a="pw-gap" title="Tocca per alternare">${lead ? 'Gap' : 'Interv.'} ⇄</th><th class="pw-t pw-last">Ultimo</th><th class="pw-t">Migliore</th><th class="pw-sec">S1</th><th class="pw-sec">S2</th><th class="pw-sec">S3</th><th class="pw-mscell">Sett.</th><th class="pw-trap">Trap</th><th>Gomme</th><th class="pw-wear">Usura</th><th class="pw-stops">Pit</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <aside class="pw-side" data-scroll="side">${raceSide(s, m)}</aside>
  </div>`;
}
const maxTrap = (s) => Math.max(0, ...s.cars.map((c) => c.trapB || 0));
function wearBar(w) { if (w == null) return ''; const left = Math.max(0, 1 - w); return `<span class="pw-wbar" title="Gomme ${Math.round(left * 100)}%"><i style="width:${(left * 100).toFixed(0)}%;background:${w > 0.8 ? 'var(--bad)' : w > 0.55 ? 'var(--warn)' : 'var(--good)'}"></i></span>`; }
function raceSide(s, m) {
  const bs = s.bs || []; const ideal = bs.every((x) => x != null) ? bs.reduce((a, b) => a + b, 0) : null;
  const fast = s.fast ? `<div class="pw-kv"><span>Giro più veloce</span><b class="t-purple">${fmtTime(s.fast.t)}</b><em>${esc(nm(s.fast.k))}</em></div>` : '';
  const secs = `<div class="pw-bsec">${[0, 1, 2].map((k) => `<div><span>S${k + 1}</span><b class="t-purple">${sec(bs[k]) || '—'}</b><em>${esc(code3(s.bsk?.[k]) || '')}</em></div>`).join('')}<div><span>Ideale</span><b>${ideal ? fmtTime(ideal) : '—'}</b><em>somma</em></div></div>`;
  const trap = (() => { const top = s.cars.filter((c) => c.trapB).sort((a, b) => b.trapB - a.trapB).slice(0, 3); return top.length ? `<div class="pw-kv"><span>Speed trap</span><b>${top[0].trapB} km/h</b><em>${top.map((c) => `${esc(c.k === top[0].k ? code3(c.k) : code3(c.k))} ${c.trapB}`).join(' · ')}</em></div>` : ''; })();
  return `<div class="pw-card"><h4>Riepilogo</h4>${fast}${secs}${trap}</div>
    <div class="pw-card"><h4>Distacchi dal leader</h4>${gapChart(s)}</div>
    <div class="pw-card pw-rc"><h4>Direzione gara</h4><div class="pw-feed" id="pw-feed" data-scroll="feed"></div></div>`;
}
function gapChart(s) {
  const gh = s.gh || []; if (gh.length < 2) return '<div class="tiny muted">Il grafico parte dal secondo giro.</div>';
  const keys = s.cars.filter((c) => c.st !== 'dnf').slice(0, 8).map((c) => c.k);
  for (const c of s.cars) if (c.me && !keys.includes(c.k) && c.st !== 'dnf') keys.push(c.k);
  const W = 320, Hh = 170, L0 = gh[0].l, L1 = gh[gh.length - 1].l;
  let max = 5; for (const r of gh) for (const k of keys) if (r[k] != null) max = Math.max(max, Math.min(r[k], 90));
  const x = (l) => 26 + (l - L0) / Math.max(1, L1 - L0) * (W - 34), y = (g) => 8 + Math.min(g, 90) / max * (Hh - 26);
  const lines = keys.map((k) => { const pts = gh.filter((r) => r[k] != null).map((r) => `${x(r.l).toFixed(1)},${y(r[k]).toFixed(1)}`); const cm = carM(k); return pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${cm?.c1 || '#888'}" stroke-width="${cm?.me ? 2.6 : 1.4}" ${cm?.me ? '' : 'stroke-opacity=".75"'} vector-effect="non-scaling-stroke"/><text x="${(x(gh[gh.length - 1].l) + 2).toFixed(0)}" y="${(y(gh[gh.length - 1][k] ?? 0) + 3).toFixed(0)}" class="pw-chl">${esc(code3(k))}</text>` : ''; }).join('');
  const ticks = [0, max / 2, max].map((g) => `<line x1="24" x2="${W - 6}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" class="pw-grid"/><text x="2" y="${(y(g) + 3).toFixed(0)}" class="pw-axis">${Math.round(g)}s</text>`).join('');
  return `<svg class="pw-gapchart" viewBox="0 0 ${W + 26} ${Hh}" preserveAspectRatio="xMidYMid meet">${ticks}${lines}<text x="26" y="${Hh - 4}" class="pw-axis">G${L0}</text><text x="${W - 30}" y="${Hh - 4}" class="pw-axis">G${L1}</text></svg>`;
}
function paintFeed() {
  const el = document.getElementById('pw-feed'); if (!el) return;
  const list = V.feed.filter((e) => e.type !== 'comm').slice(-40).reverse();
  const h = list.map((e) => `<div class="pw-fe ${esc(e.type)}${e.imp ? ' imp' : ''}">${e.lap ? `<b>G${e.lap}</b>` : e.t != null ? `<b>${mmss(e.t)}</b>` : '<b></b>'}<span>${esc(e.text)}</span></div>`).join('') || '<div class="tiny muted">Nessun messaggio.</div>';
  if (el.dataset.sig !== String(list.length) + (list[0]?.text || '')) { el.dataset.sig = String(list.length) + (list[0]?.text || ''); el.innerHTML = h; }
}
function timingSess(s, m) {
  const cut = s.adv && s.adv < s.cars.length ? s.adv : 0;
  const rows = s.cars.map((c, i) => {
    const timed = c.st === 'run' && c.lapT === 'timed';
    const tag = c.st === 'dnf' ? '<span class="pw-tag bad">KO</span>' : c.st === 'garage' ? (c.pend ? `<span class="pw-tag warn">MECC ${c.work ? mmss(c.work) : ''}</span>` : '<span class="pw-tag">BOX</span>') : c.lapT === 'out' ? '<span class="pw-tag info">OUT</span>' : c.lapT === 'in' ? '<span class="pw-tag">IN</span>' : c.lapT === 'cool' ? '<span class="pw-tag">LENTO</span>' : '<span class="pw-tag good">LANCIATO</span>';
    const cells = [0, 1, 2].map((k) => { const show = timed ? (k < c.si ? c.s?.[k] : null) : c.s?.[k]; const cls = timed ? (k < c.si ? c.sc?.[k] : '') : c.sc?.[k]; return `<td class="pw-sec ${cls ? 't-' + ({ p: 'purple', g: 'green', y: 'yellow' }[cls] || '') : ''} ${timed ? '' : 'old'}">${sec(show)}</td>`; }).join('');
    const ms = timed ? `<span class="pw-ms">${[0, 1, 2].map((k) => `<i class="${k < c.si && c.sc?.[k] ? 'm' + c.sc[k] : ''}${k === c.si ? ' cur' : ''}"></i>`).join('')}</span>` : '';
    return `<tr class="${c.me ? 'me' : ''} ${cut && i >= cut ? 'elim' : ''} ${cut && i === cut ? 'cut' : ''} ${c.st !== 'run' ? 'inbox' : ''} ${c.k === V.focus ? 'focus' : ''}" ${rowStyle(c)} data-a="pw-sel" data-key="${esc(c.k)}">
      <td class="pw-pos p${i + 1}">${i + 1}</td><td>${driverCell(c)}</td>
      <td class="pw-t ${s.fast?.k === c.k ? 't-purple' : ''}">${c.best != null ? fmtTime(c.best) : '<span class="muted">—</span>'}</td><td class="pw-gap">${c.gap != null ? gapTxt(c.gap) : ''}</td>
      ${cells}<td class="pw-mscell">${ms}</td>
      <td class="pw-t pw-last ${c.lcls === 'p' ? 't-purple' : c.lcls === 'g' ? 't-green' : c.lcls === 'x' ? 'bad' : ''}">${c.last != null ? fmtTime(c.last) : ''}</td>
      <td class="pw-tyc">${tyre(c.ty, c.age)}</td><td class="pw-stops">${c.laps || 0}</td><td class="pw-stat-c">${tag}</td></tr>`;
  }).join('');
  const bs = s.bs || [];
  return `<div class="pw-timing">
    <div class="pw-tower" data-scroll="tower"><table class="pw-tbl"><thead><tr><th>P</th><th>Pilota</th><th class="pw-t">Migliore</th><th class="pw-gap">Gap</th><th class="pw-sec">S1</th><th class="pw-sec">S2</th><th class="pw-sec">S3</th><th class="pw-mscell">Sett.</th><th class="pw-t pw-last">Ultimo</th><th>Gomme</th><th class="pw-stops">Giri</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ${cut ? `<div class="tiny muted pw-cutnote"><span class="pw-cutkey"></span>Zona eliminazione dalla P${cut + 1}</div>` : ''}</div>
    <aside class="pw-side" data-scroll="side"><div class="pw-card"><h4>Riepilogo</h4>${s.fast ? `<div class="pw-kv"><span>Miglior tempo</span><b class="t-purple">${fmtTime(s.fast.t)}</b><em>${esc(nm(s.fast.k))}</em></div>` : ''}<div class="pw-bsec">${[0, 1, 2].map((k) => `<div><span>S${k + 1}</span><b class="t-purple">${sec(bs[k]) || '—'}</b></div>`).join('')}<div><span>Ideale</span><b>${bs.every((x) => x != null) ? fmtTime(bs[0] + bs[1] + bs[2]) : '—'}</b></div></div>
      <div class="pw-kv"><span>In pista</span><b>${s.cars.filter((c) => c.st === 'run').length}/${s.cars.length}</b><em>gommatura ${Math.round((s.rubber || 0) * 100)}%</em></div></div>
      <div class="pw-card pw-rc"><h4>Direzione gara</h4><div class="pw-feed" id="pw-feed" data-scroll="feed"></div></div></aside>
  </div>`;
}
function timingRally(s, m) {
  const rows = s.cars.map((c) => `<tr class="${c.me ? 'me' : ''} ${c.st}" ${rowStyle(c)}>
    <td class="pw-pos p${c.p}">${c.p}</td><td>${driverCell(c)}</td>
    <td class="pw-t">${c.st === 'fin' ? fmtTime(c.time) : c.st === 'dnf' ? '<span class="bad tiny">Ritirato</span>' : `<span class="muted">${mmss(c.el)}</span>`}</td><td class="pw-gap">${c.p === 1 && c.st === 'fin' ? 'Migliore' : c.gap != null ? gapTxt(c.gap) : ''}</td>
    ${[0, 1].map((k) => `<td class="pw-sec">${c.splits?.[k] != null ? fmtTime(c.splits[k]) : ''}</td>`).join('')}
    <td class="pw-rprog"><span class="pw-wbar"><i style="width:${Math.min(100, (c.d || 0) * 100).toFixed(0)}%;background:var(--tc)"></i></span></td>
    <td class="pw-tyc">${tyre(c.ty)}</td><td class="pw-stat-c">${c.dmg > 0.15 ? '<span class="pw-tag bad">DAN</span>' : ''}</td></tr>`).join('');
  return `<div class="pw-timing"><div class="pw-tower" data-scroll="tower"><table class="pw-tbl"><thead><tr><th>P</th><th>Equipaggio</th><th class="pw-t">Tempo PS</th><th class="pw-gap">Distacco</th><th class="pw-sec">Int. 1</th><th class="pw-sec">Int. 2</th><th class="pw-rprog">Avanzamento</th><th>Gomme</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <aside class="pw-side" data-scroll="side"><div class="pw-card pw-rc"><h4>Cronaca</h4><div class="pw-feed" id="pw-feed" data-scroll="feed"></div></div></aside></div>`;
}

// ---------------- STRATEGY ----------------
function seg(list, cur, c, k) { return `<div class="pw-seg">${list.map(([v, n]) => `<button class="${cur === v ? 'on ' + v : ''}" data-a="pw-cmd" data-cmd="${c}" data-key="${esc(k)}" data-m="${v}">${n}</button>`).join('')}</div>`; }
function stintBar(c, s) {
  const L = s.laps || 1; const done = Math.min(L, c.lap || 0);
  const past = (s.stints?.[c.k] || '');
  const segs = []; let i = 0;
  while (i < past.length) { let j = i; while (j < past.length && past[j] === past[i]) j++; segs.push({ c: past[i], l: j - i, past: 1 }); i = j; }
  for (const x of c.rest || []) segs.push({ c: COMPOUNDS[x.c]?.short || '?', l: x.l, plan: 1, id: x.c });
  const col = (sh) => Object.values(COMPOUNDS).find((x) => x.short === sh)?.color || '#888';
  const tot = segs.reduce((a, b) => a + b.l, 0) || L;
  return `<div class="pw-stint">${segs.map((g) => `<i class="${g.plan ? 'plan' : ''}" style="flex:${g.l};--sc:${col(g.c)}" title="${g.plan ? 'Piano: ' : ''}${g.l} giri">${g.l >= 3 ? g.c : ''}</i>`).join('')}<b style="left:${Math.min(100, done / Math.max(L, tot) * 100).toFixed(1)}%"></b></div><div class="row between tiny muted"><span>Giro 1</span><span>Giro ${L}</span></div>`;
}
function stratRace(s, m) {
  const mine = myCars(); const curLap = s.lap || 1;
  const cards = mine.map((c) => {
    const cm = carM(c.k); const run = c.st === 'run' || c.st === 'pit';
    const pv = c.pv; const fc = c.fc;
    const comps = (m.compounds || []).map((cp) => `<button class="pw-cp ${c.pitSel === cp ? 'on' : ''}" style="--tc:${COMPOUNDS[cp]?.color}" data-a="pw-cmd" data-cmd="pitsel" data-key="${esc(c.k)}" data-c="${cp}" title="${esc(COMPOUNDS[cp]?.name || cp)}">${COMPOUNDS[cp]?.short || cp}</button>`).join('');
    const pit = !run ? '' : c.pitReq ? `<button class="btn danger pw-big" data-a="pw-cmd" data-cmd="pit" data-key="${esc(c.k)}" data-cancel="1">${icon('x')} Annulla box · giro ${c.pitReq.lap} (${c.pitReq.c ? COMPOUNDS[c.pitReq.c]?.short : 'benzina'})</button>`
      : `<div class="pw-pitrow"><button class="btn team pw-big" style="--team:${cm?.c1}" data-a="pw-cmd" data-cmd="pit" data-key="${esc(c.k)}" data-when="this">${icon('pit')} BOX fine giro ${c.pi?.this ?? ''}</button><button class="btn pw-big" data-a="pw-cmd" data-cmd="pit" data-key="${esc(c.k)}" data-when="next">Giro ${c.pi?.next ?? ''}</button></div>`;
    const uc = pv?.uc; const oc = c.oc;
    return `<section class="pw-card pw-car" style="--tc:${cm?.c1};--tc2:${cm?.c2}">
      <div class="pw-carh"><span class="pw-pos big p${c.p}">P${c.p}</span><div class="grow">${driverCell(c)}</div>${tyre(c.ty, c.age)}</div>
      <div class="pw-kpis">
        <div><span>Gomme</span><b>${c.w != null ? Math.max(0, Math.round((1 - c.w) * 100)) : '—'}%</b>${wearBar(c.w)}</div>
        <div><span>Durata stimata</span><b>${fc ? `${fc.lo}-${fc.hi}` : '—'}</b><em>${fc ? (fc.flag ? 'arriva alla bandiera' : 'giri') : ''}</em></div>
        <div><span>Soste</span><b>${c.stops}</b><em>${c.plan?.length ? `piano ${c.plan.length - 1}` : ''}</em></div>
        <div><span>Benzina</span><b class="${c.fuel != null && c.fuel < 0 ? 'bad' : ''}">${c.fuel == null ? '—' : (c.fuel >= 0 ? '+' : '') + c.fuel.toFixed(1)}</b><em>giri di margine</em></div>
      </div>
      <h5>Stint e piano</h5>${stintBar(c, s)}
      ${run ? `<h5>Prossima sosta</h5><div class="pw-comps">${comps}</div>${pit}
      <div class="pw-pv">${c.pi?.passed ? '<div class="warn">Ingresso box già superato in questo giro.</div>' : c.pi ? `<div>Ingresso box tra ~${Math.round(c.pi.toEntry || 0)}s</div>` : ''}
        ${pv ? `<div>Rientro stimato <b>P${pv.pos}</b>${pv.ahead ? ` · ${pv.ahead.gap}s dietro ${esc(lastName(nm(pv.ahead.k)))} ${pv.traffic ? '<span class="warn">(traffico)</span>' : '<span class="good">(aria libera)</span>'}` : ' · in testa'} · perdita ${pv.loss}s</div>` : ''}
        ${pv?.stack > 0.3 ? `<div class="warn">Doppia sosta: +${pv.stack}s in coda dietro il compagno</div>` : ''}</div>
      <div class="pw-deltas">
        <div class="${uc ? (uc.ok ? 'good' : 'bad') : ''}"><span>Undercut su ${uc ? esc(code3(uc.k)) : '—'}</span><b>${uc ? `${uc.gain >= 0 ? '+' : ''}${uc.gain}s` : '—'}</b><em>${uc ? `ne servono ${uc.need} · ${uc.ok ? 'possibile' : 'difficile'}` : 'nessuna auto a tiro'}</em></div>
        <div class="${oc?.ahead ? (oc.ahead.gain > 0 ? 'good' : 'bad') : ''}"><span>Overcut su ${oc?.ahead ? esc(code3(oc.ahead.k)) : '—'}</span><b>${oc?.ahead ? `${oc.ahead.gain >= 0 ? '+' : ''}${oc.ahead.gain}s` : '—'}</b><em>restando fuori 2 giri</em></div>
        <div class="${oc?.behind ? (oc.behind.gain > 0 ? 'bad' : 'good') : ''}"><span>Minaccia da ${oc?.behind ? esc(code3(oc.behind.k)) : '—'}</span><b>${oc?.behind ? `${oc.behind.gain >= 0 ? '+' : ''}${oc.behind.gain}s` : '—'}</b><em>se si ferma lui</em></div>
      </div>
      ${c.adv?.text ? `<div class="pw-adv ${c.adv.urgent ? 'urgent' : ''}">${icon('radio', 'ico')} ${esc(c.adv.text)}</div>` : ''}
      ${c.riv?.length ? `<h5>Avversari vicini</h5><table class="pw-mini-t"><tbody>${c.riv.map((r) => `<tr><td>P${r.p}</td><td><b>${esc(code3(r.k))}</b></td><td>${r.gap > 0 ? '+' : ''}${r.gap}s</td><td>${tyre(r.ty, r.age)}</td><td>${r.w != null ? Math.max(0, Math.round((1 - r.w) * 100)) + '%' : ''}</td><td>${r.inL != null ? `box tra ~${r.inL}` : 'fino alla fine?'}</td><td class="${r.pace != null ? (r.pace < 0 ? 'bad' : 'good') : ''}">${r.pace != null ? `${r.pace > 0 ? '+' : ''}${r.pace.toFixed(2)}` : ''}</td></tr>`).join('')}</tbody></table>` : ''}` : `<div class="muted mt8">${c.st === 'dnf' ? `Ritirato: ${esc(c.why || '')}` : 'Al traguardo'}</div>`}
    </section>`;
  }).join('');
  const wx = s.wx || [];
  const radar = `<section class="pw-card"><h4>${icon('rain', 'ico')} Radar meteo</h4><div class="pw-radar">${wx.map((r, i) => `<i style="height:${Math.max(3, r * 100)}%;background:${r > 0.6 ? '#1e90ff' : r > 0.25 ? '#28c840' : r > 0.05 ? '#9ad' : 'rgba(255,255,255,.18)'};opacity:${i < curLap - 1 ? 0.35 : 1}" class="${i === curLap - 1 ? 'now' : ''}" title="Giro ${i + 1}: ${Math.round(r * 100)}%"></i>`).join('')}</div><div class="row between tiny muted"><span>Giro 1</span><span>${wxHead(wx, curLap, s.rain)}</span><span>Giro ${s.laps}</span></div></section>`;
  const all = `<section class="pw-card"><h4>Stint di tutte le auto</h4><div class="pw-allst">${s.cars.map((c) => { const str = s.stints?.[c.k] || ''; const segs = []; let i = 0; while (i < str.length) { let j = i; while (j < str.length && str[j] === str[i]) j++; segs.push([str[i], j - i]); i = j; } const col = (sh) => Object.values(COMPOUNDS).find((x) => x.short === sh)?.color || '#888'; return `<div class="pw-asrow ${c.me ? 'me' : ''}"><b>${esc(code3(c.k))}</b><div class="pw-asbar">${segs.map(([t, l]) => `<i style="width:${(l / Math.max(1, s.laps) * 100).toFixed(2)}%;--sc:${col(t)}"></i>`).join('')}${c.st === 'run' ? `<i class="cur" style="width:0;--sc:${COMPOUNDS[c.ty]?.color || '#888'}"></i>` : ''}</div><span>${tyre(c.ty, c.age)}</span></div>`; }).join('')}</div></section>`;
  const orders = mine.length > 1 && mine.every((c) => c.st === 'run') ? `<section class="pw-card"><h4>Ordini di scuderia</h4><div class="pw-seg">${[['free', 'Libera lotta'], ['hold', 'Mantenere'], ['swap', 'Scambio']].map(([k, n]) => `<button class="${(s.orders || 'free') === k ? 'on' : ''}" data-a="pw-cmd" data-cmd="orders" data-o="${k}">${n}</button>`).join('')}</div></section>` : '';
  const radio = (s.radio || []).map((r) => `<section class="pw-card pw-radio"><h4>${icon('radio', 'ico')} Radio · ${esc(nm(r.k))}</h4><p>${esc(r.text)}</p><div class="row gap6"><button class="btn sm good grow" data-a="pw-cmd" data-cmd="radio" data-id="${r.id}" data-y="1">Sì</button><button class="btn sm grow" data-a="pw-cmd" data-cmd="radio" data-id="${r.id}" data-y="0">No</button></div></section>`).join('');
  return `<div class="pw-strat" data-scroll="strat"><div class="pw-cols">${radio}${cards || '<div class="pw-empty">Nessuna tua auto in gara</div>'}</div><div class="pw-cols side">${orders}${radar}${all}</div></div>`;
}
function wxHead(plan, curLap, now) {
  const L = plan.length; const nextRain = plan.findIndex((r, i) => i >= curLap && r > 0.25); const dry = now > 0.25 ? plan.findIndex((r, i) => i >= curLap && r < 0.1) : -1;
  if (!L) return '';
  return now > 0.25 ? (dry > 0 ? `Pioggia ora · asciuga dal giro ${dry + 1}` : 'Pioggia fino alla fine') : nextRain > 0 ? `Pioggia tra ${nextRain + 1 - curLap} giri` : 'Asciutto fino alla bandiera';
}
function stratSess(s, m) {
  const mine = myCars();
  const cards = mine.map((c) => {
    const cm = carM(c.k);
    const state = c.st === 'dnf' ? '<span class="bad">Incidente</span>' : c.st === 'garage' ? (c.pend ? `<span class="warn">Meccanici al lavoro · ${mmss(c.work)}</span>` : 'Nel box') : c.lapT === 'timed' ? '<span class="good">Giro lanciato</span>' : c.lapT === 'out' ? 'Giro di uscita' : c.lapT === 'in' ? 'Rientro ai box' : 'Giro lento';
    const act = c.st === 'garage' && !c.pend ? `<button class="btn primary pw-big" data-a="pw-cmd" data-cmd="ss-go" data-key="${esc(c.k)}">${icon('play')} Esci dal box</button>`
      : c.st === 'run' ? `<div class="pw-pitrow">${c.lapT === 'timed' ? `<button class="btn pw-big" data-a="pw-cmd" data-cmd="ss-abort" data-key="${esc(c.k)}">${icon('x')} Abortisci il giro</button>` : ''}<button class="btn team pw-big" style="--team:${cm?.c1}" data-a="pw-cmd" data-cmd="ss-callin" data-key="${esc(c.k)}" ${c.box ? 'disabled' : ''}>${icon('pit')} ${c.box ? 'Rientro chiamato' : 'Rientra ai box'}</button></div>` : '';
    const h = c.hist || [];
    return `<section class="pw-card pw-car" style="--tc:${cm?.c1};--tc2:${cm?.c2}">
      <div class="pw-carh"><span class="pw-pos big p${c.p}">P${c.p}</span><div class="grow">${driverCell(c)}</div>${tyre(c.ty, c.age)}</div>
      <div class="pw-kpis"><div><span>Stato</span><b class="small">${state}</b></div><div><span>Migliore</span><b>${c.best != null ? fmtTime(c.best) : '—'}</b><em>${c.gap != null ? gapTxt(c.gap) : ''}</em></div><div><span>Giri</span><b>${c.laps || 0}</b></div><div><span>Benzina</span><b>${c.fuel != null ? c.fuel : '—'}</b><em>giri</em></div></div>
      ${act}
      ${h.length ? `<h5>Tempi</h5><div class="pw-laps">${h.slice(-10).reverse().map(([t, ty, ok]) => `<span class="${ok ? '' : 'bad'}">${tyre(ty)} ${fmtTime(t)}</span>`).join('')}</div>` : ''}
      <div class="tiny muted mt8">Programma, gomme e assetto si scelgono sul computer: da qui mandi in pista l’auto con il programma impostato.</div>
    </section>`;
  }).join('');
  return `<div class="pw-strat" data-scroll="strat"><div class="pw-cols">${cards || '<div class="pw-empty">Nessuna tua auto</div>'}</div><div class="pw-cols side"><section class="pw-card"><h4>Sessione</h4><div class="pw-kv"><span>Tempo rimasto</span><b>${mmss(s.clock)}</b></div><div class="pw-kv"><span>Pista</span><b>${Math.round((s.rubber || 0) * 100)}%</b><em>gommatura</em></div><div class="pw-kv"><span>Asfalto</span><b>${s.temp}°C</b><em>${(s.rain || 0) > 0.05 ? 'bagnato' : 'asciutto'}</em></div>${s.adv ? `<div class="pw-kv"><span>Passano il turno</span><b>${s.adv}</b><em>su ${s.cars.length}</em></div>` : ''}</section></div></div>`;
}
function stratRally(s) {
  const mine = myCars();
  return `<div class="pw-strat" data-scroll="strat"><div class="pw-cols">${mine.map((c) => `<section class="pw-card pw-car" ${rowStyle(c)}><div class="pw-carh"><span class="pw-pos big">P${c.p}</span><div class="grow">${driverCell(c)}</div>${tyre(c.ty)}</div>
    <div class="pw-kpis"><div><span>${c.st === 'fin' ? 'Tempo' : 'In prova'}</span><b>${c.st === 'fin' ? fmtTime(c.time) : mmss(c.el)}</b></div><div><span>Avanzamento</span><b>${Math.round((c.d || 0) * 100)}%</b></div><div><span>Danni</span><b class="${c.dmg > 0.2 ? 'bad' : ''}">${Math.round((c.dmg || 0) * 100)}%</b></div><div><span>Ordine di partenza</span><b>${c.road}</b></div></div>
    <h5>Intertempi</h5><div class="pw-laps">${(c.splits || []).map((t, i) => `<span>Int. ${i + 1} ${fmtTime(t)}</span>`).join('') || '<span class="muted">—</span>'}</div></section>`).join('') || '<div class="pw-empty">Nessun tuo equipaggio in prova</div>'}</div>
    <div class="pw-cols side"><section class="pw-card"><h4>Prova speciale</h4><div class="pw-kv"><span>Prova</span><b>${s.stage}/${s.stages}</b><em>${(+s.km || 0).toFixed(1)} km</em></div><div class="tiny muted mt8">Nel rally la telemetria e la mappa non sono disponibili: rispondi qui alle chiamate del copilota.</div></section></div></div>`;
}

// ---------------- TELEMETRY ----------------
function teleHTML(s, m) {
  const mine = myCars();
  const sel = s.cars.find((c) => c.k === V.sel) || mine[0] || s.cars[0];
  if (!sel) return '<div class="pw-empty">Nessuna auto</div>';
  const cm = carM(sel.k);
  const pick = `<div class="pw-pick">${mine.map((c) => `<button class="${c.k === sel.k ? 'on' : ''}" style="--tc:${carM(c.k)?.c1}" data-a="pw-sel" data-key="${esc(c.k)}">${esc(lastName(nm(c.k)))}</button>`).join('')}${!sel.me ? `<button class="on" style="--tc:${cm?.c1}">${esc(lastName(cm?.name))}</button>` : ''}<span class="tiny muted">Tocca un pilota nel Timing per vederne un altro</span></div>`;
  const bs = s.bs || [];
  const last = m.kind === 'race' ? sel.ls : sel.s; const pb = sel.pb || [];
  const secRows = [0, 1, 2].map((k) => { const l = last?.[k], p = pb[k], b = bs[k]; const d = l != null && b != null ? l - b : null; const w = d == null ? 0 : Math.min(100, Math.abs(d) / 1.2 * 100); return `<div class="pw-svb"><span>S${k + 1}</span><b class="${l != null && b != null && Math.abs(l - b) < 0.0005 ? 't-purple' : l != null && p != null && Math.abs(l - p) < 0.0005 ? 't-green' : l != null ? 't-yellow' : ''}">${sec(l) || '—'}</b><em>PB ${sec(p) || '—'}</em><div class="pw-dbar2"><i class="${d != null && d > 0 ? 'slow' : 'fast'}" style="width:${w.toFixed(0)}%"></i></div><small>${d == null ? '' : `${d > 0 ? '+' : ''}${d.toFixed(3)}`}</small></div>`; }).join('');
  const win = m.tyreWin?.[sel.ty]; const temp = sel.temp;
  const tgauge = temp != null && win ? (() => { const lo = win - 25, hi = win + 20; const f = Math.max(0, Math.min(1, (temp - lo) / (hi - lo))); const okLo = (win - 8 - lo) / (hi - lo), okHi = (win + 8 - lo) / (hi - lo); const cls = Math.abs(temp - win) <= 8 ? 'good' : temp < win ? 'info' : 'bad'; return `<div class="pw-gauge"><div class="pw-gtrack"><i class="win" style="left:${(okLo * 100).toFixed(0)}%;width:${((okHi - okLo) * 100).toFixed(0)}%"></i><b style="left:${(f * 100).toFixed(1)}%"></b></div><div class="row between tiny"><span class="muted">${lo}°</span><span class="${cls}">${temp}°C · finestra ${win - 8}-${win + 8}°</span><span class="muted">${hi}°</span></div></div>`; })() : '<div class="tiny muted">Temperatura non disponibile</div>';
  const hist = sel.hist || [];
  const ctrl = sel.me && m.kind === 'race' && sel.st === 'run' ? `<section class="pw-card"><h4>${icon('sliders', 'ico')} Comandi</h4>
      <h5>Ritmo</h5>${seg(MODES, sel.mode, 'mode', sel.k)}
      <h5>Energia ERS · ${sel.ers ?? 0}%</h5><div class="pw-wbar ers"><i style="width:${sel.ers ?? 0}%"></i></div>${seg(ERS, sel.em, 'ers', sel.k)}
      <h5>Mappa motore</h5>${seg(ENG, sel.eng, 'eng', sel.k)}
      ${sel.fuel != null && sel.fuel < 0.3 ? `<button class="btn sm mt8 ${sel.save ? 'active' : ''}" data-a="pw-cmd" data-cmd="rs-lift" data-key="${esc(sel.k)}">${icon('fuel', 'ico')} Lift &amp; coast ${sel.save ? 'ON' : 'OFF'}</button>` : ''}
      <div class="row between mt8"><span class="small muted">Strategia automatica dell’ingegnere</span><button class="btn sm ${sel.auto ? 'active' : ''}" data-a="pw-cmd" data-cmd="auto" data-key="${esc(sel.k)}">${sel.auto ? 'ON' : 'OFF'}</button></div>
      ${sel.rel != null && sel.rel > 0.05 ? `<div class="small mt8 ${sel.rel > 0.15 ? 'bad' : 'warn'}">Rischio guasto fino al traguardo ${Math.round(sel.rel * 100)}%</div>` : ''}</section>` : '';
  return `<div class="pw-tele" data-scroll="tele">${pick}
    <div class="pw-tgrid">
      <section class="pw-card pw-trace-card"><h4>Velocità sul giro · ${esc(cm?.name || '')}</h4><div class="pw-trace" id="pw-trace"></div><div class="row gap12 tiny muted"><span><i class="pw-lg cur"></i>Giro in corso</span><span><i class="pw-lg ref"></i>Riferimento miglior giro</span><span id="pw-tspeed"></span></div></section>
      <section class="pw-card"><h4>Settori vs migliore assoluto</h4>${secRows}<div class="pw-kv mt8"><span>Ultimo giro</span><b>${sel.last != null ? fmtTime(sel.last) : '—'}</b><em>migliore ${sel.best != null ? fmtTime(sel.best) : '—'}</em></div>${sel.trap ? `<div class="pw-kv"><span>Speed trap</span><b>${sel.trap} km/h</b><em>max ${sel.trapB}</em></div>` : ''}</section>
      <section class="pw-card"><h4>Gomme</h4><div class="row gap8">${tyre(sel.ty, sel.age)}<b>${COMPOUNDS[sel.ty]?.name || ''}</b><span class="muted small">${sel.age != null ? `${Math.floor(sel.age)} giri` : ''}</span></div>
        <h5>Temperatura</h5>${tgauge}<h5>Usura</h5><div class="pw-wear-big">${wearBar(sel.w)}<b>${sel.w != null ? Math.max(0, Math.round((1 - sel.w) * 100)) + '%' : '—'}</b></div>${sel.fc ? `<div class="small muted mt8">Durata stimata: ${sel.fc.lo}-${sel.fc.hi} giri</div>` : ''}</section>
      ${ctrl}
      <section class="pw-card pw-wide"><h4>Tempi sul giro</h4>${lapChart(hist, m.kind)}</section>
    </div></div>`;
}
function lapChart(hist, kind) {
  const rows = kind === 'race' ? hist.filter((h) => !h[6]).map((h) => ({ l: h[0], t: h[1], ty: h[2] })) : hist.map((h, i) => ({ l: i + 1, t: h[0], ty: h[1], bad: !h[2] }));
  if (rows.length < 2) return '<div class="tiny muted">Servono almeno due giri.</div>';
  const ts = rows.map((r) => r.t).filter((t) => t > 0); const min = Math.min(...ts), max = Math.min(Math.max(...ts), min * 1.08);
  const W = 600, Hh = 130; const bw = W / rows.length;
  const col = (sh) => Object.values(COMPOUNDS).find((x) => x.short === sh)?.color || '#888';
  return `<svg class="pw-lapchart" viewBox="0 0 ${W} ${Hh + 16}" preserveAspectRatio="none">${rows.map((r, i) => { const h = 12 + (1 - Math.min(1, (r.t - min) / Math.max(0.01, max - min))) * (Hh - 12); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(Hh - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${col(r.ty)}" opacity="${r.bad ? 0.3 : r.t === min ? 1 : 0.7}"><title>Giro ${r.l}: ${fmtTime(r.t)}</title></rect>`; }).join('')}<text x="2" y="${Hh + 13}" class="pw-axis">Migliore ${fmtTime(min)}</text></svg>`;
}
// speed trace of the lap in progress, from the car's position and lap pace on the circuit's speed profile
function sampleTrace() {
  const s = V.s, m = V.meta; if (!s?.live || !m?.track?.cid) return;
  const c = s.cars.find((x) => x.k === V.sel); if (!c || c.st !== 'run') return;
  const d = V.disp[c.k] ?? c.d; const lap = Math.floor(d); const f = d - lap;
  let tr = V.trace[c.k];
  if (!tr || tr.lap !== lap) tr = V.trace[c.k] = { lap, pts: [] };
  let v = 0; try { v = speedAtTimeFrac(m.track.cat, m.track.cid, f, c.lt || m.track.lap, m.track.lap); } catch { /* */ }
  if (!tr.pts.length || f > tr.pts[tr.pts.length - 1][0]) tr.pts.push([f, v]);
  drawTrace();
}
function drawTrace() {
  const el = document.getElementById('pw-trace'); const s = V.s, m = V.meta; if (!el || !s?.live || !m?.track?.cid) { if (el) el.innerHTML = '<div class="tiny muted">Disponibile sui circuiti.</div>'; return; }
  const c = s.cars.find((x) => x.k === V.sel); if (!c) return;
  const W = 600, Hh = 170;
  const refT = c.best || c.lt || m.track.lap;
  if (!V._ref || V._ref.k !== `${m.sid}|${refT}`) { const pts = []; for (let i = 0; i <= 160; i++) { const f = i / 160; let v = 0; try { v = speedAtTimeFrac(m.track.cat, m.track.cid, Math.min(0.9999, f), refT, m.track.lap); } catch { /* */ } pts.push([f, v]); } V._ref = { k: `${m.sid}|${refT}`, pts }; }
  const ref = V._ref.pts; const vmax = Math.max(340, ...ref.map((p) => p[1])) * 1.05;
  const X = (f) => (f * W).toFixed(1), Y = (v) => (Hh - v / vmax * (Hh - 8)).toFixed(1);
  const tr = V.trace[c.k]?.pts || [];
  const secs = (m.sectors || []).length ? [m.sectors[0], m.sectors[0] + m.sectors[1]] : [1 / 3, 2 / 3];
  const lastV = tr.length ? Math.round(tr[tr.length - 1][1]) : null;
  const sp = document.getElementById('pw-tspeed'); if (sp) sp.textContent = lastV != null ? `${lastV} km/h` : '';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">${[100, 200, 300].map((v) => `<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" class="pw-grid"/><text x="3" y="${(+Y(v) - 2).toFixed(0)}" class="pw-axis">${v}</text>`).join('')}${secs.map((f, i) => `<line x1="${X(f)}" x2="${X(f)}" y1="0" y2="${Hh}" class="pw-secl"/><text x="${(+X(f) + 3).toFixed(0)}" y="11" class="pw-axis">S${i + 2}</text>`).join('')}
    <polyline points="${ref.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" class="pw-ref" vector-effect="non-scaling-stroke"/>
    ${tr.length > 1 ? `<polyline points="${tr.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" class="pw-cur" vector-effect="non-scaling-stroke"/>` : ''}</svg>`;
}

// ---------------- MAP + LIVE 3D ----------------
function viewHTML() {
  const live = V.tab === 'live';
  return `<div class="pw-view ${live ? 'live' : 'map'}"><div class="pw-stage" id="pw-stage"><canvas id="pw-cv"></canvas>${live ? '<div class="pw-camb" id="pw-camb"></div><div class="pw-hud" id="pw-hud"></div>' : ''}</div><aside class="pw-mini" id="pw-mini" data-scroll="mini"></aside></div>`;
}
function mountView() {
  const m = V.meta; const st = document.getElementById('pw-stage');
  if (!m?.track?.cid) { st.innerHTML = '<div class="pw-empty">La mappa e la diretta sono disponibili sui circuiti (non nelle prove speciali dei rally).</div>'; return; }
  const path = circuitPath(m.track.cid);
  const live3d = V.tab === 'live' && !V.mode2d && can3D();
  if (!live3d) V.map = new TrackView(document.getElementById('pw-cv'), path, { pad: 34, padTop: V.tab === 'live' ? 56 : 30, glow: 'rgba(255,255,255,0.12)', sectors: true, labels: false });
  if (V.tab === 'live') { paintLiveBtns(); if (live3d) start3D(); }
}
async function start3D() {
  const m = V.meta; const host = document.getElementById('pw-stage'); if (!host) return;
  const [{ Race3D, webglAvailable }, { load3D }] = await Promise.all([import('../ui/race3d.js'), import('./loader3d.js')]);
  if (!webglAvailable() || V.tab !== 'live' || !host.isConnected) { V.mode2d = true; V.bodyKey = ''; paintBody(true); return; }
  const sid = m.sid;
  V.load = load3D(host, () => {
    if (V.tab !== 'live' || V.meta?.sid !== sid || !host.isConnected) return null;
    const div = document.createElement('div'); div.className = 'r3d'; host.prepend(div);
    try {
      const firstTyre = (k) => COMPOUNDS[V.s?.cars?.find((c) => c.k === k)?.ty]?.color || '#ffd400';
      V.r3d = new Race3D(div, { cid: m.track.cid, street: m.track.street || 0, night: !!m.track.night, category: m.track.cat,
        cars: m.cars.map((c) => ({ key: c.k, livery: { primary: c.c1, secondary: c.c2, accent: c.c3 || '#111111' }, helmet: c.helmet, tyreColor: firstTyre(c.k), isPlayer: c.me, number: c.n, sponsor: c.sponsor })) });
      V.r3d.director = V.cam === 'auto'; V.r3d.camMode = V.cam === 'auto' ? 'tv' : V.cam; V.r3d.focusKey = V.focus;
      return V.r3d;
    } catch (e) { console.warn('3D non disponibile', e); div.remove(); V.r3d = null; return null; }
  }, { title: m.track.name, sub: 'Diretta dal muretto box', svg: trackSVG(circuitPath(m.track.cid), { w: 260, h: 150, glow: null, color: '#fff', width: 3, start: false }), skip: 'pw-2d', alive: () => V.tab === 'live' && host.isConnected,
    onReady: (r) => { if (!r && V.tab === 'live' && !V.r3d) { V.mode2d = true; V.bodyKey = ''; paintBody(true); } } });
}
function stop3D() { V.load?.cancel?.(); V.load = null; try { V.r3d?.destroy(); } catch { /* */ } V.r3d = null; }
function paintLiveBtns() {
  const el = document.getElementById('pw-camb'); if (!el) return;
  if (!can3D()) { el.innerHTML = `<span class="pw-note">${icon('map', 'ico')} Diretta in 2D: la vista 3D non è disponibile o è disattivata (qualità grafica Bassa) su questo dispositivo</span>`; return; }
  el.innerHTML = `<button class="btn sm ${V.mode2d ? 'active' : ''}" data-a="pw-2d">${icon('map', 'ico')} ${V.mode2d ? 'Torna al 3D' : 'Mappa 2D'}</button>${V.mode2d ? '' : CAMS.map(([k, n]) => `<button class="btn sm ${V.cam === k ? 'active' : ''}" data-a="pw-cam" data-c="${k}">${n}</button>`).join('')}`;
}
function drawMap() {
  const v = V.map, s = V.s, m = V.meta; if (!v || !s?.live || !m?.track?.cid) return;
  const style = m.track.cat === 'endurance' ? 'endurance' : 'formula';
  v.frame(() => {
    let pi = 0;
    const cars = s.cars.filter((c) => c.st !== 'dnf').sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0) || (a.k === V.focus ? 1 : 0) - (b.k === V.focus ? 1 : 0));
    for (const c of cars) {
      const cm = carM(c.k); if (!cm) continue;
      let q;
      const garage = c.st === 'garage' || c.st === 'pit';
      if (garage && v.pitPos) q = v.pitPos(pi++);
      else { let d = V.disp[c.k] ?? c.d ?? 0; d = d - Math.floor(d); try { q = v.pointAt(arcFrac(m.track.cat, m.track.cid, d, m.track.lap)); } catch { continue; } }
      const lab = c.me || c.k === V.focus || c.p <= 3;
      v.drawCar(q.x, q.y, q.ang, cm.c1, cm.c2, { style, glow: c.me ? cm.c1 : c.k === V.focus ? '#ffffff' : null, outline: c.me || c.k === V.focus, label: lab ? `${c.p} ${cm.code}` : null, num: lab ? null : c.p, dot: !lab, labelBg: c.me ? cm.c1 : 'rgba(0,0,0,0.75)', len: garage ? 8 : undefined });
    }
  }, { rain: s.rain || 0, night: m.track.night ? 1 : 0 });
}
function update3D(dt) {
  const r = V.r3d, s = V.s, m = V.meta; if (!r || !s?.live || !m?.track?.cid) return;
  let N; try { N = trackGeometry(m.track.cid).N; } catch { return; }
  const states = s.cars.map((c) => {
    if (c.st === 'dnf') return { key: c.k, hidden: true };
    const garage = c.st === 'garage';
    let d = V.disp[c.k] ?? c.d ?? 0; if (garage) d = Math.round(d);
    const f = d - Math.floor(d);
    let frac = 0, spd = 0;
    try { frac = arcFrac(m.track.cat, m.track.cid, f, m.track.lap); spd = c.st === 'run' && !s.paused ? speedAtTimeFrac(m.track.cat, m.track.cid, f, c.lt || m.track.lap, m.track.lap) / 3.6 : 0; } catch { /* */ }
    const lab = c.me || c.k === V.focus || c.p <= 3;
    return { key: c.k, pos: c.p, gap: m.kind === 'race' && c.st === 'run' ? c.int : null, s: frac * N, speed: spd, inPit: c.st === 'pit' || garage, garage, pitting: !!c.box, close: m.kind === 'race' && typeof c.int === 'number' && c.int < 1, tyreColor: COMPOUNDS[c.ty]?.color || '#ffd400', label: garage ? '' : lab ? `P${c.p} ${code3(c.k)}` : `${c.p}` };
  });
  r.focusKey = V.focus;
  try { r.setRain(s.rain || 0); r.update(states, dt); } catch (e) { console.warn('3D', e); stop3D(); V.mode2d = true; V.bodyKey = ''; paintBody(true); }
  V._hudT = (V._hudT || 0) + dt; if (V._hudT > 0.2) { V._hudT = 0; paintHud(states); }
}
function paintHud(states) {
  const el = document.getElementById('pw-hud'); const s = V.s; if (!el || !s?.live) return;
  const k = V.r3d?.director && V.r3d?.dirFocus ? V.r3d.dirFocus : V.focus;
  const c = s.cars.find((x) => x.k === k); if (!c) { el.innerHTML = ''; return; }
  const st = states?.find((x) => x.key === k); const kmh = st ? Math.round((st.speed || 0) * 3.6) : null;
  el.innerHTML = `<span class="pw-hpos" style="--tc:${carM(k)?.c1}">P${c.p}</span><div><b>${esc(nm(k))}</b><small>${esc(carM(k)?.team || '')}</small></div>${kmh != null && V.r3d ? `<span class="pw-hspd">${kmh}<small>km/h</small></span>` : ''}${tyre(c.ty, c.age)}${c.drs ? '<span class="pw-tag drs">DRS</span>' : ''}`;
}
function paintMini() {
  const el = document.getElementById('pw-mini'); const s = V.s; if (!el || !s?.live || V.holding) return;
  const race = V.meta?.kind === 'race';
  el.innerHTML = `<div class="pw-mh">${race ? 'Classifica' : 'Tempi'}<span class="tiny muted">tocca per seguire</span></div>` + s.cars.map((c) => `<div class="pw-mrow ${c.me ? 'me' : ''} ${c.k === V.focus ? 'focus' : ''} ${c.st}" ${rowStyle(c)} data-a="pw-focus" data-key="${esc(c.k)}"><span class="pw-pos p${c.p}">${c.p}</span><i class="pw-tcol"></i><b>${esc(code3(c.k))}</b><span class="pw-mg">${c.st === 'dnf' ? 'RIT' : c.st === 'pit' ? 'PIT' : c.st === 'garage' ? 'BOX' : race ? (c.p === 1 ? 'Leader' : gapTxt(c.int ?? c.gap)) : c.best != null ? fmtTime(c.best) : '—'}</span>${tyre(c.ty)}</div>`).join('');
}
