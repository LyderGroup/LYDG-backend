/**
 * ============================================================================
 *  Socle commun des E2E RBAC multi-modules.
 * ----------------------------------------------------------------------------
 *  Reprend la mécanique éprouvée de scripts/academy-e2e/test-academy-rbac.mjs
 *  (users Firebase jetables + rôles DB + ID tokens réels), généralisée aux 6
 *  modules et pilotée par la carte de routes extraite du code compilé.
 *
 *  Aucun mot de passe utilisateur réel n'est nécessaire : on mint des custom
 *  tokens via le compte de service Firebase déjà présent dans backend/.env.
 * ============================================================================
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ENV_PATH = path.resolve(__dirname, '../../.env');

export function loadEnv(file = ENV_PATH) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export const env = loadEnv();
export const BACKEND_URL = (process.env.BACKEND_URL || env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
export const WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY ||
  env.FIREBASE_WEB_API_KEY ||
  // Clé web PUBLIQUE du projet (elle part déjà dans le bundle frontend).
  'AIzaSyDS86GdGbx7f-4aRtcC3ViNGkF0zH9-Kq4';

export const UID_PREFIX = 'e2e-rbac-';
export const ROLE_CODE_PREFIX = 'E2E_RBAC_';
export const NIL_UUID = '00000000-0000-4000-8000-000000000000';

export const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m', mag: '\x1b[35m',
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Infra
// ---------------------------------------------------------------------------
export function makePool() {
  const ssl = /true|require/i.test(env.DB_SSL || '') ? { rejectUnauthorized: false } : undefined;
  return env.DATABASE_URL
    ? new pg.Pool({ connectionString: env.DATABASE_URL, ssl })
    : new pg.Pool({
        host: env.DB_HOST, port: Number(env.DB_PORT || 5432),
        user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, ssl,
      });
}

export function initFirebase() {
  if (admin.apps.length) return admin.auth();
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
  return admin.auth();
}

export async function mintIdToken(auth, uid) {
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`signInWithCustomToken ${res.status}: ${JSON.stringify(data)}`);
  return data.idToken;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
export async function cleanup(pool, auth, profiles) {
  const uids = profiles.map((p) => UID_PREFIX + p.key);
  await pool.query(`DELETE FROM core.login_history WHERE user_id IN (SELECT id FROM core.users WHERE external_id = ANY($1))`, [uids]);
  await pool.query(`DELETE FROM core.user_roles WHERE user_id IN (SELECT id FROM core.users WHERE external_id = ANY($1))`, [uids]);
  await pool.query(`DELETE FROM core.users WHERE external_id = ANY($1)`, [uids]);
  await pool.query(`DELETE FROM core.role_permissions WHERE role_id IN (SELECT id FROM core.roles WHERE code LIKE $1)`, [ROLE_CODE_PREFIX + '%']);
  await pool.query(`DELETE FROM core.user_roles WHERE role_id IN (SELECT id FROM core.roles WHERE code LIKE $1)`, [ROLE_CODE_PREFIX + '%']);
  await pool.query(`DELETE FROM core.roles WHERE code LIKE $1`, [ROLE_CODE_PREFIX + '%']);
  for (const p of profiles) {
    try { await auth.deleteUser(UID_PREFIX + p.key); } catch { /* absent */ }
  }
}

/** Crée rôle + permissions + user Firebase + user DB + token, par profil. */
export async function setupProfiles(pool, auth, profiles, orgIdByCode) {
  const allCodes = [...new Set(profiles.flatMap((p) => p.perms))];
  const permRows = await pool.query(`SELECT id, code FROM core.permissions WHERE code = ANY($1)`, [allCodes]);
  const permId = new Map(permRows.rows.map((r) => [r.code, r.id]));
  const missing = allCodes.filter((code) => !permId.has(code));

  const built = [];
  for (const prof of profiles) {
    const uid = UID_PREFIX + prof.key;
    const email = `e2e.rbac.${prof.key}@lyd-test.local`;
    const orgId = orgIdByCode.get(prof.org);
    if (!orgId) throw new Error(`Organisation inconnue : ${prof.org}`);

    const roleRes = await pool.query(
      `INSERT INTO core.roles (id, organization_id, name, code, description, role_level, is_default, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 1, false, true) RETURNING id`,
      [orgId, `[E2E] ${prof.key}`, ROLE_CODE_PREFIX + prof.key.toUpperCase(), prof.label],
    );
    const roleId = roleRes.rows[0].id;

    for (const code of prof.perms) {
      const pid = permId.get(code);
      if (!pid) continue;
      await pool.query(
        `INSERT INTO core.role_permissions (id, role_id, permission_id, granted_at)
         VALUES (gen_random_uuid(), $1, $2, NOW())`,
        [roleId, pid],
      );
    }

    try { await auth.deleteUser(uid); } catch { /* absent */ }
    await auth.createUser({ uid, email, emailVerified: true, displayName: `E2E ${prof.key}` });

    const userRes = await pool.query(
      `INSERT INTO core.users (id, organization_id, email, password_hash, first_name, last_name,
                               external_id, is_active, email_verified, language, metadata)
       VALUES (gen_random_uuid(), $1, $2, 'firebase-external-no-local-pw', 'E2E', $3, $4, true, true, 'fr', '{}'::jsonb)
       RETURNING id`,
      [orgId, email, prof.key, uid],
    );
    const userId = userRes.rows[0].id;

    await pool.query(
      `INSERT INTO core.user_roles (id, user_id, role_id, is_active, assigned_at)
       VALUES (gen_random_uuid(), $1, $2, true, NOW())`,
      [userId, roleId],
    );

    const token = await mintIdToken(auth, uid);
    built.push({ ...prof, uid, email, userId, roleId, token, permsSet: new Set(prof.perms) });
  }
  return { users: built, missingPermissions: missing };
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------
/** Renvoie {status, body} ; gère le backoff sur 429 (throttler). */
export async function call(token, { method, path: p, body, orgCode }) {
  const url = BACKEND_URL + p;
  for (let attempt = 0; attempt < 5; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgCode ? { 'X-Organization-Code': orgCode } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error(`Connexion ${url} échouée : ${e.message}. Backend up sur ${BACKEND_URL} ?`);
    }
    if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    let parsed = null;
    const text = await res.text();
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text ? { raw: text.slice(0, 300) } : null; }
    return { status: res.status, body: parsed };
  }
  return { status: 429, body: null };
}

/** ALLOWED = tout sauf 403/401. Un 404/400 prouve que la porte RBAC s'est ouverte. */
export function classify(status) {
  if (status === 403) return 'DENIED';
  if (status === 401) return 'AUTH';
  if (status === 429) return 'RATE';
  return 'ALLOWED';
}
