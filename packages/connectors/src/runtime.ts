import { ConnectorDeliveryError, ConnectorError, ConnectorIngressError } from "./errors.js";
import { ConnectorRuntimeService } from "./service.js";
import type {
  ConnectorAdapterDoctorResult,
  ConnectorAdapterPublicStatus,
  ConnectorAdapterRegistration,
  ConnectorDeliveryRequest,
  ConnectorIngressAdmission,
  ConnectorProviderDeliveryResult,
  OpenRillConnectorAdapter,
  OpenRillConnectorHostPort,
} from "./types.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function validateId(value: string, label: string, max: number): string {
  if (!value || value.length > max || !ID_PATTERN.test(value)) {
    throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", `invalid ${label}`);
  }
  return value;
}

function limit(value: number | undefined): number {
  const resolved = value ?? 100;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 1000) {
    throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "limit must be 1..1000");
  }
  return resolved;
}

function nullableTimestamp(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", `connector ${label} is invalid`);
  return Number(value);
}

function normalizePublicStatus(value: ConnectorAdapterPublicStatus, connectorId: string): ConnectorAdapterPublicStatus {
  if (!value || typeof value !== "object") throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector public status is invalid");
  if (value.connectorId !== connectorId) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector public status identity does not match registration");
  const accountId = validateId(value.accountId, "accountId", 128);
  if (typeof value.state !== "string" || !value.state || value.state.length > 64) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector public status state is invalid");
  if (typeof value.healthy !== "boolean") throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector public status health is invalid");
  if (!Number.isSafeInteger(value.reconnectAttempt) || value.reconnectAttempt < 0 || value.reconnectAttempt > 1_000_000) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector reconnect attempt is invalid");
  const lastErrorCode = value.lastErrorCode;
  if (lastErrorCode !== null && (typeof lastErrorCode !== "string" || !lastErrorCode || lastErrorCode.length > 128)) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector public status error code is invalid");
  return Object.freeze({
    connectorId, accountId, state: value.state, healthy: value.healthy, reconnectAttempt: value.reconnectAttempt,
    lastConnectedAt: nullableTimestamp(value.lastConnectedAt, "lastConnectedAt"),
    lastEventAt: nullableTimestamp(value.lastEventAt, "lastEventAt"),
    lastIngressAt: nullableTimestamp(value.lastIngressAt, "lastIngressAt"),
    lastDeliveryAt: nullableTimestamp(value.lastDeliveryAt, "lastDeliveryAt"),
    lastErrorCode,
  });
}

function normalizeDoctorResult(value: ConnectorAdapterDoctorResult, connectorId: string): ConnectorAdapterDoctorResult {
  if (!value || typeof value !== "object") throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector doctor result is invalid");
  if (value.connectorId !== connectorId) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector doctor identity does not match registration");
  const accountId = validateId(value.accountId, "accountId", 128);
  if (typeof value.ok !== "boolean" || !Array.isArray(value.checks) || value.checks.length > 64) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector doctor result is invalid");
  const checks = value.checks.map((check) => {
    if (!check || typeof check !== "object" || typeof check.name !== "string" || !check.name || check.name.length > 64) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector doctor check is invalid");
    if (check.state !== "PASSED" && check.state !== "FAILED" && check.state !== "NOT_RUN") throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector doctor check state is invalid");
    if (check.code !== null && (typeof check.code !== "string" || !check.code || check.code.length > 128)) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector doctor check code is invalid");
    return Object.freeze({ name: check.name, state: check.state, code: check.code });
  });
  if (value.ok !== checks.every((check) => check.state === "PASSED")) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector doctor summary does not match checks");
  return Object.freeze({ connectorId, accountId, ok: value.ok, checks: Object.freeze(checks) });
}

export interface ConnectorAdapterRegistryOptions {
  readonly service: ConnectorRuntimeService;
  readonly now?: () => number;
  readonly onRunAdmitted?: (input: { readonly connectorId: string; readonly accountId: string; readonly runId: string; readonly replayed: boolean }) => void;
}

