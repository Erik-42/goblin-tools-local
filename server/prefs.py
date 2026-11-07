"""Memoire de preferences utilisees par l'application (SQLite, goblin-prefs.db).

Stocke par cle/valeur les preferences utilisateur qui doivent survivre a une
reinstallation ou a une nouvelle session (theme, langue, fournisseur IA, ...).
C'est une simple table `prefs(key TEXT PRIMARY KEY, value TEXT)`.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from .paths import DATA_DIR

DB_PATH = DATA_DIR / "goblin-prefs.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    conn.commit()
    return conn


def get(key: str, default: str | None = None) -> str | None:
    """Retourne la valeur associee a `key`, ou `default` si absente."""
    with _connect() as conn:
        row = conn.execute("SELECT value FROM prefs WHERE key = ?", (key,)).fetchone()
    return row[0] if row else default


def set(key: str, value: str) -> None:
    """Ecrit (ou met a jour) la valeur associee a `key`."""
    with _connect() as conn:
        conn.execute(
            "INSERT INTO prefs(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        conn.commit()


def delete(key: str) -> None:
    """Supprime la preference associee a `key` si elle existe."""
    with _connect() as conn:
        conn.execute("DELETE FROM prefs WHERE key = ?", (key,))
        conn.commit()


def get_all() -> dict[str, str]:
    """Retourne toutes les preferences sous forme de dictionnaire."""
    with _connect() as conn:
        rows = conn.execute("SELECT key, value FROM prefs").fetchall()
    return {k: v for k, v in rows}


def clear() -> None:
    """Supprime toutes les preferences."""
    with _connect() as conn:
        conn.execute("DELETE FROM prefs")
        conn.commit()
