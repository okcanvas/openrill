export type SkillSourceType = "BUNDLED" | "MANAGED_USER" | "WORKSPACE";

export interface SkillCompatibility {
  readonly minOpenRill?: string;
  readonly maxOpenRillExclusive?: string;
}

export interface SkillManifest {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly activation: readonly string[];
  readonly instructions: string;
  readonly tools: readonly string[];
  readonly resources: readonly string[];
  readonly compatibility: SkillCompatibility;
}

export interface SkillSourceDescriptor {
  readonly sourceKey: string;
  readonly type: SkillSourceType;
  readonly rootPath: string;
  readonly precedence: number;
  readonly ordinal: number;
  readonly workspaceId?: string;
}

export interface SkillDiagnostic {
  readonly diagnosticId: string;
  readonly sourceKey: string;
  readonly sourceType: SkillSourceType;
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly createdAt: number;
  readonly skillId?: string;
}

export interface SkillCatalogEntry {
  readonly skillId: string;
  readonly version: string;
  readonly description: string;
  readonly activation: readonly string[];
  readonly requiredTools: readonly string[];
  readonly resources: readonly string[];
  readonly source: SkillSourceDescriptor;
  readonly skillDirectory: string;
  readonly manifestPath: string;
  readonly instructionsPath: string;
  readonly manifestSha256: string;
  readonly enabled: boolean;
}

export interface ShadowedSkill {
  readonly skillId: string;
  readonly selectedSourceKey: string;
  readonly shadowedSourceKey: string;
  readonly shadowedPath: string;
}

export interface SkillCatalog {
  readonly entries: readonly SkillCatalogEntry[];
  readonly diagnostics: readonly SkillDiagnostic[];
  readonly shadowed: readonly ShadowedSkill[];
  readonly discoveredAt: number;
}

export interface SkillResolvedFile {
  readonly kind: "MANIFEST" | "INSTRUCTIONS" | "RESOURCE";
  readonly sourceRelativePath: string;
  readonly snapshotRelativePath: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface SkillSnapshot {
  readonly snapshotId: string;
  readonly runId: string;
  readonly skillId: string;
  readonly skillVersion: string;
  readonly sourceKey: string;
  readonly contentHash: string;
  readonly storagePath: string;
  readonly manifest: SkillManifest;
  readonly files: readonly SkillResolvedFile[];
  readonly instructions: string;
  readonly capturedAt: number;
}

export interface PersistedSkillSource {
  readonly sourceKey: string;
  readonly sourceType: SkillSourceType;
  readonly workspaceId: string | null;
  readonly rootPath: string;
  readonly rootRevision: string;
  readonly discoveredAt: number;
}

export interface PersistedSkillDiagnostic {
  readonly diagnosticId: string;
  readonly sourceKey: string;
  readonly skillId: string | null;
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly createdAt: number;
}

export interface PersistedSkillRunContext {
  readonly runId: string;
  readonly catalogHash: string;
  readonly selectedSkillIds: readonly string[];
  readonly resolvedAt: number;
}

export interface PersistedSkillSnapshot {
  readonly snapshotId: string;
  readonly runId: string;
  readonly skillId: string;
  readonly sourceKey: string;
  readonly skillVersion: string;
  readonly contentHash: string;
  readonly storagePath: string;
  readonly manifest: SkillManifest;
  readonly files: readonly SkillResolvedFile[];
  readonly capturedAt: number;
}

export interface SkillMetadataSink {
  readonly replaceSourceDiscovery: (source: PersistedSkillSource, diagnostics: readonly PersistedSkillDiagnostic[]) => void;
  readonly insertRunContext: (context: PersistedSkillRunContext) => PersistedSkillRunContext;
  readonly getRunContext: (runId: string) => PersistedSkillRunContext | null;
  readonly insertSnapshot: (snapshot: PersistedSkillSnapshot) => PersistedSkillSnapshot;
  readonly listRunSnapshots: (runId: string) => readonly PersistedSkillSnapshot[];
}
