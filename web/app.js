/* Une Étape à la Fois — édition locale. SPA sans framework, routage par hash. */
"use strict";

const $app = document.getElementById("app");
const LS_HISTORY = "gt_history";
const LS_LISTS = "gt_lists";           // listes ToDo [{id,name,steps,created}]
const LS_FOCUS = "gt_focus";           // file Taskmaster {listId, idx, done, skipped}
const LS_TM_TIMER = "gt_taskmaster_timer"; // timer Taskmaster {remaining,total,running,startedAt}
const LS_THEME = "gt_theme";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const t = (key, params) => I18n.t(key, params);

function toast(msg, ms = 2200) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), ms);
}
// Rend `toast` utilisable depuis les modules chargés avant app.js.
window.toast = toast;

function showModal({ title, message, onConfirm, onCancel, confirmLabel, cancelLabel }) {
  const modal = document.getElementById("modal");
  if (!modal) return;
  const titleEl = document.getElementById("modal-title");
  const messageEl = document.getElementById("modal-message");
  const actions = document.getElementById("modal-actions");
  titleEl.textContent = title || "";
  messageEl.textContent = message || "";
  actions.innerHTML = "";
  if (onCancel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn secondary";
    btn.textContent = cancelLabel || t("common.cancel");
    btn.onclick = () => { hideModal(); if (onCancel) onCancel(); };
    actions.appendChild(btn);
  }
  if (onConfirm) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = confirmLabel || t("common.ok");
    btn.onclick = () => { hideModal(); if (onConfirm) onConfirm(); };
    actions.appendChild(btn);
  }
  modal.hidden = false;
}
function hideModal() {
  const modal = document.getElementById("modal");
  if (modal) modal.hidden = true;
}
const backdrop = document.getElementById("modal")?.querySelector(".modal__backdrop");
if (backdrop) backdrop.addEventListener("click", hideModal);
window.addEventListener("keydown", (e) => { if (e.key === "Escape") hideModal(); });

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function addHistory(tool, input, output) {
  const hist = loadJSON(LS_HISTORY, []);
  hist.unshift({ tool, input: String(input).slice(0, 120), output, time: Date.now() });
  saveJSON(LS_HISTORY, hist.slice(0, 100));
  // Replication vers la persistance serveur (si disponible).
  try {
    apiCall("/api/data/history", {
      tool,
      input: String(input).slice(0, 120),
      output,
      time: Date.now(),
    }, "POST");
  } catch { /* serveur indisponible : localStorage reste la reference */ }
}

function currentTheme() {
  const theme = document.documentElement.getAttribute("data-theme");
  return theme === "dark" ? "dark" : "light";
}

const THEME_ORDER = ["light", "dark"];
const THEME_ICONS = { light: "☀️", dark: "🌙" };

function syncThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const theme = currentTheme();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  btn.textContent = THEME_ICONS[theme] || "🦎";
  const label = t("app.theme." + next);
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  syncThemeToggle();
  btn.addEventListener("click", () => {
    const theme = currentTheme();
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    localStorage.setItem(LS_THEME, next);
    prefsSet(LS_THEME, next);
    document.documentElement.setAttribute("data-theme", next);
    syncThemeToggle();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (localStorage.getItem(LS_THEME)) return;
    document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    syncThemeToggle();
  });
}

async function apiCall(path, body, method = "POST") {
  const resp = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.detail || `Échec de la requête (${resp.status})`);
    err.code = data.code;
    throw err;
  }
  return data;
}

// Ecrit une preference cote serveur (meilleur effort, sans bloquer l'UI).
async function prefsSet(key, value) {
  try {
    await apiCall("/api/prefs/" + encodeURIComponent(key), { value: String(value) }, "PUT");
  } catch { /* prefs serveur indisponible : localStorage reste la reference */ }
}

function plural(n, one, many) {
  return `${n} ${Number(n) === 1 ? one : many}`;
}

function fmtMinutes(m) {
  m = Number(m) || 0;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min ? `${h} h ${min} min` : `${h} h`;
}

