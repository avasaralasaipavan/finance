// Month page: tabs, entry forms (expenses / income / investments), lists, tasks, habits,
// autosaved text, tallies, the vision review and the money-flow summary.
(function () {
  "use strict";

  const J = window.JOURNAL;
  let state = JSON.parse(document.getElementById("payload").textContent);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const csrf = document.querySelector('meta[name="csrf-token"]').content;

  const inrFmt = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
  const inr = (v) => (v === null || v === undefined ? "—" : inrFmt.format(v));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  };
  const PEN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
  const TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  const rowActions = (kind, e, label) => `
    <button class="icon-btn" data-edit="${e.id}" data-kind="${kind}" aria-label="Edit ${esc(label)}" title="Edit">${PEN}</button>
    <button class="icon-btn danger" data-delete="${e.id}" data-kind="${kind}" aria-label="Delete ${esc(label)}" title="Delete">${TRASH}</button>`;

  // --- API ------------------------------------------------------------------

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    if (res.status === 401) {
      location.href = "/login?next=" + encodeURIComponent(location.pathname);
      throw new Error("Logged out");
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }

  async function refresh() {
    state = await api("GET", J.api.month);
    render();
  }

  // --- tabs -----------------------------------------------------------------

  const tabs = $$('[role="tab"]');
  function showTab(name, animate = true) {
    if (!tabs.some((t) => t.dataset.tab === name)) name = "expenses";
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      panel.hidden = !on;
      if (on) t.parentElement.scrollTo({ left: t.offsetLeft - 16, behavior: animate ? "smooth" : "auto" });
      if (on && animate) {
        panel.classList.remove("flip-in");
        void panel.offsetWidth; // restart the animation
        panel.classList.add("flip-in");
      }
    });
    const url = new URL(location.href);
    url.searchParams.set("tab", name);
    history.replaceState(null, "", url);
    $$("[data-nav]").forEach((a) => {
      const u = new URL(a.href);
      u.searchParams.set("tab", name);
      a.href = u;
    });
    if (name === "reflection") document.dispatchEvent(new CustomEvent("reflection-shown"));
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => showTab(t.dataset.tab));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      showTab(next.dataset.tab);
    });
  });
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-goto-tab]");
    if (go) { e.preventDefault(); showTab(go.dataset.gotoTab); scrollTo({ top: 0, behavior: "smooth" }); }
  });

  // --- entry forms (shared by expenses, income, investments) ------------------

  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(J.year, J.month, 0).getDate();
  const monthStart = `${J.year}-${pad(J.month)}-01`;
  const monthEnd = `${J.year}-${pad(J.month)}-${pad(lastDay)}`;
  const defaultDate = () => (J.today >= monthStart && J.today <= monthEnd ? J.today : monthStart);

  const COIN_TARGET = { expenses: "total", incomes: "income", investments: "invested" };

  function entryForm(kind, { labelOf, onChange }) {
    const form = $(`form[data-entry="${kind}"]`);
    const errorEl = $(".form-error", form);
    const submitBtn = $(".submit", form);
    const titleEl = $(".form-title", form);
    const cancelBtn = $(".cancel-edit", form);
    const chipHosts = $$(".chip-groups", form);
    const kinds = chipHosts.flatMap((h) => h.dataset.kinds.split(","));
    let editingId = null;

    form.date.min = monthStart;
    form.date.max = monthEnd;

    function renderChips() {
      chipHosts.forEach((host) => {
        const selected = {};
        $$("input[type=radio]:checked", host).forEach((r) => (selected[r.name] = r.value));
        host.innerHTML = host.dataset.kinds.split(",").map((k) => {
          const meta = state.option_kinds[k];
          const name = `${k}_id`;
          const chips = (state.options[k] || []).map((o) => `
            <label class="chip"><input type="radio" name="${name}" value="${o.id}"
              ${String(selected[name]) === String(o.id) ? "checked" : ""}><span>${esc(o.label)}</span></label>`).join("");
          const none = meta.required ? "" : `
            <label class="chip chip-none"><input type="radio" name="${name}" value=""
              ${!selected[name] ? "checked" : ""}><span>None</span></label>`;
          return `<fieldset class="chip-group" data-kind="${k}">
              <legend>${esc(meta.title)}${meta.required ? "" : ' <small class="muted">(optional)</small>'}</legend>
              <div class="chips">${none}${chips}</div>
            </fieldset>`;
        }).join("");
      });
    }

    function reset() {
      editingId = null;
      const action = $('input[name="action"]:checked', form)?.value;
      form.reset();
      form.date.value = defaultDate();
      kinds.forEach((k) => $$(`input[name="${k}_id"]`, form).forEach((r) => (r.checked = r.value === "")));
      if (action) $(`input[name="action"][value="${action}"]`, form).checked = true; // keep last choice
      titleEl.textContent = titleEl.dataset.default;
      submitBtn.textContent = submitBtn.dataset.default;
      cancelBtn.hidden = true;
      form.classList.remove("editing");
      errorEl.textContent = "";
    }

    function startEdit(id) {
      const e = state[kind].find((x) => x.id === id);
      if (!e) return;
      editingId = id;
      $$("input:not([type=radio]), textarea", form).forEach((el) => {
        if (el.name && e[el.name] !== undefined) el.value = e[el.name];
      });
      if (e.action) $(`input[name="action"][value="${e.action}"]`, form).checked = true;
      kinds.forEach((k) => {
        const val = e[`${k}_id`] == null ? "" : String(e[`${k}_id`]);
        let radio = $(`input[name="${k}_id"][value="${val}"]`, form);
        if (!radio && val) {
          // The admin hid this value; keep it selectable while editing this entry.
          $(`.chip-group[data-kind="${k}"] .chips`, form).insertAdjacentHTML("beforeend",
            `<label class="chip chip-hidden" title="Hidden by admin"><input type="radio" name="${k}_id" value="${val}"><span>${esc(e[k])}</span></label>`);
          radio = $(`input[name="${k}_id"][value="${val}"]`, form);
        }
        if (radio) radio.checked = true;
      });
      titleEl.textContent = `Editing “${labelOf(e)}”`;
      submitBtn.textContent = "Save changes";
      cancelBtn.hidden = false;
      form.classList.add("editing");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    cancelBtn.addEventListener("click", () => { renderChips(); reset(); });
    if (onChange) form.addEventListener("change", (e) => onChange(e, form, editingId));
    if (onChange) form.addEventListener("input", (e) => onChange(e, form, editingId));

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      errorEl.textContent = "";
      const data = Object.fromEntries(new FormData(form));
      for (const k of kinds) {
        const meta = state.option_kinds[k];
        if (meta.required && !data[`${k}_id`]) {
          errorEl.textContent = `Please choose a ${meta.title}.`;
          return;
        }
      }
      submitBtn.disabled = true;
      try {
        const isNew = !editingId;
        const saved = editingId
          ? await api("PUT", `${J.api.base}/${kind}/${editingId}`, data)
          : await api("POST", `${J.api.base}/${kind}`, data);
        if (isNew) window.UI3D?.flyCoin(submitBtn, $(`[data-stat="${COIN_TARGET[kind]}"]`).closest(".stat"));
        if (kind === "expenses" && openWeeks) openWeeks.add(weekOf(saved.date)); // show the saved row
        await refresh();
        renderChips();
        reset();
        const row = $(`tr[data-kind="${kind}"][data-id="${saved.id}"]`);
        if (row) row.classList.add("row-flash");
        $('[name="item"], [name="name"], [name="amount"]', form).focus();
      } catch (err) {
        errorEl.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
      }
    });

    return { renderChips, reset, startEdit, isEditing: (id) => editingId === id };
  }

  const forms = {
    expenses: entryForm("expenses", {
      labelOf: (e) => e.item,
      // Picking a Category nudges Driving Force to the same label when nothing's chosen yet.
      onChange(e, form) {
        if (e.type !== "change" || e.target.name !== "category_id") return;
        if ($('input[name="driving_force_id"]:checked', form)) return;
        const label = e.target.nextElementSibling.textContent;
        const match = $$('input[name="driving_force_id"]', form).find((r) => r.nextElementSibling.textContent === label);
        if (match) match.checked = true;
      },
    }),
    incomes: entryForm("incomes", { labelOf: (i) => `${i.income_source} ${inr(i.amount)}` }),
    investments: entryForm("investments", {
      labelOf: (v) => v.name,
      // Typing a known investment name picks its type for you.
      onChange(e, form, editingId) {
        if (e.target.name !== "name" || editingId) return;
        const h = state.holdings.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase());
        const radio = h && $(`input[name="investment_type_id"][value="${h.investment_type_id}"]`, form);
        if (radio) radio.checked = true;
      },
    }),
  };

  // --- lists --------------------------------------------------------------------

  const emptyState = (icon, title, sub) =>
    `<div class="empty-state small"><p class="big-num">${icon}</p><h3>${title}</h3><p class="muted">${sub}</p></div>`;

  // Weeks follow the PDF's tracker pages: 1-7, 8-14, 15-21, 22-end (same as db.week_of).
  const weekOf = (iso) => Math.min(Math.floor((Number(iso.slice(8, 10)) - 1) / 7), 3) + 1;
  const currentWeek = J.today >= monthStart && J.today <= monthEnd ? weekOf(J.today) : null;
  // Which weeks are expanded. On phones only the current (or latest active) week starts open.
  let openWeeks = null;
  function initialOpenWeeks() {
    if (!matchMedia("(max-width: 760px)").matches) return new Set([1, 2, 3, 4]);
    const latest = state.expenses.length ? weekOf(state.expenses[0].date) : null; // newest first
    return new Set([currentWeek || latest].filter(Boolean));
  }

  function renderWeeks() {
    const host = $("#weeks");
    if (!state.expenses.length) {
      host.innerHTML = emptyState("✎", "No expenses yet this month", "Add your first one above. It takes under 10 seconds.");
      return;
    }
    openWeeks = openWeeks || initialOpenWeeks();
    host.innerHTML = [...state.summary.weeks].reverse().map((w) => {
      const rows = state.expenses.filter((e) => e.week === w.week);
      const range = w.week < 4 ? `${(w.week - 1) * 7 + 1}–${w.week * 7}` : `22–${lastDay}`;
      const isNow = w.week === currentWeek;
      return `<details class="week card ${isNow ? "is-current" : ""}" data-week="${w.week}" ${openWeeks.has(w.week) ? "open" : ""}>
        <summary class="week-head">
          <h3><em>Week ${w.week}</em> <span class="muted small">days ${range}</span>
            ${isNow ? `<span class="badge week-now">This week</span>` : ""}</h3>
          <span class="week-sum">
            <span class="week-total">${inr(w.total)}</span>
            <span class="muted small">${w.count} expense${w.count === 1 ? "" : "s"}</span>
          </span>
          <span class="week-chevron" aria-hidden="true"></span>
        </summary>
        ${rows.length ? `<div class="table-wrap"><table class="expense-table">
          <thead><tr><th>Date</th><th>Expense</th><th class="num">Amount</th><th>Category</th>
            <th>Driving force</th><th>Emotion</th><th>Payment</th><th>Notes</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${rows.map((e) => `
            <tr data-kind="expenses" data-id="${e.id}">
              <td data-label="Date">${fmtDate(e.date)}</td>
              <td data-label="Expense" class="strong">${esc(e.item)}</td>
              <td data-label="Amount" class="num">${inr(e.amount)}</td>
              <td data-label="Category"><span class="tag">${esc(e.category)}</span></td>
              <td data-label="Driving force">${esc(e.driving_force)}</td>
              <td data-label="Emotion">${esc(e.emotion)}</td>
              <td data-label="Payment">${esc(e.payment_method || "—")}</td>
              <td data-label="Notes" class="muted">${esc(e.notes)}</td>
              <td class="actions">${rowActions("expenses", e, e.item)}</td>
            </tr>`).join("")}
          </tbody></table></div>` : `<p class="muted week-empty">Nothing logged this week.</p>`}
      </details>`;
    }).join("");
  }
  // Remember what the user opened/closed so re-renders (after adding an entry) keep it.
  $("#weeks").addEventListener("toggle", (e) => {
    const week = Number(e.target.dataset.week);
    if (!week || !openWeeks) return;
    if (e.target.open) openWeeks.add(week); else openWeeks.delete(week);
  }, true);

  function renderIncomes() {
    const rows = state.incomes;
    const used = state.summary.tallies.income_source.filter((t) => t.count);
    $("#income-summary").innerHTML = used.map((t) =>
      `<span class="pill"><b>${esc(t.label)}</b> ${inr(t.amount)}</span>`).join("");
    $("#income-list").innerHTML = rows.length ? `<div class="card table-card"><div class="table-wrap">
      <table class="expense-table">
        <thead><tr><th>Date</th><th>Source</th><th class="num">Amount</th><th>Notes</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map((i) => `
          <tr data-kind="incomes" data-id="${i.id}">
            <td data-label="Date">${fmtDate(i.date)}</td>
            <td data-label="Source"><span class="tag tag-income">${esc(i.income_source)}</span></td>
            <td data-label="Amount" class="num strong">${inr(i.amount)}</td>
            <td data-label="Notes" class="muted">${esc(i.notes)}</td>
            <td class="actions">${rowActions("incomes", i, `${i.income_source} ${inr(i.amount)}`)}</td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr><td colspan="2">Total income</td><td class="num">${inr(state.summary.income)}</td><td colspan="2"></td></tr></tfoot>
      </table></div></div>`
      : emptyState("₹", "No income added this month", "Add your salary and any other money that came in.");
  }

  function renderInvestments() {
    const rows = state.investments;
    $("#investment-list").innerHTML = rows.length ? `<div class="card table-card"><div class="table-wrap">
      <table class="expense-table">
        <thead><tr><th>Date</th><th>Investment</th><th>Type</th><th>What happened</th><th class="num">Amount</th><th>Notes</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map((v) => `
          <tr data-kind="investments" data-id="${v.id}">
            <td data-label="Date">${fmtDate(v.date)}</td>
            <td data-label="Investment" class="strong">${esc(v.name)}</td>
            <td data-label="Type">${esc(v.investment_type)}</td>
            <td data-label="What happened"><span class="tag ${v.action === "invest" ? "tag-in" : "tag-out"}">${v.action === "invest" ? "Put in" : "Took out"}</span></td>
            <td data-label="Amount" class="num">${v.action === "invest" ? "" : "−"}${inr(v.amount)}</td>
            <td data-label="Notes" class="muted">${esc(v.notes)}</td>
            <td class="actions">${rowActions("investments", v, v.name)}</td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr><td colspan="4">Invested this month (put in − taken out)</td><td class="num">${inr(state.summary.invested)}</td><td colspan="2"></td></tr></tfoot>
      </table></div></div>`
      : emptyState("◎", "No investments recorded this month", "Add a SIP, FD, stocks, gold… or money you took out of one.");
  }

  $(".panels").addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-delete]");
    if (edit) forms[edit.dataset.kind].startEdit(Number(edit.dataset.edit));
    if (!del) return;
    const kind = del.dataset.kind;
    const entry = state[kind].find((x) => x.id === Number(del.dataset.delete));
    if (!entry) return;
    const label = kind === "expenses" ? entry.item : kind === "incomes" ? entry.income_source : entry.name;
    if (!confirm(`Delete “${label}” (${inr(entry.amount)})?`)) return;
    try {
      await api("DELETE", `${J.api.base}/${kind}/${entry.id}`);
      if (forms[kind].isEditing(entry.id)) forms[kind].reset();
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  });

  // --- stats, tallies, money flow -------------------------------------------------

  function renderStats() {
    const s = state.summary;
    const set = (k, v) => ($(`[data-stat="${k}"]`).textContent = v);
    const money = (k, v) => (window.UI3D ? window.UI3D.countTo($(`[data-stat="${k}"]`), v) : set(k, inr(v)));
    money("income", s.income);
    set("income-sub", s.income_count ? `${s.income_count} entr${s.income_count === 1 ? "y" : "ies"}` : "none added yet");
    money("total", s.total);
    set("total-sub", `${s.count} expense${s.count === 1 ? "" : "s"}`);
    money("invested", s.invested);
    set("invested-sub", s.taken_out ? `${inr(s.put_in)} in · ${inr(s.taken_out)} out` : "put into investments");
    money("left", s.left_over);
    $('[data-stat="left"]').classList.toggle("neg", s.left_over < 0);
  }

  const TALLY_TITLES = { investment_type: "Invested by type", income_source: "Income by source" };
  function renderTallies() {
    const t = state.summary.tallies;
    const order = ["category", "driving_force", "emotion", "payment_method", "income_source", "investment_type"];
    // Long, optional lists only show the values actually used this month.
    const usedOnly = new Set(["payment_method", "income_source", "investment_type"]);
    $("#tallies").innerHTML = order.filter((k) => t[k]).map((kind) => {
      const meta = state.option_kinds[kind];
      const rows = usedOnly.has(kind) ? t[kind].filter((r) => r.count) : t[kind];
      if (!rows.length) {
        return `<table class="tally"><caption>${esc(TALLY_TITLES[kind] || meta.title + " tally")}</caption>
          <tbody><tr><td class="muted">Nothing added this month.</td></tr></tbody></table>`;
      }
      const total = rows.reduce((a, r) => a + Math.max(r.amount, 0), 0);
      return `<table class="tally">
        <caption>${esc(TALLY_TITLES[kind] || meta.title + " tally")}</caption>
        <thead><tr><th>${esc(meta.title)}</th><th class="num">Count</th><th class="num">Amount</th><th class="num">Share</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>${esc(r.label)}</td><td class="num">${r.count}</td><td class="num">${inr(r.amount)}</td>
          <td class="num">${total && r.amount > 0 ? Math.round((r.amount / total) * 100) + "%" : "—"}</td></tr>`).join("")}
        </tbody></table>`;
    }).join("");
  }

  function renderFlow() {
    const s = state.summary;
    const parts = [
      { label: "Spent", value: s.total, color: "var(--series-1)" },
      { label: "Invested", value: Math.max(s.invested, 0), color: "var(--series-2)" },
      { label: "Left over", value: Math.max(s.left_over, 0), color: "var(--series-3)" },
    ];
    const whole = Math.max(s.income, parts.reduce((a, p) => a + p.value, 0)) || 1;
    const bar = $("#flow-bar");
    bar.innerHTML = parts.filter((p) => p.value > 0)
      .map((p) => `<span style="flex:${p.value / whole};background:${p.color}" title="${p.label}: ${inr(p.value)}"></span>`).join("");
    bar.setAttribute("aria-label", parts.map((p) => `${p.label} ${inr(p.value)}`).join(", "));
    $("#flow-legend").innerHTML = parts.map((p) =>
      `<li><i style="background:${p.color}"></i>${p.label} <b>${inr(p.value)}</b></li>`).join("");
  }

  // --- text fields with autosave ----------------------------------------------

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  async function savePlan(fields, hintKey) {
    const hint = hintKey && $(`[data-save-hint="${hintKey}"]`);
    if (hint) hint.textContent = "Saving…";
    try {
      state = await api("POST", J.api.month, fields);
      if (hint) hint.textContent = "Saved ✓";
      renderVisionReview();
      return true;
    } catch (err) {
      if (hint) hint.textContent = err.message;
      return false;
    }
  }

  ["vision", "achievements", "notes"].forEach((field) => {
    const el = $(`#${field}`);
    const save = debounce(() => savePlan({ [field]: el.value }, field), 700);
    el.addEventListener("input", () => {
      $(`[data-save-hint="${field}"]`).textContent = "Editing…";
      save();
    });
  });

  // --- tasks ------------------------------------------------------------------

  const progressBar = (ratio, label) =>
    `<div class="progress" role="img" aria-label="${esc(label)}"><span style="width:${Math.round(ratio * 100)}%"></span></div>`;
  const taskItem = (t, i, removable) => `
      <li class="${t.done ? "done" : ""}">
        <label><input type="checkbox" data-task="${i}" ${t.done ? "checked" : ""}><span>${esc(t.text)}</span></label>
        ${removable ? `<button class="icon-btn danger" data-task-del="${i}" aria-label="Remove task">×</button>` : ""}
      </li>`;

  function renderTasks() {
    const tasks = state.plan.tasks;
    const done = tasks.filter((t) => t.done).length;
    $("#task-progress").innerHTML = tasks.length
      ? `${progressBar(done / tasks.length, `${done} of ${tasks.length} tasks done`)}
         <span class="small"><b>${done} of ${tasks.length}</b> done${done === tasks.length ? " 🎉" : ""}</span>`
      : "";
    $("#task-list").innerHTML = tasks.length
      ? tasks.map((t, i) => taskItem(t, i, true)).join("")
      : `<li class="muted empty">No tasks yet.</li>`;
  }
  async function saveTasks(tasks) {
    state.plan.tasks = tasks;
    renderTasks();
    renderVisionReview();
    await savePlan({ tasks });
    renderTasks();
  }
  $("#task-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#task-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    saveTasks([...state.plan.tasks, { text, done: false }]);
  });
  // Tasks can be ticked on the Vision & Tasks tab or in the Reflection review.
  $(".panels").addEventListener("change", (e) => {
    const i = e.target.dataset.task;
    if (i === undefined) return;
    saveTasks(state.plan.tasks.map((t, n) => (n === Number(i) ? { ...t, done: e.target.checked } : t)));
  });
  $("#task-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-task-del]");
    if (b) saveTasks(state.plan.tasks.filter((_, n) => n !== Number(b.dataset.taskDel)));
  });

  // --- ongoing habits ---------------------------------------------------------------

  const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
  const firstWeekday = (new Date(J.year, J.month - 1, 1).getDay() + 6) % 7; // Monday = 0
  const isCurrentMonth = J.today >= monthStart && J.today <= monthEnd;
  const pct = (r) => (r === null || r === undefined ? "—" : `${Math.round(r * 100)}%`);
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const markOf = (h, iso) => ({ 1: "done", 0: "missed" }[h.checks[iso]] || "");
  const isOpenDay = (h, iso) => iso >= h.start_date && (!h.end_date || iso <= h.end_date) && iso <= J.today;
  const isStopped = (h) => h.end_date && h.end_date <= monthEnd;
  const MARK_WORDS = { done: "kept", missed: "missed", "": "not marked" };

  function habitCard(h) {
    const cells = Array.from({ length: firstWeekday }, () => `<span class="hday pad"></span>`);
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${J.year}-${pad(J.month)}-${pad(d)}`;
      const mark = markOf(h, iso);
      const label = `${fmtDate(iso)}: ${MARK_WORDS[mark]}`;
      cells.push(isOpenDay(h, iso)
        ? `<button type="button" class="hday ${mark} ${iso === J.today ? "today" : ""}" data-habit="${h.id}"
             data-date="${iso}" aria-label="${label}" title="${label}">${d}</button>`
        : `<span class="hday off">${d}</span>`);
    }
    const todayMark = markOf(h, J.today);
    const today = isCurrentMonth && isOpenDay(h, J.today) ? `
      <div class="habit-today"><span class="small">Today:</span>
        <button type="button" class="btn btn-sm habit-mark ${todayMark === "done" ? "is-done" : ""}" data-habit="${h.id}"
          data-date="${J.today}" data-set="1" aria-pressed="${todayMark === "done"}">✓ Kept</button>
        <button type="button" class="btn btn-sm habit-mark ${todayMark === "missed" ? "is-missed" : ""}" data-habit="${h.id}"
          data-date="${J.today}" data-set="0" aria-pressed="${todayMark === "missed"}">✕ Missed</button>
      </div>` : "";
    const marked = h.kept + h.missed;
    const stats = [
      marked ? `<b>${h.kept} of ${marked}</b> marked days kept · <b>${pct(h.rate)}</b>` : "No days marked yet",
      h.unmarked ? `${plural(h.unmarked, "day")} not marked` : "",
      isCurrentMonth && h.streak ? `🔥 ${h.streak}-day streak` : "",
      isStopped(h) ? `stopped ${fmtDate(h.end_date)}` : "",
    ].filter(Boolean).join(" · ");
    return `<article class="habit ${isStopped(h) ? "is-stopped" : ""}">
      <header class="habit-head">
        <div><h3>${esc(h.name)}</h3>${h.why ? `<p class="muted small">${esc(h.why)}</p>` : ""}</div>
        <div class="habit-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-habit-act="${isStopped(h) ? "resume" : "stop"}"
            data-id="${h.id}">${isStopped(h) ? "Resume" : "Stop"}</button>
          <button type="button" class="icon-btn danger" data-habit-act="delete" data-id="${h.id}"
            aria-label="Delete ${esc(h.name)}" title="Delete">${TRASH}</button>
        </div>
      </header>
      ${today}
      <div class="habit-grid" role="group" aria-label="${esc(h.name)}">
        ${WEEKDAYS.map((w) => `<span class="hdow" aria-hidden="true">${w}</span>`).join("")}${cells.join("")}
      </div>
      <p class="habit-stats small">${stats}</p>
    </article>`;
  }

  function renderHabits() {
    $("#habit-list").innerHTML = state.habits.length
      ? state.habits.map(habitCard).join("")
      : `<p class="muted habit-empty">No ongoing habits yet. Example: <i>"Didn't eat out today"</i>, with why <i>"Waste no food, eat out less"</i>.</p>`;
    $("#stopped-habits").innerHTML = state.stopped_habits.length
      ? "Stopped habits: " + state.stopped_habits.map((h) =>
          `${esc(h.name)} <button type="button" class="link-btn" data-habit-act="resume" data-id="${h.id}">Resume</button>`).join(" · ")
      : "";
  }

  const habitUrl = (path = "") => `${J.api.base}/habits${path}?year=${J.year}&month=${J.month}`;

  async function habitCall(method, path, body) {
    const err = $("#habit-error");
    err.textContent = "";
    // Keep keyboard focus on the same day/button after the list re-renders.
    const a = document.activeElement;
    const refocus = a && a.dataset && a.dataset.habit
      ? `[data-habit="${a.dataset.habit}"][data-date="${a.dataset.date}"]${a.dataset.set ? `[data-set="${a.dataset.set}"]` : ":not([data-set])"}`
      : null;
    try {
      Object.assign(state, await api(method, habitUrl(path), body));
      return true;
    } catch (e) {
      err.textContent = e.message;
      Object.assign(state, await api("GET", J.api.month).catch(() => ({})));
      return false;
    } finally {
      renderHabits();
      renderVisionReview();
      if (refocus) $(refocus)?.focus();
    }
  }

  $("#habit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    if (!data.name.trim()) return;
    if (await habitCall("POST", "", data)) form.reset();
  });

  $(".panels").addEventListener("click", (e) => {
    const day = e.target.closest("[data-habit][data-date]");
    if (day) {
      const h = state.habits.find((x) => x.id === Number(day.dataset.habit));
      const iso = day.dataset.date;
      const cur = h.checks[iso];
      let next;
      if (day.dataset.set !== undefined) {           // Today: ✓ / ✕ buttons toggle
        const want = day.dataset.set === "1";
        next = cur === (want ? 1 : 0) ? null : want;
      } else {                                       // calendar: blank → kept → missed → blank
        next = cur === 1 ? false : cur === 0 ? null : true;
      }
      if (next === null) delete h.checks[iso]; else h.checks[iso] = next ? 1 : 0;
      renderHabits();                                // instant feedback; the server reply fixes the totals
      habitCall("POST", `/${h.id}/check`, { date: iso, done: next });
      return;
    }
    const act = e.target.closest("[data-habit-act]");
    if (!act) return;
    const id = act.dataset.id;
    const action = act.dataset.habitAct;
    if (action === "delete") {
      const h = state.habits.find((x) => x.id === Number(id));
      if (!confirm(`Delete “${h.name}” and every day you've marked for it?\nTo keep its history, use Stop instead.`)) return;
      habitCall("DELETE", `/${id}`);
    } else {
      habitCall("POST", `/${id}/${action}`);
    }
  });

  // --- vision vs reality (Reflection) -------------------------------------------------

  function renderVisionReview() {
    const { vision, tasks } = state.plan;
    const done = tasks.filter((t) => t.done).length;
    const visionHtml = vision.trim()
      ? `<blockquote class="review-vision">${esc(vision)}</blockquote>`
      : `<p class="muted">No vision written for this month. <a href="#" data-goto-tab="vision">Write one</a>.</p>`;
    const verdict = done === tasks.length ? "All done 🎉" : `${plural(tasks.length - done, "task")} still open`;
    const tasksHtml = tasks.length ? `
      <h3 class="review-sub">Tasks <span class="muted small">${done} of ${tasks.length} done · ${verdict}</span></h3>
      ${progressBar(done / tasks.length, `${done} of ${tasks.length} tasks done`)}
      <ul class="task-list review-tasks">${tasks.map((t, i) => taskItem(t, i, false)).join("")}</ul>`
      : `<p class="muted small">No tasks for this month. <a href="#" data-goto-tab="vision">Add some</a>.</p>`;
    const habitsHtml = state.habits.length ? `
      <h3 class="review-sub">Ongoing habits <span class="muted small">this month</span></h3>
      <ul class="review-habits">${state.habits.map((h) => `
        <li>
          <div class="review-habit-head"><b>${esc(h.name)}</b><span class="num strong">${pct(h.rate)}</span></div>
          ${progressBar(h.rate || 0, `${h.name}: ${pct(h.rate)} of marked days kept`)}
          <p class="muted small">✓ ${h.kept} kept · ✕ ${h.missed} missed · ${h.unmarked} not marked
            · best streak ${plural(h.best_streak, "day")}${h.worst_weekday ? ` · most misses on <b>${h.worst_weekday}s</b>` : ""}</p>
        </li>`).join("")}
      </ul>`
      : `<h3 class="review-sub">Ongoing habits</h3>
         <p class="muted small">None yet. Add a daily habit on the <a href="#" data-goto-tab="vision">Vision &amp; Tasks</a> tab to see how often you kept it.</p>`;
    $("#vision-review").innerHTML = `<div class="review-cols"><div>${visionHtml}${tasksHtml}</div><div>${habitsHtml}</div></div>`;
  }

  // --- reflection visuals (charts + 3D jar) ------------------------------------

  function renderReflectionVisuals() {
    const s = state.summary;
    window.JournalCharts?.render(s);
    const label = $("#jar-label");
    if (!s.income) {
      label.innerHTML = `Add your income on the <a href="#" data-goto-tab="income">Income tab</a> to fill the jar.`;
    } else if (s.overspent) {
      label.innerHTML = `You spent <b>${inr(s.total - s.income)}</b> more than you earned.`;
    } else {
      label.innerHTML = `You kept <b>${inr(s.kept)}</b> · ${Math.round(s.savings_ratio * 100)}% of your income`;
    }
    renderFlow();
    window.__jarSummary = s;
    document.dispatchEvent(new CustomEvent("savings-update", { detail: s }));
    $(".jar-fallback span").style.height = `${Math.round(s.savings_ratio * 100)}%`;
  }

  // --- render -----------------------------------------------------------------

  function render() {
    document.dispatchEvent(new CustomEvent("summary-update", { detail: state.summary }));
    renderStats();
    renderWeeks();
    renderIncomes();
    renderInvestments();
    renderTallies();
    renderHabits();
    renderVisionReview();
    renderReflectionVisuals();
    $("#item-suggestions").innerHTML = [...new Set(state.expenses.map((e) => e.item))]
      .map((i) => `<option value="${esc(i)}">`).join("");
    $("#holding-suggestions").innerHTML = state.holdings
      .map((h) => `<option value="${esc(h.name)}">`).join("");
  }

  $("#vision").value = state.plan.vision;
  $("#achievements").value = state.plan.achievements;
  $("#notes").value = state.plan.notes;
  renderTasks();
  Object.values(forms).forEach((f) => { f.renderChips(); f.reset(); });
  render();
  showTab(J.tab, false);
  document.addEventListener("themechange", () => window.JournalCharts?.render(state.summary));
})();
