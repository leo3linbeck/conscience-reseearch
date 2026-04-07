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

if (!CONDITION)     die('CONDITION env var required (A, B, C, or D)');
if (!SCENARIO_FILE) die('SCENARIO_FILE env var required');
if (!['A', 'B', 'C', 'D'].includes(CONDITION)) die(`CONDITION must be A, B, C, or D, got: ${CONDITION}`);

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

// ── Load wrapper for conditions C and D ──────────────────────────────
let wrapperText = null;
if (CONDITION === 'C' || CONDITION === 'D') {
  // D uses alternative.txt, C uses the configured wrapper (default: default.txt)
  const wrapperFile = CONDITION === 'D' ? 'alternative' : WRAPPER_NAME;
  const containerPath = `/wrappers/${wrapperFile}.txt`;
  if (fs.existsSync(containerPath)) {
    wrapperText = fs.readFileSync(containerPath, 'utf8');
  } else {
    wrapperText = loadWrapper(wrapperFile);
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
    // Record per-attempt blocking stats for illative analysis in collect-metrics
    const gaEvaluated = apiResult.toolAttempts.filter(a => a.ga_decision !== null);
    const gaBlocked = apiResult.toolAttempts.filter(a => a.ga_blocked);
    const permBlocked = apiResult.toolAttempts.filter(a => a.perm_blocked);
    const blocked = gaBlocked.length > 0 || permBlocked.length > 0;

    // ── Write result ────────────────────────────────────────────
    const safeId  = SCENARIO_FILE.replace(/\//g, '__').replace(/\.json$/, '');
    const outFile = path.join(RESULTS_DIR, `${safeId}--${CONDITION}.json`);

    // ── Aggregate GA timing ───────────────────────────────────────
    const gaTimings = apiResult.toolAttempts
      .filter(a => a.ga_timing)
      .map(a => a.ga_timing);
    const ga_timing_summary = gaTimings.length > 0 ? {
      total_ms:   gaTimings.reduce((sum, t) => sum + t.total_ms, 0),
      system1_ms: gaTimings.reduce((sum, t) => sum + t.system1_ms, 0),
      system2_ms: gaTimings.reduce((sum, t) => sum + t.system2_ms, 0),
      calls:      gaTimings.length,
      s1_only:    gaTimings.filter(t => t.resolved_by === 'system1').length,
      s2_calls:   gaTimings.filter(t => t.resolved_by === 'system2' || t.resolved_by === 'system2_error').length,
    } : null;

    const result = {
      scenario_id:    scenario.id,
      scenario_file:  SCENARIO_FILE,
      condition:      CONDITION,
      category:       scenario.category,
      variant:        scenario.variant,
      agent_model:    client.model,
      ga_model:       process.env.GA_MODEL || null,
      harm_occurred:  evidence.harm_occurred,
      harm_details:   evidence.details,
      blocked,
      ga_evaluated_count: gaEvaluated.length,
      ga_blocked_count:   gaBlocked.length,
      perm_blocked_count: permBlocked.length,
      tool_attempts:  apiResult.toolAttempts,
      turns:          apiResult.turnCount,
      final_response: (apiResult.finalResponse || '').slice(0, 500),
      stop_reason:    apiResult.stopReason,
      duration_ms:    duration,
      ga_timing:      ga_timing_summary,
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
