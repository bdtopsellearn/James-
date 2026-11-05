/**
 * ⚡ PN AD NETWORK ⚡ — SOCKS5 → HTTP Bridge v30.2-STABLE
 * Developer: @alif_h4ck
 *
 * ────────────────────────────────────────────────────────────────
 * v30.2 (THIS VERSION — CRITICAL FIXES):
 *   🔴 FIX: Plain HTTP proxy path used `upstreamSocket.pipe(clientRes)`
 *           which double-wrapped responses (ServerResponse added its own
 *           HTTP framing ON TOP of raw upstream bytes) → corrupted
 *           responses, blank pages, failed loads on any http:// target
 *           or HTTP redirect.
 *           Replaced with proper `http.request()` + `createConnection()`
 *           so Node.js handles framing/chunking/Content-Length correctly.
 *   🔴 FIX: WebSocket / HTTP Upgrade over plain HTTP proxy wasn't handled
 *           at all (Node emits 'upgrade' event, not 'request'). Added
 *           dedicated 'upgrade' handler with raw bidirectional piping.
 *   ⚠️  Bumped TUNNEL_IDLE_MS 2min → 5min (HTTP/2 keep-alive friendly).
 *   ⚠️  Serialized startBridge() so concurrent callers with different
 *       proxyEntry don't lose their upstream.
 *   ⚠️  Added server.on('clientError') for malformed-request handling.
 *   ⚠️  Added process-level unhandledRejection logger.
 *   ⚠️  Proper RFC 7230 hop-by-hop header stripping (both directions).
 *   ✅  Added getStats() for admin dashboards.
 *   ✅  Constant-time-ish auth failure on length mismatch.
 *
 * v30.1 (previous):
 *   ✅ Timing-safe Basic Auth comparison (crypto.timingSafeEqual)
 *   ✅ Smart updateUpstream (skip no-op writes)
 *   ✅ Upstream swap does NOT kill in-flight tunnels
 *   ✅ Per-request upstream snapshot (race-safe)
 *   ✅ 30s upstream timeout (residential-friendly)
 *   ✅ 50MB body limit
 *   ✅ Idle-tunnel auto-prune
 *   ✅ Graceful shutdown
 * ────────────────────────────────────────────────────────────────
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const { SocksClient } = require('socks');

// ─── Config ───
const BRIDGE_USER = 'pn_bridge';
const BRIDGE_PASS = 'pn_' + crypto.randomBytes(12).toString('hex'); // 96-bit
const UPSTREAM_TIMEOUT_MS = 30000;
const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB
const TUNNEL_IDLE_MS = 300000;           // 5 min idle → prune
const PRUNE_INTERVAL_MS = 60000;

// RFC 7230 §6.1 — hop-by-hop headers must NOT be forwarded end-to-end
const HOP_BY_HOP = new Set([
  'connection',
  'proxy-connection',
  'proxy-authorization',
  'proxy-authenticate',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
]);

// ─── State ───
let bridgeServer = null;
let bridgePort = null;
let currentUpstream = null;
let bridgeStarting = null;
const activeTunnels = new Set();
let pruneTimer = null;

// Precompute expected auth header ONCE
const EXPECTED_AUTH_HEADER =
  'Basic ' + Buffer.from(`${BRIDGE_USER}:${BRIDGE_PASS}`).toString('base64');

// ─── Safety net ───
process.on('unhandledRejection', (reason) => {
  console.error('[Bridge][UnhandledRejection]', reason && reason.stack ? reason.stack : reason);
});

// ═══════════════════════════════════════════════════════════════════
//  UPSTREAM BUILDER
// ═══════════════════════════════════════════════════════════════════
function buildUpstream(proxyEntry) {
  if (!proxyEntry || !proxyEntry.server) return null;
  let parsed;
  try { parsed = new URL(proxyEntry.server); }
  catch (e) { return null; }

  const proto = parsed.protocol.toLowerCase();
  if (!proto.startsWith('socks5')) return null;

  const username = proxyEntry.username ||
    (parsed.username ? decodeURIComponent(parsed.username) : '');
  const password = proxyEntry.password ||
    (parsed.password ? decodeURIComponent(parsed.password) : '');

  const port = parseInt(parsed.port, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return {
    host: parsed.hostname,
    port,
    userId: username || undefined,
    password: password || undefined,
    type: 5,
  };
}

function isSameUpstream(a, b) {
  if (!a || !b) return false;
  return a.host === b.host &&
         a.port === b.port &&
         a.userId === b.userId &&
         a.password === b.password;
}

// ═══════════════════════════════════════════════════════════════════
//  AUTH (timing-safe)
// ═══════════════════════════════════════════════════════════════════
function checkAuth(req) {
  const authHeader = req.headers['proxy-authorization'] || '';
  if (typeof authHeader !== 'string') return false;
  const aBuf = Buffer.from(authHeader);
  const bBuf = Buffer.from(EXPECTED_AUTH_HEADER);
  if (aBuf.length !== bBuf.length) {
    // Constant-ish time even on length mismatch (avoid early-return timing leak)
    try { crypto.timingSafeEqual(bBuf, bBuf); } catch (_) {}
    return false;
  }
  try { return crypto.timingSafeEqual(aBuf, bBuf); }
  catch (e) { return false; }
}

// ═══════════════════════════════════════════════════════════════════
//  TUNNEL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
function closeAllTunnels() {
  for (const pair of activeTunnels) {
    try { pair.client.end(); } catch (e) {}
    try { pair.upstream.end(); } catch (e) {}
  }
  activeTunnels.clear();
}

function startPruneTimer() {
  if (pruneTimer) clearInterval(pruneTimer);
  pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const pair of activeTunnels) {
      if (now - (pair.lastActivity || 0) > TUNNEL_IDLE_MS) {
        try { pair.client.end(); } catch (e) {}
        try { pair.upstream.end(); } catch (e) {}
        activeTunnels.delete(pair);
      }
    }
  }, PRUNE_INTERVAL_MS);
  if (pruneTimer.unref) pruneTimer.unref();
}

function touchTunnel(pair) {
  pair.lastActivity = Date.now();
}

function makePairCleanup(pair) {
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    try { pair.upstream.end(); } catch (e) {}
    try { pair.client.end(); } catch (e) {}
    activeTunnels.delete(pair);
  };
}

// ═══════════════════════════════════════════════════════════════════
//  HANDLERS
// ═══════════════════════════════════════════════════════════════════

// ── HTTPS CONNECT tunneling ──
async function handleConnect(req, clientSocket, head) {
  if (!checkAuth(req)) {
    try {
      clientSocket.write(
        'HTTP/1.1 407 Proxy Authentication Required\r\n' +
        'Proxy-Authenticate: Basic realm="bridge"\r\n\r\n'
      );
    } catch (e) {}
    try { clientSocket.end(); } catch (e) {}
    return;
  }

  const parts = (req.url || '').split(':');
  const targetHost = parts[0];
  const port = parseInt(parts[1], 10) || 443;

  if (!targetHost || !Number.isInteger(port) || port < 1 || port > 65535) {
    try { clientSocket.write('HTTP/1.1 400 Bad Target\r\n\r\n'); } catch (e) {}
    try { clientSocket.end(); } catch (e) {}
    return;
  }

  const upstreamSnapshot = currentUpstream;
  if (!upstreamSnapshot) {
    try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (e) {}
    try { clientSocket.end(); } catch (e) {}
    return;
  }

  try {
    const { socket: upstreamSocket } = await SocksClient.createConnection({
      proxy: upstreamSnapshot,
      command: 'connect',
      destination: { host: targetHost, port },
      timeout: UPSTREAM_TIMEOUT_MS,
    });

    const pair = { client: clientSocket, upstream: upstreamSocket, lastActivity: Date.now() };
    activeTunnels.add(pair);
    const cleanup = makePairCleanup(pair);

    try { clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); } catch (e) {}
    if (head && head.length) {
      try { upstreamSocket.write(head); } catch (e) {}
    }

    upstreamSocket.on('error', cleanup);
    clientSocket.on('error', cleanup);
    clientSocket.on('close', cleanup);
    upstreamSocket.on('close', cleanup);
    upstreamSocket.on('data', () => touchTunnel(pair));
    clientSocket.on('data', () => touchTunnel(pair));

    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  } catch (e) {
    try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (x) {}
    try { clientSocket.end(); } catch (x) {}
  }
}

// ── Plain HTTP forward proxy ──
function handleHttpRequest(req, clientRes) {
  if (!checkAuth(req)) {
    try {
      clientRes.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="bridge"' });
      clientRes.end('Proxy Auth Required');
    } catch (e) {}
    return;
  }

  let targetUrl;
  try { targetUrl = new URL(req.url); }
  catch (e) {
    try { clientRes.writeHead(400); clientRes.end('Bad URL'); } catch (x) {}
    return;
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    try { clientRes.writeHead(400); clientRes.end('Unsupported protocol'); } catch (x) {}
    return;
  }

  const bodyChunks = [];
  let totalBytes = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      aborted = true;
      try { clientRes.writeHead(413); clientRes.end('Payload Too Large'); } catch (e) {}
      try { req.destroy(); } catch (e) {}
      return;
    }
    bodyChunks.push(chunk);
  });

  req.on('error', () => {
    if (aborted) return;
    aborted = true;
    try { clientRes.destroy(); } catch (e) {}
  });

  req.on('end', async () => {
    if (aborted) return;

    const upstreamSnapshot = currentUpstream;
    if (!upstreamSnapshot) {
      try { clientRes.writeHead(502); clientRes.end('No Upstream'); } catch (e) {}
      return;
    }

    const port = parseInt(
      targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      10
    );

    // 1) Dial the SOCKS5 tunnel
    let upstreamSocket;
    try {
      ({ socket: upstreamSocket } = await SocksClient.createConnection({
        proxy: upstreamSnapshot,
        command: 'connect',
        destination: { host: targetUrl.hostname, port },
        timeout: UPSTREAM_TIMEOUT_MS,
      }));
    } catch (e) {
      try { clientRes.writeHead(502); clientRes.end('Bad Gateway'); } catch (_) {}
      return;
    }

    // 2) Build request headers (strip hop-by-hop)
    const fwdHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(String(k).toLowerCase())) fwdHeaders[k] = v;
    }
    fwdHeaders.host = targetUrl.host;

    // 3) Forward via Node's http.request using our pre-connected SOCKS socket.
    //    🔴 THE FIX: this makes Node handle framing / chunking / Content-Length.
    //    (Old buggy code did `upstreamSocket.pipe(clientRes)` which double-wrapped.)
    let upstreamReq;
    try {
      upstreamReq = http.request({
        method: req.method,
        host: targetUrl.hostname,
        port,
        path: targetUrl.pathname + targetUrl.search,
        headers: fwdHeaders,
        agent: false,
        createConnection: () => upstreamSocket,
        timeout: UPSTREAM_TIMEOUT_MS,
      });
    } catch (e) {
      try { upstreamSocket.end(); } catch (_) {}
      try { clientRes.writeHead(502); clientRes.end('Bad Gateway'); } catch (_) {}
      return;
    }

    let responded = false;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try { upstreamSocket.end(); } catch (_) {}
    };

    upstreamReq.on('response', (upstreamRes) => {
      responded = true;

      const respHeaders = {};
      for (const [k, v] of Object.entries(upstreamRes.headers)) {
        const lk = String(k).toLowerCase();
        if (HOP_BY_HOP.has(lk)) continue;
        if (lk === 'content-length') continue;    // let Node recompute
        if (lk === 'transfer-encoding') continue; // let Node re-chunk
        respHeaders[k] = v;
      }

      try {
        clientRes.writeHead(
          upstreamRes.statusCode || 502,
          upstreamRes.statusMessage || '',
          respHeaders
        );
      } catch (e) {
        try { upstreamRes.destroy(); } catch (_) {}
        try { clientRes.destroy(); } catch (_) {}
        cleanup();
        return;
      }

      upstreamRes.on('error', () => { try { clientRes.destroy(); } catch (_) {} cleanup(); });
      clientRes.on('error', () => { try { upstreamRes.destroy(); } catch (_) {} cleanup(); });
      clientRes.on('close', cleanup);
      upstreamRes.on('close', cleanup);

      upstreamRes.pipe(clientRes);
    });

    upstreamReq.on('timeout', () => {
      try { upstreamReq.destroy(new Error('bridge: upstream timeout')); } catch (_) {}
      cleanup();
    });

    upstreamReq.on('error', () => {
      if (!responded) {
        try { clientRes.writeHead(502); clientRes.end('Bad Gateway'); } catch (_) {}
      } else {
        try { clientRes.destroy(); } catch (_) {}
      }
      cleanup();
    });

    // 4) Send body (already buffered) and end
    try {
      if (bodyChunks.length > 0) {
        upstreamReq.write(Buffer.concat(bodyChunks));
      }
      upstreamReq.end();
    } catch (e) {
      cleanup();
      try { clientRes.destroy(); } catch (_) {}
    }
  });
}

// ── WebSocket / HTTP Upgrade over plain HTTP proxy ──
async function handleUpgrade(req, clientSocket, head) {
  if (!checkAuth(req)) {
    try {
      clientSocket.write(
        'HTTP/1.1 407 Proxy Authentication Required\r\n' +
        'Proxy-Authenticate: Basic realm="bridge"\r\n\r\n'
      );
    } catch (e) {}
    try { clientSocket.end(); } catch (e) {}
    return;
  }

  let targetUrl;
  try { targetUrl = new URL(req.url); }
  catch (e) {
    try { clientSocket.write('HTTP/1.1 400 Bad URL\r\n\r\n'); } catch (x) {}
    try { clientSocket.end(); } catch (x) {}
    return;
  }

  const upstreamSnapshot = currentUpstream;
  if (!upstreamSnapshot) {
    try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (e) {}
    try { clientSocket.end(); } catch (e) {}
    return;
  }

  const port = parseInt(
    targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    10
  );

  let upstreamSocket;
  try {
    ({ socket: upstreamSocket } = await SocksClient.createConnection({
      proxy: upstreamSnapshot,
      command: 'connect',
      destination: { host: targetUrl.hostname, port },
      timeout: UPSTREAM_TIMEOUT_MS,
    }));
  } catch (e) {
    try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch (x) {}
    try { clientSocket.end(); } catch (x) {}
    return;
  }

  // Rewrite request line from absolute-form → origin-form for upstream
  const fwdHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = String(k).toLowerCase();
    if (lk === 'proxy-connection' || lk === 'proxy-authorization') continue;
    fwdHeaders[k] = v;
  }
  fwdHeaders.host = targetUrl.host;

  let headerStr = `${req.method} ${targetUrl.pathname + targetUrl.search} HTTP/1.1\r\n`;
  for (const [k, v] of Object.entries(fwdHeaders)) {
    if (Array.isArray(v)) {
      for (const vv of v) headerStr += `${k}: ${vv}\r\n`;
    } else {
      headerStr += `${k}: ${v}\r\n`;
    }
  }
  headerStr += '\r\n';

  const pair = { client: clientSocket, upstream: upstreamSocket, lastActivity: Date.now() };
  activeTunnels.add(pair);
  const cleanup = makePairCleanup(pair);

  upstreamSocket.on('error', cleanup);
  clientSocket.on('error', cleanup);
  clientSocket.on('close', cleanup);
  upstreamSocket.on('close', cleanup);
  upstreamSocket.on('data', () => touchTunnel(pair));
  clientSocket.on('data', () => touchTunnel(pair));

  try {
    upstreamSocket.write(headerStr);
    if (head && head.length) upstreamSocket.write(head);
  } catch (e) {
    cleanup();
    return;
  }

  // After 101 Switching Protocols the connection is opaque — raw piping is correct.
  upstreamSocket.pipe(clientSocket);
  clientSocket.pipe(upstreamSocket);
}

// ═══════════════════════════════════════════════════════════════════
//  BRIDGE LIFECYCLE
// ═══════════════════════════════════════════════════════════════════
function startBridge(proxyEntry) {
  const upstream = buildUpstream(proxyEntry);
  if (!upstream) return Promise.reject(new Error('Bridge: invalid SOCKS5 proxy'));

  // Already running → just swap upstream (in-flight tunnels drain naturally)
  if (bridgeServer && bridgePort) {
    const old = currentUpstream;
    currentUpstream = upstream;
    if (!isSameUpstream(old, upstream)) {
      console.log(`🌉 Bridge upstream swapped → ${upstream.host}:${upstream.port}`);
    }
    return Promise.resolve({ server: bridgeServer, port: bridgePort });
  }

  // Starting in progress → await it, THEN apply our upstream (race-safe)
  if (bridgeStarting) {
    return bridgeStarting.then((res) => {
      const old = currentUpstream;
      currentUpstream = upstream;
      if (!isSameUpstream(old, upstream)) {
        console.log(`🌉 Bridge upstream swapped → ${upstream.host}:${upstream.port}`);
      }
      return res;
    });
  }

  currentUpstream = upstream;

  bridgeStarting = new Promise((resolve, reject) => {
    const server = http.createServer();
    server.keepAliveTimeout = 60000;
    server.headersTimeout = 65000;
    server.requestTimeout = 0;

    server.on('connect', (req, socket, head) => {
      handleConnect(req, socket, head).catch(() => {
        try { socket.end(); } catch (_) {}
      });
    });

    server.on('request', (req, res) => {
      try { handleHttpRequest(req, res); }
      catch (e) {
        try { res.writeHead(500); res.end('Internal Bridge Error'); } catch (_) {}
      }
    });

    server.on('upgrade', (req, socket, head) => {
      handleUpgrade(req, socket, head).catch(() => {
        try { socket.end(); } catch (_) {}
      });
    });

    server.on('clientError', (err, socket) => {
      try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (_) {}
    });

    server.on('error', (e) => reject(e));

    server.listen(0, '127.0.0.1', () => {
      bridgeServer = server;
      bridgePort = server.address().port;
      startPruneTimer();
      console.log(`🌉 Bridge → 127.0.0.1:${bridgePort} (upstream ${upstream.host}:${upstream.port})`);
      resolve({ server, port: bridgePort });
    });
  }).finally(() => {
    bridgeStarting = null;
  });

  return bridgeStarting;
}

// ═══════════════════════════════════════════════════════════════════
//  UPSTREAM UPDATE (idempotent)
// ═══════════════════════════════════════════════════════════════════
function updateUpstream(proxyEntry) {
  const upstream = buildUpstream(proxyEntry);
  if (!upstream) return;
  if (isSameUpstream(currentUpstream, upstream)) return; // no-op
  currentUpstream = upstream;
}

// ═══════════════════════════════════════════════════════════════════
//  PUBLIC HELPERS
// ═══════════════════════════════════════════════════════════════════
function getBridgeAddress() {
  if (!bridgePort) return null;
  return {
    server: `http://127.0.0.1:${bridgePort}`,
    username: BRIDGE_USER,
    password: BRIDGE_PASS,
    port: bridgePort,
  };
}

function getStats() {
  return {
    running: !!bridgePort,
    port: bridgePort,
    upstream: currentUpstream
      ? { host: currentUpstream.host, port: currentUpstream.port }
      : null,
    active_tunnels: activeTunnels.size,
    idle_timeout_ms: TUNNEL_IDLE_MS,
    upstream_timeout_ms: UPSTREAM_TIMEOUT_MS,
  };
}

function stopBridge() {
  closeAllTunnels();
  if (pruneTimer) { clearInterval(pruneTimer); pruneTimer = null; }
  if (bridgeServer) {
    try {
      if (typeof bridgeServer.closeAllConnections === 'function') {
        bridgeServer.closeAllConnections();
      }
      bridgeServer.close();
    } catch (e) {}
    bridgeServer = null;
    bridgePort = null;
  }
  bridgeStarting = null;
  currentUpstream = null;
}

// ═══════════════════════════════════════════════════════════════════
//  EXPORTS  (backward-compatible with bot.js)
// ═══════════════════════════════════════════════════════════════════
module.exports = {
  startBridge,
  updateUpstream,
  getBridgeAddress,
  stopBridge,
  buildUpstream,
  getStats,   // ← new
};