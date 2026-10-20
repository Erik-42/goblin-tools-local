"""Prompt templates and response parsing for the nine Goblin-style tools."""
from . import llm


def _require(data: dict, field: str, label: str) -> str:
    value = str(data.get(field, "")).strip()
    if not value:
        raise ValueError(f"{label} ne peut pas être vide")
    return value


# ---------------------------------------------------------------- Magic ToDo
MAGIC_TODO_SYSTEM = """Tu aides à découper une grosse tâche en petites étapes. \
L'utilisateur donne une tâche : découpe-la en 3 à 8 étapes concrètes, faisables tout de suite. \
Chaque étape tient en une phrase, commence par un verbe et reste simple. \
Une étape complexe peut avoir de 0 à 3 sous-étapes. Réponds uniquement en JSON, au format :
{"steps": [{"text": "étape", "substeps": ["sous-étape"]}]}
Sans sous-étape, substeps est un tableau vide. Rédige tout le texte en français."""


async def magic_todo(data: dict):
    task = _require(data, "task", "La tâche")
    reply = await llm.chat(MAGIC_TODO_SYSTEM, task)
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
    "clear": "clair et simple",
    "friendly": "amical",
    "professional": "professionnel",
    "academic": "académique",
    "direct": "direct",
    "apologetic": "des excuses",
    "enthusiastic": "enthousiaste",
}

FORMALIZER_SYSTEM = """Tu réécris un texte brouillon ou flou dans le ton demandé. \
Garde le sens, n'ajoute aucune information. Réponds uniquement en JSON, au format : {"text": "texte réécrit"} \
Rédige le texte en français."""


async def formalizer(data: dict):
    text = _require(data, "text", "Le texte")
    tone_key = str(data.get("tone", "clear"))
    tone = TONES.get(tone_key, tone_key)
    reply = await llm.chat(FORMALIZER_SYSTEM, f"Ton visé : {tone}\nTexte d'origine :\n{text}")
    parsed = llm.parse_json(reply)
    return {"text": str(parsed.get("text", "")).strip(), "tone": tone}


# --------------------------------------------------------------------- Judge
JUDGE_SYSTEM = """Tu analyses les émotions et le ton implicites d'un texte \
(pour deviner l'attitude réelle de la personne qui l'a écrit). \
Réponds uniquement en JSON, au format :
{"summary": "jugement en une phrase", "tone": "ton général",
 "emotions": [{"name": "nom de l'émotion", "evidence": "extrait ou explication"}]}
Rédige tout le texte en français."""


async def judge(data: dict):
    text = _require(data, "text", "Le texte")
    reply = await llm.chat(JUDGE_SYSTEM, text, temperature=0.3)
    parsed = llm.parse_json(reply)
    emotions = [
        {"name": str(e.get("name", "")).strip(), "evidence": str(e.get("evidence", "")).strip()}
        for e in parsed.get("emotions", [])
        if str(e.get("name", "")).strip()
    ]
    return {"summary": parsed.get("summary", ""), "tone": parsed.get("tone", ""), "emotions": emotions}


# ----------------------------------------------------------------- Professor
DEPTHS = {
    "child": "comme à un enfant de 6 ans, avec les mots les plus simples et des images",
    "teen": "niveau collège, les notions de base sont permises",
    "college": "niveau université, avec le vocabulaire du domaine, mais expliqué",
    "expert": "niveau chercheur du domaine, directement dans le détail",
}

PROFESSOR_SYSTEM = """Tu es un professeur qui explique n'importe quel sujet. \
L'utilisateur donne un sujet et un niveau : explique à ce niveau, en plusieurs points. \
Réponds uniquement en JSON, au format :
{"summary": "un paragraphe d'introduction", "points": [{"title": "titre", "body": "explication"}]}
Rédige tout le texte en français."""


async def professor(data: dict):
    topic = _require(data, "topic", "Le sujet")
    depth_key = str(data.get("depth", "teen"))
    depth = DEPTHS.get(depth_key, depth_key)
    reply = await llm.chat(PROFESSOR_SYSTEM, f"Niveau : {depth}\nSujet : {topic}")
    parsed = llm.parse_json(reply)
    points = [
        {"title": str(p.get("title", "")).strip(), "body": str(p.get("body", "")).strip()}
        for p in parsed.get("points", [])
        if str(p.get("body", "")).strip()
    ]
    return {"summary": parsed.get("summary", ""), "points": points, "depth": depth}


# ---------------------------------------------------------------- Consultant
CONSULTANT_SYSTEM = """Tu aides à décider : à partir de la situation et des options, \
analyse les avantages et les inconvénients de chacune, puis recommande. \
Si aucune option n'est donnée, propose-en 2 ou 3 toi-même. \
Réponds uniquement en JSON, au format :
{"options": [{"name": "option", "pros": ["avantage"], "cons": ["inconvénient"]}],
 "recommendation": "quelle option recommander, et pourquoi"}
Rédige tout le texte en français."""


async def consultant(data: dict):
    situation = _require(data, "situation", "La description")
    options = data.get("options") or []
    option_text = "\n".join(f"- {o}" for o in options if str(o).strip())
    user = f"Situation : {situation}"
    if option_text:
        user += f"\nOptions :\n{option_text}"
    reply = await llm.chat(CONSULTANT_SYSTEM, user)
    parsed = llm.parse_json(reply)
    out_options = []
    for o in parsed.get("options", []):
        name = str(o.get("name", "")).strip()
        if not name:
            continue
        out_options.append({
            "name": name,
            "pros": [str(x).strip() for x in o.get("pros", []) if str(x).strip()],
            "cons": [str(x).strip() for x in o.get("cons", []) if str(x).strip()],
        })
    return {"options": out_options, "recommendation": parsed.get("recommendation", "")}


# ----------------------------------------------------------------- Estimator
ESTIMATOR_SYSTEM = """Tu estimes le temps réel pour finir quelque chose (les gens sous-estiment souvent). \
Découpe la tâche en sous-tâches et donne des minutes pour chacune. \
Privilégie une estimation haute, et compte le temps caché : préparation, pauses, imprévus. \
Réponds uniquement en JSON, au format :
{"items": [{"text": "sous-tâche", "minutes": nombre}], "total_minutes": nombre}
Rédige les textes en français."""


async def estimator(data: dict):
    task = _require(data, "task", "La tâche")
    reply = await llm.chat(ESTIMATOR_SYSTEM, task, temperature=0.3)
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
    if not items:
        raise llm.LLMError("L'estimation est vide, réessaie.")
    return {"items": items, "total_minutes": int(total)}


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
