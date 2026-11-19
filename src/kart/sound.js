// Kart Baso — sound: reuses the hub's procedural audio engine (engine synth for player 1, the
// shared effect kits) and maps race events to cartoon sounds. Every call is guarded: audio never
// breaks the game (locked context, muted settings, headless tests).
import { sfx, osfx, engineStart, engineSet, engineStop } from '../ui/audio.js';

const safe = (f) => { try { f(); } catch { /* audio is optional */ } };
export class KartSound {
  constructor(on) { this.on = on; this.eng = false; this.last = {}; }
  rate(key, gap) { const t = performance.now(); if (t - (this.last[key] || 0) < gap) return false; this.last[key] = t; return true; }
  engine(k, state) {
    if (!this.on) return;
    if (!this.eng && state !== 'done') { safe(() => engineStart('rally')); this.eng = true; }
    if (this.eng) safe(() => engineSet(Math.max(0, k.fwd) / 42, { throttle: k.input.thr ? 1 : 0.2, slip: k.drift ? 0.5 + k.dTier * 0.15 : k.spinT > 0 ? 0.8 : 0, view: 'chase', surface: k.surf === 'road' || k.surf === 'void' ? 'tarmac' : 'gravel' }));
  }
  stopEngine() { if (this.eng) safe(() => engineStop()); this.eng = false; }
  // mine: the event concerns a human player (always audible); near: close to player 1
  event(e, mine, near) {
    if (!this.on) return;
    const p = (f, key, gap = 60) => { if (!key || this.rate(key, gap)) safe(f); };
    switch (e.t) {
      case 'count': p(() => osfx.beep()); break;
      case 'go': p(() => osfx.go()); break;
      case 'box': if (mine) p(() => sfx.select(), 'box'); break;
      case 'got': if (mine) p(() => osfx.ready(), 'got'); break;
      case 'coin': if (mine) p(() => sfx.coin(), 'coin', 70); break;
      case 'boost': if (mine) p(() => sfx.whoosh(), 'boost', 150); break;
      case 'tier': if (mine) p(() => osfx.toggle(), 'tier', 80); break;
      case 'hit': if (mine || near) p(() => osfx.hit(), 'hit', 90); break;
      case 'explode': if (mine || near) p(() => osfx.boom(), 'boom', 120); break;
      case 'wall': if (mine && e.pow > 0.3) p(() => osfx.slam(), 'wall', 200); break;
      case 'bump': if (mine) p(() => osfx.hurt(), 'bump', 200); break;
      case 'use': if (mine) p(() => osfx.swat(), 'use', 80); break;
      case 'pop': if (near) p(() => osfx.pop(), 'pop', 60); break;
      case 'shield': if (mine || near) p(() => osfx.toggle(), 'shield', 100); break;
      case 'balloon': p(() => osfx.burst(), 'balloon', 100); break;
      case 'steal': if (mine) p(() => osfx.ready(), 'steal'); break;
      case 'respawn': if (mine) p(() => osfx.fall(), 'resp', 300); break;
      case 'land': if (mine && e.pow > 0.35) p(() => osfx.slam(), 'land', 250); break;
      case 'trick': if (mine) p(() => sfx.select(), 'trick'); break;
      case 'lap': if (mine) p(() => (e.final ? sfx.sting() : sfx.notify()), 'lap', 400); break;
      case 'finish': if (mine) p(() => sfx.win(), 'fin', 1000); break;
      case 'pass': if (mine) p(() => sfx.overtake(), 'pass', 900); break;
      case 'out': p(() => osfx.lose(), 'out', 500); break;
    }
  }
  destroy() { this.stopEngine(); }
}
