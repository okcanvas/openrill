export type AgentKernelErrorCode =
  | "AGENT_CANCELLED"
  | "AGENT_HOST_SHUTDOWN"
  | "AGENT_TURN_BUDGET_EXCEEDED"
  | "AGENT_MODEL_CALL_BUDGET_EXCEEDED"
  | "AGENT_TOOL_CALL_BUDGET_EXCEEDED"
  | "AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED"
  | "AGENT_TIME_BUDGET_EXCEEDED"
  | "AGENT_MODEL_STREAM_INVALID"
  | "AGENT_TOOL_ARGUMENTS_INVALID"
  | "AGENT_TOOL_CALL_CONFLICT"
  | "AGENT_TOOL_NOT_ALLOWED"
  | "AGENT_MODEL_FAILED"
  | "AGENT_TOOL_FAILED";

export class AgentKernelError extends Error {
  public constructor(
    public readonly code: AgentKernelErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AgentKernelError";
  }
}
