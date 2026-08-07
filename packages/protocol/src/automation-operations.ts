export type AutomationScheduleInput =
  | { readonly kind: "at"; readonly at: string }
  | { readonly kind: "interval"; readonly everyMs: number; readonly anchorMs: number }
  | { readonly kind: "cron"; readonly expression: string };

export type AutomationCatchUpPolicyInput =
  | { readonly kind: "SKIP" }
  | { readonly kind: "RUN_ONCE" }
  | { readonly kind: "BOUNDED"; readonly limit: number };

export interface AutomationFailurePolicyInput {
  readonly backoffMs: number;
  readonly maxConsecutiveFailures: number;
  readonly autoDisable: boolean;
}

export interface AutomationConversationTemplateInput {
  readonly workspaceId: string;
  readonly prompt: string;
  readonly modelProfile?: string;
  readonly title?: string;
}

export interface AutomationCreateInput {
  readonly name: string;
  readonly enabled: boolean;
  readonly schedule: AutomationScheduleInput;
  readonly timezone: string;
  readonly conversationTemplate: AutomationConversationTemplateInput;
  readonly catchUpPolicy: AutomationCatchUpPolicyInput;
  readonly failurePolicy: AutomationFailurePolicyInput;
}

export interface AutomationListInput {
  readonly includeDisabled?: boolean;
  readonly limit?: number;
}

export interface AutomationGetInput { readonly jobId: string; }

export interface AutomationUpdateInput {
  readonly jobId: string;
  readonly expectedRevision: number;
  readonly patch: Partial<AutomationCreateInput>;
}

export interface AutomationRunNowInput {
  readonly jobId: string;
  readonly requestKey: string;
}

export interface AutomationHistoryInput {
  readonly jobId: string;
  readonly limit?: number;
}
