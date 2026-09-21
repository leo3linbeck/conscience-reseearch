#!/usr/bin/env node
/**
 * Guardian Angel — Install / Update Script
 *
 * Installs the hook and its tier modules to ~/.claude/hooks/. The test system
 * is the source of truth: the tier modules and both optimizable variables are
 * copied from tests/, so production runs exactly what the clinical trials measured.
 *
 * Usage:
 *   node guardian-angel/install.js                      # install/update
 *   node guardian-angel/install.js --dry-run             # show what would be installed
 *   node guardian-angel/install.js --diff                # show what differs
 *
 * System 1 (jev / TypeSafe):
 *   node guardian-angel/install.js --set-system1-key            # prompts (keeps the key out of shell history)
 *   node guardian-angel/install.js --set-system1-key ts-...     # or reads TYPESAFE_API_KEY
 *   node guardian-angel/install.js --system1-mode shadow        # enforce | shadow | off
 *
 * System 2 (LLM) model management:
 *   node guardian-angel/install.js --add-model           # interactive: add a model profile
 *   node guardian-angel/install.js --add-model --name haiku --model claude-haiku-4-5-20251001 --key sk-ant-...
 *   node guardian-angel/install.js --add-model --name llama --model llama3:70b --endpoint http://localhost:11434
 *   node guardian-angel/install.js --list-models          # show all profiles + System 1 status
 *   node guardian-angel/install.js --use-model sonnet     # switch active model
 *   node guardian-angel/install.js --remove-model old     # remove a profile
 *   node guardian-angel/install.js --set-key sk-ant-...   # save API key (legacy)
 *
 * What gets installed:
 *   ~/.claude/hooks/guardian-angel.js        — the hook (progressive escalation 0 → 1 → 2 → principal)
 *   ~/.claude/hooks/ga-system1.json          — System 1 questions + policy for jev   (optimizable)
 *   ~/.claude/hooks/ga-system2-prompt.txt    — System 2 moral reasoning prompt       (optimizable)
 *   ~/.claude/hooks/.ga-models.json          — System 2 model profiles + System 1 settings
 *   ~/.claude/hooks/ga-lib/
 *     system0.js                             — reflex: approve / reject patterns, escalation flags, file metadata
 *     system1.js                             — intuition: jev client, redaction, convergence policy
 *     context.js                             — script resolution (DAG flattening), System 2 message
 *
 * Architecture:
 *   - guardian-angel.template.js is installed VERBATIM. install.js never patches it.
 *   - Everything tunable lives in the files above, not in the hook.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const REPO_ROOT     = path.join(__dirname, '..');
const HOOKS_DIR     = path.join(os.homedir(), '.claude', 'hooks');
const GA_LIB_DIR    = path.join(HOOKS_DIR, 'ga-lib');
const TEMPLATE_PATH = path.join(__dirname, 'hooks', 'guardian-angel.template.js');

const DRY_RUN      = process.argv.includes('--dry-run');
const SHOW_DIFF    = process.argv.includes('--diff');
const SET_KEY      = process.argv.includes('--set-key');
const ADD_MODEL    = process.argv.includes('--add-model');
const LIST_MODELS  = process.argv.includes('--list-models');
const USE_MODEL    = process.argv.includes('--use-model');
const REMOVE_MODEL = process.argv.includes('--remove-model');
const SET_S1_KEY   = process.argv.includes('--set-system1-key');
const SET_S1_MODE  = process.argv.includes('--system1-mode');

// ── Model config file ────────────────────────────────────────────────
const MODELS_PATH  = path.join(HOOKS_DIR, '.ga-models.json');
const LEGACY_KEY   = path.join(HOOKS_DIR, '.ga-api-key');

function loadModelsConfig() {
  if (fs.existsSync(MODELS_PATH)) {
    try { return JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8')); }
    catch { /* fall through */ }
  }
  return { active: null, models: {} };
}

