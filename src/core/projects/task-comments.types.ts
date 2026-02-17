export type TaskCommentEventPayload = {
  id: string;
  taskId: string;
  parentCommentId: string | null;
  userId: string | null;
  authorName: string | null;
  authorEmail: string | null;
  content: string;
  contentType: string;
  isInternal: boolean;
  visibility: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};
