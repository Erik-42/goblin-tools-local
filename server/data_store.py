"""Persistance des donnees et sessions multiples (SQLite, goblin-data.db).

Fournit :

  * un verrou d'instance unique via fcntl.flock (un seul processus serveur a la fois) ;
  * des tables SQLite pour l'historique, les listes Magic ToDo, le focus et
    les sessions de l'assistant "second cerveau" ;
  * des helpers de migration depuis le localStorage du navigateur.

Toutes les requêtes sont serealisees par un verrou de thread Python pour etre
sures depuis FastAPI (qui peut appeler les routes depuis plusieurs coroutines).
"""

from __future__ import annotations

import fcntl
import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any

from .paths import DATA_DIR

DB_PATH = DATA_DIR / "goblin-data.db"
LOCK_PATH = DATA_DIR / "goblin-data.lock"

_schema = [
    """
    CREATE TABLE IF NOT EXISTS app_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS lists (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        name      TEXT NOT NULL,
        steps     TEXT NOT NULL,  -- JSON
        created   REAL NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS history (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        tool    TEXT NOT NULL,
        input   TEXT NOT NULL,
        output  TEXT NOT NULL,  -- JSON
        time    REAL NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS assistant_sessions (
        id      TEXT PRIMARY KEY,
        name    TEXT NOT NULL,
        updated REAL NOT NULL,
        messages TEXT NOT NULL  -- JSON
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS assistant_current (
        id TEXT PRIMARY KEY
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS focus (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        list_id     INTEGER,
        idx         INTEGER NOT NULL DEFAULT 0,
        done        INTEGER NOT NULL DEFAULT 0,
        skipped     INTEGER NOT NULL DEFAULT 0
    )
    """,
]


