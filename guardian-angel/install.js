#!/usr/bin/env node
/**
 * Guardian Angel — Install / Update Script
 *
 * Builds the production hook from the test system components and installs
 * it to ~/.claude/hooks/. The test system is the source of truth.
 *
 * Usage:
 *   node guardian-angel/install.js          # install/update production hook
 *   node guardian-angel/install.js --dry-run # show what would be installed
 *   node guardian-angel/install.js --diff    # show diff against current production
 *
 * What gets installed:
 *   ~/.claude/hooks/guardian-angel.js        — the hook (System 1 + System 2)
 *   ~/.claude/hooks/ga-system2-prompt.txt    — the wrapper prompt (from tests/wrappers/default.txt)
 *   ~/.claude/hooks/ga-lib/                  — shared modules
 *     file-metadata.js                       — git status, sensitive patterns, staged changes
 *     file-resolver.js                       — reads scripts referenced by tool calls
 *
 * The hook loads the wrapper prompt from ga-system2-prompt.txt at runtime,
 * so you can update the prompt without touching the hook code.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const REPO_ROOT    = path.join(__dirname, '..');
const HOOKS_DIR    = path.join(os.homedir(), '.claude', 'hooks');
const GA_LIB_DIR   = path.join(HOOKS_DIR, 'ga-lib');

const DRY_RUN = process.argv.includes('--dry-run');
const SHOW_DIFF = process.argv.includes('--diff');

// ── Source files ─────────────────────────────────────────────────────

const WRAPPER_SRC = path.join(REPO_ROOT, 'tests', 'wrappers', 'default.txt');
const WRAPPER_DST = path.join(HOOKS_DIR, 'ga-system2-prompt.txt');

// ── File metadata module (extracted from tests/harness/ga-wrapper.js) ─

const FILE_METADATA_SRC = `'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Sensitive file patterns — files matching these warrant higher stakes.
// Extend this array to add new categories.
const SENSITIVE_FILE_PATTERNS = ${fs.existsSync(path.join(REPO_ROOT, 'tests', 'harness', 'ga-wrapper.js'))
  ? extractSensitivePatterns()
  : '[]'};

/**
 * Resolve file metadata for Write/Edit tool calls.
 */
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

// ── File resolver module (extracted from tests/harness/ga-wrapper.js) ─