function fmtTmTimer(seconds) {
  seconds = Number(seconds) || 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

let tmTimerInterval = null;

/* ============================ outils ============================ */
const TOOLS = {
  "magic-todo": {
    icon: "✅", name: t("tools.magic-todo.name"), desc: t("tools.magic-todo.desc"),
  },
  formalizer: {
    icon: "✍️", name: t("tools.formalizer.name"), desc: t("tools.formalizer.desc"),
  },
  judge: {
    icon: "⚖️", name: t("tools.judge.name"), desc: t("tools.judge.desc"),
    help: t("judge.help"),
    fields: [
      { name: "text", label: t("judge.field.text"), type: "textarea", placeholder: t("judge.field.text.placeholder") },
      { name: "extra", label: t("judge.field.extra"), type: "textarea", placeholder: t("judge.field.extra.placeholder"), optionalToggle: t("judge.toggle.extra"), required: false },
    ],
    actions: [
      { mode: "judge", label: t("judge.action.judge") },
      { mode: "reply", label: t("judge.action.reply"), secondary: true },
    ],
    endpoint: "/api/judge",
    resultInput: (v) => v.text,
    summary: (r) => r.tone || r.impression || "",
    render: (r) => `
      <div class="result">
        <label>${t("judge.result.impression")}</label>
        <div class="prose" id="judge-impression">${esc(r.impression || r.summary || "")}</div>
        ${r.reply ? `<label>${t("judge.result.reply")}</label><div class="prose" id="judge-reply">${esc(r.reply)}</div>
          <button class="copy-text" type="button" data-copy-target="#judge-reply">${t("common.copy")}</button>` : ""}
      </div>`,
  },
  professor: {
    icon: "🎓", name: t("tools.professor.name"), desc: t("tools.professor.desc"),
    help: t("professor.help"),
    submitLabel: t("professor.submit"),
    fields: [
      { name: "topic", label: t("professor.field.topic"), type: "textarea", placeholder: t("professor.field.topic.placeholder") },
      { name: "spice", type: "spice", hint: t("professor.spice.hint"), default: 3 },
    ],
    endpoint: "/api/professor",
    resultInput: (v) => v.topic,
    summary: (r) => String(r.explanation || r.summary || "").slice(0, 80),
    render: (r) => `
      <div class="result">
        <label>${t("professor.result.explanation")}</label>
        <div class="prose">${esc(r.explanation || r.summary || "")}</div>
        ${r.example ? `<label>${t("professor.result.example")}</label><div class="prose">${esc(r.example)}</div>` : ""}
        ${(r.points || []).map((p) => `<div class="step"><b>${esc(p.title)}</b><div class="substep" style="padding-left:0">${esc(p.body)}</div></div>`).join("")}
      </div>`,
  },
  consultant: {
    icon: "💡", name: t("tools.consultant.name"), desc: t("tools.consultant.desc"),
    help: t("consultant.help"),
    submitLabel: t("consultant.submit"),
    fields: [
      { name: "situation", label: t("consultant.field.situation"), type: "textarea", placeholder: t("consultant.field.situation.placeholder") },
    ],
    endpoint: "/api/consultant",
    resultInput: (v) => v.situation,
    summary: (r) => String(r.advice || r.recommendation || "").slice(0, 80),
    render: (r) => `
      <div class="result">
        <label>${t("consultant.result.pros")}</label>
        <textarea class="consultant-pros" data-field="pros">${esc(r.pros || "")}</textarea>
        <label>${t("consultant.result.cons")}</label>
        <textarea class="consultant-cons" data-field="cons">${esc(r.cons || "")}</textarea>
        <label>${t("consultant.result.advice")}</label>
        <div class="prose" id="consultant-advice">${esc(r.advice || r.recommendation || "")}</div>
        <button class="btn secondary small" type="button" id="consultant-update">${t("consultant.update")}</button>
      </div>`,
  },
  estimator: {
    icon: "⏱️", name: t("tools.estimator.name"), desc: t("tools.estimator.desc"),
    help: t("estimator.help"),
    submitLabel: t("estimator.submit"),
    fields: [
      { name: "task", label: t("estimator.field.task"), type: "textarea", placeholder: t("estimator.field.task.placeholder") },
      { name: "spice", type: "spice", hint: t("estimator.spice.hint"), default: 2 },
    ],
    endpoint: "/api/estimator",
    resultInput: (v) => v.task,
    summary: (r) => r.rough || fmtMinutes(r.total_minutes),
    render: (r) => `<div class="result"><label>${t("estimator.result.about")}</label><div class="prose">${esc(r.rough || fmtMinutes(r.total_minutes))}</div></div>`,
  },
  compiler: {
    icon: "🧠", name: t("tools.compiler.name"), desc: t("tools.compiler.desc"),
    help: t("compiler.help"),
    submitLabel: t("compiler.submit"),
    fields: [{ name: "brainstorm", label: t("compiler.field.brainstorm"), type: "textarea", placeholder: t("compiler.field.brainstorm.placeholder") }],
    endpoint: "/api/compiler",
    resultInput: (v) => v.brainstorm,
    summary: (r) => plural((r.actions || []).length, t("taskmaster.step.one"), t("taskmaster.step.many")),
    render: (r) => `<div class="result"><h2>${t("compiler.result.actions")}</h2>
      <ul class="step-list">${(r.actions || []).map((a) => `<li class="step"><b>${esc(a.text)}</b>${a.category ? `<span class="tag" style="margin-left:8px">${esc(a.category)}</span>` : ""}</li>`).join("")}</ul>
      <button class="btn secondary" type="button" id="compiler-send">${t("compiler.send")}</button></div>`,
  },
  chef: {
    icon: "👨‍🍳", name: t("tools.chef.name"), desc: t("tools.chef.desc"),
    help: t("chef.help"),
    submitLabel: t("chef.submit"),
    fields: [
      { name: "ingredients", label: t("chef.field.ingredients"), type: "textarea", placeholder: t("chef.field.ingredients.placeholder") },
    ],
    endpoint: "/api/chef",
    resultInput: (v) => v.ingredients,
    summary: (r) => (r.recipes || []).map((recipe) => recipe.name).filter(Boolean).join(", "),
    render: (r) => {
      const text = (r.recipes || []).map((rc) => [rc.name, rc.description, ...(rc.steps || [])].filter(Boolean).join("\n")).join("\n\n");
      return `<div class="result"><label>${t("chef.result.cook")}</label>
        <div class="prose" id="chef-output">${esc(text)}</div>
        <button class="copy-text" type="button" data-copy-target="#chef-output">${t("chef.copy")}</button></div>`;
    },
  },
};

const HOME_CARDS = [
  ["magic-todo"], ["formalizer"], ["judge"],
  ["taskmaster", { icon: "⏯️", name: t("tools.taskmaster.name"), desc: t("tools.taskmaster.desc"), badge: t("common.new") }],
  ["professor"], ["consultant"], ["estimator"], ["compiler"], ["chef"],
];

/* ============================ page d'un outil ============================ */
function fillForm(values) {
  const form = document.getElementById("tool-form");
  if (!form || !values) return;
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements[name];
    if (field) field.value = value ?? "";
  }
}

function fieldHtml(field) {
  if (field.type === "spice") {
    return `<div class="field"><div data-spice="${field.name}" data-spice-value="${field.default ?? 3}" data-spice-hint="${esc(field.hint || "")}"></div></div>`;
  }
  const control = field.type === "textarea"
    ? `<textarea name="${field.name}" placeholder="${esc(field.placeholder || "")}"></textarea>`
    : field.type === "select"
      ? `<select name="${field.name}">${field.options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>`
      : `<input type="text" name="${field.name}" placeholder="${esc(field.placeholder || "")}" />`;
  if (field.optionalToggle) {
    return `<div class="field"><button class="btn secondary small" type="button" data-reveal="${field.name}">${esc(field.optionalToggle)}</button>
      <div data-revealed="${field.name}" hidden><label>${esc(field.label)}</label>${control}</div></div>`;
  }
  return `<div class="field">${field.label ? `<label>${esc(field.label)}</label>` : ""}${control}</div>`;
}

