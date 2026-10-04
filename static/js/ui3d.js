// Lightweight 3D UI effects (no WebGL): card tilt + glare, count-up numbers,
// flying coins, the year bookshelf (open-on-click + phone coverflow).
(function () {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const root = document.documentElement;

  // Cards animate in only on first load, never on later re-renders.
  root.classList.add("boot");
  setTimeout(() => root.classList.remove("boot"), 1400);

  // --- tilt + glare ------------------------------------------------------------
  // Forms, tables and anything typed into stay flat.
  const TILT = ".stat, .card:not(.quick-add):not(.table-card):not(.auth-card):not(.settings-form):not(.week), .tilt";
  if (canHover && !reduce) {
    let active = null;
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest(TILT);
      if (el !== active) {
        if (active) reset(active);
        active = el;
      }
      if (!el || e.target.closest("input, textarea, select, table, canvas")) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const strength = Math.max(2, Math.min(7, 2400 / r.width)); // big cards tilt less
      el.style.setProperty("--rx", `${(0.5 - y) * strength}deg`);
      el.style.setProperty("--ry", `${(x - 0.5) * strength}deg`);
      el.style.setProperty("--gx", `${x * 100}%`);
      el.style.setProperty("--gy", `${y * 100}%`);
      el.classList.add("tilting");
    }, { passive: true });
    document.addEventListener("pointerleave", () => active && reset(active));
    function reset(el) {
      el.classList.remove("tilting");
      el.style.removeProperty("--rx");
      el.style.removeProperty("--ry");
    }
  }

  // --- count-up numbers -----------------------------------------------------------
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
  const parse = (text) => {
    const n = Number(String(text).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  /** Animate el's text from its current number to `value`, formatted as rupees unless `plain`. */
  function countTo(el, value, plain = false) {
    const fmt = plain ? (v) => String(Math.round(v)) : (v) => inr.format(v);
    if (value === null || value === undefined) { el.textContent = "—"; return; }
    const from = parse(el.textContent) ?? 0;
    if (reduce || from === value) { el.textContent = fmt(value); return; }
    const start = performance.now(), dur = 700;
    cancelAnimationFrame(el._countRaf);
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (value - from) * e);
      if (p < 1) el._countRaf = requestAnimationFrame(step);
      else el.textContent = fmt(value);
    };
    el._countRaf = requestAnimationFrame(step);
  }

  // Server-rendered amounts (year view, portfolio, admin) count up on load.
  function countUpStatic() {
    document.querySelectorAll(".stat-value:not([data-stat]), .month-flow dd").forEach((el) => {
      const text = el.textContent.trim();
      const value = parse(text);
      if (value === null || text === "—") return;
      const plain = !text.includes("₹");
      el.textContent = plain ? "0" : inr.format(0);
      setTimeout(() => countTo(el, value, plain), 150);
    });
  }

  // --- flying coin ------------------------------------------------------------------
  /** A spinning ₹ coin arcs from one element to another, then the target bumps. */
  function flyCoin(from, to) {
    if (!from || !to) return;
    if (reduce) { bump(to); return; }
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const coin = document.createElement("div");
    coin.className = "fly-coin";
    coin.innerHTML = "<span>₹</span>";
    document.body.appendChild(coin);
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    const x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const lift = Math.min(y0, y1) - 120;
    const anim = coin.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6) rotateY(0deg)`, opacity: 0 },
      { transform: `translate(${(x0 + x1) / 2}px, ${lift}px) scale(1.25) rotateY(540deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) scale(.5) rotateY(1080deg)`, opacity: 0.2 },
    ], { duration: 900, easing: "cubic-bezier(.3,.7,.4,1)" });
    anim.onfinish = () => { coin.remove(); bump(to); };
  }
  function bump(el) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  // --- year bookshelf ---------------------------------------------------------------
  function initShelf() {
    const shelf = document.querySelector("[data-shelf]");
    if (!shelf) return;

    // Clicking a book swings its cover open before navigating.
    shelf.addEventListener("click", (e) => {
      const book = e.target.closest(".book");
      if (!book || reduce || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      book.classList.add("opening");
      setTimeout(() => (location.href = book.href), 520);
    });
    addEventListener("pageshow", (e) => {
      if (e.persisted) shelf.querySelectorAll(".opening").forEach((b) => b.classList.remove("opening"));
    });

    // Phones: the shelf becomes a swipeable coverflow; tilt each book by its distance from centre.
    const books = Array.from(shelf.querySelectorAll(".book"));
    let raf = 0;
    function coverflow() {
      raf = 0;
      if (getComputedStyle(shelf).overflowX !== "auto") {
        books.forEach((b) => { b.style.removeProperty("--flow"); b.style.removeProperty("z-index"); });
        return;
      }
      const mid = shelf.getBoundingClientRect().left + shelf.clientWidth / 2;
      books.forEach((b) => {
        const r = b.getBoundingClientRect();
        const d = Math.max(-1.5, Math.min(1.5, (r.left + r.width / 2 - mid) / r.width));
        b.style.setProperty("--flow", d.toFixed(3));
        b.style.zIndex = String(100 - Math.round(Math.abs(d) * 20)); // centre book in front
      });
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(coverflow); };
    shelf.addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    // Start the phone carousel on the current month (or the first month with data).
    const start = shelf.querySelector(".book.is-current") || shelf.querySelector(".book.has-data");
    if (start && getComputedStyle(shelf).overflowX === "auto") {
      shelf.scrollLeft = start.offsetLeft - (shelf.clientWidth - start.offsetWidth) / 2;
    }
    coverflow();
  }

  window.UI3D = { countTo, flyCoin, bump };
  document.addEventListener("DOMContentLoaded", () => {
    countUpStatic();
    initShelf();
  });
})();
