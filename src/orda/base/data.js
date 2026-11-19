// Orda · La tua base — building catalogue, grid rules and balance tables. Pure data + tiny helpers
// (no DOM, no three.js): shared by the editor, the raid generator, the level converter and the
// offline defence simulation, and testable on its own.
//
// The grid is GRID×GRID cells. Row 0 is the front (where attackers come in), row GRID-1 the back.
// A layout is { b: [{ id, t: type, x, y, l: level }], nid } — see store.js.

export const GRID = 9;
export const HOUR = 3600e3;

// ---- player progression from the campaign. `lvl` = highest campaign level cleared (0 = none).
// Buildings and HQ levels unlock along the campaign so the base grows with it, never ahead of it.
export const HQ_UNLOCK = [0, 0, 4, 9, 15, 22, 30]; // campaign level needed for HQ level i (index = HQ level)

// stat helpers per level (l = 1..max)
const geo = (a, r) => (l) => Math.round(a * Math.pow(r, l - 1));
const lin = (a, b) => (l) => a + b * (l - 1);

// cost(l) = price to BUILD (l = 1) or UPGRADE to level l. Bricks are the base currency; coins (shared
// with the campaign wallet) only appear on the higher levels, so the base never starves the campaign.
const cost = (b0, br, c0, cr, cFrom = 3) => (l) => ({ bricks: Math.round(b0 * Math.pow(br, l - 1) / 5) * 5, coins: l >= cFrom ? Math.round(c0 * Math.pow(cr, l - cFrom) / 5) * 5 : 0 });

