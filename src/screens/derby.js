// "Scontro Totale" mode: career ladder of cups, free events, a garage (upgrades, paint, liveries)
// and the old championship; then you drive it yourself.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { VENUES, buildTrack } from '../derby/tracks.js';
import { BANGERS, LIVERIES, UPGRADES, tuneSpec } from '../derby/cars.js';
import { CHAMPIONSHIP, champGet, champStart, champNext, champReset } from '../derby/champ.js';
import { CHALLENGES, checkChallenges, prog, saveProg, PRICES, CAR_STARS, DIFFICULTY, MODES, MEDALS, MEDAL_COLORS, CUPS, eventById, starsOf, cupUnlocked, cupStars, venueUnlocked, VENUE_STARS, carBuyable, upgradePrice, tuneOf, lookOf } from '../derby/career.js';
import { FILTER_PRESETS, applyFilterSettings } from '../ui/gfx.js';
import { getSettings, setSettings } from '../engine/state.js';
import { WEATHERS } from '../derby/atmos.js';
import '../derby/menu.css';
import '../derby/v5.css';
import { PRESETS, driveOpts, setDriveOpts } from '../derby/handling.js';
import { RIVALS, portrait, cupStory } from '../derby/rivals.js';

const D = { tab: 'carriera', venue: 'cava', mode: 'race', car: 'berlina', opponents: 7, weather: 'auto', ev: null, playing: false, game: null };
const COLORS = ['#7a1f1f', '#b3261e', '#1f3f7a', '#2c7a74', '#5b6b2b', '#2c5a4a', '#c99a12', '#e8e4d8', '#d9d4c5', '#2b2b2b', '#b5501c', '#6b2c7a', '#8a1010', '#ffcf3a'];
const ACCENTS = ['#f2efe6', '#111111', '#ffd400', '#e10600', '#1e90ff', '#3ddc84'];
const svgCache = {};
// venue cards rendered from the real 3D scene: built one at a time while the menu is idle, cached as small JPEGs
const THUMB_KEY = 'apexdynasty_derby_thumbs', THUMB_VER = 3;
let thumbs = null, thumbBusy = false;
function thumbStore() { if (!thumbs) { try { thumbs = JSON.parse(localStorage.getItem(THUMB_KEY) || '{}') || {}; } catch { thumbs = {}; } if (thumbs.v !== THUMB_VER) thumbs = { v: THUMB_VER }; } return thumbs; }
const thumbOf = (id) => thumbStore()[id + ':' + (getSettings().gfx === 'low' ? 'l' : 'h')] || null;
async function makeThumbs() {
  if (thumbBusy || D.playing) return; thumbBusy = true;
  try {
    const { DerbyGame } = await import('../derby/game.js');
    for (const v of VENUES) {
      if (D.playing || D.tab !== 'libero' || !document.querySelector('.dz-venues')) break;
      if (thumbOf(v.id)) continue;
      await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 600 }) : setTimeout(r, 200)));
      if (D.playing || D.tab !== 'libero') break;
      const url = await DerbyGame.thumbnail(v); if (!url || url.length < 2000) continue;
      thumbStore()[v.id + ':' + (getSettings().gfx === 'low' ? 'l' : 'h')] = url; try { localStorage.setItem(THUMB_KEY, JSON.stringify(thumbs)); } catch {}
      for (const el of document.querySelectorAll(`[data-thumb="${v.id}"]`)) { el.style.backgroundImage = `url(${url})`; el.classList.add('has'); }
    }
  } catch (e) { console.warn('thumbs', e); } finally { thumbBusy = false; }
}
const thumbDiv = (v, cls = '') => { const u = thumbOf(v.id); return `<div class="dz-thumb ${cls} ${u ? 'has' : ''}" data-thumb="${v.id}" ${u ? `style="background-image:url(${u})"` : ''}>${trackSVG(v, !!cls)}</div>`; };
function trackSVG(v, big = false) {
  const key = v.id + (big ? ':big' : '');
  if (svgCache[key]) return svgCache[key];
  const sw = big ? 3 : 4;
  if (v.kind === 'derby') return (svgCache[key] = `<svg viewBox="0 0 120 80" class="dz-svg"><circle cx="60" cy="40" r="32" fill="rgba(255,120,40,.08)" stroke="currentColor" stroke-width="${sw}"/><circle cx="60" cy="40" r="24" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" opacity=".6"/>${v.island ? '<circle cx="60" cy="40" r="7" fill="currentColor" opacity=".55"/>' : `<g transform="translate(48 28)" fill="currentColor"><path d="M12 2l1.8 5.2L19 4.5l-2.2 5.3L22 12l-5.2 1.8L19 19.5l-5.2-2.2L12 22l-1.8-4.7L5 19.5l2.2-5.7L2 12l5.2-2.2L5 4.5l5.2 2.7z"/></g>`}</svg>`);
  if (v.kind === 'park') return (svgCache[key] = `<svg viewBox="0 0 120 80" class="dz-svg"><circle cx="60" cy="40" r="34" fill="rgba(61,220,132,.08)" stroke="currentColor" stroke-width="${sw}"/><circle cx="78" cy="30" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M34 52 L48 46" stroke="currentColor" stroke-width="3"/><path d="M60 62 L74 56" stroke="currentColor" stroke-width="3"/></svg>`);
  if (v.kind === 'stunt') return (svgCache[key] = `<svg viewBox="0 0 120 80" class="dz-svg"><path d="M6 22 Q40 52 58 54 L66 54 L70 44" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"/><path d="M74 58 L116 72" stroke="currentColor" stroke-width="${sw}"/><path d="M70 44 Q88 22 104 52" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 4"/>${[80, 90, 100, 110].map((x) => `<path d="M${x} ${60 + (x - 74) * 0.33}v-5" stroke="currentColor" stroke-width="1.5"/>`).join('')}</svg>`);
  const t = buildTrack(v); const [x0, z0, x1, z1] = t.bbox; const s = Math.min(110 / (x1 - x0), 70 / (z1 - z0));
  const d = t.pts.filter((_, i) => i % 6 === 0).map((p, i) => `${i ? 'L' : 'M'}${(60 + (p.x - (x0 + x1) / 2) * s).toFixed(1)},${(40 + (p.z - (z0 + z1) / 2) * s).toFixed(1)}`).join('') + 'Z';
  return (svgCache[key] = `<svg viewBox="0 0 120 80" class="dz-svg">${big ? `<path d="${d}" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="7" stroke-linejoin="round"/>` : ''}<path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"/></svg>`);
}
const pc = (x) => Math.round(Math.min(1, x) * 100);
const bar = (v, base = null) => `<div class="dz-stat">${base != null && v > base + 0.005 ? `<b style="width:${pc(v)}%"></b>` : ''}<i style="width:${pc(base ?? v)}%"></i></div>`;
const medalDot = (m) => `<span class="dz-md m${m}" title="${MEDALS[m]}"></span>`;
const money = (n) => `€ ${Math.round(n).toLocaleString('it-IT')}`;
const modesFor = (v) => (v.kind === 'derby' ? ['derby', 'squadre', 're', 'ondate'] : v.kind === 'stunt' ? ['stunt'] : v.kind === 'park' ? ['parco'] : ['race', 'elim', 'time', 'caccia', 'distruzione']);
function carStats(spec, base = null) {
  const r = (k, n) => [spec[k] / n, base ? base[k] / n : null];
  return `<div class="dz-stats"><span>Potenza</span>${bar(...r('power', 1.6))}<span>Velocità</span>${bar(...r('top', 1.3))}<span>Resistenza</span>${bar(...r('armor', 2.3))}<span>Tenuta</span>${bar(...r('grip', 1.4))}</div>`;
}

