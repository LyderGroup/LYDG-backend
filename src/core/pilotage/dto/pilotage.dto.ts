import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * DTO du module Pilotage.
 *
 * Ils étaient déclarés en classes NUES dans les contrôleurs, sans un seul
 * décorateur class-validator. Or le ValidationPipe global tourne en
 * `whitelist: true` + `forbidNonWhitelisted: true` : sans décorateur, chaque
 * propriété est considérée comme non autorisée et la requête part en 400
 * (« property title should not exist »). Les trois endpoints de création du
 * module étaient donc TOTALEMENT inutilisables — aucune interface n'aurait pu
 * fonctionner par-dessus.
 *
 * Les valeurs numériques acceptent aussi bien le nombre que la chaîne, car les
 * champs correspondants sont en NUMERIC côté Postgres et que le front envoie
 * volontiers des chaînes depuis les <input type="number">.
 */

// ⚠️ Ces listes reproduisent EXACTEMENT les contraintes CHECK de
// module_a_pilotage (cf. pg_constraint). Toute valeur hors liste passait la
// validation applicative puis explosait en 500 au moment de l'INSERT ; les
// refuser ici rend un 400 lisible. Ne les modifier qu'avec la migration SQL
// correspondante.
const OBJECTIVE_TYPES = ['company', 'department', 'team', 'individual'] as const;
const OBJECTIVE_PERIOD_TYPES = ['annual', 'quarterly', 'monthly'] as const;
const OBJECTIVE_STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const;
const KPI_FREQUENCIES = ['realtime', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
const KPI_DIRECTIONS = ['increase', 'decrease', 'neutral'] as const;
const KPI_VALUE_PERIOD_TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

/** Un NUMERIC Postgres accepté en nombre ou en chaîne numérique. */
const IsNumericLike = () =>
  IsNumber({}, { message: 'doit être un nombre' });

export class CreateStrategicObjectiveDto {
  @IsString() @MaxLength(255) title!: string;

  @IsOptional() @IsString() description?: string | null;

  @IsOptional() @IsIn(OBJECTIVE_TYPES as unknown as string[]) objectiveType?: string | null;

  @IsOptional() @IsIn(OBJECTIVE_PERIOD_TYPES as unknown as string[]) periodType?: string | null;

  @IsInt() @Min(2000) @Max(2100) year!: number;

  @IsOptional() @IsInt() @Min(1) @Max(4) quarter?: number | null;

  @IsISO8601() startDate!: string;

  @IsISO8601() endDate!: string;

  @IsOptional() @IsNumericLike() targetValue?: number | null;

  @IsOptional() @IsNumericLike() currentValue?: number | null;

  @IsOptional() @IsString() @MaxLength(30) unit?: string | null;

  @IsOptional() @IsIn(OBJECTIVE_STATUSES as unknown as string[]) status?: string | null;

  @IsOptional() @IsUUID() ownerId?: string | null;

  @IsOptional() @IsUUID() parentObjectiveId?: string | null;
}

export class UpdateStrategicObjectiveDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(OBJECTIVE_TYPES as unknown as string[]) objectiveType?: string | null;
  @IsOptional() @IsIn(OBJECTIVE_PERIOD_TYPES as unknown as string[]) periodType?: string | null;
  @IsOptional() @IsInt() @Min(2000) @Max(2100) year?: number;
  @IsOptional() @IsInt() @Min(1) @Max(4) quarter?: number | null;
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;
  @IsOptional() @IsNumericLike() targetValue?: number | null;
  @IsOptional() @IsNumericLike() currentValue?: number | null;
  @IsOptional() @IsString() @MaxLength(30) unit?: string | null;
  @IsOptional() @IsIn(OBJECTIVE_STATUSES as unknown as string[]) status?: string | null;
  @IsOptional() @IsUUID() ownerId?: string | null;
  @IsOptional() @IsUUID() parentObjectiveId?: string | null;
}

export class CreateKpiDto {
  @IsString() @MaxLength(50) code!: string;

  @IsString() @MaxLength(255) name!: string;

  @IsOptional() @IsString() description?: string | null;

  @IsOptional() @IsUUID() objectiveId?: string | null;

  @IsOptional() @IsIn(KPI_FREQUENCIES as unknown as string[]) frequency?: string | null;

  @IsOptional() @IsString() @MaxLength(30) unit?: string | null;

  /** `increase` = plus c'est haut mieux c'est ; `decrease` = l'inverse ; `neutral` = ni l'un ni l'autre. */
  @IsOptional() @IsIn(KPI_DIRECTIONS as unknown as string[]) direction?: string | null;

  @IsOptional() @IsNumericLike() targetValue?: number | null;

  @IsOptional() @IsNumericLike() warningThreshold?: number | null;

  @IsOptional() @IsNumericLike() criticalThreshold?: number | null;

  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional() @IsBoolean() isVisibleDashboard?: boolean;

  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class UpdateKpiDto {
  @IsOptional() @IsString() @MaxLength(50) code?: string;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsUUID() objectiveId?: string | null;
  @IsOptional() @IsIn(KPI_FREQUENCIES as unknown as string[]) frequency?: string | null;
  @IsOptional() @IsString() @MaxLength(30) unit?: string | null;
  @IsOptional() @IsIn(KPI_DIRECTIONS as unknown as string[]) direction?: string | null;
  @IsOptional() @IsNumericLike() targetValue?: number | null;
  @IsOptional() @IsNumericLike() warningThreshold?: number | null;
  @IsOptional() @IsNumericLike() criticalThreshold?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isVisibleDashboard?: boolean;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class CreateKpiValueDto {
  @IsUUID() kpiId!: string;

  @IsISO8601() periodStart!: string;

  @IsISO8601() periodEnd!: string;

  @IsOptional() @IsIn(KPI_VALUE_PERIOD_TYPES as unknown as string[]) periodType?: string | null;

  @IsNumericLike() value!: number;

  @IsOptional() @IsNumericLike() targetValue?: number | null;

  @IsOptional() @IsString() notes?: string | null;
}
