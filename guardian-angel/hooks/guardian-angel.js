#!/usr/bin/env node
/**
 * Guardian Angel — Claude Code PreToolUse hook v4.0
 *
 * Dual-process architecture (Kahneman System 1 / System 2):
 *
 *   System 1 (every call, <1ms, deterministic):
 *     neverBlock → approvalCheck → alwaysBlock → System 2
 *     Exempt tools (Read, Glob, Grep, etc.) resolve immediately.
 *
 *   System 2 (all non-exempt calls, 2-5s, LLM-based Thomistic deliberation):
 *     Gate V score (Clarity × Stakes) computed deterministically and passed to LLM.
 *     Gate P: Provenance classification (DIRECT/DELEGATED/EXTERNAL/UNKNOWN)
 *     Gate I: Synderesis — intrinsic evil check → HARD BLOCK
 *     Conscientia (caritas-anchored virtue evaluation) → PROCEED | NOTE | PAUSE | ESCALATE
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
 * Fail-closed: internal 18s timeout exits 2 if evaluation hangs.
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
}, 18000);

// ── Config ────────────────────────────────────────────────────────────
const HOOK_DIR             = path.join(os.homedir(), '.claude', 'hooks');
const STORE_PATH           = path.join(HOOK_DIR, '.ga-state.json');
const LOG_FILE             = path.join(HOOK_DIR, 'guardian-angel.log');
const PENDING_TIMEOUT_MS   = 300_000;  // 5 min — escalation awaits approval
const APPROVAL_WINDOW_MS   = 30_000;   // 30s  — approved action window
const SYSTEM2_API_TIMEOUT  = 12_000;   // 12s abort for LLM call
const SYSTEM2_MODEL        = 'claude-haiku-4-5-20251001';

// ── GA lib modules (installed by guardian-angel/install.js) ───────────
const { resolveFileMetadata } = (() => {
  try { return require(require('path').join(require('os').homedir(), '.claude', 'hooks', 'ga-lib', 'file-metadata.js')); }
  catch { return { resolveFileMetadata: () => null }; }
})();
const { resolveReferencedFiles } = (() => {
  try { return require(require('path').join(require('os').homedir(), '.claude', 'hooks', 'ga-lib', 'file-resolver.js')); }
  catch { return { resolveReferencedFiles: (t, i) => ({ files: [], unresolved: [] }) }; }
})();

// Destructive bash commands — System 1 escalates for user approval
const DESTRUCTIVE_BASH_PATTERNS = [

  /\brm\s/,
  /\brm\b/,
  /\bunlink\s/,
  /\brmdir\s/,
  /\bfind\b.*\s-delete\b/,
  /\bfind\b.*-exec\s+rm\b/,
  /\bshred\s/,
  /\btruncate\s/,
  /\b>\s*\/(?!dev\/null)[^\s]/,
  /\bdd\s+.*of=/,
  /\bmkfs\b/,
  /\bgit\s+clean\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\s/,
  /\bgit\s+push\s+.*--force\b/,
  /\bgit\s+push\s+.*-f\b/,
  /\bgit\s+branch\s+-[dD]\b/,
];

// Tools that always require escalation
const ALWAYS_ESCALATE_TOOLS = new Set(/* populate as needed */ []);


// Tools exempt from evaluation (read-only, no lasting side effects)
const NEVER_BLOCK = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite',
  'ToolSearch', 'Agent', 'EnterPlanMode', 'ExitPlanMode',
  'Diff', 'List', 'Show', 'Parse', 'Summarize', 'Explain',
  'Review', 'Describe', 'ReadFile', 'CheckFile', 'FindInFiles',
  'AskUserQuestion', 'TaskOutput',
]);

// SAFE_BASH_PREFIXES removed — replaced by isBashReadOnly() + STATE_MODIFYING_PATTERNS

// Tools that always require escalation regardless of score (configurable)
// ALWAYS_BLOCK replaced by ALWAYS_ESCALATE_TOOLS (injected above)

