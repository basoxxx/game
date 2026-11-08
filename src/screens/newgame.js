import { carImg } from '../ui/garage3d.js';
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { carSVG, teamBadge, categoryArt, flagSVG, helmetSVG } from '../ui/art.js';
import { esc, stars, pageHead } from '../ui/dom.js';
import { CATEGORIES, DIFFICULTY } from '../data/categories.js';
import { TEAMS, ENGINE_SUPPLIERS } from '../data/teams.js';
import { createWorld } from '../engine/world.js';
import { setState, saveGame, listSaves } from '../engine/state.js';
import { addMail } from '../engine/season.js';
import { sfx } from '../ui/audio.js';
import { ensureDynasty, setMandate, MANDATES } from '../engine/dynasty.js';

const PALETTE = ['#e10600', '#ff8000', '#ffd400', '#22d37a', '#00594f', '#00d2be', '#00c2ff', '#005aff', '#1b2a6b', '#9b30ff', '#ff4fa3', '#ffffff', '#c0c0c0', '#1a1a1a', '#6b3e1e', '#c9a227'];
const PATTERNS = ['Classica', 'Banda', 'Bicolore', 'Frecce', 'Sfumata', 'Retrò'];

const W = { step: 1, cat: 'formula', team: null, custom: null, name: 'Giocatore', diff: 'normal', len: 'normal', race: 'normal', slot: 1, mandate: 'growth' };

function teamStrengthLabel(td, all) {
  const sorted = all.slice().sort((a, b) => b.base - a.base);
  const i = sorted.indexOf(td);
  const f = i / (sorted.length - 1);
  return f < 0.3 ? ['Top Team', 'good'] : f < 0.65 ? ['Centro Gruppo', 'warn'] : ['Sfida Difficile', 'bad'];
}

registerScreen({
  id: 'newgame', full: true,
  render() {
    const firstFree = listSaves().find((s) => s.empty)?.slot || 1;
    if (W.step === 1 && !W._slotInit) { W.slot = firstFree; W._slotInit = true; }
    const steps = ['Categoria', 'Squadra', 'Carriera'];
    const pc = W.step === 1 ? CATEGORIES[W.cat]?.color : 'var(--accent)';
    return `<div class="full-screen" style="--pc:${pc}">
      ${pageHead({ backAction: 'back', eyebrow: `Nuova carriera · Passo ${W.step} di 3`, title: steps[W.step - 1], right: `<div class="stepper">${steps.map((s, i) => `<div class="step ${i + 1 < W.step ? 'done' : i + 1 === W.step ? 'cur' : ''}"><span class="n">${i + 1 < W.step ? icon('check', 'ico', 'style="width:15px;height:15px"') : i + 1}</span>${s}</div>`).join('')}</div>` })}
      ${W.step === 1 ? step1() : W.step === 2 ? step2() : step3()}
    </div>`;
  },
  actions: {
    back() { if (W.step > 1) { W.step--; App.refresh(); } else App.go('menu'); },
    'pick-cat'(el) { W.cat = el.dataset.id; W.team = null; W.custom = null; sfx.ok(); App.refresh(); },
    'next'() {
      if (W.step === 2 && !W.team) { App.toast('Scegli una squadra', '', 'bad'); return; }
      if (W.step === 2 && W.team === 'custom' && !W.custom.name.trim()) { App.toast('Dai un nome alla squadra', '', 'bad'); return; }
      W.step++; App.refresh();
    },
    'pick-team'(el) {
      W.team = el.dataset.id;
      if (W.team === 'custom' && !W.custom) W.custom = { name: 'Apex Racing', short: 'APX', colors: ['#9b30ff', '#ffd400', '#111111'], pattern: 2, engine: 'ferrani', hq: 'Italia' };
      App.refresh();
    },
    'c-color'(el) { W.custom.colors[+el.dataset.i] = el.dataset.c; App.refresh(); },
    'c-pattern'(el) { W.custom.pattern = +el.dataset.p; App.refresh(); },
    'c-engine'(el) { W.custom.engine = el.dataset.e; App.refresh(); },
    'opt'(el) { W[el.dataset.k] = el.dataset.v; App.refresh(); },
    start() {
      const name = (document.getElementById('pname')?.value || 'Giocatore').trim() || 'Giocatore';
      W.name = name;
      const st = createWorld({ playerName: name, category: W.cat, teamId: W.team, difficulty: W.diff, seasonLength: W.len, raceLength: W.race, customTeam: W.team === 'custom' ? W.custom : null });
      st.slot = W.slot;
      ensureDynasty(st); setMandate(st, W.mandate);
      const t = st.teams[st.playerTeam];
      addMail(st, { from: 'Consiglio di Amministrazione', icon: 'board', type: 'info', subject: `Benvenuto in ${t.name}!`, body: `Caro ${name},\n\nil consiglio ti dà il benvenuto come nuovo Team Principal. Il nostro obiettivo per la stagione ${st.season} è chiudere almeno ${st.board.target}° nel campionato costruttori.\n\nIl mandato che ci hai presentato è «${MANDATES[W.mandate].name}». Ecco il piano che ti chiediamo di rispettare:\n${st.dyn.plan.steps.map((x) => `• ${x.season}: ${x.text}`).join('\n')}\n\nPrima del primo evento:\n• Visita il Centro Tecnico per scegliere il concetto della vettura e la livrea\n• Firma gli sponsor nella sezione Sponsor & Finanze\n• Avvia i primi progetti di sviluppo\n\nBuona fortuna!` });
      addMail(st, { from: 'Area Commerciale', icon: 'money', type: 'info', subject: 'Sponsor in attesa', body: 'Abbiamo diverse proposte di sponsorizzazione sul tavolo. Ogni sponsor paga a gara più un bonus legato agli obiettivi. Hai 3 spazi disponibili sulla livrea.' });
      setState(st); saveGame(W.slot);
      W.step = 1; W._slotInit = false;
      sfx.win();
      App.go('hub');
    },
  },
  mount() {
    document.getElementById('pname')?.addEventListener('input', (e) => { W.name = e.target.value; });
    document.getElementById('cname')?.addEventListener('input', (e) => { W.custom.name = e.target.value; const p = document.getElementById('cprev-name'); if (p) p.textContent = e.target.value; });
    document.getElementById('cshort')?.addEventListener('input', (e) => { W.custom.short = e.target.value.toUpperCase().slice(0, 3); });
  },
});

