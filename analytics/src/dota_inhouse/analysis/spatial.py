from collections import Counter
from math import floor, isfinite

from gem.catalog.map import MAP_XMAX, MAP_XMIN, MAP_YMAX, MAP_YMIN


GRID_SIZE = 36
ACTIVITY_INTERVAL = 5
MAP_SCALE = 16383
# The replay cell origin is 16384. Valve's 7.42 overview spans 1024 logical
# pixels at 18.5 world units/pixel, from Hammer (-9472, +9472).
MAP_BOUNDS = {'7.41': (MAP_XMIN, MAP_XMAX, MAP_YMIN, MAP_YMAX),
              '7.42': (6912, 25856, 6912, 25856)}


def grid_cell(x, y, patch='7.41'):
    if x is None or y is None or not isfinite(x) or not isfinite(y):
        return None
    xmin, xmax, ymin, ymax = MAP_BOUNDS[patch]
    col = floor((x - xmin) * GRID_SIZE / (xmax - xmin))
    row = floor((ymax - y) * GRID_SIZE / (ymax - ymin))
    if 0 <= row < GRID_SIZE and 0 <= col < GRID_SIZE:
        return row * GRID_SIZE + col
    return None


def map_position(x, y, patch='7.41'):
    if grid_cell(x, y, patch) is None:
        return None
    xmin, xmax, ymin, ymax = MAP_BOUNDS[patch]
    return (round((x - xmin) * MAP_SCALE / (xmax - xmin)),
            round((ymax - y) * MAP_SCALE / (ymax - ymin)))


def activity_cells(match, player, patch):
    if match.game_clock is None:
        return None
    cells = Counter()
    last_bucket = -1
    for tick, x, y in player.position_log:
        seconds = match.game_clock.game_time_at(tick)
        if seconds is None or not 0 <= seconds <= match.duration:
            continue
        bucket = int(seconds // ACTIVITY_INTERVAL)
        cell = grid_cell(x, y, patch)
        if cell is not None and bucket > last_bucket:
            cells[cell] += 1
            last_bucket = bucket
    return sorted(cells.items()) if cells else None


def summarize_spatial(match, players, public_players, patch='7.41'):
    owners = {p.player_id: (p, public["id"]) for p, public in zip(players, public_players, strict=True)}
    wards = {public["id"]: {"observer": Counter(), "sentry": Counter()} for public in public_players}
    unattributed = {"observer": 0, "sentry": 0}
    events = []
    for ward in match.wards:
        if ward.ward_type not in unattributed:
            continue
        owner = owners.get(ward.player_id)
        cell = grid_cell(ward.x, ward.y, patch)
        player_id = owner[1] if owner is not None and owner[0].team == ward.team else None
        if cell is None or player_id is None:
            unattributed[ward.ward_type] += 1
        else:
            wards[player_id][ward.ward_type][cell] += 1
        if cell is not None:
            x, y = map_position(ward.x, ward.y, patch)
            seconds = match.game_clock.game_time_at(ward.tick) if match.game_clock is not None else None
            events.append([ward.ward_type, ward.team if ward.team in (2, 3) else None,
                           player_id, floor(seconds) if seconds is not None else None, x, y])

    return {
        "version": 2,
        "unattributedWards": unattributed,
        "wardEvents": events,
        "players": {
            public_id: {
                "activity": activity_cells(match, player, patch),
                **{kind: sorted(cells.items()) for kind, cells in wards[public_id].items()},
            }
            for player, public_id in owners.values()
        },
    }
