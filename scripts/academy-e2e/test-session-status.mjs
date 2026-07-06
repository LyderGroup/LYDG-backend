/**
 * ============================================================================
 *  Test fonctionnel — statut de session DÉRIVÉ des dates
 * ----------------------------------------------------------------------------
 *  Crée un user "super-academy" éphémère, puis vérifie via les vrais endpoints :
 *    - dates futures            → status 'planned'   + visible au catalogue
 *    - début passé, fin future  → status 'in_progress' + visible au catalogue
 *    - fin passée               → status 'completed'  + ABSENT du catalogue
 *    - annulation manuelle      → status 'cancelled'  + ABSENT du catalogue
 *    - auto-inscription sur une session 'in_progress' → AUTORISÉE (régression
 *      de l'ancien gate ['planned','open']).
 *
 *  Nettoie tout (sessions/inscriptions créées + user/role/firebase).
 *
 *  Usage : node scripts/academy-e2e/test-session-status.mjs
 * ============================================================================
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv(path.resolve(__dirname, '../../.env'));
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

const BACKEND_URL = (process.env.BACKEND_URL || env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const ORG_CODE = process.env.ORG_CODE || env.ORG_CODE || 'LYDG-TG';
const WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || env.FIREBASE_WEB_API_KEY;
const UID = 'e2e-session-status';
const ROLE_CODE = 'E2E_SESSION_STATUS';
const ACADEMY_PERMS = [
  'academy.courses.read', 'academy.courses.create', 'academy.courses.update', 'academy.courses.publish', 'academy.courses.delete',
  'academy.categories.read', 'academy.categories.create', 'academy.categories.update', 'academy.categories.delete',
  'academy.enrollments.read.own', 'academy.enrollments.read', 'academy.enrollments.create', 'academy.enrollments.update', 'academy.enrollments.manage',
  'academy.sessions.read', 'academy.sessions.create', 'academy.sessions.update', 'academy.sessions.delete', 'academy.export',
];

const c = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', cyan: '\x1b[36m' };
const ok = (s) => `${c.green}${s}${c.reset}`;
const ko = (s) => `${c.red}${s}${c.reset}`;

function makePool() {
  const ssl = /true|require/i.test(env.DB_SSL || '') ? { rejectUnauthorized: false } : undefined;
  return env.DATABASE_URL
    ? new pg.Pool({ connectionString: env.DATABASE_URL, ssl })
    : new pg.Pool({ host: env.DB_HOST, port: Number(env.DB_PORT || 5432), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, ssl });
}
function initFirebase() {
  if (!admin.apps.length) admin.initializeApp({
    credential: admin.credential.cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n') }),
  });
  return admin.auth();
}
async function mintIdToken(auth, uid) {
  const t = await auth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`signIn ${res.status}: ${JSON.stringify(data)}`);
  return data.idToken;
}
function dayOffset(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let TOKEN = '';
async function api(method, p, body) {
  const res = await fetch(BACKEND_URL + p, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'X-Organization-Code': ORG_CODE, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: res.status, json };
}

const pool = makePool();
const auth = initFirebase();
const createdSessions = [];
const createdEnrollments = [];
let pass = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ${ok('✓')} ${label}`); }
  else { fail++; console.log(`  ${ko('✗')} ${label} ${c.dim}${detail}${c.reset}`); }
}

async function cleanup(orgId) {
  if (createdEnrollments.length)
    await pool.query(`DELETE FROM module_e_academy.course_enrollments WHERE id = ANY($1)`, [createdEnrollments]);
  if (createdSessions.length)
    await pool.query(`DELETE FROM module_e_academy.course_sessions WHERE id = ANY($1)`, [createdSessions]);
  await pool.query(`DELETE FROM core.login_history WHERE user_id IN (SELECT id FROM core.users WHERE external_id = $1)`, [UID]);
  await pool.query(`DELETE FROM core.user_roles WHERE user_id IN (SELECT id FROM core.users WHERE external_id = $1)`, [UID]);
  await pool.query(`DELETE FROM core.users WHERE external_id = $1`, [UID]);
  await pool.query(`DELETE FROM core.role_permissions WHERE role_id IN (SELECT id FROM core.roles WHERE organization_id = $1 AND code = $2)`, [orgId, ROLE_CODE]);
  await pool.query(`DELETE FROM core.user_roles WHERE role_id IN (SELECT id FROM core.roles WHERE organization_id = $1 AND code = $2)`, [orgId, ROLE_CODE]);
  await pool.query(`DELETE FROM core.roles WHERE organization_id = $1 AND code = $2`, [orgId, ROLE_CODE]);
  try { await auth.deleteUser(UID); } catch { /* */ }
}

