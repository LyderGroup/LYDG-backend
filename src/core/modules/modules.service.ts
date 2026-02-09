import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoreModule } from './module.entity';
import { OrganizationModule } from './organization-module.entity';

@Injectable()
export class ModulesService {
  constructor(
    @InjectRepository(CoreModule)
    private readonly modulesRepo: Repository<CoreModule>,
    @InjectRepository(OrganizationModule)
    private readonly orgModulesRepo: Repository<OrganizationModule>,
  ) {}

  async listForTenant(organizationId: string) {
    const modules = await this.modulesRepo.find({ order: { name: 'ASC' } });

    const orgModules = await this.orgModulesRepo.find({ where: { organizationId } });
    const orgModulesByModuleId = new Map(orgModules.map((om) => [om.moduleId, om] as const));

    return modules.map((m) => {
      const om = orgModulesByModuleId.get(m.id);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        description: m.description,
        version: m.version,
        schemaName: m.schemaName,
        status: m.status,
        isCoreModule: m.isCoreModule,
        isSystemModule: m.isSystemModule,
        isEnabled: om?.isEnabled ?? false,
        enabledAt: om?.enabledAt ?? null,
        disabledAt: om?.disabledAt ?? null,
      };
    });
  }

  async listEnabledForTenant(organizationId: string) {
    const modules = await this.modulesRepo.find({ order: { name: 'ASC' } });

    const orgModules = await this.orgModulesRepo.find({
      where: { organizationId, isEnabled: true },
    });
    const orgModulesByModuleId = new Map(orgModules.map((om) => [om.moduleId, om] as const));

    return modules
      .filter((m) => orgModulesByModuleId.has(m.id))
      .map((m) => {
        const om = orgModulesByModuleId.get(m.id);
        return {
          id: m.id,
          code: m.code,
          name: m.name,
          description: m.description,
          version: m.version,
          schemaName: m.schemaName,
          status: m.status,
          isCoreModule: m.isCoreModule,
          isSystemModule: m.isSystemModule,
          isEnabled: true,
          enabledAt: om?.enabledAt ?? null,
          disabledAt: om?.disabledAt ?? null,
        };
      });
  }

  async setEnabledForTenant(
    organizationId: string,
    moduleId: string,
    enabledBy: string | null,
    isEnabled: boolean,
  ) {
    if (typeof isEnabled !== 'boolean') {
      throw new BadRequestException('isEnabled must be a boolean');
    }

    const module = await this.modulesRepo.findOne({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException('Module not found');
    }

    let orgModule = await this.orgModulesRepo.findOne({
      where: { organizationId, moduleId },
    });

    const now = new Date();

    if (!orgModule) {
      orgModule = this.orgModulesRepo.create({
        organizationId,
        moduleId,
        isEnabled,
        enabledAt: isEnabled ? now : null,
        disabledAt: isEnabled ? null : now,
        enabledBy: isEnabled ? enabledBy : null,
        settings: {},
      });
    } else {
      orgModule.isEnabled = isEnabled;
      if (isEnabled) {
        orgModule.enabledAt = now;
        orgModule.disabledAt = null;
        orgModule.enabledBy = enabledBy;
      } else {
        orgModule.disabledAt = now;
      }
    }

    await this.orgModulesRepo.save(orgModule);

    return {
      id: module.id,
      code: module.code,
      name: module.name,
      description: module.description,
      version: module.version,
      schemaName: module.schemaName,
      status: module.status,
      isCoreModule: module.isCoreModule,
      isSystemModule: module.isSystemModule,
      isEnabled: orgModule.isEnabled,
      enabledAt: orgModule.enabledAt,
      disabledAt: orgModule.disabledAt,
    };
  }
}
