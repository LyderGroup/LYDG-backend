/**
 * Carte des routes du backend NestJS.
 *
 * Les codes de permission sont générés programmatiquement (buildScopedActions),
 * donc irrésolvables en regex. On importe le code COMPILÉ (dist/) et on aplatit
 * chaque objet de permissions en chemin pointé → code réel :
 *   PROJECT_PERMISSIONS.TASK.READ.PROJECT → 'projects.task.read.project'
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = process.argv[2];
const DIST = process.argv[3];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1) Constantes de permission, résolues depuis dist/
// ---------------------------------------------------------------------------
const constMap = new Map();   // "PROJECT_PERMISSIONS.TASK.READ.PROJECT" -> code
const constArrays = new Map(); // "X.ALL_SCOPES" -> [codes]
const moduleCodeConst = new Map();

function flatten(prefix, val) {
  if (typeof val === 'string') {
    constMap.set(prefix, val);
    return;
  }
  if (Array.isArray(val)) {
    if (val.every((v) => typeof v === 'string')) constArrays.set(prefix, val);
    return;
  }
  if (val && typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) flatten(`${prefix}.${k}`, v);
  }
}

for (const f of walk(DIST).filter((f) => f.endsWith('.permissions.js'))) {
  let mod;
  try { mod = await import(pathToFileURL(f).href); } catch { continue; }
  for (const [name, val] of Object.entries(mod)) {
    if (/MODULE_CODE$/.test(name) && typeof val === 'string') moduleCodeConst.set(name, val);
    flatten(name, val);
  }
}

function resolveCodes(raw) {
  const out = [];
  for (const m of raw.matchAll(/'([^']+)'|"([^"]+)"/g)) out.push(m[1] ?? m[2]);
  // chemins pointés, du plus long au plus court pour ne pas tronquer
  for (const m of raw.matchAll(/\b([A-Z][A-Z0-9_]*(?:\.[A-Z][A-Z0-9_]*)+)\b/g)) {
    const key = m[1];
    if (constMap.has(key)) out.push(constMap.get(key));
    else if (constArrays.has(key)) out.push(...constArrays.get(key));
    else {
      // allScopesOf(PROJECT_PERMISSIONS.TASK.CONTROL_TOWER) : le chemin pointe
      // sur un nœud objet → on prend toutes ses feuilles (OWN, PROJECT, …).
      const leaves = [];
      for (const [k, v] of constMap) if (k.startsWith(key + '.')) leaves.push(v);
      if (leaves.length) out.push(...leaves);
      else out.push(`UNRESOLVED:${key}`);
    }
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// 2) Contrôleurs
// ---------------------------------------------------------------------------
const HTTP = ['Get', 'Post', 'Put', 'Patch', 'Delete'];
const routes = [];

for (const file of walk(SRC).filter((f) => f.endsWith('.controller.ts'))) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);

  const ctrlMatch = src.match(/@Controller\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)?\s*\)/);
  if (!ctrlMatch) continue;
  const prefix = (ctrlMatch[1] ?? ctrlMatch[2] ?? ctrlMatch[3] ?? '').replace(/^\/+|\/+$/g, '');

  const classIdx = src.search(/export class/);
  const classPermM = [...src.slice(0, classIdx).matchAll(/@RequirePermission\(([\s\S]*?)\)\s*\n/g)].pop();
  const classPerms = classPermM ? resolveCodes(classPermM[1]) : [];
  const usesPermGuard = /PermissionGuard/.test(src);

  for (let i = 0; i < lines.length; i++) {
    const httpM = lines[i].match(
      new RegExp(`^\\s*@(${HTTP.join('|')})\\(\\s*(?:'([^']*)'|"([^"]*)"|\`([^\`]*)\`)?\\s*\\)`),
    );
    if (!httpM) continue;

    const method = httpM[1].toUpperCase();
    const sub = (httpM[2] ?? httpM[3] ?? httpM[4] ?? '').replace(/^\/+|\/+$/g, '');
    const full = '/' + [prefix, sub].filter(Boolean).join('/');

    // Bloc de décorateurs entre @Get(...) et la signature du handler.
    //
    // Piège : @RequirePermission s'étend souvent sur plusieurs lignes, et une
    // ligne comme "  allScopesOf(PROJECT_PERMISSIONS.TASK.DELETE)," ressemble à
    // une signature de méthode. On suit donc la profondeur de parenthèses : une
    // ligne n'est une signature que si l'on est revenu à la profondeur 0.
    let perms = null, moduleCode = null, handler = '?', buf = '';
    let depth = 0;
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
      const l = lines[j];
      buf += l + '\n';

      const atTopLevel = depth === 0;
      for (const ch of l) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
      }

      if (atTopLevel && !l.trim().startsWith('@') && l.trim()) {
        const h = l.match(/^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z0-9_]+)\s*\(/);
        if (h) { handler = h[1]; break; }
      }
    }

    if (buf.includes('@RequirePermission(')) {
      const seg = buf.slice(buf.indexOf('@RequirePermission('));
      let d = 0, end = -1;
      for (let k = seg.indexOf('('); k < seg.length; k++) {
        if (seg[k] === '(') d++;
        else if (seg[k] === ')') { d--; if (d === 0) { end = k; break; } }
      }
      if (end > 0) {
        let inner = seg.slice(seg.indexOf('(') + 1, end);
        const modM = inner.match(/moduleCode\s*:\s*(?:'([^']+)'|([A-Z0-9_]+))/);
        if (modM) moduleCode = modM[1] ?? moduleCodeConst.get(modM[2]) ?? modM[2];
        inner = inner.replace(/\{[^{}]*moduleCode[^{}]*\}/g, '');
        perms = resolveCodes(inner);
      }
    }

    routes.push({
      file: path.relative(SRC, file).replace(/\\/g, '/'),
      method, path: full,
      perms: perms && perms.length ? perms : classPerms,
      moduleCode, handler, usesPermGuard,
      params: (full.match(/:([A-Za-z0-9_]+)/g) || []).map((s) => s.slice(1)),
    });
  }
}

routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
console.log(JSON.stringify(routes));
