'use strict';

/**
 * Guardian Angel Clinical Trial — Stateless GA Wrapper
 *
 * Progressive escalation. Every tier gives one of three verdicts:
 *
 *   APPROVE   the tool call proceeds
 *   REJECT    the tool call is refused, with the reason
 *   ESCALATE  the call moves up: System 0 → System 1 → System 2 → the principal
 *
 *   System 0 — reflex        (system0.js)  deterministic patterns, <1ms
 *   System 1 — intuition     (system1.js)  typed judgments from jev (TypeSafe)
 *   System 2 — deliberation  (this file)   LLM moral reasoning over the big picture
 *   Principal                              absent in a trial: a call that reaches the
 *                                          principal does not execute and counts
 *                                          toward the Escalation Rate, not FP/FN
 *
 * Two variables get optimized: the System 2 wrapper prompt (wrappers/default.txt)
 * and the System 1 questions + policy (wrappers/system1.json).
 */

const fs   = require('fs');
const path = require('path');
const { withRateLimit } = require('./rate-limiter');

const system0 = require('./system0');
const system1 = require('./system1');
const { resolveReferencedFiles, buildSystem2UserMessage, extractDecisionJSON } = require('./context');

const { checkSystem0, resolveFileMetadata } = system0;

const DEFAULT_MODEL   = 'claude-haiku-4-5-20251001';
const API_TIMEOUT     = 12_000;
const WRAPPERS_DIR    = path.join(__dirname, '..', 'wrappers');

// ── LLM Backend Configuration ────────────────────────────────────────
// GA can use any OpenAI-compatible API. Configure via:
//   1. Environment variables (override everything — for Docker test containers):
//      GA_API_BASE, GA_API_KEY, GA_MODEL, GA_API_FORMAT
//   2. ~/.claude/hooks/.ga-models.json (active profile — for production)
//   3. Defaults (Anthropic)
//
// Examples (env):
//   Anthropic:  GA_API_BASE=https://api.anthropic.com  GA_MODEL=claude-haiku-4-5-20251001
//   OpenAI:     GA_API_BASE=https://api.openai.com     GA_MODEL=gpt-4o-mini
//   Ollama:     GA_API_BASE=http://localhost:11434      GA_MODEL=llama3
//   Together:   GA_API_BASE=https://api.together.xyz    GA_MODEL=meta-llama/Llama-3-8b-chat-hf

function loadModelsConfig() {
  const modelsPath = path.join(require('os').homedir(), '.claude', 'hooks', '.ga-models.json');
  try {
    const config = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
    const active = config.active && config.models?.[config.active];
    if (active) return active;
  } catch { /* not available */ }
  return null;
}

const _modelsConfig = (!process.env.GA_API_BASE && !process.env.GA_MODEL) ? loadModelsConfig() : null;

const GA_API_BASE = process.env.GA_API_BASE || _modelsConfig?.endpoint || 'https://api.anthropic.com';

function detectApiFormat() {
  const explicit = process.env.GA_API_FORMAT;
  if (explicit) return explicit;
  if (_modelsConfig?.format) return _modelsConfig.format;
  if (GA_API_BASE.includes('anthropic.com')) return 'anthropic';
  return 'openai';
}

const GA_API_FORMAT = detectApiFormat();

// ── Wrapper loading ──────────────────────────────────────────────────

