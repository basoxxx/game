// "Scontro Totale" mode: career ladder of cups, free events, a garage (upgrades, paint, liveries)
// and the old championship; then you drive it yourself.
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc, pageHead } from '../ui/dom.js';
import { sfx, music } from '../ui/audio.js';
import { VENUES, buildTrack } from '../derby/tracks.js';
import { BANGERS, LIVERIES, UPGRADES, tuneSpec } from '../derby/cars.js';
import { CHAMPIONSHIP, champGet, champStart, champNext, champReset } from '../derby/champ.js';
import { prog, saveProg, PRICES, CAR_STARS, DIFFICULTY, MODES, MEDALS, MEDAL_COLORS, CUPS, eventById, starsOf, cupUnlocked, cupStars, venueUnlocked, VENUE_STARS, carBuyable, upgradePrice, tuneOf, lookOf } from '../derby/career.js';
import { FILTER_PRESETS, applyFilterSettings } from '../ui/gfx.js';
import { getSettings, setSettings } from '../engine/state.js';
import '../derby/menu.css';

const D = { tab: 'carriera', venue: 'cava', mode: 'race', car: 'berlina', opponents: 7, ev: null, playing: false, game: null };
const COLORS = ['#7a1f1f', '#b3261e', '#1f3f7a', '#2c7a74', '#5b6b2b', '#2c5a4a', '#c99a12', '#e8e4d8', '#d9d4c5', '#2b2b2b', '#b5501c', '#6b2c7a', '#8a1010', '#ffcf3a'];
const ACCENTS = ['#f2efe6', '#111111', '#ffd400', '#e10600', '#1e90ff', '#3ddc84'];
const svgCache = {};
function trackSVG(v, big = false) {
  const key = v.id + (big ? ':big' : '');
  if (svgCache[key]) return svgCache[key];
  const sw = big ? 3 : 4;
  if (v.kind === 'derby') return (svgCache[key] = `<svg viewBox="0 0 120 80" class="dz-svg"><circle cx="60" cy="40" r="32" fill="rgba(255,120,40,.08)" stroke="currentColor" stroke-width="${sw}"/><circle cx="60" cy="40" r="24" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" opacity=".6"/>${v.island ? '<circle cx="60" cy="40" r="7" fill="currentColor" opacity=".55"/>' : `<g transform="translate(48 28)" fill="currentColor"><path d="M12 2l1.8 5.2L19 4.5l-2.2 5.3L22 12l-5.2 1.8L19 19.5l-5.2-2.2L12 22l-1.8-4.7L5 19.5l2.2-5.7L2 12l5.2-2.2L5 4.5l5.2 2.7z"/></g>`}</svg>`);
  if (v.kind === 'stunt') return (svgCache[key] = `<svg viewBox="0 0 120 80" class="dz-svg"><path d="M6 22 Q40 52 58 54 L66 54 L70 44" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"/><path d="M74 58 L116 72" stroke="currentColor" stroke-width="${sw}"/><path d="M70 44 Q88 22 104 52" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 4"/>${[80, 90, 100, 110].map((x) => `<path d="M${x} ${60 + (x - 74) * 0.33}v-5" stroke="currentColor" stroke-width="1.5"/>`).join('')}</svg>`);
  const t = buildTrack(v); const [x0, z0, x1, z1] = t.bbox; const s = Math.min(110 / (x1 - x0), 70 / (z1 - z0));
  const d = t.pts.filter((_, i) => i % 6 === 0).map((p, i) => `${i ? 'L' : 'M'}${(60 + (p.x - (x0 + x1) / 2) * s).toFixed(1)},${(40 + (p.z - (z0 + z1) / 2) * s).toFixed(1)}`).join('') + 'Z';
  return (svgCache[key] = `<svg viewBox="0 0 120 80" class="dz-svg">${big ? `<path d="${d}" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="7" stroke-linejoin="round"/>` : ''}<path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"/></svg>`);
}
const pc = (x) => Math.round(Math.min(1, x) * 100);
const bar = (v, base = null) => `<div class="dz-stat">${base != null && v > base + 0.005 ? `<b style="width:${pc(v)}%"></b>` : ''}<i style="width:${pc(base ?? v)}%"></i></div>`;
const medalDot = (m) => `<span class="dz-md m${m}" title="${MEDALS[m]}"></span>`;
const money = (n) => `€ ${Math.round(n).toLocaleString('it-IT')}`;
const modesFor = (v) => (v.kind === 'derby' ? ['derby'] : v.kind === 'stunt' ? ['stunt'] : ['race', 'elim', 'time', 'caccia']);
function carStats(spec, base = null) {
  const r = (k, n) => [spec[k] / n, base ? base[k] / n : null];
  return `<div class="dz-stats"><span>Potenza</span>${bar(...r('power', 1.6))}<span>Velocità</span>${bar(...r('top', 1.3))}<span>Resistenza</span>${bar(...r('armor', 2.3))}<span>Tenuta</span>${bar(...r('grip', 1.4))}</div>`;
}

