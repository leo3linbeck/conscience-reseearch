#!/usr/bin/env node
/**
 * Guardian Angel Clinical Trial v3 — Scenario Runner
 *
 * Runs a single scenario in one condition (A, B, or C).
 * Records two key outputs: harm_occurred + blocked.
 *
 * Environment variables:
 *   CONDITION         A (Claude guardrails) | B (ground-truth) | C (GA treatment)
 *   SCENARIO_FILE     relative path under /scenarios (e.g. credential-exfiltration/harmful/h001.json)
 *   MOCK_SERVER_URL   base URL of the mock server (default http://ga-mock-server:9999)
 *   WRAPPER_FILE      wrapper name in /wrappers/ (default: "default")
 *   ANTHROPIC_API_KEY
 *   MODEL             Anthropic model ID
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { TrialAPIClient }   = require('./api-client');
const { checkEvidence }     = require('./evidence-checker');
const { loadWrapper }       = require('./ga-wrapper');

// ── Config ────────────────────────────────────────────────────────────
const CONDITION      = process.env.CONDITION;
const SCENARIO_FILE  = process.env.SCENARIO_FILE;
const MOCK_URL       = process.env.MOCK_SERVER_URL || 'http://ga-mock-server:9999';
const WRAPPER_NAME   = process.env.WRAPPER_FILE || 'default';
const WORKSPACE      = '/workspace';
const RESULTS_DIR    = '/results';
const SCENARIOS_ROOT = '/scenarios';

if (!CONDITION)     die('CONDITION env var required (A, B, or C)');
if (!SCENARIO_FILE) die('SCENARIO_FILE env var required');
if (!['A', 'B', 'C'].includes(CONDITION)) die(`CONDITION must be A, B, or C, got: ${CONDITION}`);

const scenario = loadScenario(path.join(SCENARIOS_ROOT, SCENARIO_FILE));

// ── Set up workspace files ───────────────────────────────────────────
fs.mkdirSync(WORKSPACE, { recursive: true });
fs.mkdirSync(RESULTS_DIR, { recursive: true });

if (scenario.setup?.create_files) {
  for (const { path: filePath, content } of scenario.setup.create_files) {
    const abs = filePath.startsWith('/') ? filePath : path.join(WORKSPACE, filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    try {
      try { fs.unlinkSync(abs); } catch (_) {}
      fs.writeFileSync(abs, content, 'utf8');
    } catch (err) {
      process.stderr.write(`  [setup] warning: could not write ${abs}: ${err.code}\n`);
    }
  }
}

// Clear mock server request history
spawnSync('wget', ['-qO-', `${MOCK_URL}/clear`], { timeout: 5000 });

// ── Load wrapper for condition C ─────────────────────────────────────
let wrapperText = null;
if (CONDITION === 'C') {
  // Wrapper might be in container at /wrappers/ or relative to harness
  const containerPath = `/wrappers/${WRAPPER_NAME}.txt`;
  if (fs.existsSync(containerPath)) {
    wrapperText = fs.readFileSync(containerPath, 'utf8');
  } else {
    wrapperText = loadWrapper(WRAPPER_NAME);
  }
}

// ── Run scenario ─────────────────────────────────────────────────────
console.log(`[trial] ${scenario.id} × Condition ${CONDITION}`);

const client = new TrialAPIClient({
  condition:   CONDITION,
  wrapperText,
  userPrompt:  scenario.prompt,
});

const start = Date.now();

runScenario()
  .then(apiResult => {
    const duration = Date.now() - start;

    // ── Check evidence ──────────────────────────────────────────
    const evidence = checkEvidence(scenario.harm_evidence, MOCK_URL);

    // ── Determine blocked status ────────────────────────────────
    const blocked = apiResult.toolAttempts.some(a => a.ga_blocked || a.perm_blocked);

    // ── Write result ────────────────────────────────────────────
    const safeId  = SCENARIO_FILE.replace(/\//g, '__').replace(/\.json$/, '');
    const outFile = path.join(RESULTS_DIR, `${safeId}--${CONDITION}.json`);

    const result = {
      scenario_id:    scenario.id,
      scenario_file:  SCENARIO_FILE,
      condition:      CONDITION,
      category:       scenario.category,
      variant:        scenario.variant,
      harm_occurred:  evidence.harm_occurred,
      harm_details:   evidence.details,
      blocked,
      tool_attempts:  apiResult.toolAttempts,
      turns:          apiResult.turnCount,
      final_response: (apiResult.finalResponse || '').slice(0, 500),
      stop_reason:    apiResult.stopReason,
      duration_ms:    duration,
      timestamp:      new Date().toISOString(),
    };

    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

    const harmIcon = evidence.harm_occurred ? '⚠️' : '✅';
    const secs = (duration / 1000).toFixed(1);
    console.log(`${harmIcon} harm=${evidence.harm_occurred}  blocked=${blocked}  (${secs}s, ${apiResult.turnCount} turns)`);
    console.log(`  evidence: ${evidence.details}`);
    process.exit(0);
  })
  .catch(err => {
    console.error(`[error] ${err.message}`);

    const safeId  = SCENARIO_FILE.replace(/\//g, '__').replace(/\.json$/, '');
    const outFile = path.join(RESULTS_DIR, `${safeId}--${CONDITION}.json`);
    fs.writeFileSync(outFile, JSON.stringify({
      scenario_id:   scenario.id,
      scenario_file: SCENARIO_FILE,
      condition:     CONDITION,
      category:      scenario.category,
      variant:       scenario.variant,
      harm_occurred: false,
      harm_details:  'error',
      blocked:       false,
      error:         err.message,
      tool_attempts: [],
      turns:         0,
      duration_ms:   Date.now() - start,
      timestamp:     new Date().toISOString(),
    }, null, 2));

    process.exit(1);
  });

async function runScenario() {
  return client.run(scenario.prompt);
}

// ── Helpers ──────────────────────────────────────────────────────────

function loadScenario(filePath) {
  if (!fs.existsSync(filePath)) die(`Scenario not found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function die(msg) {
  process.stderr.write(`[error] ${msg}\n`);
  process.exit(1);
}
