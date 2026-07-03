/**
 * Patch one-shot : retire la colonne `updated_at` de la migration
 * `projects_permissions_seed.sql` car elle n'existe pas dans la table
 * `core.permissions` actuelle, ce qui faisait planter tous les INSERTs.
 *
 * Idempotent : skip si déjà appliqué.
 */
const fs = require('fs');

const FILE = 'src/migrations/projects_permissions_seed.sql';
let content = fs.readFileSync(FILE, 'utf8');
const original = content;

// 1. Retirer `, updated_at` de la liste des colonnes INSERT
content = content.replace(
  /\(code, resource, action, display_name, description, system_module_code, is_crud_action, created_at, updated_at\)/g,
  '(code, resource, action, display_name, description, system_module_code, is_crud_action, created_at)'
);

// 2. Retirer le dernier `, NOW()` de chaque ligne VALUES (...) — il y avait
//    deux NOW() à la fin, on n'en garde qu'un (created_at).
//    Pattern : `, NOW(), NOW()),` à la fin d'une ligne
content = content.replace(/, NOW\(\), NOW\(\)\),/g, ', NOW()),');
content = content.replace(/, NOW\(\), NOW\(\)\)$/gm, ', NOW())');

if (content === original) {
  console.log('UNCHANGED (déjà patché ou pattern non trouvé)');
  process.exit(0);
}

fs.writeFileSync(FILE, content, 'utf8');
console.log('OK : updated_at retiré de la migration');

// Vérification post-patch
const remaining = content.match(/updated_at/g) || [];
console.log(`Restant : ${remaining.length} occurrence(s) de "updated_at"`);