export const BUILDINGS = {
  hq: {
    name: 'Quartier generale', short: 'QG', kind: 'core', size: 2, max: 6, unlock: 0, color: '#3b82f6', icon: '🏰',
    desc: 'Il cuore della base: i suoi punti vita sono quelli della base. Alzarlo di livello sblocca più edifici e livelli più alti.',
    hp: geo(150, 1.4), cost: (l) => ({ bricks: [0, 0, 180, 420, 800, 1400, 2300][l], coins: [0, 0, 120, 260, 480, 800, 1300][l] }),
    stat: (l) => [['Punti vita', BUILDINGS.hq.hp(l)], ['Livello max edifici', l]],
  },
  muro: {
    name: 'Muro', kind: 'wall', size: 1, max: 6, unlock: 0, color: '#d6b38a', icon: '🧱',
    desc: 'Blocca l’orda: le figurine devono abbatterlo prima di passare. Economico e robusto.',
    hp: geo(14, 1.45), cost: cost(10, 1.75, 15, 1.6, 4),
    stat: (l) => [['Punti vita', BUILDINGS.muro.hp(l)]],
  },
  gelo: {
    name: 'Torre Gelo', kind: 'tower', size: 1, max: 5, unlock: 6, color: '#7dd3fc', icon: '❄️',
    desc: 'Rallenta tutte le figurine nel raggio e ne congela qualcuna. Perfetta davanti alle torri d’attacco.',
    hp: geo(24, 1.35), range: lin(2.4, 0.2), slow: lin(0.35, 0.06), dps: lin(1.2, 0.5), cost: cost(60, 1.7, 40, 1.6),
    stat: (l) => { const B = BUILDINGS.gelo; return [['Rallentamento', `${Math.round(B.slow(l) * 100)}%`], ['Raggio', `${B.range(l).toFixed(1)} caselle`], ['Figurine/s', B.dps(l).toFixed(1)], ['Punti vita', B.hp(l)]]; },
  },
  mortaio: {
    name: 'Mortaio', kind: 'tower', size: 1, max: 5, unlock: 8, color: '#f97316', icon: '💥',
    desc: 'Colpi ad area lenti ma devastanti sui gruppi numerosi.',
    hp: geo(28, 1.35), range: lin(3, 0.15), splash: lin(4, 2), reload: lin(2.4, -0.15), cost: cost(80, 1.7, 55, 1.6),
    stat: (l) => { const B = BUILDINGS.mortaio; return [['Figurine per colpo', `fino a ${B.splash(l)}`], ['Ricarica', `${B.reload(l).toFixed(1)} s`], ['Raggio', `${B.range(l).toFixed(1)} caselle`], ['Punti vita', B.hp(l)]]; },
  },
  cecchino: {
    name: 'Torre Cecchino', kind: 'tower', size: 1, max: 5, unlock: 11, color: '#a78bfa', icon: '🎯',
    desc: 'Tira lontanissimo, una figurina alla volta ma velocissima. Copre tutta la base dalle retrovie.',
    hp: geo(22, 1.35), range: lin(4.5, 0.4), dps: lin(2.2, 0.8), cost: cost(90, 1.7, 70, 1.6),
    stat: (l) => { const B = BUILDINGS.cecchino; return [['Figurine/s', B.dps(l).toFixed(1)], ['Raggio', `${B.range(l).toFixed(1)} caselle`], ['Punti vita', B.hp(l)]]; },
  },
  caserma: {
    name: 'Caserma rossa', kind: 'spawner', size: 1, max: 5, unlock: 3, color: '#ef4444', icon: '🚩',
    desc: 'Sforna figurine rosse che corrono incontro all’orda: ognuna ne ferma una avversaria.',
    hp: geo(30, 1.35), rate: lin(1.4, 0.6), cap: lin(10, 6), cost: cost(50, 1.7, 45, 1.6),
    stat: (l) => { const B = BUILDINGS.caserma; return [['Figurine rosse/s', B.rate(l).toFixed(1)], ['Massimo in campo', B.cap(l)], ['Punti vita', B.hp(l)]]; },
  },
  porta: {
    name: 'Porta trappola', kind: 'trap', size: 1, max: 4, unlock: 5, color: '#f43f5e', icon: '➗',
    desc: 'Una porta moltiplicatrice al contrario: chi la attraversa viene diviso. Mettila sui passaggi obbligati.',
    hp: () => 0, op: (l) => [null, { op: 'div', v: 2 }, { op: 'div', v: 2, sub: 4 }, { op: 'div', v: 3 }, { op: 'div', v: 3, sub: 8 }][l], cost: cost(70, 1.9, 60, 1.7),
    stat: (l) => [['Effetto', gateLabel(BUILDINGS.porta.op(l))]],
  },
  miniera: {
    name: 'Miniera d’oro', kind: 'prod', res: 'coins', size: 1, max: 5, unlock: 1, color: '#facc15', icon: '🪙',
    desc: 'Estrae monete anche quando non giochi. Raccoglile prima che il deposito si riempia.',
    hp: geo(20, 1.35), rate: lin(6, 4), capH: lin(8, 2), cost: cost(40, 1.8, 50, 1.6),
    stat: (l) => { const B = BUILDINGS.miniera; return [['Monete/ora', B.rate(l)], ['Deposito', `${B.rate(l) * B.capH(l)} (${B.capH(l)} h)`], ['Punti vita', B.hp(l)]]; },
  },
  fornace: {
    name: 'Fornace', kind: 'prod', res: 'bricks', size: 1, max: 5, unlock: 0, color: '#fb7185', icon: '🏭',
    desc: 'Cuoce mattoni nel tempo reale, anche a gioco chiuso. I mattoni servono a costruire e potenziare.',
    hp: geo(20, 1.35), rate: lin(14, 9), capH: lin(8, 2), cost: cost(30, 1.8, 40, 1.6),
    stat: (l) => { const B = BUILDINGS.fornace; return [['Mattoni/ora', B.rate(l)], ['Deposito', `${B.rate(l) * B.capH(l)} (${B.capH(l)} h)`], ['Punti vita', B.hp(l)]]; },
  },
  scudo: {
    name: 'Generatore scudo', kind: 'shield', size: 1, max: 4, unlock: 14, color: '#22d3ee', icon: '🛡️',
    desc: 'Dopo un attacco tiene la base al riparo più a lungo e protegge parte del bottino. In battaglia rinforza il QG.',
    hp: geo(35, 1.38), shieldH: lin(3, 2), protect: lin(0.15, 0.1), hqBoost: lin(0.1, 0.06), cost: cost(150, 1.8, 120, 1.6, 1),
    stat: (l) => { const B = BUILDINGS.scudo; return [['Scudo extra', `+${B.shieldH(l)} h`], ['Bottino protetto', `${Math.round(B.protect(l) * 100)}%`], ['QG rinforzato', `+${Math.round(B.hqBoost(l) * 100)}%`], ['Punti vita', B.hp(l)]]; },
  },
};
export const TYPES = Object.keys(BUILDINGS);
// palette order in the editor
export const PALETTE = ['muro', 'fornace', 'miniera', 'caserma', 'porta', 'gelo', 'mortaio', 'cecchino', 'scudo'];

