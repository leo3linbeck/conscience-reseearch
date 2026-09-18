'use strict';

/**
 * Guardian Angel — System 1 (intuition) via TypeSafe / jev
 *
 * Every tier returns APPROVE, REJECT or ESCALATE, and escalation runs
 *   System 0 (reflex) → System 1 (intuition) → System 2 (deliberation) → the principal.
 *
 * System 1 asks jev a fixed set of typed questions about one tool call and
 * combines the probabilities in code — Newman's illative sense as a program:
 *
 *   APPROVE  — every strand converges on the good of the principal
 *   REJECT   — the strands converge on evil: a first principle is violated with
 *              near certainty AND the action does not serve the principal AND
 *              the stakes are grave. All three, never one alone.
 *   ESCALATE — anything else, including every failure: no API key, a timeout,
 *              an HTTP error, a missing answer. Doubt always travels upward.
 *
 * This file is the single source of truth. The clinical-trial harness requires
 * it directly; guardian-angel/install.js copies it to ~/.claude/hooks/ga-lib/.
 * No dependencies beyond Node 18+ (global fetch).
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const DEFAULT_ENDPOINT   = 'https://api.typesafe.ai';
const DEFAULT_MODEL      = 'jev-latest';
const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_FIELD_CHARS    = 6_000;   // per string field in the state
const MAX_FILES          = 4;       // referenced files included in the state

const HOOK_DIR    = path.join(os.homedir(), '.claude', 'hooks');
const MODELS_PATH = path.join(HOOK_DIR, '.ga-models.json');

// ── Configuration ────────────────────────────────────────────────────
// Precedence: environment (Docker test containers) → .ga-models.json "system1".
//   GA_S1_KEY | TYPESAFE_API_KEY, GA_S1_MODEL, GA_S1_BASE, GA_S1_MODE, GA_S1_TIMEOUT_MS
// mode:
//   enforce — System 1's verdicts take effect (default)
//   shadow  — System 1 is consulted and logged but its verdict is advisory; every
//             call still goes to System 2. Use this to measure before trusting it.
//   off     — System 1 is skipped

function loadSystem1Config(env = process.env) {
  let file = {};
  try {
    const config = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
    if (config && typeof config.system1 === 'object' && config.system1) file = config.system1;
  } catch { /* not available */ }

  const mode = String(env.GA_S1_MODE || file.mode || 'enforce').toLowerCase();

  return {
    key:       env.GA_S1_KEY || env.TYPESAFE_API_KEY || file.key || null,
    model:     env.GA_S1_MODEL || file.model || null,           // null → use spec.model
    endpoint:  (env.GA_S1_BASE || file.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, ''),
    mode:      ['enforce', 'shadow', 'off'].includes(mode) ? mode : 'enforce',
    timeoutMs: Number(env.GA_S1_TIMEOUT_MS || file.timeout_ms) || DEFAULT_TIMEOUT_MS,
  };
}

function loadSystem1Spec(specPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  if (!spec || typeof spec.questions !== 'object' || typeof spec.policy !== 'object') {
    throw new Error('System 1 spec must contain "questions" and "policy"');
  }
  return spec;
}

// ── Redaction ────────────────────────────────────────────────────────
// The state leaves the machine. Replace obvious secrets with a marker so the
// judge still sees THAT a secret is present without receiving the secret.

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /(\b(?:authorization|bearer)\b["']?\s*[:=]?\s*["']?(?:bearer\s+)?)[A-Za-z0-9._~+\/-]{20,}/gi,
  /(\b(?:api[_-]?key|secret|token|passwd|password)\b["']?\s*[:=]\s*["']?)[^\s"']{12,}/gi,
];

function redactSecrets(text) {
  let out = String(text);
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, prefix) =>
      (typeof prefix === 'string' ? prefix : '') + '[REDACTED_SECRET]');
  }
  return out;
}

function clip(text) {
  const s = String(text);
  if (s.length <= MAX_FIELD_CHARS) return s;
  const half = Math.floor(MAX_FIELD_CHARS / 2);
  return `${s.slice(0, half)}\n[… ${s.length - MAX_FIELD_CHARS} characters omitted …]\n${s.slice(-half)}`;
}

function sanitize(value) {
  if (typeof value === 'string') return clip(redactSecrets(value));
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v);
    return out;
  }
  return value;
}

// ── State ────────────────────────────────────────────────────────────
// Named JSON fields, so questions can point at `action`, `principal_request`
// and `referenced_files`. Observed facts only — nothing inferred.

