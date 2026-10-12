#!/usr/bin/env bash
# V2 public Node API + ORIGINAL Flask Python routing engine (loopback only).
set -Eeuo pipefail
cd /opt/vano

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo '[VANO original-engine] Missing DATABASE_URL; original routing cannot start.' >&2
  exit 78
fi
if [[ -z "${MAPBOX_ACCESS_TOKEN:-}" ]]; then
  echo '[VANO original-engine] Missing MAPBOX_ACCESS_TOKEN; original routing cannot start.' >&2
  exit 78
fi

export VANO_SKIP_DB_INIT=1
export VANO_KEEPALIVE_ENABLED=0
export VANO_PUBLIC_BENCHMARK_ENABLED=0
export VANO_ORIGINAL_ENGINE_PORT="${VANO_ORIGINAL_ENGINE_PORT:-8765}"
if ! [[ "$VANO_ORIGINAL_ENGINE_PORT" =~ ^[0-9]{2,5}$ ]] || [[ "$VANO_ORIGINAL_ENGINE_PORT" -gt 65535 ]]; then
  echo '[VANO original-engine] Invalid internal port.' >&2
  exit 78
fi
export VANO_V1_API_URL="http://127.0.0.1:${VANO_ORIGINAL_ENGINE_PORT}"
export API_HOST="${API_HOST:-0.0.0.0}"
export PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-${VANO_PUBLIC_ORIGIN:-https://vanomaps.online}}"

python -m gunicorn app:app \
  --bind "127.0.0.1:${VANO_ORIGINAL_ENGINE_PORT}" \
  --workers 1 --threads 4 --timeout 95 \
  --access-logfile - --error-logfile - &
engine_pid=$!
node_pid=''
shutdown(){
  if [[ -n "$node_pid" ]]; then kill "$node_pid" 2>/dev/null || true; fi
  kill "$engine_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap shutdown EXIT TERM INT

# Real readiness probes PostgreSQL and required Python imports; no demo-mode fake.
ready=0
for i in $(seq 1 45); do
  if ! kill -0 "$engine_pid" 2>/dev/null; then
    echo '[VANO original-engine] Python process stopped unexpectedly.' >&2
    exit 1
  fi
  if python - "$VANO_V1_API_URL" <<'PY' >/dev/null 2>&1
import sys, urllib.request
url=sys.argv[1]+'/healthz'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
try:
    with opener.open(url,timeout=1.5) as response:
        sys.exit(0 if response.status==200 else 1)
except Exception:
    sys.exit(1)
PY
  then ready=1; break; fi
  sleep .6
done
if [[ "$ready" != 1 ]]; then
  echo '[VANO original-engine] Python database/health probe failed; refusing public start.' >&2
  exit 1
fi

echo '[VANO original-engine] Python engine healthy on loopback. Starting V2 Node gateway.'
node v2/server/index.mjs &
node_pid=$!
wait -n "$node_pid" "$engine_pid" || exit $?
echo '[VANO original-engine] A required process exited. Stopping its companion.' >&2
exit 1
