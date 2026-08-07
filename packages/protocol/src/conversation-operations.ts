export interface ConversationCreateInput { readonly workspaceId:string; readonly modelProfile?:string; readonly title?:string; }
export interface ConversationListInput { readonly workspaceId:string; readonly limit?:number; }
export interface ConversationGetInput { readonly workspaceId:string; readonly conversationId:string; }
export interface ConversationSendInput { readonly workspaceId:string; readonly conversationId:string; readonly submissionKey:string; readonly text:string; }
export interface ConversationCancelInput { readonly workspaceId:string; readonly conversationId:string; readonly runId:string; }

export interface ConversationExecuteInput {
  readonly workspaceId:string;
  readonly conversationId?:string;
  readonly modelProfile?:string;
  readonly title?:string;
  readonly submissionKey?:string;
  readonly text:string;
  readonly timeoutMs?:number;
}

export interface ConversationExecuteOutput {
  readonly conversationId:string;
  readonly runId:string;
  readonly status:"COMPLETED"|"FAILED"|"CANCELLED";
  readonly terminalReason:string;
  readonly assistantText:string;
  readonly usage:{ readonly turns:number; readonly inputTokens:number; readonly outputTokens:number; readonly modelCalls:number; readonly toolCalls:number };
  readonly messageCount:number;
  readonly lastMessageSequence:number;
  readonly failure:{ readonly code:string; readonly message:string }|null;
}