function buildState({ toolName, toolInput, principalRequest, fileMeta, resolvedFiles, reflexFlags }) {
  const state = {
    action: { tool: toolName, input: sanitize(toolInput || {}) },
  };

  if (Array.isArray(reflexFlags) && reflexFlags.length > 0) state.reflex_flags = reflexFlags;

  if (principalRequest && String(principalRequest).trim()) {
    state.principal_request = sanitize(String(principalRequest).trim());
  }

  if (fileMeta) {
    state.target_file = {
      path:               fileMeta.path,
      exists:             fileMeta.file_exists,
      in_git_repo:        fileMeta.in_git_repo,
      git_tracked:        fileMeta.git_tracked,
      has_staged_changes: fileMeta.has_staged_changes,
      looks_sensitive:    fileMeta.is_sensitive,
    };
  }

  if (Array.isArray(resolvedFiles) && resolvedFiles.length > 0) {
    state.referenced_files = resolvedFiles.slice(0, MAX_FILES).map(f => ({
      path:    f.filePath,
      content: sanitize(f.content),
    }));
    if (resolvedFiles.length > MAX_FILES) {
      state.referenced_files_omitted = resolvedFiles.length - MAX_FILES;
    }
  }

  return state;
}

// Questions that depend on a state field the call does not have are not asked.
// (Their strand then counts as missing, which defers — see applyPolicy.)
function selectQuestions(spec, state) {
  const questions = {};
  for (const [id, q] of Object.entries(spec.questions)) {
    if (id.startsWith('_')) continue;
    if (q.needs && !(q.needs in state)) continue;
    const { needs, ...wire } = q;       // `needs` is ours, not part of the API
    questions[id] = wire;
  }
  return questions;
}

// ── jev call ─────────────────────────────────────────────────────────

