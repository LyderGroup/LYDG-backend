import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './task.entity';
import { TaskDependency } from './task-dependency.entity';
import { Subtask } from './subtask.entity';

export type DependencyType =
  | 'finish_to_start'
  | 'start_to_start'
  | 'finish_to_finish';

export interface AddDependencyDto {
  taskId: string;
  dependsOnTaskId: string;
  dependencyType: DependencyType;
  lagDays?: number;
  organizationId: string;
}

export interface DependencyGraph {
  [taskId: string]: string[];
}

export interface CriticalPathResult {
  taskId: string;
  title: string;
  duration: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  isCritical: boolean;
  totalFloat: number;
}

@Injectable()
export class TaskDependencyService {
  constructor(
    @InjectRepository(TaskDependency)
    private readonly depRepo: Repository<TaskDependency>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(Subtask)
    private readonly subtaskRepo: Repository<Subtask>,
  ) {}
 
  async addDependency(dto: AddDependencyDto): Promise<TaskDependency> {
    // 1. Vérifier que les deux tâches existent et appartiennent à la même org
    const [task, dependsOn] = await Promise.all([
      this.taskRepo.findOne({
        where: { id: dto.taskId, organizationId: dto.organizationId },
      }),
      this.taskRepo.findOne({
        where: { id: dto.dependsOnTaskId, organizationId: dto.organizationId },
      }),
    ]);

    if (!task) {
      throw new NotFoundException(`Task ${dto.taskId} not found`);
    }
    if (!dependsOn) {
      throw new NotFoundException(`Task ${dto.dependsOnTaskId} not found`);
    }

    // 2. Auto-dépendance interdite
    if (dto.taskId === dto.dependsOnTaskId) {
      throw new BadRequestException(
        "Une tâche ne peut pas dépendre d'elle-même",
      );
    }

    // 3. Vérifier qu'elles sont dans le même projet (isolation)
    if (task.projectId !== dependsOn.projectId) {
      throw new BadRequestException(
        'Les dépendances inter-projets ne sont pas supportées',
      );
    }

    // 4. Vérifier doublon
    const exists = await this.depRepo.findOne({
      where: { taskId: dto.taskId, dependsOnTaskId: dto.dependsOnTaskId },
    });

    if (exists) {
      throw new ConflictException('Cette dépendance existe déjà');
    }

    // 5. Détection de cycle avant insertion
    await this.assertNoCycleWouldBeCreated(
      dto.taskId,
      dto.dependsOnTaskId,
      dto.organizationId,
      task.projectId,
    );

    // 6. Insérer
    const dep = this.depRepo.create({
      taskId: dto.taskId,
      dependsOnTaskId: dto.dependsOnTaskId,
      dependencyType: dto.dependencyType,
      lagDays: dto.lagDays ?? 0,
    });

    return this.depRepo.save(dep);
  }

  /**
   * Vérifie si les dépendances d'une tâche sont satisfaites.
   * Appelé avant de permettre la transition de statut.
   */
  async assertDependenciesSatisfied(
    taskId: string,
    organizationId: string,
  ): Promise<void> {
    // Charger les dépendances avec la tâche parente
    const dependencies = await this.depRepo
      .createQueryBuilder('dep')
      .innerJoinAndSelect('dep.dependsOnTask', 'parentTask')
      .where('dep.taskId = :taskId', { taskId })
      .getMany();

    const unsatisfied: string[] = [];

    for (const dep of dependencies) {
      const parentTask = dep.dependsOnTask;

      if (!parentTask) continue;

      switch (dep.dependencyType) {
        case 'finish_to_start':
          if (
            parentTask.status !== 'completed' &&
            parentTask.status !== 'approved'
          ) {
            unsatisfied.push(
              `"${parentTask.title}" doit être terminée avant de commencer cette tâche`,
            );
          }
          break;

        case 'start_to_start':
          if (parentTask.status === 'todo' || parentTask.status === 'pending') {
            unsatisfied.push(
              `"${parentTask.title}" doit être démarrée avant cette tâche`,
            );
          }
          break;

        case 'finish_to_finish':
          if (
            parentTask.status !== 'completed' &&
            parentTask.status !== 'approved'
          ) {
            unsatisfied.push(
              `"${parentTask.title}" doit être terminée avant de terminer cette tâche`,
            );
          }
          break;
      }
    }

    // Vérifier que toutes les sous-tâches sont terminées
    const incompleteSubtasks = await this.subtaskRepo.find({
      where: { taskId, isCompleted: false },
      select: ['title'],
    });

    if (incompleteSubtasks.length > 0) {
      const subtaskNames = incompleteSubtasks.map(st => `"${st.title}"`).join(', ');
      unsatisfied.push(
        `Les sous-tâches suivantes doivent être terminées : ${subtaskNames}`,
      );
    }

    if (unsatisfied.length > 0) {
      throw new BadRequestException({
        message: 'Des dépendances ne sont pas satisfaites',
        blockedBy: unsatisfied,
      });
    }
  }
 
