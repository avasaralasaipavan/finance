// Daily time log: live quadrant totals, autosave, clear-row and jump-to-now.
(function () {
  "use strict";

  const form = document.getElementById("time-log-form");
  if (!form) return;

  const api = form.dataset.api || "";
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  const csrf = csrfMeta ? csrfMeta.content : "";
  const rows = Array.from(form.querySelectorAll("[data-time-row]"));
  const QUADS = ["YY", "NY", "YN", "NN"];
  const statusEls = Array.from(document.querySelectorAll("[data-save-status]"));
  const split = document.querySelector("[data-split]");
  const countEl = document.querySelector("[data-logged-count]");
  const moodInputs = Array.from(form.querySelectorAll('input[name="is_happy"]'));
  const notes = form.querySelector('[name="reflection_notes"]');
  const wide = window.matchMedia("(min-width: 761px)");

  let titles = {
    YY: "Do First", NY: "Schedule / Plan", YN: "Delegate / Limit", NN: "Eliminate",
  };
  try {
    const parsed = JSON.parse(form.dataset.quadrants || "{}");
    QUADS.forEach((q) => { if (parsed[q] && parsed[q].title) titles[q] = parsed[q].title; });
  } catch (e) { /* keep the defaults */ }

  let dirty = false;
  let saving = false;
  let timer = null;
  let version = 0;
  let savedVersion = 0;

  function setStatus(text, tone) {
    statusEls.forEach((el) => {
      el.textContent = text;
      el.dataset.tone = tone || "";
    });
  }

  function rowState(row) {
    const task = row.querySelector("[data-task]");
    const urgent = row.querySelector("[data-urgent]").checked;
    const important = row.querySelector("[data-important]").checked;
    return {
      text: task.value,
      filled: task.value.trim() !== "",
      hasData: task.value.trim() !== "" || urgent || important,
      urgent: urgent,
      important: important,
      code: (urgent ? "Y" : "N") + (important ? "Y" : "N"),
    };
  }

  function paint(totals, logged) {
    if (countEl) countEl.textContent = logged;
    QUADS.forEach((q) => {
      const hours = document.querySelector(`[data-hours="${q}"]`);
      const pct = document.querySelector(`[data-pct="${q}"]`);
      if (hours) hours.textContent = totals[q];
      if (pct) pct.textContent = logged ? `${Math.round((totals[q] / logged) * 100)}%` : "0%";
      if (split) {
        const seg = split.querySelector(`[data-q="${q}"]`);
        if (seg) seg.style.width = `${logged ? (totals[q] / logged) * 100 : 0}%`;
      }
    });
  }

  function update() {
    const totals = { YY: 0, NY: 0, YN: 0, NN: 0 };
    let logged = 0;

    rows.forEach((row) => {
      const state = rowState(row);
      const pill = row.querySelector("[data-pill]");
      const preview = row.querySelector("[data-preview]");

      row.classList.toggle("is-filled", state.filled);
      row.classList.toggle("has-data", state.hasData);
      if (preview) preview.textContent = state.text.trim();
      if (pill) {
        pill.textContent = state.filled ? state.code : "—";
        pill.dataset.q = state.code;
        pill.classList.toggle("is-idle", !state.filled);
        pill.title = state.filled ? titles[state.code] : "No task yet";
      }
      if (state.filled) {
        logged += 1;
        totals[state.code] += 1;
      }
    });

    paint(totals, logged);
  }

  // On a phone the hours fold down to one line each; on a wide screen every
  // row stays open so the whole day reads like a table.
  function bodyOf(row) {
    return row.querySelector("[data-row-body]");
  }

  function setOpen(row, open) {
    const body = bodyOf(row);
    const head = row.querySelector("[data-expand]");
    if (body) body.hidden = !open;
    if (head) head.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function layout() {
    rows.forEach((row) => {
      const keep = row.classList.contains("is-filled") || row.classList.contains("is-now");
      setOpen(row, wide.matches || keep);
    });
  }

  function openRow(row) {
    if (row && !wide.matches) setOpen(row, true);
  }

  function payload() {
    const slots = {};
    rows.forEach((row) => {
      const state = rowState(row);
      slots[row.dataset.slot] = {
        task_description: state.text,
        is_urgent: state.urgent,
        is_important: state.important,
      };
    });
    const mood = moodInputs.find((input) => input.checked);
    return {
      is_happy: mood ? mood.value : "",
      reflection_notes: notes ? notes.value : "",
      slots: slots,
    };
  }

  function changed() {
    dirty = true;
    version += 1;
    setStatus("Unsaved changes", "dirty");
    window.clearTimeout(timer);
    timer = window.setTimeout(save, 700);
  }

  async function save(options) {
    const keepalive = Boolean(options && options.keepalive);
    if (!api || saving) return;
    if (!dirty && !keepalive) return;

    window.clearTimeout(timer);
    saving = true;
    const sent = version;
    setStatus("Saving…", "saving");

    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(payload()),
        keepalive: keepalive,
      });
      if (!response.ok) {
        let message = "Save failed";
        try { message = (await response.json()).error || message; } catch (e) { /* ignore */ }
        throw new Error(message);
      }
      const data = await response.json();
      savedVersion = sent;
      if (version === sent) {
        dirty = false;
        setStatus(`Saved ${(data.saved_at || "").slice(0, 5)}`, "saved");
      } else {
        setStatus("Unsaved changes", "dirty");
        window.setTimeout(save, 400);
      }
    } catch (error) {
      setStatus("Couldn't save — tap Save day", "error");
    } finally {
      saving = false;
    }
  }

  // --- events -------------------------------------------------------------
  form.addEventListener("input", (event) => {
    update();
    changed();
  });
  form.addEventListener("change", (event) => {
    update();
    changed();
  });

  form.addEventListener("click", (event) => {
    const head = event.target.closest(".tt-row-head");
    if (head) {
      if (!wide.matches) {
        const row = head.closest("[data-time-row]");
        setOpen(row, bodyOf(row).hidden);
      }
      return;
    }
    const clear = event.target.closest("[data-clear]");
    if (clear) {
      const row = clear.closest("[data-time-row]");
      row.querySelector("[data-task]").value = "";
      row.querySelector("[data-urgent]").checked = false;
      row.querySelector("[data-important]").checked = false;
      update();
      changed();
      row.querySelector("[data-task]").focus();
      return;
    }
    const now = event.target.closest("[data-now]");
    if (now) {
      const slot = form.dataset.nowSlot;
      const row = slot ? form.querySelector(`[data-slot="${slot}"]`) : null;
      if (row) {
        openRow(row);
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        const input = row.querySelector("[data-task]");
        if (input) input.focus({ preventScroll: true });
      }
    }
  });

  // Enter moves to the next hour; Ctrl/Cmd+Enter saves immediately.
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const task = event.target.closest("[data-task]");
    if (!task) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      save();
      return;
    }
    event.preventDefault();
    const row = task.closest("[data-time-row]");
    const index = rows.indexOf(row);
    const next = rows[index + 1];
    if (next) {
      openRow(next);
      next.querySelector("[data-task]").focus();
    } else {
      task.blur();
    }
  });

  form.addEventListener("submit", () => {
    dirty = false;
    window.clearTimeout(timer);
  });

  window.addEventListener("beforeunload", (event) => {
    if (!dirty || saving) return;
    event.preventDefault();
    event.returnValue = "";
  });

  // Save quietly when the tab is hidden (phone lock screen, app switch).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && dirty) save({ keepalive: true });
  });

  // The "jump to a day" picker submits as soon as a date is chosen.
  document.querySelectorAll("[data-date-jump] input[type=date]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.value) input.form.requestSubmit();
    });
  });

  wide.addEventListener("change", layout);
  update();
  layout();
})();
