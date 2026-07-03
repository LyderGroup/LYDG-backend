/**
 * ============================================================================
 *  E2E RBAC — Module Academy (LMS)
 * ----------------------------------------------------------------------------
 *  Crée 10 utilisateurs Firebase + DB, chacun avec un NIVEAU de permissions
 *  différent, frappe les VRAIS endpoints Academy du backend (PermissionGuard
 *  réel) et vérifie pour chaque (user, endpoint) que la porte RBAC se comporte
 *  comme attendu : 403 quand la permission manque, non-403 quand elle est là.
 *
 *  Puis nettoie tout (users Firebase + rows core.users/roles/role_permissions/
 *  user_roles/login_history). Aucun résidu sauf si --keep.
 *
 *  Pré-requis : le backend doit tourner (npm run start:dev) sur BACKEND_URL.
 *
 *  Usage :
 *    node scripts/academy-e2e/test-academy-rbac.mjs            # setup → test → teardown
 *    node scripts/academy-e2e/test-academy-rbac.mjs --keep     # garde les 10 users (login UI manuel)
 *    node scripts/academy-e2e/test-academy-rbac.mjs --cleanup  # supprime les users E2E et sort
 *
 *  Variables d'env (lues depuis backend/.env, surchargeables) :
 *    BACKEND_URL           (défaut http://localhost:3000)
 *    ORG_CODE              (défaut LYDG-TG)
 *    FIREBASE_WEB_API_KEY  (défaut = clé web publique du projet)
 * ============================================================================
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../../.env');

// ---------------------------------------------------------------------------
// Config / env
// ---------------------------------------------------------------------------
function loadEnv(file) {
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
const env = loadEnv(ENV_PATH);

const BACKEND_URL = (process.env.BACKEND_URL || env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const ORG_CODE = process.env.ORG_CODE || env.ORG_CODE || 'LYDG-TG';
// Clé web Firebase = clé PUBLIQUE côté client (cf. docs/firebase.txt). Sert
// uniquement à échanger un custom token contre un ID token via Identity Toolkit.
const WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || env.FIREBASE_WEB_API_KEY || 'AIzaSyDS86GdGbx7f-4aRtcC3ViNGkF0zH9-Kq4';

const ARGS = new Set(process.argv.slice(2));
const KEEP = ARGS.has('--keep');
const CLEANUP_ONLY = ARGS.has('--cleanup');

const TEST_PASSWORD = 'E2eAcademy!2026';            // login UI manuel (mode --keep)
const UID_PREFIX = 'e2e-academy-';                   // uid Firebase déterministes
const ROLE_CODE_PREFIX = 'E2E_ACADEMY_';
const ROLE_NAME_PREFIX = '[E2E] Academy ';
const NIL_UUID = '00000000-0000-4000-8000-000000000000'; // id inexistant pour les probes :id

// ANSI (Windows Terminal OK)
const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const ok = (s) => `${c.green}${s}${c.reset}`;
const ko = (s) => `${c.red}${s}${c.reset}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 10 profils — gradient de niveaux d'accès Academy
// ---------------------------------------------------------------------------
const P = {
  COURSES_READ: 'academy.courses.read', COURSES_CREATE: 'academy.courses.create',
  COURSES_UPDATE: 'academy.courses.update', COURSES_PUBLISH: 'academy.courses.publish',
  COURSES_DELETE: 'academy.courses.delete',
  CAT_READ: 'academy.categories.read', CAT_CREATE: 'academy.categories.create',
  CAT_UPDATE: 'academy.categories.update', CAT_DELETE: 'academy.categories.delete',
  ENR_READ_OWN: 'academy.enrollments.read.own', ENR_READ: 'academy.enrollments.read',
  ENR_CREATE: 'academy.enrollments.create', ENR_UPDATE: 'academy.enrollments.update',
  ENR_MANAGE: 'academy.enrollments.manage',
  SES_READ: 'academy.sessions.read', SES_CREATE: 'academy.sessions.create',
  SES_UPDATE: 'academy.sessions.update', SES_DELETE: 'academy.sessions.delete',
  EXPORT: 'academy.export',
};
const ALL = Object.values(P);

const PROFILES = [
  { key: '01', slug: 'no-access',        label: 'Aucun accès',                perms: [] },
  { key: '02', slug: 'apprenant',        label: 'Apprenant (catalogue + mes formations)',
    perms: [P.ENR_READ_OWN, P.ENR_CREATE] },
  { key: '03', slug: 'lecteur-cours',    label: 'Lecteur cours seul',
    perms: [P.COURSES_READ] },
  { key: '04', slug: 'formateur',        label: 'Formateur (cours + sessions, sans delete)',
    perms: [P.COURSES_READ, P.COURSES_CREATE, P.COURSES_UPDATE, P.COURSES_PUBLISH,
            P.SES_READ, P.SES_CREATE, P.SES_UPDATE] },
  { key: '05', slug: 'gest-sessions',    label: 'Gestionnaire sessions (CRUD sessions)',
    perms: [P.COURSES_READ, P.SES_READ, P.SES_CREATE, P.SES_UPDATE, P.SES_DELETE] },
  { key: '06', slug: 'gest-inscriptions',label: 'Gestionnaire inscriptions (CRUD inscriptions)',
    perms: [P.COURSES_READ, P.SES_READ, P.ENR_READ_OWN, P.ENR_READ, P.ENR_CREATE, P.ENR_UPDATE, P.ENR_MANAGE] },
  { key: '07', slug: 'gest-categories',  label: 'Gestionnaire catégories (CRUD catégories)',
    perms: [P.COURSES_READ, P.CAT_READ, P.CAT_CREATE, P.CAT_UPDATE, P.CAT_DELETE] },
  { key: '08', slug: 'lecteur-global',   label: 'Lecteur global (read-only tous onglets)',
    perms: [P.COURSES_READ, P.SES_READ, P.ENR_READ, P.CAT_READ, P.ENR_READ_OWN] },
  { key: '09', slug: 'admin-no-delete',  label: 'Admin Academy (tout sauf delete)',
    perms: ALL.filter((p) => ![P.COURSES_DELETE, P.SES_DELETE, P.CAT_DELETE, P.ENR_MANAGE].includes(p)) },
  { key: '10', slug: 'super-academy',    label: 'Super Academy (toutes permissions)',
    perms: [...ALL] },
];

// ---------------------------------------------------------------------------
// Probes : (endpoint, permission requise, groupe/lettre pour la matrice)
// ---------------------------------------------------------------------------
const PROBES = [
  { name: 'catalog.courses',   method: 'GET',    path: `/core/academy/catalog/courses?limit=1`,  perm: P.COURSES_READ, grp: 'Catalog', ltr: 'c' },
  { name: 'catalog.sessions',  method: 'GET',    path: `/core/academy/catalog/sessions?limit=1`, perm: P.COURSES_READ, grp: 'Catalog', ltr: 's' },
  { name: 'courses.list',      method: 'GET',    path: `/core/academy/courses?limit=1`,          perm: P.COURSES_READ, grp: 'Cours', ltr: 'R' },
  { name: 'courses.create',    method: 'POST',   path: `/core/academy/courses`,                  perm: P.COURSES_CREATE, grp: 'Cours', ltr: 'C', body: {} },
  { name: 'courses.update',    method: 'PATCH',  path: `/core/academy/courses/${NIL_UUID}`,      perm: P.COURSES_UPDATE, grp: 'Cours', ltr: 'U', body: {} },
  { name: 'courses.publish',   method: 'POST',   path: `/core/academy/courses/${NIL_UUID}/publish`, perm: P.COURSES_PUBLISH, grp: 'Cours', ltr: 'P', body: {} },
  { name: 'courses.delete',    method: 'DELETE', path: `/core/academy/courses/${NIL_UUID}`,      perm: P.COURSES_DELETE, grp: 'Cours', ltr: 'D' },
  { name: 'sessions.list',     method: 'GET',    path: `/core/academy/sessions?limit=1`,         perm: P.SES_READ, grp: 'Sessions', ltr: 'R' },
  { name: 'sessions.create',   method: 'POST',   path: `/core/academy/sessions`,                 perm: P.SES_CREATE, grp: 'Sessions', ltr: 'C', body: {} },
  { name: 'sessions.update',   method: 'PATCH',  path: `/core/academy/sessions/${NIL_UUID}`,     perm: P.SES_UPDATE, grp: 'Sessions', ltr: 'U', body: {} },
  { name: 'sessions.delete',   method: 'DELETE', path: `/core/academy/sessions/${NIL_UUID}`,     perm: P.SES_DELETE, grp: 'Sessions', ltr: 'D' },
  { name: 'categories.list',   method: 'GET',    path: `/core/academy/categories`,               perm: P.CAT_READ, grp: 'Catégories', ltr: 'R' },
  { name: 'categories.create', method: 'POST',   path: `/core/academy/categories`,               perm: P.CAT_CREATE, grp: 'Catégories', ltr: 'C', body: {} },
  { name: 'categories.update', method: 'PATCH',  path: `/core/academy/categories/${NIL_UUID}`,   perm: P.CAT_UPDATE, grp: 'Catégories', ltr: 'U', body: {} },
  { name: 'categories.delete', method: 'DELETE', path: `/core/academy/categories/${NIL_UUID}`,   perm: P.CAT_DELETE, grp: 'Catégories', ltr: 'D' },
  { name: 'enroll.list',       method: 'GET',    path: `/core/academy/enrollments?limit=1`,      perm: P.ENR_READ, grp: 'Inscriptions', ltr: 'R' },
  { name: 'enroll.create',     method: 'POST',   path: `/core/academy/enrollments`,              perm: P.ENR_CREATE, grp: 'Inscriptions', ltr: 'C', body: {} },
  { name: 'enroll.update',     method: 'PATCH',  path: `/core/academy/enrollments/${NIL_UUID}`,  perm: P.ENR_UPDATE, grp: 'Inscriptions', ltr: 'U', body: {} },
  { name: 'enroll.delete',     method: 'DELETE', path: `/core/academy/enrollments/${NIL_UUID}`,  perm: P.ENR_MANAGE, grp: 'Inscriptions', ltr: 'D' },
  { name: 'my.enrollments',    method: 'GET',    path: `/core/academy/my/enrollments`,           perm: P.ENR_READ_OWN, grp: 'Mes', ltr: 'R' },
  { name: 'my.enroll',         method: 'POST',   path: `/core/academy/my/enrollments`,           perm: P.ENR_CREATE, grp: 'Mes', ltr: 'C', body: {} },
];
const GROUPS = ['Catalog', 'Cours', 'Sessions', 'Catégories', 'Inscriptions', 'Mes'];

// ---------------------------------------------------------------------------
// Infra : DB pool + Firebase
// ---------------------------------------------------------------------------
function makePool() {
  const ssl = /true|require/i.test(env.DB_SSL || '') ? { rejectUnauthorized: false } : undefined;
  return env.DATABASE_URL
    ? new pg.Pool({ connectionString: env.DATABASE_URL, ssl })
    : new pg.Pool({ host: env.DB_HOST, port: Number(env.DB_PORT || 5432), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, ssl });
}
function initFirebase() {
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

async function mintIdToken(auth, uid) {
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`signInWithCustomToken ${res.status}: ${JSON.stringify(data)}`);
  return data.idToken;
}

// ---------------------------------------------------------------------------
// Cleanup (pré-nettoyage idempotent + teardown)
// ---------------------------------------------------------------------------
async function cleanupDb(pool, orgId) {
  const uids = PROFILES.map((p) => UID_PREFIX + p.key);
  // login_history → user_roles → users (par external_id), puis role_permissions → roles (par code)
  await pool.query(`DELETE FROM core.login_history WHERE user_id IN (SELECT id FROM core.users WHERE external_id = ANY($1))`, [uids]);
  await pool.query(`DELETE FROM core.user_roles WHERE user_id IN (SELECT id FROM core.users WHERE external_id = ANY($1))`, [uids]);
  await pool.query(`DELETE FROM core.users WHERE external_id = ANY($1)`, [uids]);
  await pool.query(
    `DELETE FROM core.role_permissions WHERE role_id IN (SELECT id FROM core.roles WHERE organization_id = $1 AND code LIKE $2)`,
    [orgId, ROLE_CODE_PREFIX + '%']);
  await pool.query(`DELETE FROM core.user_roles WHERE role_id IN (SELECT id FROM core.roles WHERE organization_id = $1 AND code LIKE $2)`, [orgId, ROLE_CODE_PREFIX + '%']);
  await pool.query(`DELETE FROM core.roles WHERE organization_id = $1 AND code LIKE $2`, [orgId, ROLE_CODE_PREFIX + '%']);
}
async function cleanupFirebase(auth) {
  for (const p of PROFILES) {
    try { await auth.deleteUser(UID_PREFIX + p.key); } catch { /* n'existe pas */ }
  }
}

