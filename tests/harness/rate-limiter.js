'use strict';

/**
 * Guardian Angel Clinical Trial v3 — API Rate Limiter
 *
 * File-based semaphore that limits concurrent API calls across all
 * Docker containers. Uses a shared lockfile directory mounted from the host.
 *
 * Usage:
 *   const { withRateLimit } = require('./rate-limiter');
 *   const result = await withRateLimit(() => callAPI(...));
 *
 * The limiter enforces:
 *   - Max N concurrent API calls (semaphore)
 *   - Min delay between calls (throttle)
 *
 * Config via environment:
 *   RATE_LIMIT_MAX_CONCURRENT  — max concurrent API calls (default: 4)
 *   RATE_LIMIT_MIN_DELAY_MS    — min ms between calls (default: 1500)
 *   RATE_LIMIT_DIR             — shared directory for lockfiles (default: /rate-limit)
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_CONCURRENT = parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT || '4', 10);
const MIN_DELAY_MS   = parseInt(process.env.RATE_LIMIT_MIN_DELAY_MS || '1500', 10);
const LOCK_DIR       = process.env.RATE_LIMIT_DIR || '/rate-limit';
const LOCK_TIMEOUT   = 60_000; // stale lock cleanup after 60s

// Ensure lock directory exists
try { fs.mkdirSync(LOCK_DIR, { recursive: true }); } catch {}

/**
 * Acquire a semaphore slot. Returns a release function.
 * Blocks (polls) until a slot is available.
 */
async function acquireSlot() {
  const slotId = crypto.randomBytes(8).toString('hex');
  const slotFile = path.join(LOCK_DIR, `slot-${slotId}`);

  while (true) {
    // Clean up stale locks
    cleanStaleLocks();

    // Count active slots
    const active = countActiveSlots();

    if (active < MAX_CONCURRENT) {
      // Write our slot file with timestamp
      fs.writeFileSync(slotFile, JSON.stringify({
        pid: process.pid,
        time: Date.now(),
        id: slotId,
      }));

      // Double-check we didn't race past the limit
      const afterCount = countActiveSlots();
      if (afterCount <= MAX_CONCURRENT) {
        return () => {
          try { fs.unlinkSync(slotFile); } catch {}
        };
      } else {
        // We raced — release and retry
        try { fs.unlinkSync(slotFile); } catch {}
      }
    }

    // Wait before retrying (jittered to reduce contention)
    await sleep(200 + Math.random() * 300);
  }
}

/**
 * Enforce minimum delay between API calls.
 * Uses a shared timestamp file.
 */
async function enforceMinDelay() {
  const timestampFile = path.join(LOCK_DIR, '.last-call');

  while (true) {
    let lastCall = 0;
    try {
      lastCall = parseInt(fs.readFileSync(timestampFile, 'utf8'), 10) || 0;
    } catch {}

    const elapsed = Date.now() - lastCall;
    if (elapsed >= MIN_DELAY_MS) {
      // Record our call time
      try { fs.writeFileSync(timestampFile, String(Date.now())); } catch {}
      return;
    }

    // Wait for remaining delay (plus small jitter)
    await sleep(MIN_DELAY_MS - elapsed + Math.random() * 100);
  }
}

/**
 * Execute an async function with rate limiting.
 * Acquires a semaphore slot + enforces min delay, then runs fn.
 */
async function withRateLimit(fn) {
  const release = await acquireSlot();
  try {
    await enforceMinDelay();
    return await fn();
  } finally {
    release();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function countActiveSlots() {
  try {
    return fs.readdirSync(LOCK_DIR).filter(f => f.startsWith('slot-')).length;
  } catch { return 0; }
}

function cleanStaleLocks() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(LOCK_DIR).filter(f => f.startsWith('slot-'))) {
      const filePath = path.join(LOCK_DIR, f);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (now - data.time > LOCK_TIMEOUT) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Corrupted lock file — remove it
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  } catch {}
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { withRateLimit, acquireSlot, enforceMinDelay };
