# Carte Baso — plug-in API

Carte Baso is ONE Baso Hub entry (`src/hub/games/carte.js`) that hosts many card games. A game is a
plug-in: two files in `src/carte/games/`, picked up automatically (no shared file to edit).

```
src/carte/games/<id>.meta.js   hub tile, plain literal, NO imports   (read by the hub entry, main bundle)
src/carte/games/<id>.js        the game: rules, AI, view, rules text  (lazy, loaded with the carte screen)
src/carte/games/<id>/...       optional helpers (sub-folders are not scanned as games)
```

The framework gives you: deck model + seeded RNG (`core/cards.js`), procedural card art for
Napoletane / Piacentine / French + jokers, card backs and felts (`core/art.js`), the animated table
renderer (`core/table.js`), the match controller (`core/match.js`: rounds, totals, target, undo, AI
turns, validation), the generic screen (`src/screens/carte.js`: collection menu, lobby with
CPU/hot-seat seats and difficulty, pass-the-device screen, round/match results, coins, stats,
records, shop, rules modal, pause, resume a saved match), sounds (`core/sound.js`).

## 1. `<id>.meta.js`

```js
export default { id: 'solitario', name: 'Solitario', order: 30, icon: 'star', short: 'One line for the hub tile.', tag: '' };
```
`icon` is a name from `src/ui/icons.js`. `order` sorts both the hub tiles and the collection menu.

## 2. `<id>.js` — default export

```js
import meta from './solitario.meta.js';
import { makeDeck, shuffle, rank, suit, clone, rand, cardName } from '../core/cards.js';
export default {
  ...meta,                          // id, name, order, icon, short
  desc: 'Lobby description',
  players: [1, 1],                  // [min, max] seats (seat 0 is always the local human)
  decks: ['fr52'],                  // 'it40' (40 Italian) or 'fr52' (52 French); first = used
  thumb: ['1S', '13H', '12D'],      // 3 card ids drawn as the menu thumbnail fan
  variants: [{ id, name, desc, players: [min, max], teams: true|false|(cfg)=>bool }],   // optional
  options: [{ id, name, values: [{ v, label }], default, when: (opts) => bool }],       // optional lobby toggles
  targets: [{ v: 1, label: 'Una partita' }],   // match length choices (sum of round points to reach). default [11,21,31]
  defaultTarget: 1,
  records: { mosse: 'Meno mosse' },  // keys of scores().records shown in Statistiche (max is kept)
  undo: true | 'facile' | false,     // undo of the human's last move (true = always, 'facile' = only vs Facile CPU)
  setup(seed, opts) -> state,        // ONE round (deal). opts: { n, variant, teams, target, dealer, round, totals, ...options }
  legalMoves(state, player) -> Move[],
  apply(state, move) -> newState,    // PURE: must not mutate `state` (use clone())
  ai(state, player, level, rng) -> Move,   // level 'facile'|'normale'|'difficile'; rng() -> [0,1)
  isOver(state) -> bool,             // round over
  scores(state) -> { points: [per side], rows: [{ label, values: [per side] }], records?, coins?, note? },
  view(state, viewer, ctx) -> View,  // what is on the table, from `viewer`'s seat (see 4)
  steps?(state, move) -> [state...], // optional intermediate snapshots for animation only (e.g. a full trick before it is collected; set snapshot.pause = ms)
  status?(state, viewer) -> string,  // small HUD line ("Briscola: Coppe · 12 carte nel mazzo")
  matchOver?(totals, cfg, rounds) -> side | -1 | 'draw',   // default: first side to reach cfg.target with a strict lead
  nextDealer?(state, dealer) -> dealer,
  rules: '<h3>…</h3><p>…</p>',       // Italian rules (HTML) for the lobby and the rules modal
};
```

### State contract (plain JSON only, it is saved to localStorage to resume)
- `state.n` number of players, `state.turn` player to act (`-1` when nobody: round over / animation),
- `state.teams` sides: `[[0,2],[1,3]]` or `[[0],[1],…]` (the match fills it in if you omit it),
- keep the RNG inside the state: `state.rng = seed` and use `rand(state)` / `shuffle(arr, state)`,
- optional `state.say = 'Scopa!'` (or `{ text, cls: 'blue', chime: true }`) after a move: shown big on the table.