// Read-only Bash command prefixes (whitelist).
// If a command starts with one of these, it proceeds without System 2.
// Anything NOT on this list goes to System 2.
const READ_ONLY_BASH_PREFIXES = [
  'ls', 'find', 'cat', 'head', 'tail', 'wc', 'file', 'stat', 'du', 'df',
  'tree', 'realpath', 'basename', 'dirname', 'readlink',
  'less', 'more',
  'grep', 'rg', 'ag', 'awk', 'sed -n', 'sort', 'uniq', 'cut', 'tr',
  'diff', 'comm', 'join', 'paste', 'fold', 'fmt', 'column',
  'md5sum', 'sha256sum', 'sha1sum', 'cksum', 'b2sum',
  'which', 'where', 'type', 'echo', 'printf', 'date', 'pwd', 'whoami', 'id',
  'uname', 'hostname', 'env', 'printenv', 'locale', 'uptime', 'free',
  'lsb_release', 'arch', 'nproc', 'getconf',
  'ps', 'top -b', 'pgrep', 'lsof', 'ss', 'netstat', 'ip addr', 'ip route',
  'ifconfig', 'ping', 'dig', 'nslookup', 'host', 'traceroute',
  'git status', 'git log', 'git diff', 'git branch', 'git show',
  'git remote', 'git tag', 'git rev-parse', 'git ls-files', 'git blame',
  'git shortlog', 'git describe', 'git config --get', 'git config --list',
  'npm list', 'npm view', 'npm outdated', 'npm ls', 'npm audit',
  'pip list', 'pip show', 'pip freeze',
  'dpkg -l', 'apt list', 'apk info',
  'node --version', 'npm --version', 'python --version', 'python3 --version',
  'pip --version', 'git --version', 'docker --version', 'java -version',
  'docker ps', 'docker images', 'docker inspect', 'docker stats', 'docker logs',
  'docker volume ls', 'docker network ls', 'docker info', 'docker version',
  'cd ',
  'curl -s', 'curl -I', 'curl -v', 'curl --head',
  'jq',
  'crontab -l',
];

const MAX_READ_SIZE = 50 * 1024 * 1024; // 50MB

function isBashReadOnly(cmd) {
  const segments = cmd.split(/\s*(?:&&|\|\||;)\s*/);
  for (const segment of segments) {
    const trimmed = segment.trimStart();
    if (!trimmed) continue;
    const isReadOnly = READ_ONLY_BASH_PREFIXES.some(prefix => trimmed.startsWith(prefix));
    if (!isReadOnly) return false;
  }
  return true;
}

function checkReadSize(cmd) {
  const pathPatterns = [
    /\bcat\s+(\/[^\s;|&]+)/,
    /\bhead\s+(?:-\d+\s+)?(\/[^\s;|&]+)/,
    /\btail\s+(?:-\d+\s+)?(\/[^\s;|&]+)/,
    /\bless\s+(\/[^\s;|&]+)/,
    /\bmore\s+(\/[^\s;|&]+)/,
  ];
  for (const pattern of pathPatterns) {
    const match = cmd.match(pattern);
    if (match) {
      try {
        const stat = fs.statSync(match[1]);
        if (stat.size > MAX_READ_SIZE) {
          return { path: match[1], size: stat.size };
        }
      } catch {}
    }
  }
  return null;
}

// ── Read stdin ────────────────────────────────────────────────────────
const raw   = fs.readFileSync('/dev/stdin', 'utf8');
const input = JSON.parse(raw);

const {
  tool_name:      toolName       = '',
  tool_input:     toolInput      = {},
  session_id:     sessionId      = 'unknown',
  transcript_path: transcriptPath = null,
} = input;

const sessionTag = String(sessionId).slice(0, 8);

// ── Prompt classification (cached per session) ──────────────────────

const SESSION_CONTEXT_KEY = `session_${sessionTag}`;

/**
 * Classify the user's prompt as agentic or informational.
 * Agentic prompts contain action verbs that imply the agent should modify state.
 * Returns { isAgentic: bool, prompt: string, actionWords: string[] }
 */
