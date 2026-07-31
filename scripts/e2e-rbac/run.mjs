/**
 * ============================================================================
 *  E2E RBAC — tous modules
 * ----------------------------------------------------------------------------
 *  Crée des utilisateurs jetables avec des jeux de permissions contrôlés, tape
 *  les VRAIS endpoints (guards réels), et vérifie pour chaque (profil, route)
 *  que la porte RBAC se comporte comme le déclare @RequirePermission.
 *
 *  Trois phases :
 *    A. Matrice RBAC      — 403 attendu quand la permission manque, sinon non-403.
 *    B. Routes ouvertes   — routes sans @RequirePermission : qui peut réellement
 *                           les appeler ? (détecte les guards décoratifs)
 *    C. Logique métier    — cross-tenant, module désactivé, validation d'entrée.
 *
 *  Pré-requis : backend démarré (npm run start:dev) + Postgres local.
 *
 *  Usage :
 *    node scripts/e2e-rbac/run.mjs              # setup → test → teardown
 *    node scripts/e2e-rbac/run.mjs --keep       # conserve les users de test
 *    node scripts/e2e-rbac/run.mjs --cleanup    # supprime et sort
 *    node scripts/e2e-rbac/run.mjs --phase=A    # une seule phase
 * ============================================================================
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKEND_URL, NIL_UUID, c, sleep, call, classify,
  makePool, initFirebase, setupProfiles, cleanup,
} from './lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTES = JSON.parse(readFileSync(path.resolve(__dirname, 'routes.json'), 'utf8'));

const ARGS = new Set(process.argv.slice(2));
const KEEP = ARGS.has('--keep');
const CLEANUP_ONLY = ARGS.has('--cleanup');
const PHASE = (process.argv.find((a) => a.startsWith('--phase=')) || '').split('=')[1] || 'ABC';

const ORG = 'LYDG-TG';       // 6 modules activés
const ORG_PARENT = 'LYDG';   // organisation racine (tests cross-tenant)
const ORG_PARTIAL = 'LYDG-BJ'; // seulement 3 modules (test module désactivé)

// ---------------------------------------------------------------------------
// Profils : jeux de permissions dérivés des routes réellement déclarées
// ---------------------------------------------------------------------------
const allPerms = [...new Set(ROUTES.flatMap((r) => r.perms))].filter((p) => !p.startsWith('UNRESOLVED'));
const famOf = (p) => p.split('.')[0];
const fam = (f) => allPerms.filter((p) => famOf(p) === f);
const readOnly = (f) => fam(f).filter((p) => /\.(read|list|view|export)(\.|$)/.test(p));

const PROFILES = [
  { key: 'none',      org: ORG, label: 'Aucune permission',        perms: [] },
  { key: 'hr-read',   org: ORG, label: 'RH lecture seule',         perms: readOnly('hr') },
  { key: 'hr-admin',  org: ORG, label: 'RH complet',               perms: fam('hr') },
  { key: 'proj-read', org: ORG, label: 'Projets lecture seule',    perms: [...readOnly('projects'), ...readOnly('project')] },
  { key: 'proj-admin',org: ORG, label: 'Projets complet',          perms: [...fam('projects'), ...fam('project')] },
  { key: 'fin-admin', org: ORG, label: 'Finance complet',          perms: fam('finance') },
  { key: 'acad-admin',org: ORG, label: 'Academy complet',          perms: fam('academy') },
  { key: 'docs-admin',org: ORG, label: 'Documents complet',        perms: fam('documents') },
  { key: 'pilo-read', org: ORG, label: 'Pilotage lecture',         perms: readOnly('pilotage') },
  { key: 'super',     org: ORG, label: 'Toutes permissions',       perms: allPerms },
  // Cross-tenant : mêmes pleins pouvoirs, mais rattaché à une AUTRE organisation.
  { key: 'x-parent',  org: ORG_PARENT,  label: 'Super, org parente LYDG', perms: allPerms },
  // Organisation où finance/academy/documents ne sont PAS activés.
  { key: 'x-partial', org: ORG_PARTIAL, label: 'Super, org 3 modules',    perms: allPerms },
];

// ---------------------------------------------------------------------------
// Sélection des sondes : une route représentative par (famille, ressource, action)
// pour tenir sous le throttler (2000 req/h par IP).
// ---------------------------------------------------------------------------
function selectProbes() {
  const protectedRoutes = ROUTES.filter((r) => r.perms.length && !r.perms.some((p) => p.startsWith('UNRESOLVED')));
  const seen = new Set();
  const picked = [];
  for (const r of protectedRoutes) {
    const p0 = r.perms[0];
    const key = `${famOf(p0)}|${p0.split('.').slice(1, 3).join('.')}|${r.method}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(r);
  }
  return picked;
}

/** Remplace :params par un UUID inexistant → 404 si la porte RBAC s'ouvre. */
function concretePath(r) {
  return r.path.replace(/:([A-Za-z0-9_]+)/g, NIL_UUID);
}
function bodyFor(r) {
  return ['POST', 'PATCH', 'PUT'].includes(r.method) ? {} : undefined;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------
/**
 * Pour chaque route on ne teste que les profils porteurs d'information, afin de
 * rester sous le throttler (200 req/min, 2000 req/h par IP) :
 *   - `none`  : doit être refusé  → détecte les portes ouvertes
 *   - `super` : doit être autorisé → détecte les portes coincées
 *   - le profil du module concerné : doit être autorisé
 *   - un profil d'un AUTRE module : doit être refusé → détecte les fuites inter-modules
 */
const FAMILY_PROFILE = {
  hr: 'hr-admin', projects: 'proj-admin', project: 'proj-admin',
  finance: 'fin-admin', academy: 'acad-admin', documents: 'docs-admin',
  pilotage: 'pilo-read',
};

function profilesFor(r, byKey) {
  const f = famOf(r.perms[0]);
  const owner = byKey.get(FAMILY_PROFILE[f]);
  const foreignKey = f === 'hr' ? 'acad-admin' : 'hr-admin';
  const set = [byKey.get('none'), byKey.get('super'), owner, byKey.get(foreignKey)];
  return [...new Set(set.filter(Boolean))];
}

async function phaseA(users, probes, findings) {
  const byKey = new Map(users.map((u) => [u.key, u]));
  const total = probes.reduce((n, r) => n + profilesFor(r, byKey).length, 0);
  console.log(`\n${c.bold}${c.cyan}━━━ PHASE A — Matrice RBAC (${probes.length} routes, ${total} requêtes ciblées) ━━━${c.reset}\n`);
  const results = [];
  const stats = new Map();

  for (const r of probes) {
    for (const u of profilesFor(r, byKey)) {
      const st = stats.get(u.key) || { pass: 0, fail: 0, rate: 0 };
      stats.set(u.key, st);
      const { status, body } = await call(u.token, {
        method: r.method, path: concretePath(r), body: bodyFor(r), orgCode: ORG,
      });
      const got = classify(status);
      const expected = r.perms.some((p) => u.permsSet.has(p)) ? 'ALLOWED' : 'DENIED';
      if (got === 'RATE') { st.rate++; continue; }
      const ok = got === expected;
      ok ? st.pass++ : st.fail++;
      results.push({ user: u.key, route: r, status, got, expected, ok, msg: body?.message });
      if (!ok) {
        findings.push({
          phase: 'A',
          severity: expected === 'DENIED' ? 'HAUTE' : 'MOYENNE',
          title: expected === 'DENIED'
            ? `Accès autorisé sans la permission requise`
            : `Accès refusé alors que la permission est accordée`,
          detail: `${u.key} (${u.permsSet.size} perms) → ${r.method} ${r.path} = HTTP ${status}` +
                  ` | attendu ${expected}, obtenu ${got} | requiert: ${r.perms.slice(0, 3).join(' OU ')}` +
                  (body?.message ? ` | msg: ${JSON.stringify(body.message).slice(0, 120)}` : ''),
          file: r.file,
        });
      }
      await sleep(320); // reste sous le palier medium (200 req/min)
    }
  }

  for (const [key, st] of stats) {
    const u = byKey.get(key);
    console.log(`  ${c.gray}${key.padEnd(11)}${c.reset} ${String(u.permsSet.size).padStart(3)} perms  ` +
      `${c.green}${String(st.pass).padStart(4)} ok${c.reset}  ` +
      `${st.fail ? c.red : c.gray}${String(st.fail).padStart(3)} ko${c.reset}` +
      `${st.rate ? `  ${c.yellow}${st.rate} throttlés${c.reset}` : ''}`);
  }
  return results;
}

async function phaseB(users, findings) {
  const open = ROUTES.filter((r) => !r.perms.length);
  // On exclut le self-service assumé (l'utilisateur agit sur ses propres données)
  // et les routes publiques/健康.
  const selfService = /^\/(me\/|core\/users\/me|core\/auth\/my-|core\/notifications|core\/rbac\/my\/|core\/hr\/journals\/|core\/hr\/attendance\/check-|core\/modules\/enabled|core\/hr\/required-documents\/config)/;
  const candidates = open.filter((r) =>
    !/^\/(public|health)/.test(r.path) && r.path !== '/' && !selfService.test(r.path));

  console.log(`\n${c.bold}${c.cyan}━━━ PHASE B — Routes sans @RequirePermission (${candidates.length}) ━━━${c.reset}\n`);
  const none = users.find((u) => u.key === 'none');

  for (const r of candidates) {
    const { status, body } = await call(none.token, {
      method: r.method, path: concretePath(r), body: bodyFor(r), orgCode: ORG,
    });
    const got = classify(status);
    const mutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method);
    const reachable = got === 'ALLOWED';

    const mark = reachable ? (mutating ? c.red + 'ATTEIGNABLE (mutation)' : c.yellow + 'atteignable') : c.gray + 'bloquée';
    console.log(`  ${mark}${c.reset} ${String(status).padEnd(4)} ${r.method.padEnd(6)} ${r.path}`);

    if (reachable) {
      findings.push({
        phase: 'B',
        severity: mutating ? 'HAUTE' : 'MOYENNE',
        title: mutating
          ? 'Mutation atteignable par un utilisateur sans aucune permission'
          : 'Lecture atteignable par un utilisateur sans aucune permission',
        detail: `${r.method} ${r.path} = HTTP ${status} pour un compte à 0 permission` +
                (r.usesPermGuard ? ' — @UseGuards(PermissionGuard) présent mais SANS @RequirePermission, donc le guard laisse passer' : ' — aucun guard de permission'),
        file: r.file,
      });
    }
    await sleep(120);
  }
}

