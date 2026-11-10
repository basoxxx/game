import { carImg } from '../ui/garage3d.js';
import { App, registerScreen, coach } from '../app.js';
import { icon } from '../ui/icons.js';
import { carSVG, teamBadge } from '../ui/art.js';
import { esc, bar } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { atrFactor, costCap, capSpent, cat, playerTeam, teamDrivers, partRanking, fmtM, rdSlots, rdCost, RD_TIERS, RD_APPROACH, rushProject, rushCost, startProject, partName, applyConcept, changeEngine, overallCarRanking, projectForecast } from '../engine/season.js';
import { ensureDepth, eraInfo, setEraPolicy, ERA_POLICY, corrLabel, corrCost, corrCampaign, suspectList, revertSuspect, insistSuspect, insistChance, tokenInfo, tokenCost, tokenParts, kitsEnabled, KITS, kitCost, kitTracks, kitFit, buyKit, PU_MODES, setPuMode, supplierList, puDeal, puSeasonCost, puBreakFee, signPuDeal, PU_TIERS, rulesInForce, setPolicy, aiTrend, basePart, techBase } from '../engine/depth.js';
import { getTrack } from '../engine/world.js';
import { traitInfo } from '../engine/dynasty.js';
import '../styles/career.css';
import { ENGINE_SUPPLIERS } from '../data/teams.js';
import { avgPart } from '../engine/world.js';
import { sfx } from '../ui/audio.js';
import { mountStage, stageEnabled, partPositions } from '../ui/garage3d.js';
import { radarChart } from '../ui/charts.js';
import { teamColor } from '../app.js';
let garage = null, show3d = true;

const PALETTE = ['#e10600', '#d40000', '#ff8000', '#ffd400', '#cedc00', '#22d37a', '#00594f', '#00d2be', '#00c2ff', '#005aff', '#1b2a6b', '#0a2a66', '#9b30ff', '#ff4fa3', '#ffffff', '#c0c0c0', '#6b6b6b', '#1a1a1a', '#6b3e1e', '#c9a227'];
const PATTERNS = ['Classica', 'Banda', 'Bicolore', 'Frecce', 'Sfumata', 'Retrò'];
let tab = 'dev';
let devTarget = 'now';
let devApproach = 'std';