function renderToolPage(id) {
  const tool = TOOLS[id];
  const actions = tool.actions || [{ mode: "", label: tool.submitLabel || "Lancer ✨" }];
  $app.innerHTML = `
    <p><a class="back" href="#/">← Tous les outils</a></p>
    <div class="tool-head">
      <span class="icon">${tool.icon}</span><h1>${esc(tool.name)}</h1>
      ${tool.help ? `<div class="tool-help"><button class="tool-help__toggle" type="button" aria-expanded="false">Aide ?</button><p class="tool-help__text" hidden>${esc(tool.help)}</p></div>` : ""}
    </div>
    <p class="tool-desc">${esc(tool.desc)}</p>
    <form id="tool-form">
      ${tool.fields.map(fieldHtml).join("")}
      <div class="formalizer__row">
        ${actions.map((action) => `<button class="btn${action.secondary ? " secondary" : ""}" type="submit" data-mode="${esc(action.mode)}">${esc(action.label)}</button>`).join("")}
      </div>
    </form>
    <div id="out"></div>
    <button class="btn secondary small" type="button" id="tool-share">${t("common.share")}</button>
    <div id="tool-history"></div>`;
  $app.querySelectorAll("[data-spice]").forEach((slot) => {
    Spice.mount(slot, { name: slot.dataset.spice, value: slot.dataset.spiceValue, hint: slot.dataset.spiceHint });
  });
  $app.querySelectorAll("[data-reveal]").forEach((button) => {
    button.onclick = () => {
      const box = $app.querySelector(`[data-revealed="${button.dataset.reveal}"]`);
      box.hidden = false;
      button.hidden = true;
      box.querySelector("textarea, input").focus();
    };
  });
  ToolHelp.bind($app);

  function paintHistory(activeId) {
    ToolHistory.mount(document.getElementById("tool-history"), id, activeId, showEntry);
  }

  function showEntry(entry) {
    fillForm(entry.values);
    $app.querySelectorAll("[data-spice]").forEach((slot) => {
      Spice.mount(slot, {
        name: slot.dataset.spice,
        value: entry.values[slot.dataset.spice] || slot.dataset.spiceValue,
        hint: slot.dataset.spiceHint,
      });
    });
    const out = document.getElementById("out");
    out.innerHTML = tool.render(entry.result);
    CopyText.bind(out, toast);
    const share = document.getElementById("tool-share");
    if (share) {
      share.onclick = async () => {
        const text = out.textContent || "";
        try {
          await navigator.clipboard.writeText(text);
          toast(t("app.toast.copied"));
        } catch {
          toast(t("app.toast.copyFailed"));
        }
      };
    }
    const send = document.getElementById("compiler-send");
    if (send) send.onclick = () => MagicTodo.addItems((entry.result.actions || []).map((action) => action.text));
    const update = document.getElementById("consultant-update");
    if (update) {
      const doUpdate = async () => {
        const pros = out.querySelector(".consultant-pros").value;
        const cons = out.querySelector(".consultant-cons").value;
        out.innerHTML = `<div class="loading" style="margin-top:24px"><span class="spinner"></span>${t("app.toast.preparing")}</div>`;
        try {
          const result = await apiCall("/api/consultant", {
            situation: entry.values.situation,
            pros,
            cons,
          });
          out.innerHTML = tool.render(result);
          const newUpdate = document.getElementById("consultant-update");
          if (newUpdate) {
            newUpdate.onclick = doUpdate;
          }
        } catch (err) {
          out.innerHTML = `<div class="alert">⚠️ ${esc(err.message)}</div>`;
        }
      };
      update.onclick = doUpdate;
    }
    paintHistory(entry.id);
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  paintHistory(null);

  document.getElementById("tool-form").onsubmit = async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target).entries());
    if (e.submitter && e.submitter.dataset.mode) values.mode = e.submitter.dataset.mode;
    for (const f of tool.fields) {
      if (f.type === "spice" || f.required === false) continue;
      if (!String(values[f.name] || "").trim() && f.name !== "options" && f.name !== "constraints") {
        toast(t("app.error.fill", { label: f.label }));
        return;
      }
    }
    const out = document.getElementById("out");
    out.innerHTML = `<div class="loading" style="margin-top:24px"><span class="spinner"></span>${t("app.toast.preparing")}</div>`;
    const body = tool.buildBody ? tool.buildBody(values) : values;
    try {
      const result = await apiCall(tool.endpoint, body);
      addHistory(tool.name, tool.resultInput(values), result);
      showEntry(ToolHistory.remember(id, {
        label: tool.resultInput(values),
        meta: tool.summary ? tool.summary(result) : "",
        values,
        result,
      }));
    } catch (err) {
      out.innerHTML = `<div class="alert">⚠️ ${esc(err.message)}
        ${err.code === "not_configured" ? ` <a href="#/settings">${t("settings.title")} →</a>` : ""}</div>`;
    }
  };
}

