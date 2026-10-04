// Shared helpers for every 3D scene in the app.
import * as THREE from "three";

export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const smallScreen = () => innerWidth < 700;

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) {
    return false;
  }
}

/** A CSS custom property as a THREE.Color (theme-aware). */
export function cssColor(name, fallback = "#41ab3a") {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

/** Run cb when the light/dark theme changes (toggle or OS setting). */
export function onThemeChange(cb) {
  document.addEventListener("themechange", cb);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", cb);
}

/** Pause a renderer loop while the tab is hidden. */
export function loopWhileVisible(renderer, frame) {
  const start = () => renderer.setAnimationLoop(frame);
  document.addEventListener("visibilitychange", () =>
    document.hidden ? renderer.setAnimationLoop(null) : start());
  start();
}

// --- textures drawn on canvas (no image assets needed) -----------------------

export function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function coverTexture() {
  return canvasTexture(1024, 1448, (ctx, w, h) => {
    ctx.fillStyle = "#41ab3a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#23801f";
    ctx.lineWidth = 26;
    ctx.strokeRect(13, 13, w - 26, h - 26);

    // Doodles, echoing the PDF cover.
    ctx.strokeStyle = "rgba(20, 100, 20, .55)";
    ctx.lineWidth = 7;
    ctx.lineCap = ctx.lineJoin = "round";
    const bolt = (x, y, s) => {
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - 60 * s, y + 110 * s); ctx.lineTo(x + 5 * s, y + 100 * s);
      ctx.lineTo(x - 40 * s, y + 210 * s); ctx.lineTo(x + 70 * s, y + 80 * s); ctx.lineTo(x + 5 * s, y + 90 * s);
      ctx.closePath(); ctx.stroke();
    };
    bolt(560, 170, 1); bolt(330, 1040, 0.9);
    ctx.beginPath(); ctx.arc(760, 400, 90, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();       // bulb
    ctx.strokeRect(710, 480, 100, 50);
    ctx.beginPath(); ctx.ellipse(560, 1140, 140, 70, 0, 0, Math.PI * 2); ctx.stroke();        // speech
    ctx.beginPath(); ctx.moveTo(470, 1130); ctx.lineTo(650, 1120); ctx.moveTo(480, 1160); ctx.lineTo(600, 1158); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(150, 1230); ctx.lineTo(220, 1230); ctx.lineTo(270, 1360); ctx.lineTo(420, 1340); ctx.lineTo(440, 1250); ctx.lineTo(240, 1260); ctx.stroke(); // cart
    ctx.beginPath(); ctx.arc(290, 1390, 14, 0, 7); ctx.arc(400, 1385, 14, 0, 7); ctx.stroke();
    [[130, 470], [860, 1180], [900, 820]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(820, 160); ctx.lineTo(940, 120); ctx.lineTo(880, 260); ctx.lineTo(860, 200); ctx.closePath(); ctx.stroke(); // plane

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "alphabetic";
    ctx.font = "italic 900 132px Archivo, 'Arial Black', sans-serif";
    ctx.fillText("Personal", 120, 640);
    ctx.font = "900 212px Archivo, 'Arial Black', sans-serif";
    ctx.fillText("FINANCE", 92, 830, w - 170);
    ctx.font = "italic 900 132px Archivo, 'Arial Black', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Journal", w - 110, 960);
  });
}

export function coinTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.4, h * 0.35, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, "#ffe9a3");
    g.addColorStop(1, "#d39a16");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#b07c0c";
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 22, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#9b6a06";
    ctx.font = "800 140px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₹", w / 2, h / 2 + 6);
  });
}
