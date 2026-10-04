// 3D savings jar: coins drop in to show savings as a share of income.
// Built lazily the first time the Reflection tab is shown.
import * as THREE from "three";

const host = document.getElementById("jar");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX_COINS = 60;
let jar = null;

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) {
    return false;
  }
}

function buildJar() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.4, 7.4);
  camera.lookAt(0, -0.1, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 5, 4);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);

  // Glass body, rim, base and a green label band.
  const glass = new THREE.MeshStandardMaterial({
    color: 0xcfeccd, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.05, 2.7, 64, 1, true), glass);
  body.renderOrder = 2;
  group.add(body);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xdff3dc, transparent: true, opacity: 0.6, roughness: 0.1 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.06, 16, 64), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.35;
  group.add(rim);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.08, 64),
    new THREE.MeshStandardMaterial({ color: 0xbfe3bb, transparent: true, opacity: 0.5 }));
  base.position.y = -1.35;
  group.add(base);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.165, 1.155, 0.42, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x41ab3a, roughness: 0.6, side: THREE.DoubleSide }));
  band.position.y = 0.55;
  band.renderOrder = 3;
  group.add(band);

  const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 36);
  // Gold coins = money invested, silver coins = money left over.
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8b43a, metalness: 0.75, roughness: 0.28 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.8, roughness: 0.3 });
  const coins = [];

  // Fixed, natural-looking resting places: 6 per layer, rotated a little each layer.
  function slot(i) {
    const layer = Math.floor(i / 6);
    const k = i % 6;
    const angle = k * (Math.PI / 3) + layer * 0.55;
    const r = k === 0 && layer % 2 ? 0 : 0.6;
    return {
      pos: new THREE.Vector3(Math.cos(angle) * r, -1.27 + layer * 0.24, Math.sin(angle) * r),
      rot: new THREE.Euler((Math.sin(i * 12.9) * 0.35), i * 1.7, (Math.cos(i * 7.3) * 0.35)),
    };
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  function setTarget(summary) {
    const n = Math.round((summary.savings_ratio || 0) * MAX_COINS);
    glass.color.set(summary.overspent ? 0xf3b9b9 : 0xcfeccd);
    rimMat.color.set(summary.overspent ? 0xf6cccc : 0xdff3dc);
    while (coins.length < n) {
      const i = coins.length;
      const { pos, rot } = slot(i);
      const coin = new THREE.Mesh(coinGeo, gold);
      coin.rotation.copy(rot);
      coin.userData = { target: pos, vy: 0 };
      coin.position.set(pos.x, reduceMotion ? pos.y : 2.6 + Math.random() * 0.8, pos.z);
      group.add(coin);
      coins.push(coin);
    }
    while (coins.length > n) group.remove(coins.pop());
    const goldCount = Math.min(n, Math.round((summary.invested_ratio || 0) * MAX_COINS));
    coins.forEach((c, i) => (c.material = i < goldCount ? gold : silver));
    // Stagger new drops so they fall one after another.
    let stagger = 0;
    coins.forEach((c) => {
      if (c.position.y > c.userData.target.y + 0.001 && !c.userData.dropping) {
        c.userData.dropping = true;
        c.userData.startAt = performance.now() + stagger;
        stagger += 45;
      }
    });
  }

  function frame(now) {
    if (!reduceMotion) group.rotation.y += 0.004;
    coins.forEach((c) => {
      const d = c.userData;
      if (!d.dropping || now < d.startAt) return;
      d.vy -= 0.012;
      c.position.y += d.vy;
      c.rotation.x += 0.15;
      if (c.position.y <= d.target.y) {
        c.position.y = d.target.y;
        c.rotation.x = slot(coins.indexOf(c)).rot.x;
        d.dropping = false;
        d.vy = 0;
      }
    });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  host.classList.add("has-webgl");
  return { setTarget };
}

function ensureJar() {
  if (jar || !host || host.offsetParent === null) return;
  try {
    jar = buildJar();
    if (window.__jarSummary) jar.setTarget(window.__jarSummary);
  } catch (e) {
    console.warn("3D jar disabled:", e);
    host.classList.add("no-webgl");
  }
}

if (!host || !webglAvailable()) {
  host?.classList.add("no-webgl");
} else {
  document.addEventListener("reflection-shown", () => requestAnimationFrame(ensureJar));
  document.addEventListener("savings-update", (e) => jar?.setTarget(e.detail));
  ensureJar(); // in case the page opened on the Reflection tab
}
