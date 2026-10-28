"""Keeps open pages in sync with the database.

A page lists its live parts:
  * lists  - rows with an id, sent item by item so the browser can add, update or remove single rows
  * blocks - chunks of HTML (stat tiles, charts) that are swapped whole when they change

Every part gets a short fingerprint. The browser sends back the fingerprints it has, and the
server only sends the parts whose fingerprint changed.
"""
import hashlib
import json

from markupsafe import Markup

SKIP_IN_KEY = ("search", "visible", "key")


def digest(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()[:12]


def keyed(rows):
    for row in rows:
        data = {k: v for k, v in row.items() if k not in SKIP_IN_KEY}
        row["key"] = digest(json.dumps(data, sort_keys=True, default=str))
    return rows


class LivePage:
    def __init__(self, name, every=5, lists=None, blocks=None, **data):
        self.name = name
        self.every = every
        self.lists = lists or {}      # id -> (rows, render_row)
        self.blocks = blocks or {}    # id -> render()
        self.data = data
        self._blocks = {}
        for rows, _ in self.lists.values():
            keyed(rows)

    def __getattr__(self, name):
        try:
            return self.__dict__["data"][name]
        except KeyError:
            raise AttributeError(name) from None

    def rows(self, list_id):
        return self.lists[list_id][0]

    def list_hash(self, list_id):
        rows = self.rows(list_id)
        return digest(",".join(sorted(f"{r['id']}:{r['key']}" for r in rows)))

    def block_html(self, block_id):
        if block_id not in self._blocks:
            self._blocks[block_id] = str(self.blocks[block_id]())
        return self._blocks[block_id]

    def block(self, block_id):
        html = self.block_html(block_id)
        return Markup(f'<div class="live-block" data-live-block="{block_id}" data-live-hash="{digest(html)}">') + \
            Markup(html) + Markup("</div>")

    def changes(self, known):
        lists, blocks = {}, {}
        for list_id, (rows, render) in self.lists.items():
            current = self.list_hash(list_id)
            if known.get(list_id) != current:
                lists[list_id] = {"hash": current, "items": [
                    {"id": r["id"], "key": r["key"], "html": str(render(r))} for r in rows]}
        for block_id in self.blocks:
            html = self.block_html(block_id)
            if known.get(block_id) != digest(html):
                blocks[block_id] = {"hash": digest(html), "html": html}
        return {"lists": lists, "blocks": blocks}


def parse_known(text):
    known = {}
    for part in (text or "").split(","):
        name, _, value = part.partition(":")
        if name and value:
            known[name] = value
    return known
