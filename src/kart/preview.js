// Kart Baso — garage turntable: one kart and its driver spinning on a podium (menu screens).
import * as THREE from 'three';
import { makeKart, toon } from './models.js';
import { charById, PAINTS } from './data.js';
import { pixelRatio } from '../ui/quality.js';

export class KartPreview {
  constructor(canvas) {
    this.cv = canvas;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(pixelRatio(1.5)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    const s = this.scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight('#ffffff', '#4a3a6a', 1.6));
    const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(4, 8, 6); s.add(d);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.3, 40), toon('#2a2f37')); pod.position.y = -0.15; s.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.06, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b6b' })); s.add(ring);
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100); this.cam.position.set(4.6, 3.1, 6.2); this.cam.lookAt(0, 0.8, 0);
    this.spin = 0.6; this.loop = this.loop.bind(this); this.last = performance.now();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas);
    this.resize(); this.raf = requestAnimationFrame(this.loop);
  }
  set(sel) {
    const key = JSON.stringify(sel); if (key === this.key) return; this.key = key;
    if (this.kart) { this.scene.remove(this.kart); }
    const paint = PAINTS.find((p) => p.id === sel.paint && p.color);
    this.kart = makeKart(charById(sel.char), { body: sel.body, wheels: sel.wheels, paint, num: 1 });
    this.kart.scale.setScalar(1.25); this.scene.add(this.kart);
    this.bounce = 0.35;
  }
  resize() { const w = this.cv.clientWidth || 300, h = this.cv.clientHeight || 200; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  loop(now) {
    if (!this.cv.isConnected) { this.destroy(); return; }
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.kart) {
      this.spin += dt * 0.7; this.kart.rotation.y = this.spin;
      this.bounce = Math.max(0, this.bounce - dt); this.kart.position.y = Math.sin(this.bounce / 0.35 * Math.PI) * 0.35;
      const w = this.kart.userData.wheels; for (const x of w) x.w.rotation.x += dt * 3;
    }
    this.r.render(this.scene, this.cam);
  }
  destroy() {
    if (this.dead) return; this.dead = true;
    cancelAnimationFrame(this.raf); this.ro.disconnect();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); });
    this.r.dispose(); this.r.forceContextLoss?.();
  }
}
