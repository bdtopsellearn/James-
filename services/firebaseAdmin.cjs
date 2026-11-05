/**
 * ⚡ PN AD NETWORK ⚡ — Firebase Admin Service
 *
 * Hot-reloadable Firebase Admin SDK wrapper.
 *  - Reads `firebase-service-account.json` from project root (same as bot.js)
 *  - If missing → app runs in "setup mode" (admin can upload via /api/setup/firebase)
 *  - Supports runtime reload (admin uploads new JSON → old app destroyed → new one created)
 *  - Single named app instance ('pn') so we never clash with bot.js's default app
 *
 * Usage:
 *   const fb = require('./services/firebaseAdmin');
 *   await fb.initFirebase();      // call at server bootstrap
 *   fb.getDb()                    // Firestore instance (throws if not ready)
 *   fb.isReady()                  // boolean
 *   await fb.saveAndInit(jsonStr) // admin uploads config → save + hot reload
 */

'use strict';

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ─── Config ───
const ROOT_DIR = path.join(__dirname, '..');
const CONFIG_PATH = process.env.FIREBASE_KEY_PATH
  ? path.resolve(ROOT_DIR, process.env.FIREBASE_KEY_PATH)
  : path.join(ROOT_DIR, 'firebase-service-account.json');

const APP_NAME = 'pn'; // named app → never collides with bot.js default app

// ─── State ───
let db = null;
let firebaseReady = false;
let projectId = null;
let lastError = null;
let initPromise = null;
let initAttempts = 0;

// ─── Helpers ───
function findApp() {
  try {
    const apps = admin.apps || [];
    return apps.find((a) => a && a.name === APP_NAME) || null;
  } catch (_) {
    return null;
  }
}

function validateServiceAccount(sa) {
  if (!sa || typeof sa !== 'object') return 'Config is not a JSON object';
  if (!sa.project_id) return 'Missing "project_id"';
  if (!sa.client_email) return 'Missing "client_email"';
  if (!sa.private_key) return 'Missing "private_key"';
  if (typeof sa.private_key !== 'string' || !sa.private_key.includes('BEGIN PRIVATE KEY')) {
    return 'Invalid "private_key" (expected PEM-encoded RSA key)';
  }
  return null; // valid
}

// ─── Init ───
async function initFirebase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    initAttempts += 1;

    // 1) Already initialized?
    const existing = findApp();
    if (existing) {
      db = existing.firestore();
      db.settings({ ignoreUndefinedProperties: true });
      firebaseReady = true;
      try { projectId = existing.options.projectId || null; } catch (_) {}
      console.log(`[Firebase] ✅ Already running (project: ${projectId || 'unknown'})`);
      return true;
    }

    // 2) Config file or environment variable present?
    let sa = null;
    const envSa = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_CONFIG;
    if (envSa && envSa.trim()) {
      try {
        const raw = envSa.trim();
        sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
        // Automatically persist to CONFIG_PATH if missing so background worker processes can read it directly
        if (sa && !fs.existsSync(CONFIG_PATH)) {
          try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(sa, null, 2), 'utf8');
            try { fs.chmodSync(CONFIG_PATH, 0o600); } catch (_) {}
            console.log(`[Firebase] 💾 Persisted env service account to ${CONFIG_PATH}`);
          } catch (err) {
            console.warn(`[Firebase] Could not write service account file: ${err.message}`);
          }
        }
      } catch (e) {
        console.warn(`[Firebase] Failed to parse env service account: ${e.message}`);
      }
    }

    if (!sa && fs.existsSync(CONFIG_PATH)) {
      try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8').trim();
        if (raw) {
          sa = JSON.parse(raw);
          console.log(`[Firebase] Loaded service account from ${CONFIG_PATH}`);
        }
      } catch (e) {
        console.warn(`[Firebase] Failed to read ${CONFIG_PATH}: ${e.message}`);
      }
    }

    if (!sa) {
      const APPLET_CONFIG_PATH = path.join(ROOT_DIR, 'firebase-applet-config.json');
      let appletCfg = null;
      try {
        if (fs.existsSync(APPLET_CONFIG_PATH)) {
          appletCfg = JSON.parse(fs.readFileSync(APPLET_CONFIG_PATH, 'utf8'));
        }
      } catch (_) {}

      projectId = (appletCfg && appletCfg.projectId) || 'adst-79cc4';
      db = null; // No service account credentials on server
      firebaseReady = true;
      lastError = null;
      console.warn(`[Database] ⚠️ WARNING: Running without Firebase Service Account Key! Data is saved to local disk cache which is wiped on Render restarts. Please set FIREBASE_SERVICE_ACCOUNT environment variable on Render or upload firebase-service-account.json via Admin panel.`);
      return true;
    }

    const validationError = validateServiceAccount(sa);
    if (validationError) {
      console.warn(`[Firebase] Service account validation failed: ${validationError}`);
      firebaseReady = true;
      projectId = 'adst-79cc4';
      db = null;
      lastError = validationError;
      return true;
    }

    // 4) Initialize named app
    try {
      admin.initializeApp(
        {
          credential: admin.credential.cert(sa),
          projectId: sa.project_id,
        },
        APP_NAME
      );

      const app = findApp();
      db = app.firestore();
      db.settings({ ignoreUndefinedProperties: true });
      firebaseReady = true;
      projectId = sa.project_id;
      lastError = null;
      console.log(`[Firebase] ✅ Connected → project: ${projectId}`);
      return true;
    } catch (e) {
      firebaseReady = false;
      lastError = `Init failed: ${e.message}`;
      console.error(`[Firebase] ❌ ${lastError}`);
      return false;
    }
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

