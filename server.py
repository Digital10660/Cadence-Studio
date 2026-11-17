# -*- coding: utf-8 -*-
"""
Cadence — local server for the video-editing studio.

  python server.py            -> http://localhost:8790 (opens the browser)

What it does:
  * serves the studio UI (app/) and the media library with HTTP Range support (smooth seeking);
  * stores uploads in library/, exports in exports/, brand kits and projects in data/;
  * transcribes speech with faster-whisper (word-level timestamps), in a background job;
  * lists the user's own sound-effect packs dropped in sfx/<category>/.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse
from http.cookies import SimpleCookie

import db

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, "app")
LIB = os.path.join(ROOT, "library")
EXP = os.path.join(ROOT, "exports")
SFX = os.path.join(ROOT, "sfx")
DATA = os.path.join(ROOT, "data")
LUTS = os.path.join(ROOT, "luts")
PORT = int(os.environ.get("CADENCE_PORT", "8790"))
SFX_CATEGORIES = ["whoosh", "swish", "pop", "click", "boom", "riser", "ding", "tick", "shutter", "glitch"]

for d in (LIB, EXP, SFX, DATA, LUTS, os.path.join(DATA, "projects")):
    os.makedirs(d, exist_ok=True)
for c in SFX_CATEGORIES:
    os.makedirs(os.path.join(SFX, c), exist_ok=True)

db.init(DATA)  # local accounts + projects (SQLite, offline)

# ---------------------------------------------------------------- ffmpeg
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:  # pragma: no cover
    FFMPEG = shutil.which("ffmpeg")

# ---------------------------------------------------------------- whisper models
HF_HUB = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")


def cached_models():
    out = []
    for name in ("tiny", "base", "small", "medium", "large-v3"):
        if os.path.isdir(os.path.join(HF_HUB, f"models--Systran--faster-whisper-{name}")):
            out.append(name)
    return out


if cached_models():
    # Work offline once a model is cached (avoids SSL/network surprises).
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

_models = {}
_model_lock = threading.Lock()


def get_model(name):
    with _model_lock:
        if name not in _models:
            try:
                import truststore
                truststore.inject_into_ssl()
            except Exception:
                pass
            from faster_whisper import WhisperModel
            _models[name] = WhisperModel(name, device="cpu", compute_type="int8")
        return _models[name]


# ---------------------------------------------------------------- helpers
def safe_name(name):
    base, ext = os.path.splitext(os.path.basename(name or "fichier"))
    base = re.sub(r"[^\w\-]+", "_", base, flags=re.UNICODE).strip("_")[:60] or "fichier"
    ext = re.sub(r"[^\w.]", "", ext)[:8].lower()
    return base + ext


def lib_path(file):
    p = os.path.normpath(os.path.join(LIB, os.path.basename(file)))
    if not p.startswith(LIB):
        raise ValueError("bad path")
    return p


def probe(path):
    """Duration, resolution, fps and audio presence from ffmpeg's banner."""
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", path], capture_output=True, text=True, errors="replace")
    s = r.stderr
    info = {"duration": 0.0, "width": 0, "height": 0, "fps": 0, "hasAudio": False, "hasVideo": False, "rotate": 0}
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", s)
    if m:
        info["duration"] = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    m = re.search(r"Stream #.*?Video:.*?(\d{2,5})x(\d{2,5})", s)
    if m and "attached pic" not in s[m.start():m.start() + 400]:
        info["hasVideo"] = True
        info["width"], info["height"] = int(m[1]), int(m[2])
    m = re.search(r"([\d.]+) fps", s)
    if m:
        info["fps"] = float(m[1])
    m = re.search(r"rotate\s*:\s*(-?\d+)", s) or re.search(r"rotation of (-?[\d.]+) degrees", s)
    if m:
        info["rotate"] = int(float(m[1]))
        if abs(info["rotate"]) in (90, 270):
            info["width"], info["height"] = info["height"], info["width"]
    info["hasAudio"] = bool(re.search(r"Stream #.*?Audio:", s))
    return info


