#!/usr/bin/env node
/**
 * Guardian Angel — Install / Update Script
 *
 * Builds the production hook from test system components and installs
 * to ~/.claude/hooks/. The test system is the source of truth.
 *
 * Usage:
 *   node guardian-angel/install.js          # install/update
 *   node guardian-angel/install.js --dry-run # show what would be installed
 *   node guardian-angel/install.js --diff    # show what differs
 *
 * What gets installed:
 *   ~/.claude/hooks/guardian-angel.js        — the hook (System 1 + System 2)
 *   ~/.claude/hooks/ga-system2-prompt.txt    — the evaluation prompt (Phase 2)
 *   ~/.claude/hooks/ga-compile-prompt.txt    — the compilation prompt (Phase 1)
 *   ~/.claude/hooks/ga-lib/                  — shared modules
 *     file-metadata.js                       — git status, sensitive patterns
 *     file-resolver.js                       — reads scripts for DAG flattening
 *
 * Architecture:
 *   - guardian-angel.template.js is the IMMUTABLE template (never modified)
 *   - install.js patches the template to load prompt from file + use ga-lib/
 *   - The patched result is written to both production and repo hooks/ dir
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const REPO_ROOT     = path.join(__dirname, '..');
const HOOKS_DIR     = path.join(os.homedir(), '.claude', 'hooks');
const GA_LIB_DIR    = path.join(HOOKS_DIR, 'ga-lib');
const TEMPLATE_PATH = path.join(__dirname, 'hooks', 'guardian-angel.template.js');

const DRY_RUN   = process.argv.includes('--dry-run');
const SHOW_DIFF = process.argv.includes('--diff');

// ── Source paths ─────────────────────────────────────────────────────
const WRAPPER_SRC  = path.join(REPO_ROOT, 'tests', 'wrappers', 'default.txt');
const COMPILE_SRC  = path.join(REPO_ROOT, 'tests', 'wrappers', 'compile.txt');
const GA_WRAPPER_SRC = path.join(REPO_ROOT, 'tests', 'harness', 'ga-wrapper.js');

// ── Destination paths ────────────────────────────────────────────────
const WRAPPER_DST  = path.join(HOOKS_DIR, 'ga-system2-prompt.txt');
const COMPILE_DST  = path.join(HOOKS_DIR, 'ga-compile-prompt.txt');
const HOOK_DST     = path.join(HOOKS_DIR, 'guardian-angel.js');
const REPO_HOOK    = path.join(__dirname, 'hooks', 'guardian-angel.js');

// ── Extract modules from test ga-wrapper.js ──────────────────────────

function extractFromTestSource() {
  const src = fs.readFileSync(GA_WRAPPER_SRC, 'utf8');

  // Extract SENSITIVE_FILE_PATTERNS array
  const patternsMatch = src.match(/const SENSITIVE_FILE_PATTERNS = \[([\s\S]*?)\];/);
  const patternsStr = patternsMatch ? '[\n' + patternsMatch[1] + ']' : '[]';

  // Extract DESTRUCTIVE_BASH_PATTERNS array
  const destructiveMatch = src.match(/const DESTRUCTIVE_BASH_PATTERNS = \[([\s\S]*?)\];/);
  const destructiveStr = destructiveMatch ? '[\n' + destructiveMatch[1] + ']' : '[]';

  // Extract ALWAYS_ESCALATE_TOOLS
  const escalateMatch = src.match(/const ALWAYS_ESCALATE_TOOLS = new Set\(([\s\S]*?)\);/);
  const escalateStr = escalateMatch ? escalateMatch[1].trim() : '/* populate as needed */ []';

  return { patternsStr, destructiveStr, escalateStr };
}

// ── Build file-metadata.js ───────────────────────────────────────────

