/**
 * Test fonctionnel — bouton "Terminé" côté apprenant.
 *   - crée un cours, le publie
 *   - l'apprenant s'auto-inscrit  → status 'enrolled'
 *   - POST /my/enrollments/:id/complete → status 'completed' + completionDate
 *   - rejoue le complete → idempotent
 *   - vérifie qu'il n'y a plus de champ progressPercent
 * Nettoie tout. Usage : node scripts/academy-e2e/test-enrollment-complete.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = (() => {
  const out = {};
  for (const line of readFileSync(path.resolve(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
})();

const BACKEND_URL = (env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const ORG_CODE = env.ORG_CODE || 'LYDG-TG';
const WEB_API_KEY = env.FIREBASE_WEB_API_KEY || 'AIzaSyDS86GdGbx7f-4aRtcC3ViNGkF0zH9-Kq4';
const UID = 'e2e-enroll-complete';
const ROLE_CODE = 'E2E_ENROLL_COMPLETE';
const PERMS = ['academy.courses.read','academy.courses.create','academy.courses.publish','academy.courses.delete','academy.enrollments.read.own','academy.enrollments.create'];

const c = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', cyan: '\x1b[36m' };
const ok = (s) => `${c.green}${s}${c.reset}`, ko = (s) => `${c.red}${s}${c.reset}`;

const pool = env.DATABASE_URL
  ? new pg.Pool({ connectionString: env.DATABASE_URL, ssl: /true|require/i.test(env.DB_SSL || '') ? { rejectUnauthorized: false } : undefined })
  : new pg.Pool({ host: env.DB_HOST, port: Number(env.DB_PORT || 5432), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, ssl: /true|require/i.test(env.DB_SSL || '') ? { rejectUnauthorized: false } : undefined });
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n') }) });
const auth = admin.auth();

let TOKEN = '';
async function api(method, p, body) {
  const res = await fetch(BACKEND_URL + p, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'X-Organization-Code': ORG_CODE, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* */ }
  return { status: res.status, json: j };
}
let pass = 0, fail = 0;
const check = (l, cond, d = '') => { if (cond) { pass++; console.log(`  ${ok('✓')} ${l}`); } else { fail++; console.log(`  ${ko('✗')} ${l} ${c.dim}${d}${c.reset}`); } };

const createdCourses = [], createdEnroll = [];
async function cleanup(orgId) {
  if (createdEnroll.length) await pool.query(`DELETE FROM module_e_academy.course_enrollments WHERE id = ANY($1)`, [createdEnroll]);
  if (createdCourses.length) await pool.query(`DELETE FROM module_e_academy.course_enrollments WHERE course_id = ANY($1)`, [createdCourses]).catch(()=>{});
  if (createdCourses.length) await pool.query(`DELETE FROM module_e_academy.courses WHERE id = ANY($1)`, [createdCourses]);
  await pool.query(`DELETE FROM core.login_history WHERE user_id IN (SELECT id FROM core.users WHERE external_id=$1)`, [UID]);
  await pool.query(`DELETE FROM core.user_roles WHERE user_id IN (SELECT id FROM core.users WHERE external_id=$1)`, [UID]);
  await pool.query(`DELETE FROM core.users WHERE external_id=$1`, [UID]);
  await pool.query(`DELETE FROM core.role_permissions WHERE role_id IN (SELECT id FROM core.roles WHERE organization_id=$1 AND code=$2)`, [orgId, ROLE_CODE]);
  await pool.query(`DELETE FROM core.user_roles WHERE role_id IN (SELECT id FROM core.roles WHERE organization_id=$1 AND code=$2)`, [orgId, ROLE_CODE]);
  await pool.query(`DELETE FROM core.roles WHERE organization_id=$1 AND code=$2`, [orgId, ROLE_CODE]);
  try { await auth.deleteUser(UID); } catch { /* */ }
}

