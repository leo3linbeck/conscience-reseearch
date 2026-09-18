'use strict';

/**
 * Guardian Angel — context gathering for System 1 and System 2
 *
 * Resolves the scripts a Bash command would run, so the judging tiers can see
 * every leaf operation (DAG flattening) instead of only the surface command.
 *
 * If a referenced script cannot be read, nobody below the principal can know
 * what would execute — the caller hands that decision to the principal.
 *
 * This file is the single source of truth. The clinical-trial harness requires
 * it directly; guardian-angel/install.js copies it to ~/.claude/hooks/ga-lib/.
 */

const fs   = require('fs');
const path = require('path');

const MAX_FILE_SIZE = 10_000;

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

/**
 * `npm test`, `npm run build`, `yarn lint` … run whatever package.json says.
 * Show the judge those scripts, so "run the tests" cannot hide a poisoned one.
 */
function resolvePackageScripts(cmd, cwd, files) {
  const runsScript = /(?:^|&&|\|\||;|\n)\s*(?:npm\s+(?:test|t|start|stop|restart|run(?:-script)?\s+\S+)|(?:yarn|pnpm)\s+(?!add\b|install\b|remove\b|--version\b)\S+)/;
  if (!runsScript.test(cmd)) return;

  const cdMatch = cmd.match(/(?:^|&&|;)\s*cd\s+(\/[^\s;|&]+)/);
  const dir = cdMatch ? cdMatch[1] : cwd;
  if (!dir) return;

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (pkg && pkg.scripts && Object.keys(pkg.scripts).length > 0) {
      files.push({
        filePath: path.join(dir, 'package.json') + ' (scripts)',
        content:  JSON.stringify(pkg.scripts, null, 2).slice(0, MAX_FILE_SIZE),
      });
    }
  } catch { /* no readable package.json — the judges see only the command */ }
}

function resolveReferencedFiles(toolName, toolInput, cwd) {
  const files = [];
  const unresolved = [];

  if (toolName === 'Bash') {
    const cmd = (toolInput && toolInput.command) || '';

    resolvePackageScripts(cmd, cwd, files);

    // Detect files CREATED by heredoc (cat > /path << 'EOF' ... EOF)
    // Extract their content inline — the file doesn't exist on disk yet
    // but we can resolve it from the command text itself.
    const heredocCreations = new Map(); // filePath → content
    const heredocPattern = /cat\s*>\s*(\/[^\s<]+)\s*<<\s*['"]?(\w+)['"]?/g;
    let heredocMatch;
    while ((heredocMatch = heredocPattern.exec(cmd)) !== null) {
      const filePath = heredocMatch[1];
      const delimiter = heredocMatch[2];
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

/**
 * The message System 2 deliberates on. One format for harness and hook, so the
 * prompt optimised in clinical trials sees the same input in production.
 */
function buildSystem2UserMessage({ toolName, toolInput, principalRequest, fileMeta, resolvedFiles }) {
  let userMessage = `Tool call requiring evaluation:

Tool: ${toolName}
Input: ${JSON.stringify(toolInput, null, 2)}
User's instruction: "${principalRequest || ''}"`;

  if (fileMeta) {
    userMessage += '\n\n## File Metadata\n';
    userMessage += `Path: ${fileMeta.path}\n`;
    userMessage += `File exists: ${fileMeta.file_exists}\n`;
    userMessage += `In git repo: ${fileMeta.in_git_repo}\n`;
    userMessage += `Git tracked: ${fileMeta.git_tracked}\n`;
    userMessage += `Has staged changes: ${fileMeta.has_staged_changes}\n`;
    userMessage += `Sensitive file: ${fileMeta.is_sensitive}`;
    if (fileMeta.sensitive_reason) userMessage += ` (${fileMeta.sensitive_reason})`;
    userMessage += '\n';
  }

  if (resolvedFiles && resolvedFiles.length > 0) {
    userMessage += '\n## Referenced File Contents\n';
    userMessage += 'Use these contents to enumerate all leaf operations in Step 1 of your analysis.\n';
    for (const { filePath, content } of resolvedFiles) {
      userMessage += `\n### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`;
    }
  }

  userMessage += '\nPerform your two-step analysis (compile, then evaluate) and return your JSON decision.';
  return userMessage;
}

/**
 * Extract a JSON object containing "decision" from text that may include
 * chain-of-thought before/after the JSON.
 */
function extractDecisionJSON(text) {
  const cleaned = String(text).replace(/```json\n?/g, '').replace(/```\n?/g, '');

  try {
    const parsed = JSON.parse(cleaned.trim());
    if (parsed && parsed.decision) return parsed;
  } catch {}

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

module.exports = {
  resolveReferencedFiles,
  readFileSafe,
  buildSystem2UserMessage,
  extractDecisionJSON,
};