async function main() {
  const org = await pool.query(`SELECT id FROM core.organizations WHERE UPPER(name_code) = UPPER($1)`, [ORG_CODE]);
  if (!org.rows[0]) throw new Error(`Org ${ORG_CODE} introuvable`);
  const orgId = org.rows[0].id;
  console.log(`${c.bold}Test statut de session dérivé${c.reset}  backend=${BACKEND_URL}  org=${ORG_CODE}\n`);

  await cleanup(orgId); // idempotence

  // Setup user super-academy
  const role = await pool.query(
    `INSERT INTO core.roles (id, organization_id, name, code, role_level, is_active) VALUES (gen_random_uuid(),$1,$2,$3,1,true) RETURNING id`,
    [orgId, '[E2E] Session Status', ROLE_CODE]);
  const roleId = role.rows[0].id;
  const perms = await pool.query(`SELECT id, code FROM core.permissions WHERE code = ANY($1)`, [ACADEMY_PERMS]);
  for (const r of perms.rows)
    await pool.query(`INSERT INTO core.role_permissions (id, role_id, permission_id, granted_at) VALUES (gen_random_uuid(),$1,$2,NOW())`, [roleId, r.id]);
  try { await auth.deleteUser(UID); } catch { /* */ }
  await auth.createUser({ uid: UID, email: 'e2e.session.status@lyd-test.local', emailVerified: true, password: 'E2eAcademy!2026' });
  const userRow = await pool.query(
    `INSERT INTO core.users (id, organization_id, email, password_hash, first_name, last_name, external_id, is_active, email_verified, language, metadata)
     VALUES (gen_random_uuid(),$1,'e2e.session.status@lyd-test.local','firebase-external','E2E','session',$2,true,true,'fr','{}'::jsonb) RETURNING id`,
    [orgId, UID]);
  await pool.query(`INSERT INTO core.user_roles (id, user_id, role_id, is_active, assigned_at) VALUES (gen_random_uuid(),$1,$2,true,NOW())`, [userRow.rows[0].id, roleId]);
  TOKEN = await mintIdToken(auth, UID);
  console.log(`${c.dim}setup OK (user + 19 perms + token)${c.reset}\n`);

  // --- Scénarios ---
  const tag = Date.now().toString(36);
  console.log(`${c.cyan}${c.bold}A) Statut dérivé à la création${c.reset}`);

  const sPlanned = await api('POST', '/core/academy/sessions', { title: `E2E planned ${tag}`, startDate: dayOffset(3), endDate: dayOffset(10) });
  createdSessions.push(sPlanned.json?.id);
  check(`dates futures → status 'planned'`, sPlanned.json?.status === 'planned', `(reçu '${sPlanned.json?.status}', HTTP ${sPlanned.status})`);

  const sProg = await api('POST', '/core/academy/sessions', { title: `E2E inprogress ${tag}`, startDate: dayOffset(-2), endDate: dayOffset(5) });
  createdSessions.push(sProg.json?.id);
  check(`début passé / fin future → status 'in_progress'`, sProg.json?.status === 'in_progress', `(reçu '${sProg.json?.status}')`);

  const sDone = await api('POST', '/core/academy/sessions', { title: `E2E done ${tag}`, startDate: dayOffset(-10), endDate: dayOffset(-3) });
  createdSessions.push(sDone.json?.id);
  check(`fin passée → status 'completed'`, sDone.json?.status === 'completed', `(reçu '${sDone.json?.status}')`);

  console.log(`\n${c.cyan}${c.bold}B) Visibilité catalogue (= inscriptible)${c.reset}`);
  const cat1 = await api('GET', '/core/academy/catalog/sessions?limit=100');
  const catIds = (cat1.json?.data ?? []).map((s) => s.id);
  check(`'planned' visible au catalogue`, catIds.includes(sPlanned.json?.id));
  check(`'in_progress' visible au catalogue`, catIds.includes(sProg.json?.id));
  check(`'completed' ABSENT du catalogue`, !catIds.includes(sDone.json?.id));

  console.log(`\n${c.cyan}${c.bold}C) Annulation (override manuel sticky)${c.reset}`);
  const cancelled = await api('PATCH', `/core/academy/sessions/${sPlanned.json?.id}`, { status: 'cancelled' });
  check(`PATCH status:'cancelled' → 'cancelled'`, cancelled.json?.status === 'cancelled', `(reçu '${cancelled.json?.status}')`);
  const cat2 = await api('GET', '/core/academy/catalog/sessions?limit=100');
  const catIds2 = (cat2.json?.data ?? []).map((s) => s.id);
  check(`session annulée ABSENTE du catalogue`, !catIds2.includes(sPlanned.json?.id));

  console.log(`\n${c.cyan}${c.bold}D) Auto-inscription sur session 'in_progress' (ex-régression)${c.reset}`);
  const enroll = await api('POST', '/core/academy/my/enrollments', { sessionId: sProg.json?.id });
  if (enroll.json?.id) createdEnrollments.push(enroll.json.id);
  check(`inscription sur 'in_progress' AUTORISÉE`, enroll.status === 200 || enroll.status === 201, `(HTTP ${enroll.status} ${JSON.stringify(enroll.json?.message ?? '')})`);

  console.log(`\n${c.bold}━━━ RÉSUMÉ ━━━${c.reset}  ${ok(pass + ' PASS')}  ${fail ? ko(fail + ' FAIL') : c.dim + '0 FAIL' + c.reset}`);
  return fail === 0;
}

let success = false;
try { success = await main(); }
catch (e) { console.error(`\n${ko('ERREUR:')} ${e.message}`); }
finally {
  try { const org = await pool.query(`SELECT id FROM core.organizations WHERE UPPER(name_code)=UPPER($1)`, [ORG_CODE]); await cleanup(org.rows[0].id); console.log(ok('\nTeardown OK — aucun résidu.')); }
  catch (e) { console.error('teardown:', e.message); }
  await pool.end();
}
process.exit(success ? 0 : 1);
