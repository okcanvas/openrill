import type { AutomationExecutionContext, AutomationExecutionResult } from "@openrill/automation";
import { ConversationError, type ConversationService } from "@openrill/conversations";
import type { AgentRunCoordinator } from "./run-coordinator.js";
import type { TaskService } from "@openrill/tasks";

export interface AutomationConversationExecutorOptions {
  readonly conversations: ConversationService;
  readonly coordinator: AgentRunCoordinator;
  readonly publishNotice: (topic: string, data: unknown) => void;
  readonly tasks?: TaskService;
  readonly now?: () => number;
}

export class AutomationConversationExecutor {
  public constructor(private readonly options: AutomationConversationExecutorOptions) {}

  public async execute(context: AutomationExecutionContext): Promise<AutomationExecutionResult> {
    const template = context.job.config.conversationTemplate;
    let conversationId: string | null = null;
    let runId: string | null = context.run.runId;
    const abort = () => {
      if (runId) this.options.coordinator.cancel(runId);
      if (!conversationId || !runId) return;
      try {
        this.options.conversations.cancel({ workspaceId: template.workspaceId, conversationId, runId });
      } catch {
        // A terminal or restart-recovered Conversation Run already owns its final state.
      }
    };
    context.signal.addEventListener("abort", abort, { once: true });
    try {
      if (context.signal.aborted) return { status: "FAILED", errorCode: "AUTOMATION_CANCELLED_BEFORE_EXECUTION" };
      if (!runId) {
        const conversation = this.options.conversations.create({
          workspaceId: template.workspaceId,
          ...(template.modelProfile !== undefined ? { modelProfile: template.modelProfile } : {}),
          ...(template.title !== undefined ? { title: template.title } : { title: context.job.config.name }),
        });
        conversationId = conversation.conversationId;
        const submission = this.options.conversations.send({
          workspaceId: template.workspaceId,
          conversationId,
          submissionKey: `automation:${context.run.automationRunId}`,
          text: template.prompt,
        });
        runId = submission.run.runId;
        const linked = context.bindRunId(runId);
        this.options.tasks?.classify({ runId, runtime: "AUTOMATION", taskKind: "automation.run", sourceId: linked.automationRunId, updatedAt: this.options.now?.() ?? Date.now() });
        this.options.publishNotice("conversation.updated", {
          conversationId, workspaceId: template.workspaceId, runId, automationRunId: linked.automationRunId,
        });
        this.options.publishNotice("automation.run.updated", linked);
      } else {
        this.options.publishNotice("automation.run.resuming", {
          runId, automationRunId: context.run.automationRunId, workspaceId: template.workspaceId,
        });
      }
      if (context.signal.aborted) abort();
      const result = await this.options.coordinator.executeUntilTerminal(runId);
      if (result.status === "COMPLETED") return { status: "SUCCEEDED", runId };
      return { status: "FAILED", errorCode: `AUTOMATION_AGENT_RUN_${result.status}`, runId };
    } catch (error) {
      return {
        status: "FAILED",
        errorCode: error instanceof ConversationError
          ? `AUTOMATION_CONVERSATION_${error.code}`
          : error instanceof Error && error.message.includes("closing")
            ? "AUTOMATION_HOST_SHUTDOWN"
            : "AUTOMATION_CONVERSATION_EXECUTION_FAILED",
        ...(runId ? { runId } : {}),
      };
    } finally {
      context.signal.removeEventListener("abort", abort);
    }
  }
}