// controller / keyboard navigation of the menu: the shared pad helper focuses elements and clicks
// them with A, LB/RB switch [role=tab]; the clickable cards here are plain <div data-a>, so they
// get a tab stop, the tab strip gets ARIA tab roles, and Enter/Space activate a focused card
function padReady() {
  const root = document.querySelector('.dz-menu'); if (!root) return;
  for (const el of root.querySelectorAll('[data-a]:not(button):not(a):not(input)')) el.tabIndex = 0;
  const tabs = root.querySelector('.dz-tabs'); if (tabs) { tabs.setAttribute('role', 'tablist'); for (const t of tabs.querySelectorAll('.dz-tab')) { t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', t.classList.contains('on') ? 'true' : 'false'); } }
  if (!root._dzKeys) {
    root._dzKeys = true;
    root.addEventListener('keydown', (e) => { const el = e.target; if ((e.key === 'Enter' || e.key === ' ') && el?.matches?.('[data-a]:not(button)')) { e.preventDefault(); el.click(); } });
    root.addEventListener('click', (e) => { const el = e.target.closest?.('[data-a]'); if (el && document.documentElement.classList.contains('pad-nav')) D.focus = ['a', 'id', 'k', 'v'].filter((k) => el.dataset[k] != null).map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join(''); }, { capture: true });
  }
  // keep the controller focus on the same card across re-renders (App.refresh rebuilds the DOM)
  if (D.focus) { const el = root.querySelector(D.focus); if (el) el.focus({ preventScroll: true }); D.focus = null; }
}
function achToast() { for (const c of checkChallenges({})) { App.toast?.(`Sfida completata: ${c.name}`, `+${money(c.prize)}`); try { sfx.levelup?.(); } catch {} } }
// ---------------------------------------------------------------- garage turntable preview
const PV = { r: null, raf: 0, key: '' };
if (typeof window !== 'undefined') window.__dzpv = PV;
async function mountPreview(el, P) {
  const THREE = await import('three');
  const { buildBanger } = await import('../derby/cars.js');
  const { applyHDRI } = await import('../ui/gfx.js');
  if (!el.isConnected) return;
  if (!PV.r) {
    const r = PV.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
    const s = PV.scene = new THREE.Scene(); PV.cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
    s.fog = new THREE.Fog(0x0b0807, 14, 30);
    s.add(new THREE.HemisphereLight(0xffeedd, 0x2a1a10, 0.35));
    // workshop lighting: a soft-shadowed key from above, a warm rim from behind, a cool fill
    const key = new THREE.SpotLight(0xfff0dc, 260, 30, 0.6, 0.7, 1.6); key.position.set(3.5, 8.5, 4.5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.radius = 4; s.add(key); s.add(key.target);
    const rim = new THREE.SpotLight(0xff8a3d, 300, 30, 0.7, 0.8, 1.6); rim.position.set(-6, 4, -6); s.add(rim); s.add(rim.target);
    const fill = new THREE.DirectionalLight(0x9fc0ff, 0.5); fill.position.set(-4, 3, 6); s.add(fill);
    const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    // polished concrete floor: semi-transparent over a mirrored copy of the car = cheap planar reflection
    const ft = tex(512, 512, (g, W) => { g.fillStyle = '#2b2623'; g.fillRect(0, 0, W, W); for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,220' : '0,0,0'},${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * W, 1 + Math.random() * 3, 1 + Math.random() * 3); } g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * W / 4, 0); g.lineTo(k * W / 4, W); g.moveTo(0, k * W / 4); g.lineTo(W, k * W / 4); g.stroke(); } for (let i = 0; i < 7; i++) { const x = Math.random() * W, y = Math.random() * W, rr = 12 + Math.random() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(8,6,5,0.6)'); gr.addColorStop(1, 'rgba(8,6,5,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); } });
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(3, 3);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: ft, transparent: true, opacity: 0.8, roughness: 0.22, metalness: 0.1 })); floor.receiveShadow = true; floor.renderOrder = 2; s.add(floor);
    // turntable ring with hazard stripes, back wall with a roller door, shelves of tyres, a tool chest
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.25, 3.5, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex(512, 16, (g, W, H) => { for (let i = 0; i < 32; i++) { g.fillStyle = i % 2 ? '#e8b400' : '#151515'; g.fillRect(i * 16, 0, 16, H); } }), roughness: 0.6 })); ring.position.y = 0.004; ring.renderOrder = 3; s.add(ring);
    { const uv = ring.geometry.attributes.uv, pos = ring.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2) * 3 + 0.5, 0.5); ring.material.map.wrapS = THREE.RepeatWrapping; }
    const wt = tex(1024, 512, (g, W, H) => { g.fillStyle = '#3a3531'; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 32) for (let x = (y / 32) % 2 ? 0 : 40; x < W; x += 80) { g.fillStyle = `rgba(${90 + Math.random() * 30},${70 + Math.random() * 20},${58 + Math.random() * 16},1)`; g.fillRect(x + 2, y + 2, 76, 28); } g.fillStyle = '#5d6165'; g.fillRect(W * 0.3, H * 0.12, W * 0.4, H * 0.88); for (let y = H * 0.12; y < H; y += 18) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(W * 0.3, y, W * 0.4, 4); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(W * 0.3, y + 4, W * 0.4, 4); } g.fillStyle = '#e8b400'; g.fillRect(W * 0.3, H * 0.08, W * 0.4, H * 0.045); g.fillStyle = '#111'; g.font = 'italic 900 22px Arial'; g.textAlign = 'center'; g.fillText('OFFICINA SCONTRO TOTALE', W / 2, H * 0.118); g.font = 'italic 900 40px Arial'; g.fillStyle = 'rgba(240,235,220,0.8)'; g.fillText('RICAMBI RUGGINE', W * 0.15, H * 0.3); g.fillStyle = '#c8102e'; g.fillRect(W * 0.76, H * 0.2, W * 0.18, H * 0.14); g.fillStyle = '#fff'; g.font = 'italic 900 26px Arial'; g.fillText('BIRRA SCHIUMA', W * 0.85, H * 0.29, W * 0.17); });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(28, 9), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.85 })); wall.position.set(-5.5, 4.5, -5.5); wall.rotation.y = Math.PI / 4; wall.receiveShadow = true; s.add(wall);
    const dm = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9 }), red = new THREE.MeshStandardMaterial({ color: 0xa81818, roughness: 0.45, metalness: 0.4 });
    const stack = (x, z, n) => { for (let k = 0; k < n; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.14, 8, 18).rotateX(Math.PI / 2), dm); t.position.set(x + (Math.random() - 0.5) * 0.06, 0.14 + k * 0.28, z + (Math.random() - 0.5) * 0.06); t.castShadow = true; s.add(t); } };
    stack(-6.2, -1.2, 5); stack(-6.6, -0.3, 3); stack(-1.4, -6.3, 4); stack(-0.5, -6.6, 6);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.6), red); chest.position.set(-4.6, 0.5, -4.2); chest.rotation.y = Math.PI / 4; chest.castShadow = true; s.add(chest);
    for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), new THREE.MeshStandardMaterial({ color: [0x2a6fb0, 0xb3261e, 0x3d7a3a][k], roughness: 0.5, metalness: 0.5 })); d.position.set(-3.0 + k * 0.7, 0.45, -5.6 + k * 0.5); d.castShadow = true; s.add(d); }
    for (const x of [-2, 2]) { const tube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 3.2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 4 })); tube.position.set(x, 5.2, 0); s.add(tube); }
    PV.turn = new THREE.Group(); s.add(PV.turn);
    applyHDRI(r, s, 'dusk', { background: false, intensity: 0.55 }).catch(() => {});
  }
  const id = D.gcar || D.car, look = lookOf(id, P);
  const key = JSON.stringify([id, look]);
  if (PV.key !== key) {
    PV.key = key; while (PV.turn.children.length) PV.turn.remove(PV.turn.children[0]);
    const car = buildBanger(id, look.color, look.num, look.num * 31 + 7, { ...look, clean: true }); PV.turn.add(car);
    const mir = car.clone(true); mir.scale.y = -1; mir.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); PV.turn.add(mir);
    const L = car.userData.dims.L; PV.cam.position.set(L * 1.15 + 2.3, 1.75, L * 1.15 + 2.5); PV.cam.lookAt(0, 0.62, 0);
  }
  el.innerHTML = ''; el.appendChild(PV.r.domElement);
  const fit = () => { const w = el.clientWidth || 640, h = el.clientHeight || 360; PV.r.setSize(w, h, false); PV.r.domElement.style.width = '100%'; PV.r.domElement.style.height = '100%'; PV.cam.aspect = w / h; PV.cam.updateProjectionMatrix(); };
  fit();
  cancelAnimationFrame(PV.raf);
  let last = performance.now(), drag = null;
  el.onpointerdown = (e) => { drag = e.clientX; el.setPointerCapture(e.pointerId); };
  el.onpointermove = (e) => { if (drag != null) { PV.turn.rotation.y += (e.clientX - drag) * 0.01; drag = e.clientX; } };
  el.onpointerup = () => { drag = null; };
  const loop = (t) => {
    if (!el.isConnected) return; PV.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000); last = t; if (drag == null && !PV.hold) PV.turn.rotation.y += dt * 0.35;
    if (el.clientWidth && Math.abs(el.clientWidth - PV.r.domElement.width / PV.r.getPixelRatio()) > 2) fit();
    PV.r.render(PV.scene, PV.cam);
  };
  PV.raf = requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- tabs
