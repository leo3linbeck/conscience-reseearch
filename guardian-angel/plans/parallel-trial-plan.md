# Parallelize Clinical Trial by Category

## Context

The v2 trial runs 30 scenarios × 4 conditions = 120 runs sequentially. At ~3-5 minutes per run (Messages API round-trips), a full trial takes 6-10 hours. The user wants to parallelize by category, running one Docker worker per category (injection-v2, credential-v2, destruction-v2, benign-v2) simultaneously, reducing wall-clock time to ~25% of sequential.

### Critical blocker

The mock server (`tests/mock-server/server.js`) uses a **global request list** with `/clear` between scenarios. Parallel scenarios would race on `/clear` and `/requests`, corrupting exfiltration evidence. This must be solved.

---

## Approach: Per-Category Mock Server Instances

Each category gets its own mock server container on a unique port. Zero shared state between categories. Within each category, scenarios still run sequentially (per condition), so the existing `/clear`+`/requests` pattern works unchanged.

### Architecture

```
run-trial.sh (orchestrator)
  ├── Worker 0: injection-v2    ← mock-server:10000
  ├── Worker 1: credential-v2   ← mock-server:10001
  ├── Worker 2: destruction-v2  ← mock-server:10002
  └── Worker 3: benign-v2       ← mock-server:10003
       │
       └── For each scenario × condition:
             docker run → api-client → mock-server:100XX
```

Each worker is a background shell process that:
1. Starts its own mock server container on a unique port
2. Runs all scenarios in its category across all 4 conditions sequentially
3. Stops its mock server when done
4. All workers write results to the same `results/run-<timestamp>/raw/` directory (filenames already collision-safe)

### Why per-category (not per-scenario or per-condition)

- **Per-scenario** (120 parallel) = too many containers, API rate limit issues
- **Per-condition** (4 parallel) = doesn't help much, conditions share scenarios
- **Per-category** (4 parallel) = natural grouping, mock server isolation is trivial, manageable API load (~4 concurrent API calls)

---

## Files to Create/Modify

### New: `tests/run-category.sh` — Category Worker Script

Runs all scenarios for one category across all conditions. Called by the orchestrator.

```
Arguments:
  $1  CATEGORY_DIR    e.g. "injection-v2"
  $2  MOCK_PORT       e.g. "10000"
  $3  RAW_DIR         shared results directory
  $4  NETWORK         Docker network name
  $5  MODEL           (optional) model override

Flow:
  1. Start mock server: docker run -d --name ga-mock-$CATEGORY -p $MOCK_PORT:9999 --network $NETWORK
  2. Wait for health check
  3. For each scenario.json in scenarios/$CATEGORY_DIR/:
       For each condition in (positive-control negative-control treatment combination):
         docker run --rm --network $NETWORK \
           -e MOCK_SERVER_URL=http://ga-mock-$CATEGORY:9999 \
           -e CONDITION=$condition -e SCENARIO_FILE=$rel \
           ... guardian-angel-trial
  4. Stop and remove mock server container
  5. Exit with pass/fail count
```

### Modified: `tests/run-trial.sh` — Orchestrator

Replace the sequential scenario×condition loop with:
1. Build images (same as now)
2. Create network (same)
3. Launch 4 `run-category.sh` workers as background processes
4. Wait for all workers to complete (`wait`)
5. Collect metrics (same)
6. Report combined results

Key changes:
- Remove mock server start/stop (workers handle their own)
- Remove sequential scenario loop (replaced by parallel worker launch)
- Add `--parallel` flag (default on, `--sequential` to disable)
- Add `--max-parallel N` to limit concurrent categories (default: all)
- Pass through `--condition` filter to workers if specified
- Aggregate pass/fail counts from worker exit codes

### Modified: `tests/mock-server/server.js` — No changes needed

Each category worker starts its own mock server container. The existing global `/clear` + `/requests` pattern works because within each worker, scenarios run sequentially. No mock server code changes required.

### Modified: `tests/harness/run-scenario.js` — No changes needed

Already accepts `MOCK_SERVER_URL` as env var. Each worker passes its own mock URL.

---

## Detailed run-trial.sh Changes

```bash
# Current (sequential):
for SCENARIO_PATH in "${SCENARIOS[@]}"; do
  for CONDITION in "${CONDITIONS[@]}"; do
    docker run ...
  done
done

# New (parallel by category):
PIDS=()
for i in "${!SCENARIO_DIRS[@]}"; do
  CATEGORY="${SCENARIO_DIRS[$i]}"
  MOCK_PORT=$((10000 + i))

  bash "$SCRIPT_DIR/run-category.sh" \
    "$CATEGORY" "$MOCK_PORT" "$RAW_DIR" "$NETWORK" "$MODEL_OVERRIDE" \
    2>&1 | sed "s/^/[$CATEGORY] /" &

  PIDS+=($!)
done

# Wait for all workers
FAILURES=0
for PID in "${PIDS[@]}"; do
  wait $PID || ((FAILURES++))
done
```

### Output format

Each worker prefixes its output with `[category-name]` so logs from parallel workers are distinguishable:

```
[injection-v2]   [  1/ 32] injection-v2/001-log-analysis.json    × positive-control   ✅ verdict=PERMISSION_BLOCK
[benign-v2]      [  1/ 40] benign-v2/001-run-tests.json          × positive-control   ✅ verdict=BENIGN_PERM_BLOCK
[credential-v2]  [  1/ 24] credential-v2/001-debug-aws.json      × positive-control   ✅ verdict=PERMISSION_BLOCK
[destruction-v2] [  1/ 24] destruction-v2/001-clean-builds.json   × positive-control   ✅ verdict=PERMISSION_BLOCK
```

---

## API Rate Limit Handling

With 4 parallel workers, we'll have up to 4 concurrent Messages API calls. At Sonnet pricing and standard rate limits this should be fine, but we add:

1. **Retry with backoff in api-client.js**: The `@anthropic-ai/sdk` has built-in retry for 429 responses. We'll configure it explicitly:
   ```js
   this.client = new Anthropic({ maxRetries: 3 });
   ```

2. **`--max-parallel N` flag**: Allows throttling to fewer concurrent workers if rate limits are hit.

---

## Timing Estimates

| Mode | Scenarios | Runs | Est. Time |
|------|-----------|------|-----------|
| Sequential (current) | 30 | 120 | 6-10 hours |
| Parallel × 4 categories | 30 | 120 | 1.5-2.5 hours |
| Parallel + Haiku model | 30 | 120 | 30-60 min |

---

## Implementation Sequence

1. Create `tests/run-category.sh` (worker script)
2. Modify `tests/run-trial.sh` (parallel orchestration)
3. Add retry config to `tests/harness/api-client.js` (one line)
4. Test: run 2 categories in parallel, verify no mock server interference
5. Test: full parallel trial run

---

## Verification

1. **Mock isolation**: Run injection-v2 worker and benign-v2 worker simultaneously. Verify that injection scenarios see their own exfil requests and benign scenarios see none.
2. **Result integrity**: After parallel run, verify all 120 result JSONs exist in `raw/` with correct filenames.
3. **Metrics**: Run `collect-metrics.js` on parallel results — should produce identical report structure.
4. **Sequential fallback**: `./run-trial.sh --sequential` should work identically to old behavior.
