// Festa Baso — the minigame catalogue (pure: the board, the tournament, the screens and the node tests read it).
//   kind: 'ffa' every player for themselves · 'team' teams (Tiro alla fune) · 'coop' all together vs the game
//   how: { move, a } verbs for the 3-second intro (shown per device); from: the Baso Hub game it borrows from
import { Tiro, Porte, Kart, Palloncini, Autoscontro } from './action.js';
import { Voragine, Serpenti, Territorio, Bastione } from './arena.js';
import { Golf, Ingorgo, Officina, Riflessi, Ritmo, Memoria } from './brain.js';

export const MINIGAMES = [
  { id: 'tiro', name: 'Tiro alla fune', from: 'Orda', icon: 'users', kind: 'team', color: '#ff7a1a', Sim: Tiro, desc: 'Due squadre di omini e una corda sul fango: chi pesta più veloce trascina gli altri.', how: { move: null, a: 'Tira! (premi più veloce che puoi)' } },
  { id: 'porte', name: 'Corsa delle porte', from: 'Orda', icon: 'flag', kind: 'ffa', color: '#2f8cff', Sim: Porte, desc: 'La tua folla corre verso il traguardo: scegli le porte che moltiplicano e schiva le ruote dentate.', how: { move: 'Sinistra / destra: scegli la porta', a: null } },
  { id: 'kart', name: 'Sprint kart', from: 'Kart Baso', icon: 'flag', kind: 'ffa', color: '#ff3b6b', Sim: Kart, desc: 'Tre giri dell’ovale: gas automatico, curva pulita e turbo quando la barra è piena.', how: { move: 'Sinistra / destra: sterza', a: 'Turbo (barra piena)' } },
  { id: 'palloncini', name: 'Battaglia dei palloncini', from: 'Kart Baso', icon: 'target', kind: 'ffa', color: '#ff5fa2', Sim: Palloncini, desc: 'Tre palloncini a testa: spara ricciolini rimbalzini e resta l’ultimo in pista.', how: { move: 'Stick: guida', a: 'Spara un ricciolino' } },
  { id: 'autoscontro', name: 'Autoscontro', from: 'Scontro Totale', icon: 'burst', kind: 'ffa', color: '#e0303f', Sim: Autoscontro, desc: 'Vecchie carrette su una piattaforma che si restringe: spingi gli altri giù dal bordo.', how: { move: 'Stick: guida', a: 'Sgommata (spinta)' } },
  { id: 'voragine', name: 'Mini voragine', from: 'Voragine', icon: 'target', kind: 'ffa', color: '#7a5cff', Sim: Voragine, desc: 'Sei un buco nella piazza: inghiotti coni, alberi e auto per crescere. I buchi grandi mangiano i piccoli.', how: { move: 'Stick: muovi il buco', a: null } },
  { id: 'serpenti', name: 'Arena dei serpenti', from: 'Serpentone', icon: 'star', kind: 'ffa', color: '#7ddc1f', Sim: Serpenti, desc: 'Mangia le palline luminose e taglia la strada: chi sbatte contro il tuo corpo ti regala 5 punti.', how: { move: 'Stick: direzione', a: 'Tieni premuto: scatto' } },
  { id: 'territorio', name: 'Pittura del territorio', from: 'Territorio', icon: 'palette', kind: 'ffa', color: '#2fd36b', Sim: Territorio, desc: 'Colora il pavimento passandoci sopra; lo spruzzo dipinge un cerchio intero. Vince chi ha più caselle.', how: { move: 'Stick: corri e colora', a: 'Spruzzo (ogni 3 s)' } },
  { id: 'bastione', name: 'Bastione unito', from: 'Bastione', icon: 'shield', kind: 'coop', color: '#3fae5a', Sim: Bastione, desc: 'Tutti insieme a difendere il castello: tiri automatici, costruisci torri sulle piazzole, onda d’urto.', how: { move: 'Stick: muoviti (tiri da solo)', a: 'Sulla piazzola: torre · altrove: onda d’urto' } },
  { id: 'golf', name: 'Più vicino alla buca', from: 'Minigolf Baso', icon: 'target', kind: 'ffa', color: '#18c1b0', Sim: Golf, desc: 'Due tiri a testa sullo stesso green: vince la pallina più vicina alla buca (in buca = imbattibile).', how: { move: 'Sinistra / destra: mira', a: 'Tieni premuto per caricare, lascia per tirare' } },
  { id: 'ingorgo', name: 'Ingorgo lampo', from: 'Ingorgo', icon: 'bulb', kind: 'ffa', color: '#ffc21a', Sim: Ingorgo, desc: 'Lo stesso ingorgo per tutti: fai uscire l’auto rossa, poi il prossimo. Vince chi ne libera di più.', how: { move: 'Stick: muovi il cursore', a: 'Tieni premuto + direzione: sposta il veicolo' } },
  { id: 'officina', name: 'Corsa all’officina', from: 'Officina', icon: 'wrench', kind: 'ffa', color: '#ff9f1c', Sim: Officina, desc: 'Arrivano kart nuovi: unisci due auto uguali per salire di livello. Premi su una casella vuota per ordinare un kart. Il primo bolide di livello 6 vince.', how: { move: 'Stick: muovi il cursore', a: 'Prendi / posa e unisci · su casella vuota: nuovo kart' } },
  { id: 'riflessi', name: 'Semaforo', from: 'Apex Dynasty', icon: 'hourglass', kind: 'ffa', color: '#e5145f', Sim: Riflessi, desc: 'Cinque luci rosse: quando si spengono, premi! Il più rapido prende 3 punti, chi anticipa ne perde uno.', how: { move: null, a: 'Premi quando le luci si spengono' } },
  { id: 'ritmo', name: 'Ritmo Baso', from: 'Originale', icon: 'star', kind: 'ffa', color: '#9b5cff', Sim: Ritmo, desc: 'Le note scendono a tempo di musica: premi quando toccano la linea. Perfetto, bene, ok… e i colpi a vuoto costano.', how: { move: null, a: 'Premi a tempo sulla linea' } },
  { id: 'memoria', name: 'Memoria a colori', from: 'Originale', icon: 'bulb', kind: 'ffa', color: '#2ec4ff', Sim: Memoria, desc: 'Guarda la sequenza di frecce e ripetila. Ogni turno si allunga: il primo a finire prende un bonus.', how: { move: 'Stick / frecce: ripeti la sequenza', a: null } },
];
export const MINI = Object.fromEntries(MINIGAMES.map((m) => [m.id, m]));
export const MINI_IDS = MINIGAMES.map((m) => m.id);
// skill of a CPU player from the difficulty (0 easy .. 2 hard), with a little spread per seat
export const cpuSkill = (diff, i = 0) => Math.max(0.1, Math.min(1, [0.3, 0.6, 0.9][diff ?? 1] + ((i * 37) % 10 - 5) * 0.012));
