import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const SYSTEM_ROLE = '__SYSTEM_ROLE__';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
