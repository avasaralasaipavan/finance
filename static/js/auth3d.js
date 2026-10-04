// Login / signup pages: a floating 3D journal (users) or a vault door (admins).
// Submitting the form plays an "open" animation first: the journal cover swings
// open, or the vault wheel spins and the door unlocks.
import * as THREE from "three";
import {
  coinTexture, coverTexture, cssColor, loopWhileVisible, onThemeChange, reduceMotion, webglAvailable,
} from "./three-common.js";

const host = document.getElementById("auth-scene");
if (host && webglAvailable()) {
  try {
    init(host.dataset.variant === "vault" ? buildVault : buildJournal);
  } catch (e) {
    console.warn("3D login scene disabled:", e);
  }
}

function buildJournal(scene) {
  const W = 2.4, H = 3.4, T = 0.34, C = 0.06;
  const book = new THREE.Group();
  const darkGreen = new THREE.MeshStandardMaterial({ color: 0x23801f, roughness: 0.6 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, H + 0.08, C), darkGreen);
  back.position.z = -T / 2 - C / 2;
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xf3f0e4, roughness: 0.9 });
  const pages = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, H - 0.05, T), pageMat);
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2 - 0.04, 0, T / 2 + C / 2);
  const green = new THREE.MeshStandardMaterial({ color: 0x41ab3a, roughness: 0.55 });
  const face = new THREE.MeshStandardMaterial({ map: coverTexture(), roughness: 0.5 });
  const inside = new THREE.MeshStandardMaterial({ color: 0xe9f5e6, roughness: 0.8 });
  const cover = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, H + 0.08, C), [green, green, green, green, face, inside]);
  cover.position.x = (W + 0.08) / 2;
  hinge.add(cover);
  book.add(back, pages, hinge);
  scene.add(book);

  const coinMat = new THREE.MeshStandardMaterial({ map: coinTexture(), metalness: 0.6, roughness: 0.3 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xd9a21e, metalness: 0.8, roughness: 0.3 });
  const coins = Array.from({ length: 6 }, (_, i) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 36), [edge, coinMat, coinMat]);
    c.userData.a = (i / 6) * Math.PI * 2;
    scene.add(c);
    return c;
  });

  return {
    object: book,
    tick(t, open) {
      coins.forEach((c, i) => {
        const a = c.userData.a + t * 0.35;
        c.position.set(Math.cos(a) * 2.3, Math.sin(t * 0.8 + i) * 0.3 + Math.sin(a) * 0.9, Math.sin(a) * 1.2);
        c.rotation.set(Math.PI / 2 + Math.sin(t + i) * 0.3, 0, t * 1.4 + i);
      });
      hinge.rotation.y = -2.3 * open;
    },
    refresh() { face.map = coverTexture(); coinMat.map = coinTexture(); face.needsUpdate = coinMat.needsUpdate = true; },
  };
}

function buildVault(scene) {
  const vault = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1f5f1c, metalness: 0.55, roughness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.25 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8b43a, metalness: 0.85, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0e2a0d, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 1.4), metal);
  body.position.z = -0.7;
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.05, 64), dark);
  hole.rotation.x = Math.PI / 2;
  hole.position.z = 0.01;

  // Gold bars inside, revealed when the door opens.
  const bars = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.1), gold);
    b.position.set(-0.66 + (i % 3) * 0.66, -0.45 + Math.floor(i / 3) * 0.3, 0.09);
    bars.add(b);
  }

  const hinge = new THREE.Group();
  hinge.position.set(-1.3, 0, 0.32);
  const door = new THREE.Group();
  door.position.x = 1.3;
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.22, 64), metal);
  plate.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.07, 16, 64), steel);
  rim.position.z = 0.11;
  door.add(plate, rim);
  for (let i = 0; i < 12; i++) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16), steel);
    const a = (i / 12) * Math.PI * 2;
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0.13);
    door.add(bolt);
  }
  const wheel = new THREE.Group();
  wheel.position.z = 0.3;
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 12, 48), steel));
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 12), steel);
    spoke.rotation.z = (i / 3) * Math.PI;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 24), gold);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  door.add(wheel);
  hinge.add(door);
  vault.add(body, hole, bars, hinge);
  scene.add(vault);

  return {
    object: vault,
    tick(t, open) {
      wheel.rotation.z = t * 0.25 + open * Math.PI * 3;
      hinge.rotation.y = -1.9 * Math.max(0, (open - 0.45) / 0.55);
    },
  };
}

function init(build) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.2, 10);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2b5f2b, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(4, 5, 6);
  scene.add(key);
  const rim = new THREE.PointLight(cssColor("--brand"), 14, 14);
  rim.position.set(-3, -2, 3);
  scene.add(rim);
  onThemeChange(() => (rim.color = cssColor("--brand")));

  const model = build(scene);
  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1 ? 12 : 10;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  // Submitting the form plays the opening animation, then really submits.
  let openStart = 0;
  const form = document.querySelector(".auth-card form");
  if (form && !reduceMotion) {
    form.addEventListener("submit", (e) => {
      if (openStart) return;
      e.preventDefault();
      openStart = performance.now();
      form.querySelector("[type=submit]")?.setAttribute("disabled", "");
      setTimeout(() => HTMLFormElement.prototype.submit.call(form), 850);
    });
    addEventListener("pageshow", (e) => {
      if (!e.persisted) return;
      openStart = 0;
      form.querySelector("[type=submit]")?.removeAttribute("disabled");
    });
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const obj = model.object;
  function frame(now) {
    const t = reduceMotion ? 0 : now / 1000;
    const open = openStart ? ease(Math.min(1, (now - openStart) / 800)) : 0;
    obj.rotation.y += ((reduceMotion ? -0.35 : -0.35 + pointer.x * 0.3) * (1 - open) - obj.rotation.y) * 0.05;
    obj.rotation.x += (0.06 + pointer.y * 0.1 - obj.rotation.x) * 0.05;
    obj.position.y = Math.sin(t * 1.1) * 0.12;
    model.tick(t, open);
    renderer.render(scene, camera);
  }
  document.fonts?.ready.then(() => model.refresh?.());
  if (reduceMotion) { frame(0); new ResizeObserver(() => frame(0)).observe(host); }
  else loopWhileVisible(renderer, frame);
  host.classList.add("ready");
}
