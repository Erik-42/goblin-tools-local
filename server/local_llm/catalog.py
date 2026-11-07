"""Registre des modèles locaux supportés (llama.cpp / GGUF).

Une seule entrée pour l'instant (Qwen3 4B Q4_K_M). Ajouter un modèle =
ajouter une nouvelle entree dans ``CATALOG``.

Les chemins de telechargement se resolvent via le depot Hugging Face
``https://huggingface.co/<repo>/resolve/main/<filename>``.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Final

# Version de llama.cpp testee avec ce catalogue. Elle peut etre surchargee
# par la variable d environnement GOBLIN_LLAMA_VERSION (installation hors
# ligne avec un binaire deja present, voir manager.py).
LLAMA_VERSION: Final[str] = os.environ.get("GOBLIN_LLAMA_VERSION", "b4462")


@dataclass(frozen=True)
class ModelRef:
    """Description d'un model GGUF utilisable avec llama-server."""

    id: str
    repo: str  # depot Hugging Face, ex: "Qwen/Qwen3-4B-GGUF"
    filename: str  # nom du fichier GGUF dans le depot
    size_hint_mb: int  # taille approximative (Mo) pour l affichage / avertissement disque
    sha256: str | None = None  # digest attendu si connu (None = pas de verif d integrite)
    temperature: float = 0.7
    top_p: float = 0.8
    top_k: int = 20
    min_p: float = 0.0
    ctx_size: int = 8192
    chat_template_kwargs: str = '{"enable_thinking": false}'
    gpu_layers: int = 0  # CPU par défaut (Vulkan en option via reglage)


QWEN3_4B_Q4_K_M = ModelRef(
    id="qwen3-4b-q4_k_m",
    repo="Qwen/Qwen3-4B-GGUF",
    filename="Qwen3-4B-Q4_K_M.gguf",
    size_hint_mb=2500,
    # sha256=None : aucun digest disponible a l ecriture. A remplir une fois
    # qu un digest fiable a ete releve sur la page Hugging Face du modele.
    sha256=None,
    temperature=0.7,
    top_p=0.8,
    top_k=20,
    min_p=0.0,
    ctx_size=8192,
    chat_template_kwargs='{"enable_thinking": false}',
    gpu_layers=0,
)

CATALOG: Final[dict[str, ModelRef]] = {
    m.id: m for m in (QWEN3_4B_Q4_K_M,)
}


def get(model_id: str) -> ModelRef:
    """Retourne la reference du model, ou lever KeyError si inconnu."""
    if model_id not in CATALOG:
        raise KeyError(f"Modele inconnu : {model_id}")
    return CATALOG[model_id]


def default_id() -> str:
    """Identifiant du model par défaut (seule entree pour l instant)."""
    return "qwen3-4b-q4_k_m"


def model_url(repo: str, filename: str) -> str:
    """URL de telechargement brute d un fichier GGUF sur Hugging Face."""
    return f"https://huggingface.co/{repo}/resolve/main/{filename}"
