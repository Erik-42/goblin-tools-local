/* Curseur de piquant, réutilisé par les outils qui règlent le niveau de détail. */
(function (global) {
  "use strict";

  function clamp(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 3;
    return Math.min(5, Math.max(1, Math.round(n)));
  }

  function peppers(level) {
    return "🌶️".repeat(clamp(level));
  }

  function mount(container, options) {
    options = options || {};
    let level = clamp(options.value);
    const name = options.name || "spice";
    container.innerHTML = `
      <div class="spice">
        <button class="spice__toggle" type="button" aria-expanded="false" aria-label="Niveau de piquant">${peppers(level)}</button>
        <div class="spice__panel" hidden>
          <p class="spice__hint">${options.hint || ""}</p>
          <label class="spice__label">Niveau de piquant
            <input class="spice__slider" type="range" min="1" max="5" step="1" value="${level}" aria-label="Niveau de piquant">
          </label>
          <div class="spice__scale"><span>🌶️</span><span>🌶️🌶️🌶️🌶️🌶️</span></div>
        </div>
        <input type="hidden" name="${name}" value="${level}">
      </div>`;
    const toggle = container.querySelector(".spice__toggle");
    const panel = container.querySelector(".spice__panel");
    const slider = container.querySelector(".spice__slider");
    const hidden = container.querySelector("input[type=hidden]");

    function paint() {
      toggle.textContent = peppers(level);
      slider.value = String(level);
      hidden.value = String(level);
    }

    toggle.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    slider.addEventListener("input", () => {
      level = clamp(slider.value);
      paint();
      if (options.onChange) options.onChange(level);
    });
    paint();
    return {
      get value() { return level; },
      set value(next) { level = clamp(next); paint(); },
    };
  }

  global.Spice = { mount, peppers, clamp };
})(window);
