import json
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

from ..config import SCHEMA_VERSION


def report_path(directory, match_id):
    if not re.fullmatch(r"[1-9][0-9]{0,19}", str(match_id)):
        raise ValueError("Invalid match ID")
    return Path(directory) / f"v{SCHEMA_VERSION}" / f"{match_id}.json"


def report_exists(directory, match_id):
    return report_path(directory, match_id).is_file()


def save_report(directory, report):
    target = report_path(directory, report["match_id"])
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with NamedTemporaryFile(mode="w", encoding="utf-8", dir=target.parent, delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(report, handle, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        temporary.replace(target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return target


def reports(directory):
    for path in sorted((Path(directory) / f"v{SCHEMA_VERSION}").glob("*.json")):
        with path.open(encoding="utf-8") as handle:
            report = json.load(handle)
        if report.get("schema_version") != SCHEMA_VERSION or str(report.get("match_id")) != path.stem:
            raise ValueError(f"Unexpected analysis record: {path.name}")
        yield report
