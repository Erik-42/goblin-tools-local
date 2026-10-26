/* Historique rappelable, un par outil. */
(function (global) {
  "use strict";

  const KEY = "gt_tool_history";
  const OLD_TODO = "gt_todo_history";
  const MAX = 30;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function progressSteps(steps) {
    const n = (steps || []).filter((s) => s.done).length;
    const total = (steps || []).length;
    return `${n} ${n === 1 ? "faite" : "faites"} sur ${total}`;
  }

  function migrateTodo() {
    const all = load();
    if (Object.prototype.hasOwnProperty.call(all, "magic-todo")) return;
    let old = [];
    try { old = JSON.parse(localStorage.getItem(OLD_TODO)) || []; } catch { old = []; }
    if (!Array.isArray(old) || !old.length) return;
    all["magic-todo"] = old.slice(0, MAX).map((item) => ({
      id: item.id,
      time: item.time,
      label: String(item.task || ""),
      meta: progressSteps(item.steps),
      values: { task: item.task || "" },
      result: { steps: item.steps || [] },
    }));
    save(all);
  }

  function list(toolId) {
    migrateTodo();
    const items = load()[toolId];
    return Array.isArray(items) ? items : [];
  }

  function remember(toolId, draft) {
    const entry = {
      id: Date.now(),
      time: Date.now(),
      label: String(draft.label || "").slice(0, 140),
      meta: draft.meta || "",
      values: draft.values || {},
      result: draft.result,
    };
    const all = load();
    const items = Array.isArray(all[toolId]) ? all[toolId] : [];
    all[toolId] = [entry, ...items].slice(0, MAX);
    save(all);
    return entry;
  }

  function update(toolId, entry) {
    const all = load();
    const items = Array.isArray(all[toolId]) ? all[toolId] : [];
    const index = items.findIndex((item) => item.id === entry.id);
    if (index === -1) return;
    items[index] = entry;
    all[toolId] = items;
    save(all);
  }

  function find(toolId, id) {
    return list(toolId).find((item) => item.id === Number(id)) || null;
  }

  function render(toolId, activeId) {
    const items = list(toolId);
    const cards = items.length
      ? items.map((item) => `
          <button type="button" class="tool-history__recall${item.id === activeId ? " tool-history__recall--active" : ""}" data-id="${item.id}">
            <span class="tool-history__task">${esc(item.label || "Sans titre")}</span>
            <span class="tool-history__meta">${new Date(item.time).toLocaleString("fr-FR")}${item.meta ? ` · ${esc(item.meta)}` : ""}</span>
          </button>`).join("")
      : `<p class="tool-history__empty">Aucun résultat pour l'instant. Lance l'outil pour le retrouver ici.</p>`;
    return `<section class="tool-history">
      <h2 class="tool-history__title">Historique</h2>
      <div class="tool-history__list">${cards}</div>
    </section>`;
  }

  function mount(container, toolId, activeId, onRecall) {
    if (!container) return;
    container.innerHTML = render(toolId, activeId);
    container.querySelectorAll(".tool-history__recall").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entry = find(toolId, btn.dataset.id);
        if (entry && onRecall) onRecall(entry);
      });
    });
  }

  global.ToolHistory = { remember, update, mount };
})(window);