  async removeDependency(
    dependencyId: string,
    organizationId: string,
  ): Promise<void> { 
    const dep = await this.depRepo
      .createQueryBuilder('dep')
      .innerJoin('dep.task', 'task')
      .where('dep.id = :id', { id: dependencyId })
      .andWhere('task.organizationId = :orgId', { orgId: organizationId })
      .getOne();

    if (!dep) {
      throw new NotFoundException('Dependency not found');
    }
    await this.depRepo.remove(dep);
  }

  /**
   * Récupère toutes les dépendances d'une tâche (entrant + sortant).
   */
  async getDependenciesForTask(
    taskId: string,
    organizationId: string,
  ): Promise<{ blockedBy: TaskDependency[]; blocking: TaskDependency[] }> {
    const [blockedBy, blocking] = await Promise.all([
      // tâches dont cette tâche dépend
      this.depRepo
        .createQueryBuilder('dep')
        .innerJoinAndSelect('dep.dependsOnTask', 'parent')
        .where('dep.taskId = :taskId', { taskId })
        .andWhere('parent.organizationId = :orgId', { orgId: organizationId })
        .getMany(),

      // tâches qui dépendent de cette tâche
      this.depRepo
        .createQueryBuilder('dep')
        .innerJoinAndSelect('dep.task', 'child')
        .where('dep.dependsOnTaskId = :taskId', { taskId })
        .andWhere('child.organizationId = :orgId', { orgId: organizationId })
        .getMany(),
    ]);

    return { blockedBy, blocking };
  }

  /**
   * Calcule le chemin critique d'un projet (Critical Path Method).
   * Retourne les tâches ordonnées avec early/late start.
   */
  async getCriticalPath(
    projectId: string,
    organizationId: string,
  ): Promise<CriticalPathResult[]> {
    // Charger toutes les tâches du projet avec leurs dépendances
    const tasks = await this.taskRepo.find({
      where: { projectId, organizationId },
    });

    const dependencies = await this.depRepo
      .createQueryBuilder('dep')
      .innerJoin('dep.task', 'task')
      .where('task.projectId = :projectId', { projectId })
      .andWhere('task.organizationId = :orgId', { orgId: organizationId })
      .getMany();

    return this.computeCriticalPath(tasks, dependencies);
  }

  // ─── Private : Algorithmes ──────────────────────────────────────

