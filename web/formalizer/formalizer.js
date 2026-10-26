/* Formalizer : tons, favoris, piquant et texte copiable. */
(function (global) {
  "use strict";

  const FAV_KEY = "gt_formalizer_favs";
  const TONES = [
    ["more-professional", "Plus professionnel"],
    ["more-technical", "Plus technique"],
    ["more-accessible", "Plus accessible"],
    ["more-polite", "Plus poli"],
    ["less-snarky", "Moins piquant"],
    ["angrier", "Plus en colère"],
    ["easier-to-read", "Plus facile à lire"],
    ["more-formal", "Plus formel"],
    ["more-informal", "Plus informel"],
    ["more-sociable", "Plus sociable (bavard)"],
    ["more-to-the-point", "Plus direct (moins de blabla)"],
    ["less-emotional", "Moins émotionnel"],
    ["more-passionate", "Plus passionné"],
    ["more-sarcastic", "Plus sarcastique"],
    ["grammatically-correct", "Grammaticalement correct"],
    ["bullet-points", "En puces"],
    ["single-word", "Un seul mot"],
  ];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function label(id) {
    const found = TONES.find((tone) => tone[0] === id);
    return found ? found[1] : TONES[0][1];
  }

  function loadFavs() {
    try {
      const data = JSON.parse(localStorage.getItem(FAV_KEY));
      if (Array.isArray(data) && data.length) return data.filter((id) => TONES.some((tone) => tone[0] === id));
    } catch { /* garde les favoris par défaut */ }
    return ["more-professional", "more-sociable"];
  }

  function mount(container) {
    let tone = "more-professional";
    let menuOpen = false;
    let favs = loadFavs();
    let activeId = null;

    function paint(values, result) {
      values = values || {};
      container.innerHTML = `
        <p><a class="back" href="#/">← Tous les outils</a></p>
        <div class="formalizer__head">
          <h1>Formalizer</h1>
          <div class="tool-help">
            <button class="tool-help__toggle" type="button" aria-expanded="false">Aide ?</button>
            <p class="tool-help__text" hidden>Colle un brouillon, choisis un ton, puis convertis. Le piquant règle la force du changement. L'étoile garde un ton dans les favoris de ce navigateur.</p>
          </div>
        </div>
        <p class="formalizer__lead">Reformule tes idées dans un autre ton, ou l'inverse</p>
        <form class="formalizer" id="formalizer-form">
          <textarea name="text" placeholder="Écris ton texte ici…" aria-label="Écris ton texte ici…">${esc(values.text || "")}</textarea>
          <div class="formalizer__row">
            <span>Rendre mon texte :</span>
            <button class="formalizer__toggle" type="button" id="tone-toggle" aria-haspopup="true" aria-expanded="${menuOpen}">${esc(label(tone))}</button>
            <button class="btn" type="submit">Convertir</button>
            <div id="formalizer-spice"></div>
          </div>
          <div class="formalizer__menu" id="tone-menu" ${menuOpen ? "" : "hidden"}>
            <p>Tons</p>
            ${TONES.map(([id, name]) => `
              <div class="formalizer__choice">
                <button class="formalizer__pick" type="button" data-tone="${id}" aria-checked="${id === tone}">${esc(name)}</button>
                <button class="formalizer__star" type="button" data-fav="${id}" aria-label="${favs.includes(id) ? "Retirer des favoris" : "Ajouter aux favoris"}" aria-pressed="${favs.includes(id)}">★</button>
              </div>`).join("")}
          </div>
          <p class="formalizer__fav-label">Favoris</p>
          <div class="formalizer__favs">
            ${favs.map((id) => `<button class="formalizer__fav${id === tone ? " formalizer__fav--on" : ""}" type="button" data-tone="${id}" aria-pressed="${id === tone}">${esc(label(id))}</button>`).join("")}
          </div>
        </form>
        <div class="formalizer__out">
          <div class="prose" id="formalizer-output">${esc(result ? result.text : "Le texte converti apparaîtra ici…")}</div>
          <button class="copy-text" type="button" data-copy-target="#formalizer-output" aria-label="Copier">Copier</button>
        </div>
        <div id="formalizer-history"></div>`;
      Spice.mount(container.querySelector("#formalizer-spice"), {
        name: "spice",
        value: values.spice || 3,
        hint: "Niveau de piquant : à quel point transformer le texte.",
      });
      ToolHelp.bind(container);
      CopyText.bind(container, toast);
      ToolHistory.mount(container.querySelector("#formalizer-history"), "formalizer", activeId, (entry) => {
        tone = entry.values.tone || tone;
        activeId = entry.id;
        menuOpen = false;
        paint(entry.values, entry.result);
      });
      bind(values);
    }

    function bind(values) {
      const form = container.querySelector("#formalizer-form");
      container.querySelector("#tone-toggle").onclick = () => {
        menuOpen = !menuOpen;
        paint({ ...values, text: form.elements.text.value, spice: form.elements.spice.value });
      };
      container.querySelectorAll("[data-tone]").forEach((button) => {
        button.onclick = () => {
          tone = button.dataset.tone;
          menuOpen = false;
          paint({ ...values, text: form.elements.text.value, spice: form.elements.spice.value });
        };
      });
      container.querySelectorAll("[data-fav]").forEach((button) => {
        button.onclick = (event) => {
          event.stopPropagation();
          const id = button.dataset.fav;
          favs = favs.includes(id) ? favs.filter((item) => item !== id) : favs.concat(id);
          localStorage.setItem(FAV_KEY, JSON.stringify(favs));
          paint({ ...values, text: form.elements.text.value, spice: form.elements.spice.value });
        };
      });
      form.onsubmit = async (event) => {
        event.preventDefault();
        const text = form.elements.text.value.trim();
        if (!text) { toast("Commence par écrire un texte"); return; }
        const spice = Number(form.elements.spice.value);
        container.querySelector("#formalizer-output").textContent = "Le gobelin réécrit…";
        try {
          const result = await apiCall("/api/formalizer", { text, tone, spice });
          addHistory("Formalizer", text, result);
          const entry = ToolHistory.remember("formalizer", {
            label: text,
            meta: label(tone),
            values: { text, tone, spice },
            result,
          });
          activeId = entry.id;
          menuOpen = false;
          paint(entry.values, result);
        } catch (err) {
          container.querySelector("#formalizer-output").textContent = err.message;
        }
      };
    }

    paint();
  }

  global.Formalizer = { mount };
})(window);
