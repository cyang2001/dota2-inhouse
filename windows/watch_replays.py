import argparse
import json
import logging
import os
import secrets
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
from urllib.parse import urlsplit

from gem.errors import ReplayDataError
from google.protobuf.message import DecodeError

from dota_inhouse.parser.lobby import private_roster, read_lobby_type, replay_fields
from dota_inhouse.parser.replay import parse_replay, web_summary
from dota_inhouse.analysis.report import match_report
from dota_inhouse.dataset.archive import report_exists, save_report

from build_preview import write_preview
from read_replays import REPLAY_DIR, ROOT, read_file_info
from upload_replays import upload_pending
from publish_match_analysis import publish_pending_analysis


def fingerprint(path):
    info = path.stat()
    return info.st_size, info.st_mtime_ns


def import_file(db, path, signature, identity_key, analytics_dir=None):
    source = (str(path), *signature)
    if db.execute("SELECT 1 FROM checked_files WHERE path = ? AND size = ? AND modified = ?", source).fetchone():
        return None
    info = read_file_info(path)
    match_id = info.match_id
    if not match_id:
        raise ValueError("Replay has no match ID")
    existing = db.execute("SELECT 1 FROM matches WHERE id = ?", (str(match_id),)).fetchone()
    match = None
    parsed = None
    needs_report = analytics_dir is not None and not report_exists(analytics_dir, match_id)
    if not existing or needs_report:
        lobby = replay_fields(info, read_lobby_type(path, match_id))
        if private_roster(lobby):
            parsed = parse_replay(path, identity_key, info)
            if not parsed.summary["winner"]:
                raise ValueError("Replay has no verified winner")
            if not existing:
                match = {**web_summary(parsed), "category": "inhouse", "replay": lobby}
    if signature != fingerprint(path):
        raise ValueError("Replay changed while it was being read")
    added = False
    if match:
        with db:
            added = db.execute(
                "INSERT OR IGNORE INTO matches(id, summary) VALUES (?, ?)",
                (str(match_id), json.dumps(match, ensure_ascii=False)),
            ).rowcount == 1
    if parsed is not None and needs_report:
        save_report(analytics_dir, match_report(parsed, lobby))
    with db:
        db.execute("INSERT OR REPLACE INTO checked_files(path, size, modified) VALUES (?, ?, ?)", source)
    return "imported" if added else "duplicate" if (match or existing) else "skipped (not a private 5v5)"


def publish_local(db, output):
    matches = [json.loads(row[0]) for row in db.execute("SELECT summary FROM matches ORDER BY length(id) DESC, id DESC")]
    if matches:
        write_preview(matches, output)


def retry_uploads(db, options, token, next_try):
    if options.upload_url and time.monotonic() >= next_try:
        if upload_pending(db, options.upload_url, token):
            return time.monotonic() + 30
        return 0
    return next_try