async function main() {
  const org = await pool.query(`SELECT id FROM core.organizations WHERE UPPER(name_code)=UPPER($1)`, [ORG_CODE]);
  const orgId = org.rows[0].id;
  console.log(`${c.bold}Test bouton "Terminé" apprenant${c.reset}  org=${ORG_CODE}\n`);
  await cleanup(orgId);

  const role = await pool.query(`INSERT INTO core.roles (id,organization_id,name,code,role_level,is_active) VALUES (gen_random_uuid(),$1,'[E2E] Enroll Complete',$2,1,true) RETURNING id`, [orgId, ROLE_CODE]);
  const perms = await pool.query(`SELECT id FROM core.permissions WHERE code = ANY($1)`, [PERMS]);
  for (const r of perms.rows) await pool.query(`INSERT INTO core.role_permissions (id,role_id,permission_id,granted_at) VALUES (gen_random_uuid(),$1,$2,NOW())`, [role.rows[0].id, r.id]);
  try { await auth.deleteUser(UID); } catch { /* */ }
  await auth.createUser({ uid: UID, email: 'e2e.enroll.complete@lyd-test.local', emailVerified: true, password: 'E2eAcademy!2026' });
  const u = await pool.query(`INSERT INTO core.users (id,organization_id,email,password_hash,first_name,last_name,external_id,is_active,email_verified,language,metadata) VALUES (gen_random_uuid(),$1,'e2e.enroll.complete@lyd-test.local','x','E2E','learner',$2,true,true,'fr','{}'::jsonb) RETURNING id`, [orgId, UID]);
  await pool.query(`INSERT INTO core.user_roles (id,user_id,role_id,is_active,assigned_at) VALUES (gen_random_uuid(),$1,$2,true,NOW())`, [u.rows[0].id, role.rows[0].id]);
  TOKEN = await auth.createCustomToken(UID).then((ct) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true }) }).then((r) => r.json()).then((d) => d.idToken));
  console.log(`${c.dim}setup OK${c.reset}\n`);

  const tag = Date.now().toString(36);
  const course = await api('POST', '/core/academy/courses', { code: `E2E-${tag}`.toUpperCase(), title: `E2E complete ${tag}` });
  createdCourses.push(course.json?.id);
  check('cours créé', course.status === 201 || course.status === 200, `HTTP ${course.status}`);
  const pub = await api('POST', `/core/academy/courses/${course.json?.id}/publish`);
  check('cours publié', pub.json?.status === 'published', `status '${pub.json?.status}'`);

  const enr = await api('POST', '/core/academy/my/enrollments', { courseId: course.json?.id });
  if (enr.json?.id) createdEnroll.push(enr.json.id);
  check("auto-inscription → 'enrolled'", enr.json?.status === 'enrolled', `status '${enr.json?.status}' HTTP ${enr.status}`);
  check('plus de champ progressPercent', enr.json && !('progressPercent' in enr.json), `keys: ${enr.json ? Object.keys(enr.json).join(',') : 'null'}`);

  const done = await api('POST', `/core/academy/my/enrollments/${enr.json?.id}/complete`);
  check("complete → status 'completed'", done.json?.status === 'completed', `status '${done.json?.status}' HTTP ${done.status}`);
  check('completionDate renseignée', !!done.json?.completionDate);

  const again = await api('POST', `/core/academy/my/enrollments/${enr.json?.id}/complete`);
  check('complete idempotent (rejoué)', again.status === 200 || again.status === 201, `HTTP ${again.status}`);

  const mine = await api('GET', '/core/academy/my/enrollments');
  const row = (mine.json?.data ?? mine.json ?? []).find((e) => e.id === enr.json?.id);
  check("visible 'completed' dans Mes formations", row?.status === 'completed');

  console.log(`\n${c.bold}━━━ RÉSUMÉ ━━━${c.reset}  ${ok(pass + ' PASS')}  ${fail ? ko(fail + ' FAIL') : c.dim + '0 FAIL' + c.reset}`);
  return fail === 0;
}

let success = false;
try { success = await main(); } catch (e) { console.error(`\n${ko('ERREUR:')} ${e.message}`); }
finally { try { const o = await pool.query(`SELECT id FROM core.organizations WHERE UPPER(name_code)=UPPER($1)`, [ORG_CODE]); await cleanup(o.rows[0].id); console.log(ok('\nTeardown OK.')); } catch (e) { console.error('teardown:', e.message); } await pool.end(); }
process.exit(success ? 0 : 1);
