'use strict';

/**
 * Guardian Angel Clinical Trial v2 — Tool Executor
 *
 * Executes tool calls inside the Docker container environment.
 * Each function returns { success: boolean, output: string }.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_CWD     = '/workspace';
const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT     = 120_000;
const MAX_OUTPUT      = 50_000; // truncate output to prevent token bloat

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n... [truncated, ${str.length} chars total]`;
}

// ── Bash ──────────────────────────────────────────────────────────────

function executeBash(input) {
  const command = input.command;
  if (!command) return { success: false, output: 'Error: command is required' };

  const timeout = Math.min(input.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);

  try {
    const stdout = execSync(command, {
      cwd:      DEFAULT_CWD,
      timeout,
      encoding: 'utf8',
      stdio:    ['pipe', 'pipe', 'pipe'],
      env:      { ...process.env, HOME: process.env.HOME || '/root' },
    });
    return { success: true, output: truncate(stdout, MAX_OUTPUT) };
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr) : '';
    const stdout = err.stdout ? String(err.stdout) : '';
    const combined = (stdout + '\n' + stderr).trim();
    return {
      success: false,
      output:  truncate(combined || `Command failed with exit code ${err.status}`, MAX_OUTPUT),
    };
  }
}

// ── Read ──────────────────────────────────────────────────────────────

function executeRead(input) {
  const filePath = input.file_path;
  if (!filePath) return { success: false, output: 'Error: file_path is required' };

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const offset = input.offset || 0;
    const limit  = input.limit  || lines.length;
    const slice  = lines.slice(offset, offset + limit);

    // Format with line numbers like Claude Code
    const numbered = slice.map((line, i) => `${offset + i + 1}\t${line}`).join('\n');
    return { success: true, output: truncate(numbered, MAX_OUTPUT) };
  } catch (err) {
    return { success: false, output: `Error reading file: ${err.message}` };
  }
}

// ── Write ─────────────────────────────────────────────────────────────

function executeWrite(input) {
  const filePath = input.file_path;
  const content  = input.content;
  if (!filePath) return { success: false, output: 'Error: file_path is required' };
  if (content == null) return { success: false, output: 'Error: content is required' };

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, output: `File written: ${filePath}` };
  } catch (err) {
    return { success: false, output: `Error writing file: ${err.message}` };
  }
}

// ── Edit ──────────────────────────────────────────────────────────────

function executeEdit(input) {
  const { file_path: filePath, old_string: oldStr, new_string: newStr } = input;
  if (!filePath) return { success: false, output: 'Error: file_path is required' };
  if (oldStr == null) return { success: false, output: 'Error: old_string is required' };
  if (newStr == null) return { success: false, output: 'Error: new_string is required' };

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const count = content.split(oldStr).length - 1;

    if (count === 0) {
      return { success: false, output: 'Error: old_string not found in file' };
    }
    if (count > 1) {
      return { success: false, output: `Error: old_string found ${count} times (must be unique)` };
    }

    const updated = content.replace(oldStr, newStr);
    fs.writeFileSync(filePath, updated, 'utf8');
    return { success: true, output: `File edited: ${filePath}` };
  } catch (err) {
    return { success: false, output: `Error editing file: ${err.message}` };
  }
}

// ── Glob ──────────────────────────────────────────────────────────────

function executeGlob(input) {
  const pattern = input.pattern;
  if (!pattern) return { success: false, output: 'Error: pattern is required' };

  const searchPath = input.path || DEFAULT_CWD;

  try {
    // Use find as a portable glob implementation inside the container
    const stdout = execSync(
      `find ${JSON.stringify(searchPath)} -path ${JSON.stringify(searchPath + '/' + pattern)} -type f 2>/dev/null | head -100`,
      { encoding: 'utf8', timeout: 10_000, cwd: searchPath }
    );

    // Fallback: if find-path doesn't work well, use shell glob
    if (!stdout.trim()) {
      const shellResult = execSync(
        `ls -1 ${JSON.stringify(pattern)} 2>/dev/null | head -100`,
        { encoding: 'utf8', timeout: 10_000, cwd: searchPath }
      );
      return { success: true, output: shellResult.trim() || 'No matching files found' };
    }

    return { success: true, output: truncate(stdout.trim(), MAX_OUTPUT) };
  } catch (err) {
    return { success: true, output: 'No matching files found' };
  }
}

// ── Grep ──────────────────────────────────────────────────────────────

function executeGrep(input) {
  const pattern = input.pattern;
  if (!pattern) return { success: false, output: 'Error: pattern is required' };

  const searchPath = input.path || DEFAULT_CWD;
  const globFilter = input.glob ? `--include=${JSON.stringify(input.glob)}` : '';

  try {
    const stdout = execSync(
      `grep -rn ${globFilter} -e ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)} 2>/dev/null | head -100`,
      { encoding: 'utf8', timeout: 15_000 }
    );
    return { success: true, output: truncate(stdout.trim(), MAX_OUTPUT) || 'No matches found' };
  } catch (err) {
    // grep returns exit 1 for no matches
    return { success: true, output: 'No matches found' };
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────

const EXECUTORS = {
  Bash:  executeBash,
  Read:  executeRead,
  Write: executeWrite,
  Edit:  executeEdit,
  Glob:  executeGlob,
  Grep:  executeGrep,
};

/**
 * Execute a tool call.
 * @param {string} toolName
 * @param {object} toolInput
 * @returns {{ success: boolean, output: string }}
 */
function executeTool(toolName, toolInput) {
  const executor = EXECUTORS[toolName];
  if (!executor) {
    return { success: false, output: `Unknown tool: ${toolName}` };
  }
  return executor(toolInput);
}

module.exports = { executeTool };
