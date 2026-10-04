// Portfolio: where the money is invested, as a 3D donut you can drag to spin.
// Hovering a slice (or its legend row) lifts it out and shows its share.
import * as THREE from "three";
import { cssColor, loopWhileVisible, onThemeChange, reduceMotion, webglAvailable } from "./three-common.js";

const host = document.getElementById("donut3d");
const dataEl = document.getElementById("portfolio-allocation");
if (host && dataEl && webglAvailable()) {
  try {
    init(JSON.parse(dataEl.textContent));
  } catch (e) {
    console.warn("3D donut disabled:", e);
  }
}

function sliceGeometry(a0, a1, inner = 0.95, outer = 1.75, depth = 0.45) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, a0, a1, false);
  shape.absarc(0, 0, inner, a1, a0, true);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3, curveSegments: 48,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function init(slices) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const tip = document.createElement("div");
  tip.className = "bars3d-tip";
  host.appendChild(tip);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(3, 4, 6);
  scene.add(key);

  const donut = new THREE.Group();
  donut.rotation.x = -0.9;   // tilt it back so it reads as 3D
  scene.add(donut);

  const GAP = slices.length > 1 ? 0.025 : 0;
  let a = Math.PI / 2;
  const meshes = slices.map((s, i) => {
    const sweep = Math.max(s.share * Math.PI * 2 - GAP, 0.01);
    const m = new THREE.Mesh(sliceGeometry(a - sweep, a), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 }));
    const mid = a - sweep / 2;
    m.userData = { i, dir: new THREE.Vector3(Math.cos(mid), Math.sin(mid), 0), color: `--series-${i + 1}` };
    m.material.color = cssColor(m.userData.color);
    a -= sweep + GAP;
    donut.add(m);
    return m;
  });
  onThemeChange(() => meshes.forEach((m) => (m.material.color = cssColor(m.userData.color))));

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1 ? 9.5 : 7.5;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  // Drag to spin; it keeps a little momentum and slowly auto-rotates when idle.
  let spin = 0, vel = reduceMotion ? 0 : 0.004, dragging = false, lastX = 0, hover = -1;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  host.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; host.setPointerCapture(e.pointerId); });
  host.addEventListener("pointerup", () => (dragging = false));
  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    if (dragging) { vel = (e.clientX - lastX) * 0.01; lastX = e.clientX; }
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes)[0];
    setHover(hit ? hit.object.userData.i : -1);
    if (hover >= 0) {
      tip.style.left = `${e.clientX - r.left}px`;
      tip.style.top = `${e.clientY - r.top}px`;
    }
  });
  host.addEventListener("pointerleave", () => setHover(-1));

  // The HTML legend is the accessible version; hovering a row highlights its slice.
  document.querySelectorAll("[data-slice]").forEach((li) => {
    li.addEventListener("pointerenter", () => setHover(Number(li.dataset.slice), true));
    li.addEventListener("pointerleave", () => setHover(-1));
  });

  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  function setHover(i, fromLegend = false) {
    hover = i;
    document.querySelectorAll("[data-slice]").forEach((li) => li.classList.toggle("hl", Number(li.dataset.slice) === i));
    if (i < 0) { tip.classList.remove("show"); return; }
    const s = slices[i];
    tip.innerHTML = `<b>${Math.round(s.share * 100)}%</b><span>${s.label} · ${inr.format(s.amount)}</span>`;
    if (fromLegend) { tip.style.left = "50%"; tip.style.top = "18%"; }
    tip.classList.add("show");
  }

  function frame() {
    if (!dragging) {
      vel += ((reduceMotion ? 0 : 0.004) - vel) * 0.02;
    }
    spin += vel;
    donut.rotation.z = spin;
    meshes.forEach((m, i) => {
      const out = i === hover ? 0.22 : 0;
      m.position.lerp(m.userData.dir.clone().multiplyScalar(out), 0.15);
    });
    renderer.render(scene, camera);
  }
  loopWhileVisible(renderer, frame);
  host.classList.add("ready");
}
