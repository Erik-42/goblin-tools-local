/* Formalizer : tons, favoris, piquant et texte copiable. */
(function (global) {
  "use strict";

  const t = (key, params) => I18n.t(key, params);

  const FAV_KEY = "gt_formalizer_favs";
  const TONES = [
    ["more-professional", "formalizer.tone.more-professional"],
    ["more-technical", "formalizer.tone.more-technical"],
    ["more-accessible", "formalizer.tone.more-accessible"],
    ["more-polite", "formalizer.tone.more-polite"],
    ["less-snarky", "formalizer.tone.less-snarky"],
    ["angrier", "formalizer.tone.angrier"],
    ["easier-to-read", "formalizer.tone.easier-to-read"],
    ["more-formal", "formalizer.tone.more-formal"],
    ["more-informal", "formalizer.tone.more-informal"],
    ["more-sociable", "formalizer.tone.more-sociable"],
    ["more-to-the-point", "formalizer.tone.more-to-the-point"],
    ["less-emotional", "formalizer.tone.less-emotional"],
    ["more-passionate", "formalizer.tone.more-passionate"],
    ["more-sarcastic", "formalizer.tone.more-sarcastic"],
    ["grammatically-correct", "formalizer.tone.grammatically-correct"],
    ["bullet-points", "formalizer.tone.bullet-points"],
    ["single-word", "formalizer.tone.single-word"],
    ["my-voice", "formalizer.tone.my-voice"],
    ["pro", "formalizer.tone.pro"],
    ["custom", "formalizer.tone.custom"],
  ];

  function label(id) {
    const found = TONES.find((tone) => tone[0] === id);
    return found ? t(found[1]) : t("formalizer.tone.more-professional");
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function loadFavs() {
    try {
      const data = JSON.parse(localStorage.getItem(FAV_KEY));
      if (Array.isArray(data) && data.length) return data.filter((id) => TONES.some((tone) => tone[0] === id));
    } catch { /* garde les favoris par défaut */ }
    return ["more-professional", "more-sociable", "my-voice", "custom"];
  }

  function mount(container) {
    let tone = "more-professional";
    let menuOpen = false;
    let favs = loadFavs();
    let activeId = null;
    let customTone = localStorage.getItem("gt_formalizer_custom_tone") || "";
    let voiceSample = localStorage.getItem("gt_formalizer_voice_sample") || "";

    function paint(values, result) {
      values = values || {};
      container.innerHTML = `
        <p><a class="back" href="#/">${t("app.back")}</a></p>
        <div class="formalizer__head">
          <h1>${t("tools.formalizer.name")}</h1>
          <div class="tool-help">
            <button class="tool-help__toggle" type="button" aria-expanded="false">${t("help.toggle")}</button>
            <p class="tool-help__text" hidden>${t("formalizer.help")}</p>
          </div>
        </div>
        <p class="formalizer__lead">${t("formalizer.lead")}</p>
        <form class="formalizer" id="formalizer-form">
          <textarea name="text" placeholder="${t("formalizer.field.text.placeholder")}" aria-label="${t("formalizer.field.text")}">${esc(values.text || "")}</textarea>
          <div class="formalizer__row">
            <span>${t("formalizer.toneLabel")}</span>
            <button class="formalizer__toggle" type="button" id="tone-toggle" aria-haspopup="true" aria-expanded="${menuOpen}">${esc(label(tone))}</button>
            <button class="btn" type="submit">${t("formalizer.submit")}</button>
            <div id="formalizer-spice"></div>
          </div>
          <div class="formalizer__menu" id="tone-menu" ${menuOpen ? "" : "hidden"}>
            <p>${t("formalizer.menu.tons")}</p>
            ${TONES.map(([id, name]) => `
              <div class="formalizer__choice">
                <button class="formalizer__pick" type="button" data-tone="${id}" aria-checked="${id === tone}">${esc(t(name))}</button>
                <button class="formalizer__star" type="button" data-fav="${id}" aria-label="${favs.includes(id) ? t("formalizer.fav.remove") : t("formalizer.fav.add")}" aria-pressed="${favs.includes(id)}">★</button>
              </div>`).join("")}
          </div>
          <p class="formalizer__fav-label">${t("formalizer.menu.favs")}</p>
          <div class="formalizer__favs">
            ${favs.map((id) => `<button class="formalizer__fav${id === tone ? " formalizer__fav--on" : ""}" type="button" data-tone="${id}" aria-pressed="${id === tone}">${esc(label(id))}</button>`).join("")}
          </div>
          ${tone === "custom" ? `
            <div class="formalizer__custom">
              <label>${t("formalizer.custom.label")}</label>
              <textarea name="custom-tone" placeholder="${t("formalizer.custom.placeholder")}">${esc(customTone)}</textarea>
            </div>
          ` : ""}
          ${tone === "my-voice" ? `
            <div class="formalizer__voice">
              <label>${t("formalizer.voice.label")}</label>
              <textarea name="voice-sample" placeholder="${t("formalizer.voice.placeholder")}">${esc(voiceSample)}</textarea>
              <button class="btn" type="button" id="voice-save">${t("formalizer.voice.save")}</button>
            </div>
          ` : ""}
        </form>
        <div class="formalizer__out">
          <div class="prose" id="formalizer-output">${esc(result ? result.text : t("formalizer.output.empty"))}</div>
          <button class="copy-text" type="button" data-copy-target="#formalizer-output" aria-label="${t("common.copy")}">${t("common.copy")}</button>
        </div>
        <div id="formalizer-history"></div>`;
      Spice.mount(container.querySelector("#formalizer-spice"), {
        name: "spice",
        value: values.spice || 3,
        hint: t("formalizer.spice.hint"),
      });
      ToolHelp.bind(container);
      CopyText.bind(container, toast);
      ToolHistory.mount(container.querySelector("#formalizer-history"), "formalizer", activeId, (entry) => {
        tone = entry.values.tone || tone;
        customTone = entry.values.customTone || customTone;
        voiceSample = entry.values.voiceSample || voiceSample;
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
      const customInput = form.elements["custom-tone"];
      if (customInput) {
        customInput.oninput = () => {
          customTone = customInput.value;
          localStorage.setItem("gt_formalizer_custom_tone", customTone);
        };
      }
      const voiceInput = form.elements["voice-sample"];
      if (voiceInput) {
        voiceInput.oninput = () => { voiceSample = voiceInput.value; };
      }
      const voiceSave = container.querySelector("#voice-save");
      if (voiceSave) {
        voiceSave.onclick = () => {
          localStorage.setItem("gt_formalizer_voice_sample", voiceSample);
          toast(t("formalizer.voice.saved"));
        };
      }
      form.onsubmit = async (event) => {
        event.preventDefault();
        const text = form.elements.text.value.trim();
        if (!text) { toast(t("formalizer.error.empty")); return; }
        const spice = Number(form.elements.spice.value);
        const body = { text, tone, spice };
        if (tone === "custom" && customTone) body.customTone = customTone;
        if (tone === "my-voice" && voiceSample) body.voiceSample = voiceSample;
        container.querySelector("#formalizer-output").textContent = t("formalizer.output.writing");
        try {
          const result = await apiCall("/api/formalizer", body);
          addHistory("Formalizer", text, result);
          const entry = ToolHistory.remember("formalizer", {
            label: text,
            meta: label(tone),
            values: { text, tone, spice, customTone, voiceSample },
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
