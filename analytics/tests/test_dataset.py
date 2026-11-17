from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from dota_inhouse.analysis.player import ratio, series
from dota_inhouse.dataset.archive import reports, save_report
from dota_inhouse.dataset.draft import draft_examples
from dota_inhouse.dataset.queries import global_overview, player_profile


class DatasetTests(unittest.TestCase):
    def record(self):
        return {
            "schema_version": 1, "match_id": "1001",
            "global_data": {
                "played_date": "2026-11-17", "winner": "radiant", "game_mode": 2,
                "draft": [{"action": "ban", "team": "dire", "heroId": 1},
                          {"action": "pick", "team": "radiant", "heroId": 2}],
                "vision": [], "teamfights": [],
            },
            "players": {
                "sample": {"name": "Synthetic", "team": "radiant", "hero": "axe",
                           "economy": {"gpm": 430, "xpm": None}, "positions": []},
            },
        }

    def test_archive_is_versioned_and_idempotent(self):
        with TemporaryDirectory() as directory:
            row = self.record()
            self.assertEqual(save_report(directory, row), Path(directory) / "v1/1001.json")
            save_report(directory, row)
            self.assertEqual(list(reports(directory)), [row])
            self.assertEqual(global_overview(reports(directory))["matches"], 1)

    def test_profile_and_missing_values(self):
        profile = player_profile([self.record()], "sample")
        self.assertEqual(profile["heroes"]["axe"]["wins"], 1)
        self.assertEqual(profile["economy"]["xpm"], {"matches": 0, "average": None})
        self.assertEqual(series([0, 60], gold=[20])[1], {"seconds": 60, "gold": None})
        self.assertIsNone(ratio(0, 0))

    def test_draft_prefix_never_includes_the_target_or_the_outcome(self):
        first, second = list(draft_examples([self.record()]))
        self.assertEqual(first["features"]["history"], [])
        self.assertEqual(second["features"]["history"][0]["heroId"], 1)
        self.assertNotIn("winner", second["features"])
        self.assertEqual(second["labels"]["hero_id"], 2)