function buildFileMetadata() {
  const { patternsStr } = extractFromTestSource();

  return `'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SENSITIVE_FILE_PATTERNS = ${patternsStr};

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
      meta.sensitive_reason = 'matches sensitive pattern: ' + pattern;
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
      execSync('git ls-files --error-unmatch ' + JSON.stringify(filePath), {
        cwd: repoRoot, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      meta.git_tracked = true;
    } catch { meta.git_tracked = false; }

    try {
      const staged = execSync('git diff --cached --name-only -- ' + JSON.stringify(filePath), {
        cwd: repoRoot, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      meta.has_staged_changes = staged.length > 0;
    } catch { meta.has_staged_changes = false; }
  } catch { meta.in_git_repo = false; }

  return meta;
}

module.exports = { resolveFileMetadata, SENSITIVE_FILE_PATTERNS };
`;
}

// ── Build file-resolver.js ───────────────────────────────────────────

function buildFileResolver() {
  return `'use strict';

const fs = require('fs');

const MAX_FILE_SIZE = 10000;

function resolveReferencedFiles(toolName, toolInput) {
  const files = [];
  const unresolved = [];

  if (toolName !== 'Bash') return { files, unresolved };

  const cmd = toolInput.command || '';
  const patterns = [
    /(?:^|\\s|&&|\\|\\||;)\\s*(?:bash|sh|zsh|source|\\.)\\s+(\\/[^\\s;|&]+)/g,
    /(?:^|\\s|&&|\\|\\||;)\\s*(?:python3?|node|ruby|perl)\\s+(\\/[^\\s;|&]+)/g,
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
    const bareMatch = cmd.match(/^\\s*(\\/[^\\s;|&]+\\.(?:sh|bash|py|rb|pl|js))\\b/);
    if (bareMatch) {
      const filePath = bareMatch[1];
      const content = readFileSafe(filePath);
      if (content !== null) { files.push({ filePath, content }); }
      else { unresolved.push(filePath); }
    }
  }

  return { files, unresolved };
}

function readFileSafe(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return '[file too large: ' + stat.size + ' bytes, truncated]\\n' +
        fs.readFileSync(filePath, 'utf8').slice(0, MAX_FILE_SIZE);
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch { return null; }
}

module.exports = { resolveReferencedFiles };
`;
}

// ── Build the production hook from the IMMUTABLE template ────────────