  /**
   * Détection de cycle via DFS (Depth-First Search).
   * Complexité : O(V + E) où V = tâches du projet, E = dépendances
   */
  private async assertNoCycleWouldBeCreated(
    newTaskId: string,
    newDependsOnId: string,
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    // Charger tout le graphe du projet en une seule requête
    const allDependencies = await this.depRepo
      .createQueryBuilder('dep')
      .innerJoin('dep.task', 'task')
      .select(['dep.taskId', 'dep.dependsOnTaskId'])
      .where('task.projectId = :projectId', { projectId })
      .andWhere('task.organizationId = :orgId', { orgId: organizationId })
      .getRawMany();

    // Construire le graphe d'adjacence
    const graph: DependencyGraph = {};

    for (const dep of allDependencies) {
      const from = dep.dep_taskId;
      if (!graph[from]) graph[from] = [];
      graph[from].push(dep.dep_dependsOnTaskId);
    }

    // Ajouter la nouvelle arête hypothétique
    if (!graph[newTaskId]) graph[newTaskId] = [];
    graph[newTaskId].push(newDependsOnId);

    // DFS pour détecter le cycle
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const hasCycle = (nodeId: string, visited: Set<string>, inStack: Set<string>): boolean => {
      visited.add(nodeId);
      inStack.add(nodeId);

      const neighbors = graph[nodeId] ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor, visited, inStack)) return true;
        } else if (inStack.has(neighbor)) {
          return true; // cycle détecté !
        }
      }

      inStack.delete(nodeId);
      return false;
    };

    // Parcourir tous les noeuds non visités
    const allNodes = new Set([
      ...Object.keys(graph),
      ...Object.values(graph).flat(),
    ]);

    for (const node of allNodes) {
      if (!visited.has(node)) {
        if (hasCycle(node, visited, inStack)) {
          throw new BadRequestException(
            'Cette dépendance créerait une dépendance circulaire entre les tâches',
          );
        }
      }
    }
  }

  /**
   * CPM (Critical Path Method) simplifié.
   * Calcule les early start (ES), early finish (EF), late start (LS), late finish (LF).
   */
  private computeCriticalPath(
    tasks: Task[],
    dependencies: TaskDependency[],
  ): CriticalPathResult[] {
    const results = new Map<string, CriticalPathResult>();

    // Initialiser
    for (const task of tasks) {
      results.set(task.id, {
        taskId: task.id,
        title: task.title,
        duration: this.estimateTaskDuration(task),
        earlyStart: 0,
        earlyFinish: 0,
        lateStart: 0,
        lateFinish: 0,
        isCritical: false,
        totalFloat: 0,
      });
    }

    // Forward pass (ES, EF)
    const sorted = this.topologicalSort(tasks, dependencies);

    for (const taskId of sorted) {
      const result = results.get(taskId)!;
      const incomingDeps = dependencies.filter((d) => d.taskId === taskId);

      if (incomingDeps.length === 0) {
        result.earlyStart = 0;
      } else {
        result.earlyStart = Math.max(
          ...incomingDeps.map((dep) => {
            const parent = results.get(dep.dependsOnTaskId);
            return (parent?.earlyFinish ?? 0) + (dep.lagDays ?? 0);
          }),
        );
      }

      result.earlyFinish = result.earlyStart + result.duration;
    }

    // Backward pass (LS, LF)
    const projectEnd = Math.max(
      ...Array.from(results.values()).map((r) => r.earlyFinish),
    );

    for (const taskId of [...sorted].reverse()) {
      const result = results.get(taskId)!;
      const outgoingDeps = dependencies.filter(
        (d) => d.dependsOnTaskId === taskId,
      );

      if (outgoingDeps.length === 0) {
        result.lateFinish = projectEnd;
      } else {
        result.lateFinish = Math.min(
          ...outgoingDeps.map((dep) => {
            const child = results.get(dep.taskId);
            return (child?.lateStart ?? projectEnd) - (dep.lagDays ?? 0);
          }),
        );
      }

      result.lateStart = result.lateFinish - result.duration;
      result.totalFloat = result.lateStart - result.earlyStart;
      result.isCritical = result.totalFloat === 0;
    }

    return Array.from(results.values());
  }

  /**
   * Tri topologique (Kahn's algorithm) pour ordonner les tâches.
   */
  private topologicalSort(
    tasks: Task[],
    dependencies: TaskDependency[],
  ): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const task of tasks) {
      inDegree.set(task.id, 0);
      adj.set(task.id, []);
    }

    for (const dep of dependencies) {
      adj.get(dep.dependsOnTaskId)?.push(dep.taskId);
      inDegree.set(dep.taskId, (inDegree.get(dep.taskId) ?? 0) + 1);
    }

    const queue = tasks
      .filter((t) => inDegree.get(t.id) === 0)
      .map((t) => t.id);
    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const neighbor of adj.get(current) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return result;
  }

  /**
   * Estime la durée d'une tâche en jours.
   */
  private estimateTaskDuration(task: Task): number {
    if (task.startDate && task.dueDate) {
      const start = new Date(task.startDate);
      const end = new Date(task.dueDate);
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(1, diffDays);
    }
    // Durée par défaut de 1 jour si pas de dates
    return 1;
  }
}