function careerTab(P) {
  const stars = starsOf(P);
  const ev = D.ev && eventById(D.ev);
  return `<div class="dz-cups">${CUPS.map((c) => {
    const open = cupUnlocked(c, P), cs = cupStars(c, P);
    return `<section class="dz-cup ${open ? '' : 'locked'}" style="--cc:${c.color}">
      <div class="dz-cup-h"><div><div class="hh-eyebrow">${open ? `${cs}/${c.events.length * 3} stelle` : `${icon('lock')} Servono ${c.stars} stelle (ne hai ${stars})`}</div><div class="dz-cup-n">${esc(c.name)}</div><div class="small" style="color:var(--text2)">${esc(c.sub)}</div>${cupStory(c.id, P)}</div><div class="dz-cup-bar"><i style="width:${Math.round((cs / (c.events.length * 3)) * 100)}%"></i></div></div>
      <div class="dz-evs">${c.events.map((e, i) => { const v = VENUES.find((x) => x.id === e.venue); const r = P.career.res[e.id]; const m = r?.medal || 0; return `<div class="dz-ev ${D.ev === e.id ? 'sel' : ''} ${open ? '' : 'locked'}" ${open ? `data-a="dz-ev" data-id="${e.id}"` : ''}>
        <div class="row between"><span class="dz-ev-mode">${icon(MODES[e.mode].icon)} ${esc(MODES[e.mode].name)}</span><span class="dz-ev-md">${[1, 2, 3].map((k) => `<i class="${m >= k ? 'on m' + k : ''}"></i>`).join('')}</span></div>
        <b>${i + 1}. ${esc(e.name)}</b><div class="tiny">${esc(v?.name || e.venue)}${e.opponents ? ` · ${e.opponents} avversari` : ''}</div><div class="dz-ev-map">${v ? trackSVG(v) : ''}</div><div class="tiny dz-ev-prize">Oro: ${money(e.prize)}</div></div>`; }).join('')}</div>
    </section>`;
  }).join('')}</div>
  <div class="dz-section mt24">Sfide · ${Object.keys(P.ach || {}).length}/${CHALLENGES.length}</div>
  <div class="dz-achs">${CHALLENGES.map((c) => { const done = !!P.ach?.[c.id]; return `<div class="dz-ach ${done ? 'done' : ''}"><div class="dz-ach-i">${icon(done ? 'check' : c.icon)}</div><div><b>${esc(c.name)}</b><div class="tiny">${esc(c.desc)}</div></div><span class="dz-ach-p">${done ? 'Fatto' : money(c.prize)}</span></div>`; }).join('')}</div>
  ${ev ? `<div class="qr-go mt24"><div class="qg-sum"><b>${esc(ev.name)}</b><span>${esc(MODES[ev.mode].name)} · ${esc(VENUES.find((x) => x.id === ev.venue)?.name || '')} · ${esc(BANGERS.find((b) => b.id === D.car)?.name || '')}${ev.targets ? ` · medaglie a ${ev.targets.join(' / ')} m` : ''}</span><span class="tiny" style="display:block;color:var(--muted)">${esc(MODES[ev.mode].desc)}</span></div><button class="btn primary xl" style="min-width:300px" data-a="dz-go-ev">${icon('flag')} Corri l’evento</button></div>` : `<div class="qr-go mt24"><div class="qg-sum"><b>Scegli un evento</b><span>Vinci medaglie per guadagnare stelle: le stelle sbloccano nuove coppe, arene e auto.</span></div><button class="btn primary xl" style="min-width:300px" data-a="dz-next-ev">${icon('play')} Prossimo evento</button></div>`}`;
}
function freeTab(P) {
  const v = VENUES.find((x) => x.id === D.venue) || VENUES[0];
  const modes = modesFor(v); if (!modes.includes(D.mode)) D.mode = modes[0];
  const fact = (val, l) => `<div><b>${val}</b><span>${l}</span></div>`;
  const vFacts = v.kind === 'park' ? fact('∞', 'Tempo') + fact('1', 'Giro della morte') + fact('6', 'Trampolini') : v.kind === 'derby' ? fact('Arena', 'Formato') + fact('1', 'Sopravvive') + fact(D.opponents, 'Avversari') : v.kind === 'stunt' ? fact('3', 'Tentativi') + fact('24°', 'Trampolino') + fact('160 m', 'Pista di atterraggio') : fact(v.laps, 'Giri') + fact(v.surfaceName || 'sterrato', 'Fondo') + fact(v.jumps?.length || 0, 'Salti');
  return `<div class="dz-grid anim-in"><div>
      <div class="dz-section">Arena</div>
      <section class="dz-hero"><div class="dh-info"><div class="hh-eyebrow">${esc(MODES[D.mode].name)}</div><div class="dh-name">${esc(v.name)}</div><div class="small mt8" style="color:var(--text2);line-height:1.5">${esc(v.desc)}</div><div class="dz-facts">${vFacts}</div>${P.best[v.id] ? `<div class="mt16"><span class="tag">${icon('trophy')} Record: ${P.best[v.id]}°</span></div>` : ''}</div><div class="dh-map">${thumbDiv(v, 'big')}</div></section>
      <div class="dz-venues">${VENUES.map((x) => { const ok = venueUnlocked(x.id, P); return `<div class="dz-venue ${x.id === D.venue ? 'sel' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-a="dz-venue" data-id="${x.id}"` : ''}>${thumbDiv(x)}<b>${esc(x.name)}</b><div class="tiny">${ok ? (x.kind === 'derby' ? 'Ultimo in piedi' : x.kind === 'park' ? 'Giro libero' : x.kind === 'stunt' ? 'Salto in lungo' : `${x.laps} giri · ${(x.surfaceName || 'sterrato').toLowerCase()}`) : `${icon('lock')} ${VENUE_STARS[x.id]} stelle`}</div></div>`; }).join('')}</div>
    </div><div>
      <div class="dz-section">Tipo di evento</div>
      <div class="dz-modes">${modes.map((m) => `<div class="dz-mode ${D.mode === m ? 'sel' : ''}" data-a="dz-mode" data-id="${m}">${icon(MODES[m].icon)}<b>${esc(MODES[m].name)}</b><span>${esc(MODES[m].desc)}</span></div>`).join('')}</div>
      <div class="dz-opts">
        ${['time', 'stunt', 'ondate', 'distruzione', 'parco'].includes(D.mode) ? '' : `<span class="lbl">Avversari</span><div class="row gap4">${[3, 5, 7].map((n) => `<button class="btn sm ${D.opponents === n ? 'active' : ''}" data-a="dz-opp" data-v="${n}">${n}</button>`).join('')}</div>`}
        <span class="lbl">Meteo</span><div class="row gap4 wrap">${Object.entries(WEATHERS).map(([k, w]) => `<button class="btn sm ${D.weather === k ? 'active' : ''}" data-a="dz-weather" data-v="${k}" data-tip="${esc(w.desc)}">${esc(w.name)}</button>`).join('')}</div>
        ${optsRows()}
      </div>
      <div class="dz-section mt24">La tua auto</div>
      ${carPicker(P, true)}
    </div></div>
    <div class="qr-go mt24"><div class="qg-sum"><b>${esc(v.name)}</b><span>${esc(MODES[D.mode].name)} · ${esc(BANGERS.find((b) => b.id === D.car)?.name || '')}${['time', 'stunt', 'ondate', 'distruzione', 'parco'].includes(D.mode) ? '' : ` · ${D.opponents} avversari`}</span></div><button class="btn primary xl" style="min-width:320px" data-a="dz-go">${icon('flag')} Si parte!</button></div>`;
}
function optsRows() {
  const P = prog();
  return `<span class="lbl">Difficoltà</span><div class="row gap4 wrap">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="btn sm ${P.diff === k ? 'active' : ''}" data-a="dz-diff" data-v="${k}" data-tip="${esc(d.desc)}">${esc(d.name)}</button>`).join('')}</div>
    <span class="lbl">Filtro</span><div class="row gap4 wrap">${Object.entries(FILTER_PRESETS).map(([k, f]) => `<button class="btn sm ${(getSettings().gfxFilter || 'naturale') === k ? 'active' : ''}" data-a="dz-filter" data-v="${k}" data-tip="${esc(f.desc)}">${esc(f.label)}</button>`).join('')}</div>
    <span class="lbl">Vista</span><div><button class="btn sm ${getSettings().dzMarker !== false ? 'active' : ''}" data-a="dz-marker">Freccia sopra la mia auto</button></div>`;
}
function carPicker(P, compact = false, selId = D.car) {
  return `<div class="dz-cars ${compact ? 'compact' : ''}">${BANGERS.map((b) => { const own = P.owned.includes(b.id), canBuy = carBuyable(b.id, P); const lk = lookOf(b.id, P); const t = tuneOf(b.id, P), lv = t.eng + t.arm + t.tyr + t.nit;
    const tag = own ? (lv ? `<span class="dc-lv">+${lv}</span>` : '') : canBuy ? `<span class="dc-price">${icon('lock')} ${money(PRICES[b.id])}</span>` : `<span class="dc-price">${icon('lock')} ${CAR_STARS[b.id]} ★</span>`;
    return `<div class="dz-car ${b.id === selId ? 'sel' : ''} ${own ? '' : 'locked'}" data-a="dz-car" data-id="${b.id}"><div class="row between"><span class="dc-name"><i class="dz-sw" style="background:${lk.color}"></i>${esc(b.name)}</span>${compact ? (own ? tag : '') : tag}</div>${compact ? `<div class="tiny" style="color:var(--muted)">${own ? esc(b.cls) : tag}</div>` : `<div class="small mt8" style="color:var(--text2)">${esc(b.desc)}</div>${carStats(tuneSpec(b, t), b)}`}</div>`; }).join('')}</div>`;
}
function garageTab(P) {
  const b = BANGERS.find((x) => x.id === (D.gcar || D.car)) || BANGERS[0], own = P.owned.includes(b.id), canBuy = carBuyable(b.id, P);
  const t = tuneOf(b.id, P), lk = lookOf(b.id, P), spec = tuneSpec(b, t);
  return `<div class="dz-gar anim-in"><div>
      <div class="dz-pv" id="dz-pv"><div class="dz-pv-load">Officina…</div></div>
      <div class="dz-pv-cap"><div><div class="hh-eyebrow">${esc(b.cls)}</div><div class="dh-name" style="font-size:40px">${esc(b.name)}</div><div class="small" style="color:var(--text2)">${esc(b.desc)}</div></div>${own ? '' : canBuy ? `<button class="btn primary lg" data-a="dz-buy" data-id="${b.id}">${icon('coin')} Compra · ${money(PRICES[b.id])}</button>` : `<span class="tag">${icon('lock')} Servono ${CAR_STARS[b.id]} stelle</span>`}</div>
      ${carStats(spec, b)}
      <div class="dz-section mt24">Scuderia</div>
      ${carPicker(P, true, b.id)}
    </div><div>
      <div class="dz-section">Potenziamenti</div>
      <div class="dz-ups ${own ? '' : 'locked'}">${UPGRADES.map((u) => { const lvl = t[u.id], price = upgradePrice(b.id, lvl); return `<div class="dz-up"><div class="dz-up-i">${icon(u.icon)}</div><div><b>${esc(u.name)}</b><div class="tiny" style="color:var(--muted)">${esc(u.desc)}</div><div class="dz-pips">${[1, 2, 3].map((k) => `<i class="${lvl >= k ? 'on' : ''}"></i>`).join('')}</div></div>${price == null ? '<span class="tag">MAX</span>' : `<button class="btn sm ${P.money >= price && own ? 'primary' : ''}" ${own ? '' : 'disabled'} data-a="dz-up" data-id="${u.id}">${money(price)}</button>`}</div>`; }).join('')}</div>
      <div class="dz-section mt24">Carrozzeria</div>
      <div class="dz-opts">
        <span class="lbl">Colore</span><div class="swatches">${COLORS.map((c) => `<div class="swatch ${lk.color === c ? 'sel' : ''}" style="background:${c}" data-a="dz-look" data-k="color" data-v="${c}"></div>`).join('')}</div>
        <span class="lbl">Livrea</span><div class="row gap4 wrap">${LIVERIES.map((l) => `<button class="btn sm ${lk.livery === l.id ? 'active' : ''}" data-a="dz-look" data-k="livery" data-v="${l.id}">${esc(l.name)}</button>`).join('')}</div>
        <span class="lbl">Dettagli</span><div class="swatches">${ACCENTS.map((c) => `<div class="swatch ${lk.accent === c ? 'sel' : ''}" style="background:${c}" data-a="dz-look" data-k="accent" data-v="${c}"></div>`).join('')}</div>
        <span class="lbl">Numero</span><div class="row gap4"><button class="btn sm" data-a="dz-num" data-v="-1">${icon('minus')}</button><span class="dz-num">${lk.num}</span><button class="btn sm" data-a="dz-num" data-v="1">${icon('plus')}</button></div>
        <span class="lbl">Adesivi</span><div><button class="btn sm ${lk.stickers ? 'active' : ''}" data-a="dz-look" data-k="stickers" data-v="${lk.stickers ? '0' : '1'}">Sponsor sulle fiancate</button></div>
      </div>
      <div class="tiny mt16" style="color:var(--muted)">Trascina l’anteprima per girare l’auto. Le modifiche valgono per carriera, eventi liberi e campionato.</div>
    </div></div>`;
}
function driveTab() {
  const o = driveOpts(); const pr = PRESETS[o.preset] || PRESETS.normale; const drift = Math.round((o.drift ?? pr.drift) * 100);
  const tog = (k, label) => `<button class="btn sm ${o[k] ? 'active' : ''}" data-a="dz-dopt" data-k="${k}" data-v="${o[k] ? '0' : '1'}">${label}</button>`;
  return `<div class="dz-grid anim-in"><div>
    <div class="dz-section">Modello di guida</div>
    <div class="dz-modes">${Object.entries(PRESETS).map(([k, p]) => `<div class="dz-mode ${o.preset === k ? 'sel' : ''}" data-a="dz-preset" data-id="${k}">${icon(k === 'arcade' ? 'speed' : k === 'normale' ? 'car' : 'wrench')}<b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div>`).join('')}</div>
    <div class="dz-section mt24">Sterzo e comandi</div>
    <div class="dz-opts5">
      <span class="lbl">Sensibilità sterzo</span><div><input type="range" min="50" max="150" step="5" value="${Math.round(o.sens * 100)}" data-k="sens" class="dz-range"> <b>${Math.round(o.sens * 100)}%</b></div>
      <span class="lbl">Zona morta stick</span><div><input type="range" min="0" max="30" step="1" value="${Math.round(o.dead * 100)}" data-k="dead" class="dz-range"> <b>${Math.round(o.dead * 100)}%</b></div>
      <span class="lbl">Aiuto derapata</span><div><input type="range" min="0" max="100" step="5" value="${drift}" data-k="drift" class="dz-range"> <b>${drift}%</b> ${o.drift != null ? '<button class="btn sm" data-a="dz-dopt" data-k="drift" data-v="null">Come il modello</button>' : '<span class="tiny muted">(dal modello)</span>'}</div>
      <span class="lbl">Tastiera</span><div>${tog('kbSmooth', 'Sterzo progressivo')}</div>
      <span class="lbl">Controller</span><div>${tog('rumble', 'Vibrazione')}</div>
    </div></div><div>
    <div class="dz-section">Gara</div>
    <div class="dz-opts5">
      <span class="lbl">Avversari</span><div>${tog('rubber', 'Elastico IA (gruppo compatto)')}</div>
      <span class="lbl">Gare lunghe</span><div>${tog('pit', 'Corsia box per riparare (4+ giri)')}</div>
      ${optsRows().replace(/<span class="lbl">/g, '<span class="lbl">')}
    </div>
    <div class="small mt16" style="color:var(--text2);line-height:1.6">Arcade perdona tutto e atterra sempre in piedi; Simulazione toglie quasi tutti gli aiuti: il fondo (asfalto, sterrato, ghiaia, fango, erba, bagnato), la trazione (anteriore, posteriore, integrale) e il peso di ogni auto si sentono davvero.</div>
  </div></div>`;
}
function champTab() {
  const c = champGet(); const nx = champNext(); const nv = nx && VENUES.find((x) => x.id === nx); const me = c ? Object.entries(c.points).sort((a, b) => b[1] - a[1]) : []; const myPts = c ? (Object.entries(c.points).find(([n]) => n === 'Tu')?.[1] || 0) : 0;
  return `<div class="panel dz-champ"><div class="row between"><div><div class="hh-eyebrow">${esc(CHAMPIONSHIP.name)} · ${CHAMPIONSHIP.events.length} eventi</div><div class="small" style="color:var(--text2)">${c ? (c.done ? `Campionato concluso · ${myPts} punti · ${me.findIndex(([n]) => n === 'Tu') + 1}° in classifica` : `Round ${c.round + 1}/${CHAMPIONSHIP.events.length} · prossimo: <b>${esc(nv?.name || '')}</b> · ${myPts} punti`) : 'Sei eventi di fila, punti per posizione, demolizioni e giro veloce. Si corre con la stessa auto.'}</div></div><div class="row gap6">${c && !c.done ? `<button class="btn" data-a="dz-champ-reset">Ricomincia</button><button class="btn primary" data-a="dz-champ">${icon('flag')} Corri il round ${c.round + 1}</button>` : `<button class="btn primary" data-a="dz-champ-new">${icon('trophy')} ${c ? 'Nuovo campionato' : 'Inizia il campionato'}</button>`}</div></div>
    ${c ? `<table class="tbl mt16"><tbody>${me.slice(0, 8).map(([n, p], i) => `<tr class="${n === 'Tu' ? 'me' : ''}"><td>${i + 1}</td><td>${esc(n)}</td><td><b>${p}</b> pt</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="dz-champ-evs mt16">${CHAMPIONSHIP.events.map((id, i) => { const v = VENUES.find((x) => x.id === id); const h = c?.history?.[i]; return `<div class="dz-venue ${c && c.round === i && !c.done ? 'sel' : ''}">${trackSVG(v)}<b>${esc(v.name)}</b><div class="tiny">${h ? `Arrivato ${h.pos}°` : `Round ${i + 1}`}</div></div>`; }).join('')}</div></div>`;
}

let backTo = 'menu';
registerScreen({
  id: 'derby', full: true,
  render(params) {
    if (params?.tab && !D.playing) D.tab = params.tab;
    if (params?.from) backTo = params.from; else if (params?.to === 'derby') backTo = 'menu';
    if (D.playing) return `<div class="dz-root" id="dz-root"><div class="dz-loading">Carico il motore fisico…</div></div>`;
    const P = prog();
    if (!P.owned.includes(D.car)) D.car = 'berlina';
    const stars = starsOf(P), maxStars = CUPS.reduce((s, c) => s + c.events.length * 3, 0);
    const right = `<div class="dz-wallet"><div class="w-k">Crediti</div><b>${money(P.money)}</b><div class="w-s"><span class="dz-star">★</span> ${stars}/${maxStars} stelle · ${P.wins} vittorie · ${P.races} eventi</div></div>`;
    const tabs = [['carriera', 'Carriera', 'star'], ['libero', 'Evento libero', 'flag'], ['garage', 'Garage', 'wrench'], ['campionato', 'Campionato', 'trophy'], ['guida', 'Guida', 'gamepad']];
    const body = D.tab === 'guida' ? driveTab() : D.tab === 'libero' ? freeTab(P) : D.tab === 'garage' ? garageTab(P) : D.tab === 'campionato' ? champTab() : careerTab(P);
    return `<div class="full-screen dz-menu">
      ${pageHead({ back: backTo, eyebrow: 'Modalità di guida · Guidi tu', title: 'Scontro Totale', sub: 'Corse a contatto, salti, lamiere che volano e il derby della distruzione.', right })}
      <div class="dz-tabs">${tabs.map(([id, n, ic]) => `<div class="dz-tab ${D.tab === id ? 'on' : ''}" data-a="dz-tab" data-id="${id}">${icon(ic)} ${n}</div>`).join('')}<div class="dz-tabcar">${icon('car')} ${esc(BANGERS.find((b) => b.id === D.car)?.name || '')}</div></div>
      ${body}
      <div class="dz-keys">${[['W S', 'gas e freno'], ['A D', 'sterzo'], ['Spazio', 'freno a mano'], ['Shift', 'nitro'], ['R', 'riposiziona'], ['C', 'camera'], ['Q', 'guarda dietro'], ['O', 'modalità foto']].map(([k, l]) => `<span>${k.split(' ').map((x) => `<span class="kbd">${x}</span>`).join('')} ${l}</span>`).join('')}<span>${icon('gamepad', 'ico', 'style="width:18px;height:18px"')} grilletti, stick sinistro, A nitro, B freno a mano, X camera, Y riposiziona</span></div>
      </div>`;
  },
  async mount() {
    if (!D.playing) {
      try { music.setMood('race'); } catch {}
      padReady();
      for (const r of document.querySelectorAll('.dz-range')) r.addEventListener('change', () => { const k = r.dataset.k; setDriveOpts({ [k]: +r.value / 100 }); App.refresh(); });
      const pv = document.getElementById('dz-pv'); if (pv) mountPreview(pv, prog()).catch((e) => console.warn(e));
      if (D.tab === 'libero') setTimeout(makeThumbs, 400);
      return;
    }
    cancelAnimationFrame(PV.raf);
    const root = document.getElementById('dz-root');
    try { music.setMood?.('race'); music.stop?.(); } catch {}
    const { DerbyGame } = await import('../derby/game.js');
    const P = prog();
    const ev = D.run?.event || null;
    const venueId = ev ? ev.venue : D.run?.venue || D.venue;
    const v = VENUES.find((x) => x.id === venueId);
    const car = D.run?.car || D.car, look = lookOf(car, P);
    const g = D.game = new DerbyGame(root, {
      venue: v, car, color: look.color, look, tune: tuneOf(car, P), opponents: ev?.opponents ?? D.run?.opponents ?? D.opponents, mode: ev?.mode || D.run?.mode || 'race', difficulty: P.diff,
      weather: ev?.weather || D.run?.weather || 'auto', event: ev, laps: ev?.laps, targets: ev?.targets, aiBoost: ev?.aiBoost, championship: !!D.champ,
      onEnd: (r) => { try { r.medal === 3 || r.pos === 1 ? sfx.win() : sfx.ok(); } catch {} },
    });
    window.__derby = g;
    try { await g.start(); root.querySelector('.dz-loading')?.remove(); } catch (e) { console.error(e); root.innerHTML = `<div class="dz-loading">Impossibile avviare la modalità: ${esc(e.message || String(e))}</div>`; }
  },
  unmount() { D.game?.destroy(); D.game = null; window.__derby = null; cancelAnimationFrame(PV.raf); },
  onKey(e) { if (D.playing) return; },
  actions: {
    'dz-tab'(el) { D.tab = el.dataset.id; D.gcar = null; App.refresh(); },
    'dz-venue'(el) { D.venue = el.dataset.id; sfx.click(); App.refresh(); },
    'dz-mode'(el) { D.mode = el.dataset.id; App.refresh(); },
    'dz-ev'(el) { D.ev = el.dataset.id; App.refresh(); },
    'dz-next-ev'() { const P = prog(); const next = CUPS.filter((c) => cupUnlocked(c, P)).flatMap((c) => c.events).find((e) => (P.career.res[e.id]?.medal || 0) < 3); if (next) { D.ev = next.id; App.refresh(); } },
    'dz-car'(el) {
      const P = prog(); const id = el.dataset.id;
      if (D.tab === 'garage') { D.gcar = id; if (P.owned.includes(id)) D.car = id; sfx.click(); App.refresh(); return; }
      if (!P.owned.includes(id)) {
        const price = PRICES[id], b = BANGERS.find((x) => x.id === id);
        if (!carBuyable(id, P)) { D.car = D.car; App.toast?.('Auto bloccata', `Servono ${CAR_STARS[id]} stelle carriera per comprare la ${b.name}.`); sfx.bad?.(); if (D.tab === 'garage') { D.preview = id; } return; }
        if (P.money < price) { App.toast?.('Crediti insufficienti', `Servono ${money(price)}: vinci qualche evento!`); sfx.bad?.(); return; }
        App.confirm(`Comprare ${b.name}?`, `Costa ${money(price)}.`, () => { const Q = prog(); Q.money -= price; Q.owned.push(id); saveProg(Q); D.car = id; try { sfx.coin?.(); } catch {} App.refresh(); });
        return;
      }
      D.car = id; sfx.click(); App.refresh();
    },
    'dz-buy'(el) {
      const P = prog(); const id = el.dataset.id, price = PRICES[id], b = BANGERS.find((x) => x.id === id);
      if (P.owned.includes(id) || !carBuyable(id, P)) return;
      if (P.money < price) { App.toast?.('Crediti insufficienti', `Servono ${money(price)}: vinci qualche evento!`); sfx.bad?.(); return; }
      App.confirm(`Comprare ${b.name}?`, `Costa ${money(price)}.`, () => { const Q = prog(); Q.money -= price; Q.owned.push(id); saveProg(Q); D.car = id; D.gcar = id; try { sfx.coin?.(); } catch {} achToast(); App.refresh(); });
    },
    'dz-up'(el) {
      const id = D.gcar || D.car; const P = prog(); if (!P.owned.includes(id)) return; const u = el.dataset.id; const t = tuneOf(id, P); const price = upgradePrice(id, t[u]);
      if (price == null) return;
      if (P.money < price) { App.toast?.('Crediti insufficienti', `Il potenziamento costa ${money(price)}.`); sfx.bad?.(); return; }
      P.money -= price; P.garage[id] = { ...t, [u]: t[u] + 1 }; saveProg(P); try { sfx.levelup?.(); } catch {} achToast(); App.refresh();
    },
    'dz-look'(el) { const id = D.gcar || D.car; const P = prog(); const k = el.dataset.k; let v = el.dataset.v; if (k === 'stickers') v = v === '1'; P.looks[id] = { ...lookOf(id, P), [k]: v }; saveProg(P); App.refresh(); },
    'dz-num'(el) { const id = D.gcar || D.car; const P = prog(); const l = lookOf(id, P); l.num = ((l.num - 1 + +el.dataset.v + 99) % 99) + 1; P.looks[id] = l; saveProg(P); App.refresh(); },
    'dz-preset'(el) { setDriveOpts({ preset: el.dataset.id, drift: null }); sfx.click(); App.refresh(); },
    'dz-dopt'(el) { const v = el.dataset.v; setDriveOpts({ [el.dataset.k]: v === 'null' ? null : v === '1' }); App.refresh(); },
    'dz-diff'(el) { const P = prog(); P.diff = el.dataset.v; saveProg(P); App.refresh(); },
    'dz-filter'(el) { setSettings({ gfxFilter: el.dataset.v }); applyFilterSettings(); App.refresh(); },
    'dz-marker'() { setSettings({ dzMarker: getSettings().dzMarker === false }); App.refresh(); },
    'dz-opp'(el) { D.opponents = +el.dataset.v; App.refresh(); },
    'dz-weather'(el) { D.weather = el.dataset.v; App.refresh(); },
    'dz-go'() { D.champ = false; D.run = { venue: D.venue, mode: D.mode, car: D.car, opponents: D.opponents, weather: D.weather }; D.playing = true; sfx.ok(); App.refresh(); },
    'dz-go-ev'() { const ev = eventById(D.ev); if (!ev) return; const P = prog(); if (!P.owned.includes(D.car)) D.car = 'berlina'; D.champ = false; D.run = { event: ev, car: D.car }; D.playing = true; sfx.ok(); App.refresh(); },
    'dz-champ-new'() { const P = prog(); if (!P.owned.includes(D.car)) D.car = 'berlina'; champStart(D.car, null); App.refresh(); },
    'dz-champ-reset'() { App.confirm('Ricominciare il campionato?', 'I punti raccolti andranno persi.', () => { champReset(); App.refresh(); }); },
    'dz-champ'() { const c = champGet(); const nx = champNext(); if (!c || !nx) return; const P = prog(); const car = P.owned.includes(c.car) ? c.car : D.car; D.champ = true; D.run = { venue: nx, mode: 'race', car, opponents: 7 }; D.playing = true; sfx.ok(); App.refresh(); },
    'dz-resume'() { D.game?.togglePause(); },
    'dz-restart'() { D.game?.destroy(); D.game = null; App.refresh(); },
    'dz-quit'() { D.game?.destroy(); D.game = null; D.playing = false; D.champ = false; D.run = null; App.refresh(); },
  },
});
