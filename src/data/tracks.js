// Calendars. Circuit tracks: w = performance weights per part, wear = tyre wear, ovt = overtaking ease (0-1), rain = rain chance
export const TRACKS = {
  formula: [
    { id: 'aus', cid: 'aus', name: 'GP d’Australia', circuit: 'Albert Park', nat: 'AUS', lap: 75.1, laps: 58, pit: 19, wear: 0.9, ovt: 0.5, rain: 0.2, street: 0.5, seed: 101 },
    { id: 'chn', cid: 'chn', name: 'GP di Cina', circuit: 'Shanghai International', nat: 'CHN', lap: 90.6, laps: 56, pit: 23, wear: 1.15, ovt: 0.7, rain: 0.25, street: 0, seed: 114 },
    { id: 'jpn', cid: 'jpn', name: 'GP del Giappone', circuit: 'Suzuka', nat: 'JPN', lap: 86.9, laps: 53, pit: 22, wear: 1.25, ovt: 0.35, rain: 0.3, street: 0, seed: 127 },
    { id: 'bhr', cid: 'bhr', name: 'GP del Bahrain', circuit: 'Sakhir', nat: 'BHR', lap: 89.8, laps: 57, pit: 23, wear: 1.4, ovt: 0.75, rain: 0.02, street: 0, seed: 140, night: true },
    { id: 'ksa', cid: 'ksa', name: 'GP dell’Arabia Saudita', circuit: 'Jeddah Corniche', nat: 'KSA', lap: 87.3, laps: 50, pit: 20, wear: 0.8, ovt: 0.6, rain: 0.02, street: 0.8, seed: 153, night: true },
    { id: 'mia', cid: 'mia', name: 'GP di Miami', circuit: 'Miami Autodrome', nat: 'USA', lap: 86.2, laps: 57, pit: 21, wear: 1.0, ovt: 0.55, rain: 0.3, street: 0.6, seed: 166 },
    { id: 'can', cid: 'can', name: 'GP del Canada', circuit: 'Gilles-Villeneuve', nat: 'CAN', lap: 71.0, laps: 70, pit: 18, wear: 0.95, ovt: 0.7, rain: 0.35, street: 0.5, seed: 179 },
    { id: 'mon', cid: 'mon', name: 'GP di Monaco', circuit: 'Monte Carlo', nat: 'MON', lap: 69.9, laps: 78, pit: 19, wear: 0.55, ovt: 0.06, rain: 0.15, street: 1, seed: 192 },
    { id: 'esp', cid: 'esp', name: 'GP di Spagna', circuit: 'Barcellona-Catalunya', nat: 'ESP', lap: 71.5, laps: 66, pit: 22, wear: 1.3, ovt: 0.4, rain: 0.1, street: 0, seed: 205 },
    { id: 'aut', cid: 'aut', name: 'GP d’Austria', circuit: 'Red Bull Ring', nat: 'AUT', lap: 64.0, laps: 71, pit: 20, wear: 1.1, ovt: 0.7, rain: 0.3, street: 0, seed: 218 },
    { id: 'gbr', cid: 'gbr', name: 'GP di Gran Bretagna', circuit: 'Silverstone', nat: 'GBR', lap: 84.4, laps: 52, pit: 20, wear: 1.35, ovt: 0.6, rain: 0.45, street: 0, seed: 231 },
    { id: 'bel', cid: 'bel', name: 'GP del Belgio', circuit: 'Spa-Francorchamps', nat: 'BEL', lap: 100.6, laps: 44, pit: 21, wear: 1.15, ovt: 0.75, rain: 0.55, street: 0, seed: 244 },
    { id: 'hun', cid: 'hun', name: 'GP d’Ungheria', circuit: 'Hungaroring', nat: 'HUN', lap: 75.4, laps: 70, pit: 21, wear: 1.15, ovt: 0.25, rain: 0.2, street: 0, seed: 257 },
    { id: 'ned', cid: 'ned', name: 'GP d’Olanda', circuit: 'Zandvoort', nat: 'NED', lap: 68.7, laps: 72, pit: 22, wear: 1.1, ovt: 0.2, rain: 0.35, street: 0, seed: 270 },
    { id: 'ita', cid: 'ita', name: 'GP d’Italia', circuit: 'Monza', nat: 'ITA', lap: 78.8, laps: 53, pit: 24, wear: 0.8, ovt: 0.8, rain: 0.2, street: 0, seed: 283 },
    { id: 'mad', cid: 'mad', name: 'GP di Madrid', circuit: 'Madring', nat: 'ESP', lap: 88.0, laps: 57, pit: 21, wear: 1.0, ovt: 0.5, rain: 0.15, street: 0.5, seed: 296 },
    { id: 'aze', cid: 'aze', name: 'GP dell’Azerbaigian', circuit: 'Baku City', nat: 'AZE', lap: 101.1, laps: 51, pit: 20, wear: 0.75, ovt: 0.75, rain: 0.1, street: 1, seed: 309 },
    { id: 'sgp', cid: 'sgp', name: 'GP di Singapore', circuit: 'Marina Bay', nat: 'SGP', lap: 89.5, laps: 62, pit: 28, wear: 1.0, ovt: 0.3, rain: 0.4, street: 1, seed: 322, night: true },
    { id: 'usa', cid: 'usa', name: 'GP degli Stati Uniti', circuit: 'Circuit of the Americas', nat: 'USA', lap: 92.5, laps: 56, pit: 21, wear: 1.2, ovt: 0.65, rain: 0.15, street: 0, seed: 335 },
    { id: 'mex', cid: 'mex', name: 'GP del Messico', circuit: 'Hermanos Rodríguez', nat: 'MEX', lap: 75.6, laps: 71, pit: 22, wear: 0.85, ovt: 0.6, rain: 0.1, street: 0, seed: 348 },
    { id: 'bra', cid: 'bra', name: 'GP del Brasile', circuit: 'Interlagos', nat: 'BRA', lap: 69.5, laps: 71, pit: 21, wear: 1.05, ovt: 0.7, rain: 0.45, street: 0, seed: 361 },
    { id: 'lvg', cid: 'lvg', name: 'GP di Las Vegas', circuit: 'Las Vegas Strip', nat: 'USA', lap: 92.7, laps: 50, pit: 20, wear: 0.7, ovt: 0.75, rain: 0.03, street: 1, seed: 374, night: true },
    { id: 'qat', cid: 'qat', name: 'GP del Qatar', circuit: 'Lusail', nat: 'QAT', lap: 79.4, laps: 57, pit: 25, wear: 1.5, ovt: 0.5, rain: 0.02, street: 0, seed: 387, night: true },
    { id: 'abu', cid: 'abu', name: 'GP di Abu Dhabi', circuit: 'Yas Marina', nat: 'UAE', lap: 82.2, laps: 58, pit: 21, wear: 0.95, ovt: 0.55, rain: 0.01, street: 0.2, seed: 400, night: true },
  ],
  endurance: [
    { id: 'qat', cid: 'qat', name: 'Qatar 1812 km', circuit: 'Lusail', nat: 'QAT', lap: 99.5, hours: 10, pit: 32, wear: 1.2, ovt: 0.55, rain: 0.02, seed: 201, night: true },
    { id: 'imo', cid: 'imo', name: '6 Ore di Imola', circuit: 'Imola Santerno', nat: 'ITA', lap: 91.3, hours: 6, pit: 32, wear: 1.0, ovt: 0.3, rain: 0.35, seed: 212 },
    { id: 'spa', cid: 'bel', name: '6 Ore di Spa', circuit: 'Spa-Francorchamps', nat: 'BEL', lap: 123.0, hours: 6, pit: 32, wear: 1.0, ovt: 0.7, rain: 0.55, seed: 223 },
    { id: 'lem', cid: 'lem', name: '24 Ore della Sarthe', circuit: 'Circuit de la Sarthe', nat: 'FRA', lap: 204.0, hours: 24, pit: 32, wear: 0.9, ovt: 0.75, rain: 0.35, seed: 234, night: true, double: true },
    { id: 'sao', cid: 'bra', name: '6 Ore di San Paolo', circuit: 'Interlagos', nat: 'BRA', lap: 83.5, hours: 6, pit: 32, wear: 1.05, ovt: 0.65, rain: 0.45, seed: 245 },
    { id: 'cota', cid: 'usa', name: 'Lone Star Le Mans', circuit: 'Circuit of the Americas', nat: 'USA', lap: 107.0, hours: 6, pit: 32, wear: 1.15, ovt: 0.6, rain: 0.15, seed: 256 },
    { id: 'fuj', cid: 'fuj', name: '6 Ore del Fuji', circuit: 'Fuji Speedway', nat: 'JPN', lap: 88.0, hours: 6, pit: 32, wear: 0.95, ovt: 0.65, rain: 0.4, seed: 267 },
    { id: 'bhr', cid: 'bhr', name: '8 Ore del Bahrain', circuit: 'Sakhir', nat: 'BHR', lap: 106.0, hours: 8, pit: 32, wear: 1.35, ovt: 0.7, rain: 0.02, seed: 278, night: true },
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
  formula: { short: 10, normal: 16, full: 24 },
  rally: { short: 7, normal: 10, full: 12 },
  endurance: { short: 6, normal: 8, full: 8 },
};

export const STAGE_NAMES = ['Col de Turini', 'Vargåsen', 'Ouninpohja', 'Monte Lerno', 'Fafe', 'Sweet Lamb', 'Kakaristo', 'Tempio', 'Loutraki', 'Sleeping Warrior', 'Malaga Plateau', 'Hella Vista', 'Isusako', 'Ruuhimäki', 'Ponte Fafe', 'Arganil', 'Hafren', 'Brenig', 'Ratkojärvi', 'Lempää', 'Sisteron', 'La Bollène', 'Panzerplatte', 'Bilstein', 'Lehto', 'Laukaa', 'Mustalampi', 'Pirttiperä', 'Kaitjärvi', 'Rüdesheim', 'Kanpa', 'Nukata', 'Lago Bianco', 'Elinikos', 'Pajares', 'Viscondes', 'Tavara', 'Bosco Selene', 'Kanga', 'Soysambu', 'Hell’s Gate', 'Malè', 'Loukko', 'Kiidjärve', 'Sardinia Coast', 'Grand Duchy', 'Tiergarten', 'Nakatsugawa'];

export const SPONSORS = [
  { name: 'Petronix Oil', tier: 3 }, { name: 'Oraclo Cloud', tier: 3 }, { name: 'Shellgo Energy', tier: 3 }, { name: 'Aramcore', tier: 3 }, { name: 'Rolexa Timepieces', tier: 3 },
  { name: 'Heinekan 0.0', tier: 2 }, { name: 'Visapay', tier: 2 }, { name: 'DHX Logistics', tier: 2 }, { name: 'Pirello Pneumatici', tier: 2 }, { name: 'Santandor Bank', tier: 2 }, { name: 'Lenova Tech', tier: 2 }, { name: 'MoneyGrom', tier: 2 }, { name: 'Crypto.cam', tier: 2 }, { name: 'Bitpanda Exchange', tier: 2 }, { name: 'Castroil Edge', tier: 2 },
  { name: 'Monstro Energy', tier: 1 }, { name: 'Pumo Sportswear', tier: 1 }, { name: 'Kappa Tyres', tier: 1 }, { name: 'Sparco Racewear', tier: 1 }, { name: 'Brembi Freni', tier: 1 }, { name: 'OMZ Gearbox', tier: 1 }, { name: 'Momo Volanti', tier: 1 }, { name: 'Gulfstream Lubricants', tier: 1 }, { name: 'Mapfra Insurance', tier: 1 }, { name: 'Estrella Galicea', tier: 1 }, { name: 'Ray-Bon Eyewear', tier: 1 }, { name: 'Tag Heuerr', tier: 1 }, { name: 'Iveco-Pro Trucks', tier: 1 }, { name: 'Lavazzo Caffè', tier: 1 }, { name: 'Peroni Nastro Blu', tier: 1 },
];
