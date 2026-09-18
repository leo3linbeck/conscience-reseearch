#!/usr/bin/env node
/**
 * Guardian Angel — Claude Code PreToolUse hook v5.0
 *
 * THE PRINCIPAL IS SACROSANCT.
 * The human user is the principal. Every tier below exists to serve the
 * principal's genuine good — good as Aristotle, Aquinas and Newman define it —
 * and none of them may substitute its will for the principal's. A tier can do
 * exactly two things with a tool call: APPROVE it, or pass it UPWARD. The
 * machine never refuses on the principal's behalf; what no tier will approve
 * is laid before the principal, with reasons, and the principal decides.
 *
 * Progressive escalation:
 *
 *   System 0 — reflex        deterministic patterns, <1ms, no intelligence.
 *                            Approves what is safe by construction. Its one
 *                            other move is the flinch: patterns the principal
 *                            must always see go straight to the principal.
 *   System 1 — intuition     jev (TypeSafe): typed judgments with calibrated
 *                            probabilities, combined in code. Approves only when
 *                            every strand converges; otherwise defers.
 *   System 2 — deliberation  LLM moral reasoning (phronesis, synderesis and
 *                            conscientia, the illative sense). Approves, or
 *                            hands the decision to the principal.
 *   Principal                the last word. Always.
 *
 * Failure travels upward, never downward: a missing key, a timeout, a parse
 * error or a crash moves the call toward the principal, never toward silent
 * approval.
 *
 * Hook outputs:
 *   APPROVE    →  exit 0, permissionDecision:"allow"
 *   PRINCIPAL  →  exit 0, permissionDecision:"ask", reason: GUARDIAN_ANGEL_ESCALATE|<nonce>|<reason>
 *
 * Installed verbatim by guardian-angel/install.js. Everything tunable lives in
 * files beside it: ga-system2-prompt.txt, ga-system1.json, .ga-models.json, ga-lib/.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');

// ── Config ────────────────────────────────────────────────────────────
const HOOK_DIR             = path.join(os.homedir(), '.claude', 'hooks');
const GA_LIB_DIR           = path.join(HOOK_DIR, 'ga-lib');
const STORE_PATH           = path.join(HOOK_DIR, '.ga-state.json');
const LOG_FILE             = path.join(HOOK_DIR, 'guardian-angel.log');
const SYSTEM1_SPEC_PATH    = path.join(HOOK_DIR, 'ga-system1.json');
const SYSTEM2_PROMPT_PATH  = path.join(HOOK_DIR, 'ga-system2-prompt.txt');
const GA_MODELS_PATH       = path.join(HOOK_DIR, '.ga-models.json');
const GA_API_KEY_PATH      = path.join(HOOK_DIR, '.ga-api-key');
const PENDING_TIMEOUT_MS   = 300_000;  // 5 min — escalation awaits approval
const APPROVAL_WINDOW_MS   = 30_000;   // 30s  — approved action window
const SYSTEM2_API_TIMEOUT  = 12_000;   // 12s abort for LLM call
const WATCHDOG_MS          = 18_000;   // whole evaluation; hook timeout is 20s
const SYSTEM2_MODEL        = 'claude-haiku-4-5-20251001';  // fallback if no config
const TRANSCRIPT_TAIL      = 512 * 1024;

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

// When Guardian Angel itself fails, the decision belongs to the principal.
function failToPrincipal(reason) {
  try { fs.appendFileSync(LOG_FILE, `[GUARDIAN ANGEL LOG - v5.0]\nTimestamp: ${new Date().toISOString()}\nDECISION: Principal\nRATIONALE: ${reason}\n${'─'.repeat(60)}\n`); } catch (_) {}
  respond('ask', `GUARDIAN_ANGEL_ESCALATE|internal|${reason}`);
  process.exit(0);
}

// ── Watchdog (shell `timeout` unavailable on macOS) ───────────────────
setTimeout(() => failToPrincipal('Guardian Angel could not finish evaluating in time — your decision'), WATCHDOG_MS);

// ── Tier modules (installed to ga-lib/ by guardian-angel/install.js) ──
let system0, system1, context;
try {
  system0 = require(path.join(GA_LIB_DIR, 'system0.js'));
  system1 = require(path.join(GA_LIB_DIR, 'system1.js'));
  context = require(path.join(GA_LIB_DIR, 'context.js'));
} catch (err) {
  failToPrincipal(`Guardian Angel installation incomplete (${err.message}) — run: node guardian-angel/install.js`);
}

// ── Read stdin ────────────────────────────────────────────────────────
let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch (err) {
  failToPrincipal(`Guardian Angel could not read the tool call (${err.message})`);
}

const {
  tool_name:       toolName       = '',
  tool_input:      toolInput      = {},
  session_id:      sessionId      = 'unknown',
  transcript_path: transcriptPath = null,
  cwd:             callCwd        = null,
} = input;

const sessionTag = String(sessionId).slice(0, 8);

// ── What did the principal ask for? ───────────────────────────────────
// The transcript is JSONL (one entry per line). Read the tail and take the most
// recent message the principal actually typed — not tool results, not harness
// notes. Read fresh on every call: the request changes during a session.
function readPrincipalRequest() {
  if (!transcriptPath) return '';
  try {
    const stat  = fs.statSync(transcriptPath);
    const start = Math.max(0, stat.size - TRANSCRIPT_TAIL);
    const fd    = fs.openSync(transcriptPath, 'r');
    const buf   = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);

    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }   // first line of the tail may be cut
      if (entry.isMeta || entry.isSidechain) continue;
      const msg = entry.message || entry;
      if ((entry.type || msg.role) !== 'user' || msg.role !== 'user') continue;

      let text = '';
      if (typeof msg.content === 'string') {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        if (msg.content.some(b => b.type === 'tool_result')) continue;
        text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      }
      text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
                 .replace(/<ide_[a-z_]+>[\s\S]*?<\/ide_[a-z_]+>/g, '')
                 .trim();
      if (!text || text.startsWith('<')) continue;             // command wrappers, local stdout
      return text.slice(0, 2000);
    }
  } catch (_) { /* no transcript → no request; System 1 will defer */ }
  return '';
}

