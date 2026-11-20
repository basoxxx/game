// Tavolo Baso · Scacchi — complete legal chess on a 0x88 board, pure (no DOM): move generation, make/unmake
// with Zobrist hashing, FEN, SAN (English for PGN, Italian letters for the move list), draws (stalemate,
// 50 moves, threefold repetition, insufficient material), PGN export and perft for the tests.
export const WHITE = 0, BLACK = 1;
export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
export const FLAG_EP = 1, FLAG_CASTLE = 2, FLAG_DOUBLE = 4;
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const mFrom = (m) => m & 127;
export const mTo = (m) => (m >> 7) & 127;
export const mPromo = (m) => (m >> 14) & 7;
export const mFlag = (m) => (m >> 17) & 7;
export const mk = (from, to, promo = 0, flag = 0) => from | (to << 7) | (promo << 14) | (flag << 17);
export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
export const sqParse = (n) => (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97);
export const pColor = (p) => p >> 3;
export const pType = (p) => p & 7;

const KN = [33, 31, 18, 14, -14, -18, -31, -33];
const KG = [1, -1, 16, -16, 15, 17, -15, -17];
const DIAG = [15, 17, -15, -17];
const ORTH = [1, -1, 16, -16];
const CMASK = new Int8Array(128).fill(15);
CMASK[0] = 13; CMASK[7] = 14; CMASK[4] = 12; CMASK[112] = 7; CMASK[119] = 11; CMASK[116] = 3;

// Zobrist keys (two 32-bit halves), fixed seed
let zs = 0x9e3779b9;
const zr = () => { zs ^= zs << 13; zs ^= zs >>> 17; zs ^= zs << 5; return zs | 0; };
const ZP = new Int32Array(16 * 128 * 2);
for (let i = 0; i < ZP.length; i++) ZP[i] = zr();
const ZC = new Int32Array(32); for (let i = 0; i < 32; i++) ZC[i] = zr();
const ZE = new Int32Array(16); for (let i = 0; i < 16; i++) ZE[i] = zr();
const ZS = [zr(), zr()];

