#!/bin/bash
set -euo pipefail
PORT=$(node -e "const net = require('node:net'); const server = net.createServer(); server.listen(0, () => { console.log(server.address().port); server.close(); });")
pnpm cli --inspect-port "$PORT" --inspect-package ./loader.ts --inspect-pause --inspect-record tmp/out.json ./examples/forever.ts >tmp/inspector.log 2>tmp/inspector.err &
INSPECT_PID=$!
sleep 2
set +e
pnpm cli call watchScopes --host http://localhost:$PORT --out tmp/watchScopes.json >tmp/watchScopes.log 2>tmp/watchScopes.err &
WATCH_PID=$!
pnpm cli call recordNodeMap --host http://localhost:$PORT --out tmp/recordNodeMap.json >tmp/recordNodeMap.log 2>tmp/recordNodeMap.err &
RECORD_PID=$!
set -e
sleep 1
pnpm cli call play --host http://localhost:$PORT --out tmp/call-play.json >tmp/call-play.log 2>tmp/call-play.err
sleep 5
kill -INT "$INSPECT_PID" 2>/dev/null || true
sleep 1
pkill -TERM -P "$INSPECT_PID" 2>/dev/null || true
wait $INSPECT_PID 2>/dev/null || true
wait $WATCH_PID 2>/dev/null || true
wait $RECORD_PID 2>/dev/null || true

# pnpm cli --inspect-package ./loader.ts --inspect-pause --inspect-record tmp/out.json ./examples/forever.ts