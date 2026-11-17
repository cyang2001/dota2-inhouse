from collections import Counter
from datetime import datetime
from hashlib import sha256
import hmac
import logging
from pathlib import Path
import struct
from zoneinfo import ZoneInfo

import gem
from gem.catalog.heroes import HEROES, hero_id
from gem.binary.stream import DemoStream
from gem.proto.demo_pb2 import CDemoFileInfo, DEM_FileInfo

from replay_spatial import summarize_spatial


ROOT = Path(__file__).resolve().parents[1]
REPLAY_DIR = Path(r"D:\SteamLibrary\steamapps\common\dota 2 beta\game\dota\replays")
PREFIX = "npc_dota_hero_"
SIDES = {2: "radiant", 3: "dire"}
ZONE = ZoneInfo("Europe/Paris")
DRAFT_HEROES = {entry["id"]: name.removeprefix(PREFIX) for name, entry in HEROES.items()}


def read_file_info(path):
    with path.open("rb") as replay:
        header = replay.read(12)
        if len(header) != 12 or header[:8] != b"PBDEMS2\0":
            raise ValueError("Not a Source 2 replay")
        offset = struct.unpack_from("<I", header, 8)[0]
    if not 16 <= offset < path.stat().st_size:
        raise ValueError("Replay file info is outside the file")
    with DemoStream(path) as stream:
        stream._pos = offset
        frame = stream._read_message()
        if frame is None or frame.msg_type != DEM_FileInfo:
            raise ValueError("Replay file info was not found")
        return CDemoFileInfo.FromString(frame.data).game_info.dota


def read_draft(info):
    picks = [(event.team, event.hero_id) for event in info.picks_bans if event.is_pick]
    roster = {(player.game_team, hero_id(player.hero_name)) for player in info.player_info if player.game_team in SIDES}
    if len(picks) != 10 or len(set(picks)) != 10 or set(picks) != roster:
        return None
    if any(event.team not in SIDES or event.hero_id <= 0 for event in info.picks_bans):
        return None
    return [{"action": "pick" if event.is_pick else "ban", "team": SIDES[event.team],
             "heroId": event.hero_id, "hero": DRAFT_HEROES.get(event.hero_id)} for event in info.picks_bans]


def summarize(path, identity_key):
    logging.disable(logging.CRITICAL)
    info = read_file_info(path)
    match = gem.parse(path)
    if not match.match_id or match.match_id != info.match_id or match.parse_error or match.truncated_at_tick is not None:
        raise ValueError(f"Incomplete replay for {path.name}")
    names = {
        (p.game_team, p.hero_name.removeprefix(PREFIX)): p.player_name
        for p in info.player_info if p.game_team in SIDES
    }
    players = sorted((p for p in match.players if p.team in SIDES), key=lambda p: (p.team, p.player_id))
    match_counts = Counter(p.team for p in players)
    if match_counts != {2: 5, 3: 5} or len({p.steam_id for p in players if p.steam_id > 0}) != 10:
        raise ValueError(f"Unverified 5v5 roster for {path.name}")
    local_saved = datetime.fromtimestamp(path.stat().st_mtime, ZONE)
    played = datetime.fromtimestamp(info.end_time, ZONE) if info.end_time else None
    if played and not 2013 <= played.year <= local_saved.year:
        played = None
    result = {
        "matchId": str(match.match_id),
        "gameMode": match.game_mode,
        "winner": "radiant" if match.radiant_win is True else "dire" if match.radiant_win is False else None,
        "duration": match.duration,
        "radiantScore": match.radiant_score,
        "direScore": match.dire_score,
        "savedDate": local_saved.date().isoformat(),
        "playedDate": played.date().isoformat() if played else None,
        "players": [],
    }
    draft = read_draft(info)
    if draft is not None:
        result["draft"] = draft
    for index, player in enumerate(players, 1):
        hero = player.hero_name.removeprefix(PREFIX)
        name = names.get((player.team, hero), "")
        player_key = hmac.new(identity_key, str(player.steam_id).encode("ascii"), sha256).hexdigest()[:32]
        result["players"].append({
            "id": player_key, "name": name if name.strip() else f"玩家 {index:02d}",
            "team": SIDES[player.team], "hero": hero,
            "kills": player.kills, "deaths": player.deaths, "assists": player.assists,
        })
    result["spatial"] = summarize_spatial(match, players, result["players"])
    return result
