// Tavolo Baso — the cell overlay: one real <button> per board cell laid over the canvas (3D or 2D), shaped to
// the projected square with clip-path. Mouse, touch, keyboard (Tab / arrows / Enter / Space) and the hub's
// controller navigation (spatial focus + A) all reach the game through these buttons; drags start on them.
export class CellOverlay {
  constructor(host, { onActivate, onDragStart, onDragMove, onDrop, onFocus, canDrag, pick, label, cls = '' } = {}) {
    this.host = host; this.cb = { onActivate, onDragStart, onDragMove, onDrop, onFocus, canDrag, pick, label };
    const el = this.el = document.createElement('div'); el.className = `tv-cells ${cls}`; host.appendChild(el);
    this.btns = new Map(); this.cells = []; this.press = null; this.suppress = false;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', () => this.cancel());
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('focusin', (e) => { const b = e.target.closest('.tv-cell'); if (b) this.cb.onFocus?.(b.dataset.id); });
    el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget)) this.cb.onFocus?.(null); });
    el.addEventListener('keydown', (e) => this.key(e));
  }
  // cells: [{ id, pts:[[x,y]x4] }] in px relative to the host
  update(cells) {
    this.cells = cells; const seen = new Set();
    for (const c of cells) {
      seen.add(c.id);
      let b = this.btns.get(c.id);
      if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'tv-cell'; b.dataset.id = c.id; this.el.appendChild(b); this.btns.set(c.id, b); }
      const xs = c.pts.map((p) => p[0]), ys = c.pts.map((p) => p[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
      b.style.cssText = `left:${x0.toFixed(1)}px;top:${y0.toFixed(1)}px;width:${Math.max(1, w).toFixed(1)}px;height:${Math.max(1, h).toFixed(1)}px;clip-path:polygon(${c.pts.map(([x, y]) => `${(x - x0).toFixed(1)}px ${(y - y0).toFixed(1)}px`).join(',')})`;
      c.cx = x0 + w / 2; c.cy = y0 + h / 2;
    }
    for (const [id, b] of this.btns) if (!seen.has(id)) { b.remove(); this.btns.delete(id); }
    this.relabel();
  }
  relabel() { if (!this.cb.label) return; for (const [id, b] of this.btns) { const l = this.cb.label(id); if (b.getAttribute('aria-label') !== l) b.setAttribute('aria-label', l); } }
  setDisabled(on) { this.el.classList.toggle('off', !!on); }
  focus(id) { const b = this.btns.get(id); if (b) b.focus({ preventScroll: true }); }
  focusedId() { const a = document.activeElement; return a?.classList?.contains('tv-cell') && this.el.contains(a) ? a.dataset.id : null; }
  idAt(cx, cy) {
    const hit = document.elementsFromPoint(cx, cy).find((x) => x.classList?.contains('tv-cell') && this.el.contains(x));
    return hit ? hit.dataset.id : null;
  }
  down(e) {
    const b = e.target.closest('.tv-cell'); if (!b || e.button > 0) return;
    let id = b.dataset.id; const p = this.cb.pick?.(e.clientX, e.clientY); if (p) id = p;
    this.press = { id, x: e.clientX, y: e.clientY, drag: false, pid: e.pointerId, can: !!this.cb.canDrag?.(id) };
    if (this.press.can) { try { this.el.setPointerCapture(e.pointerId); } catch {} }
  }
  move(e) {
    const p = this.press; if (!p || p.pid !== e.pointerId || !p.can) return;
    if (!p.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { p.drag = true; this.cb.onDragStart?.(p.id, e.clientX, e.clientY); }
    if (p.drag) { e.preventDefault(); this.cb.onDragMove?.(p.id, e.clientX, e.clientY, this.idAt(e.clientX, e.clientY)); }
  }
  up(e) {
    const p = this.press; this.press = null; if (!p || p.pid !== e.pointerId) return;
    try { this.el.releasePointerCapture(e.pointerId); } catch {}
    if (p.drag) { this.suppress = true; setTimeout(() => { this.suppress = false; }, 50); this.cb.onDrop?.(p.id, this.idAt(e.clientX, e.clientY)); }
    else this.tapId = p.id;
  }
  cancel() { if (this.press?.drag) this.cb.onDrop?.(this.press.id, null); this.press = null; }
  click(e) {
    const b = e.target.closest('.tv-cell'); if (!b && !this.tapId) return;
    e.stopPropagation();
    if (this.suppress) return;
    let id = b ? b.dataset.id : this.tapId;
    if (e.detail && this.tapId) id = this.tapId; // pointer taps may have picked a tall piece above its square
    this.tapId = null;
    this.cb.onActivate?.(id, e.detail ? 'pointer' : 'key');
  }
  // arrows move the focus to the nearest cell in that screen direction
  key(e) {
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = dirs[e.key]; if (!d) return;
    const cur = this.cells.find((c) => c.id === this.focusedId()); if (!cur) return;
    e.preventDefault(); e.stopPropagation();
    let best = null, bs = Infinity;
    for (const c of this.cells) {
      if (c === cur) continue;
      const dx = c.cx - cur.cx, dy = c.cy - cur.cy, main = dx * d[0] + dy * d[1], cross = Math.abs(dx * d[1]) + Math.abs(dy * d[0]);
      if (main <= 2) continue;
      const s = main + cross * 2.5; if (s < bs) { bs = s; best = c; }
    }
    if (best) this.focus(best.id);
  }
  dispose() { this.el.remove(); }
}
