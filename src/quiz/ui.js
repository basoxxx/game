// Quiz e Parole — shared bits for the views: themes (cosmetic, bought with coins), headers, wallet,
// sounds (the hub's procedural sfx, read-only), share text and a few DOM helpers.
import { sfx } from '../ui/audio.js';
import { esc, pageHead } from '../ui/dom.js';
import { qzLoad } from './store.js';

export const THEMES = [
  { id: 'classico', name: 'Classico', cost: 0, desc: 'Blu notte e oro, il look della serata quiz.', sw: ['#141a33', '#ffc845', '#4f7cff'] },
  { id: 'lavagna', name: 'Lavagna', cost: 150, desc: 'Verde ardesia e gesso, come a scuola.', sw: ['#1f3a2e', '#f4f1de', '#9ad48a'] },
  { id: 'carta', name: 'Carta', cost: 200, desc: 'Fogli color crema e inchiostro: chiaro e riposante.', sw: ['#f6efe0', '#c2412d', '#2a3b5c'] },
  { id: 'pista', name: 'Pista', cost: 250, desc: 'Carbonio, rosso corsa e bandiera a scacchi.', sw: ['#121214', '#e5141b', '#f2f2f2'] },
  { id: 'neon', name: 'Neon', cost: 300, desc: 'Viola elettrico, ciano e magenta da sala giochi.', sw: ['#160b2e', '#00e5ff', '#ff3ec8'] },
  { id: 'tramonto', name: 'Tramonto', cost: 350, desc: 'Arancio, rosa e lilla di una sera d’estate.', sw: ['#3a1640', '#ff9e4a', '#ff5f8f'] },
  { id: 'oceano', name: 'Oceano', cost: 400, desc: 'Abissi turchesi e onde di schiuma.', sw: ['#062a3a', '#3ee6c1', '#7fc8ff'] },
];
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');
export const coinIcon = '<span class="qz-coin" aria-hidden="true"></span>';
export function wallet(d = qzLoad()) { return `<div class="qz-wallet" title="Monete del quiz">${coinIcon}<b data-qz-coins>${fmt(d.coins)}</b></div>`; }
export function head({ title, sub = '', eyebrow = 'Quiz e Parole', back = null, backDo = 'home' }) {
  return pageHead({ ...(back ? { back } : { backAction: 'qz-back' }), eyebrow, title, sub, right: wallet() }).replace('data-a="qz-back"', `data-a="qz-back" data-v="${backDo}"`);
}
// in-game top bar: exit button (not .ph-back, so Esc can ask before leaving), title and right slot
export function bar(title, right = '') {
  return `<div class="qz-bar"><button class="btn icon-btn qz-exit" data-a="qz" data-do="exit" aria-label="Esci (Esc)">✕</button><div class="qz-bar-t">${title}</div><div class="qz-bar-r">${right}</div></div>`;
}
export function play(name, ...a) { try { sfx[name]?.(...a); } catch {} }
export const reduced = () => document.documentElement.classList.contains('reduce-motion');
export function vibrate(ms) { try { navigator.vibrate?.(ms); } catch {} }

// copy to the clipboard with a fallback; returns a promise of true/false
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}
export async function share(App, title, text) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title, text }); return; } catch {} }
  const ok = await copyText(text);
  App.toast(ok ? 'Risultato copiato' : 'Copia non riuscita', ok ? 'Incollalo dove vuoi per sfidare gli amici.' : 'Seleziona il testo e copialo a mano.', ok ? 'good' : 'bad');
}
// little coin burst when coins are earned (purely decorative)
export function coinBurst(root, n) {
  if (!root || reduced() || n <= 0) return;
  const el = document.createElement('div'); el.className = 'qz-burst'; el.innerHTML = `<span>+${fmt(n)}</span>${Array.from({ length: Math.min(10, 3 + n / 4) }, (_, i) => `<i style="--i:${i}"></i>`).join('')}`;
  root.appendChild(el); setTimeout(() => el.remove(), 1400);
}
export function updateWallet(root) { const d = qzLoad(); root?.querySelectorAll('[data-qz-coins]').forEach((b) => { b.textContent = fmt(d.coins); }); }
export { esc };
// 3-2-1 countdown overlay; resolves when done
export function countdown(root, from = 3) {
  return new Promise((res) => {
    const el = document.createElement('div'); el.className = 'qz-count'; root.appendChild(el);
    let n = from;
    const step = () => { if (n === 0) { el.innerHTML = '<b>Via!</b>'; play('go'); setTimeout(() => { el.remove(); res(); }, 450); return; } el.innerHTML = `<b>${n}</b>`; play('beep'); n--; setTimeout(step, 620); };
    if (reduced()) { el.remove(); res(); return; }
    step();
  });
}
