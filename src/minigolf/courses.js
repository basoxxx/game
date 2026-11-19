// Minigolf Baso — the five built-in courses (9 holes each). Format: see holes.js. Every hole is checked
// solvable within par by tools/minigolf-check.mjs (a headless shot search on the real physics).
export const THEMES = {
  giardino: { name: 'Giardino', sub: 'Prati, mulini e laghetti', sky: ['#7fc8ff', '#d9f2ff'], felt: '#3fbf4a', felt2: '#37b043', rail: '#b5713c', railtop: '#d99254', side: '#7a4a24', skirt: '#5b8f3a', ground: '#6cc04a', accent: '#3fbf4a', fog: '#cdeeff', water: '#3fa9f5', sun: 1.0, icon: 'flag' },
  spiaggia: { name: 'Spiaggia', sub: 'Dune, moli e onde', sky: ['#5ec8f2', '#fff1c9'], felt: '#18b9a8', felt2: '#15ab9b', rail: '#ffffff', railtop: '#ff6b6b', side: '#e9c98a', skirt: '#f2d9a0', ground: '#f4dca0', accent: '#18b9a8', fog: '#ffeec9', water: '#1fb6e8', sun: 1.1, icon: 'sun' },
  castello: { name: 'Castello', sub: 'Fossati di lava e saracinesche', sky: ['#3b2a66', '#ff9d6b'], felt: '#c23a4a', felt2: '#b33444', rail: '#8d8a99', railtop: '#b1aebd', side: '#5e5a6b', skirt: '#4a4656', ground: '#4b5a3a', accent: '#c23a4a', fog: '#7a5a88', water: '#ff6a1f', sun: 0.85, icon: 'shield' },
  lunapark: { name: 'Luna Park', sub: 'Giri della morte e respingenti', sky: ['#1b1440', '#7b3fbf'], felt: '#7d4dff', felt2: '#7144ef', rail: '#ff3fa4', railtop: '#ffd23f', side: '#3a2a78', skirt: '#2a1f5c', ground: '#251b4f', accent: '#ff3fa4', fog: '#3d2a7a', water: '#3fd6ff', sun: 0.8, icon: 'star' },
  spazio: { name: 'Spazio', sub: 'Gravità bassa e wormhole', sky: ['#05061a', '#1d2a5a'], felt: '#2f6bff', felt2: '#2a62ee', rail: '#c9d6ff', railtop: '#5ff2ff', side: '#2b3358', skirt: '#1a2040', ground: '#0d1030', accent: '#5ff2ff', fog: '#0b1030', water: '#ff5f9e', sun: 0.9, icon: 'globe' },
};

const H = (name, par, rows, h, extra) => ({ name, par, rows, h, ...extra });

