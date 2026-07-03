/**
 * Script one-shot : remplace les listes de permissions en dur dans
 * src/core/projects/tasks.controller.ts par des appels aux constantes
 * de project.permissions.ts (allScopesOf + spread).
 *
 * Idempotent : ré-exécuter ne casse rien (les blocs déjà remplacés ne
 * matchent plus les patterns originaux).
 */
const fs = require('fs');

const FILE = 'src/core/projects/tasks.controller.ts';

let content = fs.readFileSync(FILE, 'utf8');
const original = content;

// ─── Patterns à remplacer (du plus spécifique au plus général) ───

// Pattern : 6 read + 4 write + delete mix (très long)
content = content.replace(
  /\[\s*'projects\.task\.read\.project',\s*'projects\.task\.read\.own',\s*'projects\.task\.read\.team',\s*'projects\.task\.read\.department',\s*'projects\.task\.read\.tenant',\s*'projects\.task\.read\.global',\s*'projects\.task\.write\.own',[\s\S]*?'projects\.task\.write\.global',\s*\]/g,
  '[\n      ...allScopesOf(PROJECT_PERMISSIONS.TASK.READ),\n      ...allScopesOf(PROJECT_PERMISSIONS.TASK.WRITE),\n    ]',
);

// Pattern : 6 read + 6 write
content = content.replace(
  /\[\s*'projects\.task\.read\.own',\s*'projects\.task\.read\.project',\s*'projects\.task\.read\.team',\s*'projects\.task\.read\.department',\s*'projects\.task\.read\.tenant',\s*'projects\.task\.read\.global',\s*'projects\.task\.write\.own',\s*'projects\.task\.write\.project',\s*'projects\.task\.write\.team',\s*'projects\.task\.write\.department',\s*'projects\.task\.write\.tenant',\s*'projects\.task\.write\.global',\s*\]/g,
  '[\n      ...allScopesOf(PROJECT_PERMISSIONS.TASK.READ),\n      ...allScopesOf(PROJECT_PERMISSIONS.TASK.WRITE),\n    ]',
);

// Pattern : 2 create + 6 write
content = content.replace(
  /\[\s*'projects\.task\.create\.project',\s*'projects\.task\.create\.tenant',\s*'projects\.task\.write\.own',\s*'projects\.task\.write\.project',\s*'projects\.task\.write\.team',\s*'projects\.task\.write\.department',\s*'projects\.task\.write\.tenant',\s*'projects\.task\.write\.global',\s*\]/g,
  '[\n      ...allScopesOf(PROJECT_PERMISSIONS.TASK.CREATE),\n      ...allScopesOf(PROJECT_PERMISSIONS.TASK.WRITE),\n    ]',
);

// Pattern : control_tower + 6 read
content = content.replace(
  /\[\s*'projects\.task\.control_tower\.tenant',\s*'projects\.task\.read\.own',\s*'projects\.task\.read\.project',\s*'projects\.task\.read\.team',\s*'projects\.task\.read\.department',\s*'projects\.task\.read\.tenant',\s*'projects\.task\.read\.global',\s*\]/g,
  '[\n      ...allScopesOf(PROJECT_PERMISSIONS.TASK.CONTROL_TOWER),\n      ...allScopesOf(PROJECT_PERMISSIONS.TASK.READ),\n    ]',
);

// Pattern : 6 read scopes (own → global, dans cet ordre)
content = content.replace(
  /\[\s*'projects\.task\.read\.own',\s*'projects\.task\.read\.project',\s*'projects\.task\.read\.team',\s*'projects\.task\.read\.department',\s*'projects\.task\.read\.tenant',\s*'projects\.task\.read\.global',\s*\]/g,
  'allScopesOf(PROJECT_PERMISSIONS.TASK.READ)',
);

// Pattern : 6 read scopes (project en premier)
content = content.replace(
  /\[\s*'projects\.task\.read\.project',\s*'projects\.task\.read\.own',\s*'projects\.task\.read\.team',\s*'projects\.task\.read\.department',\s*'projects\.task\.read\.tenant',\s*'projects\.task\.read\.global',\s*\]/g,
  'allScopesOf(PROJECT_PERMISSIONS.TASK.READ)',
);

