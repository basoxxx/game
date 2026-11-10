// Category definitions: how each championship works
export const POINTS_STD = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export const CATEGORIES = {
  junior: {
    id: 'junior',
    name: 'Formula Apex 2',
    full: 'Formula Apex 2 Championship',
    tagline: 'La scuola dei campioni: monoposto identiche, giovani talenti, il trampolino verso la Formula Apex.',
    type: 'circuit',
    cars: 2, driversPerCar: 1,
    color: '#3aa0ff',
    icon: 'formula',
    parts: [
      { id: 'aero', name: 'Assetto Aero', desc: 'Regolazioni e flap' },
      { id: 'engine', name: 'Motore', desc: 'Mappatura e manutenzione' },
      { id: 'chassis', name: 'Telaio', desc: 'Sospensioni e bilanciamento' },
      { id: 'tyre', name: 'Gestione Gomme', desc: 'Degrado e finestra di utilizzo' },
      { id: 'reliability', name: 'Affidabilità', desc: 'Rischio di guasti meccanici' },
    ],
    baseLap: 95, lapsDefault: 20, pitLoss: 22, refuel: false, swaps: false,
    compounds: ['soft', 'medium', 'hard', 'wet'],
    budgetScale: 0.12, prizeTop: 3, prizeStep: 0.25,
    concepts: [
      { id: 'balanced', name: 'Standard', desc: 'L’assetto di base fornito dal costruttore.', mods: {} },
      { id: 'downforce', name: 'Carico', desc: '+Aero, meno velocità di punta.', mods: { aero: 3, engine: -3 } },
      { id: 'lowdrag', name: 'Scarico', desc: '+Velocità, soffre nel misto.', mods: { engine: 3, aero: -3 } },
    ],
  },
  formula: {
    id: 'formula',
    name: 'Formula Apex',
    full: 'Formula Apex World Championship',
    tagline: 'Monoposto a ruote scoperte. Velocità pura, strategia gomme, millesimi.',
    type: 'circuit',
    cars: 2, driversPerCar: 1,
    color: '#e10600',
    icon: 'formula',
    parts: [
      { id: 'aero', name: 'Aerodinamica', desc: 'Carico e velocità in curva' },
      { id: 'engine', name: 'Power Unit', desc: 'Potenza e velocità massima' },
      { id: 'chassis', name: 'Telaio', desc: 'Bilanciamento e trazione' },
      { id: 'tyre', name: 'Gestione Gomme', desc: 'Degrado e finestra di utilizzo' },
      { id: 'reliability', name: 'Affidabilità', desc: 'Rischio di guasti meccanici' },
    ],
    baseLap: 88, lapsDefault: 24, pitLoss: 21, refuel: false, swaps: false,
    compounds: ['soft', 'medium', 'hard', 'inter', 'wet'],
    budgetScale: 1, prizeTop: 40, prizeStep: 3,
    concepts: [
      { id: 'balanced', name: 'Bilanciato', desc: 'Nessun punto debole, nessun picco.', mods: {} },
      { id: 'downforce', name: 'Alto Carico', desc: '+Aero +Gomme, ma lenta sui rettilinei.', mods: { aero: 6, tyre: 3, engine: -6 } },
      { id: 'lowdrag', name: 'Basso Drag', desc: '+Velocità di punta, soffre nel misto.', mods: { engine: 6, aero: -5, tyre: -2 } },
      { id: 'radical', name: 'Concetto Radicale', desc: 'Grande potenziale aero, affidabilità a rischio.', mods: { aero: 9, chassis: 3, reliability: -10 } },
    ],
  },
  rally: {
    id: 'rally',
    name: 'Rally Apex',
    full: 'World Rally Apex Championship',
    tagline: 'Prove speciali su sterrato, asfalto e neve. Coraggio e assistenza.',
    type: 'rally',
    cars: 2, driversPerCar: 1,
    color: '#ffb400',
    icon: 'rally',
    parts: [
      { id: 'engine', name: 'Motore Turbo', desc: 'Accelerazione e velocità' },
      { id: 'suspension', name: 'Sospensioni', desc: 'Grip su sconnesso e salti' },
      { id: 'chassis', name: 'Telaio', desc: 'Agilità nei tornanti' },
      { id: 'gearbox', name: 'Trasmissione', desc: 'Trazione integrale e cambio' },
      { id: 'reliability', name: 'Robustezza', desc: 'Resistenza ai danni' },
    ],
    budgetScale: 0.35, prizeTop: 12, prizeStep: 1,
    concepts: [
      { id: 'balanced', name: 'Polivalente', desc: 'Veloce ovunque, senza eccellere.', mods: {} },
      { id: 'gravel', name: 'Specialista Sterrato', desc: '+Sospensioni +Robustezza, -Telaio.', mods: { suspension: 7, reliability: 4, chassis: -6 } },
      { id: 'tarmac', name: 'Specialista Asfalto', desc: '+Telaio +Motore, fragile sullo sconnesso.', mods: { chassis: 7, engine: 3, suspension: -6, reliability: -2 } },
      { id: 'power', name: 'Motore Estremo', desc: 'Cavalli a volontà, trasmissione al limite.', mods: { engine: 9, gearbox: -4, reliability: -6 } },
    ],
  },
  endurance: {
    id: 'endurance',
    name: 'Endurance Apex',
    full: 'Apex Endurance Hypercar Series',
    tagline: 'Hypercar, gare di 6 e 24 ore, cambi pilota, notte e carburante.',
    type: 'circuit',
    cars: 2, driversPerCar: 2,
    color: '#00c2ff',
    icon: 'endurance',
    parts: [
      { id: 'engine', name: 'Ibrido / Motore', desc: 'Potenza ed erogazione' },
      { id: 'aero', name: 'Aerodinamica', desc: 'Efficienza e carico' },
      { id: 'efficiency', name: 'Consumi', desc: 'Più giri per stint' },
      { id: 'tyre', name: 'Gomme & Freni', desc: 'Doppi stint senza calo' },
      { id: 'reliability', name: 'Affidabilità', desc: 'Sopravvivere fino alla bandiera' },
    ],
    baseLap: 102, lapsDefault: 36, pitLoss: 32, refuel: true, swaps: true,
    compounds: ['soft', 'medium', 'hard', 'wet'],
    budgetScale: 0.55, prizeTop: 18, prizeStep: 1.5,
    concepts: [
      { id: 'balanced', name: 'Bilanciato', desc: 'Pronto per ogni circuito.', mods: {} },
      { id: 'lowdrag', name: 'Coda Lunga', desc: '+Motore +Consumi, -Aero.', mods: { engine: 5, efficiency: 4, aero: -6 } },
      { id: 'bulletproof', name: 'A Prova di Bomba', desc: '+Affidabilità +Gomme, meno veloce.', mods: { reliability: 10, tyre: 3, engine: -5, aero: -3 } },
      { id: 'sprint', name: 'Prestazione Pura', desc: 'Velocissima, ma beve e si rompe.', mods: { engine: 6, aero: 5, efficiency: -6, reliability: -6 } },
    ],
  },
};

