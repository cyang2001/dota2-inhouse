import json
from collections import Counter
from hashlib import sha256
import hmac
import os
from pathlib import Path
import sys

from gem.extractors._cells import od_cell_index
from gem.extractors.lane import lane_for_cell
from dota_inhouse.config import SCHEMA_VERSION


def account_links():
    config = os.environ.get("DOTA_STEAM_ACCOUNT_MAP")
    if not config:
        return {}
    groups = json.loads(Path(config).read_text(encoding="utf-8-sig"))
    if not isinstance(groups, dict) or any(not isinstance(alts, list) for alts in groups.values()):
        raise ValueError("Expected a SteamID-to-alt-list object")
    ids = [*groups, *(alt for alts in groups.values() for alt in alts)]
    if any(not isinstance(value, str) or not value.isascii() or not value.isdecimal() or
           not 76561197960265728 < int(value) <= 76561202255233023 for value in ids) or len(set(ids)) != len(ids):
        raise ValueError("Each SteamID64 must be a unique string")
    key = Path(os.environ["DOTA_SNAPSHOT_IDENTITY_KEY"]).read_bytes()
    if len(key) != 32:
        raise ValueError("Invalid replay identity key length")

    def public_id(steam_id):
        return hmac.new(key, steam_id.encode("ascii"), sha256).hexdigest()[:32]

    return {public_id(alt): public_id(main) for main, alts in groups.items() for alt in alts}


def infer_lane(positions):
    counts = Counter()
    sampled = set()
    for point in positions:
        time = point["seconds"]
        if time is None or not 60 <= time < 480 or int(time) in sampled:
            continue
        sampled.add(int(time))
        lane = lane_for_cell(od_cell_index(point["x"]), od_cell_index(point["y"]))
        if lane is not None:
            counts[lane] += 1
    if counts and len(sampled) >= 60:
        lane, hits = counts.most_common(1)[0]
        if lane in (1, 2, 3) and hits / len(sampled) >= 0.55:
            return lane
    return None


def match_metrics(report):
    values = {}
    net_worth = {}
    lanes = {}
    for player_id, player in report["players"].items():
        economy = player["economy"]
        at_ten = next((row for row in economy["timeline"] if row["seconds"] == 600), {})
        values[player_id] = {"gpm": economy["gpm"], "xpm": economy["xpm"], "lastHits10": at_ten.get("last_hits")}
        net_worth[player_id] = at_ten.get("net_worth")
        lanes[player_id] = infer_lane(player["positions"])
    for lane in (1, 2, 3):
        teams = {side: [pid for pid, p in report["players"].items() if p["team"] == side and lanes[pid] == lane]
                 for side in ("radiant", "dire")}
        radiant, dire = teams.values()
        if radiant and len(radiant) == len(dire) and all(net_worth[pid] is not None for pid in radiant + dire):
            difference = sum(net_worth[pid] for pid in radiant) - sum(net_worth[pid] for pid in dire)
            for pid in radiant + dire:
                value = difference if pid in radiant else -difference
                values[pid]["laneWin"] = int(value > 0)
    return values


def archive_metrics():
    archive = os.environ.get("DOTA_SNAPSHOT_ARCHIVE")
    if not archive:
        return {}
    return {path.stem: match_metrics(json.loads(path.read_text(encoding="utf-8")))
            for path in (Path(archive) / f"v{SCHEMA_VERSION}").glob("*.json")}


if __name__ == "__main__":
    if sys.argv[1] == "accounts":
        archive = os.environ.get("DOTA_SNAPSHOT_ARCHIVE")
        stamps = [] if not archive else [(p.stem, str(p.stat().st_mtime_ns))
                                         for p in sorted((Path(archive) / f"v{SCHEMA_VERSION}").glob("*.json"))]
        result = {"links": account_links(), "archiveRevision": sha256(json.dumps(stamps).encode()).hexdigest()}
    else:
        result = archive_metrics()
    print(json.dumps(result, separators=(",", ":")))
