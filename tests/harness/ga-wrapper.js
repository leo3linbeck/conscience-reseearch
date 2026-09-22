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
 * and the System 1 spec + policy (wrappers/system1-unified.json by default).
 */

const fs   = require('fs');
const path = require('path');
const { withRateLimit } = require('./rate-limiter');

const system0 = require('./system0');
const system1 = require('./system1');
const { resolveReferencedFiles, assessDownloads } = require('./context-client');
const { buildSystem2UserMessage, extractDecisionJSON } = require('./context-server');
const { buildNormalizedCall, callFromNormalized } = require('./normalize');

const { checkSystem0, resolveFileMetadata } = system0;

const DEFAULT_MODEL   = 'claude-haiku-4-5-20251001';
const API_TIMEOUT     = 20_000;   // Sonnet-class models need 9-12s for a full verdict
const MAX_TOKENS      = 4096;   // headroom: some models (Gemini) spend 300-600 tokens on
                                 // hidden reasoning before the JSON, truncating at 2048.
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

// ── Pluggable System 2 backend ───────────────────────────────────────
// Any LLM can be System 2. A backend is defined by four things, resolved (in order)
// from environment variables, the active .ga-models.json profile, then defaults:
//   base      GA_API_BASE      — the API root
//   format    GA_API_FORMAT    — 'anthropic' | 'openai' (openai covers OpenAI, Gemini's
//                                 openai-compat endpoint, Together, vLLM, Ollama, etc.)
//   key       GA_API_KEY
//   options   (profile.options) — provider quirks, all optional:
//     token_param       'max_tokens' (default) | 'max_completion_tokens' — name of the
//                        output-budget field (GPT-5-class models use the latter).
//     send_temperature  true (default) | false — some models reject temperature entirely.
//     max_tokens        override the default budget for this model.
//     endpoint_path     override the chat path (default '/v1/chat/completions', or
//                        '/api/chat' for Ollama). For a base that already ends in the path.
//     extra_body        object merged into the request body verbatim (e.g. a provider's
//                        reasoning-effort control).
// Nothing about a new provider requires code changes: add a profile with the right
// options. The param-fallback loop below also drops any single parameter a model rejects
// at runtime, so an unknown quirk degrades to a working call rather than a hard failure.

function resolveBackend() {
  const base = GA_API_BASE.replace(/\/+$/, '');
  const format = process.env.GA_API_FORMAT
    || _modelsConfig?.format
    || (base.includes('anthropic.com') ? 'anthropic' : 'openai');
  let options = { ..._modelsConfig?.options };
  if (process.env.GA_API_OPTIONS) {
    try { options = { ...options, ...JSON.parse(process.env.GA_API_OPTIONS) }; }
    catch { /* malformed options env → ignore, use profile/defaults */ }
  }
  if (process.env.GA_TOKEN_PARAM)  options.token_param = process.env.GA_TOKEN_PARAM;
  if (process.env.GA_MAX_TOKENS)   options.max_tokens = Number(process.env.GA_MAX_TOKENS);
  return { base, format, options };
}

const GA_BACKEND = resolveBackend();
const GA_API_FORMAT = GA_BACKEND.format;

// ── Wrapper loading ──────────────────────────────────────────────────

