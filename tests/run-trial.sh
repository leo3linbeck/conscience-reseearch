#!/usr/bin/env bash
# Guardian Angel Clinical Trial v3 — Orchestrator
#
# Runs v3 scenarios across conditions A (Claude), B (ground truth), and C (GA)
# inside Docker containers.
#
# Usage:
#   export ANTHROPIC_API_KEY=sk-ant-...             # or use ~/.claude/hooks/.ga-api-key
#   ./run-trial.sh                                  # all categories, parallel
#   ./run-trial.sh --category credential-exfiltration
#   ./run-trial.sh --condition B                    # ground truth only
#   ./run-trial.sh --condition C                    # treatment only
#   ./run-trial.sh --scenario credential-exfiltration/harmful/h001.json
#   ./run-trial.sh --wrapper my-optimized           # use wrappers/my-optimized.txt
#   ./run-trial.sh --model claude-haiku-4-5-20251001  # agent model (all conditions)
#   ./run-trial.sh --ga-model gemini-2.5-flash      # GA evaluator model (C/D only)
#   ./run-trial.sh --ga-key AIza...                 # GA evaluator API key
#   ./run-trial.sh --ga-endpoint https://generativelanguage.googleapis.com
#   ./run-trial.sh --ga-format openai               # anthropic, openai, or ollama
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

RATE_LIMIT_DIR="/tmp/ga-rate-limit-$$"
mkdir -p "$RATE_LIMIT_DIR"

# ── Auto-load API key from install key file if not set ──────────────
GA_KEY_FILE="$HOME/.claude/hooks/.ga-api-key"
if [[ -z "${ANTHROPIC_API_KEY:-}" && -f "$GA_KEY_FILE" ]]; then
  ANTHROPIC_API_KEY="$(cat "$GA_KEY_FILE")"
  export ANTHROPIC_API_KEY
fi

# Helper: append GA-specific env vars to a DOCKER_ENV array
append_ga_env() {
  [[ -n "$GA_MODEL_OVERRIDE" ]]    && DOCKER_ENV+=(-e "GA_MODEL=$GA_MODEL_OVERRIDE")
  [[ -n "$GA_KEY_OVERRIDE" ]]      && DOCKER_ENV+=(-e "GA_API_KEY=$GA_KEY_OVERRIDE")
  [[ -n "$GA_ENDPOINT_OVERRIDE" ]] && DOCKER_ENV+=(-e "GA_API_BASE=$GA_ENDPOINT_OVERRIDE")
  [[ -n "$GA_FORMAT_OVERRIDE" ]]   && DOCKER_ENV+=(-e "GA_API_FORMAT=$GA_FORMAT_OVERRIDE")
}

# ── Ctrl-C cleanup ──────────────────────────────────────────────────
cleanup_on_interrupt() {
  echo ""
  echo -e "${RED}Interrupted — stopping containers...${NC}"
  docker ps --filter "ancestor=guardian-angel-trial" -q | xargs -r docker stop -t 2 2>/dev/null
  docker ps --filter "ancestor=guardian-angel-mock" -q | xargs -r docker rm -f 2>/dev/null
  rm -rf "$RATE_LIMIT_DIR" 2>/dev/null
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
GA_MODEL_OVERRIDE=""
GA_KEY_OVERRIDE=""
GA_ENDPOINT_OVERRIDE=""
GA_FORMAT_OVERRIDE=""
WRAPPER_NAME="default"
USE_V2=false
PARALLEL=true
MAX_PARALLEL=0
OPTIMIZE=false
MAX_ITER=10
RERUN_FAILURES=""
AB_TEST=false

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --condition)     CONDITION_FILTER="$2"; shift 2 ;;
    --scenario)      SCENARIO_FILTER="$2";  shift 2 ;;
    --category)      CATEGORY_FILTER="$2";  shift 2 ;;
    --model)         MODEL_OVERRIDE="$2";       shift 2 ;;
    --ga-model)      GA_MODEL_OVERRIDE="$2";   shift 2 ;;
    --ga-key)        GA_KEY_OVERRIDE="$2";     shift 2 ;;
    --ga-endpoint)   GA_ENDPOINT_OVERRIDE="$2"; shift 2 ;;
    --ga-format)     GA_FORMAT_OVERRIDE="$2";  shift 2 ;;
    --wrapper)       WRAPPER_NAME="$2";        shift 2 ;;
    --v2)            USE_V2=true;           shift ;;
    --sequential)    PARALLEL=false;        shift ;;
    --max-parallel)  MAX_PARALLEL="$2";     shift 2 ;;
    --optimize)      OPTIMIZE=true;        shift ;;
    --max-iter)      MAX_ITER="$2";         shift 2 ;;
    --rerun-failures) RERUN_FAILURES="$2"; shift 2 ;;
    --ab-test)       AB_TEST=true;        shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Auto-load GA model config from .ga-models.json if no overrides ──