function step1() {
  return `<div class="cat-cards anim-in">${Object.values(CATEGORIES).map((c) => `
    <div class="cat-card ${W.cat === c.id ? 'sel' : ''}" style="--cc:${c.color}" data-a="pick-cat" data-id="${c.id}">
      <div class="art">${categoryArt(c.id)}</div>
      <div class="cinfo"><div class="cc-k" style="color:${c.color}">${c.id === 'junior' ? 'Carriera dalla gavetta' : c.type === 'rally' ? 'Prove speciali' : c.id === 'endurance' ? 'Gare di durata' : 'Monoposto'}</div><h2 class="mt8">${c.name}</h2><div class="small mt8" style="color:var(--text2);min-height:38px">${c.tagline}</div>
      <div class="cc-facts"><span><b>${TEAMS[c.id].length}</b>team</span><span><b>${c.cars}</b>auto/team</span>${c.driversPerCar > 1 ? `<span><b>${c.driversPerCar}</b>piloti/auto</span>` : ''}<span>${c.type === 'rally' ? 'Decisioni live' : c.refuel ? 'Rifornimenti' : 'Strategia gomme'}</span></div>${c.id === 'junior' ? '<div class="small good mt8">Vinci per salire in Formula Apex</div>' : ''}</div>
    </div>`).join('')}</div>
    <div class="row mt24" style="justify-content:flex-end"><button class="btn primary xl" data-a="next">Scegli la squadra ${icon('right')}</button></div>`;
}