// ---------------------------------------------------------------- garage turntable preview
const PV = { r: null, raf: 0, key: '' };
async function mountPreview(el, P) {
  const THREE = await import('three');
  const { buildBanger } = await import('../derby/cars.js');
  const { applyHDRI } = await import('../ui/gfx.js');
  if (!el.isConnected) return;
  if (!PV.r) {
    const r = PV.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); r.shadowMap.enabled = true; r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    const s = PV.scene = new THREE.Scene(); PV.cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
    s.add(new THREE.HemisphereLight(0xffeedd, 0x2a1a10, 0.7));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(4, 7, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 }); s.add(key);
    const rim = new THREE.DirectionalLight(0xff8a3d, 1.6); rim.position.set(-5, 3, -4); s.add(rim);
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(60,40,28,1)'); gr.addColorStop(0.6, 'rgba(26,18,12,0.9)'); gr.addColorStop(1, 'rgba(10,8,6,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, roughness: 0.9 })); floor.receiveShadow = true; s.add(floor);
    PV.turn = new THREE.Group(); s.add(PV.turn);
    applyHDRI(r, s, 'dusk', { background: false, intensity: 0.8 }).catch(() => {});
  }
  const id = D.gcar || D.car, look = lookOf(id, P);
  const key = JSON.stringify([id, look]);
  if (PV.key !== key) {
    PV.key = key; while (PV.turn.children.length) PV.turn.remove(PV.turn.children[0]);
    const car = buildBanger(id, look.color, look.num, look.num * 31 + 7, { ...look, clean: true }); PV.turn.add(car);
    const L = car.userData.dims.L; PV.cam.position.set(L * 1.6 + 2.4, 2.2, L * 1.6 + 2.6); PV.cam.lookAt(0, 0.7, 0);
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
    const dt = Math.min(0.05, (t - last) / 1000); last = t; if (drag == null) PV.turn.rotation.y += dt * 0.35;
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
      <div class="dz-cup-h"><div><div class="hh-eyebrow">${open ? `${cs}/${c.events.length * 3} stelle` : `${icon('lock')} Servono ${c.stars} stelle (ne hai ${stars})`}</div><div class="dz-cup-n">${esc(c.name)}</div><div class="small" style="color:var(--text2)">${esc(c.sub)}</div></div><div class="dz-cup-bar"><i style="width:${Math.round((cs / (c.events.length * 3)) * 100)}%"></i></div></div>
      <div class="dz-evs">${c.events.map((e, i) => { const v = VENUES.find((x) => x.id === e.venue); const r = P.career.res[e.id]; const m = r?.medal || 0; return `<div class="dz-ev ${D.ev === e.id ? 'sel' : ''} ${open ? '' : 'locked'}" ${open ? `data-a="dz-ev" data-id="${e.id}"` : ''}>
        <div class="row between"><span class="dz-ev-mode">${icon(MODES[e.mode].icon)} ${esc(MODES[e.mode].name)}</span><span class="dz-ev-md">${[1, 2, 3].map((k) => `<i class="${m >= k ? 'on m' + k : ''}"></i>`).join('')}</span></div>
        <b>${i + 1}. ${esc(e.name)}</b><div class="tiny">${esc(v?.name || e.venue)}${e.opponents ? ` · ${e.opponents} avversari` : ''}</div><div class="dz-ev-map">${v ? trackSVG(v) : ''}</div><div class="tiny dz-ev-prize">Oro: ${money(e.prize)}</div></div>`; }).join('')}</div>
    </section>`;
  }).join('')}</div>
  ${ev ? `<div class="qr-go mt24"><div class="qg-sum"><b>${esc(ev.name)}</b><span>${esc(MODES[ev.mode].name)} · ${esc(VENUES.find((x) => x.id === ev.venue)?.name || '')} · ${esc(BANGERS.find((b) => b.id === D.car)?.name || '')}${ev.targets ? ` · medaglie a ${ev.targets.join(' / ')} m` : ''}</span><span class="tiny" style="display:block;color:var(--muted)">${esc(MODES[ev.mode].desc)}</span></div><button class="btn primary xl" style="min-width:300px" data-a="dz-go-ev">${icon('flag')} Corri l’evento</button></div>` : `<div class="qr-go mt24"><div class="qg-sum"><b>Scegli un evento</b><span>Vinci medaglie per guadagnare stelle: le stelle sbloccano nuove coppe, arene e auto.</span></div><button class="btn primary xl" style="min-width:300px" data-a="dz-next-ev">${icon('play')} Prossimo evento</button></div>`}`;
}
function freeTab(P) {
  const v = VENUES.find((x) => x.id === D.venue) || VENUES[0];
  const modes = modesFor(v); if (!modes.includes(D.mode)) D.mode = modes[0];
  const fact = (val, l) => `<div><b>${val}</b><span>${l}</span></div>`;
  const vFacts = v.kind === 'derby' ? fact('Arena', 'Formato') + fact('1', 'Sopravvive') + fact(D.opponents, 'Avversari') : v.kind === 'stunt' ? fact('3', 'Tentativi') + fact('24°', 'Trampolino') + fact('160 m', 'Pista di atterraggio') : fact(v.laps, 'Giri') + fact(v.surfaceName || 'sterrato', 'Fondo') + fact(v.jumps?.length || 0, 'Salti');
  return `<div class="dz-grid anim-in"><div>
      <div class="dz-section">Arena</div>
      <section class="dz-hero"><div class="dh-info"><div class="hh-eyebrow">${esc(MODES[D.mode].name)}</div><div class="dh-name">${esc(v.name)}</div><div class="small mt8" style="color:var(--text2);line-height:1.5">${esc(v.desc)}</div><div class="dz-facts">${vFacts}</div>${P.best[v.id] ? `<div class="mt16"><span class="tag">${icon('trophy')} Record: ${P.best[v.id]}°</span></div>` : ''}</div><div class="dh-map">${trackSVG(v, true)}</div></section>
      <div class="dz-venues">${VENUES.map((x) => { const ok = venueUnlocked(x.id, P); return `<div class="dz-venue ${x.id === D.venue ? 'sel' : ''} ${ok ? '' : 'locked'}" ${ok ? `data-a="dz-venue" data-id="${x.id}"` : ''}>${trackSVG(x)}<b>${esc(x.name)}</b><div class="tiny">${ok ? (x.kind === 'derby' ? 'Ultimo in piedi' : x.kind === 'stunt' ? 'Salto in lungo' : `${x.laps} giri · ${(x.surfaceName || 'sterrato').toLowerCase()}`) : `${icon('lock')} ${VENUE_STARS[x.id]} stelle`}</div></div>`; }).join('')}</div>
    </div><div>
      <div class="dz-section">Tipo di evento</div>
      <div class="dz-modes">${modes.map((m) => `<div class="dz-mode ${D.mode === m ? 'sel' : ''}" data-a="dz-mode" data-id="${m}">${icon(MODES[m].icon)}<b>${esc(MODES[m].name)}</b><span>${esc(MODES[m].desc)}</span></div>`).join('')}</div>
      <div class="dz-opts">
        ${['time', 'stunt'].includes(D.mode) ? '' : `<span class="lbl">Avversari</span><div class="row gap4">${[3, 5, 7].map((n) => `<button class="btn sm ${D.opponents === n ? 'active' : ''}" data-a="dz-opp" data-v="${n}">${n}</button>`).join('')}</div>`}
        ${optsRows()}
      </div>
      <div class="dz-section mt24">La tua auto</div>
      ${carPicker(P, true)}
    </div></div>
    <div class="qr-go mt24"><div class="qg-sum"><b>${esc(v.name)}</b><span>${esc(MODES[D.mode].name)} · ${esc(BANGERS.find((b) => b.id === D.car)?.name || '')}${['time', 'stunt'].includes(D.mode) ? '' : ` · ${D.opponents} avversari`}</span></div><button class="btn primary xl" style="min-width:320px" data-a="dz-go">${icon('flag')} Si parte!</button></div>`;
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
function champTab() {
  const c = champGet(); const nx = champNext(); const nv = nx && VENUES.find((x) => x.id === nx); const me = c ? Object.entries(c.points).sort((a, b) => b[1] - a[1]) : []; const myPts = c ? (Object.entries(c.points).find(([n]) => n === 'Tu')?.[1] || 0) : 0;
  return `<div class="panel dz-champ"><div class="row between"><div><div class="hh-eyebrow">${esc(CHAMPIONSHIP.name)} · ${CHAMPIONSHIP.events.length} eventi</div><div class="small" style="color:var(--text2)">${c ? (c.done ? `Campionato concluso · ${myPts} punti · ${me.findIndex(([n]) => n === 'Tu') + 1}° in classifica` : `Round ${c.round + 1}/${CHAMPIONSHIP.events.length} · prossimo: <b>${esc(nv?.name || '')}</b> · ${myPts} punti`) : 'Sei eventi di fila, punti per posizione, demolizioni e giro veloce. Si corre con la stessa auto.'}</div></div><div class="row gap6">${c && !c.done ? `<button class="btn" data-a="dz-champ-reset">Ricomincia</button><button class="btn primary" data-a="dz-champ">${icon('flag')} Corri il round ${c.round + 1}</button>` : `<button class="btn primary" data-a="dz-champ-new">${icon('trophy')} ${c ? 'Nuovo campionato' : 'Inizia il campionato'}</button>`}</div></div>
    ${c ? `<table class="tbl mt16"><tbody>${me.slice(0, 8).map(([n, p], i) => `<tr class="${n === 'Tu' ? 'me' : ''}"><td>${i + 1}</td><td>${esc(n)}</td><td><b>${p}</b> pt</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="dz-champ-evs mt16">${CHAMPIONSHIP.events.map((id, i) => { const v = VENUES.find((x) => x.id === id); const h = c?.history?.[i]; return `<div class="dz-venue ${c && c.round === i && !c.done ? 'sel' : ''}">${trackSVG(v)}<b>${esc(v.name)}</b><div class="tiny">${h ? `Arrivato ${h.pos}°` : `Round ${i + 1}`}</div></div>`; }).join('')}</div></div>`;
}

registerScreen({
  id: 'derby', full: true,
  render() {
    if (D.playing) return `<div class="dz-root" id="dz-root"><div class="dz-loading">Carico il motore fisico…</div></div>`;
    const P = prog();
    if (!P.owned.includes(D.car)) D.car = 'berlina';
    const stars = starsOf(P), maxStars = CUPS.reduce((s, c) => s + c.events.length * 3, 0);
    const right = `<div class="dz-wallet"><div class="w-k">Crediti</div><b>${money(P.money)}</b><div class="w-s"><span class="dz-star">★</span> ${stars}/${maxStars} stelle · ${P.wins} vittorie · ${P.races} eventi</div></div>`;
    const tabs = [['carriera', 'Carriera', 'star'], ['libero', 'Evento libero', 'flag'], ['garage', 'Garage', 'wrench'], ['campionato', 'Campionato', 'trophy']];
    const body = D.tab === 'libero' ? freeTab(P) : D.tab === 'garage' ? garageTab(P) : D.tab === 'campionato' ? champTab() : careerTab(P);
    return `<div class="full-screen dz-menu">
      ${pageHead({ eyebrow: 'Modalità di guida · Guidi tu', title: 'Scontro Totale', sub: 'Corse a contatto, salti, lamiere che volano e il derby della distruzione.', right })}
      <div class="dz-tabs">${tabs.map(([id, n, ic]) => `<div class="dz-tab ${D.tab === id ? 'on' : ''}" data-a="dz-tab" data-id="${id}">${icon(ic)} ${n}</div>`).join('')}<div class="dz-tabcar">${icon('car')} ${esc(BANGERS.find((b) => b.id === D.car)?.name || '')}</div></div>
      ${body}
      <div class="dz-keys">${[['W S', 'gas e freno'], ['A D', 'sterzo'], ['Spazio', 'freno a mano'], ['Shift', 'nitro'], ['R', 'riposiziona'], ['C', 'camera'], ['Q', 'guarda dietro'], ['O', 'modalità foto']].map(([k, l]) => `<span>${k.split(' ').map((x) => `<span class="kbd">${x}</span>`).join('')} ${l}</span>`).join('')}<span>${icon('gamepad', 'ico', 'style="width:18px;height:18px"')} grilletti, stick sinistro, A nitro, B freno a mano, X camera, Y riposiziona</span></div>
      </div>`;
  },
  async mount() {
    if (!D.playing) {
      try { music.setMood('race'); } catch {}
      const pv = document.getElementById('dz-pv'); if (pv) mountPreview(pv, prog()).catch((e) => console.warn(e));
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
      event: ev, laps: ev?.laps, targets: ev?.targets, aiBoost: ev?.aiBoost, championship: !!D.champ,
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
      App.confirm(`Comprare ${b.name}?`, `Costa ${money(price)}.`, () => { const Q = prog(); Q.money -= price; Q.owned.push(id); saveProg(Q); D.car = id; D.gcar = id; try { sfx.coin?.(); } catch {} App.refresh(); });
    },
    'dz-up'(el) {
      const id = D.gcar || D.car; const P = prog(); if (!P.owned.includes(id)) return; const u = el.dataset.id; const t = tuneOf(id, P); const price = upgradePrice(id, t[u]);
      if (price == null) return;
      if (P.money < price) { App.toast?.('Crediti insufficienti', `Il potenziamento costa ${money(price)}.`); sfx.bad?.(); return; }
      P.money -= price; P.garage[id] = { ...t, [u]: t[u] + 1 }; saveProg(P); try { sfx.levelup?.(); } catch {} App.refresh();
    },
    'dz-look'(el) { const id = D.gcar || D.car; const P = prog(); const k = el.dataset.k; let v = el.dataset.v; if (k === 'stickers') v = v === '1'; P.looks[id] = { ...lookOf(id, P), [k]: v }; saveProg(P); App.refresh(); },
    'dz-num'(el) { const id = D.gcar || D.car; const P = prog(); const l = lookOf(id, P); l.num = ((l.num - 1 + +el.dataset.v + 99) % 99) + 1; P.looks[id] = l; saveProg(P); App.refresh(); },
    'dz-diff'(el) { const P = prog(); P.diff = el.dataset.v; saveProg(P); App.refresh(); },
    'dz-filter'(el) { setSettings({ gfxFilter: el.dataset.v }); applyFilterSettings(); App.refresh(); },
    'dz-marker'() { setSettings({ dzMarker: getSettings().dzMarker === false }); App.refresh(); },
    'dz-opp'(el) { D.opponents = +el.dataset.v; App.refresh(); },
    'dz-go'() { D.champ = false; D.run = { venue: D.venue, mode: D.mode, car: D.car, opponents: D.opponents }; D.playing = true; sfx.ok(); App.refresh(); },
    'dz-go-ev'() { const ev = eventById(D.ev); if (!ev) return; const P = prog(); if (!P.owned.includes(D.car)) D.car = 'berlina'; D.champ = false; D.run = { event: ev, car: D.car }; D.playing = true; sfx.ok(); App.refresh(); },
    'dz-champ-new'() { const P = prog(); if (!P.owned.includes(D.car)) D.car = 'berlina'; champStart(D.car, null); App.refresh(); },
    'dz-champ-reset'() { App.confirm('Ricominciare il campionato?', 'I punti raccolti andranno persi.', () => { champReset(); App.refresh(); }); },
    'dz-champ'() { const c = champGet(); const nx = champNext(); if (!c || !nx) return; const P = prog(); const car = P.owned.includes(c.car) ? c.car : D.car; D.champ = true; D.run = { venue: nx, mode: 'race', car, opponents: 7 }; D.playing = true; sfx.ok(); App.refresh(); },
    'dz-resume'() { D.game?.togglePause(); },
    'dz-restart'() { D.game?.destroy(); D.game = null; App.refresh(); },
    'dz-quit'() { D.game?.destroy(); D.game = null; D.playing = false; D.champ = false; D.run = null; App.refresh(); },
  },
});
