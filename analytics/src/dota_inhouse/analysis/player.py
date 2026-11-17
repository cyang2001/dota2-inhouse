from dataclasses import dataclass


def series(times, **columns):
    return [
        {"seconds": time, **{key: values[i] if i < len(values) else None for key, values in columns.items()}}
        for i, time in enumerate(times)
    ]


def ratio(numerator, denominator):
    return numerator / denominator if denominator else None


@dataclass(frozen=True)
class Economy:
    gpm: int | None
    xpm: int | None
    last_hits: int
    denies: int
    net_worth: int
    timeline: list


def economy(player):
    return Economy(
        gpm=player.gold_per_min or None, xpm=player.xp_per_min or None,
        last_hits=player.last_hits, denies=player.denies, net_worth=player.net_worth,
        timeline=series(
            player.game_times_min, gold=player.gold_t_min,
            earned_gold=player.total_earned_gold_t_min, earned_xp=player.total_earned_xp_t_min,
            xp=player.xp_t_min, net_worth=player.net_worth_t_min,
            last_hits=player.lh_t_min, denies=player.dn_t_min,
        ),
    )


@dataclass(frozen=True)
class Combat:
    hero_damage: int
    tower_damage: int
    hero_healing: int
    damage_by_target: dict
    healing_by_target: dict
    hero_kills: list
    kill_participation: float | None
    fights_joined: int
    fights_total: int
    fight_participation: float | None


def combat(player, team_kills, fights_joined, fights, game_seconds):
    return Combat(
        hero_damage=player.hero_damage, tower_damage=player.tower_damage, hero_healing=player.hero_healing,
        damage_by_target=player.damage, healing_by_target=player.healing,
        hero_kills=[{"seconds": game_seconds(e.tick), "tick": e.tick, "target": e.target_name,
                     "source": e.damage_source_name or e.attacker_name}
                    for e in player.kills_log if e.target_is_hero and not e.target_is_illusion and not e.will_reincarnate],
        kill_participation=ratio(player.kills + player.assists, team_kills),
        fights_joined=fights_joined, fights_total=fights,
        fight_participation=ratio(fights_joined, fights),
    )


@dataclass(frozen=True)
class Progression:
    purchases: list
    final_items: dict
    ability_upgrade_ids: list
    ability_uses: dict
    rune_pickups: list


def progression(player, game_seconds):
    return Progression(
        purchases=[{"seconds": game_seconds(e.tick), "tick": e.tick, "item": e.value_name or None}
                   for e in player.purchase_log],
        final_items=player.final_items,
        ability_upgrade_ids=player.ability_upgrades_arr,
        ability_uses=player.ability_uses,
        rune_pickups=[{"seconds": game_seconds(e.tick), "tick": e.tick, "rune_id": e.rune_type}
                      for e in player.runes_log],
    )
