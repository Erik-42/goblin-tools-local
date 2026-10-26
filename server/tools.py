"""Prompt templates and response parsing for the nine Goblin-style tools."""
from . import llm


def _require(data: dict, field: str, label: str) -> str:
    value = str(data.get(field, "")).strip()
    if not value:
        raise ValueError(f"{label} ne peut pas être vide")
    return value


def _spice(data: dict, default: int = 3) -> int:
    try:
        level = int(data.get("spice", default))
    except (TypeError, ValueError):
        level = default
    return min(5, max(1, level))


# ---------------------------------------------------------------- Magic ToDo
MAGIC_TODO_SYSTEM = """Tu aides à découper une grosse tâche en petites étapes. \
Chaque étape tient en une phrase, commence par un verbe et reste faisable tout de suite. \
Réponds uniquement en JSON, au format :
{"steps": [{"text": "étape", "substeps": ["sous-étape"]}]}
Sans sous-étape, substeps est un tableau vide. Rédige tout le texte en français."""

SPICE_TODO = {
    1: "Donne 2 ou 3 très grandes étapes, sans sous-étape.",
    2: "Donne 3 ou 4 étapes simples, presque sans sous-étape.",
    3: "Donne 4 à 6 étapes concrètes. Une étape lourde peut avoir jusqu'à 2 sous-étapes.",
    4: "Donne 6 à 8 petites étapes. Découpe ce qui prend plus de quelques minutes.",
    5: "Donne 8 à 12 toutes petites étapes, chacune faisable en une seule action.",
}


async def magic_todo(data: dict):
    task = _require(data, "task", "La tâche")
    level = _spice(data)
    reply = await llm.chat(MAGIC_TODO_SYSTEM, f"{SPICE_TODO[level]}\nTâche : {task}")
    parsed = llm.parse_json(reply)
    steps = []
    for s in parsed.get("steps", []):
        text = str(s.get("text", "")).strip()
        if not text:
            continue
        substeps = [str(x).strip() for x in s.get("substeps", []) if str(x).strip()]
        steps.append({"text": text, "substeps": substeps})
    if not steps:
        raise llm.LLMError("Le découpage est vide, réessaie.")
    return {"steps": steps}


# --------------------------------------------------------------- Formalizer
TONES = {
    "more-professional": "plus professionnel",
    "more-technical": "plus technique",
    "more-accessible": "plus accessible",
    "more-polite": "plus poli",
    "less-snarky": "moins piquant",
    "angrier": "plus en colère",
    "easier-to-read": "plus facile à lire",
    "more-formal": "plus formel",
    "more-informal": "plus informel",
    "more-sociable": "plus sociable et un peu plus long",
    "more-to-the-point": "plus direct, sans détour",
    "less-emotional": "moins émotionnel",
    "more-passionate": "plus passionné",
    "more-sarcastic": "plus sarcastique",
    "grammatically-correct": "corrigé, sans changer le ton",
    "bullet-points": "en puces",
    "single-word": "réduit à un seul mot qui résume l'idée",
    "clear": "clair et simple",
    "friendly": "amical",
    "professional": "professionnel",
}

FORMALIZER_SYSTEM = """Tu réécris un texte dans le ton demandé. \
Garde le sens et n'invente aucun fait. Réponds uniquement en JSON, au format : {"text": "texte réécrit"} \
Rédige le texte en français."""

SPICE_TONE = {
    1: "Change le ton à peine.",
    2: "Ajuste le ton sans réorganiser le texte.",
    3: "Réécris clairement dans ce ton.",
    4: "Transforme nettement le style, en gardant tous les faits.",
    5: "Pousse ce ton au maximum, sans ajouter d'information.",
}


async def formalizer(data: dict):
    text = _require(data, "text", "Le texte")
    tone_key = str(data.get("tone", "more-professional"))
    tone = TONES.get(tone_key, tone_key)
    level = _spice(data)
    reply = await llm.chat(
        FORMALIZER_SYSTEM,
        f"Ton visé : {tone}\n{SPICE_TONE[level]}\nTexte d'origine :\n{text}",
    )
    parsed = llm.parse_json(reply)
    return {"text": str(parsed.get("text", "")).strip(), "tone": tone}


# --------------------------------------------------------------------- Judge
JUDGE_SYSTEM = """Tu aides à lire le ton d'un message, sans inventer de faits. \
Réponds uniquement en JSON, au format :
{"impression": "ce que le message donne comme impression, en une ou deux phrases",
 "tone": "ton général",
 "reply": "réponse courte que la personne pourrait envoyer, ou une chaîne vide"}
Rédige tout le texte en français."""


