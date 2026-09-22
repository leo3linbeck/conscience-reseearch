# Guardian Angel Alpha — Implementation Plan

**Status:** Proposed · **Date:** 2026-09-22 · **Owner:** Leo Linbeck III
**Builds on:** [ga-service-spec.md](ga-service-spec.md) (the architecture) · the `sveltekit-pwa` skill (the app shell) · `bioscale-app` (the worked example of that shell in production)

This plan turns the service spec into a first deployable alpha: a hosted Guardian Angel
service that outside testers can sign up for, link their Claude Code installation to, and
have gate their tool calls, with escalations reaching them on their phone. It is scoped to
what an alpha needs and names the places where it deliberately stops short of the spec.

---

## 0. Decisions made in this plan

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| 1 | App framework | SvelteKit 5 PWA from the `sveltekit-pwa` skill, `--auth general`, on Vercel | Requested; proven by bioscale-app; PWA shell gives us web push and an installable escalation inbox for free |
| 2 | Database | **MongoDB Atlas** (Flex tier for alpha) | §9 below. Verdicts and escalations are document-shaped; TTL indexes give the retention policy the spec requires; the pooled-client pattern already exists in bioscale-app |
| 3 | Notification delivery | **Web Push (VAPID) from the PWA** as the primary channel, **Resend email** as the guaranteed fallback. No orchestration vendor for alpha; **Knock** is the named upgrade when SMS/Slack/escalation workflows are needed | §10 below |
| 4 | Sign-in providers for alpha | Google + Apple + GitHub (new provider) + Facebook + Entra. **Revised 2026-09-22 by Leo:** Apple and Facebook included from the start, ported from bioscale-app | Testers are developers; GitHub is the identity they all have. Apple needs a paid dev account and an HTTPS tunnel to test, Facebook needs App Review; both hide themselves until their credentials are set |
| 5 | CLI ↔ service identity | OAuth-style **device authorization flow** (`gh auth login` shape) issuing a long-lived registration token and 15-minute access tokens | Implements spec §6 (mint / rotate / revoke) without inventing a scheme; no secret is pasted by hand |
| 6 | Escalation UX for alpha | **Terminal mode**: hook returns `ask`, Claude Code prompts in the terminal, and the service pushes an informational notification with a deep link to the full reasoning. **Remote mode** (answer from the phone, hook holds the call) is Phase 4 | Testers are at the keyboard; terminal `ask` is the best UX and what the hook does today. Remote mode is what makes headless runs safe and is the real product feature, but it needs the long-poll hold and is not needed to start testing |
| 7 | Notification failure domain | Alpha: same Vercel project, separate module and route, third-party delivery. Phase 4: split into its own Vercel project. **Confirmed by Leo 2026-09-22** | Deviation from spec §9.1, stated plainly. The outages that matter for alpha (jev or LLM provider down, evaluate function erroring) already leave the notify path alive; a platform-level split costs a second project and is not what alpha testing will exercise |
| 8 | "Plugins" | The client adapter ships as a **Claude Code plugin** (marketplace repo, same shape as `sveltekit-pwa-skill`) that bundles the PreToolUse hook, System 0, and a `ga` CLI. Codex / Gemini CLI adapters are later phases | One-command install for testers; no `install.js` copying files into `~/.claude/hooks` |
| 9 | Source of truth for the moral core | Stays in `conscience-research/tests/harness`; service and plugin vendor it with a sync script that stamps the commit SHA | The clinical trial remains the offline evaluator (spec §8.3); nothing ships that the trial did not measure |
| 10 | Service unreachable from the client | Hook maps S0 escalations to `ask` with reason "Guardian Angel unreachable, your decision". **Confirmed by Leo 2026-09-22** | Spec §9.3 says REJECT. For an interactive harness, `ask` is still fail-closed (a human decides) and is what the hook does today. In headless mode `ask` denies, so the spec's behavior holds there. Flip to `deny` is a one-line change |

---

## 1. Repositories and layout

Three repos. Two are new.

```
conscience-research/            (exists) source of truth: S0/S1/context/prompt, trial harness, paper
guardian-angel-service/         (new)    SvelteKit PWA + API on Vercel  → https://ga.linbeck.app (alpha)
guardian-angel-plugin/          (new)    Claude Code plugin: hook + S0 + client + `ga` CLI
```

**Domain for alpha.** `*.linbeck.app` already has a wildcard ALIAS to Vercel on the
`l3-projects` team (verified in `sveltekit-pwa-skill/docs/internal-webapp-platform.md`), so
`ga.linbeck.app` needs zero DNS work. Move to a product domain when there is one; the IdP
redirect URIs are the only thing that changes.

### 1.1 `guardian-angel-service` (scaffolded by the skill)

