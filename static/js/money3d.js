// Month page: Income / Spent / Invested / Left over as 3D bars, kept in sync with month.js.
import { bars3d } from "./bars3d.js";

const host = document.getElementById("money-bars");
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function toBars(s) {
  return [
    { label: "Income", value: s.income, color: "--brand", display: inr.format(s.income) },
    { label: "Spent", value: s.total, color: "--series-1", display: inr.format(s.total) },
    { label: "Invested", value: s.invested, color: "--series-2", display: inr.format(s.invested) },
    { label: "Left over", value: s.left_over, color: "--series-3", display: inr.format(s.left_over) },
  ];
}

if (host) {
  const initial = window.__monthSummary || JSON.parse(document.getElementById("payload").textContent).summary;
  const chart = bars3d(host, {
    bars: toBars(initial), showValues: true,
    ariaLabel: "This month: income, spent, invested and left over",
  });
  document.addEventListener("summary-update", (e) => chart?.update(toBars(e.detail)));
}
