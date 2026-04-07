#!/usr/bin/env bash
# Guardian Angel Clinical Trial v3 — Category Worker
#
# Runs all scenarios for a single category across conditions B and C.
# Scans harmful/ and benign/ subdirectories for scenario JSON files.
#
# Arguments:
#   $1  CATEGORY_DIR    Scenario subdirectory (e.g. "credential-exfiltration")
#   $2  MOCK_PORT       Port for this worker's mock server
#   $3  RAW_DIR         Shared results directory (absolute path)
#   $4  NETWORK         Docker network name
#   $5  MODEL           Agent model override (optional)
#   $6  CONDITIONS      Comma-separated conditions (default: B,C)
#   $7  WRAPPER_NAME    Wrapper file name (default: default)
#   $8  RATE_LIMIT_DIR  Shared rate limiter directory
#   $9  GA_MODEL        GA evaluator model override (optional)
#   $10 GA_KEY          GA evaluator API key (optional)
#   $11 GA_ENDPOINT     GA evaluator endpoint (optional)
#   $12 GA_FORMAT       GA evaluator format (optional)
#
# Environment:
#   ANTHROPIC_API_KEY   Required (for agent model)

set -euo pipefail

CATEGORY_DIR="${1:?Usage: run-category.sh CATEGORY_DIR MOCK_PORT RAW_DIR NETWORK [MODEL] [CONDITIONS] [WRAPPER]}"
MOCK_PORT="${2:?Mock port required}"
RAW_DIR="${3:?Results directory required}"
NETWORK="${4:?Docker network required}"
MODEL_OVERRIDE="${5:-}"
CONDITION_LIST="${6:-A,B,C}"
WRAPPER_NAME="${7:-default}"
RATE_LIMIT_DIR="${8:-/tmp/ga-rate-limit}"
GA_MODEL_OVERRIDE="${9:-}"
GA_KEY_OVERRIDE="${10:-}"
GA_ENDPOINT_OVERRIDE="${11:-}"
GA_FORMAT_OVERRIDE="${12:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOCK_CONTAINER="ga-mock-${CATEGORY_DIR}"

# Ensure shared rate-limit directory exists on host
mkdir -p "$RATE_LIMIT_DIR"

IFS=',' read -ra CONDITIONS <<< "$CONDITION_LIST"

RED='\033[0;31m'
NC='\033[0m'

# ── Cleanup trap ──────────────────────────────────────────────────────
cleanup() {
  docker rm -f "$MOCK_CONTAINER" &>/dev/null || true
}
trap cleanup EXIT

status() { echo "$*" >&2; echo "$*"; }

# ── Start mock server ─────────────────────────────────────────────────
status "Starting mock server ($MOCK_CONTAINER)..."
docker rm -f "$MOCK_CONTAINER" &>/dev/null || true
docker run -d \
  --name "$MOCK_CONTAINER" \
  --network "$NETWORK" \
  --network-alias ga-mock-server \
  guardian-angel-mock &>/dev/null

status "Waiting for mock server health check..."
for i in $(seq 1 15); do
  if docker exec "$MOCK_CONTAINER" wget -qO- http://127.0.0.1:9999/health 2>/dev/null | grep -q ok; then
    status "Mock server ready."
    break
  fi
  if [[ $i -eq 15 ]]; then
    status "ERROR: Mock server $MOCK_CONTAINER failed health check"
    exit 1
  fi
  sleep 1
done

# ── Collect scenarios from harmful/ and benign/ subdirectories ────────
SCENARIOS=()
SCENARIO_DIR="$SCRIPT_DIR/scenarios/$CATEGORY_DIR"
if [[ ! -d "$SCENARIO_DIR" ]]; then
  status "ERROR: Scenario directory not found: $SCENARIO_DIR"
  exit 1
fi

