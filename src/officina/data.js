// Officina — static tables: the 30 car tiers (kart → Formula, liveries of the Apex Dynasty teams), parts,
// garages (regions), research tree, dynasty perks, boosts and daily missions. Pure data: no DOM, no three.js
// (the headless economy simulation and the node tests import it too).

// ───────── cars: 6 classes × 5 tiers. model = builder used by the 3D garage (src/ui/cars3d.js categories,
// 'kart' is drawn by the Officina itself). livery = [primary, secondary, accent] of the team.
export const CLASSES = [
  { id: 'kart', name: 'Kart', model: 'kart', from: 1 },
  { id: 'junior', name: 'Formula Junior', model: 'junior', from: 6 },
  { id: 'rally', name: 'Rally', model: 'rally', from: 11 },
  { id: 'gt', name: 'Gran Turismo', model: 'gt', from: 16 },
  { id: 'endurance', name: 'Prototipi e Hypercar', model: 'endurance', from: 21 },
  { id: 'formula', name: 'Formula', model: 'formula', from: 26 },
];
const C = (t, cls, name, team, livery, num) => ({ t, cls, name, team, livery: { primary: livery[0], secondary: livery[1], accent: livery[2], pattern: (t % 4) + 1 }, num });
export const CARS = [
  C(1, 'kart', 'Kart Baby 60', 'Premia Racing', ['#d10a11', '#111111', '#ffffff'], 60),
  C(2, 'kart', 'Kart 100 Junior', 'Camposol Racing', ['#f2c500', '#0b2a6b', '#ffffff'], 10),
  C(3, 'kart', 'Kart 125 Senior', 'MPX Motorsport', ['#ff6a00', '#111111', '#ffffff'], 25),
  C(4, 'kart', 'Kart KZ a marce', 'Rodan Motorsport', ['#1a1a1a', '#00e0b0', '#ffffff'], 4),
  C(5, 'kart', 'Superkart 250', 'Tridentino', ['#0a1f44', '#e30613', '#ffffff'], 250),
  C(6, 'junior', 'Formula 4', 'Premia Racing', ['#d10a11', '#111111', '#ffffff'], 6),
  C(7, 'junior', 'Formula Regionale', 'ARTE Grand Prix', ['#111111', '#ffffff', '#e10600'], 7),
  C(8, 'junior', 'Formula 3', 'Camposol Racing', ['#f2c500', '#0b2a6b', '#ffffff'], 8),
  C(9, 'junior', 'Formula Apex 2', 'HiTec Pulse-8', ['#ffffff', '#1e1e1e', '#e10600'], 9),
  C(10, 'junior', 'Formula Apex 2 Evo', 'DAMAS Lucano Oil', ['#003b7a', '#00a3e0', '#ffffff'], 10),
  C(11, 'rally', 'Rally4', 'Citrova Racing', ['#a6192e', '#ffffff', '#202020'], 11),
  C(12, 'rally', 'Rally3', 'Skodar Motorsport', ['#4ba82e', '#0e3a2f', '#ffffff'], 12),
  C(13, 'rally', 'Rally2', 'Hyundae Speedline', ['#002c5f', '#00aad2', '#ffffff'], 13),
  C(14, 'rally', 'Rally2 Kit', 'Lancisa Corse HF', ['#0a2a66', '#ffcc00', '#ffffff'], 14),
  C(15, 'rally', 'Rally1 ibrida', 'Subaro World Rally', ['#1d4ec2', '#f5d300', '#0a1640'], 15),
  C(16, 'gt', 'GT4', 'BMV Team WRX', ['#ffffff', '#1c69d4', '#e22718'], 16),
  C(17, 'gt', 'GT3', 'Porscha Penskey', ['#f4f4f4', '#d5001c', '#000000'], 17),
  C(18, 'gt', 'GT3 Evo', 'Aston Marvin', ['#00594f', '#cedc00', '#0a0a0a'], 18),
  C(19, 'gt', 'GTE Pro', 'Ferrani AF Corsa', ['#d40000', '#ffdd00', '#111111'], 51),
  C(20, 'gt', 'GT1 Classe Regina', 'Mercator Silver Arrows', ['#00d2be', '#c0c0c0', '#101010'], 20),
  C(21, 'endurance', 'Prototipo LMP3', 'Alpinea Endurance', ['#0090ff', '#ff87bc', '#0a1a3a'], 21),
  C(22, 'endurance', 'Prototipo LMP2', 'Cadillon Herz Jotta', ['#0b0b0b', '#c9a227', '#ffffff'], 22),
  C(23, 'endurance', 'LMDh', 'Porscha Penskey', ['#f4f4f4', '#d5001c', '#000000'], 6),
  C(24, 'endurance', 'Hypercar', 'Peugot TotalVolt', ['#121212', '#9dff00', '#e0e0e0'], 93),
  C(25, 'endurance', 'Hypercar Evo', 'Toyoda Gazù', ['#101010', '#eb0a1e', '#ffffff'], 7),
  C(26, 'formula', 'Formula · Haasen', 'Haasen Racing', ['#f0f0f0', '#d00f1f', '#1a1a1a'], 20),
  C(27, 'formula', 'Formula · Williamson', 'Williamson Racing', ['#005aff', '#ffffff', '#00133d'], 23),
  C(28, 'formula', 'Formula · McLarsen', 'McLarsen Racing', ['#ff8000', '#101820', '#47c7fc'], 4),
  C(29, 'formula', 'Formula · Red Bison', 'Red Bison Racing', ['#1b2a6b', '#e3002b', '#ffcc00'], 1),
  C(30, 'formula', 'Formula · Ferrani', 'Scuderia Ferrani', ['#d40000', '#ffdd00', '#111111'], 16),
];
export const CAR_MAX = CARS.length;
export const carDef = (t) => CARS[Math.max(1, Math.min(CAR_MAX, t | 0)) - 1];
export const classOf = (t) => CLASSES.find((c) => c.id === carDef(t).cls);

