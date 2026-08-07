export interface GoalExecutionOwnerInput {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly goalId: string;
}

export interface GoalExecutionStartInput extends GoalExecutionOwnerInput {
  readonly expectedGoalRevision: number;
}

export type GoalExecutionGetInput = GoalExecutionOwnerInput;

export interface GoalExecutionResumeInput extends GoalExecutionOwnerInput {
  readonly expectedExecutionRevision: number;
  readonly expectedFlowRevision: number;
}

export interface GoalExecutionCancelInput extends GoalExecutionOwnerInput {
  readonly expectedExecutionRevision: number;
  readonly expectedFlowRevision: number;
}


export interface GoalExecutionPlanDraftStepInput {
  readonly stepId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly required: boolean;
  readonly retryMode: "MANUAL";
  readonly maxAttempts: number;
}

export interface GoalExecutionRevisePlanInput extends GoalExecutionOwnerInput {
  readonly expectedGoalRevision: number;
  readonly expectedExecutionRevision: number;
  readonly expectedPlanRevision: number;
  readonly steps: readonly GoalExecutionPlanDraftStepInput[];
}

export interface GoalExecutionAdoptPlanRevisionInput extends GoalExecutionOwnerInput {
  readonly targetPlanRevision: number;
  readonly expectedExecutionRevision: number;
  readonly expectedFlowRevision: number;
}

export interface GoalExecutionRetryInput extends GoalExecutionOwnerInput {
  readonly blockerId: string;
  readonly expectedBlockerRevision: number;
  readonly expectedExecutionRevision: number;
  readonly expectedFlowRevision: number;
  readonly requestedBy: string;
  readonly reason: string;
}

export interface GoalExecutionResolveBlockerInput extends GoalExecutionOwnerInput {
  readonly blockerId: string;
  readonly expectedBlockerRevision: number;
  readonly expectedExecutionRevision: number;
  readonly expectedFlowRevision: number;
  readonly resolvedBy: string;
  readonly resolution: string;
}