### Moves
Plain objects. The framework compares moves by all fields except the cosmetic ones
(`label`, `show`, `primary`, `tail`, `hint`). Fields the TABLE understands:
- `card`: id of the card the human taps/drags to make this move (a card in hand, or the top of a pile),
- `to`: id of the destination pile (drag-and-drop target; with several `to`s the human taps the card then a pile),
- `tail: true`: dragging `card` also drags the cards on top of it in its pile (solitaire stacks),
- `label`: text; moves with no `card` become BUTTONS above the hand (`Passa`, `Pesca`, `Chiudi`…);
  several moves on the same card with no distinct `to` open a chooser listing their labels,
- `show`: card ids highlighted while the chooser option is hovered (e.g. the cards a Scopa capture takes),
- `primary: true`: styles a button as primary.

Player ids increase in TURN order. Italian games turn counter-clockwise, so the renderer draws
player `viewer+1` on the viewer's RIGHT (2 players: bottom/top; 3: bottom/right/left; 4: bottom/right/top/left).

## 3. Cards (`core/cards.js`)
Card ids are strings: Italian `'7d'` (rank 1-10: 8 Fante, 9 Cavallo, 10 Re; suits `d` Denari, `c` Coppe,
`s` Spade, `b` Bastoni), French `'12H'` (rank 1-13; suits `H D C S`), jokers `'1J'` `'2J'`, extra deck
copies `'7H~2'`. Helpers: `makeDeck('it40'|'fr52', { copies, jokers, ranks })`, `rank`, `suit`, `base`,
`isJoker`, `isRed`, `cardName` ("Sette di Denari"), `cardShort`, `shuffle(arr, rngOrState)`,
`deal(deck, n, per, first)`, `rand(state)`, `rng(seed)`, `clone`, `removeCard`, `nextPlayer`, `defaultTeams`.

## 4. The VIEW (what the renderer draws)

```js
{ piles: [Pile...], hl: [cardIds glowing], seats: [{ sub: 'text under the seat name' }], mine: 'hand0', size: 1 }
Pile = {
  id, cards: ['7d', { id: '1d', up: false, rot: 90, mark: true }...],   // bottom → top
  up: true,                       // default face for its cards
  // placement, either seat-relative...
  seat: playerIndex, slot: 'hand' | 'side' (captures pile in the seat's corner) | 'play' (trick card in front) | 'meld' (row in front),
  // ...or free, in the centre area (0..1 each axis; anchor: 'table' = whole table instead)
  x: 0.5, y: 0.5, ox: 0, oy: 0 (offset in card sizes), w: 0.9 (max width of a row, fraction),
  layout: 'fan' | 'row' | 'stack' | 'spread' | 'cascade' | 'grid',   // defaults: hand→fan, meld→spread, else stack
  wrap: true (row → several rows), gap, cols (grid), upGap/downGap/maxH (cascade), scale, rot, z,
  source: true,                   // new cards fly in from here (the stock): deal animation
  outline: true,                  // dashed empty slot (foundations, free cells) - also a drop target
  label: '12',                    // small badge under the pile
}
```
`view(state, viewer, ctx)` gets `ctx = { portrait, n, seats, partnerOf(p) }`. Hide what the viewer
must not see (`up: false`); with hot-seat the framework passes the current human as `viewer`.
Cards keep their DOM element across renders, so moving an id between piles animates it (deal, play,
flip when `up` changes, collect when it lands in a `side` pile).

## 5. Testing
`node tools/carte-test.mjs` imports every plug-in and plays AI-vs-AI matches through `core/match.js`
(`simulate(game, cfg, levels)`); illegal AI moves throw. Add your game's rule tests there or in your own
`tools/carte-<id>-test.mjs`. In the browser, `window.__carte` exposes `{ M, game, legal(), play(move) }`
and `window.__carteFast = true` removes the waits (e2e).
