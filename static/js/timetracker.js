// Daily time log: live quadrant pills, matrix totals and the logged-hour count.
(function () {
  "use strict";

  const form = document.getElementById("time-log-form");
  if (!form) return;

  const rows = Array.from(form.querySelectorAll("[data-time-row]"));
  const matrix = document.getElementById("time-matrix");
  const countEl = form.querySelector("[data-logged-count]");
  const hint = form.querySelector("[data-dirty-hint]");
  const QUADS = ["YY", "NY", "YN", "NN"];
  let dirty = false;

  const classify = (urgent, important) => (urgent ? "Y" : "N") + (important ? "Y" : "N");

  function markDirty() {
    if (dirty) return;
    dirty = true;
    if (hint) hint.textContent = "Unsaved changes";
  }

  function update() {
    const totals = { YY: 0, NY: 0, YN: 0, NN: 0 };
    let logged = 0;

    rows.forEach((row) => {
      const desc = row.querySelector('input[name^="task_"]');
      const urgent = row.querySelector('input[name^="urgent_"]');
      const important = row.querySelector('input[name^="important_"]');
      const pill = row.querySelector("[data-pill]");
      const filled = desc.value.trim() !== "";
      const code = classify(urgent.checked, important.checked);

      row.classList.toggle("is-filled", filled);
      pill.textContent = filled ? code : "—";
      pill.dataset.q = code;
      pill.classList.toggle("is-idle", !filled);
      if (filled) {
        logged += 1;
        totals[code] += 1;
      }
    });

    if (countEl) countEl.textContent = logged;

    if (matrix) {
      QUADS.forEach((q) => {
        const hours = matrix.querySelector(`[data-hours="${q}"]`);
        const pct = matrix.querySelector(`[data-pct="${q}"]`);
        if (hours) hours.textContent = totals[q];
        if (pct) pct.textContent = logged ? `${Math.round((totals[q] / logged) * 100)}%` : "0%";
      });
    }
  }

  form.addEventListener("input", () => { markDirty(); update(); });
  form.addEventListener("change", () => { markDirty(); update(); });
  form.addEventListener("submit", () => { dirty = false; });

  // Warn before leaving with unsaved hours.
  window.addEventListener("beforeunload", (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // The "jump to a day" picker submits as soon as a date is chosen.
  document.querySelectorAll("[data-date-jump] input[type=date]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.value) input.form.requestSubmit();
    });
  });

  update();
})();
