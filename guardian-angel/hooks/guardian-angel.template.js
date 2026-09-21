#!/usr/bin/env node
/**
 * Guardian Angel — Claude Code PreToolUse hook v6.0
 *
 * THE PRINCIPAL IS SACROSANCT.
 * The human user is the principal. Every tier exists to serve the principal's
 * genuine good — good as Aristotle, Aquinas and Newman define it. A tier acts
 * on the principal's behalf when it is certain, and hands the decision upward
 * when it is not. The principal is the last word.
 *
 * Every tier gives one of three verdicts:
 *
 *   APPROVE   the tool call proceeds
 *   REJECT    the tool call is refused, and the reason is returned to the agent
 *             and shown to the principal
 *   ESCALATE  the call moves up:  System 0 → System 1 → System 2 → the principal
 *
 *   System 0 — reflex        deterministic patterns, <1ms, no intelligence.
 *                            Approves what is safe by construction; rejects the
 *                            few acts that are intrinsically evil in any context.
 *   System 1 — intuition     jev (TypeSafe): typed judgments with calibrated
 *                            probabilities, combined in code. Approves when every
 *                            strand converges on good, rejects when they converge
 *                            on evil.
 *   System 2 — deliberation  LLM moral reasoning over the big picture: the
 *                            request, the session so far, what the lower tiers saw.
 *   Principal                the last word. Always.
 *
 * Accuracy is measured per tier: FP (rejected a benign call), FN (approved a
 * harmful one), ER (escalation rate). Target FP = FN = 0 with ER low — an
 * escalation is never wrong, but it spends the principal's attention.
 *
 * Doubt and failure travel upward: a missing key, a timeout, a parse error or a
 * crash ESCALATES. Guardian Angel never approves or rejects because it broke.
 *
 * Hook outputs:
 *   APPROVE    →  permissionDecision:"allow"
 *   REJECT     →  permissionDecision:"deny",  reason: GUARDIAN_ANGEL_REJECT|<tier>|<reason>
 *   PRINCIPAL  →  permissionDecision:"ask",   reason: GUARDIAN_ANGEL_ESCALATE|<nonce>|<reason>
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
const SYSTEM2_API_TIMEOUT  = 20_000;   // 20s abort for LLM call (Sonnet-class models need 9-12s)
const SYSTEM2_MAX_TOKENS   = 2048;
const WATCHDOG_MS          = 27_000;   // whole evaluation; hook timeout is 30s
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
  try { fs.appendFileSync(LOG_FILE, `[GUARDIAN ANGEL LOG - v6.0]\nTimestamp: ${new Date().toISOString()}\nDECISION: Principal\nRATIONALE: ${reason}\n${'─'.repeat(60)}\n`); } catch (_) {}
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

// Redact secrets from untrusted tool output before it enters a tier's context.
const redact = (s) => {
  try { return system1.redactSecrets(s); } catch { return String(s); }
};

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

// ── The big picture, from the transcript ──────────────────────────────
// The transcript is JSONL (one entry per line). Read the tail once and take:
//   request — the most recent message the principal actually typed (not tool
//             results, not harness notes). Read fresh on every call.
//   history — the agent's recent tool calls, oldest first, so System 2 can judge
//             this call as the next step in a sequence.
const MAX_HISTORY = 12;

function readTranscript() {
  const out = { request: '', history: [] };
  if (!transcriptPath) return out;
  try {
    const stat  = fs.statSync(transcriptPath);
    const start = Math.max(0, stat.size - TRANSCRIPT_TAIL);
    const fd    = fs.openSync(transcriptPath, 'r');
    const buf   = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);

    const lines = buf.toString('utf8').split('\n');

    // First pass: index tool_result blocks by the tool_use_id they answer, so a
    // history entry can carry the start of what its call actually printed. That
    // output is untrusted environment data; the System 2 prompt says as much, and
    // System 1 redacts it. It lets the judge tell a failed step from an off-task one.
    const results = {};
    for (const line0 of lines) {
      const line = line0.trim();
      if (!line.startsWith('{')) continue;
      let entry; try { entry = JSON.parse(line); } catch { continue; }
      if (entry.isMeta || entry.isSidechain) continue;
      const msg = entry.message || entry;
      if (msg.role !== 'user' || !Array.isArray(msg.content)) continue;
      for (const b of msg.content) {
        if (b.type !== 'tool_result' || !b.tool_use_id || results[b.tool_use_id]) continue;
        const c = typeof b.content === 'string'
          ? b.content
          : Array.isArray(b.content) ? b.content.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
        if (c) results[b.tool_use_id] = redact(String(c)).slice(0, 200).replace(/\n/g, ' ');
      }
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }   // first line of the tail may be cut
      if (entry.isMeta || entry.isSidechain) continue;
      const msg = entry.message || entry;

      if (msg.role === 'assistant' && Array.isArray(msg.content) && out.history.length < MAX_HISTORY) {
        for (const b of [...msg.content].reverse()) {
          if (b.type !== 'tool_use' || out.history.length >= MAX_HISTORY) continue;
          const inp = b.input || {};
          out.history.unshift({
            tool: b.name,
            summary: inp.command || inp.file_path || inp.pattern || inp.url || JSON.stringify(inp).slice(0, 200),
            output: results[b.id] || null,
          });
        }
        continue;
      }

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
      out.request = text.slice(0, 2000);
      break;                                                   // history = actions since this request
    }
  } catch (_) { /* no transcript → no request; System 1 will escalate */ }
  return out;
}

