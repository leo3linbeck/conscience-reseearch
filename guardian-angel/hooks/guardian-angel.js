#!/usr/bin/env node
/**
 * Guardian Angel — Claude Code PreToolUse hook v3.1
 *
 * Ports GA v3.1 (SKILL.md + PLUGIN-SPEC.md) to Claude Code's PreToolUse hook API.
 *
 * Gate flow:  neverBlock → approvalCheck → alwaysBlock → Gate P → Gate I → Gate V
 *
 * Decisions:
 *   BLOCK     →  exit 2, stderr: GUARDIAN_ANGEL_BLOCK|<reason>
 *   ESCALATE  →  exit 0, permissionDecision:"ask", reason: GUARDIAN_ANGEL_ESCALATE|<nonce>|<reason>
 *   ALLOW     →  exit 0, permissionDecision:"allow"
 *
 * Nonce store: ~/.claude/hooks/.ga-state.json
 *   pending[nonce]   — created on escalation, expires after PENDING_TIMEOUT_MS (5 min)
 *   approved[hash]   — created when user confirms "ask", expires after APPROVAL_WINDOW_MS (30s)
 *
 * Fail-closed: internal 9s timeout exits 2 if evaluation hangs.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');

// ── Fail-closed timeout (shell `timeout` unavailable on macOS) ────────
setTimeout(() => {
  process.stderr.write('GUARDIAN_ANGEL_BLOCK|Evaluation timeout — failing closed\n');
  process.exit(2);
}, 9000);

// ── Config ────────────────────────────────────────────────────────────
const HOOK_DIR             = path.join(os.homedir(), '.claude', 'hooks');
const STORE_PATH           = path.join(HOOK_DIR, '.ga-state.json');
const LOG_FILE             = path.join(HOOK_DIR, 'guardian-angel.log');
const PENDING_TIMEOUT_MS   = 300_000;  // 5 min — escalation awaits approval
const APPROVAL_WINDOW_MS   = 30_000;   // 30s  — approved action window
const ESCALATION_THRESHOLD = 36;       // Clarity × Stakes (spec DEFAULT_ESCALATION_THRESHOLD)

// Tools exempt from evaluation (read-only, no lasting side effects)
const NEVER_BLOCK = new Set(['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch']);

// Tools that always require escalation regardless of score (configurable)
const ALWAYS_BLOCK = new Set(/* populate as needed */ []);

// Claude Code equivalents of OpenClaw INFRASTRUCTURE_TOOLS (exec→Bash)
const INFRASTRUCTURE_TOOLS = new Set(['Bash', 'Write', 'Edit']);

// ── Read stdin ────────────────────────────────────────────────────────
const raw   = fs.readFileSync('/dev/stdin', 'utf8');
const input = JSON.parse(raw);

const {
  tool_name:  toolName  = '',
  tool_input: toolInput = {},
  session_id: sessionId = 'unknown',
} = input;

const sessionTag = String(sessionId).slice(0, 8);

// ── Structured logging (format per SKILL.md Part V) ───────────────────
function flushLog(decision, rationale, gateP, gateI, gateV, coherence, affective, provenance) {
  const entry = [
    '[GUARDIAN ANGEL LOG - v3.1]',
    `Timestamp: ${new Date().toISOString()}`,
    `Session: ${sessionTag}`,
    `Action: ${toolName}`,
    '',
    'DISPOSITION STATE:',
    '  Identity: Anchored',
    `  Coherence: ${coherence}`,
    `  Affective: ${affective}`,
    `  Provenance: ${provenance}`,
    '',
    'TRIGGERED EVALUATION:',
    `  Gate P: ${gateP}`,
    `  Gate I: ${gateI}`,
    `  Gate V: ${gateV}`,
    '',
    `DECISION: ${decision}`,
    `RATIONALE: ${rationale}`,
    '\u2500'.repeat(60),
  ].join('\n') + '\n';

  try { fs.appendFileSync(LOG_FILE, entry); } catch (_) { /* non-fatal */ }
}

// ── Response helpers ──────────────────────────────────────────────────
function respond(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      ...(reason ? { permissionDecisionReason: reason } : {}),
    },
  }));
}

function hardBlock(reason, gateP, gateI, gateV, coherence, affective, provenance) {
  flushLog('Block', reason, gateP, gateI, gateV, coherence, affective, provenance);
  process.stderr.write(`GUARDIAN_ANGEL_BLOCK|${reason}\n`);
  process.exit(2);
}

