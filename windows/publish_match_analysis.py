import json
from collections import defaultdict
from hashlib import sha256
from urllib.request import Request, build_opener

from dota_inhouse.config import SCHEMA_VERSION
from dota_inhouse.analysis.spatial import map_position

from upload_replays import RejectRedirects


def report_patch(match):
    if match.get('patch'):
        return match['patch']
    date = match['played_date']
    return '7.41' if date and '2026-03-25' <= date < '2026-11-18' else None


def history_index(paths):
    history = defaultdict(list)
    for path in paths:
        report = json.loads(path.read_text(encoding="utf-8"))
        date = report["global_data"]["played_date"]
        if not date:
            continue
        for player in report["players"].values():
            history[report_patch(report['global_data']), player['hero']].append((date, player["economy"]["gpm"], player["economy"]["xpm"]))
    return history


def analysis_document(report, history=None):
    match = report["global_data"]
    patch = report_patch(match)
    players = {}
    for player_id, player in report["players"].items():
        positions = {}
        for sample in player["positions"]:
            seconds = sample["seconds"]
            if patch and seconds is not None and 0 <= seconds <= match['duration']:
                point = map_position(sample['x'], sample['y'], patch)
                if point is not None:
                    positions.setdefault(int(seconds // 10), [round(seconds, 1), *point])
        players[player_id] = {
            **{key: player[key] for key in ("economy", "combat", "progression")},
            "positions": list(positions.values()),
        }
        date = match["played_date"]
        if date and patch and history is not None:
            earlier = [entry for entry in history.get((patch, player['hero']), []) if entry[0] < date]
            benchmarks = {}
            for i, metric in enumerate(("gpm", "xpm"), start=1):
                samples = [entry[i] for entry in earlier if entry[i] is not None]
                current = player["economy"][metric]
                benchmarks[metric] = {"samples": len(samples), "average": round(sum(samples) / len(samples), 1) if samples else None,
                                      "percentile": round(100 * (sum(v < current for v in samples) + sum(v == current for v in samples) / 2)
                                                          / len(samples)) if samples and current is not None else None}
            players[player_id]["benchmarks"] = benchmarks
    return {"version": 1, "matchId": report["match_id"], "players": players,
            "advantage": match["advantage"], "vision": match["vision"], "fights": match["teamfights"]}


def publish_pending_analysis(db, archive, endpoint, token):
    db.execute("""CREATE TABLE IF NOT EXISTS analysis_uploads (
        endpoint TEXT NOT NULL, match_id TEXT NOT NULL, stamp TEXT NOT NULL,
        PRIMARY KEY (endpoint, match_id)
    )""")
    receipts = dict(db.execute("SELECT match_id, stamp FROM analysis_uploads WHERE endpoint = ?", (endpoint,)))
    dates = dict(db.execute("""SELECT uploads.match_id, json_extract(matches.summary, '$.playedDate')
        FROM uploads JOIN matches ON matches.id = uploads.match_id WHERE uploads.endpoint = ?""", (endpoint,)))
    client = build_opener(RejectRedirects())
    failed = False
    paths = sorted((archive / f"v{SCHEMA_VERSION}").glob("*.json"))
    pending = [path for path in paths if path.stem in dates]
    stamps = {path.stem: path.stat().st_mtime_ns for path in pending if path.is_file()}
    earlier = {}
    digest = sha256()
    for match_id in sorted(stamps, key=lambda mid: (dates[mid] or "", mid)):
        date = dates[match_id]
        if date:
            earlier.setdefault(date, digest.hexdigest())
            digest.update(f"{match_id}:{stamps[match_id]}\n".encode())
    history = None
    for path in pending:
        match_id = path.stem
        try:
            stamp = f"{path.stat().st_mtime_ns}:{earlier.get(dates[match_id], '')}"
            if receipts.get(match_id) == stamp:
                continue
            if history is None:
                history = history_index(pending)
            document = analysis_document(json.loads(path.read_text(encoding="utf-8")), history)
            if document["matchId"] != match_id:
                raise ValueError("Analysis archive ID does not match file name")
            url = f"{endpoint}/{match_id}/analysis"
            request = Request(url, data=json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode(),
                              method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                                      "User-Agent": "DotaInhouseUploader/1.0"})
            with client.open(request, timeout=15) as response:
                if json.load(response).get("matchId") != match_id:
                    raise ValueError("Server did not acknowledge analysis")
            with db:
                db.execute("INSERT OR REPLACE INTO analysis_uploads VALUES (?, ?, ?)", (endpoint, match_id, stamp))
            print(f"{match_id}: analysis published", flush=True)
        except (OSError, ValueError) as error:
            failed = True
            print(f"{match_id}: analysis upload will retry ({error})", flush=True)
    return failed