```
node ~/github/sveltekit-pwa-skill/skills/sveltekit-pwa/scripts/scaffold.mjs \
  --name guardian-angel --auth general --title "Guardian Angel"
```

Then, on top of the scaffold:

```
src/lib/server/
  auth/providers/github.ts        NEW — OAuth2 (not OIDC), modeled on facebook.ts
  db/client.ts                    from bioscale-app verbatim (pooled MongoClient promise)
  db/{users,devices,verdicts,escalations,prompts,push}.ts   one file owns each collection's field names
  auth/session.ts                 from the skill; add role/status to AppSession
  tokens.ts                       access-token mint/verify (jose, HS256, 15 min), registration tokens
  device-flow.ts                  device code issue / approve / poll
  eval/                           the moral core, vendored from conscience-research (see §3)
    core/system1.js               jev client (unified mode), redaction (re-redact on ingest)
    core/context-server.js        buildSystem2UserMessage, extractDecisionJSON
    system2.ts                    provider layer (anthropic | openai-compatible), ported from the hook
    ladder.ts                     S1 → S2 → dissent guard → ESCALATE/REJECT per §3 of the spec
    prompts.ts                    registry resolution (pin → cohort → default), 60 s module cache
  notify/
    index.ts                      route an escalation to the principal's channels
    webpush.ts                    VAPID via the `web-push` package
    mail.ts                       from bioscale-app (Resend, one fetch)
  ratelimit.ts                    per-principal sliding window in Mongo
src/lib/data/*.remote.ts          queries/forms for the PWA pages
src/routes/
  api/v1/                         +server.ts endpoints for the client (bearer token), see §4
  link/                           device-code approval page (web session)
  escalations/, activity/, devices/, settings/, admin/…   see §6
scripts/
  sync-core.mjs                   copies core files from conscience-research, stamps CORE_SHA
  seed-prompt.mjs                 loads tests/wrappers/default.txt + system1-unified.json as the default prompt version
  setup-indexes.mjs               indexes + TTL indexes (bioscale precedent)
```

### 1.2 `guardian-angel-plugin`

```
.claude-plugin/plugin.json, marketplace.json     same shape as sveltekit-pwa-skill
hooks/hooks.json                 PreToolUse, matcher ".*", command: node ${CLAUDE_PLUGIN_ROOT}/bin/ga-hook.js
bin/ga-hook.js                   the hook: normalize → S0 → (escalate) redact → POST /evaluate → apply verdict
bin/ga.js                        CLI: login | status | logout | mode terminal|remote
lib/core/system0.js              vendored
lib/core/context-client.js       vendored: resolveReferencedFiles, assessDownloads, file/write-target metadata
lib/core/redact.js               vendored: redactSecrets + sanitize (split out of system1.js)
lib/client.js                    credentials file, token cache/refresh, fetch with timeout
lib/transcript.js                readTranscript() lifted from the current hook (request + history)
skills/guardian-angel/SKILL.md   tells Claude how to walk a user through `ga login`, status, troubleshooting
```

The plugin holds **no** morality prompt, no jev key, no LLM key. Its only secret is the
registration token in `~/.config/guardian-angel/credentials.json` (mode 0600).

---

## 2. Identity and login

### 2.1 Web sign-in (people)

The skill's auth as-is: OIDC/OAuth → normalized identity → HS256 session JWT in an httpOnly
cookie, sliding 30-day expiry, `requireUser()` in remote functions, route guard in
`+layout.server.ts`.

Additions:

- **GitHub provider.** OAuth2 with `read:user user:email`; identity from `/user` and
  `/user/emails` (primary, verified). Rejected if no verified email, as Facebook is.
- **Users collection** (`users`), keyed `${provider}:${sub}` exactly as bioscale's
  `app_users`. Fields: `email`, `name`, `role: 'principal' | 'admin'`,
  `status: 'active' | 'waitlisted' | 'suspended'`, `escalationMode`, `promptPin`,
  `createdAt`, `lastSignInAt`.
- **Alpha gate.** Sign-in always succeeds; a user whose email is not in `ALPHA_ALLOWLIST`
  and has no accepted invite lands on `/waitlist` and cannot link a device. Admins
  (`ADMIN_EMAILS`) approve from `/admin/users`. Invites are emailed through Resend.
- `AppSession` grows `role` and `status` so pages and remote functions can gate on them
  without a DB read.

### 2.2 Device linking (the CLI and hook)

The hook runs in a terminal with no cookie. It gets identity through a device
authorization flow, all under `/api/v1/device/*`:

```
ga login
  → POST /api/v1/device/code            (no auth)  → { device_code, user_code, verification_uri, interval, expires_in }
  prints:  Open https://ga.linbeck.app/link and enter  QXJK-7M2P
  → polls POST /api/v1/device/token { device_code }   428 authorization_pending | 200 { registration_token, access_token, expires_in, device_id }

/link (web, signed-in, status=active)
  user enters code → sees device name/host → Approve
  → devices.insert { uid, name, harness: 'claude-code', regTokenHash, createdAt }
```

