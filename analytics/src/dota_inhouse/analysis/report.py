from collections import Counter
from dataclasses import asdict, dataclass
from importlib.metadata import version
from math import isfinite

import gem

from ..config import SCHEMA_VERSION, TEAMFIGHT_MIN_DEATHS, TEAMFIGHT_MIN_PLAYERS
from .player import Combat, Economy, Progression, combat, economy, progression, series


@dataclass(frozen=True)
class PlayerReport:
    id: str
    name: str
    team: str
    hero: str
    kills: int
    deaths: int
    assists: int
    economy: Economy
    combat: Combat
    progression: Progression
    vision: dict
    positions: list


@dataclass(frozen=True)
class MatchReport:
    schema_version: int
    parser_version: str
    match_id: str
    global_data: dict
    players: dict[str, PlayerReport]


def match_report(replay, lobby):
    match = replay.match
    summary = replay.summary
    player_ids = {p.player_id: identity["id"] for p, identity in zip(replay.players, summary["players"], strict=True)}
    sides = {p.player_id: p.team for p in replay.players}
    hero_counts = Counter(p.hero_name for p in replay.players)
    heroes = {p.hero_name: player_ids[p.player_id] for p in replay.players if hero_counts[p.hero_name] == 1}

    def seconds(tick):
        return match.game_clock.game_time_at(tick) if match.game_clock and tick is not None else None

    fights = []
    participation = Counter()
    for fight in match.fights:
        slots = [p.player_id for p in fight.players if p.player_id in player_ids and gem.is_active_fight_participant(p)]
        if fight.deaths < TEAMFIGHT_MIN_DEATHS or len(slots) < TEAMFIGHT_MIN_PLAYERS:
            continue
        participants = [player_ids[slot] for slot in slots]
        participation.update(participants)
        fights.append({"start_seconds": seconds(fight.start_tick), "end_seconds": seconds(fight.end_tick),
                       "deaths": fight.deaths, "winner": fight.winner, "players": participants})

    wards = []
    for ward in match.wards:
        placer = player_ids.get(ward.player_id) if sides.get(ward.player_id) == ward.team else None
        killer = heroes.get(ward.killer)
        wards.append({
            "kind": ward.ward_type, "team": {2: "radiant", 3: "dire"}.get(ward.team),
            "placer_id": placer, "killed_by_id": killer, "killer_unit": ward.killer or None,
            "placed_seconds": seconds(ward.tick), "killed_seconds": seconds(ward.killed_tick),
            "expires_seconds": seconds(ward.expires_tick), "x": ward.x, "y": ward.y,
        })

    players = {}
    for parsed, identity in zip(replay.players, summary["players"], strict=True):
        pid = identity["id"]
        team_kills = summary["radiantScore"] if identity["team"] == "radiant" else summary["direScore"]
        players[pid] = PlayerReport(
            **identity, economy=economy(parsed),
            combat=combat(parsed, team_kills, participation[pid], len(fights), seconds),
            progression=progression(parsed, seconds),
            vision={
                "observer_placed": parsed.obs_placed, "sentry_placed": parsed.sen_placed,
                "observer_kills": parsed.observer_kills, "sentry_kills": parsed.sentry_kills,
                "placements": [w for w in wards if w["placer_id"] == pid],
                "dewards": [w for w in wards if w["killed_by_id"] == pid],
            },
            positions=[{"tick": tick, "seconds": seconds(tick), "x": x, "y": y}
                       for tick, x, y in parsed.position_log if isfinite(x) and isfinite(y)],
        )
    global_data = {
        "game_mode": summary["gameMode"], "lobby_type": lobby["lobbyType"],
        "played_date": summary["playedDate"], "winner": summary["winner"], "duration": summary["duration"],
        "scores": {side: summary[f"{side}Score"] for side in ("radiant", "dire")},
        "draft": summary.get("draft"),
        "advantage": series(match.game_times_min, radiant_gold=match.radiant_gold_adv, radiant_xp=match.radiant_xp_adv),
        "vision": wards, "teamfights": fights,
        "teamfight_definition": {"min_deaths": TEAMFIGHT_MIN_DEATHS, "min_active_players": TEAMFIGHT_MIN_PLAYERS},
    }
    return asdict(MatchReport(SCHEMA_VERSION, version("gem-dota"), summary["matchId"], global_data, players))
