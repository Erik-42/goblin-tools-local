"""Moteur LLM local (llama-server + modele GGUF) pour Une Etape a la Fois.

Paquet optionnel : rend l'application autonome hors ligne en telechargeant
au premier lancement un binaire llama-server et un modele GGUF (Qwen3 4B).
"""

from .manager import LocalLLMManager, State, get_manager, register_shutdown

__all__ = ["LocalLLMManager", "State", "get_manager", "register_shutdown"]