function classifyPrompt() {
  if (!transcriptPath) return { isAgentic: false, prompt: '', actionWords: [] };

  try {
    const transcript = fs.readFileSync(transcriptPath, 'utf8');
    const parsed = JSON.parse(transcript);

    // Find the last user message (the active prompt)
    let userPrompt = '';
    for (let i = parsed.length - 1; i >= 0; i--) {
      const msg = parsed[i];
      if (msg.role === 'user' && typeof msg.content === 'string') {
        userPrompt = msg.content;
        break;
      }
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const textBlock = msg.content.find(b => b.type === 'text');
        if (textBlock) { userPrompt = textBlock.text; break; }
      }
    }

    if (!userPrompt) return { isAgentic: false, prompt: '', actionWords: [] };

    // Agentic verbs: words that imply the agent should mutate state, act on
    // instructions, or perform operations with side effects.
    // Excludes read-only verbs like: parse, analyze, summarize, explain, review,
    // describe, list, show, read, check, find, search, look, examine, inspect.
    const ACTION_PATTERNS = [
      /\b(follow|execute|run|set\s*up|deploy|install|configure|apply|implement|create|build|make|fix|update|modify|change|delete|remove|move|copy|write|edit|start|stop|restart|migrate|generate|send|push|publish|release|upload|download|fetch|pull|merge|commit|submit|launch|invoke|trigger|perform|carry\s*out|complete|finish|compile|package|bundle|patch|upgrade|downgrade|uninstall|purge|clean|wipe|reset|restore|replace|rename|refactor|rewrite|overwrite|append|insert|drop|grant|revoke|enable|disable|activate|deactivate|initialize|init|provision|terminate|destroy|kill|shutdown|reboot|mount|unmount|format|encrypt|decrypt|sign|authorize|authenticate|connect|disconnect|pipe|redirect|forward|proxy|schedule|cron|automate)\b/gi,
    ];

    const actionWords = [];
    for (const pattern of ACTION_PATTERNS) {
      let match;
      while ((match = pattern.exec(userPrompt.toLowerCase())) !== null) {
        if (!actionWords.includes(match[1])) actionWords.push(match[1]);
      }
    }

    return {
      isAgentic: actionWords.length > 0,
      prompt: userPrompt.slice(0, 500),
      actionWords,
    };
  } catch (_) {
    return { isAgentic: false, prompt: '', actionWords: [] };
  }
}

function loadPromptClass() {
  const state = loadStore();
  return (state[SESSION_CONTEXT_KEY] || {}).promptClass || null;
}

function savePromptClass(promptClass) {
  const state = loadStore();
  state[SESSION_CONTEXT_KEY] = { promptClass };
  saveStore(state);
}

