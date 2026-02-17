import { Injectable } from '@nestjs/common';
import { TaskCommentEventPayload } from './task-comments.types';
import { TaskCommentsGateway } from './task-comments.gateway';

@Injectable()
export class TaskCommentsRealtimeService {
  constructor(private readonly gateway: TaskCommentsGateway) {}

  emitCommentCreated(input: { organizationId: string; taskId: string; payload: TaskCommentEventPayload }) {
    this.gateway.emitToTaskRoom({
      organizationId: input.organizationId,
      taskId: input.taskId,
      event: 'task.comment.created',
      payload: input.payload,
    });
  }
}
