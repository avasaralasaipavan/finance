// 3D journal cover: a floating green journal with drifting ₹ coins.
// Clicking "Open" swings the front cover open, then navigates.
import * as THREE from "three";
import { canvasTexture, coinTexture, coverTexture, reduceMotion, webglAvailable } from "./three-common.js";

const host = document.getElementById("scene");

if (!host || !webglAvailable()) {
  document.body.classList.add("no-webgl");
} else {
  try {
    init();
  } catch (e) {
    console.warn("3D cover disabled:", e);
    document.body.classList.add("no-webgl");
  }
}

function firstPageTexture() {
  return canvasTexture(1024, 1448, (ctx, w, h) => {
    ctx.fillStyle = "#fbfaf5";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#41ab3a";
    ctx.font = "italic 900 96px Archivo, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Week 1", w / 2, 190);
    ctx.fillStyle = "#111";
    ctx.font = "900 92px Archivo, sans-serif";
    ctx.fillText("Expense Tracker", w / 2, 300);
    ctx.fillStyle = "#41ab3a";
    ctx.fillRect(70, 370, w - 140, 80);
    ctx.strokeStyle = "#cfd8cc";
    ctx.lineWidth = 3;
    for (let y = 450; y < h - 80; y += 82) {
      ctx.beginPath(); ctx.moveTo(70, y); ctx.lineTo(w - 70, y); ctx.stroke();
    }
    [70, 230, 420, 560, 700, w - 70].forEach((x) => {
      ctx.beginPath(); ctx.moveTo(x, 370); ctx.lineTo(x, h - 80); ctx.stroke();
    });
  });
}


// --- scene ------------------------------------------------------------------

function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 11);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2b5f2b, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.PointLight(0xb6ffb0, 18, 20);
  rim.position.set(-4, -2, 3);
  scene.add(rim);

  // Book: back cover, page block, spine and a hinged front cover.
  const W = 3, H = 4.24, T = 0.42, C = 0.07;
  const book = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: 0x41ab3a, roughness: 0.55 });
  const darkGreen = new THREE.MeshStandardMaterial({ color: 0x23801f, roughness: 0.6 });

  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, H + 0.1, C), darkGreen);
  back.position.z = -T / 2 - C / 2;
  book.add(back);

  const pageSide = new THREE.MeshStandardMaterial({ color: 0xf1eee2, roughness: 0.9 });
  const pageFront = new THREE.MeshStandardMaterial({ map: firstPageTexture(), roughness: 0.9 });
  const pages = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, H - 0.06, T),
    [pageSide, pageSide, pageSide, pageSide, pageFront, pageSide]);
  pages.position.x = 0.02;
  book.add(pages);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(C, H + 0.1, T + 2 * C), darkGreen);
  spine.position.x = -W / 2 - 0.05;
  book.add(spine);

  const hinge = new THREE.Group();
  hinge.position.set(-W / 2 - 0.05, 0, T / 2 + C / 2);
  const coverFace = new THREE.MeshStandardMaterial({ map: coverTexture(), roughness: 0.5 });
  const coverInside = new THREE.MeshStandardMaterial({ color: 0xe9f5e6, roughness: 0.8 });
  const front = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, H + 0.1, C),
    [green, green, green, green, coverFace, coverInside]);
  front.position.x = (W + 0.1) / 2;
  hinge.add(front);
  book.add(hinge);
  scene.add(book);

  // Coins
  const coinTex = coinTexture();
  const coinFace = new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.65, roughness: 0.3 });
  const coinEdge = new THREE.MeshStandardMaterial({ color: 0xd9a21e, metalness: 0.8, roughness: 0.25 });
  const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 48);
  const coins = [];
  for (let i = 0; i < 12; i++) {
    const coin = new THREE.Mesh(coinGeo, [coinEdge, coinFace, coinFace]);
    const a = (i / 12) * Math.PI * 2;
    const r = 2.8 + (i % 3) * 0.55;
    coin.userData = {
      base: new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.82, -0.6 - (i % 4) * 0.7),
      phase: Math.random() * Math.PI * 2,
      spin: 0.4 + Math.random() * 0.8,
    };
    coin.rotation.x = Math.PI / 2;
    coin.userData.size = 0.75 + Math.random() * 0.5;
    coins.push(coin);
    scene.add(coin);
  }

  // Layout: book sits right of the copy on wide screens, above it on narrow ones.
  let wide = true;
  let sceneScale = 1;
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    wide = w / h > 1.1;
    book.position.set(wide ? 2.3 : 0, wide ? 0 : 1.6, 0);
    sceneScale = wide ? 1 : 0.62;
    book.scale.setScalar(sceneScale);
    coins.forEach((c) => {
      c.position.copy(c.userData.base).multiplyScalar(sceneScale).add(book.position);
      c.scale.setScalar(c.userData.size * sceneScale);
    });
  }
  window.addEventListener("resize", resize);
  resize();

  const pointer = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  });

  // Opening animation
  let opening = null;
  window.__coverOpen = (href) => {
    if (reduceMotion) { location.href = href; return; }
    if (!opening) opening = { start: performance.now(), href };
  };
  // Coming "back" from the journal restores this page from cache: close the book again.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    opening = null;
    hinge.rotation.y = 0;
    camera.position.set(0, 0, 11);
  });
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const clock = new THREE.Clock();
  function frame(now) {
    const t = clock.getElapsedTime();
    const motion = reduceMotion ? 0 : 1;

    const targetY = -0.42 + pointer.x * 0.3 * motion;
    const targetX = 0.08 + pointer.y * 0.12 * motion;
    book.rotation.y += (targetY - book.rotation.y) * 0.05;
    book.rotation.x += (targetX - book.rotation.x) * 0.05;
    book.position.y += ((wide ? 0 : 1.6) + Math.sin(t * 1.1) * 0.08 * motion - book.position.y) * 0.1;

    coins.forEach((c) => {
      const d = c.userData;
      c.position.y = (d.base.y + Math.sin(t * 0.9 + d.phase) * 0.18 * motion) * sceneScale + book.position.y;
      c.rotation.z = t * d.spin * motion + d.phase;
    });

    if (opening) {
      const p = Math.min(1, (now - opening.start) / 1100);
      const e = ease(p);
      hinge.rotation.y = -2.5 * e;
      book.rotation.y += (-0.05 - book.rotation.y) * 0.12;
      camera.position.z = 11 - 3.2 * e;
      camera.position.x = book.position.x * e * 0.7;
      if (p >= 1 && !opening.done) {
        opening.done = true;
        location.href = opening.href;
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  // Canvas textures need the web fonts; redraw once they're ready.
  document.fonts?.ready.then(() => {
    coverFace.map = coverTexture();
    pageFront.map = firstPageTexture();
    coinFace.map = coinTexture();
    [coverFace, pageFront, coinFace].forEach((m) => (m.needsUpdate = true));
  });
  requestAnimationFrame(frame);
  document.body.classList.add("has-webgl");
}
