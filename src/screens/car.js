import { carImg } from '../ui/garage3d.js';
import { App, registerScreen, coach } from '../app.js';
import { icon } from '../ui/icons.js';
import { carSVG, teamBadge } from '../ui/art.js';
import { esc, bar } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { atrFactor, costCap, capSpent, cat, playerTeam, teamDrivers, partRanking, fmtM, rdSlots, rdCost, RD_TIERS, RD_APPROACH, rushProject, rushCost, startProject, partName, applyConcept, changeEngine, overallCarRanking } from '../engine/season.js';
import { getTrack } from '../engine/world.js';
import { traitInfo } from '../engine/dynasty.js';
import '../styles/career.css';
import { ENGINE_SUPPLIERS } from '../data/teams.js';
import { avgPart } from '../engine/world.js';
import { sfx } from '../ui/audio.js';
import { Garage3D } from '../ui/garage3d.js';
import { webglAvailable } from '../ui/race3d.js';
import { teamColor } from '../app.js';
let garage = null, show3d = true;

const PALETTE = ['#e10600', '#d40000', '#ff8000', '#ffd400', '#cedc00', '#22d37a', '#00594f', '#00d2be', '#00c2ff', '#005aff', '#1b2a6b', '#0a2a66', '#9b30ff', '#ff4fa3', '#ffffff', '#c0c0c0', '#6b6b6b', '#1a1a1a', '#6b3e1e', '#c9a227'];
const PATTERNS = ['Classica', 'Banda', 'Bicolore', 'Frecce', 'Sfumata', 'Retrò'];
let tab = 'dev';
let devTarget = 'now';
let devApproach = 'std';

