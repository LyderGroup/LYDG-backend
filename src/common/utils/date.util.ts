/**
 * Helpers de date pour les colonnes PostgreSQL de type DATE.
 *
 * Le piège corrigé ici : combiner `setHours(0,0,0,0)` (qui travaille en heure
 * LOCALE du process) avec `toISOString()` (qui rend de l'UTC). Sur un hôte en
 * UTC+n, minuit local vaut 22h/23h UTC de la VEILLE, donc la chaîne obtenue
 * était la date de la veille :
 *
 *   const d = new Date('2026-07-29');
 *   d.setHours(0, 0, 0, 0);           // 2026-07-29T00:00 heure locale
 *   d.toISOString().slice(0, 10);     // → "2026-07-28" en Europe/Paris (UTC+2)
 *
 * Ça ne se voyait pas en production (conteneurs Render en UTC, et le Togo est
 * en UTC+0) mais cassait en dev local européen, et casserait en prod au moindre
 * changement de fuseau de l'hôte.
 *
 * Toutes les comparaisons se font donc en UTC de bout en bout.
 */

/**
 * Rend la date au format `YYYY-MM-DD`, en UTC, sans passer par l'heure locale.
 *
 * Accepte un `Date`, une chaîne (`'2026-07-29'`, ISO complet…) ou rien
 * (= aujourd'hui). Renvoie la date telle quelle si elle est déjà au bon format,
 * pour éviter tout aller-retour de parsing inutile.
 */
export function toIsoDate(value?: Date | string | null): string {
  if (typeof value === 'string') {
    // Déjà "YYYY-MM-DD" (ou un ISO complet dont on ne veut que la partie date).
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (match) return match[1];
  }

  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Date invalide: ${String(value)}`);
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Date `YYYY-MM-DD` d'aujourd'hui en UTC. */
export function todayIsoDate(): string {
  return toIsoDate();
}

/** Décale une date de `days` jours (peut être négatif) et rend `YYYY-MM-DD`. */
export function addDaysIso(value: Date | string | null | undefined, days: number): string {
  const base = new Date(`${toIsoDate(value)}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return toIsoDate(base);
}