class DataStore:
    """Acces a la base de donnees de persistance (singleton par processus)."""

    def __init__(self, db_path: Path = DB_PATH, lock_path: Path = LOCK_PATH):
        self.db_path = db_path
        self.lock_path = lock_path
        self._lock = threading.RLock()
        self._fh: Any = None  # fichier de verrou d'instance unique
        self._init_db()

    # ------------------------------------------------------------------ verrou instance

    def acquire_instance_lock(self) -> bool:
        """Tente de prendre le verrou d'instance unique.

        Retourne True si le verrou est acquis (cette instance est la seule).
        Lever une RuntimeError si une autre instance detient deja le verrou.
        """
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.lock_path, "w")
        try:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (BlockingIOError, OSError):
            self._fh.close()
            self._fh = None
            raise RuntimeError(
                "Une autre instance de l'application est deja en cours d execution "
                "(verrou d'instance unique goblin-data.lock)."
            )
        self._fh.write(str(os.getpid()))
        self._fh.flush()
        return True

    def release_instance_lock(self) -> None:
        with self._lock:
            if self._fh is not None:
                try:
                    fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
                except OSError:
                    pass
                try:
                    self._fh.close()
                except OSError:
                    pass
                self._fh = None

    # ------------------------------------------------------------------ base de donnees

    def _init_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            conn = sqlite3.connect(self.db_path, timeout=30.0)
            try:
                for stmt in _schema:
                    conn.execute(stmt)
                conn.commit()
            finally:
                conn.close()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn

    # --------------------------------------------------------------- utilitaires generiques

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        with self._lock:
            conn = self._conn()
            try:
                cur = conn.execute(sql, params)
                conn.commit()
                return cur
            finally:
                conn.close()

    def query_all(self, sql: str, params: tuple = ()) -> list[dict]:
        with self._lock:
            conn = self._conn()
            try:
                cur = conn.execute(sql, params)
                rows = [dict(r) for r in cur.fetchall()]
                return rows
            finally:
                conn.close()

    # --------------------------------------------------------------- metadonnees

    def set_meta(self, key: str, value: str) -> None:
        self.execute(
            "INSERT INTO app_meta(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )

    def get_meta(self, key: str, default: str | None = None) -> str | None:
        rows = self.query_all("SELECT value FROM app_meta WHERE key = ?", (key,))
        return rows[0]["value"] if rows else default

    # --------------------------------------------------------------- listes (Magic ToDo)

    def save_list(self, list_id: int | None, name: str, steps: list[dict], created: float) -> int:
        if list_id is None:
            cur = self.execute(
                "INSERT INTO lists(name, steps, created) VALUES (?, ?, ?)",
                (name, json.dumps(steps, ensure_ascii=False), created),
            )
            return int(cur.lastrowid)
        self.execute(
            "UPDATE lists SET name = ?, steps = ? WHERE id = ?",
            (name, json.dumps(steps, ensure_ascii=False), list_id),
        )
        return int(list_id)

    def get_list(self, list_id: int) -> dict | None:
        rows = self.query_all("SELECT * FROM lists WHERE id = ?", (list_id,))
        if not rows:
            return None
        row = rows[0]
        row["steps"] = json.loads(row["steps"])
        return row

    def get_lists(self) -> list[dict]:
        rows = self.query_all("SELECT id, name, steps, created FROM lists ORDER BY created DESC")
        for row in rows:
            row["steps"] = json.loads(row["steps"])
        return rows

    def delete_list(self, list_id: int) -> None:
        self.execute("DELETE FROM lists WHERE id = ?", (list_id,))

    # --------------------------------------------------------------- historique

    def add_history(self, tool: str, input: str, output: Any, time: float) -> None:
        self.execute(
            "INSERT INTO history(tool, input, output, time) VALUES (?, ?, ?, ?)",
            (tool, str(input), json.dumps(output, ensure_ascii=False), time),
        )
        # garder les 100 plus recents
        rows = self.query_all("SELECT id FROM history ORDER BY time DESC")
        for row in rows[100:]:
            self.execute("DELETE FROM history WHERE id = ?", (row["id"],))

    def get_history(self) -> list[dict]:
        rows = self.query_all("SELECT * FROM history ORDER BY time DESC LIMIT 100")
        for row in rows:
            row["output"] = json.loads(row["output"])
        return rows

    def clear_history(self) -> None:
        self.execute("DELETE FROM history")

    # --------------------------------------------------------------- sessions assistant

    def save_session(self, session_id: str, name: str, messages: list[dict], updated: float) -> None:
        self.execute(
            "INSERT INTO assistant_sessions(id, name, updated, messages) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated = excluded.updated, messages = excluded.messages",
            (session_id, name, updated, json.dumps(messages, ensure_ascii=False)),
        )

    def get_session(self, session_id: str) -> dict | None:
        rows = self.query_all("SELECT * FROM assistant_sessions WHERE id = ?", (session_id,))
        if not rows:
            return None
        row = rows[0]
        row["messages"] = json.loads(row["messages"])
        return row

    def get_sessions(self) -> list[dict]:
        rows = self.query_all("SELECT id, name, updated FROM assistant_sessions ORDER BY updated DESC")
        return rows

    def delete_session(self, session_id: str) -> None:
        self.execute("DELETE FROM assistant_sessions WHERE id = ?", (session_id,))

    def set_current_session(self, session_id: str | None) -> None:
        if session_id is None:
            self.execute("DELETE FROM assistant_current")
        else:
            self.execute(
                "INSERT INTO assistant_current(id) VALUES (?) ON CONFLICT(id) DO UPDATE SET id = excluded.id",
                (session_id,),
            )

    def get_current_session(self) -> str | None:
        rows = self.query_all("SELECT id FROM assistant_current LIMIT 1")
        return rows[0]["id"] if rows else None

    # --------------------------------------------------------------- focus (Taskmaster)

    def save_focus(self, list_id: int | None, idx: int, done: int, skipped: int) -> None:
        self.execute(
            "INSERT INTO focus(id, list_id, idx, done, skipped) VALUES (1, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET list_id = excluded.list_id, idx = excluded.idx, "
            "done = excluded.done, skipped = excluded.skipped",
            (list_id, idx, done, skipped),
        )

    def get_focus(self) -> dict | None:
        rows = self.query_all("SELECT * FROM focus WHERE id = 1 LIMIT 1")
        return rows[0] if rows else None

    def clear_focus(self) -> None:
        self.execute("DELETE FROM focus")


# instance partagee
_store: DataStore | None = None


def get_store(db_path: Path = DB_PATH, lock_path: Path = LOCK_PATH) -> DataStore:
    global _store
    if _store is None:
        _store = DataStore(db_path=db_path, lock_path=lock_path)
    return _store
