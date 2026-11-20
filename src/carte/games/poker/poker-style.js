// Table styles for Texas Hold'em, scoped to tables that show the poker board (`.pk-tbl` pile).
export const POKER_CSS = `
.ct-root:has(.pk-tbl) .ct-acts { flex-wrap: wrap; justify-content: center; width: min(calc(100% - 16px), 720px); gap: 6px; bottom: calc(var(--ch) + 22px); }
.ct-root:has(.pk-tbl) .ct-acts .btn { min-height: 40px; padding: 8px 14px; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,.45); }
.ct-root:has(.pk-tbl) .ct-acts .btn:first-child:not(.primary) { background: rgba(120,20,30,.85); border-color: #c8323f; color: #fff; }
.ct-root:has(.pk-tbl) .ct-seat { min-width: 96px; }
.ct-root:has(.pk-tbl) .ct-seat span { display: flex; gap: 6px; align-items: center; }
.pk-st { font-family: var(--display); font-weight: 800; color: #ffd23f; font-size: 13px; }
.pk-a { padding: 0 5px; border-radius: 3px; background: rgba(255,255,255,.14); font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #fff; }
.pk-a.fold { background: rgba(200,50,63,.55); } .pk-a.allin { background: #c8202b; } .pk-a.raise, .pk-a.bet { background: rgba(255,140,30,.7); } .pk-a.win { background: #1d8a3e; }
.pk-sty { color: #9fb8a8; font-size: 10.5px; }
.ct-pile.pk-tbl.outline { border-color: rgba(255,255,255,.12); background: rgba(0,0,0,.08); }
.pk-pots { display: inline-flex; gap: 6px; align-items: center; flex-wrap: nowrap; }
@media (max-height: 560px) and (min-aspect-ratio: 4/3) { .ct-root:has(.pk-tbl) .ct-acts { left: auto; right: 10px; transform: none; bottom: 10px; width: min(44vw, 400px); justify-content: flex-end; } .ct-root:has(.pk-tbl) .ct-acts .btn { padding: 6px 10px; min-height: 34px; font-size: 12.5px; } }
@media (max-width: 560px) { .ct-root:has(.pk-tbl) .ct-acts .btn { padding: 7px 10px; font-size: 12.5px; min-height: 36px; } .ct-root:has(.pk-tbl) .ct-seat { min-width: 0; } }
`;