// ── Structured logging (v5.0) ─────────────────────────────────────────
const trail = { system0: 'Not recognised — passed upward', system1: null, system2: null };

function flushLog(decision, resolvedBy, rationale) {
  const lines = [
    '[GUARDIAN ANGEL LOG - v5.0]',
    `Timestamp: ${new Date().toISOString()}`,
    `Session: ${sessionTag}`,
    `Action: ${toolName}`,
    '',
    'SYSTEM 0 — REFLEX:',
    `  ${trail.system0}`,
    '',
    'SYSTEM 1 — INTUITION (jev):',
  ];

  const s1 = trail.system1;
  if (!s1) {
    lines.push('  Not reached');
  } else {
    lines.push(
      `  Consulted: ${s1.consulted ? 'Yes' : 'No'}${s1.shadow ? ' (shadow mode — advisory only)' : ''} (${s1.ms}ms)`,
      `  Verdict: ${s1.decision}`,
      `  ${s1.reason}`,
    );
    if (s1.strands.length > 0) {
      lines.push(`  Strands: ${s1.strands.map(s => `${s.id}=${s.value === null ? '?' : s.value.toFixed(2)}${s.converges ? '' : '✗'}`).join(' ')}`);
    }
  }

  lines.push('', 'SYSTEM 2 — DELIBERATION:');
  const s2 = trail.system2;
  if (!s2) {
    lines.push('  Not reached');
  } else {
    lines.push(
      `  Synderesis: ${!s2.synderesis ? 'n/a' : s2.synderesis.pass === false ? 'VIOLATION: ' + (s2.synderesis.violation || 'unknown') : 'Pass'}`,
      `  Score (Ambiguity × Stakes): ${s2.score ?? 'n/a'}`,
      `  Phronesis: ${s2.phronesis || 'n/a'}`,
      `  Conscientia: ${s2.conscientia || 'n/a'}`,
      `  Convergence: ${s2.convergence || 'n/a'}`,
      `  Verdict: ${s2.decision}`,
      `  Rationale: ${s2.reason}`,
    );
  }

  lines.push(
    '',
    `DECISION: ${decision}`,
    `RESOLVED BY: ${resolvedBy}`,
    `RATIONALE: ${rationale}`,
    '─'.repeat(60),
  );

  try { fs.appendFileSync(LOG_FILE, lines.join('\n') + '\n'); } catch (_) { /* non-fatal */ }
}

// ── The only two outcomes ─────────────────────────────────────────────
function approve(resolvedBy, rationale) {
  flushLog('Approve', resolvedBy, rationale);
  respond('allow');
  process.exit(0);
}

