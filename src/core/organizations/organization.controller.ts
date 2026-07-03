import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Req,
    UseGuards,
    NotFoundException,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './organizations.service';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';

@Controller('core/organizations')
@UseGuards(PermissionGuard)
export class OrganizationsController {
    constructor(private readonly organizationsService: OrganizationsService) { }

    @Get()
    @RequirePermission(['hr.organizations.read', 'hr.organizations.read.all', 'hr.organizations.read.own'])
    async list(@Req() req: any) {
        // Vérifier la permission hr.organizations.read.all
        const hasAllOrgsPermission = req.permissionCodes?.includes('hr.organizations.read.all');
        if (hasAllOrgsPermission) {
            return this.organizationsService.listAll();
        }
        // Les autres voient seulement leur organisation
        const tenant = req.tenant as { id?: string } | undefined;
        const organizationId = tenant?.id ?? req.user?.organizationId;
        return this.organizationsService.findAllForTenant(organizationId);
    }

    @Get('tree')
    @RequirePermission(['hr.organizations.read', 'hr.organizations.read.all', 'hr.organizations.read.own'])
    async getTree() {
        return this.organizationsService.getOrganizationTree();
    }

    @Get('tree/:id')
    @RequirePermission(['hr.organizations.read', 'hr.organizations.read.all'])
    async getSubTree(@Param('id') id: string) {
        const tree = await this.organizationsService.getSubTree(id);
        if (!tree) {
            throw new NotFoundException('Organisation non trouvée');
        }
        return tree;
    }

    @Get(':id')
    @RequirePermission(['hr.organizations.read', 'hr.organizations.read.all', 'hr.organizations.read.own'])
    async getById(@Param('id') id: string) {
        return this.organizationsService.findById(id);
    }

    @Post()
    @RequirePermission(['hr.organizations.create', 'hr.organizations.write'])
    async create(@Req() req: any, @Body() dto: CreateOrganizationDto) {
        const userId = req.user?.id;
        return this.organizationsService.create(dto, userId);
    }

    @Put(':id')
    @RequirePermission(['hr.organizations.write', 'hr.organizations.write.all', 'hr.organizations.write.own'])
    async update(
        @Req() req: any,
        @Param('id') id: string,
        @Body() dto: UpdateOrganizationDto,
    ) {
        const userId = req.user?.id;
        return this.organizationsService.update(id, dto, userId);
    }

    @Delete(':id')
    @RequirePermission(['hr.organizations.delete'])
    async delete(@Param('id') id: string) {
        await this.organizationsService.delete(id);
        return { success: true };
    }
}