export const COURSES = [
  { id: 'giardino', holes: [
    H('Primo tiro', 2, ['___', '_H_', '___', '___', '___', '___', '_S_']),
    H('Gomito', 3, ['___...', 'H__...', '______', '______', '...___', '...___', '...___', '...S__']),
    H('Collinetta', 2, ['___', '_H_', '___', '^^^', '___', '___', '_S_'], ['111', '111', '111', '000', '000', '000', '000']),
    H('Laghetto', 2, ['_____', '__H__', '_____', '_www_', '_www_', '_____', '__S__']),
    H('Il mulino', 2, ['___', '_H_', '___', '.M.', '___', '___', '_S_']),
    H('Bunker', 2, ['.___.', '_s_s_', '__H__', '_s_s_', '__B__', '_____', '_____', '__S__']),
    H('Zig zag', 3, ['___....', '_H_....', '___....', '__B____', '____B__', '....___', '....___', '....S__']),
    H('Due colli', 3, ['___', '_H_', '___', 'vvv', '___', '^^^', '___', '_S_'], ['000', '000', '000', '000', '111', '000', '000', '000']),
    H('Gran prato', 3, ['_____', '__H__', '_____', '..M..', '_____', '_ww__', '_ww__', '_____', 'B___B', '__S__']),
  ] },
  { id: 'spiaggia', holes: [
    H('Passerella', 2, ['wwHww', 'ww_ww', 'ww_ww', 'w___w', 'w___w', 'ww_ww', 'wwSww']),
    H('Dune', 2, ['_____', '__H__', '_sss_', '_____', '^^^^^', '_____', '_s_s_', '__S__'], ['11111', '11111', '11111', '11111', '00000', '00000', '00000', '00000']),
    H('Il tuffo', 3, ['_____', '_H___', '_____', 'www__', '^^^__', '_____', '_S___']),
    H('Palme', 2, ['_______', '___H___', '_B___B_', '___B___', '_B___B_', '_______', '___S___']),
    H('Correnti', 3, ['__H__', '_____', '66666', '_____', '44444', '_____', '__S__']),
    H('Castello di sabbia', 3, ['_______', '_H_____', '__XXX__', '_sX_Xs_', '_______', '_______', '_____S_']),
    H('Il molo', 4, ['wXwwwww', 'X___HXw', 'w_wwwww', 'w_wwXww', 'X____ww', 'wwww_ww', 'wwww_ww', 'wwwwSww']),
    H('Onde', 2, ['___', '_H_', '___', 'vvv', '^^^', 'vvv', '^^^', '___', '_S_']),
    H('Faro', 3, ['_____', '_sHs_', '_s_s_', '__B__', '_____', 'ww_ww', 'ww_ww', '_____', '__S__']),
  ] },
  { id: 'castello', holes: [
    H('Ponte levatoio', 2, ['_____', '__H__', '_____', 'll_ll', 'll_ll', '_____', '__S__']),
    H('Saracinesche', 3, ['___', '_H_', '___', '.Z.', '___', '.Z.', '___', '_S_']),
    H('La torre', 3, ['___', '_H_', '___', '^^^', '___', '^^^', '___', '_S_'], ['222', '222', '222', '111', '111', '000', '000', '000']),
    H('Labirinto', 4, ['_______', '_HX____', '_XX_XX_', '_____X_', 'XXX_XX_', '_______', '___S___']),
    H('Il portale', 2, ['___', '_H_', '_t_', 'lll', 'lll', '_T_', '___', '_S_']),
    H('Torri gemelle', 2, ['_______', '___H___', '_X___X_', '___Z___', '_X___X_', '_______', '___S___']),
    H('Il fossato', 2, ['_____', '__H__', '_____', '_____', '.....', '^^^^^', '_____', '__S__']),
    H('Sala del trono', 2, ['lllll', 'l_H_l', 'l___l', 'l_M_l', 'l___l', 'l___l', 'l_S_l', 'lllll']),
    H('Torrione', 3, ['___....', '_H_....', '_t_....', 'lll.___', 'lll._T_', 'lll.___', '....^^^', '....___', '....___', '....S__'],
      ['2222222', '2222222', '2222222', '2221111', '2221111', '2221111', '0000000', '0000000', '0000000', '0000000']),
  ] },
  { id: 'lunapark', holes: [
    H('Giro della morte', 2, ['.___.', '._H_.', '.___.', '..O..', '.___.', '.___.', '.___.', '._S_.']),
    H('Flipper', 3, ['_______', '_B_H_B_', '__B_B__', '_B___B_', '___B___', '_______', '___S___']),
    H('Nastri', 2, ['_____', '__H__', '_____', '88888', '44444', '_____', '66666', '_____', '__S__']),
    H('Teletrasporto', 2, ['___.___', '_H_.___', '_t_._T_', '....___', '....___', '....___', '....S__']),
    H('Mulini gemelli', 3, ['___', '_H_', '___', '.M.', '___', '.M.', '___', '___', '_S_']),
    H('Montagne russe', 3, ['___', '_H_', '___', '.O.', '___', 'vvv', '___', '^^^', '___', '_S_'], ['000', '000', '000', '000', '000', '000', '111', '000', '000', '000']),
    H('Pista di ghiaccio', 2, ['_____', '__H__', '_iii_', '_iBi_', '_iii_', '_____', '__S__']),
    H('Autoscontro', 2, ['_____', 'B_H_B', '__Z__', '_B_B_', '__Z__', '_____', '__S__']),
    H('Gran finale', 3, ['___.___', '_H_._T_', '_t_.___', '.....O.', '....___', '....B__', '....888', '....___', '....S__']),
  ] },
  { id: 'spazio', g: 0.45, holes: [
    H('Primo passo', 2, ['___', '_H_', '___', '...', '^^^', '___', '_S_']),
    H('Asteroidi', 2, ['_______', '___H___', '_B_i_B_', '__iBi__', '_B_i_B_', '_______', '___S___']),
    H('Wormhole', 2, ['___.....', '_H_.....', '_t_.....', '........', '.....___', '.....T__', '.....___', '.....S__']),
    H('Anelli di Saturno', 2, ['___', '_H_', '___', '.O.', '___', '___', '_S_']),
    H('Gravità zero', 2, ['___', '_H_', '___', '...', '...', '^^^', '___', '___', '_S_']),
    H('Stazione orbitale', 3, ['_____', '__H__', '__Z__', '_____', '66666', '_____', '44444', '_____', '__S__']),
    H('Cintura di ghiaccio', 4, ['_____', '_H___', 'iiiii', '....i', 'iiiii', 'i....', 'iiiii', '____S']),
    H('Doppio salto', 3, ['___....', '_H_....', '_t_....', '.......', '___.T__', '_U_.___', '___.___', '_S_._u_']),
    H('Buco nero', 4, ['___..', '_H_..', '___..', '.....', '^^^..', '__B..', '___..', '_t_..', '.....', '...T.', '...O.', '..___', '..__S']),
  ] },
];
for (const c of COURSES) { Object.assign(c, THEMES[c.id]); c.holes.forEach((h, i) => { h.theme = c.id; h.g = c.g || 1; h.course = c.id; h.n = i; h.id = `${c.id}-${i + 1}`; }); }
export const courseById = (id) => COURSES.find((c) => c.id === id);
export const ALL_HOLES = COURSES.flatMap((c) => c.holes);
export const coursePar = (c) => c.holes.reduce((a, h) => a + h.par, 0);
