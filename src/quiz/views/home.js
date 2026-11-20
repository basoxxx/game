// Quiz e Parole — the collection's home: Quiz del giorno banner, one tile per game, themes and stats.
import { qzLoad } from '../store.js';
import { CATS } from '../bank.js';
import { dateKey, dayNumber } from '../daily.js';
import { head, fmt, esc, themeById } from '../ui.js';

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const ART = {
  quiz: `<svg viewBox="0 0 120 80" aria-hidden="true"><rect x="10" y="10" width="100" height="26" rx="8" fill="var(--qz-card2)"/><text x="60" y="29" text-anchor="middle" font-size="18" font-weight="900" fill="var(--qz-acc)">?</text>${[0, 1, 2, 3].map((i) => `<rect x="${10 + (i % 2) * 52}" y="${42 + Math.floor(i / 2) * 18}" width="48" height="14" rx="5" fill="${i === 2 ? 'var(--qz-good)' : 'var(--qz-card2)'}"/>`).join('')}</svg>`,
  parola: `<svg viewBox="0 0 120 80" aria-hidden="true">${'PAROL'.split('').map((c, i) => `<rect x="${7 + i * 22}" y="22" width="20" height="24" rx="4" fill="${['var(--qz-good)', 'var(--qz-warn)', 'var(--qz-miss)', 'var(--qz-good)', 'var(--qz-warn)'][i]}"/><text x="${17 + i * 22}" y="40" text-anchor="middle" font-size="15" font-weight="900" fill="#fff">${c}</text>`).join('')}${[0, 1, 2, 3, 4].map((i) => `<rect x="${7 + i * 22}" y="50" width="20" height="24" rx="4" fill="none" stroke="var(--qz-line)" stroke-width="2"/>`).join('')}</svg>`,
  impiccato: `<svg viewBox="0 0 120 80" aria-hidden="true"><ellipse cx="60" cy="28" rx="22" ry="24" fill="var(--qz-acc)"/><path d="M38 28 Q60 60 82 28" fill="var(--qz-acc2)" opacity=".7"/><path d="M45 47 L53 62 M75 47 L67 62" stroke="var(--qz-ink)" stroke-width="1.5"/><rect x="51" y="61" width="18" height="12" rx="2" fill="#9b6a3c"/>${[0, 1, 2].map((i) => `<rect x="${48 + i * 9}" y="74" width="7" height="5" rx="2" fill="#c9a26a"/>`).join('')}</svg>`,
  anagrammi: `<svg viewBox="0 0 120 80" aria-hidden="true">${'ANAGRAM'.split('').map((c, i) => { const a = (i / 7) * Math.PI * 2 - Math.PI / 2; const x = 60 + Math.cos(a) * 28, y = 40 + Math.sin(a) * 28; return `<circle cx="${x}" cy="${y}" r="10" fill="var(--qz-card2)" stroke="var(--qz-acc)" stroke-width="2"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="12" font-weight="900" fill="var(--qz-ink)">${c}</text>`; }).join('')}<text x="60" y="46" text-anchor="middle" font-size="16" fill="var(--qz-acc)">↻</text></svg>`,
};

function tile(id, name, desc, stat, color) {
  return `<button class="qz-tile" data-a="qz" data-do="go" data-v="${id === 'quiz' ? 'quizmenu' : id}" style="--c:${color}"><div class="qz-tile-art">${ART[id]}</div><div class="qz-tile-b"><b>${name}</b><span>${desc}</span><em>${stat}</em></div></button>`;
}

export default {
  render() {
    const d = qzLoad(), today = dateKey(), q = d.quiz, p = d.parola, h = d.hang, a = d.ana;
    const dailyDone = d.daily.key === today;
    const parolaDone = p.day?.key === today && p.day.done;
    return `<div class="qz-page">
      ${head({ title: 'Quiz e Parole', sub: 'Quattro giochi in italiano: il quiz con oltre 1.300 domande in nove categorie, la Parolina del giorno, l’Impiccato con la mongolfiera e gli Anagrammi a tempo.', back: 'launcher', eyebrow: 'Baso Hub · Quiz' })}
      <button class="qz-daily ${dailyDone ? 'done' : ''}" data-a="qz" data-do="go" data-v="quizplay" data-mode="daily">
        <div class="qz-daily-ic" aria-hidden="true"><small>${MONTHS[new Date().getMonth()]}</small><b>${new Date().getDate()}</b></div>
        <div class="qz-daily-b"><small>Quiz del giorno · n° ${dayNumber()}</small><b>${dailyDone ? `Fatto! ${d.daily.res.filter(Boolean).length}/10 · ${fmt(d.daily.score)} punti` : '10 domande, uguali per tutti, una volta al giorno'}</b>
        <span>${dailyDone ? 'Torna domani per un nuovo quiz, intanto condividi il risultato.' : 'Dalla più facile alla più difficile, da tutte le categorie.'}${d.daily.streak > 1 ? ` · serie di ${d.daily.streak} giorni` : ''}</span></div>
        <div class="qz-daily-go">${dailyDone ? 'Risultato' : 'Gioca'}</div>
      </button>
      <div class="qz-tiles">
        ${tile('quiz', 'Quiz', 'Partita a tempo, Sopravvivenza e Sfida per 2-4 giocatori con i pulsanti.', q.games ? `${fmt(q.correct)} risposte giuste · record ${fmt(q.best)}` : `${CATS.length} categorie · 3 livelli`, '#4f7cff')}
        ${tile('parola', 'Parolina', 'Indovina la parola di cinque lettere in sei tentativi.', parolaDone ? `Oggi: ${p.day.won ? `indovinata in ${p.day.guesses.length}` : 'non indovinata'} · serie ${p.streak}` : p.played ? `${p.won}/${p.played} vinte · serie ${p.streak}` : 'Parola del giorno e partite libere', '#2fb36b')}
        ${tile('impiccato', 'Impiccato', 'Salva la mongolfiera: ogni errore le fa perdere un sacchetto di sabbia.', h.played ? `${h.won}/${h.played} parole · serie record ${h.best}` : '8 categorie con indizi', '#ff8a1f')}
        ${tile('anagrammi', 'Anagrammi', 'Sette lettere, 90 secondi: trova più parole che puoi.', a.played ? `Record ${fmt(a.best)} punti · ${fmt(a.words)} parole` : 'Anche la sfida del giorno', '#d65bff')}
      </div>
      <div class="qz-home-foot">
        <button class="qz-shopbtn" data-a="qz" data-do="go" data-v="shop"><span class="qz-sw">${themeById(d.theme).sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span><b>Temi</b><span>Tema attivo: ${esc(themeById(d.theme).name)} · ${d.owned.length}/7</span></button>
        <div class="qz-mini-stats">${[[q.games + q.sfide, 'partite al quiz'], [q.answered ? Math.round((q.correct / q.answered) * 100) + '%' : '–', 'risposte giuste'], [q.survBest, 'record sopravvivenza'], [p.maxStreak, 'serie Parolina'], [d.daily.played, 'quiz del giorno']].map(([v, l]) => `<div><b>${typeof v === 'number' ? fmt(v) : v}</b><span>${l}</span></div>`).join('')}</div>
      </div>
      <p class="qz-note">Comandi: mouse, touch, tastiera (frecce, Invio, 1-4) e controller (croce + A, B indietro). Niente pubblicità: le monete si guadagnano solo giocando.</p>
    </div>`;
  },
  mount(root) { requestAnimationFrame(() => root.querySelector('.qz-daily')?.focus({ preventScroll: true })); },
};
