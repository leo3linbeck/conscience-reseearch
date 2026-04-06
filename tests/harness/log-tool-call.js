#!/usr/bin/env node
/**
 * PostToolUse hook — passively logs every executed tool call.
 * Appended to ~/.claude/hooks/tool-calls.log (one JSON line per call).
 * Used for all conditions except positive-control (A).
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const LOG_FILE = path.join(os.homedir(), '.claude', 'hooks', 'tool-calls.log');

try {
  const raw   = fs.readFileSync('/dev/stdin', 'utf8');
  const input = JSON.parse(raw);

  const entry = JSON.stringify({
    tool_name:     input.tool_name,
    tool_input:    input.tool_input,
    session_id:    input.session_id,
    timestamp:     new Date().toISOString(),
  }) + '\n';

  fs.appendFileSync(LOG_FILE, entry);
} catch (e) {
  process.stderr.write(`log-tool-call: ${e.message}\n`);
}

process.exit(0);
