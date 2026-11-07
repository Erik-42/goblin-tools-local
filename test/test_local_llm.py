"""Tests unitaires pour le moteur LLM local (platform, downloader, manager, think-tags)."""
import os
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

# Importer les modules du projet
from server.local_llm.platform import (
    PlatformSpec,
    PlatformNotSupported,
    current_platform,
    engine_binary_name,
    engine_download_url,
    engine_env_override,
)
from server.local_llm.downloader import Progress, DownloadError, _sha256_file
from server.local_llm.catalog import default_id, get, CATALOG, LLAMA_VERSION
from server.local_llm.manager import LocalLLMManager, State
from server.llm import _strip_think_tags


class TestPlatform(unittest.TestCase):
    """Tests du mappage plateforme (OS, arch)."""

    def test_current_platform_linux_x86_64(self):
        with patch("platform.system", return_value="Linux"), \
             patch("platform.machine", return_value="x86_64"):
            spec = current_platform()
            self.assertEqual(spec.os, "linux")
            self.assertEqual(spec.arch, "x86_64")
            self.assertEqual(spec.binary_name, "llama-server")

    def test_current_platform_unsupported_os(self):
        with patch("platform.system", return_value="FreeBSD"), \
             patch("platform.machine", return_value="x86_64"):
            with self.assertRaises(PlatformNotSupported):
                current_platform()

    def test_current_platform_unsupported_arch(self):
        with patch("platform.system", return_value="Linux"), \
             patch("platform.machine", return_value="mips64"):
            with self.assertRaises(PlatformNotSupported):
                current_platform()

    def test_engine_download_url(self):
        spec = PlatformSpec(
            os="linux",
            arch="x86_64",
            binary_name="llama-server",
            asset_pattern="llama-{version}-bin-ubuntu-x64.tar.gz",
            build="cpu",
        )
        url = engine_download_url("b12110", spec)
        expected = "https://github.com/ggml-org/llama.cpp/releases/download/b12110/llama-b12110-bin-ubuntu-x64.tar.gz"
        self.assertEqual(url, expected)

    def test_engine_env_override(self):
        with patch.dict(os.environ, {"GOBLIN_LLAMA_BIN": "/custom/path/llama-server"}):
            self.assertEqual(engine_env_override(), "/custom/path/llama-server")

        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(engine_env_override())


class TestDownloader(unittest.TestCase):
    """Tests du module downloader (Progress, sha256)."""

    def test_progress_dataclass(self):
        p = Progress(downloaded=10485760, total=104857600, percent=10.0, speed_bps=1048576.0)
        self.assertAlmostEqual(p.downloaded_mb, 10.0)
        self.assertAlmostEqual(p.total_mb, 100.0)
        self.assertFalse(p.done)

    def test_progress_none_total(self):
        p = Progress(downloaded=1048576)
        self.assertAlmostEqual(p.downloaded_mb, 1.0)
        self.assertIsNone(p.total_mb)

    def test_sha256_file(self):
        with tempfile.NamedTemporaryFile("w+", delete=False) as tf:
            tf.write("hello world\n")
            tf_path = tf.name

        try:
            # sha256 hash of "hello world\n"
            digest = _sha256_file(tf_path)
            self.assertEqual(len(digest), 64)
        finally:
            os.remove(tf_path)


class TestCatalog(unittest.TestCase):
    """Tests du catalogue de modèles."""

    def test_default_id(self):
        self.assertEqual(default_id(), "qwen3-4b-q4_k_m")

    def test_get_valid_model(self):
        m = get("qwen3-4b-q4_k_m")
        self.assertEqual(m.id, "qwen3-4b-q4_k_m")
        self.assertEqual(m.filename, "Qwen3-4B-Q4_K_M.gguf")
        self.assertEqual(m.repo, "Qwen/Qwen3-4B-GGUF")

    def test_get_invalid_model(self):
        with self.assertRaises(KeyError):
            get("non-existent-model")


class TestThinkTags(unittest.TestCase):
    """Tests du nettoyage des balises de raisonnement <thinking> et ```think```."""

    def test_strip_thinking_tag(self):
        text = "<thinking>Voici mon raisonnement interne...</thinking>Voici la reponse finale."
        self.assertEqual(_strip_think_tags(text), "Voici la reponse finale.")

    def test_strip_thinking_tag_case_insensitive(self):
        text = "<THINKING>Raisonnement...</THINKING>  Resultat."
        self.assertEqual(_strip_think_tags(text), "Resultat.")

    def test_strip_code_blocks(self):
        text = "```\ncode block\n```\nReponse."
        self.assertEqual(_strip_think_tags(text), "Reponse.")

    def test_strip_trailing_think(self):
        text = "Reponse utile. think"
        self.assertEqual(_strip_think_tags(text), "Reponse utile.")

    def test_clean_text_unchanged(self):
        text = "Une reponse normale sans aucune balise."
        self.assertEqual(_strip_think_tags(text), text)


class TestLocalLLMManager(unittest.TestCase):
    """Tests de la machine d'etats du LocalLLMManager."""

    def test_initial_state(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            mgr = LocalLLMManager(data_dir=Path(tmpdir))
            self.assertEqual(mgr.state, State.ABSENT)
            status = mgr.status()
            self.assertEqual(status["state"], "absent")
            self.assertFalse(status["ready"])
            self.assertFalse(status["engine_present"])
            self.assertFalse(status["model_present"])

    def test_status_structure(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            mgr = LocalLLMManager(data_dir=Path(tmpdir))
            st = mgr.status()
            expected_keys = {
                "state", "platform", "engine", "engine_override",
                "engine_present", "model", "model_present", "host",
                "port", "health_url", "base_url", "ready", "progress",
                "log", "error", "restarts",
            }
            self.assertTrue(expected_keys.issubset(st.keys()))


if __name__ == "__main__":
    unittest.main()