// ───────── parts: four chains, merged like the cars, installed on a car (one per kind)
export const PART_KINDS = [
  { id: 'motore', name: 'Motore', short: 'MOT', icon: 'engine', desc: 'Accelerazione e velocità massima, un po’ di incasso.' },
  { id: 'aero', name: 'Aerodinamica', short: 'AER', icon: 'wind', desc: 'Velocità in curva e in rettilineo.' },
  { id: 'gomme', name: 'Gomme', short: 'GOM', icon: 'tyre', desc: 'Aderenza: partenza, frenata e curve.' },
  { id: 'telaio', name: 'Telaio', short: 'TEL', icon: 'chassis', desc: 'Meno peso: migliora un po’ tutto.' },
];
export const PART_IDS = PART_KINDS.map((k) => k.id);
export const PART_MAX = 12;
export const partKind = (id) => PART_KINDS.find((k) => k.id === id);
export const TIER_COLORS = ['#9aa3ad', '#5fc24a', '#3fa7ff', '#a066ff', '#ff9f1c', '#ff4d6d', '#ffd23f', '#2ef2d0', '#ff5ef0', '#e8f0ff', '#ff2a2a', '#ffe680'];
export const PART_GRADES = ['Serie', 'Sport', 'Corsa', 'Pro', 'Factory', 'Evo', 'Ufficiale', 'Titanio', 'Carbonio', 'Prototipo', 'Campione', 'Leggenda'];
export const partName = (kind, t) => `${partKind(kind)?.name || kind} ${PART_GRADES[t - 1] || t}`;

