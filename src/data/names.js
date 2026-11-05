// Name pools per nationality for generated rookies & free agents
export const NAME_POOLS = {
  ITA: { f: ['Luca', 'Matteo', 'Gabriele', 'Leonardo', 'Andrea', 'Tommaso', 'Riccardo', 'Lorenzo', 'Davide', 'Nicola', 'Federico', 'Alessio'], l: ['Rossetti', 'Fumagalli', 'Bertolini', 'Marchetti', 'Ghiotti', 'Ferrucci', 'Minardi', 'Zanardini', 'Pirola', 'Carboni', 'Santini', 'Vitali'] },
  GBR: { f: ['Oliver', 'Harry', 'Jack', 'Charlie', 'George', 'Arthur', 'Freddie', 'Alfie', 'Theo', 'Archie', 'Callum', 'Jamie'], l: ['Hartley', 'Brookes', 'Fenwick', 'Ashdown', 'Whitmore', 'Pemberton', 'Kingsley', 'Holloway', 'Radcliffe', 'Thornton', 'Mallory', 'Grainger'] },
  GER: { f: ['Lukas', 'Felix', 'Jonas', 'Maximilian', 'Leon', 'Niklas', 'Tim', 'David', 'Moritz', 'Paul'], l: ['Brenner', 'Kessler', 'Wagner', 'Fischbach', 'Lindemann', 'Hoffer', 'Vogt', 'Krämer', 'Steiner', 'Baumann'] },
  FRA: { f: ['Théo', 'Hugo', 'Victor', 'Arthur', 'Raphaël', 'Louis', 'Enzo', 'Sacha', 'Nathan', 'Gabin'], l: ['Lemaître', 'Fournier', 'Delacroix', 'Moreau', 'Chevalier', 'Rousseau', 'Gauthier', 'Marchand', 'Leroux', 'Blanchard'] },
  ESP: { f: ['Pablo', 'Alejandro', 'Daniel', 'Hugo', 'Álvaro', 'Mario', 'Iker', 'Marcos'], l: ['Navarro', 'Ortega', 'Delgado', 'Castillo', 'Romero', 'Iglesias', 'Montoya', 'Serrano'] },
  NED: { f: ['Daan', 'Sem', 'Lucas', 'Milan', 'Thijs', 'Jesse'], l: ['de Vries-Bakker', 'van Leeuwen', 'Janssen', 'Visser', 'de Groot', 'Mulder'] },
  FIN: { f: ['Eetu', 'Onni', 'Lauri', 'Joonas', 'Aleksi', 'Niko', 'Teemu'], l: ['Virtanen', 'Lehtinen', 'Mäkelä', 'Korhonen', 'Heikkinen', 'Salonen', 'Laaksonen'] },
  BRA: { f: ['Pedro', 'Enzo', 'Gustavo', 'Rafael', 'Felipe', 'Caio'], l: ['Fittipaldo', 'Barrichetto', 'Nascimento', 'Moraes', 'Teixeira', 'Carvalho'] },
  USA: { f: ['Logan', 'Colton', 'Josef', 'Tyler', 'Jake', 'Ryan'], l: ['Herta-Hale', 'Sargeantson', 'Rossi-Marsh', 'Daly', 'Kirkwood', 'McLaughlin-Reed'] },
  JPN: { f: ['Yuki', 'Ren', 'Kaito', 'Sota', 'Haruto', 'Ritomo'], l: ['Tsunoka', 'Iwasawa', 'Miyata', 'Hirakawa', 'Sato', 'Nojiri'] },
  AUS: { f: ['Jack', 'Cooper', 'Mitch', 'Hunter', 'Lachlan'], l: ['Doohanson', 'Ricciard', 'Webberley', 'Brabham-Lee', 'Evans'] },
  SWE: { f: ['Elias', 'Hugo', 'Oskar', 'William'], l: ['Lindqvist', 'Ekström', 'Holm', 'Sundberg'] },
  MEX: { f: ['Santiago', 'Diego', 'Emiliano', 'Patricio'], l: ['Gutiérrez', 'Rodríguez-Paz', 'Salazar', 'Esquivel'] },
  ARG: { f: ['Tomás', 'Joaquín', 'Facundo', 'Nicolás'], l: ['Fangio-Ruiz', 'Reutemann', 'Pechito', 'Larralde'] },
  BEL: { f: ['Arthur', 'Noah', 'Jules', 'Louis'], l: ['Vanderbeke', 'Lambrecht', 'Peeters', 'Dumont'] },
  EST: { f: ['Karl', 'Robert', 'Georg', 'Rasmus'], l: ['Virves', 'Linnamäe', 'Kask', 'Tamm'] },
  NZL: { f: ['Liam', 'Marcus', 'Hayden', 'Nick'], l: ['Armstrong-Bay', 'Cassidy', 'Paddon', 'Hunter'] },
  CAN: { f: ['Liam', 'Nicholas', 'Devlin', 'Robert'], l: ['Latifi-Ross', 'Wickens', 'Tremblay', 'Gagnon'] },
  POL: { f: ['Jakub', 'Kacper', 'Mikołaj'], l: ['Kowalski', 'Nowak', 'Wiśniewski'] },
  CHN: { f: ['Guanyu', 'Yifei', 'Hao'], l: ['Zhou-Lin', 'Ye', 'Wang'] },
  IND: { f: ['Kush', 'Jehan', 'Arjun'], l: ['Mainisha', 'Daruvala', 'Sharma'] },
  DEN: { f: ['Frederik', 'Oliver', 'Christian'], l: ['Vesti-Holm', 'Rasmussen', 'Lund'] },
};
export const NATS = Object.keys(NAME_POOLS);

