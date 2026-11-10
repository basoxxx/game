// "Come si gioca": an illustrated, chaptered guide (menu, top bar, F1)
import { App, registerScreen } from '../app.js';
import { icon } from '../ui/icons.js';
import { carSVG, trackSVG, categoryArt } from '../ui/art.js';
import { circuitPath, genStage } from '../ui/trackview.js';
import { esc, pageHead } from '../ui/dom.js';
import { S } from '../engine/state.js';
import { COMPOUNDS } from '../data/categories.js';
import { openLessons } from './engineer.js';
import { startTour, TOURS, resetTips } from '../ui/tour.js';
import { sfx } from '../ui/audio.js';

let chapter = 'basi';
const tyre = (c) => { const C = COMPOUNDS[c]; return `<span class="ht-tyre" style="--c:${C.color}"><b>${C.short}</b></span>`; };
const kb = (k) => k.split(' ').map((x) => `<span class="kbd">${x}</span>`).join(' ');

const CH = [
  { id: 'basi', icon: 'flag', name: 'Il tuo ruolo', render: () => `
    <p class="ht-lead">In <b>Apex Dynasty</b> sei il <b>Team Principal</b>: guidi una squadra di Formula, Rally o Endurance stagione dopo stagione. Costruisci la macchina, scegli i piloti, firma gli sponsor e prendi le decisioni che vincono le gare.</p>
    <div class="ht-modes">
      ${[['formula', 'Carriera', 'Il cuore del gioco: stagioni complete, mercato, sviluppo, consiglio d’amministrazione e offerte da altre categorie.', 'newgame'], ['endurance', 'Gara rapida', 'Un singolo weekend con qualsiasi squadra e pista. Perfetto per imparare la strategia.', 'quickrace'], ['rally', 'Sfide', 'Scenari con un obiettivo preciso e medaglie da conquistare.', 'challenges']].map(([c, n, d, to]) => `<div class="ht-mode" data-a="nav" data-to="${to}"><div class="ht-art">${categoryArt(c)}</div><b>${n}</b><span>${d}</span></div>`).join('')}
      <div class="ht-mode derby" data-a="nav" data-to="derby"><div class="ht-art">${carSVG('rally', { primary: '#ffd23f', secondary: '#1a1a1a', accent: '#e5141b', pattern: 4, number: 13 }, { sponsor: 'Scontro' })}</div><b>Scontro Totale</b><span>Qui guidi tu: corse a contatto, salti e derby della distruzione.</span></div>
    </div>
    <div class="ht-note">${icon('bulb')}<div><b>Non serve conoscere il motorsport.</b> Ogni schermata ha suggerimenti (passa il mouse sui valori), l’ingegnere ti dà consigli al primo utilizzo e l’<b>Accademia Ingegneri</b> spiega gomme, strategia e assetto con lezioni interattive.</div></div>` },
  { id: 'sede', icon: 'home', name: 'La sede: decisioni e Da fare', render: () => `
    <p class="ht-lead">La <b>Panoramica</b> è il tuo ufficio. Tutto ciò che chiede una tua scelta passa da qui: non devi cercarlo nei menu.</p>
    <div class="ht-cards">
      <div class="ht-card"><span class="ht-ic">${icon('check')}</span><b>Da fare</b><p>Sedili vuoti, sponsor da firmare, slot R&amp;D fermi, promesse al consiglio in scadenza: la lista si ordina da sola per urgenza e ogni voce ti porta <b>dritto alla schermata giusta</b>.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('board')}</span><b>Decisioni</b><p>Proposte tecniche, eventi del paddock e richieste del consiglio compaiono all’apertura della Panoramica. Ogni opzione mostra il suo effetto: <b>nessuna è gratis</b>, scegli in base al mandato.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('bell')}</span><b>Badge nel menu</b><p>Il numerino accanto a una sezione dice quante cose ti aspettano lì. <b>Rosso</b> urgente, <b>giallo</b> da sistemare, <b>verde</b> un’opportunità.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('compass')}</span><b>Vai a…</b><p>${kb('Ctrl K')} apre la ricerca: scrivi il nome di una schermata o di una sezione (anche «regolamento», «accademia», «commissione») e premi ${kb('Invio')}. ${kb('Backspace')} torna indietro.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('tyre')}</span><b>Stato delle gomme</b><p>Ogni set ha una storia: <b>nuovo</b> o <b>usato</b> (con i giri già fatti). In gara compaiono <b>graining</b> e <b>blistering</b> se spingi fuori dalla finestra giusta: alza o abbassa il ritmo prima che il degrado esploda.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('rules')}</span><b>Regolamento</b><p>Nel <b>Centro Tecnico → Regolamento &amp; PU</b> vedi le regole in vigore, il prossimo cambio d’era e i contratti motore. Nel <b>Paddock → Commissione</b> si votano le modifiche.</p></div>
    </div>
    <div class="ht-note">${icon('bulb')}<div><b>Il primo quarto d’ora:</b> firma tre sponsor, avvia due progetti R&amp;D, controlla i piloti, poi vai al weekend. Le prime prove libere servono a imparare: ascolta il pilota e prova un assetto alla volta.</div></div>` },
  { id: 'settimana', icon: 'calendar', name: 'La settimana tipo', render: () => `
    <p class="ht-lead">Ogni round del calendario è una settimana. Tra un weekend e l’altro lavori in fabbrica: bastano pochi minuti, poi si corre.</p>
    <ol class="ht-steps">
      ${[['mail', 'Leggi la posta', 'Offerte, richieste dei piloti, eventi della squadra. Alcune email chiedono una decisione.'], ['car', 'Sviluppa la vettura', 'Nel <b>Centro Tecnico</b> avvia progetti R&amp;D: motore per le piste veloci, carico aerodinamico per quelle tortuose. Ogni progetto ha costi, tempi e rischi.'], ['money', 'Firma gli sponsor', 'Gli sponsor pagano a ogni evento e chiedono obiettivi. Più risultati fai, migliori le offerte.'], ['users', 'Gestisci i piloti', 'Morale e forma contano in pista. Rinnova i contratti in tempo e guarda il <b>Mercato</b>.'], ['flag', 'Vai al weekend', 'Premi <b>Weekend di Gara</b> (o ' + kb('Invio') + '). Dopo la gara ricevi punti, premi, XP manager e la valutazione del consiglio.']].map(([ic, t, d], i) => `<li><span class="ht-n">${i + 1}</span><span class="ht-ic">${icon(ic)}</span><div><b>${t}</b><p>${d}</p></div></li>`).join('')}
    </ol>
    <div class="ht-note">${icon('target')}<div><b>Obiettivo stagionale:</b> il consiglio fissa una posizione nel campionato costruttori. Se la <b>fiducia</b> crolla rischi il licenziamento; se la superi arrivano budget e offerte migliori.</div></div>` },
  { id: 'weekend', icon: 'chequered', name: 'Il weekend di gara', render: () => {
    let tr = ''; try { tr = trackSVG(circuitPath('bel'), { w: 360, h: 220, glow: '#e5141b', width: 4 }); } catch {}
    return `<div class="ht-split"><div>
      <p class="ht-lead">Un weekend si gioca in tre fasi. Puoi seguire tutto dal vivo in 3D o sulla mappa, oppure simulare le sessioni e concentrarti sulle scelte.</p>
      <div class="ht-phases">
        <div><span class="ht-ph">1</span><b>Prove libere</b><p>Prova gli assetti e <b>ascolta il pilota</b>: ti dice se la macchina sottosterza, sovrasterza o è lenta in rettilineo. Un buon assetto vale decimi su ogni giro. Fai un <b>long run</b> per misurare il degrado gomme.</p></div>
        <div><span class="ht-ph">2</span><b>Qualifiche</b><p>Decidi quando uscire e con quale gomma. La posizione in griglia conta, soprattutto sulle piste dove è difficile sorpassare.</p></div>
        <div><span class="ht-ph">3</span><b>Strategia e gara</b><p>Con il <b>pianificatore</b> scegli quante soste, le mescole e il giro del box: il gioco ti mostra il tempo previsto di ogni piano. Poi la gara, dove la strategia si adatta a quello che succede.</p></div>
      </div></div><div class="ht-track">${tr}<div class="ht-cap">Spa-Francorchamps · settori e zone DRS sulla mappa di gara</div></div></div>` } },
  { id: 'gara', icon: 'steering', name: 'Decidere in gara', render: () => `
    <p class="ht-lead">In gara non guidi: <b>comandi dal muretto</b>. Le tue scelte decidono il risultato quanto la velocità della macchina.</p>
    <div class="ht-cards">
      <div class="ht-card"><span class="ht-ic">${icon('speed')}</span><b>Ritmo</b><p><b>Spingi</b> per attaccare o difenderti, <b>Normale</b> per gestire, <b>Risparmia</b> per allungare lo stint. Spingere consuma gomme, carburante e motore.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('tyre')}</span><b>Gomme</b><p>${tyre('soft')} veloce ma dura poco · ${tyre('medium')} equilibrata · ${tyre('hard')} lenta ma resistente. Con la pioggia: ${tyre('inter')} e ${tyre('wet')}.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('pit')}</span><b>Pit stop</b><p>Chiama il box al momento giusto: in regime di <b>safety car</b> una sosta costa molto meno. Occhio al traffico all’uscita.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('rain')}</span><b>Meteo</b><p>Il radar ti avvisa della pioggia. Cambiare gomme un giro prima degli altri può valere molte posizioni.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('radio')}</span><b>Radio e momenti chiave</b><p>Il pilota chiede, l’ingegnere suggerisce: rispondi e scegli nei <b>momenti decisivi</b> con ${kb('1')} ${kb('2')} ${kb('3')}.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('ff')}</span><b>Tempo</b><p>${kb('Spazio')} pausa · ${kb('1')}…${kb('6')} velocità da 1x a 32x. Rallenta nei momenti caldi, accelera quando la gara è stabile.</p></div>
    </div>` },
  { id: 'altre', icon: 'map', name: 'Rally ed Endurance', render: () => {
    let st = ''; try { st = trackSVG(genStage(42, 'twisty'), { w: 320, h: 170, glow: '#c98a3a', color: '#f0d9b5', width: 4 }); } catch {}
    return `<div class="ht-split"><div class="ht-cards two">
      <div class="ht-card"><span class="ht-ic">${icon('map')}</span><b>Rally</b><p>Una serie di <b>prove speciali</b> a cronometro. Per ogni prova scegli gomme e ritmo in base alla superficie (asfalto, sterrato, neve). Il copilota ti chiede decisioni dal vivo e al <b>parco assistenza</b> hai un tempo limitato per riparare.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('hourglass')}</span><b>Endurance</b><p>Gare lunghe con <b>equipaggi</b> di più piloti: gestisci cambi pilota, carburante e gomme a ogni sosta, notte e meteo variabile. L’affidabilità vale quanto la velocità.</p></div>
    </div><div class="ht-track">${st}<div class="ht-cap">Prova speciale · partenza in verde, arrivo in bianco</div></div></div>` } },
  { id: 'derby', icon: 'burst', name: 'Scontro Totale', render: () => `
    <p class="ht-lead">La modalità arcade: <b>guidi tu</b> vecchie berline, muscle car e utilitarie in arene piene di rampe e ostacoli. Vinci la corsa o resta l’ultimo in movimento.</p>
    <div class="ht-keys">
      ${[['W S', 'Gas e freno', 'RT LT'], ['A D', 'Sterzo', 'Stick sinistro'], ['Spazio', 'Freno a mano', 'B'], ['Shift', 'Nitro', 'A'], ['C', 'Cambia camera', 'X'], ['Q', 'Guarda dietro', 'LB'], ['T', 'Ricomincia', 'Back'], ['Esc', 'Pausa', 'Start']].map(([k, d, p]) => `<div><span>${kb(k)}</span><b>${d}</b><span class="pad-btn">${p}</span></div>`).join('')}
    </div>
    <div class="ht-note">${icon('shield')}<div><b>Danni realistici:</b> ogni colpo deforma la carrozzeria e riduce la salute. Colpisci gli altri di lato, proteggi il muso.</div></div>` },
  { id: 'dinastia', icon: 'trophy', name: 'La carriera lunga', render: () => `
    <p class="ht-lead">Dopo le prime stagioni il gioco cambia passo: non basta più avere la macchina migliore, bisogna <b>restare</b> in alto mentre il mondo si muove.</p>
    <div class="ht-cards two">
      <div class="ht-card"><span class="ht-ic">${icon('rules')}</span><b>Ere regolamentari</b><p>Ogni 3–5 stagioni la Federazione riscrive le regole e gran parte dei valori in pista si azzera. Il cambio è annunciato un anno prima: dal <b>Centro Tecnico → Regolamento &amp; PU</b> decidi quanto presto spostare la fabbrica sul nuovo progetto. Presto = meno punti oggi, partenza forte domani.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('factory')}</span><b>Base tecnica</b><p>Ogni inverno la vettura torna verso il livello della tua struttura (budget, Fabbrica, Galleria, Simulatore, Direttore Tecnico), e i rivali copiano metà del vantaggio del leader. Lo sviluppo vince una stagione, le strutture vincono un ciclo.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('wind')}</span><b>Correlazione e pacchetti</b><p>La galleria promette, la pista decide: con una correlazione bassa i pezzi rendono meno del previsto. Un pacchetto fallito si può ritirare o tenere in macchina un evento per capirlo. Il motore è omologato: i gettoni limitano quanto puoi svilupparlo in stagione.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('users')}</span><b>Commissione</b><p>Due voti a stagione su budget cap, galleria del vento, montepremi e calendario delle regole. Ogni squadra vota per interesse: i buoni rapporti con i team principal diventano voti quando fai lobby. Puoi delegare il voto dal Paddock.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('driver')}</span><b>Persone</b><p>I piloti hanno una forma che segue i risultati, possono infortunarsi (nomina un <b>terzo pilota</b>), litigare tra compagni e portare sponsor personali. I junior dell’accademia crescono prima se li mandi in <b>prestito</b>. Lo staff strappato ai rivali sconta un periodo di gardening leave.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('money')}</span><b>Proprietà e tifosi</b><p>Ogni squadra ha una proprietà con una sua idea di successo (trofei, bilancio, giovani, tecnica, visibilità) e un obiettivo extra a stagione. I tifosi crescono con i risultati e pagano in merchandising. Dopo un’annata disastrosa scatta il <b>piano di rilancio</b>.</p></div>
    </div>
    <div class="ht-note">${icon('bulb')}<div><b>Il mondo non ti aspetta:</b> le squadre rivali salgono e scendono, cambiano direttore tecnico, team principal e a volte proprietà e nome. Nel <b>Paddock → Commissione</b> trovi tendenze, voci di mercato e cronache.</div></div>` },
  { id: 'comandi', icon: 'keyboard', name: 'Comandi e accessibilità', render: () => `
    <div class="ht-cards two">
      <div class="ht-card"><span class="ht-ic">${icon('keyboard')}</span><b>Tastiera</b><p>${kb('1')}…${kb('0')} sezioni della gestione · ${kb('Invio')} weekend di gara · ${kb('Ctrl S')} salvataggio rapido · ${kb('Esc')} indietro · ${kb('Ctrl K')} vai a qualsiasi schermata · ${kb('Backspace')} schermata precedente · ${kb('F1')} questa guida · ${kb('?')} tutti i comandi. Le frecce spostano la selezione tra pulsanti e schede.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('gamepad')}</span><b>Controller</b><p>Croce o stick per muoverti, <span class="pad-btn">A</span> seleziona, <span class="pad-btn">B</span> indietro, <span class="pad-btn">LB</span> <span class="pad-btn">RB</span> cambiano sezione, <span class="pad-btn">Start</span> va al weekend, <span class="pad-btn">X</span> mette in pausa la gara.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('eye')}</span><b>Accessibilità</b><p>Nelle impostazioni: <b>dimensione del testo</b> (90–130%), <b>sottotitoli</b> più grandi in gara, <b>colori di stato sicuri</b> per daltonici, filtro colore 3D, <b>riduci animazioni</b> e qualità grafica (Alta, Media, Bassa, rilevata in automatico). Tutto è raggiungibile senza mouse.</p></div>
      <div class="ht-card"><span class="ht-ic">${icon('volume')}</span><b>Audio</b><p>Mixer separato per musica, motori, effetti e pubblico dall’icona altoparlante in alto.</p><div class="row gap8 mt8"><button class="btn sm" data-a="mixer">${icon('sliders')} Apri il mixer</button></div></div>
      <div class="ht-card"><span class="ht-ic">${icon('bulb')}</span><b>Consigli e tour</b><p>Hai saltato i consigli dell’ingegnere o il tour guidato? Riattivali: ricompariranno la prossima volta che apri ogni schermata.</p><div class="row gap8 mt8"><button class="btn sm" data-a="ht-tips">${icon('replay')} Riattiva i consigli</button></div></div>
    </div>` },
];