// ───────── garages / regions: unlocked with trophies (races). dims = [cols, rows] in landscape. cap = highest
// car tier the garage can build (a merge past it waits for the next garage). season = first season (prestige
// loop) in which the garage opens: the top garages belong to a dynasty, not to a newcomer.
export const REGIONS = [
  { id: 'brianza', cap: 7, name: 'Garage di Brianza', sub: 'Il capannone di famiglia, una pista di kart dietro casa.', dims: [4, 3], lanes: 3, mult: 1, need: 0, floor: '#3a3f47', wall: '#6b7480', accent: '#ff3b3b', sky: '#9fc6e8', grass: '#4f8a3a', cls: 'kart' },
  { id: 'lago', cap: 11, name: 'Autodromo del Lago', sub: 'Box in affitto sul circuito delle formule giovanili.', dims: [4, 4], lanes: 4, mult: 1.6, need: 6, floor: '#33404c', wall: '#5d7b93', accent: '#2fa8ff', sky: '#bcd9f2', grass: '#5b9a45', cls: 'junior' },
  { id: 'costa', cap: 15, name: 'Parco assistenza della Costa', sub: 'Tendone tra sterrato e mare: il mondo dei rally.', dims: [5, 4], lanes: 5, mult: 2.5, need: 14, floor: '#4a3f35', wall: '#8a6f55', accent: '#ffb000', sky: '#f5d7a8', grass: '#9a8a55', cls: 'rally' },
  { id: 'foresta', cap: 19, name: 'Circuito della Foresta', sub: 'Officina GT nel paddock tra gli abeti.', dims: [5, 4], lanes: 6, mult: 4, need: 24, floor: '#2f3a33', wall: '#4b6b57', accent: '#3dff9a', sky: '#a9c7b5', grass: '#2f6b3a', cls: 'gt' },
  { id: 'sarthe', cap: 23, name: 'Garage della 24 Ore', sub: 'Box di endurance: si lavora anche di notte.', dims: [5, 5], lanes: 7, mult: 6.5, need: 36, floor: '#26283a', wall: '#3b3f63', accent: '#b07bff', sky: '#2a2f55', grass: '#25472f', cls: 'endurance' },
  { id: 'reale', cap: 27, name: 'Autodromo Reale', sub: 'Il tempio della velocità: box di Formula.', dims: [6, 5], lanes: 8, mult: 10, need: 50, season: 2, floor: '#2c2c30', wall: '#7a2a2a', accent: '#ff2a2a', sky: '#d8e6f5', grass: '#477f36', cls: 'formula' },
  { id: 'apex', cap: 30, name: 'Paddock Apex', sub: 'La sede della dinastia: la fabbrica dei campioni.', dims: [6, 5], lanes: 10, mult: 16, need: 60, season: 3, floor: '#1d2026', wall: '#c9a227', accent: '#ffd23f', sky: '#ffd9a0', grass: '#3a6b30', cls: 'formula' },
];

// ───────── races: 6 events per garage, 3 grades each (Bronzo / Argento / Oro): first win of a grade = 1 trophy
export const RACE_TYPES = {
  drag: { name: 'Accelerazione', icon: 'speed', desc: 'Rettilineo da fermo, uno contro uno. Cambia marcia nella zona verde (Spazio / tocca).' },
  time: { name: 'Giro secco', icon: 'clock', desc: 'Un giro lanciato contro il tempo del rivale. Usa il boost ibrido nei rettilinei.' },
  h2h: { name: 'Testa a testa', icon: 'flag', desc: 'Un giro ruota a ruota con partenza da fermo. Due cariche di boost.' },
};
export const GRADES = [{ id: 1, name: 'Bronzo', color: '#d08a4a' }, { id: 2, name: 'Argento', color: '#c9d3df' }, { id: 3, name: 'Oro', color: '#ffd23f' }];
const RIVAL_BASE = [2, 6, 10, 15, 19, 24, 27];
const TRACKS = ['anello', 'esse', 'chicane', 'tornante', 'ovale', 'mistro'];
const EV_NAMES = {
  brianza: ['Sprint del cortile', 'Giro della cascina', 'Duello al tramonto', 'Quarto di miglio', 'Il giro del paese', 'Sfida del sabato'],
  lago: ['Drag sul lungolago', 'Tempo di qualifica', 'Duello giovani', 'Partenza da fermo', 'Giro del lago', 'Esame di Formula'],
  costa: ['Prova speciale breve', 'Shakedown', 'Superspeciale', 'Rettilineo del molo', 'Tornanti della costa', 'Duello sullo sterrato'],
  foresta: ['Accelerazione tra gli abeti', 'Giro di qualifica GT', 'Bagarre in pit lane', 'Mezzo miglio', 'Giro della foresta', 'Corpo a corpo GT'],
  sarthe: ['Rettilineo dell’Hunaudières', 'Giro notturno', 'Duello all’alba', 'Lancio dei prototipi', 'Giro della 24 Ore', 'Corpo a corpo di notte'],
  reale: ['Drag del rettifilo', 'Pole position', 'Gran Premio sprint', 'Partenza al semaforo', 'Giro record', 'Duello in parabolica'],
  apex: ['Accelerazione Apex', 'Giro della Dinastia', 'Finale dei campioni', 'Il miglio d’oro', 'Giro perfetto', 'Sfida al Re'],
};
const EV_TYPES = ['drag', 'time', 'h2h', 'drag', 'time', 'h2h'];
const EV_OFF = [0, 0, 1, 1, 2, 2];
export const EVENTS = REGIONS.flatMap((r, ri) => EV_TYPES.map((type, i) => ({
  id: `${r.id}-${i + 1}`, region: ri, type, name: EV_NAMES[r.id][i],
  track: type === 'drag' ? (ri < 1 ? 'drag201' : ri >= 5 ? 'drag804' : 'drag402') : TRACKS[(i + ri * 2) % TRACKS.length],
  rival: RIVAL_BASE[ri] + EV_OFF[i],
})));
// rival car of an event grade (1..3): tier, parts level (all four kinds), the team livery of that tier
export function rivalOf(ev, grade) {
  const want = ev.rival + (grade - 1), t = Math.min(CAR_MAX, want);
  const pl = Math.min(PART_MAX, Math.max(0, Math.round(ev.region * 1.5 + (grade - 1) * 1.5 + EV_OFF[(+ev.id.split('-')[1] - 1)] * 0.5)));
  return { t, parts: { motore: pl, aero: pl, gomme: pl, telaio: pl }, bonus: 0.05 * (want - t) };
}

