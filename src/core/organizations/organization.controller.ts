import {Controller, Get, Req} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

@Controller('core/organizations')
export class OrganizationsController {
    constructor(private readonly organizationsService: OrganizationsService){}
    @Get()
    async list(@Req() req: any){
        return this.organizationsService.findAllForTenant(req.tenant.id)
    }    
    
}