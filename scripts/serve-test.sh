#!/bin/sh
# Restart the test deployment: mock LLM on 127.0.0.1:8787, app on the private eth0 address :8000.
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH" NEXT_TELEMETRY_DISABLED=1
LOGS="$HOME/.cache/ss"; mkdir -p "$LOGS"
for f in "$LOGS/app.pid" "$LOGS/mock.pid"; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; done
for p in 8000 8787; do fuser -k "$p/tcp" 2>/dev/null || true; done
sleep 1
HOST_IP=$(ip -4 -o addr show eth0 | awk '{print $4}' | cut -d/ -f1)
setsid nohup node scripts/mock-llm.mjs 8787 > "$LOGS/mock.log" 2>&1 < /dev/null & echo $! > "$LOGS/mock.pid"
setsid nohup npx next start -H "$HOST_IP" -p 8000 > "$LOGS/server.log" 2>&1 < /dev/null & echo $! > "$LOGS/app.pid"
sleep 6
echo "app on http://$HOST_IP:8000"; tail -1 "$LOGS/mock.log"
