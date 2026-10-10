#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -f data/server.pid ] && kill "$(cat data/server.pid)" 2>/dev/null && rm -f data/server.pid && echo stopped || echo "not running"