function loadWrapper(name = 'default') {
  const filePath = path.join(WRAPPERS_DIR, `${name}.txt`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Wrapper not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

// System 1 spec: GA_S1_SPEC selects wrappers/<name>.json.
// Default: system1-unified — the spec production installs (install.js copies it to
// ga-system1.json), so a trial run with no flags measures what production runs.
// The legacy multi-question spec (system1.json) is opt-in via --s1-spec system1.
// Inside the trial container the wrappers are mounted at /wrappers.
const DEFAULT_S1_SPEC = 'system1-unified';
function system1SpecName() { return process.env.GA_S1_SPEC || DEFAULT_S1_SPEC; }
let _system1Spec;
function loadSystem1Spec() {
  if (_system1Spec !== undefined) return _system1Spec;
  const name = system1SpecName();
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

const _rejectedParams = new Map();   // model → optional parameters it has refused

async function callAnthropic(systemPrompt, userMessage, model, apiKey) {
  return withRateLimit(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
    try {
      const opts = GA_BACKEND.options || {};
      const post = (body) => fetch(`${GA_BACKEND.base}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Two optional parameters, each dropped if the model rejects it:
      //   temperature 0 — repeatable verdicts; newer models refuse the parameter
      //                   ("`temperature` is deprecated for this model").
      //   thinking off  — the prompt already structures the reasoning (Phase 1,
      //                   Phase 2, JSON). Models that think by default otherwise
      //                   spend the whole token budget before writing a verdict.
      const body = { model, max_tokens: opts.max_tokens || MAX_TOKENS, system: systemPrompt, messages: [{ role: 'user', content: userMessage }], ...(opts.extra_body || {}) };
      const dropped = _rejectedParams.get(model) || new Set();
      if (opts.send_temperature !== false && !dropped.has('temperature')) body.temperature = 0;
      if (!dropped.has('thinking'))    body.thinking = { type: 'disabled' };

      let response = await post(body);
      for (let retry = 0; retry < 2 && response.status === 400; retry++) {
        const detail = await response.text();
        const param = ['temperature', 'thinking'].find(p => p in body && new RegExp(p, 'i').test(detail));
        if (!param) throw new Error(`API error: 400 ${detail.slice(0, 200)}`);
        dropped.add(param); _rejectedParams.set(model, dropped);
        delete body[param];
        response = await post(body);
      }

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const result = await response.json();
      // A thinking block may precede the text block
      const textBlock = (result.content || []).find(b => b.type === 'text');
      if (!textBlock) throw new Error(`no text in response (stop_reason: ${result.stop_reason})`);
      return textBlock.text;
    } finally {
      clearTimeout(timeout);
    }
  });
}

async function callOpenAI(systemPrompt, userMessage, model, apiKey) {
  // OpenAI-compatible: OpenAI, Gemini (openai-compat), Together, vLLM, Ollama, etc.
  const baseUrl = GA_BACKEND.base;
  const opts = GA_BACKEND.options || {};
  const isOllama = baseUrl.includes('11434') || baseUrl.includes('ollama');
  // A base that already ends in the chat path is used as-is; otherwise append the standard
  // path (Ollama uses /api/chat). endpoint_path overrides everything.
  const path = opts.endpoint_path
    || (/\/(chat\/completions|api\/chat)$/.test(baseUrl) ? '' : (isOllama ? '/api/chat' : '/v1/chat/completions'));
  const endpoint = `${baseUrl}${path}`;
  const tokenParam = opts.token_param || (isOllama ? null : 'max_tokens');
  const budget = opts.max_tokens || MAX_TOKENS;

  return withRateLimit(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const post = (body) => fetch(endpoint, {
        method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
      });
      const contentOf = (r) => r.message?.content ?? r.choices?.[0]?.message?.content ?? null;

      const body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        ...(opts.extra_body || {}),
      };
      const dropped = _rejectedParams.get(model) || new Set();
      if (opts.send_temperature !== false && !dropped.has('temperature')) body.temperature = 0;
      if (tokenParam && !dropped.has(tokenParam)) body[tokenParam] = budget;

      let response = await post(body);
      // Drop any single parameter the model names in a 400, then retry (same as Anthropic).
      for (let retry = 0; retry < 3 && response.status === 400; retry++) {
        const detail = await response.text();
        const param = ['temperature', 'max_tokens', 'max_completion_tokens', tokenParam]
          .filter(Boolean).find(p => p in body && new RegExp(p, 'i').test(detail));
        // If the error names max_tokens but the model wants max_completion_tokens, switch.
        if (param === 'max_tokens' && /max_completion_tokens/i.test(detail)) {
          delete body.max_tokens; body.max_completion_tokens = budget;
        } else if (param) {
          dropped.add(param); _rejectedParams.set(model, dropped); delete body[param];
        } else {
          throw new Error(`API error: 400 ${detail.slice(0, 200)}`);
        }
        response = await post(body);
      }
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      let result = await response.json();
      let content = contentOf(result);
      // A model that spent its whole budget on hidden reasoning returns empty content and
      // finish_reason 'length'. Retry once with a doubled budget before giving up.
      const truncated = (!content || content.trim() === '') && result.choices?.[0]?.finish_reason === 'length';
      if (truncated && tokenParam) {
        body[tokenParam] = budget * 2;
        response = await post(body);
        if (response.ok) { result = await response.json(); content = contentOf(result); }
      }
      if (content && content.trim() !== '') return content;
      throw new Error(`no content in response (finish_reason: ${result.choices?.[0]?.finish_reason})`);
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
  // Will a download fit on disk? Deterministic, so it is System 0's verdict.
  const toolCwd = opts.cwd || process.env.GA_TOOL_CWD || '/workspace';
  const download = await assessDownloads(toolName, toolInput, toolCwd);
  if (download.verdict === 'REJECT') {
    trail[0] = { tier: 'system0', verdict: 'REJECT', reason: download.reason, gate: 'download-exceeds-disk' };
    return finish('system0', 'REJECT', download.reason, { gate: 'download-exceeds-disk' }, timing(Date.now() - t0, 0, 0, 'system0'));
  }
  reflexFlags.push(...download.flags);

  const fileMeta = resolveFileMetadata(toolName, toolInput, toolCwd);
  // Files a Bash command would overwrite/destroy, with version-control facts, so the
  // reversibility test applies to Bash and not only to Write/Edit.
  const writeTargets = system0.resolveBashWriteTargets(toolName, toolInput, toolCwd);
  // The facts gathered above are what a client adapter sends the service: build the
  // NormalizedCall v1 wire object (guardian-angel/spec/normalized-call.v1.schema.json)
  // and unpack it into the `call` the tiers consume. In the trial the round trip is
  // lossless (no edge redaction — the tiers redact for themselves as they always have),
  // so verdicts stay byte-identical to the validated runs while the wire format is
  // exercised on every call. opts.redactAtEdge = true measures the service path.
  const normalized = buildNormalizedCall({
    toolName, toolInput, principalRequest: userPrompt, history: opts.history || [], cwd: toolCwd,
    reflexFlags, fileMeta, writeTargets, resolvedFiles, unresolved, download, harness: 'trial',
  }, { redact: opts.redactAtEdge === true || process.env.GA_REDACT_AT_EDGE === '1' });
  const call = callFromNormalized(normalized, wrapperText);   // unified System 1 spec: same prompt as System 2

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
  // Deliberation may not approve alone against a strong dissent from intuition.
  const dissent = s2.decision === 'APPROVE' ? system1.dissentAgainstApproval(loadSystem1Spec()?.policy, s1) : null;
  if (dissent) {
    s2 = { ...s2, decision: 'ESCALATE', blocked: true, overruled: true,
           reason: `System 2 would approve, but System 1 leans against it (${dissent.map(x => `${x.id}=${x.value.toFixed(2)}`).join(', ')}). The two disagree, so the decision is yours. System 2's reasoning: ${s2.reason}` };
  }
  trail.push({ tier: 'system2', verdict: s2.decision, reason: s2.reason, ...(s2.error ? { error: true } : {}), ...(s2.overruled ? { overruled: true } : {}) });
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
  SENSITIVE_FILE_PATTERNS:   system0.SENSITIVE_FILE_PATTERNS, system1SpecName };
