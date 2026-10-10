#!/usr/bin/env bash
# Start the Fridge Board in the background on 127.0.0.1:4343 (log: data/server.log)
cd "$(dirname "$0")"
if curl -fsS -o /dev/null "http://127.0.0.1:${FB_PORT:-4343}/healthz" 2>/dev/null; then echo "already running"; exit 0; fi
setsid nohup python3 server.py >> data/server.log 2>&1 &
echo $! > data/server.pid
sleep 1; curl -fsS "http://127.0.0.1:${FB_PORT:-4343}/healthz" && echo " started (pid $(cat data/server.pid))"
