"""
Shared singletons for the API layer.

Each router used to build its own `FinanceDatabase(db_path=DB_PATH)` at import
time. Fifteen routers meant fifteen constructors, and every constructor runs
_init_database() in full: all the CREATE TABLE statements, eighteen CREATE
INDEX, and every migration check. That work ran fifteen times on each start —
noticeable on the ARM builds — and importing a router had the side effect of
creating a database and a default admin account.

Everything here is built on first use, so importing a module never touches the
filesystem. That matters for tests, and it means import order has no effect on
what ends up on disk.
"""

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import paths
from auth import AuthManager
from database import FinanceDatabase

#: Resolved once, from paths.py, which is itself driven by DATA_DIR.
DB_PATH = str(paths.DB_PATH)

_db: FinanceDatabase | None = None
_auth: AuthManager | None = None


def get_db() -> FinanceDatabase:
    """The single database instance, created on first use."""
    global _db
    if _db is None:
        paths.ensure_data_dirs()
        _db = FinanceDatabase(db_path=DB_PATH)
    return _db


def get_auth_manager() -> AuthManager:
    """The single auth manager, created on first use.

    Building this eagerly is what made `from api import accounts` create a
    database and print a generated admin password to stdout.
    """
    global _auth
    if _auth is None:
        paths.ensure_data_dirs()
        _auth = AuthManager(db_path=DB_PATH)
    return _auth


class _Lazy:
    """Attribute proxy that builds its target on first access.

    Lets the routers keep writing `db.method(...)` and `auth_mgr.method(...)`
    at module scope without that scope doing any work.
    """

    __slots__ = ("_factory",)

    def __init__(self, factory):
        object.__setattr__(self, "_factory", factory)

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_factory")(), name)

    def __setattr__(self, name, value):
        setattr(object.__getattribute__(self, "_factory")(), name, value)


#: Module-level handles the routers bind once and use everywhere.
lazy_db = _Lazy(get_db)
lazy_auth_manager = _Lazy(get_auth_manager)
