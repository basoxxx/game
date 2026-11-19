// Festa Baso — minigame id -> 3D view builder: (stage, sim, ctx) => { scene, update(dt), tags?(), tagText?(i), top?(), dispose?() }
import { tiro, porte, kart, palloncini, autoscontro } from './action.js';
import { voragine, serpenti, territorio, bastione } from './arena.js';
import { golf, ingorgo, officina, riflessi, ritmo, memoria } from './brain.js';
export { boardView, podiumView } from './board.js';
export const VIEWS = { tiro, porte, kart, palloncini, autoscontro, voragine, serpenti, territorio, bastione, golf, ingorgo, officina, riflessi, ritmo, memoria };
