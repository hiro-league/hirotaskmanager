import type { List, ReleaseDefinition, Task } from "./models";

/** Opt-in header for granular mutation responses while older clients still expect full boards. */
export const TASK_MANAGER_MUTATION_RESPONSE_HEADER =
  "X-TaskManager-Mutation-Format";

/** Phase 3 response shape: changed entity + board metadata, not the full board payload. */
export const TASK_MANAGER_MUTATION_RESPONSE_ENTITY_V1 = "entity-v1";

export type MutationResponseMeta = {
  boardId: number;
  boardSlug: string;
  boardUpdatedAt: string;
};

export type TaskMutationResult = MutationResponseMeta & {
  entity: Task;
};

export type ListMutationResult = MutationResponseMeta & {
  entity: List;
};

export type ReleaseMutationResult = MutationResponseMeta & {
  entity: ReleaseDefinition;
};

export type ReleaseDeleteMutationResult = MutationResponseMeta & {
  deletedReleaseId: number;
};

export type TaskDeleteMutationResult = MutationResponseMeta & {
  deletedTaskId: number;
};

export type ListDeleteMutationResult = MutationResponseMeta & {
  deletedListId: number;
};
