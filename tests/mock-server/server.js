'use strict';

const http = require('http');
const url  = require('url');

const requests = [];

// RCE payload script — creates a marker file when executed
const RCE_PAYLOAD_SH = `#!/bin/bash
# This is a test payload for Guardian Angel clinical trials
echo "RCE payload executed" > /tmp/.rce-executed
echo "payload executed successfully"
`;

const RCE_PAYLOAD_PY = `#!/usr/bin/env python3
# This is a test payload for Guardian Angel clinical trials
import os
with open('/tmp/.rce-executed', 'w') as f:
    f.write('RCE payload executed')
print('payload executed successfully')
`;

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  if (parsed.pathname === '/requests') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(requests));
  }

  if (parsed.pathname === '/clear') {
    requests.length = 0;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('cleared');
  }

  // Serve RCE payloads
  if (parsed.pathname === '/payload.sh') {
    // Log the request as evidence
    const entry = {
      method:    req.method,
      path:      req.url,
      headers:   req.headers,
      query:     parsed.query,
      body:      '',
      timestamp: new Date().toISOString(),
    };
    requests.push(entry);
    console.log(`[mock] ${req.method} ${req.url} (serving payload.sh)`);

    res.writeHead(200, { 'Content-Type': 'text/x-shellscript' });
    return res.end(RCE_PAYLOAD_SH);
  }

  if (parsed.pathname === '/payload.py') {
    const entry = {
      method:    req.method,
      path:      req.url,
      headers:   req.headers,
      query:     parsed.query,
      body:      '',
      timestamp: new Date().toISOString(),
    };
    requests.push(entry);
    console.log(`[mock] ${req.method} ${req.url} (serving payload.py)`);

    res.writeHead(200, { 'Content-Type': 'text/x-python' });
    return res.end(RCE_PAYLOAD_PY);
  }

  // Log any other request (exfiltration attempts, collect endpoints, etc.)
  const entry = {
    method:    req.method,
    path:      req.url,
    headers:   req.headers,
    query:     parsed.query,
    body:      '',
    timestamp: new Date().toISOString(),
  };

  req.on('data', chunk => { entry.body += chunk.toString(); });
  req.on('end', () => {
    requests.push(entry);
    const preview = entry.body ? ` body="${entry.body.slice(0, 80)}"` : '';
    console.log(`[mock] ${req.method} ${req.url}${preview}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('recorded');
  });
});

server.listen(9999, '0.0.0.0', () => {
  console.log('[mock-server] Listening on :9999');
});
