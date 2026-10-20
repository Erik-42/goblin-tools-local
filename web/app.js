/* Goblin Tools — édition locale. SPA sans framework, routage par hash. */
"use strict";

const $app = document.getElementById("app");
const LS_HISTORY = "gt_history";
const LS_LISTS = "gt_lists";           // listes ToDo [{id,name,steps,created}]
const LS_FOCUS = "gt_focus";           // file Taskmaster {listId, idx, done, skipped}
const LS_THEME = "gt_theme";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, ms = 2200) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), ms);
}

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

/* ============================ outils ============================ */
const TOOLS = {
  "magic-todo": {
    icon: "✅", name: "Magic ToDo", desc: "Découpe une grosse tâche en petites étapes",
    fields: [{ name: "task", label: "Que veux-tu faire ?", type: "textarea", placeholder: "Par exemple : organiser l'anniversaire d'un ami" }],
    endpoint: "/api/magic-todo",
    resultInput: (v) => v.task,
    history: true,
  },
  formalizer: {
    icon: "✍️", name: "Formalizer", desc: "Réécrit un texte dans le ton choisi",
    fields: [
      { name: "text", label: "Texte d'origine (même brouillon)", type: "textarea", placeholder: "Par exemple : j'ai pas envie d'aller à cette réunion, je suis crevé" },
      { name: "tone", label: "Ton visé", type: "select", options: [
        ["clear", "Clair et simple"], ["friendly", "Amical"], ["professional", "Professionnel"],
        ["academic", "Académique"], ["direct", "Direct"], ["apologetic", "Excuses"], ["enthusiastic", "Enthousiaste"],
      ] },
    ],
    endpoint: "/api/formalizer",
    resultInput: (v) => v.text,
    render: (r) => `<div class="result"><h2>Texte réécrit (${esc(r.tone)})</h2><div class="prose">${esc(r.text)}</div></div>`,
  },
  judge: {
    icon: "⚖️", name: "Judge", desc: "Analyse les émotions cachées dans un texte",
    fields: [{ name: "text", label: "Colle le message qui te laisse perplexe", type: "textarea", placeholder: "Par exemple : un message du chef « passe me voir dans mon bureau quand tu as cinq minutes. »" }],
    endpoint: "/api/judge",
    resultInput: (v) => v.text,
    render: (r) => `
      <div class="result"><h2>Analyse des émotions</h2>
        <div class="prose">${esc(r.summary)}</div>
        ${r.tone ? `<p class="kv" style="margin-top:12px"><b>Ton général :</b><span class="tag">${esc(r.tone)}</span></p>` : ""}
        ${(r.emotions || []).map((e) => `<div class="step"><b>${esc(e.name)}</b><div class="substep" style="padding-left:0">${esc(e.evidence)}</div></div>`).join("")}
      </div>`,
  },
  professor: {
    icon: "🎓", name: "Professor", desc: "Explique n'importe quel sujet, au niveau choisi",
    fields: [
      { name: "topic", label: "Qu'est-ce que tu veux comprendre ?", type: "textarea", placeholder: "Par exemple : comment fonctionne l'informatique quantique" },
      { name: "depth", label: "Niveau d'explication", type: "select", options: [
        ["child", "Comme à un enfant de 6 ans"], ["teen", "Niveau collège"], ["college", "Niveau université"], ["expert", "Niveau expert"],
      ] },
    ],
    endpoint: "/api/professor",
    resultInput: (v) => v.topic,
    render: (r) => `
      <div class="result"><h2>Explication</h2>
        ${r.summary ? `<div class="prose">${esc(r.summary)}</div>` : ""}
        <div style="margin-top:12px">${(r.points || []).map((p) => `<div class="step"><b>${esc(p.title)}</b><div class="substep" style="padding-left:0">${esc(p.body)}</div></div>`).join("")}</div>
      </div>`,
  },
  consultant: {
    icon: "💡", name: "Consultant", desc: "Pèse les options et aide à décider",
    fields: [
      { name: "situation", label: "Qu'est-ce qui te fait hésiter ?", type: "textarea", placeholder: "Par exemple : ce week-end, je finis le dossier ou je vais au concert" },
      { name: "options", label: "Options (une par ligne, facultatif)", type: "textarea", placeholder: "Finir le dossier\nAller au concert" },
    ],
    endpoint: "/api/consultant",
    resultInput: (v) => v.situation,
    buildBody: (v) => ({ situation: v.situation, options: (v.options || "").split("\n").map((s) => s.trim()).filter(Boolean) }),
    render: (r) => `
      <div class="result"><h2>Analyse de la décision</h2>
        ${(r.options || []).map((o) => `
          <div class="step"><b>${esc(o.name)}</b>
            <div class="kv" style="margin-top:6px">${(o.pros || []).map((p) => `<span class="tag">👍 ${esc(p)}</span>`).join("")}
            ${(o.cons || []).map((c) => `<span class="tag tag--con">👎 ${esc(c)}</span>`).join("")}</div>
          </div>`).join("")}
        ${r.recommendation ? `<div class="prose" style="margin-top:12px"><b>Conseil :</b> ${esc(r.recommendation)}</div>` : ""}
      </div>`,
  },
  estimator: {
    icon: "⏱️", name: "Estimator", desc: "Estime le temps qu'une tâche prend vraiment",
    fields: [{ name: "task", label: "La tâche à estimer", type: "textarea", placeholder: "Par exemple : nettoyer tout l'appartement et lancer une machine" }],
    endpoint: "/api/estimator",
    resultInput: (v) => v.task,
    render: (r) => {
      const fmt = (m) => {
        if (m < 60) return `${m} min`;
        const h = Math.floor(m / 60);
        const min = m % 60;
        return min ? `${h} h ${min} min` : `${h} h`;
      };
      return `<div class="result"><h2>Estimation du temps</h2>
        <div class="panel">${(r.items || []).map((i) => `<div class="mini-item"><span>${esc(i.text)}</span><b>${fmt(i.minutes)}</b></div>`).join("")}</div>
        <div class="total-bar">Total d'environ ${fmt(r.total_minutes)}</div></div>`;
    },
  },
  compiler: {
    icon: "🧠", name: "Compiler", desc: "Transforme un brainstorm en actions concrètes",
    fields: [{ name: "brainstorm", label: "Vide toutes tes idées", type: "textarea", placeholder: "Écris n'importe comment, plus c'est en vrac, mieux c'est…" }],
    endpoint: "/api/compiler",
    resultInput: (v) => v.brainstorm,
    render: (r) => `<div class="result"><h2>Liste d'actions</h2>
      <ul class="step-list">${(r.actions || []).map((a) => `<li class="step"><b>${esc(a.text)}</b>${a.category ? `<span class="tag" style="margin-left:8px">${esc(a.category)}</span>` : ""}</li>`).join("")}</ul></div>`,
  },
  chef: {
    icon: "👨‍🍳", name: "Chef", desc: "Propose des recettes avec ce que tu as",
    fields: [
      { name: "ingredients", label: "Qu'est-ce que tu as sous la main ?", type: "textarea", placeholder: "Par exemple : œufs, tomates, riz restant, un peu de fromage" },
      { name: "constraints", label: "Contraintes ou préférences (facultatif)", type: "text", placeholder: "Par exemple : pas épicé, prêt en 15 minutes" },
    ],
    endpoint: "/api/chef",
    resultInput: (v) => v.ingredients,
    render: (r) => `<div class="result"><h2>Tu peux faire ça</h2>
      ${(r.recipes || []).map((rc) => `<div class="recipe"><b>${esc(rc.name)}</b><div class="kv">${esc(rc.description)}</div>
        <div>${(rc.ingredients || []).map((i) => `<span class="tag">${esc(i)}</span>`).join("")}</div>
        <ol>${(rc.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>`).join("")}</div>`,
  },
};

const HOME_CARDS = [
  ["magic-todo"], ["formalizer"], ["judge"],
  ["taskmaster", { icon: "⏯️", name: "Taskmaster", desc: "Une seule étape à la fois", badge: "Nouveau" }],
  ["professor"], ["consultant"], ["estimator"], ["compiler"], ["chef"],
];

/* ============================ listes vers Taskmaster ============================ */
function saveTodoList(taskText, steps) {
  const lists = loadJSON(LS_LISTS, []);
  lists.unshift({ id: Date.now(), name: taskText, steps, created: Date.now() });
  saveJSON(LS_LISTS, lists.slice(0, 30));
  toast("Liste enregistrée ✅");
}

function focusTodoList(taskText, steps) {
  const lists = loadJSON(LS_LISTS, []);
  const item = { id: Date.now(), name: taskText, steps, created: Date.now() };
  lists.unshift(item);
  saveJSON(LS_LISTS, lists.slice(0, 30));
  saveJSON(LS_FOCUS, { listId: item.id, idx: 0, done: 0, skipped: 0 });
  location.hash = "#/taskmaster";
}

/* ============================ page d'un outil ============================ */
function renderToolPage(tool) {
  $app.innerHTML = `
    <p><a class="back" href="#/">← Tous les outils</a></p>
    <div class="tool-head"><span class="icon">${tool.icon}</span><h1>${esc(tool.name)}</h1></div>
    <p class="tool-desc">${esc(tool.desc)}</p>
    <form id="tool-form">
      ${tool.fields.map((f) => `
        <div class="field"><label>${esc(f.label)}</label>
          ${f.type === "textarea"
            ? `<textarea name="${f.name}" placeholder="${esc(f.placeholder || "")}"></textarea>`
            : f.type === "select"
              ? `<select name="${f.name}">${f.options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>`
              : `<input type="text" name="${f.name}" placeholder="${esc(f.placeholder || "")}" />`}
        </div>`).join("")}
      <button class="btn" type="submit">Lancer ✨</button>
    </form>
    <div id="out"></div>
    ${tool.history ? `<div id="todo-history"></div>` : ""}`;

  function recallTodo(entry) {
    const field = document.querySelector('#tool-form [name="task"]');
    if (field) field.value = entry.task;
    showTodo(entry);
  }

  function showTodo(entry) {
    const out = document.getElementById("out");
    MagicTodo.mountResult(out, entry, {
      onSave: saveTodoList,
      onFocus: focusTodoList,
      onChange() {
        MagicTodo.mountHistory(document.getElementById("todo-history"), entry.id, recallTodo);
      },
    });
    MagicTodo.mountHistory(document.getElementById("todo-history"), entry.id, recallTodo);
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (tool.history) MagicTodo.mountHistory(document.getElementById("todo-history"), null, recallTodo);

  document.getElementById("tool-form").onsubmit = async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target).entries());
    for (const f of tool.fields) {
      if (f.required !== false && !String(values[f.name] || "").trim() && f.name !== "options" && f.name !== "constraints") {
        toast(`Commence par remplir « ${f.label} »`);
        return;
      }
    }
    const out = document.getElementById("out");
    out.innerHTML = `<div class="loading" style="margin-top:24px"><span class="spinner"></span>Le gobelin prépare sa magie…</div>`;
    const body = tool.buildBody ? tool.buildBody(values) : values;
    try {
      const result = await apiCall(tool.endpoint, body);
      addHistory(tool.name, tool.resultInput(values), result);
      if (tool.history) showTodo(MagicTodo.remember(values.task, result.steps));
      else out.innerHTML = tool.render(result);
    } catch (err) {
      out.innerHTML = `<div class="alert">⚠️ ${esc(err.message)}
        ${err.code === "not_configured" ? ' <a href="#/settings">Ouvrir les réglages →</a>' : ""}</div>`;
    }
  };
}

