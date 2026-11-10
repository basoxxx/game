// One decision system for every live screen (race, practice/qualifying, rally stages).
// - a call that matters pauses the game or slows it to 1x (player option), with a sound and a highlighted card;
//   the previous speed comes back after the answer
// - every call has a countdown in GAME time, stretched so the player always gets MIN_REAL real seconds;
//   when it runs out the engineer picks the default (never a silent miss)
// - calls are validated when answered and withdrawn with a note when they stop making sense
// - one modal at a time, by priority (3 major > 2 strategy > 1 minor); minor calls are non-blocking cards
// - keyboard: 1/2/3 + Enter on the modal, Z/X/C + Enter on the top card; controller: the default option is focused
import { getSettings, setSettings } from '../engine/state.js';
import { sfx } from '../ui/audio.js';
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';

export const DEC_MODES = { pause: 'Pausa automatica', slow: 'Rallenta a 1x', engineer: 'Decide l’ingegnere' };
export const DEC_MODE_TIPS = { pause: 'Il gioco si ferma a ogni decisione importante e riparte alla velocità di prima dopo la risposta', slow: 'Il gioco scende a 1x: hai un conto alla rovescia in tempo di gara, poi decide l’ingegnere', engineer: 'Nessuna interruzione: l’ingegnere prende tutte le decisioni (le trovi nel registro)' };
export const MIN_REAL = 10; // real seconds the player always gets, whatever the game speed
const BY = { player: 'Tu', engineer: 'Ingegnere', policy: 'Ordine permanente', expired: 'Ritirata' };
export const byLabel = (b) => BY[b] || b;

