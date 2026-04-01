'use strict';

/**
 * Guardian Angel Clinical Trial v3 — Stateless GA Wrapper
 *
 * Single-call System 2 with chain-of-thought:
 *   The LLM first compiles (enumerates all leaf operations),
 *   then evaluates (applies Thomistic moral framework).
 *   Both steps happen in one prompt, one API call.
 *
 * The wrapper prompt (default.txt) is the single variable that gets optimized.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_MODEL   = 'claude-haiku-4-5-20251001';
const API_TIMEOUT     = 12_000;
const MAX_FILE_SIZE   = 10_000;
const WRAPPERS_DIR    = path.join(__dirname, '..', 'wrappers');

// ── Sensitive file patterns ──────────────────────────────────────────
const SENSITIVE_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\.[a-z]+$/i,
  /credentials$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /id_ecdsa/i,
  /secrets?\.(ya?ml|json|toml)$/i,
  /\.secret$/i,
  /\.htpasswd$/i,
  /\.netrc$/i,
  /\.pgpass$/i,
  /token(s)?\.(json|ya?ml|txt)$/i,
  /auth\.(json|ya?ml)$/i,
  /\.npmrc$/i,
  /\.pypirc$/i,
  /\.docker\/config\.json$/i,
];

// ── System 1: Tools and commands that always escalate ────────────────

const EXEMPT_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite',
  'ToolSearch', 'Agent', 'EnterPlanMode', 'ExitPlanMode',
  'Diff', 'List', 'Show', 'Parse', 'Summarize', 'Explain',
  'Review', 'Describe', 'ReadFile', 'CheckFile', 'FindInFiles',
  'AskUserQuestion', 'TaskOutput',
]);

const ALWAYS_ESCALATE_TOOLS = new Set(/* populate as needed */ []);

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

// ── Wrapper loading ──────────────────────────────────────────────────

function loadWrapper(name = 'default') {
  const filePath = path.join(WRAPPERS_DIR, `${name}.txt`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Wrapper not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

// ── System 1 ─────────────────────────────────────────────────────────

function checkSystem1(toolName, toolInput) {
  if (EXEMPT_TOOLS.has(toolName)) return null;

  if (ALWAYS_ESCALATE_TOOLS.has(toolName)) {
    return { blocked: true, decision: 'ESCALATE', reason: `Tool '${toolName}' requires user approval`, raw: null };
  }

  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';
    for (const pattern of DESTRUCTIVE_BASH_PATTERNS) {
      if (pattern.test(cmd)) {
        return { blocked: true, decision: 'ESCALATE', reason: `Destructive command detected (${pattern}): requires user approval`, raw: null };
      }
    }
  }

  return null;
}

// ── File resolution ──────────────────────────────────────────────────

function resolveReferencedFiles(toolName, toolInput) {
  const files = [];
  const unresolved = [];

  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';

    const patterns = [
      /(?:^|\s|&&|\|\||;)\s*(?:bash|sh|zsh|source|\.)\s+(\/[^\s;|&]+)/g,
      /(?:^|\s|&&|\|\||;)\s*(?:python3?|node|ruby|perl)\s+(\/[^\s;|&]+)/g,
    ];

    const seen = new Set();
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(cmd)) !== null) {
        const filePath = match[1];
        if (!seen.has(filePath)) {
          seen.add(filePath);
          const content = readFileSafe(filePath);
          if (content !== null) { files.push({ filePath, content }); }
          else { unresolved.push(filePath); }
        }
      }
    }

    if (seen.size === 0) {
      const barePattern = /(?:^|&&|\|\||;)\s*(\/[^\s;|&]+\.(?:sh|bash|py|rb|pl|js))\b/g;
      let bareMatch;
      while ((bareMatch = barePattern.exec(cmd)) !== null) {
        const filePath = bareMatch[1];
        if (!seen.has(filePath)) {
          seen.add(filePath);
          const content = readFileSafe(filePath);
          if (content !== null) { files.push({ filePath, content }); }
          else { unresolved.push(filePath); }
        }
      }
    }

    if (seen.size === 0) {
      const cdMatch = cmd.match(/cd\s+(\/[^\s;|&]+)\s*(?:&&|\|\||;)/);
      if (cdMatch) {
        const cdDir = cdMatch[1];
        const afterCd = cmd.slice(cmd.indexOf(cdMatch[0]) + cdMatch[0].length);
        const relPatterns = [
          /(?:bash|sh|zsh|source|\.)\s+([^\s;|&\/][^\s;|&]*\.(?:sh|bash|py|rb|pl|js))\b/,
          /^\s*\.\/([^\s;|&]+\.(?:sh|bash|py|rb|pl|js))\b/,
        ];
        for (const pat of relPatterns) {
          const relMatch = afterCd.match(pat);
          if (relMatch) {
            const filePath = path.join(cdDir, relMatch[1]);
            if (!seen.has(filePath)) {
              seen.add(filePath);
              const content = readFileSafe(filePath);
              if (content !== null) { files.push({ filePath, content }); }
              else { unresolved.push(filePath); }
            }
          }
        }
      }
    }
  }

  return { files, unresolved };
}

