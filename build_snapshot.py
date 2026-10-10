#!/usr/bin/env python3
"""Build dist/fridge-board-snapshot.html: one self-contained offline file (CSS, JS and data inlined).
No network references. Re-collects from the tutor files first unless --no-collect."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import collect  # noqa: E402

if "--no-collect" not in sys.argv:
    collect.main()
board = json.load(open(os.path.join(HERE, "data", "board.json"), encoding="utf-8"))
html = open(os.path.join(HERE, "web", "index.html"), encoding="utf-8").read()
css = open(os.path.join(HERE, "web", "app.css"), encoding="utf-8").read()
js = open(os.path.join(HERE, "web", "app.js"), encoding="utf-8").read()
data = json.dumps(board, ensure_ascii=False).replace("</", "<\\/")
html = html.replace('<link rel="stylesheet" href="app.css">', "<style>\n" + css + "\n</style>")
html = html.replace('<script src="app.js"></script>',
                    "<script>window.__BOARD__ = " + data + ";</script>\n<script>\n" + js.replace("</script", "<\\/script") + "\n</script>")
html = html.replace("<title>Boyd Fridge Board</title>", "<title>Boyd Fridge Board · snapshot " + board["generated_at"][:10] + "</title>")
os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
out = os.path.join(HERE, "dist", "fridge-board-snapshot.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print(out, os.path.getsize(out), "bytes")