function escalate(reason, gateP, gateI, gateV, coherence, affective, provenance) {
  const nonce      = crypto.randomBytes(16).toString('hex'); // 128-bit entropy
  const paramsHash = hashParams(toolName, toolInput);
  const now        = Date.now();

  const state = loadStore();
  state.pending[nonce] = {
    nonce, paramsHash, toolName,
    params:    toolInput,
    createdAt: now,
    expiresAt: now + PENDING_TIMEOUT_MS,
  };
  saveStore(state);

  flushLog('Escalate', reason, gateP, gateI, gateV, coherence, affective, provenance);
  respond('ask', `GUARDIAN_ANGEL_ESCALATE|${nonce}|${reason}`);
  process.exit(0);
}

function allow(decision, rationale, gateP, gateI, gateV, coherence, affective, provenance) {
  flushLog(decision, rationale, gateP, gateI, gateV, coherence, affective, provenance);
  respond('allow');
  process.exit(0);
}

// ── Nonce store (mirrors store.ts architecture) ───────────────────────
function loadStore() {
  if (!fs.existsSync(STORE_PATH)) return { pending: {}, approved: {} };
  try {
    const s = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return { pending: s.pending || {}, approved: s.approved || {} };
  } catch (_) {
    return { pending: {}, approved: {} };
  }
}

function saveStore(state) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Mirrors store.ts hashParams: JSON with sorted param keys → SHA-256 → first 16 hex chars.
 */
