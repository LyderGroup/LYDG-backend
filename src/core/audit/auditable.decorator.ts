import 'reflect-metadata';

export interface AuditableOptions {
  /**
   * Si true, marque toutes les écritures sur cette entité comme "à valeur
   * probante" (rétention 10 ans OHADA, alerte sur hard-delete).
   */
  legallySignificant?: boolean;

  /**
   * Champs à exclure du snapshot (mots de passe, tokens, etc.).
   * Par défaut : passwordHash, passwordSalt, externalId, token.
   */
  excludeFields?: string[];

  /**
   * Champs sensibles dont la simple lecture mérite un audit (consultation
   * salaire, sanction, document médical d'un AUTRE employé que soi-même).
   * Utilisé par @AuditRead() sur les endpoints concernés.
   */
  sensitiveReadFields?: string[];
}

const AUDITABLE_META_KEY = Symbol('auditable');

const DEFAULT_EXCLUDE = ['passwordHash', 'passwordSalt', 'externalId', 'token'];

export function Auditable(options: AuditableOptions = {}): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(
      AUDITABLE_META_KEY,
      {
        legallySignificant: options.legallySignificant ?? false,
        excludeFields: [
          ...DEFAULT_EXCLUDE,
          ...(options.excludeFields ?? []),
        ],
        sensitiveReadFields: options.sensitiveReadFields ?? [],
      },
      target,
    );
  };
}

export function getAuditableOptions(
  target: any,
): Required<AuditableOptions> | null {
  if (!target) return null;
  const meta = Reflect.getMetadata(AUDITABLE_META_KEY, target);
  return meta ?? null;
}
