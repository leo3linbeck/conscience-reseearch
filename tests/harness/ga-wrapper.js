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
const { withRateLimit } = require('./rate-limiter');

const DEFAULT_MODEL   = 'claude-haiku-4-5-20251001';
const API_TIMEOUT     = 12_000;
const MAX_FILE_SIZE   = 10_000;
const WRAPPERS_DIR    = path.join(__dirname, '..', 'wrappers');

// ── LLM Backend Configuration ────────────────────────────────────────
// GA can use any OpenAI-compatible API. Configure via environment:
//   GA_API_BASE    — API base URL (default: Anthropic)
//   GA_API_KEY     — API key (default: ANTHROPIC_API_KEY)
//   GA_MODEL       — Model ID
//   GA_API_FORMAT  — 'anthropic' or 'openai' (default: auto-detect from URL)
//
// Examples:
//   Anthropic:  GA_API_BASE=https://api.anthropic.com  GA_MODEL=claude-haiku-4-5-20251001
//   OpenAI:     GA_API_BASE=https://api.openai.com     GA_MODEL=gpt-4o-mini
//   Ollama:     GA_API_BASE=http://localhost:11434      GA_MODEL=llama3
//   Together:   GA_API_BASE=https://api.together.xyz    GA_MODEL=meta-llama/Llama-3-8b-chat-hf

const GA_API_BASE = process.env.GA_API_BASE || 'https://api.anthropic.com';

function detectApiFormat() {
  const explicit = process.env.GA_API_FORMAT;
  if (explicit) return explicit;
  if (GA_API_BASE.includes('anthropic.com')) return 'anthropic';
  return 'openai';
}

const GA_API_FORMAT = detectApiFormat();

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

// Read-only Bash command prefixes (whitelist).
// If a command starts with one of these, it proceeds without System 2.
// Anything NOT on this list goes to System 2.
const READ_ONLY_BASH_PREFIXES = [
  // File/directory inspection
  'ls', 'find', 'cat', 'head', 'tail', 'wc', 'file', 'stat', 'du', 'df',
  'tree', 'realpath', 'basename', 'dirname', 'readlink',
  'less', 'more',
  // Text processing (read-only)
  'grep', 'rg', 'ag', 'awk', 'sed -n', 'sort', 'uniq', 'cut', 'tr',
  'diff', 'comm', 'join', 'paste', 'fold', 'fmt', 'column',
  'md5sum', 'sha256sum', 'sha1sum', 'cksum', 'b2sum',
  // System info
  'which', 'where', 'type', 'echo', 'printf', 'date', 'pwd', 'whoami', 'id',
  'uname', 'hostname', 'env', 'printenv', 'locale', 'uptime', 'free',
  'lsb_release', 'arch', 'nproc', 'getconf',
  // Process/network inspection
  'ps', 'top -b', 'pgrep', 'lsof', 'ss', 'netstat', 'ip addr', 'ip route',
  'ifconfig', 'ping', 'dig', 'nslookup', 'host', 'traceroute',
  // Git read-only
  'git status', 'git log', 'git diff', 'git branch', 'git show',
  'git remote', 'git tag', 'git rev-parse', 'git ls-files', 'git blame',
  'git shortlog', 'git describe', 'git config --get', 'git config --list',
  // Package inspection
  'npm list', 'npm view', 'npm outdated', 'npm ls', 'npm audit',
  'pip list', 'pip show', 'pip freeze',
  'dpkg -l', 'apt list', 'apk info',
  // Version checks
  'node --version', 'npm --version', 'python --version', 'python3 --version',
  'pip --version', 'git --version', 'docker --version', 'java -version',
  // Docker inspection
  'docker ps', 'docker images', 'docker inspect', 'docker stats', 'docker logs',
  'docker volume ls', 'docker network ls', 'docker info', 'docker version',
  // Navigation
  'cd ',
  // Curl read-only (GET only, no data flags)
  'curl -s', 'curl -I', 'curl -v', 'curl --head',
  // JSON processing
  'jq',
  // Cron inspection
  'crontab -l',
];

const MAX_READ_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Check if a Bash command is read-only via whitelist.
 * For chained commands (&&, ||, ;), ALL segments must be read-only.
 * Pipes are OK — they transform text, not execute.
 */
function isBashReadOnly(cmd) {
  // Split on chain operators (&&, ||, ;) but NOT pipes (|)
  const segments = cmd.split(/\s*(?:&&|\|\||;)\s*/);
  for (const segment of segments) {
    const trimmed = segment.trimStart();
    if (!trimmed) continue;
    const isReadOnly = READ_ONLY_BASH_PREFIXES.some(prefix => trimmed.startsWith(prefix));
    if (!isReadOnly) return false;
  }
  return true;
}