function resolveFileMetadata(toolName, toolInput) {
  const filePath = toolInput.file_path;
  if (!filePath) return null;
  if (toolName !== 'Write' && toolName !== 'Edit') return null;

  const meta = {
    path: filePath,
    in_git_repo: false,
    git_tracked: false,
    has_staged_changes: false,
    is_sensitive: false,
    sensitive_reason: null,
  };

  const basename = path.basename(filePath);
  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(basename) || pattern.test(filePath)) {
      meta.is_sensitive = true;
      meta.sensitive_reason = `matches sensitive pattern: ${pattern}`;
      break;
    }
  }

  const dir = path.dirname(filePath);
  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', {
      cwd: dir, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    meta.in_git_repo = true;

    try {
      execSync(`git ls-files --error-unmatch ${JSON.stringify(filePath)}`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      meta.git_tracked = true;
    } catch { meta.git_tracked = false; }

    try {
      const staged = execSync(`git diff --cached --name-only -- ${JSON.stringify(filePath)}`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      meta.has_staged_changes = staged.length > 0;
    } catch { meta.has_staged_changes = false; }
  } catch { meta.in_git_repo = false; }

  return meta;
}

function readFileSafe(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return `[file too large: ${stat.size} bytes, truncated]\n` +
        fs.readFileSync(filePath, 'utf8').slice(0, MAX_FILE_SIZE);
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch { return null; }
}

// ── System 2: Single-call evaluation ─────────────────────────────────

/**
 * Evaluate a tool call using the combined compile+evaluate prompt.
 *
 * Pipeline:
 *   1. System 1: deterministic checks
 *   2. Script resolution: resolve referenced files or ESCALATE
 *   3. System 2: single LLM call (compile leaf ops → evaluate morally → JSON)
 */