export function gateLabel(g) {
  if (!g) return '';
  return `÷${g.v}${g.sub ? ` −${g.sub}` : ''}`;
}

// how many of each type the HQ level allows
const LIMITS = {
  hq: [1, 1, 1, 1, 1, 1],
  muro: [8, 12, 16, 20, 24, 28],
  fornace: [1, 1, 2, 2, 3, 3],
  miniera: [1, 1, 1, 2, 2, 3],
  caserma: [1, 1, 2, 2, 3, 3],
  porta: [1, 2, 2, 3, 3, 4],
  gelo: [1, 1, 2, 2, 3, 3],
  mortaio: [1, 1, 1, 2, 2, 3],
  cecchino: [1, 1, 1, 2, 2, 2],
  scudo: [1, 1, 1, 1, 1, 1],
};
export const limitOf = (t, hq) => LIMITS[t]?.[Math.max(1, Math.min(6, hq)) - 1] ?? 0;
// building levels can't exceed the HQ level (walls get one extra level of slack)
export const maxLevelAt = (t, hq) => (t === 'hq' ? BUILDINGS.hq.max : Math.min(BUILDINGS[t].max, hq + (t === 'muro' ? 1 : 0)));
// a type is available once the campaign got far enough (HQ requirement counts as well)
export const typeUnlocked = (t, prog) => (prog?.lvl || 0) >= BUILDINGS[t].unlock;
export const hqUnlocked = (l, prog) => (prog?.lvl || 0) >= (HQ_UNLOCK[l] ?? 999);

// Value of a building (bricks + coins invested, coins count double): weights destruction % and loot.
export function investOf(t, l) {
  let v = 0;
  for (let i = 1; i <= l; i++) { const c = BUILDINGS[t].cost(i); v += c.bricks + 2 * c.coins; }
  return v + (t === 'hq' ? 300 : 0);
}

// ---- raids
export const RAID_TOKENS = 3;            // max raid tickets
export const RAID_REGEN_H = 1.5;         // one ticket every 90 minutes
export const RIVAL_REFRESH_H = 4;        // free new rivals every 4 hours
export const RIVAL_REROLL_COINS = 25;    // or pay to reroll now
export const REVENGE_BONUS = 1.5;        // loot multiplier on the attacker's base
export const REVENGE_TTL_H = 48;

// ---- offline attacks on the player's base
export const ATTACK_SLOT_H = 6;          // the world is split in 6-hour slots…
export const ATTACK_CHANCE = 0.3;       // …each with this chance of an attack
export const ATTACK_MAX_PER_RETURN = 2;
export const ATTACK_MIN_AWAY_H = 1;      // never while you are around (away at least 1 h)
export const SHIELD_BASE_H = 4;          // after any attack…
export const SHIELD_HEAVY_H = 4;         // …and more when it went badly (> 50% destroyed)
export const NEWBIE_CAMPAIGN = 3;        // no attacks before campaign level 3
export const LOSS_MAX = 0.25;            // never lose more than 25% of uncollected production…
export const BANK_LOSS_MAX = 0.05;       // …and 5% (capped) of the bricks in the bank. Coins in the wallet are never stolen.