registerScreen({
  id: 'howto', full: true,
  render(params) {
    const back = params?.back && params.back !== 'howto' ? params.back : S() ? 'hub' : 'menu';
    const c = CH.find((x) => x.id === chapter) || CH[0];
    const i = CH.indexOf(c);
    return `<div class="full-screen howto">
      ${pageHead({ back, eyebrow: 'Guida', title: 'Come si gioca', sub: 'Tutto quello che serve per la tua prima stagione.', right: `<div class="row gap8">${S() ? `<button class="btn" data-a="ht-tour">${icon('compass')} Tour guidato</button>` : ''}<button class="btn" data-a="ht-lessons">${icon('sim')} Accademia Ingegneri</button></div>` })}
      <div class="ht-layout">
        <nav class="ht-nav" aria-label="Capitoli">${CH.map((x, k) => `<div class="ht-ch ${x.id === c.id ? 'on' : ''}" data-a="ht-ch" data-id="${x.id}">${icon(x.icon)}<span>${x.name}</span><i>${k + 1}</i></div>`).join('')}</nav>
        <article class="ht-body" aria-live="polite">
          <div class="ht-head"><span class="ht-num">${String(i + 1).padStart(2, '0')}</span><h2>${esc(c.name)}</h2></div>
          ${c.render()}
          <div class="ht-pager">${i > 0 ? `<button class="btn ghost" data-a="ht-ch" data-id="${CH[i - 1].id}">${icon('left')} ${esc(CH[i - 1].name)}</button>` : '<span></span>'}${i < CH.length - 1 ? `<button class="btn primary" data-a="ht-ch" data-id="${CH[i + 1].id}">${esc(CH[i + 1].name)} ${icon('right')}</button>` : `<button class="btn primary" data-a="nav" data-to="${S() ? 'hub' : 'newgame'}">${S() ? 'Torna alla squadra' : 'Inizia una carriera'} ${icon('right')}</button>`}</div>
        </article>
      </div>
    </div>`;
  },
  actions: {
    'ht-ch'(el) { chapter = el.dataset.id; sfx.select(); App.refresh(); requestAnimationFrame(() => { document.querySelector('.ht-ch.on')?.focus({ preventScroll: true }); document.querySelector('.full-screen')?.scrollTo({ top: 0, behavior: 'smooth' }); }); },
    'ht-lessons'() { openLessons(); },
    'ht-tips'() { resetTips(); sfx.ok(); App.toast('Consigli riattivati', 'I suggerimenti e i tour ricompariranno nelle schermate.', 'good'); },
    'ht-tour'() { App.go('hub'); setTimeout(() => startTour('tour_career', TOURS.career(), { screen: 'hub', label: 'Primi passi', finish: 'Iniziamo' }), 450); },
  },
  onKey(e) {
    const i = CH.findIndex((x) => x.id === chapter);
    if (e.key === 'PageDown' || (e.key === ']')) { e.preventDefault(); chapter = CH[Math.min(CH.length - 1, i + 1)].id; App.refresh(); }
    if (e.key === 'PageUp' || (e.key === '[')) { e.preventDefault(); chapter = CH[Math.max(0, i - 1)].id; App.refresh(); }
  },
});