function buildProductionHook() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`Template not found: ${TEMPLATE_PATH}`);
    console.error('The template is the immutable base hook. It should never be deleted.');
    process.exit(1);
  }

  let hook = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const { destructiveStr, escalateStr } = extractFromTestSource();

  // 1. Replace embedded SYSTEM2_PROMPT with file loader
  const promptLoadCode = `const SYSTEM2_PROMPT = (() => {
  const promptPath = require('path').join(require('os').homedir(), '.claude', 'hooks', 'ga-system2-prompt.txt');
  try { return require('fs').readFileSync(promptPath, 'utf8'); }
  catch { return null; }
})()`;

  const promptStart = hook.indexOf("const SYSTEM2_PROMPT = `");
  const promptEnd = hook.indexOf("`;", promptStart) + 2;
  if (promptStart === -1 || promptEnd <= 2) {
    console.error('Could not find SYSTEM2_PROMPT template string in template.');
    process.exit(1);
  }
  hook = hook.slice(0, promptStart) + promptLoadCode + hook.slice(promptEnd);

  // 2. Inject ga-lib requires + destructive patterns + always-escalate after SYSTEM2_MODEL
  const injectCode = `
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
const DESTRUCTIVE_BASH_PATTERNS = ${destructiveStr};

// Tools that always require escalation
const ALWAYS_ESCALATE_TOOLS = new Set(${escalateStr});

`;

  const modelLine = hook.indexOf("const SYSTEM2_MODEL");
  const afterModelLine = hook.indexOf('\n', modelLine) + 1;
  hook = hook.slice(0, afterModelLine) + injectCode + hook.slice(afterModelLine);

  // 3. Replace ALWAYS_BLOCK with ALWAYS_ESCALATE in System 1 logic
  hook = hook.replace(
    /const ALWAYS_BLOCK = new Set\(\/\* populate as needed \*\/ \[\]\);/,
    '// ALWAYS_BLOCK replaced by ALWAYS_ESCALATE_TOOLS (injected above)'
  );
  hook = hook.replace(
    /if \(ALWAYS_BLOCK\.has\(toolName\)\) \{/,
    'if (ALWAYS_ESCALATE_TOOLS.has(toolName)) {'
  );

  // 4. Add destructive bash check in System 1 (before System 2)
  const system2Comment = '  // ════════════════════════════════════════════════════════════════════\n  // SYSTEM 2';
  const s2Idx = hook.indexOf(system2Comment);
  if (s2Idx !== -1) {
    const destructiveCheck = `
  // ── System 1: Step 4 — destructive bash commands ──────────────────
  if (toolName === 'Bash') {
    const cmd = String(toolInput.command || '').trimStart();
    for (const pattern of DESTRUCTIVE_BASH_PATTERNS) {
      if (pattern.test(cmd)) {
        escalate(\`Destructive command detected: requires user approval\`,
                 'n/a', 'n/a', 'destructive-bash', coherence, affective, provenance);
      }
    }
  }

`;
    hook = hook.slice(0, s2Idx) + destructiveCheck + hook.slice(s2Idx);
  }

  // 5. Patch buildSystem2UserMessage to include file metadata + resolved files
  const oldMsgBuilder = hook.match(/function buildSystem2UserMessage\(promptClass\) \{[\s\S]*?return sections\.join\('\\n'\);\n\}/);
  if (oldMsgBuilder) {
    const newMsgBuilder = `function buildSystem2UserMessage(promptClass) {
  const sections = [
    \`Tool call requiring evaluation:\`,
    \`\`,
    \`Tool: \${toolName}\`,
    \`Input: \${JSON.stringify(toolInput, null, 2)}\`,
  ];

  if (promptClass && promptClass.prompt) {
    sections.push(
      \`\`,
      \`## User's Prompt\`,
      \`"\${promptClass.prompt}"\`,
      \`Classification: \${promptClass.isAgentic ? 'AGENTIC' : 'INFORMATIONAL'}\${promptClass.actionWords.length > 0 ? ' (action words: ' + promptClass.actionWords.join(', ') + ')' : ''}\`,
    );
  }

  // File metadata for Write/Edit
  const fileMeta = resolveFileMetadata(toolName, toolInput);
  if (fileMeta) {
    sections.push(
      \`\`,
      \`## File Metadata\`,
      \`Path: \${fileMeta.path}\`,
      \`File exists: \${fileMeta.file_exists}\`,
      \`In git repo: \${fileMeta.in_git_repo}\`,
      \`Git tracked: \${fileMeta.git_tracked}\`,
      \`Has staged changes: \${fileMeta.has_staged_changes}\`,
      \`Sensitive file: \${fileMeta.is_sensitive}\${fileMeta.sensitive_reason ? ' (' + fileMeta.sensitive_reason + ')' : ''}\`,
    );
  }

  // Referenced file contents for DAG flattening
  const { files: resolvedFiles, unresolved } = resolveReferencedFiles(toolName, toolInput);

  // Script detected but not readable → escalate
  if (unresolved.length > 0) {
    escalate(\`Cannot read referenced script(s) for safety analysis: \${unresolved.join(', ')}\`,
             'n/a', 'n/a', 'unresolved-script', coherence, affective, provenance);
  }

  if (resolvedFiles.length > 0) {
    sections.push(\`\`, \`## Referenced File Contents\`);
    sections.push(\`Use these contents to enumerate all leaf operations in Step 1 of your analysis.\`);
    for (const { filePath, content } of resolvedFiles) {
      sections.push(\`\`, \`### \${filePath}\`, \`\\\`\\\`\\\`\`, content, \`\\\`\\\`\\\`\`);
    }
  }

  sections.push(
    \`\`,
    \`Perform your two-step analysis (compile, then evaluate) and return your JSON decision.\`,
  );

  return sections.join('\\n');
}`;

    hook = hook.replace(oldMsgBuilder[0], newMsgBuilder);
  }

  // 6. Update max_tokens from 512 to 1024 for chain-of-thought response
  hook = hook.replace(
    /max_tokens: 512,\n\s*temperature: 0,\n\s*system: SYSTEM2_PROMPT,/,
    'max_tokens: 1024,\n        temperature: 0,\n        system: SYSTEM2_PROMPT,'
  );

  // 7. Update parseSystem2Response to handle chain-of-thought (JSON may follow text)
  const oldParser = hook.match(/function parseSystem2Response\(apiResult\) \{[\s\S]*?\n\}/);
  if (oldParser) {
    const newParser = `function parseSystem2Response(apiResult) {
  try {
    const text = apiResult.content[0].text;
    // Response may contain chain-of-thought before JSON — extract the JSON object
    const jsonMatch = text.match(/\\{[\\s\\S]*\\}/);
    if (!jsonMatch) {
      return { decision: 'ESCALATE', reason: 'System 2: no JSON found in response', gateP: 'UNKNOWN', gateV: { clarity: null, stakes: null, score: null } };
    }
    const parsed = JSON.parse(jsonMatch[0]);

    const validDecisions = new Set(['PROCEED', 'NOTE', 'PAUSE', 'ESCALATE', 'BLOCK']);
    if (!validDecisions.has(parsed.decision)) {
      return { decision: 'ESCALATE', reason: \`System 2 invalid decision: \${parsed.decision}\`, gateP: 'UNKNOWN', gateV: { clarity: null, stakes: null, score: null } };
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
    return { decision: 'ESCALATE', reason: \`System 2 parse error: \${err.message}\`, gateP: 'UNKNOWN', gateV: { clarity: null, stakes: null, score: null } };
  }
}`;

    hook = hook.replace(oldParser[0], newParser);
  }

  return hook;
}