export class ConnectorAdapterRegistry {
  readonly #registrations = new Map<string, ConnectorAdapterRegistration>();
  readonly #now: () => number;

  public constructor(private readonly options: ConnectorAdapterRegistryOptions) {
    this.#now = options.now ?? Date.now;
  }

  public register(extensionIdInput: string, adapter: OpenRillConnectorAdapter, signal: AbortSignal): OpenRillConnectorHostPort {
    if (signal.aborted) {
      throw new ConnectorError("CONNECTOR_NOT_REGISTERED", "connector activation signal is already aborted");
    }
    const extensionId = validateId(extensionIdInput, "extensionId", 128);
    const connectorId = validateId(adapter.connectorId, "connectorId", 128);
    if (this.#registrations.has(connectorId)) {
      throw new ConnectorError("CONNECTOR_ALREADY_REGISTERED", "connector adapter is already registered");
    }
    if (typeof adapter.normalizeIngress !== "function" || typeof adapter.deliver !== "function") {
      throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector adapter contract is invalid");
    }
    const assertActive = () => {
      if (signal.aborted || !this.#registrations.has(connectorId)) {
        throw new ConnectorError("CONNECTOR_NOT_REGISTERED", "connector adapter is not active");
      }
    };
    const normalizedAdapter: OpenRillConnectorAdapter = Object.freeze({
      connectorId,
      normalizeIngress: adapter.normalizeIngress.bind(adapter),
      deliver: adapter.deliver.bind(adapter),
      ...(typeof adapter.status === "function" ? { status: adapter.status.bind(adapter) } : {}),
      ...(typeof adapter.doctor === "function" ? { doctor: adapter.doctor.bind(adapter) } : {}),
    });
    const port: OpenRillConnectorHostPort = Object.freeze({
      connectorId,
      registerAccount: (input: { readonly accountId: string; readonly workspaceId: string; readonly enabled?: boolean }) => {
        assertActive();
        return this.options.service.registerAccount({
          connectorId, accountId: input.accountId, workspaceId: input.workspaceId,
          extensionId, status: input.enabled === false ? "DISABLED" : "ENABLED",
        });
      },
      receiveIngress: (input: ConnectorIngressAdmission) => {
        assertActive();
        return this.options.service.receiveIngress(connectorId, input);
      },
      drainIngress: async (input: { readonly accountId: string; readonly limit?: number }) => {
        assertActive();
        const max = limit(input.limit);
        const result = { processed: 0, adopted: 0, ignored: 0, retried: 0, dead: 0 };
        for (let index = 0; index < max; index += 1) {
          assertActive();
          const claim = this.options.service.claimIngress(connectorId, input.accountId);
          if (!claim) break;
          result.processed += 1;
          try {
            const disposition = await normalizedAdapter.normalizeIngress(claim, signal);
            if (disposition.kind === "ignored") {
              this.options.service.ignoreIngress(claim, disposition.reason);
              result.ignored += 1;
            } else {
              const adopted = this.options.service.adoptIngress(claim, disposition.route, disposition.text);
              this.options.onRunAdmitted?.({ connectorId, accountId: claim.ingress.accountId, runId: adopted.runId, replayed: adopted.replayed });
              result.adopted += 1;
            }
          } catch (error) {
            const classified = error instanceof ConnectorIngressError
              ? { errorCode: error.errorCode, summary: error.message, retryable: error.retryable }
              : { errorCode: "CONNECTOR_INGRESS_HANDLER_FAILED", summary: "connector ingress handler failed", retryable: true };
            const failed = this.options.service.failIngress(claim, classified);
            if (failed.status === "DEAD") result.dead += 1;
            else result.retried += 1;
          }
        }
        return result;
      },
      enqueueDelivery: (input: ConnectorDeliveryRequest) => {
        assertActive();
        return this.options.service.enqueueDelivery(connectorId, input);
      },
      drainDeliveries: async (input: { readonly accountId: string; readonly limit?: number }) => {
        assertActive();
        const max = limit(input.limit);
        const result = { processed: 0, delivered: 0, suppressed: 0, retried: 0, uncertain: 0, dead: 0 };
        for (let index = 0; index < max; index += 1) {
          assertActive();
          const claim = this.options.service.claimDelivery(connectorId, input.accountId);
          if (!claim) break;
          result.processed += 1;
          let dispatched = claim;
          try {
            dispatched = this.options.service.markDeliveryDispatched(claim);
            const outcome: ConnectorProviderDeliveryResult = await normalizedAdapter.deliver(dispatched, signal);
            if (outcome.kind === "accepted") {
              this.options.service.completeDeliveryAccepted(dispatched, outcome.receipt);
              result.delivered += 1;
            } else if (outcome.kind === "suppressed") {
              this.options.service.completeDeliverySuppressed(dispatched, outcome.reason);
              result.suppressed += 1;
            } else if (outcome.kind === "uncertain") {
              this.options.service.failDelivery(dispatched, {
                errorCode: outcome.errorCode, summary: outcome.summary,
                certainty: "MAYBE_ACCEPTED", retryable: false,
              });
              result.uncertain += 1;
            } else {
              const failed = this.options.service.failDelivery(dispatched, {
                errorCode: outcome.errorCode, summary: outcome.summary,
                certainty: "REJECTED", retryable: outcome.retryable,
              });
              if (failed.status === "PENDING") result.retried += 1;
              else result.dead += 1;
            }
          } catch (error) {
            const classified = error instanceof ConnectorDeliveryError
              ? error
              : new ConnectorDeliveryError(
                  "CONNECTOR_DELIVERY_HANDLER_FAILED",
                  "connector delivery handler failed after dispatch began",
                  "MAYBE_ACCEPTED",
                  false,
                );
            const failed = this.options.service.failDelivery(dispatched, {
              errorCode: classified.errorCode,
              summary: classified.message,
              certainty: classified.certainty,
              retryable: classified.retryable,
            });
            if (failed.status === "PENDING") result.retried += 1;
            else if (failed.status === "UNCERTAIN") result.uncertain += 1;
            else result.dead += 1;
          }
        }
        return result;
      },
    });
    const registration: ConnectorAdapterRegistration = Object.freeze({
      extensionId, adapter: normalizedAdapter, port, registeredAt: this.#now(),
    });
    this.#registrations.set(connectorId, registration);
    signal.addEventListener("abort", () => { this.unregister(extensionId, connectorId); }, { once: true });
    return port;
  }

