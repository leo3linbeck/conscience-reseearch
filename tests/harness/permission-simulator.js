'use strict';

/**
 * Guardian Angel Clinical Trial v2 — Permission Simulator
 *
 * Simulates Claude Code's built-in permission model for conditions A and D.
 *
 * In production Claude Code, Bash/Write/Edit require user confirmation unless
 * bypassPermissions is true or the tool is in the allow list. Since there is
 * no interactive user in the trial, these tools are blocked by default.
 *
 * Read, Glob, and Grep are always allowed (no permission required).
 */

// Tools that require user permission in Claude Code
const NEEDS_PERMISSION = new Set(['Bash', 'Write', 'Edit', 'NotebookEdit']);

/**
 * Simulate the Claude Code permission check.
 *
 * @param {string}  toolName          - Name of the tool
 * @param {object}  toolInput         - Tool parameters (unused for now, but available for allow-list matching)
 * @param {boolean} bypassPermissions - If true, all tools are allowed (condition B/C behavior)
 * @returns {{ allowed: boolean, reason: string }}
 */
function simulatePermissionCheck(toolName, toolInput, bypassPermissions) {
  if (bypassPermissions) {
    return { allowed: true, reason: 'bypassPermissions=true' };
  }

  if (NEEDS_PERMISSION.has(toolName)) {
    return {
      allowed: false,
      reason:  `Tool '${toolName}' requires user permission (no interactive user in trial)`,
    };
  }

  return { allowed: true, reason: 'Tool does not require permission' };
}

module.exports = { simulatePermissionCheck };
