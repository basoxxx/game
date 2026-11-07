import { icon } from './icons.js';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const fmtTime = (s) => {
  if (s == null || !isFinite(s)) return '--';
  const m = Math.floor(s / 60), sec = s - m * 60;
  return m > 0 ? `${m}:${sec.toFixed(3).padStart(6, '0')}` : sec.toFixed(3);
};
export const fmtGap = (g) => {
  if (g == null) return '';
  if (typeof g === 'object') return `+${g.laps} ${g.laps === 1 ? 'giro' : 'giri'}`;
  if (g === 0) return 'Leader';
  if (g >= 60) { const m = Math.floor(g / 60); return `+${m}:${(g - m * 60).toFixed(1).padStart(4, '0')}`; }
  return `+${g.toFixed(g < 10 ? 3 : 1)}`;
};
export const fmtLong = (s) => {
  if (s == null) return '--';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}` : `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};
export const ord = (n) => `${n}°`;
export function ratingClass(v) { return v >= 90 ? 'r90' : v >= 85 ? 'r85' : v >= 78 ? 'r78' : ''; }
export function stars(v, max = 5) { const n = Math.round(v); return '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(max - n) + '</span>'; }
export function bar(v, cls = '', ghost = null) {
  return `<div class="bar ${cls}">${ghost != null ? `<div class="ghost" style="width:${Math.max(0, Math.min(100, ghost))}%"></div>` : ''}<i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;
}

// Header for full-screen pages (menu sub-pages): back button, eyebrow, big slanted title, right-hand slot
export function pageHead({ back = 'menu', backAction = null, eyebrow = '', title = '', sub = '', right = '' } = {}) {
  const b = backAction ? `data-a="${backAction}"` : `data-a="nav" data-to="${back}"`;
  return `<div class="page-head"><div class="ph-left"><button class="btn icon-btn ph-back" ${b} aria-label="Indietro" data-tip="Indietro (Esc)">${icon('left')}</button><div>${eyebrow ? `<div class="ph-eyebrow">${eyebrow}</div>` : ''}<h1>${title}</h1>${sub ? `<div class="ph-sub">${sub}</div>` : ''}</div></div>${right ? `<div class="ph-right">${right}</div>` : ''}</div>`;
}