  public unregister(extensionIdInput: string, connectorIdInput: string): boolean {
    const extensionId = validateId(extensionIdInput, "extensionId", 128);
    const connectorId = validateId(connectorIdInput, "connectorId", 128);
    const current = this.#registrations.get(connectorId);
    if (!current || current.extensionId !== extensionId) return false;
    this.#registrations.delete(connectorId);
    return true;
  }

  public get(connectorIdInput: string): ConnectorAdapterRegistration | null {
    const connectorId = validateId(connectorIdInput, "connectorId", 128);
    return this.#registrations.get(connectorId) ?? null;
  }

  public list(): readonly ConnectorAdapterRegistration[] {
    return [...this.#registrations.values()].sort((left, right) => left.adapter.connectorId.localeCompare(right.adapter.connectorId));
  }

  public status(connectorIdInput: string) {
    const registration = this.get(connectorIdInput);
    if (!registration) throw new ConnectorError("CONNECTOR_NOT_REGISTERED", "connector adapter is not active");
    if (!registration.adapter.status) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector adapter does not expose public status");
    return normalizePublicStatus(registration.adapter.status(), registration.adapter.connectorId);
  }

  public async doctor(connectorIdInput: string, signal: AbortSignal = new AbortController().signal) {
    const registration = this.get(connectorIdInput);
    if (!registration) throw new ConnectorError("CONNECTOR_NOT_REGISTERED", "connector adapter is not active");
    if (!registration.adapter.doctor) throw new ConnectorError("CONNECTOR_INVALID_ARGUMENT", "connector adapter does not expose doctor checks");
    return normalizeDoctorResult(await registration.adapter.doctor(signal), registration.adapter.connectorId);
  }
}
