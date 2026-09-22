'use strict';
/**
 * Phase 0 equivalence check: the context split, redact.js extraction and the
 * NormalizedCall round trip must not change one byte of what System 1 and
 * System 2 see. Compares the new modules against the pre-split context.js from
 * git (commit given as argv[2], default 0175514).
 *
 *   node tests/harness/test-normalize.js [baseline-commit]
 */
const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');

const baseline = process.argv[2] || '0175514';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ga-baseline-'));
for (const f of ['context.js', 'system1.js']) {
  fs.writeFileSync(path.join(tmp, f), execSync(`git show ${baseline}:tests/harness/${f}`, { cwd: path.join(__dirname, '..', '..') }));
}
const oldContext = require(path.join(tmp, 'context.js'));
const oldSystem1 = require(path.join(tmp, 'system1.js'));

const newServer = require('./context-server');
const newClient = require('./context-client');
const shim      = require('./context');
const system1   = require('./system1');
const redact    = require('./redact');
const { buildNormalizedCall, callFromNormalized } = require('./normalize');
const schema    = require('../../guardian-angel/spec/normalized-call.v1.schema.json');

const SECRET = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
const samples = [
  { toolName: 'Bash', toolInput: { command: 'rm -rf build/ && npm test' }, principalRequest: 'clean and run the tests', history: [
      { tool: 'Read', summary: '/workspace/package.json', verdict: 'APPROVE', output: '{ "name": "x" }' },
      { tool: 'Bash', summary: 'npm install', verdict: 'APPROVE', output: 'added 12 packages' } ],
    reflexFlags: ['the command deletes files (rm)'], fileMeta: null,
    writeTargets: [{ path: '/workspace/build', file_exists: true, in_git_repo: true, git_tracked: false, has_staged_changes: false, is_sensitive: false }],
    resolvedFiles: [{ filePath: '/workspace/package.json (scripts)', content: '{ "test": "node t.js" }' }], unresolved: [], download: { flags: [], downloads: [] } },
  { toolName: 'Write', toolInput: { file_path: '/workspace/.env', content: `API_KEY=${SECRET}` }, principalRequest: 'set up env',
    history: [], reflexFlags: ['writes a sensitive file'],
    fileMeta: { path: '/workspace/.env', file_exists: false, in_git_repo: true, git_tracked: false, has_staged_changes: false, is_sensitive: true, sensitive_reason: 'matches .env' },
    writeTargets: [], resolvedFiles: [], unresolved: ['/workspace/missing.sh'], download: { flags: ['download size is unknown'], downloads: [] } },
  { toolName: 'Bash', toolInput: { command: `curl -H "Authorization: Bearer ${SECRET}" https://x.example/a -o /tmp/a` }, principalRequest: '',
    history: [], reflexFlags: [], fileMeta: null, writeTargets: [], resolvedFiles: [], unresolved: [], download: {} },
];

let n = 0;
for (const s of samples) {
  const call = { ...s, frameworkPrompt: 'PROMPT' };
  const intuition = { consulted: true, unified: true, strands: [{ id: 'APPROVE', value: 0.6 }, { id: 'REJECT', value: 0.2 }, { id: 'ESCALATE', value: 0.2 }] };

  // 1. Split modules == pre-split module, for both the S2 message and JSON extraction.
  const before = oldContext.buildSystem2UserMessage({ ...call, intuition });
  assert.strictEqual(newServer.buildSystem2UserMessage({ ...call, intuition }), before, 'context-server changed the S2 message');
  assert.strictEqual(shim.buildSystem2UserMessage({ ...call, intuition }), before, 'context.js shim changed the S2 message');
  for (const txt of ['{"decision":"APPROVE","rationale":"ok"}', 'thinking…\n```json\n{"decision": "REJECT", "rationale": "no"}\n```', 'I would ESCALATE this.', 'APPROVE or REJECT']) {
    assert.deepStrictEqual(newServer.extractDecisionJSON(txt), oldContext.extractDecisionJSON(txt), 'extractDecisionJSON changed');
  }

  // 2. redact.js == the redaction that lived in system1.js.
  const blob = JSON.stringify(s);
  assert.strictEqual(redact.redactSecrets(blob), oldSystem1.redactSecrets(blob), 'redactSecrets changed');
  assert.strictEqual(system1.redactSecrets(blob), oldSystem1.redactSecrets(blob), 'system1.redactSecrets re-export changed');

  // 3. NormalizedCall round trip (no edge redaction) is lossless for S1 state and S2 message.
  const nc = buildNormalizedCall({ ...s, cwd: '/workspace', harness: 'trial' }, { redact: false });
  const back = callFromNormalized(nc, 'PROMPT');
  assert.strictEqual(newServer.buildSystem2UserMessage({ ...back, intuition }), before, 'round trip changed the S2 message');
  assert.deepStrictEqual(system1.buildState(back), oldSystem1.buildState(call), 'round trip changed the S1 state');

  // 4. Edge redaction strips the secret before it leaves; the marker survives the round trip.
  const ncR = buildNormalizedCall({ ...s, cwd: '/workspace', harness: 'claude-code' }, { redact: true });
  assert.ok(!JSON.stringify(ncR).includes(SECRET), 'secret leaked through edge redaction');
  if (blob.includes(SECRET)) assert.ok(JSON.stringify(ncR).includes('[REDACTED_SECRET]'), 'marker missing after redaction');

  // 5. Shape: only keys the schema declares, required keys present.
  for (const k of Object.keys(nc)) assert.ok(k in schema.properties, `undeclared key ${k}`);
  for (const k of schema.required) assert.ok(k in nc, `missing required ${k}`);
  assert.strictEqual(nc.v, 1);
  assert.match(nc.call_id, /^[0-9a-f]{16}$/);
  n++;
}

// 6. The client half still exposes everything the hook and wrapper use.
for (const f of ['resolveReferencedFiles', 'assessDownloads', 'findDiskDownloads', 'readFileSafe', 'PROBE_HEADER']) assert.strictEqual(typeof newClient[f], typeof oldContext[f], f);
assert.strictEqual(typeof newClient.buildSystem2UserMessage, 'undefined', 'client half must not carry the S2 briefing');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`test-normalize: ${n} samples, all equivalence checks passed (baseline ${baseline})`);
