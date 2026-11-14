// Muretto box: transport between the game (host) and the pit wall screens (viewers).
// One API, two backends:
//   - BroadcastChannel: another window of the same browser / Electron app (second monitor), offline
//   - WebRTC data channel (peerjs): another device. The public peerjs broker only does the signalling
//     (who is where); race data flows peer-to-peer. The broker is configurable (?pwbroker=http://host:port/
//     or localStorage apex_pitwall_broker) so a LAN / local peer server can be used.
// Messages: { t: 'hello'|'bye'|'meta'|'state'|'evt'|'cmd'|'ack'|'tab', ... } plain JSON.

const CH = 'apex-pitwall';
const PREFIX = 'apexdyn-pw-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const VIEWER_TTL = 9000;
const rid = (n = 8) => Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const newCode = () => rid(6);
export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[O]/g, '0').replace(/[I]/g, '1').slice(0, 8);

// ---- broker (signalling) config
const DEFAULT_BROKER = { host: '0.peerjs.com', port: 443, path: '/', secure: true };
export function brokerOverride() {
  let raw = null;
  try { raw = new URLSearchParams(location.search).get('pwbroker'); } catch { /* */ }
  if (!raw) { try { raw = localStorage.getItem('apex_pitwall_broker'); } catch { /* */ } }
  return raw || null;
}
export function brokerConfig() {
  const raw = brokerOverride();
  if (!raw) return { ...DEFAULT_BROKER, public: true };
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`);
    const secure = u.protocol === 'https:';
    return { host: u.hostname, port: +(u.port || (secure ? 443 : 80)), path: u.pathname || '/', secure, public: false, raw };
  } catch { return { ...DEFAULT_BROKER, public: true }; }
}
let peerMod = null;
const loadPeer = () => (peerMod ||= import('peerjs').then((m) => m.Peer || m.default?.Peer || m.default));
function peerOpts() {
  const b = brokerConfig();
  const o = { host: b.host, port: b.port, path: b.path, secure: b.secure, debug: 0 };
  // a local / LAN broker: no internet, keep ICE to the local network
  if (!b.public) o.config = { iceServers: [] };
  return o;
}

export function hasBroadcast() { return typeof BroadcastChannel !== 'undefined'; }

// ================= HOST =================
// opts: { onCommand(cmd, viewer) -> {ok, msg}|void, onViewers(list), onRemote(status), getMeta(), getHello() }
export function createHost(opts = {}) {
  const hostId = rid(10);
  const viewers = new Map(); // id -> { id, via: 'local'|'webrtc', name, seen, conn }
  let bc = null, peer = null, remote = { state: 'off', code: null, error: null }, closed = false, retryT = 0, tries = 0;
  const changed = () => { try { opts.onViewers?.([...viewers.values()].map(({ conn, ...v }) => v)); } catch (e) { console.warn(e); } };
  const setRemote = (r) => { remote = { ...remote, ...r }; try { opts.onRemote?.(remote); } catch (e) { console.warn(e); } };
  const sendTo = (v, msg) => {
    try {
      if (v.via === 'local') bc?.postMessage({ ...msg, to: v.id, from: hostId });
      else if (v.conn?.open) v.conn.send(msg);
    } catch (e) { console.warn('pitwall send', e); }
  };
  const greet = (v) => { const m = opts.getMeta?.(); if (m) sendTo(v, { t: 'meta', meta: m }); const h = opts.getHello?.(); for (const x of h || []) sendTo(v, x); };
  function handle(msg, v) {
    if (!msg || typeof msg !== 'object') return;
    v.seen = Date.now();
    if (msg.t === 'hello') { const isNew = !v.known; v.known = true; if (msg.name) v.name = String(msg.name).slice(0, 40); if (isNew || msg.need) greet(v); if (isNew) changed(); return; }
    if (msg.t === 'bye') { drop(v.id); return; }
    if (msg.t === 'cmd') {
      let res = null;
      try { res = opts.onCommand?.(msg.c, v); } catch (e) { console.warn('pitwall cmd', e); res = { ok: false, msg: 'Comando non riuscito' }; }
      sendTo(v, { t: 'ack', n: msg.n, ok: res?.ok !== false, msg: res?.msg || null });
    }
  }
  function drop(id) { const v = viewers.get(id); if (!v) return; viewers.delete(id); try { v.conn?.close(); } catch { /* */ } changed(); }
  // ---- same device
  if (hasBroadcast()) {
    bc = new BroadcastChannel(CH);
    bc.onmessage = (e) => {
      const m = e.data; if (!m || !m.from || m.role !== 'viewer') return;
      if (m.to && m.to !== hostId) return;
      let v = viewers.get(m.from);
      if (!v) { if (m.t === 'bye') return; v = { id: m.from, via: 'local', name: m.name || 'Finestra su questo computer', seen: Date.now() }; viewers.set(m.from, v); }
      handle(m, v);
    };
    // announce: viewers already open find this host at once
    bc.postMessage({ t: 'host', from: hostId });
  }
  const sweep = setInterval(() => { const now = Date.now(); for (const v of [...viewers.values()]) if (now - v.seen > VIEWER_TTL) drop(v.id); }, 3000);

  // ---- other devices (WebRTC through peerjs)
  async function startRemote(code) {
    if (closed) return;
    if (peer && !peer.destroyed) { if (remote.state === 'ready' || remote.state === 'connecting') return; }
    clearTimeout(retryT);
    code = code || remote.code || newCode();
    setRemote({ state: 'connecting', code, error: null });
    let Peer;
    try { Peer = await loadPeer(); } catch (e) { setRemote({ state: 'error', error: 'Modulo WebRTC non disponibile' }); return; }
    try { peer?.destroy(); } catch { /* */ }
    let p;
    try { p = new Peer(PREFIX + code, peerOpts()); } catch (e) { setRemote({ state: 'error', error: 'WebRTC non supportato da questo browser' }); return; }
    peer = p;
    p.on('open', () => { if (peer !== p) return; tries = 0; setRemote({ state: 'ready', error: null }); });
    p.on('connection', (conn) => {
      conn.on('open', () => {
        const id = 'rtc-' + conn.connectionId;
        const v = { id, via: 'webrtc', name: conn.metadata?.name || 'Dispositivo remoto', seen: Date.now(), conn };
        viewers.set(id, v);
        conn.on('data', (d) => handle(d, v));
        conn.on('close', () => drop(id));
        conn.on('error', () => drop(id));
      });
    });
    p.on('disconnected', () => { if (peer !== p || closed) return; // lost the broker: live connections keep working, re-register for new ones
      setRemote({ state: 'connecting', error: 'Riconnessione al server di abbinamento…' });
      retryT = setTimeout(() => { try { if (!p.destroyed) p.reconnect(); } catch { /* */ } }, 1500);
    });
    p.on('error', (err) => {
      if (peer !== p) return;
      const type = err?.type || '';
      if (type === 'unavailable-id') { // the broker still holds our old registration (page reloaded): wait, then try a new code
        tries++;
        if (tries > 3) { setRemote({ code: newCode() }); tries = 0; }
        retryT = setTimeout(() => startRemote(remote.code), 2500); try { p.destroy(); } catch { /* */ } return;
      }
      if (type === 'peer-unavailable') return; // a viewer that went away
      if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible', 'ssl-unavailable'].includes(type) || p.destroyed) {
        tries++;
        setRemote({ state: 'error', error: type === 'browser-incompatible' ? 'Questo browser non supporta WebRTC' : 'Server di abbinamento non raggiungibile' });
        if (type !== 'browser-incompatible') retryT = setTimeout(() => { if (!closed && remote.state === 'error') startRemote(remote.code); }, Math.min(30000, 3000 * tries));
      }
    });
  }
  function stopRemote() { clearTimeout(retryT); try { peer?.destroy(); } catch { /* */ } peer = null; for (const v of [...viewers.values()]) if (v.via === 'webrtc') drop(v.id); setRemote({ state: 'off', error: null }); }

  return {
    hostId,
    get viewers() { return [...viewers.values()]; },
    get count() { return viewers.size; },
    get remote() { return remote; },
    startRemote, stopRemote,
    broadcast(msg) { for (const v of viewers.values()) sendTo(v, msg); },
    send(id, msg) { const v = viewers.get(id); if (v) sendTo(v, msg); },
    close() {
      closed = true; clearInterval(sweep); clearTimeout(retryT);
      try { bc?.postMessage({ t: 'host-bye', from: hostId }); bc?.close(); } catch { /* */ }
      for (const v of [...viewers.values()]) { try { v.conn?.close(); } catch { /* */ } }
      viewers.clear(); try { peer?.destroy(); } catch { /* */ }
    },
  };
}

// ================= VIEWER =================
// code: null -> same device (BroadcastChannel); otherwise the room code of a host on another device.
// opts: { name, onMessage(msg), onStatus({ state: 'searching'|'connecting'|'live'|'lost'|'error', via, error }) }
export function createViewer(code, opts = {}) {
  const myId = rid(10);
  const name = opts.name || deviceName();
  let status = { state: 'searching', via: code ? 'webrtc' : 'local', error: null };
  let closed = false, hostId = null, lastMsg = 0, n = 0, bc = null, peer = null, conn = null, retryT = 0, ping = 0, tries = 0;
  const setStatus = (s) => { const prev = status.state; status = { ...status, ...s }; if (prev !== status.state || s.error !== undefined) { try { opts.onStatus?.(status); } catch (e) { console.warn(e); } } };
  const deliver = (m) => {
    lastMsg = Date.now();
    if (status.state !== 'live') setStatus({ state: 'live', error: null });
    try { opts.onMessage?.(m); } catch (e) { console.warn('pitwall', e); }
  };
  const post = (m) => {
    try {
      if (!code) bc?.postMessage({ ...m, from: myId, to: hostId, role: 'viewer', name });
      else if (conn?.open) conn.send(m);
    } catch (e) { console.warn('pitwall post', e); }
  };
  if (!code) {
    if (!hasBroadcast()) setStatus({ state: 'error', error: 'Questo browser non supporta le finestre collegate' });
    else {
      bc = new BroadcastChannel(CH);
      bc.onmessage = (e) => {
        const m = e.data; if (!m || !m.from || m.role === 'viewer') return;
        if (m.t === 'host') { if (!hostId || Date.now() - lastMsg > 4000) { hostId = null; post({ t: 'hello', need: 1 }); } return; }
        if (m.t === 'host-bye') { if (m.from === hostId) { hostId = null; setStatus({ state: 'searching' }); } return; }
        if (m.to && m.to !== myId) return;
        // lock onto the first host that answers; switch when it goes quiet or another host is live and ours is not
        if (!hostId) hostId = m.from;
        else if (m.from !== hostId) {
          const quiet = Date.now() - lastMsg > 4000;
          if (!(quiet || (m.t === 'state' && m.s?.live && !opts.live?.()))) return;
          hostId = m.from; post({ t: 'hello', need: 1 });
        }
        deliver(m);
      };
      post({ t: 'hello', need: 1 });
    }
  } else connectRemote();

  async function connectRemote() {
    if (closed) return;
    setStatus({ state: 'connecting', error: null });
    let Peer;
    try { Peer = await loadPeer(); } catch { setStatus({ state: 'error', error: 'Modulo WebRTC non disponibile' }); return; }
    if (!peer || peer.destroyed) {
      try { peer = new Peer(undefined, peerOpts()); } catch { setStatus({ state: 'error', error: 'WebRTC non supportato da questo browser' }); return; }
      const p = peer;
      p.on('open', () => { if (peer === p) dial(); });
      p.on('disconnected', () => { if (peer === p && !closed) setTimeout(() => { try { if (!p.destroyed) p.reconnect(); } catch { /* */ } }, 1500); });
      p.on('error', (err) => {
        if (peer !== p) return;
        const type = err?.type || '';
        if (type === 'peer-unavailable') { setStatus({ state: 'searching', error: 'Il gioco con questo codice non risponde: apri il muretto box sul computer' }); again(3000); return; }
        if (type === 'browser-incompatible') { setStatus({ state: 'error', error: 'Questo browser non supporta WebRTC' }); return; }
        tries++;
        setStatus({ state: 'error', error: 'Server di abbinamento non raggiungibile' });
        try { p.destroy(); } catch { /* */ } peer = null; again(Math.min(20000, 2500 * tries));
      });
    } else if (peer.open) dial();
  }
  function again(ms) { clearTimeout(retryT); retryT = setTimeout(() => { if (!closed) connectRemote(); }, ms); }
  function dial() {
    if (closed || !peer || peer.destroyed) return;
    try { conn?.close(); } catch { /* */ }
    const c = peer.connect(PREFIX + code, { serialization: 'json', reliable: true, metadata: { name } });
    conn = c;
    const t = setTimeout(() => { if (conn === c && !c.open) { try { c.close(); } catch { /* */ } again(1500); } }, 12000);
    c.on('open', () => { clearTimeout(t); tries = 0; post({ t: 'hello', need: 1, name }); setStatus({ state: 'connecting' }); });
    c.on('data', (m) => { if (conn === c) deliver(m); });
    c.on('close', () => { clearTimeout(t); if (conn === c && !closed) { setStatus({ state: 'lost', error: 'Collegamento perso: riconnessione…' }); again(1500); } });
    c.on('error', () => { clearTimeout(t); if (conn === c && !closed) again(2000); });
  }
  // heartbeat: the host drops silent viewers; a silent host shows as lost
  ping = setInterval(() => {
    if (closed) return;
    post({ t: 'hello', need: status.state !== 'live' ? 1 : 0 });
    if (status.state === 'live' && Date.now() - lastMsg > 10000) setStatus({ state: code ? 'lost' : 'searching', error: code ? 'Nessun dato dal gioco: riconnessione…' : null });
    if (!code && status.state !== 'live' && Date.now() - lastMsg > 6000) hostId = null;
  }, 2000);

  return {
    get status() { return status; },
    get id() { return myId; },
    send(c) { const id = ++n; post({ t: 'cmd', n: id, c }); return id; },
    retry() { if (code) { tries = 0; try { peer?.destroy(); } catch { /* */ } peer = null; connectRemote(); } else post({ t: 'hello', need: 1 }); },
    close() {
      closed = true; clearInterval(ping); clearTimeout(retryT);
      post({ t: 'bye' });
      try { bc?.close(); } catch { /* */ }
      try { conn?.close(); } catch { /* */ }
      try { peer?.destroy(); } catch { /* */ }
    },
  };
}

function deviceName() {
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return 'Tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'Telefono';
  return 'Computer';
}