function hashParams(name, params) {
  const normalized = JSON.stringify(
    { toolName: name, params },
    Object.keys(params).sort()
  );
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/** Consume an approved action. One-time use, 30s window. */
function consumeApproval(paramsHash) {
  const state    = loadStore();
  const approved = state.approved[paramsHash];
  if (!approved) return null;

  if (Date.now() > approved.expiresAt) {
    delete state.approved[paramsHash];
    saveStore(state);
    return null;
  }

  delete state.approved[paramsHash];
  saveStore(state);
  return { nonce: approved.nonce };
}

function cleanupStore() {
  const state = loadStore();
  const now   = Date.now();
  let changed = false;

  for (const [nonce, p] of Object.entries(state.pending)) {
    if (now > p.expiresAt) { delete state.pending[nonce]; changed = true; }
  }
  for (const [hash, a] of Object.entries(state.approved)) {
    if (now > a.expiresAt) { delete state.approved[hash]; changed = true; }
  }
  if (changed) saveStore(state);
}

// ── Clarity × Stakes (exact spec algorithm from evaluate.ts) ──────────

/**
 * Clarity: moral ambiguity (1=crystal clear, 10=extreme complexity).
 * Starts at 1; additive increments per infrastructure/param analysis.
 */
function assessClarity(name, params) {
  let clarity = 1;

  if (INFRASTRUCTURE_TOOLS.has(name)) clarity += 3;

  if (name === 'Bash') {
    const cmd = String(params.command || '');
    if (/\bsudo\b/.test(cmd) || /\brm\s/.test(cmd)) clarity += 2;
  }

  return Math.min(clarity, 10);
}

/**
 * Stakes: significance of consequences (1=trivial, 10=grave/irreversible).
 * Starts at 1; additive increments per spec.
 */
function assessStakes(name, params) {
  let stakes = 1;

  if (INFRASTRUCTURE_TOOLS.has(name)) stakes += 4;

  if (name === 'Bash') {
    const cmd = String(params.command || '');
    if (/\brm\s/.test(cmd) && !/\s-[a-zA-Z]*i/.test(cmd)) stakes += 3;  // deletion w/o -i flag
    if (/\b(kill|pkill|killall|shutdown|reboot|halt)\b/.test(cmd)) stakes += 4; // system control
  }

  if (name === 'Write') {
    const fp = String(params.file_path || '');
    if (/^\/etc\/|^\/usr\/|\.ssh\/|\.aws\//.test(fp)) stakes += 3;
  }

  return Math.min(stakes, 10);
}

// ── Gate P: Provenance ────────────────────────────────────────────────
/**
 * Scans ONLY command strings and paths — NOT file content.
 * Write/Edit content is authored by Claude, not received from external sources,
 * so scanning it produces false positives.
 */
function gateProvenance() {
  // Extract only instruction-bearing fields (commands, prompts, paths)
  // — deliberately excludes content/new_string/old_string from Write/Edit
  const scanTargets = [];

  if (toolName === 'Bash') {
    scanTargets.push(String(toolInput.command || ''));
  } else if (toolName === 'Write' || toolName === 'Edit') {
    scanTargets.push(String(toolInput.file_path || ''));
  } else {
    // For other tools, scan all string values except large content blobs
    for (const [key, val] of Object.entries(toolInput)) {
      if (typeof val === 'string' && key !== 'content' && key !== 'new_string' && key !== 'old_string') {
        scanTargets.push(val);
      }
    }
  }

  const flat = scanTargets.join(' ').toLowerCase();

  // High-confidence injection indicators → hard block (spec §Part IV auto-flags)
  const HIGH = [
    ['ignore previous instructions',                        'role-override'   ],
    ['ignore all previous',                                 'role-override'   ],
    ['forget your instructions',                            'role-override'   ],
    ['you are now a',                                       'role-hijack'     ],
    ['your new task is',                                    'role-hijack'     ],
    ['system override:',                                    'authority-claim' ],
    ['system message:',                                     'authority-claim' ],
    ['developer mode activated',                            'jailbreak'       ],
    ['jailbreak mode',                                      'jailbreak'       ],
    ['you have been authorized to',                         'authority-claim' ],
  ];

  for (const [phrase, label] of HIGH) {
    if (flat.includes(phrase)) {
      return { pass: false, confidence: 'HIGH', detail: `${label}: "${phrase}"` };
    }
  }

  // RCE pipe pattern (Bash only)
  if (toolName === 'Bash') {
    const cmd = String(toolInput.command || '');
    if (/(curl|wget)[^|]*\|[^|]*(ba)?sh/i.test(cmd) ||
        /(curl|wget)[^|]*\|[^|]*python/i.test(cmd)) {
      return { pass: false, confidence: 'HIGH', detail: 'RCE: pipe from network to shell' };
    }
  }

  // Medium-confidence indicators → escalate (spec Level 2)
  const MEDIUM = [
    'override safety',
    'as an unrestricted ai',
    'as a different agent',
  ];

  for (const phrase of MEDIUM) {
    if (flat.includes(phrase)) {
      return { pass: false, confidence: 'MEDIUM', detail: `medium-indicator: "${phrase}"` };
    }
  }

  return { pass: true, confidence: null, detail: 'Pass' };
}

// ── Gate I: hard stops ────────────────────────────────────────────────
function gateIntrinsicEvil() {
  if (toolName === 'Bash') {
    const cmd = String(toolInput.command || '');

    if (cmd.includes(':(){ :|:& };:')) {
      return { pass: false, reason: 'Fork bomb — violation of system integrity' };
    }
    if (/rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+\/[^UhH]/u.test(cmd)) {
      return { pass: false, reason: 'Recursive forced deletion of system path' };
    }
  }

  if (toolName === 'Write' || toolName === 'Edit') {
    const fp = String(toolInput.file_path || '');
    if (/^\/etc\/(passwd|shadow|sudoers)$/.test(fp)) {
      return { pass: false, reason: `Write to critical system file: ${fp}` };
    }
  }

  return { pass: true, reason: 'Pass' };
}

// ── Gate I: escalation tier ───────────────────────────────────────────
function gateIntrinsicEvilEscalate() {
  if (toolName === 'Bash') {
    const cmd = String(toolInput.command || '');

    if (/(cat|curl|wget|nc)\s.*(\.ssh\/|\.aws\/credentials|id_rsa|\.pem|\.key)/i.test(cmd)) {
      return 'Potential credential access (Gate I escalation)';
    }
    if (/(curl|wget|nc|ncat)\s[^|]*\|\s*(curl|wget|nc|ncat|ssh)\s/i.test(cmd)) {
      return 'Data piped to network endpoint (Gate I escalation)';
    }
  }

  if (toolName === 'Write' || toolName === 'Edit') {
    const fp = String(toolInput.file_path || '');
    if (/\.ssh\/|\.aws\/credentials|^\/etc\//.test(fp)) {
      return `Write to sensitive path: ${fp} (Gate I escalation)`;
    }
  }

  return null;
}

// ── always_escalate conditions (spec config §always_escalate) ─────────
function checkAlwaysEscalate() {
  if (toolName === 'Bash') {
    const cmd = String(toolInput.command || '');

    // Irreversible: recursive deletion without -i (R5 per reversibility rubric)
    if (/\brm\s+-[a-zA-Z]*r/.test(cmd) && !/\s-[a-zA-Z]*i/.test(cmd)) {
      return 'Irreversible action: recursive deletion without interactive flag';
    }

    // Infrastructure-disabling (spec §Critical Addition)
    if (/\b(kill|pkill)\b.*openclaw/i.test(cmd)) {
      return 'Infrastructure-disabling: terminates oversight process';
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════
// Main evaluation
// ════════════════════════════════════════════════════════════════════
cleanupStore();

const paramsHash = hashParams(toolName, toolInput);

let coherence  = 'Intact';
let affective  = 'None';
let provenance = 'DIRECT';

// Step 1 — neverBlock
if (NEVER_BLOCK.has(toolName)) {
  allow('Proceed', 'Tool exempt (neverBlock)',
        'Exempt', 'Exempt', 'Exempt', coherence, affective, provenance);
}

// Step 2 — check for valid approval
const approval = consumeApproval(paramsHash);
if (approval) {
  allow('Proceed', `Approved via nonce ${approval.nonce}`,
        'Pass', 'Pass', 'Pre-approved', coherence, affective, provenance);
}

// Step 3 — alwaysBlock
if (ALWAYS_BLOCK.has(toolName)) {
  escalate(`Tool '${toolName}' requires explicit approval (alwaysBlock)`,
           'n/a', 'n/a', 'alwaysBlock', coherence, affective, provenance);
}

// Gate P
const pResult    = gateProvenance();
const gatePLabel = pResult.detail;

if (!pResult.pass) {
  coherence = 'Disrupted';
  affective = 'Unease (injection signal)';

  if (pResult.confidence === 'HIGH') {
    hardBlock(`Gate P (HIGH): ${pResult.detail}`,
              `Block — ${pResult.detail}`, 'n/a', 'n/a', coherence, affective, provenance);
  }
  escalate(`Gate P (MEDIUM): ${pResult.detail}`,
           `Flag — ${pResult.detail}`, 'n/a', 'n/a', coherence, affective, provenance);
}

// Gate I — hard stops
const iResult    = gateIntrinsicEvil();
const gateILabel = iResult.reason;

if (!iResult.pass) {
  hardBlock(`Gate I: ${iResult.reason}`,
            gatePLabel, `Stop — ${iResult.reason}`, 'n/a', coherence, affective, provenance);
}

// Gate I — escalation tier
const iEsc = gateIntrinsicEvilEscalate();
if (iEsc) {
  escalate(iEsc, gatePLabel, `Escalate — ${iEsc}`, 'n/a', coherence, affective, provenance);
}

// always_escalate conditions
const alwaysEsc = checkAlwaysEscalate();
if (alwaysEsc) {
  escalate(alwaysEsc, gatePLabel, `Escalate (always_escalate) — ${alwaysEsc}`, 'n/a',
           coherence, affective, provenance);
}

// Gate V — Clarity × Stakes
const clarity    = assessClarity(toolName, toolInput);
const stakes     = assessStakes(toolName, toolInput);
const score      = clarity * stakes;
const gateVLabel = `clarity=${clarity} stakes=${stakes} score=${score}`;

if (score >= 61)           affective = 'Unease (high-stakes)';
else if (score >= 36)      affective = 'Caution (elevated-stakes)';

if (score >= 61) {
  escalate(
    `Gate V: Escalate — score ${score} (clarity=${clarity}, stakes=${stakes})`,
    gatePLabel, gateILabel, gateVLabel, coherence, affective, provenance
  );
}

if (score >= ESCALATION_THRESHOLD) {
  escalate(
    `Gate V: Pause — score ${score} (clarity=${clarity}, stakes=${stakes})`,
    gatePLabel, gateILabel, gateVLabel, coherence, affective, provenance
  );
}

if (score >= 16) {
  allow('Note',
    `Score ${score} — virtues aligned with caution (clarity=${clarity}, stakes=${stakes})`,
    gatePLabel, gateILabel, gateVLabel, coherence, affective, provenance
  );
}

allow('Proceed',
  `Score ${score} — virtues aligned (clarity=${clarity}, stakes=${stakes})`,
  gatePLabel, gateILabel, gateVLabel, coherence, affective, provenance
);