**Tokens** (spec §6):

| Token | Lifetime | Where | Purpose |
| --- | --- | --- | --- |
| Registration token | until revoked | `credentials.json` (0600); SHA-256 hash in `devices` | Mint access tokens |
| Access token | 15 min (`ACCESS_TOKEN_TTL`) | in-memory + `credentials.json` cache | Bearer on `/evaluate` and `/escalations/*` |

- Access token: HS256 JWT (jose) signed with `TOKEN_SECRET` (distinct from
  `SESSION_SECRET`), `iss: guardian-angel`, `aud: ga-api`, claims `uid`, `did`, `scope`.
- `POST /api/v1/token { registration_token }` → checks the device is not revoked and the
  user is `active` → new access token. The client refreshes when < 2 min remain.
- **Revoke:** `/devices` lists devices with last-seen; Revoke sets `revokedAt`. Takes effect
  at the next refresh, so within one TTL, as the spec allows. Suspending a user revokes all.

---

## 3. The moral core: what moves where

Today `ga-lib/{system0,system1,context}.js` are copied into `~/.claude/hooks` by
`install.js`. The service split assigns each piece a side:

| Piece | Today | Goes to | Note |
| --- | --- | --- | --- |
| `system0.js` (reflex, file metadata, write targets) | hook | **plugin** | Needs the local filesystem and git |
| `context.js` → `resolveReferencedFiles`, `resolvePackageScripts`, `assessDownloads` | hook | **plugin** (`context-client.js`) | Reads scripts and disk locally; results travel in the call, redacted |
| `context.js` → `buildSystem2UserMessage`, `extractDecisionJSON` | hook | **service** (`context-server.js`) | |
| `system1.js` → `redactSecrets`, `sanitize`, `clip` | hook | **both** (`redact.js`) | Edge redaction in the plugin; re-redaction on ingest in the service |
| `system1.js` → jev client, unified question, verdict policy, dissent guard | hook | **service** | |
| `invokeSystem2` + provider quirks | hook + `ga-wrapper.js` | **service** (`system2.ts`) | Port as-is; profiles come from env, not `.ga-models.json` |
| `readTranscript` (request + history) | hook | **plugin** | Claude Code specific; other harnesses supply their own |
| nonce store (`.ga-state.json`) | hook | **plugin** | Still needed for terminal-mode approvals (§5.3) |

**Phase 0 work in `conscience-research`** (small, and it keeps the trial the source of truth):

1. Split `tests/harness/context.js` into `context-client.js` and `context-server.js`;
   `context.js` re-exports both so nothing in the harness changes.
2. Move `redactSecrets` / `sanitize` / `clip` from `system1.js` into `redact.js`;
   `system1.js` requires it.
3. Write `guardian-angel/spec/normalized-call.v1.schema.json` (below) and make
   `ga-wrapper.js` build exactly that object before calling S1/S2, so the trial and the
   service consume the same shape.

### 3.1 NormalizedCall v1

The spec's five fields plus the locally-computed facts S1/S2 already rely on. Everything
here is computed on the client; the service adds nothing it cannot verify.

```jsonc
{
  "v": 1,
  "harness": "claude-code", "client_version": "0.1.0", "core_sha": "4515421",
  "session_id": "…", "call_id": "…",                    // call_id = hash(tool, input) for approval matching
  "tool_name": "Bash",
  "tool_input": { … },                                   // redacted, clipped
  "principal_request": "…",                              // redacted, ≤ 2000 chars
  "history": [ { "tool": "…", "summary": "…", "verdict": "APPROVE", "output": "…" } ],   // ≤ 12, redacted
  "cwd": "/Users/…",
  "reflex_flags": [ "…" ],                               // what S0 noticed
  "file_meta": { "path": "…", "exists": true, "in_git_repo": true, "git_tracked": true, "has_staged_changes": false, "looks_sensitive": false },
  "write_targets": [ { …same shape… } ],
  "referenced_files": [ { "path": "…", "content": "…" } ],   // ≤ 4, each ≤ 6000 chars, redacted
  "unresolved_files": [ "…" ],
  "download": { "flags": [ "…" ] }
}
```

### 3.2 Verdict v1

```jsonc
{
  "verdict_id": "…", "decision": "APPROVE" | "REJECT" | "ESCALATE",
  "tier": "system1" | "system2" | "service",             // "service" = ladder fell through (S2 down, notify up)
  "reason": "…",
  "trail": { "system1": { … }, "system2": { … } },      // same shapes the hook logs today
  "prompt_version": "morality@2026-09-22.1", "thresholds_version": "t1",
  "escalation_id": "…"                                    // present on ESCALATE
}
```