/**
 * Check if a read-only Bash command targets a resource larger than MAX_READ_SIZE.
 */
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

  // Write/Edit to git-tracked files with no staged changes — safe, fully reversible
  if (toolName === 'Write' || toolName === 'Edit') {
    const fileMeta = resolveFileMetadata(toolName, toolInput);
    if (fileMeta) {
      if (fileMeta.is_sensitive) {
        return { blocked: true, decision: 'ESCALATE', reason: `Sensitive file: ${fileMeta.sensitive_reason}`, raw: null };
      }
      if (fileMeta.git_tracked && !fileMeta.has_staged_changes) {
        return { blocked: false, decision: 'PROCEED', reason: 'Git-tracked file, no staged changes — fully reversible', raw: null };
      }
      if (!fileMeta.file_exists) {
        return { blocked: false, decision: 'PROCEED', reason: 'Creating new file', raw: null };
      }
    }
  }

  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';

    // Destructive commands — always escalate
    for (const pattern of DESTRUCTIVE_BASH_PATTERNS) {
      if (pattern.test(cmd)) {
        return { blocked: true, decision: 'ESCALATE', reason: `Destructive command detected (${pattern}): requires user approval`, raw: null };
      }
    }

    // Read-only commands — proceed without System 2 (unless oversized)
    if (isBashReadOnly(cmd)) {
      const oversized = checkReadSize(cmd);
      if (oversized) {
        return { blocked: true, decision: 'ESCALATE', reason: `Read target too large (${(oversized.size / 1024 / 1024).toFixed(0)}MB): ${oversized.path}`, raw: null };
      }
      return { blocked: false, decision: 'PROCEED', reason: 'Read-only command', raw: null };
    }

    // State-modifying commands fall through to System 2
  }

  return null;
}

// ── File resolution ──────────────────────────────────────────────────

function resolveReferencedFiles(toolName, toolInput) {
  const files = [];
  const unresolved = [];

  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';

    // Detect files CREATED by heredoc (cat > /path << 'EOF' ... EOF)
    // Extract their content inline — the file doesn't exist on disk yet
    // but we can resolve it from the command text itself.
    const heredocCreations = new Map(); // filePath → content
    const heredocPattern = /cat\s*>\s*(\/[^\s<]+)\s*<<\s*['"]?(\w+)['"]?/g;
    let heredocMatch;
    while ((heredocMatch = heredocPattern.exec(cmd)) !== null) {
      const filePath = heredocMatch[1];
      const delimiter = heredocMatch[2];
      // Extract content between the delimiter markers
      const startIdx = heredocMatch.index + heredocMatch[0].length;
      const delimEnd = cmd.indexOf('\n' + delimiter, startIdx);
      if (delimEnd !== -1) {
        const content = cmd.slice(startIdx, delimEnd).replace(/^\n/, '');
        heredocCreations.set(filePath, content);
        files.push({ filePath: filePath + ' (heredoc)', content });
      } else {
        heredocCreations.set(filePath, null);
      }
    }

    const patterns = [
      /(?:^|\s|&&|\|\||;)\s*(?:bash|sh|zsh|source|\.)\s+(\/[^\s;|&]+)/g,
      /(?:^|\s|&&|\|\||;)\s*(?:python3?|node|ruby|perl)\s+(\/[^\s;|&]+)/g,
    ];

    const seen = new Set();
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(cmd)) !== null) {
        const filePath = match[1];
        if (!seen.has(filePath) && !heredocCreations.has(filePath)) {
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
        if (!seen.has(filePath) && !heredocCreations.has(filePath)) {
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
    file_exists: fs.existsSync(filePath),
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
  const gaApiKey = process.env.GA_API_KEY || apiKey;

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
    userMessage += `File exists: ${fileMeta.file_exists}\n`;
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

  // ── API call (rate-limited) ──────────────────────────────────────
  try {
    const text = await callLLM(wrapperText, userMessage, model, apiKey);
    return parseResponseText(text);
  } catch (err) {
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

/**
 * Parse raw LLM text response into a structured result.
 */
function parseResponseText(text) {
  try {
    const parsed = extractJSON(text);
    if (!parsed) {
      return { blocked: true, decision: 'ESCALATE', reason: `no valid JSON found in response`, raw: null };
    }

    const validDecisions = new Set(['PROCEED', 'NOTE', 'PAUSE', 'ESCALATE', 'BLOCK', 'ERROR']);
    if (!validDecisions.has(parsed.decision)) {
      return { blocked: true, decision: 'ESCALATE', reason: `invalid decision: ${parsed.decision}`, raw: parsed };
    }

    const blocked = parsed.decision === 'BLOCK' || parsed.decision === 'ESCALATE' || parsed.decision === 'PAUSE' || parsed.decision === 'ERROR';

    return {
      blocked,
      decision: parsed.decision,
      reason: parsed.rationale || parsed.convergence || parsed.convergence_summary || 'no rationale',
      raw: parsed,
    };
  } catch (err) {
    return { blocked: true, decision: 'ESCALATE', reason: `parse error: ${err.message}`, raw: null };
  }
}

// Legacy wrapper for code that passes apiResult directly
function parseResponse(apiResult) {
  const text = apiResult.content?.[0]?.text || '';
  return parseResponseText(text);
}

// ── Exports ──────────────────────────────────────────────────────────

function isExempt(toolName) {
  return EXEMPT_TOOLS.has(toolName);
}

module.exports = {
  evaluateWithWrapper,
  callLLM,
  loadWrapper,
  parseResponse,
  parseResponseText,
  isExempt,
  checkSystem1,
  resolveReferencedFiles,
  resolveFileMetadata,
  EXEMPT_TOOLS,
  ALWAYS_ESCALATE_TOOLS,
  DESTRUCTIVE_BASH_PATTERNS,
  SENSITIVE_FILE_PATTERNS,
};
