import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { helmetSVG, teamBadge, carSVG, flagSVG } from '../ui/art.js';
import { esc, bar } from '../ui/dom.js';
import { S, setState, saveGame } from '../engine/state.js';
import { createWorld } from '../engine/world.js';
import { cat, playerTeam, endSeason, newSeason, jobOffers, fmtM, addMail, unlock } from '../engine/season.js';
import { CATEGORIES } from '../data/categories.js';
import { celebrate } from './results.js';
import { sfx } from '../ui/audio.js';

let summary = null, offers = null;

registerScreen({
  id: 'seasonend', full: true,
  render() {
    const st = S();
    if (!summary || summary.season !== st.season) {
      const sum = endSeason(st);
      summary = { season: st.season, ...sum };
      offers = jobOffers(st);
      saveGame();
    }
    const sm = summary;
    const pt = playerTeam(st);
    const ok = sm.teamPos <= sm.target;
    const champMine = sm.champ.teamId === pt.id;
    const consMine = sm.st.teams[0].id === pt.id;
    return `<div style="position:fixed;inset:0;overflow-y:auto;padding:36px 50px">
      <div class="tiny upper muted" style="letter-spacing:.3em">${esc(cat(st).full)}</div>
      <h1 style="font-size:48px">Fine Stagione ${sm.season}</h1>
      <div class="grid3 mt24 anim-in">
        <div class="panel ${champMine ? 'glow' : ''}"><div class="tiny upper muted">Campione Piloti</div><div class="row mt8" style="gap:14px">${helmetSVG(sm.champ.helmet, 64)}<div><div style="font-family:var(--display);font-weight:900;font-size:22px">${esc(sm.champ.name)}</div><div class="muted">${esc(sm.champTeam.name)} · ${sm.st.drivers[0].pts} punti</div></div></div></div>
        <div class="panel ${consMine ? 'glow' : ''}"><div class="tiny upper muted">Campione Costruttori</div><div class="row mt8" style="gap:14px">${teamBadge(sm.constructors, 60)}<div><div style="font-family:var(--display);font-weight:900;font-size:22px">${esc(sm.constructors.name)}</div><div class="muted">${sm.st.teams[0].pts} punti</div></div></div></div>
        <div class="panel"><div class="tiny upper muted">La tua stagione</div><div style="font-family:var(--display);font-weight:900;font-size:44px;font-style:italic" class="${ok ? 'good' : 'bad'}">${sm.teamPos}°</div><div class="muted">Obiettivo: ${sm.target}° · Premio: <b>${fmtM(sm.prize)}</b></div></div>
      </div>
      ${sm.awards?.length ? `<div class="panel mt16 anim-in"><div class="panel-head"><h3>Gala di fine stagione · Premi</h3></div><div class="grid4">${sm.awards.map((a, i) => `<div class="card" style="text-align:center;animation:rise .5s ${0.2 + i * 0.15}s both">${icon(a.icon, 'ico', 'style="width:34px;height:34px;color:var(--gold)"')}<div class="tiny upper muted mt8">${esc(a.name)}</div><div style="font-family:var(--display);font-weight:900;font-size:18px">${esc(a.who)}</div><div class="small muted">${esc(a.team || '')}${a.note ? ' · ' + esc(a.note) : ''}</div></div>`).join('')}</div></div>` : ''}
      <div class="panel mt16 ${sm.fired ? '' : ''}"><div class="panel-head"><h3>Verdetto del Consiglio</h3><span class="chip ${st.board.confidence < 30 ? 'bad' : st.board.confidence > 65 ? 'good' : 'warn'}">Fiducia ${st.board.confidence}%</span></div>
        <div style="font-size:16px">${sm.fired ? `<span class="bad"><b>Sei stato licenziato.</b></span> Il consiglio ha perso la fiducia nel tuo lavoro. Scegli una nuova squadra tra le offerte ricevute.` : ok ? (consMine || champMine ? 'Una stagione leggendaria! Il consiglio è entusiasta e ti rinnova la piena fiducia.' : 'Obiettivo raggiunto. Il consiglio è soddisfatto del lavoro svolto.') : 'Obiettivo mancato. Il consiglio si aspetta un netto miglioramento la prossima stagione.'}</div>
        ${bar(st.board.confidence, st.board.confidence < 30 ? 'red' : st.board.confidence > 65 ? 'green' : 'gold')}
      </div>
      <div class="panel mt16"><div class="panel-head"><h3>Offerte di lavoro</h3><span class="small muted">Reputazione manager: ${Math.round(st.career.reputation)}</span></div>
        <div class="grid4">${offers.map((o, i) => `<div class="card click" data-a="take" data-i="${i}" style="border-top:3px solid ${CATEGORIES[o.category].color}"><div class="tiny upper" style="color:${CATEGORIES[o.category].color}">${CATEGORIES[o.category].name}${o.category !== st.category ? ' · Nuova categoria!' : ''}</div><div class="row mt8">${teamBadge({ short: o.teamId.slice(0, 3).toUpperCase(), colors: o.colors }, 34)}<b>${esc(o.name)}</b></div><div class="small muted mt8">Prestigio ${o.rep}</div></div>`).join('') || '<div class="muted">Nessuna offerta.</div>'}</div>
        ${sm.fired ? '' : `<div class="row mt16" style="justify-content:flex-end"><button class="btn primary xl" data-a="stay">Resta con ${esc(pt.name)} ${icon('right')}</button></div>`}
      </div>
    </div>`;
  },
  mount() { const st = S(); if (summary && (summary.champ.teamId === st.playerTeam || summary.st.teams[0].id === st.playerTeam)) { celebrate(300); sfx.win(); } },
  actions: {
    stay() { const st = S(); newSeason(st); summary = null; saveGame(); sfx.ok(); App.go('hub'); },
    take(el) {
      const st = S(); const o = offers[+el.dataset.i];
      App.confirm(`Firmare con ${esc(o.name)}?`, `${o.category !== st.category ? `Passerai al campionato ${CATEGORIES[o.category].name}. ` : ''}Inizierai la stagione ${st.season + 1} con la nuova squadra.`, () => {
        if (o.category === st.category) {
          const old = playerTeam(st); old.isPlayer = false; old.principal = 'Nuovo TP';
          const nt = st.teams[o.teamId]; nt.isPlayer = true; nt.principal = st.playerName; st.playerTeam = nt.id;
          st.board.confidence = 65;
          newSeason(st);
        } else {
          const career = st.career; const ach = st.achievements;
          const ns = createWorld({ playerName: st.playerName, category: o.category, teamId: o.teamId, difficulty: st.difficulty, seasonLength: st.seasonLength, raceLength: st.raceLength });
          ns.season = st.season + 1; ns.career = career; ns.achievements = ach; ns.slot = st.slot;
          addMail(ns, { from: 'Consiglio di Amministrazione', icon: 'board', type: 'info', subject: `Benvenuto in ${ns.teams[o.teamId].name}`, body: `Una nuova sfida in ${CATEGORIES[o.category].full}! Il consiglio si aspetta il ${ns.board.target}° posto.` });
          setState(ns);
          unlock(ns, 'switch', 'Giramondo', 'Cambia categoria durante la carriera.');
        }
        summary = null; saveGame(); sfx.win(); App.go('hub');
      });
    },
  },
});
