export interface ApprovalListInput { readonly status?: "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "CONSUMED" | "CANCELLED"; }
export interface ApprovalGetInput { readonly requestId: string; }
export interface ApprovalResolveInput { readonly requestId: string; readonly expectedVersion: number; readonly decision: "allow_once" | "allow_for_conversation" | "deny"; }
export interface ApprovalCancelInput { readonly requestId: string; }
