from collections import Counter, defaultdict


def player_profile(records, player_id):
    games = []
    hero_games = Counter()
    hero_wins = Counter()
    for record in records:
        player = record["players"].get(player_id)
        if player is None:
            continue
        match = record["global_data"]
        won = int(player["team"] == match["winner"])
        games.append({"match_id": record["match_id"], "played_date": match["played_date"], "won": bool(won), **player})
        hero_games[player["hero"]] += 1
        hero_wins[player["hero"]] += won
    if not games:
        raise ValueError("Player is absent from the analysis archive")
    games.sort(key=lambda row: (row["played_date"] or "", int(row["match_id"])), reverse=True)
    heroes = {hero: {"games": count, "wins": hero_wins[hero], "win_rate": hero_wins[hero] / count}
              for hero, count in hero_games.most_common()}
    coverage = {}
    for key in ("gpm", "xpm"):
        values = [value for row in games if (value := row["economy"][key]) is not None]
        coverage[key] = {"matches": len(values), "average": sum(values) / len(values) if values else None}
    return {"id": player_id, "name": games[0]["name"], "match_count": len(games),
            "heroes": heroes, "economy": coverage, "matches": games}


def global_overview(records):
    players = defaultdict(lambda: {"games": 0, "wins": 0})
    winners = Counter()
    counts = {"gpm": 0, "xpm": 0, "positions": 0, "ward_placements": 0,
              "ward_kills_attributed": 0, "teamfights": 0}
    for record in records:
        match = record["global_data"]
        winners[match["winner"]] += 1
        counts["ward_placements"] += len(match["vision"])
        counts["ward_kills_attributed"] += sum(w["killed_by_id"] is not None for w in match["vision"])
        counts["teamfights"] += len(match["teamfights"])
        for pid, player in record["players"].items():
            players[pid]["games"] += 1
            players[pid]["wins"] += int(player["team"] == match["winner"])
            counts["positions"] += len(player["positions"])
            for key in ("gpm", "xpm"):
                counts[key] += int(player["economy"][key] is not None)
    return {"matches": sum(winners.values()), "winner_counts": dict(winners),
            "players": dict(players), "coverage": counts}