async function phaseC(users, findings, poolRef) {
  console.log(`\n${c.bold}${c.cyan}━━━ PHASE C — Logique métier ━━━${c.reset}\n`);
  const superU = users.find((u) => u.key === 'super');
  const partial = users.find((u) => u.key === 'x-partial');
  const parent = users.find((u) => u.key === 'x-parent');
  const none = users.find((u) => u.key === 'none');

  const checks = [];

  // C1 — module désactivé pour l'organisation → doit être 403
  for (const [modLabel, probe] of [
    ['finance', ROUTES.find((r) => r.method === 'GET' && /^\/core\/finance\//.test(r.path) && r.perms.length)],
    ['academy', ROUTES.find((r) => r.method === 'GET' && /^\/core\/academy\//.test(r.path) && r.perms.length)],
    ['documents', ROUTES.find((r) => r.method === 'GET' && /^\/core\/documents\//.test(r.path) && r.perms.length)],
  ]) {
    if (!probe) continue;
    const { status, body } = await call(partial.token, {
      method: 'GET', path: concretePath(probe), orgCode: 'LYDG-BJ',
    });
    checks.push({
      name: `C1 module ${modLabel} désactivé sur LYDG-BJ`,
      ok: status === 403,
      got: status,
      expect: 403,
      note: body?.message ? String(body.message).slice(0, 90) : '',
      probe: `${probe.method} ${probe.path}`,
    });
    await sleep(150);
  }

  // C2 — en-tête d'organisation absent → 400 attendu (contexte tenant requis)
  const anyProtected = ROUTES.find((r) => r.method === 'GET' && r.perms.length && /^\/core\//.test(r.path) && !r.params.length);
  if (anyProtected) {
    const { status } = await call(superU.token, { method: 'GET', path: anyProtected.path });
    checks.push({ name: 'C2 sans X-Organization-Code', ok: [400, 403].includes(status), got: status, expect: '400/403', probe: `GET ${anyProtected.path}` });
    await sleep(150);
  }

  // C3 — organisation inexistante → 404 attendu
  if (anyProtected) {
    const { status } = await call(superU.token, { method: 'GET', path: anyProtected.path, orgCode: 'ORG-QUI-NEXISTE-PAS' });
    checks.push({ name: 'C3 organisation inexistante', ok: status === 404, got: status, expect: 404, probe: `GET ${anyProtected.path}` });
    await sleep(150);
  }

  // C4 — casse de l'en-tête d'organisation : doit se comporter comme la majuscule
  if (anyProtected) {
    const up = await call(superU.token, { method: 'GET', path: anyProtected.path, orgCode: ORG });
    await sleep(150);
    const low = await call(superU.token, { method: 'GET', path: anyProtected.path, orgCode: ORG.toLowerCase() });
    checks.push({
      name: 'C4 en-tête org en minuscules', ok: up.status === low.status, got: `${low.status} vs ${up.status}`,
      expect: 'identique', probe: `GET ${anyProtected.path}`,
    });
    await sleep(150);
  }

  // C5 — /me/profile en minuscules doit résoudre l'organisation (bug corrigé)
  {
    const r1 = await call(superU.token, { method: 'GET', path: '/me/profile', orgCode: ORG });
    await sleep(150);
    const r2 = await call(superU.token, { method: 'GET', path: '/me/profile', orgCode: ORG.toLowerCase() });
    checks.push({
      name: 'C5 /me/profile insensible à la casse',
      ok: !!r1.body?.organization === !!r2.body?.organization,
      got: `org majuscule=${!!r1.body?.organization}, minuscule=${!!r2.body?.organization}`,
      expect: 'identique',
      probe: 'GET /me/profile',
    });
    await sleep(150);
  }

  // C6 — token absent → 401
  {
    const { status } = await call(null, { method: 'GET', path: '/me/profile', orgCode: ORG });
    checks.push({ name: 'C6 sans token', ok: status === 401, got: status, expect: 401, probe: 'GET /me/profile' });
    await sleep(150);
  }

  // C7 — DTO strict : champ inconnu doit être rejeté (forbidNonWhitelisted)
  {
    const postRoute = ROUTES.find((r) => r.method === 'POST' && r.perms.length && !r.params.length && /^\/core\/(academy|finance)\//.test(r.path));
    if (postRoute) {
      const { status } = await call(superU.token, {
        method: 'POST', path: postRoute.path, orgCode: ORG,
        body: { champInexistantXyz: 'valeur' },
      });
      checks.push({ name: 'C7 DTO strict (champ inconnu)', ok: status === 400, got: status, expect: 400, probe: `POST ${postRoute.path}` });
      await sleep(150);
    }
  }

  // C8 — cross-tenant : un super-admin de LYDG peut-il piloter LYDG-TG ?
  if (anyProtected) {
    const { status } = await call(parent.token, { method: 'GET', path: anyProtected.path, orgCode: ORG });
    checks.push({
      name: 'C8 user LYDG avec en-tête LYDG-TG',
      ok: true, // informatif : la remontée hiérarchique est un choix produit
      got: status,
      expect: 'informatif',
      probe: `GET ${anyProtected.path}`,
    });
    await sleep(150);
  }

  // C9 — chemins d'approbation de validation.
  //
  // Un 404 est ambigu : route inexistante OU ressource introuvable. Nest répond
  // "Cannot POST /chemin" quand AUCUNE route ne correspond — c'est ce marqueur
  // qui discrimine les deux cas.
  const routeExists = (status, body) => {
    if (status !== 404) return true;
    const msg = typeof body?.message === 'string' ? body.message : '';
    return !/^Cannot (POST|GET|PATCH|PUT|DELETE)\s/i.test(msg);
  };
  for (const [label, p] of [
    ['appelé par ProjectsTasksPage.tsx', `/core/projects/tasks/${NIL_UUID}/validation-requests/approve`],
    ['déclaré côté backend (double « tasks »)', `/core/projects/tasks/tasks/${NIL_UUID}/validation-requests/approve`],
    ['appelé par ValidationRequestsModal.tsx', `/core/projects/tasks/validation-requests/${NIL_UUID}/approve`],
  ]) {
    const { status, body } = await call(superU.token, { method: 'POST', path: p, orgCode: ORG, body: {} });
    const exists = routeExists(status, body);
    checks.push({
      name: `C9 ${label}`,
      ok: exists,
      got: `${status}${exists ? '' : ' (route absente)'}`,
      expect: 'route existante',
      note: body?.message ? String(body.message).slice(0, 90) : '',
      probe: `POST ${p}`,
    });
    await sleep(150);
  }

  // C10 — permissions exigées par des routes mais absentes de core.permissions :
  // impossibles à accorder, donc endpoint en 403 définitif pour tout le monde.
  {
    const declared = [...new Set(ROUTES.flatMap((r) => r.perms))].filter((p) => !p.startsWith('UNRESOLVED'));
    const { rows } = await poolRef.query(`SELECT code FROM core.permissions WHERE code = ANY($1)`, [declared]);
    const known = new Set(rows.map((r) => r.code));
    const ghosts = declared.filter((p) => !known.has(p));
    for (const g of ghosts) {
      const affected = ROUTES.filter((r) => r.perms.includes(g));
      // Route morte seulement si AUCUNE de ses permissions alternatives n'existe.
      const dead = affected.filter((r) => r.perms.every((p) => !known.has(p)));
      checks.push({
        name: `C10 permission fantôme « ${g} »`,
        ok: dead.length === 0,
        got: `${dead.length} route(s) inaccessibles`,
        expect: '0',
        note: dead.map((r) => `${r.method} ${r.path}`).join(' · ').slice(0, 140),
        probe: g,
      });
    }
  }

  for (const ch of checks) {
    const mark = ch.ok ? `${c.green}OK  ${c.reset}` : `${c.red}ÉCHEC${c.reset}`;
    console.log(`  ${mark} ${ch.name.padEnd(46)} obtenu=${String(ch.got).padEnd(14)} attendu=${ch.expect}`);
    if (ch.note) console.log(`        ${c.gray}${ch.note}${c.reset}`);
    if (!ch.ok) {
      findings.push({
        phase: 'C', severity: 'MOYENNE', title: ch.name,
        detail: `${ch.probe} → obtenu ${ch.got}, attendu ${ch.expect}`, file: '',
      });
    }
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const pool = makePool();
  const auth = initFirebase();

  const orgRows = await pool.query(`SELECT id, name_code FROM core.organizations`);
  const orgIdByCode = new Map(orgRows.rows.map((r) => [r.name_code, r.id]));

  console.log(`${c.bold}E2E RBAC — backend ${BACKEND_URL}${c.reset}`);
  console.log(`${c.gray}orgs: ${[...orgIdByCode.keys()].join(', ')}${c.reset}`);

  await cleanup(pool, auth, PROFILES);
  if (CLEANUP_ONLY) { console.log('Nettoyage terminé.'); await pool.end(); return; }

  const { users, missingPermissions } = await setupProfiles(pool, auth, PROFILES, orgIdByCode);
  if (missingPermissions.length) {
    console.log(`${c.yellow}⚠ ${missingPermissions.length} permissions déclarées dans le code sont ABSENTES de la DB${c.reset}`);
    console.log(`${c.gray}  ${missingPermissions.slice(0, 12).join(', ')}${missingPermissions.length > 12 ? ' …' : ''}${c.reset}`);
  }
  console.log(`${c.gray}${users.length} profils créés${c.reset}`);

  const probes = selectProbes();
  const findings = [];

  try {
    if (PHASE.includes('A')) await phaseA(users, probes, findings);
    if (PHASE.includes('B')) await phaseB(users, findings);
    if (PHASE.includes('C')) await phaseC(users, findings, pool);
  } finally {
    // Rapport
    console.log(`\n${c.bold}${c.mag}━━━ ANOMALIES (${findings.length}) ━━━${c.reset}\n`);
    const bySev = { HAUTE: [], MOYENNE: [], BASSE: [] };
    findings.forEach((f) => (bySev[f.severity] ||= []).push(f));
    for (const sev of ['HAUTE', 'MOYENNE', 'BASSE']) {
      const list = bySev[sev] || [];
      if (!list.length) continue;
      console.log(`${c.bold}${sev} (${list.length})${c.reset}`);
      const grouped = new Map();
      for (const f of list) {
        const k = f.title + '|' + f.file;
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k).push(f);
      }
      for (const [k, items] of grouped) {
        console.log(`  ${c.yellow}▸ ${items[0].title}${c.reset} ${c.gray}(${items.length}× · ${items[0].file})${c.reset}`);
        items.slice(0, 6).forEach((f) => console.log(`      ${f.detail}`));
        if (items.length > 6) console.log(`      ${c.gray}… ${items.length - 6} de plus${c.reset}`);
      }
      console.log();
    }

    // Hors de backend/ : y écrire relancerait `nest start --watch` en plein test.
    const out = process.env.E2E_OUT || path.resolve(__dirname, '../../../e2e-findings.json');
    writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2));
    console.log(`${c.gray}Détail complet → ${out}${c.reset}`);

    if (!KEEP) { await cleanup(pool, auth, PROFILES); console.log(`${c.gray}Utilisateurs de test supprimés.${c.reset}`); }
    else console.log(`${c.yellow}--keep : utilisateurs conservés.${c.reset}`);
    await pool.end();
  }
})().catch((e) => { console.error(`\n${c.red}ERREUR: ${e.message}${c.reset}`); process.exit(1); });
