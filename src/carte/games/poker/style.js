// CSS for the fictional chips, as a string: the plug-ins are also imported by the node tests, where a
// plain `import './x.css'` would fail, so the style is injected at runtime (browser only) by useStyle().
export function useStyle(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style'); el.id = id; el.textContent = css; document.head.appendChild(el);
}
export const CHIPS_CSS = `
/* Fictional chips for Carte Baso table games (Texas Hold'em, Blackjack). Sized from the card size --cw. */
.ct-pile.chips { width: 0 !important; height: 0 !important; transition: transform .55s cubic-bezier(.2, .8, .2, 1); z-index: 240; }
.ct-pile.chips .ct-lbl { left: calc(var(--cw) / 2); bottom: auto; top: calc(var(--ch) / 2); transform: translate(-50%, -50%); background: none; padding: 0; border-radius: 0; z-index: 240; white-space: nowrap; }
.chp { --cs: clamp(15px, calc(var(--cw) * .27), 30px); display: inline-flex; align-items: center; gap: 5px; pointer-events: none; animation: chpIn .35s cubic-bezier(.2, .8, .2, 1) both; }
.chp-s { display: inline-flex; align-items: flex-end; gap: 1px; }
.chp-col { position: relative; display: inline-block; width: var(--cs); height: calc(var(--cs) * .62 + var(--h) * var(--cs) * .14); }
.chp-c { position: absolute; left: 0; bottom: calc(var(--j) * var(--cs) * .14); width: var(--cs); height: calc(var(--cs) * .62); border-radius: 50%;
  background: radial-gradient(ellipse at 50% 45%, var(--cc) 0 46%, var(--ce, #fff) 47% 56%, var(--cc) 57%);
  box-shadow: 0 1px 0 rgba(0, 0, 0, .55), 0 2px 3px rgba(0, 0, 0, .35), inset 0 -1px 0 rgba(0, 0, 0, .3);
  border: 1px dashed rgba(255, 255, 255, .55); box-sizing: border-box; animation: chpDrop .32s cubic-bezier(.2, .8, .2, 1) both; animation-delay: var(--d, 0ms); }
.chp-a { font: 800 calc(var(--cs) * .62)/1 var(--display, sans-serif); color: #fff; text-shadow: 0 1px 2px #000, 0 0 6px rgba(0, 0, 0, .6); letter-spacing: .02em; }
.chp-n { display: block; font: 600 11px/1.2 var(--body, sans-serif); color: #d7e4da; opacity: .85; text-shadow: 0 1px 2px #000; }
.chp.pot { flex-direction: row; padding: 3px 10px 3px 6px; border-radius: 30px; background: rgba(0, 0, 0, .38); box-shadow: inset 0 0 0 1px rgba(255, 210, 63, .35); }
.chp.pot .chp-a { color: #ffd23f; }
.chp.side { background: rgba(0, 0, 0, .3); padding: 2px 8px 2px 5px; border-radius: 30px; }
.chp.win .chp-a { color: #7dff9a; }
.chp.big { --cs: clamp(18px, calc(var(--cw) * .32), 34px); }
.cv-k5 { --cc: #6b2fb8; --ce: #e7d6ff; } .cv-k1 { --cc: #e0b020; --ce: #3a2a00; } .cv-h5 { --cc: #7a3d14; --ce: #ffd9a8; }
.cv-h1 { --cc: #151515; --ce: #f2f2f2; } .cv-f5 { --cc: #1f7fd6; --ce: #fff; } .cv-q { --cc: #1d8a3e; --ce: #fff; }
.cv-d { --cc: #1aa6a0; --ce: #fff; } .cv-r { --cc: #c8202b; --ce: #fff; } .cv-w { --cc: #e8e8e8; --ce: #4a6fd1; }
.chp-face { --cs: 34px; display: inline-grid; place-items: center; width: var(--cs); height: var(--cs); border-radius: 50%; vertical-align: middle;
  background: radial-gradient(circle, var(--cc) 0 52%, var(--ce, #fff) 53% 62%, var(--cc) 63%); border: 2px dashed rgba(255, 255, 255, .7); box-shadow: 0 2px 4px rgba(0, 0, 0, .5); }
.chp-face b { font: 800 11px/1 var(--display, sans-serif); color: #fff; text-shadow: 0 1px 1px #000; }
.cv-k1 .chp-face b, .chp-face.cv-k1 b { color: #2a1f00; text-shadow: none; }
@keyframes chpIn { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
@keyframes chpDrop { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
html.reduce-motion .chp, html.reduce-motion .chp-c, html.reduce-motion .ct-pile.chips { animation: none !important; transition-duration: .01s !important; }
/* dealer button, markers */
.ct-pile.marker { width: 0 !important; height: 0 !important; transition: transform .55s cubic-bezier(.2, .8, .2, 1); z-index: 245; }
.ct-pile.marker .ct-lbl { left: calc(var(--cw) / 2); top: calc(var(--ch) / 2); bottom: auto; transform: translate(-50%, -50%); padding: 0; background: none; }
.pk-dbtn { display: grid; place-items: center; width: clamp(20px, calc(var(--cw) * .3), 30px); height: clamp(20px, calc(var(--cw) * .3), 30px); border-radius: 50%; background: radial-gradient(circle at 40% 35%, #fff, #d9d9d9 70%); color: #111; font: 900 13px/1 var(--display, sans-serif); box-shadow: 0 2px 4px rgba(0, 0, 0, .55), inset 0 0 0 2px #b9b9b9; }
.tbl-note { display: block; font: 600 11px/1.3 var(--body, sans-serif); color: rgba(255, 255, 255, .62); letter-spacing: .04em; text-shadow: 0 1px 2px #000; }
`;
