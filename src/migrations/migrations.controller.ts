import { Controller, Get, Post, BadRequestException, UseGuards, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PermissionGuard } from '../core/rbac/permission.guard';
import { RequirePermission } from '../core/rbac/require-permission.decorator';
import { GLOBAL_PERMISSIONS } from '../core/global/global.permissions';

@Controller('migrations')
@UseGuards(PermissionGuard)
@RequirePermission(GLOBAL_PERMISSIONS.SYSTEM_ADMIN)
export class MigrationsController {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private readonly configService: ConfigService,
  ) { }

  @Get('tables')
  async getTables() {
    const result = await this.dataSource.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema') 
      ORDER BY table_schema, table_name
    `);
    return { tables: result };
  }

  @Get('row-counts')
  async getRowCounts() {
    const result = await this.dataSource.query(`
      SELECT schemaname, relname as table_name, n_live_tup as row_count 
      FROM pg_stat_user_tables 
      ORDER BY n_live_tup DESC
    `);
    return { counts: result };
  }

  @Get('status')
  async getStatus() {
    const autoSync = this.configService.get<string>('AUTO_SYNC_DB') === 'true';
    const tables = await this.dataSource.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    `);
    return {
      autoSyncEnabled: autoSync,
      totalTables: parseInt(tables[0].count),
      database: this.dataSource.options.database,
    };
  }

  @Post('sync-schema')
  async syncSchema() {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Schema synchronization is disabled in production. Use migrations instead.');
    }

    const autoSync = this.configService.get<string>('AUTO_SYNC_DB') === 'true';
    if (!autoSync) {
      throw new BadRequestException('AUTO_SYNC_DB is not enabled. Set AUTO_SYNC_DB=true to enable schema synchronization.');
    }

    try {
      await this.dataSource.synchronize();
      return { success: true, message: 'Schema synchronized successfully' };
    } catch (error) {
      throw new BadRequestException(`Schema sync failed: ${error.message}`);
    }
  }
}
