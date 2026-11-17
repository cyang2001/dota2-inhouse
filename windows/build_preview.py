import base64
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / ".data"
HERO_LIST = "https://www.dota2.com/datafeed/herolist?language=schinese"
PORTRAITS = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes"
PREFIX = "npc_dota_hero_"


def get_portraits(keys):
    with urlopen(HERO_LIST, timeout=12) as response:
        data = json.load(response)["result"]["data"]["heroes"]
    names = {row["name"].removeprefix(PREFIX): row["name_loc"] for row in data}

    def get_portrait(key):
        img = None
        try:
            with urlopen(f"{PORTRAITS}/{key}.png", timeout=12) as response:
                contents = response.read(512_000)
                if contents.startswith(b"\x89PNG\r\n\x1a\n") and len(contents) < 512_000:
                    img = "data:image/png;base64," + base64.b64encode(contents).decode("ascii")
        except (HTTPError, URLError, TimeoutError) as exc:
            print(f"Thumbnail unavailable for {key}: {exc}")
        return key, {"name": names.get(key, key.replace("_", " ")), "image": img}

    with ThreadPoolExecutor(max_workers=5) as pool:
        return dict(pool.map(get_portrait, keys))


def write_preview(matches, output):
    hero_path = WORK / "preview-heroes.json"
    heroes = json.loads(hero_path.read_text(encoding="utf-8")) if hero_path.exists() else {}
    hero_keys = {player["hero"] for match in matches for player in match["players"]}
    missing = sorted(hero_keys - heroes.keys())
    if missing:
        heroes.update(get_portraits(missing))
        WORK.mkdir(exist_ok=True)
        hero_path.write_text(json.dumps(heroes, ensure_ascii=False), encoding="utf-8")
    used_heroes = {key: heroes[key] for key in sorted(hero_keys)}
    print(f"Loaded {sum(bool(hero['image']) for hero in used_heroes.values())}/{len(used_heroes)} hero portraits")
    payload = json.dumps({"matches": matches, "heroes": used_heroes}, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    template = (Path(__file__).parent / "preview.html").read_text(encoding="utf-8")
    assert template.count("__PREVIEW_DATA__") == 1
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".tmp")
    temporary.write_text(template.replace("__PREVIEW_DATA__", payload), encoding="utf-8")
    temporary.replace(output)
    print(f"Built {output.name}, {output.stat().st_size} bytes")
