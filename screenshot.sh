#!/usr/bin/env bash
# Capture 1280x800 (kitchen tablet) screenshots of every tab, live server + offline snapshot.
# 00-best-home.png is the hero shot from the offline snapshot (data inlined; no fetch race).
set -euo pipefail
cd "$(dirname "$0")"
PORT="${FB_PORT:-4343}"
CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
mkdir -p screenshots
shot() { # url out
  local prof; prof="$(mktemp -d /tmp/fbshot.XXXX)"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --run-all-compositor-stages-before-draw --virtual-time-budget=6000 \
    --window-size=1280,800 --user-data-dir="$prof" --screenshot="$2" "$1" >/dev/null 2>&1
  rm -rf "$prof"; echo "  $2"
}
# Hero from offline snapshot first (when present)
if [ -f dist/fridge-board-snapshot.html ]; then
  shot "file://$PWD/dist/fridge-board-snapshot.html#home" screenshots/00-best-home.png
fi
shot "http://127.0.0.1:$PORT/#home"     screenshots/01-home.png
shot "http://127.0.0.1:$PORT/#char"     screenshots/02-char.png
shot "http://127.0.0.1:$PORT/#vic"      screenshots/03-vic.png
shot "http://127.0.0.1:$PORT/#hspt"     screenshots/04-hspt.png
shot "http://127.0.0.1:$PORT/#grownups" screenshots/05-grownups.png
[ -f dist/fridge-board-snapshot.html ] && shot "file://$PWD/dist/fridge-board-snapshot.html#home" screenshots/06-offline-snapshot.png
true