def load_audio_16k(path):
    import numpy as np
    cmd = [FFMPEG, "-nostdin", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(out, np.int16).astype(np.float32) / 32768.0


JOBS = {}
_audio_locks = {}
_audio_guard = threading.Lock()


def extracted_audio(file):
    """Lossless 48 kHz stereo FLAC of a media file's sound (decoded reliably by the browser, no video data)."""
    src = lib_path(file)
    out = src + ".48k.flac"
    with _audio_guard:
        lock = _audio_locks.setdefault(out, threading.Lock())
    with lock:
        if not os.path.exists(out):
            tmp = out + ".tmp.flac"
            subprocess.run([FFMPEG, "-nostdin", "-v", "error", "-y", "-i", src, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "flac", tmp], check=True)
            os.replace(tmp, out)
    return out


def transcribe_job(job_id, file, lang, model_name):
    job = JOBS[job_id]
    try:
        path = lib_path(file)
        cache = f"{path}.{model_name}.{lang or 'auto'}.words.json"
        if os.path.exists(cache):
            with open(cache, encoding="utf-8") as f:
                job["result"] = json.load(f)
            job["progress"], job["status"] = 1.0, "done"
            return
        job["stage"] = "Lecture de l'audio"
        audio = load_audio_16k(path)
        dur = max(len(audio) / 16000.0, 0.1)
        job["stage"] = "Chargement du modèle"
        model = get_model(model_name)
        job["stage"] = "Transcription"
        segs, info = model.transcribe(
            audio, language=(lang or None), word_timestamps=True, beam_size=5,
            vad_filter=True, vad_parameters={"min_silence_duration_ms": 300},
            condition_on_previous_text=False,
        )
        words = []
        for seg in segs:
            job["progress"] = min(0.99, seg.end / dur)
            for w in seg.words or []:
                t = w.word.strip()
                if not t:
                    continue
                words.append({"w": t, "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
        result = {"language": info.language, "duration": dur, "words": words}
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
        job["result"], job["progress"], job["status"] = result, 1.0, "done"
    except Exception as e:  # pragma: no cover
        job["status"], job["error"] = "error", f"{type(e).__name__}: {e}"
        traceback.print_exc()


DEFAULT_BRANDS = [
    {"id": "cadence", "name": "Cadence (par défaut)", "primary": "#FF5A1F", "accent": "#FFD83D", "ink": "#0E0E10",
     "light": "#F6F4F0", "font": "Inter Tight", "display": "Inter Tight", "serif": "Instrument Serif", "caps": "Barlow Condensed", "logo": None},
    {"id": "dmcom", "name": "DM+ Com", "primary": "#D5252E", "accent": "#FFFFFF", "ink": "#111111",
     "light": "#F7F5F3", "font": "Inter", "display": "Montserrat", "serif": "Playfair Display", "caps": "Montserrat", "logo": None},
    {"id": "caeis", "name": "CAEIS", "primary": "#E69732", "accent": "#FCE6C3", "ink": "#141211",
     "light": "#FFFBF5", "font": "Montserrat", "display": "Montserrat", "serif": "Playfair Display", "caps": "Montserrat", "logo": None},
]


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
         ".m4v": "video/mp4", ".mkv": "video/x-matroska", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
         ".aac": "audio/aac", ".ogg": "audio/ogg", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2"}


class Handler(BaseHTTPRequestHandler):
    server_version = "Cadence/1.0"
    protocol_version = "HTTP/1.1"  # keep-alive: no abrupt socket close (Windows reset truncated big files)

    def log_message(self, fmt, *args):  # keep the console quiet
        pass

    # ---------- responses
    def send_json(self, obj, code=200, headers=None):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def send_file(self, path, cache=False):
        if not os.path.isfile(path):
            self.send_error(404)
            return
        size = os.path.getsize(path)
        ctype = TYPES.get(os.path.splitext(path)[1].lower(), "application/octet-stream")
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                if m[1]:
                    start = int(m[1])
                    end = int(m[2]) if m[2] else size - 1
                elif m[2]:
                    start = max(0, size - int(m[2]))
            end = min(end, size - 1)
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "max-age=3600" if cache else "no-store")
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)

    def read_body(self, dest=None):
        n = int(self.headers.get("Content-Length") or 0)
        if dest is None:
            return self.rfile.read(n) if n else b""
        with open(dest, "wb") as f:
            left = n
            while left > 0:
                chunk = self.rfile.read(min(1 << 20, left))
                if not chunk:
                    break
                f.write(chunk)
                left -= len(chunk)

    # ---------- accounts
    def token(self):
        c = SimpleCookie(self.headers.get("Cookie") or "")
        return c["cadence_session"].value if "cadence_session" in c else None

    def user(self):
        return db.user_for(self.token())

    @staticmethod
    def cookie(token, days=db.SESSION_DAYS):
        return {"Set-Cookie": f"cadence_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={days * 86400 if token else 0}"}

    def need_user(self):
        u = self.user()
        if not u:
            self.send_json({"error": "Connecte-toi pour continuer.", "auth": False}, 401)
        return u

    # ---------- routing
    def do_GET(self):
        try:
            u = urlparse(self.path)
            p, q = unquote(u.path), parse_qs(u.query)
            if p in ("/", "/index.html"):
                return self.send_file(os.path.join(APP, "index.html"))
            if p.startswith("/app/"):
                f = os.path.normpath(os.path.join(APP, p[5:]))
                return self.send_file(f) if f.startswith(APP) else self.send_error(403)
            if p.startswith("/media/"):
                return self.send_file(lib_path(p[7:]), cache=True)
            if p.startswith("/audio/"):
                return self.send_file(extracted_audio(p[7:]), cache=True)
            if p.startswith("/exports/"):
                f = os.path.normpath(os.path.join(EXP, os.path.basename(p[9:])))
                return self.send_file(f)
            if p.startswith("/sfx/"):
                f = os.path.normpath(os.path.join(SFX, p[5:]))
                return self.send_file(f, cache=True) if f.startswith(SFX) else self.send_error(403)
            if p == "/api/status":
                return self.send_json({"ok": True, "models": cached_models(), "ffmpeg": bool(FFMPEG)})
            if p == "/api/job":
                j = JOBS.get(q.get("id", [""])[0])
                return self.send_json(j or {"status": "error", "error": "job inconnu"})
            if p == "/api/sfx":
                out = {}
                for c in SFX_CATEGORIES:
                    d = os.path.join(SFX, c)
                    out[c] = [f"/sfx/{c}/{n}" for n in sorted(os.listdir(d)) if n.lower().endswith((".wav", ".mp3", ".ogg", ".m4a"))]
                return self.send_json(out)
            if p == "/api/auth/me":
                return self.send_json({"user": self.user(), "hasUsers": db.has_users()})
            if p == "/api/brands":
                u = self.need_user()
                return u and self.send_json(db.get_doc(u["id"], "brands", DEFAULT_BRANDS))
            if p == "/api/styles":
                u = self.need_user()
                return u and self.send_json(db.get_doc(u["id"], "styles", []))
            if p == "/api/luts":
                out = []
                for n in sorted(os.listdir(LUTS)):
                    if n.lower().endswith(".cube"):
                        title = os.path.splitext(n)[0].replace("_", " ").capitalize()
                        try:
                            with open(os.path.join(LUTS, n), encoding="utf-8", errors="replace") as fh:
                                for _ in range(5):
                                    ln = fh.readline()
                                    if ln.upper().startswith("TITLE"):
                                        title = ln.split(" ", 1)[1].strip().strip('"')
                        except Exception:
                            pass
                        out.append({"url": f"/luts/{n}", "name": title})
                return self.send_json(out)
            if p.startswith("/luts/"):
                f = os.path.normpath(os.path.join(LUTS, os.path.basename(p[6:])))
                return self.send_file(f, cache=True)
            if p == "/api/projects":
                u = self.need_user()
                return u and self.send_json(db.list_projects(u["id"]))
            if p == "/api/project":
                u = self.need_user()
                pid = re.sub(r"[^\w\-]", "", q.get("id", [""])[0])
                return u and self.send_json(db.get_project(u["id"], pid))
            self.send_error(404)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_json({"error": str(e)}, 500)
            except Exception:
                pass

    def do_POST(self):
        try:
            u = urlparse(self.path)
            p, q = unquote(u.path), parse_qs(u.query)
            if p in ("/api/auth/register", "/api/auth/login"):
                body = json.loads(self.read_body() or b"{}")
                try:
                    if p.endswith("register"):
                        token, user = db.register(body.get("email"), body.get("name"), body.get("password"), legacy_dir=DATA)
                    else:
                        token, user = db.login(body.get("email"), body.get("password"))
                except db.AuthError as e:
                    return self.send_json({"error": str(e)}, 400)
                return self.send_json({"user": user}, headers=self.cookie(token))
            if p == "/api/auth/logout":
                self.read_body()
                db.logout(self.token())
                return self.send_json({"ok": True}, headers=self.cookie("", 0))
            if p == "/api/upload":
                name = safe_name(q.get("name", ["fichier"])[0])
                file = f"{uuid.uuid4().hex[:8]}_{name}"
                dest = lib_path(file)
                self.read_body(dest)
                info = probe(dest) if os.path.splitext(name)[1].lower() not in (".png", ".jpg", ".jpeg", ".webp", ".ttf", ".otf", ".woff", ".woff2", ".svg") else {}
                return self.send_json({"file": file, "url": f"/media/{file}", "name": name, **info})
            if p == "/api/transcribe":
                body = json.loads(self.read_body() or b"{}")
                models = cached_models()
                model = body.get("model") or ("medium" if "medium" in models else (models[-1] if models else "small"))
                jid = uuid.uuid4().hex[:10]
                JOBS[jid] = {"status": "running", "progress": 0.0, "stage": "Démarrage", "result": None, "error": None, "model": model}
                threading.Thread(target=transcribe_job, args=(jid, body["file"], body.get("lang") or "fr", model), daemon=True).start()
                return self.send_json({"job": jid, "model": model})
            if p == "/api/export":
                name = safe_name(q.get("name", ["video.mp4"])[0])
                if not name.lower().endswith(".mp4"):
                    name += ".mp4"
                dest = os.path.join(EXP, name)
                self.read_body(dest)
                return self.send_json({"path": dest, "url": f"/exports/{name}", "name": name})
            if p == "/api/styles":
                body = json.loads(self.read_body() or b"[]")
                u = self.need_user()
                if u:
                    db.set_doc(u["id"], "styles", body)
                    return self.send_json({"ok": True})
                return
            if p == "/api/lut":  # import a .cube into the LUT library
                name = safe_name(q.get("name", ["mon_lut.cube"])[0])
                if not name.lower().endswith(".cube"):
                    name += ".cube"
                self.read_body(os.path.join(LUTS, name))
                return self.send_json({"url": f"/luts/{name}", "name": os.path.splitext(name)[0].replace("_", " ")})
            if p == "/api/brands":
                body = json.loads(self.read_body() or b"[]")
                u = self.need_user()
                if u:
                    db.set_doc(u["id"], "brands", body)
                    return self.send_json({"ok": True})
                return
            if p == "/api/project":
                body = json.loads(self.read_body() or b"{}")
                u = self.need_user()
                if not u:
                    return
                pid = re.sub(r"[^\w\-]", "", q.get("id", [""])[0]) or uuid.uuid4().hex[:10]
                if q.get("delete"):
                    db.delete_project(u["id"], pid)
                else:
                    db.save_project(u["id"], pid, body)
                return self.send_json({"ok": True, "id": pid})
            if p == "/api/open":
                what = q.get("what", ["exports"])[0]
                target = {"exports": EXP, "sfx": SFX, "library": LIB}.get(what, EXP)
                if sys.platform.startswith("win"):
                    os.startfile(target)  # noqa
                return self.send_json({"ok": True, "path": target})
            self.send_error(404)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_json({"error": str(e)}, 500)
            except Exception:
                pass


class Server(ThreadingHTTPServer):
    request_queue_size = 128  # a <video> element opens many range requests at once
    daemon_threads = True


def main():
    srv = Server(("127.0.0.1", PORT), Handler)
    srv.daemon_threads = True
    url = f"http://127.0.0.1:{PORT}"
    print(f"Cadence est lancé : {url}")
    print("Ferme cette fenêtre pour arrêter le studio.")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
