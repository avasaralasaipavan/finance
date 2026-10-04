// Soft 3D background on every page: ₹ coins, notes and gems drifting upward behind the content.
// Layout is seeded and motion is driven by wall-clock time, so the scene carries on
// seamlessly from one page to the next instead of jumping.
import * as THREE from "three";
import {
  canvasTexture, coinTexture, cssColor, loopWhileVisible, onThemeChange,
  reduceMotion, smallScreen, webglAvailable,
} from "./three-common.js";

if (!document.body.classList.contains("no-bg3d") && webglAvailable()) {
  try {
    init();
  } catch (e) {
    console.warn("3D background disabled:", e);
  }
}

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function noteTexture() {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#3f9f39";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = "800 72px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₹", w / 2, h / 2 + 4);
    ctx.font = "700 24px Inter, Arial, sans-serif";
    ctx.fillText("500", 44, 34);
    ctx.fillText("500", w - 44, h - 30);
  });
}

function init() {
  const host = document.createElement("div");
  host.className = "bg3d";
  host.setAttribute("aria-hidden", "true");
  document.body.prepend(host);

  const small = smallScreen();
  const renderer = new THREE.WebGLRenderer({ antialias: !small, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(cssColor("--bg"), 11, 30);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x335533, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 6, 5);
  scene.add(key);

  const coinFace = new THREE.MeshStandardMaterial({ map: coinTexture(), metalness: 0.6, roughness: 0.35 });
  const coinEdge = new THREE.MeshStandardMaterial({ color: 0xd9a21e, metalness: 0.8, roughness: 0.3 });
  const noteMat = new THREE.MeshStandardMaterial({ map: noteTexture(), roughness: 0.8, side: THREE.DoubleSide });
  const gemMat = new THREE.MeshStandardMaterial({
    color: cssColor("--brand"), flatShading: true, roughness: 0.4, transparent: true, opacity: 0.6,
  });

  const geos = {
    coin: new THREE.CylinderGeometry(0.36, 0.36, 0.06, 32),
    note: new THREE.BoxGeometry(1.1, 0.55, 0.012),
    gem: new THREE.IcosahedronGeometry(0.34, 0),
  };
  const counts = small ? { coin: 6, note: 3, gem: 2 } : { coin: 12, note: 5, gem: 4 };
  const rand = seeded(20240601);
  const items = [];
  for (const [kind, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        geos[kind],
        kind === "coin" ? [coinEdge, coinFace, coinFace] : kind === "note" ? noteMat : gemMat,
      );
      mesh.userData = {
        z: -10 - rand() * 16,
        fx: rand() * 2 - 1,                  // horizontal position as a fraction of the view width
        y0: rand(),                          // starting point of the upward drift
        rise: 0.015 + rand() * 0.025,        // view-heights per second
        spin: [rand() * 0.6 - 0.3, rand() * 0.8 - 0.4, rand() * 0.4 - 0.2],
        phase: rand() * Math.PI * 2,
      };
      items.push(mesh);
      scene.add(mesh);
    }
  }

  let halfW = 1, halfH = 1;
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    halfW = halfH * camera.aspect;
    if (reduceMotion) frame();
  }
  addEventListener("resize", resize);

  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  addEventListener("deviceorientation", (e) => {
    if (e.gamma == null) return;
    pointer.x = Math.max(-1, Math.min(1, e.gamma / 30));
    pointer.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  }, { passive: true });

  function frame() {
    const t = reduceMotion ? 0 : Date.now() / 1000;
    for (const m of items) {
      const d = m.userData;
      const depth = -d.z;
      const span = halfH * depth * 2.4;      // a bit taller than the view so items enter/leave off-screen
      const p = (d.y0 + t * d.rise) % 1;
      m.position.set(d.fx * halfW * depth * 1.1, (p - 0.5) * span, d.z);
      m.rotation.set(t * d.spin[0] + d.phase, t * d.spin[1] + d.phase, t * d.spin[2]);
    }
    const scroll = Math.min(scrollY, 2000) * 0.0012;
    camera.position.x += (pointer.x * 0.7 - camera.position.x) * 0.04;
    camera.position.y += (-pointer.y * 0.45 - scroll - camera.position.y) * 0.04;
    camera.lookAt(camera.position.x * 0.3, camera.position.y * 0.3, -10);
    renderer.render(scene, camera);
  }

  onThemeChange(() => {
    scene.fog.color = cssColor("--bg");
    gemMat.color = cssColor("--brand");
    if (reduceMotion) frame();
  });
  document.fonts?.ready.then(() => {
    coinFace.map = coinTexture();
    noteMat.map = noteTexture();
    coinFace.needsUpdate = noteMat.needsUpdate = true;
  });

  resize();
  if (!reduceMotion) loopWhileVisible(renderer, frame);
  requestAnimationFrame(() => host.classList.add("ready"));
}
