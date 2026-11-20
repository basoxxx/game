// Arcade Baso — small inline SVG key art for the menu cards (no images to load).
export const ART = {
  astro: `<svg viewBox="0 0 320 180" aria-hidden="true"><defs><radialGradient id="aaN" cx=".7" cy=".3" r=".7"><stop offset="0" stop-color="#ff4f8b" stop-opacity=".55"/><stop offset="1" stop-color="#04040e" stop-opacity="0"/></radialGradient></defs><rect width="320" height="180" fill="#05051a"/><rect width="320" height="180" fill="url(#aaN)"/>
    ${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 73) % 320}" cy="${(i * 41) % 180}" r="${(i % 3) * 0.6 + 0.5}" fill="#fff" opacity=".7"/>`).join('')}
    <g transform="translate(160 132)"><path d="M0 -26 L10 4 L26 14 L8 12 L0 20 L-8 12 L-26 14 L-10 4z" fill="#36e0ff"/><ellipse cy="-6" rx="4" ry="7" fill="#c8f6ff"/><path d="M-5 20 L0 40 L5 20z" fill="#ffd23f" opacity=".9"/></g>
    <rect x="156" y="40" width="3" height="70" fill="#7dff5a" opacity=".85"/><rect x="161" y="30" width="3" height="76" fill="#7dff5a" opacity=".85"/>
    <g transform="translate(160 34)"><ellipse rx="42" ry="20" fill="#ff4f8b"/><circle cx="-14" cy="-4" r="5" fill="#ffe14d"/><circle cx="14" cy="-4" r="5" fill="#ffe14d"/><path d="M-42 4 l-22 -10 l6 18z M42 4 l22 -10 l-6 18z" fill="#ffb0c8"/></g>
    ${[[60, 80], [250, 70], [90, 110], [230, 105]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#ff5f8f"/>`).join('')}</svg>`,
  rimbalzo: `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#0b0420"/>
    <g stroke="#ff4fd8" stroke-opacity=".25">${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 30} 0 V180"/>`).join('')}${Array.from({ length: 7 }, (_, i) => `<path d="M0 ${i * 30} H320"/>`).join('')}</g>
    ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 9 }, (_, c) => `<rect x="${24 + c * 31}" y="${18 + r * 15}" width="28" height="12" rx="2" fill="${['#ff4f8b', '#ff7a3d', '#ffd23f', '#3dffb0', '#36e0ff'][r]}" opacity="${(r * 9 + c) % 7 === 3 ? 0 : 1}"/>`).join('')).join('')}
    <circle cx="190" cy="120" r="6" fill="#fff"/><path d="M190 120 L150 160" stroke="#fff" stroke-opacity=".35" stroke-width="4"/><rect x="120" y="158" width="74" height="9" rx="4.5" fill="#36e0ff"/></svg>`,
  corri: `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#120830"/><circle cx="250" cy="40" r="22" fill="#fff6e0" opacity=".9"/>
    ${[[0, 60, 40], [40, 40, 60], [255, 50, 50], [285, 30, 70]].map(([x, w, h]) => `<rect x="${x}" y="${120 - h}" width="${w}" height="${h + 60}" fill="#1e1848"/>`).join('')}
    <path d="M110 180 L150 90 L170 90 L210 180z" fill="#1a1236"/><path d="M137 180 L156 90 M183 180 L164 90" stroke="#d36bff" stroke-width="2" stroke-dasharray="8 8"/>
    <rect x="148" y="112" width="24" height="8" fill="#ffcc1a"/><rect x="148" y="114" width="24" height="2" fill="#ff3b3b"/>
    <g transform="translate(160 160)"><circle cy="-34" r="7" fill="#ffd2a8"/><path d="M-7 -36 a7 7 0 0 1 14 0z" fill="#ffffff"/><rect x="-7" y="-28" width="14" height="18" rx="6" fill="#36e0ff"/><path d="M-4 -10 l-6 12 M4 -10 l7 10" stroke="#20203a" stroke-width="5" stroke-linecap="round"/></g>
    ${[0, 1, 2, 3].map((i) => `<circle cx="160" cy="${132 - i * 9}" r="3.2" fill="#ffd84d"/>`).join('')}</svg>`,
  labirinto: `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#1c0a24"/>
    <g fill="none" stroke="#ff5fa2" stroke-width="6" stroke-linecap="round"><path d="M20 20 H300 V160 H20z"/><path d="M60 60 H120 M200 60 H260 M60 120 H130 M190 120 H260 M160 20 V70 M100 60 V100 M220 60 V100 M140 95 H180"/></g>
    ${Array.from({ length: 18 }, (_, i) => `<circle cx="${40 + i * 14}" cy="40" r="2.6" fill="#ffd1e8"/>`).join('')}${Array.from({ length: 8 }, (_, i) => `<circle cx="40" cy="${54 + i * 13}" r="2.6" fill="#fff3c4"/>`).join('')}
    <path d="M281 136 q6 -16 -2 -24" stroke="#2fb04a" stroke-width="3" fill="none"/><path d="M276 138 q10 -2 10 12 q-4 10 -16 4z" fill="#ff3b1f"/>
    <g transform="translate(160 140)"><circle r="14" fill="#7dff5a"/><circle cx="-5" cy="-4" r="4" fill="#fff"/><circle cx="5" cy="-4" r="4" fill="#fff"/><circle cx="-4" cy="-4" r="2" fill="#10061a"/><circle cx="6" cy="-4" r="2" fill="#10061a"/><path d="M-6 5 q6 6 12 0" stroke="#40081a" stroke-width="2.5" fill="none"/><path d="M-10 -10 l-3 -8 l6 4z M10 -10 l3 -8 l-6 4z" fill="#fff0c8"/></g>
    ${[['#ff3b4f', 90], ['#33e1ff', 230]].map(([c, x]) => `<g transform="translate(${x} 92)"><ellipse rx="11" ry="13" fill="${c}"/><rect x="-11" y="-1" width="22" height="4" fill="#16101e"/><ellipse cx="-12" cy="-8" rx="8" ry="4" fill="#e8f6ff" opacity=".7"/><ellipse cx="12" cy="-8" rx="8" ry="4" fill="#e8f6ff" opacity=".7"/><circle cx="-4" cy="-5" r="3" fill="#fff"/><circle cx="4" cy="-5" r="3" fill="#fff"/></g>`).join('')}</svg>`,
};
