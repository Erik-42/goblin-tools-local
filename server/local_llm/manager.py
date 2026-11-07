"""Gestionnaire du moteur LLM local (llama-server + modele GGUF).

Machine d'etats :
    absent -> telechargement -> demarrage -> pret  (ou -> erreur)

Le gestionnaire possede le cycle de vie de llama-server :

  * telechargement du binaire llama-server (sauf si GOBLIN_LLAMA_BIN est defini)
  * telechargement du modele GGUF (Hugging Face)
  * lancement de llama-server (Popen, groupe de processus dedie)
  * attente que l'endpoint /health passe de 503 (chargement) a 200 (pret)
  * arret propre (atexit + signaux SIGINT/SIGTERM)
  * relance automatique au crash (maximum 1)

Toutes les operations bloquantes (telechargement, lancement, attente sante)
s'executent dans un fil d'arriere-plan afin de ne pas bloquer le serveur FastAPI.
L'etat est consultable a tout moment via :meth:`status` (verrouille, sans blocage).
"""

from __future__ import annotations

import atexit
import os
import signal
import subprocess
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

import httpx

from .catalog import CATALOG, LLAMA_VERSION, default_id, get, model_url
from .downloader import DownloadError, download, Progress
from .platform import (
    PlatformNotSupported,
    current_platform,
    engine_binary_name,
    engine_download_url,
    engine_env_override,
)

HEALTH_PATH = "/health"
DEFAULT_PORT = 8766
DEFAULT_HOST = "127.0.0.1"
START_TIMEOUT = 120.0  # secondes pour que /health passe a 200
POLL_INTERVAL = 1.0  # secondes entre deux probes de sante
MAX_CRASH_RESTARTS = 1  # relance au crash maximale
ENGINE_DIR_NAME = "engine"
MODELS_DIR_NAME = "models"
LOG_FILE_NAME = "llama-server.log"
KEEP_LOG_LINES = 200


class State(str, Enum):
    ABSENT = "absent"        # rien n'est installe
    DOWNLOADING = "downloading"  # telechargement en cours
    STARTING = "starting"    # lance, attente /health
    READY = "ready"          # moteur repond sur /health
    ERROR = "error"          # echec bloquant