// ───────── research tree (paid with telemetry points, RP): reset at every new season
export const RESEARCH = [
  // economia
  { id: 'sponsor', br: 'eco', name: 'Sponsor tecnici', desc: '+20% incasso di tutte le auto in pista.', max: 10, base: 12, g: 1.55, x: 0, y: 0 },
  { id: 'offcap', br: 'eco', name: 'Turni di notte', desc: '+1 ora di guadagni mentre sei via (massimo).', max: 8, base: 30, g: 1.45, req: ['sponsor', 1], x: 0, y: 1 },
  { id: 'offeff', br: 'eco', name: 'Custode del box', desc: '+6% di resa dei guadagni mentre sei via.', max: 7, base: 40, g: 1.5, req: ['offcap', 1], x: 0, y: 2 },
  { id: 'telem', br: 'eco', name: 'Telemetria', desc: '+25% punti telemetria per giro.', max: 6, base: 25, g: 1.7, req: ['sponsor', 2], x: 0, y: 3 },
  { id: 'corsie', br: 'eco', name: 'Corsie extra', desc: '+1 auto in pista contemporaneamente.', max: 3, base: 120, g: 3, req: ['sponsor', 3], x: 0, y: 4 },
  // officina
  { id: 'consegne', br: 'off', name: 'Consegne rapide', desc: 'Le casse gratuite arrivano il 12% più spesso.', max: 6, base: 10, g: 1.6, x: 1, y: 0 },
  { id: 'capo', br: 'off', name: 'Capo officina', desc: 'Unisce da solo le coppie uguali (più spesso a ogni livello).', max: 5, base: 35, g: 1.8, req: ['consegne', 1], x: 1, y: 1 },
  { id: 'sconti', br: 'off', name: 'Contratti fornitori', desc: '-6% sul prezzo delle auto nuove.', max: 6, base: 20, g: 1.6, req: ['consegne', 1], x: 1, y: 2 },
  { id: 'casse', br: 'off', name: 'Casse premium', desc: '+7% di probabilità che una cassa contenga un livello in più.', max: 5, base: 30, g: 1.7, req: ['sconti', 1], x: 1, y: 3 },
  { id: 'fornitori', br: 'off', name: 'Fornitori ufficiali', desc: 'Il negozio vende auto di un livello più alto.', max: 2, base: 400, g: 4, req: ['casse', 1], x: 1, y: 4 },
  // corse
  { id: 'pilota', br: 'race', name: 'Pilota collaudatore', desc: '+2,5% di prestazioni in gara.', max: 6, base: 15, g: 1.6, x: 2, y: 0 },
  { id: 'premi', br: 'race', name: 'Premi gara', desc: '+25% monete e telemetria vinte in gara.', max: 5, base: 20, g: 1.6, req: ['pilota', 1], x: 2, y: 1 },
  { id: 'ricambi', br: 'race', name: 'Magazzino ricambi', desc: 'Le casse ricambi contengono pezzi di un livello più alto.', max: 4, base: 45, g: 2.1, req: ['premi', 1], x: 2, y: 2 },
  { id: 'ers', br: 'race', name: 'Sistema ibrido', desc: '+1 carica di boost in gara e boost più lungo.', max: 2, base: 80, g: 2.5, req: ['pilota', 3], x: 2, y: 3 },
  { id: 'adrenalina', br: 'race', name: 'Adrenalina', desc: 'Il turbo Adrenalina dura 20 secondi in più.', max: 4, base: 40, g: 1.9, req: ['premi', 2], x: 2, y: 4 },
];
export const BRANCHES = { eco: 'Economia', off: 'Officina', race: 'Corse' };
export const researchById = (id) => RESEARCH.find((r) => r.id === id);
export const researchCost = (r, lvl) => Math.round(r.base * Math.pow(r.g, lvl));

