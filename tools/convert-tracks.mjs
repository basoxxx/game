// Converts bacinger/f1-circuits GeoJSON (MIT) into compact metric polylines.
// These real-world layouts are NOT shipped any more: they are only the starting reference
// that tools/redesign-tracks.mjs turns into the game's original circuits.
// Usage: node tools/convert-tracks.mjs  (prints a summary; import referenceCircuits() to use)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function referenceCircuits() {
const d = JSON.parse(readFileSync(fileURLToPath(new URL('./f1-circuits.geojson', import.meta.url)), 'utf8'));
const MAP = { aus: 'au-1953', chn: 'cn-2004', jpn: 'jp-1962', bhr: 'bh-2002', ksa: 'sa-2021', mia: 'us-2022', can: 'ca-1978', mon: 'mc-1929', esp: 'es-1991', aut: 'at-1969', gbr: 'gb-1948', bel: 'be-1925', hun: 'hu-1986', ned: 'nl-1948', ita: 'it-1922', mad: 'es-2026', aze: 'az-2016', sgp: 'sg-2008', usa: 'us-2012', mex: 'mx-1962', bra: 'br-1940', lvg: 'us-2023', qat: 'qa-2004', abu: 'ae-2009', imo: 'it-1953', por: 'pt-2008', mug: 'it-1914', sep: 'my-1999', ist: 'tr-2005', nur: 'de-1927' };
const out = {};
for (const [id, gid] of Object.entries(MAP)) {
  const f = d.features.find((x) => x.properties.id === gid);
  if (!f) { console.error('missing', id); continue; }
  let c = f.geometry.coordinates;
  const lat0 = c.reduce((s, p) => s + p[1], 0) / c.length * Math.PI / 180;
  const lon0 = c.reduce((s, p) => s + p[0], 0) / c.length;
  const latm = c.reduce((s, p) => s + p[1], 0) / c.length;
  let pts = c.map(([lon, lat]) => [Math.round((lon - lon0) * 111320 * Math.cos(lat0)), Math.round(-(lat - latm) * 110540)]);
  // drop duplicated closing point
  const a = pts[0], b = pts[pts.length - 1];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) pts.pop();
  // dedupe close points
  const ded = [pts[0]];
  for (const p of pts.slice(1)) { const q = ded[ded.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 4) ded.push(p); }
  out[id] = { name: f.properties.Name, len: f.properties.length, pts: ded };
}
// Hand-authored (approximate) layouts for non-F1 venues
out.lem = { name: 'Circuit de la Sarthe', len: 13626, manual: true, pts: [[0, 250], [0, -300], [80, -550], [200, -650], [260, -600], [300, -640], [360, -620], [500, -700], [650, -650], [800, -600], [900, -500], [1300, 400], [1280, 430], [1340, 450], [1335, 500], [1600, 1050], [1590, 1080], [1650, 1100], [1645, 1150], [2300, 2600], [2380, 2700], [2330, 2760], [1500, 3000], [900, 3150], [750, 3180], [700, 3130], [620, 3150], [540, 3200], [500, 3000], [300, 1800], [250, 1600], [320, 1450], [200, 1300], [250, 1100], [150, 700], [110, 450], [50, 430], [60, 360], [10, 330]] };
out.fuj = { name: 'Fuji Speedway', len: 4563, manual: true, pts: [[0,0],[-500,0],[-1000,0],[-1350,0],[-1420,30],[-1430,110],[-1380,150],[-1300,170],[-1200,230],[-1120,330],[-1000,400],[-860,430],[-720,500],[-620,620],[-560,740],[-560,860],[-610,900],[-680,880],[-700,820],[-660,760],[-560,700],[-420,690],[-280,720],[-150,700],[-80,640],[-40,660],[-60,720],[40,760],[140,700],[200,620],[260,600],[300,520],[260,460],[200,420],[200,320],[260,240],[300,140],[260,60],[180,20],[100,0]] };
return out;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
const out = referenceCircuits();
console.log(Object.entries(out).map(([k, v]) => `${k}:${v.pts.length}`).join(' '));
}
