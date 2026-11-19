import unittest
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from gem.proto.demo_pb2 import CDemoFileHeader, DEM_FileHeader

from dota_inhouse.analysis.spatial import MAP_SCALE, map_position
from dota_inhouse.parser.replay import replay_patch


class ReplayPatchTest(unittest.TestCase):
    def test_replay_header_selects_map_patch(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'test.dem'
            for build, expected in ((6979, '7.42'), (6980, None)):
                header = CDemoFileHeader(demo_file_stamp='PBDEMS2', game_directory=f'/opt/srcds/dota/dota_v{build}/dota').SerializeToString()
                path.write_bytes(b'PBDEMS2\0' + bytes(8) + bytes([DEM_FileHeader, 0, len(header)]) + header)
                self.assertEqual(replay_patch(path, datetime(2026, 11, 19)), expected)
                if expected is None:
                    self.assertEqual(replay_patch(path, datetime(2026, 11, 17)), '7.41')

    def test_new_map_center_and_fountains(self):
        self.assertEqual(map_position(16384, 16384, '7.42'), (8192, 8192))
        for (x, y), expected in (((-7456, -6938), (54, 444)), ((7152, 6592), (449, 78))):
            point = map_position(x + 16384, y + 16384, '7.42')
            self.assertEqual(tuple(round(p * 512 / MAP_SCALE) for p in point), expected)
        self.assertNotEqual(map_position(16384, 16384, '7.41'), (8192, 8192))
