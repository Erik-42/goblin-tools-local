/* Liste Magic ToDo : onglets, cases, découpage, modèles et historique d'un ancien découpage. */
(function (global) {
  "use strict";

  const KEY = "gt_todo_board";

  const TEMPLATES = [
    { group: "Autour de la maison", name: "Faire la vaisselle", steps: ["Débarrasser la table", "Vider les restes", "Laver les assiettes et les verres", "Rincer et égoutter", "Essuyer le plan de travail", "Ranger ce qui est sec"] },
    { group: "Autour de la maison", name: "Nettoyer la salle de bain", steps: ["Sortir les affaires qui traînent", "Vaporiser le lavabo et le miroir", "Frotter la douche ou la baignoire", "Nettoyer les toilettes", "Laver le sol", "Remettre les serviettes"] },
    { group: "Autour de la maison", name: "Faire une lessive", steps: ["Trier le linge par couleur", "Vérifier les poches", "Lancer la machine", "Étendre ou mettre au sèche-linge", "Plier le linge sec", "Le ranger"] },
    { group: "Autour de la maison", name: "Faire les courses", steps: ["Regarder ce qui manque", "Écrire une liste courte", "Prendre les sacs", "Faire le tour du magasin", "Ranger les produits frais en rentrant"] },
    { group: "Autour de la maison", name: "Ranger une pièce", steps: ["Choisir une seule pièce", "Ramasser ce qui est au sol", "Jeter ou recycler l'inutile", "Remettre chaque objet à sa place", "Passer un coup de chiffon"] },
    { group: "Autour de la maison", name: "Nettoyer la cuisine à fond", steps: ["Vider le plan de travail", "Laver la vaisselle en cours", "Nettoyer la plaque et l'évier", "Essuyer les façades", "Sortir les miettes du sol"] },
    { group: "Autour de la maison", name: "Changer les draps", steps: ["Retirer la housse et les taies", "Mettre le linge sale de côté", "Poser le drap propre", "Changer la housse de couette", "Regonfler les oreillers"] },
    { group: "Autour de la maison", name: "Sortir toutes les poubelles", steps: ["Fermer les sacs pleins", "Rassembler les bacs", "Les descendre", "Remettre un sac neuf", "Laver le seau s'il sent mauvais"] },
    { group: "Autour de la maison", name: "Préparer les repas de la semaine", steps: ["Choisir trois plats simples", "Vérifier les ingrédients", "Cuire ce qui se conserve", "Répartir dans des boîtes", "Noter quel jour manger quoi"] },
    { group: "Autour de la maison", name: "Déménager", steps: ["Lister les pièces", "Rassembler les cartons", "Emballer une pièce à la fois", "Étiqueter chaque carton", "Prévoir le transport", "Défaire d'abord le lit et la cuisine"] },
    { group: "Autour de la maison", name: "Sortir de la maison", steps: ["Choisir les vêtements", "Prendre les clés et le téléphone", "Vérifier le sac", "Fermer les fenêtres", "Verrouiller la porte"] },
    { group: "Autour de la maison", name: "Routine du matin", steps: ["Se lever", "Boire un verre d'eau", "Se laver", "S'habiller", "Prendre le petit-déjeuner", "Préparer ce qu'il faut emporter"] },
    { group: "Autour de la maison", name: "Se préparer à dormir", steps: ["Ranger le strict nécessaire", "Se laver les dents", "Préparer les vêtements du lendemain", "Baisser les lumières", "Se coucher"] },
    { group: "Travail", name: "Préparer une réunion", steps: ["Relire l'objet", "Noter trois points à dire", "Ouvrir les documents utiles", "Prévoir les questions", "Arriver avec de quoi noter"] },
    { group: "Travail", name: "Écrire un rapport", steps: ["Écrire le titre et la question", "Lister les faits", "Rédiger une partie à la fois", "Relire à voix haute", "Envoyer"] },
    { group: "Travail", name: "Accueillir quelqu'un", steps: ["Préparer son accès", "Noter ce qu'il doit savoir le premier jour", "Présenter l'équipe", "Montrer où trouver l'aide", "Prévoir un point en fin de journée"] },
    { group: "Travail", name: "Planifier un projet", steps: ["Écrire le résultat attendu", "Découper en étapes", "Choisir la première action", "Noter qui fait quoi", "Fixer une date de revue"] },
    { group: "Travail", name: "Faire un retour", steps: ["Choisir un exemple précis", "Dire ce qui a bien marché", "Dire ce qui peut changer", "Proposer une suite", "Laisser la place de répondre"] },
    { group: "Travail", name: "Préparer une présentation", steps: ["Écrire la phrase principale", "Faire peu de diapositives", "Ajouter un exemple", "Répéter une fois", "Vérifier que ça s'ouvre"] },
    { group: "Travail", name: "Vider la boîte mail", steps: ["Archiver ce qui est fini", "Répondre aux messages courts", "Transformer le reste en tâches", "Se désabonner d'une liste inutile"] },
    { group: "Travail", name: "Faire une rétrospective", steps: ["Rappeler l'objectif de la période", "Noter ce qui a aidé", "Noter ce qui a bloqué", "Choisir un seul changement", "Dire qui s'en occupe"] },
    { group: "Travail", name: "Conduire un entretien", steps: ["Relire le poste", "Préparer les mêmes questions pour tout le monde", "Laisser le temps de répondre", "Noter des faits", "Dire la suite du processus"] },
    { group: "Administratif", name: "Réserver des vacances", steps: ["Choisir les dates", "Vérifier le budget", "Comparer deux options", "Réserver le transport", "Noter l'adresse et les horaires"] },
    { group: "Administratif", name: "S'inscrire chez un médecin", steps: ["Trouver un cabinet qui prend des patients", "Rassembler la carte et un justificatif", "Appeler ou remplir le formulaire", "Noter le rendez-vous"] },
    { group: "Administratif", name: "Renouveler un passeport", steps: ["Vérifier la date d'expiration", "Faire une photo", "Rassembler les pièces", "Prendre rendez-vous", "Déposer le dossier"] },
    { group: "Administratif", name: "Faire sa déclaration", steps: ["Rassembler les revenus", "Ouvrir le formulaire", "Remplir une partie", "Vérifier les montants", "Envoyer avant la date"] },
    { group: "Administratif", name: "Résilier un abonnement", steps: ["Retrouver le contrat", "Noter la date de fin", "Écrire la demande", "Garder la preuve", "Vérifier le prélèvement suivant"] },
  ];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function uid() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  function item(text) {
    return {
      id: uid(),
      text: String(text || "").trim(),
      done: false,
      open: true,
      deadline: "",
      minutes: null,
      subtasks: [],
    };
  }

  function normalizeNode(row) {
    if (!row || !String(row.text || "").trim()) return null;
    return {
      id: row.id || uid(),
      text: String(row.text || "").trim(),
      done: !!row.done,
      open: row.open !== false,
      deadline: row.deadline || "",
      minutes: Number.isFinite(Number(row.minutes)) ? Number(row.minutes) : null,
      subtasks: (row.subtasks || []).map(normalizeNode).filter(Boolean),
    };
  }

  function blank() {
    const id = uid();
    return { spice: 3, activeId: id, tabs: [{ id, name: "À faire", items: [] }] };
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      if (!data || !Array.isArray(data.tabs) || !data.tabs.length) return blank();
      data.spice = Spice.clamp(data.spice);
      data.tabs.forEach((tab) => {
        tab.items = (tab.items || []).map(normalizeNode).filter(Boolean);
      });
      if (!data.tabs.some((tab) => tab.id === data.activeId)) data.activeId = data.tabs[0].id;
      return data;
    } catch {
      return blank();
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
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
        <button class="btn secondary small" type="button" id="btn-save-list">Ajouter à la liste</button>
        <button class="btn small" type="button" id="btn-focus">⏯️ Focus avec Taskmaster</button>
      </div>
    </div>`;
  }

  function mountResult(container, entry, actions) {
    actions = actions || {};
    container.innerHTML = renderResult(entry);
    container.querySelectorAll(".magic-todo__box").forEach((box) => {
      box.addEventListener("change", () => {
        const index = Number(box.dataset.step);
        entry.steps[index].done = box.checked;
        box.closest(".magic-todo__step").classList.toggle("magic-todo__step--done", box.checked);
        container.querySelector(".magic-todo__progress").textContent = progress(entry.steps);
        if (actions.onChange) actions.onChange(entry);
      });
    });
    const saveBtn = container.querySelector("#btn-save-list");
    const focusBtn = container.querySelector("#btn-focus");
    if (saveBtn) {
      saveBtn.onclick = () => {
        addItems([entry.task, ...plain(entry).flatMap((step) => [step.text, ...step.substeps])].filter(Boolean));
        if (actions.onSave) actions.onSave(entry.task, plain(entry));
        else toast("Ajouté à la liste");
      };
    }
    if (focusBtn) {
      focusBtn.onclick = () => {
        addItems(plain(entry).map((step) => step.text));
        location.hash = "#/taskmaster";
      };
    }
  }

  function activeTab(state) {
    return state.tabs.find((tab) => tab.id === state.activeId) || state.tabs[0];
  }

  function walk(nodes, visit) {
    for (const row of nodes || []) {
      if (visit(row) === false) return false;
      if (walk(row.subtasks, visit) === false) return false;
    }
    return true;
  }

  function findItem(state, itemId) {
    let found = null;
    walk(activeTab(state).items, (row) => {
      if (row.id === itemId) {
        found = row;
        return false;
      }
    });
    return found;
  }

  function findInTab(tab, itemId) {
    let found = null;
    walk(tab.items, (row) => {
      if (row.id === itemId) {
        found = row;
        return false;
      }
    });
    return found;
  }

  function removeItem(list, itemId) {
    const index = list.findIndex((row) => row.id === itemId);
    if (index !== -1) {
      list.splice(index, 1);
      return true;
    }
    return list.some((row) => removeItem(row.subtasks, itemId));
  }

  function listLine(row, depth) {
    const pad = "  ".repeat(depth);
    const head = `${pad}${row.done ? "[x]" : "[ ]"} ${row.text}`;
    const kids = (row.subtasks || []).map((sub) => listLine(sub, depth + 1));
    return [head, ...kids].join("\n");
  }

  function leaves(items) {
    const out = [];
    walk(items, (row) => {
      if (!(row.subtasks || []).length) {
        out.push({
          text: row.text,
          done: row.done,
          substeps: [],
          itemId: row.id,
        });
      }
    });
    return out;
  }

  function renderNode(row, keepId, keepText, depth) {
    const hasKids = !!(row.subtasks && row.subtasks.length);
    const open = row.open !== false;
    return `
      <li class="magic-todo__item${row.done ? " magic-todo__item--done" : ""}${busyId === row.id ? " magic-todo__item--busy" : ""}${depth ? " magic-todo__item--nested" : ""}" ${depth ? "" : 'draggable="true"'} data-id="${row.id}" style="--depth:${depth}">
        ${hasKids
          ? `<button class="magic-todo__twist" type="button" data-twist="${row.id}" aria-expanded="${open}" aria-label="${open ? "Refermer" : "Déployer"}">${open ? "▾" : "▸"}</button>`
          : `<span class="magic-todo__twist magic-todo__twist--empty" aria-hidden="true"></span>`}
        ${depth ? "" : `<span class="magic-todo__handle" aria-hidden="true">⋮⋮</span>`}
        <input class="magic-todo__box" type="checkbox" data-check="${row.id}" ${row.done ? "checked" : ""} aria-label="Fait">
        ${keepId === row.id
          ? `<input class="magic-todo__edit" data-edit="${row.id}" value="${esc(keepText || row.text)}">`
          : `<span class="magic-todo__text">${esc(row.text)}</span>`}
        ${row.minutes ? `<span class="magic-todo__time">≈ ${esc(fmtMinutes(row.minutes))}</span>` : ""}
        ${row.deadline ? `<span class="magic-todo__deadline">${esc(row.deadline)}</span>` : ""}
        <button class="magic-todo__icon" type="button" data-break="${row.id}" aria-label="Découper cet élément">⤵</button>
        <div class="magic-todo__menu-wrap">
          <button class="magic-todo__icon" type="button" data-options="${row.id}" aria-label="Options de la tâche" aria-expanded="${openMenu === row.id}">⋯</button>
          <div class="magic-todo__menu" ${openMenu === row.id ? "" : "hidden"}>
            <button type="button" data-act="estimate" data-id="${row.id}">Estimer</button>
            <button type="button" data-act="deadline" data-id="${row.id}">Ajouter une échéance</button>
            <button type="button" data-act="edit" data-id="${row.id}">Modifier</button>
            <button type="button" data-act="subtask" data-id="${row.id}">Ajouter une sous-tâche</button>
            <button type="button" data-act="remove" data-id="${row.id}">Retirer</button>
          </div>
        </div>
        ${openMenu === "deadline-" + row.id ? `<input class="magic-todo__date" type="date" data-date="${row.id}" value="${esc(row.deadline)}">` : ""}
        ${openMenu === "sub-" + row.id ? `<form class="magic-todo__subform" data-subform="${row.id}"><input type="text" placeholder="Sous-tâche" required><button class="btn small" type="submit">Ajouter</button></form>` : ""}
        ${hasKids && open ? `<ul class="magic-todo__subs">${row.subtasks.map((sub) => renderNode(sub, keepId, keepText, depth + 1)).join("")}</ul>` : ""}
      </li>`;
  }

  let state = load();
  let undo = [];
  let redo = [];
  let root = null;
  let openMenu = null;
  let preview = null;
  let busyId = null;

  function persist() {
    save(state);
  }

  function commit(change) {
    undo.push(JSON.stringify(state));
    if (undo.length > 40) undo.shift();
    redo = [];
    change();
    persist();
    paint();
  }

  function listText(tab) {
    return tab.items.map((row) => listLine(row, 0)).join("\n");
  }

  function groups() {
    const names = [];
    TEMPLATES.forEach((tpl) => { if (!names.includes(tpl.group)) names.push(tpl.group); });
    return names;
  }

  function paint() {
    if (!root) return;
    const tab = activeTab(state);
    const editing = root.querySelector(".magic-todo__edit");
    const keepText = editing ? editing.value : "";
    const keepId = editing ? Number(editing.dataset.edit) : null;
    root.innerHTML = `
      <div class="magic-todo">
        <div class="magic-todo__head">
          <div>
            <h1 class="magic-todo__name">Magic ToDo</h1>
            <p class="magic-todo__lead">On découpe pour que tu n'aies pas à le faire</p>
          </div>
          <div class="tool-help">
            <button class="tool-help__toggle" type="button" aria-expanded="false">Aide ?</button>
            <p class="tool-help__text" hidden>Ajoute une tâche, coche-la, ou découpe-la. Chaque sous-tâche se découpe de la même façon. Le triangle déploie ou referme. Le piquant règle le niveau de détail.</p>
          </div>
        </div>
        <form class="magic-todo__add" id="todo-add">
          <input class="magic-todo__input" name="text" type="text" placeholder="Ajouter un élément…" aria-label="Ajouter un élément…" value="${esc(keepId ? "" : keepText)}">
          <button class="magic-todo__plus" type="submit" aria-label="Ajouter un élément">+</button>
          <div id="todo-spice"></div>
        </form>
        <div class="magic-todo__tabs" role="tablist">
          ${state.tabs.map((entry) => `
            <button class="magic-todo__tab${entry.id === tab.id ? " magic-todo__tab--active" : ""}" type="button" data-tab="${entry.id}" role="tab" aria-selected="${entry.id === tab.id}">${esc(entry.name)}</button>
          `).join("")}
          <button class="magic-todo__tab" type="button" id="todo-new-tab" aria-label="Nouvel onglet">+</button>
        </div>
        <div class="magic-todo__toolbar">
          <button class="btn secondary small" type="button" id="todo-templates">Modèles</button>
          <button class="btn secondary small" type="button" id="todo-share">Partager cette liste</button>
          <div class="magic-todo__menu-wrap">
            <button class="btn secondary small" type="button" id="todo-tools" aria-expanded="${openMenu === "tools"}">Outils</button>
            <div class="magic-todo__menu" ${openMenu === "tools" ? "" : "hidden"}>
              <button type="button" data-tool="rename">Renommer l'onglet</button>
              <button type="button" data-tool="delete" ${state.tabs.length < 2 ? "disabled" : ""}>Supprimer l'onglet</button>
            </div>
          </div>
          <button class="btn secondary small" type="button" id="todo-undo" ${undo.length ? "" : "disabled"} aria-label="Annuler">↩</button>
          <button class="btn secondary small" type="button" id="todo-redo" ${redo.length ? "" : "disabled"} aria-label="Rétablir">↪</button>
        </div>
        <ul class="magic-todo__items">
          ${tab.items.map((row) => renderNode(row, keepId, keepText, 0)).join("")}
        </ul>
        <dialog class="magic-todo__dialog" id="todo-dialog">
          <form method="dialog"><button class="magic-todo__close" value="cancel" aria-label="Fermer">×</button></form>
          <h2>Modèles</h2>
          <p class="magic-todo__lead">Des tâches courantes, déjà découpées. Choisis-en une pour voir les étapes.</p>
          ${groups().map((group) => `
            <h3 class="magic-todo__group">${esc(group)}</h3>
            <div class="magic-todo__template-list">
              ${TEMPLATES.filter((tpl) => tpl.group === group).map((tpl, index) => {
                const id = TEMPLATES.indexOf(tpl);
                return `<button type="button" data-preview="${id}">${esc(tpl.name)} <span>${tpl.steps.length}</span></button>`;
              }).join("")}
            </div>`).join("")}
          <div id="todo-preview"></div>
        </dialog>
        <div id="todo-recall"></div>
      </div>`;

    Spice.mount(root.querySelector("#todo-spice"), {
      name: "spice",
      value: state.spice,
      hint: "Niveau de piquant : jusqu'où découper ? Tu peux le changer à tout moment, il s'applique à tous les éléments.",
      onChange(level) {
        state.spice = level;
        persist();
      },
    });
    ToolHelp.bind(root);
    bind();
    if (keepId) {
      const field = root.querySelector(".magic-todo__edit");
      if (field) field.focus();
    }
  }

  function bind() {
    const tab = activeTab(state);
    root.querySelector("#todo-add").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.target.elements.text;
      const text = input.value.trim();
      if (!text) return;
      commit(() => { activeTab(state).items.push(item(text)); });
    });
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.onclick = () => {
        state.activeId = Number(button.dataset.tab);
        openMenu = null;
        persist();
        paint();
      };
    });
    root.querySelector("#todo-new-tab").onclick = () => {
      commit(() => {
        const id = uid();
        state.tabs.push({ id, name: "Liste " + state.tabs.length, items: [] });
        state.activeId = id;
      });
    };
    root.querySelector("#todo-tools").onclick = () => {
      openMenu = openMenu === "tools" ? null : "tools";
      paint();
    };
    root.querySelectorAll("[data-tool]").forEach((button) => {
      button.onclick = () => {
        if (button.dataset.tool === "rename") {
          const name = window.prompt("Nom de l'onglet", tab.name);
          if (!name || !name.trim()) return;
          commit(() => { activeTab(state).name = name.trim(); openMenu = null; });
        } else if (button.dataset.tool === "delete" && state.tabs.length > 1) {
          commit(() => {
            state.tabs = state.tabs.filter((entry) => entry.id !== tab.id);
            state.activeId = state.tabs[0].id;
            openMenu = null;
          });
        }
      };
    });
    root.querySelector("#todo-undo").onclick = () => {
      if (!undo.length) return;
      redo.push(JSON.stringify(state));
      state = JSON.parse(undo.pop());
      persist();
      paint();
    };
    root.querySelector("#todo-redo").onclick = () => {
      if (!redo.length) return;
      undo.push(JSON.stringify(state));
      state = JSON.parse(redo.pop());
      persist();
      paint();
    };
    root.querySelector("#todo-share").onclick = async () => {
      const text = `${tab.name}\n${listText(tab)}`;
      try {
        await navigator.clipboard.writeText(text);
        toast("Liste copiée");
      } catch {
        toast("La copie a échoué");
      }
    };
    root.querySelector("#todo-templates").onclick = () => {
      root.querySelector("#todo-dialog").showModal();
    };
    root.querySelectorAll("[data-preview]").forEach((button) => {
      button.onclick = () => {
        preview = TEMPLATES[Number(button.dataset.preview)];
        const box = root.querySelector("#todo-preview");
        box.innerHTML = `<h3>${esc(preview.name)}</h3><ol>${preview.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
          <button class="btn small" type="button" id="todo-use-template">Ajouter à la liste</button>`;
        box.querySelector("#todo-use-template").onclick = () => {
          root.querySelector("#todo-dialog").close();
          commit(() => {
            preview.steps.forEach((step) => activeTab(state).items.push(item(step)));
          });
        };
      };
    });
    root.querySelectorAll("[data-check]").forEach((box) => {
      box.onchange = () => {
        commit(() => { findItem(state, Number(box.dataset.check)).done = box.checked; });
      };
    });
    root.querySelectorAll("[data-twist]").forEach((button) => {
      button.onclick = () => {
        const row = findItem(state, Number(button.dataset.twist));
        if (!row) return;
        row.open = !(row.open !== false);
        persist();
        paint();
      };
    });
    root.querySelectorAll("[data-options]").forEach((button) => {
      button.onclick = () => {
        const id = Number(button.dataset.options);
        openMenu = openMenu === id ? null : id;
        paint();
      };
    });
    root.querySelectorAll("[data-act]").forEach((button) => {
      button.onclick = () => act(button.dataset.act, Number(button.dataset.id));
    });
    root.querySelectorAll("[data-break]").forEach((button) => {
      button.onclick = () => breakdown(Number(button.dataset.break));
    });
    root.querySelectorAll("[data-date]").forEach((input) => {
      input.onchange = () => {
        commit(() => {
          findItem(state, Number(input.dataset.date)).deadline = input.value;
          openMenu = null;
        });
      };
    });
    root.querySelectorAll("[data-subform]").forEach((form) => {
      form.onsubmit = (event) => {
        event.preventDefault();
        const text = form.elements[0].value.trim();
        if (!text) return;
        commit(() => {
          const parent = findItem(state, Number(form.dataset.subform));
          parent.subtasks.push(item(text));
          parent.open = true;
          openMenu = null;
        });
      };
    });
    root.querySelectorAll(".magic-todo__edit").forEach((input) => {
      const finish = () => {
        const text = input.value.trim();
        commit(() => {
          const row = findItem(state, Number(input.dataset.edit));
          if (row && text) row.text = text;
          openMenu = null;
        });
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") finish();
      });
      input.addEventListener("blur", finish);
    });
    root.querySelectorAll('.magic-todo__item[draggable="true"]').forEach((row) => {
      row.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", row.dataset.id);
      });
      row.addEventListener("dragover", (event) => event.preventDefault());
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData("text/plain"));
        const to = Number(row.dataset.id);
        if (!from || from === to) return;
        commit(() => {
          const items = activeTab(state).items;
          const source = items.findIndex((entry) => entry.id === from);
          const target = items.findIndex((entry) => entry.id === to);
          if (source < 0 || target < 0) return;
          const [moved] = items.splice(source, 1);
          items.splice(target, 0, moved);
        });
      });
    });
  }

  async function act(name, id) {
    if (name === "remove") {
      commit(() => {
        removeItem(activeTab(state).items, id);
        openMenu = null;
      });
      return;
    }
    if (name === "edit") {
      openMenu = null;
      paint();
      const li = root.querySelector(`.magic-todo__item[data-id="${id}"]`);
      const label = li && li.querySelector(":scope > .magic-todo__text");
      if (!label) return;
      const current = findItem(state, id);
      label.outerHTML = `<input class="magic-todo__edit" data-edit="${id}" value="${esc(current.text)}">`;
      const input = li.querySelector(":scope > .magic-todo__edit");
      input.focus();
      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        const text = input.value.trim();
        if (!text) { paint(); return; }
        commit(() => { findItem(state, id).text = text; });
      };
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") finish(); });
      input.addEventListener("blur", finish);
      return;
    }
    if (name === "deadline") {
      openMenu = "deadline-" + id;
      paint();
      return;
    }
    if (name === "subtask") {
      openMenu = "sub-" + id;
      paint();
      return;
    }
    if (name === "estimate") {
      openMenu = null;
      busyId = id;
      paint();
      try {
        const row = findItem(load(), id);
        const result = await apiCall("/api/estimator", { task: row.text, spice: state.spice });
        commit(() => { findItem(state, id).minutes = result.total_minutes; busyId = null; });
      } catch (err) {
        busyId = null;
        paint();
        toast(err.message);
      }
    }
  }

  async function breakdown(id) {
    busyId = id;
    openMenu = null;
    paint();
    try {
      const row = findItem(load(), id);
      if (!row) throw new Error("Élément introuvable");
      const result = await apiCall("/api/magic-todo", { task: row.text, spice: state.spice });
      const steps = normalize(result.steps);
      commit(() => {
        const target = findItem(state, id);
        target.subtasks = steps
          .flatMap((step) => [step.text, ...step.substeps])
          .filter(Boolean)
          .map((text) => item(text));
        target.open = true;
        busyId = null;
      });
      ToolHistory.remember("magic-todo", {
        label: row.text,
        meta: progress(steps),
        values: { task: row.text },
        result: { steps },
      });
    } catch (err) {
      busyId = null;
      paint();
      toast(err.message);
    }
  }

  function addItems(texts) {
    const rows = (texts || []).map((text) => String(text || "").trim()).filter(Boolean);
    if (!rows.length) return;
    state = load();
    rows.forEach((text) => activeTab(state).items.push(item(text)));
    persist();
    if (root) paint();
    toast("Ajouté à Magic ToDo");
  }

  function currentList() {
    state = load();
    const tab = activeTab(state);
    return { id: tab.id, name: tab.name, items: tab.items, steps: leaves(tab.items) };
  }

  function markItem(tabId, itemId, done) {
    state = load();
    const tab = state.tabs.find((entry) => entry.id === tabId);
    const row = tab && findInTab(tab, itemId);
    if (!row) return;
    row.done = done;
    persist();
  }

  function mountBoard(container) {
    root = container;
    state = load();
    undo = [];
    redo = [];
    openMenu = null;
    container.innerHTML = "";
    paint();
  }

  global.MagicTodo = {
    normalize, progress, mountResult, mountBoard, addItems, currentList, markItem,
  };
})(window);