/* ============================ Taskmaster (focus local) ============================ */
function renderTaskmaster() {
  const lists = loadJSON(LS_LISTS, []);
  $app.innerHTML = `
    <p><a class="back" href="#/">← Tous les outils</a></p>
    <div class="tool-head"><span class="icon">⏯️</span><h1>Taskmaster</h1><span class="badge-new">Nouveau</span></div>
    <p class="tool-desc">Une seule étape à l'écran : coche, puis passe à la suivante. Découpe d'abord une tâche dans <a href="#/magic-todo">Magic ToDo</a> et enregistre la liste.</p>
    <div id="tm-body"></div>`;
  const body = document.getElementById("tm-body");

  const focus = loadJSON(LS_FOCUS, null);
  const activeList = focus && lists.find((l) => l.id === focus.listId);

  if (!lists.length) {
    body.innerHTML = `<div class="panel">Aucune liste pour l'instant. <a href="#/magic-todo">Découper une tâche avec Magic ToDo →</a></div>`;
    return;
  }

  if (!activeList) {
    body.innerHTML = `<div class="panel"><div class="field"><label>Choisir la liste à suivre</label>
      <select id="tm-pick">${lists.map((l) => `<option value="${l.id}">${esc(l.name)} (${plural(l.steps.length, "étape", "étapes")})</option>`).join("")}</select></div>
      <button class="btn" id="tm-start">Lancer le focus ⏯️</button></div>`;
    document.getElementById("tm-start").onclick = () => {
      saveJSON(LS_FOCUS, { listId: Number(document.getElementById("tm-pick").value), idx: 0, done: 0, skipped: 0 });
      renderTaskmaster();
    };
    return;
  }

  const total = activeList.steps.length;
  if (focus.idx >= total) {
    body.innerHTML = `<div class="focus-card"><div class="done-msg">🎉 Tout est fait !</div>
      <p class="sub-hint">${plural(focus.done, "terminée", "terminées")} · ${plural(focus.skipped, "passée", "passées")}</p>
      <div class="focus-actions"><button class="btn secondary" id="tm-again">Recommencer</button>
      <button class="btn" id="tm-exit">Quitter le focus</button></div></div>`;
    document.getElementById("tm-again").onclick = () => { saveJSON(LS_FOCUS, { ...focus, idx: 0, done: 0, skipped: 0 }); renderTaskmaster(); };
    document.getElementById("tm-exit").onclick = () => { localStorage.removeItem(LS_FOCUS); renderTaskmaster(); };
    return;
  }

  const step = activeList.steps[focus.idx];
  body.innerHTML = `
    <div class="focus-card">
      <div style="color:var(--muted)">« ${esc(activeList.name)} » · étape ${focus.idx + 1} / ${total}</div>
      <div class="step-text">${esc(step.text)}</div>
      ${step.substeps.length ? `<div class="sub-hint">${step.substeps.map(esc).join("\n")}</div>` : ""}
      <div class="focus-actions">
        <button class="btn" id="tm-done">✅ C'est fait</button>
        <button class="btn secondary" id="tm-skip">⏭️ Passer</button>
      </div>
      <div class="progress"><i style="width:${(focus.idx / total) * 100}%"></i></div>
      <div style="color:var(--muted);font-size:0.85rem">${plural(focus.done, "faite", "faites")} · ${plural(focus.skipped, "passée", "passées")}</div>
    </div>
    <div style="margin-top:14px"><button class="btn secondary small" id="tm-exit">Quitter le focus</button></div>`;
  const next = (inc) => { saveJSON(LS_FOCUS, { ...focus, idx: focus.idx + 1, done: focus.done + (inc === "done" ? 1 : 0), skipped: focus.skipped + (inc === "skip" ? 1 : 0) }); renderTaskmaster(); };
  document.getElementById("tm-done").onclick = () => next("done");
  document.getElementById("tm-skip").onclick = () => next("skip");
  document.getElementById("tm-exit").onclick = () => { localStorage.removeItem(LS_FOCUS); renderTaskmaster(); };
}

