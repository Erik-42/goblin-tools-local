/* Goblin Tools — édition locale. SPA sans framework, routage par hash. */
"use strict";

const $app = document.getElementById("app");
const LS_HISTORY = "gt_history";
const LS_LISTS = "gt_lists";           // listes ToDo [{id,name,steps,created}]
const LS_FOCUS = "gt_focus";           // file Taskmaster {listId, idx, done, skipped}
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

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function addHistory(tool, input, output) {
  const hist = loadJSON(LS_HISTORY, []);
  hist.unshift({ tool, input: String(input).slice(0, 120), output, time: Date.now() });
  saveJSON(LS_HISTORY, hist.slice(0, 100));
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function syncThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const dark = currentTheme() === "dark";
  btn.textContent = dark ? "☀️" : "🌙";
  const label = dark ? "Passer au mode clair" : "Passer au mode sombre";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", dark ? "true" : "false");
}

function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  syncThemeToggle();
  btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    localStorage.setItem(LS_THEME, next);
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
        <label>${t("consultant.result.pros")}</label><div class="prose">${esc(r.pros || "")}</div>
        <label>${t("consultant.result.cons")}</label><div class="prose">${esc(r.cons || "")}</div>
        <label>${t("consultant.result.advice")}</label><div class="prose">${esc(r.advice || r.recommendation || "")}</div>
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
    summary: (r) => plural((r.actions || []).length, "action", "actions"),
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
    <div id="tm-body"></div>`;
  ToolHelp.bind($app);
  const body = document.getElementById("tm-body");

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
      <select id="tm-pick">${lists.map((l) => `<option value="${l.id}">${esc(l.name)} (${plural(l.steps.length, "étape", "étapes")})</option>`).join("")}</select></div>
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
      <p class="sub-hint">${plural(focus.done, "terminée", "terminées")} · ${plural(focus.skipped, "passée", "passées")}</p>
      <div class="focus-actions"><button class="btn secondary" id="tm-again">${t("taskmaster.restart")}</button>
      <button class="btn" id="tm-exit">${t("taskmaster.exit")}</button></div></div>`;
    document.getElementById("tm-again").onclick = () => { saveJSON(LS_FOCUS, { ...focus, idx: 0, done: 0, skipped: 0 }); renderTaskmaster(); };
    document.getElementById("tm-exit").onclick = () => { localStorage.removeItem(LS_FOCUS); renderTaskmaster(); };
    return;
  }

  const step = activeList.steps[focus.idx];
  body.innerHTML = `
    <div class="focus-card">
      <div style="color:var(--muted)">« ${esc(activeList.name)} » · ${t("taskmaster.stepOf", { idx: focus.idx + 1, total })}</div>
      <div class="step-text">${esc(step.text)}</div>
      ${step.substeps.length ? `<div class="sub-hint">${step.substeps.map(esc).join("\n")}</div>` : ""}
      <div class="focus-actions">
        <button class="btn" id="tm-done">${t("taskmaster.doneLabel")}</button>
        <button class="btn secondary" id="tm-skip">${t("taskmaster.skipLabel")}</button>
      </div>
      <div class="progress"><i style="width:${(focus.idx / total) * 100}%"></i></div>
      <div style="color:var(--muted);font-size:0.85rem">${plural(focus.done, "faite", "faites")} · ${plural(focus.skipped, "passée", "passées")}</div>
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
function renderHistory() {
  const hist = loadJSON(LS_HISTORY, []);
  $app.innerHTML = `
    <p><a class="back" href="#/">${t("app.back")}</a></p>
    <div class="tool-head"><span class="icon">🕘</span><h1>${t("history.title")}</h1></div>
    <p class="tool-desc">${plural(hist.length, "résultat récent enregistré", "résultats récents enregistrés")} dans ce navigateur.</p>
    ${hist.length ? `<div class="panel">
      ${hist.map((h) => `<div class="hist-item"><b>${esc(h.tool)}</b> · ${esc(h.input)}
        <div class="meta">${new Date(h.time).toLocaleString("fr-FR")}</div></div>`).join("")}
      <div style="margin-top:14px"><button class="btn secondary small" id="hist-clear">${t("history.clear")}</button></div>
    </div>` : `<div class="panel">${t("history.empty")}</div>`}`;
  const clear = document.getElementById("hist-clear");
  if (clear) clear.onclick = () => { localStorage.removeItem(LS_HISTORY); renderHistory(); };
}

/* ============================ assistant "second cerveau" ============================ */
const LS_ASSISTANT_SESSIONS = "gt_assistant_sessions";
const LS_ASSISTANT_CURRENT = "gt_assistant_current";

function renderAssistant() {
  const sessions = loadJSON(LS_ASSISTANT_SESSIONS, {});
  let current = loadJSON(LS_ASSISTANT_CURRENT, null);
  if (!current || !sessions[current]) {
    current = String(Date.now());
    sessions[current] = {
      id: current,
      name: t("assistant.new"),
      updated: Date.now(),
      messages: [],
    };
    saveJSON(LS_ASSISTANT_SESSIONS, sessions);
    saveJSON(LS_ASSISTANT_CURRENT, current);
  }
  const session = sessions[current];

  $app.innerHTML = `
    <p><a class="back" href="#/">${t("app.back")}</a></p>
    <div class="tool-head">
      <span class="icon">🧠</span><h1>${t("assistant.title")}</h1>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn secondary small" id="asst-new">${t("assistant.new")}</button>
        <button class="btn secondary small" id="asst-now">${t("assistant.now")}</button>
      </div>
    </div>
    <p class="tool-desc">${t("assistant.desc")}</p>
    <div id="asst-messages"></div>
    <form id="asst-form">
      <div class="field">
        <input name="q" id="asst-input" placeholder="${t("assistant.placeholder")}" />
      </div>
      <button class="btn" type="submit">${t("assistant.send")}</button>
    </form>
  `;

  const save = () => {
    saveJSON(LS_ASSISTANT_SESSIONS, sessions);
    saveJSON(LS_ASSISTANT_CURRENT, current);
  };

  const paint = () => {
    const box = document.getElementById("asst-messages");
    box.innerHTML = session.messages.map((m) => {
      const user = m.role === "user";
      const bubbleStyle = user
        ? "background:var(--green-light);border-color:var(--green-dark);margin-left:auto"
        : "";
      const toolsHtml = (m.tools && m.tools.length)
        ? `<div class="meta" style="font-size:0.72rem;color:var(--muted);max-width:75%;${user ? "margin-left:auto" : "margin-right:auto"}>${m.tools.map((t) => esc(t)).join(" · ")}</div>`
        : "";
      return `<div style="margin:8px 0;${user ? "text-align:right" : "text-align:left"}>
        <div class="prose" style="display:inline-block;max-width:75%;${bubbleStyle}">${esc(m.content)}</div>
        ${toolsHtml}
      </div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
  };

  const speak = (role, content, tools) => {
    session.messages.push({ role, content: String(content), time: Date.now(), tools });
    session.updated = Date.now();
    if (role === "user" && session.name === t("assistant.new")) {
      session.name = String(content).slice(0, 40);
    }
    save();
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
    sessions[id] = { id, name: "Nouvelle conversation", updated: Date.now(), messages: [] };
    saveJSON(LS_ASSISTANT_SESSIONS, sessions);
    saveJSON(LS_ASSISTANT_CURRENT, id);
    renderAssistant();
  };

  document.getElementById("asst-now").onclick = () => {
    let ctx = "";
    try {
      const board = MagicTodo.currentList ? MagicTodo.currentList() : null;
      if (board && board.steps && board.steps.length) {
        const pending = board.steps.findIndex((s) => !s.done);
        if (pending !== -1) {
          ctx = `Tâche en cours (Magic ToDo) : ${board.steps[pending].text}. `;
        }
      }
    } catch { /* ignore */ }
    const input = document.getElementById("asst-input");
    input.value = `${ctx}${t("assistant.nowPrompt")}`;
    input.focus();
  };
}

/* ============================ réglages ============================ */
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

  const localNote = cur.source === "ia-choix" || cur.source === "ollama"
    ? `<p class="tool-desc" style="margin-top:0">IA locale active : <b>${esc(cur.model)}</b>${cur.fallback ? ` · secours <b>${esc(cur.fallback)}</b>` : ""}${cur.loaded ? ` · en mémoire <b>${esc(cur.loaded)}</b>` : ""}. Change le modèle avec <code>ia-choix</code>.</p>`
    : "";

  document.querySelector(".panel").innerHTML = `
    ${localNote}
    <div style="display:flex;align-items:center;gap:10px;margin:10px 0">
      <span class="tool-desc">Statut IA&nbsp;:</span>
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
    <div class="field"><label>${t("settings.host")}</label><input type="text" id="set-host" value="${esc(cur.host)}" /></div>
    <div class="field"><label>${t("settings.port")}</label><input type="text" id="set-port" value="${esc(cur.port)}" /></div>
    <div class="field"><label>${t("settings.dataDir")}</label><input type="text" id="set-data-dir" placeholder="${t("settings.dataDir.placeholder")}" value="${esc(cur.data_dir || "")}" /></div>
    <div class="field"><label>${t("settings.authToken")}</label><input type="password" id="set-auth-token" placeholder="${t("settings.authToken.placeholder")}" autocomplete="off" /></div>
    <div class="field"><label>${t("settings.cors")}</label><input type="text" id="set-cors" placeholder="${t("settings.cors.placeholder")}" value="${esc(cur.cors_origins)}" /></div>
    <div class="field"><label><span class="status-dot ${cur.has_key ? "ok" : "no"}"></span>${t("settings.apiKey")} ${cur.has_key ? t("settings.apiKey.current", { masked: esc(cur.api_key_masked) }) : t("settings.apiKey.none")}</label>
      <input type="password" id="set-key" placeholder="${t("settings.apiKey.placeholder")}" autocomplete="off" /></div>
    <div class="field"><label>${t("settings.baseUrl")}</label><input type="text" id="set-url" value="${esc(cur.base_url)}" /></div>
    <div class="field"><label>${t("settings.model")}</label><input type="text" id="set-model" value="${esc(cur.model)}" /></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" id="set-save">${t("settings.save")}</button>
      <button class="btn secondary" id="set-test">🔌 ${t("settings.test")}</button>
    </div>
    <p class="tool-desc" style="margin-top:14px">${t("settings.tip")}</p>
    <div id="set-out"></div>`;

  document.getElementById("set-mode").value = cur.mode || "local";
  document.getElementById("set-ai-mode").value = cur.ai_mode || "auto";

  async function refreshHealth() {
    try {
      const r = await fetch("/api/health");
      if (r.ok) {
        const s = await r.json();
        const dot = document.getElementById("set-health");
        const txt = document.getElementById("set-health-text");
        dot.className = "ai-status";
        let kind = "offline";
        if (s.status === "en ligne") kind = "online";
        else if (s.status === "local") kind = "local";
        dot.classList.add(`ai-status--${kind}`);
        txt.textContent = s.status;
      } else {
        document.getElementById("set-health-text").textContent = "erreur";
      }
    } catch { document.getElementById("set-health-text").textContent = "indisponible"; }
  }
  refreshHealth();

  const save = async () => {
    const body = {
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
    out.innerHTML = `<div class="loading" style="margin-top:14px"><span class="spinner"></span>Appel du modèle…</div>`;
    try {
      try { await save(); } catch { /* on teste quand même si une partie de l'enregistrement échoue */ }
      const r = await apiCall("/api/settings/test", {});
      out.innerHTML = `<div class="prose" style="margin-top:14px;border-color:var(--green)">✅ Connexion réussie, le modèle répond : ${esc(r.reply)}</div>`;
    } catch (err) {
      out.innerHTML = `<div class="alert">❌ ${esc(err.message)}</div>`;
    }
  };
}

/* ============================ routage ============================ */
const ROUTES = {
  "": renderHome,
  history: renderHistory,
  settings: renderSettings,
  taskmaster: renderTaskmaster,
  assistant: renderAssistant,
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

function initLangToggle() {
  const btn = document.getElementById("lang-toggle");
  if (!btn) return;
  const refresh = () => {
    const lang = I18n.getLang();
    btn.textContent = lang === "fr" ? "🇫🇷" : "🇬🇧";
    btn.title = lang === "fr" ? t("app.lang.en") : t("app.lang.fr");
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", lang === "en" ? "true" : "false");
  };
  refresh();
  btn.addEventListener("click", () => {
    const next = I18n.getLang() === "fr" ? "en" : "fr";
    I18n.setLang(next);
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

startHealthPoll();
initThemeToggle();
initLangToggle();
window.addEventListener("hashchange", route);
route();
