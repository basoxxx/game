// Tavolo Baso — the play shell shared by the four games: the canvas stage (3D, or 2D on Bassa / without
// WebGL), the two player bars (the far one turns round on a tablet laid flat), the side panel, the tool
// buttons, toasts and in-game dialogs (pause, promotion, pass the device, results). Keyboard: Esc / P pause,
// the hub's controller sends B as Esc. Every game controller builds on it.
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/dom.js';
import { sfx } from '../../ui/audio.js';
import { gfxTier } from '../../ui/quality.js';
import { tvLoad } from '../store.js';
import { boardById, piecesById } from '../sets.js';

export function webglOK() {
  try { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); const ok = !!g; g?.getExtension('WEBGL_lose_context')?.loseContext(); return ok; } catch { return false; }
}
export const snd = (k) => { try { if (tvLoad().opts.sound !== false) sfx[k]?.(); } catch {} };

export class Shell {
  // o: { game, title, seats:[{name, sub, color}], tools:[{id, ic, label, key?}], side: html|false, flat, onTool(id), onPause() }
  constructor(root, o) {
    this.root = root; this.o = o;
    const d = tvLoad();
    this.d = d; this.theme = boardById(d.board); this.set = piecesById(d.pieces);
    this.tier = gfxTier();
    this.use3d = d.opts.view !== '2d' && this.tier !== 'low' && webglOK();
    this.flat = !!o.flat;
    root.innerHTML = `<div class="tv-play tv-g-${o.game} ${this.flat ? 'flat' : ''}" style="--tv-a:${o.accent || '#d9a441'}">
      <header class="tv-bar tv-top" data-seat="1"></header>
      <div class="tv-stage"><canvas class="tv-canvas" aria-hidden="true"></canvas><div class="tv-think" hidden><i></i><i></i><i></i><span>Il computer pensa</span></div><div class="tv-msg" aria-live="polite"></div></div>
      <footer class="tv-bar tv-bot" data-seat="0"></footer>
      <aside class="tv-side">${o.side || ''}</aside>
      <nav class="tv-tools" aria-label="Comandi"></nav>
      <div class="tv-dlg" hidden></div>
    </div>`;
    this.el = root.firstElementChild;
    const q = (s) => this.el.querySelector(s);
    this.top = q('.tv-top'); this.bot = q('.tv-bot'); this.stageEl = q('.tv-stage'); this.canvas = q('.tv-canvas'); this.sideEl = q('.tv-side');
    this.toolsEl = q('.tv-tools'); this.dlg = q('.tv-dlg'); this.thinkEl = q('.tv-think'); this.msgEl = q('.tv-msg');
    this.setTools(o.tools || []);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tv]'); if (!b || !this.el.contains(b)) return;
      e.stopPropagation(); snd('click');
      const id = b.dataset.tv;
      if (this.dlgActions?.[id]) { const f = this.dlgActions[id]; f(b); return; }
      o.onTool?.(id, b);
    });
    this.kd = (e) => {
      if (e.target?.closest?.('input, textarea, select')) return;
      if (e.key === 'Escape' || (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey)) {
        if (document.querySelector('.modal-wrap')) return;
        e.preventDefault(); e.stopPropagation();
        if (!this.dlg.hidden && this.dlgCancel) { const f = this.dlgCancel; f(); return; }
        if (this.dlg.hidden) o.onPause?.();
        return;
      }
      if (!this.dlg.hidden) return;
      const t = (o.tools || []).find((x) => x.key && x.key === e.key.toLowerCase());
      if (t && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); o.onTool?.(t.id); }
      o.onKey?.(e);
    };
    window.addEventListener('keydown', this.kd, true);
    this.ro = new ResizeObserver(() => this.layout()); this.ro.observe(this.el);
    this.layout();
  }
  layout() { const r = this.el.getBoundingClientRect(); const port = r.height > r.width * 1.05; this.el.classList.toggle('port', port); this.el.classList.toggle('short', r.height < 520); this.port = port; }
  setTools(list) {
    this.o.tools = list;
    this.toolsEl.innerHTML = list.map((t) => `<button class="tv-tool ${t.cls || ''}" data-tv="${t.id}" ${t.off ? 'disabled' : ''} aria-label="${esc(t.label)}${t.key ? ` (${t.key.toUpperCase()})` : ''}" title="${esc(t.label)}${t.key ? ` (${t.key.toUpperCase()})` : ''}">${icon(t.ic)}<span>${esc(t.label)}</span></button>`).join('');
  }
  enableTool(id, on) { const b = this.toolsEl.querySelector(`[data-tv="${id}"]`); if (b) b.disabled = !on; }
  // seat: { name, sub, color, active, clock, extra }
  seat(i, s) {
    const el = i ? this.top : this.bot;
    el.classList.toggle('on', !!s.active);
    el.innerHTML = `<i class="tv-dot" style="background:${s.color || '#888'}"></i><div class="tv-who"><b>${esc(s.name)}</b><span>${s.sub || ''}</span></div><div class="tv-extra">${s.extra || ''}</div>${s.clock != null ? `<div class="tv-clock ${s.low ? 'low' : ''}">${s.clock}</div>` : ''}`;
  }
  thinking(on) { this.thinkEl.hidden = !on; }
  msg(text, type = '', ms = 2200) {
    const m = this.msgEl; m.className = `tv-msg on ${type}`; m.textContent = text;
    clearTimeout(this.msgT); if (ms) this.msgT = setTimeout(() => { m.className = 'tv-msg'; }, ms);
  }
  // in-game dialog. actions: { id: fn } bound to [data-tv=id] buttons inside. cancel: Esc handler
  dialog(html, actions = {}, { cancel = null, cls = '', rot = false } = {}) {
    this.dlg.innerHTML = `<div class="tv-dcard ${cls} ${rot ? 'rot' : ''}" role="dialog">${html}</div>`;
    this.dlg.hidden = false; this.dlgActions = actions; this.dlgCancel = cancel;
    this.el.classList.add('dlg-open');
    requestAnimationFrame(() => (this.dlg.querySelector('.tv-dcard .btn.primary, .tv-dcard button') || this.dlg).focus?.({ preventScroll: true }));
  }
  closeDialog() { this.dlg.hidden = true; this.dlg.innerHTML = ''; this.dlgActions = null; this.dlgCancel = null; this.el.classList.remove('dlg-open'); }
  dispose() { window.removeEventListener('keydown', this.kd, true); this.ro.disconnect(); clearTimeout(this.msgT); }
}

// download a text file (PGN) and copy text to the clipboard, with a fallback
export function download(name, text, type = 'application/x-chess-pgn') {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return true; } catch { return false; }
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch { return false; }
  }
}
export const fmtClock = (ms) => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); if (ms < 10000) return (ms / 1000).toFixed(1).replace('.', ','); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