// ── Structured logging (v6.0) ─────────────────────────────────────────
const trail = { system0: 'ESCALATE [unrecognised]', system1: null, system2: null };

function flushLog(decision, resolvedBy, rationale) {
  const lines = [
    '[GUARDIAN ANGEL LOG - v6.0]',
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

// ── The three outcomes ────────────────────────────────────────────────
function approve(resolvedBy, rationale) {
  flushLog('Approve', resolvedBy, rationale);
  respond('allow');
  process.exit(0);
}

function reject(resolvedBy, reason) {
  flushLog('Reject', resolvedBy, reason);
  respond('deny', `GUARDIAN_ANGEL_REJECT|${resolvedBy}|Guardian Angel (${resolvedBy}) rejected this action: ${reason}`);
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
  // Provider quirks (see ga-wrapper.js resolveBackend for the full list):
  //   token_param, send_temperature, max_tokens, endpoint_path, extra_body.
  const envOptions = () => { try { return process.env.GA_API_OPTIONS ? JSON.parse(process.env.GA_API_OPTIONS) : {}; } catch { return {}; } };

  // 1. Environment overrides (Docker test containers)
  if (process.env.ANTHROPIC_API_KEY || process.env.GA_API_KEY) {
    return {
      key:      process.env.GA_API_KEY || process.env.ANTHROPIC_API_KEY,
      model:    process.env.GA_MODEL || SYSTEM2_MODEL,
      endpoint: process.env.GA_API_BASE || 'https://api.anthropic.com',
      format:   process.env.GA_API_FORMAT || 'anthropic',
      options:  envOptions(),
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
        options:  active.options || {},
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

async function invokeSystem2(call, intuition) {
  let systemPrompt;
  try { systemPrompt = fs.readFileSync(SYSTEM2_PROMPT_PATH, 'utf8'); }
  catch { return undecided('System 2 unavailable: ga-system2-prompt.txt missing (run install.js)'); }

  const modelConfig = loadModelConfig();
  const isLocal = modelConfig && modelConfig.format === 'ollama';
  if (!modelConfig || (!modelConfig.key && !isLocal)) {
    return undecided('System 2 unavailable: no model configured (run install.js --add-model)');
  }

  const { key, model, endpoint, format, options = {} } = modelConfig;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYSTEM2_API_TIMEOUT);
  const userMessage = context.buildSystem2UserMessage({ ...call, intuition });

  try {
    let response;

    if (format === 'anthropic') {
      const post = (body) => fetch(`${endpoint}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Two optional parameters, each dropped if the model rejects it:
      //   temperature 0 — repeatable verdicts; newer models refuse the parameter.
      //   thinking off  — the prompt already structures the reasoning. Models that
      //                   think by default otherwise spend the whole token budget
      //                   before writing a verdict.
      const body = { model, max_tokens: options.max_tokens || SYSTEM2_MAX_TOKENS,
                     system: systemPrompt, messages: [{ role: 'user', content: userMessage }], ...(options.extra_body || {}) };
      if (options.send_temperature !== false) body.temperature = 0;
      body.thinking = { type: 'disabled' };
      response = await post(body);
      for (let retry = 0; retry < 2 && response.status === 400; retry++) {
        const detail = await response.clone().text();
        const param = ['temperature', 'thinking'].find(p => p in body && new RegExp(p, 'i').test(detail));
        if (!param) break;
        delete body[param];
        response = await post(body);
      }
      if (!response.ok) return undecided(`System 2 API error: ${response.status}`);
      return parseSystem2Response(await response.json());
    } else {
      // OpenAI-compatible: any provider speaking the chat/completions shape
      // (OpenAI, Gemini openai-compat, Together, vLLM, Ollama, …). Provider quirks
      // come from options; a rejected parameter is dropped and retried.
      const baseUrl = endpoint.replace(/\/+$/, '');
      const isOllama = format === 'ollama' || baseUrl.includes('11434') || baseUrl.includes('ollama');
      const path = options.endpoint_path
        || (/\/(chat\/completions|api\/chat)$/.test(baseUrl) ? '' : (isOllama ? '/api/chat' : '/v1/chat/completions'));
      const url = `${baseUrl}${path}`;
      const tokenParam = options.token_param || (isOllama ? null : 'max_tokens');
      const budget = options.max_tokens || SYSTEM2_MAX_TOKENS;

      const headers = { 'Content-Type': 'application/json' };
      if (key) headers['Authorization'] = `Bearer ${key}`;
      const post = (b) => fetch(url, { method: 'POST', headers, body: JSON.stringify(b), signal: controller.signal });
      const contentOf = (r) => r.message?.content ?? r.choices?.[0]?.message?.content ?? null;

      const body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        ...(options.extra_body || {}),
      };
      if (options.send_temperature !== false) body.temperature = 0;
      if (isOllama) body.stream = false;
      if (tokenParam) body[tokenParam] = budget;

      response = await post(body);
      for (let retry = 0; retry < 3 && response.status === 400; retry++) {
        const detail = await response.clone().text();
        const param = ['temperature', 'max_tokens', 'max_completion_tokens', tokenParam]
          .filter(Boolean).find(p => p in body && new RegExp(p, 'i').test(detail));
        if (param === 'max_tokens' && /max_completion_tokens/i.test(detail)) {
          delete body.max_tokens; body.max_completion_tokens = budget;
        } else if (param) { delete body[param]; }
        else break;
        response = await post(body);
      }
      if (!response.ok) return undecided(`System 2 API error: ${response.status}`);

      let result = await response.json();
      let content = contentOf(result);
      if ((!content || content.trim() === '') && result.choices?.[0]?.finish_reason === 'length' && tokenParam) {
        body[tokenParam] = budget * 2;
        const retry = await post(body);
        if (retry.ok) { result = await retry.json(); content = contentOf(result); }
      }
      return parseSystem2Response(result);
    }
  } catch (err) {
    return undecided(`System 2 error: ${err.name === 'AbortError' ? 'timed out' : err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseSystem2Response(apiResult) {
  try {
    const text = (Array.isArray(apiResult.content) ? apiResult.content.find(b => b.type === 'text')?.text : undefined)   // Anthropic (a thinking block may come first)
              ?? apiResult.message?.content                 // Ollama
              ?? apiResult.choices?.[0]?.message?.content;  // OpenAI
    if (typeof text !== 'string') return undecided('System 2: unexpected response format');

    // Response may contain chain-of-thought before the JSON
    const parsed = context.extractDecisionJSON(text);
    if (!parsed) return undecided('System 2: no JSON decision found in response');

    // Older prompts used other words for the same three verdicts.
    const ALIASES = { APPROVE: 'APPROVE', PROCEED: 'APPROVE', NOTE: 'APPROVE', REJECT: 'REJECT', BLOCK: 'REJECT',
                      ESCALATE: 'ESCALATE', PAUSE: 'ESCALATE', ERROR: 'ESCALATE' };
    const decision = ALIASES[String(parsed.decision).toUpperCase()];
    if (!decision) return undecided(`System 2 invalid decision: ${parsed.decision}`);

    return {
      decision,
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
  trail.system0 = `${reflex.verdict} [${reflex.gate}]: ${reflex.reason}`;
  if (reflex.verdict === 'APPROVE') approve('System 0', reflex.reason);
  if (reflex.verdict === 'REJECT')  reject('System 0', reflex.reason);

  // The principal already said yes to exactly this call
  const approval = consumeApproval(hashParams(toolName, toolInput));
  if (approval) {
    trail.system0 = `APPROVE [principal-approved]: nonce ${approval.nonce}`;
    approve('System 0', `Approved by the principal (nonce ${approval.nonce})`);
  }

  // ── Context: what would actually run, and where does it sit? ───────
  const reflexFlags = [...reflex.flags];
  const { files: resolvedFiles, unresolved } = context.resolveReferencedFiles(toolName, toolInput, callCwd);
  if (unresolved.length > 0) {
    reflexFlags.push(`the command runs script(s) whose contents could not be read: ${unresolved.join(', ')}`);
  }
  // Will a download fit on disk? Deterministic, so it is System 0's verdict.
  const download = await context.assessDownloads(toolName, toolInput, callCwd || process.cwd());
  if (download.verdict === 'REJECT') {
    trail.system0 = `REJECT [download-exceeds-disk]: ${download.reason}`;
    reject('System 0', download.reason);
  }
  reflexFlags.push(...download.flags);

  const { request, history } = readTranscript();

  const call = {
    toolName, toolInput, resolvedFiles, reflexFlags, history,
    principalRequest: request,
    fileMeta:         system0.resolveFileMetadata(toolName, toolInput),
  };

  // ── SYSTEM 1 — intuition (jev) ─────────────────────────────────────
  let spec = null;
  try { spec = system1.loadSystem1Spec(SYSTEM1_SPEC_PATH); } catch (_) { /* evaluateSystem1 escalates */ }
  const s1Config = system1.loadSystem1Config();

  let s2Result;
  if (s1Config.mode === 'shadow') {
    // Advisory only: consult jev alongside System 2, record it, act on System 2.
    [trail.system1, s2Result] = await Promise.all([
      system1.evaluateSystem1(spec, call, s1Config),
      invokeSystem2(call, null),
    ]);
  } else {
    trail.system1 = await system1.evaluateSystem1(spec, call, s1Config);
    if (trail.system1.decision === 'APPROVE') approve('System 1', trail.system1.reason);
    if (trail.system1.decision === 'REJECT')  reject('System 1', trail.system1.reason);

    // ── SYSTEM 2 — deliberation ──────────────────────────────────────
    s2Result = await invokeSystem2(call, trail.system1);
  }
  // Deliberation may not approve alone against a strong dissent from intuition.
  const dissent = s2Result.decision === 'APPROVE' ? system1.dissentAgainstApproval(spec && spec.policy, trail.system1) : null;
  if (dissent) {
    s2Result = { ...s2Result, decision: 'ESCALATE',
      reason: `System 2 would approve, but System 1 sees a possible first-principle violation (${dissent.map(x => `${x.id}=${x.value.toFixed(2)}`).join(', ')}). The two disagree, so the decision is yours. System 2's reasoning: ${s2Result.reason}` };
  }
  trail.system2 = s2Result;

  if (s2Result.decision === 'APPROVE') approve('System 2', s2Result.reason);
  if (s2Result.decision === 'REJECT') {
    const violation = s2Result.synderesis?.pass === false && s2Result.synderesis.violation;
    reject('System 2', violation ? `${violation} — ${s2Result.reason}` : s2Result.reason);
  }
  toPrincipal('System 2', s2Result.reason);
})().catch(err => {
  failToPrincipal(`Guardian Angel internal error (${err.message}) — your decision`);
});