registerScreen({
  id: 'car',
  render(params) {
    const st = S();
    if (params?.tab) { tab = params.tab; params.tab = null; }
    st._conceptSeen = true;
    const t = playerTeam(st);
    const C = cat(st);
    const ds = teamDrivers(st, t);
    ensureDepth(st);
    const tabs = [['dev', 'Sviluppo R&D'], ['regs', 'Regolamento & PU'], ['design', 'Progetto & Livrea'], ['compare', 'Confronto']];
    const rank = overallCarRanking(st).indexOf(t.id) + 1;
    return `<div class="screen-title"><div><div class="sub">${esc(t.name)} · Vettura ${st.season}</div><h1>Centro Tecnico</h1></div><div class="tabs">${tabs.map(([k, n]) => `<div class="tab ${tab === k ? 'active' : ''}" data-a="tab" data-t="${k}">${n}</div>`).join('')}</div></div>
    <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:16px" class="anim-in">
      <div class="car-stage ${show3d && stageEnabled() ? 'live' : ''}" style="min-height:300px"><div class="grid-floor"></div>
        <div class="cs-score" style="position:absolute;left:20px;top:16px;z-index:3"><div class="tiny upper muted">Valore complessivo</div><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:46px;line-height:1">${avgPart(t).toFixed(1)}</div><div class="small ${rank <= 3 ? 'good' : rank > 6 ? 'bad' : 'warn'}">${rank}ª vettura del gruppo</div></div>
        <div style="position:absolute;right:20px;top:16px;z-index:3" class="chip">Concetto: <b>${C.concepts.find((c) => c.id === t.car.concept)?.name}</b></div>
        <div style="position:absolute;right:20px;bottom:14px;z-index:3" class="row gap4"><button class="btn sm ${show3d ? 'active' : ''}" data-a="v3d">3D</button><button class="btn sm ${show3d ? '' : 'active'}" data-a="v2d">2D</button></div>
        <div id="garage3d" style="position:absolute;inset:0;z-index:1"></div>
        ${show3d && stageEnabled() ? '<div class="tiny muted cs-hint" style="position:absolute;left:20px;bottom:14px;z-index:3">Trascina per ruotare · rotella per lo zoom · passa sui componenti per evidenziarli</div>' : carSVG(st.category, t.car.livery, { number: ds[0]?.number, sponsor: t.sponsors[0]?.name || t.short, helmet: ds[0]?.helmet.c1 })}
      </div>
      <div class="panel"><div class="panel-head"><h3>Componenti</h3><span class="small muted">Classifica tra i ${Object.keys(st.teams).length} team</span></div>
        <div class="col gap16">${C.parts.map((p) => {
          const r = partRanking(st, p.id); const pos = r.indexOf(t.id) + 1; const best = st.teams[r[0]].car.parts[p.id];
          return `<div class="cmp-row" data-part="${p.id}"><div class="row between small"><b>${p.name}</b><span class="muted">${p.desc}</span></div><div class="stat mt8" style="grid-template-columns:1fr 46px 40px">${bar(t.car.parts[p.id], '', best)}<b class="right mono">${t.car.parts[p.id].toFixed(1)}</b><span class="rank ${pos <= 3 ? 'good' : pos > 6 ? 'bad' : 'warn'}">${pos}°</span></div></div>`;
        }).join('')}</div>
        <div class="tiny muted mt16">La barra chiara indica il miglior valore in griglia.</div>
      </div>
    </div>
    <div class="mt16 anim-in">${tab === 'dev' ? devTab(st, t, C) : tab === 'regs' ? regsTab(st, t, C) : tab === 'design' ? designTab(st, t, C) : compareTab(st, t, C)}</div>`;
  },
  mount() {
    coach('car', 'Centro Tecnico', 'Avvia progetti R&D sui componenti chiave dei prossimi circuiti. Più un componente è sviluppato, minore è il guadagno: a volte conviene migliorare i punti deboli.');
    const el = document.getElementById('garage3d');
    if (el && show3d && stageEnabled()) {
      const st = S(); const t = playerTeam(st); const ds = teamDrivers(st, t); const C = cat(st);
      garage = mountStage(el, { id: 'car', mode: 'orbit', angle: 0.78, pitch: 0.1, dist: st.category === 'rally' ? 8.2 : 9.2, fov: 27, target: [0, 0.6, 0], category: st.category, livery: t.car.livery, helmet: ds[0]?.helmet.c1, number: ds[0]?.number, sponsor: t.sponsors[0]?.name || t.short, team: { name: t.name, short: t.short }, series: C.full, box: ds[0]?.number || 1 });
      if (garage) {
        const pos = partPositions(st.category);
        garage.setHotspots(C.parts.filter((p) => pos[p.id]).map((p) => { const rk = partRanking(st, p.id).indexOf(t.id) + 1; return { id: p.id, pos: pos[p.id], label: p.name, value: t.car.parts[p.id].toFixed(1), cls: rk <= 3 ? 'good' : rk > 6 ? 'bad' : 'warn' }; }));
        // hovering (or focusing) anything tied to a component swings the camera onto it
        const main = document.querySelector('.main');
        let cur = null, timer = 0;
        const set = (id) => { if (id === cur) return; cur = id; clearTimeout(timer); timer = setTimeout(() => { garage?.focus(id); document.querySelectorAll('.cmp-row').forEach((r) => r.classList.toggle('hot', r.dataset.part === id)); }, id ? 90 : 420); };
        main?.addEventListener('mouseover', (e) => { const p = e.target.closest?.('[data-part]'); if (p) set(p.dataset.part); else if (!e.target.closest?.('.car-stage')) set(null); });
        main?.addEventListener('focusin', (e) => { const p = e.target.closest?.('[data-part]'); if (p) set(p.dataset.part); });
        main?.addEventListener('mouseleave', () => set(null));
      }
    } else { garage?.destroy(); garage = null; }
  },
  unmount() { garage?.destroy(); garage = null; },
  actions: {
    v3d() { show3d = true; App.refresh(); },
    v2d() { show3d = false; App.refresh(); },
    tab(el) { tab = el.dataset.t; App.refresh(); },
    target(el) { devTarget = el.dataset.v; App.refresh(); },
    approach(el) { devApproach = el.dataset.v; App.refresh(); },
    rush(el) { const r = rushProject(S(), el.dataset.id); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); sfx.bad(); return; } sfx.ok(); App.toast('Straordinari in fabbrica', 'Il pezzo arriverà un evento prima.', 'good'); App.refresh(); },
    start(el) {
      const st = S();
      const r = startProject(st, el.dataset.part, el.dataset.tier, devTarget === 'next', devApproach);
      if (!r.ok && r.cap) { App.confirm('Sforare il budget cap?', r.msg, () => { st._capOk = true; const r2 = startProject(st, el.dataset.part, el.dataset.tier, devTarget === 'next', devApproach); if (r2.ok) { sfx.ok(); App.refresh(); } }, 'Sfora il cap', true); return; }
      if (!r.ok) { App.toast('Impossibile avviare', r.msg, 'bad'); sfx.bad(); return; }
      sfx.ok(); App.toast('Progetto avviato', `${partName(st, el.dataset.part)} · ${RD_TIERS[el.dataset.tier].name} · ${RD_APPROACH[devApproach].name}`, 'good'); App.refresh();
    },
    concept(el) {
      const st = S();
      if (st.round > 0) { App.toast('Troppo tardi', 'Il concetto si sceglie solo in pre-stagione.', 'bad'); return; }
      applyConcept(st, playerTeam(st), el.dataset.id); sfx.ok(); App.refresh();
    },
    erapol(el) { const r = setEraPolicy(S(), el.dataset.v); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); sfx.bad(); return; } sfx.ok(); App.refresh(); },
    corr() { const r = corrCampaign(S()); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); sfx.bad(); return; } sfx.ok(); App.toast('Campagna di correlazione', `Correlazione galleria-pista +${Math.round(r.gain * 100)} punti.`, 'good'); App.refresh(); },
    susrevert(el) { const r = revertSuspect(S(), el.dataset.id); App.toast(r.ok ? 'Pacchetto ritirato' : 'Impossibile', r.msg, r.ok ? 'info' : 'bad'); App.refresh(); },
    susinsist(el) { const r = insistSuspect(S(), el.dataset.id); App.toast(r.ok ? 'Si insiste' : 'Impossibile', r.msg, r.ok ? 'info' : 'bad'); App.refresh(); },
    pol(el) { const st = S(); setPolicy(st, el.dataset.k, !st.dp.pol[el.dataset.k]); sfx.ok(); App.refresh(); },
    buykit(el) { const r = buyKit(S(), el.dataset.k); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); sfx.bad(); return; } sfx.ok(); App.toast('Pacchetto in produzione', `${KITS[el.dataset.k].name}: verrà montato automaticamente sui circuiti adatti.`, 'good'); App.refresh(); },
    pumode(el) { setPuMode(S(), el.dataset.v); sfx.ok(); App.refresh(); },
    pudeal(el) {
      const st = S(); const sup = el.dataset.id; const tier = el.dataset.tier; const years = +el.dataset.y;
      const cur = puDeal(st); const fee = cur.sup !== sup ? puBreakFee(st) : 0;
      App.confirm('Firmare la fornitura?', `${PU_TIERS[tier].name} per ${years} ${years === 1 ? 'stagione' : 'stagioni'}: ${fmtM(puSeasonCost(st, sup, tier))} a stagione, pagati a rate dopo ogni evento.${fee ? ` Penale per uscire dal contratto attuale: ${fmtM(fee)}.` : ''}`, () => { const r = signPuDeal(st, sup, tier, years); if (!r.ok) { App.toast('Impossibile', r.msg, 'bad'); sfx.bad(); return; } sfx.ok(); App.refresh(); }, 'Firma');
    },
    engine(el) {
      const st = S();
      const t = playerTeam(st);
      if (st.round > 0) { App.toast('Troppo tardi', 'Il fornitore si cambia solo in pre-stagione.', 'bad'); return; }
      const sup = ENGINE_SUPPLIERS.find((e) => e.id === el.dataset.id);
      changeEngine(st, t, sup.id); sfx.ok(); App.refresh();
    },
    color(el) { const t = playerTeam(S()); t.car.livery[el.dataset.k] = el.dataset.c; if (el.dataset.k === 'primary') t.colors[0] = el.dataset.c; if (el.dataset.k === 'secondary') t.colors[1] = el.dataset.c; App.refresh(); },
    pattern(el) { playerTeam(S()).car.livery.pattern = +el.dataset.p; App.refresh(); },
    customcolor(el) { const t = playerTeam(S()); t.car.livery[el.dataset.k] = el.value; if (el.dataset.k === 'primary') t.colors[0] = el.value; App.refresh(); },
  },
});

