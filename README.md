# 🏁 Apex Dynasty — Motorsport Manager

**Apex Dynasty** è un gioco gestionale motorsport multi-categoria: guida la tua scuderia in **Formula**, **Rally** ed **Endurance**, progetta la vettura, gestisci piloti, sponsor e strategie, e costruisci una dinastia.

🌐 **Sito e versione browser:** https://basoxxx.github.io/game/
⬇️ **Download:** [Release](https://github.com/basoxxx/game/releases/latest) — macOS Apple Silicon, macOS Intel, Windows (installer e portable), Linux.

![Gara](site-src/shots/race.jpg)

## Caratteristiche

- **3 categorie**, ognuna con regole e simulazione proprie
  - **Formula Apex** – 11 team, qualifiche Q1/Q2/Q3, 5 mescole, safety car, pioggia, duelli e DRS
  - **Rally Apex** – 7 team, prove speciali su sterrato/asfalto/neve, decisioni live del copilota, parco assistenza a tempo, Super Rally e Power Stage
  - **Endurance Apex** – hypercar, gare da 6/8/24 ore, carburante, doppi stint, cambi pilota, notte
- **Centro Tecnico**: concetto vettura, fornitori power unit, progetti R&D con rischio, livrea personalizzabile
- **Weekend completo**: prove libere con minigioco di assetto, qualifiche, gara live con mappa, classifica, meteo radar e radio di squadra
- **Gestione**: mercato piloti con contratti e clausole, staff, strutture, sponsor con obiettivi, finanze
- **Carriera**: obiettivi del consiglio (puoi essere licenziato!), cambi regolamento, invecchiamento e crescita piloti, offerte da altre categorie, trofei e obiettivi
- Crea **la tua squadra** con nome, colori e livrea
- Salvataggi multipli + import/export su file

> Tutti i nomi di squadre, piloti, sponsor e marchi sono parodie di fantasia e non sono affiliati a persone o aziende reali.

## Installazione

| Sistema | File |
|---|---|
| macOS Apple Silicon (M1–M4) | `ApexDynasty-<versione>-mac-arm64.dmg` |
| macOS Intel | `ApexDynasty-<versione>-mac-x64.dmg` |
| Windows 10/11 | `ApexDynasty-<versione>-Setup.exe` oppure `-Portable.exe` |
| Linux | `.AppImage` |

**macOS:** l'app non è firmata con un certificato Apple Developer. Al primo avvio: *clic destro → Apri*. Se compare "l'app è danneggiata":
```bash
xattr -cr "/Applications/Apex Dynasty.app"
```
**Windows:** se SmartScreen avvisa, *Ulteriori informazioni → Esegui comunque*.

## Sviluppo

```bash
npm install
npm run dev          # versione browser con hot reload
npm run electron     # app desktop
npm run dist:mac     # .dmg/.zip per Intel (x64) e Apple Silicon (arm64) – richiede macOS
npm run dist:win     # installer NSIS + portable
npm run build:site   # sito GitHub Pages (landing + /play)
```

Le build desktop vengono create automaticamente da GitHub Actions (`.github/workflows/release.yml`) quando si pubblica un tag `v*`. Il sito viene pubblicato sul branch `gh-pages` da `.github/workflows/pages.yml`.

### Struttura
- `src/engine/` – simulazione: mondo, stagione, gara su circuito, rally, economia
- `src/data/` – categorie, squadre, piloti, circuiti, sponsor
- `src/screens/` – schermate di gioco
- `src/ui/` – grafica procedurale (auto, caschi, bandiere, piste), audio sintetizzato
- `electron/` – wrapper desktop

Tecnologie: JavaScript, Vite, Canvas/SVG, Web Audio, Electron, electron-builder.
