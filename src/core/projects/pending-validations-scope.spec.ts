import { WorkflowValidationService } from './workflow-validation.service';
import { PROJECT_PERMISSIONS } from './project.permissions';

/**
 * Portée des demandes de validation en attente.
 *
 * Le service ne regardait que l'appartenance au projet (MANAGER/OWNER ou
 * créateur). Un utilisateur porteur de `projects.task.validate.tenant`
 * franchissait le guard puis recevait une liste VIDE, sans message d'erreur —
 * symptôme : « les demandes de validation ne s'affichent plus ».
 */
describe('WorkflowValidationService — portée des validations en attente', () => {
  const makeService = () => {
    const query: any = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'vr1' }]),
    };
    const validationRequestRepo = { createQueryBuilder: jest.fn(() => query) };
    const memberRepo = { find: jest.fn().mockResolvedValue([]) };
    const dataSource = { query: jest.fn().mockResolvedValue([]) };

    const svc = Object.create(WorkflowValidationService.prototype) as any;
    svc.validationRequestRepo = validationRequestRepo;
    svc.memberRepo = memberRepo;
    svc.dataSource = dataSource;

    return { svc, query, memberRepo, dataSource };
  };

  const ctx = (perms: string[]) => ({
    userId: 'u1',
    organizationId: 'org1',
    userPermissions: perms,
  });

  it('un scope tenant voit toute l’organisation, sans filtre projet', async () => {
    const { svc, query, memberRepo } = makeService();

    const out = await svc.getPendingValidationRequests(
      ctx([PROJECT_PERMISSIONS.TASK.VALIDATE.TENANT]),
    );

    expect(out).toEqual([{ id: 'vr1' }]);
    // Aucun repli sur l'appartenance : la requête d'adhésion n'est pas jouée.
    expect(memberRepo.find).not.toHaveBeenCalled();
    const clauses = query.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(clauses.some((c: string) => c.includes('projectId IN'))).toBe(false);
  });

  it('un scope global aussi', async () => {
    const { svc, memberRepo } = makeService();
    await svc.getPendingValidationRequests(
      ctx([PROJECT_PERMISSIONS.TASK.VALIDATE.GLOBAL]),
    );
    expect(memberRepo.find).not.toHaveBeenCalled();
  });

  it('un scope restreint retombe sur les projets pilotés', async () => {
    const { svc, query, memberRepo, dataSource } = makeService();
    memberRepo.find.mockResolvedValue([{ projectId: 'p1' }]);

    await svc.getPendingValidationRequests(
      ctx([PROJECT_PERMISSIONS.TASK.VALIDATE.PROJECT]),
    );

    expect(memberRepo.find).toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalled();
    const clauses = query.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(clauses.some((c: string) => c.includes('projectId IN'))).toBe(true);
  });

  it('renvoie une liste vide si scope restreint et aucun projet piloté', async () => {
    const { svc } = makeService();
    const out = await svc.getPendingValidationRequests(
      ctx([PROJECT_PERMISSIONS.TASK.VALIDATE.PROJECT]),
    );
    expect(out).toEqual([]);
  });

  it('filtre toujours sur l’organisation et le statut en attente', async () => {
    const { svc, query } = makeService();
    await svc.getPendingValidationRequests(
      ctx([PROJECT_PERMISSIONS.TASK.VALIDATE.TENANT]),
    );

    expect(query.where).toHaveBeenCalledWith(
      'vr.organizationId = :orgId',
      { orgId: 'org1' },
    );
    const clauses = query.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(clauses).toContain('vr.status = :status');
  });
});