function devTab(st, t, C) {
  const slots = rdSlots(t, st);
  const td = st.staff[t.staff.td];
  const atr = atrFactor(st, t);
  const cap = costCap(st), spent = capSpent(st);
  const nextOpen = st.round >= Math.floor(st.calendar.length * 0.25);
  return `<div class="panel"><div class="panel-head"><h3>Progetti di sviluppo</h3><div class="row"><span class="chip">${icon('factory', 'ico', 'style="width:13px"')} Slot ${t.projects.length}/${slots}</span><span class="chip">Direttore Tecnico: ${esc(td?.name)} (${td?.rating})</span><span class="chip">Galleria Lv${t.facilities.windtunnel}</span></div></div>
    <div class="grid3 mb16">
      <div class="card"><div class="tiny upper muted">Obiettivo dello sviluppo</div><div class="seg mt8"><div class="${devTarget === 'now' ? 'on' : ''}" data-a="target" data-v="now">Vettura ${st.season}</div><div class="${devTarget === 'next' ? 'on' : ''}" data-a="target" data-v="next" style="${nextOpen ? '' : 'opacity:.4'}">Vettura ${st.season + 1}</div></div><div class="tiny muted mt8">${devTarget === 'next' ? 'I guadagni (+35%) arrivano solo l’anno prossimo, ma non subiscono il calo di inizio stagione.' : 'I pezzi arrivano in pista subito.'}${nextOpen ? '' : ' Il progetto dell’anno prossimo si apre al round ' + (Math.floor(st.calendar.length * 0.25) + 1) + '.'}</div></div>
      <div class="card"><div class="tiny upper muted">Ore di galleria del vento (ATR)</div><div style="font-family:var(--display);font-weight:900;font-size:26px">${Math.round(atr * 100)}%</div><div class="tiny muted">Chi ha chiuso più indietro l’anno scorso sviluppa di più. ${st.capPenalty?.season === st.season ? '<span class="bad">Penalità per sforamento del cap.</span>' : ''}</div></div>
      ${st.category === 'formula' ? `<div class="card"><div class="row between tiny upper muted"><span>Budget cap (sviluppo e produzione)</span><span class="${spent > cap ? 'bad' : ''}">${fmtM(spent)} / ${fmtM(cap)}</span></div>${bar(Math.min(100, (spent / cap) * 100), spent > cap * 0.9 ? 'red' : spent > cap * 0.7 ? 'gold' : 'green')}<div class="tiny muted mt8">Superarlo costa una multa del 150% e meno galleria del vento. Strutture e investimenti sono fuori dal cap.</div></div>` : `<div class="card"><div class="tiny upper muted">Direttore tecnico</div><div style="font-family:var(--display);font-weight:800;font-size:22px">${esc(td?.name || '')} <span class="muted">${td?.rating || ''}</span></div>${td && traitInfo('td', td.trait) ? `<div class="tiny mt8"><span class="trait">${esc(traitInfo('td', td.trait).name)}</span> <span class="muted">${esc(traitInfo('td', td.trait).desc)}</span></div>` : ''}</div>`}
    </div>
    <div class="card mb16"><div class="row between"><div class="tiny upper muted">Filosofia di progetto · vale per i nuovi progetti</div><span class="tiny muted">Più rischi, più guadagni: un progetto fallito può persino peggiorare il pezzo</span></div><div class="appr">${Object.entries(RD_APPROACH).map(([k, A]) => `<div class="${devApproach === k ? 'on' : ''}" data-a="approach" data-v="${k}"><b>${A.name}</b><span>${A.desc}</span></div>`).join('')}</div></div>
    ${t.nextYear ? `<div class="card mb16 small">Già pronto per la vettura ${st.season + 1}: ${Object.entries(t.nextYear).map(([k, v]) => `<span class="chip good">${partName(st, k)} +${v}</span>`).join(' ')}</div>` : ''}
    <div class="grid3 mb16">${Object.entries(RD_TIERS).map(([k, T]) => `<div class="card"><div class="row between"><b>${T.name}</b><span class="chip">${fmtM(rdCost(st, k))}</span></div><div class="small muted mt8">${T.desc}</div><div class="row wrap mt8 gap6 tiny"><span class="chip">+${T.gain[0]}–${T.gain[1]}</span><span class="chip">${T.races} ${T.races > 1 ? 'eventi' : 'evento'}</span><span class="chip ${T.fail > 0.1 ? 'bad' : ''}">Rischio ${Math.round(T.fail * 100)}%</span></div></div>`).join('')}</div>
    ${C.parts.map((p) => {
      const proj = t.projects.find((x) => x.part === p.id && !!x.next === (devTarget === 'next'));
      const v = t.car.parts[p.id];
      const dim = Math.max(0.18, Math.min(1.35, (102 - v) / 24));
      return `<div class="part-row"><div><b>${p.name}</b><div class="tiny muted">${p.desc}</div></div>
        <div>${bar(v)}<div class="tiny muted mt8">Efficienza sviluppo: <span class="${dim > 0.8 ? 'good' : dim > 0.45 ? 'warn' : 'bad'}">${Math.round(dim * 100)}%</span>${fcLine(st, p.id)}</div></div>
        <b class="mono" style="font-size:20px;font-family:var(--display)">${v.toFixed(1)}</b>
        <div class="row gap6" style="justify-content:flex-end">${proj ? `<div style="width:100%"><div class="row between small"><span class="info">${RD_TIERS[proj.tier].name}${proj.approach && proj.approach !== 'std' ? ' · ' + RD_APPROACH[proj.approach].name : ''}${proj.next ? ' · ' + (st.season + 1) : ''}</span><span>${proj.racesLeft} ${proj.racesLeft === 1 ? 'evento' : 'eventi'}</span></div>${bar(((proj.total - proj.racesLeft) / proj.total) * 100 + 8, 'blue')}<div class="tiny muted mt8">${proj.next ? `Pronto per la vettura ${st.season + 1}` : (() => { const ev = st.calendar[st.round + proj.racesLeft]; const tr = ev && getTrack(st.category, ev.trackId); return tr ? `In pista dal ${esc(tr.name)}` : 'Consegna dopo l’ultimo evento'; })()}${proj.racesLeft > 1 && !proj.rushed ? ` · <a class="info" style="cursor:pointer;text-decoration:underline" data-a="rush" data-id="${proj.id}" data-tip="Un evento prima, rischio di fallimento +6%">Straordinari ${fmtM(rushCost(st, proj))}</a>` : proj.rushed ? ' · <span class="warn">Accelerato</span>' : ''}</div></div>` :
        Object.keys(RD_TIERS).map((k) => `<button class="btn sm" data-a="start" data-part="${p.id}" data-tier="${k}" ${t.projects.length >= slots || t.money < rdCost(st, k) ? 'disabled' : ''} title="${RD_TIERS[k].name} – ${fmtM(rdCost(st, k))}">${k === 'base' ? 'Base' : k === 'major' ? 'Evo' : 'Rivo'}</button>`).join('')}</div></div>`;
    }).join('')}
    <div class="small muted mt16">I progetti si completano dopo il numero di eventi indicato. Più un componente è già sviluppato, minore è il guadagno (rendimenti decrescenti). Più slot con la Fabbrica, guadagni maggiori con Galleria del Vento e un Direttore Tecnico migliore.</div>
  </div>`;
}

