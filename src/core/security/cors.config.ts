/**
 * Configuration centralisée des origines CORS.
 *
 * Source unique de vérité pour HTTP (main.ts) et WebSocket (gateways).
 * Les origines supplémentaires peuvent être ajoutées via la variable
 * d'environnement CORS_ALLOWED_ORIGINS (séparées par des virgules).
 */

const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:5173', 
  'https://lydg-sooty.vercel.app',
  'http://localhost:3000',
];

function parseEnvOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function getAllowedOrigins(): string[] {
  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...parseEnvOrigins()]));
}

const ORIGINS = new Set(getAllowedOrigins());

export function isOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return false;
  return ORIGINS.has(origin);
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
  if (ORIGINS.has(origin)) {
    return callback(null, true);
  }
  callback(new Error(`CORS blocked for origin: ${origin}`), false);
}
