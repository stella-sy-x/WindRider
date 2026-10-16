import sqlite3

import pytest

from store import Store


def test_legacy_results_are_preserved_but_excluded(tmp_path):
    path = str(tmp_path / "scores.db")
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE runs (id INTEGER PRIMARY KEY, seed INTEGER NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, time_ms INTEGER NOT NULL, created_at INTEGER NOT NULL, ghost TEXT)")
    db.execute("INSERT INTO runs VALUES (1, 42, 'pilot', 'Old', 30000, 0, NULL)")
    db.commit()
    db.close()
    store = Store(path)
    store.db.execute("INSERT INTO runs (seed,user_id,name,time_ms,created_at,rules) VALUES (42,'v1','V1',25000,0,'speed-control-v1')")
    store.db.execute("INSERT INTO runs (seed,user_id,name,time_ms,created_at,rules) VALUES (42,'v2','V2',20000,0,'speed-control-v2')")
    store.db.commit()
    assert store.leaderboard(42) == []
    assert store.add_run(42, "pilot", "New", 40000, None) == 40000
    assert store.leaderboard(42)[0].time_ms == 40000
    assert store.db.execute("SELECT time_ms FROM runs WHERE rules='legacy'").fetchone()[0] == 30000
    assert store.rank(42, 35000, "other") == 1
    assert store.db.execute("SELECT time_ms FROM runs WHERE rules='speed-control-v2'").fetchone()[0] == 20000
    store.close()


def test_migrations_run_once(tmp_path):
    from store import MIGRATIONS

    path = str(tmp_path / "scores.db")
    store = Store(path)
    assert store.db.execute("PRAGMA user_version").fetchone()[0] == len(MIGRATIONS)
    indexes = {row["name"] for row in store.db.execute("PRAGMA index_list(runs)")}
    assert {"runs_board", "runs_user"} <= indexes and "runs_seed_time" not in indexes
    store.close()
    # Opening again applies nothing (the ALTER TABLE would fail on a column that exists)
    again = Store(path)
    assert again.db.execute("PRAGMA user_version").fetchone()[0] == len(MIGRATIONS)
    again.close()


def test_a_database_migrated_by_probing_is_picked_up(tmp_path):
    # Before versioning, the rules column was added by probing for it, leaving user_version at 0
    path = str(tmp_path / "scores.db")
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE runs (id INTEGER PRIMARY KEY, seed INTEGER NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, time_ms INTEGER NOT NULL, created_at INTEGER NOT NULL, ghost TEXT, rules TEXT NOT NULL DEFAULT 'legacy')")
    db.execute("CREATE INDEX runs_user ON runs (user_id)")
    db.commit()
    db.close()
    store = Store(path)
    assert store.add_run(1, "pilot", "P", 40000, None) == 40000
    store.close()


def test_runs_are_checked(tmp_path):
    store = Store(str(tmp_path / "scores.db"))
    with pytest.raises(sqlite3.IntegrityError):
        store.add_run(1, "pilot", "P", 500, None)  # faster than any race can be
    with pytest.raises(sqlite3.IntegrityError):
        store.add_run(1, "pilot", "", 40000, None)
    # A failed insert leaves nothing behind
    assert store.leaderboard(1) == []
    store.close()


def test_solo_runs_are_kept_and_expire(tmp_path):
    from store import SOLO_RUN_TTL_MS

    store = Store(str(tmp_path / "scores.db"))
    old = store.start_solo_run(7, now_ms=1_000)
    fresh = store.start_solo_run(8, now_ms=SOLO_RUN_TTL_MS + 5_000)
    assert store.pop_solo_run(old) is None  # expired when the next run started
    assert store.pop_solo_run(fresh) == (8, SOLO_RUN_TTL_MS + 5_000)
    assert store.pop_solo_run(fresh) is None  # one finish per start
    store.close()