/* ============================ Taskmaster (focus local) ============================ */
function renderTaskmaster() {
  const board = MagicTodo.currentList();
  const lists = (board.steps || []).length
    ? [{ id: board.id, name: board.name, steps: board.steps }]
    : loadJSON(LS_LISTS, []);
  $app.innerHTML = `
    <p><a class="back" href="#/">${t("app.back")}</a></p>
    <div class="tool-head"><span class="icon">⏯️</span><h1>${t("taskmaster.title")}</h1><span class="badge-new">${t("common.new")}</span>
      <div class="tool-help"><button class="tool-help__toggle" type="button" aria-expanded="false">${t("help.toggle")}</button>
        <p class="tool-help__text" hidden>Une seule tâche de l'onglet Magic ToDo en cours. Coche-la, puis passe à la suivante.</p></div>
    </div>
    <p class="tool-desc">${t("taskmaster.desc")}</p>
    <div class="tm-focus-timer-section">
      <div class="tm-focus-timer">
        <span id="tm-focus-remaining" class="tm-focus-remaining">25:00</span>
        <div class="tm-focus-track">
          <div id="tm-focus-fill" class="tm-focus-fill" style="width: 0%;"></div>
        </div>
        <div class="tm-focus-controls">
          <button class="btn" id="tm-focus-play">▶ ${t("taskmaster.timer.play")}</button>
          <button class="btn secondary" id="tm-focus-pause" disabled>⏸ ${t("taskmaster.timer.pause")}</button>
          <button class="btn secondary" id="tm-focus-stop" disabled>⏹ ${t("taskmaster.timer.stop")}</button>
        </div>
        <div id="tm-focus-estimating" class="tm-focus-estimating" hidden>
          <span class="spinner"></span> ${t("taskmaster.timer.estimating")}
        </div>
      </div>
    </div>
    <div id="tm-body"></div>`;
  ToolHelp.bind($app);
  const body = document.getElementById("tm-body");

  // ---------------------------- focus timer ----------------------------
  function tmTimerLoad() {
    return loadJSON(LS_TM_TIMER, { remaining: 1500, total: 1500, running: false, startedAt: null });
  }
  function tmTimerSave(state) { saveJSON(LS_TM_TIMER, state); }
  function stopTmTimer() {
    if (tmTimerInterval) { clearInterval(tmTimerInterval); tmTimerInterval = null; }
  }
  function tmTimerUpdateUI() {
    const s = tmTimerLoad();
    let remaining = s.remaining;
    if (s.running && s.startedAt) {
      const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
      remaining = Math.max(0, s.remaining - elapsed);
      if (remaining <= 0) {
        remaining = 0;
        s.running = false;
        s.startedAt = null;
        tmTimerSave(s);
        stopTmTimer();
      }
    }
    const display = document.getElementById("tm-focus-remaining");
    if (display) display.textContent = fmtTmTimer(remaining);
    const fill = document.getElementById("tm-focus-fill");
    if (fill && s.total > 0) fill.style.width = `${Math.min(100, (1 - remaining / s.total) * 100)}%`;
    const play = document.getElementById("tm-focus-play");
    const pause = document.getElementById("tm-focus-pause");
    const stop = document.getElementById("tm-focus-stop");
    if (play) play.disabled = false;
    if (pause) pause.disabled = !s.running;
    if (stop) stop.disabled = !s.running || remaining <= 0;
  }
  stopTmTimer();
  const timerState = tmTimerLoad();
  if (timerState.running) {
    timerState.startedAt = Date.now();
    tmTimerSave(timerState);
    tmTimerInterval = setInterval(tmTimerUpdateUI, 1000);
  }
  tmTimerUpdateUI();

  document.getElementById("tm-focus-play").onclick = () => {
    const s = tmTimerLoad();
    if (s.remaining <= 0) s.remaining = s.total || 1500;
    s.running = true;
    s.startedAt = Date.now();
    tmTimerSave(s);
    stopTmTimer();
    tmTimerInterval = setInterval(tmTimerUpdateUI, 1000);
    tmTimerUpdateUI();
  };
  document.getElementById("tm-focus-pause").onclick = () => {
    const s = tmTimerLoad();
    if (s.running && s.startedAt) {
      const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
      s.remaining = Math.max(0, s.remaining - elapsed);
    }
    s.running = false;
    s.startedAt = null;
    tmTimerSave(s);
    stopTmTimer();
    tmTimerUpdateUI();
  };
  document.getElementById("tm-focus-stop").onclick = () => {
    const s = tmTimerLoad();
    s.remaining = s.total || 1500;
    s.running = false;
    s.startedAt = null;
    tmTimerSave(s);
    stopTmTimer();
    tmTimerUpdateUI();
  };

  if ((board.steps || []).length) {
    const previous = loadJSON(LS_FOCUS, null);
    if (!previous || previous.listId !== board.id) {
      const pending = board.steps.findIndex((row) => !row.done);
      saveJSON(LS_FOCUS, {
        listId: board.id,
        idx: pending === -1 ? board.steps.length : pending,
        done: board.steps.filter((row) => row.done).length,
        skipped: 0,
      });
    }
  }
  const focus = loadJSON(LS_FOCUS, null);
  const activeList = focus && lists.find((l) => l.id === focus.listId);

  if (!lists.length || !lists[0].steps.length) {
    body.innerHTML = `<div class="panel">${t("taskmaster.empty")}</div>`;
    return;
  }

  if (!activeList) {
    body.innerHTML = `<div class="panel"><div class="field"><label>${t("taskmaster.pick")}</label>
      <select id="tm-pick">${lists.map((l) => `<option value="${l.id}">${esc(l.name)} (${plural(l.steps.length, t("taskmaster.step.one"), t("taskmaster.step.many"))})</option>`).join("")}</select></div>
      <button class="btn" id="tm-start">${t("taskmaster.start")}</button></div>`;
    document.getElementById("tm-start").onclick = () => {
      saveJSON(LS_FOCUS, { listId: Number(document.getElementById("tm-pick").value), idx: 0, done: 0, skipped: 0 });
      renderTaskmaster();
    };
    return;
  }

  const total = activeList.steps.length;
  if (focus.idx >= total) {
    body.innerHTML = `<div class="focus-card"><div class="done-msg">🎉 ${t("taskmaster.done")}</div>
      <p class="sub-hint">${plural(focus.done, t("taskmaster.focusDone.one"), t("taskmaster.focusDone.many"))} · ${plural(focus.skipped, t("taskmaster.focusSkipped.one"), t("taskmaster.focusSkipped.many"))}</p>
      <div class="focus-actions"><button class="btn secondary" id="tm-again">${t("taskmaster.restart")}</button>
      <button class="btn" id="tm-exit">${t("taskmaster.exit")}</button></div></div>`;
    document.getElementById("tm-again").onclick = () => { saveJSON(LS_FOCUS, { ...focus, idx: 0, done: 0, skipped: 0 }); renderTaskmaster(); };
    document.getElementById("tm-exit").onclick = () => { localStorage.removeItem(LS_FOCUS); renderTaskmaster(); };
    return;
  }

  const step = activeList.steps[focus.idx];
  body.innerHTML = `
    <div class="focus-card">
      <div class="tm-focus-list">${esc(activeList.name)}</div>
      <div style="color:var(--ink);font-weight:700;margin-bottom:6px">${t("taskmaster.stepOf", { idx: focus.idx + 1, total })}</div>
      <div style="color:var(--muted);font-size:0.85rem;margin-bottom:10px">${t("taskmaster.count", { done: focus.done, total })}</div>
      <div class="tm-focus-task">${esc(step.text)}</div>
      ${step.substeps.length ? `<div class="sub-hint">${step.substeps.map(esc).join("\n")}</div>` : ""}
      <div class="focus-actions">
        <button class="btn" id="tm-done">${t("taskmaster.doneLabel")}</button>
        <button class="btn secondary" id="tm-skip">${t("taskmaster.skipLabel")}</button>
      </div>
      <div class="progress"><i style="width:${(focus.idx / total) * 100}%"></i></div>
      <div style="color:var(--muted);font-size:0.85rem">${plural(focus.done, t("taskmaster.done.one"), t("taskmaster.done.many"))} · ${plural(focus.skipped, t("taskmaster.skipped.one"), t("taskmaster.skipped.many"))}</div>
    </div>
    <div style="margin-top:14px"><button class="btn secondary small" id="tm-exit">${t("taskmaster.exit")}</button></div>`;
  const next = (inc) => {
    if (inc === "done" && step.itemId) MagicTodo.markItem(activeList.id, step.itemId, true);
    saveJSON(LS_FOCUS, { ...focus, idx: focus.idx + 1, done: focus.done + (inc === "done" ? 1 : 0), skipped: focus.skipped + (inc === "skip" ? 1 : 0) });
    renderTaskmaster();
  };
  document.getElementById("tm-done").onclick = () => next("done");
  document.getElementById("tm-skip").onclick = () => next("skip");
  document.getElementById("tm-exit").onclick = () => { localStorage.removeItem(LS_FOCUS); renderTaskmaster(); };
}

/* ============================ accueil ============================ */
function renderHome() {
  $app.innerHTML = `
    <p class="tagline">${t("app.tagline")}</p>
    <section class="home-hero">
      <a class="card card--featured" href="#/assistant">
        <div class="icon">🧠</div>
        <div class="name">${esc(t("assistant.title"))}</div>
        <div class="desc">${esc(t("assistant.desc"))}</div>
      </a>
    </section>
    <div class="grid">
      ${HOME_CARDS.map(([id, custom]) => {
        const info = custom || TOOLS[id];
        return `<a class="card" href="#/${id}">
          <div class="icon">${info.icon}</div>
          <div class="name">${esc(info.name)}${info.badge ? `<span class="badge-new">${info.badge}</span>` : ""}</div>
          <div class="desc">${esc(info.desc)}</div>
        </a>`;
      }).join("")}
    </div>`;
}

/* ============================ historique ============================ */
async function renderHistory() {
  $app.innerHTML = `
    <p><a class="back" href="#/">${t("app.back")}</a></p>
    <div class="tool-head"><span class="icon">🕘</span><h1>${t("history.title")}</h1></div>
    <div class="loading">${t("settings.loading")}</div>`;

  let hist = [];
  let source = "local";
  try {
    const r = await apiCall("/api/data/history", undefined, "GET");
    hist = r.history || [];
    source = "server";
  } catch {
    hist = loadJSON(LS_HISTORY, []);
  }

  $app.innerHTML = `
    <p><a class="back" href="#/">${t("app.back")}</a></p>
    <div class="tool-head"><span class="icon">🕘</span><h1>${t("history.title")}</h1></div>
    <p class="tool-desc">${plural(hist.length, t("history.result.one"), t("history.result.many"))} ${t("history.source." + source)}.</p>
    ${hist.length ? `<div class="panel">
      ${hist.map((h) => `<div class="hist-item"><b>${esc(h.tool)}</b> · ${esc(h.input)}
        <div class="meta">${new Date(h.time).toLocaleString(t && typeof I18n !== "undefined" ? I18n.getLang() : "fr")}</div></div>`).join("")}
      <div style="margin-top:14px"><button class="btn secondary small" id="hist-clear">${t("history.clear")}</button></div>
    </div>` : `<div class="panel">${t("history.empty")}</div>`}`;
  const clear = document.getElementById("hist-clear");
  if (clear) clear.onclick = async () => {
    try { await apiCall("/api/data/history", undefined, "DELETE"); } catch {}
    localStorage.removeItem(LS_HISTORY);
    renderHistory();
  };
}

