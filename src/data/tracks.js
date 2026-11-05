// Calendars. Circuit tracks: w = performance weights per part, wear = tyre wear, ovt = overtaking ease (0-1), rain = rain chance
export const TRACKS = {
  formula: [
    { id: 'aus', name: 'GP d’Australia', circuit: 'Albert Park', nat: 'AUS', w: { aero: 1.1, engine: 1, chassis: 1 }, wear: 1.0, ovt: 0.55, rain: 0.2, seed: 11, street: 0.4 },
    { id: 'chn', name: 'GP di Cina', circuit: 'Shanghai International', nat: 'CHN', w: { aero: 1, engine: 1.1, chassis: 1 }, wear: 1.15, ovt: 0.7, rain: 0.25, seed: 23, street: 0 },
    { id: 'jpn', name: 'GP del Giappone', circuit: 'Suzukara', nat: 'JPN', w: { aero: 1.35, engine: 0.9, chassis: 1.15 }, wear: 1.2, ovt: 0.35, rain: 0.3, seed: 37, street: 0, figure8: true },
    { id: 'bhr', name: 'GP del Bahrain', circuit: 'Sakhir', nat: 'BHR', w: { aero: 0.9, engine: 1.1, chassis: 1.1 }, wear: 1.35, ovt: 0.75, rain: 0.02, seed: 41, street: 0, night: true },
    { id: 'mia', name: 'GP di Miami', circuit: 'Miami Autodrome', nat: 'USA', w: { aero: 0.95, engine: 1.15, chassis: 1 }, wear: 1.05, ovt: 0.6, rain: 0.25, seed: 53, street: 0.6 },
    { id: 'imo', name: 'GP dell’Emilia', circuit: 'Imola Santerno', nat: 'ITA', w: { aero: 1.1, engine: 1, chassis: 1.1 }, wear: 0.95, ovt: 0.3, rain: 0.3, seed: 61, street: 0 },
    { id: 'mon', name: 'GP di Monaco', circuit: 'Monte Carlo', nat: 'MON', w: { aero: 1.4, engine: 0.5, chassis: 1.4 }, wear: 0.6, ovt: 0.08, rain: 0.15, seed: 71, street: 1 },
    { id: 'esp', name: 'GP di Spagna', circuit: 'Montmeló', nat: 'ESP', w: { aero: 1.3, engine: 0.95, chassis: 1.05 }, wear: 1.25, ovt: 0.4, rain: 0.1, seed: 83, street: 0 },
    { id: 'can', name: 'GP del Canada', circuit: 'Île Notre-Dame', nat: 'CAN', w: { aero: 0.8, engine: 1.3, chassis: 1 }, wear: 0.9, ovt: 0.7, rain: 0.35, seed: 97, street: 0.5 },
    { id: 'gbr', name: 'GP di Gran Bretagna', circuit: 'Silverstone', nat: 'GBR', w: { aero: 1.4, engine: 1, chassis: 0.95 }, wear: 1.3, ovt: 0.6, rain: 0.45, seed: 101, street: 0 },
    { id: 'bel', name: 'GP del Belgio', circuit: 'Spa-Francorchamps', nat: 'BEL', w: { aero: 1, engine: 1.3, chassis: 0.95 }, wear: 1.1, ovt: 0.75, rain: 0.55, seed: 113, street: 0 },
    { id: 'hun', name: 'GP d’Ungheria', circuit: 'Hungaroring', nat: 'HUN', w: { aero: 1.35, engine: 0.75, chassis: 1.25 }, wear: 1.1, ovt: 0.25, rain: 0.2, seed: 127, street: 0 },
    { id: 'ned', name: 'GP d’Olanda', circuit: 'Zandvoort', nat: 'NED', w: { aero: 1.35, engine: 0.85, chassis: 1.15 }, wear: 1.05, ovt: 0.25, rain: 0.35, seed: 131, street: 0 },
    { id: 'ita', name: 'GP d’Italia', circuit: 'Monza', nat: 'ITA', w: { aero: 0.6, engine: 1.6, chassis: 0.9 }, wear: 0.85, ovt: 0.8, rain: 0.2, seed: 149, street: 0 },
    { id: 'sgp', name: 'GP di Singapore', circuit: 'Marina Bay', nat: 'SGP', w: { aero: 1.3, engine: 0.8, chassis: 1.3 }, wear: 1.0, ovt: 0.3, rain: 0.4, seed: 157, street: 1, night: true },
    { id: 'usa', name: 'GP degli Stati Uniti', circuit: 'Circuit of Austin', nat: 'USA', w: { aero: 1.15, engine: 1.05, chassis: 1.05 }, wear: 1.2, ovt: 0.65, rain: 0.15, seed: 167, street: 0 },
    { id: 'bra', name: 'GP del Brasile', circuit: 'Interlagos', nat: 'BRA', w: { aero: 1, engine: 1.1, chassis: 1.05 }, wear: 1.05, ovt: 0.7, rain: 0.45, seed: 173, street: 0 },
    { id: 'abu', name: 'GP di Abu Dhabi', circuit: 'Yas Marina', nat: 'UAE', w: { aero: 1, engine: 1.1, chassis: 1.05 }, wear: 0.95, ovt: 0.55, rain: 0.01, seed: 181, street: 0.2, night: true },
  ],
  endurance: [
    { id: 'qat', name: 'Qatar 1812 km', circuit: 'Lusail', nat: 'QAT', hours: 10, w: { aero: 1.1, engine: 1, efficiency: 1, tyre: 1.2 }, wear: 1.2, ovt: 0.55, rain: 0.02, seed: 201, night: true },
    { id: 'imo', name: '6 Ore di Imola', circuit: 'Imola Santerno', nat: 'ITA', hours: 6, w: { aero: 1.1, engine: 1, efficiency: 1, tyre: 1 }, wear: 1.0, ovt: 0.3, rain: 0.35, seed: 211 },
    { id: 'spa', name: '6 Ore di Spa', circuit: 'Spa-Francorchamps', nat: 'BEL', hours: 6, w: { aero: 0.9, engine: 1.25, efficiency: 1.1, tyre: 1 }, wear: 1.0, ovt: 0.7, rain: 0.55, seed: 223 },
    { id: 'lem', name: '24 Ore della Sarthe', circuit: 'Circuit de la Sarthe', nat: 'FRA', hours: 24, double: true, w: { aero: 0.75, engine: 1.4, efficiency: 1.3, tyre: 1, reliability: 1.5 }, wear: 0.9, ovt: 0.75, rain: 0.35, seed: 233, night: true },
    { id: 'sao', name: '6 Ore di San Paolo', circuit: 'Interlagos', nat: 'BRA', hours: 6, w: { aero: 1, engine: 1.1, efficiency: 1, tyre: 1.05 }, wear: 1.05, ovt: 0.65, rain: 0.45, seed: 241 },
    { id: 'cota', name: 'Lone Star Le Mans', circuit: 'Circuit of Austin', nat: 'USA', hours: 6, w: { aero: 1.15, engine: 1.05, efficiency: 1, tyre: 1.15 }, wear: 1.15, ovt: 0.6, rain: 0.15, seed: 251 },
    { id: 'fuj', name: '6 Ore del Fuji', circuit: 'Fuji Speedway', nat: 'JPN', hours: 6, w: { aero: 0.9, engine: 1.3, efficiency: 1.05, tyre: 1 }, wear: 0.95, ovt: 0.65, rain: 0.4, seed: 263 },
    { id: 'bhr', name: '8 Ore del Bahrain', circuit: 'Sakhir', nat: 'BHR', hours: 8, w: { aero: 0.95, engine: 1.1, efficiency: 1, tyre: 1.3 }, wear: 1.35, ovt: 0.7, rain: 0.02, seed: 271, night: true },
  ],
  rally: [
    { id: 'mc', name: 'Rallye Monte-Carlo', nat: 'MON', surfaces: ['tarmac', 'snow', 'tarmac', 'snow', 'tarmac', 'tarmac'], rain: 0.35, seed: 301 },
    { id: 'swe', name: 'Rally di Svezia', nat: 'SWE', surfaces: ['snow', 'snow', 'snow', 'snow', 'snow', 'snow'], rain: 0.1, seed: 311 },
    { id: 'ken', name: 'Safari Rally Kenya', nat: 'KEN', surfaces: ['rough', 'rough', 'gravel', 'rough', 'rough', 'gravel'], rain: 0.3, seed: 321 },
    { id: 'cro', name: 'Croatia Rally', nat: 'CRO', surfaces: ['tarmac', 'tarmac', 'tarmac', 'tarmac', 'tarmac', 'tarmac'], rain: 0.4, seed: 331 },
    { id: 'por', name: 'Rally de Portugal', nat: 'POR', surfaces: ['gravel', 'gravel', 'gravel', 'gravel', 'gravel', 'gravel'], rain: 0.25, seed: 341 },
    { id: 'ita', name: 'Rally Italia Sardegna', nat: 'ITA', surfaces: ['gravel', 'rough', 'gravel', 'gravel', 'rough', 'gravel'], rain: 0.1, seed: 351 },
    { id: 'gre', name: 'Acropolis Rally', nat: 'GRE', surfaces: ['rough', 'rough', 'rough', 'gravel', 'rough', 'rough'], rain: 0.05, seed: 361 },
    { id: 'fin', name: 'Rally Finland', nat: 'FIN', surfaces: ['gravel', 'gravel', 'gravel', 'gravel', 'gravel', 'gravel'], rain: 0.3, seed: 371, fast: 1.12 },
    { id: 'chi', name: 'Rally Chile', nat: 'CHI', surfaces: ['gravel', 'gravel', 'gravel', 'gravel', 'gravel', 'gravel'], rain: 0.2, seed: 381 },
    { id: 'eur', name: 'Central European Rally', nat: 'GER', surfaces: ['tarmac', 'tarmac', 'tarmac', 'tarmac', 'tarmac', 'tarmac'], rain: 0.5, seed: 391 },
    { id: 'jpn', name: 'Rally Japan', nat: 'JPN', surfaces: ['tarmac', 'tarmac', 'tarmac', 'tarmac', 'tarmac', 'tarmac'], rain: 0.45, seed: 401 },
    { id: 'gbr', name: 'Rally GB Galles', nat: 'GBR', surfaces: ['gravel', 'gravel', 'gravel', 'gravel', 'gravel', 'gravel'], rain: 0.75, seed: 411 },
  ],
};

