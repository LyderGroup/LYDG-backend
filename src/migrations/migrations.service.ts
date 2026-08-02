import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MigrationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationsService.name);

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Au démarrage de l'app : exécute automatiquement les migrations SQL
   * des dossiers `migrations/` et `src/migrations/`. Les migrations utilisent
   * `CREATE TABLE IF NOT EXISTS` etc. → idempotent et sans risque de
   * "déjà existant".
   *
   * Désactivable en prod via env `RUN_MIGRATIONS_ON_BOOT=false`.
   */
  async onApplicationBootstrap(): Promise<void> {
    const enabled = this.configService.get<string>('RUN_MIGRATIONS_ON_BOOT') !== 'false';
    if (!enabled) {
      this.logger.log('Auto-migrations désactivées (RUN_MIGRATIONS_ON_BOOT=false)');
      return;
    }
    try {
      await this.runMigrations();
    } catch (err) {
      this.logger.error(`Échec auto-migration au boot : ${(err as Error).message}`);
    }
  }

  async runMigrations() {
    // Chercher les migrations dans plusieurs emplacements possibles
    const possiblePaths = [
      path.join(process.cwd(), 'migrations'),
      path.join(process.cwd(), 'src/migrations'),
    ];

    for (const migrationsDir of possiblePaths) {
      if (!fs.existsSync(migrationsDir)) {
        continue;
      }

      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

      if (files.length === 0) {
        continue;
      }

      console.log(`[Migrations] Trouvé ${files.length} fichier(s) dans ${migrationsDir}`);

      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        await this.runOneFile(file, sql);
      }
    }
  }
 
  private async runOneFile(file: string, sql: string): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    try {
      console.log(`[Migrations] Exécution de ${file}...`);
      await runner.query(sql);
      console.log(`[Migrations] ${file} exécuté avec succès`);
    } catch (error) {
      const message = (error as Error).message ?? String(error);

      // Le filtre d'origine ne reconnaissait que les messages ANGLAIS. Sur une
      // base en français (« existe déjà »), un « déjà appliqué » parfaitement
      // bénin était journalisé comme une erreur.
      const alreadyApplied =
        /already exists|duplicate|existe déjà|doublon/i.test(message);

      if (alreadyApplied) {
        console.log(`[Migrations] ${file} déjà appliqué`);
      } else {
        console.log(`[Migrations] ${file} erreur: ${message}`);
      }

      // LE POINT CRITIQUE : sortir de la transaction abortée avant de rendre
      // la connexion. Hors transaction, ROLLBACK n'est qu'un avertissement.
      try {
        await runner.query('ROLLBACK');
      } catch {
        /* rien à annuler */
      }
    } finally {
      await runner.release();
    }
  }
}
