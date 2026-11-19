// Minigolf Baso — share codes for custom holes: "MG1-" + base64url of a compact text form
// (theme|par|gravity|name|rows|heights) with runs of 4+ equal tiles packed as  c~n;
export const MAX_W = 12, MAX_H = 18;
const TILES = /^[._SHsiwlg^>v<8624BMZOTtUuX]+$/;
const pack = (s) => s.replace(/(.)\1{3,}/g, (m, c) => `${c}~${m.length};`);
const unpack = (s) => s.replace(/(.)~(\d+);/g, (m, c, n) => c.repeat(Math.min(+n, 64)));
const b64 = (str) => { const b = new TextEncoder().encode(str); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (s) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(t, (c) => c.charCodeAt(0))); };

export function normalize(spec) {
  const W = Math.max(...spec.rows.map((r) => r.length));
  return { ...spec, rows: spec.rows.map((r) => r.replace(/ /g, '.').padEnd(W, '.')), h: spec.h ? spec.h.map((r) => r.padEnd(W, '0')) : null };
}
export function encode(spec) {
  const s = normalize(spec);
  const hs = s.h && s.h.some((r) => /[1-9]/.test(r)) ? s.h.map(pack).join('/') : '';
  const name = String(spec.name || 'Buca').replace(/[|]/g, ' ').slice(0, 28);
  return 'MG1-' + b64([spec.theme || 'giardino', spec.par || 3, spec.g || 1, name, s.rows.map(pack).join('/'), hs].join('|'));
}
// returns a hole spec or null; never throws
export function decode(code) {
  try {
    const m = /^\s*MG1-([A-Za-z0-9_-]+)\s*$/.exec(String(code || ''));
    if (!m) return null;
    const [theme, par, g, name, rows, hs] = unb64(m[1]).split('|');
    const R = rows.split('/').map(unpack);
    const spec = { theme, par: Math.max(1, Math.min(9, Math.round(+par) || 3)), g: Math.max(0.2, Math.min(1.5, +g || 1)), name: (name || 'Buca').slice(0, 28), rows: R, h: hs ? hs.split('/').map(unpack) : null };
    return validate(spec) ? null : normalize(spec);
  } catch { return null; }
}
// null when the hole can be played, otherwise the reason (Italian, shown to the player)
export function validate(spec) {
  const R = spec.rows || [];
  if (!R.length || R.length > MAX_H || R.some((r) => r.length > MAX_W || !TILES.test(r))) return 'Dimensioni o caselle non valide.';
  if (spec.h && (spec.h.length !== R.length || spec.h.some((r) => !/^[0-9]*$/.test(r)))) return 'Mappa delle altezze non valida.';
  const all = R.join('');
  const cnt = (c) => all.split(c).length - 1;
  if (cnt('S') !== 1) return 'Serve una (e una sola) partenza.';
  if (cnt('H') !== 1) return 'Serve una (e una sola) buca.';
  for (const [a, b] of [['T', 't'], ['U', 'u']]) if (cnt(a) > 1 || cnt(b) > 1 || (cnt(a) && !cnt(b))) return 'Ogni teletrasporto ha bisogno della sua uscita (una sola coppia per colore).';
  return null;
}
