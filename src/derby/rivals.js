// Rival drivers and the cup storyline (v5). Every cup has an antagonist who races in each of its
// events, remembers what you did to them (grudge saved in apexdynasty_derby → rivals) and gets
// nastier for it; finishing a cup ends with a podium and a closing line. Portraits are drawn as
// small procedural SVG faces (helmet, hair, moustache, eyes) — no external assets.
import { prog, saveProg } from './career.js';

export const RIVALS = [
  { id: 'bruno', cup: 'ferraglia', name: 'Brutto Bruno', nick: 'il macellaio di Pietrarossa', pers: 'aggressivo', car: 'pickup', color: '#9b2c2c', seed: 3,
    intro: 'Bruno guida il carro attrezzi del paese e considera la Coppa Ferraglia roba sua.', taunt: ['Torna a casa, pivello.', 'Ti piego come una lattina.', 'Ancora tu? Ti ho già rottamato una volta.'], outroWin: 'Bruno ti stringe la mano. Poi ti pesta il piede.', outroLose: 'Bruno alza la coppa e ti guarda dall’alto in basso.' },
  { id: 'rosa', cup: 'lamiera', name: 'Rosa Ruggine', nick: 'la regina del porto', pers: 'rivale', car: 'muscle', color: '#a33b6b', seed: 11,
    intro: 'Rosa ha vinto tre Coppe Lamiera di fila e non ha intenzione di regalarti la quarta.', taunt: ['Il porto è casa mia.', 'Non sei male. Per un dilettante.', 'Stavolta niente sconti.'], outroWin: 'Rosa ti consegna la coppa: «La prossima la vinco io».', outroLose: 'Rosa colleziona la quarta coppa di fila.' },
  { id: 'nina', cup: 'caos', name: 'Nina Nitro', nick: 'la scheggia', pers: 'equilibrato', car: 'rally', color: '#2b8a8a', seed: 23,
    intro: 'Nina arriva dai rally e porta regole nuove: squadre, corone, ondate. Lei le conosce tutte.', taunt: ['Prova a starmi dietro.', 'Le regole le scrivo io.', 'Nitro pieno, cervello vuoto: tu.'], outroWin: 'Nina applaude: «Caos domato. Bravo».', outroLose: 'Nina si porta via la Coppa Caos tra i fumogeni.' },
  { id: 'sandro', cup: 'inferno', name: 'Sandro Sfascio', nick: 'il demolitore', pers: 'aggressivo', car: 'furgone', color: '#b8761c', seed: 37,
    intro: 'Sandro non corre per vincere: corre per distruggere. Sotto i riflettori diventa una belva.', taunt: ['Sento odore di lamiera bruciata.', 'Il tuo paraurti è mio.', 'Ti mando dal carrozziere.'], outroWin: 'Sandro esce dall’auto in fiamme e ride: «Finalmente uno vero».', outroLose: 'Sandro festeggia demolendo il podio.' },
  { id: 'barone', cup: 'finale', name: 'Il Barone Bullone', nick: 'campione in carica', pers: 'rivale', car: 'hotrod', color: '#3a3a3a', seed: 51,
    intro: 'Il Barone è il re del Gran Premio Rottame da dieci anni. Freddo, veloce, spietato.', taunt: ['Interessante. Ma no.', 'Il trono non si presta.', 'Ti aspettavo.'], outroWin: 'Il Barone si toglie il casco: «Il trono è tuo. Per ora».', outroLose: 'Il Barone resta re del rottame. Ancora un anno.' },
];
export const rivalOfCup = (cupId) => RIVALS.find((r) => r.cup === cupId) || null;

