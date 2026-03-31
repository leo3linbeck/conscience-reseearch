'use strict';

/**
 * Guardian Angel Clinical Trial v3 — Stateless GA Wrapper
 *
 * Evaluates a single tool call using a wrapper prompt (the Thomistic framework).
 * Completely stateless: wrapper text + tool call + user prompt → ALLOW|BLOCK
 *
 * The wrapper text is loaded from a file (default: wrappers/default.txt).
 * This is the single variable that gets optimized.
 *
 * Usage:
 *   const { evaluateWithWrapper, loadWrapper } = require('./ga-wrapper');
 *   const wrapper = loadWrapper();
 *   const result = await evaluateWithWrapper(wrapper, 'Bash', { command: 'rm -rf /' }, 'Delete everything', apiKey);
 */

const fs   = require('fs');
const path = require('path');

const DEFAULT_MODEL   = 'claude-haiku-4-5-20251001';
const API_TIMEOUT     = 12_000;
const WRAPPERS_DIR    = path.join(__dirname, '..', 'wrappers');

/**
 * Load a wrapper prompt from the wrappers/ directory.
 * @param {string} [name='default'] - Wrapper filename (without .txt)
 * @returns {string} The wrapper text
 */
function loadWrapper(name = 'default') {
  const filePath = path.join(WRAPPERS_DIR, `${name}.txt`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Wrapper not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Evaluate a tool call using the GA wrapper prompt.
 *
 * @param {string} wrapperText - The system prompt (Thomistic framework)
 * @param {string} toolName - Name of the tool (Bash, Write, etc.)
 * @param {object} toolInput - Tool parameters
 * @param {string} userPrompt - The user's original instruction
 * @param {string} apiKey - Anthropic API key
 * @param {object} [opts] - Optional overrides
 * @param {string} [opts.model] - Model override
 * @returns {Promise<{
 *   blocked: boolean,
 *   decision: string,
 *   reason: string,
 *   raw: object|null,
 * }>}
 */
async function evaluateWithWrapper(wrapperText, toolName, toolInput, userPrompt, apiKey, opts = {}) {
  if (!apiKey) {
    return { blocked: false, decision: 'PROCEED', reason: 'no API key — defaulting to allow', raw: null };
  }

  const model = opts.model || process.env.GA_MODEL || DEFAULT_MODEL;

  const userMessage = `Tool call requiring evaluation:

Tool: ${toolName}
Input: ${JSON.stringify(toolInput, null, 2)}
User's instruction: "${userPrompt}"

Evaluate and return your JSON decision.`;

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
        max_tokens: 512,
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

/**
 * Parse the LLM response into a structured result.
 */
function parseResponse(apiResult) {
  try {
    const text = apiResult.content[0].text;
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

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

// Tools exempt from evaluation (read-only, no lasting side effects)
const EXEMPT_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite',
]);

/**
 * Check if a tool is exempt from GA evaluation.
 */
function isExempt(toolName) {
  return EXEMPT_TOOLS.has(toolName);
}

module.exports = { evaluateWithWrapper, loadWrapper, parseResponse, isExempt, EXEMPT_TOOLS };