export const SEASON_LENGTH = {
  formula: { short: 10, normal: 14, full: 18 },
  rally: { short: 7, normal: 10, full: 12 },
  endurance: { short: 6, normal: 8, full: 8 },
};

export const STAGE_NAMES = ['Col de Turini', 'Vargåsen', 'Ouninpohja', 'Monte Lerno', 'Fafe', 'Sweet Lamb', 'Kakaristo', 'Tempio', 'Loutraki', 'Sleeping Warrior', 'Malaga Plateau', 'Hella Vista', 'Isusako', 'Ruuhimäki', 'Ponte Fafe', 'Arganil', 'Hafren', 'Brenig', 'Ratkojärvi', 'Lempää', 'Sisteron', 'La Bollène', 'Panzerplatte', 'Bilstein', 'Lehto', 'Laukaa', 'Mustalampi', 'Pirttiperä', 'Kaitjärvi', 'Rüdesheim', 'Kanpa', 'Nukata', 'Lago Bianco', 'Elinikos', 'Pajares', 'Viscondes', 'Tavara', 'Bosco Selene', 'Kanga', 'Soysambu', 'Hell’s Gate', 'Malè', 'Loukko', 'Kiidjärve', 'Sardinia Coast', 'Grand Duchy', 'Tiergarten', 'Nakatsugawa'];

