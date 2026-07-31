/**
 * Configuration centralisée des origines CORS.
 *
 * Source unique de vérité pour HTTP (main.ts) et WebSocket (gateways).
 * Les origines supplémentaires se déclarent via CORS_ALLOWED_ORIGINS
 * (séparées par des virgules) — cf. render.yaml / .env.production.example.
 *
 * ⚠️ L'évaluation est PARESSEUSE et volontairement pas faite au chargement du
 * module : `main.ts` importe ce fichier avant que `ConfigModule.forRoot()`
 * n'ait chargé le `.env`. Un `new Set(...)` au niveau module figeait donc la
 * liste trop tôt et ignorait silencieusement CORS_ALLOWED_ORIGINS en local
 * (ça ne marchait sur Render que parce que les variables y sont de vraies
 * variables de process, présentes dès le démarrage).
 */

const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://localhost:3000',
  // Filet de sécurité : garde le front de production fonctionnel même si
  // CORS_ALLOWED_ORIGINS n'est pas renseignée sur Render (elle est `sync: false`
  // dans render.yaml, donc facile à oublier au déploiement). Les domaines
  // supplémentaires (liveydream.com, etc.) passent par la variable.
  'https://lydg-sooty.vercel.app',
];

/**
 * Déploiements de preview Vercel : `<projet>-git-<branche>-<scope>.vercel.app`.
 * Leur sous-domaine change à chaque branche, donc ils ne peuvent pas être
 * listés un par un dans CORS_ALLOWED_ORIGINS.
 *
 * Activé uniquement si CORS_ALLOW_VERCEL_PREVIEWS=true, et restreint au projet
 * nommé par CORS_VERCEL_PROJECT (ex. « lydg ») pour ne pas ouvrir la porte à
 * n'importe quel sous-domaine *.vercel.app appartenant à un tiers.
 */
function buildVercelPreviewPattern(): RegExp | null {
  if (process.env.CORS_ALLOW_VERCEL_PREVIEWS !== 'true') return null;
  const project = (process.env.CORS_VERCEL_PROJECT || '').trim();
  if (!project) return null;
  const escaped = project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^https://${escaped}-[a-z0-9-]+\\.vercel\\.app$`, 'i');
}

function parseEnvOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s.length > 0);
}

export function getAllowedOrigins(): string[] {
  return Array.from(
    new Set([...DEFAULT_ALLOWED_ORIGINS, ...parseEnvOrigins()]),
  );
}

// Résolu au premier appel (après le chargement de la config), puis mémorisé.
let cachedOrigins: Set<string> | null = null;
let cachedPreviewPattern: RegExp | null | undefined;

function origins(): Set<string> {
  if (!cachedOrigins) {
    cachedOrigins = new Set(getAllowedOrigins());
  }
  return cachedOrigins;
}

function previewPattern(): RegExp | null {
  if (cachedPreviewPattern === undefined) {
    cachedPreviewPattern = buildVercelPreviewPattern();
  }
  return cachedPreviewPattern;
}

/** Réinitialise le cache — utile en test. */
export function resetOriginsCache(): void {
  cachedOrigins = null;
  cachedPreviewPattern = undefined;
}

export function isOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return false;
  const normalized = origin.replace(/\/+$/, '');
  if (origins().has(normalized)) return true;
  const pattern = previewPattern();
  return pattern ? pattern.test(normalized) : false;
}

/**
 * Callback CORS compatible express/socket.io.
 * - En prod : refuse les requêtes sans origin (clients non-navigateurs)
 *   sauf si explicitement autorisé via une whitelist applicative.
 * - En dev : autorise les requêtes sans origin (Postman, curl…).
 */
export function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) {
    const allowNoOrigin = process.env.NODE_ENV !== 'production';
    return callback(null, allowNoOrigin);
  }
  if (isOriginAllowed(origin)) {
    return callback(null, true);
  }
  callback(new Error(`CORS blocked for origin: ${origin}`), false);
}