/* ============================ assistant "second cerveau" ============================ */
const LS_ASSISTANT_SESSIONS = "gt_assistant_sessions";
const LS_ASSISTANT_CURRENT = "gt_assistant_current";

function renderAssistant() {
  const sessions = loadJSON(LS_ASSISTANT_SESSIONS, {});
  let current = loadJSON(LS_ASSISTANT_CURRENT, null);
  const sessionIds = Object.keys(sessions);
  if (!current || !sessions[current]) {
    current = sessionIds[0] || String(Date.now());
    if (!sessions[current]) {
      sessions[current] = {
        id: current,
        name: t("assistant.new"),
        updated: Date.now(),
        messages: [],
      };
      sessionIds.push(current);
    }
    saveJSON(LS_ASSISTANT_SESSIONS, sessions);
    saveJSON(LS_ASSISTANT_CURRENT, current);
  }
  const session = sessions[current];

  $app.innerHTML = `
    <div class="asst-head">
      <a class="back" href="#/">${t("app.back")}</a>
      <div class="asst-brand">
        <span class="icon">🧠</span>
        <div>
          <h1>${t("assistant.title")}</h1>
          <p class="asst-sub">${t("assistant.desc")}</p>
        </div>
      </div>
      <div class="asst-actions">
        <button class="btn secondary small" id="asst-new">${t("assistant.new")}</button>
        <button class="btn secondary small" id="asst-now">${t("assistant.now")}</button>
      </div>
    </div>
    <form class="asst-input-bar" id="asst-form">
      <input name="q" id="asst-input" placeholder="${t("assistant.placeholder")}" />
      <button class="btn" type="submit">${t("assistant.send")}</button>
    </form>
    <div id="asst-messages" class="asst-messages"></div>
    <div id="asst-empty" class="asst-empty" hidden>
      <span class="icon">🧠</span>
      <h2>${t("assistant.empty.title")}</h2>
      <p>${t("assistant.empty.desc")}</p>
    </div>
    <div class="asst-sessions" id="asst-sessions">
      <h3>${t("assistant.recent")}</h3>
      <div class="asst-session-list" id="asst-session-list"></div>
    </div>
  `;

  const sel = document.getElementById("asst-session-select");
  const list = document.getElementById("asst-session-list");
  const empty = document.getElementById("asst-empty");
  const messagesBox = document.getElementById("asst-messages");
  const recentBox = document.getElementById("asst-sessions");

  const sortSessions = () => sessionIds.slice().sort((a, b) => (sessions[b]?.updated || 0) - (sessions[a]?.updated || 0));

  const renderSessions = () => {
    if (sel) sel.innerHTML = "";
    list.innerHTML = "";
    const ordered = sortSessions();
    ordered.forEach((id) => {
      const s = sessions[id];
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = s.name || t("assistant.new");
      if (id === current) opt.selected = true;
      if (sel) sel.appendChild(opt);

      const item = document.createElement("div");
      item.className = "asst-session-item" + (id === current ? " is-active" : "");
      item.innerHTML = `
        <div>
          <div class="name">${esc(s.name || t("assistant.new"))}</div>
          <div class="time">${new Date(s.updated || 0).toLocaleString()} · ${s.messages?.length || 0} msg</div>
        </div>
      `;
      item.onclick = () => {
        if (id !== current) {
          current = id;
          saveJSON(LS_ASSISTANT_CURRENT, current);
          renderAssistant();
        }
      };
      list.appendChild(item);
    });
    recentBox.hidden = ordered.length <= 1;
  };

  const paint = () => {
    const msgs = session.messages || [];
    messagesBox.hidden = msgs.length === 0;
    empty.hidden = msgs.length > 0;
    messagesBox.innerHTML = msgs.map((m) => {
      const user = m.role === "user";
      const time = m.time ? new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      const toolsHtml = (m.tools && m.tools.length)
        ? `<div class="msg-tools">${m.tools.map((tk) => `<span class="msg-tool">${esc(tk)}</span>`).join("")}</div>`
        : "";
      return `<div class="msg ${user ? "msg--user" : "msg--assistant"}">
        <div class="msg-bubble">${esc(m.content)}</div>
        ${toolsHtml}
        <div class="msg-meta">${time}</div>
      </div>`;
    }).join("");
    messagesBox.scrollTop = messagesBox.scrollHeight;
  };

  const save = () => {
    saveJSON(LS_ASSISTANT_SESSIONS, sessions);
    saveJSON(LS_ASSISTANT_CURRENT, current);
  };

  const speak = (role, content, tools) => {
    session.messages.push({ role, content: String(content), time: Date.now(), tools });
    session.updated = Date.now();
    if (role === "user" && (!session.name || session.name === t("assistant.new"))) {
      session.name = String(content).slice(0, 40);
    }
    save();
    renderSessions();
    paint();
  };

  const send = async (text) => {
    speak("user", text);
    const input = document.getElementById("asst-input");
    input.disabled = true;
    try {
      const result = await apiCall("/api/assistant/chat", {
        message: text,
        history: session.messages,
      });
      const tools = result.steps ? result.steps.map((s) => s.tool) : [];
      speak("assistant", result.reply, tools);
    } catch (err) {
      speak("assistant", `⚠️ ${err.message}`);
    } finally {
      input.disabled = false;
      input.focus();
    }
  };

  paint();
  renderSessions();

  if (sel) {
    sel.onchange = () => {
      const id = sel.value;
      if (id && id !== current) {
        current = id;
        saveJSON(LS_ASSISTANT_CURRENT, current);
        renderAssistant();
      }
    };
  }

  document.getElementById("asst-form").onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById("asst-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await send(text);
  };

  document.getElementById("asst-new").onclick = () => {
    const id = String(Date.now());
    sessions[id] = { id, name: t("assistant.new"), updated: Date.now(), messages: [] };
    saveJSON(LS_ASSISTANT_SESSIONS, sessions);
    saveJSON(LS_ASSISTANT_CURRENT, id);
    current = id;
    renderAssistant();
  };

  document.getElementById("asst-now").onclick = () => {
    let ctx = "";
    try {
      const board = MagicTodo.currentList ? MagicTodo.currentList() : null;
      if (board && board.steps && board.steps.length) {
        const pending = board.steps.findIndex((s) => !s.done);
        if (pending !== -1) {
          ctx = `${t("asst.now.context")} ${board.steps[pending].text}. `;
        }
      }
    } catch { /* ignore */ }
    const input = document.getElementById("asst-input");
    input.value = `${ctx}${t("assistant.nowPrompt")}`;
    input.focus();
  };
}

/* ============================ réglages ============================ */
function localStateLabel(state) {
  return t("settings.local.state." + state) || state;
}