// Forecast for the selected philosophy: what the wind tunnel promises, and why it may be less than usual
function fcLine(st, partId) {
  const next = devTarget === 'next';
  const f = projectForecast(st, partId, 'major', devApproach, next);
  const why = [];
  if (f.era < 1) why.push(`nuovo regolamento ${Math.round((f.era - 1) * 100)}%`);
  if (f.pu < 1) why.push(`motore cliente ${Math.round((f.pu - 1) * 100)}%`);
  if (f.drag < 0.97) why.push(`territorio inesplorato ${Math.round((f.drag - 1) * 100)}%`);
  const tk = !next && tokenParts(st).includes(partId) ? tokenInfo(st) : null;
  return ` · Stima Evo: <b>+${f.exp}</b> <span class="muted">(${f.lo}–${f.hi}, rischio ${Math.round(f.fail * 100)}%)</span>${why.length ? ` <span class="warn">${why.join(' · ')}</span>` : ''}${tk ? ` · <span class="${tk.frozen || tk.left <= 0 ? 'bad' : 'info'}">${tk.frozen ? 'Sviluppo congelato' : `Omologato: ${tk.left}/${tk.total} gettoni`}</span>` : ''}`;
}

function regsTab(st, t, C) {
  const P = st.dp; const e = eraInfo(st);
  const pre = st.round === 0;
  const sus = suspectList(st);
  const tk = tokenInfo(st);
  const ev = st.calendar[st.round]; const tr = ev ? getTrack(st.category, ev.trackId) : null;
  const fit = kitsEnabled(st) ? kitFit(tr) : null;
  const tog = (k, label, desc) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><div><b class="small">${label}</b><div class="tiny muted">${desc}</div></div><button class="btn sm ${P.pol[k] ? 'active' : ''}" data-a="pol" data-k="${k}">${P.pol[k] ? 'Attivo' : 'Disattivo'}</button></div>`;
  const rivals = Object.values(st.teams).filter((x) => !x.isPlayer && P.ai[x.id]?.prep != null).sort((a, b) => (P.ai[b.id].prep) - (P.ai[a.id].prep));
  const eraPanel = `<div class="panel mb16"><div class="panel-head"><h3>${icon('rules', 'ico', 'style="width:16px"')} Regolamento tecnico</h3><span class="chip ${e.left <= 1 ? 'warn' : ''}">${e.left <= 1 ? `Ultima stagione dell’era · dal ${e.next} si cambia` : `Stabile fino al ${e.next - 1} · nuovo regolamento nel ${e.next}`}</span></div>
      <div class="era-line">${[...e.hist.slice(-2).map((h) => `<div class="era-seg past"><b>${esc(h.name)}</b><span>${h.from}–${h.to}</span></div>`), `<div class="era-seg now"><b>${esc(e.name)}</b><span>${e.start}–${e.next - 1} · stagione ${st.season - e.start + 1} di ${e.next - e.start}</span></div>`, `<div class="era-seg next"><b>${e.left <= 1 ? esc(e.nextName) : 'Prossima era'}</b><span>dal ${e.next}${e.left <= 1 ? '' : ' · contenuti da annunciare'}</span></div>`].join('')}</div>
      ${e.left <= 1 ? `<div class="small mt16" style="color:var(--text2);line-height:1.55">Dal ${e.next}: ${esc(e.nextTxt)}. I valori attuali verranno in gran parte azzerati su <b>${e.focusNames.map(esc).join(' e ')}</b> (ne resta circa il 30%), meno sugli altri componenti (circa il 60%). Conta quanto presto sposti la fabbrica sul nuovo progetto, la qualità del direttore tecnico e la correlazione.</div>
        <div class="appr mt16">${Object.entries(ERA_POLICY).map(([k, p]) => `<div class="${e.policy === k ? 'on' : ''}" ${e.canSet ? `data-a="erapol" data-v="${k}"` : 'style="opacity:.6"'}><b>${p.name}</b><span>${p.desc}</span></div>`).join('')}</div>
        <div class="grid3 mt16">
          <div class="card"><div class="tiny upper muted">Preparazione al ${e.next}</div>${bar(e.prep * 100, 'blue', e.proj * 100)}<div class="tiny muted mt8">Oggi ${Math.round(e.prep * 100)}% · previsto a fine stagione ${Math.round(e.proj * 100)}%</div></div>
          <div class="card"><div class="tiny upper muted">Stima sulla nuova vettura</div><div style="font-family:var(--display);font-weight:900;font-size:26px" class="${e.swing >= 0.5 ? 'good' : e.swing <= -0.5 ? 'bad' : ''}">${e.swing >= 0 ? '+' : ''}${e.swing}</div><div class="tiny muted">sui componenti chiave rispetto a un rivale medio (±2 di incertezza)</div></div>
          <div class="card"><div class="tiny upper muted">Sviluppo vettura ${st.season}</div><div style="font-family:var(--display);font-weight:900;font-size:26px">${Math.round(e.pol.dev * 100)}%</div><div class="tiny muted">${e.canSet ? 'Puoi cambiare linea fino al 70% della stagione.' : 'Linea bloccata: la fabbrica ha già pianificato il finale.'}</div></div>
        </div>
        ${rivals.length ? `<div class="tiny muted mt16">Voci dal paddock sui rivali: ${rivals.slice(0, 3).map((x) => `<span class="chip tiny">${esc(x.short)} ha già cambiato progetto</span>`).join(' ')} ${rivals.slice(-2).map((x) => `<span class="chip tiny">${esc(x.short)} spinge sul presente</span>`).join(' ')}</div>` : ''}`
      : `<div class="small muted mt16" style="line-height:1.55">Le regole restano stabili: i valori si avvicinano anno dopo anno. Ogni inverno i rivali copiano parte delle soluzioni del leader (circa metà del vantaggio oltre la seconda forza svanisce) e chi è molto indietro recupera. Il prossimo cambio regolamentare verrà annunciato con una stagione di anticipo: sarà il momento in cui le gerarchie si possono ribaltare. La Commissione può votare per anticiparlo o rinviarlo.</div>`}
    </div>`;
  const corr = `<div class="card"><div class="row between"><div class="tiny upper muted">Correlazione galleria-pista</div><span class="chip ${P.corr >= 0.86 ? 'good' : P.corr >= 0.78 ? 'warn' : 'bad'}">${corrLabel(P.corr)}</span></div><div style="font-family:var(--display);font-weight:900;font-size:26px">${Math.round(P.corr * 100)}%</div>${bar(P.corr * 100, P.corr >= 0.86 ? 'green' : P.corr >= 0.78 ? 'gold' : 'red')}<div class="tiny muted mt8">Quanto di ciò che promette la galleria arriva davvero in pista. Scende con i progetti falliti e a ogni cambio di regolamento, sale con i progetti riusciti.</div><button class="btn sm mt8" data-a="corr" ${P.corr >= 0.96 || t.money < corrCost(st) || P.corrRound === `${st.season}:${st.round}` ? 'disabled' : ''}>Campagna di correlazione · ${fmtM(corrCost(st))}</button></div>`;
  const tokens = st.category !== 'junior' ? `<div class="card"><div class="row between"><div class="tiny upper muted">Gettoni di omologazione · ${tk.parts.map((x) => esc(partName(st, x))).join(', ')}</div><span class="chip ${tk.frozen ? 'bad' : tk.left <= 1 ? 'warn' : ''}">${tk.frozen ? 'Congelato' : `${tk.left}/${tk.total}`}</span></div><div class="row gap4 mt8">${Array.from({ length: tk.total }, (_, i) => `<span class="tok ${i < tk.used ? 'used' : ''}"></span>`).join('')}</div><div class="tiny muted mt8">Il motore è omologato a inizio stagione: ogni progetto sulla vettura attuale consuma gettoni (Base ${tokenCost('base')}, Evo ${tokenCost('major')}, Rivoluzionario ${tokenCost('revolution')}). I progetti per la vettura ${st.season + 1} sono liberi.${t.works ? ' I costruttori ufficiali hanno 2 gettoni in più.' : ''}</div></div>` : `<div class="card"><div class="tiny upper muted">Serie monomarca</div><div class="small muted mt8">In Formula Apex 2 telaio e motore sono uguali per tutti: niente omologazioni, ma la regola di parità riduce i guadagni di chi è sopra la media.</div></div>`;
  const susCard = `<div class="card"><div class="row between"><div class="tiny upper muted">Pacchetti sotto osservazione</div><span class="chip ${sus.length ? 'warn' : ''}">${sus.length}</span></div>${sus.length ? sus.map((x) => `<div class="mt8"><b class="small">${esc(partName(st, x.part))} <span class="bad">${x.loss.toFixed(1)}</span></b><div class="tiny muted">${x.state === 'insist' ? `Gli ingegneri ci lavorano: ${Math.round(insistChance(st) * 100)}% di sbloccarlo (+${(x.exp * 0.65).toFixed(1)} circa) dopo il prossimo evento.` : `Il pezzo nuovo va peggio del vecchio. Era atteso +${x.exp}.`}</div>${x.state === 'insist' ? '' : `<div class="row gap6 mt8"><button class="btn sm" data-a="susrevert" data-id="${x.id}">Torna alla vecchia specifica</button><button class="btn sm ghost" data-a="susinsist" data-id="${x.id}" data-tip="Tieni il pezzo in macchina un altro evento per capirlo">Insisti (${Math.round(insistChance(st) * 100)}%)</button></div>`}</div>`).join('') : '<div class="small muted mt8">Nessun pacchetto difettoso in macchina.</div>'}<div class="tiny muted mt8">Un progetto fallito può peggiorare la vettura. Con il ritiro automatico il pezzo viene smontato subito; senza, puoi insistere un evento per provare a farlo funzionare.</div></div>`;
  const kits = kitsEnabled(st) ? `<div class="panel mb16"><div class="panel-head"><h3>Pacchetti per circuito</h3><span class="small muted">${tr ? `Prossimo evento: ${esc(tr.name)} · ${fit === 'low' ? 'pista veloce' : fit === 'high' ? 'pista da alto carico' : 'pista media, nessun pacchetto speciale'}` : ''}</span></div>
      <div class="grid2">${Object.entries(KITS).map(([k, K]) => { const trs = kitTracks(st, k); return `<div class="card ${P.kits[k] ? 'sel' : ''}"><div class="row between"><b>${K.name}</b>${P.kits[k] ? `<span class="chip good">In magazzino${fit === k ? ' · montato' : ''}</span>` : `<button class="btn sm" data-a="buykit" data-k="${k}" ${t.money < kitCost(st) || !trs.length ? 'disabled' : ''}>Produci · ${fmtM(kitCost(st))}</button>`}</div><div class="small muted mt8">${K.desc}</div><div class="tiny mt8">${trs.length ? `Utile in ${trs.length} ${trs.length === 1 ? 'evento rimasto' : 'eventi rimasti'}: <span class="muted">${trs.slice(0, 6).map((x) => esc(x.name)).join(', ')}${trs.length > 6 ? '…' : ''}</span>` : '<span class="muted">Nessun evento adatto rimasto in calendario.</span>'}</div></div>`; }).join('')}</div>
      <div class="tiny muted mt8">Valgono per tutta la stagione e si montano da soli sui circuiti adatti. I team con più budget li hanno quasi sempre: senza, su quelle piste parti in svantaggio. Il costo rientra nel budget cap.</div></div>` : '';
  const mode = `<div class="panel mb16"><div class="panel-head"><h3>Gestione ${esc(partName(st, 'engine'))}</h3><span class="small muted">Vale da subito, puoi cambiarla tra un evento e l’altro</span></div><div class="appr">${Object.entries(PU_MODES).map(([k, M]) => `<div class="${P.mode === k ? 'on' : ''}" data-a="pumode" data-v="${k}"><b>${M.name}</b><span>${M.desc}</span></div>`).join('')}</div></div>`;
  const d = puDeal(st);
  const pu = st.category === 'formula' ? `<div class="panel mb16"><div class="panel-head"><h3>Fornitura power unit</h3>${d.works ? '<span class="chip good">Costruttore ufficiale</span>' : `<span class="chip">${esc(ENGINE_SUPPLIERS.find((x) => x.id === d.sup)?.name || '')} · ${d.T.name} · fino al ${d.until} · ${fmtM(d.cost)}/stagione</span>`}</div>
      <table class="tbl"><thead><tr><th>Costruttore</th><th class="right">Potenza</th><th class="right">Affidabilità</th><th>Tendenza</th><th>Squadre</th><th class="right">Cliente</th><th class="right">Partner</th></tr></thead><tbody>${supplierList(st).map((x) => `<tr class="${t.engine === x.id ? 'me' : ''}"><td><b>${esc(x.name)}</b>${x.works ? `<div class="tiny muted">${esc(x.works)}</div>` : ''}</td><td class="right mono">${x.power.toFixed(1)}</td><td class="right mono">${x.rel.toFixed(1)}</td><td class="${x.trend > 0 ? 'good' : x.trend < 0 ? 'bad' : 'muted'}">${x.trend > 0 ? '▲ in crescita' : x.trend < 0 ? '▼ in calo' : '■ stabile'}</td><td class="tiny muted">${x.teams.map(esc).join(' ')}</td>
        <td class="right">${d.works ? '' : `<button class="btn sm" data-a="pudeal" data-id="${x.id}" data-tier="customer" data-y="1" ${pre ? '' : 'disabled'}>${fmtM(puSeasonCost(st, x.id, 'customer'))}</button>`}</td><td class="right">${d.works ? '' : `<button class="btn sm" data-a="pudeal" data-id="${x.id}" data-tier="partner" data-y="2" ${pre ? '' : 'disabled'}>${fmtM(puSeasonCost(st, x.id, 'partner'))}</button>`}</td></tr>`).join('')}</tbody></table>
      <div class="tiny muted mt8">${d.works ? 'La power unit è tua: sviluppo motore al 100% e 2 gettoni di omologazione in più. In cambio, se il progetto è sbagliato non puoi cambiare fornitore.' : `<b>Cliente</b> (1 stagione): ${PU_TIERS.customer.desc} <b>Partner</b> (2 stagioni, da status Outsider): ${PU_TIERS.partner.desc} Ogni inverno i costruttori evolvono la power unit: la tendenza indica chi ha guadagnato o perso cavalli. ${pre ? `Cambiare fornitore prima della scadenza costa una penale (${fmtM(puBreakFee(st))}).` : 'I contratti si firmano solo in pre-stagione.'}`}</div></div>` : '';
  const rules = `<div class="panel"><div class="panel-head"><h3>Regole in vigore e deleghe</h3><span class="small muted">La Commissione vota due proposte a stagione</span></div><div class="grid2"><div>${rulesInForce(st).map((r) => `<div class="row between small" style="padding:7px 0;border-bottom:1px solid var(--line)"><span class="muted">${r.k}</span><b class="${r.mod ? 'info' : ''}">${esc(r.v)}</b></div>`).join('')}</div><div>${tog('autoRevert', 'Ritiro automatico dei pacchetti difettosi', 'Se un pezzo nuovo peggiora la vettura, la fabbrica torna subito alla vecchia specifica.')}${tog('autoVote', 'Delega il voto in Commissione', 'Il delegato vota secondo l’interesse della squadra, senza lobby e senza interpellarti.')}</div></div></div>`;
  const tb = techBase(st, t); const allB = Object.values(st.teams).map((x) => techBase(st, x)).sort((a, b) => b - a);
  const base = `<div class="panel mb16"><div class="panel-head"><h3>Base tecnica della squadra</h3><span class="chip">${allB.indexOf(tb) + 1}ª su ${allB.length}</span></div><div class="grid3"><div class="card"><div class="tiny upper muted">Livello strutturale</div><div style="font-family:var(--display);font-weight:900;font-size:26px">${tb.toFixed(1)}</div>${bar(tb, 'blue', allB[0])}<div class="tiny muted mt8">La barra chiara è la squadra meglio strutturata (${allB[0].toFixed(1)}).</div></div><div class="card" style="grid-column:span 2"><div class="small" style="line-height:1.55;color:var(--text2)">Ogni inverno la nuova vettura riparte a metà strada tra quella vecchia e questo livello: lo sviluppo di una stagione ti porta sopra, ma solo <b>budget, Fabbrica, Galleria del Vento, Simulatore e un grande Direttore Tecnico</b> alzano il punto a cui torni. Chi domina senza struttura dura una stagione; chi ha struttura resta in alto per anni.</div><div class="row wrap gap6 mt8 tiny"><span class="chip">Fabbrica Lv${t.facilities.factory}</span><span class="chip">Galleria Lv${t.facilities.windtunnel}</span><span class="chip">Simulatore Lv${t.facilities.simulator}</span><span class="chip">Direttore Tecnico ${st.staff[t.staff.td]?.rating || '—'}</span><span class="chip">Budget ${fmtM(t.baseBudget)}</span></div></div></div></div>`;
  void aiTrend; void basePart; void C;
  return `${eraPanel}${base}<div class="grid3 mb16">${corr}${tokens}${susCard}</div>${kits}${mode}${pu}${rules}`;
}

function designTab(st, t, C) {
  const pre = st.round === 0;
  const L = t.car.livery;
  const sw = (k) => `<div class="swatches mt8">${PALETTE.map((c) => `<div class="swatch ${L[k] === c ? 'sel' : ''}" style="background:${c}" data-a="color" data-k="${k}" data-c="${c}"></div>`).join('')}<input type="color" value="${L[k]}" data-change="customcolor" data-k="${k}" title="Personalizzato"></div>`;
  const tl = (st.techLog || []).filter((x) => x.season === st.season);
  const L3 = st.calendar.length;
  const plan = [['regs', 'Regolamento', 0], ['package', 'Pacchetto metà stagione', Math.max(1, Math.round(L3 * 0.3))], ['focus', 'Quest’anno o il prossimo?', Math.max(2, Math.round(L3 * 0.58))]];
  const nx = Object.entries(t.nextYear || {}).filter(([, v]) => v);
  return `<div class="panel mb16"><div class="panel-head"><h3>Decisioni tecniche della stagione ${st.season}</h3><span class="tiny muted">Ogni scelta cambia la vettura: non si torna indietro</span></div>
      <div class="row gap8" style="flex-wrap:wrap">${plan.map(([id, n, at]) => { const d = tl.find((x) => x.id === id); return `<div class="card grow" style="min-width:200px;border-left:3px solid ${d ? 'var(--good)' : st.round >= at ? 'var(--warn)' : 'var(--line2)'}"><div class="tiny upper muted">${n} · round ${at + 1}</div>${d ? `<b class="small">${esc(d.choice)}</b><div class="tiny muted">${esc(d.out || '')}</div>` : `<div class="small muted">${st.round >= at ? 'In attesa della tua decisione' : 'Da decidere'}</div>`}</div>`; }).join('')}</div>
      ${nx.length ? `<div class="small mt8 muted">Vettura ${st.season + 1} (già in sviluppo): ${nx.map(([k, v]) => `${esc(C.parts.find((p) => p.id === k)?.name || k)} ${v > 0 ? '+' : ''}${v}`).join(' · ')}</div>` : ''}
    </div>
    <div class="grid2">
    <div class="col gap16">
      <div class="panel"><div class="panel-head"><h3>Concetto vettura</h3>${pre ? '<span class="chip good">Pre-stagione: modificabile</span>' : '<span class="chip">Bloccato fino a fine stagione</span>'}</div>
        <div class="grid2">${C.concepts.map((c) => `<div class="card ${pre ? 'click' : ''} ${t.car.concept === c.id ? 'sel' : ''}" ${pre ? `data-a="concept" data-id="${c.id}"` : ''}><b>${c.name}</b><div class="small muted mt8">${c.desc}</div><div class="row wrap gap6 mt8">${Object.entries(c.mods).map(([k, v]) => `<span class="chip ${v > 0 ? 'good' : 'bad'} tiny">${partName(st, k)} ${v > 0 ? '+' : ''}${v}</span>`).join('') || '<span class="chip tiny">Nessun modificatore</span>'}</div></div>`).join('')}</div>
      </div>
      ${st.category === 'formula' ? `<div class="panel"><div class="panel-head"><h3>Power Unit</h3><button class="btn sm" data-a="tab" data-t="regs">Contratti di fornitura</button></div><div class="small muted">${t.works ? 'Costruttore ufficiale: la power unit è tua.' : `Fornitore: <b>${esc(ENGINE_SUPPLIERS.find((e) => e.id === t.engine)?.name || '')}</b>. Contratti, costi e confronto tra costruttori sono nella scheda «Regolamento & PU».`}</div></div>` : ''}
    </div>
    <div class="panel"><div class="panel-head"><h3>${icon('palette', 'ico', 'style="width:16px"')} Livrea</h3></div>
      <label class="lbl">Colore primario</label>${sw('primary')}
      <label class="lbl mt16" style="display:block">Colore secondario</label>${sw('secondary')}
      <label class="lbl mt16" style="display:block">Dettagli</label>${sw('accent')}
      <label class="lbl mt16" style="display:block">Motivo</label>
      <div class="row wrap gap6 mt8">${PATTERNS.map((p, i) => `<button class="btn sm ${L.pattern === i ? 'active' : ''}" data-a="pattern" data-p="${i}">${p}</button>`).join('')}</div>
      <div class="grid3 mt16">${PATTERNS.map((p, i) => `<div class="card click ${L.pattern === i ? 'sel' : ''}" data-a="pattern" data-p="${i}" style="padding:6px">${carImg(st.category, { ...L, pattern: i }, { number: '' })}</div>`).join('')}</div>
    </div>
  </div>`;
}

function compareTab(st, t, C) {
  const teams = Object.values(st.teams).sort((a, b) => avgPart(b) - avgPart(a));
  const ids = C.parts.map((p) => p.id);
  const lo = Math.min(...teams.flatMap((x) => ids.map((k) => x.car.parts[k]))) - 4, hi = Math.max(...teams.flatMap((x) => ids.map((k) => x.car.parts[k]))) + 1;
  const nrm = (v) => (v - lo) / (hi - lo);
  const best = ids.map((k) => Math.max(...teams.map((x) => x.car.parts[k]))), avg = ids.map((k) => teams.reduce((a, x) => a + x.car.parts[k], 0) / teams.length);
  const leader = teams[0].id === t.id ? teams[1] : teams[0];
  const radar = radarChart(C.parts, [
    { name: 'Media della griglia', kind: 'avg', values: avg.map(nrm) },
    { name: `Migliore per area`, kind: 'ref', values: best.map(nrm) },
    { name: t.name, kind: 'me', color: teamColor(t.car.livery), values: ids.map((k) => nrm(t.car.parts[k])), rawv: ids.map((k) => t.car.parts[k]) },
  ], { size: 360, raw: (s, i) => s.rawv[i].toFixed(1) });
  const gaps = C.parts.map((p, i) => { const v = t.car.parts[p.id], d = v - best[i]; const rk = partRanking(st, p.id).indexOf(t.id) + 1; return `<div class="cmp-gap"><span>${p.name}</span><b class="mono">${v.toFixed(1)}</b><em class="${d >= -0.05 ? 'good' : d > -3 ? 'warn' : 'bad'}">${d >= -0.05 ? 'Riferimento' : d.toFixed(1)}</em><i>${rk}°</i></div>`; }).join('');
  return `<div class="cmp-top mb16"><div class="panel"><div class="panel-head"><h3>Profilo della vettura</h3><span class="small muted">Rispetto alla griglia</span></div>${radar}</div>
    <div class="panel"><div class="panel-head"><h3>Distacco dal migliore</h3><span class="small muted">Riferimento generale: ${esc(leader.name)}</span></div><div class="cmp-gaps">${gaps}</div><div class="tiny muted mt16">Il distacco è misurato in punti prestazione dal miglior valore in griglia per ogni area. La posizione a destra è la classifica del componente.</div></div></div>
  <div class="panel flush"><table class="tbl"><thead><tr><th>#</th><th>Team</th>${C.parts.map((p) => `<th class="right">${p.name}</th>`).join('')}<th class="right">Media</th><th>Tendenza</th></tr></thead><tbody>
    ${teams.map((x, i) => `<tr class="${x.id === t.id ? 'me' : ''}"><td class="pos">${i + 1}</td><td><div class="row">${teamBadge(x, 24)}<b>${esc(x.name)}</b></div></td>${C.parts.map((p) => { const r = partRanking(st, p.id).indexOf(x.id); return `<td class="right mono ${r === 0 ? 'good' : r >= teams.length - 2 ? 'bad' : ''}">${x.car.parts[p.id].toFixed(1)}</td>`; }).join('')}<td class="right mono"><b>${avgPart(x).toFixed(1)}</b></td><td class="tiny ${x.isPlayer ? 'muted' : aiTrend(st, x.id).cls}">${x.isPlayer ? '—' : `${aiTrend(st, x.id).arrow} ${aiTrend(st, x.id).label}`}</td></tr>`).join('')}
  </tbody></table></div>`;
}
