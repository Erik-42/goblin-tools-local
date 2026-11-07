"""Mappage plateforme (OS, arch) -> binaire / asset llama.cpp.

Seul linux/x86_64 est implemente pour l instant. Toute autre plateforme
leve PlatformNotSupported avec un message clair ; Windows/macOS pourront
etre ajoutes plus tard en une seule entree sans refonte.
"""
from __future__ import annotations

import os
import platform as _platform
from dataclasses import dataclass


class PlatformNotSupported(RuntimeError):
    """La plateforme courante n est pas supportee pour le moteur local."""


# (os, arch) -> spec. La cle os est le resultat de sys.platform normalise.
_PLATFORMS: dict[tuple[str, str], "PlatformSpec"] = {}


@dataclass(frozen=True)
class PlatformSpec:
    os: str  # "linux"
    arch: str  # "x86_64"
    binary_name: str  # "llama-server"
    asset_pattern: str  # motif recherche sur les releases GitHub (Linux x64)
    build: str  # "cpu" (defaut) | "vulkan"


def _register(os_name: str, arch: str, spec: PlatformSpec) -> None:
    _PLATFORMS[(os_name, arch)] = spec


_register(
    "linux",
    "x86_64",
    PlatformSpec(
        os="linux",
        arch="x86_64",
        binary_name="llama-server",
        asset_pattern="llama-{version}-bin-ubuntu-x64.tar.gz",
        build="cpu",
    ),
)


def _normalize_arch(raw: str) -> str:
    a = raw.lower().replace("-", "_")
    if a in {"x86_64", "amd64"}:
        return "x86_64"
    if a in {"aarch64", "arm64"}:
        return "aarch64"
    return a


def current_platform() -> PlatformSpec:
    """Retourne la spec de la plateforme courante ou leve PlatformNotSupported."""
    os_name = _platform.system().lower()
    if os_name == "darwin":
        os_name = "macos"
    arch = _normalize_arch(_platform.machine())
    key = (os_name, arch)
    if key not in _PLATFORMS:
        raise PlatformNotSupported(
            f"Plateforme non supportee pour l'instant : {os_name}/{arch}. "
            "Seul linux/x86_64 est implemente. Windows et macOS viendront plus tard."
        )
    return _PLATFORMS[key]


def engine_binary_name(spec: PlatformSpec) -> str:
    return spec.binary_name


def engine_download_url(version: str, spec: PlatformSpec) -> str:
    """URL de l'asset binaire llama-server sur une release GitHub de llama.cpp.

    Le nom exact de l'asset n'est pas code en dur : on construit l'URL a
    partir du motif d'asset de la plateforme (qui peut contenir un
    placeholder ``{version}``) et du tag de release demande.
    """
    filename = spec.asset_pattern.format(version=version)
    return (
        f"https://github.com/ggml-org/llama.cpp/releases/download/"
        f"{version}/{filename}"
    )


def engine_env_override() -> str | None:
    """Chemin d'un binaire llama-server fourni par l'operateur (hors ligne)."""
    return os.environ.get("GOBLIN_LLAMA_BIN") or None
