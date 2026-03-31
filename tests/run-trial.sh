#!/usr/bin/env bash
# Guardian Angel Clinical Trial v3 — Orchestrator
#
# Runs v3 scenarios across conditions A (Claude), B (ground truth), and C (GA)
# inside Docker containers.
#
# Usage:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   ./run-trial.sh                                  # all categories, parallel
#   ./run-trial.sh --category credential-exfiltration
#   ./run-trial.sh --condition B                    # ground truth only
#   ./run-trial.sh --condition C                    # treatment only
#   ./run-trial.sh --scenario credential-exfiltration/harmful/h001.json
#   ./run-trial.sh --wrapper my-optimized           # use wrappers/my-optimized.txt
#   ./run-trial.sh --model claude-haiku-4-5-20251001
#   ./run-trial.sh --optimize [--max-iter N]        # run optimization loop
#   ./run-trial.sh --sequential                     # serial mode
#   ./run-trial.sh --v2                             # run legacy v2 scenarios
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

# ── Ctrl-C cleanup ──────────────────────────────────────────────────
cleanup_on_interrupt() {
  echo ""
  echo -e "${RED}Interrupted — stopping containers...${NC}"
  docker ps --filter "ancestor=guardian-angel-trial" -q | xargs -r docker stop -t 2 2>/dev/null
  docker ps --filter "ancestor=guardian-angel-mock" -q | xargs -r docker stop -t 2 2>/dev/null
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
WRAPPER_NAME="default"
USE_V2=false
PARALLEL=true
MAX_PARALLEL=0
OPTIMIZE=false
MAX_ITER=10

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --condition)     CONDITION_FILTER="$2"; shift 2 ;;
    --scenario)      SCENARIO_FILTER="$2";  shift 2 ;;
    --category)      CATEGORY_FILTER="$2";  shift 2 ;;
    --model)         MODEL_OVERRIDE="$2";   shift 2 ;;
    --wrapper)       WRAPPER_NAME="$2";     shift 2 ;;
    --v2)            USE_V2=true;           shift ;;
    --sequential)    PARALLEL=false;        shift ;;
    --max-parallel)  MAX_PARALLEL="$2";     shift 2 ;;
    --optimize)      OPTIMIZE=true;        shift ;;
    --max-iter)      MAX_ITER="$2";         shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Determine scenario directories ──────────────────────────────────
if [[ "$USE_V2" == "true" ]]; then
  SCENARIO_DIRS=("archive/benign-v2" "archive/credential-v2" "archive/destruction-v2" "archive/injection-v2")
else
  SCENARIO_DIRS=(
    "credential-exfiltration"
    "data-destruction"
    "remote-code-execution"
    "privilege-escalation"
    "data-modification"
    "prompt-injection"
  )
fi

if [[ -n "$CATEGORY_FILTER" ]]; then
  SCENARIO_DIRS=("$CATEGORY_FILTER")
fi

if [[ -n "$SCENARIO_FILTER" ]]; then
  FILTER_CATEGORY="${SCENARIO_FILTER%%/*}"
  SCENARIO_DIRS=("$FILTER_CATEGORY")
fi

# Build conditions
if [[ -n "$CONDITION_FILTER" ]]; then
  CONDITIONS_CSV="$CONDITION_FILTER"
else
  CONDITIONS_CSV="A,B,C"
fi

# ── Preflight ─────────────────────────────────────────────────────────
MODE_LABEL="parallel"
[[ "$PARALLEL" == "false" ]] && MODE_LABEL="sequential"

echo "═══════════════════════════════════════════════════════"
echo "  Guardian Angel Clinical Trial v3"
echo "  Run: $TIMESTAMP"
echo "  Mode: $MODE_LABEL (${#SCENARIO_DIRS[@]} categories)"
echo "  Conditions: $CONDITIONS_CSV"
echo "  Wrapper: $WRAPPER_NAME"
[[ -n "$MODEL_OVERRIDE" ]] && echo "  Model: $MODEL_OVERRIDE"
[[ -n "$CATEGORY_FILTER" ]] && echo "  Category: $CATEGORY_FILTER"
[[ -n "$CONDITION_FILTER" ]] && echo "  Condition: $CONDITION_FILTER"
[[ -n "$SCENARIO_FILTER" ]] && echo "  Scenario: $SCENARIO_FILTER"
[[ "$OPTIMIZE" == "true" ]] && echo "  Optimization: enabled (max $MAX_ITER iterations)"
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

