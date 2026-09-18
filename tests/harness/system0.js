'use strict';

/**
 * Guardian Angel — System 0 (reflex)
 *
 * Deterministic, sub-millisecond, no intelligence. A reflex has three outcomes:
 *
 *   APPROVE   — the action matches a pattern that is safe by construction
 *   PRINCIPAL — the flinch: the action matches a pattern that the principal must
 *               always see (destructive command, sensitive file). A flinch does not
 *               refuse; it hands the decision straight to the principal.
 *   null      — not recognised. Pass upward to System 1.
 *
 * System 0 must never approve something it does not fully recognise. Because
 * System 1 sits directly above it and is cheap, System 0 can afford to be strict:
 * when in doubt it returns null.
 *
 * This file is the single source of truth. The clinical-trial harness requires
 * it directly; guardian-angel/install.js copies it to ~/.claude/hooks/ga-lib/.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Tools with no lasting side effects ───────────────────────────────
const EXEMPT_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite',
  'ToolSearch', 'Agent', 'EnterPlanMode', 'ExitPlanMode',
  'Diff', 'List', 'Show', 'Parse', 'Summarize', 'Explain',
  'Review', 'Describe', 'ReadFile', 'CheckFile', 'FindInFiles',
  'AskUserQuestion', 'TaskOutput',
]);

// Tools that always go straight to the principal (configurable)
const ALWAYS_ESCALATE_TOOLS = new Set(/* populate as needed */ []);

// ── Sensitive file patterns (flinch on Write/Edit) ───────────────────
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

// ── Destructive bash patterns (flinch) ───────────────────────────────
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

// ── Read-only bash commands (whitelist) ──────────────────────────────
// Matched at a TOKEN BOUNDARY: 'ss' matches `ss -tlnp`, never `ssh host ...`.
const READ_ONLY_BASH_COMMANDS = [
  // File/directory inspection
  'ls', 'find', 'cat', 'head', 'tail', 'wc', 'file', 'stat', 'du', 'df',
  'tree', 'realpath', 'basename', 'dirname', 'readlink',
  'less', 'more',
  // Text processing (read-only). awk is deliberately absent: it can run system().
  'grep', 'rg', 'ag', 'sed -n', 'sort', 'uniq', 'cut', 'tr',
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
  'cd',
  // Curl: plain GET only — see SEGMENT_DENY
  'curl',
  // JSON processing
  'jq',
  // Cron inspection
  'crontab -l',
  // Syntax check only (does not execute)
  'bash -n', 'sh -n',
];

// A whitelisted command is still NOT reflex-safe if its segment matches one of these.
const SEGMENT_DENY = [
  /^env\s+\S/,                                                     // env VAR=x cmd → runs cmd
  /^find\b.*\s-(exec|execdir|ok|okdir|delete|fprint\w*|fls)\b/,    // find that executes or writes
  /^sort\b.*\s(-o|--output)\b/,                                    // sort that writes
  /^uniq\s+(-\S+\s+)*\S+\s+\S+/,                                   // uniq IN OUT writes OUT
  /^tree\b.*\s-o\b/,
  /^date\s+.*(-s\b|--set\b)/,
  /^hostname\s+[^-\s]/,                                            // sets the hostname
  /^ifconfig\s+\S+\s+\S/,                                          // ifconfig eth0 down
  /^ip\s+(addr|route)\s+(add|del|delete|flush|change|replace)\b/,
  /^git\s+remote\s+(add|remove|rm|rename|set-url|set-head|set-branches|prune|update)\b/,
  /^git\s+tag\s+(?!(-l|--list|-n\d*|--contains|--points-at|--sort\S*)\b)\S/,
  /^git\s+branch\s+(?!(-a|-r|-l|-v|-vv|--all|--list|--remotes|--verbose|--show-current|--contains|--merged|--no-merged)\b)\S/,
  /^git\s+(log|diff|show)\b.*\s--output\b/,
  /^npm\s+audit\b.*\bfix\b/,
  // Network commands must not carry expanded data outward
  /^(curl|ping|dig|nslookup|host|traceroute)\b.*[$@]/,
];

const CURL_SAFE_FLAG = /^(-[sSLIvf]+|--silent|--show-error|--location|--head|--verbose|--fail)$/;

const MAX_READ_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Split a bash command into segments on every unquoted control operator
 * (&&, ||, ;, |, |&, &, newline) and note any construct that lets a
 * "read-only" command execute code or write files.
 *
 * Quote-aware so that `grep -E "a|b" file` stays one segment.
 */