const PCH = ' pnbrqk';
export class Position {
  constructor(fen = START_FEN) { this.load(fen); }
  load(fen) {
    const b = this.board = new Int8Array(128);
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2) throw new Error('FEN non valida');
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('FEN non valida: servono 8 traverse');
    this.kings = [-1, -1];
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) { f += +ch; continue; }
        const t = PCH.indexOf(ch.toLowerCase()); if (t < 1 || f > 7) throw new Error('FEN non valida: pezzo ' + ch);
        const c = ch === ch.toLowerCase() ? BLACK : WHITE, s = (7 - r) * 16 + f;
        b[s] = t | (c << 3); if (t === K) this.kings[c] = s; f++;
      }
      if (f !== 8) throw new Error('FEN non valida: traversa ' + (8 - r));
    }
    if (this.kings[0] < 0 || this.kings[1] < 0) throw new Error('FEN non valida: manca un re');
    this.side = parts[1] === 'b' ? BLACK : WHITE;
    const c = parts[2] || '-';
    this.castle = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
    // drop rights that the pieces contradict
    if (b[4] !== K || b[7] !== R) this.castle &= ~1; if (b[4] !== K || b[0] !== R) this.castle &= ~2;
    if (b[116] !== (K | 8) || b[119] !== (R | 8)) this.castle &= ~4; if (b[116] !== (K | 8) || b[112] !== (R | 8)) this.castle &= ~8;
    this.ep = parts[3] && parts[3] !== '-' ? sqParse(parts[3]) : -1;
    this.half = +(parts[4] || 0) || 0; this.full = +(parts[5] || 1) || 1;
    this.stack = []; this.rehash();
    this.hist = [this.hlo]; // hash per ply (repetition)
    return this;
  }
  clone() { const p = Object.create(Position.prototype); Object.assign(p, this); p.board = this.board.slice(); p.kings = this.kings.slice(); p.stack = []; p.hist = this.hist.slice(); return p; }
  rehash() {
    let lo = 0, hi = 0; const b = this.board;
    for (let s = 0; s < 128; s++) if (!(s & 0x88) && b[s]) { const i = (b[s] * 128 + s) * 2; lo ^= ZP[i]; hi ^= ZP[i + 1]; }
    lo ^= ZC[this.castle]; hi ^= ZC[this.castle + 16];
    if (this.ep >= 0) { lo ^= ZE[this.ep & 7]; hi ^= ZE[(this.ep & 7) + 8]; }
    if (this.side) { lo ^= ZS[0]; hi ^= ZS[1]; }
    this.hlo = lo; this.hhi = hi;
  }
  fen() {
    const b = this.board; let s = '';
    for (let r = 7; r >= 0; r--) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const p = b[r * 16 + f];
        if (!p) { e++; continue; }
        if (e) { s += e; e = 0; }
        const ch = PCH[p & 7]; s += p >> 3 ? ch : ch.toUpperCase();
      }
      if (e) s += e; if (r) s += '/';
    }
    const c = (this.castle & 1 ? 'K' : '') + (this.castle & 2 ? 'Q' : '') + (this.castle & 4 ? 'k' : '') + (this.castle & 8 ? 'q' : '') || '-';
    return `${s} ${this.side ? 'b' : 'w'} ${c} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  }
  // is square s attacked by colour `by`?
  attacked(s, by) {
    const b = this.board;
    if (by === WHITE) { const a = s - 15, c = s - 17; if ((!(a & 0x88) && b[a] === P) || (!(c & 0x88) && b[c] === P)) return true; }
    else { const a = s + 15, c = s + 17; if ((!(a & 0x88) && b[a] === (P | 8)) || (!(c & 0x88) && b[c] === (P | 8))) return true; }
    const kn = N | (by << 3), kg = K | (by << 3), bi = B | (by << 3), ro = R | (by << 3), qu = Q | (by << 3);
    for (let i = 0; i < 8; i++) { const t = s + KN[i]; if (!(t & 0x88) && b[t] === kn) return true; }
    for (let i = 0; i < 8; i++) { const t = s + KG[i]; if (!(t & 0x88) && b[t] === kg) return true; }
    for (let i = 0; i < 4; i++) {
      const d = DIAG[i]; let t = s + d;
      while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === bi || p === qu) return true; break; } t += d; }
    }
    for (let i = 0; i < 4; i++) {
      const d = ORTH[i]; let t = s + d;
      while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === ro || p === qu) return true; break; } t += d; }
    }
    return false;
  }
  inCheck(c = this.side) { return this.attacked(this.kings[c], c ^ 1); }
  // pseudo-legal moves into `out` (array); caps = captures and promotions only
  gen(out = [], caps = false) {
    const b = this.board, us = this.side, them = us ^ 1;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const p = b[s]; if (!p || p >> 3 !== us) continue;
      const t = p & 7;
      if (t === P) {
        const fw = us ? -16 : 16, lastR = us ? 0 : 7, startR = us ? 6 : 1, to = s + fw;
        if (!(to & 0x88) && !b[to]) {
          if (to >> 4 === lastR) { out.push(mk(s, to, Q), mk(s, to, N)); if (!caps) out.push(mk(s, to, R), mk(s, to, B)); }
          else if (!caps) { out.push(mk(s, to)); const t2 = to + fw; if (s >> 4 === startR && !b[t2]) out.push(mk(s, t2, 0, FLAG_DOUBLE)); }
        }
        for (const dd of [fw - 1, fw + 1]) {
          const c = s + dd; if (c & 0x88) continue;
          const q = b[c];
          if (q && q >> 3 === them) { if (c >> 4 === lastR) { out.push(mk(s, c, Q), mk(s, c, N), mk(s, c, R), mk(s, c, B)); } else out.push(mk(s, c)); }
          else if (c === this.ep) out.push(mk(s, c, 0, FLAG_EP));
        }
      } else if (t === N || t === K) {
        const offs = t === N ? KN : KG;
        for (let i = 0; i < 8; i++) {
          const to = s + offs[i]; if (to & 0x88) continue;
          const q = b[to];
          if (!q) { if (!caps) out.push(mk(s, to)); } else if (q >> 3 === them) out.push(mk(s, to));
        }
        if (t === K && !caps) this.genCastle(out, s);
      } else {
        const dirs = t === B ? DIAG : t === R ? ORTH : KG;
        for (let i = 0; i < dirs.length; i++) {
          const d = dirs[i]; let to = s + d;
          while (!(to & 0x88)) {
            const q = b[to];
            if (!q) { if (!caps) out.push(mk(s, to)); } else { if (q >> 3 === them) out.push(mk(s, to)); break; }
            to += d;
          }
        }
      }
    }
    return out;
  }
  genCastle(out, s) {
    const b = this.board, us = this.side, them = us ^ 1;
    if (us === WHITE && s === 4) {
      if (this.castle & 1 && !b[5] && !b[6] && b[7] === R && !this.attacked(4, them) && !this.attacked(5, them) && !this.attacked(6, them)) out.push(mk(4, 6, 0, FLAG_CASTLE));
      if (this.castle & 2 && !b[3] && !b[2] && !b[1] && b[0] === R && !this.attacked(4, them) && !this.attacked(3, them) && !this.attacked(2, them)) out.push(mk(4, 2, 0, FLAG_CASTLE));
    } else if (us === BLACK && s === 116) {
      if (this.castle & 4 && !b[117] && !b[118] && b[119] === (R | 8) && !this.attacked(116, them) && !this.attacked(117, them) && !this.attacked(118, them)) out.push(mk(116, 118, 0, FLAG_CASTLE));
      if (this.castle & 8 && !b[115] && !b[114] && !b[113] && b[112] === (R | 8) && !this.attacked(116, them) && !this.attacked(115, them) && !this.attacked(114, them)) out.push(mk(116, 114, 0, FLAG_CASTLE));
    }
  }
  xp(p, s) { const i = (p * 128 + s) * 2; this.hlo ^= ZP[i]; this.hhi ^= ZP[i + 1]; }
  // make a pseudo-legal move; returns false (and takes it back) when it leaves the own king in check
  make(m) {
    const b = this.board, from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = (m >> 17) & 7;
    const p = b[from], us = this.side;
    let cap = b[to], capSq = to;
    if (flag & FLAG_EP) { capSq = to + (us ? 16 : -16); cap = b[capSq]; }
    this.stack.push(m, cap, this.castle, this.ep, this.half, this.hlo, this.hhi);
    if (this.ep >= 0) { this.hlo ^= ZE[this.ep & 7]; this.hhi ^= ZE[(this.ep & 7) + 8]; }
    this.hlo ^= ZC[this.castle]; this.hhi ^= ZC[this.castle + 16];
    if (cap) { this.xp(cap, capSq); b[capSq] = 0; }
    this.xp(p, from); b[from] = 0;
    const np = promo ? promo | (us << 3) : p;
    b[to] = np; this.xp(np, to);
    if ((p & 7) === K) {
      this.kings[us] = to;
      if (flag & FLAG_CASTLE) {
        const [rf, rt] = to === 6 ? [7, 5] : to === 2 ? [0, 3] : to === 118 ? [119, 117] : [112, 115];
        const rk = b[rf]; b[rf] = 0; b[rt] = rk; this.xp(rk, rf); this.xp(rk, rt);
      }
    }
    this.castle &= CMASK[from] & CMASK[to];
    this.hlo ^= ZC[this.castle]; this.hhi ^= ZC[this.castle + 16];
    this.ep = -1;
    if (flag & FLAG_DOUBLE) {
      const e = (from + to) >> 1, opp = us ? P : P | 8;
      // only record an en-passant square when a pawn can actually take (keeps repetition hashes honest)
      const l = to - 1, r = to + 1;
      if ((!(l & 0x88) && b[l] === opp) || (!(r & 0x88) && b[r] === opp)) { this.ep = e; this.hlo ^= ZE[e & 7]; this.hhi ^= ZE[(e & 7) + 8]; }
    }
    this.half = cap || (p & 7) === P ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.side ^= 1; this.hlo ^= ZS[0]; this.hhi ^= ZS[1];
    this.hist.push(this.hlo);
    if (this.attacked(this.kings[us], us ^ 1)) { this.unmake(); return false; }
    return true;
  }
  unmake() {
    const st = this.stack, b = this.board;
    const hhi = st.pop(), hlo = st.pop(), half = st.pop(), ep = st.pop(), castle = st.pop(), cap = st.pop(), m = st.pop();
    this.hist.pop();
    this.side ^= 1; const us = this.side;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = (m >> 17) & 7;
    const p = promo ? P | (us << 3) : b[to];
    b[from] = p; b[to] = 0;
    if (flag & FLAG_EP) b[to + (us ? 16 : -16)] = cap; else b[to] = cap;
    if ((p & 7) === K) {
      this.kings[us] = from;
      if (flag & FLAG_CASTLE) {
        const [rf, rt] = to === 6 ? [7, 5] : to === 2 ? [0, 3] : to === 118 ? [119, 117] : [112, 115];
        b[rf] = b[rt]; b[rt] = 0;
      }
    }
    if (us === BLACK) this.full--;
    this.castle = castle; this.ep = ep; this.half = half; this.hlo = hlo; this.hhi = hhi;
  }
  // null move for the search (no ep, side flips)
  makeNull() {
    this.stack.push(0, 0, this.castle, this.ep, this.half, this.hlo, this.hhi);
    if (this.ep >= 0) { this.hlo ^= ZE[this.ep & 7]; this.hhi ^= ZE[(this.ep & 7) + 8]; this.ep = -1; }
    this.side ^= 1; this.hlo ^= ZS[0]; this.hhi ^= ZS[1]; this.half++;
    this.hist.push(this.hlo);
  }
  unmakeNull() {
    const st = this.stack; const hhi = st.pop(), hlo = st.pop(), half = st.pop(), ep = st.pop(), castle = st.pop(); st.pop(); st.pop();
    this.hist.pop(); this.side ^= 1; this.castle = castle; this.ep = ep; this.half = half; this.hlo = hlo; this.hhi = hhi;
  }
  legal() {
    const out = [], ps = this.gen([]);
    for (const m of ps) if (this.make(m)) { this.unmake(); out.push(m); }
    return out;
  }
  hasLegal() { const ps = this.gen([]); for (const m of ps) if (this.make(m)) { this.unmake(); return true; } return false; }
  // repetitions of the current position within reversible plies (2 = it already happened twice before)
  repeats() {
    const h = this.hist, n = h.length - 1, cur = h[n]; let c = 0;
    for (let i = n - 2; i >= 0 && i >= n - this.half; i -= 2) if (h[i] === cur) c++;
    return c;
  }
  insufficient() {
    const b = this.board; let minors = 0, bishops = [], other = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      const t = b[s] & 7; if (!t || t === K) continue;
      if (t === N) minors++; else if (t === B) { minors++; bishops.push(((s >> 4) + (s & 7)) & 1); } else other++;
    }
    if (other) return false;
    if (minors <= 1) return true;
    // only bishops, all on the same colour
    return bishops.length === minors && bishops.every((x) => x === bishops[0]);
  }
  // { over, result: '1-0'|'0-1'|'1/2-1/2', why }
  status() {
    if (!this.hasLegal()) {
      if (this.inCheck()) return { over: true, result: this.side ? '1-0' : '0-1', why: 'mate' };
      return { over: true, result: '1/2-1/2', why: 'stallo' };
    }
    if (this.insufficient()) return { over: true, result: '1/2-1/2', why: 'materiale' };
    if (this.half >= 100) return { over: true, result: '1/2-1/2', why: '50mosse' };
    if (this.repeats() >= 2) return { over: true, result: '1/2-1/2', why: 'ripetizione' };
    return { over: false };
  }
  // SAN for a legal move (call before making it). it = Italian letters for the on-screen list
  san(m, it = false) {
    const b = this.board, from = mFrom(m), to = mTo(m), promo = mPromo(m), flag = mFlag(m), p = b[from], t = p & 7;
    const L = it ? ' PCATDR' : ' PNBRQK';
    let s;
    if (flag & FLAG_CASTLE) s = (to & 7) === 6 ? 'O-O' : 'O-O-O';
    else {
      const cap = b[to] || flag & FLAG_EP;
      if (t === P) s = (cap ? 'abcdefgh'[from & 7] + 'x' : '') + sqName(to) + (promo ? '=' + L[promo] : '');
      else {
        let amb = false, sameF = false, sameR = false;
        for (const o of this.legal()) {
          if (o === m || mTo(o) !== to || mFrom(o) === from || b[mFrom(o)] !== p) continue;
          amb = true; if ((mFrom(o) & 7) === (from & 7)) sameF = true; if ((mFrom(o) >> 4) === (from >> 4)) sameR = true;
        }
        let d = '';
        if (amb) d = !sameF ? 'abcdefgh'[from & 7] : !sameR ? String((from >> 4) + 1) : sqName(from);
        s = L[t] + d + (cap ? 'x' : '') + sqName(to);
      }
    }
    this.make(m);
    if (this.inCheck()) s += this.hasLegal() ? '+' : '#';
    this.unmake();
    return s;
  }
  // parse SAN or UCI ("e2e4", "e7e8q") into a legal move, or 0
  parse(str) {
    str = String(str).trim().replace(/[+#!?]/g, '').replace(/0/g, 'O');
    const leg = this.legal();
    const u = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(str);
    if (u) {
      const f = sqParse(u[1].toLowerCase()), t = sqParse(u[2].toLowerCase()), pr = u[3] ? ' pnbrqk'.indexOf(u[3].toLowerCase()) : 0;
      return leg.find((m) => mFrom(m) === f && mTo(m) === t && mPromo(m) === (pr || (mPromo(m) ? Q : 0))) || 0;
    }
    for (const m of leg) { const s = this.san(m).replace(/[+#]/g, ''); if (s === str) return m; }
    return 0;
  }
  uci(m) { return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? ' pnbrqk'[mPromo(m)] : ''); }
}

export function perft(pos, d) {
  if (d === 0) return 1;
  const ms = pos.gen([]); let n = 0;
  for (const m of ms) { if (!pos.make(m)) continue; n += d === 1 ? 1 : perft(pos, d - 1); pos.unmake(); }
  return n;
}

// PGN of a game: moves = list of SAN strings from startFen
export function toPGN({ moves, result = '*', white = 'Bianco', black = 'Nero', startFen = START_FEN, date = new Date(), event = 'Tavolo Baso' }) {
  const d = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const tags = [['Event', event], ['Site', 'Baso Hub'], ['Date', d], ['Round', '-'], ['White', white], ['Black', black], ['Result', result]];
  if (startFen !== START_FEN) tags.push(['SetUp', '1'], ['FEN', startFen]);
  const p = new Position(startFen);
  let n = p.full, black0 = p.side === BLACK, body = '';
  moves.forEach((s, i) => {
    if (i === 0 && black0) body += `${n}... `;
    else if ((i + (black0 ? 1 : 0)) % 2 === 0) body += `${n}. `;
    body += s + ' ';
    if ((i + (black0 ? 1 : 0)) % 2 === 1) n++;
  });
  body += result;
  const lines = []; let line = '';
  for (const w of body.split(' ')) { if ((line + ' ' + w).length > 78) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w; }
  if (line) lines.push(line);
  return tags.map(([k, v]) => `[${k} "${v}"]`).join('\n') + '\n\n' + lines.join('\n') + '\n';
}
