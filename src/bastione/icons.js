// Bastione — little SVG icons for towers, enemies, heroes and spells (menus and HUD). No emoji: they
// render the same everywhere.
const svg = (inner, vb = '0 0 48 48') => `<svg class="bs-ic" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
const base = (c) => `<path d="M10 40 L14 26 H34 L38 40 Z" fill="${c}" stroke="#0005" stroke-width="1.5"/>`;
export const TOWER_ICON = {
  balestra: svg(`${base('#b07a4a')}<rect x="15" y="14" width="18" height="12" rx="2" fill="#3fae5a"/><path d="M12 14 L24 5 L36 14Z" fill="#2e8a46"/><path d="M14 22 Q24 12 34 22" fill="none" stroke="#5b3a1e" stroke-width="2.5"/><path d="M24 22 V10" stroke="#fff" stroke-width="2"/><path d="M21 12 L24 8 L27 12" fill="#fff"/>`),
  cannone: svg(`${base('#8b93a3')}<circle cx="24" cy="22" r="9" fill="#5b6577"/><rect x="22" y="6" width="9" height="16" rx="3" transform="rotate(35 24 22)" fill="#2f3542"/><circle cx="24" cy="22" r="3" fill="#ffd23f"/>`),
  gelo: svg(`${base('#9fc7e6')}<path d="M24 4 L33 18 L24 32 L15 18Z" fill="#7fd7ff" stroke="#fff" stroke-width="2"/><path d="M24 4 L24 32 M15 18 H33" stroke="#e8fbff" stroke-width="1.5"/>`),
  tesla: svg(`${base('#7a6aa6')}<rect x="21" y="12" width="6" height="16" fill="#4b3f72"/><ellipse cx="24" cy="24" rx="9" ry="3" fill="none" stroke="#c4b5fd" stroke-width="2.5"/><ellipse cx="24" cy="18" rx="7" ry="2.5" fill="none" stroke="#c4b5fd" stroke-width="2.5"/><circle cx="24" cy="10" r="6" fill="#a78bfa" stroke="#fff" stroke-width="1.5"/><path d="M30 6 L35 2 L33 8 L39 6" fill="none" stroke="#fde047" stroke-width="2"/>`),
  mortaio: svg(`${base('#a8643a')}<ellipse cx="24" cy="26" rx="11" ry="5" fill="#6b4226"/><rect x="18" y="8" width="11" height="18" rx="4" transform="rotate(-20 24 22)" fill="#3a2c22"/><ellipse cx="21" cy="9" rx="5" ry="2.5" transform="rotate(-20 21 9)" fill="#111"/>`),
  cecchino: svg(`${base('#c9a227')}<rect x="19" y="10" width="10" height="18" fill="#8a6d1d"/><path d="M17 10 L24 4 L31 10Z" fill="#c9a227"/><rect x="24" y="13" width="18" height="3" fill="#222"/><circle cx="31" cy="12" r="2.5" fill="#7dd3fc"/>`),
  veleno: svg(`${base('#5f7d3a')}<path d="M12 18 H36 L33 32 H15Z" fill="#3b4a2a"/><ellipse cx="24" cy="18" rx="12" ry="4" fill="#9be15d"/><circle cx="20" cy="12" r="3" fill="#b9f27c"/><circle cx="28" cy="9" r="2" fill="#b9f27c"/><circle cx="25" cy="14" r="2.5" fill="#d9ff9e"/>`),
  caserma: svg(`${base('#c9c3b8')}<rect x="13" y="18" width="22" height="12" fill="#f1ede6"/><path d="M10 19 L24 8 L38 19Z" fill="#2f7cf6"/><rect x="21" y="22" width="6" height="8" fill="#5b3a1e"/><path d="M33 4 V14" stroke="#555" stroke-width="1.5"/><path d="M33 4 H40 L37 7 L40 10 H33" fill="#2f7cf6"/>`),
  miniera: svg(`<path d="M6 40 Q10 14 24 12 Q38 14 42 40Z" fill="#8a7a6a"/><path d="M16 40 V24 H32 V40" fill="#2a1f18" stroke="#b07a4a" stroke-width="3"/><circle cx="14" cy="34" r="3" fill="#f5b400"/><circle cx="35" cy="30" r="2.5" fill="#f5b400"/><circle cx="24" cy="34" r="3.5" fill="#ffd23f"/>`),
};
const bean = (c, extra = '') => svg(`<ellipse cx="24" cy="44" rx="10" ry="2.5" fill="#0003"/><rect x="13" y="12" width="22" height="30" rx="11" fill="${c}"/><circle cx="20" cy="22" r="3.6" fill="#fff"/><circle cx="28" cy="22" r="3.6" fill="#fff"/><circle cx="20.5" cy="22.5" r="1.8" fill="#111"/><circle cx="28.5" cy="22.5" r="1.8" fill="#111"/>${extra}`);
export const ENEMY_ICON = {
  fante: bean('#ff4256'),
  lesto: bean('#ff8a3d', '<rect x="13" y="14" width="22" height="3" fill="#fff"/><path d="M6 30 H11 M4 25 H10 M6 35 H11" stroke="#ff8a3d" stroke-width="2"/>'),
  scudato: bean('#e0303f', '<path d="M13 16 Q24 4 35 16Z" fill="#9aa3b2"/><rect x="26" y="24" width="13" height="16" rx="3" fill="#9aa3b2" stroke="#5b6577" stroke-width="2"/>'),
  bruto: bean('#b8192d', '<path d="M15 32 Q24 37 33 32" stroke="#fff" stroke-width="2" fill="none"/>'),
  volante: bean('#ff5fa0', '<path d="M13 24 L2 16 L6 28Z M35 24 L46 16 L42 28Z" fill="#ffe0f0" stroke="#ff5fa0"/>'),
  gemello: bean('#ff2e6e', '<circle cx="24" cy="34" r="3" fill="#fff"/>'),
  mini: bean('#ff6b8a'),
  sciamano: bean('#d6336c', '<path d="M11 18 Q24 0 37 18 Q24 12 11 18Z" fill="#7c2d6b"/><circle cx="38" cy="30" r="4" fill="#86efac"/>'),
  re: bean('#d1122e', '<path d="M14 14 L16 4 L20 10 L24 3 L28 10 L32 4 L34 14Z" fill="#ffd23f"/>'),
  golem: bean('#c2410c', '<path d="M14 14 L16 4 L20 10 L24 3 L28 10 L32 4 L34 14Z" fill="#ffd23f"/><path d="M15 30 H33" stroke="#7c2d12" stroke-width="3"/>'),
  drago: bean('#e11d74', '<path d="M14 14 L16 4 L20 10 L24 3 L28 10 L32 4 L34 14Z" fill="#ffd23f"/><path d="M13 24 L1 12 L5 30Z M35 24 L47 12 L43 30Z" fill="#fbcfe8"/>'),
  tiranno: bean('#9f1239', '<path d="M14 14 L16 4 L20 10 L24 3 L28 10 L32 4 L34 14Z" fill="#ffd23f"/><circle cx="24" cy="34" r="3" fill="#fb923c"/>'),
};
const hero = (c, extra) => svg(`<ellipse cx="24" cy="44" rx="11" ry="2.5" fill="#0003"/><rect x="12" y="12" width="24" height="31" rx="12" fill="${c}"/><circle cx="20" cy="22" r="3.8" fill="#fff"/><circle cx="28" cy="22" r="3.8" fill="#fff"/><circle cx="20.5" cy="22.5" r="1.9" fill="#111"/><circle cx="28.5" cy="22.5" r="1.9" fill="#111"/>${extra}`);
export const HERO_ICON = {
  capitano: hero('#2f7cf6', '<path d="M12 15 Q24 2 36 15 Z" fill="#cbd5e1"/><path d="M36 30 L46 12" stroke="#e5e7eb" stroke-width="3"/><path d="M33 26 H40" stroke="#a16207" stroke-width="3"/>'),
  arciera: hero('#22c55e', '<path d="M12 16 Q24 4 36 16 L38 10 Q24 -2 10 10Z" fill="#166534"/><path d="M40 12 Q48 26 40 40" fill="none" stroke="#a16207" stroke-width="2.5"/><path d="M40 12 V40" stroke="#fff" stroke-width="1"/>'),
  mago: hero('#a855f7', '<path d="M10 16 L24 -2 L38 16Z" fill="#6b21a8"/><circle cx="24" cy="4" r="2" fill="#fde047"/><path d="M40 14 V44" stroke="#a16207" stroke-width="2.5"/><circle cx="40" cy="12" r="4" fill="#f97316"/>'),
  orso: svg('<ellipse cx="24" cy="44" rx="13" ry="2.5" fill="#0003"/><circle cx="12" cy="12" r="5" fill="#7c4a2a"/><circle cx="36" cy="12" r="5" fill="#7c4a2a"/><rect x="9" y="10" width="30" height="33" rx="14" fill="#8b5a33"/><rect x="11" y="28" width="26" height="15" rx="6" fill="#1e40af"/><ellipse cx="24" cy="24" rx="6" ry="4.5" fill="#d6b48c"/><circle cx="24" cy="22" r="2" fill="#111"/><circle cx="18" cy="17" r="2" fill="#111"/><circle cx="30" cy="17" r="2" fill="#111"/>'),
};
export const SPELL_ICON = {
  meteore: svg('<circle cx="18" cy="32" r="10" fill="#f97316"/><circle cx="18" cy="32" r="5" fill="#fde047"/><path d="M24 26 L42 6 M20 22 L34 4 M28 30 L46 14" stroke="#fb923c" stroke-width="3" stroke-linecap="round"/>'),
  rinforzi: svg('<rect x="6" y="16" width="16" height="24" rx="8" fill="#2f7cf6"/><rect x="26" y="16" width="16" height="24" rx="8" fill="#2f7cf6"/><path d="M6 20 Q14 8 22 20Z M26 20 Q34 8 42 20Z" fill="#cbd5e1"/><circle cx="11" cy="25" r="2" fill="#fff"/><circle cx="17" cy="25" r="2" fill="#fff"/><circle cx="31" cy="25" r="2" fill="#fff"/><circle cx="37" cy="25" r="2" fill="#fff"/>'),
  glaciazione: svg('<path d="M24 4 V44 M6 14 L42 34 M6 34 L42 14" stroke="#7fd7ff" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="24" r="6" fill="#e0f7ff"/>'),
};
export const ABILITY_ICON = {
  carica: svg('<path d="M8 40 L24 8 L40 40Z" fill="#fde047" stroke="#a16207" stroke-width="2"/><path d="M24 18 V30 M24 34 V36" stroke="#a16207" stroke-width="3"/>'),
  stendardo: svg('<path d="M12 4 V44" stroke="#a16207" stroke-width="3"/><path d="M13 6 H40 L34 15 L40 24 H13Z" fill="#2f7cf6"/><circle cx="24" cy="15" r="4" fill="#ffd23f"/>'),
  pioggia: svg('<path d="M10 6 L18 30 M22 4 L30 28 M34 6 L40 26" stroke="#e5e7eb" stroke-width="2.5"/><path d="M15 28 L18 34 L21 28 M27 26 L30 32 L33 26 M37 24 L40 30 L43 24" fill="#e5e7eb"/><ellipse cx="26" cy="40" rx="18" ry="4" fill="#22c55e88"/>'),
  rete: svg('<path d="M6 8 L42 40 M16 4 L44 30 M4 18 L32 44 M42 8 L6 40 M32 4 L4 30 M44 18 L16 44" stroke="#d6b48c" stroke-width="2.5"/>'),
  cometa: svg('<circle cx="30" cy="30" r="11" fill="#f97316"/><circle cx="30" cy="30" r="5" fill="#fef08a"/><path d="M22 22 L4 4" stroke="#fb923c" stroke-width="6" stroke-linecap="round"/>'),
  portale: svg('<ellipse cx="24" cy="24" rx="16" ry="20" fill="#a855f7"/><ellipse cx="24" cy="24" rx="10" ry="14" fill="#2e1065"/><ellipse cx="24" cy="24" rx="4" ry="7" fill="#c084fc"/>'),
  terremoto: svg('<path d="M4 34 H14 L18 26 L24 40 L30 22 L34 34 H44" fill="none" stroke="#a16207" stroke-width="4" stroke-linejoin="round"/><path d="M8 44 H40" stroke="#78350f" stroke-width="3"/>'),
  ruggito: svg('<path d="M8 24 Q20 6 30 24 Q20 42 8 24Z" fill="#8b5a33"/><path d="M32 14 Q40 24 32 34 M37 10 Q47 24 37 38" fill="none" stroke="#fde047" stroke-width="3"/>'),
};
export const ICON_COIN = svg('<circle cx="24" cy="24" r="17" fill="#f5b400" stroke="#a16207" stroke-width="3"/><circle cx="24" cy="24" r="10" fill="none" stroke="#fde68a" stroke-width="2.5"/>');
export const ICON_GEM = svg('<path d="M24 6 L40 18 L24 42 L8 18Z" fill="#38bdf8" stroke="#0369a1" stroke-width="2.5"/><path d="M8 18 H40 M24 6 L18 18 L24 42 L30 18Z" fill="none" stroke="#e0f2fe" stroke-width="1.5"/>');
export const ICON_HEART = svg('<path d="M24 42 L8 26 Q2 18 8 11 Q16 4 24 14 Q32 4 40 11 Q46 18 40 26Z" fill="#ff4256" stroke="#9f1239" stroke-width="2.5"/>');
export const ICON_WAVE = svg('<path d="M6 40 V8" stroke="#555" stroke-width="3"/><path d="M8 10 H40 L32 18 L40 26 H8Z" fill="#ff4256"/>');
export const ICON_SKULL = svg('<circle cx="24" cy="20" r="14" fill="#f1f5f9"/><rect x="16" y="28" width="16" height="12" rx="3" fill="#f1f5f9"/><circle cx="18" cy="20" r="4" fill="#111"/><circle cx="30" cy="20" r="4" fill="#111"/>');