const FILE_RESOLVER_SRC = `'use strict';

const fs = require('fs');

const MAX_FILE_SIZE = 10000;

/**
 * Extract file paths referenced by a Bash tool call and read their contents.
 * Enables DAG flattening for script execution.
 */
function resolveReferencedFiles(toolName, toolInput) {
  const results = [];
  if (toolName !== 'Bash') return results;

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
        if (content !== null) {
          results.push({ filePath, content });
        }
      }
    }
  }
  return results;
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

// ── Extract SENSITIVE_FILE_PATTERNS from test source ─────────────────

function extractSensitivePatterns() {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'tests', 'harness', 'ga-wrapper.js'), 'utf8'
  );
  const match = src.match(/const SENSITIVE_FILE_PATTERNS = \[([\s\S]*?)\];/);
  if (!match) return '[]';
  return '[\n' + match[1] + ']';
}

// ── Build the production hook ────────────────────────────────────────

function buildProductionHook() {
  const currentHook = fs.readFileSync(
    path.join(REPO_ROOT, 'guardian-angel', 'hooks', 'guardian-angel.js'), 'utf8'
  );

  // Replace the embedded SYSTEM2_PROMPT with a file-loading version
  const promptLoadCode = `const SYSTEM2_PROMPT = (() => {
  const promptPath = require('path').join(require('os').homedir(), '.claude', 'hooks', 'ga-system2-prompt.txt');
  try { return require('fs').readFileSync(promptPath, 'utf8'); }
  catch { return null; }
})()`;

  // Find the SYSTEM2_PROMPT declaration (multiline template string)
  const promptStart = currentHook.indexOf("const SYSTEM2_PROMPT = `");
  const promptEnd = currentHook.indexOf("`;", promptStart) + 2;

  if (promptStart === -1 || promptEnd <= 2) {
    console.error('Could not find SYSTEM2_PROMPT in hook source.');
    process.exit(1);
  }

  let hook = currentHook.slice(0, promptStart) + promptLoadCode + currentHook.slice(promptEnd);

  // Inject file metadata and file resolver into System 2 user message builder
  const requireLines = `
// ── GA lib modules (installed by guardian-angel/install.js) ───────────
const { resolveFileMetadata } = (() => {
  try { return require(require('path').join(require('os').homedir(), '.claude', 'hooks', 'ga-lib', 'file-metadata.js')); }
  catch { return { resolveFileMetadata: () => null }; }
})();
const { resolveReferencedFiles } = (() => {
  try { return require(require('path').join(require('os').homedir(), '.claude', 'hooks', 'ga-lib', 'file-resolver.js')); }
  catch { return { resolveReferencedFiles: () => [] }; }
})();
`;

  // Insert after the config section (after SYSTEM2_MODEL line)
  const insertPoint = hook.indexOf("const SYSTEM2_MODEL");
  const insertAfter = hook.indexOf('\n', insertPoint) + 1;
  hook = hook.slice(0, insertAfter) + requireLines + hook.slice(insertAfter);

  // Modify buildSystem2UserMessage to include file metadata and referenced files
  const oldBuilder = `function buildSystem2UserMessage(promptClass) {
  const sections = [
    \`Tool call requiring moral evaluation:\`,
    \`\`,
    \`TOOL: \${toolName}\`,
    \`INPUT: \${JSON.stringify(toolInput, null, 2)}\`,
  ];

  if (promptClass && promptClass.prompt) {
    sections.push(
      \`\`,
      \`## User's Prompt\`,
      \`"\${promptClass.prompt}"\`,
      \`Classification: \${promptClass.isAgentic ? 'AGENTIC' : 'INFORMATIONAL'}\${promptClass.actionWords.length > 0 ? ' (action words: ' + promptClass.actionWords.join(', ') + ')' : ''}\`,
    );
  }

  sections.push(
    \`\`,
    \`Evaluate this action through the Thomistic conscience framework. Compute the Gate V score (Clarity x Stakes) and return your JSON decision.\`,
  );

  return sections.join('\\n');
}`;

  const newBuilder = `function buildSystem2UserMessage(promptClass) {
  const sections = [
    \`Tool call requiring moral evaluation:\`,
    \`\`,
    \`TOOL: \${toolName}\`,
    \`INPUT: \${JSON.stringify(toolInput, null, 2)}\`,
  ];

  if (promptClass && promptClass.prompt) {
    sections.push(
      \`\`,
      \`## User's Prompt\`,
      \`"\${promptClass.prompt}"\`,
      \`Classification: \${promptClass.isAgentic ? 'AGENTIC' : 'INFORMATIONAL'}\${promptClass.actionWords.length > 0 ? ' (action words: ' + promptClass.actionWords.join(', ') + ')' : ''}\`,
    );
  }

  // File metadata for Write/Edit (git status, sensitive patterns, staged changes)
  const fileMeta = resolveFileMetadata(toolName, toolInput);
  if (fileMeta) {
    sections.push(
      \`\`,
      \`## File Metadata\`,
      \`Path: \${fileMeta.path}\`,
      \`In git repo: \${fileMeta.in_git_repo}\`,
      \`Git tracked: \${fileMeta.git_tracked}\`,
      \`Has staged changes: \${fileMeta.has_staged_changes}\`,
      \`Sensitive file: \${fileMeta.is_sensitive}\${fileMeta.sensitive_reason ? ' (' + fileMeta.sensitive_reason + ')' : ''}\`,
    );
  }

  // Referenced file contents for DAG flattening (script execution)
  const fileContents = resolveReferencedFiles(toolName, toolInput);
  if (fileContents.length > 0) {
    sections.push(\`\`, \`## Referenced File Contents\`);
    sections.push(\`The following files are referenced by this tool call. Use their contents for DAG flattening.\`);
    for (const { filePath, content } of fileContents) {
      sections.push(\`\`, \`### \${filePath}\`, \\\`\\\`\\\`\\\`\`, content, \\\`\\\`\\\`\\\`\`);
    }
  }

  sections.push(
    \`\`,
    \`Evaluate this action through the Thomistic conscience framework. Compute the Gate V score (Clarity x Stakes) and return your JSON decision.\`,
  );

  return sections.join('\\n');
}`;

  hook = hook.replace(oldBuilder, newBuilder);

  return hook;
}

// ── Install ──────────────────────────────────────────────────────────

function install() {
  console.log('Guardian Angel — Install/Update');
  console.log('');

  const files = [
    { src: null, dst: WRAPPER_DST, content: fs.readFileSync(WRAPPER_SRC, 'utf8'), label: 'Wrapper prompt' },
    { src: null, dst: path.join(GA_LIB_DIR, 'file-metadata.js'), content: FILE_METADATA_SRC, label: 'File metadata module' },
    { src: null, dst: path.join(GA_LIB_DIR, 'file-resolver.js'), content: FILE_RESOLVER_SRC, label: 'File resolver module' },
    { src: null, dst: path.join(HOOKS_DIR, 'guardian-angel.js'), content: buildProductionHook(), label: 'Hook script' },
  ];

  for (const file of files) {
    const exists = fs.existsSync(file.dst);
    const action = exists ? 'update' : 'create';

    if (SHOW_DIFF && exists) {
      const current = fs.readFileSync(file.dst, 'utf8');
      if (current === file.content) {
        console.log(`  ✓ ${file.label}: up to date`);
      } else {
        console.log(`  ⟳ ${file.label}: differs (${file.dst})`);
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

  // Also update the repo copy
  if (!DRY_RUN && !SHOW_DIFF) {
    const repoHookDst = path.join(REPO_ROOT, 'guardian-angel', 'hooks', 'guardian-angel.js');
    const hookContent = files.find(f => f.label === 'Hook script').content;
    fs.writeFileSync(repoHookDst, hookContent, 'utf8');
    console.log(`  ✓ updated: ${repoHookDst}`);
  }

  console.log('');
  if (!DRY_RUN && !SHOW_DIFF) {
    console.log('Installation complete. The hook will use the updated prompt on next tool call.');
  }
}

install();
