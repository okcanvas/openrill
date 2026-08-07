export const PACKAGE_NAME = "@openrill/web" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const UI_FRAMEWORK_SELECTION = "VUE_3" as const;
export const UI_FRAMEWORK_DECISION_STEP = "STEP010A" as const;
export const UI_RUNTIME_INTRODUCTION_STEP = "STEP011" as const;

export interface WebFoundationContract {
  readonly application: "OpenRill Control UI";
  readonly frameworkSelection: typeof UI_FRAMEWORK_SELECTION;
  readonly frameworkDecisionStep: typeof UI_FRAMEWORK_DECISION_STEP;
  readonly runtimeIntroducedAt: typeof UI_RUNTIME_INTRODUCTION_STEP;
  readonly stateAccess: "LOCAL_PROTOCOL_ONLY";
  readonly directDatabaseAccess: false;
}

export function getWebFoundationContract(): WebFoundationContract {
  return {
    application: "OpenRill Control UI",
    frameworkSelection: UI_FRAMEWORK_SELECTION,
    frameworkDecisionStep: UI_FRAMEWORK_DECISION_STEP,
    runtimeIntroducedAt: UI_RUNTIME_INTRODUCTION_STEP,
    stateAccess: "LOCAL_PROTOCOL_ONLY",
    directDatabaseAccess: false,
  };
}

export { LocalProtocolClient, type LocalProtocolClientOptions } from "./api/local-protocol-client.js";

export {
  applyControlUiNotice,
  applyControlUiSnapshot,
  createControlUiProjection,
  getControlUiReconnectPlan,
  moveControlUiCardSelection,
  type ControlUiCard,
  type ControlUiCardKind,
  type ControlUiFixture,
  type ControlUiNotice,
  type ControlUiNoticeOutcome,
  type ControlUiProjection,
} from "./control-ui-projection.js";