// ---------------------------------------------------------------------------
// Setup : crée roles + permissions + users + tokens
// ---------------------------------------------------------------------------
async function setup(pool, auth, orgId) {
  // map code permission → id
  const permRows = await pool.query(`SELECT id, code FROM core.permissions WHERE code = ANY($1)`, [ALL]);
  const permId = new Map(permRows.rows.map((r) => [r.code, r.id]));
  const missing = ALL.filter((code) => !permId.has(code));
  if (missing.length) {
    throw new Error(`Permissions absentes en DB (lance les seeds Academy) : ${missing.join(', ')}`);
  }

  const built = [];
  for (const prof of PROFILES) {
    const uid = UID_PREFIX + prof.key;
    const email = `e2e.academy.${prof.key}@lyd-test.local`;

    // 1) role
    const roleRes = await pool.query(
      `INSERT INTO core.roles (id, organization_id, name, code, description, role_level, is_default, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 1, false, true) RETURNING id`,
      [orgId, ROLE_NAME_PREFIX + prof.slug, ROLE_CODE_PREFIX + prof.key, prof.label]);
    const roleId = roleRes.rows[0].id;

    // 2) role_permissions
    for (const code of prof.perms) {
      await pool.query(
        `INSERT INTO core.role_permissions (id, role_id, permission_id, granted_at)
         VALUES (gen_random_uuid(), $1, $2, NOW())`,
        [roleId, permId.get(code)]);
    }

    // 3) Firebase user (uid déterministe, recréé proprement)
    try { await auth.deleteUser(uid); } catch { /* absent */ }
    await auth.createUser({ uid, email, emailVerified: true, password: TEST_PASSWORD, displayName: `E2E ${prof.slug}` });

    // 4) core.users (password_hash NOT NULL en DB → placeholder, auth réelle via Firebase external_id)
    const userRes = await pool.query(
      `INSERT INTO core.users (id, organization_id, email, password_hash, first_name, last_name,
                               external_id, is_active, email_verified, language, metadata)
       VALUES (gen_random_uuid(), $1, $2, 'firebase-external-no-local-pw', 'E2E', $3, $4, true, true, 'fr', '{}'::jsonb)
       RETURNING id`,
      [orgId, email, prof.slug, uid]);
    const userId = userRes.rows[0].id;

    // 5) user_roles
    await pool.query(
      `INSERT INTO core.user_roles (id, user_id, role_id, is_active, assigned_at)
       VALUES (gen_random_uuid(), $1, $2, true, NOW())`,
      [userId, roleId]);

    // 6) ID token
    const token = await mintIdToken(auth, uid);

    built.push({ ...prof, uid, email, userId, roleId, token, permsSet: new Set(prof.perms) });
    process.stdout.write(`${c.dim}  · ${prof.key} ${prof.slug.padEnd(20)} role+${prof.perms.length}perm+user+token OK${c.reset}\n`);
  }
  return built;
}