registerScreen({
  id: 'car',
  render() {
    const st = S();
    st._conceptSeen = true;
    const t = playerTeam(st);
    const C = cat(st);
    const ds = teamDrivers(st, t);
    const tabs = [['dev', 'Sviluppo R&D'], ['design', 'Progetto & Livrea'], ['compare', 'Confronto']];
    const rank = overallCarRanking(st).indexOf(t.id) + 1;
    return `<div class="screen-title"><div><div class="sub">${esc(t.name)} · Vettura ${st.season}</div><h1>Centro Tecnico</h1></div><div class="tabs">${tabs.map(([k, n]) => `<div class="tab ${tab === k ? 'active' : ''}" data-a="tab" data-t="${k}">${n}</div>`).join('')}</div></div>
    <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:16px" class="anim-in">
      <div class="car-stage" style="min-height:300px"><div class="grid-floor"></div>
        <div style="position:absolute;left:20px;top:16px;z-index:2"><div class="tiny upper muted">Valore complessivo</div><div style="font-family:var(--display);font-weight:900;font-style:italic;font-size:46px;line-height:1">${avgPart(t).toFixed(1)}</div><div class="small ${rank <= 3 ? 'good' : rank > 6 ? 'bad' : 'warn'}">${rank}ª vettura del gruppo</div></div>
        <div style="position:absolute;right:20px;top:16px;z-index:2" class="chip">Concetto: <b>${C.concepts.find((c) => c.id === t.car.concept)?.name}</b></div>
        <div style="position:absolute;right:20px;bottom:14px;z-index:3" class="row gap4"><button class="btn sm ${show3d ? 'active' : ''}" data-a="v3d">3D</button><button class="btn sm ${show3d ? '' : 'active'}" data-a="v2d">2D</button></div>
        <div id="garage3d" style="position:absolute;inset:0;z-index:1"></div>
        ${show3d && webglAvailable() ? '<div class="tiny muted" style="position:absolute;left:20px;bottom:14px;z-index:3">Trascina per ruotare · rotella per lo zoom</div>' : carSVG(st.category, t.car.livery, { number: ds[0]?.number, sponsor: t.sponsors[0]?.name || t.short, helmet: ds[0]?.helmet.c1 })}
      </div>
      <div class="panel"><div class="panel-head"><h3>Componenti</h3><span class="small muted">Classifica tra i ${Object.keys(st.teams).length} team</span></div>
        <div class="col gap16">${C.parts.map((p) => {
          const r = partRanking(st, p.id); const pos = r.indexOf(t.id) + 1; const best = st.teams[r[0]].car.parts[p.id];
          return `<div><div class="row between small"><b>${p.name}</b><span class="muted">${p.desc}</span></div><div class="stat mt8" style="grid-template-columns:1fr 46px 40px">${bar(t.car.parts[p.id], '', best)}<b class="right mono">${t.car.parts[p.id].toFixed(1)}</b><span class="rank ${pos <= 3 ? 'good' : pos > 6 ? 'bad' : 'warn'}">${pos}°</span></div></div>`;
        }).join('')}</div>
        <div class="tiny muted mt16">La barra chiara indica il miglior valore in griglia.</div>
      </div>
    </div>
    <div class="mt16 anim-in">${tab === 'dev' ? devTab(st, t, C) : tab === 'design' ? designTab(st, t, C) : compareTab(st, t, C)}</div>`;
  },
  mount() {
    coach('car', 'Centro Tecnico', 'Avvia progetti R&D sui componenti chiave dei prossimi circuiti. Più un componente è sviluppato, minore è il guadagno: a volte conviene migliorare i punti deboli.');
    garage?.destroy(); garage = null;
    const el = document.getElementById('garage3d');
    if (el && show3d && webglAvailable()) {
      const st = S(); const t = playerTeam(st); const ds = teamDrivers(st, t);
      try { garage = new Garage3D(el, st.category, t.car.livery, { helmet: ds[0]?.helmet.c1, accent: teamColor(t.car.livery), number: ds[0]?.number, sponsor: t.sponsors[0]?.name || t.short }); } catch (e) { console.warn(e); }
    }
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
        <div>${bar(v)}<div class="tiny muted mt8">Efficienza sviluppo: <span class="${dim > 0.8 ? 'good' : dim > 0.45 ? 'warn' : 'bad'}">${Math.round(dim * 100)}%</span></div></div>
        <b class="mono" style="font-size:20px;font-family:var(--display)">${v.toFixed(1)}</b>
        <div class="row gap6" style="justify-content:flex-end">${proj ? `<div style="width:100%"><div class="row between small"><span class="info">${RD_TIERS[proj.tier].name}${proj.approach && proj.approach !== 'std' ? ' · ' + RD_APPROACH[proj.approach].name : ''}${proj.next ? ' · ' + (st.season + 1) : ''}</span><span>${proj.racesLeft} ${proj.racesLeft === 1 ? 'evento' : 'eventi'}</span></div>${bar(((proj.total - proj.racesLeft) / proj.total) * 100 + 8, 'blue')}<div class="tiny muted mt8">${proj.next ? `Pronto per la vettura ${st.season + 1}` : (() => { const ev = st.calendar[st.round + proj.racesLeft]; const tr = ev && getTrack(st.category, ev.trackId); return tr ? `In pista dal ${esc(tr.name)}` : 'Consegna dopo l’ultimo evento'; })()}${proj.racesLeft > 1 && !proj.rushed ? ` · <a class="info" style="cursor:pointer;text-decoration:underline" data-a="rush" data-id="${proj.id}" data-tip="Un evento prima, rischio di fallimento +6%">Straordinari ${fmtM(rushCost(st, proj))}</a>` : proj.rushed ? ' · <span class="warn">Accelerato</span>' : ''}</div></div>` :
        Object.keys(RD_TIERS).map((k) => `<button class="btn sm" data-a="start" data-part="${p.id}" data-tier="${k}" ${t.projects.length >= slots || t.money < rdCost(st, k) ? 'disabled' : ''} title="${RD_TIERS[k].name} – ${fmtM(rdCost(st, k))}">${k === 'base' ? 'Base' : k === 'major' ? 'Evo' : 'Rivo'}</button>`).join('')}</div></div>`;
    }).join('')}
    <div class="small muted mt16">I progetti si completano dopo il numero di eventi indicato. Più un componente è già sviluppato, minore è il guadagno (rendimenti decrescenti). Più slot con la Fabbrica, guadagni maggiori con Galleria del Vento e un Direttore Tecnico migliore.</div>
  </div>`;
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
      ${st.category === 'formula' ? `<div class="panel"><div class="panel-head"><h3>Power Unit</h3>${t.works ? '<span class="chip">Team ufficiale</span>' : ''}</div>
        ${t.works ? `<div class="small muted">Sei un costruttore ufficiale: utilizzi la tua power unit ${esc(ENGINE_SUPPLIERS.find((e) => e.id === t.engine)?.name || '')}.</div>` :
        `<div class="col gap6">${ENGINE_SUPPLIERS.map((e) => `<div class="card row ${pre ? 'click' : ''} ${t.engine === e.id ? 'sel' : ''}" ${pre ? `data-a="engine" data-id="${e.id}"` : ''}><b class="grow">${e.name}</b><span class="chip">Potenza ${e.power}</span><span class="chip">Affidabilità ${e.rel}</span></div>`).join('')}</div>`}</div>` : ''}
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
  return `<div class="panel flush"><table class="tbl"><thead><tr><th>#</th><th>Team</th>${C.parts.map((p) => `<th class="right">${p.name}</th>`).join('')}<th class="right">Media</th></tr></thead><tbody>
    ${teams.map((x, i) => `<tr class="${x.id === t.id ? 'me' : ''}"><td class="pos">${i + 1}</td><td><div class="row">${teamBadge(x, 24)}<b>${esc(x.name)}</b></div></td>${C.parts.map((p) => { const r = partRanking(st, p.id).indexOf(x.id); return `<td class="right mono ${r === 0 ? 'good' : r >= teams.length - 2 ? 'bad' : ''}">${x.car.parts[p.id].toFixed(1)}</td>`; }).join('')}<td class="right mono"><b>${avgPart(x).toFixed(1)}</b></td></tr>`).join('')}
  </tbody></table></div>`;
}
