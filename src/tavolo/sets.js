// Tavolo Baso — cosmetic sets bought with coins (no ads, no purchases): table/board themes and piece sets.
// Plain data, shared by the 3D views, the 2D fallback and the menus.
export const BOARDS = [
  { id: 'noce', name: 'Noce e acero', sub: 'Il classico intarsio da salotto', cost: 0, mat: 'wood', light: '#e6c99a', dark: '#87552e', frame: '#5a361a', table: '#2a1d14', felt: '#203a2c', ink: '#f3e2c2' },
  { id: 'torneo', name: 'Torneo', sub: 'Vinile verde e crema da circolo', cost: 250, mat: 'flat', light: '#eeeed2', dark: '#769656', frame: '#3b4a2c', table: '#1d2427', felt: '#2b3135', ink: '#eeeed2' },
  { id: 'olivo', name: 'Olivo e ciliegio', sub: 'Venature calde e lucide', cost: 400, mat: 'wood', light: '#d9b77e', dark: '#7a3b24', frame: '#40231a', table: '#1f1612', felt: '#3a2018', ink: '#f6dcb3' },
  { id: 'marmo', name: 'Marmo di Carrara', sub: 'Bianco statuario e bardiglio', cost: 700, mat: 'marble', light: '#eceae4', dark: '#6d747c', frame: '#2f3236', table: '#171a1e', felt: '#23272c', ink: '#e8e6df' },
  { id: 'ardesia', name: 'Ardesia e onice', sub: 'Pietre scure, riflessi profondi', cost: 900, mat: 'marble', light: '#a7a196', dark: '#2c2f33', frame: '#151618', table: '#0e0f11', felt: '#1b1d20', ink: '#c8c2b6' },
  { id: 'laguna', name: 'Laguna', sub: 'Vetro di Murano azzurro', cost: 1100, mat: 'flat', light: '#cfe6ee', dark: '#3d7f9c', frame: '#173847', table: '#0c1b22', felt: '#12313d', ink: '#d8eef5' },
];
export const PIECES = [
  { id: 'bosso', name: 'Bosso ed ebano', sub: 'Legno tornito a mano', cost: 0, w: { c: '#e9d5ad', r: 0.42, m: 0, grain: true }, b: { c: '#2a1a12', r: 0.38, m: 0, grain: true }, discs: ['#d8342c', '#f2b928'] },
  { id: 'smalto', name: 'Smalto', sub: 'Ceramica rossa e blu', cost: 300, w: { c: '#f2efe8', r: 0.18, m: 0, cc: 1 }, b: { c: '#1f3f8f', r: 0.18, m: 0, cc: 1 }, discs: ['#e23a3a', '#2e6fe0'] },
  { id: 'marmo', name: 'Marmo bianco e nero', sub: 'Pietra levigata', cost: 600, w: { c: '#f1efe9', r: 0.22, m: 0, marble: true, cc: 0.6 }, b: { c: '#24262a', r: 0.22, m: 0, marble: true, cc: 0.6 }, discs: ['#ece9e2', '#2a2c30'] },
  { id: 'vetro', name: 'Vetro di Murano', sub: 'Trasparenze ambra e fumé', cost: 900, w: { c: '#f6e7c4', r: 0.06, m: 0, glass: true }, b: { c: '#3b4250', r: 0.06, m: 0, glass: true }, discs: ['#ff8a3a', '#46b4ff'] },
  { id: 'metallo', name: 'Oro e argento', sub: 'Ottone e acciaio satinato', cost: 1300, w: { c: '#e7c66d', r: 0.28, m: 1 }, b: { c: '#9aa3ad', r: 0.3, m: 1 }, discs: ['#e7c66d', '#9aa3ad'] },
];
export const boardById = (id) => BOARDS.find((b) => b.id === id) || BOARDS[0];
export const piecesById = (id) => PIECES.find((p) => p.id === id) || PIECES[0];
