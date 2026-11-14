// Muretto box: pairing panel opened from the live weekend top bar.
//  - "Secondo monitor": the pit wall in a new window of this app (BroadcastChannel, offline)
//  - "Altro dispositivo": room code + QR code + link for a tablet / phone / other PC (WebRTC)
import { App } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { startHost, onPitwall, hostState, sendTab } from './host.js';
import { brokerConfig, brokerOverride } from './link.js';
import '../styles/pitwall.css';

const PUBLIC_PLAY = 'https://basoxxx.github.io/game/play/';
const CODE_KEY = 'apex_pitwall_code';
let off = null;

export function pitwallUrl(code) {
  const web = /^https?:$/.test(location.protocol);
  const base = web ? `${location.origin}${location.pathname}` : PUBLIC_PLAY;
  const u = new URL(base);
  u.searchParams.set('pitwall', code || 'local');
  const b = brokerOverride(); if (b && code) u.searchParams.set('pwbroker', b);
  return u.href;
}
function localUrl() {
  const u = new URL(location.href); u.search = ''; u.hash = '';
  u.searchParams.set('pitwall', 'local');
  const b = brokerOverride(); if (b) u.searchParams.set('pwbroker', b);
  return u.href;
}
export function openPitwallWindow() {
  startHost();
  const w = window.open(localUrl(), 'apex-pitwall', 'popup=yes,width=1440,height=900');
  if (!w) App.toast('Finestra bloccata', 'Il browser ha bloccato la nuova finestra: consenti i popup per questo sito e riprova.', 'bad');
  return w;
}