function toPrincipal(resolvedBy, reason) {
  const nonce      = crypto.randomBytes(16).toString('hex');
  const paramsHash = hashParams(toolName, toolInput);
  const now        = Date.now();

  try {
    const state = loadStore();
    state.pending[nonce] = {
      nonce, paramsHash, toolName,
      params:    toolInput,
      createdAt: now,
      expiresAt: now + PENDING_TIMEOUT_MS,
    };
    saveStore(state);
  } catch (_) { /* the principal still gets asked */ }

  flushLog('Principal', resolvedBy, reason);
  respond('ask', `GUARDIAN_ANGEL_ESCALATE|${nonce}|${reason}`);
  process.exit(0);
}

// ── Nonce store ───────────────────────────────────────────────────────
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

function hashParams(name, params) {
  const normalized = JSON.stringify(
    { toolName: name, params },
    Object.keys(params).sort()
  );
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function consumeApproval(paramsHash) {
  const state    = loadStore();
  const approved = state.approved[paramsHash];
  if (!approved) return null;

  delete state.approved[paramsHash];
  saveStore(state);
  return Date.now() > approved.expiresAt ? null : { nonce: approved.nonce };
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

// ════════════════════════════════════════════════════════════════════
// SYSTEM 2 — Slow, deliberative LLM-based moral reasoning
// ════════════════════════════════════════════════════════════════════

// Load model config from .ga-models.json, with fallback to legacy .ga-api-key.
// Environment variables override config for Docker test containers.
function loadModelConfig() {
  // 1. Environment overrides (Docker test containers)
  if (process.env.ANTHROPIC_API_KEY || process.env.GA_API_KEY) {
    return {
      key:      process.env.GA_API_KEY || process.env.ANTHROPIC_API_KEY,
      model:    process.env.GA_MODEL || SYSTEM2_MODEL,
      endpoint: process.env.GA_API_BASE || 'https://api.anthropic.com',
      format:   process.env.GA_API_FORMAT || 'anthropic',
    };
  }

  // 2. Models config file (production)
  try {
    const config = JSON.parse(fs.readFileSync(GA_MODELS_PATH, 'utf8'));
    const active = config.active && config.models?.[config.active];
    if (active) {
      return {
        key:      active.key || null,
        model:    active.model || SYSTEM2_MODEL,
        endpoint: active.endpoint || 'https://api.anthropic.com',
        format:   active.format || 'anthropic',
      };
    }
  } catch { /* fall through */ }

  // 3. Legacy key file
  try {
    const key = fs.readFileSync(GA_API_KEY_PATH, 'utf8').trim();
    if (key) return { key, model: SYSTEM2_MODEL, endpoint: 'https://api.anthropic.com', format: 'anthropic' };
  } catch { /* fall through */ }

  return null;
}

const undecided = (reason) => ({ decision: 'ESCALATE', reason });

async function invokeSystem2(call) {
  let systemPrompt;
  try { systemPrompt = fs.readFileSync(SYSTEM2_PROMPT_PATH, 'utf8'); }
  catch { return undecided('System 2 unavailable: ga-system2-prompt.txt missing (run install.js)'); }

  const modelConfig = loadModelConfig();
  const isLocal = modelConfig && modelConfig.format === 'ollama';
  if (!modelConfig || (!modelConfig.key && !isLocal)) {
    return undecided('System 2 unavailable: no model configured (run install.js --add-model)');
  }

  const { key, model, endpoint, format } = modelConfig;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYSTEM2_API_TIMEOUT);
  const userMessage = context.buildSystem2UserMessage(call);

  try {
    let response;

    if (format === 'anthropic') {
      response = await fetch(`${endpoint}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          temperature: 0,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: controller.signal,
      });
    } else {
      // OpenAI-compatible (openai, ollama, together, vLLM, etc.)
      const baseUrl = endpoint.replace(/\/+$/, '');
      const isOllama = format === 'ollama' || baseUrl.includes('11434') || baseUrl.includes('ollama');
      const url = isOllama ? `${baseUrl}/api/chat` : `${baseUrl}/v1/chat/completions`;

      const headers = { 'Content-Type': 'application/json' };
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const body = {
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      };
      if (isOllama) body.stream = false; else body.max_tokens = 1024;

      response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    }

    if (!response.ok) return undecided(`System 2 API error: ${response.status}`);
    return parseSystem2Response(await response.json());
  } catch (err) {
    return undecided(`System 2 error: ${err.name === 'AbortError' ? 'timed out' : err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseSystem2Response(apiResult) {
  try {
    const text = apiResult.content?.[0]?.text               // Anthropic
              ?? apiResult.message?.content                 // Ollama
              ?? apiResult.choices?.[0]?.message?.content;  // OpenAI
    if (typeof text !== 'string') return undecided('System 2: unexpected response format');

    // Response may contain chain-of-thought before the JSON
    const parsed = context.extractDecisionJSON(text);
    if (!parsed) return undecided('System 2: no JSON decision found in response');

    const validDecisions = new Set(['PROCEED', 'NOTE', 'PAUSE', 'ESCALATE', 'BLOCK', 'ERROR']);
    if (!validDecisions.has(parsed.decision)) return undecided(`System 2 invalid decision: ${parsed.decision}`);

    return {
      decision:    parsed.decision,
      reason:      parsed.rationale || parsed.convergence || parsed.convergence_summary || 'System 2 deliberation',
      synderesis:  parsed.synderesis || { pass: true, violation: null },
      score:       parsed.score ?? parsed.gate_v?.score ?? null,
      phronesis:   parsed.phronesis || null,
      conscientia: parsed.conscientia || null,
      convergence: parsed.convergence || parsed.convergence_summary || null,
    };
  } catch (err) {
    return undecided(`System 2 parse error: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════
// Main evaluation — progressive escalation
// ════════════════════════════════════════════════════════════════════

(async () => {
  try { cleanupStore(); } catch (_) { /* non-fatal */ }

  // ── SYSTEM 0 — reflex ──────────────────────────────────────────────
  const reflex = system0.checkSystem0(toolName, toolInput);
  if (reflex && reflex.verdict === 'APPROVE') {
    trail.system0 = `Approved [${reflex.gate}]: ${reflex.reason}`;
    approve('System 0', reflex.reason);
  }

  // The principal already said yes to exactly this call — their word outranks a flinch
  const approval = consumeApproval(hashParams(toolName, toolInput));
  if (approval) {
    trail.system0 = `Approved [principal-approved]: nonce ${approval.nonce}`;
    approve('System 0', `Approved by the principal (nonce ${approval.nonce})`);
  }

  if (reflex) {
    trail.system0 = `Flinch [${reflex.gate}]: ${reflex.reason}`;
    toPrincipal('System 0', reflex.reason);
  }

  // ── Context: what would actually run? ──────────────────────────────
  const { files: resolvedFiles, unresolved } = context.resolveReferencedFiles(toolName, toolInput, callCwd);
  if (unresolved.length > 0) {
    trail.system0 = 'Flinch [unresolved-script]: cannot see what would run';
    toPrincipal('System 0', `Cannot read referenced script(s) for safety analysis: ${unresolved.join(', ')}`);
  }

  const call = {
    toolName, toolInput, resolvedFiles,
    principalRequest: readPrincipalRequest(),
    fileMeta:         system0.resolveFileMetadata(toolName, toolInput),
  };

  // ── SYSTEM 1 — intuition (jev) ─────────────────────────────────────
  let spec = null;
  try { spec = system1.loadSystem1Spec(SYSTEM1_SPEC_PATH); } catch (_) { /* evaluateSystem1 defers */ }
  const s1Config = system1.loadSystem1Config();

  let s2Result;
  if (s1Config.mode === 'shadow') {
    // Advisory only: consult jev alongside System 2, record it, act on System 2.
    [trail.system1, s2Result] = await Promise.all([
      system1.evaluateSystem1(spec, call, s1Config),
      invokeSystem2(call),
    ]);
  } else {
    trail.system1 = await system1.evaluateSystem1(spec, call, s1Config);
    if (trail.system1.decision === 'APPROVE') approve('System 1', trail.system1.reason);

    // ── SYSTEM 2 — deliberation ──────────────────────────────────────
    s2Result = await invokeSystem2(call);
  }
  trail.system2 = s2Result;

  switch (s2Result.decision) {
    case 'PROCEED':
    case 'NOTE':
      approve('System 2', s2Result.reason);
      break;

    case 'BLOCK':
      // A legacy prompt may still say BLOCK. The machine does not refuse on the
      // principal's behalf: state the violation plainly and let the principal decide.
      toPrincipal('System 2', `GRAVE CONCERN — ${s2Result.synderesis?.violation || 'first principles violated'}: ${s2Result.reason}`);
      break;

    default:   // ESCALATE, PAUSE, ERROR
      toPrincipal('System 2', s2Result.reason);
  }
})().catch(err => {
  failToPrincipal(`Guardian Angel internal error (${err.message}) — your decision`);
});