export const COMPOUNDS = {
  soft: { name: 'Soft', short: 'S', color: '#ff3040', pace: -0.75, wear: 1.75 },
  medium: { name: 'Medium', short: 'M', color: '#ffd400', pace: 0, wear: 1.0 },
  hard: { name: 'Hard', short: 'H', color: '#f2f2f2', pace: 0.6, wear: 0.62 },
  inter: { name: 'Intermedia', short: 'I', color: '#28c840', pace: 1.4, wear: 0.9, wet: 0.5 },
  wet: { name: 'Full Wet', short: 'W', color: '#1e90ff', pace: 3.0, wear: 0.8, wet: 1 },
};

export const RALLY_TYRES = {
  gravel_soft: { name: 'Sterrato Morbida', short: 'GS', color: '#ff8a3d', surf: 'gravel', pace: -0.6, wear: 1.5 },
  gravel_hard: { name: 'Sterrato Dura', short: 'GH', color: '#c76a2c', surf: 'gravel', pace: 0, wear: 0.8 },
  tarmac_soft: { name: 'Asfalto Morbida', short: 'TS', color: '#ff3040', surf: 'tarmac', pace: -0.6, wear: 1.5 },
  tarmac_hard: { name: 'Asfalto Dura', short: 'TH', color: '#dddddd', surf: 'tarmac', pace: 0, wear: 0.8 },
  snow: { name: 'Chiodate Neve', short: 'SN', color: '#8fd3ff', surf: 'snow', pace: 0, wear: 0.9 },
  wet: { name: 'Pioggia', short: 'WT', color: '#1e90ff', surf: 'wet', pace: 0, wear: 0.9 },
};

export const SURFACES = {
  gravel: { name: 'Sterrato', color: '#c98b4a', weights: { engine: 1, suspension: 1.6, chassis: 0.8, gearbox: 1.1, reliability: 0.6 }, speed: 112 },
  tarmac: { name: 'Asfalto', color: '#7f8a99', weights: { engine: 1.3, suspension: 0.6, chassis: 1.6, gearbox: 1, reliability: 0.3 }, speed: 118 },
  snow: { name: 'Neve', color: '#dff3ff', weights: { engine: 0.8, suspension: 1.1, chassis: 1.0, gearbox: 1.6, reliability: 0.4 }, speed: 104 },
  rough: { name: 'Sterrato Duro', color: '#9b6a3a', weights: { engine: 0.8, suspension: 1.8, chassis: 0.6, gearbox: 0.9, reliability: 1.2 }, speed: 96 },
};

export const DIFFICULTY = {
  easy: { name: 'Facile', budget: 1.35, aiDev: 0.8, desc: 'Più budget, rivali meno aggressivi nello sviluppo.' },
  normal: { name: 'Normale', budget: 1, aiDev: 1, desc: 'L’esperienza bilanciata.' },
  hard: { name: 'Difficile', budget: 0.85, aiDev: 1.2, desc: 'Budget ridotto, rivali più rapidi nello sviluppo, consiglio più esigente.' },
  legend: { name: 'Leggenda', budget: 0.75, aiDev: 1.4, desc: 'AI spietata, premi e diritti commerciali ridotti del 14%, obiettivi altissimi.' },
};
