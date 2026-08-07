import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ConversationService } from "@openrill/conversations";
import {
  discoverSkills,
  formatActiveSkillInstructions,
  selectActivatedSkills,
  SkillSnapshotStore,
  type PersistedSkillDiagnostic,
  type PersistedSkillRunContext,
  type PersistedSkillSnapshot,
  type PersistedSkillSource,
  type SkillCatalog,
  type SkillManifest,
  type SkillMetadataSink,
  type SkillResolvedFile,
  type SkillSnapshot,
} from "@openrill/skills";
import type { OpenRillStateDatabase } from "@openrill/state";
import type { ToolRegistry } from "@openrill/tool-runtime";
import type { WorkspaceCatalog } from "@openrill/workspace";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function asManifest(value: unknown): SkillManifest {
  return value as SkillManifest;
}

function asFiles(value: unknown): readonly SkillResolvedFile[] {
  return value as readonly SkillResolvedFile[];
}

function userTextForRun(conversations: ConversationService, runId: string): { text: string; attemptId: string } {
  const context = conversations.executionContext(runId);
  const trigger = context.run.triggerMessageId
    ? context.messages.find((message) => message.messageId === context.run.triggerMessageId)
    : [...context.messages].reverse().find((message) => message.role === "user");
  const content = trigger?.content && typeof trigger.content === "object" && !Array.isArray(trigger.content)
    ? trigger.content as Record<string, unknown>
    : null;
  return {
    text: typeof content?.text === "string" ? content.text : "",
    attemptId: context.attempt.attemptId,
  };
}

function catalogHash(catalog: SkillCatalog): string {
  return sha256(catalog.entries.map((entry) => ({
    skillId: entry.skillId,
    version: entry.version,
    description: entry.description,
    activation: entry.activation,
    requiredTools: entry.requiredTools,
    resources: entry.resources,
    sourceKey: entry.source.sourceKey,
    sourceType: entry.source.type,
    enabled: entry.enabled,
  })));
}

export interface SkillRunServiceOptions {
  readonly state: OpenRillStateDatabase;
  readonly conversations: ConversationService;
  readonly tools: ToolRegistry;
  readonly workspaces: WorkspaceCatalog;
  readonly bundledRoots: readonly string[];
  readonly managedUserRoots: readonly string[];
  readonly enabledSkillIds: readonly string[];
  readonly snapshotRoot: string;
  readonly currentVersion: string;
  readonly now?: () => number;
}

export interface ResolvedRunSkills {
  readonly systemInstructions: string;
  readonly snapshots: readonly SkillSnapshot[];
  readonly catalogHash: string;
  readonly selectedSkillIds: readonly string[];
  readonly reused: boolean;
}

export class SkillRunService {
  readonly #metadataSink: SkillMetadataSink;
  readonly #store: SkillSnapshotStore;

  public constructor(private readonly options: SkillRunServiceOptions) {
    this.#metadataSink = {
      replaceSourceDiscovery: (source: PersistedSkillSource, diagnostics: readonly PersistedSkillDiagnostic[]) => {
        this.options.state.transaction((repositories) => {
          repositories.skills.replaceSourceDiscovery(source, diagnostics);
        });
      },
      insertRunContext: (context: PersistedSkillRunContext): PersistedSkillRunContext => this.options.state.transaction((repositories) => repositories.skills.insertRunContext(context)),
      getRunContext: (runId: string): PersistedSkillRunContext | null => this.options.state.transaction((repositories) => repositories.skills.getRunContext(runId)),
      insertSnapshot: (snapshot: PersistedSkillSnapshot): PersistedSkillSnapshot => this.options.state.transaction((repositories) => {
        const row = repositories.skills.insertSnapshot({
          ...snapshot,
          manifest: snapshot.manifest,
          files: snapshot.files,
        });
        return {
          ...row,
          manifest: asManifest(row.manifest),
          files: asFiles(row.files),
        };
      }),
      listRunSnapshots: (runId: string): readonly PersistedSkillSnapshot[] => this.options.state.transaction((repositories) => repositories.skills.listRunSnapshots(runId).map((row) => ({
        ...row,
        manifest: asManifest(row.manifest),
        files: asFiles(row.files),
      }))),
    };
    this.#store = new SkillSnapshotStore({
      rootDirectory: this.options.snapshotRoot,
      metadataSink: this.#metadataSink,
      ...(this.options.now ? { now: this.options.now } : {}),
    });
  }

  public async resolveForRun(runId: string, baseSystemInstructions: string): Promise<ResolvedRunSkills> {
    const existingContext = this.#metadataSink.getRunContext(runId);
    if (existingContext) {
      const snapshots = await this.#store.loadRun(runId);
      const actualIds = snapshots.map((item) => item.skillId).sort();
      const expectedIds = [...existingContext.selectedSkillIds].sort();
      if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
        throw new Error(`Skill Run snapshot set is incomplete: ${runId}`);
      }
      return {
        systemInstructions: `${baseSystemInstructions}${formatActiveSkillInstructions(snapshots)}`,
        snapshots,
        catalogHash: existingContext.catalogHash,
        selectedSkillIds: expectedIds,
        reused: true,
      };
    }

    const execution = userTextForRun(this.options.conversations, runId);
    const workspaceId = this.options.conversations.executionContext(runId).conversation.workspaceId;
    const workspace = this.options.workspaces.internal(workspaceId);
    const catalog = await discoverSkills({
      bundledRoots: this.options.bundledRoots,
      managedUserRoots: this.options.managedUserRoots,
      workspaceRoot: workspace.canonicalRoot,
      workspaceId,
      availableTools: this.options.tools.definitions().map((tool) => tool.name),
      enabledSkillIds: this.options.enabledSkillIds,
      currentVersion: this.options.currentVersion,
      metadataSink: this.#metadataSink,
      ...(this.options.now ? { now: this.options.now } : {}),
    });
    const selected = selectActivatedSkills(catalog, execution.text);
    const snapshots: SkillSnapshot[] = [];
    for (const entry of selected) snapshots.push(await this.#store.capture(runId, entry));
    const hash = catalogHash(catalog);
    const selectedSkillIds = snapshots.map((item) => item.skillId).sort();
    const context = this.#metadataSink.insertRunContext({
      runId,
      catalogHash: hash,
      selectedSkillIds,
      resolvedAt: (this.options.now ?? Date.now)(),
    });
    this.options.conversations.appendEvent({
      runId,
      attemptId: execution.attemptId,
      eventType: "skill.snapshot.captured",
      payload: {
        catalogHash: context.catalogHash,
        selectedSkillIds: context.selectedSkillIds,
        snapshotCount: snapshots.length,
      },
      idempotencyKey: `skill-snapshot:${runId}`,
    });
    return {
      systemInstructions: `${baseSystemInstructions}${formatActiveSkillInstructions(snapshots)}`,
      snapshots,
      catalogHash: context.catalogHash,
      selectedSkillIds: context.selectedSkillIds,
      reused: false,
    };
  }
}

export function resolveManagedSkillRoots(roots: readonly string[], configRoot: string): string[] {
  return roots.map((root) => resolve(configRoot, root));
}