function renderLocalSection(localStatus) {
  const st = localStatus || { state: "absent", progress: {}, engine_present: false, model_present: false, error: "" };
  const state = st.state || "absent";
  const ready = state === "ready";
  const error = state === "error";
  const busy = state === "downloading" || state === "starting";
  const progress = st.progress || {};
  const pct = progress.percent || 0;

  return `
    <div id="set-local-section" class="panel" style="margin-top:12px;border:2px solid var(--green)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span class="tool-desc" style="font-weight:700">${t("settings.local.title")}</span>
        <span id="set-local-dot" class="ai-status ${ready ? "ai-status--local" : "ai-status--offline"}"></span>
        <span id="set-local-text" class="tool-desc">${localStateLabel(state)}</span>
      </div>
      <div class="field" style="margin-bottom:6px">
        <label>${t("settings.local.engine")}</label>
        <span class="tool-desc" style="font-size:0.85rem">${st.engine_present ? t("settings.local.engine.present") : t("settings.local.engine.absent")}</span>
      </div>
      <div class="field" style="margin-bottom:8px">
        <label>${t("settings.local.model")}</label>
        <span class="tool-desc" style="font-size:0.85rem">${st.model_present ? t("settings.local.model.present") : t("settings.local.model.absent")}</span>
      </div>
      ${pct > 0 && !ready
        ? `<div class="field" style="margin-bottom:8px">
             <div class="progress" style="height:8px;background:var(--green-light);border-radius:999px;overflow:hidden"><div id="set-local-bar" style="height:100%;background:var(--green);width:${Math.min(100, pct)}%"></div></div>
             <div class="tool-desc" style="font-size:0.8rem;color:var(--muted)">${t("settings.local.progress")} ${Math.round(pct)}%</div>
           </div>`
        : ""}
      ${error ? `<div class="alert" style="margin-top:8px">${t("settings.local.error_msg", { error: esc(st.error || "") })}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn${busy ? " secondary" : ""}" id="set-local-install"${busy ? " disabled" : ""}>${busy ? t("settings.local.progress") : t("settings.local.install")}</button>
        ${error ? `<button class="btn secondary" id="set-local-retry">${t("settings.local.retry")}</button>` : ""}
      </div>
    </div>`;
}

async function renderSettings() {
  $app.innerHTML = `
    <p><a class="back" href="#/">${t("app.back")}</a></p>
    <div class="tool-head"><span class="icon">⚙️</span><h1>${t("settings.title")}</h1></div>
    <p class="tool-desc">${t("settings.desc")}</p>
    <div class="panel"><div id="set-loading" class="loading"><span class="spinner"></span>${t("settings.loading")}</div></div>`;

  let cur;
  try { cur = await apiCall("/api/settings", undefined, "GET"); } catch (err) {
    document.getElementById("set-loading").outerHTML = `<div class="alert">${esc(err.message)}</div>`;
    return;
  }

  let localStatus = null;
  try { localStatus = await apiCall("/api/local/status", undefined, "GET"); } catch { /* moteur local pas encore disponible */ }

  let models = [];
  try {
    const m = await apiCall("/api/models", undefined, "GET");
    models = m.models || [];
  } catch { /* liste indisponible : le champ reste saisissable manuellement */ }

  const provider = cur.provider || "external";
  const modelOptions = models.map((m) => `<option value="${esc(m)}">`).join("");

  const localNote = cur.source === "ia-choix" || cur.source === "ollama"
    ? `<p class="tool-desc" style="margin-top:0">IA locale active : <b>${esc(cur.model)}</b>${cur.fallback ? ` · secours <b>${esc(cur.fallback)}</b>` : ""}${cur.loaded ? ` · en mémoire <b>${esc(cur.loaded)}</b>` : ""}. Change le modèle avec <code>ia-choix</code>.</p>`
    : "";

  const showLocal = provider === "local" || (localStatus && localStatus.state !== "absent");

  document.querySelector(".panel").innerHTML = `
    ${localNote}
    <div class="field"><label>${t("settings.provider")}</label>
      <select id="set-provider">
        <option value="local">${t("settings.provider.local")}</option>
        <option value="external">${t("settings.provider.external")}</option>
      </select></div>
    ${showLocal ? renderLocalSection(localStatus) : ""}
    <div style="display:flex;align-items:center;gap:10px;margin:10px 0">
      <span class="tool-desc">${t("settings.health.status")}</span>
      <span id="set-health" class="ai-status"></span>
      <span id="set-health-text" class="tool-desc">―</span>
    </div>
    <div class="field"><label>${t("settings.mode")}</label>
      <select id="set-mode">
        <option value="local">${t("settings.mode.local")}</option>
        <option value="server">${t("settings.mode.server")}</option>
      </select></div>
    <div class="field"><label>${t("settings.aiMode")}</label>
      <select id="set-ai-mode">
        <option value="auto">${t("settings.aiMode.auto")}</option>
        <option value="distant">${t("settings.aiMode.distant")}</option>
        <option value="local">${t("settings.aiMode.local")}</option>
      </select></div>
    <div class="field"><label><span class="status-dot ${cur.has_key ? "ok" : "no"}"></span>${t("settings.apiKey")} ${cur.has_key ? t("settings.apiKey.current", { masked: esc(cur.api_key_masked) }) : t("settings.apiKey.none")}</label>
      <input type="password" id="set-key" placeholder="${t("settings.apiKey.placeholder")}" autocomplete="off" /></div>
    <div class="field"><label>${t("settings.baseUrl")}</label><input type="text" id="set-url" value="${esc(cur.base_url)}" /></div>
    <div class="field"><label>${t("settings.model")}</label>
      <input type="text" id="set-model" list="model-list" value="${esc(cur.model)}" />
      <datalist id="model-list">${modelOptions}</datalist>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button class="btn secondary small" id="set-advanced">▼ ${t("settings.advanced")}</button>
      <button class="btn" id="set-save">${t("settings.save")}</button>
      <button class="btn secondary" id="set-test">🔌 ${t("settings.test")}</button>
    </div>
    <div id="set-advanced-box" hidden>
      <div class="field"><label>${t("settings.host")}</label><input type="text" id="set-host" value="${esc(cur.host)}" /></div>
      <div class="field"><label>${t("settings.port")}</label><input type="text" id="set-port" value="${esc(cur.port)}" /></div>
      <div class="field"><label>${t("settings.dataDir")}</label><input type="text" id="set-data-dir" placeholder="${t("settings.dataDir.placeholder")}" value="${esc(cur.data_dir || "")}" /></div>
      <div class="field"><label>${t("settings.authToken")}</label><input type="password" id="set-auth-token" placeholder="${t("settings.authToken.placeholder")}" autocomplete="off" /></div>
      <div class="field"><label>${t("settings.cors")}</label><input type="text" id="set-cors" placeholder="${t("settings.cors.placeholder")}" value="${esc(cur.cors_origins)}" /></div>
    </div>
    <p class="tool-desc" style="margin-top:14px">${t("settings.tip")}</p>
    <div id="set-out"></div>`;

  document.getElementById("set-provider").value = provider;
  document.getElementById("set-mode").value = cur.mode || "server";
  document.getElementById("set-ai-mode").value = cur.ai_mode || "auto";
  document.getElementById("set-advanced").onclick = () => {
    const box = document.getElementById("set-advanced-box");
    const hidden = box.hidden;
    box.hidden = !hidden;
    document.getElementById("set-advanced").textContent = hidden
      ? `▲ ${t("settings.advanced")}`
      : `▼ ${t("settings.advanced")}`;
  };

  async function refreshHealth() {
    try {
      const r = await fetch("/api/health");
      if (r.ok) {
        const s = await r.json();
        const dot = document.getElementById("set-health");
        const txt = document.getElementById("set-health-text");
        dot.className = "ai-status";
        let kind = "offline";
        let label = s.status;
        if (s.status === "en ligne") { kind = "online"; label = t("settings.health.online"); }
        else if (s.status === "local") { kind = "local"; label = t("settings.health.local"); }
        dot.classList.add(`ai-status--${kind}`);
        txt.textContent = label;
      } else {
        document.getElementById("set-health-text").textContent = t("settings.health.error");
      }
    } catch { document.getElementById("set-health-text").textContent = t("settings.health.unavailable"); }
  }
  refreshHealth();

  const save = async () => {
    const body = {
      provider: document.getElementById("set-provider").value,
      mode: document.getElementById("set-mode").value,
      ai_mode: document.getElementById("set-ai-mode").value,
      host: document.getElementById("set-host").value,
      port: document.getElementById("set-port").value,
      data_dir: document.getElementById("set-data-dir").value,
      cors_origins: document.getElementById("set-cors").value,
      base_url: document.getElementById("set-url").value,
      model: document.getElementById("set-model").value,
    };
    const key = document.getElementById("set-key").value.trim();
    if (key) body.api_key = key;
    const tok = document.getElementById("set-auth-token").value.trim();
    if (tok) body.auth_token = tok;
    await apiCall("/api/settings", body, "PUT");
    document.getElementById("set-key").value = "";
    document.getElementById("set-auth-token").value = "";
    toast(t("settings.saved"));
  };
  document.getElementById("set-save").onclick = async () => {
    try { await save(); } catch (err) { document.getElementById("set-out").innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
  };
  document.getElementById("set-test").onclick = async () => {
    const out = document.getElementById("set-out");
    out.innerHTML = `<div class="loading" style="margin-top:14px"><span class="spinner"></span>${t("settings.test.calling")}</div>`;
    try {
      try { await save(); } catch { /* on teste quand même si une partie de l'enregistrement échoue */ }
      const r = await apiCall("/api/settings/test", {});
      out.innerHTML = `<div class="prose" style="margin-top:14px;border-color:var(--green)">${t("settings.test.success")} ${esc(r.reply)}</div>`;
    } catch (err) {
      out.innerHTML = `<div class="alert">${t("settings.test.error")} ${esc(err.message)}</div>`;
    }
  };

  const installLocal = async () => {
    const out = document.getElementById("set-out");
    out.innerHTML = `<div class="loading" style="margin-top:14px"><span class="spinner"></span>${t("settings.local.installing")}</div>`;
    try {
      await apiCall("/api/local/install", {}, "POST");
      renderSettings();
    } catch (err) {
      out.innerHTML = `<div class="alert">${t("settings.test.error")} ${esc(err.message)}</div>`;
    }
  };
  const retryLocal = async () => {
    const out = document.getElementById("set-out");
    out.innerHTML = `<div class="loading" style="margin-top:14px"><span class="spinner"></span>${t("settings.local.reinstalling")}</div>`;
    try {
      await apiCall("/api/local/retry", {}, "POST");
      renderSettings();
    } catch (err) {
      out.innerHTML = `<div class="alert">${t("settings.test.error")} ${esc(err.message)}</div>`;
    }
  };
  const installBtn = document.getElementById("set-local-install");
  const retryBtn = document.getElementById("set-local-retry");
  if (installBtn) installBtn.onclick = installLocal;
  if (retryBtn) retryBtn.onclick = retryLocal;
}

/* ============================ compte ============================ */
function renderAccount() {
  const PREFIX = "gt_";
  let acctName = localStorage.getItem("gt_account_name") || "";

  function allLocalData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) data[key] = localStorage.getItem(key);
    }
    return data;
  }

  async function loadAiStatus() {
    const box = document.getElementById("acct-ai");
    try {
      const s = await apiCall("/api/settings", undefined, "GET");
      box.innerHTML = `
        <div class="kv"><b>${t("account.ai.provider")}</b> <span>${esc(s.source || s.mode)}</span></div>
        <div class="kv"><b>${t("account.ai.model")}</b> <span>${esc(s.model)}</span></div>
        <div class="kv"><b>${t("account.ai.key")}</b> <span>${s.has_key ? t("common.yes") : t("common.no")}</span></div>
        <div class="kv"><b>${t("account.auth")}</b> <span>${s.auth_token_set ? t("account.ai.tokenDefined") : t("account.ai.tokenNotDefined")}</span></div>
      `;
    } catch (err) {
      box.innerHTML = `<div class="alert">⚠️ ${esc(err.message)}</div>`;
    }
  }

  function notify(title, message, onConfirm) {
    showModal({ title, message, confirmLabel: t("common.ok"), onConfirm });
  }

  $app.innerHTML = `
    <p><a class="back" href="#/">${t("app.back")}</a></p>
    <div class="tool-head"><span class="icon">👤</span><h1>${t("account.title")}</h1></div>
    <p class="tool-desc">${t("account.subtitle")}</p>

    <div class="panel">
      <h2 style="margin-top:0">${t("account.identity")}</h2>
      <div class="field">
        <label>${t("account.identity.label")}</label>
        <input type="text" id="acct-name" placeholder="${t("account.identity.placeholder")}" value="${esc(acctName)}" />
      </div>
      <div style="margin-top:10px">
        <button class="btn secondary small" id="acct-save-name">${t("common.save")}</button>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h2 style="margin-top:0">${t("account.ai")}</h2>
      <div id="acct-ai" class="loading" style="margin-top:10px">${t("settings.loading")}</div>
      <div style="margin-top:10px">
        <button class="btn secondary small" id="acct-ai-settings">${t("account.ai.link")}</button>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h2 style="margin-top:0">${t("account.auth")}</h2>
      <p style="color:var(--muted);font-size:0.9rem;margin:6px 0">${t("account.auth.label")}</p>
      <div class="field" style="margin-top:8px">
        <input type="password" id="acct-token" placeholder="${t("account.auth.placeholder")}" />
      </div>
      <div style="margin-top:8px">
        <button class="btn" id="acct-token-set">${t("account.auth.set")}</button>
        <button class="btn secondary" id="acct-token-clear" style="margin-left:8px">${t("account.auth.clear")}</button>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h2 style="margin-top:0">${t("account.data")}</h2>
      <p style="color:var(--muted);font-size:0.9rem;margin:6px 0">${t("account.data.desc")}</p>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input type="file" id="acct-import-file" accept=".json" />
        <button class="btn secondary small" id="acct-import">${t("account.data.import")}</button>
        <button class="btn" id="acct-export">${t("account.data.export")}</button>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn secondary small" id="acct-migrate">${t("account.data.migrate")}</button>
        <span id="acct-migrate-msg" class="tool-desc" style="color:var(--muted)"></span>
      </div>
      <div style="margin-top:12px">
        <button class="btn secondary" id="acct-reset">${t("account.data.reset")}</button>
      </div>
    </div>
  `;

  loadAiStatus();

  document.getElementById("acct-save-name").onclick = () => {
    localStorage.setItem("gt_account_name", document.getElementById("acct-name").value.trim());
    notify(t("account.toast.saved"), t("account.toast.profileSaved"));
    updateNavGreeting();
  };

  document.getElementById("acct-ai-settings").onclick = () => {
    location.hash = "/settings";
  };

  const tokenSet = document.getElementById("acct-token-set");
  const tokenClear = document.getElementById("acct-token-clear");
  async function refreshTokenStatusUi() {
    try {
      await apiCall("/api/settings", undefined, "GET");
    } catch { /* ignore */ }
  }
  refreshTokenStatusUi();
  tokenSet.onclick = async () => {
    const value = document.getElementById("acct-token").value.trim();
    if (!value) {
      notify(t("app.error.request"), t("app.error.fill", { label: t("account.auth.placeholder") }));
      return;
    }
    try {
      await apiCall("/api/settings", { auth_token: value }, "PUT");
      document.getElementById("acct-token").value = "";
      notify(t("account.token.set"), t("account.toast.tokenSaved"));
    } catch (err) {
      notify(t("app.error.request"), esc(err.message));
    }
  };
  tokenClear.onclick = async () => {
    try {
      await apiCall("/api/settings", { auth_token: "" }, "PUT");
      notify(t("account.token.cleared"), t("account.toast.tokenCleared"));
    } catch (err) {
      notify(t("app.error.request"), esc(err.message));
    }
  };

  document.getElementById("acct-export").onclick = () => {
    const data = allLocalData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `goblin-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(t("account.toast.exported"));
  };

  document.getElementById("acct-migrate").onclick = async () => {
    const msg = document.getElementById("acct-migrate-msg");
    msg.textContent = t("account.migrate.inProgress");
    let count = 0;
    try {
      const hist = loadJSON(LS_HISTORY, []);
      for (const h of hist) {
        try { await apiCall("/api/data/history", h, "POST"); count++; } catch { /* ignore */ }
      }
      const lists = loadJSON(LS_LISTS, []);
      for (const l of lists) {
        try { await apiCall("/api/data/lists", l, "POST"); count++; } catch { /* ignore */ }
      }
      const sessions = loadJSON(LS_ASSISTANT_SESSIONS, {});
      for (const [id, s] of Object.entries(sessions)) {
        try { await apiCall("/api/data/sessions/" + encodeURIComponent(id), s, "POST"); count++; } catch { /* ignore */ }
      }
      const current = loadJSON(LS_ASSISTANT_CURRENT, null);
      if (current) {
        try { await apiCall("/api/data/current-session", { id: current }, "POST"); count++; } catch { /* ignore */ }
      }
      const focus = loadJSON(LS_FOCUS, null);
      if (focus) {
        try { await apiCall("/api/data/focus", { list_id: focus.listId, idx: focus.idx, done: focus.done, skipped: focus.skipped }, "POST"); count++; } catch { /* ignore */ }
      }
      msg.textContent = t("account.migrate.done").replace("{count}", count);
      toast(t("account.toast.imported"));
    } catch (err) {
      msg.textContent = `${t("account.migrate.error")} ${esc(err.message)}`;
    }
  };

  const importFile = document.getElementById("acct-import-file");
  document.getElementById("acct-import").onclick = () => importFile.click();
  importFile.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (typeof data !== "object" || data === null) throw new Error(t("account.import.invalidFormat"));
      let count = 0;
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(PREFIX)) { localStorage.setItem(key, String(value)); count++; }
      }
      importFile.value = "";
      notify(t("account.toast.imported"), t("account.import.done").replace("{count}", count));
      renderAccount();
    } catch (err) {
      notify(t("app.error.request"), esc(err.message));
    }
  };

  document.getElementById("acct-reset").onclick = () => {
    showModal({
      title: t("account.data.reset"),
      message: t("account.reset.confirm"),
      confirmLabel: t("account.reset.confirmBtn"),
      cancelLabel: t("common.cancel"),
      onConfirm: () => {
        showModal({
          title: t("account.data.reset"),
          message: t("account.confirm.reset"),
          confirmLabel: t("account.reset.confirmBtn2"),
          cancelLabel: t("common.cancel"),
          onConfirm: () => {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith(PREFIX)) keys.push(key);
            }
            keys.forEach((k) => localStorage.removeItem(k));
            notify(t("account.toast.reset"), t("account.toast.resetDone"), () => renderAccount());
          },
        });
      },
    });
  };
}

