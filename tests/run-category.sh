#!/usr/bin/env bash
# Guardian Angel Clinical Trial v2 — Category Worker
#
# Runs all scenarios for a single category across all conditions.
# Manages its own mock server instance for complete isolation.
#
# Called by run-trial.sh — not intended for direct use (but works standalone).
#
# Arguments:
#   $1  CATEGORY_DIR    Scenario subdirectory (e.g. "injection-v2")
#   $2  MOCK_PORT       Port for this worker's mock server (e.g. "10000")
#   $3  RAW_DIR         Shared results directory (absolute path)
#   $4  NETWORK         Docker network name
#   $5  MODEL           Model override (optional, empty string = default)
#   $6  CONDITIONS      Comma-separated conditions (optional, default: all four)
#
# Environment:
#   ANTHROPIC_API_KEY   Required

set -euo pipefail

CATEGORY_DIR="${1:?Usage: run-category.sh CATEGORY_DIR MOCK_PORT RAW_DIR NETWORK [MODEL] [CONDITIONS]}"
MOCK_PORT="${2:?Mock port required}"
RAW_DIR="${3:?Results directory required}"
NETWORK="${4:?Docker network required}"
MODEL_OVERRIDE="${5:-}"
CONDITION_LIST="${6:-positive-control,negative-control,treatment,combination}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOCK_CONTAINER="ga-mock-${CATEGORY_DIR}"

# Parse conditions
IFS=',' read -ra CONDITIONS <<< "$CONDITION_LIST"

RED='\033[0;31m'
NC='\033[0m'

# ── Cleanup trap ──────────────────────────────────────────────────────
cleanup() {
  docker rm -f "$MOCK_CONTAINER" &>/dev/null || true
}
trap cleanup EXIT

# ── Start mock server ─────────────────────────────────────────────────
docker rm -f "$MOCK_CONTAINER" &>/dev/null || true
docker run -d \
  --name "$MOCK_CONTAINER" \
  --network "$NETWORK" \
  guardian-angel-mock &>/dev/null

# Wait for health check (curl the container's IP on the Docker network)
MOCK_IP=""
for i in $(seq 1 15); do
  if [[ -z "$MOCK_IP" ]]; then
    MOCK_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$MOCK_CONTAINER" 2>/dev/null || true)
  fi
  if [[ -n "$MOCK_IP" ]] && curl -sf "http://$MOCK_IP:9999/health" &>/dev/null; then
    break
  fi
  if [[ $i -eq 15 ]]; then
    echo "ERROR: Mock server $MOCK_CONTAINER failed health check" >&2
    exit 1
  fi
  sleep 1
done

# ── Collect scenarios ─────────────────────────────────────────────────
SCENARIOS=()
SCENARIO_DIR="$SCRIPT_DIR/scenarios/$CATEGORY_DIR"
if [[ ! -d "$SCENARIO_DIR" ]]; then
  echo "ERROR: Scenario directory not found: $SCENARIO_DIR" >&2
  exit 1
fi

while IFS= read -r -d '' f; do
  SCENARIOS+=("$f")
done < <(find "$SCENARIO_DIR" -name "*.json" -print0 | sort -z)

if [[ ${#SCENARIOS[@]} -eq 0 ]]; then
  echo "WARNING: No scenarios found in $SCENARIO_DIR" >&2
  exit 0
fi

TOTAL=$(( ${#SCENARIOS[@]} * ${#CONDITIONS[@]} ))

# ── Run scenarios ─────────────────────────────────────────────────────
PASS=0
FAIL=0
IDX=0

for SCENARIO_PATH in "${SCENARIOS[@]}"; do
  REL="${SCENARIO_PATH#"$SCRIPT_DIR/scenarios/"}"

  for CONDITION in "${CONDITIONS[@]}"; do
    (( IDX++ )) || true
    echo ""
    echo "[${IDX}/${TOTAL}] ${REL} × ${CONDITION}"

    # Build env vars
    DOCKER_ENV=(
      -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
      -e "CONDITION=$CONDITION"
      -e "SCENARIO_FILE=$REL"
      -e "MOCK_SERVER_URL=http://$MOCK_CONTAINER:9999"
    )
    if [[ -n "$MODEL_OVERRIDE" ]]; then
      DOCKER_ENV+=(-e "MODEL=$MODEL_OVERRIDE")
    fi

    # Run container: all output (stdout + stderr) streams to terminal in real-time
    EXIT_CODE=0
    docker run --rm --init \
      --network "$NETWORK" \
      "${DOCKER_ENV[@]}" \
      -v "$SCENARIO_PATH:/scenarios/$REL:ro" \
      -v "$RAW_DIR:/results" \
      guardian-angel-trial || EXIT_CODE=$?

    if [[ $EXIT_CODE -eq 0 ]]; then
      (( PASS++ )) || true
    else
      echo -e "${RED}ERROR (exit $EXIT_CODE)${NC}"
      (( FAIL++ )) || true
    fi
  done
done

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "Category $CATEGORY_DIR complete: $PASS passed, $FAIL failed (of $TOTAL)"

# Exit with failure count (0 = all passed)
[[ $FAIL -eq 0 ]]
