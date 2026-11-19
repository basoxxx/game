// Carte Baso — the table renderer. DOM + CSS transforms (GPU composited, 60 fps on phones), one
// element per card id, so every move between piles animates by itself: deal, play, flip, collect.
// The game plug-ins never touch the DOM: they describe the table with a VIEW (see README.md):
//   { piles: [{ id, cards, seat?, slot?, x?, y?, layout?, up?, ... }], seats?: [...], hl?: [...] }
// and the renderer lays it out for the current screen (portrait / landscape, phone / PC).
import { faceURL, backURL, tableOf } from './art.js';
import { cardName, DECKS, deckOf } from './cards.js';

const reduced = () => document.documentElement.classList.contains('reduce-motion');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// relative seat (0 = bottom/viewer) for n players; Italian games turn counter-clockwise, so the next
// player sits on the RIGHT of the viewer.
const SEATS = { 1: ['b'], 2: ['b', 't'], 3: ['b', 'r', 'l'], 4: ['b', 'r', 't', 'l'], 5: ['b', 'r', 'tr', 'tl', 'l'], 6: ['b', 'r', 'tr', 't', 'tl', 'l'] };

export class CardTable {
  // opts: { deck:'it40'|'fr52', style, back, table, onMove(move), onChoose(moves, card) -> Promise<move|null>, sound(kind) }
  constructor(root, opts = {}) {
    this.root = root; this.o = opts;
    this.els = new Map(); this.pos = new Map(); this.pileEls = new Map(); this.seatEls = new Map();
    this.legal = []; this.sel = null; this.view = null; this.n = 2; this.viewer = 0;
    this.aspect = DECKS[opts.deck || 'it40']?.aspect || 0.58;
    root.innerHTML = `<div class="ct-root"><div class="ct-felt"></div><div class="ct-layer"></div><div class="ct-acts" role="toolbar"></div><div class="ct-say" aria-live="polite"></div></div>`;
    this.box = root.firstElementChild;
    this.felt = root.querySelector('.ct-felt'); this.layer = root.querySelector('.ct-layer'); this.acts = root.querySelector('.ct-acts'); this.sayEl = root.querySelector('.ct-say');
    this.setLook(opts);
    this._ro = new ResizeObserver(() => { if (this.view) this.layout(false); });
    this._ro.observe(root);
    this.layer.addEventListener('pointerdown', (e) => this.down(e));
    this._mv = (e) => this.moveDrag(e); this._up = (e) => this.up(e);
    window.addEventListener('pointermove', this._mv); window.addEventListener('pointerup', this._up); window.addEventListener('pointercancel', this._up);
    this.layer.addEventListener('click', (e) => this.click(e));
    this.acts.addEventListener('click', (e) => { const b = e.target.closest('[data-mi]'); if (b) this.fire(this.legal[+b.dataset.mi]); });
  }
  destroy() {
    this._ro?.disconnect(); window.removeEventListener('pointermove', this._mv); window.removeEventListener('pointerup', this._up); window.removeEventListener('pointercancel', this._up);
    clearTimeout(this._sayT); this.root.innerHTML = ''; this.els.clear();
  }
  setLook({ style, back, table, deck } = {}) {
    if (deck) { this.o.deck = deck; this.aspect = DECKS[deck]?.aspect || this.aspect; }
    if (style) this.o.style = style;
    if (back) this.o.back = back;
    if (table) this.o.table = table;
    const T = tableOf(this.o.table);
    this.felt.style.background = T.bg; this.box.style.setProperty('--ct-rim', T.rim);
    this.backUrl = backURL(this.o.back, this.aspect);
    for (const [id, el] of this.els) { el.querySelector('.ct-b').src = this.backUrl; if (el._up) el.querySelector('.ct-f').src = faceURL(id, this.o.style); }
  }