@dataclass
class LocalLLMManager:
    """Pilote le moteur llama-server local et son modele GGUF."""

    data_dir: Path
    model_id: str = default_id()
    port: int = DEFAULT_PORT
    host: str = DEFAULT_HOST
    api_key: str = ""
    state: State = State.ABSENT
    progress: Progress = field(default_factory=Progress)
    log: list[str] = field(default_factory=list)
    error: str = ""

    # etat interne (non serialize dans status())
    _proc: Optional[subprocess.Popen] = None
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _install_thread: Optional[threading.Thread] = field(default=None, repr=False)
    _watch_thread: Optional[threading.Thread] = field(default=None, repr=False)
    _restarts: int = 0
    _stopping: bool = False

    # ------------------------------------------------------------------ chemins

    @property
    def engine_dir(self) -> Path:
        return self.data_dir / ENGINE_DIR_NAME

    @property
    def models_dir(self) -> Path:
        return self.data_dir / MODELS_DIR_NAME

    @property
    def engine_path(self) -> Path:
        override = engine_env_override()
        if override:
            return Path(override)
        return self.engine_dir / engine_binary_name(self._platform_spec())

    @property
    def model_path(self) -> Path:
        return self.models_dir / get(self.model_id).filename

    @property
    def health_url(self) -> str:
        return f"http://{self.host}:{self.port}{HEALTH_PATH}"

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}/v1"

    def _platform_spec(self):
        """Retourne la spec de plateforme ou None si non supportee."""
        try:
            return current_platform()
        except PlatformNotSupported:
            return None

    # ------------------------------------------------------------------ statut public

    def status(self) -> dict:
        """Etat courant, serialisable (sans blocage)."""
        with self._lock:
            proc_alive = self._proc is not None and self._proc.poll() is None
            spec = self._platform_spec()
            engine_override = bool(engine_env_override())
            return {
                "state": self.state.value,
                "platform": (
                    {"os": spec.os, "arch": spec.arch} if spec is not None else None
                ),
                "engine": str(self.engine_path),
                "engine_override": engine_override,
                "engine_present": True if engine_override else self.engine_path.exists(),
                "model": str(self.model_path),
                "model_present": self.model_path.exists(),
                "host": self.host,
                "port": self.port,
                "health_url": self.health_url,
                "base_url": self.base_url,
                "ready": self.state == State.READY and proc_alive,
                "progress": {
                    "downloaded": self.progress.downloaded,
                    "total": self.progress.total,
                    "percent": self.progress.percent,
                    "speed_bps": self.progress.speed_bps,
                    "done": self.progress.done,
                    "downloaded_mb": round(self.progress.downloaded_mb, 2),
                    "total_mb": (
                        round(self.progress.total_mb, 2)
                        if self.progress.total_mb is not None
                        else None
                    ),
                },
                "log": list(self.log[-KEEP_LOG_LINES:]),
                "error": self.error,
                "restarts": self._restarts,
            }

    def _log(self, message: str) -> None:
        ts = time.strftime("%H:%M:%S")
        entry = f"[{ts}] {message}"
        with self._lock:
            self.log.append(entry)
            if len(self.log) > KEEP_LOG_LINES * 2:
                self.log = self.log[-KEEP_LOG_LINES:]
        print(entry, flush=True)

    # ------------------------------------------------------------------ cycle de vie

    def install(self) -> dict:
        """Demarre l'installation (telechargement + lancement) en arriere-plan.

        Non bloquant : retourne le statut immediat. L'UI peut poller
        :meth:`status` pour suivre la progression.
        """
        with self._lock:
            if self._install_thread is not None and self._install_thread.is_alive():
                return self.status()
            if self.state == State.READY:
                return self.status()
            self._stopping = False
            self.error = ""
            self.state = State.ABSENT
            self._install_thread = threading.Thread(
                target=self._run_install, daemon=True, name="goblin-local-llm-install"
            )
            self._install_thread.start()
        return self.status()

    def retry(self) -> dict:
        """Relance l'installation depuis l'etat erreur."""
        with self._lock:
            self.error = ""
            self._restarts = 0
            self._stopping = False
            self.state = State.ABSENT
            self._install_thread = threading.Thread(
                target=self._run_install, daemon=True, name="goblin-local-llm-retry"
            )
            self._install_thread.start()
        return self.status()

    def stop(self) -> None:
        """Arrete le moteur et nettoie (appele a l'arret de l'appli)."""
        self._stopping = True
        with self._lock:
            if self._proc is not None and self._proc.poll() is None:
                pid = self._proc.pid
                try:
                    os.killpg(os.getpgid(pid), signal.SIGTERM)
                except OSError:
                    try:
                        self._proc.terminate()
                    except OSError:
                        pass
                try:
                    self._proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(os.getpgid(pid), signal.SIGKILL)
                    except OSError:
                        self._proc.kill()
                    self._proc.wait(timeout=10)
            self._proc = None
        self.state = State.ABSENT
        self._log("Moteur local arrete")

    # --------------------------------------------------------------- installation

    def _engine_ready(self) -> bool:
        return self.engine_path.exists() and self.model_path.exists()

    def _run_install(self) -> None:
        """Flot d'installation complet (execute dans le fil d'arriere-plan)."""
        try:
            spec = self._platform_spec()
            if spec is None:
                import platform as _platform

                raise PlatformNotSupported(
                    f"Plateforme non supportee : "
                    f"{_platform.system().lower()}/{_platform.machine()}"
                )

            # --- 1. binaire llama-server ---
            override = engine_env_override()
            if override:
                self._log(f"Binaire moteur (variable GOBLIN_LLAMA_BIN) : {override}")
            elif not self.engine_path.exists():
                self.state = State.DOWNLOADING
                self.progress = Progress()
                self.engine_dir.mkdir(parents=True, exist_ok=True)
                url = engine_download_url(LLAMA_VERSION, spec)

                def on_engine_progress(p: Progress) -> None:
                    with self._lock:
                        self.progress = p

                try:
                    download(url, str(self.engine_path), progress_cb=on_engine_progress)
                except DownloadError as exc:
                    raise RuntimeError(
                        "Impossible de telecharger le binaire llama-server depuis GitHub. "
                        "Fournissez un binaire compile via GOBLIN_LLAMA_BIN."
                    ) from exc
                try:
                    os.chmod(self.engine_path, 0o755)
                except OSError:
                    pass
                self._log(f"Binaire moteur installe : {self.engine_path}")
            else:
                self._log(f"Binaire moteur deja present : {self.engine_path}")

            # --- 2. modele GGUF ---
            if not self.model_path.exists():
                self.state = State.DOWNLOADING
                self.progress = Progress()
                model = get(self.model_id)
                self.models_dir.mkdir(parents=True, exist_ok=True)
                url = model_url(model.repo, model.filename)

                def on_model_progress(p: Progress) -> None:
                    with self._lock:
                        self.progress = p

                download(
                    url,
                    str(self.model_path),
                    expected_sha256=model.sha256,
                    progress_cb=on_model_progress,
                )
                self._log(f"Modele installe : {self.model_path} ({model.size_hint_mb} Mo)")
            else:
                self._log(f"Modele deja present : {self.model_path}")

            # --- 3. lancement du moteur ---
            self.state = State.STARTING
            self._launch_engine()

        except Exception as exc:  # tout echec -> etat erreur
            self._log(f"ERREUR : {exc}")
            with self._lock:
                self.state = State.ERROR
                self.error = str(exc)
                self._proc = None

    def _launch_engine(self) -> None:
        """Configure et lance llama-server, puis attend que /health reponde 200."""
        model = get(self.model_id)
        cmd = [
            str(self.engine_path),
            "--model",
            str(self.model_path),
            "--ctx-size",
            str(model.ctx_size),
            "--threads",
            str(os.cpu_count() or 4),
            "--gpu-layers",
            str(model.gpu_layers),
            "--temperature",
            str(model.temperature),
            "--top-k",
            str(model.top_k),
            "--top-p",
            str(model.top_p),
            "--min-p",
            str(model.min_p),
            "--host",
            self.host,
            "--port",
            str(self.port),
            "--chat-template-kwargs",
            model.chat_template_kwargs,
            "--cors-origins",
            "*",
        ]
        if self.api_key:
            cmd.extend(["--api-key", self.api_key])

        self._log(f"Lancement llama-server (port {self.port})")
        log_file = open(self.engine_dir / LOG_FILE_NAME, "ab", buffering=0)
        proc = subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,  # groupe de processus dedie pour un arret propre
        )
        with self._lock:
            self._proc = proc

        # attente que /health passe de 503 (chargement) a 200 (pret)
        deadline = time.monotonic() + START_TIMEOUT
        last_health = None
        while time.monotonic() < deadline:
            if self._stopping:
                try:
                    log_file.close()
                except OSError:
                    pass
                return
            if proc.poll() is not None:
                try:
                    log_file.close()
                except OSError:
                    pass
                raise RuntimeError(
                    f"llama-server s'est arrete (code {proc.returncode}) avant d'etre pret"
                )
            try:
                resp = httpx.get(self.health_url, timeout=2.0)
                if resp.status_code == 200:
                    with self._lock:
                        self.state = State.READY
                        self.error = ""
                    self._log("llama-server pret (sante OK)")
                    try:
                        log_file.close()
                    except OSError:
                        pass
                    self._start_watcher()
                    return
                last_health = resp.status_code
            except httpx.HTTPError:
                pass
            time.sleep(POLL_INTERVAL)

        try:
            log_file.close()
        except OSError:
            pass
        raise RuntimeError(
            f"llama-server n'est pas devenu pret a temps (dernier statut {last_health})"
        )

    def _start_watcher(self) -> None:
        """Surveille le processus et le relance au crash (max 1 fois)."""

        def watch() -> None:
            proc = None
            with self._lock:
                proc = self._proc
            if proc is None:
                return
            rc = proc.wait()
            if self._stopping:
                return
            self._log(f"llama-server arrete (code {rc})")
            with self._lock:
                self._proc = None
                if (
                    self.state == State.READY
                    and self._restarts < MAX_CRASH_RESTARTS
                    and not self._stopping
                ):
                    self._restarts += 1
                    self.state = State.STARTING
                    self._log(f"Relance au crash ({self._restarts}/{MAX_CRASH_RESTARTS})")
                    # relance hors verrou pour ne pas le retenir pendant l'attente sante
                else:
                    self.state = State.ERROR
                    self.error = f"llama-server arrete inopinement (code {rc})"
                    self._log(f"ERREUR : {self.error}")
                    return
            # relance (hors verrou)
            try:
                self._launch_engine()
            except Exception as exc:  # relance echec -> erreur
                self._log(f"ERREUR relance : {exc}")
                with self._lock:
                    self.state = State.ERROR
                    self.error = f"Rechargement echoue : {exc}"

        self._watch_thread = threading.Thread(target=watch, daemon=True, name="goblin-local-llm-watch")
        self._watch_thread.start()


# ------------------------------------------------------------------ instance partagee

_manager: Optional[LocalLLMManager] = None


def get_manager(data_dir: Optional[Path] = None) -> LocalLLMManager:
    """Retourne le gestionnaire local (singleton), cree a la demande."""
    global _manager
    if _manager is None:
        if data_dir is None:
            # import differe pour eviter une boucle au chargement du module
            from .paths import DATA_DIR

            data_dir = DATA_DIR
        _manager = LocalLLMManager(data_dir=data_dir)
    return _manager


def register_shutdown(manager: LocalLLMManager) -> None:
    """Enregistre l'arret propre du gestionnaire a la sortie du processus."""
    atexit.register(manager.stop)

    def _handle_signal(signum, frame):  # pragma: no cover - gestion signaux
        manager.stop()

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)
