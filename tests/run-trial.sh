#!/usr/bin/env bash
# Guardian Angel Clinical Trial v2 — Orchestrator
#
# Runs all v2 scenarios across all four conditions inside Docker containers.
# By default, runs categories IN PARALLEL (one worker per category, each with
# its own mock server instance). Use --sequential to revert to serial execution.
#
# Usage:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   ./run-trial.sh                              # parallel (default)
#   ./run-trial.sh --sequential                 # serial mode
#   ./run-trial.sh --condition treatment        # filter to one condition
#   ./run-trial.sh --category injection-v2          # single category with metrics
#   ./run-trial.sh --scenario injection-v2/001-log-analysis.json
#   ./run-trial.sh --model claude-haiku-4-5-20251001
#   ./run-trial.sh --max-parallel 2             # limit concurrent workers
#   ./run-trial.sh --v1                         # run v1 scenarios instead
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

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Ctrl-C cleanup: stop all trial containers on interrupt ────────────
cleanup_on_interrupt() {
  echo ""
  echo -e "${RED}Interrupted — stopping containers...${NC}"
  docker ps --filter "ancestor=guardian-angel-trial" -q | xargs -r docker stop -t 2 2>/dev/null
  docker ps --filter "ancestor=guardian-angel-mock" -q | xargs -r docker stop -t 2 2>/dev/null
  # Kill any background worker processes
  kill 0 2>/dev/null || true
  echo "Done."
  exit 130
}
trap cleanup_on_interrupt INT TERM

# ── Argument parsing ──────────────────────────────────────────────────
CONDITION_FILTER=""
SCENARIO_FILTER=""
CATEGORY_FILTER=""
MODEL_OVERRIDE=""
USE_V1=false
PARALLEL=true
MAX_PARALLEL=0  # 0 = unlimited (all categories at once)

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --condition)     CONDITION_FILTER="$2"; shift 2 ;;
    --scenario)      SCENARIO_FILTER="$2";  shift 2 ;;
    --category)      CATEGORY_FILTER="$2";  shift 2 ;;
    --model)         MODEL_OVERRIDE="$2";   shift 2 ;;
    --v1)            USE_V1=true;           shift ;;
    --sequential)    PARALLEL=false;        shift ;;
    --max-parallel)  MAX_PARALLEL="$2";     shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Determine scenario directories ──────────────────────────────────
if [[ "$USE_V1" == "true" ]]; then
  SCENARIO_DIRS=("benign" "credential-theft" "data-destruction" "gate-v-gaps" "injection-style")
else
  SCENARIO_DIRS=("benign-v2" "credential-v2" "destruction-v2" "injection-v2")
fi

# If a specific category is given, run only that one
if [[ -n "$CATEGORY_FILTER" ]]; then
  SCENARIO_DIRS=("$CATEGORY_FILTER")
fi

# If a specific scenario is given, extract its category
if [[ -n "$SCENARIO_FILTER" ]]; then
  FILTER_CATEGORY="${SCENARIO_FILTER%%/*}"
  SCENARIO_DIRS=("$FILTER_CATEGORY")
fi

# Build conditions string for workers
if [[ -n "$CONDITION_FILTER" ]]; then
  CONDITIONS_CSV="$CONDITION_FILTER"
else
  CONDITIONS_CSV="positive-control,negative-control,treatment,combination"
fi

# ── Preflight ─────────────────────────────────────────────────────────
MODE_LABEL="parallel"
[[ "$PARALLEL" == "false" ]] && MODE_LABEL="sequential"

echo "═══════════════════════════════════════════════════════"
echo "  Guardian Angel Clinical Trial v2"
echo "  Run: $TIMESTAMP"
echo "  Mode: $MODE_LABEL (${#SCENARIO_DIRS[@]} categories)"
[[ -n "$MODEL_OVERRIDE" ]] && echo "  Model: $MODEL_OVERRIDE"
[[ -n "$CATEGORY_FILTER" ]] && echo "  Category: $CATEGORY_FILTER"
[[ -n "$CONDITION_FILTER" ]] && echo "  Condition: $CONDITION_FILTER"
[[ -n "$SCENARIO_FILTER" ]] && echo "  Scenario: $SCENARIO_FILTER"
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
  exit 1
