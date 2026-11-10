// Impostazioni: a console-style options menu with tabs (Grafica, Audio, Gioco, Controlli).
// Every row describes itself in the side panel when hovered or focused.
// Tabs switch with the mouse, Q / E on the keyboard or LB / RB on a controller.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { S, getSettings, setSettings, exportSave } from '../engine/state.js';
import { openLoad } from './menu.js';
import { applyVolumes, sfx, music, AUDIO_BUSES, audioSpectrum, passBy, crowdCheer } from '../ui/audio.js';
import { applyFilterSettings, FILTER_PRESETS, COLORBLIND_MODES } from '../ui/gfx.js';
import { resetTips } from '../ui/tour.js';
import { TIERS, gfxTier, setTier, redetect, tierLabel } from '../ui/quality.js';
import { applyAccessibility, TEXT_SCALES, SUB_SCALES } from '../ui/a11y.js';
import { storageUsage } from '../ui/savesafe.js';

const TABS = [
  { id: 'grafica', name: 'Grafica', icon: 'display' },
  { id: 'audio', name: 'Audio', icon: 'volume' },
  { id: 'gioco', name: 'Gioco', icon: 'flag' },
  { id: 'controlli', name: 'Controlli', icon: 'gamepad' },
];
let tab = 'grafica';
let meterRaf = 0, shownTab = null;

const tipsOff = () => { try { return !!JSON.parse(localStorage.getItem('apexdynasty_tips') || '{}').__off; } catch { return false; } };
const kb = (k) => k.split(' ').map((x) => `<span class="kbd">${esc(x)}</span>`).join('');