# ── Optimization mode ────────────────────────────────────────────────
if [[ "$OPTIMIZE" == "true" ]]; then
  echo "Running optimization loop..."
  OPTIMIZE_ARGS=(
    --wrapper "$WRAPPER_NAME"
    --max-iter "$MAX_ITER"
  )
  [[ -n "$CATEGORY_FILTER" ]] && OPTIMIZE_ARGS+=(--category "$CATEGORY_FILTER")
  [[ -n "$MODEL_OVERRIDE" ]] && OPTIMIZE_ARGS+=(--model "$MODEL_OVERRIDE")

  node "$SCRIPT_DIR/harness/optimize.js" "${OPTIMIZE_ARGS[@]}"
  exit $?
fi

mkdir -p "$RAW_DIR"

# ── Step 1: Build images ─────────────────────────────────────────────
echo "[1/3] Building Docker images..."
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

# ── Single-scenario mode ─────────────────────────────────────────────
if [[ -n "$SCENARIO_FILTER" ]]; then
  echo -e "${CYAN}Single-scenario mode: $SCENARIO_FILTER${NC}"
  MOCK_CONTAINER="ga-mock-single"

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

  for CONDITION in "${CONDS[@]}"; do
    echo ""
    echo -e "  ${CYAN}$SCENARIO_FILTER × Condition $CONDITION${NC}"
    DOCKER_ENV=(
      -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
      -e "CONDITION=$CONDITION"
      -e "SCENARIO_FILE=$SCENARIO_FILTER"
      -e "MOCK_SERVER_URL=http://$MOCK_CONTAINER:9999"
      -e "WRAPPER_FILE=$WRAPPER_NAME"
    )
    [[ -n "$MODEL_OVERRIDE" ]] && DOCKER_ENV+=(-e "MODEL=$MODEL_OVERRIDE")

    docker run --rm --init --network "$NETWORK" "${DOCKER_ENV[@]}" \
      -v "$SCENARIO_PATH:/scenarios/$SCENARIO_FILTER:ro" \
      -v "$RAW_DIR:/results" \
      -v "$SCRIPT_DIR/wrappers:/wrappers:ro" \
      guardian-angel-trial || true
  done

  docker rm -f "$MOCK_CONTAINER" &>/dev/null || true

# ── Parallel mode ─────────────────────────────────────────────────────
elif [[ "$PARALLEL" == "true" ]]; then
  WORKER_PIDS=()
  WORKER_LOGS=()

  for i in "${!SCENARIO_DIRS[@]}"; do
    CATEGORY="${SCENARIO_DIRS[$i]}"
    MOCK_PORT=$((10000 + i))
    LOG_FILE="$RUN_DIR/${CATEGORY}.log"
    WORKER_LOGS+=("$LOG_FILE")

    echo -e "  ${CYAN}▶ Starting worker: $CATEGORY${NC}"

    bash "$SCRIPT_DIR/run-category.sh" \
      "$CATEGORY" "$MOCK_PORT" "$RAW_DIR" "$NETWORK" "$MODEL_OVERRIDE" "$CONDITIONS_CSV" "$WRAPPER_NAME" \
      > "$LOG_FILE" &

    WORKER_PIDS+=($!)

    if [[ $MAX_PARALLEL -gt 0 ]] && (( ${#WORKER_PIDS[@]} >= MAX_PARALLEL )); then
      wait -n "${WORKER_PIDS[@]}" 2>/dev/null || true
    fi
  done

  echo ""
  echo -e "  ${CYAN}Workers running...${NC}"
  echo ""

  for PID in "${WORKER_PIDS[@]}"; do
    wait "$PID" 2>/dev/null || true
  done

  echo ""

  WORKER_FAILURES=0
  for i in "${!SCENARIO_DIRS[@]}"; do
    CATEGORY="${SCENARIO_DIRS[$i]}"
    EXIT_FILE="$RUN_DIR/.exit-${CATEGORY}"
    if [[ -f "$EXIT_FILE" ]]; then
      EC=$(cat "$EXIT_FILE")
      if [[ "$EC" == "0" ]]; then
        echo -e "  ${GREEN}✓ $CATEGORY completed${NC}"
      else
        echo -e "  ${RED}✗ $CATEGORY had failures${NC}"
        ((WORKER_FAILURES++)) || true
      fi
      rm -f "$EXIT_FILE"
    fi
  done

# ── Sequential mode ───────────────────────────────────────────────────
else
  echo -e "${YELLOW}Sequential mode${NC}"

  for i in "${!SCENARIO_DIRS[@]}"; do
    CATEGORY="${SCENARIO_DIRS[$i]}"
    MOCK_PORT=$((10000 + i))

    echo ""
    echo -e "  ${CYAN}── $CATEGORY ──${NC}"

    bash "$SCRIPT_DIR/run-category.sh" \
      "$CATEGORY" "$MOCK_PORT" "$RAW_DIR" "$NETWORK" "$MODEL_OVERRIDE" "$CONDITIONS_CSV" "$WRAPPER_NAME" \
      || true
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
echo "═══════════════════════════════════════════════════════"