// Pattern : 6 write scopes
content = content.replace(
  /\[\s*'projects\.task\.write\.own',\s*'projects\.task\.write\.project',\s*'projects\.task\.write\.team',\s*'projects\.task\.write\.department',\s*'projects\.task\.write\.tenant',\s*'projects\.task\.write\.global',\s*\]/g,
  'allScopesOf(PROJECT_PERMISSIONS.TASK.WRITE)',
);

// Pattern : 4 delete scopes
content = content.replace(
  /\[\s*'projects\.task\.delete\.own',\s*'projects\.task\.delete\.project',\s*'projects\.task\.delete\.tenant',\s*'projects\.task\.delete\.global',\s*\]/g,
  'allScopesOf(PROJECT_PERMISSIONS.TASK.DELETE)',
);

// Pattern : 5 validate scopes (project, team, department, tenant, global)
content = content.replace(
  /\[\s*'projects\.task\.validate\.project',\s*'projects\.task\.validate\.team',\s*'projects\.task\.validate\.department',\s*'projects\.task\.validate\.tenant',\s*'projects\.task\.validate\.global',\s*\]/g,
  'allScopesOf(PROJECT_PERMISSIONS.TASK.VALIDATE)',
);

// Pattern : 5 validate scopes (alt order)
content = content.replace(
  /\[\s*'projects\.task\.validate\.project',\s*'projects\.task\.validate\.tenant',\s*'projects\.task\.validate\.global',\s*'projects\.task\.validate\.team',\s*'projects\.task\.validate\.department',\s*\]/g,
  'allScopesOf(PROJECT_PERMISSIONS.TASK.VALIDATE)',
);

// Pattern : 3 validate scopes restreints (project, tenant, global)
content = content.replace(
  /\[\s*'projects\.task\.validate\.project',\s*'projects\.task\.validate\.tenant',\s*'projects\.task\.validate\.global',\s*\]/g,
  '[\n      PROJECT_PERMISSIONS.TASK.VALIDATE.PROJECT,\n      PROJECT_PERMISSIONS.TASK.VALIDATE.TENANT,\n      PROJECT_PERMISSIONS.TASK.VALIDATE.GLOBAL,\n    ]',
);

// Pattern : 2 create scopes (project, tenant)
content = content.replace(
  /\[\s*'projects\.task\.create\.project',\s*'projects\.task\.create\.tenant'\s*\]/g,
  '[\n      PROJECT_PERMISSIONS.TASK.CREATE.PROJECT,\n      PROJECT_PERMISSIONS.TASK.CREATE.TENANT,\n    ]',
);

// Pattern : update.own + update.project + read.own + read.project (mes tâches)
content = content.replace(
  /\[\s*'projects\.task\.read\.own',\s*'projects\.task\.read\.project',\s*'projects\.task\.update\.own',\s*'projects\.task\.update\.project',\s*\]/g,
  '[\n      PROJECT_PERMISSIONS.TASK.READ.OWN,\n      PROJECT_PERMISSIONS.TASK.READ.PROJECT,\n      PROJECT_PERMISSIONS.TASK.UPDATE.OWN,\n      PROJECT_PERMISSIONS.TASK.UPDATE.PROJECT,\n    ]',
);

// Single string: export.tenant
content = content.replace(
  /'projects\.task\.export\.tenant'/g,
  'PROJECT_PERMISSIONS.TASK.EXPORT.TENANT',
);

// ─── Ajout de l'import en tête si pas déjà présent ───
if (!/from\s+['"]\.\/project\.permissions['"]/.test(content)) {
  // Insère juste après le dernier import
  const lastImportMatch = content.match(/^((?:import\s+[^;]+;\s*\n)+)/m);
  if (lastImportMatch) {
    const end = lastImportMatch.index + lastImportMatch[0].length;
    const newImport = `import { PROJECT_PERMISSIONS, allScopesOf } from './project.permissions';\n`;
    content = content.slice(0, end) + newImport + content.slice(end);
  }
}

if (content === original) {
  console.log('UNCHANGED');
  process.exit(0);
}

fs.writeFileSync(FILE, content, 'utf8');
console.log('OK: tasks.controller.ts transformé');

// Compte les strings 'projects.task.*' qui restent (pour audit)
const remaining = content.match(/'projects\.task\.[a-z._]+'/g) || [];
if (remaining.length > 0) {
  console.log(`⚠️  ${remaining.length} string(s) en dur restantes :`);
  const uniq = [...new Set(remaining)];
  uniq.forEach(s => console.log('  ', s));
}
