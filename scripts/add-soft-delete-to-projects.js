/**
 * Sprint B : ajoute les colonnes soft-delete sur toutes les entités du
 * module Projets (sauf logs/events). Idempotent : skip si déjà présent.
 */
const fs = require('fs');

const files = [
  'src/core/projects/project.entity.ts',
  'src/core/projects/task.entity.ts',
  'src/core/projects/subtask.entity.ts',
  'src/core/projects/project-comment.entity.ts',
  'src/core/projects/task-comment.entity.ts',
  'src/core/projects/project-member.entity.ts',
  'src/core/projects/project-workflow.entity.ts',
  'src/core/projects/project-workflow-step.entity.ts',
  'src/core/projects/task-dependency.entity.ts',
  'src/core/projects/task-workflow-validation.entity.ts',
  'src/core/projects/validation-request.entity.ts',
];

const SOFT_DELETE_BLOCK = `
  // ─── Soft-delete (Sprint B) ───────────────────────────────────────
  @Column({ type: 'timestamp', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'uuid', name: 'deleted_by', nullable: true })
  deletedBy!: string | null;

  @Column({ type: 'text', name: 'deletion_reason', nullable: true })
  deletionReason!: string | null;
`;

let totalFiles = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.warn('SKIP (not found):', file);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  // Idempotent : skip si déjà présent
  if (content.includes("name: 'deleted_at'")) {
    console.log('SKIP (already done):', file);
    continue;
  }

  // Insère le bloc juste avant la dernière accolade fermante de la classe.
  // On cherche le dernier `}` du fichier en partant de la fin.
  const lastBrace = content.lastIndexOf('}');
  if (lastBrace === -1) {
    console.warn('SKIP (no closing brace):', file);
    continue;
  }

  // Trouve l'@UpdateDateColumn ou @CreateDateColumn final pour insérer après
  const updateDateMatch = content.match(/@UpdateDateColumn[\s\S]*?\n\s*\w+!:[^\n]*\n/g);
  if (updateDateMatch && updateDateMatch.length > 0) {
    const lastMatch = updateDateMatch[updateDateMatch.length - 1];
    const idx = content.lastIndexOf(lastMatch);
    if (idx !== -1) {
      const insertPos = idx + lastMatch.length;
      content = content.slice(0, insertPos) + SOFT_DELETE_BLOCK + content.slice(insertPos);
    }
  } else {
    // Fallback : juste avant le } final de la classe
    content = content.slice(0, lastBrace) + SOFT_DELETE_BLOCK + '\n' + content.slice(lastBrace);
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalFiles++;
    console.log('OK:', file);
  }
}

console.log(`\nTOTAL: ${totalFiles} entité(s) modifiée(s)`);
