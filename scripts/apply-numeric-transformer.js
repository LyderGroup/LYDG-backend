/**
 * Script one-shot : ajoute `transformer: numericTransformer` sur toutes
 * les colonnes `@Column({ type: 'decimal', ... })` du codebase HR + pilotage,
 * et l'import correspondant en tête de fichier.
 *
 * Idempotent : skip les colonnes déjà transformées.
 *
 * Usage : node scripts/apply-numeric-transformer.js
 */
const fs = require('fs');
const path = require('path');

const files = [
  'src/core/hr/employee.entity.ts',
  'src/core/hr/entities/attendance.entity.ts',
  'src/core/hr/entities/bonus-type.entity.ts',
  'src/core/hr/entities/daily-journal.entity.ts',
  'src/core/hr/entities/employee-bonus.entity.ts',
  'src/core/hr/entities/employee-salary-history.entity.ts',
  'src/core/hr/entities/employee-sanction.entity.ts',
  'src/core/hr/entities/evaluation-kpi-score.entity.ts',
  'src/core/hr/entities/geofence-zone.entity.ts',
  'src/core/hr/entities/job-application.entity.ts',
  'src/core/hr/entities/job-opening.entity.ts',
  'src/core/hr/entities/job-position.entity.ts',
  'src/core/hr/entities/kpi-weight.entity.ts',
  'src/core/hr/entities/kpi.entity.ts',
  'src/core/hr/entities/leave-balance.entity.ts',
  'src/core/hr/entities/leave-deduction-history.entity.ts',
  'src/core/hr/entities/leave-request.entity.ts',
  'src/core/hr/entities/leave-type.entity.ts',
  'src/core/hr/entities/monthly-evaluation.entity.ts',
  'src/core/hr/entities/office-attendance.entity.ts',
  'src/core/hr/entities/performance-review.entity.ts',
  'src/core/hr/entities/salary-component.entity.ts',
  'src/core/hr/entities/salary-schedule.entity.ts',
  'src/core/hr/entities/training.entity.ts',
  'src/core/pilotage/kpi-value.entity.ts',
  'src/core/pilotage/kpi.entity.ts',
  'src/core/pilotage/strategic-objective.entity.ts',
];

function importPath(file) {
  const fromDir = path.dirname(file);
  const toFile = 'src/common/typeorm/numeric-transformer';
  let rel = path.relative(fromDir, toFile).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

let totalColumns = 0;
let totalFiles = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.warn('SKIP (not found):', file);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  const decimalMatches = content.match(/type:\s*'decimal'/g) || [];
  if (decimalMatches.length === 0) {
    console.log('SKIP (no decimal):', file);
    continue;
  }

  // Idempotent : insère transformer après type: 'decimal', uniquement si
  // pas déjà présent dans les ~6 lignes suivantes.
  content = content.replace(
    /(@Column\(\{[^}]*?type:\s*'decimal',)(?![^}]*transformer:)/g,
    "$1\n    transformer: numericTransformer,"
  );

  if (content === original) {
    console.log('UNCHANGED (already done):', file);
    continue;
  }

  // Ajoute l'import s'il manque
  if (!/import\s*\{[^}]*numericTransformer/.test(content)) {
    const imp = `import { numericTransformer } from '${importPath(file)}';\n`;
    const lastImportMatch = content.match(/^((?:import\s+[^;]+;\s*\n)+)/m);
    if (lastImportMatch) {
      const end = lastImportMatch.index + lastImportMatch[0].length;
      content = content.slice(0, end) + imp + content.slice(end);
    } else {
      content = imp + content;
    }
  }

  fs.writeFileSync(file, content, 'utf8');
  totalFiles++;
  totalColumns += decimalMatches.length;
  console.log(`OK: ${file} (${decimalMatches.length} cols)`);
}

console.log(`\nTOTAL: ${totalColumns} colonnes décimales transformées dans ${totalFiles} fichiers`);
