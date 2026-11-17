import json
from urllib.request import HTTPRedirectHandler, Request, build_opener


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def upload_pending(db, endpoint, token):
    pending = db.execute(
        "SELECT id, summary FROM matches WHERE json_type(summary, '$.replay') = 'object' AND id NOT IN ("
        "SELECT match_id FROM uploads WHERE endpoint = ?) ORDER BY length(id), id",
        (endpoint,),
    ).fetchall()
    if not pending:
        return
    client = build_opener(RejectRedirects())
    failed = False
    for match_id, summary in pending:
        request = Request(endpoint, data=summary.encode("utf-8"), method="POST", headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "DotaInhouseUploader/1.0",
        })
        try:
            with client.open(request, timeout=15) as response:
                receipt = json.load(response)
                if (not isinstance(receipt, dict) or receipt.get("matchId") != match_id or
                        not isinstance(receipt.get("inserted"), bool)):
                    raise ValueError("Server did not acknowledge this match")
        except (OSError, ValueError) as exc:
            print(f"{match_id}: upload will retry ({exc})", flush=True)
            failed = True
            continue
        with db:
            db.execute("INSERT OR IGNORE INTO uploads(endpoint, match_id) VALUES (?, ?)", (endpoint, match_id))
        print(f"{match_id}: upload confirmed", flush=True)
    return failed
