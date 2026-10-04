// Admin dashboard: entries per day and sign-ups per month as 3D bars.
import { bars3d } from "./bars3d.js";

const dataEl = document.getElementById("admin-stats");
if (dataEl) {
  const data = JSON.parse(dataEl.textContent);

  // Last 30 days, with empty days filled in so the axis is continuous.
  const byDay = Object.fromEntries(data.daily.map((r) => [r.day, r.n]));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = key.slice(5).split("-").reverse().join("/");
    days.push({ label, tipLabel: `expenses on ${label}`, value: byDay[key] || 0, display: String(byDay[key] || 0) });
  }
  const daily = document.getElementById("bars-daily");
  if (daily) bars3d(daily, { bars: days, labelEvery: 5, ariaLabel: "Expenses logged per day over the last 30 days" });

  const signups = document.getElementById("bars-signups");
  if (signups) {
    bars3d(signups, {
      bars: data.signups.map((r) => ({ label: r.month, tipLabel: `sign-ups in ${r.month}`, value: r.n, display: String(r.n) })),
      showValues: true, color: "--series-1", ariaLabel: "New users per month",
    });
  }
}
