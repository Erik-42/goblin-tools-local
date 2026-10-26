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
    icon: "✅", name: "Magic ToDo", desc: "Découpe les choses à faire",
  },
  formalizer: {
    icon: "✍️", name: "Formalizer", desc: "Change le ton d'un texte",
  },
  judge: {
    icon: "⚖️", name: "Judge", desc: "Lit l'émotion d'un texte",
    help: "Colle un message. Juger décrit l'impression qu'il donne. Proposer une réponse écrit un message que tu pourrais renvoyer. Ajouter sert à coller un second message du même échange.",
    fields: [
      { name: "text", label: "Écris ton texte ici…", type: "textarea", placeholder: "Par exemple : un message « passe me voir dans mon bureau quand tu as cinq minutes. »" },
      { name: "extra", label: "Autre message", type: "textarea", placeholder: "Un autre message du même échange", optionalToggle: "Ajouter", required: false },
    ],
    actions: [
      { mode: "judge", label: "Juger" },
      { mode: "reply", label: "Proposer une réponse", secondary: true },
    ],
    endpoint: "/api/judge",
    resultInput: (v) => v.text,
    summary: (r) => r.tone || r.impression || "",
    render: (r) => `
      <div class="result">
        <label>Ton texte donne l'impression de…</label>
        <div class="prose" id="judge-impression">${esc(r.impression || r.summary || "")}</div>
        ${r.reply ? `<label>Réponse possible</label><div class="prose" id="judge-reply">${esc(r.reply)}</div>
          <button class="copy-text" type="button" data-copy-target="#judge-reply">Copier</button>` : ""}
      </div>`,
  },
  professor: {
    icon: "🎓", name: "Professor", desc: "Explique n'importe quoi",
    help: "Écris un sujet. Le piquant règle le niveau de détail. Tu obtiens une explication, puis un exemple.",
    submitLabel: "Expliquer",
    fields: [
      { name: "topic", label: "Écris un sujet ici…", type: "textarea", placeholder: "Par exemple : comment fonctionne un four" },
      { name: "spice", type: "spice", hint: "Niveau de piquant : jusqu'où détailler l'explication.", default: 3 },
    ],
    endpoint: "/api/professor",
    resultInput: (v) => v.topic,
    summary: (r) => String(r.explanation || r.summary || "").slice(0, 80),
    render: (r) => `
      <div class="result">
        <label>L'explication</label>
        <div class="prose">${esc(r.explanation || r.summary || "")}</div>
        ${r.example ? `<label>Avec un exemple</label><div class="prose">${esc(r.example)}</div>` : ""}
        ${(r.points || []).map((p) => `<div class="step"><b>${esc(p.title)}</b><div class="substep" style="padding-left:0">${esc(p.body)}</div></div>`).join("")}
      </div>`,
  },
  consultant: {
    icon: "💡", name: "Consultant", desc: "Aide à décider",
    help: "Décris ce qui te fait hésiter. Tu obtiens les avantages, les inconvénients, puis un conseil.",
    submitLabel: "Donner un conseil",
    fields: [
      { name: "situation", label: "Écris la situation ici…", type: "textarea", placeholder: "Par exemple : ce week-end, je finis le dossier ou je vais au concert" },
    ],
    endpoint: "/api/consultant",
    resultInput: (v) => v.situation,
    summary: (r) => String(r.advice || r.recommendation || "").slice(0, 80),
    render: (r) => `
      <div class="result">
        <label>Avantages</label><div class="prose">${esc(r.pros || "")}</div>
        <label>Inconvénients</label><div class="prose">${esc(r.cons || "")}</div>
        <label>Le conseil</label><div class="prose">${esc(r.advice || r.recommendation || "")}</div>
      </div>`,
  },
  estimator: {
    icon: "⏱️", name: "Estimator", desc: "Devine combien de temps prendra une activité",
    help: "Décris une activité. Le piquant règle le niveau de prudence de la durée.",
    submitLabel: "Estimer",
    fields: [
      { name: "task", label: "Écris une activité ici…", type: "textarea", placeholder: "Par exemple : nettoyer l'appartement et lancer une machine" },
      { name: "spice", type: "spice", hint: "Niveau de piquant : à quel point détailler la durée.", default: 2 },
    ],
    endpoint: "/api/estimator",
    resultInput: (v) => v.task,
    summary: (r) => r.rough || fmtMinutes(r.total_minutes),
    render: (r) => `<div class="result"><label>Ça prendra à peu près…</label><div class="prose">${esc(r.rough || fmtMinutes(r.total_minutes))}</div></div>`,
  },
  compiler: {
    icon: "🧠", name: "Compiler", desc: "Transforme un vrac d'idées en tâches",
    help: "Vide tout ce qui tourne dans ta tête. Le résultat est une liste d'actions, que tu peux envoyer dans Magic ToDo.",
    submitLabel: "Transformer en tâches",
    fields: [{ name: "brainstorm", label: "Écris ton vrac ici…", type: "textarea", placeholder: "Écris n'importe comment, plus c'est en vrac, mieux c'est…" }],
    endpoint: "/api/compiler",
    resultInput: (v) => v.brainstorm,
    summary: (r) => plural((r.actions || []).length, "action", "actions"),
    render: (r) => `<div class="result"><h2>Tâches</h2>
      <ul class="step-list">${(r.actions || []).map((a) => `<li class="step"><b>${esc(a.text)}</b>${a.category ? `<span class="tag" style="margin-left:8px">${esc(a.category)}</span>` : ""}</li>`).join("")}</ul>
      <button class="btn secondary" type="button" id="compiler-send">Ajouter à Magic ToDo</button></div>`,
  },
  chef: {
    icon: "👨‍🍳", name: "Chef", desc: "Compose une recette avec ce que tu as",
    help: "Écris les ingrédients, et aussi le nombre de personnes, le temps ou un régime si tu veux. Le résultat se copie.",
    submitLabel: "Suggérer",
    fields: [
      { name: "ingredients", label: "Ingrédients et contraintes", type: "textarea", placeholder: "Écris ce que tu as, et aussi un régime, un nombre de personnes, un temps…" },
    ],
    endpoint: "/api/chef",
    resultInput: (v) => v.ingredients,
    summary: (r) => (r.recipes || []).map((recipe) => recipe.name).filter(Boolean).join(", "),
    render: (r) => {
      const text = (r.recipes || []).map((rc) => [rc.name, rc.description, ...(rc.steps || [])].filter(Boolean).join("\n")).join("\n\n");
      return `<div class="result"><label>Tu pourrais cuisiner…</label>
        <div class="prose" id="chef-output">${esc(text)}</div>
        <button class="copy-text" type="button" data-copy-target="#chef-output">Copier</button></div>`;
    },
  },
};