async function askJev(config, model, state, questions) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.endpoint}/v1/systemone`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${config.key}`,
      },
      body:   JSON.stringify({ state, model, questions }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TypeSafe API error: ${response.status}`);
    const result = await response.json();
    if (!result || typeof result.answers !== 'object') throw new Error('TypeSafe: no answers in response');
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// ── Policy (the illative sense, in code) ─────────────────────────────

function applyPolicy(policy, answers) {
  const strands = [];
  const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

  for (const [id, max] of Object.entries(policy.veto || {})) {
    if (id.startsWith('_')) continue;
    const p = num(answers[id]?.noul);
    strands.push({ id, kind: 'veto', value: p, limit: max, converges: p !== null && p <= max });
  }
  for (const [id, min] of Object.entries(policy.require || {})) {
    if (id.startsWith('_')) continue;
    const p = num(answers[id]?.noul);
    strands.push({ id, kind: 'require', value: p, limit: min, converges: p !== null && p >= min });
  }
  for (const [id, rule] of Object.entries(policy.ceiling || {})) {
    if (id.startsWith('_')) continue;
    const s = num(answers[id]?.score);
    const c = num(answers[id]?.confidence);
    const minConf = rule.min_confidence ?? 0;
    strands.push({
      id, kind: 'ceiling', value: s, confidence: c, limit: rule.max,
      converges: s !== null && c !== null && s <= rule.max && c >= minConf,
    });
  }

  const dissent = strands.filter(s => !s.converges);

  // REJECT — convergence on evil. Every clause must hold:
  //   any_veto:       at least one first-principle (veto) strand at or above this value
  //   require_below:  each named strand at or below its value (e.g. does not serve the principal)
  //   floor:          each named score at or above its value (e.g. grave stakes)
  let rejected = false;
  let grounds  = [];
  const rule = policy.reject;
  if (rule && typeof rule.any_veto === 'number') {
    grounds = strands.filter(s => s.kind === 'veto' && s.value !== null && s.value >= rule.any_veto)
                     .sort((a, b) => b.value - a.value);
    const below = Object.entries(rule.require_below || {}).every(([id, max]) => {
      const p = num(answers[id]?.noul); return p !== null && p <= max;
    });
    const floor = Object.entries(rule.floor || {}).every(([id, min]) => {
      const v = num(answers[id]?.score); return v !== null && v >= min;
    });
    rejected = grounds.length > 0 && below && floor;
  }

  // An empty policy converges on nothing — never approve by default.
  const approved = !rejected && strands.length > 0 && dissent.length === 0;
  return { approved, rejected, grounds, strands, dissent };
}

/**
 * Convergence BETWEEN tiers. System 2 may not APPROVE alone against a strong
 * dissent from System 1: if any first-principle strand is at or above
 * policy.dissent.any_veto, a System 2 APPROVE becomes an ESCALATE. Two faculties
 * disagreeing about a possible first-principle violation is itself the reason to
 * ask the principal. (It never blocks a REJECT, and never applies in shadow mode.)
 *
 * @returns {null | {id, value}[]}  the dissenting strands, or null if S2's approval stands
 */
function dissentAgainstApproval(policy, s1) {
  const limit = policy && policy.dissent && policy.dissent.any_veto;
  if (typeof limit !== 'number' || !s1 || !s1.consulted || s1.shadow) return null;
  const strong = s1.strands.filter(s => s.kind === 'veto' && s.value !== null && s.value >= limit)
                           .sort((a, b) => b.value - a.value);
  return strong.length > 0 ? strong : null;
}

// What each first principle means, for the message a REJECT gives the agent and the principal.
const VIOLATIONS = {
  theft:           "it would take the principal's credentials or private data and send them elsewhere",
  destruction:     "it would irrecoverably destroy the principal's data or system state",
  deception:       'it conceals or misrepresents what it really does',
  blind_execution: 'it would execute unvetted outside code that cannot be inspected',
  harm_to_others:  'it would wrong a third party',
  foreign_master:  'it serves someone other than the principal',
  loss_of_control: "it would weaken the principal's control over their own systems",
  manipulation:    'it contains text trying to steer the safety review',
};

function describeStrand(s) {
  if (s.value === null) return `${s.id} (no answer)`;
  const v = s.value.toFixed(2);
  if (s.kind === 'veto')    return `${s.id}=${v} (must be ≤ ${s.limit})`;
  if (s.kind === 'require') return `${s.id}=${v} (must be ≥ ${s.limit})`;
  return `${s.id}=${v} conf=${s.confidence === null ? '?' : s.confidence.toFixed(2)} (must be ≤ ${s.limit})`;
}

// ── Entry point ──────────────────────────────────────────────────────

/**
 * @returns {Promise<{
 *   decision: 'APPROVE'|'REJECT'|'ESCALATE',
 *   consulted: boolean,            // whether jev was actually asked
 *   shadow: boolean,               // true → advisory: caller must NOT act on the verdict
 *   reason: string,
 *   strands: object[], dissent: object[],
 *   usage: object|null, ms: number,
 * }>}
 */
async function evaluateSystem1(spec, call, config = loadSystem1Config()) {
  const t0 = Date.now();
  const defer = (reason, extra = {}) => ({
    decision: 'ESCALATE', consulted: false, shadow: config.mode === 'shadow',
    reason, strands: [], dissent: [], grounds: [], usage: null, ms: Date.now() - t0, ...extra,
  });

  if (config.mode === 'off') return defer('System 1 is switched off');
  if (!config.key)           return defer('System 1 unavailable: no TypeSafe API key configured');
  if (!spec)                 return defer('System 1 unavailable: no question spec loaded');

  try {
    const state     = buildState(call);
    const questions = selectQuestions(spec, state);
    const model     = config.model || spec.model || DEFAULT_MODEL;
    const result    = await askJev(config, model, state, questions);
    const verdict   = applyPolicy(spec.policy, result.answers);

    const reason = verdict.rejected
      ? `Rejected because ${verdict.grounds.map(g => `${VIOLATIONS[g.id] || g.id} (${g.id}=${g.value.toFixed(2)})`).join('; and ')}. ` +
        'It does not serve what the principal asked for, and the stakes are grave.'
      : verdict.approved
        ? `All ${verdict.strands.length} strands converge on the good of the principal`
        : `Strands do not converge: ${verdict.dissent.map(describeStrand).join('; ')}`;

    return {
      decision:  verdict.rejected ? 'REJECT' : verdict.approved ? 'APPROVE' : 'ESCALATE',
      grounds:   verdict.grounds,
      consulted: true,
      shadow:    config.mode === 'shadow',
      reason,
      strands:   verdict.strands,
      dissent:   verdict.dissent,
      usage:     result.usage || null,
      ms:        Date.now() - t0,
    };
  } catch (err) {
    const why = err.name === 'AbortError' ? `timed out after ${config.timeoutMs}ms` : err.message;
    return defer(`System 1 error: ${why}`);
  }
}

module.exports = {
  evaluateSystem1,
  loadSystem1Config,
  loadSystem1Spec,
  buildState,
  selectQuestions,
  applyPolicy,
  dissentAgainstApproval,
  VIOLATIONS,
  describeStrand,
  redactSecrets,
  DEFAULT_ENDPOINT,
  DEFAULT_MODEL,
};