export function openPitwallPanel() {
  const H = startHost();
  let code = null; try { code = localStorage.getItem(CODE_KEY); } catch { /* */ }
  if (!/^[A-Z0-9]{6}$/.test(code || '')) code = null;
  H.startRemote(code || undefined);
  const html = () => {
    const { viewers, remote } = hostState();
    const c = remote.code;
    if (c) { try { localStorage.setItem(CODE_KEY, c); } catch { /* */ } }
    const url = c ? pitwallUrl(c) : '';
    const b = brokerConfig();
    const st = remote.state === 'ready' ? `<span class="pwp-dot ok"></span>Pronto: in attesa del dispositivo` : remote.state === 'connecting' ? `<span class="pwp-dot wait"></span>${esc(remote.error || 'Collegamento al server di abbinamento…')}` : remote.state === 'error' ? `<span class="pwp-dot bad"></span>${esc(remote.error || 'Non disponibile')} · riprovo da solo` : '<span class="pwp-dot"></span>Spento';
    return `<div class="pwp">
      <div class="pwp-head"><div class="pwp-ic">${icon('display')}</div><div><div class="tiny upper muted" style="letter-spacing:.28em">Secondo schermo</div><h2>Muretto box</h2>
        <p class="muted small">Tempi, settori, strategia, telemetria e la diretta su un altro schermo: come al muretto di una squadra. Da lì puoi anche rispondere alle chiamate, chiamare i box e cambiare ritmo.</p></div></div>
      <div class="pwp-grid">
        <section class="pwp-card">
          <h3>${icon('display')} Secondo monitor</h3>
          <p class="small muted">Apre il muretto box in una nuova finestra di questo computer: trascinala sull’altro monitor e mettila a schermo intero. Funziona anche senza Internet.</p>
          <button class="btn primary" data-a="pw-window">${icon('fullscreen')} Apri in una nuova finestra</button>
        </section>
        <section class="pwp-card">
          <h3>${icon('globe')} Tablet, telefono o altro PC</h3>
          <div class="pwp-pair">
            <div class="pwp-qr" id="pwp-qr" aria-label="Codice QR del collegamento">${c ? '' : '<span class="tiny muted">…</span>'}</div>
            <div class="pwp-codebox">
              <div class="tiny upper muted">Codice</div>
              <div class="pwp-code" data-code="${esc(c || '')}">${c ? esc(c.slice(0, 3) + ' ' + c.slice(3)) : '— — —'}</div>
              <div class="tiny muted">Inquadra il QR, oppure apri Baso Hub sull’altro dispositivo → Manager → <b>Collega muretto box</b> e inserisci il codice.</div>
              ${url ? `<div class="pwp-link"><input readonly value="${esc(url)}" aria-label="Link del muretto box"><button class="btn sm" data-a="pw-copy">${icon('check')} Copia</button></div>` : ''}
            </div>
          </div>
          <div class="pwp-status small">${st}${remote.state === 'error' ? ' <button class="btn sm ghost" data-a="pw-retry">Riprova ora</button>' : ''}</div>
          <div class="tiny muted mt8">Per l’abbinamento si usa un server pubblico (${b.public ? 'PeerJS' : esc(b.host)}): passa solo il codice, i dati della gara viaggiano direttamente tra i due dispositivi. Senza Internet usa la finestra sul secondo monitor.</div>
        </section>
      </div>
      <div class="pwp-viewers"><b>${viewers.length ? `${viewers.length} ${viewers.length === 1 ? 'schermo collegato' : 'schermi collegati'}` : 'Nessuno schermo collegato'}</b>${viewers.map((v) => `<span class="chip ${v.via === 'webrtc' ? 'info' : 'good'}">${icon(v.via === 'webrtc' ? 'globe' : 'display', 'ico')} ${esc(v.name)}</span>`).join('')}</div>
      <div class="pwp-swap">
        <div><b>Cosa guardi dove</b><div class="tiny muted">Diretta sul secondo schermo e dati qui (la vista 3D di questo computer passa alla mappa e libera la scheda grafica), oppure il contrario.</div></div>
        <div class="row gap6 wrap"><button class="btn sm" data-a="pw-swap" data-v="live" ${viewers.length ? '' : 'disabled'}>${icon('play')} Diretta sul secondo schermo</button><button class="btn sm" data-a="pw-swap" data-v="data" ${viewers.length ? '' : 'disabled'}>${icon('chart')} Dati sul secondo schermo</button></div>
      </div>
      <div class="row mt16" style="justify-content:flex-end"><button class="btn primary" data-a="close-modal">Fatto</button></div>
    </div>`;
  };
  let lastQr = null;
  const paint = () => {
    const w = document.querySelector('.modal-wrap .pwp'); if (!w) return;
    const focus = document.activeElement?.dataset?.a;
    w.outerHTML = html();
    qr();
    if (focus) document.querySelector(`.modal-wrap [data-a="${focus}"]`)?.focus({ preventScroll: true });
  };
  const qr = () => {
    const c = hostState().remote.code; const el = document.getElementById('pwp-qr'); if (!c || !el) return;
    const url = pitwallUrl(c);
    if (lastQr?.url === url && lastQr.svg) { el.innerHTML = lastQr.svg; return; }
    import('qrcode').then((m) => (m.default || m).toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0d12', light: '#ffffff' } }))
      .then((svg) => { lastQr = { url, svg }; const e2 = document.getElementById('pwp-qr'); if (e2) e2.innerHTML = svg; })
      .catch((e) => { console.warn('qr', e); });
  };
  let sig = '';
  const sigOf = () => { const { viewers, remote } = hostState(); return `${remote.state}|${remote.code}|${remote.error}|${viewers.map((v) => v.id).join(',')}`; };
  sig = sigOf();
  App.modal(html(), {
    mount() { qr(); },
    'pw-window'() { openPitwallWindow(); },
    'pw-copy'() { const v = document.querySelector('.pwp-link input')?.value; if (!v) return; (navigator.clipboard?.writeText(v) || Promise.reject()).then(() => App.toast('Link copiato', 'Aprilo sul tablet o sul telefono.', 'good'), () => { const i = document.querySelector('.pwp-link input'); i?.select(); document.execCommand?.('copy'); }); },
    'pw-retry'() { H.stopRemote(); H.startRemote(hostState().remote.code || undefined); },
    'pw-swap'(el) {
      if (el.dataset.v === 'live') { sendTab('live'); if (window.__race?.r3d) clickAction('view2d'); else if (window.__sess?.r3d) clickAction('ss-view2d'); App.toast('Diretta sul secondo schermo', 'Qui resta la mappa 2D con i comandi.', 'good'); }
      else { sendTab('timing'); App.toast('Dati sul secondo schermo', 'Il muretto box mostra i tempi: qui puoi tornare alla vista 3D.', 'good'); }
    },
  }, 'wide pw-modal');
  off?.(); off = onPitwall(() => { const s = sigOf(); if (s !== sig) { sig = s; paint(); } if (!document.querySelector('.modal-wrap .pwp')) { off?.(); off = null; } });
}
function clickAction(a) { const b = document.createElement('button'); b.dataset.a = a; b.hidden = true; document.body.appendChild(b); try { b.click(); } finally { b.remove(); } }