const HOME_CARDS = [
  ["magic-todo"], ["formalizer"], ["judge"],
  ["taskmaster", { icon: "⏯️", name: "Taskmaster", desc: "Une seule tâche à la fois", badge: "Nouveau" }],
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
      showEntry(ToolHistory.remember(id, {
        label: tool.resultInput(values),
        meta: tool.summary ? tool.summary(result) : "",
        values,
        result,
      }));
    } catch (err) {
      out.innerHTML = `<div class="alert">⚠️ ${esc(err.message)}
        ${err.code === "not_configured" ? ' <a href="#/settings">Ouvrir les réglages →</a>' : ""}</div>`;
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
    <p><a class="back" href="#/">← Tous les outils</a></p>
    <div class="tool-head"><span class="icon">⏯️</span><h1>Taskmaster</h1><span class="badge-new">Nouveau</span>
      <div class="tool-help"><button class="tool-help__toggle" type="button" aria-expanded="false">Aide ?</button>
        <p class="tool-help__text" hidden>Une seule tâche de l'onglet Magic ToDo en cours. Coche-la, puis passe à la suivante.</p></div>
    </div>
    <p class="tool-desc">Ta mission, si tu l'acceptes</p>
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
    body.innerHTML = `<div class="panel">Rien dans cet onglet pour l'instant. Ajoute d'abord des éléments dans <a href="#/magic-todo">Magic ToDo</a>.</div>`;
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
    <p class="tool-desc">En mode Ollama, le modèle suit <code>ia-choix</code>. Sinon, configure une API compatible OpenAI.</p>
    <div class="panel"><div id="set-loading" class="loading"><span class="spinner"></span>Lecture de la configuration…</div></div>`;

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
    <div class="field"><label><span class="status-dot ${cur.has_key ? "ok" : "no"}"></span>Clé API ${cur.has_key ? `(actuelle : ${esc(cur.api_key_masked)})` : "(non définie)"}</label>
      <input type="password" id="set-key" placeholder="sk-…  laisser vide pour conserver la clé" autocomplete="off" /></div>
    <div class="field"><label>URL de base</label><input type="text" id="set-url" value="${esc(cur.base_url)}" /></div>
    <div class="field"><label>Nom du modèle</label><input type="text" id="set-model" value="${esc(cur.model)}" /></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" id="set-save">Enregistrer</button>
      <button class="btn secondary" id="set-test">🔌 Tester la connexion</button>
    </div>
    <p class="tool-desc" style="margin-top:14px">Astuce : Ollama local utilise <code>http://127.0.0.1:11434/v1</code>. Le modèle suit le choix de <code>ia-choix</code>.</p>
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

initThemeToggle();
window.addEventListener("hashchange", route);
route();