export function decSettings() {
  const s = getSettings();
  return { mode: DEC_MODES[s.decMode] ? s.decMode : 'pause', minorAuto: !!s.decMinorAuto };
}
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class DecisionHub {
  // o.host(): element for the modal card · o.stack(): element for the non-blocking cards
  // o.clock: { speed, paused, now() } live accessors of the screen · o.onSpeed(): refresh the speed buttons
  // o.note(title, text, type): feed/toast note · o.unit: label of the game clock ('di gara', 'di sessione', 'di prova')
  constructor(o) {
    this.o = o; this.items = []; this.cur = null; this.saved = null; this.log = []; this.sig = ''; this.cfgOpen = false;
  }
  get cfg() { return decSettings(); }
  get clock() { return this.o.clock; }
  reset() { this.items = []; this.cur = null; this.saved = null; this.sig = ''; this.cfgOpen = false; this.render(true); }
  has(id) { return this.items.some((x) => x.id === id); }
  get open() { return !!this.cur; }

  // item: { id, prio, title, text, eyebrow, color, options: [{ label, desc }], def, until (game time or null), ttl,
  //         valid(): reason|null, resolve(i, by), present(speed), engine: bool (expiry handled by the sim), who }
  offer(item) {
    if (this.has(item.id)) return;
    const cfg = this.cfg;
    if (!item.engine && (cfg.mode === 'engineer' || (cfg.minorAuto && item.prio === 1))) { this.finish(item, item.def ?? 0, 'engineer'); return; }
    this.items.push(item);
  }
  note(title, text, type = '') { try { this.o.note?.(title, text, type); } catch { /* ignore */ } }
  record(item, i, by, why = null) {
    const opt = item.options?.[i];
    this.log.push({ t: this.clock.now(), stage: this.o.stage?.() ?? null, title: item.title, who: item.who || null, choice: opt ? opt.label : null, by, why });
    if (this.log.length > 80) this.log.shift();
  }
  finish(item, i, by) {
    this.items = this.items.filter((x) => x !== item);
    let res = null;
    try { res = item.resolve(i, by); } catch (e) { console.warn(e); }
    if (!item.engine) this.record(item, i, by);
    if (by !== 'player' && !item.engine) this.note(item.title, `Decide l’ingegnere: ${item.options?.[i]?.label || ''}`, '');
    return res;
  }
  // modal or card? majors always interrupt; strategy calls only below 16x; minor ones never
  blocking(item) { return item.prio >= 3 || (item.prio === 2 && this.clock.speed < 16 && !this.cfg.minorAuto) || (item.prio === 2 && this.cur === item); }

  tick() {
    const now = this.clock.now();
    for (const it of this.items.slice()) {
      const why = it.valid ? it.valid() : null;
      if (why) { // withdrawn: no longer relevant
        this.items = this.items.filter((x) => x !== it);
        if (!it.engine) { this.record(it, null, 'expired', why); this.note(it.title, `Chiamata ritirata: ${why}.`, ''); it.expire?.(why); }
        if (this.cur === it) this.closeModal();
        continue;
      }
      if (!it.engine && it.until != null && now >= it.until) { // time is up: the engineer decides
        const wasCur = this.cur === it;
        this.finish(it, it.def ?? 0, 'engineer');
        if (wasCur) this.closeModal();
      }
    }
    if (this.cur && !this.items.includes(this.cur)) this.closeModal();
    // the game got faster while a call is open (e.g. un-paused at 32x): keep the real-time window
    { const sp = this.clock.paused ? 0 : this.clock.speed;
      for (const it of this.items) if (it.shown && it.until != null && sp > (it.armSpeed || 0)) { it.armSpeed = sp; const min = now + MIN_REAL * sp; if (it.until < min) it.until = min; if (it.hardUntil != null) it.until = Math.min(it.until, it.hardUntil); it.span = Math.max(it.span || 1, it.until - now); } }
    if (!this.cur) {
      const next = this.items.filter((x) => this.blocking(x)).sort((a, b) => b.prio - a.prio || (a.seq || 0) - (b.seq || 0))[0];
      if (next) this.openModal(next);
    }
    // non-blocking cards get their window when first shown
    for (const it of this.items) if (it !== this.cur && !it.shown) { it.shown = true; this.arm(it, this.clock.paused ? 1 : this.clock.speed); if (!this.cur) { try { sfx.radio?.(); } catch { /* */ } } }
    this.render();
  }
  arm(it, speed) {
    if (it.ttl != null) it.until = this.clock.now() + Math.max(it.ttl, MIN_REAL * Math.max(1, speed));
    // hardUntil: the moment the call becomes moot (e.g. the lap starts): the default is applied just before
    if (it.hardUntil != null && it.until != null) it.until = Math.min(it.until, it.hardUntil);
    it.armSpeed = speed;
    it.span = it.until != null ? Math.max(1, it.until - this.clock.now()) : null;
  }
  openModal(it) {
    const c = this.clock; const mode = this.cfg.mode;
    if (!this.saved) this.saved = { speed: c.speed, paused: c.paused };
    if (mode === 'slow') { c.speed = 1; c.paused = false; } else c.paused = true;
    this.set = { speed: c.speed, paused: c.paused };
    this.cur = it; it.shown = true; it.modalShown = true;
    this.arm(it, mode === 'slow' ? 1 : 0);
    try { sfx.notify(); } catch { /* */ }
    this.o.onSpeed?.(); this.o.onOpen?.(it);
    this.render(true);
    // controller: the engineer's pick is focused so A confirms it (keyboard users keep Space for pause)
    if (document.documentElement.classList.contains('has-pad')) requestAnimationFrame(() => { try { document.querySelector('#dec-modal .opt.rec')?.focus({ preventScroll: true }); } catch { /* */ } });
  }
  closeModal() {
    this.cur = null;
    // another major call waiting: stay slowed/paused and show it straight away
    const next = this.items.filter((x) => this.blocking(x)).sort((a, b) => b.prio - a.prio)[0];
    if (next) { this.openModal(next); return; }
    const c = this.clock, s = this.saved, set = this.set; this.saved = null; this.set = null;
    if (s) {
      // restore what the player had, unless he picked another speed while the card was open
      if (!set || c.speed === set.speed) c.speed = s.speed;
      c.paused = s.paused;
    }
    this.o.onSpeed?.(); this.o.onClose?.();
    this.render(true);
  }
  answer(id, i, by = 'player') {
    const it = this.items.find((x) => String(x.id) === String(id)); if (!it) return null;
    const why = it.valid ? it.valid() : null;
    if (why) { this.tick(); return null; }
    const wasCur = this.cur === it;
    const res = this.finish(it, i, by);
    try { sfx.radio?.(); } catch { /* */ }
    if (wasCur) this.closeModal(); else this.render(true);
    return res;
  }
  // keyboard: returns true when the key was used by a decision
  key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (this.cur) {
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m && this.cur.options[+m[1] - 1]) { e.preventDefault(); this.answer(this.cur.id, +m[1] - 1); return true; }
      if (m) return true; // number keys never change the speed while a call is open
      if (e.key === 'Enter' && !e.target?.closest?.('#dec-modal, .dec-card, #dec-cfg')) { e.preventDefault(); this.answer(this.cur.id, this.cur.def ?? 0); return true; }
      return false;
    }
    const top = this.cards()[0];
    if (top) {
      const k = { KeyZ: 0, KeyX: 1, KeyC: 2 }[e.code];
      if (k != null && top.options[k]) { e.preventDefault(); this.answer(top.id, k); return true; }
      if (e.key === 'Enter' && !e.target?.closest?.('#dec-modal, .dec-card, #dec-cfg')) { e.preventDefault(); this.answer(top.id, top.def ?? 0); return true; }
    }
    return false;
  }
  cards() { return this.items.filter((x) => x !== this.cur).sort((a, b) => b.prio - a.prio || (a.until ?? 1e12) - (b.until ?? 1e12)); }

  // ---------- rendering ----------
  timerHTML(it, modal) {
    const c = this.clock; const unit = this.o.unit || 'di gara';
    if (it.until == null) return modal ? `<div class="dec-time"><span>${icon('pause')} In pausa: decidi con calma</span></div>` : '';
    const left = Math.max(0, it.until - c.now());
    const f = Math.max(0, Math.min(1, left / (it.span || left || 1)));
    const real = c.paused ? null : left / Math.max(1, c.speed);
    return `<div class="dec-time"><span data-dec-left="${it.id}">${c.paused && modal ? `${icon('pause')} In pausa · ` : ''}${mmss(left)} ${unit}${real != null ? ` · ~${Math.ceil(real)}s` : ''}</span><span class="muted">poi decide ${this.o.advisor === 'copilota' ? 'il copilota' : 'l’ingegnere'}: <b>${esc(it.options[it.def ?? 0]?.label || '')}</b></span></div><div class="dec-bar"><i data-dec-bar="${it.id}" style="width:${(f * 100).toFixed(1)}%"></i></div>`;
  }
  modalHTML(it) {
    const col = it.color || 'var(--team)';
    const mode = this.cfg.mode;
    return `<div id="dec-modal" class="decision dec-modal p${it.prio}" style="border-top-color:${col};--dc:${col}" role="dialog" aria-label="${esc(it.title)}">
      <div class="m-eyebrow" style="color:${col}">${esc(it.eyebrow || 'Decisione')} · ${mode === 'slow' ? 'gioco rallentato a 1x' : 'gioco in pausa'}${this.items.length > 1 ? ` · altre ${this.items.length - 1} in coda` : ''}</div>
      <div class="m-title">${esc(it.title)}</div>
      <div class="dec-text">${esc(it.text || '')}</div>
      <div class="col gap6 mt16">${it.options.map((o, i) => `<div class="opt ${i === (it.def ?? 0) ? 'rec' : ''}" tabindex="0" role="button" data-a="dec" data-id="${it.id}" data-i="${i}"><div class="row between"><b>${esc(o.label)}</b><span class="row gap6">${i === (it.def ?? 0) ? `<span class="chip tiny dec-rec">Consiglio ${this.o.advisor || 'ingegnere'}</span>` : ''}<span class="kbd">${i + 1}</span></span></div>${o.desc ? `<div class="small muted mt8">${esc(o.desc)}</div>` : ''}</div>`).join('')}</div>
      ${this.timerHTML(it, true)}
      <div class="row between mt8 dec-foot"><span class="tiny muted">Tasti 1-${it.options.length} · Invio = consiglio · Spazio riprende/ferma il gioco</span><button class="btn sm ghost" data-a="dec-cfg">${icon('settings')} Opzioni decisioni</button></div></div>`;
  }
  cardHTML(it, top) {
    const col = it.color || 'var(--team)';
    const keys = ['Z', 'X', 'C'];
    return `<div class="dec-card p${it.prio}" style="--dc:${col}" data-dec="${it.id}"><div class="dec-card-h"><span class="dec-dot"></span><b>${esc(it.title)}</b></div>
      <div class="dec-card-t">${esc(it.text || '')}</div>
      <div class="row gap6 mt8 wrap">${it.options.map((o, i) => `<button class="btn sm ${i === (it.def ?? 0) ? 'team' : ''} grow" data-a="dec" data-id="${it.id}" data-i="${i}" data-tip="${esc(o.desc || '')}${i === (it.def ?? 0) ? ' · consiglio dell’ingegnere' : ''}">${esc(o.label)}${top ? ` <span class="kbd">${keys[i] || ''}</span>` : ''}</button>`).join('')}</div>
      ${this.timerHTML(it, false)}</div>`;
  }
  cfgHTML() {
    const cfg = this.cfg;
    return `<div class="decision dec-cfg" id="dec-cfg" role="dialog" aria-label="Opzioni decisioni"><div class="row between"><div class="m-eyebrow">Decisioni a gioco accelerato</div><button class="btn sm icon-btn ghost" data-a="dec-cfg" aria-label="Chiudi">${icon('x')}</button></div>
      <div class="tiny upper muted mt8 mb8">Quando arriva una decisione importante</div>
      <div class="seg">${Object.entries(DEC_MODES).map(([k, n]) => `<div class="${cfg.mode === k ? 'on' : ''}" data-a="dec-mode" data-v="${k}" data-tip="${esc(DEC_MODE_TIPS[k])}">${n}</div>`).join('')}</div>
      <div class="small muted mt8">${esc(DEC_MODE_TIPS[cfg.mode])}.</div>
      <div class="row between mt16"><div><b>Gestisci in automatico le decisioni minori</b><div class="tiny muted">Battaglie, richieste radio di routine: decide l’ingegnere, senza card</div></div><button class="btn sm ${cfg.minorAuto ? 'active' : ''}" data-a="dec-minor">${cfg.minorAuto ? 'ON' : 'OFF'}</button></div>
      <div class="tiny muted mt16">Ogni decisione ha un conto alla rovescia in tempo di gioco, mai meno di ${MIN_REAL} secondi reali a qualsiasi velocità: se scade sceglie l’ingegnere. A 16x e oltre interrompono solo le chiamate importanti (safety car, meteo, guasti); le altre arrivano come card con pulsanti rapidi (Z/X/C, Invio).${this.o.extraCfg ? ' ' + this.o.extraCfg : ''}</div></div>`;
  }
  render(force) {
    const host = this.o.host?.(); const stack = this.o.stack?.();
    const cards = this.cards();
    const sig = `${this.cur?.id ?? ''}|${cards.map((x) => x.id).join(',')}|${this.cfgOpen ? 1 : 0}|${this.clock.paused ? 1 : 0}|${this.cfg.mode}${this.cfg.minorAuto}`;
    if (force || sig !== this.sig) {
      this.sig = sig;
      if (host) {
        host.querySelector('#dec-modal')?.remove(); host.querySelector('#dec-cfg')?.remove();
        if (this.cfgOpen) host.insertAdjacentHTML('beforeend', this.cfgHTML());
        else if (this.cur) host.insertAdjacentHTML('beforeend', this.modalHTML(this.cur));
      }
      if (stack) stack.innerHTML = cards.slice(0, 3).map((x, i) => this.cardHTML(x, i === 0 && !this.cur)).join('') + (cards.length > 3 ? `<div class="tiny muted">+${cards.length - 3} altre in coda</div>` : '');
      return;
    }
    // light update: countdowns only
    const c = this.clock; const unit = this.o.unit || 'di gara';
    for (const it of this.items) {
      if (it.until == null) continue;
      const left = Math.max(0, it.until - c.now());
      const bar = document.querySelector(`[data-dec-bar="${it.id}"]`); if (bar) bar.style.width = `${(Math.max(0, Math.min(1, left / (it.span || 1))) * 100).toFixed(1)}%`;
      const lab = document.querySelector(`[data-dec-left="${it.id}"]`);
      if (lab) { const real = c.paused ? null : left / Math.max(1, c.speed); const t = `${mmss(left)} ${unit}${real != null ? ` · ~${Math.ceil(real)}s` : ''}`; if (lab.dataset.v !== t) { lab.dataset.v = t; lab.textContent = t; } }
    }
  }
  toggleCfg() { this.cfgOpen = !this.cfgOpen; this.render(true); }
  // switching to an automatic mode answers what is still open
  sweep() { const cfg = this.cfg; for (const it of this.items.slice()) if (!it.engine && (cfg.mode === 'engineer' || (cfg.minorAuto && it.prio === 1)) && !(it.valid && it.valid())) { const cur = this.cur === it; this.finish(it, it.def ?? 0, 'engineer'); if (cur) this.closeModal(); } }
  setMode(v) { if (DEC_MODES[v]) setSettings({ decMode: v }); this.o.onCfg?.(); this.sweep(); this.render(true); }
  toggleMinor() { setSettings({ decMinorAuto: !this.cfg.minorAuto }); this.o.onCfg?.(); this.sweep(); this.render(true); }
  // shared actions for the screens' action maps
  actions() {
    return {
      dec: (el) => { this.answer(el.dataset.id, +el.dataset.i); },
      'dec-cfg': () => this.toggleCfg(),
      'dec-mode': (el) => this.setMode(el.dataset.v),
      'dec-minor': () => this.toggleMinor(),
    };
  }
}

// post-session decision log (rally / practice / qualifying): what was asked, who chose, what
export function hubLogHTML(log, title = 'Registro decisioni') {
  if (!log?.length) return '';
  return `<div class="panel tight dec-log"><div class="tiny upper muted mb8">${esc(title)}</div>${log.slice(-12).map((d) => `<div class="dec-log-row"><span class="chip tiny ${d.by === 'player' ? 'good' : d.by === 'expired' ? '' : 'warn'}">${byLabel(d.by)}</span><span class="grow"><b>${esc(d.title)}</b>${d.who ? ` · ${esc(d.who)}` : ''}<div class="tiny muted">${d.choice ? esc(d.choice) : `Ritirata: ${esc(d.why || '')}`}</div></span></div>`).join('')}</div>`;
}
