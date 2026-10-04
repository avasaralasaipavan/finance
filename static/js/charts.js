// Reflection charts: one series each (amount per driving force / per emotion), horizontal bars.
// Colors come from CSS tokens so light/dark mode stay in sync.
(function () {
  "use strict";
  const charts = {};
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function draw(id, rows, color) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    const labels = rows.map((r) => r.label);
    const data = rows.map((r) => r.amount);
    const counts = rows.map((r) => r.count);
    const ink = token("--text-secondary");
    const muted = token("--text-muted");
    const grid = token("--grid");

    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: color,
          hoverBackgroundColor: color,
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 22,
          categoryPercentage: 0.8,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 600 },
        interaction: { mode: "nearest", axis: "y", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: token("--surface-2"),
            titleColor: token("--text"),
            bodyColor: ink,
            borderColor: token("--border"),
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (ctx) => `${inr.format(ctx.parsed.x)} · ${counts[ctx.dataIndex]} expense${counts[ctx.dataIndex] === 1 ? "" : "s"}`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: grid, drawTicks: false },
            border: { display: false },
            ticks: { color: muted, maxTicksLimit: 5, callback: (v) => inr.format(v), font: { size: 11 } },
          },
          y: {
            grid: { display: false },
            border: { color: token("--baseline") },
            ticks: { color: ink, font: { size: 12, weight: 500 } },
          },
        },
      },
    });
  }

  window.JournalCharts = {
    render(summary) {
      draw("chart-force", summary.tallies.driving_force || [], token("--series-1"));
      draw("chart-emotion", summary.tallies.emotion || [], token("--series-1"));
    },
  };
})();
