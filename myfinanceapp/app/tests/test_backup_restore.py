"""
Backup and restore.

This is the module you fall back on when everything else has failed, and it was
covered by no test at all. What matters here is not that a file appears, but
that restoring genuinely returns the database to its earlier state and that a
corrupted archive is refused rather than silently written over live data.

Run:
  cd app && JWT_SECRET_KEY=test PYTHONPATH=$PWD \
    ../.venv-dev/bin/python -m pytest tests/test_backup_restore.py -v
"""
import gzip
import os
import shutil
import tempfile

import pytest

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backup_manager import BackupManager
from database import FinanceDatabase


@pytest.fixture
def workspace():
    d = tempfile.mkdtemp()
    db_path = os.path.join(d, "finance.db")
    db = FinanceDatabase(db_path=db_path)
    manager = BackupManager(db_path=db_path, backup_dir=os.path.join(d, "backups"))
    yield {"dir": d, "db_path": db_path, "db": db, "manager": manager}
    shutil.rmtree(d, ignore_errors=True)


def add_account(db, name, balance=0.0):
    return db.add_account({
        "name": name, "owner_id": db.get_owners()[0]["id"], "balance": balance,
        "currency": "EUR", "account_type": "checking",
    })


def account_names(db_path):
    return sorted(a["name"] for a in FinanceDatabase(db_path=db_path).get_accounts())


# ── creating ─────────────────────────────────────────────────────────────────

def test_a_backup_records_a_checksum_and_a_size(workspace):
    add_account(workspace["db"], "Checking", 100.0)
    record = workspace["manager"].create_backup("manual", "test")

    assert record is not None
    assert record["checksum"]
    assert record["size_bytes"] > 0
    assert os.path.exists(record["path"])


def test_backups_are_compressed_by_default(workspace):
    record = workspace["manager"].create_backup("manual", "test")
    assert record["compressed"] is True
    assert record["filename"].endswith(".gz")
    # Readable as gzip, and holds a real SQLite file.
    with gzip.open(record["path"], "rb") as f:
        assert f.read(15) == b"SQLite format 3"


def test_backups_are_listed_newest_first(workspace):
    first = workspace["manager"].create_backup("manual", "one")
    second = workspace["manager"].create_backup("manual", "two")
    listed = workspace["manager"].list_backups()
    assert [b["id"] for b in listed][:2] == [second["id"], first["id"]]


# ── restoring ────────────────────────────────────────────────────────────────

def test_restoring_undoes_everything_after_the_backup(workspace):
    db, path = workspace["db"], workspace["db_path"]
    add_account(db, "Before", 1234.56)
    record = workspace["manager"].create_backup("manual", "checkpoint")

    add_account(db, "After", 999.0)
    assert account_names(path) == ["After", "Before"]

    assert workspace["manager"].restore_backup(record["id"]) is True

    assert account_names(path) == ["Before"]
    restored = FinanceDatabase(db_path=path).get_accounts()[0]
    assert restored["balance"] == 1234.56


def test_restoring_takes_a_safety_copy_first(workspace):
    """The pre-restore snapshot is the only way back if the restore was a mistake."""
    add_account(workspace["db"], "Before")
    record = workspace["manager"].create_backup("manual", "checkpoint")
    add_account(workspace["db"], "After")

    workspace["manager"].restore_backup(record["id"])

    types = [b["type"] for b in workspace["manager"].list_backups()]
    assert "pre_restore" in types, "restoring must snapshot the current state first"


def test_restoring_an_unknown_backup_is_refused(workspace):
    with pytest.raises(ValueError):
        workspace["manager"].restore_backup(9999)


def test_a_missing_archive_is_reported_not_ignored(workspace):
    record = workspace["manager"].create_backup("manual", "test")
    os.unlink(record["path"])
    with pytest.raises(FileNotFoundError):
        workspace["manager"].restore_backup(record["id"])


def test_a_corrupted_archive_does_not_pass_silently(workspace):
    """A truncated or altered archive must fail loudly, not restore garbage."""
    add_account(workspace["db"], "Before")
    record = workspace["manager"].create_backup("manual", "test")

    with gzip.open(record["path"], "wb") as f:
        f.write(b"this is not a database")

    with pytest.raises(Exception):
        workspace["manager"].restore_backup(record["id"])


# ── housekeeping ─────────────────────────────────────────────────────────────

def test_deleting_a_backup_removes_the_file_and_the_record(workspace):
    record = workspace["manager"].create_backup("manual", "test")
    path = record["path"]

    assert workspace["manager"].delete_backup(record["id"]) is True

    assert not os.path.exists(path)
    assert record["id"] not in [b["id"] for b in workspace["manager"].list_backups()]


def test_statistics_reflect_what_exists(workspace):
    workspace["manager"].create_backup("manual", "one")
    workspace["manager"].create_backup("auto", "two")
    stats = workspace["manager"].get_backup_statistics()
    assert stats["total_backups"] >= 2


def test_a_backup_can_be_exported_and_imported_back(workspace):
    add_account(workspace["db"], "Exported", 42.0)
    record = workspace["manager"].create_backup("manual", "test")

    # export_backup takes a destination *directory* and returns the file it wrote.
    outbox = os.path.join(workspace["dir"], "outbox")
    os.makedirs(outbox)
    exported = workspace["manager"].export_backup(record["id"], outbox)
    assert os.path.exists(exported)

    imported = workspace["manager"].import_backup(exported)
    assert imported is not None
    assert imported["id"] != record["id"]