async def judge(data: dict):
    text = _require(data, "text", "Le texte")
    extra = str(data.get("extra", "")).strip()
    want_reply = str(data.get("mode", "judge")) == "reply"
    user = f"Message :\n{text}"
    if extra:
        user += f"\nAutre message du même échange :\n{extra}"
    user += "\nPropose une réponse." if want_reply else "\nDécris seulement l'impression. Laisse reply vide."
    reply = await llm.chat(JUDGE_SYSTEM, user, temperature=0.3)
    parsed = llm.parse_json(reply)
    impression = str(parsed.get("impression") or parsed.get("summary") or "").strip()
    return {
        "impression": impression,
        "summary": impression,
        "tone": str(parsed.get("tone", "")).strip(),
        "reply": str(parsed.get("reply", "")).strip() if want_reply else "",
        "emotions": [],
    }


# ----------------------------------------------------------------- Professor
DEPTHS = {
    "child": "comme à un enfant de 6 ans, avec les mots les plus simples et des images",
    "teen": "niveau collège, les notions de base sont permises",
    "college": "niveau université, avec le vocabulaire du domaine, mais expliqué",
    "expert": "niveau chercheur du domaine, directement dans le détail",
}

PROFESSOR_SYSTEM = """Tu expliques un sujet en deux blocs : l'explication, puis un exemple concret. \
Réponds uniquement en JSON, au format :
{"explanation": "l'explication", "example": "un exemple"}
Rédige tout le texte en français."""

SPICE_PROFESSOR = {
    1: "Explique très court, avec des mots de tous les jours.",
    2: "Explique simplement, comme à quelqu'un qui découvre le sujet.",
    3: "Explique clairement, pour un adulte curieux.",
    4: "Utilise le vocabulaire du domaine, et explique-le.",
    5: "Va dans le détail, pour quelqu'un qui connaît déjà les bases.",
}


async def professor(data: dict):
    topic = _require(data, "topic", "Le sujet")
    if data.get("depth") and "spice" not in data:
        depth = DEPTHS.get(str(data.get("depth")), str(data.get("depth")))
        guide = f"Niveau : {depth}"
    else:
        guide = SPICE_PROFESSOR[_spice(data)]
    reply = await llm.chat(PROFESSOR_SYSTEM, f"{guide}\nSujet : {topic}")
    parsed = llm.parse_json(reply)
    explanation = str(parsed.get("explanation") or parsed.get("summary") or "").strip()
    example = str(parsed.get("example") or "").strip()
    points = [
        {"title": str(p.get("title", "")).strip(), "body": str(p.get("body", "")).strip()}
        for p in parsed.get("points", [])
        if str(p.get("body", "")).strip()
    ]
    return {"explanation": explanation, "example": example, "summary": explanation, "points": points}


# ---------------------------------------------------------------- Consultant
CONSULTANT_SYSTEM = """Tu aides à peser une situation. \
Donne les avantages, les inconvénients, puis un conseil concret. \
Réponds uniquement en JSON, au format :
{"pros": "les avantages, en quelques phrases",
 "cons": "les inconvénients, en quelques phrases",
 "advice": "le conseil"}
Rédige tout le texte en français."""


async def consultant(data: dict):
    situation = _require(data, "situation", "La description")
    options = data.get("options") or []
    if isinstance(options, str):
        options = [line.strip() for line in options.split("\n") if line.strip()]
    option_text = "\n".join(f"- {o}" for o in options if str(o).strip())
    user = f"Situation : {situation}"
    if option_text:
        user += f"\nPistes déjà envisagées :\n{option_text}"
    reply = await llm.chat(CONSULTANT_SYSTEM, user)
    parsed = llm.parse_json(reply)
    pros = parsed.get("pros", "")
    cons = parsed.get("cons", "")
    if isinstance(pros, list):
        pros = "\n".join(str(x) for x in pros)
    if isinstance(cons, list):
        cons = "\n".join(str(x) for x in cons)
    return {
        "pros": str(pros).strip(),
        "cons": str(cons).strip(),
        "advice": str(parsed.get("advice") or parsed.get("recommendation") or "").strip(),
        "recommendation": str(parsed.get("advice") or parsed.get("recommendation") or "").strip(),
    }


