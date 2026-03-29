#!/usr/bin/env bash
# Guardian Angel Clinical Trial — Orchestrator
#
# Runs all scenarios across all four conditions inside Docker containers.
# Each container is fresh (ephemeral), so harmful commands in condition B
# execute against a throwaway filesystem and cannot damage the host.
#
# Usage:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   ./run-trial.sh
#   ./run-trial.sh --condition treatment
#   ./run-trial.sh --condition treatment --scenario injection-style/001.json
#
# Output:
#   results/run-<timestamp>/raw/    — per-scenario JSON files
#   results/run-<timestamp>/report.md
#   results/run-<timestamp>/summary.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$SCRIPT_DIR/results/run-$TIMESTAMP"
RAW_DIR="$RUN_DIR/raw"
NETWORK="ga-trial-net"
MOCK_CONTAINER="ga-mock-server"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Argument parsing ──────────────────────────────────────────────────
CONDITION_FILTER=""
SCENARIO_FILTER=""

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --condition) CONDITION_FILTER="$2"; shift 2 ;;
    --scenario)  SCENARIO_FILTER="$2";  shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Preflight ─────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════"
echo "  Guardian Angel Clinical Trial"
echo "  Run: $TIMESTAMP"
echo "═══════════════════════════════════════════════════════"
echo ""

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo -e "${RED}ERROR: ANTHROPIC_API_KEY is not set.${NC}" >&2
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo -e "${RED}ERROR: docker is not installed or not in PATH.${NC}" >&2
  exit 1
fi

if ! docker info &>/dev/null; then
  echo -e "${RED}ERROR: Docker daemon is not running.${NC}" >&2
  echo "       Start Docker Desktop (Applications → Docker) and wait for the" >&2
  echo "       menu-bar whale icon to stop animating, then re-run." >&2
  exit 1
fi

mkdir -p "$RAW_DIR"

# ── Step 1: Copy production GA hook ──────────────────────────────────
echo "[1/5] Copying production Guardian Angel hook..."
mkdir -p "$SCRIPT_DIR/harness/hooks"
GA_SRC="$HOME/.claude/hooks/guardian-angel.js"
if [[ ! -f "$GA_SRC" ]]; then
  echo -e "${RED}ERROR: $GA_SRC not found. Is Guardian Angel installed?${NC}" >&2
  exit 1
fi
cp "$GA_SRC" "$SCRIPT_DIR/harness/hooks/guardian-angel.js"
echo "      ✓ Copied from ~/.claude/hooks/guardian-angel.js"

# ── Step 2: Build images ──────────────────────────────────────────────
echo "[2/5] Building Docker images..."
DOCKER_BUILDKIT=1 docker build -t guardian-angel-trial "$SCRIPT_DIR" -q
echo "      ✓ guardian-angel-trial"
DOCKER_BUILDKIT=1 docker build -t guardian-angel-mock "$SCRIPT_DIR/mock-server" -q
echo "      ✓ guardian-angel-mock"

# ── Step 3: Set up network ────────────────────────────────────────────
echo "[3/5] Setting up Docker network..."
docker network inspect "$NETWORK" &>/dev/null || docker network create "$NETWORK"
echo "      ✓ Network: $NETWORK"

# ── Step 4: Start mock server ─────────────────────────────────────────
echo "[4/5] Starting mock server..."
docker rm -f "$MOCK_CONTAINER" &>/dev/null || true
docker run -d \
  --name "$MOCK_CONTAINER" \
  --network "$NETWORK" \
  guardian-angel-mock &>/dev/null
# Wait for health check
for i in $(seq 1 10); do
  if docker exec "$MOCK_CONTAINER" wget -qO- http://localhost:9999/health &>/dev/null 2>&1; then
    break
  fi
  sleep 1
done
echo "      ✓ Mock server ready (http://localhost:9999)"

# ── Step 5: Run scenarios ─────────────────────────────────────────────
# Collect scenario files
if [[ -n "$SCENARIO_FILTER" ]]; then
  SCENARIOS=("$SCRIPT_DIR/scenarios/$SCENARIO_FILTER")
else
  while IFS= read -r -d '' f; do
    SCENARIOS+=("$f")
  done < <(find "$SCRIPT_DIR/scenarios" -name "*.json" -print0 | sort -z)
fi

# Conditions to run
if [[ -n "$CONDITION_FILTER" ]]; then
  CONDITIONS=("$CONDITION_FILTER")
else
  CONDITIONS=("positive-control" "negative-control" "treatment" "combination")
fi

TOTAL=$(( ${#SCENARIOS[@]} * ${#CONDITIONS[@]} ))
echo "[5/5] Running ${#SCENARIOS[@]} scenario(s) × ${#CONDITIONS[@]} condition(s) = $TOTAL runs..."
echo ""

PASS=0
FAIL=0
IDX=0

for SCENARIO_PATH in "${SCENARIOS[@]}"; do
  # Compute relative path from scenarios/ root
  REL="${SCENARIO_PATH#"$SCRIPT_DIR/scenarios/"}"

  for CONDITION in "${CONDITIONS[@]}"; do
    (( IDX++ )) || true
    printf "  [%3d/%3d] %-50s × %-20s " "$IDX" "$TOTAL" "$REL" "$CONDITION"

    EXIT_CODE=0
    OUTPUT=$(docker run --rm \
      --network "$NETWORK" \
      -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
      -e CONDITION="$CONDITION" \
      -e SCENARIO_FILE="$REL" \
      -e MOCK_SERVER_URL="http://$MOCK_CONTAINER:9999" \
      -v "$SCENARIO_PATH:/scenarios/$REL:ro" \
      -v "$RAW_DIR:/results" \
      guardian-angel-trial 2>&1) || EXIT_CODE=$?

    LAST_LINE=$(echo "$OUTPUT" | tail -1)
    if [[ $EXIT_CODE -eq 0 ]]; then
      echo -e "$LAST_LINE"
      (( PASS++ )) || true
    else
      echo -e "${RED}ERROR (exit $EXIT_CODE)${NC}"
      echo "$OUTPUT" | tail -3 | sed 's/^/    /'
      (( FAIL++ )) || true
    fi
  done
done

echo ""

# ── Collect metrics ───────────────────────────────────────────────────
echo "Computing metrics..."
node "$SCRIPT_DIR/harness/collect-metrics.js" "$RUN_DIR"

# ── Cleanup ───────────────────────────────────────────────────────────
docker rm -f "$MOCK_CONTAINER" &>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Trial complete"
echo "  Results: $RUN_DIR"
echo "  Report:  $RUN_DIR/report.md"
if [[ $FAIL -gt 0 ]]; then
  echo -e "  ${YELLOW}Warnings: $FAIL run(s) failed (see logs above)${NC}"
fi
echo "═══════════════════════════════════════════════════════"
