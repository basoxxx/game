// 3D showroom: turntable with studio lighting and drag-to-rotate
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildCar } from './cars3d.js';
import { applyHDRI } from './gfx.js';

export class Garage3D {
  constructor(container, category, livery, opts = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', cursor: 'grab' });
    this.scene = new THREE.Scene();
    try { const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.6; } catch {}
    applyHDRI(this.renderer, this.scene, 'day', { background: false, intensity: 0.9 });
    this.renderer.toneMappingExposure = 1.0;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xdde6ff, 0x111318, 0.4));
    const key = new THREE.SpotLight(0xffffff, 320, 40, 0.6, 0.6); key.position.set(4, 9, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; this.scene.add(key);
    const rim = new THREE.SpotLight(new THREE.Color(opts.accent || '#ff3b30'), 120, 40, 0.7, 0.6); rim.position.set(-6, 4, -5); this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.6); fill.position.set(-4, 3, 6); this.scene.add(fill);
    const fc = document.createElement('canvas'); fc.width = fc.height = 256; const fg = fc.getContext('2d');
    const grd = fg.createRadialGradient(128, 128, 20, 128, 128, 128); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.7, '#888888'); grd.addColorStop(1, '#000000'); fg.fillStyle = grd; fg.fillRect(0, 0, 256, 256);
    const alpha = new THREE.CanvasTexture(fc);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.4, 64), new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.35, metalness: 0.6, transparent: true, alphaMap: alpha }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.3, 4.42, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(opts.accent || '#e10600') }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; this.scene.add(ring);
    this.car = buildCar(category, livery, opts);
    this.car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.car);
    this.angle = -0.6; this.vel = 0.004; this.pitch = 0.32;
    this.dist = opts.dist || (category === 'rally' ? 9.5 : 11);
    let drag = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, a: this.angle, p: this.pitch }; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; });
    el.addEventListener('pointermove', (e) => { if (!drag) return; this.angle = drag.a + (e.clientX - drag.x) * 0.01; this.pitch = Math.max(0.05, Math.min(1.1, drag.p + (e.clientY - drag.y) * 0.005)); this.vel = 0; });
    el.addEventListener('pointerup', () => { drag = null; el.style.cursor = 'grab'; this.vel = 0.0025; });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = Math.max(6, Math.min(18, this.dist + e.deltaY * 0.01)); }, { passive: false });
    this.resize();
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(container);
    const loop = () => { this.raf = requestAnimationFrame(loop); this.render(); };
    loop();
  }
  resize() { const r = this.container.getBoundingClientRect(); if (!r.width) return; this.renderer.setSize(r.width, r.height, false); this.camera.aspect = r.width / r.height; this.camera.updateProjectionMatrix(); }
  render() {
    this.angle += this.vel;
    const d = this.dist;
    this.camera.position.set(Math.cos(this.angle) * d * Math.cos(this.pitch), 0.6 + Math.sin(this.pitch) * d, Math.sin(this.angle) * d * Math.cos(this.pitch));
    this.camera.lookAt(0, 0.5, 0);
    for (const w of this.car.userData.wheels) for (const sp of w.userData.spin) sp.rotation.z -= 0.02;
    this.renderer.render(this.scene, this.camera);
  }
  destroy() { cancelAnimationFrame(this.raf); this._ro?.disconnect(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}

// ---- Static 3D renders of cars for UI cards (cached data URLs) ----
let snapR = null, snapScene = null, snapCam = null;
const snapCache = new Map();
export function carSnapshot(category, livery, opts = {}, w = 640, h = 300) {
  const key = [category, livery.primary, livery.secondary, livery.accent, livery.pattern, opts.number, opts.sponsor, opts.helmet, w, h, opts.angle].join('|');
  if (snapCache.has(key)) return snapCache.get(key);
  try {
    if (!snapR) {
      snapR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      snapR.toneMapping = THREE.ACESFilmicToneMapping; snapR.outputColorSpace = THREE.SRGBColorSpace;
      snapR.shadowMap.enabled = true;
      snapScene = new THREE.Scene();
      const pm = new THREE.PMREMGenerator(snapR); snapScene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; snapScene.environmentIntensity = 0.85;
      const key2 = new THREE.DirectionalLight(0xffffff, 2.2); key2.position.set(4, 8, 6); key2.castShadow = true; key2.shadow.mapSize.set(1024, 1024);
      const sc = key2.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5;
      snapScene.add(key2, new THREE.HemisphereLight(0xdde6ff, 0x222428, 0.5));
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.45 })); sh.rotation.x = -Math.PI / 2; sh.receiveShadow = true; snapScene.add(sh);
      snapCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    }
    snapR.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    snapR.setSize(w, h, false);
    const car = buildCar(category, livery, opts);
    snapScene.add(car);
    const a = opts.angle ?? -0.75, d = (category === 'rally' ? 5.4 : category === 'endurance' ? 6.2 : 6.6) * (w / h < 1.8 ? 1.2 : 1);
    snapCam.aspect = w / h; snapCam.updateProjectionMatrix();
    snapCam.position.set(Math.cos(a) * d, d * 0.26, Math.sin(a) * d * -1); snapCam.lookAt(0, 0.45, 0);
    snapR.render(snapScene, snapCam);
    const url = snapR.domElement.toDataURL('image/png');
    snapScene.remove(car);
    snapCache.set(key, url);
    return url;
  } catch (e) { console.warn('snapshot', e); return null; }
}
export function carImg(category, livery, opts = {}, w = 640, h = 300, fallback = '') {
  const url = carSnapshot(category, livery, opts, w, h);
  return url ? `<img src="${url}" alt="" style="width:100%;display:block;position:relative;z-index:1;filter:drop-shadow(0 14px 16px rgba(0,0,0,.45))">` : fallback;
}