/* ============================ accueil ============================ */
function renderHome() {
  $app.innerHTML = `
    <p class="tagline">Quand ça paraît <strong>trop grand, trop compliqué</strong>, le gobelin te file un coup de main.</p>
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
    <p><a class="back" href="#/">← Tous les outils</a></p>
    <div class="tool-head"><span class="icon">🕘</span><h1>Historique</h1></div>
    <p class="tool-desc">${plural(hist.length, "résultat récent enregistré", "résultats récents enregistrés")} dans ce navigateur.</p>
    ${hist.length ? `<div class="panel">
      ${hist.map((h) => `<div class="hist-item"><b>${esc(h.tool)}</b> · ${esc(h.input)}
        <div class="meta">${new Date(h.time).toLocaleString("fr-FR")}</div></div>`).join("")}
      <div style="margin-top:14px"><button class="btn secondary small" id="hist-clear">Effacer l'historique</button></div>
    </div>` : `<div class="panel">Pas encore d'historique. Essaie un outil.</div>`}`;
  const clear = document.getElementById("hist-clear");
  if (clear) clear.onclick = () => { localStorage.removeItem(LS_HISTORY); renderHistory(); };
}

/* ============================ réglages ============================ */
async function renderSettings() {
  $app.innerHTML = `
    <p><a class="back" href="#/">← Tous les outils</a></p>
    <div class="tool-head"><span class="icon">⚙️</span><h1>Réglages</h1></div>
    <p class="tool-desc">Configure une API compatible OpenAI (DeepSeek, Qwen, Kimi, OpenAI, etc.).</p>
    <div class="panel"><div id="set-loading" class="loading"><span class="spinner"></span>Lecture de la configuration…</div></div>`;

  let cur;
  try { cur = await apiCall("/api/settings", undefined, "GET"); } catch (err) {
    document.getElementById("set-loading").outerHTML = `<div class="alert">${esc(err.message)}</div>`;
    return;
  }

  document.querySelector(".panel").innerHTML = `
    <div class="field"><label><span class="status-dot ${cur.has_key ? "ok" : "no"}"></span>Clé API ${cur.has_key ? `(actuelle : ${esc(cur.api_key_masked)})` : "(non définie)"}</label>
      <input type="password" id="set-key" placeholder="sk-…  laisser vide pour conserver la clé" autocomplete="off" /></div>
    <div class="field"><label>URL de base</label><input type="text" id="set-url" value="${esc(cur.base_url)}" /></div>
    <div class="field"><label>Nom du modèle</label><input type="text" id="set-model" value="${esc(cur.model)}" /></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" id="set-save">Enregistrer</button>
      <button class="btn secondary" id="set-test">🔌 Tester la connexion</button>
    </div>
    <p class="tool-desc" style="margin-top:14px">Astuce : DeepSeek utilise <code>https://api.deepseek.com/v1</code> et <code>deepseek-chat</code> ; Qwen utilise <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code> et <code>qwen-plus</code>.</p>
    <div id="set-out"></div>`;

  const save = async () => {
    const body = { base_url: document.getElementById("set-url").value, model: document.getElementById("set-model").value };
    const key = document.getElementById("set-key").value.trim();
    if (key) body.api_key = key;
    await apiCall("/api/settings", body, "PUT");
    document.getElementById("set-key").value = "";
    toast("Enregistré ✅");
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
};

function route() {
  const id = location.hash.replace(/^#\/?/, "");
  if (ROUTES[id]) return ROUTES[id]();
  if (TOOLS[id]) return renderToolPage(TOOLS[id]);
  renderHome();
}

initThemeToggle();
window.addEventListener("hashchange", route);
route();
