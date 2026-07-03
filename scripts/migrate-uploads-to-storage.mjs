// Migration one-shot : copie les fichiers locaux backend/uploads/** vers le
// bucket Supabase Storage, en préservant le chemin relatif comme clé.
// Ainsi les fileUrl déjà stockés en DB ("/uploads/<clé>") continuent de résoudre.
//
// Usage (depuis backend/) :
//   node scripts/migrate-uploads-to-storage.mjs
// Prérequis : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY renseignés (dans .env
// ou dans l'environnement). Le script est idempotent (upsert).

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, sep, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BACKEND_DIR = join(__dirname, '..');
const UPLOADS_DIR = join(BACKEND_DIR, 'uploads');

// --- Charge SUPABASE_* depuis .env si absents de l'environnement ---
function loadEnvFile() {
  const envPath = join(BACKEND_DIR, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(SUPABASE_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}
loadEnvFile();

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

const missing = [];
if (!URL_) missing.push('SUPABASE_URL');
if (!KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (missing.length) {
  console.error(`❌ Variable(s) manquante(s) dans backend/.env : ${missing.join(', ')}`);
  console.error('   → Supabase → Settings → API → copie la clé "service_role" (secret, commence par eyJ...).');
  process.exit(1);
}
if (!existsSync(UPLOADS_DIR)) {
  console.log('Aucun dossier uploads/ local — rien à migrer.');
  process.exit(0);
}

const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const client = createClient(URL_, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Crée le bucket privé s'il n'existe pas.
  const { error: bErr } = await client.storage.createBucket(BUCKET, { public: false });
  if (bErr && !/already exists/i.test(bErr.message)) {
    console.error(`❌ Création bucket "${BUCKET}" : ${bErr.message}`);
    process.exit(1);
  }

  const files = walk(UPLOADS_DIR);
  console.log(`📦 ${files.length} fichier(s) à migrer vers "${BUCKET}"…`);

  let ok = 0;
  let ko = 0;
  for (const full of files) {
    const key = relative(UPLOADS_DIR, full).split(sep).join('/');
    const contentType = CONTENT_TYPES[extname(full).toLowerCase()] || 'application/octet-stream';
    const { error } = await client.storage
      .from(BUCKET)
      .upload(key, readFileSync(full), { contentType, upsert: true });
    if (error) {
      ko++;
      console.error(`  ✗ ${key} : ${error.message}`);
    } else {
      ok++;
      console.log(`  ✓ ${key}`);
    }
  }
  console.log(`\n✅ Terminé : ${ok} migré(s), ${ko} échec(s).`);
  process.exit(ko > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