  // ---------------------------------------------------------------- geometry
  metrics() {
    const W = this.box.clientWidth || 800, H = this.box.clientHeight || 600, portrait = H > W * 1.05;
    const rels = new Set((SEATS[this.n] || SEATS[4]).map((s) => s));
    const sides = rels.has('l') || rels.has('r');
    const sz = this.view?.size || 1;
    let ch = Math.min(H * (portrait ? 0.17 : H < 520 ? 0.25 : 0.215), (W / this.aspect) * (portrait ? 0.25 : 0.15)) * sz;
    ch = clamp(ch, 64, 230);
    const cw = ch * this.aspect, pad = Math.max(8, Math.min(W, H) * 0.02);
    const os = portrait ? 0.5 : 0.56; // opponents' card scale
    const och = ch * os, ocw = cw * os;
    const top = och * 0.62 + pad + 22, bottom = ch + pad * 1.6 + 6;
    const side = sides ? (portrait ? och * 0.75 : och * 0.95) + pad : pad;
    const C = { x: side, y: top, w: W - side * 2, h: H - top - bottom };
    return { W, H, portrait, ch, cw, och, ocw, pad, C, cx: C.x + C.w / 2, cy: C.y + C.h / 2 };
  }
  portrait() { return (this.box.clientHeight || 600) > (this.box.clientWidth || 800) * 1.05; }
  rel(p) { const list = SEATS[this.n] || SEATS[4]; return list[(((p - this.viewer) % this.n) + this.n) % this.n]; }
  // where a seat-relative slot sits: { x, y, rot, scale, along: unit vector of the hand line }
  seatAnchor(p, slot, M) {
    const r = this.rel(p), { W, H, pad, ch, cw, och, ocw, cx, cy } = M;
    const sc = r === 'b' ? 1 : och / ch;
    if (slot === 'hand') {
      if (r === 'b') return { x: W / 2, y: H - ch / 2 - pad * 0.8, rot: 0, scale: 1, ax: 1, ay: 0, maxW: W - cw * 2.6 - pad * 2 };
      if (r === 't') return { x: W / 2, y: och * 0.3 + pad * 0.3, rot: 180, scale: sc, ax: 1, ay: 0, maxW: W * 0.5 };
      if (r === 'tl' || r === 'tr') return { x: r === 'tl' ? W * 0.27 : W * 0.73, y: och * 0.3 + pad * 0.3, rot: 180, scale: sc, ax: 1, ay: 0, maxW: W * 0.3 };
      if (r === 'l') return { x: ocw * 0.3 + pad * 0.3, y: H * 0.44, rot: 90, scale: sc, ax: 0, ay: 1, maxW: H * 0.42 };
      return { x: W - ocw * 0.3 - pad * 0.3, y: H * 0.44, rot: -90, scale: sc, ax: 0, ay: 1, maxW: H * 0.42 };
    }
    if (slot === 'side') { // captured cards / personal pile, in the seat's corner
      const s = 0.62;
      if (r === 'b') return { x: W - cw * s * 0.5 - pad - 4, y: H - ch * s * 0.5 - pad, rot: 0, scale: s };
      if (r === 'r') return { x: W - cw * s * 0.6 - pad, y: M.C.y + ch * s * 0.5, rot: -90, scale: s };
      if (r === 't' || r === 'tl' || r === 'tr') return { x: (r === 'tr' ? W * 0.73 + ocw * 2.2 : r === 'tl' ? W * 0.27 - ocw * 2.2 : cw * s * 0.5 + pad + 4), y: ch * s * 0.5 + pad, rot: 180, scale: s };
      return { x: cw * s * 0.6 + pad, y: Math.min(H - ch * s * 0.6 - pad - 50, H * 0.44 + H * 0.21 + ch * s * 0.6), rot: 90, scale: s };
    }
    if (slot === 'meld') { // a row in front of the seat (melds, a personal tableau)
      const d = 0.62;
      if (r === 'b') return { x: cx, y: cy + M.C.h * 0.3, rot: 0, scale: d, ax: 1, ay: 0, maxW: M.C.w * 0.95 };
      if (r === 't' || r === 'tl' || r === 'tr') return { x: cx, y: cy - M.C.h * 0.3, rot: 0, scale: d, ax: 1, ay: 0, maxW: M.C.w * 0.95 };
      return { x: cx + (r === 'r' ? 1 : -1) * M.C.w * 0.3, y: cy, rot: 0, scale: d, ax: 0, ay: 1, maxW: M.C.h * 0.8 };
    }
    // 'play': the card in front of the seat (tricks)
    const dx = Math.min(cw * 1.1, M.C.w * 0.32), dy = Math.min(ch * 0.58, M.C.h * 0.3);
    const o = { b: [0, dy], t: [0, -dy], r: [dx, 0], l: [-dx, 0], tr: [dx * 0.7, -dy], tl: [-dx * 0.7, -dy] }[r];
    return { x: cx + o[0], y: cy + o[1], rot: 0, scale: 1 };
  }

