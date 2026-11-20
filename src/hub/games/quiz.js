// Baso Hub entry: Quiz e Parole (collection: Quiz, Parolina, Impiccato, Anagrammi). Light on purpose:
// metadata, a progress line from the store and the lazy screen. See src/hub/registry.js.
import { qzPeek } from '../../quiz/store.js';
import { dateKey, dayNumber } from '../../quiz/daily.js';

const go = (App, page, extra = {}) => App.go('quiz', { from: 'launcher', page, ...extra });
const peek = () => qzPeek() || {};
const today = () => dateKey();
const fmt = (n) => Math.round(n || 0).toLocaleString('it-IT');

export default {
  id: 'quiz', order: 50, category: 'Quiz', section: 'Quiz', title: 'Quiz e Parole', genre: 'Quiz · giochi di parole', accent: '#ffc845',
  desc: 'Quattro giochi in italiano: un quiz con oltre 1.300 domande (motori, storia, scienza, cinema e altro), la Parolina del giorno, l’Impiccato con la mongolfiera e gli Anagrammi a tempo. Anche in sfida fino a 4 giocatori.',
  stat: () => { const p = peek(); return p.quiz?.games || p.parola?.played ? `${fmt(p.quiz?.correct)} risposte giuste · Parolina ${p.parola?.won || 0}/${p.parola?.played || 0} · ${fmt(p.coins)} monete` : '1.300+ domande · 9 categorie · 4 giochi'; },
  cover: 'covers/quiz.webp',
  art: () => `<svg viewBox="0 0 320 180" aria-hidden="true"><rect width="320" height="180" fill="#141a33"/><circle cx="250" cy="40" r="60" fill="#4f7cff" opacity=".25"/>
    <text x="40" y="112" font-family="Barlow Condensed, sans-serif" font-weight="900" font-size="96" fill="#ffc845">?</text>
    ${'QUIZ'.split('').map((c, i) => `<rect x="${110 + i * 46}" y="60" width="40" height="44" rx="7" fill="${['#2fb36b', '#e0a526', '#3a4166', '#2fb36b'][i]}"/><text x="${130 + i * 46}" y="92" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="26" fill="#fff">${c}</text>`).join('')}
    <rect x="110" y="118" width="178" height="18" rx="6" fill="#262d52"/><rect x="110" y="142" width="178" height="18" rx="6" fill="#2fb36b"/></svg>`,
  play: (App) => go(App, 'home'),
  modes: [
    { id: 'quiz', icon: 'help', name: 'Quiz', desc: 'Partita a tempo, Sopravvivenza e Sfida 2-4 giocatori con i pulsanti.', tag: 'Via!', go: (App) => go(App, 'quizmenu') },
    { id: 'daily', icon: 'calendar', name: 'Quiz del giorno', desc: () => { const d = peek().daily; return d?.key === today() ? `Fatto: ${(d.res || []).filter(Boolean).length}/10 · torna domani` : `N° ${dayNumber()}: 10 domande uguali per tutti.`; }, get tag() { return peek().daily?.key === today() ? '' : 'Nuovo'; }, go: (App) => go(App, 'quizplay', { mode: 'daily' }) },
    { id: 'parola', icon: 'book', name: 'Parolina', desc: () => { const p = peek().parola; return p?.day?.key === today() && p.day.done ? `Parola del giorno ${p.day.won ? `indovinata in ${p.day.guesses.length}` : 'sfuggita'} · serie ${p.streak}` : 'La parola di 5 lettere del giorno, in 6 tentativi.'; }, go: (App) => go(App, 'parola') },
    { id: 'impiccato', icon: 'wind', name: 'Impiccato', desc: 'Salva la mongolfiera indovinando le lettere: 8 categorie con indizi.', go: (App) => go(App, 'impiccato') },
    { id: 'anagrammi', icon: 'hourglass', name: 'Anagrammi', desc: () => { const a = peek().ana; return a?.best ? `Sette lettere, 90 secondi · record ${fmt(a.best)}` : 'Sette lettere, 90 secondi: quante parole trovi?'; }, go: (App) => go(App, 'anagrammi') },
  ],
  screens: { quiz: () => import('../../screens/quiz.js') },
  moods: { quiz: 'menu' },
  deepLink: 'quiz',
};