def watch(db, options, identity_key, token):
    observed = {}
    failed_until = {}
    deadline = time.monotonic() + options.run_for if options.run_for else float("inf")
    pending_preview = options.preview is not None
    upload_after = 0
    snapshot_after = 0
    analysis_after = 0
    print(f"Watching {options.replays}", flush=True)
    while time.monotonic() < deadline:
        upload_after = retry_uploads(db, options, token, upload_after)
        current_paths = set(options.replays.glob("*.dem"))
        for path in sorted(current_paths):
            try:
                signature = fingerprint(path)
                now = time.monotonic()
                last_signature, stable_since = observed.get(path, (None, now))
                if signature != last_signature:
                    observed[path] = (signature, now)
                    failed_until.pop(path, None)
                    continue
                if now - stable_since < options.settle or now < failed_until.get(path, 0):
                    continue
                status = import_file(db, path, signature, identity_key, options.analytics_dir)
                if status:
                    print(f"{path.name}: {status}", flush=True)
                    pending_preview |= status == "imported" and options.preview is not None
                    upload_after = retry_uploads(db, options, token, upload_after)
            except FileNotFoundError:
                continue
            except (OSError, ValueError, ReplayDataError, DecodeError) as exc:
                failed_until[path] = time.monotonic() + 30
                print(f"{path.name}: will retry ({exc})", flush=True)
        observed = {path: state for path, state in observed.items() if path in current_paths}
        failed_until = {path: retry for path, retry in failed_until.items() if path in current_paths}
        if pending_preview:
            try:
                publish_local(db, options.preview)
                pending_preview = False
            except OSError as exc:
                print(f"Preview update will retry ({exc})", flush=True)
        if options.snapshot_script and time.monotonic() >= snapshot_after:
            snapshot_after = time.monotonic() + 60
            try:
                snapshot_env = {**os.environ, "DOTA_SNAPSHOT_PYTHON": sys.executable,
                                "DOTA_SNAPSHOT_INPUTS": str(Path(__file__).with_name("profile_snapshot_inputs.py")),
                                "DOTA_SNAPSHOT_IDENTITY_KEY": str(options.identity_key)}
                if options.account_map:
                    snapshot_env["DOTA_STEAM_ACCOUNT_MAP"] = str(options.account_map)
                if options.analytics_dir:
                    snapshot_env["DOTA_SNAPSHOT_ARCHIVE"] = str(options.analytics_dir)
                subprocess.run([options.node, str(options.snapshot_script), options.upload_url],
                               check=True, timeout=55, env=snapshot_env)
            except (OSError, subprocess.SubprocessError) as exc:
                print(f"Display snapshot will retry ({type(exc).__name__})", flush=True)
        if options.publish_analysis and time.monotonic() >= analysis_after:
            analysis_after = time.monotonic() + 60
            publish_pending_analysis(db, options.analytics_dir, options.upload_url, token)
        time.sleep(options.poll)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--replays", type=Path, default=REPLAY_DIR)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--identity-key", type=Path, default=ROOT / ".data" / "player-id.key")
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--analytics-dir", type=Path, help="Store full offline replay reports here")
    parser.add_argument("--account-map", type=Path, help="Private SteamID64 mapping for snapshot aggregation")
    parser.add_argument("--publish-analysis", action="store_true", help="Publish match analysis from the local reports")
    parser.add_argument("--snapshot-script", type=Path, help="Publish locally computed website statistics")
    parser.add_argument("--node", default="node", help="Node executable for the display snapshot publisher")
    parser.add_argument("--upload-url", help="The website's /api/matches endpoint")
    parser.add_argument("--poll", type=float, default=2)
    parser.add_argument("--settle", type=float, default=8)
    parser.add_argument("--run-for", type=float, help="Stop after this many seconds of watching")
    options = parser.parse_args()
    if options.publish_analysis and (not options.analytics_dir or not options.upload_url):
        parser.error("--publish-analysis requires --analytics-dir and --upload-url")
    if options.snapshot_script and (not options.upload_url or not options.snapshot_script.is_file()):
        parser.error("--snapshot-script requires an existing script and --upload-url")
    logging.getLogger("gem").setLevel(logging.ERROR)
    if not options.replays.is_dir() or options.poll <= 0 or options.settle <= 0 or (options.run_for is not None and options.run_for <= 0):
        parser.error("Use an existing replay directory and positive timings")
    token = os.environ.get("DOTA_UPLOAD_TOKEN")
    if options.upload_url:
        endpoint = urlsplit(options.upload_url)
        if (not endpoint.hostname or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment or
                endpoint.path != "/api/matches" or (endpoint.scheme != "https" and
                (endpoint.scheme != "http" or endpoint.hostname not in {"127.0.0.1", "localhost", "::1"}))):
            parser.error("Use an HTTPS /api/matches URL or a loopback test URL")
        if not token:
            parser.error("Set DOTA_UPLOAD_TOKEN before starting the uploader")
    options.identity_key.parent.mkdir(parents=True, exist_ok=True)
    try:
        with options.identity_key.open("xb") as key_file:
            key_file.write(secrets.token_bytes(32))
    except FileExistsError:
        pass
    identity_key = options.identity_key.read_bytes()
    if len(identity_key) != 32:
        parser.error("The identity key must contain 32 bytes")
    options.database.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(options.database)
    try:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, summary TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS checked_files(path TEXT PRIMARY KEY, size INTEGER NOT NULL, modified INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS uploads(endpoint TEXT NOT NULL, match_id TEXT NOT NULL, PRIMARY KEY(endpoint, match_id));
        """)
        watch(db, options, identity_key, token)
    except KeyboardInterrupt:
        pass
    finally:
        db.close()
