// Rendered circuit map for previews (calendar, weekend briefing, loading veil): a telemetry-style
// plan view. The racing line is shaded by reference speed (single-hue ramp: deep blue = slow,
// white = flat out, so it also reads without colour vision), corners are numbered from the
// track geometry, DRS straights and the start line are marked, and a faint contour backdrop
// gives the sheet a surveyed-map feel.
import { trackGeometry, referenceProfile, drsZones } from '../engine/trackphys.js';
import { genStage, STAGE_STYLE } from './trackview.js';

const F = "font-family=\"'Barlow Condensed','Arial Narrow',sans-serif\"";
const cache = new Map();
const lerp = (a, b, t) => a + (b - a) * t;
function ramp(t) {
  // #2447d8 -> #2fa8ff -> #f2f8ff
  const s = [[36, 71, 216], [47, 168, 255], [242, 248, 255]];
  const k = Math.max(0, Math.min(1, t)) * 2, i = Math.min(1, Math.floor(k)), f = k - i;
  return `rgb(${[0, 1, 2].map((c) => Math.round(lerp(s[i][c], s[i + 1][c], f))).join(',')})`;
}
function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
function contours(seed, w, h) {
  const r = rng(seed || 7); let o = '';
  for (let k = 0; k < 5; k++) {
    const cx = r() * w, cy = r() * h, rx = 70 + r() * 150, ry = rx * (0.5 + r() * 0.5), rot = r() * 180;
    for (let j = 1; j <= 5; j++) o += `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${(rx * j * 0.34).toFixed(0)}" ry="${(ry * j * 0.34).toFixed(0)}" transform="rotate(${rot.toFixed(0)} ${cx.toFixed(0)} ${cy.toFixed(0)})" fill="${j === 1 ? 'rgba(255,255,255,.022)' : 'none'}" stroke="rgba(255,255,255,${(0.075 - j * 0.009).toFixed(3)})" stroke-width="1"/>`;
  }
  return o;
}
const frame = (w, h, inner, seed, id) => `<svg class="track-art" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mappa del tracciato"><defs><clipPath id="${id}"><rect width="${w}" height="${h}"/></clipPath><pattern id="${id}g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,.035)"/></pattern></defs><g clip-path="url(#${id})"><rect width="${w}" height="${h}" fill="url(#${id}g)"/>${contours(seed, w, h)}${inner}</g></svg>`;

export function trackArt(catId, tr, { w = 640, h = 400, accent = '#e5141b', numbers = true, legend = true } = {}) {
  const key = [catId, tr.id, tr.cid, w, h, accent, numbers, legend].join('|');
  if (cache.has(key)) return cache.get(key);
  let out = '';
  try { out = catId === 'rally' || !tr.cid ? stageArt(tr, w, h, accent) : circuitArt(catId, tr, w, h, accent, numbers, legend); } catch (e) { console.warn('trackArt', e); }
  cache.set(key, out);
  return out;
}

