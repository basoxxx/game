// Bonus objectives (v5): three side goals per event, shown in the HUD at the start and ticked in
// the results; each pays a few credits. They are picked per mode, deterministically per venue so a
// replayed event keeps the same goals.
const O = {
  kill1: { text: 'Demolisci almeno un avversario', prize: 1500, ok: (g, r) => (r.kills || 0) >= 1 },
  kill2: { text: 'Demolisci due avversari', prize: 2500, ok: (g, r) => (r.kills || 0) >= 2 },
  kill3: { text: 'Demolisci tre avversari', prize: 3500, ok: (g, r) => (r.kills || 0) >= 3 },
  combo2: { text: 'Raggiungi una combo x2', prize: 1500, ok: (g) => (g.maxCombo || 1) >= 2 },
  combo3: { text: 'Raggiungi una combo x3', prize: 2500, ok: (g) => (g.maxCombo || 1) >= 3 },
  hp50: { text: 'Chiudi con il telaio sopra il 50%', prize: 1500, ok: (g) => g.player.hp >= 50 },
  hp80: { text: 'Non scendere sotto l’80% di telaio', prize: 2000, ok: (g) => (g.player.minHp ?? 100) >= 80 },
  jump25: { text: 'Fai un salto di almeno 30 m', prize: 1500, ok: (g) => (g.maxJump || 0) >= 30 },
  jump40: { text: 'Fai un salto di almeno 50 m', prize: 2000, ok: (g) => (g.maxJump || 0) >= 50 },
  // v7: the long jump's own (maxJump is not tracked on the ramp, and 50 m there is a given)
  bronze2: { text: 'Due salti oltre il bronzo', prize: 2000, ok: (g) => (g.stunt?.dists || []).filter((d) => d >= (g.targets?.[0] || 1e9)).length >= 2 },
  rimonta: { text: 'Rimonta: guadagna 3 posizioni dal via', prize: 2000, ok: (g, r) => (g.startPos || 1) - r.pos >= 3 },
  podio: { text: 'Sali sul podio', prize: 1500, ok: (g, r) => r.pos <= 3 },
  pulito: { text: 'Nessun riposizionamento', prize: 1500, ok: (g) => !(g.simStats.perCar?.[g.player.name]?.respawn) },
  pelo3: { text: 'Tre sorpassi al pelo (senza toccare)', prize: 2000, ok: (g) => (g.nearMiss || 0) >= 3 },
  derapata: { text: 'Una derapata da oltre 3 secondi', prize: 1500, ok: (g) => (g.longDrift || 0) >= 3 },
  veloce: { text: 'Supera i 180 km/h', prize: 1000, ok: (g) => (g.topSpeed || 0) * 3.6 >= 180 },
  scia: { text: 'Ricarica il nitro in scia', prize: 1000, ok: (g) => (g.draftUsed || 0) > 0 },
  props30: { text: 'Distruggi 30 oggetti', prize: 1500, ok: (g, r) => (r.props || 0) >= 30 },
  props60: { text: 'Distruggi 60 oggetti', prize: 2500, ok: (g, r) => (r.props || 0) >= 60 },
  hunt8: { text: 'Colpisci la Lepre 8 volte', prize: 2000, ok: (g) => (g.huntHits || 0) >= 8 },
  ghost: { text: 'Batti il tuo fantasma', prize: 2000, ok: (g, r) => !!(r.time && r.ghostPrev && r.time < r.ghostPrev) || !!r.newGhost },
  flip: { text: 'Fai una capriola in volo', prize: 2500, ok: (g) => (g.flips || 0) >= 1 },
  tre: { text: 'Tre salti validi su tre', prize: 1500, ok: (g, r) => (r.dists || []).every((d) => d > 0) && (r.dists || []).length >= 3 },
  vivo: { text: 'Resta in piedi fino alla fine', prize: 2000, ok: (g) => !g.player.out },
  corona20: { text: 'Tieni la corona per 20 secondi', prize: 2000, ok: (g) => (g.player.crown || 0) >= 20 },
  onda3: { text: 'Respingi 3 ondate', prize: 2000, ok: (g, r) => (r.waves || 0) >= 3 },
  loop: { text: 'Fai il giro della morte', prize: 500, ok: (g) => (g.loops || 0) >= 1 },
  due: { text: 'Vai su due ruote per un secondo', prize: 1500, ok: (g) => (g.twoWheels || 0) >= 1 },
};
const BY_MODE = {
  race: [['kill1', 'combo2', 'rimonta'], ['hp50', 'jump25', 'pelo3'], ['podio', 'derapata', 'scia'], ['kill2', 'pulito', 'veloce']],
  elim: [['kill1', 'pulito', 'pelo3'], ['hp50', 'combo2', 'scia']],
  time: [['hp80', 'veloce', 'ghost'], ['pulito', 'derapata', 'jump25']],
  caccia: [['hunt8', 'combo2', 'hp50'], ['hunt8', 'pelo3', 'kill1']],
  derby: [['kill2', 'combo3', 'vivo'], ['kill1', 'hp50', 'combo2']],
  stunt: [['flip', 'tre', 'bronze2']],
  squadre: [['kill2', 'vivo', 'combo2']],
  re: [['corona20', 'kill1', 'vivo']],
  ondate: [['onda3', 'kill3', 'combo3']],
  distruzione: [['props60', 'hp50', 'pulito'], ['props30', 'derapata', 'veloce']],
  parco: [['loop', 'jump40', 'props30'], ['due', 'flip', 'props60']],
};
export function pickObjectives(game) {
  const sets = BY_MODE[game.mode] || BY_MODE.race; let h = 0; for (const ch of game.venue.id + (game.o.event?.id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return sets[h % sets.length].map((id) => ({ id, ...O[id] }));
}
export function evalObjectives(game, r) {
  return (game.objectives || pickObjectives(game)).map((o) => { let done = false; try { done = !!o.ok(game, r); } catch {} return { id: o.id, text: o.text, prize: o.prize, done }; });
}
