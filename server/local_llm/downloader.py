"""Telechargement robuste d'un fichier (moteur llama-server ou modele GGUF).

- streaming httpx (pas de chargement integral en memoire)
- reprise sur interrompu via l'en-tête Range (fichier .part deja present)
- verification d integrite sha256 si un digest est fourni
- ecriture atomique : ecriture dans <dest>.part puis rename vers <dest>
- progression : octets, pourcentage, vitesse (callback optionnel)
"""
from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from typing import Callable, Optional

import httpx


class DownloadError(RuntimeError):
    """Echec de telechargement ou d integrite."""


@dataclass
class Progress:
    """Etat de progression d un telechargement en cours."""

    downloaded: int = 0
    total: Optional[int] = None
    percent: float = 0.0
    speed_bps: float = 0.0
    done: bool = False
    error: str = ""

    @property
    def downloaded_mb(self) -> float:
        return self.downloaded / (1024 * 1024)

    @property
    def total_mb(self) -> Optional[float]:
        return None if self.total is None else self.total / (1024 * 1024)


ProgressCb = Callable[[Progress], None]


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download(
    url: str,
    dest: str,
    *,
    expected_sha256: Optional[str] = None,
    progress_cb: Optional[ProgressCb] = None,
    timeout: float = 300.0,
    chunk_size: int = 1024 * 1024,
) -> str:
    """Telecharge `url` vers `dest` de maniere robuste.

    Retourne le chemin final (`dest`). Lever DownloadError en cas d'echec.
    """
    dest_tmp = dest + ".part"
    resume_at = 0

    if os.path.exists(dest_tmp):
        resume_at = os.path.getsize(dest_tmp)

    headers: dict[str, str] = {}
    if resume_at > 0:
        headers["Range"] = f"bytes={resume_at}-"

    try:
        with httpx.stream("GET", url, headers=headers, timeout=timeout) as resp:
            if resp.status_code not in (200, 206):
                raise DownloadError(
                    f"HTTP {resp.status_code} lors du telechargement de {url}"
                )

            total = resp.headers.get("content-length")
            if total is not None:
                total = int(total)
            # En mode reprise (206), content-length est le reste ; on reconstruit
            # le total logique a partir de ce qui est deja present.
            if resp.status_code == 206 and resume_at > 0 and total is not None:
                total = resume_at + total

            mode = "ab" if resume_at > 0 else "wb"
            downloaded = resume_at
            start = time.monotonic()
            last_emit = start

            with open(dest_tmp, mode) as f:
                for chunk in resp.iter_bytes(chunk_size=chunk_size):
                    if not chunk:
                        continue
                    f.write(chunk)
                    downloaded += len(chunk)
                    now = time.monotonic()
                    if progress_cb is not None and (now - last_emit) >= 0.25:
                        elapsed = max(now - start, 1e-6)
                        speed = (downloaded - resume_at) / elapsed
                        pct = (downloaded / total * 100.0) if total else 0.0
                        progress_cb(
                            Progress(
                                downloaded=downloaded,
                                total=total,
                                percent=min(pct, 100.0),
                                speed_bps=speed,
                            )
                        )
                        last_emit = now

    except httpx.HTTPError as exc:
        raise DownloadError(f"Reseau indisponible pendant le telechargement : {exc}") from exc
    except DownloadError:
        raise
    except OSError as exc:
        raise DownloadError(f"Impossible d ecrire le fichier destination : {exc}") from exc

    # Verification d integrite si un digest est attendu.
    if expected_sha256:
        try:
            actual = _sha256_file(dest_tmp)
        except OSError as exc:
            raise DownloadError(f"Impossible de verifier l integrite : {exc}") from exc
        if actual.lower() != expected_sha256.lower():
            try:
                os.remove(dest_tmp)
            except OSError:
                pass
            raise DownloadError(
                "Controle d integrite echec (sha256 incoherent). Le fichier est "
                "peut-etre corrompu ; relancez l installation."
            )

    # Ecriture atomique : on renomme le .part en destination finale.
    try:
        os.replace(dest_tmp, dest)
    except OSError as exc:
        raise DownloadError(f"Impossible de finaliser le fichier {dest} : {exc}") from exc

    if progress_cb is not None:
        total = os.path.getsize(dest) if os.path.exists(dest) else None
        progress_cb(
            Progress(
                downloaded=os.path.getsize(dest) if os.path.exists(dest) else 0,
                total=total,
                percent=100.0,
                speed_bps=0.0,
                done=True,
            )
        )
    return dest
