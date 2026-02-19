import { Injectable } from '@nestjs/common';
import { ProjectCommentEventPayload } from './project-comments.types';
import { ProjectCommentsGateway } from './project-comments.gateway';

@Injectable()
export class ProjectCommentsRealtimeService {
  constructor(private readonly gateway: ProjectCommentsGateway) {}

  emitCommentCreated(input: {
    projectId: string;
    payload: ProjectCommentEventPayload;
  }) {
    this.gateway.emitToProjectRoom({
      projectId: input.projectId,
      event: 'project.comment.created',
      payload: input.payload,
    });
  }
}