function parseBash(cmd) {
  const segments = [];
  let cur = '';
  let quote = null;
  let unsafe = null;

  const push = () => { if (cur.trim()) segments.push(cur.trim()); cur = ''; };

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    const n = cmd[i + 1];

    if (quote === "'") { cur += c; if (c === "'") quote = null; continue; }

    if (c === '\\') { cur += c + (n ?? ''); i++; continue; }

    // Substitutions expand inside double quotes too
    if (c === '`' || (c === '$' && n === '(')) { unsafe = unsafe || 'command substitution'; cur += c; continue; }

    if (quote === '"') { cur += c; if (c === '"') quote = null; continue; }

    if (c === "'" || c === '"') { quote = c; cur += c; continue; }

    if ((c === '<' || c === '>') && n === '(') { unsafe = unsafe || 'process substitution'; cur += c; continue; }

    if (c === '>') {
      // Harmless redirections: 2>&1, >&2, >/dev/null, 2>>/dev/null
      const m = cmd.slice(i).match(/^>>?\s*(&\d+|\/dev\/null(?=$|[\s;|&)]))/);
      if (m) { cur += m[0]; i += m[0].length - 1; continue; }
      unsafe = unsafe || 'output redirected to a file';
      cur += c;
      continue;
    }

    if (c === '\n' || c === ';') { push(); continue; }
    if (c === '&') { push(); if (n === '&') i++; continue; }
    if (c === '|') { push(); if (n === '|' || n === '&') i++; continue; }

    cur += c;
  }

  if (quote) unsafe = unsafe || 'unterminated quote';
  push();
  return { segments, unsafe };
}

function isSegmentReadOnly(segment) {
  const seg = segment.replace(/\s+/g, ' ').trim();
  if (!seg) return true;

  const allowed = READ_ONLY_BASH_COMMANDS.some(p => seg === p || seg.startsWith(p + ' '));
  if (!allowed) return false;

  if (SEGMENT_DENY.some(re => re.test(seg))) return false;

  if (seg === 'curl' || seg.startsWith('curl ')) {
    const args  = seg.split(' ').slice(1);
    const flags = args.filter(a => a.startsWith('-'));
    const urls  = args.filter(a => !a.startsWith('-'));
    if (!flags.every(f => CURL_SAFE_FLAG.test(f))) return false;   // no -d, -F, -T, -X, -o, -K …
    if (urls.length !== 1) return false;
  }

  return true;
}

/**
 * A command is reflex-safe only if it contains no substitution or file
 * redirection and EVERY segment — including every stage of every pipe —
 * is a whitelisted read-only command.
 */
function isBashReadOnly(cmd) {
  const { segments, unsafe } = parseBash(String(cmd || ''));
  if (unsafe) return false;
  if (segments.length === 0) return false;
  return segments.every(isSegmentReadOnly);
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
        if (stat.size > MAX_READ_SIZE) return { path: match[1], size: stat.size };
      } catch {}
    }
  }
  return null;
}

// ── File metadata (git status + sensitivity) ─────────────────────────

function resolveFileMetadata(toolName, toolInput) {
  const filePath = toolInput && toolInput.file_path;
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

// ── The reflex ───────────────────────────────────────────────────────

/**
 * @returns {{verdict:'APPROVE'|'PRINCIPAL', reason:string, gate:string}|null}
 *          null → not recognised; pass upward to System 1.
 */
function checkSystem0(toolName, toolInput) {
  if (EXEMPT_TOOLS.has(toolName)) {
    return { verdict: 'APPROVE', reason: 'Tool has no lasting side effects', gate: 'exempt-tool' };
  }

  if (ALWAYS_ESCALATE_TOOLS.has(toolName)) {
    return { verdict: 'PRINCIPAL', reason: `Tool '${toolName}' always requires the principal's approval`, gate: 'always-escalate' };
  }

  if (toolName === 'Write' || toolName === 'Edit') {
    const fileMeta = resolveFileMetadata(toolName, toolInput);
    if (fileMeta) {
      if (fileMeta.is_sensitive) {
        return { verdict: 'PRINCIPAL', reason: `Sensitive file: ${fileMeta.sensitive_reason}`, gate: 'sensitive-file' };
      }
      if (fileMeta.git_tracked && !fileMeta.has_staged_changes) {
        return { verdict: 'APPROVE', reason: 'Git-tracked file, no staged changes — fully reversible', gate: 'git-tracked' };
      }
      if (!fileMeta.file_exists) {
        return { verdict: 'APPROVE', reason: 'Creating new file', gate: 'new-file' };
      }
    }
  }

  if (toolName === 'Bash') {
    const cmd = String((toolInput && toolInput.command) || '');

    // The flinch comes first: a destructive command is never "read-only".
    for (const pattern of DESTRUCTIVE_BASH_PATTERNS) {
      if (pattern.test(cmd)) {
        return { verdict: 'PRINCIPAL', reason: `Destructive command detected (${pattern}): requires the principal's approval`, gate: 'destructive-bash' };
      }
    }

    if (isBashReadOnly(cmd)) {
      const oversized = checkReadSize(cmd);
      if (oversized) {
        return { verdict: 'PRINCIPAL', reason: `Read target too large (${(oversized.size / 1024 / 1024).toFixed(0)}MB): ${oversized.path}`, gate: 'oversized-read' };
      }
      return { verdict: 'APPROVE', reason: 'Read-only command', gate: 'read-only' };
    }
  }

  return null;
}

module.exports = {
  checkSystem0,
  isBashReadOnly,
  parseBash,
  checkReadSize,
  resolveFileMetadata,
  EXEMPT_TOOLS,
  ALWAYS_ESCALATE_TOOLS,
  SENSITIVE_FILE_PATTERNS,
  DESTRUCTIVE_BASH_PATTERNS,
  READ_ONLY_BASH_COMMANDS,
};