  // lay one pile out: returns [{ id, x, y, rot, scale, up, z }]
  place(pile, M) {
    const items = (pile.cards || []).map((c) => (typeof c === 'string' ? { id: c } : c));
    let a;
    if (pile.seat != null) a = this.seatAnchor(pile.seat, pile.slot || 'hand', M);
    else {
      const R = pile.anchor === 'table' ? { x: 0, y: 0, w: M.W, h: M.H } : M.C;
      a = { x: R.x + (pile.x ?? 0.5) * R.w, y: R.y + (pile.y ?? 0.5) * R.h, rot: 0, scale: 1, ax: 1, ay: 0, maxW: (pile.w ?? 0.9) * R.w };
    }
    const scale = (pile.scale ?? 1) * a.scale, cw = M.cw * scale, ch = M.ch * scale, rot0 = a.rot + (pile.rot || 0);
    if (pile.ox || pile.oy) a = { ...a, x: a.x + (pile.ox || 0) * cw, y: a.y + (pile.oy || 0) * ch };
    const layout = pile.layout || (pile.seat != null && (pile.slot || 'hand') === 'hand' ? 'fan' : pile.slot === 'meld' ? 'spread' : 'stack');
    const n = items.length, out = [];
    const up0 = pile.up ?? true;
    const P = (it, x, y, rot, i) => out.push({ id: it.id, x, y, rot: rot + (it.rot || 0), scale, up: it.up ?? up0, z: (pile.z || 0) + i + 1, mark: it.mark, pile: pile.id });
    const ax = a.ax ?? 1, ay = a.ay ?? 0;
    if (layout === 'stack') {
      const st = Math.min(0.35, 10 / Math.max(1, n));
      items.forEach((it, i) => P(it, a.x - i * st, a.y - i * st, rot0, i));
    } else if (layout === 'fan' || layout === 'row' || layout === 'spread') {
      const gapFull = layout === 'row' ? cw * (pile.gap ?? 1.08) : layout === 'spread' ? cw * (pile.gap ?? 0.32) : cw * (pile.gap ?? (this.rel(pile.seat ?? this.viewer) === 'b' ? 0.86 : 0.42));
      const maxW = pile.maxW ? pile.maxW * M.W : a.maxW ?? M.W;
      let rows = [items];
      if (layout === 'row' && pile.wrap && n > 1) {
        const per = Math.max(1, Math.floor((maxW - cw) / gapFull) + 1);
        if (n > per) { rows = []; const k = Math.ceil(n / Math.ceil(n / per)); for (let i = 0; i < n; i += k) rows.push(items.slice(i, i + k)); }
      }
      let idx = 0;
      rows.forEach((row, ri) => {
        const m = row.length, gap = m > 1 ? Math.min(gapFull, (maxW - cw) / (m - 1)) : 0;
        const rowOff = (ri - (rows.length - 1) / 2) * ch * (pile.rowGap ?? 1.08);
        row.forEach((it, i) => {
          const t = i - (m - 1) / 2;
          let x = a.x + ax * t * gap - ay * rowOff, y = a.y + ay * t * gap + ax * rowOff, rot = rot0;
          if (layout === 'fan' && m > 1) {
            const spread = Math.min(4.5, 28 / m);
            rot += t * spread * (a.rot === 180 ? -1 : 1);
            const arc = Math.abs(t) ** 2 * ch * 0.012;
            if (ay) x += (a.rot === 90 ? -1 : 1) * arc; else y += (a.rot === 180 ? -1 : 1) * arc;
          }
          P(it, x, y, rot, idx++);
        });
      });
    } else if (layout === 'cascade') {
      let y = a.y; const dn = ch * (pile.downGap ?? 0.1), upg = ch * (pile.upGap ?? 0.26);
      const maxH = (pile.maxH ?? 0.6) * M.H; let total = 0;
      items.forEach((it, i) => { if (i) total += (items[i - 1].up ?? up0) ? upg : dn; });
      const k = total > maxH ? maxH / total : 1;
      items.forEach((it, i) => { if (i) y += ((items[i - 1].up ?? up0) ? upg : dn) * k; P(it, a.x, y, rot0, i); });
    } else if (layout === 'grid') {
      const cols = pile.cols || 4;
      items.forEach((it, i) => P(it, a.x + ((i % cols) - (cols - 1) / 2) * cw * 1.08, a.y + Math.floor(i / cols) * ch * 1.06, rot0, i));
    }
    const hit = { x: a.x, y: a.y, w: Math.max(cw, ...out.map((o) => Math.abs(o.x - a.x) * 2 + cw)), h: Math.max(ch, ...out.map((o) => Math.abs(o.y - a.y) * 2 + ch)), rot: rot0 };
    return { cards: out, anchor: a, hit, cw, ch };
  }