fi

mkdir -p "$RAW_DIR"

# ── Step 1: Build images ─────────────────────────────────────────────
echo "[1/3] Building Docker images (first run installs dependencies — may take a minute)..."
echo ""
DOCKER_BUILDKIT=1 docker build -t guardian-angel-trial "$SCRIPT_DIR" --progress=plain 2>&1
echo ""
echo "      ✓ guardian-angel-trial"
DOCKER_BUILDKIT=1 docker build -t guardian-angel-mock "$SCRIPT_DIR/mock-server" --progress=plain 2>&1
echo "      ✓ guardian-angel-mock"

# ── Step 2: Set up network ───────────────────────────────────────────
echo "[2/3] Setting up Docker network..."
docker network inspect "$NETWORK" &>/dev/null || docker network create "$NETWORK"
echo "      ✓ Network: $NETWORK"

# ── Step 3: Run categories ───────────────────────────────────────────
echo "[3/3] Launching ${#SCENARIO_DIRS[@]} category worker(s)..."
echo ""

# ── Single-scenario mode (bypass category workers) ────────────────────
if [[ -n "$SCENARIO_FILTER" ]]; then
  echo -e "${CYAN}Single-scenario mode: $SCENARIO_FILTER${NC}"
  MOCK_CONTAINER="ga-mock-single"

  # Start mock server
  docker rm -f "$MOCK_CONTAINER" &>/dev/null || true
  docker run -d --name "$MOCK_CONTAINER" --network "$NETWORK" guardian-angel-mock &>/dev/null
  for i in $(seq 1 15); do
    if docker exec "$MOCK_CONTAINER" wget -qO- http://127.0.0.1:9999/health 2>/dev/null | grep -q ok; then
      break
    fi
    sleep 1
  done

  SCENARIO_PATH="$SCRIPT_DIR/scenarios/$SCENARIO_FILTER"
  IFS=',' read -ra CONDS <<< "$CONDITIONS_CSV"

  PASS=0; FAIL=0
  for CONDITION in "${CONDS[@]}"; do
    echo ""
    echo -e "  ${CYAN}$SCENARIO_FILTER × $CONDITION${NC}"
    DOCKER_ENV=(-e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" -e "CONDITION=$CONDITION" -e "SCENARIO_FILE=$SCENARIO_FILTER" -e "MOCK_SERVER_URL=http://$MOCK_CONTAINER:9999")
    [[ -n "$MODEL_OVERRIDE" ]] && DOCKER_ENV+=(-e "MODEL=$MODEL_OVERRIDE")

    # Stream both stdout and stderr to terminal in real-time
    EXIT_CODE=0
    docker run --rm --init --network "$NETWORK" "${DOCKER_ENV[@]}" \
      -v "$SCENARIO_PATH:/scenarios/$SCENARIO_FILTER:ro" \
      -v "$RAW_DIR:/results" \
      guardian-angel-trial || EXIT_CODE=$?

    if [[ $EXIT_CODE -eq 0 ]]; then ((PASS++)) || true
    else echo -e "${RED}  ERROR (exit $EXIT_CODE)${NC}"; ((FAIL++)) || true; fi
  done

  docker rm -f "$MOCK_CONTAINER" &>/dev/null || true

# ── Parallel mode ─────────────────────────────────────────────────────
elif [[ "$PARALLEL" == "true" ]]; then
  WORKER_PIDS=()
  WORKER_LOGS=()
  ACTIVE=0

  for i in "${!SCENARIO_DIRS[@]}"; do
    CATEGORY="${SCENARIO_DIRS[$i]}"
    MOCK_PORT=$((10000 + i))
    LOG_FILE="$RUN_DIR/${CATEGORY}.log"
    EXIT_FILE="$RUN_DIR/.exit-${CATEGORY}"
    WORKER_LOGS+=("$LOG_FILE")

    echo -e "  ${CYAN}▶ Starting worker: $CATEGORY${NC}"

    # Launch worker: run-category.sh's status() writes to both stdout and stderr.
    # stdout goes to the log file. stderr goes to terminal (fd 2 is inherited, unbuffered).
    bash "$SCRIPT_DIR/run-category.sh" \
      "$CATEGORY" "$MOCK_PORT" "$RAW_DIR" "$NETWORK" "$MODEL_OVERRIDE" "$CONDITIONS_CSV" \
      > "$LOG_FILE" &

    WORKER_PIDS+=($!)
    ((ACTIVE++)) || true

    # Throttle if max-parallel is set
    if [[ $MAX_PARALLEL -gt 0 && $ACTIVE -ge $MAX_PARALLEL ]]; then
      wait -n "${WORKER_PIDS[@]}" 2>/dev/null || true
      ((ACTIVE--)) || true
    fi
  done

  echo ""
  echo -e "  ${CYAN}Workers running... output streams below.${NC}"
  echo ""

  # Wait for all pipeline processes to complete
  for PID in "${WORKER_PIDS[@]}"; do
    wait "$PID" 2>/dev/null || true
  done

  echo ""

  # Check exit codes from status files
  WORKER_FAILURES=0
  for i in "${!SCENARIO_DIRS[@]}"; do
    CATEGORY="${SCENARIO_DIRS[$i]}"
    EXIT_FILE="$RUN_DIR/.exit-${CATEGORY}"
    if [[ -f "$EXIT_FILE" ]]; then
      EC=$(cat "$EXIT_FILE")
      if [[ "$EC" == "0" ]]; then
        echo -e "  ${GREEN}✓ $CATEGORY completed successfully${NC}"
      else
        echo -e "  ${RED}✗ $CATEGORY had failures${NC}"
        ((WORKER_FAILURES++)) || true
      fi
      rm -f "$EXIT_FILE"
    else
      echo -e "  ${YELLOW}? $CATEGORY — no exit status (may still be finishing)${NC}"
    fi
  done

  PASS=0; FAIL=0
  for LOG in "${WORKER_LOGS[@]}"; do
    if [[ -f "$LOG" ]]; then
      P=$(grep -c '✅\|verdict=' "$LOG" 2>/dev/null) || P=0
      F=$(grep -c 'ERROR' "$LOG" 2>/dev/null) || F=0
      ((PASS += P)) || true
      ((FAIL += F)) || true
    fi
  done

# ── Sequential mode ───────────────────────────────────────────────────
else
  echo -e "${YELLOW}Sequential mode${NC}"
  PASS=0; FAIL=0

  for i in "${!SCENARIO_DIRS[@]}"; do
    CATEGORY="${SCENARIO_DIRS[$i]}"
    MOCK_PORT=$((10000 + i))

    echo ""
    echo -e "  ${CYAN}── $CATEGORY ──${NC}"

    bash "$SCRIPT_DIR/run-category.sh" \
      "$CATEGORY" "$MOCK_PORT" "$RAW_DIR" "$NETWORK" "$MODEL_OVERRIDE" "$CONDITIONS_CSV" \
      && true || ((FAIL++)) || true
  done
fi

echo ""

# ── Collect metrics ───────────────────────────────────────────────────
echo "Computing metrics..."
RESULT_COUNT=$(find "$RAW_DIR" -name "*.json" | wc -l | tr -d ' ')

if [[ "$RESULT_COUNT" -gt 0 ]]; then
  node "$SCRIPT_DIR/harness/collect-metrics.js" "$RUN_DIR"
else
  echo -e "${YELLOW}No result files found — skipping metrics.${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Trial complete"
echo "  Mode: $MODE_LABEL"
echo "  Results: $RUN_DIR ($RESULT_COUNT files)"
echo "  Report:  $RUN_DIR/report.md"
if [[ "${WORKER_FAILURES:-0}" -gt 0 || "${FAIL:-0}" -gt 0 ]]; then
  echo -e "  ${YELLOW}Warnings: some runs had failures (check logs)${NC}"
fi
echo "═══════════════════════════════════════════════════════"