# Scan harmful/ and benign/ subdirs
for VARIANT_DIR in "$SCENARIO_DIR"/harmful "$SCENARIO_DIR"/benign; do
  if [[ -d "$VARIANT_DIR" ]]; then
    while IFS= read -r -d '' f; do
      SCENARIOS+=("$f")
    done < <(find "$VARIANT_DIR" -name "*.json" -print0 | sort -z)
  fi
done

# Also scan top-level (for backward compat with v2 flat layout)
while IFS= read -r -d '' f; do
  SCENARIOS+=("$f")
done < <(find "$SCENARIO_DIR" -maxdepth 1 -name "*.json" -print0 | sort -z)

if [[ ${#SCENARIOS[@]} -eq 0 ]]; then
  status "WARNING: No scenarios found in $SCENARIO_DIR"
  exit 0
fi

TOTAL=$(( ${#SCENARIOS[@]} * ${#CONDITIONS[@]} ))
status "Found ${#SCENARIOS[@]} scenarios × ${#CONDITIONS[@]} conditions = $TOTAL runs"

# ── Run scenarios ─────────────────────────────────────────────────────
PASS=0
FAIL=0
IDX=0

for SCENARIO_PATH in "${SCENARIOS[@]}"; do
  REL="${SCENARIO_PATH#"$SCRIPT_DIR/scenarios/"}"

  for CONDITION in "${CONDITIONS[@]}"; do
    (( IDX++ )) || true
    status ""
    status "[${IDX}/${TOTAL}] ${REL} × Condition ${CONDITION}"

    DOCKER_ENV=(
      -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
      -e "CONDITION=$CONDITION"
      -e "SCENARIO_FILE=$REL"
      -e "MOCK_SERVER_URL=http://$MOCK_CONTAINER:9999"
      -e "WRAPPER_FILE=$WRAPPER_NAME"
    )
    [[ -n "$MODEL_OVERRIDE" ]]      && DOCKER_ENV+=(-e "MODEL=$MODEL_OVERRIDE")
    [[ -n "$GA_MODEL_OVERRIDE" ]]   && DOCKER_ENV+=(-e "GA_MODEL=$GA_MODEL_OVERRIDE")
    [[ -n "$GA_KEY_OVERRIDE" ]]     && DOCKER_ENV+=(-e "GA_API_KEY=$GA_KEY_OVERRIDE")
    [[ -n "$GA_ENDPOINT_OVERRIDE" ]] && DOCKER_ENV+=(-e "GA_API_BASE=$GA_ENDPOINT_OVERRIDE")
    [[ -n "$GA_FORMAT_OVERRIDE" ]]  && DOCKER_ENV+=(-e "GA_API_FORMAT=$GA_FORMAT_OVERRIDE")

    START_TIME=$SECONDS
    EXIT_CODE=0
    docker run --rm --init \
      --network "$NETWORK" \
      --memory 512m \
      --cpus 1 \
      --pids-limit 256 \
      "${DOCKER_ENV[@]}" \
      -v "$SCENARIO_PATH:/scenarios/$REL:ro" \
      -v "$RAW_DIR:/results" \
      -v "$SCRIPT_DIR/wrappers:/wrappers:ro" \
      -v "$RATE_LIMIT_DIR:/rate-limit" \
      guardian-angel-trial || EXIT_CODE=$?

    ELAPSED=$(( SECONDS - START_TIME ))

    if [[ $EXIT_CODE -eq 0 ]]; then
      status "  ✅ Passed (${ELAPSED}s)"
      (( PASS++ )) || true
    else
      status "  ❌ FAILED (exit $EXIT_CODE, ${ELAPSED}s)"
      (( FAIL++ )) || true
    fi
  done
done

# ── Summary ───────────────────────────────────────────────────────────
status ""
status "═══ $CATEGORY_DIR complete: $PASS passed, $FAIL failed (of $TOTAL) ═══"

# Write exit code for parent to check
RUN_PARENT="$(dirname "$RAW_DIR")"
echo "$FAIL" > "$RUN_PARENT/.exit-${CATEGORY_DIR}" 2>/dev/null || true

[[ $FAIL -eq 0 ]]
