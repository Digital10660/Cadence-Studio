# -*- coding: utf-8 -*-
"""
Cadence — local database (SQLite, works fully offline).

  data/cadence.db
    users     : accounts (email + name + salted PBKDF2 password hash)
    sessions  : login sessions (random token stored in an HttpOnly cookie)
    projects  : video projects, one JSON document per project, per user
    kv        : per-user documents (saved styles, brand kits)

The first account created inherits the projects/styles/brands that existed
before accounts were added (data/projects/*.json, styles.json, brands.json).
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time

_lock = threading.Lock()
_db_path = None
SESSION_DAYS = 30
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _conn():
    c = sqlite3.connect(_db_path, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c


def init(data_dir):
    global _db_path
    _db_path = os.path.join(data_dir, "cadence.db")
    with _lock, _conn() as c:
        c.executescript("""
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            pw_hash TEXT NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL, data TEXT NOT NULL, updated REAL NOT NULL,
            PRIMARY KEY (user_id, id));
        CREATE TABLE IF NOT EXISTS kv (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (user_id, k));
        CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated DESC);
        """)


# ---------------------------------------------------------------- passwords
def _hash(pw, salt=None, it=240000):
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, it)
    return f"pbkdf2${it}${salt.hex()}${dk.hex()}"


def _check(pw, stored):
    try:
        _, it, salt, dk = stored.split("$")
        return hmac.compare_digest(_hash(pw, bytes.fromhex(salt), int(it)).split("$")[3], dk)
    except Exception:
        return False


# ---------------------------------------------------------------- accounts
class AuthError(Exception):
    pass


def register(email, name, password, legacy_dir=None):
    email = (email or "").strip().lower()
    name = (name or "").strip() or email.split("@")[0]
    if not EMAIL_RE.match(email):
        raise AuthError("Adresse e-mail invalide.")
    if len(password or "") < 8:
        raise AuthError("Le mot de passe doit contenir au moins 8 caractères.")
    uid = secrets.token_hex(8)
    with _lock, _conn() as c:
        if c.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise AuthError("Un compte existe déjà avec cette adresse.")
        first = c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
        c.execute("INSERT INTO users VALUES (?,?,?,?,?)", (uid, email, name, _hash(password), time.time()))
    if first and legacy_dir:
        _adopt_legacy(uid, legacy_dir)
    return login(email, password)


def login(email, password):
    email = (email or "").strip().lower()
    with _lock, _conn() as c:
        u = c.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not u or not _check(password or "", u["pw_hash"]):
            raise AuthError("E-mail ou mot de passe incorrect.")
        token = secrets.token_urlsafe(32)
        c.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
        c.execute("INSERT INTO sessions VALUES (?,?,?)", (token, u["id"], time.time() + SESSION_DAYS * 86400))
        return token, {"id": u["id"], "email": u["email"], "name": u["name"]}


def user_for(token):
    if not token:
        return None
    with _lock, _conn() as c:
        r = c.execute("SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id "
                      "WHERE s.token = ? AND s.expires > ?", (token, time.time())).fetchone()
        return dict(r) if r else None


def logout(token):
    with _lock, _conn() as c:
        c.execute("DELETE FROM sessions WHERE token = ?", (token,))


def has_users():
    with _lock, _conn() as c:
        return c.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0


# ---------------------------------------------------------------- projects
def list_projects(uid):
    with _lock, _conn() as c:
        rows = c.execute("SELECT id, name, updated, data FROM projects WHERE user_id = ? ORDER BY updated DESC", (uid,)).fetchall()
    out = []
    for r in rows:
        try:
            main = json.loads(r["data"]).get("main") or {}
        except Exception:
            main = {}
        out.append({"id": r["id"], "name": r["name"], "updated": r["updated"], "thumb": main.get("url") if isinstance(main, dict) else None})
    return out


def get_project(uid, pid):
    with _lock, _conn() as c:
        r = c.execute("SELECT data FROM projects WHERE user_id = ? AND id = ?", (uid, pid)).fetchone()
    return json.loads(r["data"]) if r else None


def save_project(uid, pid, data):
    name = str((data or {}).get("name") or "Projet sans titre")[:200]
    with _lock, _conn() as c:
        c.execute("INSERT INTO projects VALUES (?,?,?,?,?) ON CONFLICT(user_id, id) DO UPDATE SET "
                  "name = excluded.name, data = excluded.data, updated = excluded.updated",
                  (pid, uid, name, json.dumps(data, ensure_ascii=False), time.time()))


def delete_project(uid, pid):
    with _lock, _conn() as c:
        c.execute("DELETE FROM projects WHERE user_id = ? AND id = ?", (uid, pid))


# ---------------------------------------------------------------- per-user documents (styles, brands)
def get_doc(uid, key, default):
    with _lock, _conn() as c:
        r = c.execute("SELECT v FROM kv WHERE user_id = ? AND k = ?", (uid, key)).fetchone()
    return json.loads(r["v"]) if r else default


def set_doc(uid, key, value):
    with _lock, _conn() as c:
        c.execute("INSERT INTO kv VALUES (?,?,?) ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v",
                  (uid, key, json.dumps(value, ensure_ascii=False)))


def _adopt_legacy(uid, data_dir):
    """Give the very first account everything created before accounts existed."""
    pdir = os.path.join(data_dir, "projects")
    if os.path.isdir(pdir):
        for n in os.listdir(pdir):
            if n.endswith(".json"):
                try:
                    with open(os.path.join(pdir, n), encoding="utf-8") as f:
                        save_project(uid, n[:-5], json.load(f))
                except Exception:
                    pass
    for key, fn in (("styles", "styles.json"), ("brands", "brands.json")):
        fp = os.path.join(data_dir, fn)
        if os.path.exists(fp):
            try:
                with open(fp, encoding="utf-8") as f:
                    set_doc(uid, key, json.load(f))
            except Exception:
                pass