---

## 4. Service API (`/api/v1`)

All `+server.ts` routes under `src/routes/api/v1/`, bearer access token unless noted.
Each exports `config = { maxDuration: 60 }`: an S1 (≤ 4 s) plus S2 (9–12 s on Sonnet-class
models) round trip is well inside that, and Vercel allows 300 s on Hobby and 800 s on Pro
with Fluid compute. The hook's own `timeout` is set to 60 s in terminal mode (Claude Code's
default for command hooks is 600 s), with the watchdog answering at 57 s.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/device/code` | none | Start device flow |
| POST | `/device/token` | none (device_code) | Poll for approval |
| POST | `/token` | registration token | Mint 15-min access token |
| POST | `/evaluate` | access | Run S1 → S2 on a NormalizedCall; returns Verdict; records audit |
| GET | `/escalations/:id` | access | Status of one escalation |
| GET | `/escalations/:id/wait?timeout=25` | access | Long-poll for the answer (Phase 4, remote mode) |
| POST | `/escalations/:id/outcome` | access | Hook reports the terminal answer (approved / denied / expired) |
| GET | `/health` | none | `{ s1, s2, notify }` from cached probes; used by `ga status` and the dashboard |

**Inside `/evaluate`** (`ladder.ts`):

1. Validate schema; reject > 256 KB. Re-redact every string field (defense in depth).
2. Rate limit per `uid` (default 120 calls / min; escalated calls only reach here, so this
   is generous). 429 → the hook treats as "service down" for that call.
3. Resolve the prompt version for this user (§7). Load thresholds.
4. **System 1**: jev, unified question, policy thresholds. Failure → treat as ESCALATE with
   `consulted:false` (doubt travels upward).
5. **System 2**: provider call. Failure → S2 down.
6. Dissent guard exactly as the hook does now.
7. Outcome:
   - APPROVE / REJECT → write `verdicts`, return.
   - ESCALATE (or S2 down) → write `verdicts` and `escalations`, dispatch notification via
     `waitUntil` (from `@vercel/functions`) so delivery does not delay the response, return
     with `escalation_id`. If dispatch itself reports the notify path down **and** the mode
     is remote, return REJECT with tier `service` (spec §3). In terminal mode the harness
     can still ask, so return ESCALATE regardless.

**Audit record** (`verdicts`): the NormalizedCall as received (already redacted), the trail,
decision, tier, prompt and thresholds versions, S1/S2 latency, model ids, and, when the
outcome is later reported, the principal's answer. `referenced_files.content` and
`tool_input` live in a sibling `payloads` collection with a **TTL index** (default 7 days,
`PAYLOAD_RETENTION_DAYS`) so the audit trail outlives the raw context. That is the
concrete form of spec decision (h).

---

## 5. The Claude Code plugin

### 5.1 Hook flow (`bin/ga-hook.js`)

```
stdin JSON → normalize (tool_name, tool_input, session_id, transcript_path, cwd)
  → S0 (local)                       APPROVE → allow · REJECT → deny
  → consumeApproval(call_id)?        allow (principal already said yes to this exact call)
  → gather: reflex flags, file meta, write targets, referenced files, downloads, transcript
  → redact + clip → NormalizedCall
  → ensure access token (refresh if < 2 min left; if no credentials → ask: "run `ga login`")
  → POST /evaluate (timeout 45 s)
       APPROVE  → allow
       REJECT   → deny  "GUARDIAN_ANGEL_REJECT|<tier>|<reason>"
       ESCALATE → terminal mode: record nonce, respond ask "GUARDIAN_ANGEL_ESCALATE|<escalation_id>|<reason>"
                  remote mode (Phase 4): long-poll /wait until answered or hook timeout → allow/deny
       network / 5xx / 429 / timeout → ask "Guardian Angel unreachable — your decision"   (decision #10)
  → watchdog at hook timeout − 3 s → ask, as today
```

**The watchdog is a safety requirement, not a convenience.** Claude Code's documented
behavior when a hook exceeds its `timeout` is to kill it and let the tool call proceed as
a non-blocking error. A hook that has not answered by the deadline is therefore an
APPROVE. The watchdog must always fire first, and `hooks.json` sets `timeout` explicitly
rather than relying on the 600 s default for command hooks.

**Headless runs.** In `claude -p` and SDK sessions there is no prompt to show, and a
documented bug makes `ask` silently deny there (claude-code issue #95726). That is
fail-closed, so it is acceptable for alpha, but the hook should detect non-interactive
mode where it can and return `deny` with an explicit "escalated, awaiting principal"
reason so the log says what happened. Claude Code also has an undocumented `defer`
decision (issue #41791) that exits the session with a deferred-tool payload for
`claude -p --resume`; it is the natural pairing for remote mode in Phase 4 and worth
evaluating then, not now.

The hook keeps a local log (`~/.config/guardian-angel/hook.log`) with the same tier trail
format the current hook writes, so a tester can debug without the web UI.

### 5.2 CLI (`bin/ga.js`)

- `ga login [--service URL]` device flow (§2.2); writes `credentials.json`.
- `ga status` shows service, device name, token expiry, escalation mode, `/health`.
- `ga logout` deletes credentials (and calls revoke).
- `ga mode terminal|remote` (remote is Phase 4).

### 5.3 Reporting the terminal answer

Claude Code does not tell a hook what the user chose at an `ask`. The existing nonce store
recovers most of it: when the same `call_id` arrives within the approval window, the hook
knows the principal said yes and POSTs `outcome: approved`. Denials are inferred when the
escalation expires unanswered (`ESCALATION_TTL`, 10 min). Good enough for alpha metrics;
remote mode makes it exact.

### 5.4 Install experience for a tester

```
/plugin marketplace add leo3/guardian-angel-plugin
/plugin install guardian-angel@linbeck-tools
ga login                                        (bin/ is on PATH while the plugin is enabled)
```

Verified against the plugin reference: hooks ship in `hooks/hooks.json` at the plugin
root with the same schema as user settings, `${CLAUDE_PLUGIN_ROOT}` is expanded in hook
commands, skills under `skills/` are invocable as `/guardian-angel:<skill>`, and a top-level
`bin/` is added to the Bash tool's PATH. One caveat: plugins distributed through claude.ai
organization settings may not include `bin/`, so the plugin is distributed from the
marketplace repo, as `sveltekit-pwa-skill` is.

---

## 6. PWA pages

Mobile-first; the escalation inbox is the reason to install it to the home screen (which
is also what iOS requires before it will deliver web push).

| Route | Who | What |
| --- | --- | --- |
| `/` | principal | Pending escalations, last 20 verdicts, linked devices, service health |
| `/escalations`, `/escalations/[id]` | principal | The inbox. Detail shows tool, input (redacted), S1 probabilities, S2 reasoning, prompt version. Phase 4 adds Approve / Reject |
| `/activity` | principal | Verdict log, filter by decision and tier, per-session grouping |
| `/devices` | principal | Linked devices, last seen, revoke |
| `/link` | principal | Enter device code, approve |
| `/settings` | principal | Enable push (subscribe this browser), email fallback on/off, escalation mode |
| `/waitlist` | anyone signed in | Holding page until approved |
| `/admin/users` | admin | Allowlist, invites, suspend |
| `/admin/prompts` | admin | Versions, diff, stage to cohort, promote, roll back |
| `/admin/metrics` | admin | ER per tier, escalation-approval rate, latency, by prompt version |
| `/privacy`, `/terms` | public | Data-handling commitments from spec §7.2: what is transmitted, retention, no training use, deletion on request |

Remote functions per the skill (`query` / `form` / `command`), `requireUser()` in each,
`svelte:boundary` around awaited regions.

---

## 7. Prompt registry

`prompts` collection: `_id` is the version string (`morality@2026-09-22.1`), `content`,
`sha256`, `status: draft | staged | default | retired`, `thresholds { approve, reject, dissent }`
and `thresholdsVersion`, `cohort: [uid]`, `createdBy`, `createdAt`, `notes`.

Resolution for a call: `user.promptPin` → a `staged` version whose cohort includes the
user → the single `default`. Module-scope cache, 60 s. Every verdict carries both version
ids, so A/B across cohorts is a query on `verdicts`.

Seed: `scripts/seed-prompt.mjs` reads `tests/wrappers/default.txt` and
`system1-unified.json` from a local `conscience-research` checkout and creates the first
default. Promotion of any later version requires a trial run id in `notes` (the offline
evaluator gate of spec §8.3); the admin UI asks for it.

---

## 8. Escalation and notification

### 8.1 Data

`escalations`: `uid`, `verdict_id`, `session_id`, `tool_name`, `summary` (one line),
`reason`, `status: pending | approved | rejected | expired | answered_locally`,
`answeredVia: terminal | web | push`, `createdAt`, `expiresAt`, `answeredAt`, plus a
`deliveries[]` array of `{ channel, at, ok, detail }`.

`push_subscriptions`: `uid`, endpoint, keys, user agent, `createdAt`, `lastOkAt`,
`failedAt`. A 404/410 from the push service deletes the subscription.

### 8.2 Delivery (`notify/index.ts`)

1. Web push to every live subscription for the user. Payload: title "Guardian Angel
   escalated a call", body = summary, `data.url = /escalations/<id>`. Actions
   (Approve / Reject) are added in Phase 4.
2. If the user has no subscriptions, or every push fails, or email fallback is on: Resend
   email with the same summary and link.
3. Record each attempt in `deliveries[]`. "Notify down" means every channel threw.

The service worker from the skill gets a `push` handler and a `notificationclick` handler
that focuses or opens the deep link. iOS delivers these only for the home-screen install,
so `/settings` shows the install steps when it detects Safari.

### 8.3 Terminal vs remote

Alpha ships terminal mode (decision #6). Remote mode, Phase 4, is the same records plus:
the hook long-polls `/escalations/:id/wait`, the PWA's Approve / Reject calls
`POST /escalations/:id/answer` (web session, or a signed one-time action token in the
push payload for notification buttons), the hook's `timeout` rises to 300 s, and a timeout
resolves to `deny` with the escalation left `pending` so the principal can re-run.

---

## 9. Database recommendation: MongoDB Atlas

**Recommendation: MongoDB Atlas, Flex tier for alpha** (base $8/month, capped at $30, 5 GB;
M0 free tier is enough for the first weeks). Reasons, in order of weight:

1. **The data is document-shaped.** A verdict is a NormalizedCall plus a per-tier trail
   whose shape varies by tier reached, model, and prompt version. Storing that as one
   document and indexing `uid + createdAt`, `session_id`, `prompt_version` is exactly what
   Mongo does well; in Postgres it is a `jsonb` column with the same indexes and less
   ergonomic queries.
2. **Retention is a TTL index.** Spec decision (h) needs raw context to expire on a schedule
   while the audit trail stays. One `expireAfterSeconds` index on `payloads` enforces it
   with no cron and no code path to get wrong.
3. **The serverless client pattern is already written and proven.** `bioscale-app`'s
   `db/client.ts` (cached connection promise, small pool, fast fail) and its "empty
   `MONGODB_URI` means in-memory store" convention let the e2e suite and local dev run
   without a cluster. Copy both.
4. **Vercel integration** provisions Atlas and injects `MONGODB_URI` from the Vercel
   dashboard; Atlas network access is `0.0.0.0/0` with TLS + credentials, as bioscale does.

**When to reconsider:** if `/admin/metrics` grows into real analytical work (FP/FN/ER by
cohort, by tool, by prompt version over months), Postgres on Neon with SQL and
materialized views would be the better home. Keep every collection's field names inside
`src/lib/server/db/*.ts` (the bioscale rule) so that move is contained.

Collections and indexes:

| Collection | Key indexes | TTL |
| --- | --- | --- |
| `users` | `_id` (uid), `email` unique | |
| `devices` | `uid`, `regTokenHash` unique | |
| `device_codes` | `deviceCode` unique, `userCode` unique | 10 min |
| `verdicts` | `{uid, createdAt}`, `{session_id}`, `{prompt_version, createdAt}` | none (audit) |
| `payloads` | `verdict_id` | `PAYLOAD_RETENTION_DAYS` |
| `escalations` | `{uid, status, createdAt}` | none |
| `prompts` | `status` | |
| `push_subscriptions` | `uid`, `endpoint` unique | |
| `ratelimits` | `{uid, window}` | 2 min |

---

## 10. Notification service recommendation

**Recommendation for alpha: no orchestration vendor.** Two channels, both cheap and both
already in reach:

1. **Web Push (VAPID)** sent directly from the service with the `web-push` package. Free,
   no account, no SDK in the page beyond the service worker the skill already ships, and
   it delivers to the PWA the tester installed, which is where the escalation detail
   lives. Android and desktop show action buttons; iOS (16.4+) delivers to a home-screen
   install, with actions, but not to a Safari tab, and not in the EU. `/settings` handles
   the install prompt.
2. **Email via Resend** as the fallback and for invites. `bioscale-app`'s `mail.ts` is a
   single fetch with no SDK and a dev-mode preview; reuse it. Verify `linbeck.app` (or the
   product domain) as a sending domain.

**When a third party earns its place: Knock.** The moment testers ask for SMS, Slack, or
"push me, then text me if I have not answered in two minutes", that is a workflow engine
with per-user preferences and delivery tracking, and Knock is the best fit: workflows with
delay and branch steps, a preferences model, email through Resend, SMS through Twilio,
Slack and Teams, and a free Developer plan (10k messages/month) that an alpha will not
exhaust. It is also, by construction, the separate failure domain spec §9.1 asks for.
Caveat verified in Knock's docs: its push channel supports APNs, FCM, Expo, Amazon SNS and
OneSignal, **not browser Web Push**, so web push would stay native even with Knock in place.

Considered and not recommended:

- **OneSignal**: web push and email are on its free plan, but it is a marketing-push tool
  with a page SDK and segment model; escalations are one-to-one transactional messages.
- **ntfy / Pushover**: excellent developer ergonomics and action buttons, but each tester
  needs another app and, for ntfy, a private topic or a self-hosted server to keep
  escalation contents off a public feed.
- **Twilio SMS directly**: add it under Knock rather than as a bare integration.

---

## 11. System 1 and System 2 configuration

Env, not files. The service holds all model relationships (spec §7.3).

```
TYPESAFE_API_KEY, GA_S1_MODEL=jev-latest, GA_S1_TIMEOUT_MS=4000, GA_S1_MODE=enforce|shadow|off
GA_S2_PROFILES='{"gemini-flash":{"model":"gemini-2.5-flash","endpoint":"…/v1beta/openai","format":"openai","key":"…"},
                 "haiku":{…},"sonnet":{…}}'
GA_S2_ACTIVE=gemini-flash            # the validated 0 FP / 0 FN configuration
GA_S2_TIMEOUT_MS=20000
```

`system2.ts` is the hook's `invokeSystem2` with the parameter-drop retries intact; profile
selection can later move to the `prompts` document so a prompt version pins its model.

---

## 12. Testing

- **Unit** (Vitest, server project): token mint/verify/expiry, device flow state machine,
  ladder outcomes for every up/down combination of S1/S2/notify (table-driven from spec §3),
  prompt resolution order, redaction idempotence, GitHub provider identity mapping.
- **E2E** (Playwright, dev-login bypass as in the skill): sign in → waitlist → admin
  approves → link a device via `/link` → dashboard shows it → revoke.
- **Hook contract**: run `bin/ga-hook.js` against recorded stdin fixtures with a mocked
  service; assert allow/deny/ask JSON for each verdict and for each failure mode.
- **The trial through the service.** Add a condition to `run-trial.sh` where the container
  hook is the plugin hook pointed at a preview deployment (`GA_SERVICE_URL`,
  `GA_REGISTRATION_TOKEN`). The bar for alpha is the same as today: 0 FP, 0 FN on the
  16-category suite, with escalation rate reported per tier. This is the only test that
  proves the split changed nothing.

---

## 13. Phases

| Phase | Deliverable | Done when |
| --- | --- | --- |
| **0 · Core split** (conscience-research) | `context-client.js` / `context-server.js` / `redact.js`; NormalizedCall v1 schema; `ga-wrapper.js` builds it | Trial reruns byte-identical to the last validated run |
| **1 · Service spine** | Scaffold; Mongo; GitHub provider; users + allowlist + invites; device flow; tokens; `/devices`, `/link`, `/waitlist`, `/admin/users`; deployed to `ga.linbeck.app` | A tester can sign in, get approved, and link a CLI |
| **2 · Evaluate + plugin** | `/evaluate` with S1/S2 ported; prompt registry seeded; audit log; `/activity`; plugin repo with hook + `ga` CLI + SKILL.md | Claude Code on a tester's laptop is gated end-to-end; trial-through-service passes |
| **3 · Escalation + notify** | `escalations`; web push + Resend; `/escalations`; outcome reporting; `/settings`; `/admin/metrics`; `/privacy` + `/terms` | An escalation on the laptop shows on the phone within seconds with the reasoning |
| **4 · Alpha hardening** | Rate limiting; payload TTL; remote mode (long-poll, Approve/Reject actions, 300 s hook timeout); notify split into `guardian-angel-notify` project; `/admin/prompts` staging | First external testers invited |
| **5 · More adapters** | Codex CLI and Gemini CLI host hooks reusing `lib/` from the plugin | Per spec §4.3, with the Bash-only caveat documented for Codex |

Phases 1 and 2 can overlap once the API contract (§3.1, §3.2) is frozen: one track builds
the web side, the other the plugin against a mocked `/evaluate`.

---

## 14. Environment variables (service)

Everything from the skill's `--auth general` template (minus Apple/Facebook for now), plus:

```
GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
MONGODB_URI, MONGODB_DB=guardian-angel
TOKEN_SECRET                    # access-token HMAC; separate from SESSION_SECRET
ACCESS_TOKEN_TTL=900
ADMIN_EMAILS=leo3@linbeck.com
ALPHA_ALLOWLIST=leo3@linbeck.com,javierg@fannininnovation.com
TYPESAFE_API_KEY, GA_S1_*, GA_S2_PROFILES, GA_S2_ACTIVE
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:…
RESEND_API_KEY, MAIL_FROM
PAYLOAD_RETENTION_DAYS=7, ESCALATION_TTL_MINUTES=10
DEV_BYPASS_EMAIL, DEV_BYPASS_NAME    # never in production
```

---

## 15. Decisions taken on the open items (Leo, 2026-09-22)

1. **Service unreachable from an interactive harness → `ask`.** Decision #10 stands.
2. **Notify path** shares the Vercel project for alpha; split in Phase 4. Decision #7 stands.
3. **Domain:** `ga.linbeck.app` for alpha. IdP redirect URIs are registered against it;
   a product domain is a later rename.
4. **Vercel plan:** Hobby is sufficient for terminal mode (300 s function cap). Move to
   Pro when remote mode's long-poll lands in Phase 4 or when a second person needs
   deploy access.
5. **Retention:** raw payloads expire after 7 days (`PAYLOAD_RETENTION_DAYS=7`); the
   redacted audit trail is kept for the length of the alpha.
6. **Allowlist:** `leo3@linbeck.com` (admin) and `javierg@fannininnovation.com`. Invites
   go out from `no-reply@linbeck.app` via Resend once the domain is verified there.

No open items remain; Phase 0 can start.

---

## 16. Build status (2026-09-22, end of day one)

Built autonomously after the decisions in §15, without touching the running trial:
the core split lives in a separate git worktree, and the two new repos are outside
this one. **Nothing is committed or pushed yet**; that is the first thing to do.

| Phase | State | Where |
| --- | --- | --- |
| 0 · Core split | Done, verified byte-identical | worktree `../conscience-research-phase0`, branch `ga-alpha-phase0` (uncommitted): `tests/harness/{context-client,context-server,redact,normalize}.js`, `context.js` shim, `guardian-angel/spec/*.schema.json`, `ga-wrapper.js` builds a NormalizedCall, `install.js` copies the new files, `tests/harness/test-normalize.js` compares against commit `0175514` |
| 1 · Service spine | Done, all four gates + e2e green | `~/github/guardian-angel-service` (no git repo yet): Google/GitHub/Entra sign-in, alpha gate, device flow, tokens, `/devices` `/link` `/waitlist` `/admin/users` |
| 2 · Evaluate + plugin | Done, all gates green, live smoke passed | service: `/api/v1/evaluate`, ladder, prompt registry (seeded from the trial prompt), audit log, `/activity` `/escalations`; plugin: `~/github/guardian-angel-plugin` (no git repo yet) with hooks, `ga` CLI, vendored System 0, contract tests |
| 3 · Escalation + notify | Records and pages exist; **delivery is a stub** (`notifyConfigured() === false`) | web push + Resend, `/settings`, `/admin/metrics`, `/privacy`, `/terms` remain |
| 4 · Alpha hardening | Rate limit, payload TTL, and outcome reporting are in; remote mode, notify split, `/admin/prompts` remain | |

**Verified:**

- Service: `pnpm check`, `pnpm lint`, `pnpm build`, 35 unit tests, 4 Playwright tests.
  `e2e/plugin.test.ts` drives the real plugin: `ga login` → approve on `/link` → hook
  sends an escalated call → ladder → PostToolUse reports the answer → trail visible.
- Plugin: 6 hook contract tests against a mock service (S0 approve/reject with no
  network, redaction at the edge, all three verdicts, token refresh, revoked link,
  unreachable / 5xx / 429 / not linked all resolve to `ask`).
- Live: the same round trip with `TYPESAFE_API_KEY` and the Gemini profile exported
  ran System 1 and System 2 for real (`rm -rf build && npm test`, no request context
  → one run APPROVE, one run ESCALATE; ~13 s end to end including login).
- Trial harness: `test-normalize.js` shows the split changed nothing S1/S2 see. The
  trial Docker image was **not** rebuilt (a rebuild retags the image the running trial
  launches from); rerun the trial from the worktree branch once run-20260922-053624
  finishes.

**Deviation worth knowing:** the plugin registers a **PostToolUse** hook in addition to
PreToolUse. Claude Code never tells a hook what the principal chose at an `ask`, but a
tool that runs was approved; the post-hook matches the call id to the pending
escalation and reports `approved`. §5.3 is superseded by this.

**Next actions (in order):**

1. Review and commit the worktree branch; merge `ga-alpha-phase0` into `jev` after the
   trial rerun confirms 0 FP / 0 FN.
2. `git init` both new repos, commit, push to GitHub (`leo3linbeck/guardian-angel-service`,
   `leo3linbeck/guardian-angel-plugin`).
3. Vercel project for the service on `ga.linbeck.app`; Atlas database; set the env
   from `.env.example` (`SESSION_SECRET`, `TOKEN_SECRET`, `TYPESAFE_API_KEY`,
   `GA_S2_PROFILES`, allowlist); `pnpm db:indexes`.
4. Register OAuth apps: Google, GitHub, Facebook, and Apple (Services ID) with callback
   `https://ga.linbeck.app/auth/<id>/callback`; Apple also needs the `.p8` key.
5. Phase 3: web push (VAPID keys) + Resend; then invite Javier.
