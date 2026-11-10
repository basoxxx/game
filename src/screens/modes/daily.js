// "Sfida del giorno" (mode-daily)
import { App, registerScreen } from '../../app.js';
import { icon } from '../../ui/icons.js';
import { esc, pageHead } from '../../ui/dom.js';
import { CATEGORIES } from '../../data/categories.js';
import { MEDAL } from '../../engine/modes/objectives.js';
import { dailyFor, dailyHistory, dayKey, keyToDate, fmtDay, streak, shareText } from '../../engine/modes/daily.js';
import { briefing, launchScenario, fallbackCopy } from './debrief.js';
import { explainer } from './ui.js';

let viewDay = null; // a past day picked in the calendar (replay only)

function calendar(today, h) {
  const t = keyToDate(today);
  const start = new Date(t); start.setDate(start.getDate() - 27);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // monday
  const cells = [];
  for (const d = new Date(start); d <= t; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d); const e = h[k];
    const m = e?.official?.medal;
    cells.push(`<button class="md-day ${k === today ? 'today' : ''} ${k === (viewDay || today) ? 'sel' : ''} ${e ? 'played' : ''}" data-a="day" data-k="${k}" style="${m != null && m >= 0 ? `--mc:${MEDAL[m].col}` : ''}" aria-label="${esc(fmtDay(k))}${e ? ', giocata' : ''}">
      <span>${d.getDate()}</span>${e ? `<i class="${m >= 0 ? 'm' : 'x'}"></i>` : ''}</button>`);
  }
  return `<div class="md-calhead">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}</div><div class="md-days">${cells.join('')}</div>`;
}

registerScreen({
  id: 'mode-daily', full: true,
  render() {
    const today = dayKey();
    const day = viewDay || today;
    const sc = dailyFor(day);
    const h = dailyHistory(); const e = h[day];
    const C = CATEGORIES[sc.cat];
    const played = Object.values(h).filter((x) => x.official).length;
    const golds = Object.values(h).filter((x) => x.official?.medal === 2).length;
    const isToday = day === today;
    const status = e?.official
      ? `<div class="chip ${e.official.medal >= 0 ? 'good' : 'bad'}">${icon('check')} Tentativo ufficiale: ${e.official.medal >= 0 ? MEDAL[e.official.medal].name : 'nessuna medaglia'} · ${e.official.best >= 99 ? 'ritiro' : 'P' + e.official.best}</div>`
      : `<div class="chip warn">${icon('alert')} ${isToday ? 'Il primo tentativo completato è quello ufficiale' : 'Giorno passato: puoi giocarla solo come tentativo libero'}</div>`;
    return `<div class="full-screen md-screen" style="--pc:${C.color}">
      ${pageHead({ eyebrow: 'Modalità · Ogni giorno una nuova sfida', title: 'Sfida del giorno', right: `<div class="row" style="gap:28px"><div class="kpi" style="text-align:right"><b>${streak(today)}</b><span>Serie attuale</span></div><div class="kpi" style="text-align:right"><b>${played}</b><span>Giocate · ${golds} ori</span></div></div>` })}
      ${explainer('Come funziona', [
        'Ogni giorno c’è una sfida nuova, uguale per tutti: categoria, squadra, pista e imprevisto dipendono solo dalla data.',
        'Il <b>primo tentativo completato</b> è quello ufficiale: vale per la serie di giorni consecutivi e per il risultato da condividere.',
        'Dopo puoi riprovare liberamente per migliorare il tuo record personale.',
      ], played === 0)}
      <div class="md-daily anim-in mt16">
        <div class="panel">${briefing(sc, { kind: 'daily', extra: `<div class="mt16">${status}</div>` })}
          <div class="row mt24 gap6 wrap"><button class="btn primary xl" data-a="play">${icon('flag')} ${e?.official || !isToday ? 'Gioca (tentativo libero)' : 'Gioca la sfida'}</button>
          ${e?.official ? `<button class="btn lg" data-a="share">${icon('upload')} Copia risultato</button>` : ''}
          ${!isToday ? `<button class="btn lg ghost" data-a="today">${icon('calendar')} Torna a oggi</button>` : ''}</div>
        </div>
        <div class="col gap16">
          <div class="panel"><div class="panel-head"><h3>${icon('calendar')} Ultime settimane</h3><span class="small muted">${esc(fmtDay(today, { month: 'long', year: 'numeric' }))}</span></div>
            ${calendar(today, h)}
            <div class="row wrap gap16 mt16 small muted"><span class="row gap6"><i class="md-leg m"></i> Medaglia</span><span class="row gap6"><i class="md-leg x"></i> Senza medaglia</span><span class="row gap6"><i class="md-leg t"></i> Oggi</span></div></div>
          <div class="panel"><div class="panel-head"><h3>${icon('chart')} Storico</h3></div>
            ${Object.keys(h).length ? `<table class="tbl small"><tbody>${Object.keys(h).sort().reverse().slice(0, 8).map((k) => { const x = h[k]; const s2 = dailyFor(k); return `<tr><td>${esc(keyToDate(k).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }))}</td><td>${esc(s2.title)}</td><td class="right">${x.official?.medal >= 0 ? `<span class="medal" style="--mc:${MEDAL[x.official.medal].col}">${MEDAL[x.official.medal].name}</span>` : '<span class="muted">—</span>'}</td><td class="right mono tiny muted">${x.tries}×</td></tr>`; }).join('')}</tbody></table>`
              : `<div class="empty">${icon('calendar')}<b>Nessuna sfida giocata</b><span>Completa la sfida di oggi per iniziare la tua serie.</span></div>`}</div>
        </div>
      </div></div>`;
  },
  actions: {
    play() { launchScenario(dailyFor(viewDay || dayKey()), 'daily'); },
    day(el) { viewDay = el.dataset.k === dayKey() ? null : el.dataset.k; App.refresh(); },
    today() { viewDay = null; App.refresh(); },
    share() {
      const day = viewDay || dayKey(); const txt = shareText(day, dailyHistory()[day], dailyFor(day));
      const ok = () => App.toast('Copiato negli appunti', 'Incolla il risultato dove vuoi.', 'good');
      try { navigator.clipboard.writeText(txt).then(ok, () => fallbackCopy(txt) && ok()); } catch { if (fallbackCopy(txt)) ok(); }
    },
  },
});
