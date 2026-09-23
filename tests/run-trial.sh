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
#   ./run-trial.sh --s1-mode shadow                 # System 1 (jev): enforce | shadow | off
#   ./run-trial.sh --s1-key ts-...                  # TypeSafe API key (or TYPESAFE_API_KEY, or .ga-models.json)
#   ./run-trial.sh --s1-spec system1                # System 1 spec: wrappers/<name>.json (default: system1-unified)
#   ./run-trial.sh --optimize [--max-iter N]        # run optimization loop
#   ./run-trial.sh --sequential                     # serial mode
#   ./run-trial.sh --v2                             # run legacy v2 scenarios
#   ./run-trial.sh --resume run-20260922-053624     # continue an interrupted run (skips completed scenario×condition pairs)
#
# Every run writes results/run-<timestamp>/run-config.json (conditions, wrapper, models,
# System 1 mode + spec). --resume reloads it, so the continuation runs under exactly the
# original configuration; a conflicting explicit flag is refused. The defaults, with no
# flags, are what production installs: wrapper default.txt, System 1 spec system1-unified.
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
# System 1 (jev) settings travel as exported GA_S1_* variables so that
# run-category.sh workers inherit them without new positional arguments.
append_ga_env() {
  [[ -n "${GA_S1_KEY:-}" ]]  && DOCKER_ENV+=(-e "GA_S1_KEY=$GA_S1_KEY")
  [[ -n "${GA_S1_MODE:-}" ]] && DOCKER_ENV+=(-e "GA_S1_MODE=$GA_S1_MODE")
  [[ -n "${GA_S1_SPEC:-}" ]] && DOCKER_ENV+=(-e "GA_S1_SPEC=$GA_S1_SPEC")
  [[ -n "${GA_S1_MODEL:-}" ]] && DOCKER_ENV+=(-e "GA_S1_MODEL=$GA_S1_MODEL")
  [[ -n "$GA_MODEL_OVERRIDE" ]]    && DOCKER_ENV+=(-e "GA_MODEL=$GA_MODEL_OVERRIDE")
  [[ -n "$GA_KEY_OVERRIDE" ]]      && DOCKER_ENV+=(-e "GA_API_KEY=$GA_KEY_OVERRIDE")
  [[ -n "$GA_ENDPOINT_OVERRIDE" ]] && DOCKER_ENV+=(-e "GA_API_BASE=$GA_ENDPOINT_OVERRIDE")
  [[ -n "$GA_FORMAT_OVERRIDE" ]]   && DOCKER_ENV+=(-e "GA_API_FORMAT=$GA_FORMAT_OVERRIDE")
  [[ -n "${GA_OPTIONS_OVERRIDE:-}" ]] && DOCKER_ENV+=(-e "GA_API_OPTIONS=$GA_OPTIONS_OVERRIDE")
  return 0   # never let a false final [[ … ]] test make this function (and, under set -e, the script) exit non-zero
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
RESUME_RUN=""
EXPLICIT=()           # flags given on the command line (checked against a resumed run's saved config)
RESUME_CONFIG=""
RESUME_CATEGORIES=""   # comma-separated category list restored from a resumed run's config

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --condition)     CONDITION_FILTER="$2"; EXPLICIT+=(condition); shift 2 ;;
    --scenario)      SCENARIO_FILTER="$2";  shift 2 ;;
    --category)      CATEGORY_FILTER="$2";  EXPLICIT+=(category);  shift 2 ;;
    --model)         MODEL_OVERRIDE="$2";       EXPLICIT+=(model);       shift 2 ;;
    --ga-model)      GA_MODEL_OVERRIDE="$2";   EXPLICIT+=(ga_model);    shift 2 ;;
    --ga-key)        GA_KEY_OVERRIDE="$2";     shift 2 ;;
    --ga-endpoint)   GA_ENDPOINT_OVERRIDE="$2"; EXPLICIT+=(ga_endpoint); shift 2 ;;
    --ga-format)     GA_FORMAT_OVERRIDE="$2";  EXPLICIT+=(ga_format);   shift 2 ;;
    --s1-mode)       export GA_S1_MODE="$2";   EXPLICIT+=(s1_mode);     shift 2 ;;
    --s1-key)        export GA_S1_KEY="$2";    shift 2 ;;
    --s1-spec)       export GA_S1_SPEC="$2";   EXPLICIT+=(s1_spec);     shift 2 ;;
    --wrapper)       WRAPPER_NAME="$2";        EXPLICIT+=(wrapper);     shift 2 ;;
    --v2)            USE_V2=true;           shift ;;
    --sequential)    PARALLEL=false;        shift ;;
    --max-parallel)  MAX_PARALLEL="$2";     shift 2 ;;
    --optimize)      OPTIMIZE=true;        shift ;;
    --max-iter)      MAX_ITER="$2";         shift 2 ;;
    --rerun-failures) RERUN_FAILURES="$2"; shift 2 ;;
    --ab-test)       AB_TEST=true;        shift ;;
    --resume)        RESUME_RUN="$2";     shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Resume mode: continue an interrupted run in place ───────────────