GA_MODELS_FILE="$HOME/.claude/hooks/.ga-models.json"
if [[ -z "$GA_MODEL_OVERRIDE" && -f "$GA_MODELS_FILE" ]]; then
  _ga_config=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$GA_MODELS_FILE','utf8'));
    const m = c.active && c.models?.[c.active];
    if (m) console.log([m.model, m.key||'', m.endpoint||'', m.format||''].join('\n'));
  " 2>/dev/null)
  if [[ -n "$_ga_config" ]]; then
    IFS=$'\n' read -rd '' GA_MODEL_OVERRIDE GA_KEY_OVERRIDE GA_ENDPOINT_OVERRIDE GA_FORMAT_OVERRIDE <<< "$_ga_config" || true
  fi
fi

# ── Rerun-failures mode ───────────────────────────────────────────────
if [[ -n "$RERUN_FAILURES" ]]; then
  # Resolve to absolute path
  if [[ ! "$RERUN_FAILURES" = /* ]]; then
    RERUN_FAILURES="$SCRIPT_DIR/results/$RERUN_FAILURES"
  fi
  SUMMARY_FILE="$RERUN_FAILURES/summary.json"
  if [[ ! -f "$SUMMARY_FILE" ]]; then
    echo -e "${RED}ERROR: summary.json not found in $RERUN_FAILURES${NC}" >&2
    echo "  Expected: $SUMMARY_FILE" >&2
    exit 1
  fi

  # Extract failure scenario files from summary.json
  FAILURE_SCENARIOS=($(node -e "
    const s = require('$SUMMARY_FILE');
    const failures = s.failures || [];
    // Deduplicate scenario paths
    const seen = new Set();
    failures.forEach(f => { if (!seen.has(f.scenario)) { seen.add(f.scenario); console.log(f.scenario); } });
  "))

  if [[ ${#FAILURE_SCENARIOS[@]} -eq 0 ]]; then
    echo -e "${GREEN}No failures found in $RERUN_FAILURES — nothing to rerun.${NC}"
    exit 0
  fi

  # Determine conditions for rerun
  RERUN_CONDITIONS="A,B,C"
  if [[ "$AB_TEST" == "true" ]]; then
    RERUN_CONDITIONS="A,B,C,D"
  fi
  if [[ -n "$CONDITION_FILTER" ]]; then
    RERUN_CONDITIONS="$CONDITION_FILTER"
    if [[ "$AB_TEST" == "true" && ! "$CONDITION_FILTER" == *"D"* ]]; then
      RERUN_CONDITIONS="${CONDITION_FILTER},D"
    fi
  fi

  IFS=',' read -ra RERUN_CONDS <<< "$RERUN_CONDITIONS"

  echo "═══════════════════════════════════════════════════════"
  echo "  Guardian Angel Clinical Trial v3 — Rerun Failures"
  echo "  Source run: $(basename "$RERUN_FAILURES")"
  echo "  Failures to rerun: ${#FAILURE_SCENARIOS[@]}"
  echo "  Conditions: $RERUN_CONDITIONS"
  echo "  Wrapper C: $WRAPPER_NAME"
  [[ "$AB_TEST" == "true" ]] && echo "  Wrapper D: alternative"
  [[ -n "$MODEL_OVERRIDE" ]] && echo "  Agent model: $MODEL_OVERRIDE"
  [[ -n "$GA_MODEL_OVERRIDE" ]] && echo "  GA model: $GA_MODEL_OVERRIDE"
  echo "═══════════════════════════════════════════════════════"
  echo ""

  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    echo -e "${RED}ERROR: ANTHROPIC_API_KEY is not set.${NC}" >&2; exit 1
  fi

  # Build Docker images
  echo "[1/3] Building Docker images..."
  DOCKER_BUILDKIT=1 docker build -t guardian-angel-trial "$SCRIPT_DIR" --progress=plain 2>&1
  echo "      ✓ guardian-angel-trial"
  DOCKER_BUILDKIT=1 docker build -t guardian-angel-mock "$SCRIPT_DIR/mock-server" --progress=plain 2>&1
  echo "      ✓ guardian-angel-mock"

  # Set up network
  echo "[2/3] Setting up Docker network..."
  docker network inspect "$NETWORK" &>/dev/null || docker network create "$NETWORK"
  echo "      ✓ Network: $NETWORK"

  # Start single mock server for all failures
  MOCK_CONTAINER="ga-mock-rerun"
  docker rm -f "$MOCK_CONTAINER" &>/dev/null || true
  docker run -d --name "$MOCK_CONTAINER" --network "$NETWORK" --network-alias ga-mock-server guardian-angel-mock &>/dev/null
  for i in $(seq 1 15); do
    if docker exec "$MOCK_CONTAINER" wget -qO- http://127.0.0.1:9999/health 2>/dev/null | grep -q ok; then break; fi
    sleep 1
  done

  mkdir -p "$RAW_DIR"

  echo "[3/3] Running ${#FAILURE_SCENARIOS[@]} failure scenarios × ${#RERUN_CONDS[@]} conditions..."
  echo ""

  PASS=0; FAIL=0; IDX=0
  TOTAL=$(( ${#FAILURE_SCENARIOS[@]} * ${#RERUN_CONDS[@]} ))

  for SCENARIO in "${FAILURE_SCENARIOS[@]}"; do
    SCENARIO_PATH="$SCRIPT_DIR/scenarios/$SCENARIO"
    CATEGORY="${SCENARIO%%/*}"

    for CONDITION in "${RERUN_CONDS[@]}"; do
      (( IDX++ )) || true
      echo -e "  ${CYAN}[${IDX}/${TOTAL}] ${SCENARIO} × Condition ${CONDITION}${NC}"

      DOCKER_ENV=(
        -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
        -e "CONDITION=$CONDITION"
        -e "SCENARIO_FILE=$SCENARIO"
        -e "MOCK_SERVER_URL=http://$MOCK_CONTAINER:9999"
        -e "WRAPPER_FILE=$WRAPPER_NAME"
      )
      [[ -n "$MODEL_OVERRIDE" ]] && DOCKER_ENV+=(-e "MODEL=$MODEL_OVERRIDE")
      append_ga_env

      EXIT_CODE=0
      docker run --rm --init --network "$NETWORK" \
        --memory 512m --cpus 1 --pids-limit 256 \
        "${DOCKER_ENV[@]}" \
        -v "$SCENARIO_PATH:/scenarios/$SCENARIO:ro" \
        -v "$RAW_DIR:/results" \
        -v "$SCRIPT_DIR/wrappers:/wrappers:ro" \
        -v "$RATE_LIMIT_DIR:/rate-limit" \
        guardian-angel-trial || EXIT_CODE=$?

      if [[ $EXIT_CODE -eq 0 ]]; then
        ((PASS++)) || true
      else
        echo -e "  ${RED}ERROR (exit $EXIT_CODE)${NC}"
        ((FAIL++)) || true
      fi
    done
  done

  # Cleanup mock server
  docker rm -f "$MOCK_CONTAINER" &>/dev/null || true

  # Collect metrics — single report
  echo ""
  echo "Computing metrics..."
  RESULT_COUNT=$(find "$RAW_DIR" -name "*.json" | wc -l | tr -d ' ')

  if [[ "$RESULT_COUNT" -gt 0 ]]; then
    node "$SCRIPT_DIR/harness/collect-metrics.js" "$RUN_DIR"
  else
    echo -e "${YELLOW}No result files found — skipping metrics.${NC}"
  fi

  rm -rf "$RATE_LIMIT_DIR" 2>/dev/null

  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Rerun complete: $PASS passed, $FAIL failed"
  echo "  (of $TOTAL runs from ${#FAILURE_SCENARIOS[@]} failures)"
  echo "  Results: $RUN_DIR ($RESULT_COUNT files)"
  echo "  Report:  $RUN_DIR/report.md"
  echo "═══════════════════════════════════════════════════════"
  exit 0
fi

# ── Determine scenario directories ──────────────────────────────────
if [[ "$USE_V2" == "true" ]]; then
  SCENARIO_DIRS=("archive/benign-v2" "archive/credential-v2" "archive/destruction-v2" "archive/injection-v2")
else
  SCENARIO_DIRS=(
    "credential-exfiltration"
    "data-destruction"
    "data-modification"
    "privilege-escalation"
    "prompt-injection"
    "remote-code-execution"
    "supply-chain"
    "information-disclosure"
    "unauthorized-network"
    "social-engineering"
    "config-tampering"
    "resource-exhaustion"
    "environment-manipulation"
    "log-tampering"
    "backdoor-persistence"
    "container-escape"
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
  CONDITIONS_CSV="A,B,C,D"
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
[[ -n "$MODEL_OVERRIDE" ]] && echo "  Agent model: $MODEL_OVERRIDE"
[[ -n "$GA_MODEL_OVERRIDE" ]] && echo "  GA model: $GA_MODEL_OVERRIDE"
[[ -n "$GA_ENDPOINT_OVERRIDE" ]] && echo "  GA endpoint: $GA_ENDPOINT_OVERRIDE"
[[ -n "$CATEGORY_FILTER" ]] && echo "  Category: $CATEGORY_FILTER"
[[ -n "$CONDITION_FILTER" ]] && echo "  Condition: $CONDITION_FILTER"
[[ -n "$SCENARIO_FILTER" ]] && echo "  Scenario: $SCENARIO_FILTER"
[[ "$OPTIMIZE" == "true" ]] && echo "  Optimization: enabled (max $MAX_ITER iterations)"
[[ -n "$RERUN_FAILURES" ]] && echo "  Rerun failures from: $(basename "$RERUN_FAILURES")"
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
  docker run -d --name "$MOCK_CONTAINER" --network "$NETWORK" --network-alias ga-mock-server guardian-angel-mock &>/dev/null
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
    append_ga_env

    docker run --rm --init --network "$NETWORK" \
      --memory 512m --cpus 1 --pids-limit 256 \
      "${DOCKER_ENV[@]}" \
      -v "$SCENARIO_PATH:/scenarios/$SCENARIO_FILTER:ro" \
      -v "$RAW_DIR:/results" \
      -v "$SCRIPT_DIR/wrappers:/wrappers:ro" \
      -v "$RATE_LIMIT_DIR:/rate-limit" \
      guardian-angel-trial || true
  done

  docker rm -f "$MOCK_CONTAINER" &>/dev/null || true

# ── Parallel mode (max 6 concurrent workers) ─────────────────────────
elif [[ "$PARALLEL" == "true" ]]; then
  DEFAULT_MAX_PARALLEL=6
  [[ $MAX_PARALLEL -eq 0 ]] && MAX_PARALLEL=$DEFAULT_MAX_PARALLEL

  WORKER_PIDS=()
  WORKER_CATS=()
  WORKER_LOGS=()
  ACTIVE_PIDS=()

  echo -e "  ${CYAN}Max parallel workers: $MAX_PARALLEL${NC}"
  echo ""

  for i in "${!SCENARIO_DIRS[@]}"; do
    CATEGORY="${SCENARIO_DIRS[$i]}"
    MOCK_PORT=$((10000 + i))
    LOG_FILE="$RUN_DIR/${CATEGORY}.log"
    WORKER_LOGS+=("$LOG_FILE")
    WORKER_CATS+=("$CATEGORY")

    # Wait for a slot if at capacity
    while (( ${#ACTIVE_PIDS[@]} >= MAX_PARALLEL )); do
      # Wait for any one child to finish
      wait -n "${ACTIVE_PIDS[@]}" 2>/dev/null || true
      # Rebuild active list (remove finished PIDs)
      NEW_ACTIVE=()
      for PID in "${ACTIVE_PIDS[@]}"; do
        if kill -0 "$PID" 2>/dev/null; then
          NEW_ACTIVE+=("$PID")
        fi
      done
      ACTIVE_PIDS=("${NEW_ACTIVE[@]}")
    done

    echo -e "  ${CYAN}▶ Starting worker: $CATEGORY (${#ACTIVE_PIDS[@]}/$MAX_PARALLEL active)${NC}"

    bash "$SCRIPT_DIR/run-category.sh" \
      "$CATEGORY" "$MOCK_PORT" "$RAW_DIR" "$NETWORK" "$MODEL_OVERRIDE" "$CONDITIONS_CSV" "$WRAPPER_NAME" "$RATE_LIMIT_DIR" \
      "$GA_MODEL_OVERRIDE" "$GA_KEY_OVERRIDE" "$GA_ENDPOINT_OVERRIDE" "$GA_FORMAT_OVERRIDE" \
      > "$LOG_FILE" &

    WORKER_PIDS+=($!)
    ACTIVE_PIDS+=($!)
  done

  echo ""
  echo -e "  ${CYAN}All workers launched. Waiting for completion...${NC}"
  echo ""

  # Wait for all workers to finish
  for PID in "${WORKER_PIDS[@]}"; do
    wait "$PID" 2>/dev/null || true
  done

  echo ""

  WORKER_FAILURES=0
  for i in "${!WORKER_CATS[@]}"; do
    CATEGORY="${WORKER_CATS[$i]}"
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
      "$CATEGORY" "$MOCK_PORT" "$RAW_DIR" "$NETWORK" "$MODEL_OVERRIDE" "$CONDITIONS_CSV" "$WRAPPER_NAME" "$RATE_LIMIT_DIR" \
      "$GA_MODEL_OVERRIDE" "$GA_KEY_OVERRIDE" "$GA_ENDPOINT_OVERRIDE" "$GA_FORMAT_OVERRIDE" \
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

# Clean up rate limiter
rm -rf "$RATE_LIMIT_DIR" 2>/dev/null

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Trial complete"
echo "  Mode: $MODE_LABEL"
echo "  Results: $RUN_DIR ($RESULT_COUNT files)"
echo "  Report:  $RUN_DIR/report.md"
echo "═══════════════════════════════════════════════════════"
