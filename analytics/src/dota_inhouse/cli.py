import argparse
from concurrent.futures import ProcessPoolExecutor
from functools import partial
import json
import logging
from pathlib import Path
import sys

from gem.errors import ReplayDataError
from google.protobuf.message import DecodeError

from .analysis.report import match_report
from .dataset.archive import report_exists, reports, save_report
from .dataset.draft import draft_examples
from .dataset.queries import global_overview, player_profile
from .parser.lobby import verify_private_room
from .parser.replay import REPLAY_DIR, parse_replay, read_file_info


def ingest_replay(path, *, archive, identity_key, force, strict):
    try:
        before = path.stat()
        info = read_file_info(path)
        if not force and info.match_id and report_exists(archive, info.match_id):
            return "cached", None
        try:
            lobby = verify_private_room(path, info)
        except ValueError as error:
            if strict:
                raise
            return "skipped", f"{path.name}: {error}"
        replay = parse_replay(path, identity_key, info)
        if replay.summary["winner"] is None:
            raise ValueError("Replay has no verified winner")
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError("Replay changed while it was being read")
        output = save_report(archive, match_report(replay, lobby))
        return "written", f"{output.stem}: analysis archived"
    except (OSError, ValueError, ReplayDataError, DecodeError) as error:
        return "failed", f"{path.name}: {error}"


def save_batch(args):
    identity_key = args.identity_key.read_bytes()
    if len(identity_key) != 32:
        raise ValueError("The original player identity key must contain 32 bytes")
    files = args.replay or sorted(args.replays.glob("*.dem"))
    if not files:
        raise ValueError("No .dem files found")
    counts = {"written": 0, "cached": 0, "skipped": 0, "failed": 0}
    ingest = partial(ingest_replay, archive=args.archive, identity_key=identity_key, force=args.force, strict=bool(args.replay))
    with ProcessPoolExecutor(max_workers=args.workers, initializer=configure_logging) as pool:
        for status, message in pool.map(ingest, files):
            counts[status] += 1
            if message:
                print(message, file=sys.stderr, flush=True)
    print(json.dumps(counts))
    return int(counts["failed"] != 0)


def configure_logging():
    logging.getLogger("gem").setLevel(logging.ERROR)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Private Dota 2 replay analysis")
    parser.add_argument("--archive", type=Path, default=Path(".data/analytics"))
    commands = parser.add_subparsers(dest="command", required=True)
    ingest = commands.add_parser("ingest", help="build verified match reports from local .dem files")
    ingest.add_argument("--identity-key", type=Path, required=True)
    ingest.add_argument("--replays", type=Path, default=REPLAY_DIR)
    ingest.add_argument("--replay", type=Path, action="append")
    ingest.add_argument("--force", action="store_true")
    ingest.add_argument("--workers", type=int, choices=range(1, 9), default=1)
    commands.add_parser("overview")
    profile = commands.add_parser("player")
    profile.add_argument("player_id")
    commands.add_parser("export-draft", help="write draft decision examples as JSON Lines")
    args = parser.parse_args(argv)
    configure_logging()
    try:
        if args.command == "ingest":
            return save_batch(args)
        data = reports(args.archive)
        if args.command == "export-draft":
            for example in draft_examples(data):
                print(json.dumps(example, ensure_ascii=False, allow_nan=False))
        else:
            output = global_overview(data) if args.command == "overview" else player_profile(data, args.player_id)
            print(json.dumps(output, ensure_ascii=False, allow_nan=False))
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