# Reuses the existing results/run-<timestamp>/ directory and tells the category
# workers to skip any scenario×condition pair that already has a completed
# (non-error) raw result. Everything else — wrapper, models, conditions — must be
# passed again exactly as on the original invocation.
if [[ -n "$RESUME_RUN" ]]; then
  [[ "$RESUME_RUN" = /* ]] || RESUME_RUN="$SCRIPT_DIR/results/$RESUME_RUN"
  if [[ ! -d "$RESUME_RUN/raw" ]]; then
    echo -e "${RED}ERROR: no raw/ directory in $RESUME_RUN — nothing to resume.${NC}" >&2
    exit 1
  fi
  RUN_DIR="$RESUME_RUN"
  RAW_DIR="$RUN_DIR/raw"
  TIMESTAMP="$(basename "$RUN_DIR")"; TIMESTAMP="${TIMESTAMP#run-}"
  export SKIP_EXISTING=1

  # Reload the configuration the run was started with. Anything that changes what the
  # results MEASURE (wrapper, models, System 1 mode/spec) is taken from the saved config;
  # an explicit flag that disagrees is an error, because mixing configurations inside one
  # run silently corrupts every figure in its report. --condition and --category only
  # narrow the work and may be given freely.
  RESUME_CONFIG="$RUN_DIR/run-config.json"
  if [[ -f "$RESUME_CONFIG" ]]; then
    _cfg=$(node -e "
      const c = JSON.parse(require('fs').readFileSync('$RESUME_CONFIG','utf8'));
      const g = k => c[k] == null ? '' : String(c[k]);
      const cats = Array.isArray(c.categories) ? c.categories.join(',') : '';
      console.log([g('wrapper'), g('model'), g('ga_model'), g('ga_endpoint'), g('ga_format'), g('s1_mode'), g('s1_spec'), g('v2'), g('conditions'), cats].join('|'));
    ")
    IFS='|' read -r _c_wrapper _c_model _c_ga_model _c_ga_endpoint _c_ga_format _c_s1_mode _c_s1_spec _c_v2 _c_conditions _c_categories <<< "$_cfg" || true
    _conflict=""
    _check() { # name saved current
      local name="$1" saved="$2" current="$3"
      for e in "${EXPLICIT[@]:-}"; do
        if [[ "$e" == "$name" && "$saved" != "$current" ]]; then
          _conflict+="  --${name//_/-}: run was started with '${saved:-<default>}', you passed '${current}'\n"
        fi
      done
    }
    _check wrapper     "$_c_wrapper"     "$WRAPPER_NAME"
    _check model       "$_c_model"       "$MODEL_OVERRIDE"
    _check ga_model    "$_c_ga_model"    "$GA_MODEL_OVERRIDE"
    _check ga_endpoint "$_c_ga_endpoint" "$GA_ENDPOINT_OVERRIDE"
    _check ga_format   "$_c_ga_format"   "$GA_FORMAT_OVERRIDE"
    _check s1_mode     "$_c_s1_mode"     "${GA_S1_MODE:-}"
    _check s1_spec     "$_c_s1_spec"     "${GA_S1_SPEC:-}"
    if [[ -n "$_conflict" ]]; then
      echo -e "${RED}ERROR: --resume configuration conflict. A resumed run must use the configuration it was started with:${NC}" >&2
      echo -e "$_conflict" >&2
      echo "  Drop the conflicting flag(s) to resume, or start a new run for a different configuration." >&2
      exit 1
    fi
    WRAPPER_NAME="${_c_wrapper:-default}"
    MODEL_OVERRIDE="$_c_model"
    GA_MODEL_OVERRIDE="$_c_ga_model"
    GA_ENDPOINT_OVERRIDE="$_c_ga_endpoint"
    GA_FORMAT_OVERRIDE="$_c_ga_format"
    [[ -n "$_c_s1_mode" ]] && export GA_S1_MODE="$_c_s1_mode"
    [[ -n "$_c_s1_spec" ]] && export GA_S1_SPEC="$_c_s1_spec"
    [[ "$_c_v2" == "true" ]] && USE_V2=true
    # Conditions and categories: the saved set unless narrowed explicitly on the command line.
    # (Without this, a bare --resume would fall back to the A,B,C,D default and run conditions
    # the original run never asked for.)
    _given() { for e in "${EXPLICIT[@]:-}"; do [[ "$e" == "$1" ]] && return 0; done; return 1; }
    if ! _given condition && [[ -n "$_c_conditions" ]]; then CONDITION_FILTER="$_c_conditions"; fi
    if ! _given category && [[ -n "$_c_categories" ]]; then RESUME_CATEGORIES="$_c_categories"; fi
    echo "Resuming with the saved configuration from $(basename "$RUN_DIR")/run-config.json"
  else
    echo -e "${YELLOW}WARNING: $RUN_DIR has no run-config.json (started by an older harness).${NC}" >&2
    echo -e "${YELLOW}         Pass EVERY flag the original invocation used (wrapper, models, --s1-mode, --s1-spec) or the continuation will run under a different configuration.${NC}" >&2
  fi
fi

# ── Auto-load GA model config from .ga-models.json if no overrides ──
GA_MODELS_FILE="$HOME/.claude/hooks/.ga-models.json"
if [[ ( -z "$GA_MODEL_OVERRIDE" || ( -n "$RESUME_CONFIG" && -z "$GA_KEY_OVERRIDE" ) ) && -f "$GA_MODELS_FILE" ]]; then
  # Fresh run: the active profile. Resume: the profile whose model matches the saved
  # config (its key/endpoint/format are needed; the model name alone is not enough).
  _ga_config=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$GA_MODELS_FILE','utf8'));
    const want = process.argv[1];
    const m = want
      ? Object.values(c.models || {}).find(p => p.model === want)
      : (c.active && c.models?.[c.active]);
    if (m) console.log([m.model, m.key||'', m.endpoint||'', m.format||'', m.options?JSON.stringify(m.options):''].join('|'));
  " "$GA_MODEL_OVERRIDE" 2>/dev/null)
  if [[ -n "$GA_MODEL_OVERRIDE" && -z "$_ga_config" ]]; then
    echo -e "${RED}ERROR: resumed run used GA model '$GA_MODEL_OVERRIDE' but no profile in $GA_MODELS_FILE has that model; pass --ga-key/--ga-endpoint/--ga-format explicitly.${NC}" >&2
    exit 1
  fi
  if [[ -n "$_ga_config" ]]; then
    IFS='|' read -r GA_MODEL_OVERRIDE GA_KEY_OVERRIDE GA_ENDPOINT_OVERRIDE GA_FORMAT_OVERRIDE GA_OPTIONS_OVERRIDE <<< "$_ga_config" || true
    export GA_OPTIONS_OVERRIDE
  fi
fi

# ── Auto-load System 1 (jev) key: --s1-key → TYPESAFE_API_KEY → .ga-models.json ──
if [[ -z "${GA_S1_KEY:-}" && -n "${TYPESAFE_API_KEY:-}" ]]; then
  export GA_S1_KEY="$TYPESAFE_API_KEY"
fi
if [[ -z "${GA_S1_KEY:-}" && -f "$GA_MODELS_FILE" ]]; then
  _s1_key=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$GA_MODELS_FILE','utf8'));
    if (c.system1?.key) console.log(c.system1.key);
  " 2>/dev/null || true)
  [[ -n "$_s1_key" ]] && export GA_S1_KEY="$_s1_key"
fi
if [[ -z "${GA_S1_KEY:-}" && "${GA_S1_MODE:-enforce}" != "off" ]]; then
  echo "NOTE: no TypeSafe API key found — System 1 (jev) will defer every call to System 2." >&2
  echo "      Set one with: node guardian-angel/install.js --set-system1-key <key>" >&2
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
  echo "  Agent model: ${MODEL_OVERRIDE:-claude-haiku-4-5-20251001}"
  echo "  GA model:    ${GA_MODEL_OVERRIDE:-claude-haiku-4-5-20251001}"
  echo "  System 1:    jev (${GA_S1_MODE:-enforce}), spec ${GA_S1_SPEC:-system1-unified}$([[ -z "${GA_S1_KEY:-}" ]] && echo ' — NO KEY, deferring all')"
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
elif [[ -n "$RESUME_CATEGORIES" ]]; then
  IFS=',' read -ra SCENARIO_DIRS <<< "$RESUME_CATEGORIES"
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

# Condition D runs the alternative prompt. When alternative.txt is byte-identical to the
# canonical default.txt (i.e. no experimental variant is loaded), D would just duplicate C,
# so drop it. This keeps A,B,C,D the default while making D a no-op until someone edits
# alternative.txt to test a refinement. An explicit --condition D overrides this.
DEFAULT_WRAPPER="$SCRIPT_DIR/wrappers/${WRAPPER_NAME}.txt"
ALT_WRAPPER="$SCRIPT_DIR/wrappers/alternative.txt"
if [[ "$CONDITIONS_CSV" == *"D"* && -f "$DEFAULT_WRAPPER" && -f "$ALT_WRAPPER" ]] \
   && cmp -s "$DEFAULT_WRAPPER" "$ALT_WRAPPER"; then
  if [[ "$CONDITION_FILTER" == "D" ]]; then
    echo -e "${YELLOW:-}NOTE: alternative.txt is identical to ${WRAPPER_NAME}.txt — condition D is the same as C.${NC:-}" >&2
  else
    CONDITIONS_CSV="$(echo "$CONDITIONS_CSV" | sed -E 's/,?D//; s/^,//')"
    echo -e "${YELLOW:-}NOTE: alternative.txt matches ${WRAPPER_NAME}.txt — skipping condition D (no variant to test).${NC:-}" >&2
  fi
fi

# ── Record the run configuration ─────────────────────────────────────
# Written once, at the start, so --resume (and anyone reading the results later)
# knows exactly what this run measures. Keys are never written here.
if [[ -z "$RESUME_RUN" && "$OPTIMIZE" != "true" ]]; then
  mkdir -p "$RUN_DIR"
  _s1_key_present=false; [[ -n "${GA_S1_KEY:-}" ]] && _s1_key_present=true
  _sequential=false;     [[ "$PARALLEL" == "false" ]] && _sequential=true
  node -e "
    const fs = require('fs');
    const cfg = {
      run: 'run-$TIMESTAMP', started: new Date().toISOString(),
      conditions: '$CONDITIONS_CSV', categories: process.argv.slice(1),
      wrapper: '$WRAPPER_NAME', alternative_wrapper: 'alternative',
      model: '${MODEL_OVERRIDE}' || null, ga_model: '${GA_MODEL_OVERRIDE}' || null,
      ga_endpoint: '${GA_ENDPOINT_OVERRIDE}' || null, ga_format: '${GA_FORMAT_OVERRIDE}' || null,
      s1_mode: '${GA_S1_MODE:-enforce}', s1_spec: '${GA_S1_SPEC:-system1-unified}', s1_key_present: $_s1_key_present,
      v2: $USE_V2, sequential: $_sequential,
    };
    fs.writeFileSync('$RUN_DIR/run-config.json', JSON.stringify(cfg, null, 2) + '\n');
  " "${SCENARIO_DIRS[@]}"
fi

# ── Preflight ─────────────────────────────────────────────────────────
MODE_LABEL="parallel"
[[ "$PARALLEL" == "false" ]] && MODE_LABEL="sequential"

AGENT_DISPLAY="${MODEL_OVERRIDE:-claude-haiku-4-5-20251001}"
GA_DISPLAY="${GA_MODEL_OVERRIDE:-claude-haiku-4-5-20251001}"

echo "═══════════════════════════════════════════════════════"
echo "  Guardian Angel Clinical Trial v3"
echo "  Run: $TIMESTAMP"
echo "  Mode: $MODE_LABEL (${#SCENARIO_DIRS[@]} categories)"
echo "  Conditions: $CONDITIONS_CSV"
echo "  Wrapper: $WRAPPER_NAME"
echo "  Agent model: $AGENT_DISPLAY"
echo "  GA model:    $GA_DISPLAY"
[[ -n "$GA_ENDPOINT_OVERRIDE" ]] && echo "  GA endpoint: $GA_ENDPOINT_OVERRIDE"
echo "  System 1:    jev (${GA_S1_MODE:-enforce}), spec ${GA_S1_SPEC:-system1-unified}$([[ -z "${GA_S1_KEY:-}" ]] && echo ' — NO KEY, deferring all')"
[[ -n "$CATEGORY_FILTER" ]] && echo "  Category: $CATEGORY_FILTER"
[[ -n "$CONDITION_FILTER" ]] && echo "  Condition: $CONDITION_FILTER"
[[ -n "$SCENARIO_FILTER" ]] && echo "  Scenario: $SCENARIO_FILTER"
[[ "$OPTIMIZE" == "true" ]] && echo "  Optimization: enabled (max $MAX_ITER iterations)"
[[ -n "$RERUN_FAILURES" ]] && echo "  Rerun failures from: $(basename "$RERUN_FAILURES")"
[[ -n "$RESUME_RUN" ]] && echo "  Resuming: $(basename "$RUN_DIR") ($(find "$RAW_DIR" -name "*.json" | wc -l | tr -d " ") results already present)"
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
      >> "$LOG_FILE" &

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