// ---- row builders ---------------------------------------------------------------
// every row: label + current value on the left, control on the right, data-desc for the info panel
const row = (label, desc, control, extra = '') => `<div class="opt-row" data-desc="${esc(desc)}" data-title="${esc(label)}" ${extra}><div class="opt-l"><span class="opt-name">${label}</span></div><div class="opt-c">${control}</div></div>`;
const sw = (on, attrs) => `<button class="opt-sw ${on ? 'on' : ''}" ${attrs} role="switch" aria-checked="${on}"><i></i><span>${on ? 'Sì' : 'No'}</span></button>`;
const choice = (list, cur, attrs) => `<div class="opt-seg" role="radiogroup">${list.map(([v, l, tip]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" ${attrs(v)} role="radio" aria-checked="${String(cur) === String(v)}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</button>`).join('')}</div>`;
const slider = (key, v, label) => `<div class="opt-slider" style="--v:${Math.round(v * 100)}%"><input type="range" min="0" max="1" step="0.05" value="${v}" data-input="set-vol" data-k="${key}" aria-label="${esc(label)}"><b class="mono">${Math.round(v * 100)}</b></div>`;
const section = (title, ic) => `<div class="opt-sec">${ic ? icon(ic) : ''}<span>${title}</span></div>`;

function tabGrafica(s) {
  return `${section('Visualizzazione', 'display')}
    ${row('Vista 3D in gara', 'Segui le gare con le telecamere 3D (regia, onboard, elicottero). Disattivala per usare la mappa 2D in stile grafica TV: più leggera sui computer datati.', sw(s.view3d !== false, 'data-a="set-tg" data-k="view3d" data-d="1"'))}
    ${row('Qualità grafica', `Alta: ombre, riflessi, profondità di campo e sfondi 3D animati. Media: effetti alleggeriti. Bassa: niente sfondi 3D nei menu e gare 3D leggere, per computer datati.${s.gfxProbe ? ` Rilevamento automatico: ${s.gfxProbe.renderer || 'scheda video'}${s.gfxProbe.ms ? ` (${s.gfxProbe.ms} ms)` : ''}.` : ''}`, `${choice(TIERS.map(([v, l, d]) => [v, l, d]), gfxTier(), (v) => `data-a="set-tier" data-v="${v}"`)}<button class="btn sm ghost opt-detect" data-a="set-detect" data-tip="Misura la scheda video per un secondo e sceglie la qualità">${icon('reset')} Rileva${s.gfxAuto ? ' <span class="chip">auto</span>' : ''}</button>`)}
    ${window.apex?.toggleFullscreen ? row('Schermo intero', 'Passa da finestra a schermo intero. Scorciatoia: F11.', `<button class="btn sm" data-a="set-fs">${icon('fullscreen')} Cambia <span class="kbd">F11</span></button>`) : ''}
    ${section('Filtri immagine', 'palette')}
    ${row('Stile immagine', 'Correzione colore applicata alla gara, al garage e a tutte le viste 3D.', choice(Object.entries(FILTER_PRESETS).map(([k, p]) => [k, p.label, p.desc]), s.gfxFilter || 'naturale', (v) => `data-a="set-filter" data-v="${v}"`))}
    ${[['gfxSharpen', 'Nitidezza adattiva', 'Rende più definiti bordi e dettagli lontani.', false], ['gfxGrain', 'Grana pellicola', 'Leggera grana cinematografica animata, come nelle riprese TV.', false], ['gfxVignette', 'Vignettatura', 'Scurisce leggermente i bordi dell’immagine per concentrare lo sguardo al centro.', true]].map(([k, n, d, def]) => row(n, d, sw(s[k] ?? def, `data-a="set-gtg" data-k="${k}" data-d="${def ? 1 : 0}"`))).join('')}
    ${section('Accessibilità', 'accessibility')}
    ${row('Modalità daltonici', 'Corregge i colori delle viste 3D per chi ha un deficit nella percezione dei colori. Le mescole hanno sempre anche la lettera.', choice(Object.entries(COLORBLIND_MODES), s.gfxColorblind || 'off', (v) => `data-a="set-cb" data-v="${v}"`))}
    ${row('Dimensione testo', 'Ingrandisce o riduce testi e pannelli dell’interfaccia (90–130%). Le viste 3D non cambiano.', choice(TEXT_SCALES.map((v) => [v, `${v}%`]), s.textScale || 100, (v) => `data-a="set-text" data-v="${v}"`))}
    ${row('Sottotitoli in gara', 'Dimensione della telecronaca e dei messaggi radio mostrati durante le sessioni dal vivo.', choice(SUB_SCALES, s.subScale || 100, (v) => `data-a="set-sub" data-v="${v}"`))}
    ${row('Colori di stato sicuri', 'Usa blu e arancio al posto di verde e rosso per indicare positivo/negativo in tabelle, badge e grafici: leggibili con ogni tipo di daltonismo.', sw(!!(s.safeColors ?? (s.gfxColorblind && s.gfxColorblind !== 'off')), 'data-a="set-safe"'))}
    ${row('Riduci animazioni', 'Elimina transizioni, scorrimenti e animazioni decorative dell’interfaccia.', sw(!!s.reduceMotion, 'data-a="set-motion"'))}`;
}

function tabAudio(s) {
  const fx = s.sound !== false;
  return `<div class="opt-audio-head"><div class="opt-meter-w"><span class="lbl">Uscita audio</span><canvas class="opt-meter" id="opt-meter" width="480" height="60" aria-hidden="true"></canvas></div><div class="row gap6 wrap"><button class="btn sm" data-a="set-test" data-t="ok">${icon('play')} Effetti</button><button class="btn sm" data-a="set-test" data-t="engine">${icon('speed')} Motori</button><button class="btn sm" data-a="set-test" data-t="crowd">${icon('users')} Pubblico</button><button class="btn sm" data-a="set-test" data-t="win">${icon('trophy')} Fanfara</button></div></div>
    ${section('Mixer', 'sliders')}
    ${AUDIO_BUSES.map((b) => row(b.label, {
      volume: 'Livello generale di tutto l’audio del gioco.',
      musicVol: 'Colonna sonora generativa: un tema per menu, gestione, gara, podio e Scontro Totale.',
      sfxVol: 'Clic dell’interfaccia, notifiche, radio di squadra, pit stop e sorpassi.',
      engineVol: 'Il rombo delle vetture in gara e in Scontro Totale.',
      ambVol: 'Pubblico sugli spalti, pioggia, vento e paddock.',
    }[b.key] || '', slider(b.key, s[b.key] ?? b.def, b.label), `data-bus="${b.key}"`)).join('')}
    ${section('Sorgenti', 'music')}
    ${row('Colonna sonora', 'Accende o spegne la musica. Il volume resta quello del mixer.', sw(s.music !== false, 'data-a="set-tg" data-k="music" data-d="1"'))}
    ${row('Effetti, motori e ambiente', 'Spegne tutti i suoni tranne la musica.', sw(fx, 'data-a="set-tg" data-k="sound" data-d="1"'))}
    ${row('Rombo motori in gara', 'Il suono dei motori durante le sessioni dal vivo. Utile da spegnere se segui la gara a velocità molto alta.', sw(s.engineSound !== false, 'data-a="set-tg" data-k="engineSound" data-d="1"'))}`;
}

function tabGioco(s) {
  const st = S();
  return `${section('Gara', 'chequered')}
    ${row('Velocità predefinita', 'La velocità di simulazione con cui partono le gare. In gara puoi cambiarla con i tasti 1–6.', choice([1, 2, 4, 8, 16, 32].map((v) => [v, `${v}x`]), s.raceSpeed, (v) => `data-a="set-speed" data-v="${v}"`))}
    ${[['failures', 'Guasti meccanici', 'Quanto spesso motori, cambi e idraulica si rompono in gara.'], ['damage', 'Incidenti e danni', 'Frequenza di contatti, uscite di pista e danni alle vetture.'], ['aiAggr', 'Aggressività avversari', 'Quanto rischiano gli avversari in attacco e in difesa.']].map(([k, n, d]) => row(n, d, choice([[0.3, 'Bassi'], [1, 'Realistici'], [1.6, 'Alti']], s[k] ?? 1, (v) => `data-a="set-real" data-k="${k}" data-v="${v}"`))).join('')}
    ${section('Aiuti', 'bulb')}
    ${row('Consigli dell’ingegnere', 'Suggerimenti contestuali che compaiono la prima volta che apri una schermata.', sw(!tipsOff(), 'data-a="set-tips"'))}
    ${row('Ripristina consigli e tour', 'Fa ricomparire tutti i consigli e i tour guidati già visti.', `<button class="btn sm" data-a="set-tips-reset">${icon('reset')} Ripristina</button>`)}
    ${st ? `${section('Salvataggi', 'save')}
    ${row('Salva in uno slot', 'Il gioco salva da solo dopo ogni evento. Qui puoi creare un salvataggio in uno slot a scelta.', `<button class="btn sm" data-a="set-save">${icon('save')} Scegli slot…</button>`)}
    ${row('Esporta su file', 'Scarica la carriera in un file .json da conservare o da importare su un altro computer.', `<button class="btn sm" data-a="set-export">${icon('download')} Esporta</button>`)}` : section('Salvataggi', 'save')}
    ${row('Carica o importa', 'Apri uno slot di salvataggio, ripristina un backup o importa un file .json esportato.', `<button class="btn sm" data-a="set-load">${icon('upload')} Carica…</button>`)}
    ${(() => { const u = storageUsage(); const mb = u.used / 1048576; const pct = Math.min(100, Math.round((mb / 5) * 100)); return row('Spazio usato', `Salvataggi, backup e cache occupano circa ${mb.toFixed(2)} MB dei ~5 MB disponibili. Se lo spazio finisce il gioco libera prima cache e vecchi backup.`, `<div class="opt-store ${pct > 80 ? 'full' : ''}"><i style="width:${pct}%"></i></div><b class="mono">${mb.toFixed(1)} MB</b>`); })()}
    ${section('Informazioni', 'info')}
    <div class="opt-about">${icon('flag')}<div><b>Apex Dynasty</b> <span class="ver-badge">v${__APP_VERSION__}</span><div class="small muted">Gioco gestionale di fantasia. Tutti i nomi di squadre, piloti, sponsor e marchi sono parodie inventate e non sono affiliati a persone o aziende reali.</div></div></div>`;
}

const KEYS = [
  ['Gestione', 'board', [['1 … 0', 'Sezioni del menu laterale'], ['Invio', 'Vai al weekend di gara'], ['Ctrl S', 'Salvataggio rapido'], ['F1', 'Guida “Come si gioca”'], ['?', 'Elenco dei comandi'], ['Esc', 'Indietro / chiudi finestra']]],
  ['Gara', 'chequered', [['Spazio', 'Pausa / riprendi'], ['1 2 3', 'Velocità 1x · 2x · 4x'], ['4 5 6', 'Velocità 8x · 16x · 32x'], ['1 2 3', 'Scelta nei momenti chiave'], ['R', 'Replay dell’ultima azione (3D)']]],
  ['Scontro Totale', 'steering', [['W S', 'Acceleratore e freno'], ['A D', 'Sterzo'], ['Spazio', 'Freno a mano'], ['Shift', 'Nitro'], ['Q', 'Guarda dietro'], ['C', 'Cambia telecamera'], ['R', 'Riposiziona la vettura'], ['Esc', 'Pausa']]],
  ['Menu', 'home', [['↑ ↓', 'Scorri le voci'], ['← → ↑ ↓', 'Muovi la selezione'], ['Tab', 'Elemento successivo'], ['Invio', 'Conferma'], ['Q E', 'Scheda precedente / successiva (qui)']]],
];
const PAD = [['A', 'Seleziona'], ['B', 'Indietro / chiudi'], ['X', 'Pausa in gara · camera'], ['Y', 'Elenco comandi · riposiziona'], ['LB', 'Sezione precedente'], ['RB', 'Sezione successiva'], ['Start', 'Continua al weekend'], ['Croce', 'Muovi la selezione'], ['Stick dx', 'Scorri la pagina'], ['Grilletti', 'Gas e freno (Scontro Totale)']];

function tabControlli() {
  const pads = (navigator.getGamepads?.() || []).filter(Boolean);
  return `<div class="opt-pad-status ${pads.length ? 'on' : ''}">${icon('gamepad')}<div><b>${pads.length ? esc(String(pads[0].id || 'Controller').replace(/\(.*\)/, '').trim().slice(0, 48)) : 'Nessun controller collegato'}</b><span>${pads.length ? 'Collegato · navigazione con croce e stick attiva' : 'Collega un controller in qualsiasi momento: il gioco lo riconosce da solo.'}</span></div></div>
    <div class="opt-binds">${KEYS.map(([g, ic, list]) => `<div class="opt-bind-group">${section(g, ic)}${list.map(([k, d]) => `<div class="opt-bind" data-desc="${esc(d)}" data-title="${esc(g)}"><span>${d}</span><span class="opt-keys">${kb(k)}</span></div>`).join('')}</div>`).join('')}
      <div class="opt-bind-group">${section('Controller', 'gamepad')}${PAD.map(([k, d]) => `<div class="opt-bind" data-desc="${esc(d)}" data-title="Controller"><span>${d}</span><span class="opt-keys"><span class="pad-btn">${k}</span></span></div>`).join('')}</div>
    </div>`;
}

const INFO = {
  grafica: ['Grafica', 'Qualità delle viste 3D, filtri immagine e opzioni di accessibilità visiva. Le modifiche si applicano subito.'],
  audio: ['Audio', 'Regola ogni gruppo del mixer: la musica, gli effetti, i motori e l’ambiente. Usa i pulsanti di prova per sentire il risultato.'],
  gioco: ['Gioco', 'Velocità e realismo delle gare, aiuti per i nuovi giocatori e salvataggi.'],
  controlli: ['Controlli', 'Tutti i comandi da tastiera e controller. I comandi del controller funzionano in ogni menu.'],
};

registerScreen({
  id: 'settings', full: true,
  render(params) {
    const s = getSettings();
    const back = params?.back && params.back !== 'settings' ? params.back : S() ? 'hub' : 'menu';
    const t = TABS.find((x) => x.id === tab) || TABS[0];
    if (App._lastRendered !== 'settings') shownTab = null; // fresh visit: animate in
    const body = { grafica: tabGrafica, audio: tabAudio, gioco: tabGioco, controlli: tabControlli }[t.id](s);
    return `<div class="full-screen opt-screen">
      ${pageHead({ back, eyebrow: 'Opzioni', title: 'Impostazioni', sub: 'Le modifiche vengono salvate e applicate subito.' })}
      <div class="opt-tabs" role="tablist"><span class="opt-tab-hint"><span class="kbd">Q</span><span class="pad-btn">LB</span></span>${TABS.map((x) => `<button class="opt-tab ${x.id === t.id ? 'on' : ''}" data-a="set-tab" data-id="${x.id}" role="tab" aria-selected="${x.id === t.id}">${icon(x.icon)}<span>${x.name}</span></button>`).join('')}<span class="opt-tab-hint"><span class="kbd">E</span><span class="pad-btn">RB</span></span></div>
      <div class="opt-layout">
        <div class="opt-list opt-${t.id} ${shownTab !== t.id ? 'anim' : ''}" role="tabpanel">${body}</div>
        <aside class="opt-info" aria-live="polite"><div class="oi-k">${icon(t.icon)} ${INFO[t.id][0]}</div><h3 id="opt-info-t">${INFO[t.id][0]}</h3><p id="opt-info-d">${INFO[t.id][1]}</p><div class="oi-foot"><span><span class="kbd">Esc</span> Indietro</span><span><span class="kbd">Q</span> <span class="kbd">E</span> Schede</span></div></aside>
      </div>
    </div>`;
  },
  mount(root) {
    shownTab = tab;
    const info = (el) => {
      const t = root.querySelector('#opt-info-t'), d = root.querySelector('#opt-info-d');
      if (!t || !d) return;
      if (!el) { const x = INFO[tab]; t.textContent = x[0]; d.textContent = x[1]; return; }
      t.textContent = el.dataset.title; d.textContent = el.dataset.desc;
    };
    const list = root.querySelector('.opt-list');
    list?.addEventListener('mouseover', (e) => { const r = e.target.closest('[data-desc]'); if (r) { root.querySelectorAll('.opt-row.hot').forEach((x) => x.classList.remove('hot')); r.classList.add('hot'); info(r); } });
    list?.addEventListener('focusin', (e) => { const r = e.target.closest('[data-desc]'); if (r) { root.querySelectorAll('.opt-row.hot').forEach((x) => x.classList.remove('hot')); r.classList.add('hot'); info(r); } });
    list?.addEventListener('mouseleave', () => { root.querySelectorAll('.opt-row.hot').forEach((x) => x.classList.remove('hot')); info(null); });
    // live output meter on the Audio tab
    cancelAnimationFrame(meterRaf);
    const cv = root.querySelector('#opt-meter');
    if (cv) {
      const g = cv.getContext('2d'); let buf = null;
      const draw = () => {
        if (!cv.isConnected) return;
        const f = audioSpectrum(buf); if (f) buf = f;
        g.clearRect(0, 0, cv.width, cv.height);
        const n = 48;
        for (let i = 0; i < n; i++) {
          const v = f ? f[Math.floor((i / n) ** 1.6 * f.length * 0.7)] / 255 : 0;
          const h = Math.max(2, v * (cv.height - 4));
          g.fillStyle = i % 12 === 0 ? 'rgba(255,255,255,0.9)' : `rgba(255,255,255,${0.25 + v * 0.6})`;
          g.fillRect(i * (cv.width / n) + 1, cv.height - h, cv.width / n - 3, h);
        }
        meterRaf = requestAnimationFrame(draw);
      };
      draw();
    }
  },
  unmount() { cancelAnimationFrame(meterRaf); },
  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyQ' || e.code === 'KeyE') { e.preventDefault(); switchTab(e.code === 'KeyE' ? 1 : -1); }
  },
  actions: {
    'set-tab'(el) { tab = el.dataset.id; sfx.select?.(); App.refresh(); },
    'set-tg'(el) { const k = el.dataset.k; const cur = getSettings()[k]; const on = !(cur ?? el.dataset.d === '1'); setSettings({ [k]: on }); applyVolumes(); if (k === 'music' && on) music.kick?.(); App.refresh(); refocus(el); },
    'set-gfx'(el) { setSettings({ gfx: el.dataset.v }); App.refresh(); refocus(el); },
    'set-tier'(el) { setTier(el.dataset.v, false); App.refresh(); refocus(el); },
    'set-detect'(el) { el.disabled = true; el.innerHTML = `${icon('hourglass')} Misuro…`; redetect().then((r) => { App.toast(`Qualità ${tierLabel(r.tier)}`, r.renderer ? esc(r.renderer) : 'Scheda video misurata', 'good'); App.refresh(); refocus(el); }); },
    'set-text'(el) { setSettings({ textScale: +el.dataset.v }); applyAccessibility(); App.refresh(); refocus(el); },
    'set-sub'(el) { setSettings({ subScale: +el.dataset.v }); applyAccessibility(); App.refresh(); refocus(el); },
    'set-safe'(el) { const s = getSettings(); const cur = !!(s.safeColors ?? (s.gfxColorblind && s.gfxColorblind !== 'off')); setSettings({ safeColors: !cur }); applyAccessibility(); App.refresh(); refocus(el); },
    'set-filter'(el) { setSettings({ gfxFilter: el.dataset.v }); applyFilterSettings(); App.refresh(); refocus(el); },
    'set-gtg'(el) { const k = el.dataset.k; setSettings({ [k]: !(getSettings()[k] ?? el.dataset.d === '1') }); applyFilterSettings(); App.refresh(); refocus(el); },
    'set-cb'(el) { setSettings({ gfxColorblind: el.dataset.v }); applyFilterSettings(); applyAccessibility(); App.refresh(); refocus(el); },
    'set-motion'(el) { const v = !getSettings().reduceMotion; setSettings({ reduceMotion: v }); document.documentElement.classList.toggle('reduce-motion', v); App.refresh(); refocus(el); },
    'set-fs'() { window.apex?.toggleFullscreen?.(); },
    'set-vol'(el) {
      setSettings({ [el.dataset.k]: +el.value }); applyVolumes();
      const w = el.closest('.opt-slider'); if (w) { w.style.setProperty('--v', `${Math.round(el.value * 100)}%`); const b = w.querySelector('b'); if (b) b.textContent = Math.round(el.value * 100); }
    },
    'set-test'(el) {
      const t = el.dataset.t;
      if (t === 'engine') passBy?.(1, 'formula');
      else if (t === 'crowd') crowdCheer?.(1);
      else sfx[t]?.();
    },
    'set-speed'(el) { setSettings({ raceSpeed: +el.dataset.v }); App.refresh(); refocus(el); },
    'set-real'(el) { setSettings({ [el.dataset.k]: +el.dataset.v }); App.refresh(); refocus(el); },
    'set-tips'(el) {
      let t = {}; try { t = JSON.parse(localStorage.getItem('apexdynasty_tips') || '{}') || {}; } catch {}
      if (t.__off) delete t.__off; else t.__off = 1;
      try { localStorage.setItem('apexdynasty_tips', JSON.stringify(t)); } catch {}
      App.refresh(); refocus(el);
    },
    'set-tips-reset'() { resetTips(); sfx.ok(); App.toast('Consigli riattivati', 'I suggerimenti e i tour ricompariranno nelle schermate.', 'good'); },
    'set-save'() { openLoad(true); },
    'set-load'() { openLoad(false); },
    'set-export'() {
      const b = exportSave(); const a = document.createElement('a'); a.href = URL.createObjectURL(b);
      a.download = `apex-dynasty-${S().season}-r${S().round + 1}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      App.toast('Carriera esportata', 'Il file è nella cartella dei download.', 'good');
    },
  },
});

function switchTab(d) {
  const i = TABS.findIndex((x) => x.id === tab);
  tab = TABS[(i + d + TABS.length) % TABS.length].id;
  sfx.select?.(); App.refresh(); focusTab();
}
function focusTab() { requestAnimationFrame(() => document.querySelector('.opt-tab.on')?.focus({ preventScroll: true })); }
// after a re-render, put the focus back on the same control (keyboard / controller users keep their place)
function refocus(el) {
  const a = el.dataset.a, k = el.dataset.k, v = el.dataset.v;
  requestAnimationFrame(() => {
    const sel = `[data-a="${a}"]${k ? `[data-k="${k}"]` : ''}${v ? `[data-v="${v}"]` : ''}`;
    const n = document.querySelector(sel);
    if (n && document.activeElement !== n && (document.activeElement === document.body || !document.activeElement)) n.focus({ preventScroll: true });
  });
}