// ───────── dynasty perks (paid with Dynasty points, earned starting a new season): permanent
export const PERKS = [
  { id: 'lancio', name: 'Partenza lanciata', desc: 'Ogni stagione il negozio parte da 2 livelli più in alto.', max: 3, cost: [3, 8, 18] },
  { id: 'corsia', name: 'Corsia riservata', desc: '+1 auto in pista, per sempre.', max: 2, cost: [6, 16] },
  { id: 'memoria', name: 'Memoria di squadra', desc: '+2 ore di guadagni mentre sei via e +10% di resa.', max: 3, cost: [3, 7, 14] },
  { id: 'capo', name: 'Capo officina storico', desc: 'Capo officina attivo dal primo minuto di ogni stagione (livello 2 per acquisto).', max: 2, cost: [5, 12] },
  { id: 'archivio', name: 'Archivio tecnico', desc: '+50% punti telemetria.', max: 3, cost: [4, 9, 18] },
  { id: 'bacheca', name: 'Bacheca dei trofei', desc: 'Servono il 15% di trofei in meno per i nuovi garage.', max: 2, cost: [8, 20] },
  { id: 'mecenate', name: 'Mecenate', desc: 'Ogni stagione parte con un tesoretto di monete.', max: 3, cost: [2, 6, 14] },
];
export const perkById = (id) => PERKS.find((p) => p.id === id);

// ───────── boosts: tokens (gettoni) earned with missions, gold medals and new models. No ads, no purchases.
export const BOOSTS = [
  { id: 'turbo', name: 'Turbo officina', desc: 'Incasso ×2 per 10 minuti.', cost: 5, icon: 'speed' },
  { id: 'espressa', name: 'Consegna espressa', desc: '4 casse con auto del livello più alto del negozio.', cost: 3, icon: 'box' },
  { id: 'straordinario', name: 'Straordinario', desc: 'Incassi subito 1 ora di guadagni.', cost: 8, icon: 'clock' },
  { id: 'ricambi', name: 'Pacco ricambi', desc: '3 pezzi di ricambio del livello migliore del magazzino.', cost: 4, icon: 'wrench' },
];

// ───────── daily missions: 3 a day from this pool (same for everyone on the same day), scaled to the garage
export const MISSIONS = [
  { id: 'merge', text: (n) => `Unisci ${n} coppie in officina`, n: (r) => 20 + r * 6, tokens: 4 },
  { id: 'buy', text: (n) => `Compra ${n} auto nuove`, n: (r) => 25 + r * 5, tokens: 3 },
  { id: 'win', text: (n) => `Vinci ${n} gare`, n: (r) => 3 + Math.floor(r / 2), tokens: 5 },
  { id: 'install', text: (n) => `Monta ${n} ricambi su un’auto`, n: (r) => 3 + Math.floor(r / 2), tokens: 4 },
  { id: 'laps', text: (n) => `Completa ${n} giri sulla pista di prova`, n: (r) => 150 + r * 50, tokens: 3 },
  { id: 'crates', text: (n) => `Apri ${n} casse`, n: (r) => 12 + r * 2, tokens: 3 },
  { id: 'research', text: (n) => `Completa ${n} ricerche`, n: () => 2, tokens: 4 },
  { id: 'drag', text: (n) => `Vinci ${n} gare di accelerazione`, n: () => 2, tokens: 4 },
];
export const MISSION_BONUS = 6; // tokens for all three
