export type MaintenanceRetentionEntityKind = "TASK" | "TASK_FLOW" | "CONNECTOR_DELIVERY";

export interface MaintenanceRetentionPreviewInput {
  readonly workspaceId: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface MaintenanceRetentionPruneInput {
  readonly workspaceId: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface MaintenanceRetentionTombstoneListInput {
  readonly workspaceId: string;
  readonly entityKind?: MaintenanceRetentionEntityKind;
  readonly limit?: number;
}