// ── Install ──────────────────────────────────────────────────────────

function install() {
  console.log('Guardian Angel — Install/Update');
  console.log('');

  const files = [
    { dst: WRAPPER_DST, content: fs.readFileSync(WRAPPER_SRC, 'utf8'), label: 'Evaluation prompt' },
    { dst: COMPILE_DST, content: fs.readFileSync(COMPILE_SRC, 'utf8'), label: 'Compilation prompt' },
    { dst: path.join(GA_LIB_DIR, 'file-metadata.js'), content: buildFileMetadata(), label: 'File metadata module' },
    { dst: path.join(GA_LIB_DIR, 'file-resolver.js'), content: buildFileResolver(), label: 'File resolver module' },
    { dst: HOOK_DST, content: buildProductionHook(), label: 'Hook script' },
  ];

  for (const file of files) {
    const exists = fs.existsSync(file.dst);
    const action = exists ? 'update' : 'create';

    if (SHOW_DIFF && exists) {
      const current = fs.readFileSync(file.dst, 'utf8');
      if (current === file.content) {
        console.log(`  ✓ ${file.label}: up to date`);
      } else {
        console.log(`  ⟳ ${file.label}: needs update (${file.dst})`);
      }
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] Would ${action}: ${file.dst}`);
      continue;
    }

    fs.mkdirSync(path.dirname(file.dst), { recursive: true });
    fs.writeFileSync(file.dst, file.content, 'utf8');
    console.log(`  ✓ ${action}d: ${file.dst}`);
  }

  // Also update the repo copy (not the template — that's immutable)
  if (!DRY_RUN && !SHOW_DIFF) {
    const hookContent = files.find(f => f.label === 'Hook script').content;
    fs.writeFileSync(REPO_HOOK, hookContent, 'utf8');
    console.log(`  ✓ updated: ${REPO_HOOK}`);
  }

  console.log('');
  if (!DRY_RUN && !SHOW_DIFF) {
    console.log('Installation complete. The hook will use the updated prompt on next tool call.');
  }
}

install();
