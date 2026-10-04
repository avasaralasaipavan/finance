// Admin panel: confirm dialogs for destructive forms. (Dashboard charts live in admin3d.js.)
(function () {
  "use strict";
  document.querySelectorAll("form[data-confirm]").forEach((f) =>
    f.addEventListener("submit", (e) => {
      if (!confirm(f.dataset.confirm)) e.preventDefault();
    })
  );
})();
