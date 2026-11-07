/* Bouton d'aide court, propre à chaque outil. */
(function (global) {
  "use strict";

  function bind(root) {
    root.querySelectorAll(".tool-help").forEach((help) => {
      const toggle = help.querySelector(".tool-help__toggle");
      const text = help.querySelector(".tool-help__text");
      if (!toggle || !text || toggle.dataset.bound) return;
      toggle.dataset.bound = "1";
      toggle.addEventListener("click", () => {
        const open = text.hidden;
        text.hidden = !open;
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  global.ToolHelp = { bind };
})(window);