// Simple flag definitions: [orientation, colors...]  h = horizontal stripes, v = vertical stripes
export const FLAGS = {
  ITA: ['v', '#009246', '#ffffff', '#ce2b37'], FRA: ['v', '#0055a4', '#ffffff', '#ef4135'], BEL: ['v', '#111111', '#fdda24', '#ef3340'],
  GER: ['h', '#111111', '#dd0000', '#ffce00'], NED: ['h', '#ae1c28', '#ffffff', '#21468b'], ESP: ['h', '#aa151b', '#f1bf00', '#f1bf00', '#aa151b'],
  MON: ['h', '#ce1126', '#ffffff'], POL: ['h', '#ffffff', '#dc143c'], EST: ['h', '#0072ce', '#000000', '#ffffff'], LUX: ['h', '#ed2939', '#ffffff', '#00a1de'],
  AUT: ['h', '#ed2939', '#ffffff', '#ed2939'], MEX: ['v', '#006847', '#ffffff', '#ce1126'], IRL: ['v', '#169b62', '#ffffff', '#ff883e'],
  ARG: ['h', '#74acdf', '#ffffff', '#74acdf'], THA: ['h', '#a51931', '#f4f5f8', '#2d2a4a', '#2d2a4a', '#f4f5f8', '#a51931'],
  RSA: ['h', '#de3831', '#ffffff', '#007a4d', '#ffffff', '#002395'], CZE: ['h', '#ffffff', '#d7141a'], CHN: ['h', '#de2910'], JPN: ['c', '#ffffff', '#bc002d'],
  CAN: ['v', '#d52b1e', '#ffffff', '#ffffff', '#d52b1e'], BRA: ['d', '#009c3b', '#ffdf00', '#002776'], USA: ['us'], GBR: ['uk'], AUS: ['au'], NZL: ['au'],
  FIN: ['x', '#ffffff', '#002f6c'], SWE: ['x', '#006aa7', '#fecc00'], DEN: ['x', '#c8102e', '#ffffff'], SUI: ['sw'], IND: ['h', '#ff9933', '#ffffff', '#138808'],
  BHR: ['v', '#ffffff', '#ce1126', '#ce1126'], KSA: ['h', '#006c35'], UAE: ['h', '#00732f', '#ffffff', '#000000'], AZE: ['h', '#0092bc', '#e4002b', '#00af66'],
  SGP: ['h', '#ef3340', '#ffffff'], QAT: ['v', '#ffffff', '#8a1538', '#8a1538', '#8a1538'], HUN: ['h', '#ce2939', '#ffffff', '#477050'], KEN: ['h', '#000000', '#bb0000', '#006600'],
  POR: ['v', '#006600', '#ff0000', '#ff0000'], GRE: ['h', '#0d5eaf', '#ffffff', '#0d5eaf', '#ffffff', '#0d5eaf'], CRO: ['h', '#ff0000', '#ffffff', '#171796'], CHI: ['h', '#ffffff', '#d52b1e'],
  LAT: ['h', '#9e3039', '#ffffff', '#9e3039'], EUR: ['h', '#003399'],
};
