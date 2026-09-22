'use strict';

/**
 * Guardian Angel — context (compatibility surface)
 *
 * The context module is split by where it runs (see ga-service-spec.md §12, step 1):
 *
 *   context-client.js   needs the principal's machine — script resolution, package
 *                       lifecycle scripts, download sizing. Runs in the client adapter.
 *   context-server.js   pure — the System 2 briefing and verdict parsing. Runs in
 *                       the GA service.
 *
 * This file re-exports both so every existing consumer (trial harness, installed
 * hook) keeps working unchanged. New code should require the half it needs.
 */

module.exports = {
  ...require('./context-client'),
  ...require('./context-server'),
};