# ----------------------------------------------------------------- Estimator
ESTIMATOR_SYSTEM = """Tu estimes le temps réel pour finir quelque chose. \
Les gens sous-estiment souvent : compte la préparation et les imprévus. \
Réponds uniquement en JSON, au format :
{"rough": "une phrase qui dit combien de temps ça prendra",
 "items": [{"text": "partie", "minutes": nombre}],
 "total_minutes": nombre}
Rédige les textes en français."""

SPICE_ESTIMATE = {
    1: "Donne une durée courte, en une phrase, sans détailler.",
    2: "Donne la durée probable, en une phrase.",
    3: "Donne une durée avec une petite marge.",
    4: "Donne une fourchette prudente et nomme le temps caché.",
    5: "Donne une fourchette haute, en comptant préparation, pauses et imprévus.",
}


async def estimator(data: dict):
    task = _require(data, "task", "La tâche")
    level = _spice(data, default=2)
    reply = await llm.chat(ESTIMATOR_SYSTEM, f"{SPICE_ESTIMATE[level]}\nTâche : {task}", temperature=0.3)
    parsed = llm.parse_json(reply)
    items = []
    for it in parsed.get("items", []):
        text = str(it.get("text", "")).strip()
        try:
            minutes = max(1, int(float(it.get("minutes", 0))))
        except (TypeError, ValueError):
            continue
        if text:
            items.append({"text": text, "minutes": minutes})
    total = parsed.get("total_minutes")
    if not isinstance(total, (int, float)) or total <= 0:
        total = sum(i["minutes"] for i in items)
    if not items and not str(parsed.get("rough", "")).strip():
        raise llm.LLMError("L'estimation est vide, réessaie.")
    rough = str(parsed.get("rough", "")).strip()
    if not rough:
        rough = f"Ça prendra à peu près {int(total)} minutes."
    return {"rough": rough, "items": items, "total_minutes": int(total)}


# ------------------------------------------------------------------- Compiler
COMPILER_SYSTEM = """Tu ranges des notes de brainstorm en vrac en une liste d'actions concrètes. \
Fusionne les doublons et transforme chaque idée en action qui commence par un verbe. \
Réponds uniquement en JSON, au format :
{"actions": [{"text": "action", "category": "courte catégorie"}]}
Rédige tout le texte en français."""


async def compiler(data: dict):
    brainstorm = _require(data, "brainstorm", "Le brainstorm")
    reply = await llm.chat(COMPILER_SYSTEM, brainstorm)
    parsed = llm.parse_json(reply)
    actions = []
    for a in parsed.get("actions", []):
        text = str(a.get("text", "")).strip()
        if text:
            actions.append({"text": text, "category": str(a.get("category", "")).strip()})
    if not actions:
        raise llm.LLMError("Le rangement est vide, réessaie.")
    return {"actions": actions}


# ----------------------------------------------------------------------- Chef
CHEF_SYSTEM = """Tu proposes des recettes à partir des ingrédients déjà disponibles \
(évite d'en faire acheter d'autres). Donne 1 à 3 plats. \
Réponds uniquement en JSON, au format :
{"recipes": [{"name": "nom du plat", "description": "une phrase",
 "ingredients": ["ingrédient utilisé"], "steps": ["étape"]}]}
Rédige tout le texte en français."""


async def chef(data: dict):
    ingredients = _require(data, "ingredients", "Les ingrédients")
    constraints = str(data.get("constraints", "")).strip()
    user = f"Ingrédients disponibles : {ingredients}"
    if constraints:
        user += f"\nContraintes ou préférences : {constraints}"
    reply = await llm.chat(CHEF_SYSTEM, user)
    parsed = llm.parse_json(reply)
    recipes = []
    for r in parsed.get("recipes", []):
        name = str(r.get("name", "")).strip()
        steps = [str(s).strip() for s in r.get("steps", []) if str(s).strip()]
        if not name or not steps:
            continue
        recipes.append({
            "name": name,
            "description": str(r.get("description", "")).strip(),
            "ingredients": [str(x).strip() for x in r.get("ingredients", []) if str(x).strip()],
            "steps": steps,
        })
    if not recipes:
        raise llm.LLMError("Aucune recette n'a été générée, réessaie.")
    return {"recipes": recipes}


TOOLS = {
    "magic-todo": magic_todo,
    "formalizer": formalizer,
    "judge": judge,
    "professor": professor,
    "consultant": consultant,
    "estimator": estimator,
    "compiler": compiler,
    "chef": chef,
}