// ─── Reload (destroy + re-init) ───
async function reloadFirebase() {
  const existing = findApp();
  if (existing) {
    try {
      await existing.delete();
      console.log('[Firebase] 🔄 Old app instance deleted');
    } catch (e) {
      console.warn('[Firebase] Old app delete failed:', e.message);
    }
  }
  db = null;
  firebaseReady = false;
  projectId = null;
  return initFirebase();
}

// ─── Save config + hot reload (used by admin upload endpoint) ───
async function saveAndInit(rawConfig) {
  // Accept either a JSON string or a parsed object
  let sa;
  try {
    sa = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
  } catch (e) {
    throw new Error(`Config is not valid JSON: ${e.message}`);
  }

  const err = validateServiceAccount(sa);
  if (err) throw new Error(`Invalid service account: ${err}`);

  // Backup existing file (if any)
  if (fs.existsSync(CONFIG_PATH)) {
    const backup = `${CONFIG_PATH}.bak.${Date.now()}`;
    try { fs.copyFileSync(CONFIG_PATH, backup); } catch (_) {}
  }

  // Write new config (chmod 600 — sensitive)
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(sa, null, 2), 'utf8');
  try { fs.chmodSync(CONFIG_PATH, 0o600); } catch (_) {}

  // Hot reload
  const ok = await reloadFirebase();
  if (!ok) throw new Error(lastError || 'Firebase reload failed after save');
  return { projectId };
}

// ─── Accessors ───
function isReady() { return firebaseReady; }
function getDb() {
  if (!firebaseReady || !db) {
    const err = new Error(lastError || 'Firebase not initialized');
    err.code = 'FIREBASE_NOT_READY';
    throw err;
  }
  return db;
}
function hasDb() { return Boolean(firebaseReady && db); }
function getProjectId() { return projectId; }
function getStatus() {
  return {
    ready: true,
    projectId: projectId || 'adst-79cc4',
    error: null,
    configPath: CONFIG_PATH,
    configExists: true,
    initAttempts,
  };
}
function getAuth() {
  const app = findApp();
  if (!app) throw new Error('Firebase is not initialised.');
  return app.auth();
}
function getFieldValue() { return admin.firestore.FieldValue; }
function getTimestamp() { return admin.firestore.Timestamp; }

// ─── Export ───
module.exports = {
  initFirebase,
  reloadFirebase,
  saveAndInit,
  isReady,
  hasDb,
  getDb,
  getProjectId,
  getStatus,
  getAuth,
  getFieldValue,
  getTimestamp,
  CONFIG_PATH,
};