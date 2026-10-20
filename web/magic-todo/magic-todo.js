/* Historique rappelable et cases à cocher du découpage Magic ToDo. */
(function (global) {
  "use strict";

  const KEY = "gt_todo_history";
  const MAX = 30;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) ?? []; }
    catch { return []; }
  }

  function store(items) {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  }

  function normalize(steps) {
    return (steps || []).map((s) => ({
      text: String(s.text || "").trim(),
      done: !!s.done,
      substeps: (s.substeps || [])
        .map((ss) => (typeof ss === "string" ? ss : String(ss.text || "")).trim())
        .filter(Boolean),
    })).filter((s) => s.text);
  }

  function progress(steps) {
    const n = steps.filter((s) => s.done).length;
    return `${n} ${n === 1 ? "faite" : "faites"} sur ${steps.length}`;
  }

  function plain(entry) {
    return entry.steps.map((s) => ({ text: s.text, substeps: s.substeps.slice() }));
  }

  function remember(task, steps) {
    const entry = {
      id: Date.now(),
      task: String(task || ""),
      steps: normalize(steps),
      time: Date.now(),
    };
    store([entry, ...load()]);
    return entry;
  }

  function persist(entry) {
    const items = load();
    const index = items.findIndex((item) => item.id === entry.id);
    if (index === -1) return;
    items[index] = entry;
    store(items);
  }

  function find(id) {
    return load().find((item) => item.id === Number(id)) || null;
  }

  function renderResult(entry) {
    return `<div class="magic-todo__result">
      <h2 class="magic-todo__title">Découpage</h2>
      <p class="magic-todo__progress">${progress(entry.steps)}</p>
      <ul class="magic-todo__steps">
        ${entry.steps.map((s, i) => `
          <li class="magic-todo__step${s.done ? " magic-todo__step--done" : ""}">
            <label class="magic-todo__row">
              <input class="magic-todo__box" type="checkbox" data-step="${i}" ${s.done ? "checked" : ""}>
              <span class="magic-todo__label">${i + 1}. ${esc(s.text)}</span>
            </label>
            ${s.substeps.map((ss) => `<div class="magic-todo__sub">${esc(ss)}</div>`).join("")}
          </li>`).join("")}
      </ul>
      <div class="magic-todo__actions">
        <button class="btn secondary small" type="button" id="btn-save-list">💾 Enregistrer la liste</button>
        <button class="btn small" type="button" id="btn-focus">⏯️ Focus avec Taskmaster</button>
      </div>
    </div>`;
  }

  function mountResult(container, entry, actions) {
    container.innerHTML = renderResult(entry);
    container.querySelectorAll(".magic-todo__box").forEach((box) => {
      box.addEventListener("change", () => {
        const index = Number(box.dataset.step);
        entry.steps[index].done = box.checked;
        box.closest(".magic-todo__step").classList.toggle("magic-todo__step--done", box.checked);
        container.querySelector(".magic-todo__progress").textContent = progress(entry.steps);
        persist(entry);
        if (actions.onChange) actions.onChange(entry);
      });
    });
    const saveBtn = container.querySelector("#btn-save-list");
    const focusBtn = container.querySelector("#btn-focus");
    if (saveBtn && actions.onSave) saveBtn.onclick = () => actions.onSave(entry.task, plain(entry));
    if (focusBtn && actions.onFocus) focusBtn.onclick = () => actions.onFocus(entry.task, plain(entry));
  }

  function renderHistory(activeId) {
    const items = load();
    const cards = items.length
      ? items.map((item) => `
          <button type="button" class="magic-todo__recall${item.id === activeId ? " magic-todo__recall--active" : ""}" data-id="${item.id}">
            <span class="magic-todo__recall-task">${esc(item.task)}</span>
            <span class="magic-todo__recall-meta">${new Date(item.time).toLocaleString("fr-FR")} · ${progress(item.steps)}</span>
          </button>`).join("")
      : `<p class="magic-todo__empty">Aucun découpage pour l'instant. Lance une tâche pour la retrouver ici.</p>`;
    return `<section class="magic-todo__history">
      <h2 class="magic-todo__title">Historique</h2>
      <div class="magic-todo__recalls">${cards}</div>
    </section>`;
  }

  function mountHistory(container, activeId, onRecall) {
    if (!container) return;
    container.innerHTML = renderHistory(activeId);
    container.querySelectorAll(".magic-todo__recall").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entry = find(btn.dataset.id);
        if (entry && onRecall) onRecall(entry);
      });
    });
  }

  global.MagicTodo = { remember, mountResult, mountHistory };
})(window);