function circuitArt(catId, tr, w, h, accent, numbers, legend) {
  const g = trackGeometry(tr.cid); if (!g) return '';
  const pr = referenceProfile(catId, tr.cid, tr.lap);
  const [minx, miny, maxx, maxy] = g.bbox;
  const pad = 46, padB = legend ? 62 : 46;
  const sc = Math.min((w - pad * 2) / (maxx - minx), (h - pad - padB) / (maxy - miny));
  const ox = (w - (maxx - minx) * sc) / 2, oy = pad + ((h - pad - padB) - (maxy - miny) * sc) / 2;
  const X = (i) => ox + (g.x[i] - minx) * sc, Y = (i) => oy + (g.y[i] - miny) * sc;
  const N = g.N;
  let d = ''; for (let i = 0; i < N; i += 2) d += `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(i).toFixed(1)}`; d += 'Z';
  let vmin = Infinity, vmax = 0; for (let i = 0; i < N; i++) { vmin = Math.min(vmin, pr.v[i]); vmax = Math.max(vmax, pr.v[i]); }
  const tw = Math.max(7, Math.min(12, w / 70));
  // speed-shaded racing line in short runs
  const step = Math.max(2, Math.round(N / 220)); let seg = '';
  for (let i = 0; i < N; i += step) {
    let v = 0, c = 0, p = `M${X(i).toFixed(1)} ${Y(i).toFixed(1)}`;
    for (let j = 1; j <= step + 1; j++) { const k = (i + j) % N; p += `L${X(k).toFixed(1)} ${Y(k).toFixed(1)}`; v += pr.v[k]; c++; }
    seg += `<path d="${p}" stroke="${ramp((v / c - vmin) / (vmax - vmin || 1))}"/>`;
  }
  // DRS straights: dashed green rail beside the track
  let drs = '';
  try {
    for (const [a, b] of drsZones(catId, tr, 2)) {
      const i0 = Math.floor(a * N), i1 = Math.floor(b * N); let p = '';
      for (let i = i0; i <= i1; i += 3) { const k = ((i % N) + N) % N, nx = -Math.sin(g.hdg[k]), ny = Math.cos(g.hdg[k]); p += `${p ? 'L' : 'M'}${(X(k) + nx * (tw + 5)).toFixed(1)} ${(Y(k) + ny * (tw + 5)).toFixed(1)}`; }
      const m = ((Math.floor((i0 + i1) / 2) % N) + N) % N, nx = -Math.sin(g.hdg[m]), ny = Math.cos(g.hdg[m]);
      drs += `<path d="${p}" fill="none" stroke="#3ddc84" stroke-width="2.5" stroke-dasharray="7 5" stroke-linecap="round"/><text x="${(X(m) + nx * (tw + 20)).toFixed(1)}" y="${(Y(m) + ny * (tw + 20) + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#3ddc84" ${F} letter-spacing=".12em">DRS</text>`;
    }
  } catch {}
  // corner numbers on the outside of each bend
  let cn = '';
  if (numbers) g.corners.forEach((c, n) => {
    const k = c.i % N, nx = -Math.sin(g.hdg[k]), ny = Math.cos(g.hdg[k]), s = -c.dir * (tw + 13);
    const x = X(k) + nx * s, y = Y(k) + ny * s;
    cn += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9.5" fill="#0d0f13" stroke="rgba(255,255,255,.28)"/><text x="${x.toFixed(1)}" y="${(y + 4.2).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="rgba(244,245,247,.86)" ${F}>${n + 1}</text>`;
  });
  // start/finish: chequered bar across the track + direction arrow
  const hx = Math.cos(g.hdg[0]), hy = Math.sin(g.hdg[0]), sx = X(0), sy = Y(0), nx = -hy, ny = hx;
  const sf = `<g transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)}) rotate(${(Math.atan2(hy, hx) * 180 / Math.PI).toFixed(1)})"><rect x="-3" y="${-tw - 3}" width="6" height="${tw * 2 + 6}" fill="#fff"/><rect x="-3" y="${-tw - 3}" width="3" height="${(tw + 3) / 2}" fill="#111"/><rect x="0" y="${-tw - 3 + (tw + 3) / 2}" width="3" height="${(tw + 3) / 2}" fill="#111"/><rect x="-3" y="0" width="3" height="${(tw + 3) / 2}" fill="#111"/><rect x="0" y="${(tw + 3) / 2}" width="3" height="${(tw + 3) / 2}" fill="#111"/><path d="M12 ${-tw - 12} h18 m-7 -5 l7 5 l-7 5" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  // sector split marks
  let sec = '';
  for (const [f, lab] of [[1 / 3, 'S2'], [2 / 3, 'S3']]) { const k = Math.floor(f * N), ax = -Math.sin(g.hdg[k]), ay = Math.cos(g.hdg[k]); sec += `<line x1="${(X(k) - ax * (tw + 2)).toFixed(1)}" y1="${(Y(k) - ay * (tw + 2)).toFixed(1)}" x2="${(X(k) + ax * (tw + 2)).toFixed(1)}" y2="${(Y(k) + ay * (tw + 2)).toFixed(1)}" stroke="${accent}" stroke-width="3"/>`; void lab; }
  const lg = legend ? `<g transform="translate(${pad - 18} ${h - 30})"><defs><linearGradient id="ta-r${tr.id}"><stop offset="0" stop-color="${ramp(0)}"/><stop offset=".5" stop-color="${ramp(0.5)}"/><stop offset="1" stop-color="${ramp(1)}"/></linearGradient></defs><text y="-8" font-size="11.5" font-weight="600" fill="rgba(244,245,247,.5)" ${F} letter-spacing=".16em">VELOCITÀ</text><rect width="150" height="6" fill="url(#ta-r${tr.id})"/><text y="20" font-size="12.5" font-weight="600" fill="rgba(244,245,247,.72)" ${F}>${Math.round(vmin * 3.6 * (pr.lap / tr.lap))}</text><text x="150" y="20" text-anchor="end" font-size="12.5" font-weight="600" fill="rgba(244,245,247,.72)" ${F}>${Math.round(vmax * 3.6 * (pr.lap / tr.lap))} km/h</text><g transform="translate(190 0)"><line x1="0" x2="26" y1="3" y2="3" stroke="#3ddc84" stroke-width="2.5" stroke-dasharray="7 5"/><text x="34" y="7" font-size="12.5" font-weight="600" fill="rgba(244,245,247,.72)" ${F} letter-spacing=".06em">ZONA DRS</text><rect x="118" y="-3" width="3" height="12" fill="${accent}"/><text x="128" y="7" font-size="12.5" font-weight="600" fill="rgba(244,245,247,.72)" ${F} letter-spacing=".06em">SETTORI</text></g></g>` : '';
  void nx; void ny;
  const inner = `<path d="${d}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="${tw + 10}" stroke-linejoin="round" transform="translate(5 8)" style="filter:blur(6px)"/>
    <path d="${d}" fill="none" stroke="#090a0d" stroke-width="${tw + 7}" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="#3a3f49" stroke-width="${tw + 3.5}" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="#1b1e24" stroke-width="${tw}" stroke-linejoin="round"/>
    <g fill="none" stroke-width="${(tw * 0.52).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round">${seg}</g>${drs}${sec}${sf}${cn}${lg}`;
  return frame(w, h, inner, tr.seed, `ta${tr.id}${w}`);
}

function stageArt(tr, w, h, accent) {
  const p = genStage(tr.seed, STAGE_STYLE[tr.id]);
  const pad = 50; let tw = w - pad * 2, th = tw / p.aspect;
  if (th > h - pad * 2) { th = h - pad * 2; tw = th * p.aspect; }
  const ox = (w - tw) / 2, oy = (h - th) / 2;
  const P = (q) => [ox + q[0] * tw, oy + q[1] * th];
  const d = p.pts.map((q, i) => { const [x, y] = P(q); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('');
  const [sx, sy] = P(p.pts[0]), [ex, ey] = P(p.pts[p.pts.length - 1]);
  let km = '';
  for (let k = 1; k < 4; k++) { const [x, y] = P(p.pts[Math.floor((p.pts.length - 1) * k / 4)]); km += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#0d0f13" stroke="#fff" stroke-width="2"/><text x="${(x + 12).toFixed(1)}" y="${(y - 8).toFixed(1)}" font-size="12.5" font-weight="700" fill="rgba(244,245,247,.75)" ${F} letter-spacing=".08em">${k * 25}%</text>`; }
  const tag = (x, y, t, col) => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="8" fill="${col}" stroke="#0d0f13" stroke-width="3"/><text y="-16" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" ${F} letter-spacing=".14em">${t}</text></g>`;
  const inner = `<path d="${d}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="16" stroke-linejoin="round" stroke-linecap="round" transform="translate(5 8)" style="filter:blur(6px)"/>
    <path d="${d}" fill="none" stroke="#090a0d" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="#6b5a45" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="#f2f8ff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1 7"/>${km}${tag(sx, sy, 'START', '#3ddc84')}${tag(ex, ey, 'ARRIVO', accent)}`;
  return frame(w, h, inner, tr.seed, `ts${tr.id}${w}`);
}
