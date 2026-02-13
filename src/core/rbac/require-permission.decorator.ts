import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'required_permission';
export const REQUIRED_PERMISSION_MODULE_KEY = 'required_permission_module';

export function RequirePermission(
  permissionCode: string,
  options?: { moduleCode?: string },
): MethodDecorator & ClassDecorator;
export function RequirePermission(
  permissionCode: string[],
  options?: { moduleCode?: string },
): MethodDecorator & ClassDecorator;
export function RequirePermission(
  permissionCode: string | string[],
  options?: { moduleCode?: string },
): MethodDecorator & ClassDecorator {
  return ((target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    const codes = Array.isArray(permissionCode) ? permissionCode : [permissionCode];
    SetMetadata(REQUIRED_PERMISSION_KEY, codes)(
      target,
      propertyKey as any,
      descriptor as any,
    );
    if (options?.moduleCode) {
      SetMetadata(REQUIRED_PERMISSION_MODULE_KEY, options.moduleCode)(
        target,
        propertyKey as any,
        descriptor as any,
      );
    }
  }) as any;
}