// ---------------------------------------------------------------------------
// Exécution des probes
// ---------------------------------------------------------------------------
async function probe(token, p) {
  const url = BACKEND_URL + p.path;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: p.method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Organization-Code': ORG_CODE,
          ...(p.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: p.body !== undefined ? JSON.stringify(p.body) : undefined,
      });
    } catch (e) {
      throw new Error(`Connexion ${url} échouée : ${e.message}. Le backend tourne-t-il sur ${BACKEND_URL} ?`);
    }
    if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; } // throttler → backoff
    return res.status;
  }
  return 429;
}

function classify(status) {
  if (status === 403) return 'DENIED';
  if (status === 401) return 'AUTH';
  if (status === 429) return 'RATE';
  return 'ALLOWED';
}

async function runTests(users) {
  const results = []; // {user, probe, status, got, expected, pass}
  for (const u of users) {
    for (const p of PROBES) {
      const status = await probe(u.token, p);
      const got = classify(status);
      const expected = u.permsSet.has(p.perm) ? 'ALLOWED' : 'DENIED';
      const pass = got === expected || (got === 'ALLOWED' && expected === 'ALLOWED');
      results.push({ user: u, probe: p, status, got, expected, pass: got === 'RATE' ? null : got === expected });
      await sleep(280); // reste sous le throttler (medium 200/min)
    }
    process.stdout.write(`${c.gray}  · testé ${u.key} ${u.slug}${c.reset}\n`);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------
function report(users, results) {
  console.log(`\n${c.bold}${c.cyan}━━━ MATRICE DES CAPACITÉS (vérifiée contre le backend réel) ━━━${c.reset}\n`);
  // En-tête : groupes
  const head = 'Profil'.padEnd(26) + GROUPS.map((g) => g.slice(0, 12).padEnd(13)).join('');
  console.log(c.bold + head + c.reset);
  console.log(c.gray + ''.padEnd(26 + GROUPS.length * 13, '─') + c.reset);

  for (const u of users) {
    const cells = GROUPS.map((g) => {
      const letters = PROBES.filter((p) => p.grp === g).map((p) => {
        const r = results.find((x) => x.user === u && x.probe === p);
        return r && r.got === 'ALLOWED' ? p.ltr : '·';
      }).join('');
      return letters.padEnd(13);
    }).join('');
    console.log(`${u.key} ${u.slug.padEnd(23)}${cells}`);
  }
  console.log(`\n${c.gray}Légende — Catalog: c=cours s=sessions · Cours/Sessions/Catégories/Inscriptions: R=read C=create U=update D=delete P=publish · Mes: R=read.own C=enroll${c.reset}`);

  // Conformité RBAC
  console.log(`\n${c.bold}${c.cyan}━━━ CONFORMITÉ RBAC (attendu vs obtenu) ━━━${c.reset}\n`);
  let pass = 0, fail = 0, rate = 0;
  const fails = [];
  for (const r of results) {
    if (r.pass === null) { rate++; continue; }
    if (r.pass) pass++; else { fail++; fails.push(r); }
  }
  for (const u of users) {
    const uFails = fails.filter((f) => f.user === u);
    const uRate = results.filter((x) => x.user === u && x.got === 'RATE').length;
    const line = `${u.key} ${u.slug.padEnd(23)} ${u.permsSet.size} perm`;
    if (uFails.length === 0 && uRate === 0) console.log(`${ok('✓')} ${line} — ${ok('toutes les portes OK')}`);
    else {
      console.log(`${ko('✗')} ${line} — ${ko(uFails.length + ' écart(s)')}${uRate ? c.yellow + ' ' + uRate + ' rate-limited' + c.reset : ''}`);
      for (const f of uFails) {
        console.log(`     ${ko('•')} ${f.probe.name.padEnd(20)} requiert ${c.dim}${f.probe.perm}${c.reset} → attendu ${f.expected}, obtenu ${ko(f.got)} (HTTP ${f.status})`);
      }
    }
  }

  console.log(`\n${c.bold}━━━ RÉSUMÉ ━━━${c.reset}`);
  console.log(`  ${ok(pass + ' PASS')}   ${fail ? ko(fail + ' FAIL') : c.dim + '0 FAIL' + c.reset}   ${rate ? c.yellow + rate + ' rate-limited (relance)' + c.reset : ''}`);
  console.log(`  ${users.length} profils × ${PROBES.length} endpoints = ${users.length * PROBES.length} vérifications`);
  return fail === 0 && rate === 0;
}

function printCredentials(users) {
  console.log(`\n${c.bold}${c.yellow}━━━ COMPTES CONSERVÉS (--keep) — login UI manuel ━━━${c.reset}`);
  console.log(`  ${c.dim}Org (X-Organization-Code / code société): ${c.reset}${ORG_CODE}`);
  console.log(`  ${c.dim}Mot de passe (tous): ${c.reset}${TEST_PASSWORD}\n`);
  for (const u of users) {
    console.log(`  ${u.email.padEnd(34)} ${c.gray}${u.label}${c.reset}`);
  }
  console.log(`\n  ${c.dim}Pour tout supprimer ensuite : node scripts/academy-e2e/test-academy-rbac.mjs --cleanup${c.reset}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const pool = makePool();
  const auth = initFirebase();

  // Résolution org
  const orgRes = await pool.query(`SELECT id, name_code FROM core.organizations WHERE UPPER(name_code) = UPPER($1)`, [ORG_CODE]);
  if (!orgRes.rows[0]) throw new Error(`Organisation introuvable pour code "${ORG_CODE}"`);
  const orgId = orgRes.rows[0].id;
  console.log(`${c.bold}Academy RBAC E2E${c.reset}  backend=${BACKEND_URL}  org=${ORG_CODE} (${orgId.slice(0, 8)}…)`);

  if (CLEANUP_ONLY) {
    console.log('\nNettoyage des comptes E2E…');
    await cleanupDb(pool, orgId);
    await cleanupFirebase(auth);
    console.log(ok('  Comptes E2E supprimés (DB + Firebase).'));
    await pool.end();
    return;
  }

  let success = false;
  let users = [];
  try {
    console.log('\n1) Pré-nettoyage (idempotence)…');
    await cleanupDb(pool, orgId);

    console.log('2) Création des 10 profils (roles + permissions + users Firebase + tokens)…');
    users = await setup(pool, auth, orgId);

    console.log('\n3) Exécution des probes RBAC sur les endpoints Academy…');
    const results = await runTests(users);

    success = report(users, results);
  } finally {
    if (KEEP) {
      printCredentials(users);
      console.log(`\n${c.yellow}--keep : les 10 comptes sont CONSERVÉS (DB + Firebase).${c.reset}`);
    } else {
      console.log('\n4) Teardown (suppression des 10 comptes)…');
      await cleanupDb(pool, orgId);
      await cleanupFirebase(auth);
      console.log(ok('  Tout supprimé — aucun résidu.'));
    }
    await pool.end();
  }

  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n${c.red}ERREUR:${c.reset} ${e.message}`);
  process.exit(2);
});
