// Kart Baso — heads-up display, one per viewport: place, lap, item slot (with roulette), coins,
// countdown, messages, speed lines, battle balloons, a mini map and the live standings.
import { ITEMS, ITEM_IDS, charById } from './data.js';

export const PCOL = ['#ff3b6b', '#3b82f6', '#2fd77f', '#ffc928'];
// item icons (inline SVG, 64×64)
export const ITEM_SVG = {
  peperoncino: '<path d="M44 10c-2 4-1 7 2 9" stroke="#2fbf4a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M46 20c6 4 4 18-8 28S10 58 8 54s10-6 18-16 12-22 20-18z" fill="#ff3b2f"/><path d="M36 26c-4 8-10 16-18 22" stroke="#ff9a8a" stroke-width="3" fill="none" stroke-linecap="round"/>',
  tris: '<g transform="translate(-10 4) scale(.7)"><path d="M46 20c6 4 4 18-8 28S10 58 8 54s10-6 18-16 12-22 20-18z" fill="#ff3b2f"/></g><g transform="translate(10 -2) scale(.7)"><path d="M46 20c6 4 4 18-8 28S10 58 8 54s10-6 18-16 12-22 20-18z" fill="#ff6a2f"/></g><g transform="translate(14 22) scale(.7)"><path d="M46 20c6 4 4 18-8 28S10 58 8 54s10-6 18-16 12-22 20-18z" fill="#ff3b2f"/></g>',
  olio: '<path d="M32 8c8 14 16 22 16 32a16 16 0 0 1-32 0c0-10 8-18 16-32z" fill="#3a2f4a"/><ellipse cx="26" cy="36" rx="5" ry="8" fill="#b48cff" opacity=".7"/>',
  bomba: '<circle cx="30" cy="38" r="20" fill="#2b2d42"/><rect x="10" y="34" width="40" height="7" fill="#ff3b6b"/><circle cx="23" cy="31" r="4" fill="#fff"/><circle cx="37" cy="31" r="4" fill="#fff"/><path d="M40 20l8-8" stroke="#8a6a3a" stroke-width="4"/><circle cx="50" cy="10" r="5" fill="#ffb02e"/>',
  ricciolo: '<path d="M12 44c6-14 14-4 20-16s14-4 20-16" stroke="#ffd23f" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M12 44c6-14 14-4 20-16s14-4 20-16" stroke="#c89a10" stroke-width="2" fill="none" stroke-dasharray="4 6"/>',
  scudo: '<circle cx="32" cy="32" r="22" fill="#4ad6ff" opacity=".35" stroke="#4ad6ff" stroke-width="4"/><ellipse cx="25" cy="23" rx="7" ry="4" fill="#fff" opacity=".8"/>',
  calamita: '<path d="M14 14v18a18 18 0 0 0 36 0V14" stroke="#ff4d6d" stroke-width="12" fill="none"/><rect x="8" y="8" width="12" height="10" fill="#e5e7eb"/><rect x="44" y="8" width="12" height="10" fill="#e5e7eb"/>',
  moka: '<path d="M20 26h24l-4 30H24z" fill="#c9d1dc"/><path d="M22 8h20l4 18H18z" fill="#9aa3ad"/><path d="M44 30h8v12h-8" stroke="#22252b" stroke-width="4" fill="none"/><path d="M26 4c2 2 0 4 2 6M34 2c2 2 0 4 2 6" stroke="#fff" stroke-width="2" fill="none"/><circle cx="32" cy="40" r="5" fill="#ffd23f"/>',
  monete: '<path d="M16 24c0-6 32-6 32 0l4 28c0 6-40 6-40 0z" fill="#c08457"/><circle cx="32" cy="38" r="9" fill="#f5c542"/><text x="32" y="43" font-size="13" text-anchor="middle" font-weight="900" fill="#8a5a00">3</text>',
};
export const itemIcon = (id, size = 48) => `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${ITEM_SVG[id] || ''}</svg>`;
const COIN = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f5c542" stroke="#b8860b" stroke-width="2"/><path d="M12 6v12M9 9h5a2 2 0 0 1 0 4H10a2 2 0 0 0 0 4h5" stroke="#8a5a00" stroke-width="1.6" fill="none"/></svg>';
const ord = (n) => `${n}°`;
const fmtT = (s) => { if (!isFinite(s)) return '--:--.--'; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(2).padStart(5, '0')}`; };
export { fmtT };

export class Hud {
  constructor(root, sim, players, o = {}) {
    this.root = root; this.sim = sim; this.players = players; this.o = o;
    this.el = document.createElement('div'); this.el.className = 'kt-hud' + (players.length > 1 ? ' multi' : '') + (sim.battle ? ' battle' : ' race'); root.appendChild(this.el);
    this.multi = players.length > 1;
    this.vp = players.map((p, i) => this.makeVp(p, i));
    if (!sim.battle && players.length <= 2) this.makeMap();
    if (!this.multi && !o.compact) this.makeBoard();
    this.t = 0; this.last = {};
  }
  makeVp(p, i) {
    const d = document.createElement('div'); d.className = 'kt-vp'; d.style.setProperty('--pc', PCOL[i]);
    const S = this.sim;
    d.innerHTML = `<div class="kt-lines"></div><div class="kt-flash"></div>
      <div class="kt-tl">${S.battle ? `<div class="kt-balloons"></div><div class="kt-hits"></div>` : `<div class="kt-pos"><b>1°</b><span>/${S.karts.length}</span></div><div class="kt-lap">Giro <b>1</b>/${S.laps}</div>`}</div>
      <div class="kt-tr"><div class="kt-time">0:00.00</div>${this.multi ? '' : '<div class="kt-laps"></div>'}</div>
      <div class="kt-item"><div class="kt-item-in"></div><em></em></div>
      <div class="kt-coins">${COIN}<b>0</b></div>
      ${this.multi ? `<div class="kt-tag">G${i + 1}</div>` : ''}
      <div class="kt-msg"></div><div class="kt-count"></div><div class="kt-wrong">Contromano!</div>
      <div class="kt-speed"><b>0</b> km/h</div><div class="kt-drift"><i></i><i></i><i></i></div>`;
    this.el.appendChild(d);
    const q = (s) => d.querySelector(s);
    return { d, pos: q('.kt-pos b'), lap: q('.kt-lap b'), time: q('.kt-time'), laps: q('.kt-laps'), item: q('.kt-item-in'), uses: q('.kt-item em'), slot: q('.kt-item'), coins: q('.kt-coins b'), msg: q('.kt-msg'), count: q('.kt-count'), wrong: q('.kt-wrong'), lines: q('.kt-lines'), flash: q('.kt-flash'), speed: q('.kt-speed b'), drift: q('.kt-drift'), balloons: q('.kt-balloons'), hits: q('.kt-hits'), last: {}, msgT: 0, roulT: 0 };
  }
  makeMap() {
    const W = this.sim.world.main; const c = document.createElement('canvas'); c.className = 'kt-map'; c.width = 180; c.height = 180;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < W.n; i++) { minx = Math.min(minx, W.x[i]); maxx = Math.max(maxx, W.x[i]); minz = Math.min(minz, W.z[i]); maxz = Math.max(maxz, W.z[i]); }
    const sc = 160 / Math.max(maxx - minx, maxz - minz), ox = 90 - ((minx + maxx) / 2) * sc, oz = 90 - ((minz + maxz) / 2) * sc;
    // the map is drawn so that the start straight points up the screen
    this.mapT = (x, z) => [ox + x * sc, oz + z * sc];
    const base = document.createElement('canvas'); base.width = base.height = 180; const g = base.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const [col, w] of [['rgba(0,0,0,.45)', 13], ['rgba(255,255,255,.9)', 8]]) {
      g.strokeStyle = col; g.lineWidth = w;
      for (const p of this.sim.world.paths) { g.beginPath(); for (let i = 0; i < p.n; i++) { const [x, y] = this.mapT(p.x[i], p.z[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } if (p.closed) g.closePath(); g.stroke(); }
    }
    const [sx, sy] = this.mapT(W.x[0], W.z[0]); g.fillStyle = '#111'; g.fillRect(sx - 4, sy - 4, 8, 8);
    this.mapBase = base; this.map = c; this.mapG = c.getContext('2d');
    this.el.appendChild(c);
  }
  makeBoard() { const b = document.createElement('ol'); b.className = 'kt-board'; this.el.appendChild(b); this.board = b; }
  layout(vps, W, H) {
    this.vps = vps;
    vps.forEach((v, i) => { if (!this.vp[i]) return; const s = this.vp[i].d.style; s.left = v.x + 'px'; s.top = v.y + 'px'; s.width = v.w + 'px'; s.height = v.h + 'px'; this.vp[i].d.classList.toggle('small', v.w < 560 || v.h < 380); this.vp[i].d.classList.toggle('tiny', v.w < 380 || v.h < 260); });
    if (this.map) {
      const small = Math.min(W, H) < 560;
      const sz = this.multi ? Math.min(124, Math.min(W, H) * 0.2) : small ? 104 : 168;
      Object.assign(this.map.style, { width: sz + 'px', height: sz + 'px' });
      this.map.className = 'kt-map' + (this.multi ? ' mid' : '');
    }
  }
  msg(i, text, cls = '', dur = 1.4) { const v = this.vp[i]; if (!v) return; v.msg.textContent = text; v.msg.className = 'kt-msg on ' + cls; v.msgT = dur; }
  flash(i, col = '#fff') { const v = this.vp[i]; if (!v) return; v.flash.style.background = col; v.flash.classList.remove('on'); void v.flash.offsetWidth; v.flash.classList.add('on'); }
  update(dt) {
    this.t += dt;
    const S = this.sim, slow = (this.acc = (this.acc || 0) + dt) > 1 / 15;
    if (slow) this.acc = 0;
    this.players.forEach((p, i) => {
      const v = this.vp[i], k = S.karts[p.kart];
      const L = v.last;
      // countdown
      const cd = S.state === 'count' ? Math.ceil(S.countT) : S.t < 0.9 && S.state === 'race' ? 0 : -1;
      if (cd !== L.cd) { L.cd = cd; v.count.textContent = cd > 3 ? '' : cd > 0 ? String(cd) : cd === 0 ? 'Via!' : ''; v.count.className = 'kt-count' + (cd >= 0 && cd <= 3 ? ' on' : '') + (cd === 0 ? ' go' : ''); }
      if (v.msgT > 0) { v.msgT -= dt; if (v.msgT <= 0) v.msg.className = 'kt-msg'; }
      // speed lines
      const boost = k.boostT > 0 || k.mokaT > 0 ? 1 : 0;
      const sl = boost ? 0.9 : Math.max(0, (k.fwd - 24) / 10) * 0.35;
      if (Math.abs(sl - (L.sl ?? -1)) > 0.05) { L.sl = sl; v.lines.style.opacity = sl.toFixed(2); }
      // item slot
      if (k.roul > 0) { v.roulT -= dt; if (v.roulT <= 0) { v.roulT = 0.07; const id = ITEM_IDS[Math.floor(this.t * 14) % ITEM_IDS.length]; v.item.innerHTML = itemIcon(id); L.item = '?'; v.slot.classList.add('roll'); } }
      else if (L.item !== (k.item || '') + k.uses) { L.item = (k.item || '') + k.uses; v.slot.classList.remove('roll'); v.item.innerHTML = k.item ? itemIcon(ITEMS[k.item].as && k.uses < 3 ? ITEMS[k.item].as : k.item) : ''; v.uses.textContent = k.item && k.uses > 1 ? `×${k.uses}` : ''; v.slot.classList.toggle('has', !!k.item); if (k.item) v.slot.classList.add('pop'); setTimeout(() => v.slot.classList.remove('pop'), 300); }
      // drift tier
      const dt_ = k.drift ? k.dTier : -1;
      if (dt_ !== L.dt) { L.dt = dt_; v.drift.className = 'kt-drift' + (dt_ >= 0 ? ' on t' + dt_ : ''); }
      if (!slow) return;
      v.wrong.classList.toggle('on', k.wrongT > 1 && S.state === 'race');
      if (S.battle) {
        if (L.bal !== k.balloons) { L.bal = k.balloons; v.balloons.innerHTML = Array.from({ length: Math.max(3, k.balloons) }, (_, j) => `<i class="${j < k.balloons ? 'on' : ''}" style="--c:${PCOL[i]}"></i>`).join(''); }
        if (L.hits !== k.hits) { L.hits = k.hits; v.hits.textContent = `${k.hits} ${k.hits === 1 ? 'colpo' : 'colpi'} · ${ord(k.place)}`; }
        const left = Math.max(0, S.timeLimit - S.t); const tt = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`; if (L.tt !== tt) { L.tt = tt; v.time.textContent = tt; }
      } else {
        if (L.pos !== k.place) { L.pos = k.place; v.pos.innerHTML = `${k.place}<small>°</small>`; v.pos.parentElement.dataset.p = k.place; }
        const lap = Math.min(S.laps, Math.max(1, k.lap)); if (L.lap !== lap) { L.lap = lap; v.lap.textContent = lap; }
        const tt = k.finished ? fmtT(k.finishT) : fmtT(S.state === 'count' ? 0 : S.t); if (L.tt !== tt) { L.tt = tt; v.time.textContent = tt; }
        if (v.laps) { const s = k.lapTimes.map((x, j) => `<div><span>G${j + 1}</span>${fmtT(x)}</div>`).join(''); if (L.lt !== s) { L.lt = s; v.laps.innerHTML = s; } }
      }
      if (L.coins !== k.coins) { L.coins = k.coins; v.coins.textContent = k.coins; v.coins.parentElement.classList.toggle('max', k.coins >= 10); }
      const kmh = Math.round(Math.max(0, k.fwd) * 5.4); if (L.kmh !== kmh) { L.kmh = kmh; v.speed.textContent = kmh; }
    });
    if (slow && this.map) {
      const g = this.mapG; g.clearRect(0, 0, 180, 180); g.drawImage(this.mapBase, 0, 0);
      for (const k of [...S.karts].sort((a, b) => (a.human >= 0) - (b.human >= 0))) { const [x, y] = this.mapT(k.x, k.z); g.beginPath(); g.arc(x, y, k.human >= 0 ? 6.5 : 4.5, 0, 7); g.fillStyle = k.human >= 0 ? PCOL[k.human] : charById(k.char).color; g.fill(); g.lineWidth = 2; g.strokeStyle = k.human >= 0 ? '#fff' : 'rgba(0,0,0,.6)'; g.stroke(); }
      for (const p of S.proj) { if (p.type !== 'ricciolo') continue; const [x, y] = this.mapT(p.x, p.z); g.fillStyle = '#ffd23f'; g.fillRect(x - 2, y - 2, 4, 4); }
    }
    if (slow && this.board) {
      const html = (S.order || S.karts).map((k) => `<li class="${k.human >= 0 ? 'me' : ''}" style="--c:${charById(k.char).color}"><span>${k.place}</span><i></i>${esc(k.name)}${S.battle ? `<em>${'●'.repeat(k.balloons)}</em>` : k.finished && !k.estimated ? `<em>${fmtT(k.finishT)}</em>` : ''}</li>`).join('');
      if (html !== this.last.board) { this.last.board = html; this.board.innerHTML = html; }
    }
  }
  destroy() { this.el.remove(); }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
