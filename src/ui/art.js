// Procedural SVG art: cars with liveries, helmets, flags, badges
import { FLAGS } from '../data/names.js';

let _sid = 0;
const sid = () => `s${(_sid++).toString(36)}`;

function shade(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const n = parseInt(c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt > 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export function luminance(hex) {
  let c = (hex || '#000').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const n = parseInt(c, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
export const textOn = (hex) => (luminance(hex) > 0.6 ? '#0a0a0a' : '#ffffff');

function patternLayer(id, pattern, L, box) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0, h = y1 - y0;
  const s = L.secondary, a = L.accent;
  switch (pattern) {
    case 1: return `<rect x="${x0}" y="${y0 + h * 0.42}" width="${w}" height="${h * 0.2}" fill="${s}"/><rect x="${x0}" y="${y0 + h * 0.62}" width="${w}" height="${h * 0.04}" fill="${a}"/>`;
    case 2: return `<path d="M${x0 + w * 0.52} ${y0} L${x1} ${y0} L${x1} ${y1} L${x0 + w * 0.4} ${y1} Z" fill="${s}"/><path d="M${x0 + w * 0.5} ${y0} L${x0 + w * 0.535} ${y0} L${x0 + w * 0.415} ${y1} L${x0 + w * 0.38} ${y1} Z" fill="${a}"/>`;
    case 3: return [0, 1, 2].map((i) => `<path d="M${x0 + w * (0.28 + i * 0.13)} ${y0} l${w * 0.07} ${h * 0.5} l-${w * 0.07} ${h * 0.5} h${w * 0.05} l${w * 0.07} -${h * 0.5} l-${w * 0.07} -${h * 0.5} z" fill="${i === 1 ? a : s}"/>`).join('');
    case 4: return `<defs><linearGradient id="${id}g" x1="0" x2="1"><stop offset="0.15" stop-color="${L.primary}"/><stop offset="0.85" stop-color="${s}"/></linearGradient></defs><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#${id}g)"/><rect x="${x0}" y="${y0 + h * 0.66}" width="${w}" height="${h * 0.03}" fill="${a}"/>`;
    case 5: return `<rect x="${x0 + w * 0.3}" y="${y0}" width="${w * 0.09}" height="${h}" fill="${s}" transform="skewX(-20)"/><rect x="${x0 + w * 0.42}" y="${y0}" width="${w * 0.04}" height="${h}" fill="${a}" transform="skewX(-20)"/>`;
    default: return `<rect x="${x0}" y="${y0 + h * 0.64}" width="${w}" height="${h * 0.035}" fill="${s}"/>`;
  }
}

function wheel(cx, cy, r, tyreColor = '#ffd400', rimColor = '#2a2f38') {
  return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#0c0d10"/><circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="none" stroke="#1d1f24" stroke-width="${r * 0.12}"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.7}" fill="none" stroke="${tyreColor}" stroke-width="${r * 0.05}" opacity="0.9"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="${rimColor}"/>
  ${[0, 1, 2, 3, 4].map((i) => { const ang = i * 72 * Math.PI / 180; return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(ang) * r * 0.5}" y2="${cy + Math.sin(ang) * r * 0.5}" stroke="#4a515e" stroke-width="${r * 0.12}" stroke-linecap="round"/>`; }).join('')}
  <circle cx="${cx}" cy="${cy}" r="${r * 0.14}" fill="#c9ced6"/></g>`;
}

export function carSVG(category, livery, opts = {}) {
  const L = { primary: '#e10600', secondary: '#ffffff', accent: '#111111', pattern: 0, number: 1, ...livery };
  const id = sid();
  const num = opts.number ?? L.number ?? '';
  const sponsor = (opts.sponsor || '').toUpperCase().slice(0, 14);
  const tc = textOn(L.primary);
  const tyreC = opts.tyre || '#ffd400';
  if (category === 'rally') {
    const body = 'M48 168 L46 112 L78 98 L128 64 L330 58 L410 98 L528 110 L556 128 L560 168 Z';
    return `<svg viewBox="0 0 600 220" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="${id}c"><path d="${body}"/></clipPath>
      <linearGradient id="${id}sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient></defs>
      <ellipse cx="300" cy="200" rx="270" ry="10" fill="#000" opacity="0.5"/>
      <path d="M36 66 L124 58 L126 70 L42 78 Z" fill="${L.accent}"/><rect x="70" y="70" width="6" height="30" fill="#222"/>
      <g clip-path="url(#${id}c)"><rect x="40" y="50" width="530" height="130" fill="${L.primary}"/>${patternLayer(id, L.pattern, L, [40, 50, 570, 180])}<rect x="40" y="50" width="530" height="130" fill="url(#${id}sh)"/></g>
      <path d="${body}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="2"/>
      <path d="M140 70 L322 65 L392 100 L130 100 Z" fill="#11151c" stroke="#000" stroke-width="2"/>
      <path d="M150 74 L230 72 L232 97 L142 97 Z" fill="rgba(140,180,220,0.25)"/>
      <line x1="236" y1="68" x2="236" y2="100" stroke="${L.primary}" stroke-width="5"/>
      <rect x="230" y="60" width="70" height="7" rx="3" fill="${L.accent}"/>
      <path d="M100 166 a50 50 0 0 1 100 0 Z" fill="#0b0b0d"/><path d="M400 166 a50 50 0 0 1 100 0 Z" fill="#0b0b0d"/>
      ${wheel(150, 164, 38, tyreC, '#d8dde5')}${wheel(450, 164, 38, tyreC, '#d8dde5')}
      <rect x="196" y="150" width="10" height="34" fill="#151515"/><rect x="498" y="150" width="10" height="30" fill="#151515"/>
      <rect x="250" y="108" width="74" height="40" rx="6" fill="#fff"/><text x="287" y="138" font-family="Exo 2, sans-serif" font-weight="900" font-style="italic" font-size="30" text-anchor="middle" fill="#111">${num}</text>
      <circle cx="520" cy="118" r="9" fill="#fff8d0" stroke="#222" stroke-width="3"/><circle cx="500" cy="116" r="9" fill="#fff8d0" stroke="#222" stroke-width="3"/>
      <rect x="548" y="130" width="12" height="8" fill="#ffefa0"/>
      ${sponsor ? `<text x="440" y="146" font-family="Exo 2, sans-serif" font-weight="800" font-size="15" text-anchor="middle" fill="${tc}" opacity="0.92">${sponsor}</text>` : ''}
    </svg>`;
  }
  if (category === 'endurance') {
    const body = 'M36 170 L36 128 L110 114 L170 98 L232 108 L268 80 L360 76 L408 104 L462 96 L520 108 L578 138 L592 158 L586 172 Z';
    return `<svg viewBox="0 0 620 220" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="${id}c"><path d="${body}"/></clipPath>
      <linearGradient id="${id}sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.4"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.4"/></linearGradient></defs>
      <ellipse cx="310" cy="200" rx="285" ry="10" fill="#000" opacity="0.5"/>
      <path d="M14 82 L120 78 L120 90 L18 96 Z" fill="${L.accent}"/><path d="M50 92 L60 124 L70 124 L64 92 Z" fill="#1a1a1a"/>
      <g clip-path="url(#${id}c)"><rect x="30" y="70" width="570" height="110" fill="${L.primary}"/>${patternLayer(id, L.pattern, L, [30, 70, 600, 180])}<rect x="30" y="70" width="570" height="110" fill="url(#${id}sh)"/></g>
      <path d="M268 82 L120 100 L110 114 L250 108 Z" fill="${L.primary}" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
      <path d="${body}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="2"/>
      <path d="M276 84 L356 80 L398 104 L262 106 Z" fill="#0f1319" stroke="#000" stroke-width="2"/>
      <path d="M290 86 L350 84 L378 102 L282 102 Z" fill="rgba(140,180,220,0.22)"/>
      <path d="M90 170 a52 52 0 0 1 104 0 Z" fill="#08080a"/><path d="M410 170 a52 52 0 0 1 104 0 Z" fill="#08080a"/>
      ${wheel(142, 166, 35, tyreC)}${wheel(462, 166, 35, tyreC)}
      <rect x="236" y="120" width="60" height="34" rx="17" fill="#fff"/><text x="266" y="145" font-family="Exo 2, sans-serif" font-weight="900" font-style="italic" font-size="24" text-anchor="middle" fill="#111">${num}</text>
      <path d="M548 128 L582 142 L578 148 L544 136 Z" fill="#fff6b0" opacity="0.95"/>
      <rect x="40" y="150" width="20" height="5" fill="#ff2a2a"/>
      ${sponsor ? `<text x="360" y="146" font-family="Exo 2, sans-serif" font-weight="800" font-size="15" text-anchor="middle" fill="${tc}" opacity="0.92">${sponsor}</text>` : ''}
    </svg>`;
  }
  // formula
  const body = 'M40 168 L572 170 L598 160 L560 150 L470 140 L380 126 L352 110 L300 106 L262 80 L212 84 L190 100 L120 124 L62 132 L42 150 Z';
  return `<svg viewBox="0 0 620 220" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="${id}c"><path d="${body}"/></clipPath>
    <linearGradient id="${id}sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></linearGradient></defs>
    <ellipse cx="310" cy="198" rx="290" ry="9" fill="#000" opacity="0.55"/>
    <rect x="14" y="66" width="68" height="12" rx="2" fill="${L.accent}"/><rect x="16" y="80" width="62" height="6" rx="2" fill="${L.primary}"/>
    <path d="M16 62 L30 62 L34 150 L22 150 Z" fill="${L.secondary}" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
    <rect x="46" y="86" width="8" height="52" fill="#1b1b1b"/>
    <g clip-path="url(#${id}c)"><rect x="30" y="70" width="580" height="110" fill="${L.primary}"/>${patternLayer(id, L.pattern, L, [30, 70, 610, 180])}<rect x="30" y="70" width="580" height="110" fill="url(#${id}sh)"/></g>
    <path d="${body}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="2"/>
    <path d="M196 150 L352 150 L340 126 L212 118 Z" fill="rgba(0,0,0,0.25)"/>
    <circle cx="322" cy="102" r="13" fill="url(#${id}hel)"/><defs><linearGradient id="${id}hel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${opts.helmet || '#ffd400'}"/><stop offset="1" stop-color="${shade(opts.helmet || '#ffd400', -0.4)}"/></linearGradient></defs>
    <rect x="320" y="97" width="13" height="6" rx="2" fill="#111"/>
    <path d="M356 112 C340 86, 300 84, 282 100" fill="none" stroke="#1a1a1a" stroke-width="7" stroke-linecap="round"/>
    <path d="M520 166 L604 168 L606 178 L518 176 Z" fill="${L.accent}"/><path d="M590 152 L606 152 L606 178 L594 178 Z" fill="${L.secondary}"/>
    ${wheel(118, 156, 36, tyreC)}${wheel(470, 156, 34, tyreC)}
    <text x="246" y="140" font-family="Exo 2, sans-serif" font-weight="900" font-style="italic" font-size="22" text-anchor="middle" fill="${tc}" stroke="rgba(0,0,0,0.25)" stroke-width="0.5">${num}</text>
    ${sponsor ? `<text x="420" y="150" font-family="Exo 2, sans-serif" font-weight="800" font-size="13" text-anchor="middle" fill="${tc}" opacity="0.9">${sponsor}</text>` : ''}
  </svg>`;
}

export function helmetSVG(h, size = 40) {
  const id = sid();
  const pat = h?.pattern ?? 0;
  const c1 = h?.c1 || '#ff2d2d', c2 = h?.c2 || '#fff', c3 = h?.c3 || '#111';
  const shell = 'M6 30 C6 14 18 4 32 4 C46 4 58 14 58 30 L58 40 C58 50 52 56 44 56 L18 56 C10 56 6 50 6 42 Z';
  let p = '';
  if (pat === 0) p = `<rect x="0" y="22" width="64" height="8" fill="${c2}"/>`;
  if (pat === 1) p = `<path d="M0 44 L64 20 L64 32 L0 56 Z" fill="${c2}"/><path d="M0 40 L64 16 L64 20 L0 44 Z" fill="${c3}"/>`;
  if (pat === 2) p = `<circle cx="22" cy="20" r="10" fill="${c2}"/><circle cx="22" cy="20" r="5" fill="${c3}"/>`;
  if (pat === 3) p = `<path d="M32 0 L40 0 L28 64 L20 64 Z" fill="${c2}"/><path d="M44 0 L48 0 L36 64 L32 64 Z" fill="${c3}"/>`;
  if (pat === 4) p = `<rect x="0" y="0" width="64" height="18" fill="${c2}"/><path d="M0 18 L64 18 L64 22 L0 22 Z" fill="${c3}"/>`;
  if (pat === 5) p = `<path d="M10 10 L30 30 L10 50 Z" fill="${c2}"/><path d="M26 10 L46 30 L26 50 Z" fill="${c3}" opacity="0.8"/>`;
  return `<svg class="helmet" width="${size}" height="${size}" viewBox="0 0 64 64"><defs><clipPath id="${id}"><path d="${shell}"/></clipPath>
    <radialGradient id="${id}g" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient></defs>
    <g clip-path="url(#${id})"><rect width="64" height="64" fill="${c1}"/>${p}<rect width="64" height="64" fill="url(#${id}g)"/></g>
    <path d="M30 26 L60 26 L60 38 C60 40 58 42 56 42 L34 42 C31 42 29 40 29 37 Z" fill="#121418"/><path d="M34 28 L58 28 L58 32 L33 32 Z" fill="rgba(120,170,255,0.35)"/>
    <path d="${shell}" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/></svg>`;
}

export function flagSVG(nat, w = 22, h = 15) {
  const f = FLAGS[nat] || ['h', '#666', '#999'];
  const [o, ...cols] = f;
  let inner = '';
  if (o === 'h') inner = cols.map((c, i) => `<rect x="0" y="${(i * 30) / cols.length}" width="45" height="${30 / cols.length + 0.5}" fill="${c}"/>`).join('');
  else if (o === 'v') inner = cols.map((c, i) => `<rect x="${(i * 45) / cols.length}" y="0" width="${45 / cols.length + 0.5}" height="30" fill="${c}"/>`).join('');
  else if (o === 'c') inner = `<rect width="45" height="30" fill="${cols[0]}"/><circle cx="22.5" cy="15" r="8" fill="${cols[1]}"/>`;
  else if (o === 'x') inner = `<rect width="45" height="30" fill="${cols[0]}"/><rect x="13" y="0" width="7" height="30" fill="${cols[1]}"/><rect x="0" y="11.5" width="45" height="7" fill="${cols[1]}"/>`;
  else if (o === 'd') inner = `<rect width="45" height="30" fill="${cols[0]}"/><path d="M22.5 4 L41 15 L22.5 26 L4 15Z" fill="${cols[1]}"/><circle cx="22.5" cy="15" r="6" fill="${cols[2]}"/>`;
  else if (o === 'sw') inner = `<rect width="45" height="30" fill="#d52b1e"/><rect x="19" y="6" width="7" height="18" fill="#fff"/><rect x="13.5" y="11.5" width="18" height="7" fill="#fff"/>`;
  else if (o === 'us') inner = `<rect width="45" height="30" fill="#fff"/>${[0, 2, 4, 6].map((i) => `<rect y="${i * 4.3}" width="45" height="2.2" fill="#b22234"/>`).join('')}<rect y="25.8" width="45" height="4.2" fill="#b22234"/><rect width="20" height="16" fill="#3c3b6e"/>`;
  else if (o === 'uk' || o === 'au') inner = `<rect width="45" height="30" fill="#012169"/>${o === 'uk' ? '<path d="M0 0L45 30M45 0L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0L45 30M45 0L0 30" stroke="#c8102e" stroke-width="2"/><path d="M22.5 0V30M0 15H45" stroke="#fff" stroke-width="10"/><path d="M22.5 0V30M0 15H45" stroke="#c8102e" stroke-width="6"/>' : '<g transform="scale(0.5)"><path d="M0 0L45 30M45 0L0 30" stroke="#fff" stroke-width="6"/><path d="M22.5 0V30M0 15H45" stroke="#fff" stroke-width="10"/><path d="M22.5 0V30M0 15H45" stroke="#c8102e" stroke-width="6"/></g><circle cx="33" cy="20" r="2.5" fill="#fff"/><circle cx="36" cy="9" r="1.6" fill="#fff"/><circle cx="11" cy="23" r="3" fill="#fff"/>'}`;
  return `<svg class="flag" width="${w}" height="${h}" viewBox="0 0 45 30" preserveAspectRatio="none">${inner}</svg>`;
}

export function teamBadge(team, size = 34) {
  const [a, b, c] = team.colors;
  const id = sid();
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" style="flex:none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${shade(a, -0.45)}"/></linearGradient></defs>
    <path d="M20 2 L36 8 L36 20 C36 30 28 36 20 38 C12 36 4 30 4 20 L4 8 Z" fill="url(#${id})" stroke="${b}" stroke-width="2"/>
    <path d="M8 26 L32 14 L32 18 L8 30 Z" fill="${b}" opacity="0.85"/><path d="M8 30 L32 18 L32 20 L8 32 Z" fill="${c}" opacity="0.8"/>
    <text x="20" y="20" font-family="Exo 2, sans-serif" font-weight="900" font-style="italic" font-size="10.5" text-anchor="middle" fill="${textOn(a)}">${team.short}</text></svg>`;
}

export function logoMark(size = 30) {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 40 40"><defs><linearGradient id="lmg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff5a4a"/><stop offset="1" stop-color="#a00400"/></linearGradient></defs>
  <path d="M4 34 L18 4 L24 4 L38 34 L30 34 L21 14 L12 34 Z" fill="url(#lmg)"/><path d="M14 28 L28 28 L30 34 L12 34 Z" fill="#fff"/></svg>`;
}

export function categoryArt(cat) {
  const sample = {
    formula: { primary: '#e10600', secondary: '#ffffff', accent: '#111', pattern: 1, number: 16 },
    junior: { primary: '#0a2a66', secondary: '#3aa0ff', accent: '#fff', pattern: 3, number: 2 },
    rally: { primary: '#0a2a66', secondary: '#ffcc00', accent: '#e10600', pattern: 5, number: 1 },
    endurance: { primary: '#111', secondary: '#00c2ff', accent: '#fff', pattern: 2, number: 7 },
  }[cat];
  return carSVG(cat, sample, { sponsor: cat === 'rally' ? 'Rally Apex' : 'Apex' });
}

export function trackSVG(path, { w = 300, h = 180, color = '#fff', glow = '#e10600', width = 5 } = {}) {
  const pad = 14;
  const asp = path.aspect;
  let tw = w - pad * 2, th = tw / asp;
  if (th > h - pad * 2) { th = h - pad * 2; tw = th * asp; }
  const ox = (w - tw) / 2, oy = (h - th) / 2;
  const d = path.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * tw).toFixed(1)} ${(oy + y * th).toFixed(1)}`).join(' ') + (path.closed ? ' Z' : '');
  const s = path.pts[0];
  const e = path.pts[path.pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-height:${h}px"><path d="${d}" fill="none" stroke="${glow}" stroke-opacity="0.35" stroke-width="${width + 8}" stroke-linejoin="round" stroke-linecap="round" style="filter:blur(4px)"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${ox + s[0] * tw}" cy="${oy + s[1] * th}" r="${width + 1.5}" fill="#22d37a" stroke="#000" stroke-width="2"/>${!path.closed ? `<circle cx="${ox + e[0] * tw}" cy="${oy + e[1] * th}" r="${width + 1.5}" fill="#fff" stroke="#000" stroke-width="2"/>` : ''}</svg>`;
}
