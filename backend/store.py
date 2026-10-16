"""Finished runs, per seed, and solo runs in progress, in a SQLite file (kept on a Docker volume)."""

import json
import os
import secrets
import sqlite3
import threading
import time

from models import Ghost, GhostRun, LeaderboardEntry

# Solo time trials in progress are forgotten after this long
SOLO_RUN_TTL_MS = 60 * 60 * 1000

# The tables as first created. Changes to them go in MIGRATIONS, never here: an existing database
# only runs the migrations it hasn't seen yet (PRAGMA user_version counts them).
SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY,
        seed INTEGER NOT NULL CHECK (seed BETWEEN 1 AND 2147483647),
        user_id TEXT NOT NULL,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
        time_ms INTEGER NOT NULL CHECK (time_ms BETWEEN 1000 AND 3600000),
        created_at INTEGER NOT NULL,
        ghost TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS solo_runs (
        token TEXT PRIMARY KEY,
        seed INTEGER NOT NULL,
        started_at INTEGER NOT NULL
    )
    """,
]

# One statement per version, applied in order; a database at user_version n has run the first n.
MIGRATIONS = [
    # 1: keep historical times and ghosts in their original ruleset
    "ALTER TABLE runs ADD COLUMN rules TEXT NOT NULL DEFAULT 'legacy'",
    # 2, 3: the original indexes, replaced by the ones in INDEXES (which lead with rules)
    "DROP INDEX IF EXISTS runs_seed_time",
    "DROP INDEX IF EXISTS runs_user",
    # future migrations go here
]

INDEXES = [
    "CREATE INDEX IF NOT EXISTS runs_board ON runs (rules, seed, time_ms)",
    "CREATE INDEX IF NOT EXISTS runs_user ON runs (rules, user_id)",
]


class Store:
    def __init__(self, path: str):
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        # Called from worker threads (to keep the event loop free), one at a time
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        for sql in SCHEMA:
            self.db.execute(sql)
        self._migrate()
        for sql in INDEXES:
            self.db.execute(sql)
        self.db.commit()

    def _migrate(self):
        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        if version == 0:
            # Before versioning, the first migration was applied by probing for its column
            columns = {row["name"] for row in self.db.execute("PRAGMA table_info(runs)")}
            if "rules" in columns:
                version = 1
        for sql in MIGRATIONS[version:]:
            self.db.execute(sql)
        self.db.execute(f"PRAGMA user_version = {len(MIGRATIONS)}")

    def close(self):
        with self.lock:
            self.db.close()

    # --- finished runs ------------------------------------------------------

    def _best(self, seed: int, user_id: str) -> int | None:
        row = self.db.execute(
            "SELECT MIN(time_ms) AS best FROM runs WHERE rules = 'speed-control-v3' AND seed = ? AND user_id = ?", (seed, user_id)
        ).fetchone()
        return row["best"]

    def add_run(self, seed: int, user_id: str, name: str, time_ms: int, ghost: Ghost | None) -> int:
        """Stores a run and returns the user's best time. Only that best run keeps its ghost."""
        with self.lock:
            return self._add_run(seed, user_id, name, time_ms, ghost)

    def _add_run(self, seed: int, user_id: str, name: str, time_ms: int, ghost: Ghost | None) -> int:
        # One transaction: if the insert fails, the previous best keeps its ghost
        with self.db:
            previous_best = self._best(seed, user_id)
            is_best = previous_best is None or time_ms < previous_best
            if is_best:
                self.db.execute(
                    "UPDATE runs SET ghost = NULL WHERE rules = 'speed-control-v3' AND seed = ? AND user_id = ?", (seed, user_id)
                )
            self.db.execute(
                "INSERT INTO runs (seed, user_id, name, time_ms, created_at, ghost, rules) VALUES (?, ?, ?, ?, ?, ?, 'speed-control-v3')",
                (
                    seed,
                    user_id,
                    name,
                    time_ms,
                    int(time.time()),
                    ghost.model_dump_json() if ghost and is_best else None,
                ),
            )
        return time_ms if is_best else previous_best

    def has_played(self, user_id: str) -> bool:
        """Any finished run by this user, on any seed and under any ruleset"""
        with self.lock:
            return self.db.execute("SELECT 1 FROM runs WHERE user_id = ? LIMIT 1", (user_id,)).fetchone() is not None

    def leaderboard(self, seed: int, limit: int = 10, me: str | None = None) -> list[LeaderboardEntry]:
        # SQLite fills the bare columns (name) from the row that holds MIN(time_ms)
        with self.lock:
            rows = self._leaderboard_rows(seed, limit)
        return [
            LeaderboardEntry(rank=i, name=row["name"], time_ms=row["time_ms"], is_me=row["user_id"] == me)
            for i, row in enumerate(rows, 1)
        ]

    def _leaderboard_rows(self, seed: int, limit: int) -> list[sqlite3.Row]:
        return self.db.execute(
            """
            SELECT user_id, name, MIN(time_ms) AS time_ms FROM runs
            WHERE rules = 'speed-control-v3' AND seed = ? GROUP BY user_id ORDER BY time_ms LIMIT ?
            """,
            (seed, limit),
        ).fetchall()

    def rank(self, seed: int, time_ms: int, user_id: str) -> int:
        """The place a time takes against everyone else's best on this seed."""
        with self.lock:
            row = self.db.execute(
                """
                SELECT COUNT(*) AS faster FROM (
                    SELECT MIN(time_ms) AS best FROM runs WHERE rules = 'speed-control-v3' AND seed = ? AND user_id != ? GROUP BY user_id
                ) WHERE best < ?
                """,
                (seed, user_id, time_ms),
            ).fetchone()
        return row["faster"] + 1

    def ghosts(self, seed: int, limit: int = 3) -> list[GhostRun]:
        with self.lock:
            rows = self.db.execute(
                """
                SELECT name, time_ms, ghost FROM runs
                WHERE rules = 'speed-control-v3' AND seed = ? AND ghost IS NOT NULL ORDER BY time_ms LIMIT ?
                """,
                (seed, limit),
            ).fetchall()
        return [
            GhostRun(name=row["name"], time_ms=row["time_ms"], ghost=Ghost(**json.loads(row["ghost"])))
            for row in rows
        ]

    # --- solo runs in progress ----------------------------------------------
    # Kept in the database (not in memory), so a restart or a second process doesn't lose them

    def start_solo_run(self, seed: int, now_ms: int) -> str:
        """Remembers when a solo run's clock started and returns its token; forgets expired runs."""
        token = secrets.token_urlsafe(16)
        with self.lock, self.db:
            self.db.execute("DELETE FROM solo_runs WHERE started_at < ?", (now_ms - SOLO_RUN_TTL_MS,))
            self.db.execute("INSERT INTO solo_runs (token, seed, started_at) VALUES (?, ?, ?)", (token, seed, now_ms))
        return token

    def pop_solo_run(self, token: str) -> tuple[int, int] | None:
        """Takes a run out, returning (seed, started_at ms), or None if unknown or already finished."""
        with self.lock, self.db:
            row = self.db.execute("SELECT seed, started_at FROM solo_runs WHERE token = ?", (token,)).fetchone()
            if row is None:
                return None
            self.db.execute("DELETE FROM solo_runs WHERE token = ?", (token,))
        return row["seed"], row["started_at"]

    def backdate_solo_run(self, token: str, by_ms: int):
        """Moves a run's start back in time (tests pretend the clock started a while ago)."""
        with self.lock, self.db:
            self.db.execute("UPDATE solo_runs SET started_at = started_at - ? WHERE token = ?", (by_ms, token))