export const SPONSORS = [
  { name: 'Petronix Oil', tier: 3 }, { name: 'Oraclo Cloud', tier: 3 }, { name: 'Shellgo Energy', tier: 3 }, { name: 'Aramcore', tier: 3 }, { name: 'Rolexa Timepieces', tier: 3 },
  { name: 'Heinekan 0.0', tier: 2 }, { name: 'Visapay', tier: 2 }, { name: 'DHX Logistics', tier: 2 }, { name: 'Pirello Pneumatici', tier: 2 }, { name: 'Santandor Bank', tier: 2 }, { name: 'Lenova Tech', tier: 2 }, { name: 'MoneyGrom', tier: 2 }, { name: 'Crypto.cam', tier: 2 }, { name: 'Bitpanda Exchange', tier: 2 }, { name: 'Castroil Edge', tier: 2 },
  { name: 'Monstro Energy', tier: 1 }, { name: 'Pumo Sportswear', tier: 1 }, { name: 'Kappa Tyres', tier: 1 }, { name: 'Sparco Racewear', tier: 1 }, { name: 'Brembi Freni', tier: 1 }, { name: 'OMZ Gearbox', tier: 1 }, { name: 'Momo Volanti', tier: 1 }, { name: 'Gulfstream Lubricants', tier: 1 }, { name: 'Mapfra Insurance', tier: 1 }, { name: 'Estrella Galicea', tier: 1 }, { name: 'Ray-Bon Eyewear', tier: 1 }, { name: 'Tag Heuerr', tier: 1 }, { name: 'Iveco-Pro Trucks', tier: 1 }, { name: 'Lavazzo Caffè', tier: 1 }, { name: 'Peroni Nastro Blu', tier: 1 },
];
