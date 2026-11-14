import { helmet3D } from '../ui/stage3d.js';
// Shared visual fragments for the career/dynasty layer (portraits, press art, charts, status)
import '../styles/career.css';
import { icon } from '../ui/icons.js';
import { teamBadge, helmetSVG, trackSVG, flagSVG } from '../ui/art.js';
import { esc } from '../ui/dom.js';
import { getTrack } from '../engine/world.js';
import { genStage, circuitPath, STAGE_STYLE } from '../ui/trackview.js';
import { STATUS, TP_PERSONAS, statusInfo, relLabel, relColor, statusIdx } from '../engine/dynasty.js';
import { playerTeam, standings, fmtM } from '../engine/season.js';

const h32 = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
const vis = (c) => (/^#f[0-9a-f]{5}$/i.test(c) || /^#e[0-9a-f]{5}$/i.test(c) ? null : c);
export const teamCol = (t) => vis(t.colors[0]) || t.colors[1] || '#888';

// ---------- principal portrait: stylised bust in team colours, persona accessories ----------
export function portraitSVG(p, team, size = 64) {
  const h = h32(p.name + team.id);
  const skins = ['#f1c7a6', '#e0ac85', '#c98e64', '#a86f4a', '#7c4f33', '#f5d6bf'];
  const hairs = ['#1d1a18', '#3b2a1f', '#6b4a2e', '#a07a4c', '#c9c2b8', '#8d8d8d', '#2b2b2b'];
  const skin = skins[h % skins.length], hair = hairs[(h >> 3) % hairs.length];
  const c1 = teamCol(team), c2 = team.colors[1] || '#fff';
  const bald = (h >> 7) % 5 === 0;
  const beard = (h >> 9) % 4 === 0;
  const per = p.persona;
  const id = `pp${h % 100000}`;
  const glasses = per === 'professore' ? '<g fill="none" stroke="#111" stroke-width="2.2"><circle cx="41" cy="42" r="6"/><circle cx="57" cy="42" r="6"/><path d="M47 42h4"/></g>'
    : per === 'showman' ? '<path d="M33 37h30l-2 9c-1 3-6 3-8 1l-2-3h-4l-2 3c-2 2-7 2-8-1z" fill="#0d0d10"/><path d="M36 39h9M51 39h9" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>' : '';
  const brows = per === 'squalo' ? '<path d="M35 34l11 3M63 34l-11 3" stroke="#1b1512" stroke-width="3" stroke-linecap="round"/>' : per === 'volpe' ? '<path d="M35 35l10-2M63 35l-10-2" stroke="#1b1512" stroke-width="2.4" stroke-linecap="round"/>' : '<path d="M36 35h9M53 35h9" stroke="#1b1512" stroke-width="2.4" stroke-linecap="round"/>';
  const mouth = per === 'showman' ? '<path d="M42 56q7 6 14 0" fill="#fff" stroke="#5a2a20" stroke-width="1.6"/>' : per === 'gentiluomo' ? '<path d="M43 56q6 4 12 0" fill="none" stroke="#5a2a20" stroke-width="2"/>' : per === 'squalo' ? '<path d="M43 57h12" stroke="#5a2a20" stroke-width="2.4" stroke-linecap="round"/>' : '<path d="M44 57q5 2 10 0" fill="none" stroke="#5a2a20" stroke-width="2"/>';
  return `<svg class="portrait" width="${size}" height="${size}" viewBox="0 0 98 98" style="flex:none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="#0a0b0e"/></linearGradient><clipPath id="${id}c"><rect width="98" height="98" rx="2"/></clipPath></defs>
    <g clip-path="url(#${id}c)"><rect width="98" height="98" fill="url(#${id})"/><path d="M-10 98 L40 -4 L52 -4 L2 98Z" fill="rgba(255,255,255,.06)"/>
    <path d="M14 98c2-20 16-28 35-28s33 8 35 28z" fill="#15171c"/><path d="M38 72l11 14 11-14" fill="${c2}"/><path d="M49 86l-4 12h8z" fill="${c1}"/>
    <rect x="42" y="58" width="14" height="14" fill="${skin}"/>
    <ellipse cx="49" cy="43" rx="17" ry="20" fill="${skin}"/>
    ${bald ? `<path d="M32 38c0-14 8-21 17-21s17 7 17 21c-2-6-4-9-6-10-6 2-16 2-22 0-2 1-4 4-6 10z" fill="${hair}" opacity=".35"/>` : `<path d="M31 41c-2-17 7-26 18-26s21 8 18 26c-2-7-5-11-8-12-6 3-15 3-21 0-3 1-6 5-7 12z" fill="${hair}"/>`}
    ${beard ? `<path d="M33 46c1 13 8 18 16 18s15-5 16-18c-3 6-8 8-16 8s-13-2-16-8z" fill="${hair}" opacity=".85"/>` : ''}
    ${brows}<circle cx="41" cy="42" r="2.2" fill="#1b1512"/><circle cx="57" cy="42" r="2.2" fill="#1b1512"/>${glasses}${mouth}</g></svg>`;
}

export function principalCard(st, teamId, extra = '') {
  const t = st.teams[teamId]; const p = st.dyn?.principals?.[teamId];
  if (!t || !p) return '';
  const P = TP_PERSONAS[p.persona];
  const rc = relColor(p.rel);
  return `<div class="tp-card" style="--tc:${teamCol(t)}">${portraitSVG(p, t, 64)}<div class="grow" style="min-width:0"><div class="tp-name">${esc(p.name)}</div><div class="tiny muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.name)}</div><div class="row gap6 mt8"><span class="tp-persona" style="--pc:${P.color}">${esc(P.name)}</span><span class="tiny" style="color:${rc};font-weight:700">${relLabel(p.rel)}</span></div></div>${extra}</div>`;
}

export function relMeter(r) {
  const c = relColor(r);
  const w = Math.abs(r) / 2;
  return `<div class="rel-meter"><i style="${r >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%;background:${c}"></i><b></b></div>`;
}

// ---------- press art ----------
export function pressArt(st, img, w = 420, h = 236) {
  if (!img) return `<div class="pr-art empty" style="aspect-ratio:${w}/${h}">${icon('mic', 'ico', 'style="width:40px;height:40px;opacity:.25"')}</div>`;
  if (img.k === 'track') {
    const tr = getTrack(st.category, img.id);
    let path = null;
    try { path = st.category === 'rally' ? genStage(tr.seed, STAGE_STYLE[tr.id]) : circuitPath(tr.cid); } catch {}
    return `<div class="pr-art track" style="aspect-ratio:${w}/${h}"><div class="pr-flag">${flagSVG(tr?.nat, 54, 36)}</div>${path ? trackSVG(path, { w, h, glow: 'rgba(229,20,27,.9)', color: '#fff', width: 5, start: false }) : ''}<div class="pr-cap">${esc(tr?.name || '')}</div></div>`;
  }
  if (img.k === 'team') {
    const t = st.teams[img.id]; if (!t) return pressArt(st, null, w, h);
    const p = st.dyn?.principals?.[t.id];
    const c = teamCol(t);
    return `<div class="pr-art team" style="aspect-ratio:${w}/${h};--c1:${c};--c2:${t.colors[1]};--c3:${t.colors[2] || '#111'}"><i class="s1"></i><i class="s2"></i><div class="pr-badge">${teamBadge(t, Math.round(h * 0.55))}</div>${p && !t.isPlayer ? `<div class="pr-por">${portraitSVG(p, t, Math.round(h * 0.62))}</div>` : ''}<div class="pr-cap">${esc(t.name)}</div></div>`;
  }
  if (img.k === 'driver') {
    const d = st.drivers[img.id]; const t = d ? st.teams[d.teamId] || st.teams[d.academy] : null;
    const c = t ? teamCol(t) : '#e5141b';
    return `<div class="pr-art driver" style="aspect-ratio:${w}/${h};--c1:${c}"><i class="s1"></i><div class="pr-helmet">${helmet3D(d?.helmet, Math.round(h * 0.7))}</div><div class="pr-num">${d?.number || ''}</div><div class="pr-cap">${esc(d?.name || '')}</div></div>`;
  }
  return `<div class="pr-art trophy" style="aspect-ratio:${w}/${h}">${icon('trophy', 'ico', `style="width:${Math.round(h * 0.42)}px;height:${Math.round(h * 0.42)}px"`)}<div class="pr-cap">Campionato</div></div>`;
}

// ---------- status ----------
export function statusEmblem(idx, size = 54) {
  const S = STATUS[idx];
  const stars = Array.from({ length: 5 }, (_, i) => `<path transform="translate(${14 + i * 9} 46) scale(.32)" d="M10 0l3 7 7 .6-5.4 4.6L16.5 20 10 16l-6.5 4 1.9-7.8L0 7.6 7 7z" fill="${i < idx ? S.color : 'rgba(255,255,255,.14)'}"/>`).join('');
  return `<svg class="st-emb" width="${size}" height="${size}" viewBox="0 0 70 70" style="flex:none"><path d="M35 3 L64 14 L64 34 C64 50 51 62 35 67 C19 62 6 50 6 34 L6 14 Z" fill="#0f1115" stroke="${S.color}" stroke-width="3"/><path d="M35 9 L58 18 L58 33 C58 46 48 56 35 60 C22 56 12 46 12 33 L12 18 Z" fill="${S.color}" opacity=".16"/><text x="35" y="40" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-style="italic" font-size="26" fill="${S.color}">${['V', 'IV', 'III', 'II', 'I', 'D'][idx]}</text>${stars}</svg>`;
}

export function statusLadder(st) {
  const si = statusInfo(st);
  return `<div class="st-ladder">${STATUS.map((S, i) => `<div class="st-step ${i < si.idx ? 'done' : i === si.idx ? 'cur' : ''}" style="--sc:${S.color}" data-tip="${esc(S.perks.join(' · '))}"><i></i><span>${esc(S.name)}</span></div>`).join('')}</div>`;
}

// ---------- charts ----------
// series: [{ name, color, values:[number|null], me }]; labels: x labels
export function lineChart(series, labels, { w = 760, h = 260, invert = false, yLabel = '', fmt = (v) => Math.round(v), min = null, max = null, area = false } = {}) {
  const padL = 46, padR = 16, padT = 14, padB = 30;
  series = series.map((s) => ({ ...s, values: s.values.map((v) => (Number.isFinite(+v) && v !== null ? +v : null)) }));
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  if (!all.length) return '<div class="muted small">Nessun dato</div>';
  let lo = Number.isFinite(min) ? min : Math.min(...all), hi = Number.isFinite(max) ? max : Math.max(...all);
  if (hi === lo) { hi += 1; lo -= 1; }
  const n = Math.max(2, labels.length);
  const X = (i) => padL + (i / (n - 1)) * (w - padL - padR);
  const Y = (v) => { const f = (v - lo) / (hi - lo); return padT + (invert ? f : 1 - f) * (h - padT - padB); };
  const ticks = 4;
  let grid = '';
  for (let k = 0; k <= ticks; k++) { const v = lo + ((hi - lo) * k) / ticks; const y = Y(v); grid += `<line x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}" class="ch-grid"/><text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="ch-tick">${fmt(v)}</text>`; }
  const step = Math.ceil(labels.length / 12);
  const xl = labels.map((l, i) => (i % step === 0 || i === labels.length - 1 ? `<text x="${X(i)}" y="${h - 9}" text-anchor="middle" class="ch-tick">${esc(l)}</text>` : '')).join('');
  const paths = series.slice().sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0)).map((s) => {
    const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
    if (!pts.length) return '';
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const ar = area && s.me ? `<path d="${d} L${last[0]} ${h - padB} L${pts[0][0]} ${h - padB} Z" fill="${s.color}" opacity=".12"/>` : '';
    return `${ar}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.me ? 4 : 2}" stroke-linejoin="round" stroke-linecap="round" opacity="${s.me ? 1 : 0.75}" class="ch-line"/><circle cx="${last[0]}" cy="${last[1]}" r="${s.me ? 5 : 3}" fill="${s.color}" stroke="#0a0b0e" stroke-width="2"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">${grid}${xl}${paths}${yLabel ? `<text x="${padL}" y="10" class="ch-tick">${esc(yLabel)}</text>` : ''}</svg>`;
}
export function chartLegend(series) {
  return `<div class="ch-legend">${series.map((s) => `<span class="${s.me ? 'me' : ''}"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}
export function barChart(values, labels, { w = 760, h = 160, fmt = (v) => v.toFixed(1) } = {}) {
  const padL = 46, padR = 10, padT = 10, padB = 26;
  const mx = Math.max(0.01, ...values.map(Math.abs));
  const zero = padT + (h - padT - padB) / 2;
  const bw = (w - padL - padR) / Math.max(1, values.length);
  const bars = values.map((v, i) => { const bh = (Math.abs(v) / mx) * ((h - padT - padB) / 2); return `<rect x="${padL + i * bw + bw * 0.18}" y="${v >= 0 ? zero - bh : zero}" width="${bw * 0.64}" height="${Math.max(1, bh)}" fill="${v >= 0 ? 'var(--good)' : 'var(--bad)'}" opacity=".85"/>`; }).join('');
  const step = Math.ceil(labels.length / 12);
  const xl = labels.map((l, i) => (i % step === 0 ? `<text x="${padL + i * bw + bw / 2}" y="${h - 8}" text-anchor="middle" class="ch-tick">${esc(l)}</text>` : '')).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%"><line x1="${padL}" x2="${w - padR}" y1="${zero}" y2="${zero}" class="ch-grid"/><text x="${padL - 8}" y="${padT + 8}" text-anchor="end" class="ch-tick">+${fmt(mx)}</text><text x="${padL - 8}" y="${h - padB}" text-anchor="end" class="ch-tick">-${fmt(mx)}</text>${bars}${xl}</svg>`;
}

// ---------- the board: four members with their own mood ----------
export function boardTable(st) {
  const pt = playerTeam(st);
  const c = st.board.confidence;
  const pos = standings(st).teams.findIndex((x) => x.id === pt.id) + 1;
  const started = st.round > 0;
  const seats = [
    ['Presidente', 'gentiluomo', c],
    ['Finanza', 'professore', c + (pt.money < 0 ? -30 : pt.money > pt.baseBudget * 0.4 ? 12 : 0)],
    ['Azionisti', 'volpe', c - 6 + statusIdx(st) * 3],
    ['Area sportiva', 'squalo', c + (started ? (st.board.target - pos) * 7 : 0)],
  ];
  return `<div class="board-table">${seats.map(([n, per, m], i) => { const mood = m >= 70 ? ['Entusiasta', 'happy'] : m >= 45 ? ['Fiducioso', ''] : m >= 25 ? ['Perplesso', 'meh'] : ['Furioso', 'angry']; return `<div class="board-seat ${mood[1]}">${portraitSVG({ name: `${n}${pt.id}${i}`, persona: per }, { id: pt.id, colors: ['#2a2f37', pt.colors[1] || '#fff', '#111'] }, 52)}<b>${n}</b><span class="mood">${mood[0]}</span></div>`; }).join('')}</div>`;
}

// ---------- season objectives: progress towards each target (mirrors the checks in engine/progress.js) ----------
const OBJ_GOAL = { win: ['wins', 1], podiums3: ['podiums', 3], podium: ['podiums', 1], points10: ['pointsRaces', 10], points5: ['pointsRaces', 5], pole: ['poles', 1], double: ['doublePoints', 1], nodnf5: ['bestNoDnfStreak', 5], onetwo: ['oneTwos', 1] };
export function objectiveProgress(o, stats) {
  const g = OBJ_GOAL[o.id]; if (!g) return { v: o.done ? 1 : 0, n: 1, pct: o.done ? 100 : 0 };
  const n = g[1]; const v = o.done ? n : Math.min(n, stats?.[g[0]] || 0);
  return { v, n, pct: Math.round((v / n) * 100) };
}
// one objective with its progress bar: hub, career screen, season review
export function objectiveRow(o, stats, { money = true } = {}) {
  const p = objectiveProgress(o, stats);
  return `<div class="objp ${o.done ? 'done' : ''}"><span class="objp-ic">${icon(o.done ? 'check' : 'target')}</span><div class="objp-b"><div class="objp-t"><b>${esc(o.text)}</b><span class="objp-n mono">${o.done ? 'Fatto' : `${p.v}/${p.n}`}</span></div><div class="objp-bar"><i style="width:${p.pct}%"></i></div></div><span class="objp-r">+${o.xp} XP${money && o.money ? `<small>+${fmtM(o.money)}</small>` : ''}</span></div>`;
}
// circular progress ring (SVG): v in 0..1 with a big centred label
export function ring(v, { size = 76, stroke = 7, color = 'var(--team)', label = '', sub = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v)), m = size / 2;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="${stroke}"/><circle class="ring-v" cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="butt" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - f)).toFixed(1)}" style="--c:${c.toFixed(1)}" transform="rotate(-90 ${m} ${m})"/></svg><div class="ring-l"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div></div>`;
}
