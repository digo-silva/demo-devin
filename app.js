(function () {
  "use strict";

  var refreshBtn = document.getElementById("refresh");
  if (!refreshBtn) return;

  function randomizeMetrics() {
    var elements = document.querySelectorAll("[data-metric]");
    elements.forEach(function (el) {
      var base = parseInt(el.textContent, 10) || 0;
      var delta = Math.floor(Math.random() * 7) - 3;
      var next = Math.max(0, base + delta);
      el.textContent = String(next);
    });
  }

  refreshBtn.addEventListener("click", function () {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Atualizando…";
    setTimeout(function () {
      randomizeMetrics();
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Atualizar";
    }, 400);
  });
})();