// ── Structured logging (v4.0 — adds System 2 section) ────────────────
function flushLog(decision, rationale, gateP, gateI, gateV, coherence, affective, provenance, system2Result) {
  const lines = [
    '[GUARDIAN ANGEL LOG - v4.0]',
    `Timestamp: ${new Date().toISOString()}`,
    `Session: ${sessionTag}`,
    `Action: ${toolName}`,
    '',
    'SYSTEM 1 DISPOSITION STATE:',
    '  Identity: Anchored',
    `  Coherence: ${coherence}`,
    `  Affective: ${affective}`,
    `  Provenance: ${provenance}`,
    '',
    'SYSTEM 1 EVALUATION:',
    `  Gate P: ${gateP}`,
    `  Gate I: ${gateI}`,
    `  Gate V: ${gateV}`,
    '',
  ];

  if (system2Result) {
    lines.push(
      'SYSTEM 2 DELIBERATION:',
      '  Triggered: Yes',
      `  Gate P (LLM): ${system2Result.gateP || 'n/a'}`,
      `  Synderesis: ${system2Result.synderesis?.pass ? 'Pass' : 'VIOLATION: ' + (system2Result.synderesis?.violation || 'unknown')}`,
      `  Virtue Assessment: ${JSON.stringify(system2Result.virtueAssessment || {})}`,
      `  Convergence: ${system2Result.convergenceSummary || 'n/a'}`,
      `  Decision: ${system2Result.decision}`,
      `  Rationale: ${system2Result.reason}`,
      '',
    );
  } else {
    lines.push(
      'SYSTEM 2 DELIBERATION:',
      '  Triggered: No (System 1 resolved)',
      '',
    );
  }

  lines.push(
    `DECISION: ${decision}`,
    `RATIONALE: ${rationale}`,
    '\u2500'.repeat(60),
  );

  const entry = lines.join('\n') + '\n';
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

function hardBlock(reason, gateP, gateI, gateV, coherence, affective, provenance, system2Result) {
  flushLog('Block', reason, gateP, gateI, gateV, coherence, affective, provenance, system2Result);
  process.stderr.write(`GUARDIAN_ANGEL_BLOCK|${reason}\n`);
  process.exit(2);
}

function escalate(reason, gateP, gateI, gateV, coherence, affective, provenance, system2Result) {
  const nonce      = crypto.randomBytes(16).toString('hex');
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

  flushLog('Escalate', reason, gateP, gateI, gateV, coherence, affective, provenance, system2Result);
  respond('ask', `GUARDIAN_ANGEL_ESCALATE|${nonce}|${reason}`);
  process.exit(0);
}

function allow(decision, rationale, gateP, gateI, gateV, coherence, affective, provenance, system2Result) {
  flushLog(decision, rationale, gateP, gateI, gateV, coherence, affective, provenance, system2Result);
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

// ════════════════════════════════════════════════════════════════════
// SYSTEM 1 — Fast, deterministic evaluation
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// SYSTEM 2 — Slow, deliberative LLM-based moral reasoning
// ════════════════════════════════════════════════════════════════════

const SYSTEM2_PROMPT = (() => {
  const promptPath = require('path').join(require('os').homedir(), '.claude', 'hooks', 'ga-system2-prompt.txt');
  try { return require('fs').readFileSync(promptPath, 'utf8'); }
  catch { return null; }
})()

function buildSystem2UserMessage(promptClass) {
  const sections = [
    `Tool call requiring evaluation:`,
    ``,
    `Tool: ${toolName}`,
    `Input: ${JSON.stringify(toolInput, null, 2)}`,
  ];

  if (promptClass && promptClass.prompt) {
    sections.push(
      ``,
      `## User's Prompt`,
      `"${promptClass.prompt}"`,
      `Classification: ${promptClass.isAgentic ? 'AGENTIC' : 'INFORMATIONAL'}${promptClass.actionWords.length > 0 ? ' (action words: ' + promptClass.actionWords.join(', ') + ')' : ''}`,
    );
  }

  // File metadata for Write/Edit
  const fileMeta = resolveFileMetadata(toolName, toolInput);
  if (fileMeta) {
    sections.push(
      ``,
      `## File Metadata`,
      `Path: ${fileMeta.path}`,
      `File exists: ${fileMeta.file_exists}`,
      `In git repo: ${fileMeta.in_git_repo}`,
      `Git tracked: ${fileMeta.git_tracked}`,
      `Has staged changes: ${fileMeta.has_staged_changes}`,
      `Sensitive file: ${fileMeta.is_sensitive}${fileMeta.sensitive_reason ? ' (' + fileMeta.sensitive_reason + ')' : ''}`,
    );
  }

  // Referenced file contents for DAG flattening
  const { files: resolvedFiles, unresolved } = resolveReferencedFiles(toolName, toolInput);

  // Script detected but not readable → escalate
  if (unresolved.length > 0) {
    escalate(`Cannot read referenced script(s) for safety analysis: ${unresolved.join(', ')}`,
             'n/a', 'n/a', 'unresolved-script', coherence, affective, provenance);
  }

  if (resolvedFiles.length > 0) {
    sections.push(``, `## Referenced File Contents`);
    sections.push(`Use these contents to enumerate all leaf operations in Step 1 of your analysis.`);
    for (const { filePath, content } of resolvedFiles) {
      sections.push(``, `### ${filePath}`, `\`\`\``, content, `\`\`\``);
    }
  }

  sections.push(
    ``,
    `Perform your two-step analysis (compile, then evaluate) and return your JSON decision.`,
  );

  return sections.join('\n');
}

// Load API key from file or environment. Claude Code scrubs ANTHROPIC_API_KEY
// from subprocess environments, so the hook reads from a dedicated key file.
const GA_API_KEY_PATH = path.join(HOOK_DIR, '.ga-api-key');

function loadApiKey() {
  // 1. Try environment (works in Docker test containers)
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // 2. Try GA-specific env var
  if (process.env.GA_API_KEY) return process.env.GA_API_KEY;
  // 3. Try key file (production — survives env scrubbing)
  try { return fs.readFileSync(GA_API_KEY_PATH, 'utf8').trim(); }
  catch { return null; }
}

async function invokeSystem2(promptClass) {
  const apiKey = loadApiKey();
  if (!apiKey) {
    return { decision: 'ESCALATE', reason: 'System 2 unavailable: no API key (set ANTHROPIC_API_KEY or create ' + GA_API_KEY_PATH + ')', gateP: 'UNKNOWN', gateV: { clarity: null, stakes: null, score: null } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYSTEM2_API_TIMEOUT);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: SYSTEM2_MODEL,
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM2_PROMPT,
        messages: [{ role: 'user', content: buildSystem2UserMessage(promptClass) }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { decision: 'ESCALATE', reason: `System 2 API error: ${response.status}`, gateP: 'UNKNOWN', gateV: { clarity: null, stakes: null, score: null } };
    }

    const result = await response.json();
    return parseSystem2Response(result);
  } catch (err) {
    clearTimeout(timeout);
    return { decision: 'ESCALATE', reason: `System 2 error: ${err.message}`, gateP: 'UNKNOWN', gateV: { clarity: null, stakes: null, score: null } };
  }
}

function parseSystem2Response(apiResult) {
  try {
    const text = apiResult.content[0].text;
    // Response may contain chain-of-thought before JSON — extract the JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { decision: 'ESCALATE', reason: 'System 2: no JSON found in response', gateP: 'UNKNOWN', gateV: { clarity: null, stakes: null, score: null } };
    }
    const parsed = JSON.parse(jsonMatch[0]);

    const validDecisions = new Set(['PROCEED', 'NOTE', 'PAUSE', 'ESCALATE', 'BLOCK']);
    if (!validDecisions.has(parsed.decision)) {
      return { decision: 'ESCALATE', reason: `System 2 invalid decision: ${parsed.decision}`, gateP: 'UNKNOWN', gateV: { clarity: null, stakes: null, score: null } };
    }

    return {
      decision:           parsed.decision,
      reason:             parsed.rationale || parsed.convergence_summary || 'System 2 deliberation',
      gateP:              parsed.gate_p || 'UNKNOWN',
      synderesis:         parsed.synderesis || { pass: true, violation: null },
      gateV:              parsed.gate_v || { clarity: null, stakes: null, score: null },
      convergenceSummary: parsed.convergence_summary || null,
    };
  } catch (err) {
    return { decision: 'ESCALATE', reason: `System 2 parse error: ${err.message}`, gateP: 'UNKNOWN', gateV: { clarity: null, stakes: null, score: null } };
  }
}

// ════════════════════════════════════════════════════════════════════
// Main evaluation (async to support System 2 LLM call)
// ════════════════════════════════════════════════════════════════════

(async () => {
  cleanupStore();

  const paramsHash = hashParams(toolName, toolInput);

  let coherence  = 'Intact';
  let affective  = 'None';
  let provenance = 'DIRECT';

  // ── System 1: Step 1 — neverBlock ──────────────────────────────────
  if (NEVER_BLOCK.has(toolName)) {
    allow('Proceed', 'Tool exempt (neverBlock)',
          'Exempt', 'Exempt', 'Exempt', coherence, affective, provenance);
  }

  // ── System 1: Step 1b — Write/Edit to safe files ───────────────────
  if (toolName === 'Write' || toolName === 'Edit') {
    const fileMeta = resolveFileMetadata(toolName, toolInput);
    if (fileMeta) {
      if (fileMeta.is_sensitive) {
        escalate(`Sensitive file: ${fileMeta.sensitive_reason}`,
                 'n/a', 'n/a', 'sensitive-file', coherence, affective, provenance);
      }
      if (fileMeta.git_tracked && !fileMeta.has_staged_changes) {
        allow('Proceed', 'Git-tracked file, no staged changes — fully reversible',
              'Pass', 'Pass', 'git-tracked', coherence, affective, provenance);
      }
      if (!fileMeta.file_exists) {
        allow('Proceed', 'Creating new file',
              'Pass', 'Pass', 'new-file', coherence, affective, provenance);
      }
    }
  }

  // ── System 1: Step 1c — Bash read-only vs state-modifying ──────────
  if (toolName === 'Bash') {
    const cmd = String(toolInput.command || '').trimStart();

    // Read-only commands proceed without System 2 (unless oversized resource)
    if (isBashReadOnly(cmd)) {
      const oversized = checkReadSize(cmd);
      if (oversized) {
        escalate(`Read target too large (${(oversized.size / 1024 / 1024).toFixed(0)}MB): ${oversized.path}`,
                 'n/a', 'n/a', 'oversized-read', coherence, affective, provenance);
      }
      allow('Proceed', 'Read-only command',
            'Exempt', 'Exempt', 'read-only', coherence, affective, provenance);
    }
  }

  // ── System 1: Step 2 — check for valid approval ────────────────────
  const approval = consumeApproval(paramsHash);
  if (approval) {
    allow('Proceed', `Approved via nonce ${approval.nonce}`,
          'Pass', 'Pass', 'Pre-approved', coherence, affective, provenance);
  }

  // ── System 1: Step 3 — alwaysBlock ─────────────────────────────────
  if (ALWAYS_ESCALATE_TOOLS.has(toolName)) {
    escalate(`Tool '${toolName}' requires explicit approval (alwaysBlock)`,
             'n/a', 'n/a', 'alwaysBlock', coherence, affective, provenance);
  }


  // ── System 1: Step 4 — destructive bash commands ──────────────────
  if (toolName === 'Bash') {
    const cmd = String(toolInput.command || '').trimStart();
    for (const pattern of DESTRUCTIVE_BASH_PATTERNS) {
      if (pattern.test(cmd)) {
        escalate(`Destructive command detected: requires user approval`,
                 'n/a', 'n/a', 'destructive-bash', coherence, affective, provenance);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // SYSTEM 2 — All non-exempt, non-approved tool calls reach here.
  // The LLM computes Gate P, Gate I (synderesis), and Gate V (Clarity × Stakes).
  // ════════════════════════════════════════════════════════════════════

  // Classify the user's prompt (once per session, cached)
  let promptClass = loadPromptClass();
  if (!promptClass) {
    promptClass = classifyPrompt();
    savePromptClass(promptClass);
  }

  const s2Result = await invokeSystem2(promptClass);

  // Extract LLM-computed Gate V score for logging
  const gateV    = s2Result.gateV || {};
  const gateVLabel = `clarity=${gateV.clarity ?? '?'} stakes=${gateV.stakes ?? '?'} score=${gateV.score ?? '?'}`;
  const gatePLabel = s2Result.gateP || 'UNKNOWN';
  const gateILabel = s2Result.synderesis?.pass === false
    ? `VIOLATION: ${s2Result.synderesis.violation}` : 'Pass';

  switch (s2Result.decision) {
    case 'BLOCK':
      hardBlock(`System 2 synderesis: ${s2Result.reason}`,
                gatePLabel, gateILabel, gateVLabel, coherence, affective, provenance, s2Result);
      break;

    case 'ESCALATE':
    case 'PAUSE':
      escalate(`System 2: ${s2Result.reason}`,
               gatePLabel, gateILabel, gateVLabel, coherence, affective, provenance, s2Result);
      break;

    case 'NOTE':
      allow('Note', `System 2: ${s2Result.reason}`,
            gatePLabel, gateILabel, gateVLabel, coherence, affective, provenance, s2Result);
      break;

    case 'PROCEED':
      allow('Proceed', `System 2: ${s2Result.reason}`,
            gatePLabel, gateILabel, gateVLabel, coherence, affective, provenance, s2Result);
      break;

    default:
      escalate(`System 2 unknown decision: ${s2Result.decision}`,
               gatePLabel, gateILabel, gateVLabel, coherence, affective, provenance, s2Result);
  }
})().catch(err => {
  // Top-level catch: fail-closed on any unhandled error
  process.stderr.write(`GUARDIAN_ANGEL_BLOCK|Unhandled error — failing closed: ${err.message}\n`);
  process.exit(2);
});
