// SVG charts with one shared look: thin marks, recessive grid, text in ink tokens (never the
// series colour), one highlighted series (the player) against muted rivals, direct labels on the
// few series that matter and a hover tooltip (data-tip) on every point.
import { esc } from './dom.js';

const INK = { text: '#f4f5f7', text2: 'rgba(244,245,247,.72)', muted: 'rgba(244,245,247,.46)', grid: 'rgba(255,255,255,.07)', axis: 'rgba(255,255,255,.18)', rival: 'rgba(214,220,232,.34)' };
const FONT = "font-family=\"'Barlow Condensed','Arial Narrow',sans-serif\"";
const nice = (max) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, max)))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

// Cumulative lines. series: [{ id, name, color, values: [..], me, lead }], labels: x tick labels.
// The player's line wears the team colour; the leader is white; everyone else is a quiet grey.
export function progressChart(series, labels, { w = 580, h = 340, unit = 'pt', empty = 'Nessun evento disputato' } = {}) {
  const n = labels.length;
  if (!n || !series.length) return `<div class="chart-empty">${esc(empty)}</div>`;
  const padL = 36, padR = 128, padT = 14, padB = 30;
  const iw = w - padL - padR, ih = h - padT - padB;
  const max = nice(Math.max(1, ...series.flatMap((s) => s.values)));
  const X = (i) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw), Y = (v) => padT + ih - (v / max) * ih;
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = (max / 4) * k, y = Y(v); g += `<line x1="${padL}" x2="${padL + iw}" y1="${y}" y2="${y}" stroke="${k ? INK.grid : INK.axis}"/><text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="12.5" fill="${INK.muted}" ${FONT}>${Math.round(v)}</text>`; }
  const step = Math.ceil(n / 12);
  labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${X(i)}" y="${h - 9}" text-anchor="middle" font-size="12.5" fill="${INK.muted}" ${FONT} letter-spacing=".06em">${esc(l)}</text>`; });
  const order = [...series].sort((a, b) => (a.me ? 2 : a.lead ? 1 : 0) - (b.me ? 2 : b.lead ? 1 : 0));
  let lines = '', dots = '', hits = '';
  for (const s of order) {
    const col = s.me ? s.color : s.lead ? '#ffffff' : INK.rival, sw = s.me ? 3 : s.lead ? 2 : 1.5;
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    lines += n > 1 ? `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>` : '';
    if (s.me || s.lead || n === 1) dots += `<circle cx="${X(n - 1)}" cy="${Y(s.values[n - 1])}" r="${s.me ? 5 : 4}" fill="${col}" stroke="#0e1014" stroke-width="2"/>`;
    s.values.forEach((v, i) => { hits += `<circle cx="${X(i)}" cy="${Y(v)}" r="9" fill="transparent" data-tip="${esc(s.name)} · ${esc(labels[i])}: ${v} ${unit}"/>`; });
  }
  // direct labels: the player, the leader and the closest rivals; nudged apart so they never collide
  const labelled = [...series].sort((a, b) => b.values[n - 1] - a.values[n - 1]);
  const pick = labelled.filter((s, i) => s.me || i < 3).slice(0, 4).map((s) => ({ s, y: Y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < pick.length; i++) if (pick[i].y - pick[i - 1].y < 17) pick[i].y = pick[i - 1].y + 17;
  const over = pick.length ? pick[pick.length - 1].y - (padT + ih) : 0;
  if (over > 0) pick.forEach((p) => (p.y -= over));
  let lab = '';
  for (const { s, y } of pick) {
    const col = s.me ? s.color : s.lead ? '#ffffff' : INK.rival;
    lab += `<rect x="${padL + iw + 12}" y="${y - 5}" width="10" height="10" fill="${col}" transform="skewX(-12)" style="transform-box:fill-box;transform-origin:center"/><text x="${padL + iw + 28}" y="${y + 4.5}" font-size="14" font-weight="${s.me ? 700 : 600}" fill="${s.me ? INK.text : INK.text2}" ${FONT} letter-spacing=".03em">${esc(s.short || s.name).toUpperCase().slice(0, 13)} <tspan fill="${INK.muted}">${s.values[n - 1]}</tspan></text>`;
  }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Andamento punti" preserveAspectRatio="xMidYMid meet">${g}${lines}${dots}${lab}${hits}</svg>`;
}

// Radar. axes: [{ name }], series: [{ name, color, values (0..1 per axis), kind: 'me' | 'ref' | 'avg' }]
export function radarChart(axes, series, { size = 320, legend = true, raw = null } = {}) {
  const n = axes.length, cx = size / 2, cy = size / 2 + 4, R = size / 2 - 54;
  const P = (i, r) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * R * r, cy + Math.sin(a) * R * r]; };
  let g = '';
  for (const r of [0.25, 0.5, 0.75, 1]) g += `<polygon points="${axes.map((_, i) => P(i, r).map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${r === 1 ? 'rgba(255,255,255,.02)' : 'none'}" stroke="${r === 1 ? INK.axis : INK.grid}"/>`;
  axes.forEach((a, i) => {
    const [x, y] = P(i, 1), [lx, ly] = P(i, 1.2);
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${INK.grid}"/>`;
    const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
    const words = a.name.toUpperCase().split(' ');
    const lines = words.length > 1 && a.name.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [a.name.toUpperCase()];
    lines.forEach((t, k) => { g += `<text x="${lx.toFixed(1)}" y="${(ly + 4 + (k - (lines.length - 1) / 2) * 14).toFixed(1)}" text-anchor="${anchor}" font-size="12.5" font-weight="600" fill="${INK.text2}" ${FONT} letter-spacing=".08em">${esc(t)}</text>`; });
  });
  let shapes = '', hits = '';
  const order = [...series].sort((a, b) => (a.kind === 'me') - (b.kind === 'me'));
  for (const s of order) {
    const pts = s.values.map((v, i) => P(i, Math.max(0.04, Math.min(1, v))));
    const d = pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
    if (s.kind === 'me') shapes += `<polygon points="${d}" fill="${s.color}" fill-opacity=".22" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${s.color}" stroke="#0e1014" stroke-width="2"/>`).join('')}`;
    else shapes += `<polygon points="${d}" fill="none" stroke="${s.kind === 'ref' ? '#ffffff' : INK.rival}" stroke-width="1.5" ${s.kind === 'avg' ? 'stroke-dasharray="4 4"' : ''} stroke-linejoin="round"/>`;
    if (s.kind === 'me') pts.forEach((p, i) => { hits += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="12" fill="transparent" data-tip="${esc(axes[i].name)}: ${raw ? raw(s, i) : Math.round(s.values[i] * 100)}"/>`; });
  }
  const leg = legend ? `<div class="chart-legend">${series.map((s) => `<span><i class="${s.kind}" style="${s.kind === 'me' ? `background:${s.color}` : ''}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<div class="chart-radar"><svg class="chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="Confronto prestazioni">${g}${shapes}${hits}</svg>${leg}</div>`;
}
