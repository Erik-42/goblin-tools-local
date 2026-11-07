/* Bouton qui copie un texte déjà affiché. */
(function (global) {
  "use strict";

  const t = (key, params) => I18n.t(key, params);

  function bind(root, notify) {
    root.querySelectorAll("[data-copy-target]").forEach((button) => {
      if (button.dataset.copyBound) return;
      button.dataset.copyBound = "1";
      button.addEventListener("click", async () => {
        const target = root.querySelector(button.dataset.copyTarget);
        const text = target ? target.textContent : "";
        try {
          await navigator.clipboard.writeText(text);
          if (notify) notify(t("app.toast.copied"));
        } catch {
          if (notify) notify(t("app.toast.copyFailed"));
        }
      });
    });
  }

  global.CopyText = { bind };
})(window);