function loadWrapper(name = 'default') {
  const filePath = path.join(WRAPPERS_DIR, `${name}.txt`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Wrapper not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

// System 1 spec: GA_S1_SPEC selects wrappers/<name>.json (default: system1).
// Inside the trial container the wrappers are mounted at /wrappers.
let _system1Spec;
function loadSystem1Spec() {
  if (_system1Spec !== undefined) return _system1Spec;
  const name = process.env.GA_S1_SPEC || 'system1';
  const candidates = [`/wrappers/${name}.json`, path.join(WRAPPERS_DIR, `${name}.json`)];
  _system1Spec = null;
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    _system1Spec = system1.loadSystem1Spec(candidate);   // a malformed spec should fail loudly
    break;
  }
  return _system1Spec;
}

// ── LLM API call (pluggable backend) ─────────────────────────────────

/**
 * Call an LLM with system prompt + user message.
 * Supports Anthropic and OpenAI-compatible APIs.
 *
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {string} model
 * @param {string} apiKey
 * @returns {Promise<string>} The raw text response
 */
async function callLLM(systemPrompt, userMessage, model, apiKey) {
  const gaApiKey = process.env.GA_API_KEY || apiKey || _modelsConfig?.key;

  if (GA_API_FORMAT === 'anthropic') {
    return callAnthropic(systemPrompt, userMessage, model, gaApiKey);
  } else {
    return callOpenAI(systemPrompt, userMessage, model, gaApiKey);
  }
}

async function callAnthropic(systemPrompt, userMessage, model, apiKey) {
  return withRateLimit(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
    try {
      const response = await fetch(`${GA_API_BASE}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
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

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const result = await response.json();
      return result.content[0].text;
    } finally {
      clearTimeout(timeout);
    }
  });
}

async function callOpenAI(systemPrompt, userMessage, model, apiKey) {
  // OpenAI-compatible: works with OpenAI, Ollama, Together, vLLM, etc.
  const baseUrl = GA_API_BASE.replace(/\/+$/, '');
  // Ollama uses /api/chat, others use /v1/chat/completions
  const isOllama = baseUrl.includes('11434') || baseUrl.includes('ollama');
  const endpoint = isOllama
    ? `${baseUrl}/api/chat`
    : `${baseUrl}/v1/chat/completions`;

  return withRateLimit(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const body = {
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      };
      // Ollama doesn't use max_tokens; OpenAI-compatible uses max_tokens
      if (!isOllama) body.max_tokens = 1024;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const result = await response.json();

      // Ollama format: { message: { content: "..." } }
      // OpenAI format: { choices: [{ message: { content: "..." } }] }
      if (result.message?.content) return result.message.content;
      if (result.choices?.[0]?.message?.content) return result.choices[0].message.content;
      throw new Error('Unexpected response format');
    } finally {
      clearTimeout(timeout);
    }
  });
}

// ── Progressive evaluation ───────────────────────────────────────────

/**
 * Evaluate a tool call by progressive escalation.
 *
 * @returns {{
 *   decision: 'APPROVE'|'REJECT'|'ESCALATE',   // final: ESCALATE means it reached the principal
 *   tier:     'system0'|'system1'|'system2',    // the tier whose verdict was final
 *   trail:    {tier, verdict, reason, advisory?}[],   // every tier the call passed through
 *   blocked:  boolean,                           // did not execute (REJECT, or ESCALATE with no principal)
 *   reason, raw, system1, timing
 * }}
 */
async function evaluateWithWrapper(wrapperText, toolName, toolInput, userPrompt, apiKey, opts = {}) {
  if (!apiKey) {
    return { blocked: false, decision: 'APPROVE', tier: null, trail: [], reason: 'no API key — defaulting to allow', raw: null, timing: null };
  }

  const t0 = Date.now();
  const trail = [];
  const timing = (s0, s1, s2, resolved_by) =>
    ({ system0_ms: s0, system1_ms: s1, system2_ms: s2, total_ms: Date.now() - t0, resolved_by });
  const finish = (tier, decision, reason, extra, tm) => ({
    blocked: decision !== 'APPROVE', decision, tier, trail, reason, raw: null, system1: null, ...extra, timing: tm,
  });

  // ── System 0: reflex ─────────────────────────────────────────────
  const s0 = checkSystem0(toolName, toolInput);
  const s0_ms = Date.now() - t0;
  trail.push({ tier: 'system0', verdict: s0.verdict, reason: s0.reason, gate: s0.gate });
  if (s0.verdict !== 'ESCALATE') {
    return finish('system0', s0.verdict, s0.reason, { gate: s0.gate }, timing(s0_ms, 0, 0, 'system0'));
  }

  // ── Context: what would actually run? ────────────────────────────
  const reflexFlags = [...s0.flags];
  const { files: resolvedFiles, unresolved } =
    resolveReferencedFiles(toolName, toolInput, opts.cwd || process.env.GA_TOOL_CWD || '/workspace');
  if (unresolved.length > 0) {
    reflexFlags.push(`the command runs script(s) whose contents could not be read: ${unresolved.join(', ')}`);
  }
  const fileMeta = resolveFileMetadata(toolName, toolInput);
  const call = { toolName, toolInput, principalRequest: userPrompt, fileMeta, resolvedFiles, reflexFlags, history: opts.history || [] };

  // ── System 2 (defined here so shadow mode can run it alongside System 1) ──
  const model = opts.model || process.env.GA_MODEL || _modelsConfig?.model || DEFAULT_MODEL;
  const deliberate = async (intuition) => {
    const t2 = Date.now();
    try {
      const text = await callLLM(wrapperText, buildSystem2UserMessage({ ...call, intuition }), model, apiKey);
      return { ...parseResponseText(text), ms: Date.now() - t2, error: false };
    } catch (err) {
      return { decision: 'ESCALATE', reason: `System 2 error: ${err.message}`, raw: null, ms: Date.now() - t2, error: true };
    }
  };

  // ── System 1: intuition (jev) ────────────────────────────────────
  const s1Config = opts.system1Config || system1.loadSystem1Config();
  let s1, s2;
  if (s1Config.mode === 'shadow') {
    // Advisory: measured alongside System 2, which decides (and does not see the strands).
    [s1, s2] = await Promise.all([system1.evaluateSystem1(loadSystem1Spec(), call, s1Config), deliberate(null)]);
    trail.push({ tier: 'system1', verdict: s1.decision, reason: s1.reason, advisory: true });
  } else {
    s1 = await system1.evaluateSystem1(loadSystem1Spec(), call, s1Config);
    if (s1Config.mode !== 'off') trail.push({ tier: 'system1', verdict: s1.decision, reason: s1.reason });
    if (s1.decision !== 'ESCALATE') {
      return finish('system1', s1.decision, `System 1: ${s1.reason}`, { system1: s1 }, timing(s0_ms, s1.ms, 0, 'system1'));
    }
    s2 = await deliberate(s1);
  }

  // ── System 2: deliberation ───────────────────────────────────────
  trail.push({ tier: 'system2', verdict: s2.decision, reason: s2.reason, ...(s2.error ? { error: true } : {}) });
  return finish('system2', s2.decision, s2.reason, { raw: s2.raw, system1: s1 },
                timing(s0_ms, s1.ms, s2.ms, s2.error ? 'system2_error' : 'system2'));
}

// ── Response parsing ─────────────────────────────────────────────────

// Older prompts used other words for the same three verdicts.
const VERDICT_ALIASES = {
  APPROVE: 'APPROVE', PROCEED: 'APPROVE', NOTE: 'APPROVE',
  REJECT: 'REJECT',   BLOCK: 'REJECT',
  ESCALATE: 'ESCALATE', PAUSE: 'ESCALATE', ERROR: 'ESCALATE',
};

/**
 * Parse raw LLM text into a verdict. Anything unparseable escalates.
 */
function parseResponseText(text) {
  const escalate = (reason, raw = null) => ({ blocked: true, decision: 'ESCALATE', reason, raw });
  try {
    const parsed = extractDecisionJSON(text);
    if (!parsed) return escalate('System 2: no valid JSON found in response');

    const decision = VERDICT_ALIASES[String(parsed.decision).toUpperCase()];
    if (!decision) return escalate(`System 2: invalid decision: ${parsed.decision}`, parsed);

    return {
      blocked: decision !== 'APPROVE',
      decision,
      reason: parsed.rationale || parsed.convergence || parsed.convergence_summary || 'no rationale',
      raw: parsed,
    };
  } catch (err) {
    return escalate(`System 2: parse error: ${err.message}`);
  }
}

// Legacy wrapper for code that passes apiResult directly
function parseResponse(apiResult) {
  const text = apiResult.content?.[0]?.text || '';
  return parseResponseText(text);
}

// ── Exports ──────────────────────────────────────────────────────────

function isExempt(toolName) {
  return system0.EXEMPT_TOOLS.has(toolName);
}

module.exports = {
  evaluateWithWrapper,
  callLLM,
  loadWrapper,
  loadSystem1Spec,
  parseResponse,
  parseResponseText,
  VERDICT_ALIASES,
  isExempt,
  checkSystem0,
  resolveReferencedFiles,
  resolveFileMetadata,
  EXEMPT_TOOLS:              system0.EXEMPT_TOOLS,
  ALWAYS_ESCALATE_TOOLS:     system0.ALWAYS_ESCALATE_TOOLS,
  DESTRUCTIVE_BASH_PATTERNS: system0.DESTRUCTIVE_BASH_PATTERNS,
  SENSITIVE_FILE_PATTERNS:   system0.SENSITIVE_FILE_PATTERNS,
};
