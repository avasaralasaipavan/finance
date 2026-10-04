// Reusable 3D bar chart. Bars grow in, follow the pointer a little, and show a tooltip on hover.
// Labels are HTML, positioned under each bar, so text stays crisp and readable.
import * as THREE from "three";
import { cssColor, loopWhileVisible, onThemeChange, reduceMotion, webglAvailable } from "./three-common.js";

/**
 * @param host  element to fill (needs a height)
 * @param opts  { bars: [{label, value, color (CSS var name), display}], labelEvery, showValues, ariaLabel }
 * @returns { update(bars) } or null when WebGL is unavailable (host gets a .bars3d-fallback list)
 */
export function bars3d(host, opts) {
  host.classList.add("bars3d");
  host.setAttribute("role", "img");
  if (opts.ariaLabel) host.setAttribute("aria-label", opts.ariaLabel);
  if (!webglAvailable()) return fallback(host, opts.bars);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const labels = document.createElement("div");
  labels.className = "bars3d-labels";
  host.appendChild(labels);
  const tip = document.createElement("div");
  tip.className = "bars3d-tip";
  host.appendChild(tip);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 6, 5);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);
  const baseMat = new THREE.MeshStandardMaterial({ color: cssColor("--surface-sunk"), roughness: 0.9 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 1.4), baseMat);
  base.position.y = -0.04;
  group.add(base);

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0); // grow up from the base
  const MAX_H = 2.2;
  let bars = [];
  let meshes = [];
  let spanX = 1;

  function layout(next) {
    bars = next;
    const n = bars.length;
    const gap = n > 12 ? 0.18 : 0.45;
    const w = Math.min(1, 6 / n);
    spanX = n * w + (n - 1) * w * gap;
    base.scale.set(spanX + 0.6, 1, 1);
    while (meshes.length > n) group.remove(meshes.pop());
    while (meshes.length < n) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 }));
      m.scale.y = 0.0001;
      meshes.push(m);
      group.add(m);
    }
    const max = Math.max(...bars.map((b) => Math.abs(b.value)), 1e-9);
    meshes.forEach((m, i) => {
      const b = bars[i];
      m.position.x = -spanX / 2 + w / 2 + i * w * (1 + gap);
      m.scale.x = w;
      m.scale.z = Math.min(w, 0.9);
      m.material.color = b.value < 0 ? cssColor("--danger") : cssColor(b.color || "--series-1");
      m.visible = b.value !== 0; // an empty month shows no slab
      m.userData.from = m.scale.y;
      m.userData.to = Math.max(0.0001, (Math.abs(b.value) / max) * MAX_H) * (b.value < 0 ? -1 : 1);
      m.userData.delay = i * (n > 12 ? 15 : 90);
    });
    growStart = performance.now();
    labels.innerHTML = bars.map((b, i) => {
      const show = opts.showValues && n <= 8;
      const lbl = i % (opts.labelEvery || 1) === 0 ? b.label : "";
      return `<span class="bars3d-label" data-i="${i}">${show ? `<b>${b.display ?? b.value}</b>` : ""}${lbl}</span>`;
    }).join("");
    fit();
  }

  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull the camera back far enough that the whole row fits the width.
    const dist = Math.max(7.6, (spanX + 1.4) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect) * 1.05);
    camera.position.set(0, dist * 0.42, dist);
    camera.lookAt(0, 0.85, 0);
    camera.updateProjectionMatrix();
    placeLabels();
  }

  const v = new THREE.Vector3();
  function placeLabels() {
    const w = host.clientWidth, h = host.clientHeight;
    labels.querySelectorAll(".bars3d-label").forEach((el) => {
      const m = meshes[el.dataset.i];
      if (!m) return;
      v.set(m.position.x, -0.1, 0.7).applyMatrix4(group.matrixWorld).project(camera);
      el.style.left = `${((v.x + 1) / 2) * w}px`;
      el.style.top = `${Math.min(h - 18, ((1 - v.y) / 2) * h + 6)}px`;
    });
  }

  // Hover: lift the bar and show its value.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hover = -1, tilt = 0;
  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    tilt = ndc.x;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes)[0];
    hover = hit ? meshes.indexOf(hit.object) : -1;
    if (hover >= 0) {
      const b = bars[hover];
      tip.innerHTML = `<b>${b.display ?? b.value}</b><span>${b.tipLabel || b.label}</span>`;
      tip.style.left = `${e.clientX - r.left}px`;
      tip.style.top = `${e.clientY - r.top}px`;
      tip.classList.add("show");
    } else tip.classList.remove("show");
  });
  host.addEventListener("pointerleave", () => { hover = -1; tilt = 0; tip.classList.remove("show"); });

  let growStart = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function frame(now = performance.now()) {
    meshes.forEach((m, i) => {
      const d = m.userData;
      const p = reduceMotion ? 1 : Math.min(1, Math.max(0, (now - growStart - d.delay) / 750));
      m.scale.y = d.from + (d.to - d.from) * ease(p);
      const lift = i === hover ? 0.12 : 0;
      m.position.y += (lift - m.position.y) * 0.2;
      m.material.emissive?.setScalar(i === hover ? 0.12 : 0);
    });
    if (!reduceMotion) group.rotation.y += (tilt * 0.25 - 0.12 - group.rotation.y) * 0.06;
    else group.rotation.y = -0.12;
    group.updateMatrixWorld();
    placeLabels();
    renderer.render(scene, camera);
  }

  new ResizeObserver(fit).observe(host);
  onThemeChange(() => {
    baseMat.color = cssColor("--surface-sunk");
    meshes.forEach((m, i) => (m.material.color = bars[i].value < 0 ? cssColor("--danger") : cssColor(bars[i].color || "--series-1")));
  });
  layout(opts.bars);
  loopWhileVisible(renderer, frame);
  host.classList.add("ready");
  return { update: layout };
}

function fallback(host, bars) {
  host.classList.add("bars3d-fallback");
  const draw = (list) => {
    const max = Math.max(...list.map((b) => Math.abs(b.value)), 1e-9);
    host.innerHTML = `<ul>${list.map((b) => `<li><span>${b.label}</span>
      <i style="width:${(Math.abs(b.value) / max) * 100}%;background:var(${b.value < 0 ? "--danger" : b.color || "--series-1"})"></i>
      <b>${b.display ?? b.value}</b></li>`).join("")}</ul>`;
  };
  draw(bars);
  return { update: draw };
}