/* ============================ routage ============================ */
const ROUTES = {
  "": renderHome,
  history: renderHistory,
  settings: renderSettings,
  taskmaster: renderTaskmaster,
  assistant: renderAssistant,
  account: renderAccount,
};

function renderMagicBoard() {
  $app.innerHTML = `<div id="magic-board"></div>`;
  MagicTodo.mountBoard(document.getElementById("magic-board"));
}

function route() {
  const id = location.hash.replace(/^#\/?/, "");
  if (id === "magic-todo") return renderMagicBoard();
  if (id === "formalizer") return Formalizer.mount($app);
  if (ROUTES[id]) return ROUTES[id]();
  if (TOOLS[id] && TOOLS[id].fields) return renderToolPage(id);
  renderHome();
}

// Rendu de la route courante quand la langue change (appelé par I18n.setLang).
globalThis.__gt_retranslate = () => route();

function initLangSelect() {
  const select = document.getElementById("lang-select");
  if (!select) return;
  const refresh = () => {
    select.value = I18n.getLang();
  };
  refresh();
  select.addEventListener("change", (e) => {
    I18n.setLang(e.target.value);
    prefsSet("lang", e.target.value);
    refresh();
  });
}

// ----------------------------------------------------------------- santé IA
async function fetchHealth() {
  try {
    const r = await fetch("/api/health");
    if (!r.ok) return;
    const s = await r.json();
    const dot = document.getElementById("ai-status");
    if (!dot) return;
    dot.className = "ai-status";
    let kind = "offline";
    if (s.status === "en ligne") kind = "online";
    else if (s.status === "local") kind = "local";
    dot.classList.add(`ai-status--${kind}`);
  } catch { /* ignore */ }
}
function startHealthPoll() {
  fetchHealth();
  setInterval(fetchHealth, 30000);
}


function updateNavGreeting() {
  const el = document.getElementById("nav-greeting");
  if (!el) return;
  const h = new Date().getHours();
  let greeting;
  if (h >= 6 && h < 12) greeting = t("greeting.morning");
  else if (h >= 12 && h < 18) greeting = t("greeting.afternoon");
  else if (h >= 18 && h < 22) greeting = t("greeting.evening");
  else greeting = t("greeting.night");
  const name = localStorage.getItem("gt_account_name") || "";
  el.textContent = name ? `${greeting}, ${name}` : greeting;
}

startHealthPoll();
initThemeToggle();
initLangSelect();
	updateNavGreeting();
window.addEventListener("hashchange", route);
route();
