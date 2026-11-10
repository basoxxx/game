// Time of day and weather for the venues of "Scontro Totale". Every venue has its own default
// mood; the free-event menu can override it (dusty sunset, rain and mud, night under the lights).
export const WEATHERS = {
  auto: { name: 'Automatico', desc: 'Il meteo tipico di ogni arena' },
  sereno: { name: 'Sereno', desc: 'Sole pieno, polvere e contrasto' },
  tramonto: { name: 'Tramonto', desc: 'Sole basso, controluce e polvere dorata' },
  pioggia: { name: 'Pioggia', desc: 'Cielo coperto, fondo bagnato, meno aderenza' },
  notte: { name: 'Notte', desc: 'Buio, fari e riflettori' },
};
// sky = HDRI id (ui/gfx.js); tint = shadows / highlights multipliers of the final grade
const BASE = {
  sereno: { sky: 'day', sun: 2.9, sunCol: 0xfff0d8, hemi: 0.6, hemiSky: 0xdde8ff, hemiGnd: 0x6b5a40, fog: 0.0019, fogCol: 0xcab89a, fogMix: 0.35, exposure: 1.0, env: 0.9, bloom: 0.28, con: 1.08, sat: 1.1, warm: 0.035, lo: [1, 1, 1], hi: [1, 1, 1], dust: 1, fxAmb: 0.6, fxLight: 0.62, flare: 1 },
  pomeriggio: { sky: 'afternoon', sun: 2.7, sunCol: 0xffe6c0, hemi: 0.55, hemiSky: 0xd8e4ff, hemiGnd: 0x6b5a40, fog: 0.0018, fogCol: 0xd8c4a0, fogMix: 0.4, exposure: 1.0, env: 0.9, bloom: 0.3, con: 1.08, sat: 1.1, warm: 0.045, lo: [0.98, 0.99, 1.03], hi: [1.03, 1.0, 0.96], dust: 1.1, fxAmb: 0.55, fxLight: 0.68, flare: 1 },
  tramonto: { sky: 'dusk', sun: 2.5, sunCol: 0xffb47a, hemi: 0.5, hemiSky: 0xd9c8e0, hemiGnd: 0x6b5038, fog: 0.0028, fogCol: 0xe0a070, fogMix: 0.55, exposure: 1.06, env: 0.95, bloom: 0.42, con: 1.1, sat: 1.14, warm: 0.07, lo: [0.94, 0.96, 1.08], hi: [1.07, 0.99, 0.88], dust: 1.7, fxAmb: 0.5, fxLight: 0.8, flare: 1.3, rays: 1 },
  pioggia: { sky: 'dusk', flatSky: 0x8d949b, sun: 0.9, sunCol: 0xdfe6f0, hemi: 1.05, hemiSky: 0xcfd6e0, hemiGnd: 0x58534a, fog: 0.0052, fogCol: 0x8d949b, fogMix: 1, exposure: 0.95, env: 0.55, bloom: 0.22, con: 1.04, sat: 0.86, warm: 0, lo: [0.93, 0.98, 1.06], hi: [0.98, 1.0, 1.02], dust: 0.15, fxAmb: 0.62, fxLight: 0.2, flare: 0, rain: 1, wet: 1, grip: 0.9 },
  notte: { sky: 'night', sun: 1.5, sunCol: 0xcfdcff, hemi: 0.4, hemiSky: 0x8090b0, hemiGnd: 0x2a241c, fog: 0.0032, fogCol: 0x10141c, fogMix: 1, exposure: 1.0, env: 0.6, bloom: 0.5, con: 1.1, sat: 1.02, warm: 0, lo: [0.9, 0.97, 1.12], hi: [1.03, 1.0, 0.95], dust: 0.9, fxAmb: 0.22, fxLight: 0.3, flare: 0, night: true },
};
// venue default + local flavour
const VENUE = {
  cava: { base: 'sereno', dust: 1.5, fogCol: 0xd8bf96, hi: [1.04, 1.0, 0.93], warm: 0.05 },
  otto: { base: 'tramonto' },
  pineta: { base: 'pomeriggio', fog: 0.0030, fogCol: 0xb9c7b4, fogMix: 0.6, lo: [0.94, 1.0, 1.02], hi: [1.0, 1.02, 0.95], sat: 1.06, dust: 0.8, rays: 1 },
  fattoria: { base: 'pioggia', rain: 0.6 },
  stadio: { base: 'notte', fxAmb: 0.45, fxLight: 0.4 },
  arena: { base: 'tramonto', dust: 2.0 },
  porto: { base: 'sereno', fog: 0.0013, fogCol: 0xb8c6d0, fogMix: 0.5, lo: [0.94, 0.99, 1.07], hi: [1.0, 1.0, 0.99], sat: 1.02, dust: 0.3 },
  fossa: { base: 'notte', rain: 0.8, wet: 1, grip: 0.94, fxAmb: 0.42, fxLight: 0.4 },
  rampa: { base: 'pomeriggio', fog: 0.0017 },
};
export function venueLook(venue, weather = 'auto') {
  const v = VENUE[venue.id] || { base: venue.sky === 'night' ? 'notte' : venue.sky === 'dusk' ? 'tramonto' : 'sereno' };
  const forced = weather && weather !== 'auto' && BASE[weather];
  const look = forced ? { ...BASE[weather] } : { ...BASE[v.base], ...v };
  if (forced && weather === v.base) Object.assign(look, v);
  look.id = forced ? weather : v.base;
  // venues built with their own floodlights (stadium, arenas) are brighter at night than open country
  look.lit = !!(venue.stadium || venue.kind === 'derby');
  if (look.night && !look.lit) { look.sun = 2.0; look.hemi = 0.62; look.exposure = 1.12; look.fxAmb = 0.3; }
  if (venue.port && !look.night && !look.rain) look.fog = Math.min(look.fog, 0.0014);
  return look;
}
