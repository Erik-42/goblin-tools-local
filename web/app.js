/* Goblin Tools 本地版 —— 前端 SPA（无框架，hash 路由） */
"use strict";

const $app = document.getElementById("app");
const LS_HISTORY = "gt_history";
const LS_LISTS = "gt_lists";           // 保存的 ToDo 清单 [{id,name,steps,created}]
const LS_FOCUS = "gt_focus";           // Taskmaster 当前聚焦队列 {listId, idx, done, skipped}

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

async function apiCall(path, body, method = "POST") {
  const resp = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.detail || `请求失败（${resp.status}）`);
    err.code = data.code;
    throw err;
  }
  return data;
}

/* ============================ 工具配置 ============================ */
const TOOLS = {
  "magic-todo": {
    icon: "✅", name: "Magic ToDo", desc: "把大任务拆解成一个个小步骤",
    fields: [{ name: "task", label: "你要做什么？", type: "textarea", placeholder: "例如：准备一场朋友的生日派对" }],
    endpoint: "/api/magic-todo",
    resultInput: (v) => v.task,
    render: renderSteps, withActions: true,
  },
  formalizer: {
    icon: "✍️", name: "Formalizer", desc: "把文本改写成指定语气风格",
    fields: [
      { name: "text", label: "原文（随意写的就行）", type: "textarea", placeholder: "例如：那个会议我不想去 太累了" },
      { name: "tone", label: "目标语气", type: "select", options: [
        ["clear", "清晰简单"], ["friendly", "友好亲切"], ["professional", "专业正式"],
        ["academic", "学术"], ["direct", "直接"], ["apologetic", "道歉"], ["enthusiastic", "热情"],
      ] },
    ],
    endpoint: "/api/formalizer",
    resultInput: (v) => v.text,
    render: (r) => `<div class="result"><h2>改写结果（${esc(r.tone)}）</h2><div class="prose">${esc(r.text)}</div></div>`,
  },
  judge: {
    icon: "⚖️", name: "Judge", desc: "分析一段文字里隐含的情绪",
    fields: [{ name: "text", label: "粘贴让你拿不准的文字", type: "textarea", placeholder: "例如：领导发来的消息“有空来我办公室一趟。”" }],
    endpoint: "/api/judge",
    resultInput: (v) => v.text,
    render: (r) => `
      <div class="result"><h2>情绪分析</h2>
        <div class="prose">${esc(r.summary)}</div>
        ${r.tone ? `<p class="kv" style="margin-top:12px"><b>整体语气：</b><span class="tag">${esc(r.tone)}</span></p>` : ""}
        ${(r.emotions || []).map((e) => `<div class="step"><b>${esc(e.name)}</b><div class="substep" style="padding-left:0">${esc(e.evidence)}</div></div>`).join("")}
      </div>`,
  },
  professor: {
    icon: "🎓", name: "Professor", desc: "按任意深度解释任何主题",
    fields: [
      { name: "topic", label: "想弄懂什么？", type: "textarea", placeholder: "例如：量子计算是怎么回事" },
      { name: "depth", label: "讲解深度", type: "select", options: [
        ["child", "给 6 岁小孩讲"], ["teen", "中学生水平"], ["college", "大学生水平"], ["expert", "专家水平"],
      ] },
    ],
    endpoint: "/api/professor",
    resultInput: (v) => v.topic,
    render: (r) => `
      <div class="result"><h2>讲解</h2>
        ${r.summary ? `<div class="prose">${esc(r.summary)}</div>` : ""}
        <div style="margin-top:12px">${(r.points || []).map((p) => `<div class="step"><b>${esc(p.title)}</b><div class="substep" style="padding-left:0">${esc(p.body)}</div></div>`).join("")}</div>
      </div>`,
  },
  consultant: {
    icon: "💡", name: "Consultant", desc: "帮你权衡选项、做出决策",
    fields: [
      { name: "situation", label: "你在纠结什么？", type: "textarea", placeholder: "例如：周末到底是加班赶方案，还是去看演出" },
      { name: "options", label: "候选选项（每行一个，可不填）", type: "textarea", placeholder: "加班\n去看演出" },
    ],
    endpoint: "/api/consultant",
    resultInput: (v) => v.situation,
    buildBody: (v) => ({ situation: v.situation, options: (v.options || "").split("\n").map((s) => s.trim()).filter(Boolean) }),
    render: (r) => `
      <div class="result"><h2>决策分析</h2>
        ${(r.options || []).map((o) => `
          <div class="step"><b>${esc(o.name)}</b>
            <div class="kv" style="margin-top:6px">${(o.pros || []).map((p) => `<span class="tag">👍 ${esc(p)}</span>`).join("")}
            ${(o.cons || []).map((c) => `<span class="tag" style="background:#fdeceb;color:#a5322a">👎 ${esc(c)}</span>`).join("")}</div>
          </div>`).join("")}
        ${r.recommendation ? `<div class="prose" style="margin-top:12px"><b>建议：</b>${esc(r.recommendation)}</div>` : ""}
      </div>`,
  },
  estimator: {
    icon: "⏱️", name: "Estimator", desc: "估算一件事真正需要的时间",
    fields: [{ name: "task", label: "你要估算的任务", type: "textarea", placeholder: "例如：打扫整个房子 + 洗一次衣服" }],
    endpoint: "/api/estimator",
    resultInput: (v) => v.task,
    render: (r) => {
      const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60 ? m % 60 + " 分钟" : ""}` : `${m} 分钟`);
      return `<div class="result"><h2>时间估算</h2>
        <div class="panel">${(r.items || []).map((i) => `<div class="mini-item"><span>${esc(i.text)}</span><b>${fmt(i.minutes)}</b></div>`).join("")}</div>
        <div class="total-bar">总计约 ${fmt(r.total_minutes)}</div></div>`;
    },
  },
  compiler: {
    icon: "🧠", name: "Compiler", desc: "把头脑风暴碎念编译成行动项",
    fields: [{ name: "brainstorm", label: "倒出你所有的想法", type: "textarea", placeholder: "随便写，越乱越好……" }],
    endpoint: "/api/compiler",
    resultInput: (v) => v.brainstorm,
    render: (r) => `<div class="result"><h2>行动项清单</h2>
      <ul class="step-list">${(r.actions || []).map((a) => `<li class="step"><b>${esc(a.text)}</b>${a.category ? `<span class="tag" style="margin-left:8px">${esc(a.category)}</span>` : ""}</li>`).join("")}</ul></div>`,
  },
  chef: {
    icon: "👨‍🍳", name: "Chef", desc: "根据现有食材生成食谱",
    fields: [
      { name: "ingredients", label: "你手头有什么食材？", type: "textarea", placeholder: "例如：鸡蛋、番茄、剩米饭、一点芝士" },
      { name: "constraints", label: "限制或偏好（可不填）", type: "text", placeholder: "例如：不吃辣、15 分钟内能搞定" },
    ],
    endpoint: "/api/chef",
    resultInput: (v) => v.ingredients,
    render: (r) => `<div class="result"><h2>可以这样做</h2>
      ${(r.recipes || []).map((rc) => `<div class="recipe"><b>${esc(rc.name)}</b><div class="kv">${esc(rc.description)}</div>
        <div>${(rc.ingredients || []).map((i) => `<span class="tag">${esc(i)}</span>`).join("")}</div>
        <ol>${(rc.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>`).join("")}</div>`,
  },
};

const HOME_CARDS = [
  ["magic-todo"], ["formalizer"], ["judge"],
  ["taskmaster", { icon: "⏯️", name: "Taskmaster", desc: "一次只聚焦一个任务", badge: "New!" }],
  ["professor"], ["consultant"], ["estimator"], ["compiler"], ["chef"],
];

/* ============================ 渲染：步骤 + 清单操作 ============================ */
function renderSteps(r) {
  return `<div class="result"><h2>拆解结果</h2>
    <ul class="step-list">${r.steps.map((s, i) => `
      <li class="step"><b>${i + 1}. ${esc(s.text)}</b>
        ${s.substeps.map((ss) => `<div class="substep">${esc(ss)}</div>`).join("")}</li>`).join("")}</ul>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn secondary small" id="btn-save-list">💾 保存为清单</button>
      <button class="btn small" id="btn-focus">⏯️ 用 Taskmaster 聚焦</button>
    </div></div>`;
}

function bindStepsActions(steps, taskText) {
  const saveBtn = document.getElementById("btn-save-list");
  const focusBtn = document.getElementById("btn-focus");
  const flat = steps.map((s) => ({ text: s.text, substeps: s.substeps }));
  if (saveBtn) saveBtn.onclick = () => {
    const lists = loadJSON(LS_LISTS, []);
    lists.unshift({ id: Date.now(), name: taskText, steps: flat, created: Date.now() });
    saveJSON(LS_LISTS, lists.slice(0, 30));
    toast("已保存到清单 ✅");
  };
  if (focusBtn) focusBtn.onclick = () => {
    const lists = loadJSON(LS_LISTS, []);
    const item = { id: Date.now(), name: taskText, steps: flat, created: Date.now() };
    lists.unshift(item);
    saveJSON(LS_LISTS, lists.slice(0, 30));
    saveJSON(LS_FOCUS, { listId: item.id, idx: 0, done: 0, skipped: 0 });
    location.hash = "#/taskmaster";
  };
}

/* ============================ 通用工具页 ============================ */
function renderToolPage(tool) {
  $app.innerHTML = `
    <p><a class="back" href="#/">← 全部工具</a></p>
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
      <button class="btn" type="submit">开始 ✨</button>
    </form>
    <div id="out"></div>`;

  document.getElementById("tool-form").onsubmit = async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target).entries());
    for (const f of tool.fields) {
      if (f.required !== false && !String(values[f.name] || "").trim() && f.name !== "options" && f.name !== "constraints") {
        toast(`请先填写「${f.label}」`);
        return;
      }
    }
    const out = document.getElementById("out");
    out.innerHTML = `<div class="loading" style="margin-top:24px"><span class="spinner"></span>小精灵正在施法……</div>`;
    const body = tool.buildBody ? tool.buildBody(values) : values;
    try {
      const result = await apiCall(tool.endpoint, body);
      out.innerHTML = tool.render(result);
      addHistory(tool.name, tool.resultInput(values), result);
      if (tool.withActions) bindStepsActions(result.steps, values.task);
    } catch (err) {
      out.innerHTML = `<div class="alert">⚠️ ${esc(err.message)}
        ${err.code === "not_configured" ? '　<a href="#/settings">前往设置 →</a>' : ""}</div>`;
    }
  };
}

/* ============================ Taskmaster（本地聚焦） ============================ */
function renderTaskmaster() {
  const lists = loadJSON(LS_LISTS, []);
  $app.innerHTML = `
    <p><a class="back" href="#/">← 全部工具</a></p>
    <div class="tool-head"><span class="icon">⏯️</span><h1>Taskmaster</h1><span class="badge-new">New!</span></div>
    <p class="tool-desc">一次只看一个步骤，做完打勾再继续。先在 <a href="#/magic-todo">Magic ToDo</a> 拆解并保存清单。</p>
    <div id="tm-body"></div>`;
  const body = document.getElementById("tm-body");

  const focus = loadJSON(LS_FOCUS, null);
  const activeList = focus && lists.find((l) => l.id === focus.listId);

  if (!lists.length) {
    body.innerHTML = `<div class="panel">还没有清单。<a href="#/magic-todo">用 Magic ToDo 拆一个任务 →</a></div>`;
    return;
  }

  if (!activeList) {
    body.innerHTML = `<div class="panel"><div class="field"><label>选择要聚焦的清单</label>
      <select id="tm-pick">${lists.map((l, i) => `<option value="${l.id}">${esc(l.name)}（${l.steps.length} 步）</option>`).join("")}</select></div>
      <button class="btn" id="tm-start">开始聚焦 ⏯️</button></div>`;
    document.getElementById("tm-start").onclick = () => {
      saveJSON(LS_FOCUS, { listId: Number(document.getElementById("tm-pick").value), idx: 0, done: 0, skipped: 0 });
      renderTaskmaster();
    };
    return;
  }

  const total = activeList.steps.length;
  if (focus.idx >= total) {
    body.innerHTML = `<div class="focus-card"><div class="done-msg">🎉 全部搞定！</div>
      <p class="sub-hint">完成 ${focus.done} 项 · 跳过 ${focus.skipped} 项</p>
      <div class="focus-actions"><button class="btn secondary" id="tm-again">重新来一遍</button>
      <button class="btn" id="tm-exit">退出聚焦</button></div></div>`;
    document.getElementById("tm-again").onclick = () => { saveJSON(LS_FOCUS, { ...focus, idx: 0, done: 0, skipped: 0 }); renderTaskmaster(); };
    document.getElementById("tm-exit").onclick = () => { localStorage.removeItem(LS_FOCUS); renderTaskmaster(); };
    return;
  }

  const step = activeList.steps[focus.idx];
  body.innerHTML = `
    <div class="focus-card">
      <div style="color:var(--muted)">「${esc(activeList.name)}」 · 第 ${focus.idx + 1} / ${total} 步</div>
      <div class="step-text">${esc(step.text)}</div>
      ${step.substeps.length ? `<div class="sub-hint">${step.substeps.map(esc).join("\n")}</div>` : ""}
      <div class="focus-actions">
        <button class="btn" id="tm-done">✅ 完成了</button>
        <button class="btn secondary" id="tm-skip">⏭️ 先跳过</button>
      </div>
      <div class="progress"><i style="width:${(focus.idx / total) * 100}%"></i></div>
      <div style="color:var(--muted);font-size:0.85rem">已做 ${focus.done} · 跳过 ${focus.skipped}</div>
    </div>
    <div style="margin-top:14px"><button class="btn secondary small" id="tm-exit">退出聚焦</button></div>`;
  const next = (inc) => { saveJSON(LS_FOCUS, { ...focus, idx: focus.idx + 1, done: focus.done + (inc === "done" ? 1 : 0), skipped: focus.skipped + (inc === "skip" ? 1 : 0) }); renderTaskmaster(); };
  document.getElementById("tm-done").onclick = () => next("done");
  document.getElementById("tm-skip").onclick = () => next("skip");
  document.getElementById("tm-exit").onclick = () => { localStorage.removeItem(LS_FOCUS); renderTaskmaster(); };
}

/* ============================ 首页 ============================ */
function renderHome() {
  $app.innerHTML = `
    <p class="tagline">当事情显得<strong>太大、太复杂</strong>时，小精灵帮你一把。</p>
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

/* ============================ 历史 ============================ */
function renderHistory() {
  const hist = loadJSON(LS_HISTORY, []);
  $app.innerHTML = `
    <p><a class="back" href="#/">← 全部工具</a></p>
    <div class="tool-head"><span class="icon">🕘</span><h1>历史记录</h1></div>
    <p class="tool-desc">最近 ${hist.length} 条结果保存在本机浏览器里。</p>
    ${hist.length ? `<div class="panel">
      ${hist.map((h) => `<div class="hist-item"><b>${esc(h.tool)}</b> · ${esc(h.input)}
        <div class="meta">${new Date(h.time).toLocaleString()}</div></div>`).join("")}
      <div style="margin-top:14px"><button class="btn secondary small" id="hist-clear">清空历史</button></div>
    </div>` : `<div class="panel">还没有记录，去用个工具吧。</div>`}`;
  const clear = document.getElementById("hist-clear");
  if (clear) clear.onclick = () => { localStorage.removeItem(LS_HISTORY); renderHistory(); };
}

/* ============================ 设置 ============================ */
async function renderSettings() {
  $app.innerHTML = `
    <p><a class="back" href="#/">← 全部工具</a></p>
    <div class="tool-head"><span class="icon">⚙️</span><h1>设置</h1></div>
    <p class="tool-desc">配置 OpenAI 兼容接口（DeepSeek、通义千问、Kimi、OpenAI 等均可）。</p>
    <div class="panel"><div id="set-loading" class="loading"><span class="spinner"></span>读取当前配置……</div></div>`;

  let cur;
  try { cur = await apiCall("/api/settings", undefined, "GET"); } catch (err) {
    document.getElementById("set-loading").outerHTML = `<div class="alert">${esc(err.message)}</div>`;
    return;
  }

  document.querySelector(".panel").innerHTML = `
    <div class="field"><label><span class="status-dot ${cur.has_key ? "ok" : "no"}"></span>API Key ${cur.has_key ? `（当前：${esc(cur.api_key_masked)}）` : "（未设置）"}</label>
      <input type="text" id="set-key" placeholder="sk-…　留空则保持不变" /></div>
    <div class="field"><label>Base URL</label><input type="text" id="set-url" value="${esc(cur.base_url)}" /></div>
    <div class="field"><label>模型名</label><input type="text" id="set-model" value="${esc(cur.model)}" /></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" id="set-save">保存</button>
      <button class="btn secondary" id="set-test">🔌 测试连通性</button>
    </div>
    <p class="tool-desc" style="margin-top:14px">提示：DeepSeek 填 <code>https://api.deepseek.com/v1</code> + <code>deepseek-chat</code>；通义千问填 <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code> + <code>qwen-plus</code>。</p>
    <div id="set-out"></div>`;

  const save = async () => {
    const body = { base_url: document.getElementById("set-url").value, model: document.getElementById("set-model").value };
    const key = document.getElementById("set-key").value.trim();
    if (key) body.api_key = key;
    await apiCall("/api/settings", body, "PUT");
    document.getElementById("set-key").value = "";
    toast("已保存 ✅");
  };
  document.getElementById("set-save").onclick = async () => {
    try { await save(); } catch (err) { document.getElementById("set-out").innerHTML = `<div class="alert">${esc(err.message)}</div>`; }
  };
  document.getElementById("set-test").onclick = async () => {
    const out = document.getElementById("set-out");
    out.innerHTML = `<div class="loading" style="margin-top:14px"><span class="spinner"></span>正在请求模型……</div>`;
    try {
      try { await save(); } catch { /* 部分字段保存失败也继续测试 */ }
      const r = await apiCall("/api/settings/test", {});
      out.innerHTML = `<div class="prose" style="margin-top:14px;border-color:var(--green)">✅ 连通成功，模型回复：${esc(r.reply)}</div>`;
    } catch (err) {
      out.innerHTML = `<div class="alert">❌ ${esc(err.message)}</div>`;
    }
  };
}

/* ============================ 路由 ============================ */
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

window.addEventListener("hashchange", route);
route();
