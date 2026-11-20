// Carte Baso — game plug-in registry. Every src/carte/games/*.js that default-exports an object with
// `id` and `setup` is a game (see src/carte/README.md for the interface). Sub-folders are not scanned,
// so a plug-in can keep helpers in src/carte/games/<id>/… without them showing up as games.
// <id>.meta.js files are the light hub tiles (see README.md) and are skipped here.
const mods = import.meta.glob(['../games/*.js', '!../games/*.meta.js'], { eager: true });
export const CARD_GAMES = Object.values(mods).map((m) => m.default).filter((g) => g && g.id && typeof g.setup === 'function')
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.name).localeCompare(String(b.name)));
export const gameById = (id) => CARD_GAMES.find((g) => g.id === id) || null;
