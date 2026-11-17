import argparse
from collections import Counter
import json
import os
import secrets
from pathlib import Path
import sqlite3
import time
from urllib.parse import urlsplit

from gem.binary.packet import read_inner_messages
from gem.binary.stream import DemoStream
from gem.errors import ReplayDataError
from gem.proto.demo_pb2 import CDemoFullPacket, CDemoPacket, DEM_FullPacket, DEM_Packet, DEM_SignonPacket
from gem.proto.dota_gcmessages_common_lobby_pb2 import CSODOTALobby
from gem.proto.dota_gcmessages_common_pb2 import CMsgDOTAMatch
from gem.proto.dota_usermessages_pb2 import DOTA_UM_MatchDetails
from gem.proto.netmessages_pb2 import CSVCMsg_UserMessage, svc_UserMessage
from google.protobuf.message import DecodeError

from build_preview import write_preview
from read_replays import REPLAY_DIR, ROOT, read_file_info, summarize
from upload_replays import upload_pending


def read_lobby_type(path, match_id):
    lobby_type = None
    with DemoStream(path) as stream:
        for _, command, payload in stream:
            if command in {DEM_Packet, DEM_SignonPacket}:
                packet = CDemoPacket.FromString(payload)
            elif command == DEM_FullPacket:
                packet = CDemoFullPacket.FromString(payload).packet
            else:
                continue
            for msg_type, body in read_inner_messages(packet.data):
                if msg_type == svc_UserMessage:
                    wrapped = CSVCMsg_UserMessage.FromString(body)
                    msg_type, body = wrapped.msg_type, wrapped.msg_data
                if msg_type == DOTA_UM_MatchDetails:
                    info = CMsgDOTAMatch.FromString(body)
                    if info.match_id == match_id and info.HasField("lobby_type"):
                        lobby_type = info.lobby_type
    if lobby_type is None:
        raise ValueError("Replay has no verified postgame lobby type")
    return lobby_type


def replay_fields(info, lobby_type):
    teams = Counter(player.game_team for player in info.player_info if player.steamid and not player.is_fake_client)
    return {
        "matchId": str(info.match_id),
        "lobbyType": lobby_type,
        "radiantPlayers": teams[2],
        "direPlayers": teams[3],
    }


def fingerprint(path):
    info = path.stat()
    return info.st_size, info.st_mtime_ns


def import_file(db, path, signature, identity_key):
    source = (str(path), *signature)
    if db.execute("SELECT 1 FROM checked_files WHERE path = ? AND size = ? AND modified = ?", source).fetchone():
        return None
    info = read_file_info(path)
    match_id = info.match_id
    if not match_id:
        raise ValueError("Replay has no match ID")
    existing = db.execute("SELECT 1 FROM matches WHERE id = ?", (str(match_id),)).fetchone()
    match = None
    if not existing:
        replay = replay_fields(info, read_lobby_type(path, match_id))
        if replay["lobbyType"] == CSODOTALobby.PRACTICE and replay["radiantPlayers"] == replay["direPlayers"] == 5:
            match = summarize(path, identity_key)
            if match["matchId"] != str(match_id) or not match["winner"]:
                raise ValueError("Replay has no verified winner")
            match["category"] = "inhouse"
            match["replay"] = replay
    if signature != fingerprint(path):
        raise ValueError("Replay changed while it was being read")
    with db:
        added = False
        if match:
            added = db.execute(
                "INSERT OR IGNORE INTO matches(id, summary) VALUES (?, ?)",
                (str(match_id), json.dumps(match, ensure_ascii=False)),
            ).rowcount == 1
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
                status = import_file(db, path, signature, identity_key)
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
        time.sleep(options.poll)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--replays", type=Path, default=REPLAY_DIR)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--identity-key", type=Path, default=ROOT / ".data" / "player-id.key")
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--upload-url", help="The website's /api/matches endpoint")
    parser.add_argument("--poll", type=float, default=2)
    parser.add_argument("--settle", type=float, default=8)
    parser.add_argument("--run-for", type=float, help="Stop after this many seconds of watching")
    options = parser.parse_args()
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
