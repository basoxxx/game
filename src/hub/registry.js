// Plug-in games for the Baso Hub. Every file in src/hub/games/*.js default-exports one entry, so new
// games are added without touching the launcher, main.js or app.js (no merge conflicts between them).
// Keep entry files LIGHT (no three.js, no game code): only metadata, a small store read for stat(),
// and dynamic imports for the screens. Never import src/app.js from an entry (App is passed in).
//
// export default {
//   id: 'kart', order: 10, category: 'Corse' | 'Arcade' | 'Puzzle' | 'Party' | ...,
//   section: 'Kart', title: 'Kart Baso', genre: 'Corse arcade', accent: '#ff3b6b',
//   desc: 'one-line pitch', stat: () => 'progress line (string, may be HTML-escaped already)',
//   cover: 'covers/kart.webp',              // optional, rendered key art in public/covers
//   art: () => '<svg viewBox="0 0 320 180">…</svg>', // optional fallback art
//   play: (App) => App.go('kart', { from: 'launcher' }),
//   modes: [{ id, icon, name, desc: string | () => string, tag?, when?: () => bool, go: (App) => … }],
//   screens: { kart: () => import('../../screens/kart.js') },   // lazy screens to register
//   ownGL: ['kart'],                         // screens with their own WebGL context (hub 3D is released)
//   moods: { kart: 'derby' },                // music mood per screen (src/ui/audio.js themes)
//   deepLink: 'kart',                        // ?game=<id> opens this screen
// }
const mods = import.meta.glob('./games/*.js', { eager: true });
export const HUB_GAMES = Object.values(mods).map((m) => m.default).filter((g) => g && g.id).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
export const hubScreens = Object.assign({}, ...HUB_GAMES.map((g) => g.screens || {}));
export const hubOwnGL = new Set(HUB_GAMES.flatMap((g) => g.ownGL || []));
export const hubMoods = Object.assign({}, ...HUB_GAMES.map((g) => g.moods || {}));