  // ---------------------------------------------------------------- render
  // view: from game.view(state, viewer); ctx: { n, viewer, legal: moves the local human may make now, instant }
  render(view, ctx = {}) {
    this.view = view; this.n = ctx.n || this.n; this.viewer = ctx.viewer ?? this.viewer;
    this.legal = ctx.legal || []; this.sel = null;
    this.layout(!ctx.instant && !reduced());
  }
  layout(animate) {
    const view = this.view; if (!view) return;
    const M = this.metrics(); this.M = M;
    this.box.style.setProperty('--cw', `${M.cw}px`); this.box.style.setProperty('--ch', `${M.ch}px`); document.documentElement.style.setProperty('--ch', `${M.ch}px`);
    const seen = new Set(), placed = [], piles = [];
    let src = null;
    for (const pile of view.piles || []) {
      const pl = this.place(pile, M); piles.push([pile, pl]);
      if (pile.source) src = pl;
      for (const c of pl.cards) { placed.push(c); seen.add(c.id); }
    }
    // pile outlines / targets / labels
    const pseen = new Set();
    for (const [pile, pl] of piles) {
      pseen.add(pile.id);
      let el = this.pileEls.get(pile.id);
      if (!el) { el = document.createElement('div'); el.className = 'ct-pile'; el.dataset.pile = pile.id; this.layer.appendChild(el); this.pileEls.set(pile.id, el); }
      const show = pile.outline || pile.label != null && pile.label !== '';
      el.className = `ct-pile${pile.outline ? ' outline' : ''}${pile.cls ? ` ${pile.cls}` : ''}`;
      el.style.width = `${pl.cw}px`; el.style.height = `${pl.ch}px`;
      el.style.transform = `translate3d(${pl.anchor.x - pl.cw / 2}px, ${pl.anchor.y - pl.ch / 2}px, 0) rotate(${pl.anchor.rot || 0}deg)`;
      el.style.visibility = show ? 'visible' : 'hidden';
      el.innerHTML = pile.label != null && pile.label !== '' ? `<span class="ct-lbl">${pile.label}</span>` : '';
      el._hit = pl.hit; el._pile = pile;
    }
    for (const [id, el] of this.pileEls) if (!pseen.has(id)) { el.remove(); this.pileEls.delete(id); }
    // cards
    const legalBy = new Map();
    for (const m of this.legal) if (m.card) { if (!legalBy.has(m.card)) legalBy.set(m.card, []); legalBy.get(m.card).push(m); }
    const hl = new Set(view.hl || []);
    let born = 0;
    for (const c of placed) {
      let el = this.els.get(c.id), fresh = false;
      if (!el) {
        el = document.createElement('button'); el.type = 'button'; el.className = 'ct-card'; el.dataset.card = c.id;
        el.innerHTML = `<span class="ct-lift"><span class="ct-in"><img class="ct-f" alt="" draggable="false"><img class="ct-b" alt="" draggable="false" src="${this.backUrl}"></span></span>`;
        this.layer.appendChild(el); this.els.set(c.id, el); fresh = true;
        if (src && animate) { const s0 = src.anchor; this.setT(el, s0.x, s0.y, s0.rot || 0, src.cw / M.cw, false, false); el.style.zIndex = 400 + born; }
        else if (animate) { el.style.opacity = '0'; this.setT(el, c.x, c.y - 30, c.rot, c.scale, false, false); }
      }
      if (c.up && !el._up) { el.querySelector('.ct-f').src = faceURL(c.id, this.o.style); }
      el._up = c.up;
      el.setAttribute('aria-label', c.up ? cardName(c.id) : 'Carta coperta');
      const moves = legalBy.get(c.id);
      el.classList.toggle('ok', !!moves); el.classList.toggle('hl', hl.has(c.id)); el.classList.toggle('mark', !!c.mark);
      el.classList.toggle('mine', c.pile === view.mine);
      el.disabled = !moves; el.tabIndex = moves ? 0 : -1;
      const prev = this.pos.get(c.id);
      const moved = !prev || Math.abs(prev.x - c.x) > 1 || Math.abs(prev.y - c.y) > 1 || prev.pile !== c.pile;
      const delay = fresh && src && animate ? born++ * 55 : 0;
      const doIt = () => {
        el.style.opacity = '';
        this.setT(el, c.x, c.y, c.rot, c.scale, c.up, animate);
        if (moved && animate) { el.classList.add('fly'); el.style.zIndex = String(300 + c.z); clearTimeout(el._zt); el._zt = setTimeout(() => { el.classList.remove('fly'); el.style.zIndex = String(c.z); }, 460); }
        else el.style.zIndex = String(c.z);
      };
      if (fresh && animate) { void el.offsetWidth; if (delay) { el._dt = setTimeout(() => { doIt(); this.o.sound?.('deal'); }, delay); } else requestAnimationFrame(doIt); }
      else doIt();
      this.pos.set(c.id, c);
    }
    this.dealTime = born * 55 + 420;
    // cards gone from the view: fly to the sink (or fade) and drop
    for (const [id, el] of this.els) {
      if (seen.has(id)) continue;
      this.els.delete(id); this.pos.delete(id);
      if (animate) { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); } else el.remove();
    }
    this.seats(view.seats || [], M);
    this.actions();
  }
  setT(el, x, y, rot, scale, up, animate) {
    el.style.transition = animate ? '' : 'none';
    el.style.transform = `translate3d(${(x - this.M.cw / 2).toFixed(1)}px, ${(y - this.M.ch / 2).toFixed(1)}px, 0) rotate(${(rot || 0).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    el.classList.toggle('down', !up);
    if (!animate) { void el.offsetWidth; el.style.transition = ''; }
  }
  seats(list, M) {
    const keep = new Set();
    list.forEach((s, p) => {
      if (!s) return; keep.add(p);
      let el = this.seatEls.get(p);
      if (!el) { el = document.createElement('div'); el.className = 'ct-seat'; this.layer.appendChild(el); this.seatEls.set(p, el); }
      const r = this.rel(p), a = this.seatAnchor(p, 'hand', M);
      el.className = `ct-seat r-${r}${s.active ? ' on' : ''}${s.think ? ' think' : ''}`;
      if (s.color) el.style.setProperty('--sc', s.color);
      el.innerHTML = `<b>${s.name || ''}</b>${s.sub ? `<span>${s.sub}</span>` : ''}${s.think ? '<i class="ct-dots"><i></i><i></i><i></i></i>' : ''}`;
      let x, y;
      if (r === 'b') { x = M.pad; y = M.H - M.pad - 42; }
      else if (r === 't' || r === 'tl' || r === 'tr') { x = Math.min(M.W - 170, a.x + M.ocw * 1.5); y = M.pad * 0.5; }
      else if (r === 'l') { x = M.pad * 0.5; y = a.y - 22; }
      else { x = M.W - M.pad * 0.5; y = a.y - 22; }
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)${r === 'r' ? ' translateX(-100%)' : ''}`;
    });
    for (const [p, el] of this.seatEls) if (!keep.has(p)) { el.remove(); this.seatEls.delete(p); }
  }
  // moves without a card (pass, knock, draw from the stock if the game says so...) become buttons
  actions() {
    const btns = this.legal.map((m, i) => (!m.card && m.label ? `<button class="btn ${m.primary ? 'primary' : ''}" data-mi="${i}">${m.label}</button>` : '')).join('');
    this.acts.innerHTML = btns; this.acts.classList.toggle('on', !!btns);
  }

  // ---------------------------------------------------------------- input
  movesFor(id) { return this.legal.filter((m) => m.card === id); }
  fire(m) { if (!m) return; this.clearSel(); this.legal = []; this.layer.querySelectorAll('.ct-card.ok').forEach((e) => { e.classList.remove('ok'); e.disabled = true; }); this.acts.innerHTML = ''; this.o.onMove?.(m); }
  clearSel() { this.sel = null; this.layer.querySelectorAll('.ct-card.sel').forEach((e) => e.classList.remove('sel')); this.layer.querySelectorAll('.ct-pile.target').forEach((e) => e.classList.remove('target')); this.preview(null); }
  preview(ids) { const s = new Set(ids || []); for (const [id, el] of this.els) el.classList.toggle('pv', s.has(id)); }
  async choose(id) {
    const ms = this.movesFor(id);
    if (!ms.length) return;
    if (ms.length === 1) { this.fire(ms[0]); return; }
    const targets = [...new Set(ms.map((m) => m.to).filter(Boolean))];
    if (targets.length === ms.length) { // pick the destination pile
      this.clearSel(); this.sel = id; this.els.get(id)?.classList.add('sel');
      for (const t of targets) this.pileEls.get(t)?.classList.add('target');
      for (const m of ms) if (m.show) this.preview(m.show);
      return;
    }
    const m = await this.o.onChoose?.(ms, id);
    if (m) this.fire(m);
  }
  click(e) {
    if (this._dragged) { this._dragged = false; return; }
    const card = e.target.closest('.ct-card'), pile = e.target.closest('.ct-pile');
    if (this.sel) {
      const pid = pile?.dataset.pile || (card && this.pos.get(card.dataset.card)?.pile);
      const m = this.movesFor(this.sel).find((x) => x.to === pid);
      if (m) { this.fire(m); return; }
      if (card?.dataset.card === this.sel) { this.clearSel(); return; }
      this.clearSel();
    }
    if (card && card.classList.contains('ok')) this.choose(card.dataset.card);
  }
  down(e) {
    const card = e.target.closest('.ct-card.ok'); if (!card || e.button > 0) return;
    const id = card.dataset.card, p = this.pos.get(id); if (!p) return;
    const tail = this.movesFor(id).some((m) => m.tail) ? (this.view.piles.find((x) => x.id === p.pile)?.cards || []).map((c) => (typeof c === 'string' ? c : c.id)) : [id];
    const ids = tail.slice(Math.max(0, tail.indexOf(id)));
    this.drag = { id, ids, x0: e.clientX, y0: e.clientY, on: false, pid: e.pointerId };
  }
  moveDrag(e) {
    const d = this.drag; if (!d || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.on && Math.hypot(dx, dy) < 9) return;
    d.on = true;
    d.ids.forEach((id, i) => {
      const el = this.els.get(id), p = this.pos.get(id); if (!el || !p) return;
      el.classList.add('drag'); el.style.transition = 'none'; el.style.zIndex = String(900 + i);
      el.style.transform = `translate3d(${(p.x + dx - this.M.cw / 2).toFixed(1)}px, ${(p.y + dy - this.M.ch / 2).toFixed(1)}px, 0) rotate(${(p.rot || 0) * 0.3}deg) scale(${(p.scale * 1.06).toFixed(3)})`;
    });
    const t = this.pileAt(e.clientX, e.clientY);
    this.layer.querySelectorAll('.ct-pile.over').forEach((x) => x.classList.remove('over'));
    if (t && this.movesFor(d.id).some((m) => m.to === t)) this.pileEls.get(t)?.classList.add('over');
  }
  up(e) {
    const d = this.drag; if (!d || e.pointerId !== d.pid) return;
    this.drag = null;
    if (!d.on) return;
    this._dragged = true; setTimeout(() => { this._dragged = false; }, 50);
    this.layer.querySelectorAll('.ct-pile.over').forEach((x) => x.classList.remove('over'));
    const restore = () => d.ids.forEach((id) => { const el = this.els.get(id), p = this.pos.get(id); if (!el || !p) return; el.classList.remove('drag'); el.style.zIndex = String(p.z); this.setT(el, p.x, p.y, p.rot, p.scale, p.up, true); });
    const ms = this.movesFor(d.id), t = this.pileAt(e.clientX, e.clientY);
    const m = ms.find((x) => x.to && x.to === t);
    if (m) { d.ids.forEach((id) => this.els.get(id)?.classList.remove('drag')); this.fire(m); return; }
    // moves without a destination: dropping the card away from the hand plays it
    const r = this.box.getBoundingClientRect(), y = e.clientY - r.top;
    if (ms.some((x) => !x.to) && y < this.M.H - this.M.ch * 0.9) { d.ids.forEach((id) => this.els.get(id)?.classList.remove('drag')); restore(); this.choose(d.id); return; }
    restore();
  }
  pileAt(cx, cy) {
    const r = this.box.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    let best = null, bd = 1e9;
    for (const [id, el] of this.pileEls) {
      const h = el._hit; if (!h) continue;
      const rot = Math.abs(((h.rot || 0) % 180)) === 90, hw = (rot ? h.h : h.w) / 2 + 10, hh = (rot ? h.w : h.h) / 2 + 10;
      const cxp = h.x + 0, cyp = el._pile?.layout === 'cascade' ? h.y + (h.h - this.M.ch) / 2 : h.y;
      if (Math.abs(x - cxp) <= hw && Math.abs(y - cyp) <= hh) { const dd = Math.hypot(x - cxp, y - cyp); if (dd < bd) { bd = dd; best = id; } }
    }
    return best;
  }
  // keyboard: ← → cycle the playable cards, Enter / Space plays (native button), 1..9 picks
  key(e) {
    const ok = [...this.layer.querySelectorAll('.ct-card.ok')].sort((a, b) => (this.pos.get(a.dataset.card)?.x || 0) - (this.pos.get(b.dataset.card)?.x || 0));
    if (!ok.length) return false;
    const i = ok.indexOf(document.activeElement);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const n = i < 0 ? 0 : (i + (e.key === 'ArrowRight' ? 1 : -1) + ok.length) % ok.length;
      ok[n].focus({ preventScroll: true }); return true;
    }
    const d = /^[1-9]$/.test(e.key) ? +e.key - 1 : -1;
    if (d >= 0 && ok[d]) { ok[d].focus({ preventScroll: true }); this.choose(ok[d].dataset.card); return true; }
    return false;
  }
  focusFirst() { const c = this.layer.querySelector('.ct-card.ok'); if (c && !this.layer.contains(document.activeElement)) c.focus({ preventScroll: true }); }

  // a big floating word over the table ("Scopa!", "Briscola!")
  say(text, cls = '') {
    clearTimeout(this._sayT);
    this.sayEl.innerHTML = `<b class="${cls}">${text}</b>`; this.sayEl.classList.remove('on'); void this.sayEl.offsetWidth; this.sayEl.classList.add('on');
    this._sayT = setTimeout(() => this.sayEl.classList.remove('on'), 1500);
  }
  cardRect(id) { return this.els.get(id)?.getBoundingClientRect(); }
}
export const deckFor = (game, opts) => (opts?.deck || game.decks?.[0] || 'it40');
export { deckOf };
