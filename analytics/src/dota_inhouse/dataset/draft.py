def draft_examples(records):
    """Yield one example per draft decision, with outcome kept as a separate label."""
    ordered = sorted(records, key=lambda row: (row["global_data"]["played_date"] or "", int(row["match_id"])))
    for record in ordered:
        match = record["global_data"]
        if not match["draft"] or not match["played_date"]:
            continue
        prefix = []
        for step, event in enumerate(match["draft"], 1):
            yield {
                "match_id": record["match_id"], "played_date": match["played_date"], "step": step,
                "features": {"game_mode": match["game_mode"], "history": prefix.copy(),
                             "on_turn": event["team"], "action": event["action"]},
                "labels": {"hero_id": event["heroId"], "winner": match["winner"]},
            }
            prefix.append(event)
