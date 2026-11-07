"""Assistant « second cerveau » : chat avec enchaînement d'outils.

Le modèle reçoit la description des outils disponibles. S'il a besoin d'un
outil, il répond UNIQUEMENT avec un objet JSON {"tool":..., "args":...}.
Le backend exécute l'outil, injecte le résultat, et relance le modèle jusqu'à
obtenir une réponse texte finale. La mémoire de conversation est gérée côté
frontend (localStorage) et passée dans l'historique.
"""
from __future__ import annotations

import json
from typing import Any, Dict

from . import llm, tools


MAX_STEPS = 6

ASSISTANT_SYSTEM = """Tu es le « second cerveau » de l'utilisateur. Tu réponds en français, de façon concise, chaleureuse et pratique.

Tu as accès aux outils suivants. Si une demande nécessite l'un d'eux, réponds UNIQUEMENT avec cet objet JSON (rien autour, pas de markdown) :
{{"tool": "<nom de l'outil>", "args": {{ ...arguments de l'outil ... }}}}

Si tu peux répondre directement sans outil, fais-le en texte simple, sans JSON.

Outils disponibles :
{tools}

Quand un outil a été exécuté, son résultat te est renvoyé : intègre-le pour formuler ta réponse finale à l'utilisateur.
"""

ASSISTANT_TOOLS: Dict[str, Dict[str, Any]] = {
    "magic-todo": {
        "desc": "Découpe une tâche en étapes concrètes et actionnables.",
        "args": {"task": "La tâche ou l'objectif à découper"},
    },
    "formalizer": {
        "desc": "Réécrit un texte dans un ton donné.",
        "args": {
            "text": "Le texte à réécrire",
            "tone": "Ton visé (ex. plus-professionnel, plus-accessible, plus-simple, plus-direct; défaut plus-professionnel)",
        },
    },
    "judge": {
        "desc": "Analyse l'impression et le ton d'un message, et propose une réponse.",
        "args": {
            "text": "Le message à analyser",
            "mode": "juger (défaut) ou proposer-une-reponse",
        },
    },
    "professor": {
        "desc": "Explique un sujet avec un exemple concret.",
        "args": {"topic": "Le sujet à expliquer"},
    },
    "consultant": {
        "desc": "Pèse le pour et le contre d'une situation et donne un conseil.",
        "args": {"situation": "La situation à analyser", "options": "Pistes déjà envisagées (optionnel)"},
    },
    "estimator": {
        "desc": "Estime le temps réel nécessaire pour finir une activité.",
        "args": {"task": "L'activité à estimer"},
    },
    "compiler": {
        "desc": "Transforme un vrac d'idées en liste d'actions concrètes.",
        "args": {"brainstorm": "Les idées en vrac à structurer"},
    },
    "chef": {
        "desc": "Propose des recettes à partir des ingrédients disponibles.",
        "args": {"ingredients": "Les ingrédients et contraintes"},
    },
}


def _tool_description() -> str:
    lines = []
    for name, info in ASSISTANT_TOOLS.items():
        args = ", ".join(f"{k}: {v}" for k, v in info["args"].items())
        lines.append(f"- {name}: {info['desc']} (args: {args})")
    return "\n".join(lines)


def _parse_tool_call(reply: str) -> Dict[str, Any] | None:
    """Extrait un appel d'outil depuis la réponse brute du modèle."""
    try:
        data = llm.parse_json(reply)
    except llm.LLMError:
        return None
    if isinstance(data, dict) and "tool" in data and "args" in data:
        args = data.get("args")
        if not isinstance(args, dict):
            args = {}
        return {"tool": str(data["tool"]), "args": args}
    return None


async def _call_tool(name: str, args: Dict[str, Any]):
    handler = tools.TOOLS.get(name)
    if handler is None:
        raise ValueError(f"Outil inconnu : {name}")
    return await handler(args)


async def assistant_chat(message: str, history: list) -> dict:
    """Boucle ReAct : outil(s) puis réponse texte finale."""
    system = ASSISTANT_SYSTEM.format(tools=_tool_description())

    user_parts = []
    for turn in history[-8:]:
        role = turn.get("role") or "utilisateur"
        content = str(turn.get("content") or "").strip()
        if content:
            user_parts.append(f"{role}: {content}")
    user_parts.append(f"utilisateur: {message}")
    user = "\n".join(user_parts)

    steps = []
    for _ in range(MAX_STEPS):
        reply = await llm.chat(system, user, temperature=0.5)
        tool_call = _parse_tool_call(reply)
        if not tool_call:
            return {"reply": reply.strip(), "steps": steps}
        name = tool_call["tool"]
        args = tool_call["args"]
        try:
            result = await _call_tool(name, args)
        except Exception as exc:  # on signale l'échec au modèle plutôt que de planter
            result = {"error": str(exc)}
        steps.append({"tool": name, "args": args, "result": result})
        user += (
            f"\n\n>>> Résultat de l'outil {name}: {json.dumps(result, ensure_ascii=False)}\n"
            "Poursuis ou donne ta réponse finale en texte simple."
        )

    # Nombre maximal d'étapes atteint : on retourne le dernier résultat brut.
    last = steps[-1]["result"] if steps else {}
    return {"reply": str(last), "steps": steps}