function saveModelsConfig(config) {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  fs.writeFileSync(MODELS_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function migrateFromLegacyKey() {
  if (fs.existsSync(LEGACY_KEY) && !fs.existsSync(MODELS_PATH)) {
    const key = fs.readFileSync(LEGACY_KEY, 'utf8').trim();
    if (key) {
      const config = {
        active: 'haiku',
        models: {
          haiku: {
            model: 'claude-haiku-4-5-20251001',
            endpoint: 'https://api.anthropic.com',
            format: 'anthropic',
            key,
          },
        },
      };
      saveModelsConfig(config);
      console.log('  ✓ Migrated .ga-api-key → .ga-models.json (profile: "haiku")');
      return config;
    }
  }
  return null;
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return (idx !== -1 && idx + 1 < process.argv.length) ? process.argv[idx + 1] : null;
}

function detectFormat(endpoint) {
  if (!endpoint) return 'anthropic';
  if (endpoint.includes('anthropic.com')) return 'anthropic';
  if (endpoint.includes('11434') || endpoint.includes('ollama')) return 'ollama';
  return 'openai';
}

// ── Sources (the test system is the source of truth) ─────────────────
const HARNESS_DIR  = path.join(REPO_ROOT, 'tests', 'harness');
const WRAPPERS_DIR = path.join(REPO_ROOT, 'tests', 'wrappers');
const HOOK_DST     = path.join(HOOKS_DIR, 'guardian-angel.js');
const REPO_HOOK    = path.join(__dirname, 'hooks', 'guardian-angel.js');

const MANIFEST = [
  { src: path.join(WRAPPERS_DIR, 'default.txt'),  dst: path.join(HOOKS_DIR, 'ga-system2-prompt.txt'), label: 'System 2 prompt' },
  { src: path.join(WRAPPERS_DIR, 'system1-unified.json'), dst: path.join(HOOKS_DIR, 'ga-system1.json'), label: 'System 1 spec (unified: jev judges under the same morality prompt as System 2)' },
  { src: path.join(HARNESS_DIR, 'system0.js'),    dst: path.join(GA_LIB_DIR, 'system0.js'),           label: 'System 0 module (reflex)' },
  { src: path.join(HARNESS_DIR, 'system1.js'),    dst: path.join(GA_LIB_DIR, 'system1.js'),           label: 'System 1 module (jev)' },
  { src: path.join(HARNESS_DIR, 'context.js'),    dst: path.join(GA_LIB_DIR, 'context.js'),           label: 'Context module' },
  { src: TEMPLATE_PATH,                           dst: HOOK_DST,                                      label: 'Hook script' },
];

// ── System 1 (jev) settings live under "system1" in .ga-models.json ──

function describeSystem1(config) {
  const s1 = config.system1 || {};
  const keyPreview = s1.key ? s1.key.slice(0, 6) + '...' : '(none)';
  const mode = s1.mode || 'enforce';
  const note = !s1.key ? ' — no key: every call escalates to System 2'
             : mode === 'shadow' ? ' — advisory only: consulted and logged, verdict not acted on'
             : mode === 'off' ? ' — skipped' : '';
  return `jev via TypeSafe (mode: ${mode}, key: ${keyPreview})${note}`;
}

// ── Install ──────────────────────────────────────────────────────────

// ── System 1 commands ────────────────────────────────────────────────
if (SET_S1_MODE) {
  const mode = getArg('--system1-mode');
  if (!['enforce', 'shadow', 'off'].includes(mode)) {
    console.error('Usage: node install.js --system1-mode enforce|shadow|off');
    process.exit(1);
  }
  const config = loadModelsConfig();
  config.system1 = { ...(config.system1 || {}), mode };
  saveModelsConfig(config);
  console.log(`System 1: ${describeSystem1(config)}`);
  process.exit(0);
}

if (SET_S1_KEY) {
  const save = (key) => {
    const config = loadModelsConfig();
    config.system1 = { mode: 'enforce', ...(config.system1 || {}), key };
    saveModelsConfig(config);
    console.log(`System 1: ${describeSystem1(config)}`);
  };

  const keyArg = getArg('--set-system1-key');
  const key = (keyArg && !keyArg.startsWith('-')) ? keyArg : process.env.TYPESAFE_API_KEY;
  if (key) { save(key.trim()); process.exit(0); }

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('TypeSafe API key (from https://console.typesafe.ai): ', (answer) => {
    rl.close();
    if (!answer.trim()) { console.error('No key provided.'); process.exit(1); }
    save(answer.trim());
    process.exit(0);
  });
  return; // prevent falling through to install()
}

// ── Set API key command (legacy — still works, migrates to models config) ──
if (SET_KEY) {
  const keyArg = getArg('--set-key');
  const key = (keyArg && !keyArg.startsWith('-')) ? keyArg : process.env.ANTHROPIC_API_KEY;

  if (!key) {
    console.error('Usage: node install.js --set-key sk-ant-your-key-here');
    console.error('   or: ANTHROPIC_API_KEY=sk-ant-... node install.js --set-key');
    process.exit(1);
  }

  // Write legacy file for backward compat
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  fs.writeFileSync(LEGACY_KEY, key, { mode: 0o600 });

  // Also add/update in models config
  const config = loadModelsConfig();
  if (!config.models.haiku) {
    config.models.haiku = {
      model: 'claude-haiku-4-5-20251001',
      endpoint: 'https://api.anthropic.com',
      format: 'anthropic',
      key,
    };
  } else {
    config.models.haiku.key = key;
  }
  if (!config.active) config.active = 'haiku';
  saveModelsConfig(config);
  console.log(`API key saved (profile: "haiku")`);
  process.exit(0);
}

// ── Model management commands ────────────────────────────────────────

if (LIST_MODELS) {
  migrateFromLegacyKey();
  const config = loadModelsConfig();
  const names = Object.keys(config.models);
  if (names.length === 0) {
    console.log(`System 1: ${describeSystem1(config)}`);
    console.log('No System 2 models configured. Use --add-model to add one.');
    process.exit(0);
  }
  console.log(`System 1: ${describeSystem1(config)}\n`);
  console.log('Guardian Angel — System 2 Model Profiles\n');
  for (const name of names) {
    const m = config.models[name];
    const active = name === config.active ? ' ← active' : '';
    const keyPreview = m.key ? m.key.slice(0, 12) + '...' : '(none)';
    console.log(`  ${name}${active}`);
    console.log(`    model:    ${m.model}`);
    console.log(`    endpoint: ${m.endpoint}`);
    console.log(`    format:   ${m.format}`);
    console.log(`    key:      ${keyPreview}`);
    console.log('');
  }
  process.exit(0);
}

if (USE_MODEL) {
  migrateFromLegacyKey();
  const name = getArg('--use-model');
  if (!name) { console.error('Usage: node install.js --use-model <name>'); process.exit(1); }
  const config = loadModelsConfig();
  if (!config.models[name]) {
    console.error(`Model "${name}" not found. Available: ${Object.keys(config.models).join(', ')}`);
    process.exit(1);
  }
  config.active = name;
  saveModelsConfig(config);
  console.log(`Active model set to "${name}" (${config.models[name].model})`);
  process.exit(0);
}

if (REMOVE_MODEL) {
  const name = getArg('--remove-model');
  if (!name) { console.error('Usage: node install.js --remove-model <name>'); process.exit(1); }
  const config = loadModelsConfig();
  if (!config.models[name]) {
    console.error(`Model "${name}" not found.`);
    process.exit(1);
  }
  delete config.models[name];
  if (config.active === name) {
    const remaining = Object.keys(config.models);
    config.active = remaining.length > 0 ? remaining[0] : null;
    if (config.active) console.log(`Active model switched to "${config.active}"`);
  }
  saveModelsConfig(config);
  console.log(`Removed model "${name}"`);
  process.exit(0);
}

if (ADD_MODEL) {
  migrateFromLegacyKey();

  // Check for non-interactive mode: --name, --model, --key, --endpoint all provided as args
  const argName     = getArg('--name');
  const argModel    = getArg('--model');
  const argKey      = getArg('--key');
  const argEndpoint = getArg('--endpoint');
  const argFormat   = getArg('--format');
  const argOptions  = getArg('--options');   // JSON: provider quirks (token_param, send_temperature, max_tokens, endpoint_path, extra_body)

  if (argName && argModel) {
    // Non-interactive
    const endpoint = argEndpoint || 'https://api.anthropic.com';
    const format   = argFormat || detectFormat(endpoint);
    const config   = loadModelsConfig();
    const profile  = { model: argModel, endpoint, format, key: argKey || null };
    if (argOptions) {
      try { profile.options = JSON.parse(argOptions); }
      catch (e) { console.error(`--options must be valid JSON: ${e.message}`); process.exit(1); }
    }
    config.models[argName] = profile;
    if (!config.active) config.active = argName;
    saveModelsConfig(config);
    console.log(`Added model "${argName}" (${argModel})`);
    if (profile.options) console.log(`  options: ${JSON.stringify(profile.options)}`);
    if (config.active === argName) console.log(`  → set as active`);
    process.exit(0);
  }

  // Interactive mode
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  (async () => {
    console.log('Guardian Angel — Add Model Profile\n');

    const config = loadModelsConfig();
    const existing = Object.keys(config.models);
    if (existing.length > 0) console.log(`Existing profiles: ${existing.join(', ')}\n`);

    const name = (await ask('Profile name (e.g. haiku, sonnet, llama-local): ')).trim();
    if (!name) { console.error('Name required.'); process.exit(1); }
    if (config.models[name]) {
      const overwrite = (await ask(`"${name}" already exists. Overwrite? (y/N): `)).trim().toLowerCase();
      if (overwrite !== 'y') { console.log('Cancelled.'); process.exit(0); }
    }

    const model = (await ask('Model ID (e.g. claude-haiku-4-5-20251001): ')).trim();
    if (!model) { console.error('Model ID required.'); process.exit(1); }

    const endpointInput = (await ask('API endpoint (press Enter for https://api.anthropic.com): ')).trim();
    const endpoint = endpointInput || 'https://api.anthropic.com';

    const detectedFormat = detectFormat(endpoint);
    const formatInput = (await ask(`API format (press Enter for ${detectedFormat}): `)).trim();
    const format = formatInput || detectedFormat;

    const key = (await ask('API key (press Enter for none): ')).trim() || null;

    rl.close();

    config.models[name] = { model, endpoint, format, key };

    if (!config.active || existing.length === 0) {
      config.active = name;
      console.log(`\n  → Set as active model`);
    } else {
      const setActive = (await new Promise(resolve => {
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl2.question(`Set "${name}" as active model? (y/N): `, answer => { rl2.close(); resolve(answer); });
      })).trim().toLowerCase();
      if (setActive === 'y') config.active = name;
    }

    saveModelsConfig(config);
    console.log(`\n✓ Model "${name}" saved.`);
  })().catch(err => { console.error(err.message); process.exit(1); });

  return; // prevent falling through to install()
}

// ── Main install ─────────────────────────────────────────────────────

async function install() {
  console.log('Guardian Angel — Install/Update');
  console.log('');

  const files = MANIFEST.map(f => {
    if (!fs.existsSync(f.src)) {
      console.error(`Source not found: ${f.src}`);
      process.exit(1);
    }
    return { dst: f.dst, content: fs.readFileSync(f.src, 'utf8'), label: f.label };
  });

  // A malformed System 1 spec would silently defer everything — catch it here.
  JSON.parse(files.find(f => f.label.startsWith('System 1 spec')).content);

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

  // Verify model config for System 2
  if (!DRY_RUN && !SHOW_DIFF) {
    // Migrate legacy key file if needed
    migrateFromLegacyKey();

    let config = loadModelsConfig();
    const hasModels = Object.keys(config.models).length > 0;
    const activeModel = config.active && config.models[config.active];

    console.log(`  ${config.system1?.key ? '✓' : '○'} System 1: ${describeSystem1(config)}`);
    if (!config.system1?.key) console.log('      Set a key with: node guardian-angel/install.js --set-system1-key');

    if (hasModels && activeModel) {
      const keyPreview = activeModel.key ? activeModel.key.slice(0, 12) + '...' : '(none)';
      console.log(`  ✓ System 2 model: "${config.active}" (${activeModel.model}, key: ${keyPreview})`);
    } else if (!hasModels) {
      // No models configured — try environment, then prompt
      const envKey = process.env.ANTHROPIC_API_KEY;
      if (envKey) {
        config.models.haiku = {
          model: 'claude-haiku-4-5-20251001',
          endpoint: 'https://api.anthropic.com',
          format: 'anthropic',
          key: envKey,
        };
        config.active = 'haiku';
        saveModelsConfig(config);
        // Also write legacy key for backward compat
        fs.writeFileSync(LEGACY_KEY, envKey, { mode: 0o600 });
        console.log(`  ✓ Model config created from ANTHROPIC_API_KEY (profile: "haiku")`);
      } else {
        console.log('');
        console.log('  Guardian Angel System 2 requires an API key.');
        console.log('  Claude Code scrubs API keys from hook environments,');
        console.log('  so the key must be stored in a config file.');
        console.log('');

        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        await new Promise((resolve) => {
          rl.question('  Enter your API key: ', (answer) => {
            rl.close();
            const key = answer.trim();
            if (key) {
              config.models.haiku = {
                model: 'claude-haiku-4-5-20251001',
                endpoint: 'https://api.anthropic.com',
                format: 'anthropic',
                key,
              };
              config.active = 'haiku';
              saveModelsConfig(config);
              fs.writeFileSync(LEGACY_KEY, key, { mode: 0o600 });
              console.log(`  ✓ Model config created (profile: "haiku")`);
              resolve();
            } else {
              console.error('');
              console.error('  ✗ No key provided. System 2 will be unavailable.');
              console.error('    Use: node install.js --add-model to configure later.');
              resolve();
            }
          });
        });
      }
    }
  }

  console.log('');
  if (!DRY_RUN && !SHOW_DIFF) {
    console.log('Installation complete. The hook will use the updated prompt on next tool call.');
  }
}

install().catch(err => { console.error(err.message); process.exit(1); });