function rnd(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
export function portrait(r, size = 64) {
  const R = rnd(r.seed || 1), skin = ['#f1c9a5', '#d9a77c', '#a8714a', '#7a4b2c', '#e8b98f'][Math.floor(R() * 5)], hair = ['#2b1a10', '#6b3a1a', '#c9a24a', '#8a8a8a', '#111', '#a33b1b'][Math.floor(R() * 6)];
  const helmet = r.color || '#c62828', fem = /a$/.test(r.name.split(' ')[0]) || r.name.startsWith('Rosa') || r.name.startsWith('Nina');
  const mou = !fem && R() < 0.7, scar = R() < 0.4, brow = 2 + R() * 3;
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" fill="#1b1d22"/>
    <path d="M10 64 Q12 44 32 44 Q52 44 54 64Z" fill="${helmet}"/><path d="M24 46 h16 l-2 6 h-12z" fill="#ddd" opacity=".8"/>
    ${fem ? `<path d="M15 34 Q14 14 32 13 Q50 14 49 34 L50 46 Q44 40 46 30 L18 30 Q20 40 14 46Z" fill="${hair}"/>` : ''}
    <ellipse cx="32" cy="31" rx="13" ry="15" fill="${skin}"/>
    <path d="M18 26 Q18 10 32 10 Q46 10 46 26 Q40 19 32 19 Q24 19 18 26Z" fill="${fem ? hair : helmet}"/>${fem ? '' : `<path d="M18 26 h28" stroke="#fff" stroke-width="2" opacity=".6"/>`}
    <path d="M24 ${27 - brow / 3} l6 ${brow / 2}" stroke="#222" stroke-width="2"/><path d="M40 ${27 - brow / 3} l-6 ${brow / 2}" stroke="#222" stroke-width="2"/>
    <circle cx="27" cy="30" r="1.8" fill="#111"/><circle cx="37" cy="30" r="1.8" fill="#111"/>
    ${mou ? `<path d="M25 38 Q32 34 39 38 Q32 37 25 38Z" fill="${hair}" stroke="${hair}" stroke-width="1.5"/>` : `<path d="M27 39 Q32 ${fem ? 42 : 40} 37 39" stroke="#7a2a2a" stroke-width="1.6" fill="none"/>`}
    ${scar ? '<path d="M40 24 l3 9" stroke="#a04040" stroke-width="1.2"/>' : ''}</svg>`;
}

export function rivalState(id, p = prog()) { p.rivals ||= {}; return p.rivals[id] || { grudge: 0, beat: 0, lost: 0, wrecked: 0 }; }
// after an event against this rival: did you beat them, wreck them? The grudge grows when you hurt or humiliate them
export function recordRival(rv, res) {
  const p = prog(); p.rivals ||= {}; const s = { ...rivalState(rv.id, p) };
  if (res.beat) s.beat++; else s.lost++;
  if (res.wrecked) s.wrecked++;
  s.grudge = Math.max(0, Math.min(5, s.grudge + (res.wrecked ? 2 : 0) + (res.beat ? 1 : -1) + (res.hits >= 3 ? 1 : 0)));
  p.rivals[rv.id] = s; saveProg(p); return s;
}
export function cupStory(cupId, p = prog()) {
  const rv = rivalOfCup(cupId); if (!rv) return '';
  const st = rivalState(rv.id, p), done = p.cupDone?.[cupId];
  return `<div class="dz-rival mt8" style="--rc:${rv.color}">${portrait(rv, 54)}<div><b>${rv.name}</b> <span class="tiny">· ${rv.nick}</span><div class="dz-story">${done ? (done === 1 ? rv.outroWin : rv.outroLose) : rv.intro}</div><div class="tiny">Tu ${st.beat} – ${st.lost} ${rv.name.split(' ').slice(-1)[0]}${st.grudge ? ` · rancore ${'🔥'.repeat(Math.min(5, st.grudge))}` : ''}</div></div></div>`;
}
// standings of a finished cup (for the podium): player vs the cup rival vs a third driver, from stars won
export function cupPodium(cup, p = prog()) {
  const rv = rivalOfCup(cup.id), my = cup.events.reduce((s, e) => s + (p.career.res[e.id]?.medal || 0), 0);
  const st = rivalState(rv.id, p), rivalPts = Math.round(cup.events.length * 2 + st.lost * 0.6), third = Math.round(cup.events.length * 1.4);
  const rows = [{ name: 'Tu', pts: my * 2 + 1, me: true }, { name: rv.name, pts: rivalPts * 2, rv }, { name: ['Gigi Guardrail', 'Tino Testacoda', 'Carla Carburatore', 'Dario Derapata', 'Mirko Marmitta'][cup.id.length % 5], pts: third * 2 }];
  return rows.sort((a, b) => b.pts - a.pts);
}