function step2() {
  const C = CATEGORIES[W.cat];
  const teams = TEAMS[W.cat];
  const sel = W.team && W.team !== 'custom' ? teams.find((t) => t.id === W.team) : null;
  let preview = '';
  if (sel) {
    const [lab, cls] = teamStrengthLabel(sel, teams);
    preview = `<div class="team-preview" style="--team:${sel.colors[0] === '#f0f0f0' || sel.colors[0] === '#f2f2f2' || sel.colors[0] === '#f4f4f4' ? sel.colors[1] : sel.colors[0]}">
      <div class="tp-head">${teamBadge(sel, 52)}<div class="grow"><h2>${sel.name}</h2><div class="small" style="color:var(--text2)">${sel.hq} · Team Principal attuale: ${sel.principal}</div></div><span class="tc-tier ${cls}">${lab}</span></div>
      <div class="tp-car">${carImg(W.cat, { primary: sel.colors[0], secondary: sel.colors[1], accent: sel.colors[2], pattern: 1 }, { number: '', sponsor: sel.short }, 760, 330)}</div>
      <div class="tp-body"><div class="stat-strip"><div><b>${sel.base}</b><span>Valore vettura</span></div><div><b>€${sel.budget}M</b><span>Budget</span></div><div><b class="stars" style="font-size:22px">${stars(sel.rep / 20)}</b><span>Prestigio</span></div></div>
      <div class="tiny upper muted mt16 mb8">Piloti</div>${sel.gen ? '<div class="small muted">Giovani talenti generati all’inizio della carriera.</div>' : ''}<div>${(sel.d || []).map((d) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">${helmetSVG(null, 30)}${flagSVG(d[1])}<b style="font-family:var(--display);font-size:18px;text-transform:uppercase">${d[0]}</b><span class="small muted">${d[2]} anni</span><span class="grow"></span><span class="small muted">Velocità</span><b class="num" style="font-size:20px">${d[3]}</b></div>`).join('')}</div></div>
    </div>`;
  } else if (W.team === 'custom') {
    const cu = W.custom;
    preview = `<div class="panel glow" style="--team:${cu.colors[0]}">
      <h2 style="font-size:32px;font-style:italic;font-weight:800">Fonda la tua squadra</h2><div class="small muted">Prenderai il posto del team più debole, con budget ridotto. La vera sfida.</div>
      <div class="car-stage mt16" style="min-height:200px"><div class="grid-floor"></div>${carImg(W.cat, { primary: cu.colors[0], secondary: cu.colors[1], accent: cu.colors[2], pattern: cu.pattern }, { number: '', sponsor: cu.short })}</div>
      <div class="grid2 mt16"><div class="col gap6"><label class="lbl">Nome squadra</label><input type="text" id="cname" value="${esc(cu.name)}" maxlength="26"></div><div class="col gap6"><label class="lbl">Sigla (3 lettere)</label><input type="text" id="cshort" value="${esc(cu.short)}" maxlength="3"></div></div>
      ${['Colore primario', 'Colore secondario', 'Dettagli'].map((lab, i) => `<div class="mt16"><label class="lbl">${lab}</label><div class="swatches mt8">${PALETTE.map((c) => `<div class="swatch ${cu.colors[i] === c ? 'sel' : ''}" style="background:${c}" data-a="c-color" data-i="${i}" data-c="${c}"></div>`).join('')}</div></div>`).join('')}
      <div class="mt16"><label class="lbl">Motivo livrea</label><div class="row wrap mt8 gap6">${PATTERNS.map((p, i) => `<button class="btn sm ${cu.pattern === i ? 'active' : ''}" data-a="c-pattern" data-p="${i}">${p}</button>`).join('')}</div></div>
      ${W.cat === 'formula' ? `<div class="mt16"><label class="lbl">Fornitore Power Unit</label><div class="row wrap mt8 gap6">${ENGINE_SUPPLIERS.map((e) => `<button class="btn sm ${cu.engine === e.id ? 'active' : ''}" data-a="c-engine" data-e="${e.id}">${e.name} <span class="muted">${e.power}</span></button>`).join('')}</div></div>` : ''}
    </div>`;
  } else preview = `<div class="empty" style="min-height:420px">${icon('flag')}<b>Scegli una squadra</b><div>Seleziona una squadra per vederne vettura, budget e piloti.</div></div>`;

  return `<div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:28px;align-items:start" class="anim-in">
    <div><div class="team-grid">${teams.map((t) => { const [lab, cls] = teamStrengthLabel(t, teams); return `<div class="team-card ${W.team === t.id ? 'sel' : ''}" style="--tc:${t.colors[0] === '#f0f0f0' || t.colors[0] === '#f2f2f2' || t.colors[0] === '#f4f4f4' ? t.colors[1] : t.colors[0]}" data-a="pick-team" data-id="${t.id}">
      <div class="row" style="position:relative;z-index:1;gap:12px">${teamBadge(t, 40)}<div class="grow"><div class="tc-name">${t.name}</div><div class="stars" style="font-size:12px">${stars(t.rep / 20)}</div></div></div>
      <div class="tc-meta" style="position:relative;z-index:1"><span>Auto <b>${t.base}</b> · €${t.budget}M</span><span class="tc-tier ${cls}">${lab}</span></div></div>`; }).join('')}
      <div class="team-card ${W.team === 'custom' ? 'sel' : ''}" style="--tc:#9b30ff;border-style:dashed" data-a="pick-team" data-id="custom"><div class="row" style="position:relative;z-index:1;gap:12px"><div class="rating">${icon('plus')}</div><div><div class="tc-name">Crea la tua squadra</div><div class="small muted">Nome, colori, livrea</div></div></div><div class="tc-meta" style="position:relative;z-index:1"><span>Budget ridotto</span><span class="tc-tier bad">Modalità Leggenda</span></div></div>
    </div></div>
    <div class="ng-side">${preview}<div class="row mt16" style="justify-content:flex-end"><button class="btn primary xl" data-a="next" ${W.team ? '' : 'disabled'}>Continua ${icon('right')}</button></div></div>
  </div>`;
}

function step3() {
  const opt = (k, v, label, desc) => `<div class="card click opt-card ${W[k] === v ? 'sel' : ''}" data-a="opt" data-k="${k}" data-v="${v}"><b>${label}</b>${desc ? `<div class="small muted mt8">${desc}</div>` : ''}</div>`;
  const saves = listSaves();
  return `<div class="grid2 anim-in" style="max-width:1240px;gap:24px">
    <div class="panel"><div class="panel-head"><h3>Il tuo profilo</h3></div>
      <label class="lbl">Nome del Team Principal</label><input type="text" id="pname" value="${esc(W.name)}" maxlength="24" style="width:100%;margin-top:8px;font-size:24px;font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.03em">
      <div class="panel-head" style="margin-top:28px"><h3>Difficoltà</h3></div>
      <div class="grid3">${Object.entries(DIFFICULTY).map(([k, d]) => opt('diff', k, d.name, d.desc)).join('')}</div>
      <div class="panel-head" style="margin-top:28px"><h3>Il tuo mandato</h3><span class="small muted">Cosa prometti al consiglio</span></div>
      <div class="grid3">${Object.entries(MANDATES).map(([k, m]) => opt('mandate', k, m.name, m.desc)).join('')}</div>
      <div class="panel-head" style="margin-top:28px"><h3>Slot di salvataggio</h3></div>
      <div class="row gap6">${saves.map((s) => `<button class="btn ${W.slot == s.slot ? 'active' : ''}" data-a="opt" data-k="slot" data-v="${s.slot}" data-tip="${s.empty ? 'Slot vuoto' : 'Contiene una partita'}">Slot ${s.slot}${s.empty ? '' : ' ·'}</button>`).join('')}</div>
      ${!saves.find((s) => s.slot == W.slot)?.empty ? '<div class="small warn mt8">Attenzione: lo slot contiene già una partita e verrà sovrascritto.</div>' : ''}
    </div>
    <div class="panel"><div class="panel-head"><h3>Durata stagione</h3></div>
      <div class="grid3">${opt('len', 'short', 'Corta', 'Meno eventi')}${opt('len', 'normal', 'Standard', 'Consigliata')}${opt('len', 'full', 'Completa', 'Tutto il calendario')}</div>
      <div class="panel-head" style="margin-top:28px"><h3>Durata ${W.cat === 'rally' ? 'rally' : 'gare'}</h3></div>
      <div class="grid4" style="grid-template-columns:repeat(4,1fr)">${opt('race', 'short', 'Sprint', W.cat === 'formula' ? '25% dei giri' : 'Gare brevi')}${opt('race', 'normal', 'Standard', W.cat === 'formula' ? '40% dei giri' : 'Consigliata')}${opt('race', 'long', 'Lunga', W.cat === 'formula' ? '66% dei giri' : 'Più stint')}${opt('race', 'full', 'Reale', W.cat === 'formula' ? '100% dei giri' : 'Massima durata')}</div>
      <div class="row mt24" style="justify-content:flex-end"><button class="btn primary xl pulse" data-a="start">${icon('flag')} Inizia la Carriera</button></div>
    </div>
  </div>`;
}
