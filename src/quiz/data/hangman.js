// Impiccato (la mongolfiera): Italian word categories, each word with a short hint. Words are written in
// capitals without accents; spaces and apostrophes are shown from the start.
const W = (s) => s.trim().split('\n').map((l) => { const [w, h] = l.split('|'); return { w: w.trim(), h: h.trim() }; });

export const HANGMAN = [
  { id: 'animali', name: 'Animali', icon: '🦊', words: W(`
    SCOIATTOLO|Ama le ghiande e salta tra i rami
    GIRAFFA|Il collo più lungo della savana
    PINGUINO|Uccello che non vola e nuota nei mari freddi
    TARTARUGA|Si porta la casa sulla schiena
    FARFALLA|Prima era un bruco
    CAMALEONTE|Cambia colore per mimetizzarsi
    RINOCERONTE|Ha uno o due corni sul naso
    CANGURO|Porta i piccoli nel marsupio
    DELFINO|Mammifero marino molto intelligente
    IPPOPOTAMO|Il «cavallo di fiume» africano
    COCCODRILLO|Rettile con fauci potenti, vive nei fiumi
    PAPPAGALLO|Può imitare la voce umana
    LUMACA|Lenta, lascia una scia luccicante
    CAVALLETTA|Insetto saltatore dei prati
    ORNITORINCO|Mammifero con il becco da anatra
    MARMOTTA|Dorme tutto l'inverno in montagna
    ISTRICE|Ha lunghi aculei bianchi e neri
    FENICOTTERO|Uccello rosa che sta su una zampa
    PIPISTRELLO|Vola di notte e si orienta con gli ultrasuoni
    MEDUSA|Animale marino trasparente che può pungere
    STAMBECCO|Capra selvatica delle Alpi con grandi corna
    CICOGNA|Secondo la leggenda porta i bambini
    LIBELLULA|Insetto dalle ali trasparenti che vola sugli stagni
    POLPO|Ha otto tentacoli
  `) },
  { id: 'cibo', name: 'Cucina italiana', icon: '🍝', words: W(`
    LASAGNE|Sfoglie di pasta al forno con ragù e besciamella
    TIRAMISU|Dolce con savoiardi, caffè e mascarpone
    CARBONARA|Pasta con guanciale, uova e pecorino
    ARANCINO|Palla di riso fritta tipica della Sicilia
    PANETTONE|Dolce natalizio milanese
    MOZZARELLA|Formaggio fresco campano, ottimo sulla pizza
    TORTELLINI|Pasta ripiena bolognese da servire in brodo
    PARMIGIANO|Formaggio stagionato, il «re dei formaggi»
    FOCACCIA|Pane piatto e oleoso, vanto di Genova
    RISOTTO|Primo piatto di riso mantecato
    CANNOLO|Cialda siciliana ripiena di ricotta
    BRUSCHETTA|Pane abbrustolito con aglio, olio e pomodoro
    GNOCCHI|Piccoli bocconi di patate e farina
    PESTO|Salsa ligure di basilico e pinoli
    PROSCIUTTO|Salume crudo di Parma o San Daniele
    POLENTA|Piatto di farina di mais
    CASSATA|Dolce siciliano con ricotta e frutta candita
    MINESTRONE|Zuppa con tante verdure
    BISCOTTI|Piccoli dolci secchi da inzuppare
    PIADINA|Sfoglia romagnola da farcire
    GELATO|Dolce freddo da gustare in cono o coppetta
    CAPRESE|Insalata di pomodoro, mozzarella e basilico
    OSSOBUCO|Fetta di stinco di vitello alla milanese
    PANZEROTTO|Fagottino pugliese fritto con pomodoro e mozzarella
  `) },
  { id: 'citta', name: 'Città italiane', icon: '🏛️', words: W(`
    FIRENZE|Città del Duomo di Brunelleschi
    VENEZIA|Città dei canali e delle gondole
    NAPOLI|Città del Vesuvio e della pizza
    PALERMO|Capoluogo della Sicilia
    TORINO|Città della Mole Antonelliana
    BOLOGNA|La «dotta», la «grassa» e la «rossa»
    GENOVA|Città della Lanterna
    VERONA|Città dell'Arena e di Giulietta
    TRIESTE|Città del caffè affacciata sull'Adriatico
    PERUGIA|Capoluogo umbro famoso per il cioccolato
    MATERA|Città dei Sassi
    CAGLIARI|Capoluogo della Sardegna
    LECCE|La «Firenze del Barocco» nel Salento
    BERGAMO|Città alta e città bassa, in Lombardia
    SIENA|Città del Palio in Piazza del Campo
    RAVENNA|Città dei mosaici bizantini
    PISA|Città della torre pendente
    MANTOVA|Città dei Gonzaga circondata dai laghi
    MODENA|Città dell'aceto balsamico e dei motori
    MARANELLO|Casa del cavallino rampante
    AOSTA|Capoluogo della regione più piccola
    ANCONA|Capoluogo delle Marche
    PARMA|Città del prosciutto e del parmigiano
    SIRACUSA|Città di Archimede
  `) },
  { id: 'mestieri', name: 'Mestieri', icon: '🧑‍🔧', words: W(`
    PANETTIERE|Sforna pane ogni mattina presto
    ASTRONAUTA|Lavora nello spazio
    INFERMIERA|Assiste i malati in ospedale
    FALEGNAME|Lavora il legno
    MECCANICO|Ripara le automobili
    GIARDINIERE|Cura piante e aiuole
    VETERINARIO|Il medico degli animali
    POMPIERE|Spegne gli incendi
    ARCHITETTO|Progetta edifici
    MAESTRA|Insegna ai bambini della primaria
    CUOCO|Lavora ai fornelli del ristorante
    POSTINO|Consegna lettere e pacchi
    PESCATORE|Esce in mare con le reti
    FOTOGRAFO|Scatta immagini per lavoro
    PILOTA|Guida aerei o auto da corsa
    MUSICISTA|Suona uno strumento
    FARMACISTA|Vende i medicinali
    GELATAIO|Prepara coni e coppette
    ELETTRICISTA|Si occupa di impianti e prese
    BIBLIOTECARIO|Custodisce e presta i libri
    SARTO|Cuce abiti su misura
    GIORNALISTA|Scrive notizie
    IDRAULICO|Ripara tubi e rubinetti
    CONTADINO|Coltiva i campi
  `) },
  { id: 'sport', name: 'Sport', icon: '⚽', words: W(`
    PALLAVOLO|Sport con rete alta e sei giocatori per squadra
    PALLACANESTRO|Si segna nel canestro
    CICLISMO|Sport del Giro d'Italia
    SCHERMA|Fioretto, spada e sciabola
    NUOTO|Si gareggia in vasca
    RUGBY|Si fa meta con la palla ovale
    TENNIS|Racchetta, rete e set
    ATLETICA|Corsa, salti e lanci
    EQUITAZIONE|Sport a cavallo
    CANOTTAGGIO|Si rema su barche sottili
    GINNASTICA|Trave, corpo libero e anelli
    PUGILATO|Sport con i guantoni
    ARRAMPICATA|Si sale su pareti con prese colorate
    SCI|Si scende sulla neve con due assi
    SURF|Si cavalcano le onde
    GOLF|Mazze e buche
    BADMINTON|Si colpisce un volano con la racchetta
    PALLANUOTO|Si gioca in piscina con la palla
    PATTINAGGIO|Su ghiaccio o a rotelle
    MARATONA|Corsa di oltre quarantadue chilometri
    JUDO|Arte marziale giapponese con il kimono
    VELA|Si naviga con il vento
    BASEBALL|Mazza, guanto e quattro basi
    DECATHLON|Dieci prove di atletica
  `) },
  { id: 'casa', name: 'Oggetti di casa', icon: '🏠', words: W(`
    FRIGORIFERO|Tiene il cibo al fresco
    LAVATRICE|Lava i vestiti
    ASPIRAPOLVERE|Toglie la polvere dai tappeti
    CUSCINO|Ci si appoggia la testa per dormire
    LAMPADARIO|Illumina la stanza dal soffitto
    FORCHETTA|Posata con i rebbi
    CAFFETTIERA|Prepara il caffè sul fuoco
    ARMADIO|Contiene gli abiti
    SCRIVANIA|Tavolo per studiare o lavorare
    TERMOSIFONE|Scalda la casa d'inverno
    OMBRELLO|Ripara dalla pioggia
    SPECCHIO|Riflette la tua immagine
    TAPPETO|Copre il pavimento
    PENTOLA|Ci si cuoce la pasta
    DIVANO|Ci si siede comodi davanti alla TV
    SVEGLIA|Suona al mattino
    BICCHIERE|Ci si versa l'acqua
    GRATTUGIA|Serve per il formaggio
    CASSETTO|Si apre tirandolo dal mobile
    TELECOMANDO|Cambia canale da lontano
    LAVASTOVIGLIE|Lava piatti e bicchieri
    MATTARELLO|Stende la sfoglia
    COPERTA|Tiene caldi a letto
    APPENDIABITI|Ci si appendono le giacche
  `) },
  { id: 'motori', name: 'Motori', icon: '🏎️', words: W(`
    VOLANTE|Si gira per sterzare
    PNEUMATICO|Gomma della ruota
    CAMBIO|Si usa per cambiare marcia
    FRIZIONE|Pedale a sinistra nelle auto manuali
    ALETTONE|Crea deportanza sulle auto da corsa
    BANDIERA|A scacchi alla fine della gara
    PODIO|Dove salgono i primi tre
    BOX|Dove si fanno i pit stop
    MOTORE|Il cuore dell'automobile
    CARBURATORE|Mescolava aria e benzina nei vecchi motori
    SORPASSO|Superare un avversario
    RETTILINEO|Tratto di pista senza curve
    CHICANE|Curva a esse per rallentare
    CASCO|Protegge la testa del pilota
    MONOPOSTO|Auto da corsa con un solo posto
    QUALIFICA|Decide la griglia di partenza
    RALLY|Gare su strade sterrate e prove speciali
    NAVIGATORE|Legge le note nei rally
    SCUDERIA|Squadra corse
    TURBO|Comprime l'aria per più potenza
    MOTOCICLETTA|Due ruote a motore
    CRONOMETRO|Misura i tempi sul giro
    POLE POSITION|Primo posto in griglia
    SAFETY CAR|Entra in pista in caso di pericolo
  `) },
  { id: 'natura', name: 'Natura', icon: '🌳', words: W(`
    ARCOBALENO|Appare dopo la pioggia con il sole
    VULCANO|Montagna che può eruttare lava
    CASCATA|Acqua che precipita da un salto
    GHIACCIAIO|Fiume di ghiaccio in alta montagna
    FORESTA|Grande distesa di alberi
    DESERTO|Luogo arido con dune di sabbia
    TEMPORALE|Pioggia con tuoni e fulmini
    MARGHERITA|Fiore bianco con il centro giallo
    GIRASOLE|Fiore che segue il sole
    ARCIPELAGO|Gruppo di isole
    PENISOLA|Terra circondata dal mare su tre lati
    QUERCIA|Albero delle ghiande
    TRAMONTO|Il sole cala all'orizzonte
    CONCHIGLIA|La trovi sulla spiaggia
    BOSCO|Più piccolo di una foresta
    COLLINA|Più bassa di una montagna
    NEBBIA|Fa sparire il paesaggio in pianura
    CORALLO|Forma barriere nei mari caldi
    LAGUNA|Specchio d'acqua salata vicino alla costa
    AURORA|Luce del primo mattino, o boreale ai poli
    SORGENTE|Il punto dove nasce un fiume
    GROTTA|Cavità nella roccia
    UNIVERSO|Comprende tutte le galassie
    COMETA|Ha una lunga coda luminosa
  `) },
];