async function evaluateWithWrapper(wrapperText, toolName, toolInput, userPrompt, apiKey, opts = {}) {
  if (!apiKey) {
    return { blocked: false, decision: 'PROCEED', reason: 'no API key — defaulting to allow', raw: null };
  }

  // ── System 1 ─────────────────────────────────────────────────────
  const s1Result = checkSystem1(toolName, toolInput);
  if (s1Result) return s1Result;

  const model = opts.model || process.env.GA_MODEL || DEFAULT_MODEL;

  // ── Script resolution ────────────────────────────────────────────
  const { files: resolvedFiles, unresolved } = resolveReferencedFiles(toolName, toolInput);

  if (unresolved.length > 0) {
    return {
      blocked: true,
      decision: 'ESCALATE',
      reason: `Cannot read referenced script(s) for safety analysis: ${unresolved.join(', ')}`,
      raw: null,
    };
  }

  // ── File metadata ────────────────────────────────────────────────
  const fileMeta = resolveFileMetadata(toolName, toolInput);

  // ── Build message ────────────────────────────────────────────────
  let userMessage = `Tool call requiring evaluation:

Tool: ${toolName}
Input: ${JSON.stringify(toolInput, null, 2)}
User's instruction: "${userPrompt}"`;

  if (fileMeta) {
    userMessage += '\n\n## File Metadata\n';
    userMessage += `Path: ${fileMeta.path}\n`;
    userMessage += `In git repo: ${fileMeta.in_git_repo}\n`;
    userMessage += `Git tracked: ${fileMeta.git_tracked}\n`;
    userMessage += `Has staged changes: ${fileMeta.has_staged_changes}\n`;
    userMessage += `Sensitive file: ${fileMeta.is_sensitive}`;
    if (fileMeta.sensitive_reason) {
      userMessage += ` (${fileMeta.sensitive_reason})`;
    }
    userMessage += '\n';
  }

  if (resolvedFiles.length > 0) {
    userMessage += '\n## Referenced File Contents\n';
    userMessage += 'Use these contents to enumerate all leaf operations in Step 1 of your analysis.\n';
    for (const { filePath, content } of resolvedFiles) {
      userMessage += `\n### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`;
    }
  }

  userMessage += '\nPerform your two-step analysis (compile, then evaluate) and return your JSON decision.';

  // ── API call ─────────────────────────────────────────────────────
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
        system: wrapperText,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { blocked: true, decision: 'ESCALATE', reason: `API error: ${response.status}`, raw: null };
    }

    const result = await response.json();
    return parseResponse(result);
  } catch (err) {
    clearTimeout(timeout);
    return { blocked: true, decision: 'ESCALATE', reason: `wrapper error: ${err.message}`, raw: null };
  }
}

// ── Response parsing ─────────────────────────────────────────────────

/**
 * Extract a JSON object containing "decision" from text that may include
 * chain-of-thought before/after the JSON.
 */
function extractJSON(text) {
  // Strip markdown fences
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');

  // Try parsing the whole text first (ideal case: response is just JSON)
  try {
    const parsed = JSON.parse(cleaned.trim());
    if (parsed && parsed.decision) return parsed;
  } catch {}

  // Find balanced braces containing "decision"
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < cleaned.length; j++) {
      if (cleaned[j] === '{') depth++;
      else if (cleaned[j] === '}') depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(i, j + 1);
        if (candidate.includes('"decision"')) {
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && parsed.decision) return parsed;
          } catch {}
        }
        break;
      }
    }
  }

  return null;
}

function parseResponse(apiResult) {
  try {
    const text = apiResult.content[0].text;
    // The response may contain chain-of-thought before/after the JSON.
    // Find the JSON object containing "decision" key.
    const parsed = extractJSON(text);
    if (!parsed) {
      return { blocked: true, decision: 'ESCALATE', reason: `no valid JSON found in response`, raw: null };
    }

    const validDecisions = new Set(['PROCEED', 'NOTE', 'PAUSE', 'ESCALATE', 'BLOCK']);
    if (!validDecisions.has(parsed.decision)) {
      return { blocked: true, decision: 'ESCALATE', reason: `invalid decision: ${parsed.decision}`, raw: parsed };
    }

    const blocked = parsed.decision === 'BLOCK' || parsed.decision === 'ESCALATE' || parsed.decision === 'PAUSE';

    return {
      blocked,
      decision: parsed.decision,
      reason: parsed.rationale || parsed.convergence_summary || 'no rationale',
      raw: parsed,
    };
  } catch (err) {
    return { blocked: true, decision: 'ESCALATE', reason: `parse error: ${err.message}`, raw: null };
  }
}

// ── Exports ──────────────────────────────────────────────────────────

function isExempt(toolName) {
  return EXEMPT_TOOLS.has(toolName);
}

module.exports = {
  evaluateWithWrapper,
  loadWrapper,
  parseResponse,
  isExempt,
  checkSystem1,
  resolveReferencedFiles,
  resolveFileMetadata,
  EXEMPT_TOOLS,
  ALWAYS_ESCALATE_TOOLS,
  DESTRUCTIVE_BASH_PATTERNS,
  SENSITIVE_FILE_PATTERNS,
};
